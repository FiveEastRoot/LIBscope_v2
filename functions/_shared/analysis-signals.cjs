const staticData = require('./static-data.cjs');
const fs = require('fs');
const path = require('path');

const ANALYSIS_SIGNAL_VERSION = 'analysis-signals-v0.1';

function toNumber(value) {
  if (value === null || value === undefined || value === '' || value === 'NA') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCsv(text = '') {
  const normalized = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!normalized) return [];
  const rows = normalized.split(/\r?\n/).filter(Boolean);
  const headers = splitCsvLine(rows.shift() || '');
  return rows.map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

function splitCsvLine(line = '') {
  const cells = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function getStaticCsv(fileName) {
  if (staticData[fileName]) return staticData[fileName];
  const candidates = [
    path.resolve(process.cwd(), fileName),
    path.resolve(process.cwd(), 'functions/_data', fileName),
    path.resolve(__dirname, '../_data', fileName),
    path.resolve(__dirname, '../../', fileName)
  ];
  const found = candidates.find(candidate => fs.existsSync(candidate));
  return found ? fs.readFileSync(found, 'utf-8') : '';
}

function formatNumber(value, digits = 1) {
  const numeric = toNumber(value);
  if (numeric === null) return '-';
  return numeric.toLocaleString('ko-KR', {
    maximumFractionDigits: digits,
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : Math.min(digits, 1)
  });
}

function compareMetric({ key, label, value, baselineRows = [], accessor, unit = '', higherIs = 'contextual', sourceType = 'static_reference' }) {
  const numeric = toNumber(value);
  const values = baselineRows
    .map(row => toNumber(accessor(row)))
    .filter(item => item !== null)
    .sort((a, b) => b - a);

  if (numeric === null || values.length === 0) {
    return {
      key,
      label,
      value: numeric,
      unit,
      signal: 'comparison_unavailable',
      sourceType,
      higherIs
    };
  }

  const average = values.reduce((sum, item) => sum + item, 0) / values.length;
  const rank = values.filter(item => item > numeric).length + 1;
  const percentile = values.length <= 1 ? 100 : ((values.length - rank) / (values.length - 1)) * 100;
  const gapFromAverage = numeric - average;
  const band = percentile >= 80 ? '상위권'
    : percentile >= 60 ? '상위 중간권'
      : percentile >= 40 ? '중간권'
        : percentile >= 20 ? '하위 중간권'
          : '하위권';
  const direction = gapFromAverage > 0 ? '서울 기준 평균 상회'
    : gapFromAverage < 0 ? '서울 기준 평균 하회'
      : '서울 기준 평균권';

  return {
    key,
    label,
    value: numeric,
    unit,
    average,
    rank,
    totalCount: values.length,
    percentile: Math.round(percentile),
    band,
    direction,
    gapFromAverage,
    higherIs,
    sourceType,
    text: `${label} ${formatNumber(numeric)}${unit}은 25개 자치구 기준 ${band}, 평균 대비 ${formatNumber(Math.abs(gapFromAverage))}${unit} ${gapFromAverage >= 0 ? '높음' : '낮음'}`
  };
}

function sumAge(ageDistribution = {}, matcher) {
  return Object.entries(ageDistribution || {}).reduce((sum, [label, value]) => (
    matcher(label) ? sum + Number(value || 0) : sum
  ), 0);
}

function populationRatesFromDistribution(ageDistribution = {}, totalValue) {
  const total = toNumber(totalValue) || Object.values(ageDistribution || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  const child = sumAge(ageDistribution, label => /^0-4세$|^5-9세$/.test(label));
  const senior = sumAge(ageDistribution, label => {
    const first = Number(String(label).match(/^\d+/)?.[0] || 0);
    return String(label).includes('70세 이상') || first >= 65;
  });
  return {
    total,
    child,
    senior,
    childRate: total ? (child / total) * 100 : null,
    seniorRate: total ? (senior / total) * 100 : null
  };
}

function buildStaticPopulationBaseline() {
  const rows = parseCsv(getStaticCsv('district_age_gender_population.csv'));
  const grouped = new Map();
  rows.forEach((row) => {
    const gu = row['자치구'];
    if (!gu) return;
    if (!grouped.has(gu)) grouped.set(gu, {});
    const dist = grouped.get(gu);
    const label = String(row['연령'] || '')
      .replace('0~4세', '0-4세')
      .replace('5~9세', '5-9세')
      .replace('10~14세', '10-14세')
      .replace('15~19세', '15-19세')
      .replace('20~24세', '20-24세')
      .replace('25~29세', '25-29세')
      .replace('30~34세', '30-34세')
      .replace('35~39세', '35-39세')
      .replace('40~44세', '40-44세')
      .replace('45~49세', '45-49세')
      .replace('50~54세', '50-54세')
      .replace('55~59세', '55-59세')
      .replace('60~64세', '60-64세')
      .replace('65~69세', '65-69세')
      .replace('70~74세', '70-74세')
      .replace('75~79세', '75-79세')
      .replace('80~84세', '80-84세')
      .replace('85~89세', '85-89세')
      .replace('90~94세', '90-94세')
      .replace('95세 이상+', '95세 이상');
    dist[label] = (dist[label] || 0) + Number(row['인구수'] || 0);
  });
  return [...grouped.entries()].map(([gu, ageDistribution]) => ({
    gu,
    ...populationRatesFromDistribution(ageDistribution)
  }));
}

function getResidentPopulation(districtData = {}) {
  return districtData.population?.modes?.resident || districtData.population || {};
}

function getDataLineage(districtData = {}, cultureMetrics = {}) {
  const resident = getResidentPopulation(districtData);
  const living = districtData.population?.modes?.living;
  return {
    version: ANALYSIS_SIGNAL_VERSION,
    fixedDatasets: [
      {
        key: 'culture_metrics_2023',
        label: '2023 서울문화지표 기반 자치구 문화역량 데이터',
        sourceType: 'fixed_dataset',
        refreshPolicy: '수동 교체 전까지 재집계하지 않음',
        reference: cultureMetrics?.source || '2023 서울문화지표 조사연구'
      },
      {
        key: 'culture_enjoyment_2024',
        label: '2024 서울시민 문화향유 실태조사 참고값',
        sourceType: 'fixed_dataset',
        refreshPolicy: '원자료 재추출 또는 조사연도 교체 전까지 재집계하지 않음',
        reference: '2024 서울시민 문화향유 실태조사'
      }
    ],
    refreshableDatasets: [
      {
        key: 'resident_population',
        label: '주민등록인구',
        sourceType: resident?.source?.includes('fallback') ? 'fixed_fallback' : 'api_cached',
        referenceDate: resident?.referenceDate || districtData.population?.referenceDate || null,
        refreshPolicy: '원천 API 기준월 또는 Supabase 적재 reference_date 변경 시 재계산'
      },
      {
        key: 'living_population',
        label: '생활인구',
        sourceType: living?.source === 'living_population_unavailable' ? 'unavailable' : 'api_cached',
        referenceDate: living?.referenceDate || null,
        refreshPolicy: '생활인구 API 기준일 또는 캐시 만료/강제 갱신 시 재계산'
      },
      {
        key: 'social_safety',
        label: '사회안전망 구성 지표',
        sourceType: districtData.socialIndicators?.source?.includes('fallback') ? 'fixed_fallback' : 'api_cached',
        referenceDate: districtData.socialIndicators?.referenceDate || null,
        refreshPolicy: 'KOSIS/Supabase 원천 reference_date 변경 시 재계산'
      },
      {
        key: 'education_and_events',
        label: '교육기관·문화행사',
        sourceType: 'api_cached_or_static_list',
        refreshPolicy: '학교 목록 변경 또는 문화행사 월별 API 갱신 시 재계산'
      }
    ]
  };
}

function buildAnalysisSignals({ districtData = {}, cultureMetrics = {} } = {}) {
  const gu = districtData.gu || cultureMetrics.gu || '선택 자치구';
  const populationBaseline = buildStaticPopulationBaseline();
  const cultureBaseline = parseCsv(getStaticCsv('district_culture_enjoyment_metrics.csv'));
  const socialBaseline = parseCsv(getStaticCsv('district_data_combined.csv'));
  const resident = getResidentPopulation(districtData);
  const populationRates = populationRatesFromDistribution(resident?.ageDistribution, resident?.total);
  const schoolTotal = Object.values(districtData.cultureAndEducation?.schools || {})
    .reduce((sum, value) => sum + Number(value || 0), 0);

  const comparisons = {
    population: [
      compareMetric({
        key: 'resident_total',
        label: '주민등록 총인구',
        value: populationRates.total,
        baselineRows: populationBaseline,
        accessor: row => row.total,
        unit: '명',
        sourceType: resident?.source?.includes('fallback') ? 'fixed_fallback_reference' : 'api_cached_current_static_baseline'
      }),
      compareMetric({
        key: 'child_rate',
        label: '0-9세 비중',
        value: populationRates.childRate,
        baselineRows: populationBaseline,
        accessor: row => row.childRate,
        unit: '%',
        sourceType: resident?.source?.includes('fallback') ? 'fixed_fallback_reference' : 'api_cached_current_static_baseline'
      }),
      compareMetric({
        key: 'senior_rate',
        label: '65세 이상 비중',
        value: populationRates.seniorRate,
        baselineRows: populationBaseline,
        accessor: row => row.seniorRate,
        unit: '%',
        sourceType: resident?.source?.includes('fallback') ? 'fixed_fallback_reference' : 'api_cached_current_static_baseline'
      })
    ],
    culture: [
      compareMetric({
        key: 'culture_facilities_per100k',
        label: '인구 10만 명당 공공문화시설',
        value: cultureMetrics.public_culture_facilities_per100k,
        baselineRows: cultureBaseline,
        accessor: row => row.public_culture_facilities_per100k,
        unit: '개',
        sourceType: 'fixed_dataset'
      }),
      compareMetric({
        key: 'libraries_per100k',
        label: '인구 10만 명당 도서관',
        value: cultureMetrics.libraries_per100k,
        baselineRows: cultureBaseline,
        accessor: row => row.libraries_per100k,
        unit: '개',
        sourceType: 'fixed_dataset'
      }),
      compareMetric({
        key: 'barrier_free_per100k',
        label: '인구 10만 명당 무장애 문화공간',
        value: cultureMetrics.barrier_free_indoor_culture_spaces_per100k,
        baselineRows: cultureBaseline,
        accessor: row => row.barrier_free_indoor_culture_spaces_per100k,
        unit: '개',
        sourceType: 'fixed_dataset'
      })
    ],
    education: [
      compareMetric({
        key: 'school_total',
        label: '학교 총량',
        value: schoolTotal,
        baselineRows: socialBaseline,
        accessor: row => Number(row['초등학교'] || 0) + Number(row['중학교'] || 0) + Number(row['고등학교'] || 0),
        unit: '개교',
        sourceType: 'api_cached_or_static_list'
      })
    ],
    socialSafety: [
      {
        key: 'welfare_rate_vs_seoul',
        label: '기초생활 수급률 서울 평균 대비',
        value: toNumber(districtData.welfare?.recipientRate),
        unit: '%',
        average: toNumber(districtData.welfare?.seoulAvgRecipientRate),
        gapFromAverage: toNumber(districtData.welfare?.recipientRate) !== null && toNumber(districtData.welfare?.seoulAvgRecipientRate) !== null
          ? toNumber(districtData.welfare.recipientRate) - toNumber(districtData.welfare.seoulAvgRecipientRate)
          : null,
        direction: toNumber(districtData.welfare?.recipientRate) !== null && toNumber(districtData.welfare?.seoulAvgRecipientRate) !== null
          ? toNumber(districtData.welfare.recipientRate) >= toNumber(districtData.welfare.seoulAvgRecipientRate)
            ? '서울 평균 상회'
            : '서울 평균 하회'
          : '비교 불가',
        sourceType: districtData.welfare?.source?.includes('fallback') ? 'fixed_fallback_reference' : 'api_cached_current'
      },
      compareMetric({
        key: 'static_welfare_rate_rank',
        label: '수급률 고정 기준 자치구 비교',
        value: districtData.welfare?.recipientRate,
        baselineRows: socialBaseline,
        accessor: row => row['수급률'],
        unit: '%',
        sourceType: 'fixed_reference_baseline'
      })
    ]
  };

  const allComparisons = Object.values(comparisons).flat();
  const notableSignals = allComparisons
    .filter(item => ['상위권', '하위권'].includes(item.band) || Math.abs(Number(item.gapFromAverage || 0)) > 0)
    .slice(0, 8)
    .map(item => ({
      metricKey: item.key,
      label: item.label,
      signal: item.band || item.direction,
      evidence: item.text || `${item.label} ${item.direction}`,
      sourceType: item.sourceType
    }));

  const culturePer = comparisons.culture.find(item => item.key === 'culture_facilities_per100k');
  const libraryPer = comparisons.culture.find(item => item.key === 'libraries_per100k');
  const schoolSignal = comparisons.education[0];
  const seniorSignal = comparisons.population.find(item => item.key === 'senior_rate');
  const childSignal = comparisons.population.find(item => item.key === 'child_rate');
  const welfareSignal = comparisons.socialSafety[0];

  const crossMetricTensions = [
    culturePer?.band && libraryPer?.band && culturePer.band !== libraryPer.band
      ? {
        title: '문화시설 공급과 도서관 밀도 간 차이',
        evidence: `${culturePer.text}; ${libraryPer.text}`,
        implication: '도서관을 문화시설의 단순 대체재가 아니라 생활권 연결 또는 보완 거점으로 볼 필요',
        sourceType: 'fixed_dataset'
      }
      : null,
    seniorSignal?.band && childSignal?.band && seniorSignal.band !== childSignal.band
      ? {
        title: '아동층과 고령층 비중의 비대칭',
        evidence: `${childSignal.text}; ${seniorSignal.text}`,
        implication: '연령대별 프로그램 수량보다 시간대, 안내 방식, 공간 체류 조건을 분리해 볼 필요',
        sourceType: seniorSignal.sourceType
      }
      : null,
    schoolSignal?.band && ['상위권', '상위 중간권'].includes(schoolSignal.band) && libraryPer?.band && ['하위권', '하위 중간권'].includes(libraryPer.band)
      ? {
        title: '교육기관 밀도와 도서관 밀도 간 불균형',
        evidence: `${schoolSignal.text}; ${libraryPer.text}`,
        implication: '학교 연계 수요를 도서관 내부 프로그램으로만 흡수하기보다 권역·기관 협력 경로 설계 필요',
        sourceType: 'mixed_static_refreshable'
      }
      : null,
    welfareSignal?.gapFromAverage !== null && seniorSignal?.band && Math.abs(welfareSignal.gapFromAverage) > 1
      ? {
        title: '사회안전망 지표와 연령구조의 동시 검토 지점',
        evidence: `${welfareSignal.label} ${welfareSignal.direction}; ${seniorSignal.text}`,
        implication: '대상자 규모 단정이 아니라 정보 도달성, 이동성, 대면 안내 채널을 분리하는 판단 기준으로 활용',
        sourceType: 'api_cached_current'
      }
      : null
  ].filter(Boolean);

  return {
    version: ANALYSIS_SIGNAL_VERSION,
    gu,
    dataLineage: getDataLineage(districtData, cultureMetrics),
    comparisons,
    notableSignals,
    crossMetricTensions,
    serviceHypotheses: [
      {
        title: '생활권 접근성 기반 서비스 분화',
        basis: notableSignals.slice(0, 3).map(item => item.evidence),
        hypothesis: '상위/하위권 지표가 엇갈리는 영역은 서비스 확대보다 접근 경로 재배치 검토가 우선',
        confidence: notableSignals.length >= 3 ? '중간' : '낮음'
      },
      {
        title: '기관 협력 경로 우선 점검',
        basis: crossMetricTensions.map(item => item.title),
        hypothesis: '문화·교육·사회안전망 지표가 교차하는 지점에서 도서관 단독 실행보다 협력 경로 설계가 유효',
        confidence: crossMetricTensions.length >= 2 ? '중간' : '낮음'
      }
    ],
    watchPoints: [
      '고정 데이터셋과 API 캐시 데이터의 기준연도·기준월 차이를 같은 추세처럼 해석하지 않음',
      '상위권/하위권은 정책 우열 판단이 아니라 서비스 설계 질문을 만들기 위한 코드 기반 분류',
      '도서관 운영데이터가 붙기 전까지 실제 이용 수요나 프로그램 성과를 단정하지 않음'
    ],
    recommendedQuestions: [
      `${gu}에서 상위권 또는 하위권으로 드러난 지표가 도서관 접근성의 어느 채널과 연결되는가`,
      `고정 문화 지표와 갱신형 인구·사회안전망 지표가 서로 엇갈리는 지점은 어디인가`,
      `운영데이터 연결 이후 검증해야 할 이용 시간대, 프로그램 참여, 공간 이용 가설은 무엇인가`
    ]
  };
}

module.exports = {
  ANALYSIS_SIGNAL_VERSION,
  buildAnalysisSignals
};
