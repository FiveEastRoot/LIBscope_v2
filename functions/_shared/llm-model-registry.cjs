const MODEL_REGISTRY_VERSION = 'llm-model-registry-v0.2';

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
  'gpt-5.6-luna': {
    provider: 'openai',
    costClass: 'efficient',
    role: '기본 해석, 종합 인사이트, 대량 캐시 생성',
    useWhen: ['인구구조', '사회안전망', '교육인프라', '자치구 종합 인사이트', '대량 precompute'],
    avoidWhen: ['기관 제출용 장문 최종 검수', '민감 결론의 최종 확정']
  },
  'gpt-5.6-terra': {
    provider: 'openai',
    costClass: 'balanced-report',
    role: '보고서 본문과 품질 승격 생성',
    useWhen: ['자치구 보고서 다운로드', '여러 지표묶음 통합 해석', '품질 게이트 실패 재생성'],
    avoidWhen: ['단순 반복 생성']
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
    defaultProvider: 'openai',
    defaultModel: 'gpt-5.6-luna',
    openai: 'gpt-5.6-luna',
    gemini: 'gemini-2.5-flash-lite',
    anthropic: 'claude-haiku-4-5',
    directOptional: 'mistral-small-latest',
    escalationModel: 'gpt-5.6-terra',
    reason: '짧은 구조화 출력과 반복 생성은 Luna를 사용하고, 품질 게이트 실패 시 Terra로 승격'
  },
  districtInsight: {
    purpose: '자치구 종합 인사이트 3문장 및 화면 카드 생성',
    costTier: 'balanced',
    costTierLabel: '균형',
    defaultProvider: 'openai',
    defaultModel: 'gpt-5.6-luna',
    openai: 'gpt-5.6-luna',
    gemini: 'gemini-3.1-flash-lite',
    anthropic: 'claude-haiku-4-5',
    escalationModel: 'gpt-5.6-terra',
    reason: '화면용 인사이트는 Luna로 생성하고, 지표 충돌이나 품질 게이트 실패 시 Terra로 승격'
  },
  districtReport: {
    purpose: '자치구 HTML 기반 보고서 본문 생성',
    costTier: 'premium-on-demand',
    costTierLabel: '요청형 고품질',
    defaultProvider: 'openai',
    defaultModel: 'gpt-5.6-terra',
    openai: 'gpt-5.6-terra',
    gemini: 'gemini-3.1-pro-preview',
    anthropic: 'claude-sonnet-4-6',
    premiumModel: 'gpt-5.6-terra',
    economyModel: 'gpt-5.6-luna',
    reason: '일반 초안은 Luna를 허용하고, 장문 보고서와 최종 검수는 Terra로 제한'
  },
  batchPrecompute: {
    purpose: '고정 데이터셋 사전 생성 및 DB 저장',
    costTier: 'low-batch',
    costTierLabel: '대량 저비용',
    defaultProvider: 'openai',
    defaultModel: 'gpt-5.6-luna',
    openai: 'gpt-5.6-luna',
    gemini: 'gemini-2.5-flash-lite',
    anthropic: 'claude-haiku-4-5',
    directOptional: 'mistral-small-latest',
    escalationModel: 'gpt-5.6-terra',
    reason: '대량 생성은 Luna로 처리해 DB에 저장하고, 실패 항목만 Terra로 승격'
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
