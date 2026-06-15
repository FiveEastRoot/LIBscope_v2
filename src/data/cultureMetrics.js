import cultureMetricsCsv from '../../district_culture_enjoyment_metrics.csv?raw';
import { parseCultureMetrics } from '../utils/csv';

export const cultureMetricsRows = parseCultureMetrics(cultureMetricsCsv);

export const cultureMetricGroups = [
  {
    key: 'infrastructure',
    title: '문화시설 공급 기반',
    description: '자치구 내 공공 문화시설의 기본 공급 규모와 인구 대비 접근성을 함께 보는 지표입니다.',
    metrics: [
      { label: '공공문화시설', field: 'public_culture_facilities', unit: '개' },
      { label: '인구 10만 명당', field: 'public_culture_facilities_per100k', unit: '개' }
    ],
    color: 'blue'
  },
  {
    key: 'library',
    title: '도서관 문화 접근성',
    description: '도서관 기반 문화 접근성과 생활권 문화 프로그램 거점 가능성을 참고하는 지표입니다.',
    metrics: [
      { label: '전체 도서관', field: 'libraries_total', unit: '개' },
      { label: '인구 10만 명당', field: 'libraries_per100k', unit: '개' }
    ],
    color: 'indigo'
  },
  {
    key: 'performance',
    title: '공연·발표 공간 접근성',
    description: '공연 관람, 지역 예술활동, 발표회 운영과 관련된 공간 기반을 보여줍니다.',
    metrics: [
      { label: '공공공연장', field: 'public_performance_halls', unit: '개' },
      { label: '공연시설', field: 'public_performance_spaces', unit: '개' }
    ],
    color: 'emerald'
  },
  {
    key: 'exhibition',
    title: '전시·관람 자원',
    description: '박물관과 미술관 등 전시·관람형 문화자원의 분포를 확인하는 지표입니다.',
    metrics: [
      { label: '박물관·미술관', field: 'public_museums_galleries', unit: '개' },
      { label: '인구 10만 명당', field: 'public_museums_galleries_per100k', unit: '개' }
    ],
    color: 'rose'
  },
  {
    key: 'local',
    title: '생활문화 기반',
    description: '주민 참여형 문화활동, 교육, 동아리, 커뮤니티 운영 기반을 살펴보는 지표입니다.',
    metrics: [
      { label: '문화복지시설', field: 'local_culture_welfare_facilities', unit: '개' },
      { label: '생활문화센터', field: 'life_culture_centers', unit: '개' }
    ],
    color: 'amber'
  },
  {
    key: 'inclusive',
    title: '포용적 문화 접근성',
    description: '이동약자와 장애인의 문화시설 이용 여건을 참고하기 위한 보조 지표입니다.',
    metrics: [
      { label: '무장애 인증시설', field: 'barrier_free_indoor_culture_spaces', unit: '개' },
      { label: '인구 10만 명당', field: 'barrier_free_indoor_culture_spaces_per100k', unit: '개' }
    ],
    color: 'cyan'
  },
  {
    key: 'policy',
    title: '문화정책 기반',
    description: '자치구 문화정책의 제도화 수준과 최근 조례 갱신 활동을 참고하는 지표입니다.',
    metrics: [
      { label: '문화정책 조례', field: 'culture_policy_ordinance_count', unit: '건' },
      { label: '제·개정 건수', field: 'culture_policy_revision_count', unit: '건' }
    ],
    color: 'slate'
  }
];

export const cultureColorClasses = {
  blue: 'bg-blue-50 text-blue-600 border-blue-100',
  indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  rose: 'bg-rose-50 text-rose-600 border-rose-100',
  amber: 'bg-amber-50 text-amber-600 border-amber-100',
  cyan: 'bg-cyan-50 text-cyan-600 border-cyan-100',
  slate: 'bg-slate-100 text-slate-700 border-slate-200'
};

export const cultureEnjoymentReference2024 = [
  {
    key: 'general',
    label: '일반 시민',
    theme: {
      active: 'bg-blue-600 border-blue-600 text-white',
      inactive: 'bg-white/80 border-blue-100 text-blue-700 hover:bg-blue-50',
      panel: 'bg-blue-50/70 border-blue-100',
      text: 'text-blue-700',
      subText: 'text-blue-900/70',
      chip: 'text-blue-600 bg-white/70 border-blue-100',
      barBg: 'bg-blue-100',
      bar: 'bg-blue-500',
      baseText: 'text-blue-500/80',
      lowHighlight: 'bg-white/75 border-dashed border-blue-300/80',
      lowMarker: 'bg-blue-200',
      lowValue: 'bg-white/80 text-blue-500 border-dashed border-blue-200',
      highHighlight: 'bg-white/95 border-blue-200/80',
      highRail: 'bg-blue-500',
      highTopLine: 'bg-blue-200',
      highValue: 'bg-blue-50 text-blue-700 border-blue-100'
    },
    denominator: '조사대상: 서울 거주 만 15세 이상 일반 시민, 표본 5,211명',
    items: [
      { label: '생활권에서 문화활동', value: 43.3, unit: '%', base: '전체 일반 시민 응답자 n=5,211', note: '문화예술 관람/참여/교육 활동을 생활권에서 주로 함', display: 'bar' },
      { label: '도서관 문화정보 경험', value: 52.8, unit: '%', base: '전체 일반 시민 응답자 n=5,211', note: '도서관 이용을 통해 지역사회 문화예술 정보를 접한 경험', display: 'bar' },
      { label: '정보 기반 실제 참여', value: 61.4, unit: '%', base: '도서관 이용을 통한 지역문화예술 정보 경험자', note: '도서관에서 접한 정보를 통해 실제 문화예술 활동에 참여한 경험', display: 'bar' },
      { label: '축제·행사 참여', value: 31.4, unit: '%', base: '도서관 이용을 통한 지역문화예술 정보 경험자', note: '정보를 통해 실제 참여한 활동 중 지역 축제 및 행사', display: 'bar' },
      { label: '문화예술 관람 프로그램 참여', value: 19.6, unit: '%', base: '도서관 이용을 통한 지역문화예술 정보 경험자', note: '정보를 통해 실제 참여한 문화예술 관람 프로그램', display: 'bar' },
      { label: '문화예술교육 참여', value: 13.9, unit: '%', base: '도서관 이용을 통한 지역문화예술 정보 경험자', note: '정보를 통해 실제 참여한 문화예술교육', display: 'bar' },
      { label: '동호회 참여', value: 10.9, unit: '%', base: '도서관 이용을 통한 지역문화예술 정보 경험자', note: '정보를 통해 실제 참여한 지역 모임/동아리 활동', display: 'bar' },
      { label: '지역사회 관심도 증가', value: 69.1, unit: '%', base: '도서관 이용을 통한 지역문화예술 정보 경험자', note: '도서관 정보로 지역사회 관심이 커졌다는 응답', display: 'bar' },
      { label: '소규모 지역행사 참여', value: 18.1, unit: '%', base: '전체 일반 시민 응답자 n=5,211', note: '거주지 주변 소규모 문화행사 참여 경험', display: 'bar' },
      { label: '소규모 지역행사 참여 의향', value: 49.9, unit: '%', base: '전체 일반 시민 응답자 n=5,211', note: '향후 거주지 주변 소규모 문화행사 참여 의향 있음', display: 'bar' }
    ]
  },
  {
    key: 'culture_interest',
    label: '문화 관심층',
    theme: {
      active: 'bg-emerald-600 border-emerald-600 text-white',
      inactive: 'bg-white/80 border-emerald-100 text-emerald-700 hover:bg-emerald-50',
      panel: 'bg-emerald-50/70 border-emerald-100',
      text: 'text-emerald-700',
      subText: 'text-emerald-900/70',
      chip: 'text-emerald-600 bg-white/70 border-emerald-100',
      barBg: 'bg-emerald-100',
      bar: 'bg-emerald-500',
      baseText: 'text-emerald-500/80',
      lowHighlight: 'bg-white/75 border-dashed border-emerald-300/80',
      lowMarker: 'bg-emerald-200',
      lowValue: 'bg-white/80 text-emerald-500 border-dashed border-emerald-200',
      highHighlight: 'bg-white/95 border-emerald-200/80',
      highRail: 'bg-emerald-500',
      highTopLine: 'bg-emerald-200',
      highValue: 'bg-emerald-50 text-emerald-700 border-emerald-100'
    },
    denominator: '조사대상: 서울 거주 문화 관심층, 표본 4,053명',
    items: [
      { label: '생활권 외 활동 탐색', value: 70.7, unit: '%', base: '전체 문화 관심층 응답자 n=4,053', note: '생활권 밖이어도 원하는 문화활동이 있는 곳을 찾아감', display: 'bar' },
      { label: '생활권에서 문화활동', value: 26.3, unit: '%', base: '전체 문화 관심층 응답자 n=4,053', note: '문화예술 관람/참여/교육 활동을 생활권에서 주로 함', display: 'bar' },
      { label: '도서관 문화정보 경험', value: 68.9, unit: '%', base: '전체 문화 관심층 응답자 n=4,053', note: '도서관 이용을 통해 지역사회 문화예술 정보를 접한 경험', display: 'bar' },
      { label: '정보 기반 실제 참여', value: 68.8, unit: '%', base: '도서관 이용을 통한 지역문화예술 정보 경험자', note: '도서관에서 접한 정보를 통해 실제 문화예술 활동에 참여한 경험', display: 'bar' },
      { label: '축제·행사 참여', value: 36.6, unit: '%', base: '도서관 이용을 통한 지역문화예술 정보 경험자', note: '정보를 통해 실제 참여한 지역 축제 및 행사', display: 'bar' },
      { label: '문화예술 관람 프로그램 참여', value: 30.8, unit: '%', base: '도서관 이용을 통한 지역문화예술 정보 경험자', note: '정보를 통해 실제 참여한 문화예술 관람 프로그램', display: 'bar' },
      { label: '문화예술교육 참여', value: 21.1, unit: '%', base: '도서관 이용을 통한 지역문화예술 정보 경험자', note: '정보를 통해 실제 참여한 문화예술교육', display: 'bar' },
      { label: '동호회 참여', value: 8.4, unit: '%', base: '도서관 이용을 통한 지역문화예술 정보 경험자', note: '정보를 통해 실제 참여한 지역 모임/동아리 활동', display: 'bar' },
      { label: '지역사회 관심도 증가', value: 78.6, unit: '%', base: '도서관 이용을 통한 지역문화예술 정보 경험자', note: '도서관 정보로 지역사회 관심이 커졌다는 응답', display: 'bar' },
      { label: '소규모 지역행사 참여', value: 30.0, unit: '%', base: '전체 문화 관심층 응답자 n=4,053', note: '거주지 주변 소규모 문화행사 참여 경험', display: 'bar' },
      { label: '소규모 지역행사 참여 의향', value: 76.0, unit: '%', base: '전체 문화 관심층 응답자 n=4,053', note: '향후 거주지 주변 소규모 문화행사 참여 의향 있음', display: 'bar' }
    ]
  },
  {
    key: 'disabled',
    label: '장애인',
    theme: {
      active: 'bg-rose-600 border-rose-600 text-white',
      inactive: 'bg-white/80 border-rose-100 text-rose-700 hover:bg-rose-50',
      panel: 'bg-rose-50/70 border-rose-100',
      text: 'text-rose-700',
      subText: 'text-rose-900/70',
      chip: 'text-rose-600 bg-white/70 border-rose-100',
      barBg: 'bg-rose-100',
      bar: 'bg-rose-500',
      baseText: 'text-rose-500/80',
      lowHighlight: 'bg-white/75 border-dashed border-rose-300/80',
      lowMarker: 'bg-rose-200',
      lowValue: 'bg-white/80 text-rose-500 border-dashed border-rose-200',
      highHighlight: 'bg-white/95 border-rose-200/80',
      highRail: 'bg-rose-500',
      highTopLine: 'bg-rose-200',
      highValue: 'bg-rose-50 text-rose-700 border-rose-100'
    },
    denominator: '조사대상: 서울 거주 장애인, 표본 755명',
    items: [
      { label: '오프라인 문화예술 연간 관람률', value: 35.5, unit: '%', base: '전체 장애인 응답자 n=755', note: '최근 1년간 오프라인 문화예술 활동 경험', display: 'bar' },
      { label: '연간 오프라인 활동 횟수', value: 3.7, unit: '회', base: '오프라인 문화예술 활동 경험자', note: '최근 1년간 오프라인 활동 총 횟수', display: 'number' },
      { label: '연간 관람 비용', value: 6.8, unit: '만원', base: '오프라인 문화예술 활동 지불 경험자', note: '최근 1년간 본인 지불 관람 총 비용', display: 'number' },
      { label: '도서관 문화정보 경험 - 지체장애', value: 30.8, unit: '%', base: '지체장애 응답자', note: '도서관 이용을 통해 지역사회 문화예술 정보를 접한 경험', display: 'bar' },
      { label: '정보 기반 실제 참여 - 청각장애', value: 52.8, unit: '%', base: '청각장애 중 도서관 지역문화예술 정보 경험자', note: '도서관 정보를 통해 실제 문화예술 활동에 참여한 경험', display: 'bar' },
      { label: '지역사회 관심도 증가 - 지체장애', value: 75.9, unit: '%', base: '지체장애 중 도서관 지역문화예술 정보 경험자', note: '도서관 정보로 지역사회 관심이 커졌다는 응답', display: 'bar' },
      { label: '소규모 지역행사 참여 - 시각장애', value: 2.6, unit: '%', base: '시각장애 응답자', note: '거주지 주변 소규모 문화행사 참여 경험', display: 'bar' },
      { label: '소규모 지역행사 참여 의향 - 청각장애', value: 38.9, unit: '%', base: '청각장애 응답자', note: '향후 거주지 주변 소규모 문화행사 참여 의향 있음', display: 'bar' },
      { label: '소규모 지역행사 참여 의향 - 지체장애', value: 36.5, unit: '%', base: '지체장애 응답자', note: '향후 거주지 주변 소규모 문화행사 참여 의향 있음', display: 'bar' }
    ]
  }
];

export const getCultureReferenceHighlightClass = (item, theme) => {
  if (item.unit !== '%') return 'bg-white/80 border-current/10';
  if (item.value < 10) {
    return theme.lowHighlight;
  }
  if (item.value > 50) {
    return theme.highHighlight;
  }
  return 'bg-white/80 border-current/10';
};
