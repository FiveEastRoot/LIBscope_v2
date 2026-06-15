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
        required: ['interpretations', 'insight', 'reportNarrative'],
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
          },
          reportNarrative: {
            type: 'object',
            additionalProperties: false,
            required: [
              'executiveSummary',
              'population',
              'culture',
              'education',
              'socialSafety',
              'libraryImplications',
              'cautions'
            ],
            properties: {
              executiveSummary: { type: 'string', minLength: 180 },
              population: { type: 'string', minLength: 160 },
              culture: { type: 'string', minLength: 160 },
              education: { type: 'string', minLength: 160 },
              socialSafety: { type: 'string', minLength: 160 },
              libraryImplications: { type: 'string', minLength: 180 },
              cautions: { type: 'string', minLength: 120 }
            }
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
  const push = (message) => warnings.push({
    gate,
    index,
    scope,
    hard,
    message
  });

  if (/(?:함께|묶어|같이)\s*(?:보이므로|보여|보면)|함께\s*놓고/.test(value)) {
    push('“함께/묶어 보이므로·보여·보면” 구조가 지표 나열 뒤 일반 결론으로 흐를 위험이 큼');
  }
  if (/(?:필요함|필요|검토 필요)(?:[.,\s]|$)/g.test(value) && (value.match(/필요함|검토 필요|필요/g) || []).length >= 2 && (!isCardBullet || !hasBoundary)) {
    push('필요/검토 필요 반복으로 운영 판단이 구체화되지 않음');
  }
  if (/(?:생활권|협력|접근성|프로그램|서비스|공간|안내).{0,16}(?:강화|확대|개선|필요|검토)/.test(value) && countAxisSignals(value) < 3 && (!isCardBullet || !hasBoundary)) {
    push('생활권/협력/접근성 계열 일반어가 자치구 조건 없이 결론으로 사용됨');
  }
  if (/(?:저밀도|하위권|작(?:고|은)|부족|약한|낮은).{0,24}(?:확대보다|확장보다|대형 확대보다|양보다)/.test(value)) {
    push('작은 규모/낮은 총량을 일반적 축소·확대 비교로 처리하고 있어 운영 판단 단위가 약함');
  }
  if (/(?:고령|아동|생활인구|수급|가구|장애|외국인|문화|교육|학교|도서관|공공기관).{0,12}(?:,|·|\/).{0,80}(?:,|·|\/).{0,80}(?:필요|검토|유효|가능성|의미)/.test(value) && (!isCardBullet || !hasBoundary)) {
    push('세 개 이상 지표명을 열거한 뒤 바로 결론을 붙이는 구조에 가까움');
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
    openai: getEnv('OPENAI_MODEL_INSIGHT') || recommendation.openai || recommendation.defaultModel || 'gpt-5.4-mini',
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
  const evidenceMatrix = Object.fromEntries(
    Object.entries(basePayload.interpretations || {}).map(([key, packet]) => [key, {
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
    }])
  );
  const compactInput = {
    gu: basePayload.insight?.title,
    snapshotKey: basePayload.snapshotKey,
    outputStyle: basePayload.outputStyle,
    analysisSignalVersion: basePayload.analysisSignalVersion,
    analysisSignals: basePayload.analysisSignals,
    sectionContracts: {
      districtInsight: basePayload.sectionContracts?.districtInsight?.interpretationRules,
      population: basePayload.sectionContracts?.population?.interpretationRules,
      culture: basePayload.sectionContracts?.culture?.interpretationRules,
      education: basePayload.sectionContracts?.education?.interpretationRules,
      socialSafety: basePayload.sectionContracts?.socialSafety?.interpretationRules
    },
    evidenceMatrix,
    screenInsightContract: {
      labels: ['핵심 판단', '주의 지점', '실행 방향'],
      audience: '대시보드 첫 화면에서 3문장만 읽는 도서관 정책 담당자',
      noRawNumbers: true,
      requiredAxisConnections: 2,
      purpose: '자치구 보고서를 열기 전에 판단 흐름을 잡는 문장'
    }
  };

  return [
    'LIBscope 자치구 지표 해석 하네스의 인사이트 문구를 생성한다.',
    '역할: 지역 도서관 정책·서비스 판단을 돕는 분석관. 단순 통계 해설자가 아님.',
    '목표: 화면 노출용 섹션별 해석문과 자치구 종합 인사이트 3개 카드, 보고서 본문 초안 생성.',
    '문체: 존대 금지, 보고서형 명사형 어미 우선.',
    '안전: 입력 수치에 없는 숫자 생성 금지. 민감 지표는 원인 단정 금지. 접근성, 정보 도달성, 실행 처방 중심.',
    '인사이트 정의: 최소 3개 지표축을 연결해 “이 데이터 조합은 무엇을 의미하는가”, “그래서 도서관/지역사회가 무엇을 해야 하는가”를 드러내는 판단문.',
    '심화 기준: 자치구 고유 조건을 최소 2개 이상 결합해 “서비스 설계 단위가 어떻게 달라지는가”를 설명한다. 어느 자치구에도 붙일 수 있는 조언은 실패로 본다.',
    '화면 상단 인사이트 3개 카드는 숫자 요약이 아니라 판단 근거와 운영 함의를 분리한 전문적 분석 문장이다.',
    '섹션별 AI 패널은 긴 문단이 아니라 판단문, 근거-의미 항목, 유의사항 칩으로 읽히는 짧은 분석 블록이다.',
    '출력은 JSON 객체 하나만 반환. Markdown 코드블럭 금지.',
    '',
    '분석 절차:',
    '0. 수치 계산, 분위, 평균 대비, 데이터 계보는 analysisSignals를 우선 신뢰. 모델이 새 계산을 만들지 않음.',
    '1. evidenceMatrix와 analysisSignals의 수치를 그대로 근거로 삼되, 수치만 반복하지 않음.',
    '2. 먼저 analysisSignals.notableSignals와 crossMetricTensions를 읽고 “특이점 → 긴장/불균형 → 분석 결론 → 실행 처방” 순서로 내부 판단.',
    '3. 각 섹션마다 관찰(observation), 해석(meaning), 도서관 운영 처방(action)을 결합.',
    '4. 사회안전망은 먼저 household, disability, foreign 세부 인사이트를 각각 작성한 뒤, socialSafety.summary/keyFindings에서 세 축을 종합.',
    '4-1. socialSafety는 사회안전망 데이터만 요약하지 않는다. 반드시 population의 연령·정주/생활인구 조건, culture의 문화시설·도서관·무장애 조건 중 최소 2개를 함께 연결해 “안내 채널·공간·대면 지원·언어 지원을 어떻게 배치해야 하는가”를 처방한다.',
    '4-2. education은 학교 수나 학교 목록만 요약하지 않는다. 반드시 population의 아동·청소년·생활인구 조건, culture의 문화시설·도서관·문화행사 조건 중 최소 2개를 함께 연결해 “시간대·홍보 채널·협력기관 역할·프로그램 장소를 어떻게 운영해야 하는가”를 처방한다.',
    '5. 자치구 종합 인사이트는 population, socialSafety, culture, education 중 최소 3개 축을 연결.',
    '6. “높다/낮다/많다/적다” 단독 표현 대신 서비스 접근성, 협력 자원, 정보 도달성, 공간/프로그램 기획 단위로 해석.',
    '7. 결론은 “검토/확인/점검이 필요”로 끝내지 않는다. 분석이 충분한 경우 시간대, 채널, 공간, 협력기관, 프로그램 운영 중 최소 1개를 어떻게 바꿀지 처방한다.',
    '8. 상단 카드 3개는 reportNarrative를 압축하되, 명·개·건·%·가구·개교·개관 같은 숫자 표기를 쓰지 않음.',
    '8-1. 작은 규모, 낮은 총량, 하위권 신호는 “확대보다/양보다” 같은 일반 비교로 쓰지 않는다. 반드시 좁은 운영 단위(시간대, 안내 채널, 공간, 협력기관, 방문·홍보 대상)의 배치·분리·우선순위 처방으로 바꾼다.',
    '9. 보고서 본문은 지표 나열이 아니라 자치구 조건이 도서관 서비스 설계에 미치는 구조적 의미를 설명.',
    '10. 섹션별 interpretations의 summary는 1문장 판단문으로 작성하고, keyFindings는 각각 “근거: ... / 의미: ...” 구조로 작성.',
    '11. keyFindings의 근거에는 수치·단위·기준 또는 조건을 유지하고, 의미에는 접근성·협력·공간·프로그램·안내·정보 도달성 중 하나의 함의를 붙임.',
    '12. dataLineage.fixedDatasets는 고정 참고값으로 해석하고, refreshableDatasets는 snapshot 갱신 시 재계산되는 값으로 분리해 표현.',
    '',
    '금지되는 출력:',
    '- 입력에 들어온 placeholder/mock 문장을 그대로 복사하거나 부분 치환하는 방식.',
    '- 아래 예시 문장을 그대로 복사하거나 같은 단어 배열로 재사용하는 방식.',
    '- “A는 10명, B는 20개 확인”처럼 숫자만 이어 붙인 문장.',
    '- 상단 카드에서 “65세 이상 00명”, “도서관 00개”처럼 수치를 직접 제시하는 방식.',
    '- “규모 확인”, “수준 확인”, “항목 점검”처럼 판단 대상만 있고 의미가 약한 문장.',
    '- “확인해야 함”, “검토가 필요함”, “점검해야 함”으로 끝나고 실제 운영 처방이 없는 문장.',
    '- 상단 insight.cards text와 bullets에서 “확인”, “검토”, “점검”, “볼 필요”를 쓰는 방식. 상단 카드는 분석 방법이 아니라 실행 처방만 쓴다.',
    '- “함께 봐야”, “함께 읽어야”, “기준으로 해석”처럼 분석 방법을 설명하는 문장. 모든 섹션은 “함께 보면/겹치므로/맞물리므로 → 무엇을 운영해야 함”으로 끝낸다.',
    '- “어떤 기준으로 볼지”, “어떤 조건에서 판단할지”처럼 분석 방법을 설명할 뿐 무엇을 해야 하는지 말하지 않는 문장.',
    '- “고령층, 1인가구, 장애, 외국인 구성”처럼 범용 지표명을 단순 열거하는 문장.',
    '- “지원이 필요하다”처럼 원인이 없는 일반론.',
    '- “도서관 서비스 개선 필요”처럼 어떤 지표 연결에서 나온 판단인지 알 수 없는 문장.',
    '- “맞춤형 서비스 필요”, “접근성 강화 필요”, “협력 강화 필요”처럼 자치구 고유 조건 없이 붙는 범용 운영 문장.',
    '- “대형 확대보다”, “양보다”, “확장보다”처럼 낮은 총량을 일반론적 절약/축소 프레임으로 처리하는 문장.',
    '- education을 학교 수/학교 목록만으로 끝내는 문장.',
    '- socialSafety를 수급률·가구·장애·외국인 구성만으로 끝내는 문장.',
    '- 사회안전망 대상자 구성을 “도움이 필요한 집단”처럼 표현하고 인구·문화·도서관 접근성 맥락 없이 결론내는 문장.',
    '- keyFindings를 2문장 이상의 긴 문단으로 작성하는 방식.',
    '- summary에 여러 수치를 한꺼번에 넣어 사실상 지표 나열로 만드는 방식.',
    '- 기관 수, 인구 규모, 수급률 등 단일 지표 하나만 근거로 정책 방향을 제시하는 문장.',
    '- 대상자 집단을 지역 문제의 원인처럼 표현.',
    '- “연결 실패가 생김”, “문제가 발생함”처럼 입력 지표만으로 확정 인과나 발생을 단정하는 문장. “가능성이 커짐”, “공백이 커질 수 있음”처럼 위험 표현으로 낮춘다.',
    '- 입력에 없는 순위, 추세, 증가/감소, 인과관계 생성.',
    '- analysisSignals에 없는 평균, 순위, 분위, 격차를 모델이 새로 계산하는 방식.',
    '- fixed_dataset 값을 최신 API 값처럼 표현하거나 api_cached 값을 고정 조사값처럼 표현하는 방식.',
    '- 상단 insight.cards bullets에 “고정값”, “갱신값”, “기준 차이”, “원인 단정”, “분리 해석”, “유의”, “주의”, “캐시”, “snapshot” 같은 내부 판단·품질관리 용어를 노출하는 방식.',
    '',
    '좋은 출력의 형태(구조만 참고, 문장 복사 금지):',
    '- “[인구축의 구체 조건]과 [사회안전망축의 구체 조건]이 겹치므로 [도서관 서비스]는 [공간·프로그램·안내·협력 중 하나]를 대상별 접근성 기준으로 분리 운영해야 함.”',
    '- “[문화시설/생활문화의 구체 조건]과 [교육/공공기관 조건]의 관계상 생활권 안에서 [도서관이 맡을 접점]이 비므로, [협력기관 역할/프로그램 장소/홍보 채널]을 우선 재배치해야 함.”',
    '- “[외국인/장애/가구 중 실제 최상위 항목]이 [연령·생활권 조건]과 맞물리므로 언어, 이동, 디지털 안내, 대면 지원을 하나의 창구로 묶지 말고 [구체 채널]로 분리 제공해야 함.”',
    '- “education: [학교급 조건]과 [아동·청소년/생활인구 조건], [문화시설·도서관 조건]을 함께 보면 [시간대/홍보 채널/협력기관 역할]이 갈라진다. 따라서 [프로그램 장소/홍보/협력]을 [구체 단위]로 운영해야 함.”',
    '- “socialSafety: [가구/장애/외국인 조건]과 [연령·생활권 조건], [문화·도서관 접근성 조건]이 겹치므로 [안내 채널/공간/대면 지원/언어 지원]을 [구체 단위]로 분리 제공해야 함.”',
    '',
    '좋은 상단 카드의 형태(구조만 참고, 문장 복사 금지):',
    '- “[생활인구/연령 조건]과 [접근성 조건]이 겹치므로 도서관은 [시간대·이동성·대면 안내 중 하나]를 분리 운영하고, [구체 대상]의 접점을 먼저 배치해야 함.”',
    '- “[생활문화/무장애/시설 조건]과 [도서관/교육 조건]이 어긋나므로 도서관은 문화시설 대체가 아니라 [생활권 연계/보완 거점] 역할을 맡고 [협력기관/공간]을 재배치해야 함.”',
    '- “[학교/도서관/공공기관의 실제 조건] 때문에 [권역·대상·프로그램 중 하나] 기준 협력 경로가 우선이다. 기관 분포를 따라 [홍보 채널/장소/시간대]를 나누어 운영해야 함.”',
    '',
    '반환 스키마:',
    JSON.stringify({
      interpretations: {
        population: { summary: 'string', keyFindings: ['string'], cautions: ['string'] },
        culture: { summary: 'string', keyFindings: ['string'], cautions: ['string'] },
        education: { summary: 'string', keyFindings: ['string'], cautions: ['string'] },
        socialSafety: {
          summary: 'string',
          keyFindings: ['string'],
          cautions: ['string'],
          segments: {
            household: { summary: 'string', keyFindings: ['string'], cautions: ['string'] },
            disability: { summary: 'string', keyFindings: ['string'], cautions: ['string'] },
            foreign: { summary: 'string', keyFindings: ['string'], cautions: ['string'] }
          }
        }
      },
      insight: {
        cards: [
          { label: '핵심 판단', text: 'string', bullets: ['string'] },
          { label: '주의 지점', text: 'string', bullets: ['string'] },
          { label: '실행 방향', text: 'string', bullets: ['string'] }
        ],
        cautions: ['string']
      },
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
    '제약:',
    '- 각 summary는 1문장, 70~120자 권장. 수치 나열 대신 판단축을 먼저 제시.',
    '- 각 keyFindings는 2~4개이며, 반드시 “근거: ... / 의미: ...” 형식을 우선 사용.',
    '- 각 keyFindings는 70~150자 권장. 한 항목 안에 지표 근거, 분석 결과, 도서관 운영 처방을 함께 포함.',
    '- 각 cautions는 0~2개, 50자 안팎의 짧은 유의사항으로 작성.',
    '- interpretations.socialSafety.segments.household는 가구 유형과 수급률/생활 지원 접점의 의미를 분리해 작성.',
    '- interpretations.socialSafety.segments.disability는 장애 대분류와 이동·감각·정보 접근성 조건을 분리해 작성.',
    '- interpretations.socialSafety.segments.foreign은 외국인 주민 유형과 등록외국인 국적을 같은 분모로 섞지 않고 언어·정보 도달성 관점으로 작성.',
    '- interpretations.socialSafety.summary와 keyFindings는 household, disability, foreign 세 인사이트를 종합한 판단이어야 하며, 어느 한 축만 반복하지 않음.',
    '- interpretations.education.summary와 keyFindings는 교육 데이터만 보지 말고 population과 culture 중 최소 2개 근거를 함께 반영.',
    '- interpretations.education의 의미 문장은 학교급/목록 조건을 시간대, 홍보 채널, 협력기관 역할, 프로그램 장소 중 하나의 실행 처방과 연결.',
    '- interpretations.socialSafety.summary와 keyFindings는 socialSafety 데이터만 보지 말고 population과 culture 중 최소 2개 근거를 함께 반영.',
    '- interpretations.socialSafety의 의미 문장은 가구/장애/외국인 조건을 안내 채널, 공간 접근성, 대면 지원, 언어 지원, 이동 보조 중 하나의 실행 처방과 연결.',
    '- insight.cards는 정확히 3개, 각 text는 1~2문장.',
    '- insight.cards의 bullets는 2~4개이며, 다양한 섹션의 부분 인사이트를 짧게 압축한 사용자용 핵심 불릿.',
    '- insight.cards label은 정확히 “핵심 판단”, “주의 지점”, “실행 방향” 순서로 작성.',
    '- insight.cards text와 bullets에는 숫자, 단위, 퍼센트, 순위 표현을 쓰지 않음.',
    '- insight.cards text와 bullets에는 “확인”, “검토”, “점검”, “볼 필요”를 쓰지 않음. 대신 분리, 재배치, 편성, 설계, 운영, 제공, 연계, 우선 배정으로 작성.',
    '- insight.cards text는 카드마다 60자 이상 160자 이하로 작성.',
    '- insight.cards bullets는 항목당 18자 이상 80자 이하로 작성.',
    '- insight.cards text에는 evidenceMatrix에 등장하는 자치구 고유 키워드 또는 조건을 카드마다 3개 이상 포함.',
    '- 낮은 총량·하위권·공란·결측 조건을 다룰 때는 “운영 단위를 좁히는 이유”로만 사용하고, 부족하므로 확대/강화/개선이 필요하다는 결론을 쓰지 않음.',
    '- insight.cards 3개는 서로 다른 지표 조합을 사용하며, 어느 자치구에도 그대로 쓸 수 있는 범용 문장을 피함.',
    '- insight.cards[0]은 여러 지표의 연결로 핵심 판단축과 도서관 운영상 의미를 제시.',
    '- insight.cards[1]은 내부 유의사항이 아니라 사용자가 볼 수 있는 서비스 공백, 접근성 공백, 연결 실패 가능성을 제시.',
    '- insight.cards[2]은 도서관 서비스·협력·공간/프로그램을 어떻게 바꿀지 실행 방향을 제시.',
    '- 각 insight.cards text는 “지표 간 관계 + 분석 결과 + 도서관 운영 처방” 구조로 작성.',
    '- reportNarrative는 보고서 본문 슬롯이며 각 항목은 3~5문장, bullet이 아닌 문단형 문장.',
    '- reportNarrative의 7개 키(executiveSummary, population, culture, education, socialSafety, libraryImplications, cautions)는 모두 반드시 작성.',
    '- reportNarrative.executiveSummary는 종합 인사이트 3개 카드보다 더 상세한 논리 흐름을 제공.',
    '- reportNarrative.libraryImplications는 인구·사회안전망·문화·교육 중 최소 4개 축을 도서관 운영 처방으로 연결.',
    '- reportNarrative 각 항목은 “근거 지표 묶음 → 분석 결과 → 도서관 의사결정 → 실행 처방” 순서를 따른다.',
    '- reportNarrative에는 고정값과 갱신값을 구분하는 문장을 최소 1회 포함.',
    '- 고정값/갱신값/기준 차이/원인 단정 금지 같은 내부 통제 문구는 reportNarrative.cautions 또는 섹션 cautions에만 사용하고, insight.cards bullets에는 쓰지 않음.',
    '- evidenceRefs는 반환하지 말고 입력의 근거 구조를 보존한다고 가정.',
    '- 모든 출력 문장에는 분석 결과 또는 실행 처방 동사(의미, 시사함, 분리, 재배치, 편성, 설계, 운영, 전환, 연계, 제공)를 포함.',
    '- 실행 처방은 단정해도 되지만 원인·결과 발생은 단정하지 않는다. “실패가 생김” 대신 “실패 가능성이 커짐”, “공백이 커질 수 있음”으로 표현.',
    '- interpretations.education과 interpretations.socialSafety에서도 “함께 봐야/읽어야/검토”로 멈추지 말고 시간대, 채널, 공간, 협력기관, 대면/언어/이동 지원 중 무엇을 어떻게 운영할지 적는다.',
    '- JSON 작성 전 자체 점검: insight.cards 3개 모두 숫자가 없고, 2개 이상 지표 축을 연결하며, 2개 이상 핵심 불릿을 포함해야 함.',
    '',
    '입력:',
    JSON.stringify(compactInput)
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

async function callOpenAiJson({ model, prompt, route = 'direct' }) {
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
    messages: [
      { role: 'system', content: 'You return only valid JSON for a Korean public-sector analytics dashboard.' },
      { role: 'user', content: prompt }
    ],
    response_format: districtScreenResponseFormat()
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

async function callProviderJson({ route, provider, model, prompt }) {
  if (provider === 'gemini') return callGeminiJson({ model, prompt, route });
  if (provider === 'anthropic') return callAnthropicJson({ model, prompt, route });
  return callOpenAiJson({ model, prompt, route });
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
    'Repair only insight.cards and insight.cautions. Preserve the same JSON schema, but do not rewrite interpretations or reportNarrative conceptually.',
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
  maxQualityRetries = Number.parseInt(getEnv('LLM_QUALITY_RETRY_COUNT') || '1', 10)
}) {
  const prompt = promptOverride || buildDistrictScreenPrompt({ basePayload });
  let output = await callProviderJson({ route, provider, model, prompt });
  let quality = assessInsightQuality(output);

  const retryCount = Number.isFinite(maxQualityRetries) ? Math.max(0, maxQualityRetries) : 0;
  for (let attempt = 0; attempt < retryCount && shouldRetryForQuality(quality); attempt += 1) {
    const previousOutput = output;
    const previousQuality = quality;
    const repairedOutput = await callProviderJson({
      route,
      provider,
      model,
      prompt: buildScreenCardRepairPrompt({ prompt, generatedText: previousOutput, quality: previousQuality })
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

module.exports = {
  getEnv,
  getGatewayReadiness,
  getDirectReadiness,
  assessInsightQuality,
  findWeakInsightPatternWarnings,
  buildScreenCardRepairPrompt,
  buildDistrictScreenPrompt,
  pickProviderAndModel,
  generateDistrictScreenText
};
