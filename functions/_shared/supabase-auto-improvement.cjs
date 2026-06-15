const DEFAULT_TIMEOUT_MS = 5000;

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, key, enabled: Boolean(url && key) };
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  return query.toString();
}

function buildHeaders(key, extra = {}) {
  const headers = {
    apikey: key,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'libscope-auto-improvement/1.0',
    ...extra
  };
  if (!String(key).startsWith('sb_secret_')) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

async function supabaseRequest(path, { method = 'GET', body, prefer } = {}) {
  const config = getSupabaseConfig();
  if (!config.enabled) {
    return { ok: false, unavailable: true, status: 0, error: 'supabase_service_role_env_missing' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.url}/rest/v1/${path}`, {
      method,
      headers: buildHeaders(config.key, prefer ? { Prefer: prefer } : {}),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text().catch(() => '');
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      return {
        ok: false,
        unavailable: response.status === 401 || response.status === 403 || response.status === 404,
        status: response.status,
        error: data?.code || data?.message || `http_${response.status}`,
        details: data
      };
    }
    return { ok: true, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      unavailable: error.name === 'AbortError',
      status: 0,
      error: error.name === 'AbortError' ? 'supabase_timeout' : error.message
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function createFeedbackRun({
  runType = 'manual_sample',
  sourceSnapshotKey,
  feedbackFrameworkVersion,
  feedbackModelRegistryVersion,
  requestPayload = {}
}) {
  const result = await supabaseRequest('llm_feedback_runs', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      run_type: runType,
      status: 'started',
      source_snapshot_key: sourceSnapshotKey || null,
      feedback_framework_version: feedbackFrameworkVersion,
      feedback_model_registry_version: feedbackModelRegistryVersion,
      request_payload: requestPayload
    }
  });
  if (!result.ok) return result;
  return { ...result, row: Array.isArray(result.data) ? result.data[0] : null };
}

async function insertArtifactFeedback({
  runId,
  artifact,
  feedback,
  provider,
  model,
  sourceSnapshotKey
}) {
  return supabaseRequest('llm_artifact_feedback', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      run_id: runId,
      artifact_type: artifact.artifactType,
      section_key: artifact.sectionKey || null,
      district_name: feedback.districtName || artifact.districtName,
      source_output_table: artifact.sourceOutputTable || 'llm_section_outputs',
      source_output_id: artifact.sourceOutputId || null,
      source_snapshot_key: sourceSnapshotKey || null,
      feedback_framework_version: feedback.frameworkVersion,
      feedback_provider: provider,
      feedback_model: model,
      feedback_payload: feedback,
      quality_score: feedback.qualityScore,
      operator_usefulness_score: feedback.operatorUsefulnessScore,
      rubric_scores: feedback.rubricScores || {},
      issue_tags: feedback.issueTags || [],
      prompt_improvement_hints: feedback.promptImprovementHints || [],
      avoid_patterns: feedback.avoidPatterns || [],
      must_include_next_time: feedback.mustIncludeNextTime || [],
      evidence_gaps: feedback.evidenceGaps || [],
      rewrite_risk: feedback.rewriteRisk || null
    }
  });
}

async function finishFeedbackRun({ runId, status, responseSummary = {}, errorMessage = null }) {
  return supabaseRequest(`llm_feedback_runs?${buildQuery({ id: `eq.${runId}` })}`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: {
      status,
      response_summary: responseSummary,
      error_message: errorMessage,
      finished_at: new Date().toISOString()
    }
  });
}

async function fetchRecentFeedbackSummary({ limit = 20 } = {}) {
  return supabaseRequest(`llm_artifact_feedback?${buildQuery({
    select: 'artifact_type,section_key,district_name,quality_score,operator_usefulness_score,issue_tags,prompt_improvement_hints,avoid_patterns,created_at',
    order: 'created_at.desc',
    limit
  })}`);
}

async function fetchArtifactFeedbackRows({ artifactType, sectionKey, limit = 25 } = {}) {
  return supabaseRequest(`llm_artifact_feedback?${buildQuery({
    select: 'id,artifact_type,section_key,district_name,quality_score,operator_usefulness_score,issue_tags,prompt_improvement_hints,avoid_patterns,must_include_next_time,evidence_gaps,rewrite_risk,created_at',
    artifact_type: artifactType ? `eq.${artifactType}` : undefined,
    section_key: sectionKey ? `eq.${sectionKey}` : undefined,
    order: 'created_at.desc',
    limit
  })}`);
}

async function insertPromptVersion({
  promptKey,
  artifactType,
  sectionKey,
  promptVersion,
  promptText,
  promptJson = {},
  status = 'draft',
  createdFromFeedbackRunId = null,
  sourcePromptVersionId = null,
  changeSummary = '',
  improvementEvidence = {}
}) {
  const result = await supabaseRequest('llm_prompt_versions', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      prompt_key: promptKey,
      artifact_type: artifactType,
      section_key: sectionKey,
      prompt_version: promptVersion,
      prompt_text: promptText,
      prompt_json: promptJson,
      status,
      created_from_feedback_run_id: createdFromFeedbackRunId,
      source_prompt_version_id: sourcePromptVersionId,
      change_summary: changeSummary,
      improvement_evidence: improvementEvidence
    }
  });
  if (!result.ok) return result;
  return { ...result, row: Array.isArray(result.data) ? result.data[0] : null };
}

async function insertPromptImprovementRun({
  feedbackRunId = null,
  artifactType,
  sectionKey,
  sourcePromptVersionId = null,
  draftPromptVersionId = null,
  provider,
  model,
  inputSummary = {},
  outputSummary = {},
  status = 'drafted',
  errorMessage = null
}) {
  return supabaseRequest('llm_prompt_improvement_runs', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      feedback_run_id: feedbackRunId,
      artifact_type: artifactType,
      section_key: sectionKey,
      source_prompt_version_id: sourcePromptVersionId,
      draft_prompt_version_id: draftPromptVersionId,
      improvement_provider: provider,
      improvement_model: model,
      input_summary: inputSummary,
      output_summary: outputSummary,
      status,
      error_message: errorMessage
    }
  });
}

async function fetchPromptVersion({ promptKey, promptVersion, artifactType, sectionKey } = {}) {
  const result = await supabaseRequest(`llm_prompt_versions?${buildQuery({
    select: 'id,prompt_key,artifact_type,section_key,prompt_version,prompt_text,prompt_json,status,change_summary,created_at,activated_at,archived_at',
    prompt_key: promptKey ? `eq.${promptKey}` : undefined,
    prompt_version: promptVersion ? `eq.${promptVersion}` : undefined,
    artifact_type: artifactType ? `eq.${artifactType}` : undefined,
    section_key: sectionKey ? `eq.${sectionKey}` : undefined,
    order: 'created_at.desc',
    limit: '1'
  })}`);
  if (!result.ok) return result;
  return { ...result, row: Array.isArray(result.data) ? result.data[0] : null };
}

async function archiveActivePromptVersions({ promptKey, artifactType, sectionKey }) {
  return supabaseRequest(`llm_prompt_versions?${buildQuery({
    prompt_key: `eq.${promptKey}`,
    artifact_type: `eq.${artifactType}`,
    section_key: `eq.${sectionKey}`,
    status: 'eq.active'
  })}`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: {
      status: 'archived',
      archived_at: new Date().toISOString()
    }
  });
}

async function activatePromptVersion({ id }) {
  return supabaseRequest(`llm_prompt_versions?${buildQuery({ id: `eq.${id}` })}`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: {
      status: 'active',
      activated_at: new Date().toISOString(),
      archived_at: null
    }
  });
}

module.exports = {
  activatePromptVersion,
  archiveActivePromptVersions,
  createFeedbackRun,
  fetchArtifactFeedbackRows,
  fetchPromptVersion,
  fetchRecentFeedbackSummary,
  finishFeedbackRun,
  insertArtifactFeedback,
  insertPromptImprovementRun,
  insertPromptVersion
};
