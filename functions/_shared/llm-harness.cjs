const crypto = require('crypto');
const {
  MODEL_REGISTRY_VERSION,
  LLM_PROVIDERS,
  LLM_MODEL_CATALOG,
  MODEL_RECOMMENDATIONS,
  formatModelRecommendation
} = require('./llm-model-registry.cjs');
const {
  CONTRACT_VERSION,
  OUTPUT_STYLE_GUIDE,
  SECTION_CONTRACTS,
  QUALITY_GATES,
  REPORT_OUTLINE,
  GOLDEN_TEST_DISTRICTS,
  validateSectionOutput
} = require('./llm-output-contracts.cjs');
const {
  ANALYSIS_SIGNAL_VERSION,
  buildAnalysisSignals
} = require('./analysis-signals.cjs');

const HARNESS_VERSION = 'district-screen-v0.2';

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value, suffix = '') {
  const numeric = toNumber(value);
  if (numeric === null) return '-';
  const formatted = Number.isInteger(numeric)
    ? numeric.toLocaleString('ko-KR')
    : numeric.toLocaleString('ko-KR', { maximumFractionDigits: 1 });
  return `${formatted}${suffix}`;
}

function formatPercent(value) {
  const numeric = toNumber(value);
  if (numeric === null) return '-';
  return `${numeric.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}%`;
}

function entriesFromDict(dict = {}) {
  return Object.entries(dict || {})
    .map(([name, value]) => ({ name, value: Number(value || 0) }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);
}

function topEntry(dict = {}) {
  return entriesFromDict(dict)[0] || null;
}

function sumEntries(dict = {}) {
  return entriesFromDict(dict).reduce((sum, item) => sum + item.value, 0);
}

function getPopulationMode(population, mode) {
  if (!population) return null;
  return population.modes?.[mode] || population;
}

function sumAgeGroups(ageDistribution = {}, matcher) {
  return Object.entries(ageDistribution || {}).reduce((sum, [label, value]) => {
    if (matcher(label)) return sum + Number(value || 0);
    return sum;
  }, 0);
}

function getPopulationSignals(districtData = {}) {
  const population = districtData.population || {};
  const resident = getPopulationMode(population, 'resident') || population;
  const living = getPopulationMode(population, 'living');
  const total = toNumber(resident?.total);
  const child = sumAgeGroups(resident?.ageDistribution, label => /^0-4세$|^5-9세$/.test(label));
  const senior = sumAgeGroups(resident?.ageDistribution, label => {
    const match = String(label).match(/^(\d+)/);
    return label.includes('70세 이상') || (match ? Number(match[1]) >= 65 : false);
  });
  const childRate = total ? (child / total) * 100 : null;
  const seniorRate = total ? (senior / total) * 100 : null;
  const genderTop = topEntry(resident?.genderRatio);
  return {
    total,
    child,
    childRate,
    senior,
    seniorRate,
    genderTop,
    residentSource: resident?.source,
    livingTotal: toNumber(living?.total),
    livingSource: living?.source,
    livingAvailable: Boolean(living && living.source !== 'living_population_unavailable')
  };
}

function getCultureSignals(cultureMetrics = {}) {
  return {
    publicCultureFacilities: toNumber(cultureMetrics.public_culture_facilities),
    publicCultureFacilitiesPer100k: toNumber(cultureMetrics.public_culture_facilities_per100k),
    librariesTotal: toNumber(cultureMetrics.libraries_total),
    librariesPer100k: toNumber(cultureMetrics.libraries_per100k),
    performanceSpaces: toNumber(cultureMetrics.public_performance_spaces),
    museumsGalleries: toNumber(cultureMetrics.public_museums_galleries),
    lifeCultureCenters: toNumber(cultureMetrics.life_culture_centers),
    barrierFreeSpaces: toNumber(cultureMetrics.barrier_free_indoor_culture_spaces),
    ordinanceCount: toNumber(cultureMetrics.culture_policy_ordinance_count),
    revisionCount: toNumber(cultureMetrics.culture_policy_revision_count),
    year: cultureMetrics.year
  };
}

function getEducationSignals(districtData = {}) {
  const schools = districtData.cultureAndEducation?.schools || {};
  const details = districtData.cultureAndEducation?.schoolDetails || {};
  const schoolTotal = Object.values(schools).reduce((sum, value) => sum + Number(value || 0), 0);
  const topSchoolLevel = entriesFromDict({
    초등학교: schools.elementary,
    중학교: schools.middle,
    고등학교: schools.high,
    대학교: schools.university
  })[0];
  const detailTotal = Object.values(details).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
  return {
    schools,
    schoolTotal,
    topSchoolLevel,
    detailTotal,
    publicLibraryCount: toNumber(districtData.cultureAndEducation?.publicLibraryCount),
    liveCultureEventsMonth: toNumber(districtData.cultureAndEducation?.liveCultureEventsMonth)
  };
}

function getSocialSignals(districtData = {}) {
  const social = districtData.socialIndicators || {};
  const householdTop = topEntry(social.householdTypes);
  const disabilityTop = topEntry(social.disabilityGroups || social.disability);
  const foreignResidentTypeTop = topEntry(social.foreignResidentTypes);
  const foreignNationalityTop = topEntry(social.registeredForeignerNationalities || social.nationalityComposition);
  const foreignTop = foreignResidentTypeTop || foreignNationalityTop;
  const recipientRate = toNumber(districtData.welfare?.recipientRate);
  const seoulAvgRecipientRate = toNumber(districtData.welfare?.seoulAvgRecipientRate);
  const recipientGap = recipientRate !== null && seoulAvgRecipientRate !== null
    ? recipientRate - seoulAvgRecipientRate
    : null;
  return {
    householdTop,
    disabilityTop,
    foreignResidentTypeTop,
    foreignNationalityTop,
    foreignTop,
    householdTotal: toNumber(social.totalHouseholds) || sumEntries(social.householdTypes),
    disabledTotal: toNumber(social.totalDisabled) || sumEntries(social.disabilityGroups || social.disability),
    foreignTotal: toNumber(social.totalForeignResidents) || sumEntries(social.foreignResidentTypes || {}),
    registeredForeignerTotal: toNumber(social.totalRegisteredForeigners) || sumEntries(social.registeredForeignerNationalities || social.nationalityComposition),
    recipientRate,
    seoulAvgRecipientRate,
    recipientGap,
    sourceLabel: social.sourceLabel,
    referenceDate: social.referenceDate
  };
}

function normalizeSnapshotValue(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeSnapshotValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, normalizeSnapshotValue(item)])
    );
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return '';
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : trimmed;
  }
  return value;
}

function buildSnapshotKey(districtData = {}, cultureMetrics = {}) {
  const population = districtData.population || {};
  const resident = getPopulationMode(population, 'resident') || population;
  const living = getPopulationMode(population, 'living');
  const social = districtData.socialIndicators || {};
  const schools = districtData.cultureAndEducation?.schools || {};
  const schoolDetails = districtData.cultureAndEducation?.schoolDetails || {};
  const schoolDetailNames = Object.fromEntries(
    Object.entries(schoolDetails).map(([key, list]) => [
      key,
      Array.isArray(list)
        ? list.map(item => `${item?.name || ''}|${item?.address || ''}`).sort()
        : []
    ])
  );
  const minimal = {
    harnessVersion: HARNESS_VERSION,
    analysisSignalVersion: ANALYSIS_SIGNAL_VERSION,
    gu: districtData.gu,
    population: {
      defaultMode: population?.mode,
      resident: {
        total: resident?.total,
        source: resident?.source,
        referenceDate: resident?.referenceDate,
        ageDistribution: resident?.ageDistribution,
        genderRatio: resident?.genderRatio
      },
      living: living ? {
        total: living?.total,
        source: living?.source,
        referenceDate: living?.referenceDate,
        ageDistribution: living?.ageDistribution,
        genderRatio: living?.genderRatio
      } : null
    },
    socialReferenceDate: districtData.socialIndicators?.referenceDate,
    socialSource: districtData.socialIndicators?.source,
    socialIndicators: {
      householdTypes: social.householdTypes,
      disabilityGroups: social.disabilityGroups,
      foreignResidentTypes: social.foreignResidentTypes,
      registeredForeignerNationalities: social.registeredForeignerNationalities,
      nationalityComposition: social.nationalityComposition,
      totalHouseholds: social.totalHouseholds,
      totalDisabled: social.totalDisabled,
      totalForeignResidents: social.totalForeignResidents,
      totalRegisteredForeigners: social.totalRegisteredForeigners
    },
    cultureYear: normalizeSnapshotValue(cultureMetrics.year),
    cultureMetrics: normalizeSnapshotValue(cultureMetrics),
    cultureAndEducation: {
      schools,
      schoolDetailNames,
      publicLibraryCount: districtData.cultureAndEducation?.publicLibraryCount,
      liveCultureEventsMonth: districtData.cultureAndEducation?.liveCultureEventsMonth
    },
    welfare: districtData.welfare
  };
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(minimal))
    .digest('hex')
    .slice(0, 16);
}

function firstSignalText(analysisSignals, sectionKey, fallback = '') {
  const list = analysisSignals?.comparisons?.[sectionKey] || [];
  return list.find(item => item?.text)?.text || fallback;
}

function tensionText(analysisSignals, index = 0, fallback = '') {
  const tension = analysisSignals?.crossMetricTensions?.[index];
  if (!tension) return fallback;
  return `${tension.title}: ${tension.evidence} / 의미: ${tension.implication}`;
}

function buildAnalysisBasis(analysisSignals, sectionKey) {
  const comparisonTexts = (analysisSignals?.comparisons?.[sectionKey] || [])
    .filter(item => item?.text || item?.direction)
    .slice(0, 3)
    .map(item => item.text || `${item.label} ${item.direction}`);
  const sourceTypes = [...new Set((analysisSignals?.comparisons?.[sectionKey] || [])
    .map(item => item?.sourceType)
    .filter(Boolean))];
  return {
    comparison: comparisonTexts,
    sourceTypes,
    dataLineage: analysisSignals?.dataLineage || null,
    watchPoints: (analysisSignals?.watchPoints || []).slice(0, 2)
  };
}

function sanitizeInsightBullet(text) {
  return String(text || '')
    .replace(/고정\s*값|갱신\s*값|fixed_dataset|api_cached|fallback|캐시|snapshot|reference_date/gi, '자료 기준')
    .replace(/원인\s*단정|단정|분리\s*해석|기준\s*차이|유의|주의/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildEvidenceRefs(sectionKey, findings = []) {
  return findings
    .filter(Boolean)
    .slice(0, 6)
    .map((text, index) => ({
      id: `${sectionKey}-${index + 1}`,
      sectionKey,
      text,
      sourceType: 'mock-derived'
    }));
}

function buildMetricInterpretations({ districtData = {}, cultureMetrics = {}, analysisSignals = null } = {}) {
  const gu = districtData.gu || cultureMetrics.gu || '선택 자치구';
  const population = getPopulationSignals(districtData);
  const culture = getCultureSignals(cultureMetrics);
  const education = getEducationSignals(districtData);
  const social = getSocialSignals(districtData);

  const seniorText = population.seniorRate !== null
    ? `65세 이상 ${formatNumber(population.senior, '명')}(${formatPercent(population.seniorRate)}) 규모 확인`
    : '고령층 비중 산출 대기';
  const childText = population.childRate !== null
    ? `0-9세 ${formatNumber(population.child, '명')}(${formatPercent(population.childRate)}) 규모 확인`
    : '아동층 비중 산출 대기';
  const livingText = population.livingAvailable
    ? `생활인구 ${formatNumber(population.livingTotal, '명')} 병행 확인 가능`
    : '생활인구 API 응답 대기 또는 fallback 상태';

  const welfareCompare = social.recipientGap === null
    ? '수급률 비교 기준 대기'
    : social.recipientGap > 0
      ? `수급률 서울 평균 대비 ${formatPercent(social.recipientGap)}p 높음`
      : `수급률 서울 평균 대비 ${formatPercent(Math.abs(social.recipientGap))}p 낮음`;

  const populationFindings = [
    `근거: ${firstSignalText(analysisSignals, 'population', `주민등록 총인구 ${formatNumber(population.total, '명')} 기준 구조 확인`)} / 의미: 규모 자체보다 연령별 접근 경로에 맞춰 서비스 시간대를 분리 운영해야 함.`,
    `근거: ${seniorText} / 의미: 고령층 지표는 프로그램 확대 단독 근거가 아니라 이동성, 대면 안내, 체류 공간을 우선 배치하는 근거.`,
    `근거: ${childText} / 의미: 아동층 규모는 가족 단위 방문과 학교 연계형 접점 설계 가능성을 판단하는 보조 기준.`,
    `근거: ${livingText} / 의미: 정주 인구와 유입·생활 인구의 차이에 맞춰 운영 시간대와 안내 채널을 분리해야 함.`
  ];
  const cultureFindings = [
    `근거: ${firstSignalText(analysisSignals, 'culture', `공공문화시설 ${formatNumber(culture.publicCultureFacilities, '개')}, 인구 10만 명당 ${formatNumber(culture.publicCultureFacilitiesPer100k, '개')} 수준`)} / 의미: 시설 총량보다 도서관이 연결 또는 보완해야 할 문화 접점 판단에 사용.`,
    `근거: ${analysisSignals?.comparisons?.culture?.find(item => item.key === 'libraries_per100k')?.text || `도서관 ${formatNumber(culture.librariesTotal, '개')}, 인구 10만 명당 ${formatNumber(culture.librariesPer100k, '개')} 수준`} / 의미: 도서관 밀도는 생활권 문화정보 전달과 프로그램 협력 부담을 가늠하는 기준.`,
    `근거: 생활문화센터 ${formatNumber(culture.lifeCultureCenters, '개')}, 무장애 인증 문화공간 ${formatNumber(culture.barrierFreeSpaces, '개')} 확인 / 의미: 생활문화와 포용 접근성의 차이에 맞춰 도서관 공간과 안내 동선을 보완 배치해야 함.`,
    `근거: ${tensionText(analysisSignals, 0, `문화정책 조례 ${formatNumber(culture.ordinanceCount, '건')}, 제·개정 ${formatNumber(culture.revisionCount, '건')} 확인`)} / 의미: 문화 기반과 도서관 밀도 간 차이가 있으면 도서관을 협력 거점 또는 조정 거점으로 우선 배치해야 함.`
  ];
  const educationFindings = [
    `근거: ${firstSignalText(analysisSignals, 'education', `교육기관 총 ${formatNumber(education.schoolTotal, '개교')} 수준`)} / 의미: 학교 수는 수요 추정치가 아니라 도서관 외부 협력 경로의 후보 밀도.`,
    education.topSchoolLevel
      ? `근거: 가장 많은 학교급은 ${education.topSchoolLevel.name} ${formatNumber(education.topSchoolLevel.value, '개교')}이며 ${firstSignalText(analysisSignals, 'population', '인구구조와 함께 확인 필요')} / 의미: 학교급별 접점과 연령 구조를 결합해 프로그램 대상, 시간대, 홍보 채널을 분리 운영해야 함.`
      : '근거: 학교급별 상세 규모 산출 대기 / 의미: 교육 연계 판단은 상세 목록 확보 후 보류.',
    `근거: 상세 목록 ${formatNumber(education.detailTotal, '개')} 항목 수집 상태 / 의미: 주소 기반 목록은 실제 권역·거리·이동 경로 검토의 입력값.`,
    `근거: 공공도서관 ${formatNumber(education.publicLibraryCount, '개관')}, 당월 문화행사 ${formatNumber(education.liveCultureEventsMonth, '건')}, ${firstSignalText(analysisSignals, 'culture', '문화시설·도서관 기반 확인')} / 의미: 학교 연계와 문화행사를 묶어 프로그램 장소, 홍보 채널, 협력기관 역할을 생활권별로 배치해야 함.`
  ];
  const socialFindings = [
    `근거: ${analysisSignals?.comparisons?.socialSafety?.[0]?.direction || welfareCompare} / 의미: 수급률은 지역 문제 단정이 아니라 정보 도달성과 대면 안내 접점을 우선 배치하는 기준.`,
    social.householdTop
      ? `근거: 가구 구성 최상위 항목은 ${social.householdTop.name} ${formatNumber(social.householdTop.value, '가구')} / 의미: 가구 축은 개인 속성보다 안내 방식과 생활 지원 접점 분리 기준.`
      : '가구 구성 상세 항목 대기.',
    social.disabilityTop
      ? `근거: 장애 대분류 최상위 항목은 ${social.disabilityTop.name} ${formatNumber(social.disabilityTop.value, '명')} / 의미: 이동·감각·정보 접근성 중 어떤 보완 조건이 중요한지 나누는 기준.`
      : '장애 구성 상세 항목 대기.',
    social.foreignTop
      ? `근거: 외국인 관련 최상위 항목은 ${social.foreignTop.name} ${formatNumber(social.foreignTop.value, '명')} / 의미: 언어·생활정보·체류 접점 안내를 채널별로 분리 제공해야 함.`
      : '외국인 주민 유형 또는 국적 구성 대기.',
    `근거: ${firstSignalText(analysisSignals, 'population', '인구구조와 사회안전망 구성의 접점 확인')}, ${firstSignalText(analysisSignals, 'culture', '문화시설·도서관·무장애 조건 확인')} / 의미: 사회안전망은 대상자 규모보다 연령·생활권·공간 조건에 맞춰 안내, 언어 지원, 이동 보조, 대면 지원 경로를 분리 제공해야 함.`
  ];
  const householdFindings = [
    `근거: 사회안전망 가구 유형 전체 ${formatNumber(social.householdTotal, '가구')} 기준 구성 확인 / 의미: 생활 지원 접점과 안내 방식 분리의 기본 분모.`,
    social.householdTop
      ? `근거: ${social.householdTop.name} ${formatNumber(social.householdTop.value, '가구')}가 가구 축의 최상위 항목 / 의미: 대면 안내, 신청 보조, 생활권 정보 제공 방식을 우선 편성해야 함.`
      : '가구 구성 최상위 항목 산출 대기.',
    `근거: ${welfareCompare} / 의미: 수급률과 가구 구성은 직접 합산하지 않고 생활 지원 접점의 강도와 방식으로 분리 해석.`,
    '근거: 가구 유형은 개인 속성 단정 불가 / 의미: 안내 방식, 대면 지원, 생활권 접점 설계의 단위로만 사용.'
  ];
  const disabilityFindings = [
    `근거: 장애 관련 구성 전체 ${formatNumber(social.disabledTotal, '명')} 기준 구성 확인 / 의미: 시설 접근성뿐 아니라 정보 접근 보조와 프로그램 참여 보조의 분모.`,
    social.disabilityTop
      ? `근거: ${social.disabilityTop.name} ${formatNumber(social.disabilityTop.value, '명')}가 장애 대분류 축의 최상위 항목 / 의미: 이동·감각·의사소통·정보 접근성 지원을 기능 조건별로 분리 배치해야 함.`
      : '장애 대분류 최상위 항목 산출 대기.',
    '근거: 장애 대분류는 기능 조건별 묶음 / 의미: 이동, 감각/의사소통, 정보 접근 보조를 분리 제공해야 함.',
    '근거: 장애 구성은 시설 이용만으로 환원 불가 / 의미: 프로그램 안내, 참여 보조, 온라인 정보 도달성과 함께 해석 필요.'
  ];
  const foreignFindings = [
    `근거: 외국인 주민 유형 전체 ${formatNumber(social.foreignTotal, '명')}, 등록외국인 국적 전체 ${formatNumber(social.registeredForeignerTotal, '명')} 기준 확인 / 의미: 유형과 국적은 같은 분모로 섞지 않고 안내 채널 판단에 병렬 사용.`,
    social.foreignResidentTypeTop
      ? `근거: ${social.foreignResidentTypeTop.name} ${formatNumber(social.foreignResidentTypeTop.value, '명')}가 외국인 주민 유형 축의 최상위 항목 / 의미: 체류·가족·학업·근로 접점별 정보 전달 방식 분리 기준.`
      : '외국인 주민 유형 최상위 항목 산출 대기.',
    social.foreignNationalityTop
      ? `근거: ${social.foreignNationalityTop.name} ${formatNumber(social.foreignNationalityTop.value, '명')}가 등록외국인 국적 축의 최상위 항목 / 의미: 문화 선호 추정이 아니라 다국어 안내와 생활정보 채널을 우선 제공하는 근거.`
      : '등록외국인 국적 최상위 항목 산출 대기.',
    '근거: 외국인 관련 지표는 통계 기준 차이 존재 / 의미: 언어 접근성, 체류/생활권 접점, 정보 안내 경로를 분리 제공해야 함.'
  ];
  const socialSafetySegments = {
    household: {
      sectionKey: 'socialSafety.household',
      title: '가구 구성 인사이트',
      modelRecommendation: MODEL_RECOMMENDATIONS.metricBrief,
      summary: `${gu}의 사회안전망 가구 유형을 생활 지원 접점과 안내 방식 관점에서 해석.`,
      keyFindings: householdFindings,
      cautions: [
        '가구 유형은 복지 수요의 단독 원인이 아니라 서비스 접근 경로를 나누는 참고 기준.',
        '수급률 비교는 주민등록인구 분모 기준이므로 가구 구성과 직접 합산하지 않음.'
      ],
      evidenceRefs: buildEvidenceRefs('socialSafety.household', householdFindings),
      analysisBasis: buildAnalysisBasis(analysisSignals, 'socialSafety'),
      qualityFlags: ['mock_contract_ready', 'sensitive_indicator'],
      recommendedView: '가구 탭 대표 수치, 구성 막대, 상세 항목',
      reportUse: '사회안전망 가구 축 하위 해석에 사용'
    },
    disability: {
      sectionKey: 'socialSafety.disability',
      title: '장애 구성 인사이트',
      modelRecommendation: MODEL_RECOMMENDATIONS.metricBrief,
      summary: `${gu}의 장애 대분류 구성을 이동·감각·정보 접근성 설계 관점에서 해석.`,
      keyFindings: disabilityFindings,
      cautions: [
        '장애 유형 구성은 개인별 필요를 직접 추론하지 않고 접근성 설계 범주로만 사용.',
        '문화시설 무장애 조건, 도서관 동선, 프로그램 참여 보조와 함께 재검토 필요.'
      ],
      evidenceRefs: buildEvidenceRefs('socialSafety.disability', disabilityFindings),
      analysisBasis: buildAnalysisBasis(analysisSignals, 'socialSafety'),
      qualityFlags: ['mock_contract_ready', 'sensitive_indicator'],
      recommendedView: '장애 탭 대표 수치, 대분류 구성 막대, 상세 항목',
      reportUse: '사회안전망 장애 축 하위 해석에 사용'
    },
    foreign: {
      sectionKey: 'socialSafety.foreign',
      title: '외국인 구성 인사이트',
      modelRecommendation: MODEL_RECOMMENDATIONS.metricBrief,
      summary: `${gu}의 외국인 주민 유형과 국적 구성을 언어·정보 도달성 관점에서 해석.`,
      keyFindings: foreignFindings,
      cautions: [
        '외국인 주민 유형과 등록외국인 국적은 통계 기준이 다르므로 같은 분모로 직접 비교하지 않음.',
        '국적 구성은 문화 선호 추정이 아니라 다국어 안내와 생활정보 접근성 점검 기준으로 사용.'
      ],
      evidenceRefs: buildEvidenceRefs('socialSafety.foreign', foreignFindings),
      analysisBasis: buildAnalysisBasis(analysisSignals, 'socialSafety'),
      qualityFlags: ['mock_contract_ready', 'sensitive_indicator'],
      recommendedView: '외국인 탭 주민 유형·국적 구성 병렬 시각화',
      reportUse: '사회안전망 외국인 축 하위 해석에 사용'
    }
  };

  const interpretations = {
    population: {
      sectionKey: 'population',
      title: '인구구조 분석 해석',
      modelRecommendation: MODEL_RECOMMENDATIONS.metricBrief,
      summary: `${gu}의 주민등록 인구와 생활인구 병행 검토를 위한 기초 해석.`,
      keyFindings: populationFindings,
      cautions: [
        '생활인구와 주민등록인구는 산정 목적과 기준일이 달라 직접 증감 비교보다 보조 맥락으로 활용.',
        '연령대 색상은 서비스 대상 구분을 돕는 시각화 기준이며 정책 우선순위의 단독 근거 아님.'
      ],
      evidenceRefs: buildEvidenceRefs('population', populationFindings),
      analysisBasis: buildAnalysisBasis(analysisSignals, 'population'),
      qualityFlags: ['mock_contract_ready'],
      recommendedView: '연령대 막대, 성별 도넛, 주민등록/생활인구 전환',
      reportUse: '지역 개요와 인구구조 본문에 사용',
      promptContract: [
        '인구 규모, 아동층, 생산연령대, 고령층을 분리 서술.',
        '생활인구가 없을 경우 결측/대기 상태를 명시.',
        '문장 종결은 명사형 어미 중심.'
      ]
    },
    culture: {
      sectionKey: 'culture',
      title: '문화역량·향유 지표 해석',
      modelRecommendation: MODEL_RECOMMENDATIONS.batchPrecompute,
      summary: `${gu}의 문화시설 공급, 도서관 접근성, 문화향유 참고값 연결을 위한 해석.`,
      keyFindings: cultureFindings,
      cautions: [
        '2024 문화향유 참고값은 서울시 집단별 조사값이며 자치구별 직접 순위 아님.',
        '고정 데이터셋 성격이 강해 최초 생성 후 DB 저장형 해석에 적합.'
      ],
      evidenceRefs: buildEvidenceRefs('culture', cultureFindings),
      analysisBasis: buildAnalysisBasis(analysisSignals, 'culture'),
      qualityFlags: ['mock_contract_ready', 'static_dataset'],
      recommendedView: '지표 카드, 참여자 유형별 강조 리스트, 시설 공급 비교',
      reportUse: '문화역량·향유 본문과 유의사항에 사용',
      promptContract: [
        '시설 공급량과 인구 대비 접근성을 분리.',
        '문화향유 참고값은 보조 기준선으로만 표현.',
        '정책·시설·향유 간 연결 가능성을 실행 처방으로 표현.'
      ]
    },
    education: {
      sectionKey: 'education',
      title: '교육인프라 해석',
      modelRecommendation: MODEL_RECOMMENDATIONS.metricBrief,
      summary: `${gu}의 학교급별 시설 목록과 도서관 서비스 연계 가능성 해석.`,
      keyFindings: educationFindings,
      cautions: [
        '학교 목록은 위치·주소 기반 접근성 판단의 시작점이며 실제 협력 가능성은 기관별 프로그램 확인 필요.',
        '학교급별 수요를 단순 합산하기보다 연령구조와 함께 해석 필요.'
      ],
      evidenceRefs: buildEvidenceRefs('education', educationFindings),
      analysisBasis: buildAnalysisBasis(analysisSignals, 'education'),
      qualityFlags: ['mock_contract_ready'],
      recommendedView: '학교급 탭, 2열 리스트, 도서관 연계 지표',
      reportUse: '교육인프라 본문과 도서관 서비스 시사점에 사용',
      promptContract: [
        '학교급별 규모, 상세 목록 상태, 도서관 연계 가능성을 분리.',
        '교육기관 숫자를 서비스 수요의 직접 추정치로 단정하지 않음.',
        '지역 협력 자원 관점으로 표현.',
        '인구구조의 아동·청소년·생활인구 조건과 함께 해석.',
        '문화시설·도서관 기반과 결합해 시간대, 홍보 채널, 협력기관 역할을 나누는 판단으로 표현.'
      ]
    },
    socialSafety: {
      sectionKey: 'socialSafety',
      title: '사회안전망 대상자 구성 종합 인사이트',
      modelRecommendation: MODEL_RECOMMENDATIONS.metricBrief,
      summary: `${gu}의 가구, 장애, 외국인, 수급률 지표를 접근성 관점에서 묶은 해석.`,
      keyFindings: socialFindings,
      cautions: [
        '대상자 구성은 서비스 접근성 점검을 위한 참고값이며 개인 단위 수요를 직접 추론하지 않음.',
        '외국인 주민 유형과 등록외국인 국적은 통계 기준이 다를 수 있어 별도 축으로 유지.'
      ],
      evidenceRefs: buildEvidenceRefs('socialSafety', socialFindings),
      analysisBasis: buildAnalysisBasis(analysisSignals, 'socialSafety'),
      qualityFlags: ['mock_contract_ready', 'sensitive_indicator'],
      recommendedView: '가구/장애/외국인 탭형 통합 카드',
      reportUse: '사회안전망 본문과 해석 유의사항에 사용',
      segments: socialSafetySegments,
      promptContract: [
        '가구, 장애, 외국인을 한 문단에서 뭉개지 않고 축별로 분리.',
        '상위 구성항목은 명수와 비중을 함께 해석.',
        '취약성 단정 대신 접근성·언어·이동·정보 도달성 관점으로 표현.',
        '인구구조와 문화 접근성, 도서관·교육 협력 자원을 함께 읽어 서비스 도달 경로를 판단.',
        '장애·외국인·가구 축은 무장애 문화공간, 도서관 밀도, 학교·공공기관 접점과 연결해 안내 채널·공간·대면 지원을 나누는 근거로 사용.'
      ]
    }
  };

  return interpretations;
}

function buildDistrictInsight({ districtData = {}, cultureMetrics = {}, interpretations = {}, analysisSignals = null } = {}) {
  const gu = districtData.gu || '선택 자치구';
  const population = getPopulationSignals(districtData);
  const culture = getCultureSignals(cultureMetrics);
  const education = getEducationSignals(districtData);
  const social = getSocialSignals(districtData);
  const populationAxis = population.livingAvailable
    ? '생활인구와 주민등록인구가 함께 확인되는 구조'
    : '주민등록인구 기반 연령 구조';
  const socialAxis = social.householdTop?.name
    ? `${social.householdTop.name}와 사회안전망 지표`
    : '사회안전망 지표';
  const cultureAxis = culture.lifeCultureCenters === 0
    ? '생활문화센터 공백과 문화시설 기반'
    : '문화시설과 도서관 기반';
  const accessibilityAxis = culture.barrierFreeSpaces
    ? '무장애 문화공간 조건'
    : '문화 접근성 조건';
  const educationAxis = education.topSchoolLevel?.name
    ? `${education.topSchoolLevel.name} 중심 학교 목록`
    : '학교급별 교육기관 목록';
  const cards = [
    {
      label: '핵심 판단',
      text: analysisSignals?.crossMetricTensions?.[1]?.implication
        ? `${populationAxis}와 ${socialAxis}가 함께 보이므로 정주·유입·생활 접근성 차이에 따라 서비스를 분리 운영해야 함. ${analysisSignals.crossMetricTensions[1].implication}`
        : `${populationAxis}와 ${socialAxis}가 함께 보이므로 도서관 서비스 대상을 정주·유입·생활 접근성 차이에 따라 분리 운영해야 함.`,
      bullets: [
        `${populationAxis} 기준 서비스 시간대 분리`,
        `${socialAxis} 기준 안내·대면 접점 우선 배치`,
        '정주·유입·생활권 접근성 차이 반영'
      ].map(sanitizeInsightBullet)
    },
    {
      label: '주의 지점',
      text: analysisSignals?.crossMetricTensions?.[0]?.implication
        ? `${cultureAxis}이 ${accessibilityAxis}과 맞물리므로 시설 수량만으로 해석하면 부족함. ${analysisSignals.crossMetricTensions[0].implication}`
        : `${cultureAxis}이 ${accessibilityAxis}과 맞물리므로 시설 수량보다 일상 이용 접점과 이동 접근성 보완을 먼저 배치해야 함.`,
      bullets: [
        `${cultureAxis}의 생활권 접점 공백 가능성`,
        `${accessibilityAxis}과 도서관 안내 동선 연결`,
        '문화시설·도서관·무장애 조건 보완 배치'
      ].map(sanitizeInsightBullet)
    },
    {
      label: '실행 방향',
      text: `${educationAxis}과 도서관·문화행사 정보를 함께 보면 개별 프로그램보다 권역별 협력 경로를 먼저 설계해야 함. 시간대·참여율·공간 이용 데이터는 운영 후 성과관리 지표로 붙인다.`,
      bullets: [
        `${educationAxis} 기반 학교·도서관 협력 경로 설계`,
        '문화행사와 교육기관을 권역 단위로 묶어 운영',
        '참여율·공간 이용을 성과관리 지표로 연결'
      ].map(sanitizeInsightBullet)
    }
  ];
  const evidenceRefs = [
    ...(interpretations.population?.evidenceRefs || []).slice(0, 2),
    ...(interpretations.socialSafety?.evidenceRefs || []).slice(0, 2),
    ...(interpretations.culture?.evidenceRefs || []).slice(0, 2)
  ];

  return {
    sectionKey: 'districtInsight',
    title: `${gu} 종합 인사이트`,
    modelRecommendation: MODEL_RECOMMENDATIONS.districtInsight,
    cards,
    cautions: [
      'mock 인사이트는 실제 LLM 호출 전 계약 검증용 문구.',
    '정책 실행은 보고서 생성 단계에서 우선순위와 담당 경로를 붙여 확정.'
    ],
    evidenceRefs,
    qualityFlags: ['mock_contract_ready'],
    promptContract: [
      '3개 카드, 카드당 1문장.',
      '지표 해석을 실행 처방으로 연결하되 입력에 없는 인과는 만들지 않음.',
      '자치구 보고서의 흐름과 충돌하지 않도록 핵심 축만 제시.'
    ]
  };
}

function buildDistrictReport({ districtData = {}, cultureMetrics = {}, interpretations = {}, insight = {}, analysisSignals = null } = {}) {
  const gu = districtData.gu || cultureMetrics.gu || '선택 자치구';
  const title = `${gu} 지역사회 인사이트 보고서 초안`;
  const insightCardText = (insight.cards || [])
    .map(card => card?.text)
    .filter(Boolean);
  const executiveBody = insightCardText.length >= 3
    ? `${gu}의 핵심 판단은 ${insightCardText[0]} ${insightCardText[1]} ${insightCardText[2]}`
    : `${gu}의 인구구조, 문화역량, 교육인프라, 사회안전망 지표를 통합해 도서관 운영 단위와 우선순위를 정해야 함.`;
  const libraryImplicationBody = [
    '인구구조의 이용 시간대·이동성 조건, 사회안전망의 정보 도달성 조건, 문화·교육 인프라의 협력 자원을 연결해 도서관 운영 단위를 나누어야 함.',
    '단일 프로그램 확대보다 권역, 대상, 접근 방식별로 서비스 시간대와 안내 채널을 분리 설계해야 함.'
  ].join(' ');
  const cautionBody = [
    '생활인구와 주민등록인구의 기준 차이, 문화향유 고정 데이터셋의 서울시 조사값 성격, 사회안전망 민감 지표의 비단정 원칙을 분리해 해석할 필요.',
    '지표 갱신 시점과 원천별 기준일이 다르므로 보고서 생성 시 snapshot 단위 관리가 필요함.'
  ].join(' ');
  const analysisSignalBullets = [
    ...(analysisSignals?.notableSignals || []).slice(0, 4).map(item => `${item.label}: ${item.evidence}`),
    ...(analysisSignals?.crossMetricTensions || []).slice(0, 3).map(item => `${item.title}: ${item.implication}`)
  ];
  const sections = [
    {
      heading: '1. 종합 판단',
      body: executiveBody,
      bullets: (insight.cards || []).map(card => `${card.label}: ${card.text}`)
    },
    {
      heading: '2. 인구구조',
      body: interpretations.population?.summary || '인구구조 해석 대기.',
      bullets: interpretations.population?.keyFindings || []
    },
    {
      heading: '3. 문화역량·향유',
      body: interpretations.culture?.summary || '문화역량 해석 대기.',
      bullets: interpretations.culture?.keyFindings || []
    },
    {
      heading: '4. 교육인프라',
      body: interpretations.education?.summary || '교육인프라 해석 대기.',
      bullets: interpretations.education?.keyFindings || []
    },
    {
      heading: '5. 사회안전망 대상자 구성',
      body: interpretations.socialSafety?.summary || '사회안전망 해석 대기.',
      bullets: interpretations.socialSafety?.keyFindings || []
    },
    {
      heading: '6. 도서관 서비스 시사점',
      body: libraryImplicationBody,
      bullets: [
        ...analysisSignalBullets.slice(0, 3),
        ...(interpretations.population?.keyFindings || []).slice(0, 1),
        ...(interpretations.socialSafety?.keyFindings || []).slice(0, 1),
        ...(interpretations.culture?.keyFindings || []).slice(0, 1),
        ...(interpretations.education?.keyFindings || []).slice(0, 1)
      ]
    },
    {
      heading: '7. 해석 유의사항',
      body: cautionBody,
      bullets: [
        ...(interpretations.population?.cautions || []),
        ...(interpretations.culture?.cautions || []),
        ...(interpretations.socialSafety?.cautions || [])
      ].slice(0, 6)
    }
  ];

  const markdown = [
    `# ${title}`,
    '',
    `- 하네스 버전: ${HARNESS_VERSION}`,
    `- 추천 모델: ${formatModelRecommendation(MODEL_RECOMMENDATIONS.districtReport)}`,
    `- 문체: ${OUTPUT_STYLE_GUIDE.sentenceEnding}`,
    '',
    ...sections.flatMap(section => [
      `## ${section.heading}`,
      '',
      section.body,
      '',
      ...section.bullets.map(item => `- ${item}`),
      ''
    ])
  ].join('\n');

  const html = [
    `<article data-harness-version="${HARNESS_VERSION}">`,
    `<h1>${escapeHtml(title)}</h1>`,
    ...sections.map(section => [
      '<section>',
      `<h2>${escapeHtml(section.heading)}</h2>`,
      `<p>${escapeHtml(section.body)}</p>`,
      '<ul>',
      ...section.bullets.map(item => `<li>${escapeHtml(item)}</li>`),
      '</ul>',
      '</section>'
    ].join('')),
    '</article>'
  ].join('');

  return {
    sectionKey: 'districtReport',
    title,
    subtitle: 'HTML/PDF/Markdown 변환을 전제로 한 자치구 인사이트 보고서 구조',
    modelRecommendation: MODEL_RECOMMENDATIONS.districtReport,
    outputStyle: OUTPUT_STYLE_GUIDE,
    sections,
    markdown,
    html,
    evidenceRefs: Object.values(interpretations)
      .flatMap(packet => packet?.evidenceRefs || [])
      .slice(0, 24),
    cautions: sections.find(section => section.heading?.startsWith('7.'))?.bullets || [],
    qualityFlags: ['mock_contract_ready', 'report_template_draft']
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHarnessPayload({ districtData = {}, cultureMetrics = {} } = {}) {
  const analysisSignals = buildAnalysisSignals({ districtData, cultureMetrics });
  const interpretations = buildMetricInterpretations({ districtData, cultureMetrics, analysisSignals });
  const insight = buildDistrictInsight({ districtData, cultureMetrics, interpretations, analysisSignals });
  const report = buildDistrictReport({ districtData, cultureMetrics, interpretations, insight, analysisSignals });
  const validationSummary = {
    interpretations: Object.fromEntries(
      Object.entries(interpretations).map(([key, packet]) => [key, validateSectionOutput(key, packet)])
    ),
    insight: validateSectionOutput('districtInsight', insight),
    report: validateSectionOutput('districtReport', report)
  };

  return {
    ok: true,
    mode: 'mock',
    harnessVersion: HARNESS_VERSION,
    modelRegistryVersion: MODEL_REGISTRY_VERSION,
    contractVersion: CONTRACT_VERSION,
    analysisSignalVersion: ANALYSIS_SIGNAL_VERSION,
    outputStyle: OUTPUT_STYLE_GUIDE,
    sectionContracts: SECTION_CONTRACTS,
    qualityGates: QUALITY_GATES,
    reportOutline: REPORT_OUTLINE,
    goldenTestDistricts: GOLDEN_TEST_DISTRICTS,
    modelRecommendations: MODEL_RECOMMENDATIONS,
    snapshotKey: buildSnapshotKey(districtData, cultureMetrics),
    generatedAt: new Date().toISOString(),
    validationSummary,
    analysisSignals,
    interpretations,
    insight,
    report
  };
}

function normalizeStringList(value, { min = 0, max = 4 } = {}) {
  if (!Array.isArray(value)) return null;
  const list = value
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .slice(0, max);
  return list.length >= min ? list : null;
}

function mergeGeneratedInterpretation(basePacket = {}, generatedPacket = {}) {
  const summary = typeof generatedPacket.summary === 'string' && generatedPacket.summary.trim()
    ? generatedPacket.summary.trim()
    : basePacket.summary;
  const keyFindings = normalizeStringList(generatedPacket.keyFindings, { min: 2, max: 4 }) || basePacket.keyFindings;
  const cautions = normalizeStringList(generatedPacket.cautions, { min: 0, max: 2 }) || basePacket.cautions;

  return {
    ...basePacket,
    summary,
    keyFindings,
    cautions,
    qualityFlags: [...new Set([...(basePacket.qualityFlags || []), 'llm_generated_text'])]
  };
}

function mergeGeneratedSocialSafetyInterpretation(basePacket = {}, generatedPacket = {}) {
  const merged = mergeGeneratedInterpretation(basePacket, generatedPacket);
  const segmentKeys = ['household', 'disability', 'foreign'];
  const segments = { ...(basePacket.segments || {}) };

  segmentKeys.forEach((key) => {
    if (segments[key] || generatedPacket.segments?.[key]) {
      segments[key] = mergeGeneratedInterpretation(
        segments[key],
        generatedPacket.segments?.[key]
      );
    }
  });

  return {
    ...merged,
    segments
  };
}

function mergeGeneratedInsight(baseInsight = {}, generatedInsight = {}) {
  const generatedCards = Array.isArray(generatedInsight.cards)
    ? generatedInsight.cards
      .map((card, index) => ({
        label: String(card?.label || baseInsight.cards?.[index]?.label || '').trim(),
        text: String(card?.text || '').trim(),
        bullets: normalizeStringList(card?.bullets, { min: 2, max: 4 }) || baseInsight.cards?.[index]?.bullets || []
      }))
      .filter(card => card.label && card.text)
      .slice(0, 3)
    : null;
  const cards = generatedCards?.length === 3 ? generatedCards : baseInsight.cards;
  const cautions = normalizeStringList(generatedInsight.cautions, { min: 0, max: 2 }) || baseInsight.cautions;

  return {
    ...baseInsight,
    cards,
    cautions,
    qualityFlags: [...new Set([...(baseInsight.qualityFlags || []), 'llm_generated_text'])]
  };
}

function applyGeneratedReportNarrative(report = {}, reportNarrative = {}) {
  if (!reportNarrative || typeof reportNarrative !== 'object') return report;

  const bodyByPrefix = [
    ['1.', reportNarrative.executiveSummary],
    ['2.', reportNarrative.population],
    ['3.', reportNarrative.culture],
    ['4.', reportNarrative.education],
    ['5.', reportNarrative.socialSafety],
    ['6.', reportNarrative.libraryImplications],
    ['7.', reportNarrative.cautions]
  ];

  const sections = (report.sections || []).map(section => {
    const match = bodyByPrefix.find(([prefix, body]) => section.heading?.startsWith(prefix) && typeof body === 'string' && body.trim());
    if (!match) return section;
    return {
      ...section,
      body: match[1].trim()
    };
  });

  const markdown = [
    `# ${report.title}`,
    '',
    `- 하네스 버전: ${HARNESS_VERSION}`,
    `- 추천 모델: ${formatModelRecommendation(report.modelRecommendation)}`,
    `- 문체: ${OUTPUT_STYLE_GUIDE.sentenceEnding}`,
    '',
    ...sections.flatMap(section => [
      `## ${section.heading}`,
      '',
      section.body,
      '',
      ...section.bullets.map(item => `- ${item}`),
      ''
    ])
  ].join('\n');

  const html = [
    `<article data-harness-version="${HARNESS_VERSION}">`,
    `<h1>${escapeHtml(report.title)}</h1>`,
    ...sections.map(section => [
      '<section>',
      `<h2>${escapeHtml(section.heading)}</h2>`,
      `<p>${escapeHtml(section.body)}</p>`,
      '<ul>',
      ...section.bullets.map(item => `<li>${escapeHtml(item)}</li>`),
      '</ul>',
      '</section>'
    ].join('')),
    '</article>'
  ].join('');

  return {
    ...report,
    sections,
    markdown,
    html,
    qualityFlags: [...new Set([...(report.qualityFlags || []), 'llm_report_narrative'])]
  };
}

function mergeGeneratedHarnessPayload({ basePayload = {}, generatedText = {}, districtData = {}, cultureMetrics = {}, aiMeta = {} } = {}) {
  const interpretations = { ...(basePayload.interpretations || {}) };
  for (const sectionKey of ['population', 'culture', 'education', 'socialSafety']) {
    interpretations[sectionKey] = sectionKey === 'socialSafety'
      ? mergeGeneratedSocialSafetyInterpretation(
        interpretations[sectionKey],
        generatedText.interpretations?.[sectionKey]
      )
      : mergeGeneratedInterpretation(
        interpretations[sectionKey],
        generatedText.interpretations?.[sectionKey]
      );
  }

  const insight = mergeGeneratedInsight(basePayload.insight, generatedText.insight);
  let report = buildDistrictReport({
    districtData,
    cultureMetrics,
    interpretations,
    insight,
    analysisSignals: basePayload.analysisSignals
  });
  report = applyGeneratedReportNarrative(report, generatedText.reportNarrative);
  report.qualityFlags = [...new Set([...(report.qualityFlags || []), 'llm_generated_source_sections'])];

  const validationSummary = {
    interpretations: Object.fromEntries(
      Object.entries(interpretations).map(([key, packet]) => [key, validateSectionOutput(key, packet)])
    ),
    insight: validateSectionOutput('districtInsight', insight),
    report: validateSectionOutput('districtReport', report)
  };

  return {
    ...basePayload,
    mode: 'llm',
    aiMeta,
    generatedAt: new Date().toISOString(),
    validationSummary,
    interpretations,
    insight,
    report
  };
}

module.exports = {
  HARNESS_VERSION,
  MODEL_REGISTRY_VERSION,
  CONTRACT_VERSION,
  OUTPUT_STYLE_GUIDE,
  SECTION_CONTRACTS,
  QUALITY_GATES,
  REPORT_OUTLINE,
  GOLDEN_TEST_DISTRICTS,
  LLM_PROVIDERS,
  LLM_MODEL_CATALOG,
  MODEL_RECOMMENDATIONS,
  buildSnapshotKey,
  ANALYSIS_SIGNAL_VERSION,
  buildMetricInterpretations,
  buildAnalysisSignals,
  buildDistrictInsight,
  buildDistrictReport,
  buildHarnessPayload,
  mergeGeneratedHarnessPayload
};
