const fs = require('fs');
const path = require('path');
const axios = require('axios');

function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
  lines.forEach((line) => {
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
  ARTIFACT_TYPES,
  FEEDBACK_FRAMEWORK_VERSION,
  buildArtifactFeedbackPrompt,
  generateArtifactFeedback,
  pickFeedbackProviderAndModel,
  validateArtifactFeedback
} = require('../functions/_shared/auto-improvement-feedback.cjs');

const {
  createFeedbackRun,
  finishFeedbackRun,
  insertArtifactFeedback
} = require('../functions/_shared/supabase-auto-improvement.cjs');

const INSIGHT_API_BASE_URL = process.env.INSIGHT_API_BASE_URL || 'http://localhost:3000/api/insight-api';
const LLM_HARNESS_BASE_URL = process.env.LLM_HARNESS_BASE_URL
  || INSIGHT_API_BASE_URL.replace(/\/api\/insight-api\/?$/, '/api/llm-harness');
const FEEDBACK_MODEL_REGISTRY_VERSION = 'llm-feedback-model-registry-v0.1';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run') || process.env.AUTO_IMPROVE_DRY_RUN === '1';
const SAVE = args.has('--save') || process.env.AUTO_IMPROVE_SAVE === '1';
const DISTRICT = process.env.AUTO_IMPROVE_DISTRICT || '강남구';
const DISTRICTS = (process.env.AUTO_IMPROVE_DISTRICTS || DISTRICT)
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);
const ARTIFACT_TYPE_FILTER = (process.env.AUTO_IMPROVE_ARTIFACT_TYPES || '')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);
const ARTIFACT_LIMIT = Math.max(1, parseInt(process.env.AUTO_IMPROVE_ARTIFACT_LIMIT || '5', 10));
const CONTENT_MAX_CHARS = Math.max(4000, parseInt(process.env.AUTO_IMPROVE_CONTENT_MAX_CHARS || '24000', 10));

function writePreview({ districts, prompts }) {
  const outDir = path.resolve(process.cwd(), '.tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const label = districts.join('-').replace(/[\\/:*?"<>|]/g, '_');
  const outPath = path.join(outDir, `auto-improvement-feedback-${label}.json`);
  fs.writeFileSync(outPath, JSON.stringify({
    frameworkVersion: FEEDBACK_FRAMEWORK_VERSION,
    districts,
    dryRun: DRY_RUN,
    promptCount: prompts.length,
    prompts
  }, null, 2));
  return outPath;
}

function pickArtifacts(payload = {}, districtName = DISTRICT) {
  const artifacts = [];
  if (payload.insight) {
    artifacts.push({
      artifactType: 'districtInsight',
      sectionKey: 'districtInsight',
      generatedContent: payload.insight,
      sourceOutputId: payload.cacheStatus?.sourceOutputId || null
    });
  }

  Object.keys(ARTIFACT_TYPES).forEach((artifactType) => {
    const sectionKey = ARTIFACT_TYPES[artifactType].sectionKey;
    if (!payload.interpretations?.[sectionKey]) return;
    artifacts.push({
      artifactType,
      sectionKey,
      generatedContent: payload.interpretations[sectionKey],
      sourceOutputId: null
    });
  });

  if (payload.reportNarrative) {
    artifacts.push({
      artifactType: 'reportBody',
      sectionKey: 'reportBody',
      generatedContent: payload.reportNarrative,
      sourceOutputId: null
    });
  }

  return artifacts
    .filter((item, index, all) => all.findIndex(other => (
      other.artifactType === item.artifactType && other.sectionKey === item.sectionKey
    )) === index)
    .filter(item => ARTIFACT_TYPE_FILTER.length === 0 || ARTIFACT_TYPE_FILTER.includes(item.artifactType))
    .map(item => ({
      ...item,
      districtName,
      sourceOutputTable: 'llm_section_outputs'
    }))
    .slice(0, ARTIFACT_LIMIT);
}

function truncateGeneratedContent(content) {
  if (typeof content === 'string') {
    return content.length > CONTENT_MAX_CHARS
      ? `${content.slice(0, CONTENT_MAX_CHARS)}\n\n[TRUNCATED_FOR_FEEDBACK_INPUT]`
      : content;
  }
  const text = JSON.stringify(content || {}, null, 2);
  if (text.length <= CONTENT_MAX_CHARS) return content;
  return {
    truncated: true,
    maxChars: CONTENT_MAX_CHARS,
    contentPreview: text.slice(0, CONTENT_MAX_CHARS)
  };
}

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

async function fetchCachedLlmPayload(districtData) {
  const response = await axios.post(LLM_HARNESS_BASE_URL, {
    type: 'district_screen',
    provider: 'cache',
    forceGenerate: false,
    districtData,
    cultureMetrics: {}
  }, {
    timeout: 45000
  });
  return response.data;
}

async function main() {
  if (!DRY_RUN && !SAVE) {
    throw new Error('Use --dry-run to preview or --save to generate feedback and store it.');
  }

  console.log(`Auto-improvement feedback ${DRY_RUN ? 'dry-run' : 'save-run'}`);
  console.log(`Framework: ${FEEDBACK_FRAMEWORK_VERSION}`);
  console.log(`Districts: ${DISTRICTS.join(', ')}`);
  console.log(`Artifact filter: ${ARTIFACT_TYPE_FILTER.length > 0 ? ARTIFACT_TYPE_FILTER.join(', ') : 'none'}`);
  console.log(`Insight API: ${INSIGHT_API_BASE_URL}`);
  console.log(`LLM harness: ${LLM_HARNESS_BASE_URL}`);

  const modelPick = pickFeedbackProviderAndModel({
    requestedProvider: process.env.AUTO_IMPROVE_FEEDBACK_PROVIDER,
    requestedModel: process.env.AUTO_IMPROVE_FEEDBACK_MODEL
  });

  const districtPackets = [];
  for (const district of DISTRICTS) {
    const districtData = await fetchDistrictData(district);
    const llmPayload = await fetchCachedLlmPayload(districtData);
    const artifacts = pickArtifacts(llmPayload, district);
    districtPackets.push({ district, districtData, llmPayload, artifacts });
  }

  const prompts = districtPackets.flatMap(({ district, llmPayload, artifacts }) => artifacts.map((artifact) => ({
    district,
    artifactType: artifact.artifactType,
    sectionKey: artifact.sectionKey,
    sourceSnapshotKey: llmPayload.snapshotKey,
    artifact,
    prompt: buildArtifactFeedbackPrompt({
      districtName: district,
      artifactType: artifact.artifactType,
      sectionKey: artifact.sectionKey,
      generatedContent: truncateGeneratedContent(artifact.generatedContent),
      sourceOutputId: artifact.sourceOutputId,
      metricSummary: {
        snapshotKey: llmPayload.snapshotKey,
        cacheStatus: llmPayload.cacheStatus,
        sectionCacheStatus: llmPayload.sectionCacheStatus
      }
    })
  })));

  if (DRY_RUN) {
    const outPath = writePreview({ districts: DISTRICTS, prompts });
    console.log(`Prepared ${prompts.length} feedback prompt(s).`);
    console.log(`Preview written: ${outPath}`);
    return;
  }

  console.log(`Feedback model: ${modelPick.provider}/${modelPick.model}`);
  const sourceSnapshotKeys = [...new Set(districtPackets.map(packet => packet.llmPayload.snapshotKey).filter(Boolean))];
  const run = await createFeedbackRun({
    runType: process.env.AUTO_IMPROVE_RUN_TYPE || 'manual_sample',
    sourceSnapshotKey: sourceSnapshotKeys.length === 1 ? sourceSnapshotKeys[0] : null,
    feedbackFrameworkVersion: FEEDBACK_FRAMEWORK_VERSION,
    feedbackModelRegistryVersion: FEEDBACK_MODEL_REGISTRY_VERSION,
    requestPayload: {
      districts: DISTRICTS,
      artifactLimit: ARTIFACT_LIMIT,
      provider: modelPick.provider,
      model: modelPick.model,
      sourceSnapshotKeys
    }
  });
  if (!run.ok || !run.row?.id) {
    throw new Error(`feedback run 저장 실패: ${run.error || 'unknown_error'}`);
  }

  const saved = [];
  const failed = [];
  for (const item of prompts) {
    try {
      const feedback = await generateArtifactFeedback({
        prompt: item.prompt,
        provider: modelPick.provider,
        model: modelPick.model
      });
      feedback.frameworkVersion = FEEDBACK_FRAMEWORK_VERSION;
      feedback.artifactType = item.artifactType;
      feedback.sectionKey = item.sectionKey;
      feedback.districtName = item.district;
      const validation = validateArtifactFeedback(feedback);
      if (!validation.ok) {
        throw new Error(`feedback schema invalid: ${validation.errors.join(', ')}`);
      }
      const inserted = await insertArtifactFeedback({
        runId: run.row.id,
        artifact: item.artifact,
        feedback,
        provider: modelPick.provider,
        model: modelPick.model,
        sourceSnapshotKey: item.sourceSnapshotKey
      });
      if (!inserted.ok) {
        throw new Error(`feedback row 저장 실패: ${inserted.error}`);
      }
      saved.push({
        district: item.district,
        artifactType: item.artifactType,
        sectionKey: item.sectionKey,
        qualityScore: feedback.qualityScore,
        issueTags: feedback.issueTags || []
      });
      console.log(`✅ feedback:${item.district}:${item.artifactType} score:${feedback.qualityScore}`);
    } catch (error) {
      failed.push({
        district: item.district,
        artifactType: item.artifactType,
        sectionKey: item.sectionKey,
        error: error.message
      });
      console.warn(`⚠️ feedback:${item.district}:${item.artifactType} failed: ${error.message}`);
    }
  }

  const status = failed.length > 0 ? 'needs_review' : 'succeeded';
  await finishFeedbackRun({
    runId: run.row.id,
    status,
    responseSummary: {
      saved,
      failed,
      savedCount: saved.length,
      failedCount: failed.length
    },
    errorMessage: failed.length > 0 ? `${failed.length} feedback artifact(s) failed` : null
  });

  console.log(`완료: ${saved.length} 저장 / ${failed.length} 실패`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('auto-improvement feedback run failed:', error?.response?.data || error.message);
  process.exit(1);
});
