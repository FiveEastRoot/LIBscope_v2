const CONTRACT_VERSION = 'llm-output-contracts-v0.1';

const OUTPUT_STYLE_GUIDE = {
  sentenceEnding: '보고서형 명사형 어미 우선. 존대 표현 사용 금지.',
  evidenceRule: '수치 기반 문장에는 가능한 한 입력 지표명과 값을 함께 유지.',
  uncertaintyRule: '자료 기준이 다르거나 고정 참고값인 경우 비교 한계를 명시.',
  safetyRule: '정책 원인은 단정하지 않되, 데이터 해석은 시간대·채널·공간·협력기관·프로그램 운영 처방으로 연결.'
};

const COMMON_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['title', 'summary', 'keyFindings', 'cautions', 'evidenceRefs', 'qualityFlags'],
  properties: {
    title: { type: 'string' },
    summary: { type: 'string', maxSentences: 3 },
    keyFindings: { type: 'array', itemType: 'string', minItems: 2, maxItems: 4 },
    cautions: { type: 'array', itemType: 'string', minItems: 0, maxItems: 2 },
    evidenceRefs: { type: 'array', itemType: 'object', minItems: 1, maxItems: 8 },
    qualityFlags: { type: 'array', itemType: 'string' }
  }
};

const SECTION_CONTRACTS = {
  districtInsight: {
    sectionKey: 'districtInsight',
    label: '자치구 종합 인사이트',
    generationUnit: 'district_screen_summary',
    inputGroups: ['population', 'culture', 'education', 'socialSafety', 'publicPlaces'],
    requiredInputFields: ['gu', 'snapshotKey', 'population', 'cultureAndEducation', 'socialSafety'],
    outputSlots: ['cards', 'cautions', 'evidenceRefs', 'qualityFlags'],
    sentenceLimits: {
      cards: 3,
      cardTextSentences: 1,
      cardBullets: [2, 4],
      cautionCount: 2
    },
    outputSchema: {
      type: 'object',
      required: ['title', 'cards', 'cautions', 'evidenceRefs', 'qualityFlags'],
      properties: {
        title: { type: 'string' },
        cards: { type: 'array', itemType: 'object', minItems: 3, maxItems: 3 },
        cautions: { type: 'array', itemType: 'string', maxItems: 2 },
        evidenceRefs: { type: 'array', itemType: 'object', minItems: 3, maxItems: 8 },
        qualityFlags: { type: 'array', itemType: 'string' }
      }
    },
    interpretationRules: [
      '인구, 사회안전망, 문화/교육 인프라 중 최소 3개 축을 함께 반영.',
      '3개 카드 화면 요약은 판단문, 유의 지점, 실행 방향으로 분리.',
      '각 카드는 긴 문단 대신 2-4개 핵심 불릿을 우선 표시.',
      '상단 카드에는 숫자 대신 지표 간 관계와 운영 함의를 제시.',
      '자치구 보고서의 흐름과 충돌하지 않는 상위 판단축만 제시.'
    ],
    defaultModelRecommendationKey: 'districtInsight',
    cachePolicy: 'district_snapshot'
  },
  population: {
    sectionKey: 'population',
    label: '인구구조 분석',
    generationUnit: 'metric_interpretation',
    inputGroups: ['residentPopulation', 'livingPopulation'],
    requiredInputFields: ['gu', 'population.modes.resident.total', 'population.modes.resident.ageDistribution'],
    outputSlots: ['summary', 'keyFindings', 'cautions', 'segments.household', 'segments.disability', 'segments.foreign', 'evidenceRefs', 'recommendedView', 'reportUse'],
    sentenceLimits: {
      summarySentences: 2,
      keyFindings: 4,
      cautions: 2
    },
    outputSchema: COMMON_OUTPUT_SCHEMA,
    interpretationRules: [
      '주민등록인구와 생활인구를 같은 증감 지표처럼 직접 비교하지 않음.',
      '0-9세, 10-64세, 65세 이상 구간을 서비스 대상 구분으로 해석.',
      '생활인구 결측 또는 fallback 상태를 숨기지 않음.',
      'keyFindings는 가능한 한 “근거: ... / 의미: ...” 구조로 작성.'
    ],
    defaultModelRecommendationKey: 'metricBrief',
    cachePolicy: 'district_snapshot'
  },
  culture: {
    sectionKey: 'culture',
    label: '문화역량·향유 지표',
    generationUnit: 'precomputed_metric_interpretation',
    inputGroups: ['cultureMetrics2023', 'cultureEnjoyment2024'],
    requiredInputFields: ['gu', 'cultureMetrics.year', 'cultureMetrics.public_culture_facilities'],
    outputSlots: ['summary', 'keyFindings', 'cautions', 'evidenceRefs', 'recommendedView', 'reportUse'],
    sentenceLimits: {
      summarySentences: 2,
      keyFindings: 4,
      cautions: 2
    },
    outputSchema: COMMON_OUTPUT_SCHEMA,
    interpretationRules: [
      '문화향유 값은 서울시 집단별 참고값으로 표현하고 자치구 직접 순위처럼 쓰지 않음.',
      '시설 공급량, 인구 대비 접근성, 향유 참고값을 분리.',
      '고정 데이터셋은 최초 생성 후 DB 저장 대상으로 처리.',
      'keyFindings는 가능한 한 “근거: ... / 의미: ...” 구조로 작성.'
    ],
    defaultModelRecommendationKey: 'batchPrecompute',
    cachePolicy: 'static_dataset'
  },
  education: {
    sectionKey: 'education',
    label: '교육인프라',
    generationUnit: 'metric_interpretation',
    inputGroups: ['schoolCounts', 'schoolDetails', 'libraryPrograms'],
    requiredInputFields: ['gu', 'cultureAndEducation.schools', 'cultureAndEducation.schoolDetails'],
    outputSlots: ['summary', 'keyFindings', 'cautions', 'evidenceRefs', 'recommendedView', 'reportUse'],
    sentenceLimits: {
      summarySentences: 2,
      keyFindings: 4,
      cautions: 2
    },
    outputSchema: COMMON_OUTPUT_SCHEMA,
    interpretationRules: [
      '학교 수를 도서관 수요의 직접 추정치로 단정하지 않음.',
      '학교급별 규모와 실제 위치 목록을 분리해 해석.',
      '도서관·학교·문화시설 연계 가능성은 시간대, 홍보 채널, 협력기관 역할, 프로그램 장소 처방으로 표현.',
      '교육인프라는 단독 학교 목록이 아니라 인구구조의 아동·청소년/생활인구 조건, 문화시설·도서관 기반과 함께 해석.',
      '학교급별 차이는 문화·도서관 접점과 결합해 시간대, 홍보 채널, 협력기관 역할을 나누는 근거로 사용.',
      'keyFindings는 가능한 한 “근거: ... / 의미: ...” 구조로 작성.'
    ],
    defaultModelRecommendationKey: 'metricBrief',
    cachePolicy: 'district_snapshot'
  },
  socialSafety: {
    sectionKey: 'socialSafety',
    label: '사회안전망 대상자 구성',
    generationUnit: 'metric_interpretation',
    inputGroups: ['welfareRecipients', 'households', 'disability', 'foreignResidents'],
    requiredInputFields: ['gu', 'socialSafety.recipients', 'socialSafety.households', 'socialSafety.disability', 'socialSafety.foreignResidents'],
    outputSlots: ['summary', 'keyFindings', 'cautions', 'evidenceRefs', 'recommendedView', 'reportUse'],
    sentenceLimits: {
      summarySentences: 2,
      keyFindings: 4,
      cautions: 2
    },
    outputSchema: COMMON_OUTPUT_SCHEMA,
    interpretationRules: [
      '대상자 집단을 지역 문제의 원인처럼 표현하지 않음.',
      '가구, 장애, 외국인 축을 각각 별도 인사이트로 분리.',
      '세 축을 종합한 사회안전망 대상자 구성 종합 인사이트를 별도 작성.',
      '접근성, 언어, 이동, 정보 도달성 관점으로 해석.',
      '사회안전망은 단독 복지 수요가 아니라 인구구조, 문화 접근성, 도서관·교육 협력 자원과 함께 읽어 서비스 도달 경로를 처방.',
      '장애·외국인·가구 축은 문화시설/무장애 조건, 도서관 밀도, 학교·공공기관 접점과 연결해 안내 채널·공간·대면 지원을 분리 제공하는 근거로 사용.',
      'keyFindings는 가능한 한 “근거: ... / 의미: ...” 구조로 작성.'
    ],
    defaultModelRecommendationKey: 'metricBrief',
    cachePolicy: 'district_snapshot'
  },
  publicPlaces: {
    sectionKey: 'publicPlaces',
    label: '주변 공공기관·문화시설',
    generationUnit: 'library_area_interpretation',
    inputGroups: ['libraryLocation', 'publicPlacesWithin2km'],
    requiredInputFields: ['libraryName', 'libraryLocation', 'publicPlaces'],
    outputSlots: ['summary', 'keyFindings', 'cautions', 'evidenceRefs', 'recommendedView', 'reportUse'],
    sentenceLimits: {
      summarySentences: 2,
      keyFindings: 4,
      cautions: 2
    },
    outputSchema: COMMON_OUTPUT_SCHEMA,
    interpretationRules: [
      '거리와 기관 유형을 중심으로 입지 협력 가능성을 해석.',
      '2km 이내 목록은 실제 접근성을 보장하지 않음을 명시.',
      '문화시설, 행정기관, 복지기관, 교육기관을 유형별로 분리.',
      'keyFindings는 가능한 한 “근거: ... / 의미: ...” 구조로 작성.'
    ],
    defaultModelRecommendationKey: 'metricBrief',
    cachePolicy: 'library_location_snapshot'
  },
  districtReport: {
    sectionKey: 'districtReport',
    label: '자치구 보고서 다운로드',
    generationUnit: 'html_markdown_report',
    inputGroups: ['allMetricInterpretations', 'districtInsight', 'visualizationSpecs'],
    requiredInputFields: ['gu', 'snapshotKey', 'interpretations', 'insight', 'reportTemplateVersion'],
    outputSlots: ['title', 'subtitle', 'sections', 'markdown', 'html', 'cautions', 'evidenceRefs', 'qualityFlags'],
    sentenceLimits: {
      sectionParagraphs: [2, 4],
      executiveSummarySentences: 5
    },
    outputSchema: {
      type: 'object',
      required: ['title', 'subtitle', 'sections', 'markdown', 'html', 'evidenceRefs', 'qualityFlags'],
      properties: {
        title: { type: 'string' },
        subtitle: { type: 'string' },
        sections: { type: 'array', itemType: 'object', minItems: 6, maxItems: 9 },
        markdown: { type: 'string' },
        html: { type: 'string' },
        evidenceRefs: { type: 'array', itemType: 'object', minItems: 6, maxItems: 30 },
        qualityFlags: { type: 'array', itemType: 'string' }
      }
    },
    interpretationRules: [
      '보고서 목차와 섹션 순서는 템플릿이 통제하고 모델은 슬롯만 채움.',
      '화면용 종합 인사이트와 결론 흐름이 충돌하지 않음.',
      '시각화는 왜곡 없이 지표명, 단위, 기준시점을 유지.'
    ],
    defaultModelRecommendationKey: 'districtReport',
    cachePolicy: 'district_report_archive'
  }
};

const QUALITY_GATES = {
  schema: {
    label: 'JSON schema 검증',
    failWhen: ['필수 슬롯 누락', '배열 길이 초과', '잘못된 타입 반환']
  },
  evidence: {
    label: '근거 수치 검증',
    failWhen: ['입력에 없는 수치 생성', '지표명 누락', '단위 누락', '기준연도/월 누락']
  },
  style: {
    label: '문체 검증',
    failWhen: ['존대형 종결 반복', '화면 카드 문장 과다', '보고서형 명사형 어미 위반']
  },
  safety: {
    label: '민감 지표 표현 검증',
    failWhen: ['대상 집단을 문제 원인처럼 표현', '취약성 과잉 단정', '근거 없는 정책 처방']
  },
  consistency: {
    label: '섹션 간 일관성 검증',
    failWhen: ['화면 인사이트와 보고서 결론 충돌', '고정 데이터와 API 데이터 기준 혼합', '동일 수치의 다른 표현']
  },
  cacheability: {
    label: '캐시 가능성 검증',
    failWhen: ['snapshot_key 누락', 'harness_version 누락', 'model_registry_version 누락', 'prompt_version 누락']
  }
};

const REPORT_OUTLINE = [
  { key: 'executiveSummary', title: '요약', source: ['districtInsight'], targetLength: '3-5문장' },
  { key: 'districtOverview', title: '지역 개요', source: ['population', 'publicPlaces'], targetLength: '2-3문단' },
  { key: 'population', title: '인구구조', source: ['population'], targetLength: '2-4문단' },
  { key: 'culture', title: '문화역량·향유', source: ['culture'], targetLength: '2-4문단' },
  { key: 'education', title: '교육인프라', source: ['education'], targetLength: '2-3문단' },
  { key: 'socialSafety', title: '사회안전망 대상자 구성', source: ['socialSafety'], targetLength: '2-4문단' },
  { key: 'libraryImplications', title: '도서관 서비스 시사점', source: ['allMetricInterpretations'], targetLength: '3-5문단' },
  { key: 'cautions', title: '해석 유의사항', source: ['qualityFlags', 'cautions'], targetLength: 'bullet 5-8개' }
];

const GOLDEN_TEST_DISTRICTS = [
  { gu: '강남구', reason: '인구 규모와 교육·문화 인프라가 큰 자치구' },
  { gu: '종로구', alternate: '중구', reason: '생활인구와 문화자원이 강한 도심 자치구' },
  { gu: '노원구', alternate: '은평구', reason: '생활권 기반 도서관 정책 해석이 중요한 자치구' },
  { gu: '금천구', alternate: '도봉구', reason: '인프라와 복지 수요 균형 점검이 필요한 자치구' },
  { gu: '영등포구', reason: '외국인 주민·산업·생활권 맥락을 함께 보기 좋은 자치구' }
];

function getSectionContract(sectionKey) {
  return SECTION_CONTRACTS[sectionKey] || null;
}

function validateSectionOutput(sectionKey, output = {}) {
  const contract = getSectionContract(sectionKey);
  const errors = [];

  if (!contract) {
    return {
      passed: false,
      errors: [{ gate: 'schema', message: `Unknown section key: ${sectionKey}` }]
    };
  }

  const schema = contract.outputSchema || COMMON_OUTPUT_SCHEMA;
  for (const field of schema.required || []) {
    if (output[field] === undefined || output[field] === null) {
      errors.push({ gate: 'schema', field, message: `${field} 누락` });
    }
  }

  for (const [field, rule] of Object.entries(schema.properties || {})) {
    const value = output[field];
    if (value === undefined || value === null) continue;

    if (rule.type === 'array') {
      if (!Array.isArray(value)) {
        errors.push({ gate: 'schema', field, message: `${field} 배열 타입 아님` });
        continue;
      }
      if (rule.minItems !== undefined && value.length < rule.minItems) {
        errors.push({ gate: 'schema', field, message: `${field} 최소 ${rule.minItems}개 미만` });
      }
      if (rule.maxItems !== undefined && value.length > rule.maxItems) {
        errors.push({ gate: 'schema', field, message: `${field} 최대 ${rule.maxItems}개 초과` });
      }
    }

    if (rule.type === 'string' && typeof value !== 'string') {
      errors.push({ gate: 'schema', field, message: `${field} 문자열 타입 아님` });
    }
  }

  return {
    passed: errors.length === 0,
    errors
  };
}

module.exports = {
  CONTRACT_VERSION,
  OUTPUT_STYLE_GUIDE,
  COMMON_OUTPUT_SCHEMA,
  SECTION_CONTRACTS,
  QUALITY_GATES,
  REPORT_OUTLINE,
  GOLDEN_TEST_DISTRICTS,
  getSectionContract,
  validateSectionOutput
};
