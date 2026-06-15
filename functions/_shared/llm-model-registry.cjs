const MODEL_REGISTRY_VERSION = 'llm-model-registry-v0.1';

const LLM_PROVIDERS = {
  openai: {
    label: 'OpenAI',
    route: 'netlify-ai-gateway-or-direct',
    envKey: 'OPENAI_API_KEY',
    strengths: ['화면 인사이트', '보고서 본문', 'JSON 구조화 출력'],
    caution: '고품질 모델은 보고서 최초 생성 또는 검수에 한정'
  },
  gemini: {
    label: 'Gemini',
    route: 'netlify-ai-gateway-or-direct',
    envKey: 'GEMINI_API_KEY',
    strengths: ['대량 사전 생성', '저비용 단문 요약', '고정 데이터셋 처리'],
    caution: '민감한 사회 지표 문구는 품질 게이트 통과 필요'
  },
  anthropic: {
    label: 'Anthropic',
    route: 'netlify-ai-gateway-or-direct',
    envKey: 'ANTHROPIC_API_KEY',
    strengths: ['보수적 문체', '장문 흐름 점검', '보고서 보조 검수'],
    caution: '기본 생성보다 검수와 대안 작성에 우선 배치'
  },
  mistral: {
    label: 'Mistral',
    route: 'direct-api-candidate',
    envKey: 'MISTRAL_API_KEY',
    strengths: ['저비용 초안', '대량 사전 생성 실험'],
    caution: 'Netlify AI Gateway 기본 경로와 분리해 adapter 및 과금 모니터링 필요'
  }
};

const LLM_MODEL_CATALOG = {
  'gemini-2.5-flash-lite': {
    provider: 'gemini',
    costClass: 'low',
    role: '고정 데이터셋 및 단문 지표 해석 1차 생성',
    useWhen: ['문화역량 고정 해석', '주변 시설 단문 해석', '대량 precompute'],
    avoidWhen: ['민감한 결론 단정', '최종 보고서 단독 생성']
  },
  'gemini-3.1-flash-lite': {
    provider: 'gemini',
    costClass: 'low-balanced',
    role: '화면용 보조 인사이트 및 대안 생성',
    useWhen: ['종합 인사이트 대안', '섹션별 빠른 초안'],
    avoidWhen: ['장문 정책 보고서 최종본']
  },
  'gemini-3.1-pro-preview': {
    provider: 'gemini',
    costClass: 'balanced-report',
    role: '보고서 초안 및 장문 대안',
    useWhen: ['보고서 초안', '장문 구조 실험'],
    avoidWhen: ['최종 제출본 단독 검수']
  },
  'gpt-5.4-mini': {
    provider: 'openai',
    costClass: 'balanced',
    role: '화면 노출용 기본 해석과 종합 인사이트',
    useWhen: ['인구구조', '사회안전망', '교육인프라', '자치구 종합 인사이트'],
    avoidWhen: ['기관 제출용 장문 최종 검수']
  },
  'gpt-5.4': {
    provider: 'openai',
    costClass: 'report',
    role: '자치구 보고서 본문 생성',
    useWhen: ['자치구 보고서 다운로드', '여러 지표묶음 통합 해석'],
    avoidWhen: ['단순 반복 생성']
  },
  'gpt-5.5': {
    provider: 'openai',
    costClass: 'premium',
    role: '최종 제출본 검수 및 민감 결론 재작성',
    useWhen: ['기관 제출본', '정책 결론 품질 검수', '고위험 문구 조정'],
    avoidWhen: ['일반 화면 진입 시 실시간 호출']
  },
  'claude-haiku-4-5': {
    provider: 'anthropic',
    costClass: 'low-balanced',
    role: '저비용 보조 해석과 보수적 문구 초안',
    useWhen: ['문체 대안', '민감 지표의 조심스러운 초안'],
    avoidWhen: ['복잡한 장문 보고서 단독 생성']
  },
  'claude-sonnet-4-6': {
    provider: 'anthropic',
    costClass: 'report-review',
    role: '장문 흐름 검수와 정책 문구 보조',
    useWhen: ['보고서 보조 검수', '종합 인사이트 승격', '보수적 표현 재작성'],
    avoidWhen: ['대량 사전 생성']
  },
  'mistral-small-latest': {
    provider: 'mistral',
    costClass: 'low-direct',
    role: '직접 API 기반 저비용 대량 초안 후보',
    useWhen: ['문화역량 고정 해석 실험', '대량 생성 비용 비교'],
    avoidWhen: ['Netlify Gateway 전용 운영', '민감 지표 최종 문구']
  }
};

const MODEL_RECOMMENDATIONS = {
  metricBrief: {
    purpose: '개별 지표묶음의 짧은 해석문 생성',
    costTier: 'low',
    costTierLabel: '저비용',
    defaultProvider: 'gemini',
    defaultModel: 'gemini-2.5-flash-lite',
    openai: 'gpt-5.4-mini',
    gemini: 'gemini-2.5-flash-lite',
    anthropic: 'claude-haiku-4-5',
    directOptional: 'mistral-small-latest',
    escalationModel: 'gpt-5.4-mini',
    reason: '짧은 구조화 출력, 반복 생성, 비용/지연시간 관리 우선. 품질 게이트 실패 시 mini급으로 승격'
  },
  districtInsight: {
    purpose: '자치구 종합 인사이트 3문장 및 화면 카드 생성',
    costTier: 'balanced',
    costTierLabel: '균형',
    defaultProvider: 'openai',
    defaultModel: 'gpt-5.4-mini',
    openai: 'gpt-5.4-mini',
    gemini: 'gemini-3.1-flash-lite',
    anthropic: 'claude-haiku-4-5',
    escalationModel: 'gpt-5.4 또는 claude-sonnet-4-6',
    reason: '여러 지표묶음 간 우선순위와 충돌 해석이 필요하되, 화면용 3문장 출력은 mini급부터 시작'
  },
  districtReport: {
    purpose: '자치구 HTML 기반 보고서 본문 생성',
    costTier: 'premium-on-demand',
    costTierLabel: '요청형 고품질',
    defaultProvider: 'openai',
    defaultModel: 'gpt-5.4',
    openai: 'gpt-5.4',
    gemini: 'gemini-3.1-pro-preview',
    anthropic: 'claude-sonnet-4-6',
    premiumModel: 'gpt-5.5',
    economyModel: 'gemini-3.1-pro-preview',
    reason: '긴 맥락 유지, 정책 보고서형 문체, 구조화된 장문 생성 필요. 최종 제출본 또는 충돌 검토에만 premium 승격'
  },
  batchPrecompute: {
    purpose: '고정 데이터셋 사전 생성 및 DB 저장',
    costTier: 'low-batch',
    costTierLabel: '대량 저비용',
    defaultProvider: 'gemini',
    defaultModel: 'gemini-2.5-flash-lite',
    openai: 'gpt-5.4-mini',
    gemini: 'gemini-2.5-flash-lite',
    anthropic: 'claude-haiku-4-5',
    directOptional: 'mistral-small-latest',
    escalationModel: 'gpt-5.4-mini',
    reason: '반복 가능한 템플릿 출력과 대량 처리 비용 관리 우선. 고정 데이터는 생성 후 DB 캐시'
  }
};

function formatModelRecommendation(recommendation = {}) {
  const parts = [
    recommendation.defaultModel ? `기본 ${recommendation.defaultModel}` : null,
    recommendation.economyModel ? `초안 ${recommendation.economyModel}` : null,
    recommendation.escalationModel ? `승격 ${recommendation.escalationModel}` : null,
    recommendation.premiumModel ? `고품질 ${recommendation.premiumModel}` : null,
    recommendation.costTierLabel ? `비용 ${recommendation.costTierLabel}` : null
  ].filter(Boolean);
  return parts.join(' / ');
}

module.exports = {
  MODEL_REGISTRY_VERSION,
  LLM_PROVIDERS,
  LLM_MODEL_CATALOG,
  MODEL_RECOMMENDATIONS,
  formatModelRecommendation
};
