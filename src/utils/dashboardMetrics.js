import { ageGroupOrder, foreignResidentTypeOrder } from '../data/demographics';
import { toNumber } from './formatters';

export const getAgeChartOption = (ageDistribution) => {
  if (!ageDistribution) return {};
  const categories = ageGroupOrder.filter(label => ageDistribution[label] !== undefined);
  const data = categories.map(label => ageDistribution[label]);

  const colors = categories.map(cat => {
    const ageNum = Number(cat.match(/^\d+/)?.[0] || 0);
    if (ageNum <= 9) return '#54a0ff';
    if (ageNum <= 64) return '#facc15';
    return '#ef4444';
  });

  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: categories, axisLabel: { interval: 0, rotate: 30 } },
    yAxis: { type: 'value' },
    series: [
      {
        name: '인구수',
        type: 'bar',
        data: data.map((val, idx) => ({
          value: val,
          itemStyle: { color: colors[idx] }
        }))
      }
    ]
  };
};

export const getGenderChartOption = (genderRatio) => {
  if (!genderRatio) return {};
  return {
    tooltip: { trigger: 'item', confine: true },
    legend: {
      bottom: 0,
      left: 'center',
      itemWidth: 18,
      itemHeight: 10,
      textStyle: { color: '#64748b', fontSize: 11, fontWeight: 700 }
    },
    series: [
      {
        name: '성별 인구',
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '46%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        labelLine: { show: false },
        data: [
          { value: genderRatio.male, name: '남성', itemStyle: { color: '#8ed6fb' } },
          { value: genderRatio.female, name: '여성', itemStyle: { color: '#fac4d5' } }
        ]
      }
    ]
  };
};

export const getStackedBarOption = (title, dataDict) => {
  if (!dataDict || Object.keys(dataDict).length === 0) return {};
  const keys = Object.keys(dataDict).sort((a, b) => Number(dataDict[b] || 0) - Number(dataDict[a] || 0));
  const total = Object.values(dataDict).reduce((a, b) => a + b, 0);

  const seriesData = keys.map(key => ({
    name: key,
    type: 'bar',
    stack: 'total',
    label: {
      show: true,
      formatter: (params) => {
        const pct = (params.value / total) * 100;
        return pct > 5 ? `${pct.toFixed(1)}%` : '';
      }
    },
    emphasis: { focus: 'series' },
    data: [dataDict[key]]
  }));

  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { bottom: '0%', left: 'center' },
    grid: { left: '3%', right: '3%', top: '10%', bottom: '20%', containLabel: true },
    xAxis: { type: 'value', max: total, show: false },
    yAxis: { type: 'category', data: [title], show: false },
    series: seriesData
  };
};

export const getOrderedComposition = (dataDict, order) => {
  if (!dataDict) return {};
  return order.reduce((result, key) => {
    const value = Number(dataDict[key] || 0);
    if (value > 0) result[key] = value;
    return result;
  }, {});
};

export const getForeignDataBundle = (socialIndicators) => {
  const legacyMulticultural = socialIndicators?.multicultural || {};
  const residentSource = socialIndicators?.foreignResidents || legacyMulticultural;
  const residentData = getOrderedComposition(residentSource, foreignResidentTypeOrder);
  const multiculturalLooksLikeResidentTypes = Object.keys(residentData).length > 0;
  const nationalityData = socialIndicators?.registeredForeignerNationalities
    || socialIndicators?.nationalityComposition
    || (multiculturalLooksLikeResidentTypes ? {} : legacyMulticultural);
  return { residentData, nationalityData };
};

export const buildSocialSafetySections = (socialIndicators) => {
  if (!socialIndicators) return [];
  const { residentData: foreignResidentTypeData, nationalityData: foreignNationalityData } = getForeignDataBundle(socialIndicators);
  return [
    {
      key: 'household',
      label: '가구',
      title: '가구 형태 구성',
      description: '사회안전망 대상자의 가구 형태가 어떤 유형에 집중되어 있는지 확인합니다.',
      theme: {
        active: 'bg-amber-50 border-amber-200 text-amber-900',
        inactive: 'bg-white border-amber-100 text-amber-700 hover:bg-amber-50',
        pill: 'bg-amber-100 text-amber-700',
        panel: 'bg-amber-50/60 border-amber-100',
        text: 'text-amber-700',
        item: 'bg-white border-amber-100'
      },
      data: socialIndicators.householdTypes
    },
    {
      key: 'disability',
      label: '장애',
      title: '장애인 대분류 구성',
      description: '장애 유형을 대분류 기준으로 묶어 대상자 구성을 간결하게 봅니다.',
      theme: {
        active: 'bg-rose-50 border-rose-200 text-rose-900',
        inactive: 'bg-white border-rose-100 text-rose-700 hover:bg-rose-50',
        pill: 'bg-rose-100 text-rose-700',
        panel: 'bg-rose-50/60 border-rose-100',
        text: 'text-rose-700',
        item: 'bg-white border-rose-100'
      },
      data: socialIndicators.disabilityGroups || socialIndicators.disability
    },
    {
      key: 'foreign',
      label: '외국인',
      title: '외국인 관련 구성',
      description: '외국인 주민 유형과 등록외국인 국적 구성을 함께 확인합니다.',
      theme: {
        active: 'bg-cyan-50 border-cyan-200 text-cyan-900',
        inactive: 'bg-white border-cyan-100 text-cyan-700 hover:bg-cyan-50',
        pill: 'bg-cyan-100 text-cyan-700',
        panel: 'bg-cyan-50/60 border-cyan-100',
        text: 'text-cyan-700',
        item: 'bg-white border-cyan-100'
      },
      data: Object.keys(foreignResidentTypeData).length > 0 ? foreignResidentTypeData : foreignNationalityData,
      residentData: foreignResidentTypeData,
      nationalityData: foreignNationalityData
    }
  ].filter(section => section.data && Object.keys(section.data).length > 0);
};

export const getTopCompositionItems = (dataDict, limit = 5) => {
  if (!dataDict) return [];
  const total = Object.values(dataDict).reduce((sum, value) => sum + Number(value || 0), 0);
  if (!total) return [];
  return Object.entries(dataDict)
    .sort(([, a], [, b]) => Number(b || 0) - Number(a || 0))
    .slice(0, limit)
    .map(([name, value]) => ({
      name,
      value: Number(value || 0),
      ratio: (Number(value || 0) / total) * 100
    }));
};

export const aggregateNationalityComposition = (dataDict, { minValue = 100 } = {}) => {
  if (!dataDict) return { chartData: {}, otherItems: [] };
  const sortedItems = Object.entries(dataDict)
    .map(([name, value]) => ({ name, value: Number(value || 0) }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);

  const visibleItems = [];
  const otherItems = [];
  sortedItems.forEach((item) => {
    if (item.value > minValue) {
      visibleItems.push(item);
    } else {
      otherItems.push(item);
    }
  });

  const chartData = Object.fromEntries(visibleItems.map(item => [item.name, item.value]));
  const otherTotal = otherItems.reduce((sum, item) => sum + item.value, 0);
  if (otherTotal > 0) chartData['기타 국적'] = otherTotal;
  return { chartData, otherItems };
};

export const getCultureCompositionOption = (cultureMetrics) => {
  if (!cultureMetrics) return {};
  const data = [
    { name: '도서관', value: toNumber(cultureMetrics.libraries_total), itemStyle: { color: '#4f8ee8' } },
    { name: '공연시설', value: toNumber(cultureMetrics.public_performance_spaces), itemStyle: { color: '#2bbf8a' } },
    { name: '전시시설', value: toNumber(cultureMetrics.public_museums_galleries), itemStyle: { color: '#f27b9a' } },
    { name: '생활문화', value: toNumber(cultureMetrics.local_culture_welfare_facilities), itemStyle: { color: '#f4b84f' } },
    { name: '무장애 인증', value: toNumber(cultureMetrics.barrier_free_indoor_culture_spaces), itemStyle: { color: '#35b8c8' } }
  ].filter(item => item.value !== null && item.value > 0);

  return {
    tooltip: { trigger: 'item', confine: true },
    legend: {
      type: 'scroll',
      bottom: 0,
      left: 'center',
      itemWidth: 14,
      itemHeight: 9,
      textStyle: { color: '#64748b', fontSize: 11, fontWeight: 700 }
    },
    series: [
      {
        name: '문화자원 구성',
        type: 'pie',
        radius: ['46%', '70%'],
        center: ['50%', '43%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        labelLine: { show: false },
        data
      }
    ]
  };
};

export const getCultureAccessBarOption = (cultureMetrics) => {
  if (!cultureMetrics) return {};
  const data = [
    { name: '공공문화시설', value: toNumber(cultureMetrics.public_culture_facilities_per100k), color: '#4f8ee8' },
    { name: '도서관', value: toNumber(cultureMetrics.libraries_per100k), color: '#6366f1' },
    { name: '공연장', value: toNumber(cultureMetrics.public_performance_halls_per100k), color: '#2bbf8a' },
    { name: '전시시설', value: toNumber(cultureMetrics.public_museums_galleries_per100k), color: '#f27b9a' },
    { name: '무장애 인증', value: toNumber(cultureMetrics.barrier_free_indoor_culture_spaces_per100k), color: '#35b8c8' }
  ].filter(item => item.value !== null);

  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true },
    grid: { left: '3%', right: '4%', top: '10%', bottom: '10%', containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { color: '#64748b', fontSize: 11 }
    },
    yAxis: {
      type: 'category',
      data: data.map(item => item.name),
      axisLabel: { color: '#475569', fontSize: 11, fontWeight: 700 }
    },
    series: [
      {
        name: '인구 10만 명당',
        type: 'bar',
        barWidth: 16,
        data: data.map(item => ({
          value: item.value,
          itemStyle: { color: item.color, borderRadius: [0, 8, 8, 0] }
        }))
      }
    ]
  };
};

export const formatPopulationSourceDate = (rawDate) => {
  if (!rawDate) return null;
  return rawDate.length === 8
    ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
    : rawDate;
};

export const getPopulationSourceLabel = (population) => {
  if (!population) return '행정동 통계 (BOM 백업)';
  if (population.source === 'resident_registration_csv_fallback') {
    return '주민등록인구 통계 (BOM 백업)';
  }
  if (population.source === 'SPOP_LOCAL_RESD_DONG') {
    const dateText = formatPopulationSourceDate(population.referenceDate);
    return dateText
      ? `서울 열린데이터광장(행정동 생활인구 추정치, 기준일 ${dateText})`
      : '서울 열린데이터광장(행정동 생활인구 추정치)';
  }
  if (population.source === 'living_population_unavailable') {
    return '생활인구 API 조회 대기';
  }
  if (population.source === 'csv_fallback') {
    return '행정동 통계 (BOM 백업)';
  }
  return population.source;
};

export const getSocialIndicatorSourceLabel = (socialIndicators) => {
  if (!socialIndicators) return '사회안전망 구성 데이터';
  const dateText = formatPopulationSourceDate(socialIndicators.referenceDate);
  if (socialIndicators.sourceLabel) {
    return dateText ? `${socialIndicators.sourceLabel} (기준 ${dateText})` : socialIndicators.sourceLabel;
  }
  if (socialIndicators.source === 'kosis_social_safety_composition') {
    return dateText ? `KOSIS 사회안전망 구성 (기준 ${dateText})` : 'KOSIS 사회안전망 구성';
  }
  if (socialIndicators.source === 'csv_social_safety_fallback') {
    return '서울시 자치구 통계 (CSV 백업)';
  }
  return socialIndicators.source || '사회안전망 구성 데이터';
};
