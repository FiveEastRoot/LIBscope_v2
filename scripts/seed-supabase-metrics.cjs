const fs = require('fs');
const path = require('path');

const ROOT_DIR = process.cwd();
const CHUNK_SIZE = 500;
const KOSIS_TABLE = {
  orgId: '101',
  tblId: 'DT_1B04005N',
  sourceKey: 'resident_population_kosis',
  itemIds: ['T2', 'T3', 'T4'],
  totalItemId: 'T2',
  maleItemId: 'T3',
  femaleItemId: 'T4',
  totalAgeCode: '0'
};

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

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function normalizeAgeLabel(label) {
  if (!label || label === '계') return null;
  if (label === '100+') return '100세 이상';
  return String(label)
    .replace(/\s+/g, '')
    .replace('-', '-')
    .replace(/세$/, '세');
}

function kosisReferenceDate(period) {
  const raw = String(period || '');
  if (!/^\d{6}$/.test(raw)) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-01`;
}

async function fetchKosisJson(baseUrl, params) {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url);
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`KOSIS returned non-JSON response: ${text.slice(0, 200)}`);
  }

  if (!response.ok || data?.err) {
    throw new Error(`KOSIS request failed: ${response.status} ${JSON.stringify(data).slice(0, 300)}`);
  }

  return data;
}

async function fetchKosisMeta(type) {
  return fetchKosisJson('https://kosis.kr/openapi/statisticsData.do', {
    method: 'getMeta',
    apiKey: process.env.KOSIS_API_KEY,
    format: 'json',
    jsonVD: 'Y',
    type,
    orgId: KOSIS_TABLE.orgId,
    tblId: KOSIS_TABLE.tblId
  });
}

async function fetchKosisResidentRows({ adminCodes, ageCodes, period }) {
  const rows = [];
  const adminChunks = chunk(adminCodes, 60);

  for (const adminChunk of adminChunks) {
    const data = await fetchKosisJson('https://kosis.kr/openapi/Param/statisticsParameterData.do', {
      method: 'getList',
      apiKey: process.env.KOSIS_API_KEY,
      itmId: KOSIS_TABLE.itemIds.join('+'),
      objL1: adminChunk.join('+'),
      objL2: ageCodes.join('+'),
      objL3: '',
      objL4: '',
      objL5: '',
      objL6: '',
      objL7: '',
      objL8: '',
      format: 'json',
      jsonVD: 'Y',
      prdSe: 'M',
      startPrdDe: period,
      endPrdDe: period,
      orgId: KOSIS_TABLE.orgId,
      tblId: KOSIS_TABLE.tblId
    });

    if (!Array.isArray(data)) {
      throw new Error(`Unexpected KOSIS data shape: ${JSON.stringify(data).slice(0, 300)}`);
    }
    rows.push(...data);
  }

  return rows;
}

function summarizeKosisRows(rows, { gu, dong = null, referenceDate }) {
  const summary = {
    ageDistribution: {},
    genderRatio: { male: 0, female: 0 },
    total: 0,
    source: 'kosis_resident_population',
    referenceDate
  };

  rows.forEach(row => {
    const value = number(row.DT);
    if (row.C2 === KOSIS_TABLE.totalAgeCode) {
      if (row.ITM_ID === KOSIS_TABLE.totalItemId) summary.total = value;
      if (row.ITM_ID === KOSIS_TABLE.maleItemId) summary.genderRatio.male = value;
      if (row.ITM_ID === KOSIS_TABLE.femaleItemId) summary.genderRatio.female = value;
      return;
    }

    if (row.ITM_ID === KOSIS_TABLE.totalItemId) {
      const ageLabel = normalizeAgeLabel(row.C2_NM);
      if (ageLabel) summary.ageDistribution[ageLabel] = value;
    }
  });

  if (!summary.total) {
    summary.total = summary.genderRatio.male + summary.genderRatio.female;
  }

  return {
    gu,
    ...(dong ? { dong } : {}),
    metric_key: 'resident_population_age_gender',
    population_mode: 'resident',
    metric_value: summary.total,
    metric_json: summary,
    denominator_key: null,
    reference_date: referenceDate,
    source_key: KOSIS_TABLE.sourceKey
  };
}

async function buildKosisPopulationRows() {
  if (!process.env.KOSIS_API_KEY) return null;

  const [periodMeta, itemMeta] = await Promise.all([
    fetchKosisMeta('PRD'),
    fetchKosisMeta('ITM')
  ]);

  const latestMonthly = [...periodMeta]
    .filter(row => row.PRD_SE === '월' && row.END_PRD_DE)
    .sort((a, b) => String(b.END_PRD_DE).localeCompare(String(a.END_PRD_DE)))[0];
  const period = String(latestMonthly?.END_PRD_DE || '').replace('.', '');
  if (!/^\d{6}$/.test(period)) {
    throw new Error('Unable to determine latest KOSIS monthly resident population period.');
  }

  const adminItems = itemMeta.filter(row => row.OBJ_ID === 'A');
  const ageItems = itemMeta.filter(row => row.OBJ_ID === 'B');
  const guItems = adminItems.filter(row => row.UP_ITM_ID === '11');
  const guCodeSet = new Set(guItems.map(row => row.ITM_ID));
  const dongItems = adminItems.filter(row => guCodeSet.has(row.UP_ITM_ID));
  const guByCode = new Map(guItems.map(row => [row.ITM_ID, row.ITM_NM]));
  const guByDongCode = new Map(dongItems.map(row => [row.ITM_ID, guByCode.get(row.UP_ITM_ID)]));
  const dongByCode = new Map(dongItems.map(row => [row.ITM_ID, row.ITM_NM]));
  const ageCodes = ageItems.map(row => row.ITM_ID);
  const adminCodes = [...guItems.map(row => row.ITM_ID), ...dongItems.map(row => row.ITM_ID)];
  const referenceDate = kosisReferenceDate(period);

  const rawRows = await fetchKosisResidentRows({ adminCodes, ageCodes, period });
  const rowsByAdmin = groupBy(rawRows, row => row.C1);

  const districtRows = guItems.map(item => summarizeKosisRows(rowsByAdmin.get(item.ITM_ID) || [], {
    gu: item.ITM_NM,
    referenceDate
  }));

  const dongRows = dongItems.map(item => summarizeKosisRows(rowsByAdmin.get(item.ITM_ID) || [], {
    gu: guByDongCode.get(item.ITM_ID),
    dong: dongByCode.get(item.ITM_ID),
    referenceDate
  }));

  if (districtRows.length !== 25 || dongRows.length < 400) {
    throw new Error(`Unexpected KOSIS Seoul resident row counts: districts=${districtRows.length}, dongs=${dongRows.length}`);
  }

  console.log(`Loaded KOSIS resident population ${period}: ${districtRows.length} districts, ${dongRows.length} dongs.`);
  return { districtRows, dongRows, period, referenceDate };
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
  loadLocalEnv();
  let populationSource = 'csv_static_fallback';
  let districtPopulation = buildDistrictPopulationRows();
  let dongPopulation = buildDongPopulationRows();

  try {
    const kosisPopulation = await buildKosisPopulationRows();
    if (kosisPopulation) {
      districtPopulation = kosisPopulation.districtRows;
      dongPopulation = kosisPopulation.dongRows;
      populationSource = `kosis_${kosisPopulation.period}`;
    }
  } catch (err) {
    console.warn(`KOSIS resident population seed fallback to CSV: ${err.message}`);
  }

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
      item_count: libraryProfiles.length + districtPopulation.length + dongPopulation.length + districtWelfare.length + dongWelfare.length,
      error_message: `resident_population_source=${populationSource}`
    }]
  });
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
