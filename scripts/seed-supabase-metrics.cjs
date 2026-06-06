const fs = require('fs');
const path = require('path');

const ROOT_DIR = process.cwd();
const CHUNK_SIZE = 500;

function loadLocalEnv() {
  const envPath = path.resolve(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  });
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) {
      values.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim().replace(/^"|"$/g, ''));
  return values;
}

function readCSV(fileName) {
  let content = fs.readFileSync(path.resolve(ROOT_DIR, fileName), 'utf-8');
  if (content.startsWith('\uFEFF')) content = content.slice(1);
  const [headerLine, ...lines] = content.split(/\r?\n/).filter(Boolean);
  const headers = parseCSVLine(headerLine);
  return lines.map(line => {
    const values = parseCSVLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    return row;
  });
}

function readJSON(fileName) {
  return JSON.parse(fs.readFileSync(path.resolve(ROOT_DIR, fileName), 'utf-8'));
}

function number(value) {
  const parsed = Number(String(value || '0').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function groupBy(rows, keyFn) {
  const groups = new Map();
  rows.forEach(row => {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return groups;
}

function buildDistrictPopulationRows() {
  const rows = readCSV('district_age_gender_population.csv');
  return [...groupBy(rows, row => row['자치구']).entries()].map(([gu, items]) => {
    const ageDistribution = {};
    const genderRatio = { male: 0, female: 0 };
    items.forEach(item => {
      const age = item['연령'];
      const count = number(item['인구수']);
      ageDistribution[age] = (ageDistribution[age] || 0) + count;
      if (item['성별'] === '남자') genderRatio.male += count;
      if (item['성별'] === '여자') genderRatio.female += count;
    });
    const total = genderRatio.male + genderRatio.female;
    return {
      gu,
      metric_key: 'resident_population_age_gender',
      population_mode: 'resident',
      metric_value: total,
      metric_json: { ageDistribution, genderRatio, total },
      denominator_key: null,
      reference_date: null,
      source_key: 'resident_population_dong'
    };
  });
}

function buildDongPopulationRows() {
  const ageRows = readCSV('2_population_and_senior.csv');
  const genderRows = readCSV('3_gender.csv');
  const genderByDong = new Map(genderRows.map(row => [`${row['자치구']}|${row['행정동']}`, row]));

  return ageRows
    .filter(row => row['행정동'] && row['행정동'] !== '소계')
    .map(row => {
      const ageDistribution = {};
      Object.entries(row).forEach(([key, value]) => {
        if (key === '자치구' || key === '행정동' || key === '고령자' || key === '학령인구') return;
        ageDistribution[key] = number(value);
      });
      const gender = genderByDong.get(`${row['자치구']}|${row['행정동']}`) || {};
      const genderRatio = {
        male: number(gender['남자']),
        female: number(gender['여자'])
      };
      const total = genderRatio.male + genderRatio.female || Object.values(ageDistribution).reduce((sum, value) => sum + value, 0);
      return {
        gu: row['자치구'],
        dong: row['행정동'],
        metric_key: 'resident_population_age_gender',
        population_mode: 'resident',
        metric_value: total,
        metric_json: { ageDistribution, genderRatio, total },
        denominator_key: null,
        reference_date: null,
        source_key: 'resident_population_dong'
      };
    });
}

function buildDistrictWelfareRows() {
  const rows = readCSV('district_data_combined.csv');
  const rates = rows.map(row => number(row['수급률'])).filter(value => Number.isFinite(value));
  const seoulAvgRecipientRate = rates.reduce((sum, value) => sum + value, 0) / (rates.length || 1);
  return rows.map(row => ({
    gu: row['자치구'],
    metric_key: 'welfare_recipient_rate',
    population_mode: null,
    metric_value: number(row['수급률']),
    metric_json: { seoulAvgRecipientRate: Number(seoulAvgRecipientRate.toFixed(3)) },
    denominator_key: 'resident_population',
    reference_date: null,
    source_key: 'welfare_recipients_dong'
  }));
}

function buildDongWelfareRows() {
  return readCSV('5_number_of_recipients.csv')
    .filter(row => row['행정동'] && row['행정동'] !== '기타')
    .map(row => ({
      gu: row['자치구'],
      dong: row['행정동'],
      metric_key: 'welfare_recipients',
      population_mode: null,
      metric_value: number(row['수급자수']),
      metric_json: {},
      denominator_key: 'resident_population',
      reference_date: null,
      source_key: 'welfare_recipients_dong'
    }));
}

function buildLibraryProfiles() {
  const mapping = readJSON('library_dong_mapping.json');
  return mapping.libraries.map(item => ({
    library_id: `${item.gu}:${item.name}`,
    name: item.name,
    gu: item.gu,
    address: item.address || null,
    lat: item.lat || null,
    lng: item.lng || null,
    source_key: null
  }));
}

function getConfig() {
  loadLocalEnv();
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }
  return { url, key };
}

async function request(table, options = {}) {
  const { url, key } = getConfig();
  const response = await fetch(`${url}/rest/v1/${table}${options.query || ''}`, {
    method: options.method || 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=minimal'
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${options.method || 'GET'} ${table} failed: ${response.status} ${body}`);
  }
  return response;
}

async function deleteMetricRows(table, metricKeys) {
  const keys = metricKeys.join(',');
  await request(table, { method: 'DELETE', query: `?metric_key=in.(${keys})` });
}

async function insertRows(table, rows) {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    await request(table, { method: 'POST', body: chunk });
    console.log(`Seeded ${table}: ${Math.min(i + CHUNK_SIZE, rows.length)}/${rows.length}`);
  }
}

async function upsertRows(table, rows, conflictKey) {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    await request(table, {
      method: 'POST',
      query: `?on_conflict=${conflictKey}`,
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: chunk
    });
    console.log(`Upserted ${table}: ${Math.min(i + CHUNK_SIZE, rows.length)}/${rows.length}`);
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const districtPopulation = buildDistrictPopulationRows();
  const dongPopulation = buildDongPopulationRows();
  const districtWelfare = buildDistrictWelfareRows();
  const dongWelfare = buildDongWelfareRows();
  const libraryProfiles = buildLibraryProfiles();

  await upsertRows('library_profiles', libraryProfiles, 'library_id');
  await deleteMetricRows('district_metrics', ['resident_population_age_gender', 'welfare_recipient_rate']);
  await deleteMetricRows('dong_metrics', ['resident_population_age_gender', 'welfare_recipients']);
  await insertRows('district_metrics', [...districtPopulation, ...districtWelfare]);
  await insertRows('dong_metrics', [...dongPopulation, ...dongWelfare]);
  await request('refresh_runs', {
    method: 'POST',
    body: [{
      scope: 'seed_static_metrics',
      status: 'success',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      item_count: libraryProfiles.length + districtPopulation.length + dongPopulation.length + districtWelfare.length + dongWelfare.length
    }]
  });
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
