const DEFAULT_TIMEOUT_MS = 45_000;

function getEnv(name) {
  return globalThis.Netlify?.env?.get?.(name) || globalThis.process?.env?.[name] || '';
}

function normalizeBaseUrl(value, fallback = '') {
  return String(value || fallback).replace(/\/+$/, '');
}

function parseJsonFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('모델 응답이 비어 있습니다.');

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error('모델 응답에서 JSON 객체를 찾지 못했습니다.');
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

function sectionOutputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'keyFindings', 'cautions'],
    properties: {
      summary: { type: 'string' },
      keyFindings: {
        type: 'array',
        minItems: 2,
        maxItems: 4,
        items: { type: 'string' }
      },
      cautions: {
        type: 'array',
        maxItems: 2,
        items: { type: 'string' }
      }
    }
  };
}

function insightCardSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['label', 'text', 'bullets'],
    properties: {
      label: {
        type: 'string',
        enum: ['핵심 판단', '주의 지점', '실행 방향']
      },
      text: {
        type: 'string',
        minLength: 40
      },
      bullets: {
        type: 'array',
        minItems: 2,
        maxItems: 4,
        items: { type: 'string' }
      }
    }
  };
}

function socialSafetyOutputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'keyFindings', 'cautions', 'segments'],
    properties: {
      summary: { type: 'string' },
      keyFindings: {
        type: 'array',
        minItems: 2,
        maxItems: 4,
        items: { type: 'string' }
      },
      cautions: {
        type: 'array',
        maxItems: 2,
        items: { type: 'string' }
      },
      segments: {
        type: 'object',
        additionalProperties: false,
        required: ['household', 'disability', 'foreign'],
        properties: {
          household: sectionOutputSchema(),
          disability: sectionOutputSchema(),
          foreign: sectionOutputSchema()
        }
      }
    }
  };
}

function districtScreenResponseFormat() {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'libscope_district_screen_output',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['interpretations', 'insight'],
        properties: {
          interpretations: {
            type: 'object',
            additionalProperties: false,
            required: ['population', 'culture', 'education', 'socialSafety'],
            properties: {
              population: sectionOutputSchema(),
              culture: sectionOutputSchema(),
              education: sectionOutputSchema(),
              socialSafety: socialSafetyOutputSchema()
            }
          },
          insight: {
            type: 'object',
            additionalProperties: false,
            required: ['cards', 'cautions'],
            properties: {
              cards: {
                type: 'array',
                minItems: 3,
                maxItems: 3,
                items: insightCardSchema()
              },
              cautions: {
                type: 'array',
                maxItems: 2,
                items: { type: 'string' }
              }
            }
          }
        }
      }
    }
  };
}

const DISTRICT_SECTION_KEYS = ['population', 'culture', 'education', 'socialSafety'];

function normalizeSectionKeys(sectionKeys = DISTRICT_SECTION_KEYS) {
  const requested = Array.isArray(sectionKeys) ? sectionKeys : DISTRICT_SECTION_KEYS;
  return DISTRICT_SECTION_KEYS.filter(sectionKey => requested.includes(sectionKey));
}

function districtSectionResponseFormat(sectionKeys = DISTRICT_SECTION_KEYS) {
  const normalizedSectionKeys = normalizeSectionKeys(sectionKeys);
  const properties = Object.fromEntries(normalizedSectionKeys.map(sectionKey => [
    sectionKey,
    sectionKey === 'socialSafety' ? socialSafetyOutputSchema() : sectionOutputSchema()
  ]));

  return {
    type: 'json_schema',
    json_schema: {
      name: 'libscope_district_section_output',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['interpretations'],
        properties: {
          interpretations: {
            type: 'object',
            additionalProperties: false,
            required: normalizedSectionKeys,
            properties
          }
        }
      }
    }
  };
}

function districtInsightResponseFormat() {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'libscope_district_insight_output',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['insight'],
        properties: {
          insight: {
            type: 'object',
            additionalProperties: false,
            required: ['cards', 'cautions'],
            properties: {
              cards: {
                type: 'array',
                minItems: 3,
                maxItems: 3,
                items: insightCardSchema()
              },
              cautions: {
                type: 'array',
                maxItems: 2,
                items: { type: 'string' }
              }
            }
          }
        }
      }
    }
  };
}

function districtReportNarrativeResponseFormat() {
  const narrativeProperties = Object.fromEntries([
    'executiveSummary',
    'population',
    'culture',
    'education',
    'socialSafety',
    'libraryImplications',
    'cautions'
  ].map(key => [key, { type: 'string' }]));

  return {
    type: 'json_schema',
    json_schema: {
      name: 'libscope_district_report_narrative_output',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['reportNarrative'],
        properties: {
          reportNarrative: {
            type: 'object',
            additionalProperties: false,
            required: Object.keys(narrativeProperties),
            properties: narrativeProperties
          }
        }
      }
    }
  };
}

function sentenceCount(text) {
  return String(text || '')
    .split(/[.!?。]|다\.|함\.|됨\.|필요\.|가능\./)
    .map(part => part.trim())
    .filter(Boolean).length;
}

function countInsightSignals(text) {
  const value = String(text || '');
  const signals = [
    /따라서|그러므로|이로 인해|이는|때문에|관점|가능성|필요|우선|연계|검토|시사|의미|판단|도달성|접근성|수요|공백|불균형|집중|분산|전환|보완/,
    /인구|고령|아동|생활인구|수급|가구|장애|외국인|문화|도서관|교육|학교|시설|공공기관/,
    /함|됨|필요|가능|요구|적절|유효|중요/
  ];
  return signals.reduce((score, pattern) => score + (pattern.test(value) ? 1 : 0), 0);
}

function countAxisSignals(text) {
  const value = String(text || '');
  const axisPatterns = [
    /주민등록|생활인구|인구구조|고령|아동|청소년|연령/,
    /수급|가구|장애|외국인|사회안전망|정보 도달성|접근성/,
    /문화|문화시설|생활문화|향유|무장애/,
    /교육|학교|초등|중등|고등|대학교/,
    /도서관|공공기관|협력|프로그램|서비스/
  ];
  return axisPatterns.reduce((score, pattern) => score + (pattern.test(value) ? 1 : 0), 0);
}

function hasScreenNumber(text) {
  return /\d[\d,.]*(?:\s|-)?(?:명|개|건|%|가구|개교|개관|세|p)\b/.test(String(text || ''));
}

function looksLikeEvidenceMeaningPair(text) {
  return /근거\s*[:：].+의미\s*[:：]|의미\s*[:：].+근거\s*[:：]|→|=>|\/\s*의미\s*[:：]/.test(String(text || ''));
}

function hasInternalInstructionLeak(text) {
  return /고정\s*값|갱신\s*값|기준\s*차이|원인\s*단정|단정|분리\s*해석|유의|주의|fixed_dataset|api_cached|fallback|snapshot|reference_date|time slot|outreach segment|mismatch|access gap|coordination burden|complementarity|캐시/i.test(String(text || ''));
}

function looksGenericOperationalAdvice(text) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  const genericPatterns = [
    /도서관 서비스 개선(?:이)? 필요/,
    /프로그램 확대(?:가)? 필요/,
    /지역 특성(?:을)? 고려/,
    /접근성 강화(?:가)? 필요/,
    /협력(?:을)? 강화/,
    /맞춤형 서비스(?:가)? 필요/,
    /이용자 요구(?:를)? 반영/,
    /지속적인 모니터링(?:이)? 필요/,
    /추가 검토(?:가)? 필요$/
  ];
  const hasSpecificAxis = countAxisSignals(value) >= 2;
  const hasSpecificCondition = /상위권|하위권|평균|격차|비대칭|불균형|최상위|생활권|무장애|학교급|시간대|동선|정보 도달|대면|언어|권역/.test(value);
  return genericPatterns.some(pattern => pattern.test(value)) && (!hasSpecificAxis || !hasSpecificCondition);
}

function hasOperationalBoundary(text) {
  return /시간대|안내\s*채널|채널|공간|협력기관|협력\s*기관|방문|홍보|대면|언어|동선|접수|신청|학교급|프로그램|역할|권역|생활권|무장애|이동|참여|지원\s*경로|도달\s*경로/.test(String(text || ''));
}

function hasPrescriptiveAction(text) {
  return /배치|재배치|분리|우선\s*배정|우선\s*편성|우선\s*연계|전환|편성|설계|운영|묶어\s*제공|나누어\s*제공|확대|축소|강화|신설|개편|집중|연계|상설화|찾아가는|다국어|대면|비대면|야간|방과후|주말|권역별|학교급별|대상별/.test(String(text || ''));
}

function findWeakInsightPatternWarnings(text, context = {}) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return [];

  const warnings = [];
  const index = context.index;
  const gate = context.gate || 'insight_pattern';
  const scope = context.scope || 'interpretation';
  const hard = Boolean(context.hard);
  const slot = context.slot || 'interpretation';
  const isCardBullet = slot === 'card_bullet';
  const hasBoundary = hasOperationalBoundary(value);
  const push = (message, hardOverride = hard) => warnings.push({
    gate,
    index,
    scope,
    hard: hardOverride,
    message
  });

  if (/(?:함께|묶어|같이)\s*(?:보이므로|보여|보면)|함께\s*놓고/.test(value)) {
    push('“함께/묶어 보이므로·보여·보면” 구조가 지표 나열 뒤 일반 결론으로 흐를 위험이 큼');
  }
  if (/(?:필요함|필요|검토 필요)(?:[.,\s]|$)/g.test(value) && (value.match(/필요함|검토 필요|필요/g) || []).length >= 2 && (!isCardBullet || !hasBoundary)) {
    push('필요/검토 필요 반복으로 운영 판단이 구체화되지 않음');
  }
  if (/(?:생활권|협력|접근성|프로그램|서비스|공간|안내).{0,16}(?:강화|확대|개선|필요|검토)/.test(value) && countAxisSignals(value) < 3 && (!isCardBullet || !hasBoundary)) {
    push('생활권/협력/접근성 계열 일반어가 자치구 조건 없이 결론으로 사용됨', false);
  }
  if (/(?:저밀도|하위권|작(?:고|은)|부족|약한|낮은).{0,24}(?:확대보다|확장보다|대형 확대보다|양보다)/.test(value)) {
    push('작은 규모/낮은 총량을 일반적 축소·확대 비교로 처리하고 있어 운영 판단 단위가 약함');
  }
  if (/(?:고령|아동|생활인구|수급|가구|장애|외국인|문화|교육|학교|도서관|공공기관).{0,12}(?:,|·|\/).{0,80}(?:,|·|\/).{0,80}(?:필요|검토|유효|가능성|의미)/.test(value) && (!isCardBullet || !hasBoundary)) {
    push('세 개 이상 지표명을 열거한 뒤 바로 결론을 붙이는 구조에 가까움', false);
  }
  if (/(?:확인|검토|점검|볼 필요|살펴야|봐야|기준|근거)/.test(value) && !hasPrescriptiveAction(value)) {
    push('분석 결과가 실행 처방으로 이어지지 않고 확인·검토 지침에서 멈춤');
  }

  return warnings;
}

function assessInsightQuality(generatedText = {}) {
  const warnings = [];
  const interpretationPackets = Object.values(generatedText.interpretations || {}).flatMap(packet => [
    packet,
    ...Object.values(packet?.segments || {})
  ]).filter(Boolean);
  const interpretationTexts = interpretationPackets.flatMap(packet => [
    packet?.summary,
    ...(Array.isArray(packet?.keyFindings) ? packet.keyFindings : [])
  ]).filter(Boolean);

  interpretationTexts.forEach((text, index) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return;
    if (countInsightSignals(trimmed) < 2) {
      warnings.push({ gate: 'insight_depth', index, scope: 'interpretation', message: '해석 신호가 약해 지표 나열에 가까움' });
    }
    if (/^\d|^[-•]?\s*.+\s+\d[\d,.]*[명개건%]/.test(trimmed) && sentenceCount(trimmed) <= 1) {
      warnings.push({ gate: 'insight_depth', index, scope: 'interpretation', message: '수치 재진술 중심 문장' });
    }
    if (trimmed.length > 180 && !looksLikeEvidenceMeaningPair(trimmed)) {
      warnings.push({ gate: 'readability', index, scope: 'interpretation', message: '화면용 해석문이 줄글에 가까움' });
    }
    if (looksGenericOperationalAdvice(trimmed)) {
      warnings.push({ gate: 'insight_depth', index, scope: 'interpretation', message: '자치구 고유 조건이 약한 범용 운영 조언' });
    }
    warnings.push(...findWeakInsightPatternWarnings(trimmed, {
      index,
      gate: 'interpretation_pattern',
      scope: 'interpretation',
      slot: 'interpretation'
    }));
  });

  const educationTexts = [
    generatedText.interpretations?.education?.summary,
    ...(Array.isArray(generatedText.interpretations?.education?.keyFindings) ? generatedText.interpretations.education.keyFindings : [])
  ].filter(Boolean).join(' ');
  if (educationTexts) {
    const hasEducationAxis = /교육|학교|초등|중등|고등|대학교/.test(educationTexts);
    const hasPopulationAxis = /인구|연령|아동|청소년|생활인구|주민등록|가족/.test(educationTexts);
    const hasCultureAxis = /문화|도서관|문화시설|문화행사|무장애|공간/.test(educationTexts);
    if (hasEducationAxis && (!hasPopulationAxis || !hasCultureAxis)) {
      warnings.push({
        gate: 'cross_section_context',
        index: 'education',
        scope: 'interpretation',
        message: '교육인프라 해석이 인구·문화/도서관 맥락을 충분히 함께 반영하지 않음'
      });
    }
  }

  const socialSafetyTexts = [
    generatedText.interpretations?.socialSafety?.summary,
    ...(Array.isArray(generatedText.interpretations?.socialSafety?.keyFindings) ? generatedText.interpretations.socialSafety.keyFindings : [])
  ].filter(Boolean).join(' ');
  if (socialSafetyTexts) {
    const hasSocialAxis = /사회안전망|수급|가구|장애|외국인|복지/.test(socialSafetyTexts);
    const hasPopulationAxis = /인구|연령|생활인구|주민등록|고령|아동|청소년/.test(socialSafetyTexts);
    const hasCultureAxis = /문화|도서관|문화시설|무장애|공간|접근성/.test(socialSafetyTexts);
    if (hasSocialAxis && (!hasPopulationAxis || !hasCultureAxis)) {
      warnings.push({
        gate: 'cross_section_context',
        index: 'socialSafety',
        scope: 'interpretation',
        message: '사회안전망 해석이 인구·문화/도서관 접근성 맥락을 충분히 함께 반영하지 않음'
      });
    }
  }

  const cards = Array.isArray(generatedText.insight?.cards) ? generatedText.insight.cards : [];
  cards.forEach((card, index) => {
    const text = String(card?.text || '').trim();
    if (!text) return;
    if (text.length < 40) {
      warnings.push({ gate: 'screen_card_contract', index, scope: 'screen_card', hard: true, message: '상단 인사이트 카드가 너무 짧아 판단 근거와 운영 함의가 부족함' });
    }
    if (hasScreenNumber(text)) {
      warnings.push({ gate: 'screen_card_contract', index, scope: 'screen_card', hard: true, message: '상단 인사이트 카드는 수치를 직접 나열하지 않음' });
    }
    if (countAxisSignals(text) < 2) {
      warnings.push({ gate: 'screen_card_contract', index, scope: 'screen_card', hard: true, message: '두 개 이상의 지표 축을 연결해야 함' });
    }
    if (!/(따라서|그러므로|때문에|시사함|의미|타당|적절|분리|재배치|우선순위|나눠|구조|배치|편성|설계|운영|전환|연계|제공)/.test(text)) {
      warnings.push({ gate: 'screen_card_contract', index, scope: 'screen_card', hard: true, message: '분석 결과 또는 실행 처방을 드러내는 판단어가 부족함' });
    }
    if (!hasPrescriptiveAction(text)) {
      warnings.push({ gate: 'screen_card_contract', index, scope: 'screen_card', hard: true, message: '상단 인사이트 카드가 실행 처방 없이 해석 지침에 머무름' });
    }
    if (/고령층,\s*1인가구,\s*장애,\s*외국인/.test(text)) {
      warnings.push({ gate: 'screen_card_contract', index, scope: 'screen_card', hard: true, message: '범용 지표 목록에 가까워 자치구 고유 조건이 부족함' });
    }
    if (hasInternalInstructionLeak(text)) {
      warnings.push({ gate: 'screen_card_contract', index, scope: 'screen_card', hard: true, message: '상단 인사이트 카드에 내부 판단 지침 또는 작성 스캐폴드가 노출됨' });
    }
    if (looksGenericOperationalAdvice(text)) {
      warnings.push({ gate: 'screen_card_contract', index, scope: 'screen_card', hard: true, message: '어느 자치구에도 쓸 수 있는 일반론에 가까움' });
    }
    if (/(?:확인|검토|점검|볼 필요|살펴야|봐야)/.test(text)) {
      warnings.push({ gate: 'screen_card_contract', index, scope: 'screen_card', hard: true, message: '상단 인사이트 카드가 실행 처방이 아니라 확인·검토 지침을 포함함' });
    }
    warnings.push(...findWeakInsightPatternWarnings(text, {
      index,
      gate: 'screen_card_pattern',
      scope: 'screen_card',
      hard: true,
      slot: 'card_text'
    }));
    const bullets = Array.isArray(card?.bullets) ? card.bullets.filter(Boolean) : [];
    if (bullets.length < 2) {
      warnings.push({ gate: 'screen_card_contract', index, scope: 'screen_card', hard: true, message: '상단 인사이트 카드에는 2개 이상의 핵심 불릿이 필요함' });
    }
    bullets.forEach((bullet, bulletIndex) => {
      const bulletText = String(bullet || '').trim();
      if (bulletText.length > 90) {
        warnings.push({ gate: 'screen_card_contract', index: `${index}-${bulletIndex}`, scope: 'screen_card', hard: false, message: '상단 인사이트 불릿이 너무 길어 화면 요약에 부적합함' });
      }
      if (hasScreenNumber(bulletText)) {
        warnings.push({ gate: 'screen_card_contract', index: `${index}-${bulletIndex}`, scope: 'screen_card', hard: true, message: '상단 인사이트 불릿은 수치를 직접 나열하지 않음' });
      }
      if (hasInternalInstructionLeak(bulletText)) {
        warnings.push({ gate: 'screen_card_contract', index: `${index}-${bulletIndex}`, scope: 'screen_card', hard: true, message: '상단 인사이트 불릿에 내부 판단 지침이 노출됨' });
      }
      if (looksGenericOperationalAdvice(bulletText)) {
        warnings.push({ gate: 'screen_card_contract', index: `${index}-${bulletIndex}`, scope: 'screen_card', hard: true, message: '상단 인사이트 불릿이 범용 운영 조언에 가까움' });
      }
      if (/(?:확인|검토|점검|볼 필요|살펴야|봐야)/.test(bulletText)) {
        warnings.push({ gate: 'screen_card_contract', index: `${index}-${bulletIndex}`, scope: 'screen_card', hard: true, message: '상단 인사이트 불릿이 실행 처방이 아니라 확인·검토 지침을 포함함' });
      }
      warnings.push(...findWeakInsightPatternWarnings(bulletText, {
        index: `${index}-${bulletIndex}`,
        gate: 'screen_card_pattern',
        scope: 'screen_card',
        hard: true,
        slot: 'card_bullet'
      }));
    });
  });

  const screenCardWarnings = warnings.filter(warning => warning.scope === 'screen_card');
  const screenCardHardWarnings = screenCardWarnings.filter(warning => warning.hard);
  const interpretationWarnings = warnings.filter(warning => warning.scope !== 'screen_card');

  return {
    passed: warnings.length === 0,
    screenCardPassed: screenCardHardWarnings.length === 0,
    screenCardWarningCount: screenCardWarnings.length,
    screenCardHardWarningCount: screenCardHardWarnings.length,
    interpretationWarningCount: interpretationWarnings.length,
    screenCardWarnings,
    screenCardHardWarnings,
    interpretationWarnings,
    warnings
  };
}

function getGatewayReadiness() {
  const openaiKey = getEnv('OPENAI_API_KEY') || getEnv('NETLIFY_AI_GATEWAY_KEY');
  const geminiKey = getEnv('GEMINI_API_KEY') || getEnv('NETLIFY_AI_GATEWAY_KEY');
  const anthropicKey = getEnv('ANTHROPIC_API_KEY') || getEnv('NETLIFY_AI_GATEWAY_KEY');

  return {
    openai: {
      key: Boolean(openaiKey),
      baseUrl: Boolean(getEnv('OPENAI_BASE_URL') || getEnv('NETLIFY_AI_GATEWAY_BASE_URL')),
      ready: Boolean(openaiKey)
    },
    gemini: {
      key: Boolean(geminiKey),
      baseUrl: Boolean(getEnv('GOOGLE_GEMINI_BASE_URL') || getEnv('NETLIFY_AI_GATEWAY_BASE_URL')),
      ready: Boolean(geminiKey)
    },
    anthropic: {
      key: Boolean(anthropicKey),
      baseUrl: Boolean(getEnv('ANTHROPIC_BASE_URL') || getEnv('NETLIFY_AI_GATEWAY_BASE_URL')),
      ready: Boolean(anthropicKey)
    }
  };
}

function getDirectReadiness() {
  return {
    openai: {
      key: Boolean(getEnv('DIRECT_OPENAI_API_KEY')),
      baseUrl: true,
      ready: Boolean(getEnv('DIRECT_OPENAI_API_KEY'))
    },
    gemini: {
      key: Boolean(getEnv('DIRECT_GEMINI_API_KEY')),
      baseUrl: true,
      ready: Boolean(getEnv('DIRECT_GEMINI_API_KEY'))
    },
    anthropic: {
      key: Boolean(getEnv('DIRECT_ANTHROPIC_API_KEY')),
      baseUrl: true,
      ready: Boolean(getEnv('DIRECT_ANTHROPIC_API_KEY'))
    }
  };
}

function pickProviderAndModel({ requestedProvider, requestedModel, recommendation = {} } = {}) {
  const providerEnv = getEnv('LLM_MODEL_PROVIDER');
  const normalizedProvider = String(requestedProvider || '').replace(/^direct-/, '');
  const route = requestedProvider === 'netlify-ai-gateway' ? 'gateway' : 'direct';
  const provider = ['openai', 'gemini', 'anthropic'].includes(normalizedProvider)
    ? normalizedProvider
    : ['openai', 'gemini', 'anthropic'].includes(providerEnv)
      ? providerEnv
      : recommendation.defaultProvider || 'openai';

  const modelByProvider = {
    openai: getEnv('OPENAI_MODEL_INSIGHT') || recommendation.openai || recommendation.defaultModel || 'gpt-5.6-luna',
    gemini: getEnv('GEMINI_MODEL_INSIGHT') || recommendation.gemini || recommendation.defaultModel || 'gemini-2.5-flash-lite',
    anthropic: getEnv('ANTHROPIC_MODEL_SHORT') || recommendation.anthropic || recommendation.defaultModel || 'claude-haiku-4-5'
  };

  return {
    route,
    provider,
    model: requestedModel || modelByProvider[provider]
  };
}

function buildDistrictScreenPrompt({ basePayload = {} } = {}) {
  return [
    buildDistrictSectionPrompt({ basePayload }),
    '',
    '--- DISTRICT INSIGHT PROMPT ---',
    buildDistrictInsightPrompt({ basePayload })
  ].join('\n');
}
const COMMON_DISTRICT_PROMPT_RULES = [
  '역할: 서울시 공공도서관 정책·서비스 판단을 돕는 분석관.',
  '문체: 존대 없이 짧은 불릿형 문장과 명사형 종결만 사용.',
  '문장 종결은 “필요”, “권고”, “우선”, “분리”, “재배치”, “편성”, “설계”, “운영”, “제공”, “연계”, “배정”처럼 판단·행동을 나타내는 명사형으로 통일.',
  '“~합니다”, “~됩니다”, “~해야 함”, “~할 수 있음”, “~으로 판단됨” 같은 서술형·장문 종결 금지.',
  '한 항목에는 하나의 판단만 작성하고 접속어로 두 판단을 이어 붙이지 않음.',
  '입력에 없는 숫자, 순위, 추세, 평균, 격차, 인과관계를 생성하지 않음.',
  'analysisSignals의 계산 결과와 evidenceMatrix의 근거를 우선 신뢰하며 모델이 새 계산을 만들지 않음.',
  '근거 선택 우선순위: crossMetricTensions → notableSignals → serviceHypotheses → recommendedQuestions. 단, 상위 항목이 비어 있으면 다음 항목을 사용.',
  'serviceHypotheses와 recommendedQuestions는 확정 사실이 아니라 운영데이터로 검증할 가설로만 다룸.',
  '장애, 외국인, 수급자 등 민감 지표를 지역 문제의 원인으로 단정하지 않음.',
  '일반적인 개선 필요로 끝내지 말고 대상, 시간대, 안내 채널, 공간 조건, 협력기관 역할, 프로그램 편성 중 입력이 뒷받침하는 실행 단위를 제시.',
  '같은 판단, 근거, 실행 동사를 여러 문장에 반복하지 않고 각 문장에 하나의 핵심 판단만 둠.',
  '출력은 지정된 JSON 객체 하나만 반환하며 Markdown 코드블록을 사용하지 않음.'
];

function buildPromptEvidenceMatrix(interpretations = {}) {
  return Object.fromEntries(Object.entries(interpretations).map(([key, packet]) => [key, {
    title: packet.title,
    summary: packet.summary,
    evidenceBullets: packet.keyFindings,
    cautions: packet.cautions,
    segments: packet.segments
      ? Object.fromEntries(Object.entries(packet.segments).map(([segmentKey, segment]) => [segmentKey, {
        title: segment.title,
        summary: segment.summary,
        evidenceBullets: segment.keyFindings,
        cautions: segment.cautions
      }]))
      : undefined
  }]));
}

function buildDistrictSectionPrompt({ basePayload = {}, sectionKeys = DISTRICT_SECTION_KEYS } = {}) {
  const normalizedSectionKeys = normalizeSectionKeys(sectionKeys);
  const evidenceMatrix = buildPromptEvidenceMatrix(basePayload.interpretations || {});
  const sectionContracts = Object.fromEntries(normalizedSectionKeys.map(sectionKey => [
    sectionKey,
    basePayload.sectionContracts?.[sectionKey]?.interpretationRules
  ]));
  const sectionShape = Object.fromEntries(normalizedSectionKeys.map(sectionKey => [
    sectionKey,
    sectionKey === 'socialSafety'
      ? {
          summary: 'string',
          keyFindings: ['string'],
          cautions: ['string'],
          segments: {
            household: { summary: 'string', keyFindings: ['string'], cautions: ['string'] },
            disability: { summary: 'string', keyFindings: ['string'], cautions: ['string'] },
            foreign: { summary: 'string', keyFindings: ['string'], cautions: ['string'] }
          }
        }
      : { summary: 'string', keyFindings: ['string'], cautions: ['string'] }
  ]));

  return [
    'LIBscope 자치구 지표의 선택 섹션 해석문을 생성한다.',
    ...COMMON_DISTRICT_PROMPT_RULES,
    `생성 대상 섹션: ${normalizedSectionKeys.join(', ')}`,
    '',
    '섹션 출력 규칙:',
    '- 각 summary는 짧은 문장 2~3개로 구성하고 전체 정보량은 유지.',
    '- summary의 각 문장은 30~60자이며 지표 관계 또는 운영 판단 하나만 포함.',
    '- summary 문장마다 마침표로 분리하고 각각 명사형으로 종결.',
    '- summary에는 대괄호를 사용하지 않고 문장 끝은 마침표 하나로 정리.',
    '- 각 keyFindings는 2~3개이고 “근거: ... / 의미: ...” 구조를 정확히 사용.',
    '- keyFindings의 근거와 의미는 각각 15~55자. 의미는 반드시 명사형 실행어로 종결.',
    '- 근거에는 evidenceMatrix 또는 analysisSignals에 실제로 있는 수치·단위·비교 조건을 보존하고, 서로 다른 근거를 선택.',
    '- 의미에는 근거와 직접 연결되는 대상·시간대·채널·공간·협력 역할 중 하나와 구체적 실행 동사를 포함.',
    '- summary와 keyFindings 사이에 같은 사실이나 처방을 표현만 바꿔 반복하지 않음.',
    '- cautions는 1~2개이며 기준시점, 데이터 계보, 운영데이터 부재처럼 해석 범위를 바꾸는 사항만 작성.',
    '- population은 주민등록인구와 생활인구의 기준 차이를 구분.',
    '- culture는 문화역량·향유 지표와 문화시설·공공도서관·진행 중 및 예정 행사를 함께 근거로 사용해 자치구 문화 접근성·참여·협력 자원을 통합 해석.',
    '- culture에서 인구 10만 명당 값을 언급할 때는 summary와 keyFindings 모두 “인구 10만 명당” 조건을 생략하지 않음.',
    '- culture keyFindings 3개는 ① 문화역량·접근성 수치 ② 실제 문화시설·공공도서관·행사 ③ 2024 서울시 문화향유 참고값을 각각 반드시 포함.',
    '- culture summary는 ① 접근성 판단 ② 시설·행사 활용 ③ 향유·참여 연결을 각각 담은 정확히 3개의 짧은 문장으로 작성.',
    '- culture의 의미에는 같은 항목 근거에 없는 학교·기관·대상을 새로 추가하지 않음.',
    '- education은 학교 조건과 population, culture 근거를 연결해 시간대·홍보·협력 역할을 처방.',
    '- socialSafety는 household, disability, foreign을 먼저 분리하고 population, culture 근거와 연결해 채널·공간·대면·언어 지원을 처방.',
    '- “확인·검토·점검 필요”, “접근성 강화 필요”, “맞춤형 서비스 필요” 같은 일반론 금지.',
    '- 고정값·갱신값·snapshot 같은 내부 통제 용어는 cautions 밖에 노출하지 않음.',
    '- 반환 전 각 의미 문장이 근거에서 바로 도출되는지, 실행 주체가 도서관인지, 네 섹션의 처방이 서로 중복되지 않는지 자체 점검.',
    '',
    '반환 스키마:',
    JSON.stringify({ interpretations: sectionShape }),
    '',
    '입력:',
    JSON.stringify({
      gu: basePayload.insight?.title,
      snapshotKey: basePayload.snapshotKey,
      outputStyle: basePayload.outputStyle,
      analysisSignalVersion: basePayload.analysisSignalVersion,
      analysisSignals: basePayload.analysisSignals,
      sectionContracts,
      evidenceMatrix
    })
  ].join('\n');
}

function buildDistrictInsightPrompt({ basePayload = {}, interpretations = basePayload.interpretations || {} } = {}) {
  return [
    'LIBscope 자치구 화면 상단에 노출할 종합 인사이트 카드 3개를 생성한다.',
    ...COMMON_DISTRICT_PROMPT_RULES,
    '대상: 자치구 상세 보고서를 열기 전에 세 문장만 읽는 도서관 정책 담당자.',
    '',
    '카드 출력 규칙:',
    '- cards는 정확히 “핵심 판단”, “주의 지점”, “실행 방향” 순서의 3개.',
    '- 핵심 판단: crossMetricTensions 또는 가장 강한 notableSignals를 사용해 이 자치구만의 우선 판단축을 제시.',
    '- 주의 지점: 핵심 판단과 다른 근거로 서비스 도달 공백, 자원 집중, 협력 조정 부담 중 하나를 구체화. 데이터 품질 경고문으로 대체하지 않음.',
    '- 실행 방향: 앞선 두 판단을 종합하되 대상 1개 이상과 시간대·채널·공간·협력기관 중 실행 경계 1개 이상을 명시하고 우선순위를 제시.',
    '- 각 text는 40~85자의 불릿형 1문장. 지표 관계 1개와 우선 판단 1개만 포함하고 명사형으로 종결.',
    '- 각 bullets는 2~3개, 항목당 18~55자. text를 요약 반복하지 말고 실행 대상·조건·방법 중 하나만 보충.',
    '- bullets는 실행 단위로 시작하고 분리, 재배치, 편성, 설계, 운영, 제공, 연계, 우선 배정 중 문맥에 맞는 명사형 실행어로 종결.',
    '- 쉼표는 항목당 1개 이하, “~하고”, “~하며”, “~이므로”, “~인 반면”을 사용한 복문 금지.',
    '- “우선 선점”, “우선 우선”, “분리 분리”처럼 의미가 겹치는 명사 연속 사용 금지.',
    '- 각 카드는 서로 다른 지표 조합을 사용하고 최소 2개 지표 축을 연결.',
    '- 각 text에는 인구·연령·생활인구, 복지·가구·장애·외국인, 문화·시설·무장애, 교육·학교, 도서관·협력 중 서로 다른 범주의 명사를 최소 2개 직접 포함.',
    '- text와 bullets에 숫자·단위·퍼센트·순위를 직접 표시하지 않음.',
    '- text와 bullets에 “확인, 검토, 점검, 볼 필요, 주의, 유의, 고정값, 갱신값, 기준 차이, 원인 단정, 캐시, snapshot”을 쓰지 않음.',
    '- “주의 지점”은 label에만 사용하고 해당 카드의 text와 bullets에는 “주의”라는 단어를 반복하지 않음.',
    '- 금지어 대신 분리, 재배치, 편성, 설계, 운영, 제공, 연계, 우선 배정을 사용.',
    '- “함께 보면”, 지표 3개 이상의 단순 열거, 어느 자치구에도 적용되는 범용 조언을 금지.',
    '- 내부 데이터 품질 지침은 cautions에만 작성하고 cards 또는 bullets에 노출하지 않음.',
    '- 입력된 섹션 해석의 근거 범위를 벗어나지 않으며 문장을 그대로 복사하지 않음.',
    '- cautions는 1~2개. 카드 판단의 적용 범위를 실제로 제한하는 기준시점·데이터 계보·운영데이터 부재만 기록.',
    '- JSON 반환 전 카드별 근거 조합·처방·동사가 서로 다른지, 각 카드가 지표 범주 2개 이상과 실행 동사 1개 이상을 포함하는지, 금지어와 근거 없는 사실이 없는지 자체 점검.',
    '',
    '반환 스키마:',
    JSON.stringify({
      insight: {
        cards: [
          { label: '핵심 판단', text: 'string', bullets: ['string'] },
          { label: '주의 지점', text: 'string', bullets: ['string'] },
          { label: '실행 방향', text: 'string', bullets: ['string'] }
        ],
        cautions: ['string']
      }
    }),
    '',
    '입력:',
    JSON.stringify({
      gu: basePayload.insight?.title,
      snapshotKey: basePayload.snapshotKey,
      analysisSignals: basePayload.analysisSignals,
      interpretations: buildPromptEvidenceMatrix(interpretations)
    })
  ].join('\n');
}

function buildDistrictReportNarrativePrompt({ basePayload = {}, interpretations = {}, insight = {} } = {}) {
  return [
    'LIBscope 자치구 웹 보고서의 각 장에 표시할 “핵심 해석” 본문만 생성한다.',
    ...COMMON_DISTRICT_PROMPT_RULES,
    '오른쪽의 근거와 시사점, 카드 불릿, 원자료는 수정하거나 새로 생성하지 않는다.',
    '',
    '핵심 해석 출력 규칙:',
    '- 목적은 분석 과정이나 실행 방법의 설명이 아니라 해당 자치구가 주제별로 가진 두드러진 특성의 요약.',
    '- “무엇을 분석함”, “어떻게 살펴야 함”, “추가 확인 필요” 같은 분석 절차·방법론·작업 내역 서술 금지.',
    '- 대상·시간대·채널을 어떻게 운영할지 제안하기보다 구성의 집중, 상대적 강약, 접근 공백, 자원 간 연결성처럼 입력에서 드러나는 특이점을 우선.',
    '- 비교 기준이 입력에 있을 때만 평균·자치구 기준과의 차이를 사용하고 입력에 없는 순위나 우열은 생성하지 않음.',
    '- 입력된 섹션 해석과 종합 인사이트를 종합하되 입력 범위를 벗어난 사실·수치·인과관계를 추가하지 않음.',
    '- 각 항목은 짧은 2~4문장으로 구성하고 첫 문장에 가장 두드러진 특성을 배치.',
    '- 각 문장은 25~65자 내외로 작성하고 마침표로 분리.',
    '- 수치 나열보다 지표 사이의 대비·집중·보완 관계와 지역적 특징이 드러나는 해석을 우선.',
    '- executiveSummary는 인구·문화·교육·사회안전망을 관통하는 자치구의 대표 특성 2~3개를 3~4문장으로 통합.',
    '- population은 연령·주민등록인구·생활인구 구성에서 특히 두드러지는 분포와 차이를 설명.',
    '- culture는 문화향유 수준, 시설·도서관 접근성, 행사 자원의 결합에서 드러나는 강점과 공백을 설명.',
    '- education은 학교급 구성과 공간 분포, 도서관 자원과의 인접·연결 특성을 설명.',
    '- socialSafety는 가구·장애·외국인 구성 중 집중된 유형과 접근 조건의 차이를 설명하되 대상자를 문제 원인으로 단정하지 않음.',
    '- libraryImplications는 앞선 특이점이 도서관 서비스에 갖는 의미만 요약하고 구체적 수행 절차는 작성하지 않음.',
    '- cautions는 기준시점·자료 계보·운영데이터 부재처럼 해석 범위를 제한하는 내용만 작성.',
    '- 단독 근거 아님, 원인 단정 금지, 개인 수요 추론 금지, 기준 차이, 정책 우열 금지 같은 안전·방법론 문장은 해당 주제 본문에 쓰지 않고 cautions에만 작성.',
    '- socialSafety 본문에는 안전 규칙을 설명하지 말고 실제 입력에서 드러나는 가구·장애·외국인 구성과 접근 조건의 특이점만 작성.',
    '- “확인 필요”, “검토 필요”, “강화 필요” 같은 일반론과 “분석했다”, “살펴봤다” 같은 작업 보고형 표현 금지.',
    '- 내부 생성·캐시·프롬프트 용어 금지.',
    '- 반환값은 reportNarrative 객체 하나를 포함한 JSON 객체만 사용.',
    '',
    '반환 스키마:',
    JSON.stringify({
      reportNarrative: {
        executiveSummary: 'string',
        population: 'string',
        culture: 'string',
        education: 'string',
        socialSafety: 'string',
        libraryImplications: 'string',
        cautions: 'string'
      }
    }),
    '',
    '입력:',
    JSON.stringify({
      gu: basePayload.insight?.title,
      snapshotKey: basePayload.snapshotKey,
      analysisSignals: basePayload.analysisSignals,
      interpretations: buildPromptEvidenceMatrix(interpretations),
      insight
    })
  ].join('\n');
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAiJson({ model, prompt, route = 'direct', responseFormat = districtScreenResponseFormat() }) {
  const useGateway = route === 'gateway';
  const apiKey = useGateway
    ? getEnv('OPENAI_API_KEY') || getEnv('NETLIFY_AI_GATEWAY_KEY')
    : getEnv('DIRECT_OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error(useGateway
      ? 'Netlify AI Gateway용 OPENAI_API_KEY 또는 NETLIFY_AI_GATEWAY_KEY가 없습니다.'
      : '직접 OpenAI 호출용 DIRECT_OPENAI_API_KEY가 없습니다.');
  }

  const baseUrl = useGateway
    ? normalizeBaseUrl(getEnv('OPENAI_BASE_URL'), 'https://api.openai.com/v1')
    : normalizeBaseUrl(getEnv('DIRECT_OPENAI_BASE_URL'), 'https://api.openai.com/v1');
  const requestBody = {
    model,
    reasoning_effort: getEnv('OPENAI_REASONING_EFFORT_INSIGHT') || 'none',
    messages: [
      { role: 'system', content: 'You return only valid JSON for a Korean public-sector analytics dashboard.' },
      { role: 'user', content: prompt }
    ],
    response_format: responseFormat
  };

  let response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  let payload = await response.json().catch(() => ({}));
  if (!response.ok && response.status === 400 && /response_format|json_schema/i.test(payload.error?.message || '')) {
    response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...requestBody,
        response_format: { type: 'json_object' }
      })
    });
    payload = await response.json().catch(() => ({}));
  }

  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI 호출 실패 ${response.status}`);
  }
  return parseJsonFromText(payload.choices?.[0]?.message?.content);
}

async function callGeminiJson({ model, prompt, route = 'direct' }) {
  const useGateway = route === 'gateway';
  const apiKey = useGateway
    ? getEnv('GEMINI_API_KEY') || getEnv('NETLIFY_AI_GATEWAY_KEY')
    : getEnv('DIRECT_GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error(useGateway
      ? 'Netlify AI Gateway용 GEMINI_API_KEY 또는 NETLIFY_AI_GATEWAY_KEY가 없습니다.'
      : '직접 Gemini 호출용 DIRECT_GEMINI_API_KEY가 없습니다.');
  }

  const baseUrl = useGateway
    ? normalizeBaseUrl(getEnv('GOOGLE_GEMINI_BASE_URL'), 'https://generativelanguage.googleapis.com')
    : normalizeBaseUrl(getEnv('DIRECT_GOOGLE_GEMINI_BASE_URL'), 'https://generativelanguage.googleapis.com');
  const response = await fetchWithTimeout(`${baseUrl}/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || `Gemini 호출 실패 ${response.status}`);
  }
  const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('\n');
  return parseJsonFromText(text);
}

async function callAnthropicJson({ model, prompt, route = 'direct' }) {
  const useGateway = route === 'gateway';
  const apiKey = useGateway
    ? getEnv('ANTHROPIC_API_KEY') || getEnv('NETLIFY_AI_GATEWAY_KEY')
    : getEnv('DIRECT_ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error(useGateway
      ? 'Netlify AI Gateway용 ANTHROPIC_API_KEY 또는 NETLIFY_AI_GATEWAY_KEY가 없습니다.'
      : '직접 Anthropic 호출용 DIRECT_ANTHROPIC_API_KEY가 없습니다.');
  }

  const baseUrl = useGateway
    ? normalizeBaseUrl(getEnv('ANTHROPIC_BASE_URL'), 'https://api.anthropic.com')
    : normalizeBaseUrl(getEnv('DIRECT_ANTHROPIC_BASE_URL'), 'https://api.anthropic.com');
  const response = await fetchWithTimeout(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1800,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || `Anthropic 호출 실패 ${response.status}`);
  }
  const text = payload.content?.map(part => part.text || '').join('\n');
  return parseJsonFromText(text);
}

async function callProviderJson({ route, provider, model, prompt, responseFormat }) {
  if (provider === 'gemini') return callGeminiJson({ model, prompt, route });
  if (provider === 'anthropic') return callAnthropicJson({ model, prompt, route });
  return callOpenAiJson({ model, prompt, route, responseFormat });
}

function shouldRetryForQuality(quality = {}) {
  if (quality.screenCardPassed) return false;
  return (quality.screenCardHardWarnings || []).length > 0;
}

function buildScreenCardRepairPrompt({ prompt, generatedText, quality }) {
  const warnings = (quality.screenCardHardWarnings || [])
    .slice(0, 12)
    .map(warning => `- ${warning.gate}/${warning.index}: ${warning.message}`)
    .join('\n');

  return [
    prompt,
    '',
    '--- SCREEN CARD REPAIR PASS ---',
    'The previous output failed deterministic LIBscope screen-card quality gates.',
    'Repair only insight.cards and insight.cautions. Preserve the same JSON schema, but do not rewrite interpretations conceptually.',
    'The application will use only the repaired insight object from your response.',
    '',
    'Hard requirements for this repair:',
    '- insight.cards and insight.cards bullets must not contain “함께 보이므로”, “함께 보여”, “함께 보면”, “묶어 보면”, or “함께 놓고”.',
    '- Do not ban every use of “함께”; only avoid weak list-then-need viewing phrases in insight.cards and bullets.',
    '- Do not list three or more metric names before the implication.',
    '- Each insight card must use this logic: 지표 관계 -> 분석 결과 -> 도서관 운영 처방.',
    '- 지표 관계는 불일치, 집중, 보완, 접근 공백, 조정 부담 중 하나를 자연어로 풀어 쓴다. 이 단어를 표제처럼 노출하지 말고 문장 안에 녹인다.',
    '- 도서관 운영 판단 단위는 시간대, 안내 채널, 공간, 협력기관, 방문·홍보 대상 중 하나로 구체화한다.',
    '- insight.cards and bullets must not use 확인, 검토, 점검, 볼 필요, 살펴야, 봐야.',
    '- insight.cards and bullets must not use 단정, 주의, 유의, 고정값, 갱신값, 기준 차이, 캐시, or snapshot. Do not explain internal interpretation policy to users.',
    '- “단정하지 않음”, “확인 후”, “확인하고”, “검토 후”처럼 금지어를 부정형이나 절차형으로 바꾸어 쓰는 것도 금지.',
    '- 반환 직전 JSON 문자열에서 확인, 검토, 점검, 단정, 주의, 유의, 캐시, snapshot을 검색하고 하나라도 있으면 해당 문장을 실행 처방 문장으로 다시 작성.',
    '- Avoid repeating 필요함 or 검토 필요; use concrete Korean decision verbs such as 분리, 재배치, 편성, 설계, 운영, 제공, 연계, 우선 배정.',
    '- Do not output English scaffold words such as mismatch, concentration, complementarity, access gap, coordination burden, time slot, partner, or outreach segment.',
    '- A strong card text has two compact sentences: first sentence names the local relation; second sentence names the library decision unit and what must be checked before action.',
    '- A strong bullet starts with the decision unit, not a metric list. Example shapes: “시간대별 안내 채널 분리”, “협력기관별 역할 범위 배정”, “방문 대상별 도달 경로 재배치”.',
    '- For compact or low-count districts, convert low total/count signals into a narrower operating unit. Do not write “대형 확대보다”, “양보다”, or “확장보다”.',
    '- For compact or low-count districts, every card must name one narrow action boundary: which channel, which time band, which partner role, which outreach target, or which space condition is being narrowed.',
    '- Return the same JSON schema only.',
    '',
    'Failed gate summary:',
    warnings || '- no structured warning',
    '',
    'Previous insight object to repair:',
    JSON.stringify(generatedText?.insight || {}, null, 2)
  ].join('\n');
}

async function generateDistrictScreenText({
  basePayload,
  route = 'direct',
  provider,
  model,
  promptOverride,
  sectionPromptOverride,
  insightPromptOverride,
  sectionKeys = DISTRICT_SECTION_KEYS,
  maxQualityRetries = Number.parseInt(getEnv('LLM_QUALITY_RETRY_COUNT') || '1', 10)
}) {
  const normalizedSectionKeys = normalizeSectionKeys(sectionKeys);
  let generatedInterpretations = {};

  if (normalizedSectionKeys.length > 0) {
    const sectionPrompt = sectionPromptOverride || buildDistrictSectionPrompt({
      basePayload,
      sectionKeys: normalizedSectionKeys
    });
    const sectionOutput = await callProviderJson({
      route,
      provider,
      model,
      prompt: sectionPrompt,
      responseFormat: districtSectionResponseFormat(normalizedSectionKeys)
    });
    generatedInterpretations = sectionOutput.interpretations || {};
  }

  const interpretations = {
    ...(basePayload.interpretations || {}),
    ...generatedInterpretations
  };
  const insightPrompt = insightPromptOverride || promptOverride || buildDistrictInsightPrompt({
    basePayload,
    interpretations
  });
  const insightOutput = await callProviderJson({
    route,
    provider,
    model,
    prompt: insightPrompt,
    responseFormat: districtInsightResponseFormat()
  });
  let output = {
    interpretations,
    insight: insightOutput.insight
  };
  let quality = assessInsightQuality(output);

  const retryCount = Number.isFinite(maxQualityRetries) ? Math.max(0, maxQualityRetries) : 0;
  for (let attempt = 0; attempt < retryCount && shouldRetryForQuality(quality); attempt += 1) {
    const previousOutput = output;
    const previousQuality = quality;
    const repairedOutput = await callProviderJson({
      route,
      provider,
      model,
      prompt: buildScreenCardRepairPrompt({ prompt: insightPrompt, generatedText: previousOutput, quality: previousQuality }),
      responseFormat: districtInsightResponseFormat()
    });
    const candidateOutput = {
      ...previousOutput,
      insight: repairedOutput.insight || output.insight
    };
    const candidateQuality = assessInsightQuality(candidateOutput);
    if (candidateQuality.screenCardHardWarningCount < previousQuality.screenCardHardWarningCount) {
      output = candidateOutput;
      quality = candidateQuality;
    } else {
      break;
    }
  }

  return output;
}

async function generateDistrictReportNarrative({
  basePayload,
  interpretations,
  insight,
  route = 'direct',
  provider = 'openai',
  model = 'gpt-5.6-terra'
}) {
  const output = await callProviderJson({
    route,
    provider,
    model,
    prompt: buildDistrictReportNarrativePrompt({ basePayload, interpretations, insight }),
    responseFormat: districtReportNarrativeResponseFormat()
  });
  return moveReportMethodCautions(output.reportNarrative || {});
}

function moveReportMethodCautions(reportNarrative = {}) {
  const narrativeKeys = [
    'executiveSummary',
    'population',
    'culture',
    'education',
    'socialSafety',
    'libraryImplications'
  ];
  const cautionPattern = /단독 근거|원인.{0,8}단정|단정.{0,8}(금지|않)|개인.{0,8}(수요|추론)|추론.{0,8}(금지|않)|기준(?:연도|월|일| 차이)|산정 (?:목적|기준)|자료 계보|해석 범위|정책 우열|내부 (?:생성|캐시|프롬프트)/;
  const movedCautions = [];
  const sanitized = { ...reportNarrative };

  narrativeKeys.forEach((key) => {
    const sentences = String(reportNarrative[key] || '')
      .trim()
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean);
    const kept = sentences.filter((sentence) => {
      if (!cautionPattern.test(sentence)) return true;
      movedCautions.push(sentence);
      return false;
    });
    sanitized[key] = kept.join(' ');
  });

  sanitized.cautions = [
    String(reportNarrative.cautions || '').trim(),
    ...movedCautions
  ].filter(Boolean).join(' ');
  return sanitized;
}

module.exports = {
  getEnv,
  getGatewayReadiness,
  getDirectReadiness,
  assessInsightQuality,
  findWeakInsightPatternWarnings,
  buildScreenCardRepairPrompt,
  buildDistrictScreenPrompt,
  buildDistrictSectionPrompt,
  buildDistrictInsightPrompt,
  buildDistrictReportNarrativePrompt,
  moveReportMethodCautions,
  pickProviderAndModel,
  generateDistrictScreenText,
  generateDistrictReportNarrative
};
