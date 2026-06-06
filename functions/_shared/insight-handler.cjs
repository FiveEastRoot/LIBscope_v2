const fs = require('fs');
const path = require('path');
const staticData = require('./static-data.cjs');

const axios = {
  async get(url, options = {}) {
    const target = new URL(url);
    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          target.searchParams.set(key, String(value));
        }
      });
    }

    const controller = new AbortController();
    const timeoutMs = options.timeout || 10000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(target, {
        method: 'GET',
        headers: options.headers || {},
        signal: controller.signal
      });
      const text = await response.text();
      let data = text;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (err) {
        data = text;
      }

      if (!response.ok) {
        const error = new Error(`Request failed with status ${response.status}`);
        error.response = { status: response.status, data };
        throw error;
      }

      return { status: response.status, data };
    } finally {
      clearTimeout(timeout);
    }
  }
};

const INSIGHT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1주일
const INSIGHT_CACHE_FILE = '/tmp/insight-api-cache.json';
const INSIGHT_CACHE_VERSION = 'v1';
const memoryCache = new Map();

function buildCacheKey(type, identifiers = {}) {
  const ordered = Object.keys(identifiers)
    .sort()
    .map((key) => `${key}=${identifiers[key] || ''}`)
    .join('&');
  return `${INSIGHT_CACHE_VERSION}:${type}${ordered ? `:${ordered}` : ''}`;
}

function pruneMemoryCache() {
  if (memoryCache.size <= 300) return;
  const oldest = [...memoryCache.entries()].sort((a, b) => (a[1].updatedAt || 0) - (b[1].updatedAt || 0));
  while (memoryCache.size > 300 && oldest.length > 0) {
    const [oldestKey] = oldest.shift();
    memoryCache.delete(oldestKey);
  }
}

function normalizeCacheEntry(entry) {
  if (!entry) return null;
  if (typeof entry !== 'object') return null;
  if (!entry.value || typeof entry.value !== 'object') return null;
  if (!entry.expiresAt || !entry.fetchedAt) return null;
  return entry;
}

function readPersistedCache() {
  try {
    if (!fs.existsSync(INSIGHT_CACHE_FILE)) return {};
    const content = fs.readFileSync(INSIGHT_CACHE_FILE, 'utf-8');
    const parsed = JSON.parse(content || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.warn('캐시 파일 로드 실패:', err.message);
    return {};
  }
}

function writePersistedCache(cacheData) {
  try {
    const dir = path.dirname(INSIGHT_CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(INSIGHT_CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf-8');
  } catch (err) {
    console.warn('캐시 파일 저장 실패:', err.message);
  }
}

function getNow() {
  return Date.now();
}

function isCacheFresh(entry) {
  return entry && entry.expiresAt && entry.expiresAt > getNow();
}

function getPersistedCacheEntry(cacheKey) {
  const persisted = readPersistedCache();
  const raw = normalizeCacheEntry(persisted[cacheKey]);
  if (!raw) return null;
  return isCacheFresh(raw) ? raw : null;
}

function getMemoryCacheEntry(cacheKey) {
  const entry = normalizeCacheEntry(memoryCache.get(cacheKey));
  if (!entry) return null;
  return isCacheFresh(entry) ? entry : null;
}

function setCacheEntry(cacheKey, value, ttlMs = INSIGHT_CACHE_TTL_MS, sourceMeta = {}) {
  const now = getNow();
  const item = {
    fetchedAt: new Date(now).toISOString(),
    updatedAt: now,
    expiresAt: now + ttlMs,
    ttlMs,
    sourceMeta,
    value
  };

  memoryCache.set(cacheKey, item);
  pruneMemoryCache();

  const persisted = readPersistedCache();
  persisted[cacheKey] = item;
  writePersistedCache(persisted);
}

function getCachedResponse(cacheKey) {
  const memory = getMemoryCacheEntry(cacheKey);
  if (memory) return memory;

  const persisted = getPersistedCacheEntry(cacheKey);
  if (persisted) {
    memoryCache.set(cacheKey, persisted);
    pruneMemoryCache();
    return persisted;
  }

  return null;
}

// 하버사인 거리 계산 함수 (단위: m)
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // 지구 반지름
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// 파일 절대 경로 탐색 헬퍼 (로컬 에뮬레이터 및 프로덕션 람다 겸용)
function getAbsolutePath(filePath) {
  console.log(`[getAbsolutePath] Requested: ${filePath}`);
  console.log(`[getAbsolutePath] process.cwd(): ${process.cwd()}`);
  console.log(`[getAbsolutePath] __dirname: ${__dirname}`);
  
  // 1. process.cwd() 기준 탐색
  let fullPath = path.resolve(process.cwd(), filePath);
  console.log(`[getAbsolutePath] Candidate 1 (process.cwd): ${fullPath} (Exists: ${fs.existsSync(fullPath)})`);
  if (fs.existsSync(fullPath)) return fullPath;

  // 2. 함수 번들 내부 데이터 폴더 탐색
  fullPath = path.resolve(__dirname, '../_data', filePath);
  console.log(`[getAbsolutePath] Candidate 2 (function _data): ${fullPath} (Exists: ${fs.existsSync(fullPath)})`);
  if (fs.existsSync(fullPath)) return fullPath;
  
  // 3. __dirname 기준 상위 폴더 탐색
  fullPath = path.resolve(__dirname, '../', filePath);
  console.log(`[getAbsolutePath] Candidate 3 (__dirname parent): ${fullPath} (Exists: ${fs.existsSync(fullPath)})`);
  if (fs.existsSync(fullPath)) return fullPath;
  
  // 4. __dirname 기준 내부 폴더 탐색
  fullPath = path.resolve(__dirname, filePath);
  console.log(`[getAbsolutePath] Candidate 4 (__dirname internal): ${fullPath} (Exists: ${fs.existsSync(fullPath)})`);
  if (fs.existsSync(fullPath)) return fullPath;
  
  return null;
}

function getDataFileStatus(filePath) {
  const candidates = [
    path.resolve(process.cwd(), filePath),
    path.resolve(process.cwd(), 'functions/_data', filePath),
    path.resolve(__dirname, '../_data', filePath),
    path.resolve(__dirname, '../../', filePath),
    path.resolve(__dirname, '../', filePath),
    path.resolve(__dirname, filePath)
  ];

  const checked = candidates.map(candidate => ({
    path: candidate,
    exists: fs.existsSync(candidate)
  }));

  return {
    file: filePath,
    exists: checked.some(item => item.exists),
    checked
  };
}

function readBundledDataFile(filePath) {
  if (Object.prototype.hasOwnProperty.call(staticData, filePath)) {
    return staticData[filePath];
  }

  try {
    switch (filePath) {
      case 'district_age_gender_population.csv':
        return fs.readFileSync(path.join(__dirname, '../_data/district_age_gender_population.csv'), 'utf-8');
      case 'district_data_combined.csv':
        return fs.readFileSync(path.join(__dirname, '../_data/district_data_combined.csv'), 'utf-8');
      case 'library_dong_mapping.json':
        return fs.readFileSync(path.join(__dirname, '../_data/library_dong_mapping.json'), 'utf-8');
      case 'dong_coordinates.json':
        return fs.readFileSync(path.join(__dirname, '../_data/dong_coordinates.json'), 'utf-8');
      case 'dong_code_mapping.json':
        return fs.readFileSync(path.join(__dirname, '../_data/dong_code_mapping.json'), 'utf-8');
      case '2_population_and_senior.csv':
        return fs.readFileSync(path.join(__dirname, '../_data/2_population_and_senior.csv'), 'utf-8');
      case '3_gender.csv':
        return fs.readFileSync(path.join(__dirname, '../_data/3_gender.csv'), 'utf-8');
      case '5_number_of_recipients.csv':
        return fs.readFileSync(path.join(__dirname, '../_data/5_number_of_recipients.csv'), 'utf-8');
      default:
        return null;
    }
  } catch (err) {
    return null;
  }
}

// CSV의 한 줄을 따옴표와 쉼표를 고려하여 올바르게 분리하는 헬퍼 함수
function parseCSVLine(line) {
  const values = [];
  let currentVal = '';
  let inQuotes = false;
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(currentVal.trim().replace(/^"|"$/g, ''));
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  values.push(currentVal.trim().replace(/^"|"$/g, ''));
  return values;
}

// 초경량 CSV 파서 (Pandas 대체)
function parseCSV(filePath) {
  try {
    let content = readBundledDataFile(filePath);
    if (content === null) {
      const fullPath = getAbsolutePath(filePath);
      if (!fullPath) {
        console.warn(`파일을 찾을 수 없습니다: ${filePath}`);
        return [];
      }
      content = fs.readFileSync(fullPath, 'utf-8');
    }
    if (content.startsWith('\uFEFF')) {
      content = content.slice(1);
    }
    const lines = content.split(/\r?\n/);
    if (lines.length === 0) return [];
    
    // 헤더 파싱 (따옴표 내 쉼표 고려)
    const headers = parseCSVLine(lines[0]);
    const result = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = parseCSVLine(line);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      result.push(row);
    }
    return result;
  } catch (err) {
    console.error(`CSV 파싱 에러 (${filePath}):`, err);
    return [];
  }
}

// JSON 파일 읽기 헬퍼
function readJSON(filePath) {
  try {
    let content = readBundledDataFile(filePath);
    if (content === null) {
      const fullPath = getAbsolutePath(filePath);
      if (!fullPath) return null;
      content = fs.readFileSync(fullPath, 'utf-8');
    }
    return JSON.parse(content);
  } catch (err) {
    console.error(`JSON 읽기 에러 (${filePath}):`, err);
    return null;
  }
}

function formatYYYYMMDD(date) {
  const seoulTime = new Date(date.getTime() + (9 * 60 * 60 * 1000));
  return seoulTime.toISOString().slice(0, 10).replace(/-/g, '');
}

function parsePopulationNumber(value) {
  const parsed = parseFloat(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createEmptyPopulationSummary() {
  return {
    ageDistribution: {},
    genderRatio: { male: 0, female: 0 },
    total: 0,
    source: 'csv_fallback',
    referenceDate: null,
    matchedDongs: [],
    missingDongs: []
  };
}

function normalizeAgeGroupLabel(rawAge) {
  if (!rawAge) return null;
  const age = String(rawAge).trim();
  if (/전체|합계/i.test(age)) return '총인구';
  const m = age.match(/(\d{1,2})[-~]?(?:\s*)?(\d{1,2})/);
  if (m) return `${m[1]}-${m[2]}세`;
  const m2 = age.match(/(\d{1,2})세\s*이상/);
  if (m2) return `${m2[1]}세 이상`;
  return null;
}

function extractDongCodeFromRow(row) {
  return row.ADSTRD_CODE_SE || row.ADSTRD_CODE || row.DONG_CD || row.DONG_CODE || row.CODE || null;
}

function extractPopulationRowDate(row) {
  return row.STDR_DE_ID || row.STDR_DT || row.STDR_DATE || null;
}

function normalizePopulationSuffix(suffix) {
  if (!suffix) return null;
  const direct = String(suffix).toUpperCase().trim();
  const normalized = direct
    .replace(/^F/, '')
    .replace(/^M/, '')
    .replace(/LVPOP_CO$/, '');
  if (normalized === 'TOT') return '총인구';
  if (normalized === 'TOTAL' || normalized === 'TOTPOP') return '총인구';
  let match = normalized.match(/^(\d{1,2})T(\d{1,2})$/);
  if (match) return `${match[1]}-${match[2]}세`;
  match = normalized.match(/^(\d{1,2})_(\d{1,2})$/);
  if (match) return `${match[1]}-${match[2]}세`;
  match = normalized.match(/(OVER|OVER70|OVER70\+|70PLUS|70_UP|70이상)/);
  if (match) return '70세 이상';
  return null;
}

function rowToPopulationSummary(summary, row, dongName) {
  let hasValue = false;
  const seenSuffixes = new Set();

  Object.keys(row).forEach(key => {
    if (!key.startsWith('MALE_')) return;
    if (!key.endsWith('_LVPOP_CO')) return;
    const suffix = key.slice(5, -8);
    if (seenSuffixes.has(suffix)) return;
    seenSuffixes.add(suffix);

    const male = parsePopulationNumber(row[`MALE_${suffix}_LVPOP_CO`]);
    const female = parsePopulationNumber(row[`FEMALE_${suffix}_LVPOP_CO`]);
    if (male === 0 && female === 0) return;

    const label = normalizePopulationSuffix(suffix) || normalizePopulationSuffix(key.replace(/^MALE_|_LVPOP_CO$/g, ''));
    if (!label) return;

    summary.ageDistribution[label] = (summary.ageDistribution[label] || 0) + male + female;
    summary.genderRatio.male += male;
    summary.genderRatio.female += female;
    hasValue = true;
  });

  if (!hasValue && (row.AGE_GROUP || row.AGE_NAME)) {
    const label = normalizeAgeGroupLabel(row.AGE_GROUP || row.AGE_NAME);
    const male = parsePopulationNumber(row.MALE_POP || row.M_POP || row.MALE || row.MAN);
    const female = parsePopulationNumber(row.FEMALE_POP || row.F_POP || row.FEMALE || row.WOMAN);
    if (label && (male > 0 || female > 0)) {
      summary.ageDistribution[label] = (summary.ageDistribution[label] || 0) + male + female;
      summary.genderRatio.male += male;
      summary.genderRatio.female += female;
      hasValue = true;
    }
  }

  if (hasValue) {
    const rowTotal = parsePopulationNumber(row.TOT_LVPOP_CO || row.LVPOP_CO || row.TOT_POP || row.TOTAL);
    if (rowTotal > 0) summary.total += rowTotal;
    summary.matchedDongs.push(dongName);
    if (!summary.referenceDate) summary.referenceDate = extractPopulationRowDate(row);
  }
}

function finalizePopulationSummary(summary) {
  summary.genderRatio.male = Math.round(summary.genderRatio.male);
  summary.genderRatio.female = Math.round(summary.genderRatio.female);
  summary.total = Math.round(summary.total);
  Object.keys(summary.ageDistribution).forEach(key => {
    summary.ageDistribution[key] = Math.round(summary.ageDistribution[key]);
  });
  summary.missingDongs = [...new Set(summary.missingDongs)];
}

function pickApiRows(apiName, response) {
  const wrapped = response.data || {};
  if (wrapped[apiName] && Array.isArray(wrapped[apiName].row)) {
    return wrapped[apiName].row;
  }
  const byRow = Object.values(wrapped).find(v => v && Array.isArray(v.row));
  return Array.isArray(byRow?.row) ? byRow.row : [];
}

async function fetchLiveDongPopulation({ apiKey, gu, dongs, dongAreas = [] }) {
  const summary = createEmptyPopulationSummary();
  const codeMapping = readJSON('dong_code_mapping.json');

  if (!codeMapping || !codeMapping.nameToCode) {
    summary.missingDongs = dongs;
    return summary;
  }

  const lookupTargets = dongAreas.length > 0
    ? dongAreas
    : dongs.map(dong => ({ gu, dong }));
  const dongCodeEntries = lookupTargets.map(area => ({
    gu: area.gu || gu,
    dong: area.dong,
    code: codeMapping.nameToCode[`${area.gu || gu} ${area.dong}`]
  }));
  const targetCodes = new Set(dongCodeEntries.map(entry => entry.code).filter(Boolean));
  summary.missingDongs = dongCodeEntries.filter(entry => !entry.code).map(entry => entry.dong);

  if (targetCodes.size === 0) {
    summary.source = 'csv_fallback';
    return summary;
  }

  const today = new Date();
  const candidateDates = Array.from({ length: 14 }, (_, idx) => {
    const date = new Date(today);
    date.setDate(today.getDate() - idx);
    return formatYYYYMMDD(date);
  });

  for (const referenceDate of candidateDates) {
    const apiName = 'SPOP_LOCAL_RESD_DONG';
    const url = `http://openapi.seoul.go.kr:8088/${apiKey}/json/${apiName}/1/1000/${referenceDate}/`;
    try {
      const response = await axios.get(url, { timeout: 5000 });
      const rows = pickApiRows(apiName, response);
      if (rows.length === 0) continue;

      const rowsByCode = new Map(rows.map(row => [String(extractDongCodeFromRow(row)), row]));
      let matched = false;
      dongCodeEntries.forEach(({ dong, code }) => {
        if (!code) return;
        const row = rowsByCode.get(String(code));
        if (!row) {
          summary.missingDongs.push(dong);
          return;
        }
        const beforeCount = summary.matchedDongs.length;
        rowToPopulationSummary(summary, row, dong);
        if (summary.matchedDongs.length > beforeCount) matched = true;
      });

      if (matched) {
        summary.source = apiName;
        finalizePopulationSummary(summary);
        return summary;
      }
    } catch (err) {
      // 후보 API 호출 실패 시 다음 날짜로 전환
    }
    console.warn(`[PopulationAPI] ${referenceDate} 생활인구 API 미스`);
  }

  summary.source = 'csv_fallback';
  return summary;
}

exports.handler = async (event, context) => {
  const queryParams = event.queryStringParameters || {};
  const { type, gu, library } = queryParams;
  const SEOUL_API_KEY = process.env.SEOUL_API_KEY || '556654646967657535346574744646';
  const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || '6551df3aa9551605018746d7d8f7b768';
  const forceRefresh = queryParams.forceRefresh === '1';
  const includeCacheMeta = queryParams.includeCacheMeta === '1';
  const cacheVersion = queryParams.cacheVersion || 'default';
  const nowIso = new Date().toISOString();

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8'
  };

  try {
    // ------------------ 배포 상태 진단 API ------------------
    if (type === 'health') {
      const requiredFiles = [
        'district_age_gender_population.csv',
        'district_data_combined.csv',
        'library_dong_mapping.json',
        'dong_coordinates.json',
        'dong_code_mapping.json',
        '2_population_and_senior.csv',
        '3_gender.csv',
        '5_number_of_recipients.csv'
      ];

      const files = requiredFiles.map(getDataFileStatus);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: files.every(file => file.exists),
          runtime: 'netlify-functions',
          cwd: process.cwd(),
          dirname: __dirname,
          files
        })
      };
    }

    // ------------------ 캐시 관리 API ------------------
    if (type === 'cache') {
      const adminToken = queryParams.token || '';
      const expectedToken = process.env.INSIGHT_CACHE_ADMIN_TOKEN || '';
      if (expectedToken && adminToken !== expectedToken) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'invalid cache admin token' }) };
      }

      if (queryParams.action === 'clear') {
        memoryCache.clear();
        try {
          if (fs.existsSync(INSIGHT_CACHE_FILE)) fs.unlinkSync(INSIGHT_CACHE_FILE);
        } catch (err) {
          console.warn('캐시 파일 삭제 실패:', err.message);
        }
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, action: 'clear' }) };
      }

      const persisted = readPersistedCache();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          type: 'cache-status',
          memoryEntries: memoryCache.size,
          persistedEntries: Object.keys(persisted).length,
          sampleKeys: Object.keys(persisted).slice(0, 20)
        })
      };
    }

    // ------------------ 1. 자치구별 대시보드 API ------------------
    if (type === 'district') {
      if (!gu) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'gu 파라미터가 필요합니다.' }) };
      }

      const cacheKey = buildCacheKey('district', { version: cacheVersion, gu, source: 'district' });
      const cached = !forceRefresh ? getCachedResponse(cacheKey) : null;
      if (cached) {
        if (includeCacheMeta) {
          const cachedPayload = {
            ...cached.value,
            _cache: {
              fromCache: true,
              cacheKey,
              fetchedAt: cached.fetchedAt,
              expiresAt: new Date(cached.expiresAt).toISOString(),
              ttlMs: cached.ttlMs
            }
          };
          return { statusCode: 200, headers, body: JSON.stringify(cachedPayload) };
        }
        return { statusCode: 200, headers, body: JSON.stringify(cached.value) };
      }

      // 1) 자치구 인구 통계 (연령별, 성별) - API 연동 시도 후 실패시 CSV Fallback
      let ageData = {};
      let genderData = { male: 0, female: 0 };
      let isLivePopulation = false;
      let populationSource = 'csv_fallback';
      let populationReferenceDate = null;

      try {
        // 서울시 행정동 생활인구 추정치(OpenAPI) 호출 시도
        const popUrl = `http://openapi.seoul.go.kr:8088/${SEOUL_API_KEY}/json/SPOP_LOCAL_RESD_DONG/1/1000/`;
        const popRes = await axios.get(popUrl, { timeout: 3000 });
        if (popRes.data && popRes.data.SPOP_LOCAL_RESD_DONG && popRes.data.SPOP_LOCAL_RESD_DONG.row) {
          const rows = popRes.data.SPOP_LOCAL_RESD_DONG.row.filter(r =>
            r.JACHIGU === gu || (r.ADSTRD_NM && r.ADSTRD_NM.includes(gu))
          );
          if (rows.length > 0) {
            rows.forEach(r => {
              Object.keys(r).forEach(k => {
                if (!k.startsWith('MALE_') || !k.endsWith('_LVPOP_CO')) return;
                const suffix = k.slice(5, -8);
                const ageLabel = normalizePopulationSuffix(suffix);
                if (!ageLabel) return;
                const malePop = parsePopulationNumber(r[`MALE_${suffix}_LVPOP_CO`]);
                const femalePop = parsePopulationNumber(r[`FEMALE_${suffix}_LVPOP_CO`]);
                if (malePop === 0 && femalePop === 0) return;
                ageData[ageLabel] = (ageData[ageLabel] || 0) + malePop + femalePop;
                genderData.male += malePop;
                genderData.female += femalePop;
              });
              if (!populationReferenceDate && (r.STDR_DE_ID || r.STDR_DT || r.STDR_DATE)) {
                populationReferenceDate = r.STDR_DE_ID || r.STDR_DT || r.STDR_DATE;
              }
            });
            isLivePopulation = true;
            populationSource = 'SPOP_LOCAL_RESD_DONG';
          }
        }
      } catch (err) {
        console.warn('행정동 생활인구 API 호출 실패, CSV Fallback 진행:', err.message);
      }

      // Live API 실패 시 CSV 데이터 사용
      if (!isLivePopulation) {
        const popCSV = parseCSV('district_age_gender_population.csv');
        const guPopRows = popCSV.filter(r => r['자치구'] === gu);
        guPopRows.forEach(r => {
          const age = r['연령'];
          const gender = r['성별'];
          const count = parseInt(r['인구수'] || 0);
          ageData[age] = (ageData[age] || 0) + count;
          if (gender === '남자') genderData.male += count;
          else if (gender === '여자') genderData.female += count;
        });
      }

      // 2) 자치구 종합 지표 (수급률, 다문화, 장애유형, 1인가구 등)
      // district_data_combined.csv 로드
      const combinedCSV = parseCSV('district_data_combined.csv');
      const guCombined = combinedCSV.find(r => r['자치구'] === gu) || {};
      
      // 수급률 평균선용 전체 평균
      const allRecipientRates = combinedCSV.map(r => parseFloat(r['수급률'] || 0)).filter(v => !isNaN(v));
      const seoulAvgRecipientRate = allRecipientRates.reduce((a, b) => a + b, 0) / (allRecipientRates.length || 1);

      // 1인 가구 평균용 전체 평균
      const allOnePersons = combinedCSV.map(r => parseFloat(r['1인가구'] || 0)).filter(v => !isNaN(v));
      const seoulAvgOnePerson = allOnePersons.reduce((a, b) => a + b, 0) / (allOnePersons.length || 1);

      // 다문화 국적 비율 구성 파싱
      const multicultural = {};
      const multiculturalCols = Object.keys(guCombined).filter(k => k.startsWith('국적_') || ['중국', '한국계중국인', '베트남', '미국', '대만', '일본', '필리핀', '기타국적'].includes(k));
      multiculturalCols.forEach(col => {
        const val = parseFloat(guCombined[col] || 0);
        if (val > 0) multicultural[col] = val;
      });

      // 장애 유형 비율 구성 파싱
      const disability = {};
      const disabilityCols = ['지체', '뇌병변', '시각', '청각', '지적', '기타장애'];
      disabilityCols.forEach(col => {
        const val = parseFloat(guCombined[col] || 0);
        if (val > 0) disability[col] = val;
      });

      // 가구원수 비율 구성 파싱
      const householdTypes = {};
      const houseCols = ['1인가구', '2인가구', '3인가구', '4인이상가구'];
      houseCols.forEach(col => {
        const val = parseFloat(guCombined[col] || 0);
        if (val > 0) householdTypes[col] = val;
      });

      // 3) 실시간 초·중·고교 인프라 API 연동 (neisSchoolInfo) + 대학교 API 연동 (SebcCollegeInfoKor)
      let schoolStats = {
        elementary: 0,
        middle: 0,
        high: 0,
        university: 0
      };
      let isLiveSchools = false;
      try {
        // 서울시 전체 학교 수는 약 3,960여 개이므로, 1~4000 범위를 1000개 단위로 4번 병렬 호출하여 전체 취합
        const ranges = [
          [1, 1000],
          [1001, 2000],
          [2001, 3000],
          [3001, 4000]
        ];
        const promises = ranges.map(range => {
          const url = `http://openapi.seoul.go.kr:8088/${SEOUL_API_KEY}/json/neisSchoolInfo/${range[0]}/${range[1]}/`;
          return axios.get(url, { timeout: 3500 }).catch(err => {
            console.warn(`[neisSchoolInfo] 범위 ${range[0]}~${range[1]} 호출 실패:`, err.message);
            return null;
          });
        });

        const responses = await Promise.all(promises);
        let allRows = [];
        responses.forEach(res => {
          if (res && res.data && res.data.neisSchoolInfo && res.data.neisSchoolInfo.row) {
            allRows = allRows.concat(res.data.neisSchoolInfo.row);
          }
        });

        if (allRows.length > 0) {
          // 해당 자치구(gu)에 위치한 학교 필터링 (도로명 주소 기준)
          const rows = allRows.filter(r => {
            const rowAddr = r.ORG_RDNMA || '';
            return rowAddr.includes(gu);
          });
          
          // 학교 표준 코드(SD_SCHUL_CODE) 기준으로 중복 제거
          const uniqueSchoolsMap = new Map();
          rows.forEach(r => {
            const code = r.SD_SCHUL_CODE;
            if (code && !uniqueSchoolsMap.has(code)) {
              uniqueSchoolsMap.set(code, r);
            }
          });

          const highSchools = [];
          uniqueSchoolsMap.forEach(r => {
            const scClass = r.SCHUL_KND_SC_NM || '';
            if (scClass === '초등학교') {
              schoolStats.elementary++;
            } else if (scClass === '중학교') {
              schoolStats.middle++;
            } else if (scClass === '고등학교') {
              schoolStats.high++;
              highSchools.push({ name: r.SCHUL_NM, addr: r.ORG_RDNMA });
            }
          });
          console.log(`[SchoolAPI] Matched High Schools in ${gu} (Total: ${schoolStats.high}):`, highSchools.slice(0, 30));
          isLiveSchools = true;
        }
      } catch (err) {
        console.warn('[SchoolAPI] neisSchoolInfo API 호출 처리 중 예외 발생, CSV Fallback 진행:', err.message);
      }

      // API 실패 시 CSV 데이터 활용
      if (!isLiveSchools) {
        schoolStats.elementary = parseInt(guCombined['초등학교'] || 0);
        schoolStats.middle = parseInt(guCombined['중학교'] || 0);
        schoolStats.high = parseInt(guCombined['고등학교'] || 0);
      }

      // 대학교(대학/전문대) API 호출 추가
      try {
        const univUrl = `http://openapi.seoul.go.kr:8088/${SEOUL_API_KEY}/json/SebcCollegeInfoKor/1/100/`;
        const univRes = await axios.get(univUrl, { timeout: 3000 });
        if (univRes.data && univRes.data.SebcCollegeInfoKor && univRes.data.SebcCollegeInfoKor.row) {
          const univRows = univRes.data.SebcCollegeInfoKor.row.filter(r => {
            const rowGu = r.H_KOR_GU || '';
            const rowAddr = r.ADD_KOR || '';
            return rowGu === gu || rowAddr.includes(gu);
          });
          schoolStats.university = univRows.length;
          console.log(`[SchoolAPI] SebcCollegeInfoKor 실시간 대학교 수 (${gu}):`, schoolStats.university);
        }
      } catch (err) {
        console.warn('[SchoolAPI] 대학교 API 호출 실패, 하드코딩 Fallback 진행:', err.message);
        const univFallback = {
          "강남구": 0, "강동구": 1, "강북구": 1, "강서구": 1, "관악구": 1,
          "광진구": 3, "구로구": 3, "금천구": 0, "노원구": 6, "도봉구": 1,
          "동대문구": 4, "동작구": 3, "마포구": 2, "서대문구": 6, "서초구": 1,
          "성동구": 2, "성북구": 6, "송파구": 1, "양천구": 0, "영등포구": 0,
          "용산구": 1, "은평구": 1, "종로구": 8, "중구": 3, "중랑구": 1
        };
        schoolStats.university = univFallback[gu] || 0;
      }
      console.log(`[SchoolAPI] 최종 교육기관 통계 (${gu}):`, schoolStats);

      // 4) 실시간 공공도서관 현황 API 연동 (SeoulPublicLibraryInfo) 및 자치구 도서관 수 집계
      let publicLibraryCount = 0;
      let isLiveLibraries = false;
      try {
        const libUrl = `http://openapi.seoul.go.kr:8088/${SEOUL_API_KEY}/json/SeoulPublicLibraryInfo/1/1000/`;
        const libRes = await axios.get(libUrl, { timeout: 3000 });
        if (libRes.data && libRes.data.SeoulPublicLibraryInfo && libRes.data.SeoulPublicLibraryInfo.row) {
          const rows = libRes.data.SeoulPublicLibraryInfo.row.filter(r => r.CODE_VALUE === gu || (r.ADRES && r.ADRES.includes(gu)));
          publicLibraryCount = rows.length;
          if (publicLibraryCount > 0) isLiveLibraries = true;
        }
      } catch (err) {
        console.warn('공공도서관 API 호출 실패, fallback 진행:', err.message);
      }

      if (!isLiveLibraries) {
        // Fallback: 내재화된 도서관 매핑 JSON 데이터에서 개수 세기
        const mappingData = readJSON('library_dong_mapping.json');
        if (mappingData) {
          publicLibraryCount = mappingData.libraries.filter(l => l.gu === gu).length;
        } else {
          publicLibraryCount = 0;
        }
      }

      // 5) 서울시 문화행사 API 연동 (당월 행사 건수 및 목록 수집)
      let cultureEventsCount = 0;
      try {
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        const eventUrl = `http://openapi.seoul.go.kr:8088/${SEOUL_API_KEY}/json/culturalEventInfo/1/1000//%20/${currentMonth}`;
        const eventRes = await axios.get(eventUrl, { timeout: 3000 });
        if (eventRes.data && eventRes.data.culturalEventInfo && eventRes.data.culturalEventInfo.row) {
          const events = eventRes.data.culturalEventInfo.row;
          const guEvents = events.filter(e => e.GUNAME === gu && e.DATE && e.DATE.startsWith(currentMonth));
          cultureEventsCount = guEvents.length;
        }
      } catch (err) {
        console.warn('문화행사 API 호출 실패:', err.message);
      }

      // 최종 자치구 분석 데이터 반환
      const responseData = {
        gu,
        population: {
          ageDistribution: ageData,
          genderRatio: genderData,
          total: genderData.male + genderData.female,
          source: populationSource,
          referenceDate: populationReferenceDate
        },
        welfare: {
          recipientRate: parseFloat(guCombined['수급률'] || 0),
          seoulAvgRecipientRate: parseFloat(seoulAvgRecipientRate.toFixed(3))
        },
        socialIndicators: {
          multicultural,
          disability,
          householdTypes,
          onePersonCount: parseInt(guCombined['1인가구'] || 0),
          seoulAvgOnePerson: Math.round(seoulAvgOnePerson)
        },
        cultureAndEducation: {
          lectureRate: parseFloat(guCombined['강좌_비율'] || 0),
          operationInterest: parseFloat(guCombined['운영_관심도_점수'] || 0),
          participationRate: parseFloat(guCombined['참가자_비율'] || 0),
          usageInterest: parseFloat(guCombined['이용_관심도_점수'] || 0),
          schools: schoolStats,
          publicLibraryCount,
          liveCultureEventsMonth: cultureEventsCount
        }
      };

      const payload = {
        ...responseData,
        _cache: {
          fromCache: false,
          cacheKey,
          fetchedAt: nowIso,
          expiresAt: new Date(getNow() + INSIGHT_CACHE_TTL_MS).toISOString(),
          ttlMs: INSIGHT_CACHE_TTL_MS
        }
      };

      setCacheEntry(cacheKey, responseData, INSIGHT_CACHE_TTL_MS, {
        version: cacheVersion,
        forceRefresh
      });

      if (includeCacheMeta) {
        return { statusCode: 200, headers, body: JSON.stringify(payload) };
      }
      return { statusCode: 200, headers, body: JSON.stringify(responseData) };
    }

    // ------------------ 2. 개별도서관별 대시보드 API ------------------
    else if (type === 'library') {
      if (!gu || !library) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'gu 및 library 파라미터가 필요합니다.' }) };
      }

      const cacheKey = buildCacheKey('library', { version: cacheVersion, gu, library });
      const cached = !forceRefresh ? getCachedResponse(cacheKey) : null;
      if (cached) {
        if (includeCacheMeta) {
          const cachedPayload = {
            ...cached.value,
            _cache: {
              fromCache: true,
              cacheKey,
              fetchedAt: cached.fetchedAt,
              expiresAt: new Date(cached.expiresAt).toISOString(),
              ttlMs: cached.ttlMs
            }
          };
          return { statusCode: 200, headers, body: JSON.stringify(cachedPayload) };
        }
        return { statusCode: 200, headers, body: JSON.stringify(cached.value) };
      }

      // 1) 내재화된 도서관 매핑 정보 읽기
      const mappingData = readJSON('library_dong_mapping.json');
      if (!mappingData) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: '도서관 매핑 정보가 소실되었습니다.' }) };
      }

      const libInfo = mappingData.libraries.find(l => l.name === library && l.gu === gu);
      if (!libInfo) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: '해당 도서관 정보를 찾을 수 없습니다.' }) };
      }

      // 2) 실시간 하버사인 거리 계산으로 반경 2km 이내 행정동 동적 추출
      const dongCoords = readJSON('dong_coordinates.json');
      let dongs = [];
      let dongDistances = {}; // 디버깅 및 프론트엔드 참조용
      let dongAreas = [];

      if (dongCoords && libInfo.lat && libInfo.lng) {
        Object.values(dongCoords).forEach(dongEntry => {
          if (!dongEntry.lat || !dongEntry.lng) return;
          const dist = haversine(libInfo.lat, libInfo.lng, dongEntry.lat, dongEntry.lng);
          if (dist <= 2000) {
            dongs.push(dongEntry.dong);
            dongDistances[dongEntry.dong] = Math.round(dist);
            dongAreas.push({
              gu: dongEntry.gu,
              dong: dongEntry.dong,
              distance: Math.round(dist)
            });
          }
        });
        console.log(`[Haversine] ${library}: ${dongs.length}개 행정동 매칭 (2km 이내)`, dongs);
      } else {
        // dong_coordinates.json 로드 실패 시 기존 하드코딩 dongs 폴백
        console.warn('[Haversine] dong_coordinates.json 로드 실패, 기존 dongs 폴백 사용');
        dongs = libInfo.dongs || [];
      }


      // 2) 행정동 인구 현황 집계 (연령대별, 성별)
      // 서울시 행정동 생활인구 API(가능 시)를 우선 사용하고, 실패 시 기존 CSV로 폴백
      let populationSummary = await fetchLiveDongPopulation({
        apiKey: SEOUL_API_KEY,
        gu,
        dongs,
        dongAreas
      });

      if (populationSummary.source !== 'SPOP_LOCAL_RESD_DONG') {
        console.warn(`[PopulationAPI] ${library}: 실시간 인구 조회 실패, CSV 폴백 사용`);
        const popAgeCSV = parseCSV('2_population_and_senior.csv');
        const popGenderCSV = parseCSV('3_gender.csv');

        const matchedAgeRows = popAgeCSV.filter(r => dongs.includes(r['행정동']));
        const matchedGenderRows = popGenderCSV.filter(r => dongs.includes(r['행정동']));

        const ageDistribution = {};
        matchedAgeRows.forEach(row => {
          Object.keys(row).forEach(key => {
            if (key !== '자치구' && key !== '행정동' && key !== '고령자' && key !== '학령인구') {
              const count = parseInt(row[key] || 0);
              ageDistribution[key] = (ageDistribution[key] || 0) + count;
            }
          });
        });

        const genderRatio = { male: 0, female: 0 };
        matchedGenderRows.forEach(row => {
          genderRatio.male += parseInt(row['남자'] || 0);
          genderRatio.female += parseInt(row['여자'] || 0);
        });

        populationSummary = {
          ageDistribution,
          genderRatio,
          total: genderRatio.male + genderRatio.female,
          source: 'csv_fallback',
          referenceDate: null,
          matchedDongs: matchedAgeRows.map(row => row['행정동']),
          missingDongs: dongs.filter(dong => !matchedAgeRows.some(row => row['행정동'] === dong))
        };
      }

      // 수급자 현황 집계 (5_number_of_recipients.csv)
      const welfareCSV = parseCSV('5_number_of_recipients.csv');
      const matchedWelfareRows = welfareCSV.filter(r => dongs.includes(r['행정동']));
      const avgWelfare = matchedWelfareRows.reduce((sum, r) => sum + parseInt(r['수급자수'] || 0), 0) / (matchedWelfareRows.length || 1);
      const seoulAvgWelfare = welfareCSV.reduce((sum, r) => sum + parseInt(r['수급자수'] || 0), 0) / (welfareCSV.length || 1);

      // 3) 카카오 Local API를 통한 도서관 반경 2km 이내 공공기관(PO3) 검색
      let publicPlaces = [];
      try {
        const kakaoUrl = 'https://dapi.kakao.com/v2/local/search/category.json';
        const kakaoRes = await axios.get(kakaoUrl, {
          headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
          params: {
            category_group_code: 'PO3',
            x: libInfo.lng,
            y: libInfo.lat,
            radius: 2000,
            sort: 'distance',
            size: 15
          },
          timeout: 3000
        });
        if (kakaoRes.data && kakaoRes.data.documents) {
          publicPlaces = kakaoRes.data.documents.map(d => ({
            name: d.place_name,
            address: d.road_address_name || d.address_name,
            lat: parseFloat(d.y),
            lng: parseFloat(d.x),
            distance: parseInt(d.distance)
          }));
        }
      } catch (err) {
        console.warn('카카오 Local API 검색 실패:', err.message);
      }

      // 4) 서울시 문화행사 API 로드 및 도서관 반경 2km 이내 또는 자치구 내 행사 필터링
      let nearbyEvents = [];
      try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const eventUrl = `http://openapi.seoul.go.kr:8088/${SEOUL_API_KEY}/json/culturalEventInfo/1/1000/`;
        const eventRes = await axios.get(eventUrl, { timeout: 3000 });
        if (eventRes.data && eventRes.data.culturalEventInfo && eventRes.data.culturalEventInfo.row) {
          const events = eventRes.data.culturalEventInfo.row;
          events.forEach(e => {
            // 날짜 유효성 확인: 이미 종료된 행사는 제외
            const endDate = e.END_DATE ? e.END_DATE.slice(0, 10) : '';
            if (endDate && endDate < todayStr) {
              return;
            }

            const lot = parseFloat(e.LOT);
            const latVal = parseFloat(e.LAT);
            
            let isMatched = false;
            let distance = 0;
            let finalLat = null;
            let finalLng = null;

            // 1. 위경도가 유효한 경우 -> 반경 2km 이내 매칭
            if (!isNaN(lot) && !isNaN(latVal) && lot > 120 && latVal > 30) {
              const dist = haversine(libInfo.lat, libInfo.lng, latVal, lot);
              if (dist <= 2000) {
                isMatched = true;
                distance = Math.round(dist);
                finalLat = latVal;
                finalLng = lot;
              }
            }

            // 2. 자치구 기준 매칭 (좌표가 유실되었거나 먼 곳이어도 동일 구 내 행사는 목록에 리스트업)
            if (!isMatched && e.GUNAME && (e.GUNAME.includes(gu) || gu.includes(e.GUNAME))) {
              isMatched = true;
              distance = "자치구 내";
              finalLat = null;
              finalLng = null;
            }

            if (isMatched) {
              nearbyEvents.push({
                title: e.TITLE,
                place: e.PLACE || '상세 장소 미정',
                startDate: e.STRTDATE ? e.STRTDATE.slice(0, 10) : '',
                endDate: endDate,
                lat: finalLat,
                lng: finalLng,
                distance: distance
              });
            }
          });
        }

        // 거리순 정렬 (숫자형 거리 우선 정렬 후 자치구 내 텍스트 정렬)
        nearbyEvents.sort((a, b) => {
          if (typeof a.distance === 'number' && typeof b.distance === 'number') {
            return a.distance - b.distance;
          }
          if (typeof a.distance === 'number') return -1;
          if (typeof b.distance === 'number') return 1;
          return 0;
        });

        nearbyEvents = nearbyEvents.slice(0, 15);
        console.log(`[CultureAPI] 최종 매칭된 문화행사 수 (${library}):`, nearbyEvents.length);
      } catch (err) {
        console.warn('문화행사 API 기반 반경 필터링 실패:', err.message);
      }

      const responseData = {
        library: libInfo.name,
        gu: libInfo.gu,
        coordinates: { lat: libInfo.lat, lng: libInfo.lng },
        address: libInfo.address,
        dongs,
        dongDistances,
        dongAreas,
        demographics: {
          ageDistribution: populationSummary.ageDistribution,
          genderRatio: populationSummary.genderRatio,
          total: populationSummary.total,
          source: populationSummary.source,
          referenceDate: populationSummary.referenceDate,
          matchedDongs: populationSummary.matchedDongs,
          missingDongs: populationSummary.missingDongs
        },
        welfare: {
          avgRecipientCount: Math.round(avgWelfare),
          seoulAvgRecipientCount: Math.round(seoulAvgWelfare)
        },
        infrastructure: {
          publicPlaces,
          nearbyEvents
        }
      };

      const payload = {
        ...responseData,
        _cache: {
          fromCache: false,
          cacheKey,
          fetchedAt: nowIso,
          expiresAt: new Date(getNow() + INSIGHT_CACHE_TTL_MS).toISOString(),
          ttlMs: INSIGHT_CACHE_TTL_MS
        }
      };
      setCacheEntry(cacheKey, responseData, INSIGHT_CACHE_TTL_MS, {
        version: cacheVersion,
        forceRefresh
      });
      if (includeCacheMeta) {
        return { statusCode: 200, headers, body: JSON.stringify(payload) };
      }
      return { statusCode: 200, headers, body: JSON.stringify(responseData) };
    }

    // 잘못된 파라미터 요청
    else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: '올바른 type 파라미터(district 또는 library)를 입력하세요.' }) };
    }
  } catch (error) {
    console.error('API 메인 핸들러 에러:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: '서버 에러가 발생했습니다.', message: error.message })
    };
  }
};
