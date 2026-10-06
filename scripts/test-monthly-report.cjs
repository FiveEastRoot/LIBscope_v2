const assert = require('node:assert/strict');
const { currentReportMonth, reportValidUntil } = require('../functions/_shared/report-period.cjs');
const { buildSnapshotKey } = require('../functions/_shared/llm-harness.cjs');
const { fetchCachedDistrictInsight } = require('../functions/_shared/supabase-llm-cache.cjs');

async function main() {
  assert.equal(currentReportMonth(new Date('2026-09-30T15:00:00Z')), '2026-10');
  assert.equal(reportValidUntil('2026-12'), '2026-12-31T15:00:00.000Z');
  const base = { gu: '노원구', reportMonth: '2026-10', cultureAndEducation: { liveCultureEventsMonth: 1 } };
  const key = buildSnapshotKey(base);
  assert.notEqual(key, buildSnapshotKey({ ...base, reportMonth: '2026-11' }));
  assert.notEqual(key, buildSnapshotKey({ ...base, cultureAndEducation: { liveCultureEventsMonth: 4 } }));
  assert.equal(key, buildSnapshotKey({ ...base, _cache: { fetchedAt: 'different' } }));
  const first = { ...base, population: { total: 3, ageDistribution: { '5-9세': 2, '0-4세': 1 } } };
  const reordered = { ...base, population: { ageDistribution: { '0-4세': 1, '5-9세': 2 }, total: 3 } };
  assert.equal(buildSnapshotKey(first), buildSnapshotKey(reordered));
  process.env.SUPABASE_URL = 'https://unit-test.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
  let count = 0;
  global.fetch = async url => {
    if (++count === 1) {
      assert.match(url, /valid_until/);
      return new Response('[]');
    }
    return new Response(JSON.stringify([{ source_snapshot_key: 'old', generated_at: '2026-09-01', output_payload: { snapshotKey: 'old' } }]));
  };
  const cached = await fetchCachedDistrictInsight({ guName: '노원구', sourceSnapshotKey: key, harnessVersion: 'test', promptVersion: 'test', modelRegistryVersion: 'test' });
  assert.equal(cached.staleSnapshot, true);
  assert.equal(cached.payload.cacheStatus.canGenerate, true);
  assert.equal(cached.payload.cacheStatus.stale, true);
  const { fetchLibraryResidentPopulation } = require('../functions/_shared/supabase-metrics.cjs');
  const makeRow = (gu, count, date = '2026-09-01') => ({ gu, dong: '신사동', metric_value: count, reference_date: date,
    metric_json: { total: count, genderRatio: { male: count, female: 0 }, ageDistribution: { '0-4세': count } } });
  global.fetch = async () => new Response(JSON.stringify([makeRow('강남구', 10), makeRow('은평구', 20), makeRow('은평구', 30, '2026-05-01')]));
  const library = await fetchLibraryResidentPopulation(['신사동'], [{ gu: '은평구', dong: '신사동' }]);
  assert.equal(library.total, 20);
  const namedRow = (gu, dong, count) => ({ ...makeRow(gu, count), dong });
  global.fetch = async url => {
    assert.match(decodeURIComponent(url), /홍제제1동/);
    return new Response(JSON.stringify([
      namedRow('서대문구', '홍제제1동', 15), namedRow('서대문구', '홍제1동', 99),
      namedRow('동대문구', '용두동', 10), namedRow('동대문구', '신설동', 20),
      namedRow('다른구', '신설동', 100)
    ].filter(row => row.dong !== '홍제1동')));
  };
  const aliased = await fetchLibraryResidentPopulation(['홍제1동', '용신동'], [
    { gu: '서대문구', dong: '홍제1동' }, { gu: '동대문구', dong: '용신동' }
  ]);
  assert.equal(aliased.total, 45);
  assert.deepEqual(aliased.missingDongs, []);
  console.log('PASS: KST month boundary, month/event invalidation, cache metadata stability, stale fallback permits regeneration');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
