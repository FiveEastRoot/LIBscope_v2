const DEFAULT_TIMEOUT_MS = 5000;

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
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
    'User-Agent': 'libscope-netlify-function/1.0',
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
    return { ok: false, unavailable: true, status: 0, error: 'supabase_env_missing' };
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
      const errorCode = data?.code || data?.message || `http_${response.status}`;
      const tableMissing = response.status === 404 && data?.code === 'PGRST205';
      const authUnavailable = response.status === 401 || response.status === 403;
      return {
        ok: false,
        unavailable: tableMissing || authUnavailable,
        status: response.status,
        error: errorCode,
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

function buildDistrictInsightFilters({
  guName,
  sourceSnapshotKey,
  harnessVersion,
  promptVersion,
  modelRegistryVersion
}) {
  return {
    select: 'id,output_payload,provider,model_name,generated_at,valid_until,quality_status,quality_errors',
    gu_name: `eq.${guName}`,
    section_key: 'eq.districtInsight',
    generation_unit: 'eq.district_screen',
    source_snapshot_key: `eq.${sourceSnapshotKey}`,
    harness_version: `eq.${harnessVersion}`,
    prompt_version: `eq.${promptVersion}`,
    model_registry_version: `eq.${modelRegistryVersion}`,
    library_id: 'is.null',
    archived_at: 'is.null',
    order: 'generated_at.desc',
    limit: '1'
  };
}

function buildLatestDistrictInsightFilters({
  guName,
  harnessVersion,
  promptVersion,
  modelRegistryVersion
}) {
  return {
    select: 'id,output_payload,provider,model_name,generated_at,valid_until,quality_status,quality_errors,source_snapshot_key',
    gu_name: `eq.${guName}`,
    section_key: 'eq.districtInsight',
    generation_unit: 'eq.district_screen',
    harness_version: `eq.${harnessVersion}`,
    prompt_version: `eq.${promptVersion}`,
    model_registry_version: `eq.${modelRegistryVersion}`,
    library_id: 'is.null',
    archived_at: 'is.null',
    order: 'generated_at.desc',
    limit: '1'
  };
}

const SECTION_CACHE_KEYS = ['population', 'culture', 'education', 'socialSafety'];

function buildSectionFilters({
  guName,
  sectionKey,
  sourceSnapshotKey,
  harnessVersion,
  promptVersion,
  modelRegistryVersion
}) {
  return {
    select: 'id,section_key,output_payload,provider,model_name,generated_at,valid_until,quality_status,quality_errors',
    gu_name: `eq.${guName}`,
    section_key: sectionKey ? `eq.${sectionKey}` : undefined,
    generation_unit: 'eq.metric_interpretation',
    source_snapshot_key: `eq.${sourceSnapshotKey}`,
    harness_version: `eq.${harnessVersion}`,
    prompt_version: `eq.${promptVersion}`,
    model_registry_version: `eq.${modelRegistryVersion}`,
    library_id: 'is.null',
    archived_at: 'is.null',
    order: 'generated_at.desc'
  };
}

function buildLatestSectionFilters({
  guName,
  sectionKey,
  harnessVersion,
  promptVersion,
  modelRegistryVersion
}) {
  return {
    select: 'id,section_key,output_payload,provider,model_name,generated_at,valid_until,quality_status,quality_errors,source_snapshot_key',
    gu_name: `eq.${guName}`,
    section_key: sectionKey ? `eq.${sectionKey}` : undefined,
    generation_unit: 'eq.metric_interpretation',
    harness_version: `eq.${harnessVersion}`,
    prompt_version: `eq.${promptVersion}`,
    model_registry_version: `eq.${modelRegistryVersion}`,
    library_id: 'is.null',
    archived_at: 'is.null',
    order: 'generated_at.desc'
  };
}

function withCacheStatus(payload, cacheStatus = {}) {
  return {
    ...payload,
    cacheStatus: {
      source: 'supabase.llm_section_outputs',
      sourceSnapshotKey: payload?.snapshotKey,
      ...cacheStatus
    }
  };
}

function withSectionCacheStatus(payload, sectionCacheStatus = {}) {
  return {
    ...payload,
    sectionCacheStatus: {
      source: 'supabase.llm_section_outputs',
      sourceSnapshotKey: payload?.snapshotKey,
      ...sectionCacheStatus
    }
  };
}

function applyCachedInterpretations(payload = {}, cachedInterpretations = {}) {
  const entries = Object.entries(cachedInterpretations || {}).filter(([, packet]) => packet);
  if (entries.length === 0) return payload;
  return {
    ...payload,
    interpretations: {
      ...(payload.interpretations || {}),
      ...Object.fromEntries(entries)
    }
  };
}

async function fetchCachedDistrictInsight(params) {
  const filters = buildDistrictInsightFilters(params);
  const result = await supabaseRequest(`llm_section_outputs?${buildQuery(filters)}`);

  if (!result.ok) {
    return {
      hit: false,
      available: !result.unavailable,
      reason: result.unavailable ? 'cache_unavailable' : 'cache_read_failed',
      error: result.error,
      details: result.details
    };
  }

  const row = Array.isArray(result.data) ? result.data[0] : null;
  if (row?.output_payload) {
    return {
      hit: true,
      available: true,
      row,
      payload: withCacheStatus(row.output_payload, {
        hit: true,
        available: true,
        canGenerate: false,
        reason: 'snapshot_cache_hit',
        generatedAt: row.generated_at,
        validUntil: row.valid_until,
        qualityStatus: row.quality_status,
        provider: row.provider,
        model: row.model_name
      })
    };
  }

  const latestFilters = buildLatestDistrictInsightFilters(params);
  const latestResult = await supabaseRequest(`llm_section_outputs?${buildQuery(latestFilters)}`);
  if (latestResult.ok) {
    const latestRow = Array.isArray(latestResult.data) ? latestResult.data[0] : null;
    if (latestRow?.output_payload) {
      return {
        hit: true,
        available: true,
        staleSnapshot: true,
        row: latestRow,
        payload: withCacheStatus(latestRow.output_payload, {
          hit: true,
          available: true,
          canGenerate: false,
          reason: 'latest_gu_cache_hit_snapshot_mismatch',
          requestedSnapshotKey: params.sourceSnapshotKey,
          cachedSnapshotKey: latestRow.source_snapshot_key,
          generatedAt: latestRow.generated_at,
          validUntil: latestRow.valid_until,
          qualityStatus: latestRow.quality_status,
          provider: latestRow.provider,
          model: latestRow.model_name
        })
      };
    }
  }

  return {
    hit: false,
    available: true,
    reason: latestResult.ok ? 'cache_miss' : 'cache_latest_read_failed',
    error: latestResult.ok ? null : latestResult.error
  };
}

async function fetchCachedSectionInterpretations(params) {
  const filters = buildSectionFilters(params);
  const result = await supabaseRequest(`llm_section_outputs?${buildQuery(filters)}`);

  if (!result.ok) {
    return {
      hit: false,
      available: !result.unavailable,
      reason: result.unavailable ? 'section_cache_unavailable' : 'section_cache_read_failed',
      error: result.error,
      details: result.details,
      interpretations: {}
    };
  }

  const rows = Array.isArray(result.data) ? result.data : [];
  const exactRows = rows;
  let fallbackRows = [];
  if (exactRows.length === 0) {
    const latestFilters = buildLatestSectionFilters(params);
    const latestResult = await supabaseRequest(`llm_section_outputs?${buildQuery(latestFilters)}`);
    if (latestResult.ok) {
      fallbackRows = Array.isArray(latestResult.data) ? latestResult.data : [];
    }
  }
  const sourceRows = exactRows.length > 0 ? exactRows : fallbackRows;
  const latestBySection = new Map();
  sourceRows.forEach((row) => {
    if (!row?.section_key || !row?.output_payload) return;
    if (!latestBySection.has(row.section_key)) {
      latestBySection.set(row.section_key, row);
    }
  });

  const interpretations = {};
  const generatedAtBySection = {};
  const qualityBySection = {};
  SECTION_CACHE_KEYS.forEach((sectionKey) => {
    const row = latestBySection.get(sectionKey);
    if (!row?.output_payload) return;
    interpretations[sectionKey] = row.output_payload;
    generatedAtBySection[sectionKey] = row.generated_at;
    qualityBySection[sectionKey] = row.quality_status;
  });

  const sectionKeys = Object.keys(interpretations);
  return {
    hit: sectionKeys.length > 0,
    complete: SECTION_CACHE_KEYS.every(sectionKey => sectionKeys.includes(sectionKey)),
    available: true,
    staleSnapshot: exactRows.length === 0 && fallbackRows.length > 0,
    reason: sectionKeys.length > 0
      ? (exactRows.length > 0 ? 'section_cache_hit' : 'latest_section_cache_hit_snapshot_mismatch')
      : 'section_cache_miss',
    requestedSnapshotKey: params.sourceSnapshotKey,
    sectionKeys,
    generatedAtBySection,
    qualityBySection,
    interpretations
  };
}

async function updateCachedDistrictInsight({ row, filters }) {
  const updateFilters = {
    gu_name: filters.gu_name,
    section_key: filters.section_key,
    generation_unit: filters.generation_unit,
    source_snapshot_key: filters.source_snapshot_key,
    harness_version: filters.harness_version,
    prompt_version: filters.prompt_version,
    model_registry_version: filters.model_registry_version,
    library_id: 'is.null',
    archived_at: 'is.null'
  };
  return supabaseRequest(`llm_section_outputs?${buildQuery(updateFilters)}`, {
    method: 'PATCH',
    body: row,
    prefer: 'return=representation'
  });
}

async function updateCachedSection({ row, filters }) {
  const updateFilters = {
    gu_name: filters.gu_name,
    section_key: filters.section_key,
    generation_unit: filters.generation_unit,
    source_snapshot_key: filters.source_snapshot_key,
    harness_version: filters.harness_version,
    prompt_version: filters.prompt_version,
    model_registry_version: filters.model_registry_version,
    library_id: 'is.null',
    archived_at: 'is.null'
  };
  return supabaseRequest(`llm_section_outputs?${buildQuery(updateFilters)}`, {
    method: 'PATCH',
    body: row,
    prefer: 'return=representation'
  });
}

async function insertCachedDistrictInsight(row) {
  return supabaseRequest('llm_section_outputs', {
    method: 'POST',
    body: row,
    prefer: 'return=representation'
  });
}

async function insertCachedSection(row) {
  return supabaseRequest('llm_section_outputs', {
    method: 'POST',
    body: row,
    prefer: 'return=representation'
  });
}

async function saveCachedDistrictInsight({
  payload,
  districtData = {},
  cultureMetrics = {},
  promptVersion,
  outputSchemaVersion,
  modelRegistryVersion,
  aiMeta = {},
  qualityStatus = 'pending',
  qualityErrors = []
}) {
  const guName = districtData.gu || cultureMetrics.gu || payload?.insight?.title || '선택 자치구';
  const generatedAt = new Date().toISOString();
  const row = {
    gu_code: districtData.guCode || null,
    gu_name: guName,
    library_id: null,
    library_name: null,
    section_key: 'districtInsight',
    generation_unit: 'district_screen',
    source_snapshot_key: payload.snapshotKey,
    harness_version: payload.harnessVersion,
    prompt_version: promptVersion,
    output_schema_version: outputSchemaVersion,
    model_registry_version: modelRegistryVersion,
    provider: aiMeta.provider || 'unknown',
    model_name: aiMeta.model || 'unknown',
    input_payload: {
      districtData,
      cultureMetrics,
      snapshotKey: payload.snapshotKey
    },
    output_payload: withCacheStatus(payload, {
      hit: true,
      available: true,
      canGenerate: false,
      reason: 'snapshot_cache_saved',
      generatedAt,
      qualityStatus,
      provider: aiMeta.provider,
      model: aiMeta.model
    }),
    evidence_refs: payload.insight?.evidenceRefs || [],
    quality_status: qualityStatus,
    quality_errors: qualityErrors,
    token_usage: aiMeta.tokenUsage || {},
    cost_estimate_usd: aiMeta.costEstimateUsd ?? null,
    generated_at: generatedAt,
    valid_until: null,
    archived_at: null
  };

  const filters = buildDistrictInsightFilters({
    guName,
    sourceSnapshotKey: payload.snapshotKey,
    harnessVersion: payload.harnessVersion,
    promptVersion,
    modelRegistryVersion
  });
  const updated = await updateCachedDistrictInsight({ row, filters });
  if (updated.ok && Array.isArray(updated.data) && updated.data[0]?.output_payload) {
    return {
      saved: true,
      payload: withCacheStatus(updated.data[0].output_payload, {
        hit: true,
        available: true,
        canGenerate: false,
        reason: 'snapshot_cache_updated',
        generatedAt: updated.data[0].generated_at,
        qualityStatus: updated.data[0].quality_status,
        provider: updated.data[0].provider,
        model: updated.data[0].model_name
      })
    };
  }

  const inserted = await insertCachedDistrictInsight(row);
  if (inserted.ok && Array.isArray(inserted.data) && inserted.data[0]?.output_payload) {
    return {
      saved: true,
      payload: withCacheStatus(inserted.data[0].output_payload, {
        hit: true,
        available: true,
        canGenerate: false,
        reason: 'snapshot_cache_inserted',
        generatedAt: inserted.data[0].generated_at,
        qualityStatus: inserted.data[0].quality_status,
        provider: inserted.data[0].provider,
        model: inserted.data[0].model_name
      })
    };
  }

  return {
    saved: false,
    error: inserted.error || updated.error,
    payload: withCacheStatus(payload, {
      hit: false,
      available: false,
      canGenerate: true,
      reason: 'cache_save_failed',
      generatedAt,
      error: inserted.error || updated.error
    })
  };
}

async function saveCachedSectionInterpretations({
  payload,
  districtData = {},
  cultureMetrics = {},
  promptVersion,
  outputSchemaVersion,
  modelRegistryVersion,
  aiMeta = {},
  qualityStatus = 'pending',
  qualityErrors = []
}) {
  const guName = districtData.gu || cultureMetrics.gu || payload?.insight?.title || '선택 자치구';
  const generatedAt = new Date().toISOString();
  const results = [];

  for (const sectionKey of SECTION_CACHE_KEYS) {
    const packet = payload.interpretations?.[sectionKey];
    if (!packet) continue;
    const row = {
      gu_code: districtData.guCode || null,
      gu_name: guName,
      library_id: null,
      library_name: null,
      section_key: sectionKey,
      generation_unit: 'metric_interpretation',
      source_snapshot_key: payload.snapshotKey,
      harness_version: payload.harnessVersion,
      prompt_version: promptVersion,
      output_schema_version: outputSchemaVersion,
      model_registry_version: modelRegistryVersion,
      provider: aiMeta.provider || 'unknown',
      model_name: aiMeta.model || 'unknown',
      input_payload: {
        districtData,
        cultureMetrics,
        snapshotKey: payload.snapshotKey,
        sectionKey
      },
      output_payload: packet,
      evidence_refs: packet.evidenceRefs || [],
      quality_status: qualityStatus,
      quality_errors: qualityErrors,
      token_usage: aiMeta.tokenUsage || {},
      cost_estimate_usd: aiMeta.costEstimateUsd ?? null,
      generated_at: generatedAt,
      valid_until: null,
      archived_at: null
    };
    const filters = buildSectionFilters({
      guName,
      sectionKey,
      sourceSnapshotKey: payload.snapshotKey,
      harnessVersion: payload.harnessVersion,
      promptVersion,
      modelRegistryVersion
    });
    const updated = await updateCachedSection({ row, filters });
    if (updated.ok && Array.isArray(updated.data) && updated.data[0]?.output_payload) {
      results.push({ sectionKey, saved: true, reason: 'section_cache_updated' });
      continue;
    }
    const inserted = await insertCachedSection(row);
    results.push({
      sectionKey,
      saved: inserted.ok && Array.isArray(inserted.data) && Boolean(inserted.data[0]?.output_payload),
      reason: inserted.ok ? 'section_cache_inserted' : 'section_cache_save_failed',
      error: inserted.ok ? null : inserted.error || updated.error
    });
  }

  const savedKeys = results.filter(item => item.saved).map(item => item.sectionKey);
  return {
    saved: savedKeys.length > 0,
    complete: SECTION_CACHE_KEYS.every(sectionKey => savedKeys.includes(sectionKey)),
    sectionKeys: savedKeys,
    results
  };
}

module.exports = {
  SECTION_CACHE_KEYS,
  applyCachedInterpretations,
  fetchCachedDistrictInsight,
  fetchCachedSectionInterpretations,
  saveCachedDistrictInsight,
  saveCachedSectionInterpretations,
  withSectionCacheStatus,
  withCacheStatus
};
