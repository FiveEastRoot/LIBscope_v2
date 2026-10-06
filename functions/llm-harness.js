import harnessModule from './_shared/llm-harness.cjs';
import gatewayModule from './_shared/llm-gateway.cjs';
import cacheModule from './_shared/supabase-llm-cache.cjs';

const {
  MODEL_REGISTRY_VERSION,
  CONTRACT_VERSION,
  SECTION_CONTRACTS,
  QUALITY_GATES,
  REPORT_OUTLINE,
  GOLDEN_TEST_DISTRICTS,
  LLM_PROVIDERS,
  LLM_MODEL_CATALOG,
  MODEL_RECOMMENDATIONS,
  buildHarnessPayload,
  mergeGeneratedHarnessPayload
} = harnessModule;

const {
  getGatewayReadiness,
  getDirectReadiness,
  assessInsightQuality,
  pickProviderAndModel,
  generateDistrictScreenText,
  generateDistrictReportNarrative
} = gatewayModule;

const {
  applyCachedInterpretations,
  fetchCachedDistrictInsight,
  fetchCachedSectionInterpretations,
  saveCachedDistrictInsight,
  saveCachedSectionInterpretations,
  withSectionCacheStatus,
  withCacheStatus
} = cacheModule;

const SECTION_PROMPT_VERSION = 'district-section-interpretation-v1.0';
const INSIGHT_PROMPT_VERSION = 'district-summary-insight-v0.5';
const REPORT_NARRATIVE_PROMPT_VERSION = 'district-report-core-interpretation-v1.4';
const PROMPT_VERSION = `${SECTION_PROMPT_VERSION}+${INSIGHT_PROMPT_VERSION}+${REPORT_NARRATIVE_PROMPT_VERSION}`;
const SECTION_CACHE_KEYS = ['population', 'culture', 'education', 'socialSafety'];

function normalizeRegenerateSections(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))]
    .filter(sectionKey => SECTION_CACHE_KEYS.includes(sectionKey));
}

function buildSectionStatusAfterSave({ previous = {}, savedSections = {} }) {
  const savedKeys = savedSections.sectionKeys || [];
  const previousStaleBySection = previous.staleBySection || {};
  const staleBySection = { ...previousStaleBySection };
  const generatedAtBySection = { ...(previous.generatedAtBySection || {}) };
  const qualityBySection = { ...(previous.qualityBySection || {}) };
  const now = new Date().toISOString();

  savedKeys.forEach((sectionKey) => {
    staleBySection[sectionKey] = false;
    generatedAtBySection[sectionKey] = now;
    qualityBySection[sectionKey] = 'saved';
  });

  const staleSectionKeys = Object.entries(staleBySection)
    .filter(([, isStale]) => isStale)
    .map(([sectionKey]) => sectionKey);
  const sectionKeys = [...new Set([...(previous.sectionKeys || []), ...savedKeys])];

  return {
    hit: sectionKeys.length > 0,
    complete: SECTION_CACHE_KEYS.every(sectionKey => sectionKeys.includes(sectionKey)),
    available: true,
    reason: savedSections.complete ? 'selected_section_cache_saved' : 'selected_section_cache_partial',
    sectionKeys,
    staleSectionKeys,
    staleBySection,
    snapshotKeyBySection: previous.snapshotKeyBySection || {},
    generatedAtBySection,
    qualityBySection,
    canGenerate: true,
    results: savedSections.results || []
  };
}

function validateGeneratedInsightCards(generatedText = {}) {
  const cards = generatedText.insight?.cards;
  if (!Array.isArray(cards)) {
    return { ok: false, reason: 'insight.cards 배열 누락' };
  }
  const normalized = cards
    .map((card) => ({
      label: String(card?.label || '').trim(),
      text: String(card?.text || '').trim(),
      bullets: Array.isArray(card?.bullets)
        ? card.bullets.map(item => String(item || '').trim()).filter(Boolean).slice(0, 4)
        : []
    }))
    .filter(card => card.label && card.text);

  if (normalized.length !== 3) {
    return { ok: false, reason: 'insight.cards 3개 미만 또는 초과' };
  }

  const expectedLabels = ['핵심 판단', '주의 지점', '실행 방향'];
  const invalidLabel = normalized.find((card, index) => card.label !== expectedLabels[index]);
  if (invalidLabel) {
    return { ok: false, reason: 'insight.cards 라벨 계약 불일치' };
  }

  const tooShort = normalized.find(card => card.text.length < 40);
  if (tooShort) {
    return { ok: false, reason: 'insight.cards 전문성 분량 부족' };
  }

  const tooFewBullets = normalized.find(card => card.bullets.length < 2);
  if (tooFewBullets) {
    return { ok: false, reason: 'insight.cards는 카드당 최소 2개 불릿 필요' };
  }

  const leakedInstruction = normalized.find(card => card.bullets.some(bullet => (
    /고정\s*값|갱신\s*값|기준\s*차이|원인\s*단정|단정|분리\s*해석|별도\s*(?:통계)?\s*축|내부\s*기준|직접\s*비교\s*(?:불가|어려)|유의|주의|fixed_dataset|api_cached|fallback|snapshot|reference_date|캐시/i.test(bullet)
  )));
  if (leakedInstruction) {
    return { ok: false, reason: 'insight.cards 불릿에 내부 판단 지침 노출' };
  }

  return { ok: true, cards: normalized };
}

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders
  });
}

export default async function llmHarness(request) {
  if (request.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: jsonHeaders });
  }

  const url = new URL(request.url);

  if (request.method === 'GET') {
    const env = globalThis.process?.env || {};
    const gatewayReadiness = getGatewayReadiness();
    const directReadiness = getDirectReadiness();

    return jsonResponse({
      ok: true,
      mode: env.LLM_PROVIDER || 'mock',
      type: url.searchParams.get('type') || 'model-recommendations',
      modelRegistryVersion: MODEL_REGISTRY_VERSION,
      contractVersion: CONTRACT_VERSION,
      providers: LLM_PROVIDERS,
      modelCatalog: LLM_MODEL_CATALOG,
      sectionContracts: SECTION_CONTRACTS,
      qualityGates: QUALITY_GATES,
      reportOutline: REPORT_OUTLINE,
      goldenTestDistricts: GOLDEN_TEST_DISTRICTS,
      modelRecommendations: MODEL_RECOMMENDATIONS,
      envReadiness: {
        openai: directReadiness.openai.ready,
        gemini: directReadiness.gemini.ready,
        anthropic: directReadiness.anthropic.ready,
        mistral: Boolean(env.MISTRAL_API_KEY),
        direct: directReadiness,
        gateway: gatewayReadiness
      },
      realGenerationModes: ['cache', 'mock', 'openai', 'gemini', 'anthropic', 'direct-openai', 'direct-gemini', 'direct-anthropic', 'netlify-ai-gateway']
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'GET 또는 POST만 지원합니다.' }, 405);
  }

  try {
    const bodyText = await request.text();
    const body = bodyText ? JSON.parse(bodyText) : {};
    const type = body.type || 'district_screen';
    const env = globalThis.process?.env || {};
    const requestedProvider = body.provider || body.llmProvider || env.LLM_PROVIDER || 'cache';
    const forceGenerate = Boolean(body.forceGenerate);
    const regenerateSections = normalizeRegenerateSections(body.regenerateSections);
    const regenerateInsightOnly = Boolean(body.regenerateInsightOnly);
    const qualityRetries = body.qualityRetries === 1 ? 1 : 0;

    if (type !== 'district_screen') {
      return jsonResponse({ ok: false, error: `지원하지 않는 type입니다: ${type}` }, 400);
    }

    const basePayload = buildHarnessPayload({
      districtData: body.districtData || {},
      cultureMetrics: body.cultureMetrics || {}
    });

    const districtData = body.districtData || {};
    const cultureMetrics = body.cultureMetrics || {};
    const guName = districtData.gu || cultureMetrics.gu || '선택 자치구';
    const cacheLookup = await fetchCachedDistrictInsight({
      guName,
      sourceSnapshotKey: basePayload.snapshotKey,
      harnessVersion: basePayload.harnessVersion,
      promptVersion: PROMPT_VERSION,
      modelRegistryVersion: MODEL_REGISTRY_VERSION
    });
    const sectionCacheLookup = await fetchCachedSectionInterpretations({
      guName,
      sourceSnapshotKey: basePayload.snapshotKey,
      harnessVersion: basePayload.harnessVersion,
      promptVersion: SECTION_PROMPT_VERSION,
      modelRegistryVersion: MODEL_REGISTRY_VERSION
    });

    if (cacheLookup.hit && !cacheLookup.staleSnapshot && !forceGenerate && regenerateSections.length === 0) {
      return jsonResponse(withSectionCacheStatus(cacheLookup.payload, {
        hit: sectionCacheLookup.hit,
        complete: sectionCacheLookup.complete,
        available: sectionCacheLookup.available,
        reason: sectionCacheLookup.reason,
        sectionKeys: sectionCacheLookup.sectionKeys || [],
        staleSectionKeys: sectionCacheLookup.staleSectionKeys || [],
        staleBySection: sectionCacheLookup.staleBySection || {},
        snapshotKeyBySection: sectionCacheLookup.snapshotKeyBySection || {},
        generatedAtBySection: sectionCacheLookup.generatedAtBySection || {},
        qualityBySection: sectionCacheLookup.qualityBySection || {}
      }));
    }

    if (requestedProvider === 'cache' && cacheLookup.staleSnapshot) {
      return jsonResponse(withSectionCacheStatus(cacheLookup.payload, { ...sectionCacheLookup, interpretations: undefined }));
    }

    if (requestedProvider === 'cache') {
      const payloadWithSections = applyCachedInterpretations(basePayload, sectionCacheLookup.interpretations);
      return jsonResponse(withSectionCacheStatus(withCacheStatus(payloadWithSections, {
        hit: false,
        available: cacheLookup.available,
        canGenerate: Boolean(cacheLookup.available),
        reason: cacheLookup.reason || 'cache_miss',
        error: cacheLookup.error || null
      }), {
        hit: sectionCacheLookup.hit,
        complete: sectionCacheLookup.complete,
        available: sectionCacheLookup.available,
        reason: sectionCacheLookup.reason,
        sectionKeys: sectionCacheLookup.sectionKeys || [],
        staleSectionKeys: sectionCacheLookup.staleSectionKeys || [],
        staleBySection: sectionCacheLookup.staleBySection || {},
        snapshotKeyBySection: sectionCacheLookup.snapshotKeyBySection || {},
        generatedAtBySection: sectionCacheLookup.generatedAtBySection || {},
        qualityBySection: sectionCacheLookup.qualityBySection || {},
        canGenerate: Boolean(sectionCacheLookup.available)
      }));
    }

    const shouldUseRealModel = [
      'netlify-ai-gateway',
      'openai',
      'gemini',
      'anthropic',
      'direct-openai',
      'direct-gemini',
      'direct-anthropic'
    ].includes(requestedProvider);
    if (!shouldUseRealModel) {
      return jsonResponse(withCacheStatus(basePayload, {
        hit: false,
        available: cacheLookup.available,
        canGenerate: Boolean(cacheLookup.available),
        reason: requestedProvider === 'mock' ? 'mock_result_not_cached' : cacheLookup.reason || 'cache_miss',
        error: cacheLookup.error || null
      }));
    }

    const recommendation = MODEL_RECOMMENDATIONS.districtInsight;
    const modelPick = pickProviderAndModel({
      requestedProvider,
      requestedModel: body.model,
      recommendation
    });

    try {
      const currentInterpretations = Object.fromEntries(Object.entries(sectionCacheLookup.interpretations || {}).filter(([key]) => !sectionCacheLookup.staleBySection?.[key]));
      const generationBasePayload = applyCachedInterpretations(basePayload, currentInterpretations);
      if (regenerateInsightOnly && (!sectionCacheLookup.complete || sectionCacheLookup.staleSectionKeys?.length)) {
        throw new Error('종합 카드만 재생성하려면 네 섹션 캐시가 모두 필요합니다.');
      }
      const generatedText = await generateDistrictScreenText({
        basePayload: generationBasePayload,
        route: modelPick.route,
        provider: modelPick.provider,
        model: modelPick.model,
        sectionKeys: regenerateInsightOnly
          ? []
          : regenerateSections.length > 0
            ? regenerateSections
            : SECTION_CACHE_KEYS,
        // Default stays at zero; one repair pass is allowed only for an explicit manual retry.
        maxQualityRetries: qualityRetries
      });
      const reportNarrativeModel = MODEL_RECOMMENDATIONS.districtReport.openai || 'gpt-5.6-terra';
      generatedText.reportNarrative = await generateDistrictReportNarrative({
        basePayload: generationBasePayload,
        interpretations: generatedText.interpretations,
        insight: generatedText.insight,
        route: modelPick.route,
        provider: 'openai',
        model: reportNarrativeModel
      });
      const generatedCardsValidation = validateGeneratedInsightCards(generatedText);
      if (!generatedCardsValidation.ok) {
        throw new Error(`AI 응답 카드 계약 위반: ${generatedCardsValidation.reason}`);
      }
      const insightQuality = assessInsightQuality(generatedText);

      const mergedPayload = mergeGeneratedHarnessPayload({
        basePayload,
        generatedText,
        districtData,
        cultureMetrics,
        aiMeta: {
          route: requestedProvider,
          billingRoute: modelPick.route === 'gateway' ? 'netlify-ai-gateway' : 'direct-provider-api',
          provider: modelPick.provider,
          model: modelPick.model,
          reportNarrativeProvider: 'openai',
          reportNarrativeModel,
          promptTemplate: {
            sections: SECTION_PROMPT_VERSION,
            insight: INSIGHT_PROMPT_VERSION,
            reportNarrative: REPORT_NARRATIVE_PROMPT_VERSION,
            cache: PROMPT_VERSION
          },
          insightQuality,
          directReadiness: getDirectReadiness(),
          gatewayReadiness: getGatewayReadiness()
        }
      });
      const canSaveDistrictInsight = regenerateInsightOnly || regenerateSections.length === 0 || SECTION_CACHE_KEYS.every(
        sectionKey => regenerateSections.includes(sectionKey) || Boolean(sectionCacheLookup.interpretations?.[sectionKey])
      );
      const saved = canSaveDistrictInsight
        ? await saveCachedDistrictInsight({
            payload: mergedPayload,
            districtData,
            cultureMetrics,
            promptVersion: PROMPT_VERSION,
            outputSchemaVersion: CONTRACT_VERSION,
            modelRegistryVersion: MODEL_REGISTRY_VERSION,
            aiMeta: mergedPayload.aiMeta,
            qualityStatus: insightQuality.passed ? 'passed' : 'needs_review',
            qualityErrors: insightQuality.warnings || []
          })
        : { saved: false, payload: mergedPayload };
      const sectionSaveKeys = regenerateInsightOnly
        ? []
        : regenerateSections.length > 0
          ? regenerateSections
          : SECTION_CACHE_KEYS;
      const savedSections = sectionSaveKeys.length > 0
        ? await saveCachedSectionInterpretations({
            payload: mergedPayload,
            districtData,
            cultureMetrics,
            promptVersion: SECTION_PROMPT_VERSION,
            outputSchemaVersion: CONTRACT_VERSION,
            modelRegistryVersion: MODEL_REGISTRY_VERSION,
            aiMeta: mergedPayload.aiMeta,
            qualityStatus: insightQuality.passed ? 'passed' : 'needs_review',
            qualityErrors: insightQuality.warnings || [],
            sectionKeys: sectionSaveKeys
          })
        : {
            saved: false,
            complete: sectionCacheLookup.complete,
            sectionKeys: sectionCacheLookup.sectionKeys || [],
            results: []
          };

      if (regenerateSections.length > 0) {
        const payloadWithCachedSections = applyCachedInterpretations(basePayload, sectionCacheLookup.interpretations);
        const selectedInterpretations = Object.fromEntries(
          regenerateSections
            .filter(sectionKey => mergedPayload.interpretations?.[sectionKey])
            .map(sectionKey => [sectionKey, mergedPayload.interpretations[sectionKey]])
        );
        const responsePayload = {
          ...payloadWithCachedSections,
          mode: 'llm',
          aiMeta: mergedPayload.aiMeta,
          generatedAt: mergedPayload.generatedAt,
          insight: mergedPayload.insight,
          interpretations: {
            ...(payloadWithCachedSections.interpretations || {}),
            ...selectedInterpretations
          }
        };
        return jsonResponse(withSectionCacheStatus(withCacheStatus(responsePayload, {
          hit: saved.saved || Boolean(cacheLookup.hit),
          available: cacheLookup.available,
          canGenerate: false,
          reason: saved.saved
            ? saved.payload?.cacheStatus?.reason || 'district_cache_saved'
            : cacheLookup.hit
              ? cacheLookup.payload?.cacheStatus?.reason || 'district_cache_reused'
              : 'district_cache_waiting_for_complete_sections',
          generatedAt: saved.payload?.cacheStatus?.generatedAt || cacheLookup.payload?.cacheStatus?.generatedAt,
          qualityStatus: saved.payload?.cacheStatus?.qualityStatus || cacheLookup.payload?.cacheStatus?.qualityStatus,
          provider: saved.payload?.cacheStatus?.provider || cacheLookup.payload?.cacheStatus?.provider,
          model: saved.payload?.cacheStatus?.model || cacheLookup.payload?.cacheStatus?.model
        }), buildSectionStatusAfterSave({
          previous: sectionCacheLookup,
          savedSections
        })));
      }

      return jsonResponse(withSectionCacheStatus(saved.payload, {
        hit: savedSections.saved || Boolean(sectionCacheLookup.hit),
        complete: savedSections.complete,
        available: true,
        reason: regenerateInsightOnly
          ? 'section_cache_reused'
          : savedSections.complete
            ? 'section_cache_saved'
            : 'section_cache_partial',
        sectionKeys: savedSections.sectionKeys,
        results: savedSections.results
      }));
    } catch (aiError) {
      const payloadWithSections = applyCachedInterpretations(basePayload, sectionCacheLookup.interpretations);
      return jsonResponse({
        ...withSectionCacheStatus(withCacheStatus(payloadWithSections, {
          hit: false,
          available: cacheLookup.available,
          canGenerate: Boolean(cacheLookup.available),
          reason: cacheLookup.reason || 'cache_miss',
          error: cacheLookup.error || null
        }), {
          hit: sectionCacheLookup.hit,
          complete: sectionCacheLookup.complete,
          available: sectionCacheLookup.available,
          reason: sectionCacheLookup.reason,
          sectionKeys: sectionCacheLookup.sectionKeys || [],
          staleSectionKeys: sectionCacheLookup.staleSectionKeys || [],
          staleBySection: sectionCacheLookup.staleBySection || {},
          snapshotKeyBySection: sectionCacheLookup.snapshotKeyBySection || {},
          generatedAtBySection: sectionCacheLookup.generatedAtBySection || {},
          qualityBySection: sectionCacheLookup.qualityBySection || {}
        }),
        mode: 'mock',
        fallbackReason: 'real_llm_generation_failed',
        aiMeta: {
          route: requestedProvider,
          billingRoute: modelPick.route === 'gateway' ? 'netlify-ai-gateway' : 'direct-provider-api',
          provider: modelPick.provider,
          model: modelPick.model,
          error: aiError.message,
          directReadiness: getDirectReadiness(),
          gatewayReadiness: getGatewayReadiness()
        }
      });
    }
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: 'LLM 하네스 mock 생성 실패',
      message: error.message
    }, 500);
  }
}

export const config = {
  path: '/api/llm-harness'
};
