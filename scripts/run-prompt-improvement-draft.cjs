const fs = require('fs');
const path = require('path');

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

const {
  buildPromptImprovementPrompt,
  generatePromptImprovement,
  pickFeedbackProviderAndModel,
  validatePromptImprovement
} = require('../functions/_shared/auto-improvement-feedback.cjs');

const {
  fetchArtifactFeedbackRows,
  fetchPromptVersion,
  insertPromptImprovementRun,
  insertPromptVersion
} = require('../functions/_shared/supabase-auto-improvement.cjs');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run') || process.env.AUTO_IMPROVE_DRAFT_DRY_RUN === '1';
const SAVE = args.has('--save') || process.env.AUTO_IMPROVE_DRAFT_SAVE === '1';
const ARTIFACT_TYPE = process.env.AUTO_IMPROVE_ARTIFACT_TYPE || 'districtInsight';
const SECTION_KEY = process.env.AUTO_IMPROVE_SECTION_KEY || ARTIFACT_TYPE;
const PROMPT_KEY = process.env.AUTO_IMPROVE_PROMPT_KEY || 'district-screen-insight';
const CURRENT_PROMPT_VERSION = process.env.AUTO_IMPROVE_CURRENT_PROMPT_VERSION || 'district-screen-insight-v0.8';
const CURRENT_PROMPT_DB_VERSION = process.env.AUTO_IMPROVE_CURRENT_PROMPT_DB_VERSION || '';
const ADDITIONAL_GUIDANCE = process.env.AUTO_IMPROVE_ADDITIONAL_GUIDANCE || '';
const FEEDBACK_LIMIT = Math.max(1, parseInt(process.env.AUTO_IMPROVE_FEEDBACK_LIMIT || '25', 10));

async function readCurrentPromptText() {
  if (CURRENT_PROMPT_DB_VERSION) {
    const current = await fetchPromptVersion({
      promptKey: PROMPT_KEY,
      promptVersion: CURRENT_PROMPT_DB_VERSION,
      artifactType: ARTIFACT_TYPE,
      sectionKey: SECTION_KEY
    });
    if (!current.ok || !current.row?.prompt_text) {
      throw new Error(`current prompt DB 조회 실패: ${CURRENT_PROMPT_DB_VERSION}`);
    }
    return current.row.prompt_text;
  }

  const gatewayPath = path.resolve(process.cwd(), 'functions/_shared/llm-gateway.cjs');
  const source = fs.readFileSync(gatewayPath, 'utf-8');
  const marker = 'function buildDistrictScreenPrompt';
  const start = source.indexOf(marker);
  if (start < 0) return source.slice(0, 20000);
  const end = source.indexOf('\nasync function fetchWithTimeout', start);
  return source.slice(start, end > start ? end : start + 24000);
}

function writePreview(payload) {
  const outDir = path.resolve(process.cwd(), '.tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `prompt-improvement-${ARTIFACT_TYPE}-${SECTION_KEY}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  return outPath;
}

async function main() {
  if (!DRY_RUN && !SAVE) {
    throw new Error('Use --dry-run to preview or --save to generate and store a draft prompt.');
  }
  console.log(`Prompt improvement ${DRY_RUN ? 'dry-run' : 'save-run'}`);
  console.log(`Target: ${ARTIFACT_TYPE}/${SECTION_KEY}`);

  const feedbackResult = await fetchArtifactFeedbackRows({
    artifactType: ARTIFACT_TYPE,
    sectionKey: SECTION_KEY,
    limit: FEEDBACK_LIMIT
  });
  if (!feedbackResult.ok) {
    throw new Error(`feedback 조회 실패: ${feedbackResult.error || 'unknown_error'}`);
  }
  const feedbackRows = Array.isArray(feedbackResult.data) ? feedbackResult.data : [];
  if (feedbackRows.length === 0) {
    throw new Error(`개선에 사용할 피드백이 없습니다: ${ARTIFACT_TYPE}/${SECTION_KEY}`);
  }

  const modelPick = pickFeedbackProviderAndModel({
    requestedProvider: process.env.AUTO_IMPROVE_IMPROVEMENT_PROVIDER || process.env.AUTO_IMPROVE_FEEDBACK_PROVIDER,
    requestedModel: process.env.AUTO_IMPROVE_IMPROVEMENT_MODEL || process.env.AUTO_IMPROVE_FEEDBACK_MODEL
  });
  const prompt = buildPromptImprovementPrompt({
    promptKey: PROMPT_KEY,
    artifactType: ARTIFACT_TYPE,
    sectionKey: SECTION_KEY,
    currentPromptVersion: CURRENT_PROMPT_VERSION,
    currentPromptText: await readCurrentPromptText(),
    feedbackRows,
    additionalGuidance: ADDITIONAL_GUIDANCE
  });

  if (DRY_RUN) {
    const outPath = writePreview({
      promptKey: PROMPT_KEY,
      artifactType: ARTIFACT_TYPE,
      sectionKey: SECTION_KEY,
      feedbackCount: feedbackRows.length,
      provider: modelPick.provider,
      model: modelPick.model,
      prompt
    });
    console.log(`Prepared prompt improvement input from ${feedbackRows.length} feedback row(s).`);
    console.log(`Preview written: ${outPath}`);
    return;
  }

  console.log(`Improvement model: ${modelPick.provider}/${modelPick.model}`);
  const improvement = await generatePromptImprovement({
    prompt,
    provider: modelPick.provider,
    model: modelPick.model
  });
  improvement.promptKey = PROMPT_KEY;
  improvement.artifactType = ARTIFACT_TYPE;
  improvement.sectionKey = SECTION_KEY;
  improvement.draftPromptVersion = process.env.AUTO_IMPROVE_DRAFT_VERSION
    || improvement.draftPromptVersion
    || `${CURRENT_PROMPT_VERSION}-draft-${Date.now()}`;
  const validation = validatePromptImprovement(improvement);
  if (!validation.ok) {
    throw new Error(`prompt improvement schema invalid: ${validation.errors.join(', ')}`);
  }

  const promptVersion = await insertPromptVersion({
    promptKey: improvement.promptKey,
    artifactType: improvement.artifactType,
    sectionKey: improvement.sectionKey,
    promptVersion: improvement.draftPromptVersion,
    promptText: improvement.draftPromptText,
    promptJson: improvement,
    status: 'draft',
    changeSummary: improvement.changeSummary,
    improvementEvidence: {
      feedbackIds: feedbackRows.map(row => row.id),
      appliedFeedbackThemes: improvement.appliedFeedbackThemes,
      riskNotes: improvement.riskNotes
    }
  });
  if (!promptVersion.ok || !promptVersion.row?.id) {
    throw new Error(`draft prompt 저장 실패: ${promptVersion.error || 'unknown_error'}`);
  }

  const run = await insertPromptImprovementRun({
    artifactType: improvement.artifactType,
    sectionKey: improvement.sectionKey,
    draftPromptVersionId: promptVersion.row.id,
    provider: modelPick.provider,
    model: modelPick.model,
    inputSummary: {
      promptKey: PROMPT_KEY,
      currentPromptVersion: CURRENT_PROMPT_VERSION,
      feedbackCount: feedbackRows.length
    },
    outputSummary: {
      draftPromptVersion: improvement.draftPromptVersion,
      changeSummary: improvement.changeSummary,
      appliedFeedbackThemes: improvement.appliedFeedbackThemes,
      riskNotes: improvement.riskNotes
    },
    status: 'drafted'
  });
  if (!run.ok) {
    throw new Error(`prompt improvement run 저장 실패: ${run.error || 'unknown_error'}`);
  }

  console.log(`✅ draft prompt saved: ${improvement.draftPromptVersion}`);
}

main().catch((error) => {
  console.error('prompt improvement draft failed:', error?.response?.data || error.message);
  process.exit(1);
});
