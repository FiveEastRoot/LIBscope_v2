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
  console.log('PASS: KST month boundary, month/event invalidation, cache metadata stability, stale fallback permits regeneration');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
