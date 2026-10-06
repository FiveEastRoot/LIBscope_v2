const col = (key, label, type, unit, definition, interpretation = '', width = 22) => ({ key, label, type, unit, definition, interpretation, width });
const TEXT = '문자열';
const NUMBER = '숫자';
const sourceUrls = {
  kosis: 'https://kosis.kr/', seoul: 'https://data.seoul.go.kr/',
  kakao: 'https://developers.kakao.com/docs/latest/ko/local/dev-guide',
  kcisa: 'https://www.culture.go.kr/data/', culture: 'https://www.sfac.or.kr/'
};
const contextColumns = [
  col('target_type', '대상 유형', TEXT, '', 'district=자치구, library=도서관, address=선택 주소지'),
  col('target_gu', '선택 자치구', TEXT, '', '다운로드 대상이 속한 자치구', '인접 행정동의 실제 자치구는 area_gu를 사용'),
  col('target_name', '다운로드 대상', TEXT, '', '선택 자치구명·도서관명·확정 주소', '', 38)
];
const provenanceColumns = [
  col('reference_period', '원천 기준시점', TEXT, '', '원천 기준일 또는 조사연도. 미제공 시 빈 셀', '다운로드 시각과 통계 기준시점은 다름'),
  col('source', '출처', TEXT, '', '통계·목록의 제공 기관 또는 파일명', '', 38),
  col('source_url', '출처 안내 URL', TEXT, '', '확인된 제공 기관의 안내 주소. 개별 원표 URL이 없으면 기관 주소', '', 40),
  col('data_status', '자료 상태', TEXT, '', 'available=제공, zero=제공값 0, missing=결측, fallback=백업, delayed=지연, unavailable=미제공, reference=참고, draft=AI 초안'),
  col('note', '해석 유의사항', TEXT, '', '범위·집계방법·원천 제약·결측 해석', '', 65)
];
const metricColumns = [
  col('field_path', '원천 필드', TEXT, '', '화면 데이터에서 해당 값의 경로. 동일 지표를 파일 간 식별하는 키', '', 48),
  col('metric_name', '지표명', TEXT, '', '원천 필드의 한국어 명칭', '', 32),
  col('value', '값', '숫자 또는 문자열 또는 논리값', 'unit 참조', '화면에서 사용한 원천값. 숫자는 숫자 셀로 저장', '수치 집계 시 value_type=number와 자료 상태를 함께 확인'),
  col('value_type', '값 자료형', TEXT, '', 'number, string, boolean, null'),
  col('unit', '단위', TEXT, '', '명·가구·개·건·% 등. 미확인 단위는 확인 필요로 표시'),
  col('definition', '지표 정의', TEXT, '', '해당 원천 필드가 나타내는 대상과 범위', '', 65),
  col('interpretation', '지표 해석', TEXT, '', '분모·산식·비교 및 합산 시 유의사항', '', 65)
];
const fieldLabels = {
  total: ['총인구', '명'], male: ['남성 인구', '명'], female: ['여성 인구', '명'],
  recipientRate: ['기초생활수급률', '%'], seoulAvgRecipientRate: ['서울 자치구 평균 수급률', '%'],
  avgRecipientCount: ['인접 행정동 평균 수급자수', '명'], seoulAvgRecipientCount: ['서울 행정동 평균 수급자수', '명'],
  totalHouseholds: ['전체 가구수', '가구'], onePersonCount: ['1인가구수', '가구'],
  seoulAvgOnePerson: ['서울 자치구 평균 1인가구수', '가구'], averageHouseholdSize: ['평균 가구원수', '명/가구'],
  totalDisabled: ['등록장애인수', '명'], totalForeignResidents: ['외국인주민수', '명'],
  totalRegisteredForeigners: ['등록외국인수', '명'], publicLibraryCount: ['공공도서관수', '개관'],
  elementary: ['초등학교수', '개교'], middle: ['중학교수', '개교'], high: ['고등학교수', '개교'], university: ['대학교수', '개교'],
  liveCultureEventsMonth: ['당월 시작 문화행사수', '건'], seoul: ['서울 열린데이터광장 행사수', '건'], kcisa: ['한국문화정보원 행사수', '건'],
  referenceDate: ['원천 기준일', ''], requestedDate: ['원천 요청일', ''], retrievedAt: ['원천 조회 시각', ''],
  dataLagDays: ['원천 지연 일수', '일'], freshnessStatus: ['원천 최신성 상태', ''], isDelayed: ['원천 지연 여부', ''],
  source: ['출처 식별자', ''], sourceLabel: ['출처 표시명', ''], denominator: ['지표 분모', ''],
  cultureFacilitySourceStatus: ['문화시설 조회 상태', ''], dongMatchMode: ['행정동 선정 방식', '']
};
const dateText = value => /^\d{8}$/.test(String(value)) ? `${String(value).slice(0, 4)}-${String(value).slice(4, 6)}-${String(value).slice(6)}` : (value || null);
const statusOf = (value, source = '') => value == null || value === '' ? 'missing' : /unavailable/.test(source) ? 'unavailable' : /fallback|백업/.test(source) ? 'fallback' : value === 0 ? 'zero' : 'available';
const scalarLeaves = (value, prefix = '', includeArrays = false) => {
  if (Array.isArray(value)) return includeArrays ? value.flatMap((child, index) => scalarLeaves(child, `${prefix}[${index}]`, true)) : [];
  if (value !== null && typeof value === 'object') return Object.entries(value).flatMap(([key, child]) => scalarLeaves(child, prefix ? `${prefix}.${key}` : key, includeArrays));
  return [{ path: prefix, value: value ?? null }];
};

function metricMeaning(path) {
  const key = path.split('.').at(-1);
  const known = fieldLabels[key];
  let name = known?.[0] || key;
  let unit = known?.[1] ?? '';
  let definition = known ? `${name}: 해당 화면의 원천 집계값` : `원천 필드 ${path}. 별도 정의 미제공 시 출처 확인 필요`;
  let interpretation = '서로 다른 기준시점·대상·출처의 값을 합산하거나 같은 모집단으로 비교하지 않음';
  if (/householdTypes\./.test(path)) { name = `${key} 가구수`; unit = '가구'; definition = '가구원수별 일반가구 구성'; }
  if (/(multicultural|disability|disabilityGroups|nationalityComposition|registeredForeignerNationalities)\./.test(path)) {
    name = key; unit = '명'; definition = `사회안전망 분류 ${path.split('.').at(-2)}의 ${key} 인원`;
    interpretation = '등록외국인과 외국인주민의 정의·모집단이 다름. 장애 상세유형과 통합유형은 같은 인원의 재분류이므로 중복 합산하지 않음';
  }
  if (/recipientRate/i.test(key)) interpretation = '원천 수급률(%): 3.2는 3.2%. 주민등록인구 기준 분모를 사용하며 생활인구로 재계산하지 않음. 평균은 자치구별 비율의 평균';
  if (/RecipientCount/.test(key)) interpretation = '행정동별 수급자수의 산술평균. 해당 이용권역의 수급자 총수나 수급률이 아님';
  if (key === 'liveCultureEventsMonth') {
    definition = '조회된 진행 중·예정 행사 목록 중 시작일이 현재 월인 행사수';
    interpretation = '자치구 API 목록은 최대 100건. 원천의 전체 행사 총수가 아니며, 이전 달에 시작해 진행 중인 행사는 이 값에서 제외됨';
  }
  return { name, unit, definition, interpretation };
}

function socialPeriod(path, social) {
  const p = social.periods || {};
  if (/household|Household|onePerson|OnePerson/.test(path)) return p.household || social.referenceDate;
  if (/disability|Disabled/.test(path)) return p.disability || social.referenceDate;
  if (/nationality|Nationality|Registered/.test(path)) return p.registeredForeignerNationality || social.referenceDate;
  return p.foreignResidents || social.referenceDate;
}

/** Build a single, selection-bound snapshot. Does not request or mutate source data. */
export function buildAnalysisTables({ scope, data, cultureMetrics = {}, cultureGroups = [], cultureReference = [], facilities = [], report = null, viewState = {}, exportedAt = new Date() }) {
  if (!data || !['district', 'library', 'address'].includes(scope)) throw new Error('다운로드할 현황 데이터가 없습니다.');
  const context = { target_type: scope, target_gu: data.gu, target_name: scope === 'district' ? data.gu : scope === 'address' ? data.address : data.library };
  const tables = [];
  const add = (name, description, grain, columns, rows) => tables.push({ name, description, grain, columns: [...contextColumns, ...columns], rows: rows.map(row => ({ ...context, ...row })) });
  const metrics = [];
  const addMetrics = (object, prefix, source, period, note = '', sourceUrl = '') => scalarLeaves(object, prefix).forEach(({ path, value }) => {
    const meaning = metricMeaning(path);
    metrics.push({ field_path: path, metric_name: meaning.name, value, value_type: value === null ? 'null' : typeof value,
      unit: meaning.unit || (typeof value === 'number' ? '확인 필요' : ''), definition: meaning.definition, interpretation: meaning.interpretation,
      reference_period: dateText(typeof period === 'function' ? period(path) : period), source, source_url: sourceUrl || null,
      data_status: statusOf(value, source), note });
  });
  const population = scope === 'district' ? data.population : data.demographics;
  const modes = population?.modes || data.populationModes?.modes || { [population?.mode || 'resident']: population };
  const people = [];
  const provenance = (p, mode) => ({ reference_period: dateText(p.referenceDate), source: p.source || '출처 미제공',
    source_url: /kosis|supabase_resident/.test(p.source) ? sourceUrls.kosis : /SPOP/.test(p.source) ? sourceUrls.seoul : null,
    data_status: /unavailable/.test(p.source) ? 'unavailable' : p.isDelayed ? 'delayed' : statusOf(p.total, p.source),
    note: mode === 'living' ? '00시 생활인구 추정치. 일평균과 다름. 원천 연령구간을 5세 구간에 연수 비례 배분한 화면 값이며 세부구간의 직접 관측값이 아님. 반올림값 보존' : '주민등록인구 월자료. YYYY-MM-01 기준일은 기준월의 저장 표기이며 1일의 관측값을 뜻하지 않음. 도서관·주소지는 행정동 중심점 2km 내 동 전체 인구 합계' });
  const addPeople = (p, mode, areaKind, gu, areaName, inherited = {}) => {
    if (!p) return;
    const meta = provenance({ ...inherited, ...p }, mode);
    const row = { population_mode: mode, area_kind: areaKind, area_gu: gu || null, area_name: areaName, ...meta };
    people.push({ ...row, classification: 'total', group_name: '전체', people_count: p.total ?? null });
    Object.entries(p.ageDistribution || {}).forEach(([group, count]) => people.push({ ...row, classification: 'age', group_name: group, people_count: count }));
    Object.entries(p.genderRatio || {}).forEach(([group, count]) => people.push({ ...row, classification: 'gender', group_name: group, people_count: count }));
  };
  Object.entries(modes).forEach(([mode, p]) => {
    if (!p) return;
    const summary = Object.fromEntries(Object.entries(p).filter(([key]) => !['ageDistribution', 'genderRatio', 'comparisonBaseline', 'dongBreakdown', 'matchedDongs', 'missingDongs'].includes(key)));
    addMetrics(summary, `population.${mode}`, p.source || '출처 미제공', p.referenceDate, provenance(p, mode).note, provenance(p, mode).source_url);
    addMetrics({ matchedDongs: (p.matchedDongs || []).join(', '), missingDongs: (p.missingDongs || []).join(', ') }, `population.${mode}`, p.source || '', p.referenceDate, '빈 누락 목록은 누락 동 없음. 원천 표기와 화면 동 명칭이 다를 수 있음');
    addPeople(p, mode, 'target', data.gu, context.target_name);
    (p.dongBreakdown || []).forEach(dong => {
      const area = (data.dongAreas || []).find(item => item.dong === dong.dong);
      addPeople(dong, mode, 'dong', area?.gu || (scope === 'district' ? data.gu : null), dong.dong, p);
    });
    (p.comparisonBaseline || []).forEach(gu => addPeople(gu, mode, 'seoul_comparison', gu.gu, gu.gu, p));
  });
  add('인구분포', '주민등록·생활인구의 총계, 연령, 성별 및 행정동 분포', '대상+인구유형+공간수준+실제 자치구+공간명+분류+집단', [
    col('population_mode', '인구 유형', TEXT, '', 'resident=주민등록인구, living=생활인구', '두 유형은 별개 모집단이므로 합산 금지'),
    col('area_kind', '공간 수준', TEXT, '', 'target=선택 대상, dong=행정동, seoul_comparison=서울 비교 자치구', '서로 다른 공간 수준을 중복 합산하지 않음'),
    col('area_gu', '실제 자치구', TEXT, '', '인구가 집계된 행정동·비교 자치구의 소속'),
    col('area_name', '집계 공간', TEXT, '', '행정동 원천명 또는 대상명'),
    col('classification', '분류 축', TEXT, '', 'total=총계, age=연령, gender=성별', '총계·연령·성별은 동일 인구를 다른 방식으로 표현. 축 간 합산 금지'),
    col('group_name', '집단', TEXT, '', '연령구간 또는 male=남성, female=여성, 전체', '화면은 70세 이상을 합산하나 서울 비교 원천에는 70세 이상 5세 구간이 있을 수 있음. 비교 전 구간을 맞춰야 함'),
    col('people_count', '인구수', NUMBER, '명', '해당 공간·유형·집단의 원천 인구수', 'unavailable의 0은 프로그램 기본값이며 관측된 0이 아님'), ...provenanceColumns
  ], people);
  addMetrics(data.welfare || {}, 'welfare', scope === 'district' ? '자치구 기초생활수급자 통계' : '행정동 기초생활수급자 통계 (BOM 백업)', null,
    '원천 기준일이 응답에 제공되지 않아 미확인. 인구 통계의 기준일을 대신 적용하지 않음');
  if (scope === 'district') {
    const social = data.socialIndicators || {};
    addMetrics(social, 'socialIndicators', [social.sourceLabel, social.source].filter(Boolean).join(' / ') || '사회안전망 통계', path => socialPeriod(path, social),
      '외국인주민·등록외국인 및 장애 상세·통합유형은 서로 겹칠 수 있음', /kosis/.test(social.source) ? sourceUrls.kosis : null);
    const ce = data.cultureAndEducation || {};
    addMetrics({ schools: ce.schools, publicLibraryCount: ce.publicLibraryCount }, 'cultureAndEducation', '서울 열린데이터광장 학교·공공도서관 현황', null, '원천 기준일 미제공. 목록 검색 결과와 집계 수의 범위가 다를 수 있음', sourceUrls.seoul);
    addMetrics({ liveCultureEventsMonth: ce.liveCultureEventsMonth, cultureEventSources: ce.cultureEventSources, cultureFacilitySourceStatus: ce.cultureFacilitySourceStatus }, 'cultureAndEducation', '서울 열린데이터광장·한국문화정보원·카카오', null, '다운로드한 화면의 조회 결과', sourceUrls.seoul);
    cultureGroups.forEach(group => group.metrics.forEach(metric => {
      const raw = cultureMetrics[metric.field];
      const value = raw == null || raw === '' ? null : Number.isFinite(Number(raw)) ? Number(raw) : raw;
      metrics.push({ field_path: `cultureMetrics.${metric.field}`, metric_name: `${group.title} · ${metric.label}`, value, value_type: value === null ? 'null' : typeof value,
        unit: /per100k$/.test(metric.field) ? `${metric.unit}/10만 명` : metric.unit,
        definition: group.description, interpretation: /per100k$/.test(metric.field) ? `원천 ${cultureMetrics.year || ''}년 인구 분모로 산출. 최신 주민등록인구로 재계산한 값이 아님` : '실시간 검색 목록과 조사연도·시설 포함 범위가 달라 개수 차이가 있을 수 있음',
        reference_period: cultureMetrics.year || null, source: cultureMetrics.source || '서울문화지표 조사연구', source_url: sourceUrls.culture,
        data_status: statusOf(value), note: [cultureMetrics.source_page, cultureMetrics.note].filter(Boolean).join(' / ') });
    }));
  } else {
    addMetrics({ dongMatchMode: data.dongMatchMode, nearbyEventSources: data.infrastructure?.nearbyEventSources }, 'location', '현재 화면의 위치 분석', null, '직선거리 기준. 도보거리·생활권 경계가 아님');
  }
  add('지표데이터', '선택 현황의 인구 요약·복지·사회안전망·문화·학교 지표', '대상+원천 필드', [...metricColumns, ...provenanceColumns], metrics);

  const placeColumns = [
    col('id', '원천 ID', TEXT, '', '원천 식별자. 없는 경우 빈 셀', '숫자로 변환하지 않으며 제공기관 간 중복 가능'),
    col('name', '명칭', TEXT, '', '기관·시설·학교 이름', '', 35), col('address', '주소', TEXT, '', '목록에 제공된 소재지 주소', '', 48),
    col('category', '분류', TEXT, '', '기관·시설·학교의 화면 분류'),
    col('category_code', '분류 코드', TEXT, '', '화면 시설 typeKey 또는 제공기관 categoryCode', '코드 체계는 제공기관별로 다름'),
    col('lat', '위도', NUMBER, '도', 'WGS84 위도', '결측 좌표는 빈 셀'), col('lng', '경도', NUMBER, '도', 'WGS84 경도', '결측 좌표는 빈 셀'),
    col('distance', '기준 위치 거리', NUMBER, 'm', '선택 좌표와의 직선거리. 자치구 목록은 거리 없음', '도보·도로 이동거리와 다름'),
    col('phone', '전화번호', TEXT, '', '원천이 제공한 연락처. 선행 0을 유지'), col('link', '상세 URL', TEXT, '', '원천 목록의 상세 페이지'), ...provenanceColumns
  ];
  const placeRow = (item, category, source) => ({ id: item.id == null ? null : String(item.id), name: item.name, address: item.address || null,
    category: category || item.typeLabel || item.category || item.categoryName || null, category_code: item.typeKey || item.categoryCode || null, lat: item.lat ?? null, lng: item.lng ?? null, distance: item.distance ?? null,
    phone: item.phone || null, link: item.placeUrl || item.url || null, reference_period: null, source, source_url: source === '카카오 Local' ? sourceUrls.kakao : sourceUrls.seoul,
    data_status: 'available', note: '원천 기준일 미제공. 전체 화면 목록이며 필터·페이지에 따라 잘라내지 않음' });
  if (scope === 'district') {
    const schools = Object.values(data.cultureAndEducation?.schoolDetails || {}).flat();
    add('교육기관', '전체 초·중·고·대학교 목록', '대상+학교 목록 행', placeColumns, schools.map(item => placeRow(item, item.category, '서울 열린데이터광장·카카오 Local')));
    add('문화시설', '화면의 도서관과 문화시설 전체 목록', '대상+시설 목록 행', placeColumns, facilities.map(item => placeRow(item, item.typeLabel, item.typeKey === 'library' ? '도서관 기본 목록' : '카카오 Local')));
  } else {
    add('주변시설', '기준 좌표 2km 내 조회된 공공기관·문화시설', '대상+시설 목록 행', placeColumns, (data.infrastructure?.publicPlaces || []).map(item => placeRow(item, item.categoryName || item.category, '카카오 Local')));
    add('인접행정동', '중심점 거리 기준 이용권역 행정동', '대상+실제 자치구+행정동', [
      col('area_gu', '실제 자치구', TEXT, '', '인접 행정동의 소속 자치구', '선택 자치구 밖의 인접 동도 포함될 수 있음'),
      col('dong', '행정동', TEXT, '', '화면의 행정동 명칭', '원천 KOSIS 명칭의 제 표기와 다를 수 있음'),
      col('distance', '행정동 중심점 거리', NUMBER, 'm', '기준 좌표에서 행정동 중심점까지 직선거리', '동 경계와의 거리나 동 전체가 반경에 포함된다는 의미가 아님')
    ], data.dongAreas || (data.dongs || []).map(dong => ({ dong, area_gu: null, distance: data.dongDistances?.[dong] ?? null })));
    tables.at(-1).rows = tables.at(-1).rows.map(row => ({ ...row, area_gu: row.area_gu || row.gu || null }));
  }
  const events = scope === 'district' ? data.cultureAndEducation?.cultureEvents || [] : data.infrastructure?.nearbyEvents || [];
  add('문화행사', '진행 중·예정 행사 전체 목록', '대상+행사 목록 행. 제공기관별 ID만으로 결합하지 않음', [
    col('id', '원천 ID', TEXT, '', '제공기관별 행사 식별자. 미제공 시 빈 셀'), col('title', '행사명', TEXT, '', '원천 행사명', '', 48),
    col('category', '행사 유형', TEXT, '', '원천 행사 분류'), col('place', '장소', TEXT, '', '원천 행사 장소', '', 40),
    col('startDate', '시작일', TEXT, '', '행사 시작일 YYYY-MM-DD'), col('endDate', '종료일', TEXT, '', '행사 종료일 YYYY-MM-DD'),
    col('status', '진행 상태', TEXT, '', 'ongoing=진행 중, upcoming=예정. 조회 시점 기준'),
    col('target', '참여 대상', TEXT, '', '원천 참여 대상. 빈 셀은 미제공'), col('fee', '비용 안내', TEXT, '', '금액·문구 원문. 빈 셀을 무료로 해석하지 않음'),
    col('isFree', '무료 여부 원문', TEXT, '', '원천 무료 안내 문구. 미제공 시 빈 셀'), col('organizer', '주최', TEXT, '', '원천 주최기관'),
    col('lat', '위도', NUMBER, '도', '행사 장소의 WGS84 위도'), col('lng', '경도', NUMBER, '도', '행사 장소의 WGS84 경도'),
    col('distance', '기준 위치 거리', NUMBER, 'm', '도서관·주소지와 행사 장소의 직선거리. 자치구 현황은 거리 없음'),
    col('link', '상세 URL', TEXT, '', '행사 상세 페이지'), col('thumbnail', '이미지 URL', TEXT, '', '원천 행사 이미지 주소'), ...provenanceColumns
  ], events.map(item => ({ ...item, id: item.id == null ? null : String(item.id), reference_period: null, source: item.sourceLabel || item.source,
    source_url: /kcisa/.test(item.source) ? sourceUrls.kcisa : sourceUrls.seoul, data_status: 'available',
    note: '화면 API가 반환한 목록 전체. 자치구는 최대 100건이며 원천 전체 행사 아님. 조회 시점의 필터링·중복 제거 결과를 보존' })));
  if (scope === 'district') {
    add('문화향유참고', '서울 전체 2024 조사 참고값. 선택 자치구의 조사 결과가 아님', '조사대상 집단+지표', [
      col('survey_group', '조사 집단', TEXT, '', '일반 시민·문화 관심층·장애인'), col('metric_name', '지표명', TEXT, '', '조사 항목', '', 38),
      col('value', '조사값', NUMBER, 'unit 참조', '화면의 서울 전체 조사값'), col('unit', '단위', TEXT, '', '%·회·만원'),
      col('denominator', '응답 분모', TEXT, '', '해당 항목의 응답대상·표본', '집단·문항별 분모가 다르므로 항목끼리 합산하지 않음', 55), ...provenanceColumns
    ], cultureReference.flatMap(group => group.items.map(item => ({ survey_group: group.label, metric_name: item.label, value: item.value, unit: item.unit,
      denominator: item.base || group.denominator, reference_period: '2024', source: '서울문화지표 문화향유 조사 참고값', source_url: sourceUrls.culture,
      data_status: 'reference', note: `${item.note}. 서울 전체 참고값이며 ${data.gu}의 추정치가 아님` }))));
    const ai = report ? scalarLeaves({ report: { sections: undefined, title: report.report?.title }, insight: { cards: undefined } }) : [];
    // Narrative text is separate from measured data and retains its draft/stale state.
    if (report) {
      (report.report?.sections || []).forEach((section, index) => scalarLeaves(section, `report.sections[${index}]`, true).forEach(row => ai.push(row)));
      (report.insight?.cards || []).forEach((card, index) => scalarLeaves(card, `insight.cards[${index}]`, true).forEach(row => ai.push(row)));
      Object.entries(report.interpretations || {}).forEach(([key, packet]) => scalarLeaves(packet, `interpretations.${key}`, true).forEach(row => ai.push(row)));
    }
    add('AI초안', '조회된 AI 보고서·해석의 초안 텍스트', '대상+초안 필드', [
      col('field_path', '초안 필드', TEXT, '', '보고서·인사이트·해석의 필드 경로', '', 48), col('text', '초안 내용', TEXT, '', 'AI가 생성한 해석. 통계 관측값이 아님', '', 90), ...provenanceColumns
    ], ai.filter(row => row.value != null).map(row => ({ field_path: row.path, text: typeof row.value === 'object' ? JSON.stringify(row.value) : String(row.value),
      reference_period: report.reportMonth || null, source: 'AI 생성 초안', source_url: null, data_status: 'draft',
      note: `내용 검토 필요. 저장 평가: ${report.cacheStatus?.qualityStatus || '미제공'}. 이전 스냅샷 여부: ${Boolean(report.cacheStatus?.stale)}` })));
  }
  const guide = {
    schema_version: '1.0', exported_at: exportedAt.toISOString(), target_type: scope, target_gu: data.gu, target_name: context.target_name,
    address: data.address || null, latitude: data.coordinates?.lat ?? null, longitude: data.coordinates?.lng ?? null,
    selected_population_mode: viewState.populationMode || 'resident', screen_filters: JSON.stringify(viewState),
    export_scope: '선택 대상의 모든 탭·전체 목록. 화면의 페이지·목록 필터로 잘라내지 않음',
    missing_values: '빈 셀은 미제공·결측. 0과 다름. 자료 상태와 원천 조회 상태를 함께 확인',
    rate_scale: '% 단위의 3.2는 3.2%. 자동으로 0.032로 변환하지 않음',
    population_extent: scope === 'district' ? '선택 자치구 전체. 서울 비교 인구는 별도 공간 수준' : '행정동 중심점 2km 내 동 전체 인구의 합. 근접 동 폴백 여부는 지표데이터 dongMatchMode 확인',
    time_policy: '통계 기준시점·조사연도·행사기간·보고서 대상월을 구분. 다운로드 시각은 원천 갱신일이 아님',
    ai_status: scope !== 'district' ? '해당 현황에 AI 초안 없음' : report ? `초안. ${report.reportMonth || '대상월 미제공'}. 내용 검토 필요` : 'AI 조회 미완료 또는 미제공. 원천 통계는 다운로드에 포함',
    event_scope: '자치구 문화행사 목록은 최대 100건. 화면에 반환되지 않은 원천 전체 자료는 포함되지 않음'
  };
  const guideTable = { name: '이용안내', description: '대상·다운로드 시각·분석 범위와 이용 조건', grain: '설명 항목', columns: [
    col('item', '항목', TEXT, '', '다운로드 대상·범위·정의·시간 정보', '', 32), col('value', '내용', '숫자 또는 문자열', '', '항목에 대한 값 또는 설명', '', 100)
  ], rows: Object.entries(guide).map(([item, value]) => ({ item, value })) };
  const catalog = { name: '시트목록', description: '시트별 관측 단위와 행수', grain: '시트', columns: [
    col('sheet', '시트명', TEXT, '', 'Excel 시트명'), col('description', '내용', TEXT, '', '시트에 포함된 데이터', '', 60),
    col('grain', '한 행의 단위', TEXT, '', '결합·중복 제거·집계 시 사용하는 관측 단위', '', 75), col('row_count', '데이터 행수', NUMBER, '행', '헤더를 제외한 행수. 0은 목록 반환 없음이며 원천 전체 0을 보장하지 않음')
  ], rows: [] };
  const dictionary = { name: '컬럼사전', description: '모든 시트의 컬럼 정의·자료형·단위·해석', grain: '시트+컬럼키', columns: [
    col('sheet', '시트명', TEXT, '', '정의 대상 시트'), col('column', '컬럼키', TEXT, '', '데이터 시트의 영문 헤더', '', 28),
    col('label', '컬럼명', TEXT, '', '한국어 명칭', '', 28), col('type', '자료형', TEXT, '', '숫자·문자열·논리값 또는 혼합형'),
    col('unit', '단위', TEXT, '', '고정 단위 또는 행의 unit 컬럼 참조'), col('definition', '정의', TEXT, '', '컬럼의 정보와 범위', '', 65),
    col('interpretation', '해석·유의사항', TEXT, '', '합산·결합·결측 해석 시 유의사항', '', 70)
  ], rows: [] };
  const result = [guideTable, catalog, dictionary, ...tables];
  dictionary.rows = result.flatMap(table => table.columns.map(column => ({ sheet: table.name, column: column.key, label: column.label, type: column.type,
    unit: column.unit, definition: column.definition, interpretation: column.interpretation || '빈 셀은 미제공. 원천 기준시점과 자료 상태를 함께 확인' })));
  catalog.rows = result.map(table => ({ sheet: table.name, description: table.description, grain: table.grain, row_count: table === catalog ? result.length : table.rows.length }));
  const exportDate = new Date(exportedAt.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  return { tables: result, filename: `${data.gu}-${scope === 'district' ? '자치구' : scope === 'address' ? data.address || '선택주소지' : data.library}-현황데이터-${exportDate}.xlsx`.replace(/[<>:"/\\|?*]/g, '_') };
}

export async function createAnalysisWorkbook(options) {
  const { default: ExcelJS } = await import('exceljs');
  const { tables, filename } = buildAnalysisTables(options);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LIBscope';
  workbook.created = options.exportedAt || new Date();
  for (const table of tables) {
    const sheet = workbook.addWorksheet(table.name, { views: [{ state: 'frozen', ySplit: 1 }], properties: { defaultRowHeight: 24 } });
    sheet.columns = table.columns.map(column => ({ key: column.key, header: column.key, width: column.width }));
    table.rows.forEach(row => sheet.addRow(table.columns.map(column => {
      const value = row[column.key];
      // ExcelJS writes primitive strings as strings, never as formulas or hyperlinks.
      return value == null || value === '' ? null : value;
    })));
    const header = sheet.getRow(1);
    header.height = 30;
    header.font = { name: '맑은 고딕', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0031A7' } };
    header.alignment = { vertical: 'middle' };
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: table.columns.length } };
    sheet.eachRow((row, index) => {
      if (index === 1) return;
      row.font = { name: '맑은 고딕', size: 10 };
      row.alignment = { vertical: 'top', wrapText: true };
      row.eachCell(cell => { if (typeof cell.value === 'number') cell.numFmt = '#,##0.########'; });
      const lines = table.columns.map((column, columnIndex) => String(row.getCell(columnIndex + 1).value ?? '').split('\n').reduce((count, line) => {
        const width = [...line].reduce((sum, char) => sum + (char.codePointAt(0) > 255 ? 2 : 1), 0);
        return count + Math.max(1, Math.ceil(width / (column.width - 2)));
      }, 0));
      row.height = Math.min(409, Math.max(26, Math.max(...lines) * 14 + 10));
    });
  }
  return { workbook, filename, tables };
}

export async function downloadAnalysisWorkbook(options) {
  const { workbook, filename } = await createAnalysisWorkbook(options);
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
