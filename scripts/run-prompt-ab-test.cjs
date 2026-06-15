const fs = require('fs');
const path = require('path');
const axios = require('axios');

function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf-8').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) return;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) return;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  });
}

loadLocalEnv();

const harnessModule = require('../functions/_shared/llm-harness.cjs');
const gatewayModule = require('../functions/_shared/llm-gateway.cjs');
const feedbackModule = require('../functions/_shared/auto-improvement-feedback.cjs');
const promptStore = require('../functions/_shared/supabase-auto-improvement.cjs');

const INSIGHT_API_BASE_URL = process.env.INSIGHT_API_BASE_URL || 'http://localhost:3000/api/insight-api';
const DISTRICTS = (process.env.PROMPT_AB_DISTRICTS || '강남구')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);
const DRAFT_VERSION = process.env.PROMPT_AB_DRAFT_VERSION || 'district-screen-insight-v0.10-draft-sample3';
const PROMPT_KEY = process.env.PROMPT_AB_PROMPT_KEY || 'district-screen-insight';
const ARTIFACT_TYPE = process.env.PROMPT_AB_ARTIFACT_TYPE || 'districtInsight';
const SECTION_KEY = process.env.PROMPT_AB_SECTION_KEY || 'districtInsight';

async function fetchDistrictData(district) {
  const response = await axios.get(INSIGHT_API_BASE_URL, {
    params: {
      type: 'district',
      gu: district,
      includeCacheMeta: '0',
      forceRefresh: '0'
    },
    timeout: 45000
  });
  return response.data;
}

function buildDraftPrompt({ basePrompt, draftPromptText }) {
  return [
    basePrompt,
    '',
    '--- AUTO-IMPROVEMENT DRAFT TEST INSTRUCTIONS ---',
    'The following draft prompt rules are under A/B test. Apply them as additional constraints when they do not conflict with the JSON output schema.',
    draftPromptText
  ].join('\n');
}

function summarizeQualityWarnings(warnings = []) {
  return warnings.reduce((summary, warning) => {
    const gate = warning.gate || 'unknown';
    summary[gate] = (summary[gate] || 0) + 1;
    return summary;
  }, {});
}

function summarizeQuality(quality = {}) {
  return {
    qualityPassed: Boolean(quality.passed),
    screenCardPassed: Boolean(quality.screenCardPassed),
    warningCount: (quality.warnings || []).length,
    screenCardWarningCount: quality.screenCardWarningCount || 0,
    screenCardHardWarningCount: quality.screenCardHardWarningCount || 0,
    interpretationWarningCount: quality.interpretationWarningCount || 0,
    warningSummary: summarizeQualityWarnings(quality.warnings || []),
    screenCardWarningSummary: summarizeQualityWarnings(quality.screenCardWarnings || []),
    interpretationWarningSummary: summarizeQualityWarnings(quality.interpretationWarnings || []),
    screenCardHardWarnings: quality.screenCardHardWarnings || [],
    warnings: quality.warnings || []
  };
}

async function scoreDistrictInsight({ district, generatedText, label }) {
  const modelPick = feedbackModule.pickFeedbackProviderAndModel({
    requestedProvider: process.env.PROMPT_AB_FEEDBACK_PROVIDER || process.env.AUTO_IMPROVE_FEEDBACK_PROVIDER,
    requestedModel: process.env.PROMPT_AB_FEEDBACK_MODEL || process.env.AUTO_IMPROVE_FEEDBACK_MODEL
  });
  const prompt = feedbackModule.buildArtifactFeedbackPrompt({
    districtName: district,
    artifactType: 'districtInsight',
    sectionKey: 'districtInsight',
    generatedContent: generatedText.insight,
    metricSummary: { label }
  });
  const feedback = await feedbackModule.generateArtifactFeedback({
    prompt,
    provider: modelPick.provider,
    model: modelPick.model
  });
  feedback.frameworkVersion = feedbackModule.FEEDBACK_FRAMEWORK_VERSION;
  feedback.artifactType = 'districtInsight';
  feedback.sectionKey = 'districtInsight';
  feedback.districtName = district;
  return {
    provider: modelPick.provider,
    model: modelPick.model,
    feedback
  };
}

function writeResult(payload) {
  const outDir = path.resolve(process.cwd(), '.tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `prompt-ab-test-${DRAFT_VERSION}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  return outPath;
}

async function main() {
  const draft = await promptStore.fetchPromptVersion({
    promptKey: PROMPT_KEY,
    promptVersion: DRAFT_VERSION,
    artifactType: ARTIFACT_TYPE,
    sectionKey: SECTION_KEY
  });
  if (!draft.ok || !draft.row?.prompt_text) {
    throw new Error(`draft prompt 조회 실패: ${draft.error || DRAFT_VERSION}`);
  }

  const modelPick = gatewayModule.pickProviderAndModel({
    requestedProvider: process.env.PROMPT_AB_PROVIDER || 'direct-openai',
    requestedModel: process.env.PROMPT_AB_MODEL,
    recommendation: harnessModule.MODEL_RECOMMENDATIONS.districtInsight
  });
  const results = [];

  for (const district of DISTRICTS) {
    console.log(`A/B generating: ${district}`);
    const districtData = await fetchDistrictData(district);
    const basePayload = harnessModule.buildHarnessPayload({
      districtData,
      cultureMetrics: {}
    });
    const basePrompt = gatewayModule.buildDistrictScreenPrompt({ basePayload });
    const currentOutput = await gatewayModule.generateDistrictScreenText({
      basePayload,
      route: modelPick.route,
      provider: modelPick.provider,
      model: modelPick.model,
      promptOverride: basePrompt
    });
    const draftOutput = await gatewayModule.generateDistrictScreenText({
      basePayload,
      route: modelPick.route,
      provider: modelPick.provider,
      model: modelPick.model,
      promptOverride: buildDraftPrompt({
        basePrompt,
        draftPromptText: draft.row.prompt_text
      })
    });
    const currentQuality = gatewayModule.assessInsightQuality(currentOutput);
    const draftQuality = gatewayModule.assessInsightQuality(draftOutput);
    const currentFeedback = await scoreDistrictInsight({ district, generatedText: currentOutput, label: 'current' });
    const draftFeedback = await scoreDistrictInsight({ district, generatedText: draftOutput, label: 'draft' });

    results.push({
      district,
      model: `${modelPick.provider}/${modelPick.model}`,
      current: {
        ...summarizeQuality(currentQuality),
        feedbackScore: currentFeedback.feedback.qualityScore,
        issueTags: currentFeedback.feedback.issueTags,
        cards: currentOutput.insight?.cards || []
      },
      draft: {
        draftVersion: DRAFT_VERSION,
        ...summarizeQuality(draftQuality),
        feedbackScore: draftFeedback.feedback.qualityScore,
        issueTags: draftFeedback.feedback.issueTags,
        cards: draftOutput.insight?.cards || []
      }
    });
  }

  const outPath = writeResult({
    promptKey: PROMPT_KEY,
    draftVersion: DRAFT_VERSION,
    districts: DISTRICTS,
    results
  });
  console.log(`A/B result written: ${outPath}`);
  results.forEach((result) => {
    console.log(`${result.district}: current ${result.current.feedbackScore} / draft ${result.draft.feedbackScore}`);
  });
}

main().catch((error) => {
  console.error('prompt A/B test failed:', error?.response?.data || error.message);
  process.exit(1);
});
