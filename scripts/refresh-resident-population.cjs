const { buildKosisPopulationRows, loadLocalEnv } = require('./seed-supabase-metrics.cjs');
const { currentReportMonth } = require('../functions/_shared/report-period.cjs');

function validatePopulation(data) {
  if (!data || data.districtRows.length !== 25 || data.dongRows.length < 400) throw new Error('Incomplete population dataset');
  const lag = (Number(currentReportMonth().slice(0, 4)) - Number(data.period.slice(0, 4))) * 12
    + Number(currentReportMonth().slice(5)) - Number(data.period.slice(4));
  if (lag < 0 || lag > 2) throw new Error(`Resident population is stale: ${data.period}`);
  for (const rows of [data.districtRows, data.dongRows]) {
    const keys = new Set();
    for (const row of rows) {
      const key = `${row.gu}:${row.dong || ''}`;
      const p = row.metric_json;
      if (keys.has(key) || row.reference_date !== data.referenceDate || !(p.total > 0)
        || p.total !== p.genderRatio.male + p.genderRatio.female
        || p.total !== Object.values(p.ageDistribution).reduce((a, b) => a + b, 0)) {
        throw new Error(`Invalid population row: ${key}`);
      }
      keys.add(key);
    }
  }
  for (const district of data.districtRows) {
    const total = data.dongRows.filter(row => row.gu === district.gu).reduce((sum, row) => sum + row.metric_value, 0);
    if (total !== district.metric_value) throw new Error(`District/dong population mismatch: ${district.gu}`);
  }
}

async function main() {
  loadLocalEnv();
  if (!process.env.KOSIS_API_KEY) throw new Error('KOSIS_API_KEY is required; static fallback is not a monthly refresh');
  const data = await buildKosisPopulationRows();
  // KOSIS metadata also lists abolished administrative units with no rows
  // in the selected month. Retain only units actually published for that month.
  const empty = data.dongRows.filter(row => row.metric_value === 0 && Object.keys(row.metric_json.ageDistribution).length === 0);
  data.dongRows = data.dongRows.filter(row => !empty.includes(row));
  console.log(`Excluded ${empty.length} inactive units with no source records for ${data.period}`);
  validatePopulation(data);
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify({ period: data.period, districts: data.districtRows.length, dongs: data.dongRows.length, validated: true }));
    return;
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.SUPABASE_URL;
  if (!url || !key) throw new Error('Supabase configuration missing');
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  async function request(path, method = 'GET', body) {
    const response = await fetch(`${url}/rest/v1/${path}`, { method, headers, body: body && JSON.stringify(body), signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Population storage failed: ${response.status} ${await response.text()}`);
    const text = await response.text();
    return text ? JSON.parse(text) : [];
  }
  // Preserve history. Each new monthly table batch is a single atomic REST insert;
  // publish district rows only after the complete dong batch is persisted.
  for (const [table, rows] of [['dong_metrics', data.dongRows], ['district_metrics', data.districtRows]]) {
    const filter = `metric_key=eq.resident_population_age_gender&population_mode=eq.resident&reference_date=eq.${data.referenceDate}`;
    const existing = await request(`${table}?select=id,gu${table === 'dong_metrics' ? ',dong' : ''}&${filter}`);
    const existingKeys = new Set(existing.map(row => `${row.gu}:${row.dong || ''}`));
    const missing = rows.filter(row => !existingKeys.has(`${row.gu}:${row.dong || ''}`));
    if (missing.length) await request(table, 'POST', missing);
    const stored = await request(`${table}?select=gu,metric_value${table === 'dong_metrics' ? ',dong' : ''}&${filter}`);
    if (stored.length !== rows.length || rows.some(row => !stored.some(saved => saved.gu === row.gu && saved.dong === row.dong && Number(saved.metric_value) === row.metric_value))) {
      throw new Error(`Population readback mismatch: ${table}`);
    }
    console.log(`Verified ${table}: ${stored.length} rows, period ${data.period}`);
  }
}
module.exports = { validatePopulation };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
