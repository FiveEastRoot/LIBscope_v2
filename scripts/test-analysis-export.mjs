import assert from 'node:assert/strict';
import { buildAnalysisTables, createAnalysisWorkbook } from '../src/utils/analysisExport.js';

const population = { total: 10, ageDistribution: { '0-4세': 4, '5-9세': 6 }, genderRatio: { male: 0, female: 10 }, source: 'kosis_resident_population', referenceDate: '2026-09-01' };
const events = Array.from({ length: 12 }, (_, index) => ({ id: `000${index}`, title: index ? `행사 ${index}` : '=1+1', fee: '', startDate: '2026-10-01', source: 'kcisa' }));
const data = { gu: '노원구', population: { modes: { resident: population, living: { ...population, source: 'SPOP_LOCAL_RESD_DONG', referenceDate: '20260731', isDelayed: true } } },
  welfare: { recipientRate: 3.2 }, socialIndicators: { totalHouseholds: 5, householdTypes: { '1인가구': 2 }, referenceDate: '2024-01-01', periods: { household: '2024' } },
  cultureAndEducation: { schoolDetails: { elementary: [{ name: '학교', lat: null, lng: null }] }, cultureEvents: events, schools: { elementary: 1 }, liveCultureEventsMonth: 12 } };
const options = { scope: 'district', data, cultureMetrics: { year: '2023', empty: '' }, cultureGroups: [{ title: '문화', description: '문화시설', metrics: [{ field: 'empty', label: '미수집', unit: '개' }] }],
  report: { reportMonth: '2026-10', report: { sections: [{ title: '보고서', body: '본문' }] }, insight: { cards: [{ bullets: ['첫째', '둘째'] }] } },
  viewState: { populationMode: 'living', cultureEventPage: 1, cultureEventFilter: 'upcoming' }, exportedAt: new Date('2026-10-06T15:00:00Z') };
const result = buildAnalysisTables(options);
const sheet = name => result.tables.find(table => table.name === name);
assert.match(result.filename, /2026-10-07.xlsx$/);
assert.equal(sheet('문화행사').rows.length, 12, 'Export every loaded event despite page/filter selection');
assert.equal(sheet('문화행사').rows[0].id, '0000');
assert.equal(sheet('문화행사').rows[0].fee, '');
assert.equal(sheet('지표데이터').rows.find(row => row.field_path === 'cultureMetrics.empty').value, null);
assert.equal(sheet('지표데이터').rows.find(row => row.field_path === 'welfare.recipientRate').value, 3.2);
assert.equal(sheet('지표데이터').rows.find(row => row.field_path === 'socialIndicators.totalHouseholds').reference_period, '2024');
assert.equal(sheet('인구분포').rows.find(row => row.population_mode === 'resident' && row.group_name === 'male').people_count, 0);
assert.equal(sheet('인구분포').rows.find(row => row.population_mode === 'living').reference_period, '2026-07-31');
assert.equal(sheet('인구분포').rows.find(row => row.population_mode === 'living').data_status, 'delayed');
assert(sheet('AI초안').rows.some(row => row.text === '둘째'));
const dictionary = sheet('컬럼사전').rows;
assert.equal(dictionary.length, result.tables.reduce((count, table) => count + table.columns.length, 0));
assert.equal(new Set(dictionary.map(row => `${row.sheet}:${row.column}`)).size, dictionary.length);
assert(dictionary.every(row => row.label && row.type && row.definition && row.interpretation));
const location = { gu: '노원구', targetType: 'address', library: '입력 위치', address: '서울 노원구 노원로34길 43', coordinates: { lat: 37.66, lng: 127.06 },
  demographics: { modes: { resident: population } }, dongAreas: [{ gu: '도봉구', dong: '창4동', distance: 1900 }], welfare: {}, infrastructure: { publicPlaces: [], nearbyEvents: [] } };
for (const scope of ['library', 'address']) {
  const target = buildAnalysisTables({ ...options, scope, data: { ...location, library: scope === 'library' ? '노원중앙도서관' : location.library } });
  const dong = target.tables.find(table => table.name === '인접행정동').rows[0];
  assert.equal(dong.target_gu, '노원구');
  assert.equal(dong.area_gu, '도봉구');
  assert.equal(dong.distance, 1900);
  assert.equal(dong.target_name, scope === 'library' ? '노원중앙도서관' : location.address);
}
const { workbook } = await createAnalysisWorkbook(options);
const buffer = await workbook.xlsx.writeBuffer();
const { default: ExcelJS } = await import('exceljs');
const loaded = new ExcelJS.Workbook();
await loaded.xlsx.load(buffer);
const eventsSheet = loaded.getWorksheet('문화행사');
const headers = eventsSheet.getRow(1).values;
assert.equal(eventsSheet.rowCount, 13);
assert.equal(eventsSheet.getRow(2).getCell(headers.indexOf('title')).value, '=1+1', 'Formula-like source text must remain text');
assert.equal(eventsSheet.getRow(2).getCell(headers.indexOf('title')).type, ExcelJS.ValueType.String);
assert.equal(eventsSheet.getRow(2).getCell(headers.indexOf('fee')).value, null);
assert.equal(loaded.getWorksheet('인구분포').views[0].ySplit, 1);
console.log('PASS: complete lists, selection identity, dictionary coverage, numeric/null/zero preservation, periods, cross-gu areas, AI bullets, typed XLSX roundtrip');
