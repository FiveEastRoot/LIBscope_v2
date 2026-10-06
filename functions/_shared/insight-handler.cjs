const fs = require('fs');
const path = require('path');
const staticData = require('./static-data.cjs');
const supabaseMetrics = require('./supabase-metrics.cjs');
const bundledLibraryMapping = require('../_data/library_dong_mapping.json');

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

const INSIGHT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 동적 행사 데이터는 하루 단위로 갱신
const INSIGHT_CACHE_FILE = '/tmp/insight-api-cache.json';
const INSIGHT_CACHE_VERSION = 'v9';
const memoryCache = new Map();
let livingPopulationAvailableDate = null;
let livingPopulationAvailabilityChecked = false;

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

function groupDisabilityTypes(disability = {}) {
  const groupMap = {
    '신체/운동': ['지체', '뇌병변'],
    '감각/의사소통': ['시각', '청각', '언어'],
    '발달': ['지적', '자폐성'],
    '정신': ['정신'],
    '내부기관/만성': ['신장', '심장', '호흡기', '간', '장루·요루', '뇌전증'],
    '기타': ['안면', '기타장애']
  };
  return Object.fromEntries(
    Object.entries(groupMap)
      .map(([group, labels]) => [
        group,
        labels.reduce((sum, label) => sum + Number(disability[label] || 0), 0)
      ])
      .filter(([, value]) => value > 0)
  );
}

function topComposition(values = {}, limit = 8, otherLabel = '기타') {
  const sorted = Object.entries(values)
    .filter(([, value]) => Number(value) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  const top = Object.fromEntries(sorted.slice(0, limit));
  const other = sorted.slice(limit).reduce((sum, [, value]) => sum + Number(value || 0), 0);
  if (other > 0) top[otherLabel] = other;
  return top;
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

function parseCoordinate(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isSeoulCoordinate(lat, lng) {
  return lat >= 37.4 && lat <= 37.75 && lng >= 126.7 && lng <= 127.3;
}

function roundCoordinate(value) {
  return Number(value.toFixed(5));
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
  // 도서관 매핑은 함수 빌드에 직접 포함해 갱신 대상과 배포 함수의 버전을 맞춘다.
  if (filePath === 'library_dong_mapping.json') {
    return JSON.stringify(bundledLibraryMapping);
  }

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

function formatCultureEventDate(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
  return digits.length === 8
    ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
    : '';
}

function decodeXmlText(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function readXmlTag(xml, tagName) {
  const match = String(xml || '').match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return decodeXmlText(match?.[1] || '');
}

function parseKcisaCultureEvents(xml, gu, today) {
  if (readXmlTag(xml, 'resultCode') !== '00') {
    throw new Error(readXmlTag(xml, 'resultMsg') || 'KCISA 문화정보 API 오류');
  }

  return [...String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .map(([, itemXml]) => {
      const startDate = formatCultureEventDate(readXmlTag(itemXml, 'startDate'));
      const endDate = formatCultureEventDate(readXmlTag(itemXml, 'endDate')) || startDate;
      const lat = parseCoordinate(readXmlTag(itemXml, 'gpsY'));
      const lng = parseCoordinate(readXmlTag(itemXml, 'gpsX'));
      return {
        id: readXmlTag(itemXml, 'seq'),
        title: readXmlTag(itemXml, 'title'),
        category: readXmlTag(itemXml, 'realmName') || readXmlTag(itemXml, 'serviceName') || '문화행사',
        place: readXmlTag(itemXml, 'place') || '장소 확인 필요',
        startDate,
        endDate,
        status: startDate && startDate > today ? 'upcoming' : 'ongoing',
        target: '',
        fee: '',
        isFree: '',
        organizer: '',
        link: '',
        thumbnail: readXmlTag(itemXml, 'thumbnail'),
        lat,
        lng,
        sigungu: readXmlTag(itemXml, 'sigungu'),
        source: 'kcisa',
        sourceLabel: '한국문화정보원'
      };
    })
    .filter(eventItem => eventItem.title && (!eventItem.endDate || eventItem.endDate >= today))
    .filter(eventItem => eventItem.sigungu === gu)
    .map(eventItem => {
      const normalized = { ...eventItem };
      delete normalized.sigungu;
      return normalized;
    });
}

function normalizeSeoulCultureEvents(events, gu, today) {
  return events
    .filter(eventItem => eventItem.GUNAME === gu)
    .map(eventItem => {
      const dateMatches = String(eventItem.DATE || '').match(/\d{4}-\d{2}-\d{2}/g) || [];
      const startDate = formatCultureEventDate(eventItem.STRTDATE) || dateMatches[0] || '';
      const endDate = formatCultureEventDate(eventItem.END_DATE) || dateMatches[1] || startDate;
      return {
        title: String(eventItem.TITLE || '').trim(),
        category: String(eventItem.CODENAME || '문화행사').trim(),
        place: String(eventItem.PLACE || '장소 확인 필요').trim(),
        startDate,
        endDate,
        status: startDate && startDate > today ? 'upcoming' : 'ongoing',
        target: String(eventItem.USE_TRGT || '').trim(),
        fee: String(eventItem.USE_FEE || '').trim(),
        isFree: String(eventItem.IS_FREE || '').trim(),
        organizer: String(eventItem.ORG_NAME || '').trim(),
        link: String(eventItem.ORG_LINK || eventItem.HMPG_ADDR || '').trim(),
        thumbnail: String(eventItem.MAIN_IMG || '').trim(),
        lat: parseCoordinate(eventItem.LAT),
        lng: parseCoordinate(eventItem.LOT),
        source: 'seoul',
        sourceLabel: '서울 열린데이터광장'
      };
    })
    .filter(eventItem => eventItem.title && (!eventItem.endDate || eventItem.endDate >= today));
}

async function fetchKcisaCultureEvents({ apiKey, gu, today }) {
  if (!apiKey) return [];
  const horizon = new Date();
  horizon.setFullYear(horizon.getFullYear() + 1);
  const response = await axios.get('https://apis.data.go.kr/B553457/cultureinfo/area2', {
    timeout: 5000,
    params: {
      serviceKey: apiKey,
      PageNo: 1,
      numOfrows: 1000,
      sido: '서울',
      sigungu: gu,
      from: formatYYYYMMDD(new Date()),
      to: formatYYYYMMDD(horizon),
      sortStdr: 1
    }
  });
  return parseKcisaCultureEvents(response.data, gu, today);
}

function cultureEventKey(eventItem) {
  const normalize = value => String(value || '')
    .normalize('NFC')
    .toLocaleLowerCase('ko')
    .replace(/[^0-9a-z가-힣]/g, '');
  return `${normalize(eventItem.title)}|${normalize(eventItem.place)}|${eventItem.startDate || ''}`;
}

function mergeCultureEvents(primaryEvents, supplementEvents) {
  const merged = new Map(primaryEvents.map(eventItem => [cultureEventKey(eventItem), eventItem]));
  supplementEvents.forEach(eventItem => {
    const key = cultureEventKey(eventItem);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, eventItem);
      return;
    }
    merged.set(key, {
      ...eventItem,
      ...existing,
      thumbnail: existing.thumbnail || eventItem.thumbnail,
      lat: existing.lat ?? eventItem.lat,
      lng: existing.lng ?? eventItem.lng,
      source: 'seoul+kcisa',
      sourceLabel: '서울시·한국문화정보원'
    });
  });
  return [...merged.values()];
}

function dateLagDays(requestedDate, referenceDate) {
  const parse = value => Date.UTC(
    Number(String(value).slice(0, 4)),
    Number(String(value).slice(4, 6)) - 1,
    Number(String(value).slice(6, 8))
  );
  return Math.max(0, Math.round((parse(requestedDate) - parse(referenceDate)) / (24 * 60 * 60 * 1000)));
}

function parsePopulationNumber(value) {
  const parsed = parseFloat(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLookupText(value) {
  return String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ');
}

function createEmptyPopulationSummary() {
  return {
    ageDistribution: {},
    genderRatio: { male: 0, female: 0 },
    total: 0,
    source: 'csv_fallback',
    referenceDate: null,
    requestedDate: null,
    retrievedAt: null,
    dataLagDays: null,
    freshnessStatus: 'unavailable',
    isDelayed: false,
    matchedDongs: [],
    missingDongs: [],
    dongBreakdown: []
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
    const suffix = key.slice(5, -9);
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

function normalizeFiveYearAgeDistribution(ageDistribution = {}) {
  const result = {};
  const addValue = (label, value) => {
    result[label] = (result[label] || 0) + value;
  };

  Object.entries(ageDistribution).forEach(([label, rawValue]) => {
    const value = parsePopulationNumber(rawValue);
    if (!value || label === '총인구') return;

    const range = String(label).match(/^(\d{1,3})[-~](\d{1,3})세$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start >= 70) {
        addValue('70세 이상', value);
        return;
      }
      if (start >= 100) {
        addValue('100세 이상', value);
        return;
      }

      const buckets = [];
      for (let bucketStart = Math.floor(start / 5) * 5; bucketStart <= end && bucketStart < 100; bucketStart += 5) {
        const bucketEnd = bucketStart + 4;
        const overlapStart = Math.max(start, bucketStart);
        const overlapEnd = Math.min(end, bucketEnd);
        const overlapYears = Math.max(0, overlapEnd - overlapStart + 1);
        if (overlapYears > 0) {
          buckets.push({ label: `${bucketStart}-${bucketEnd}세`, years: overlapYears });
        }
      }

      const totalYears = buckets.reduce((sum, bucket) => sum + bucket.years, 0);
      buckets.forEach(bucket => {
        addValue(bucket.label, value * (bucket.years / totalYears));
      });
      return;
    }

    const over = String(label).match(/^(\d{1,3})세 이상$/);
    if (over) {
      const start = Number(over[1]);
      if (start >= 70) addValue('70세 이상', value);
      else if (start >= 100) addValue('100세 이상', value);
      else {
        addValue(`${start}세 이상`, value);
      }
      return;
    }

    addValue(label, value);
  });

  const ordered = {};
  for (let start = 0; start < 100; start += 5) {
    const label = `${start}-${start + 4}세`;
    if (result[label]) ordered[label] = Math.round(result[label]);
  }
  if (result['100세 이상']) ordered['100세 이상'] = Math.round(result['100세 이상']);
  return ordered;
}

function finalizePopulationSummary(summary) {
  summary.genderRatio.male = Math.round(summary.genderRatio.male);
  summary.genderRatio.female = Math.round(summary.genderRatio.female);
  if (!summary.total) {
    summary.total = summary.genderRatio.male + summary.genderRatio.female;
  }
  summary.total = Math.round(summary.total);
  summary.ageDistribution = normalizeFiveYearAgeDistribution(summary.ageDistribution);
  const ageTotal = Object.values(summary.ageDistribution).reduce((sum, value) => sum + Number(value || 0), 0);
  const missingSeniorPopulation = summary.total - ageTotal;
  if (missingSeniorPopulation > 0) {
    summary.ageDistribution['70세 이상'] = (summary.ageDistribution['70세 이상'] || 0) + missingSeniorPopulation;
  }
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
  const unmappedDongs = dongCodeEntries.filter(entry => !entry.code).map(entry => entry.dong);
  summary.missingDongs = unmappedDongs;

  if (targetCodes.size === 0) {
    summary.source = 'csv_fallback';
    return summary;
  }

  const today = new Date();
  // 원천 공개가 장기간 늦어져도 최근 정상 제공일을 찾아 대체값으로 사용한다.
  const candidateDates = Array.from({ length: 120 }, (_, idx) => {
    const date = new Date(today);
    date.setDate(today.getDate() - idx);
    return formatYYYYMMDD(date);
  });
  const targetCodeList = [...targetCodes];
  const probeCode = targetCodeList[0];
  const apiName = 'SPOP_LOCAL_RESD_DONG';
  let availableDate = livingPopulationAvailableDate;

  // 공개 시점이 지연되는 생활인구 API를 날짜별로 직렬 조회하면 콜드 스타트가
  // 수십 초를 넘는다. 최신 날짜 순서를 유지한 채 30일 단위로 병렬 탐색한다.
  if (!livingPopulationAvailabilityChecked) {
    const probeBatchSize = 30;
    for (let offset = 0; offset < candidateDates.length; offset += probeBatchSize) {
      const batch = candidateDates.slice(offset, offset + probeBatchSize);
      const results = await Promise.all(batch.map(async (referenceDate) => {
        const url = `http://openapi.seoul.go.kr:8088/${apiKey}/json/${apiName}/1/1/${referenceDate}/00/${probeCode}`;
        const probeResponse = await axios.get(url, { timeout: 1400 }).catch(() => null);
        const probeRows = probeResponse ? pickApiRows(apiName, probeResponse) : [];
        return probeRows.length > 0 ? referenceDate : null;
      }));
      availableDate = results.find(Boolean) || null;
      if (availableDate) {
        livingPopulationAvailableDate = availableDate;
        break;
      }
    }
    livingPopulationAvailabilityChecked = true;
    if (!availableDate) {
      console.warn('[PopulationAPI] 최근 120일 내 생활인구 제공일을 찾지 못했습니다.');
    }
  }

  if (availableDate) {
    const responses = await Promise.all(
      targetCodeList.map(code => {
        const url = `http://openapi.seoul.go.kr:8088/${apiKey}/json/${apiName}/1/1/${availableDate}/00/${code}`;
        return axios.get(url, { timeout: 2200 }).catch(() => null);
      })
    );
    const rows = responses.flatMap(response => response ? pickApiRows(apiName, response) : []);
    const rowsByCode = new Map(rows.map(row => [String(extractDongCodeFromRow(row)), row]));
    const attemptSummary = createEmptyPopulationSummary();
    attemptSummary.referenceDate = availableDate;
    attemptSummary.requestedDate = candidateDates[0];
    attemptSummary.retrievedAt = new Date().toISOString();
    attemptSummary.dataLagDays = dateLagDays(attemptSummary.requestedDate, availableDate);
    attemptSummary.isDelayed = attemptSummary.dataLagDays > 0;
    attemptSummary.freshnessStatus = attemptSummary.isDelayed ? 'latest_available_delayed' : 'current';
    attemptSummary.missingDongs = [...unmappedDongs];
    let matched = false;
    dongCodeEntries.forEach(({ dong, code }) => {
      if (!code) return;
      const row = rowsByCode.get(String(code));
      if (!row) {
        attemptSummary.missingDongs.push(dong);
        return;
      }
      const beforeCount = attemptSummary.matchedDongs.length;
      rowToPopulationSummary(attemptSummary, row, dong);
      if (attemptSummary.matchedDongs.length > beforeCount) {
        matched = true;
        const dongSummary = createEmptyPopulationSummary();
        dongSummary.source = apiName;
        dongSummary.referenceDate = availableDate;
        rowToPopulationSummary(dongSummary, row, dong);
        finalizePopulationSummary(dongSummary);
        attemptSummary.dongBreakdown.push({
          dong,
          total: dongSummary.total,
          ageDistribution: dongSummary.ageDistribution,
          referenceDate: availableDate
        });
      }
    });

    if (matched) {
      attemptSummary.source = apiName;
      finalizePopulationSummary(attemptSummary);
      return attemptSummary;
    }
  }

  summary.source = 'csv_fallback';
  return summary;
}

function buildPopulationModes({ resident, living }) {
  const fallbackResident = resident || createEmptyPopulationSummary();
  const fallbackLiving = living || createEmptyPopulationSummary();
  return {
    defaultMode: 'resident',
    modes: {
      resident: fallbackResident,
      living: fallbackLiving
    }
  };
}

function getDefaultPopulation(populationModes) {
  return populationModes.modes[populationModes.defaultMode] || populationModes.modes.resident || populationModes.modes.living;
}

function fetchResidentDistrictPopulationFromCsv(gu) {
  const summary = createEmptyPopulationSummary();
  summary.source = 'resident_registration_csv_fallback';
  const popCSV = parseCSV('district_age_gender_population.csv');
  const guPopRows = popCSV.filter(r => r['자치구'] === gu);

  guPopRows.forEach(r => {
    const age = r['연령'];
    const gender = r['성별'];
    const count = parseInt(r['인구수'] || 0, 10);
    if (!age || !Number.isFinite(count)) return;
    summary.ageDistribution[age] = (summary.ageDistribution[age] || 0) + count;
    if (gender === '남자') summary.genderRatio.male += count;
    else if (gender === '여자') summary.genderRatio.female += count;
  });

  finalizePopulationSummary(summary);
  summary.dongBreakdown = fetchResidentDongBreakdownFromCsv(gu);
  return summary;
}

function fetchResidentDongBreakdownFromCsv(gu) {
  const ageRows = parseCSV('2_population_and_senior.csv')
    .filter(row => row['자치구'] === gu && row['행정동'] && row['행정동'] !== '소계');
  const genderRows = parseCSV('3_gender.csv').filter(row => row['자치구'] === gu);
  const genderByDong = new Map(genderRows.map(row => [row['행정동'], row]));

  return ageRows.map(row => {
    const ageDistribution = {};
    Object.entries(row).forEach(([key, value]) => {
      if (['자치구', '행정동', '고령자', '학령인구'].includes(key)) return;
      const count = parsePopulationNumber(value);
      if (count > 0) ageDistribution[key] = count;
    });

    const normalizedAgeDistribution = normalizeFiveYearAgeDistribution(ageDistribution);
    const gender = genderByDong.get(row['행정동']) || {};
    const genderTotal = parsePopulationNumber(gender['남자']) + parsePopulationNumber(gender['여자']);
    const ageTotal = Object.values(normalizedAgeDistribution).reduce((sum, value) => sum + Number(value || 0), 0);

    return {
      dong: row['행정동'],
      total: Math.round(genderTotal || ageTotal),
      ageDistribution: normalizedAgeDistribution,
      referenceDate: null
    };
  });
}

async function fetchLivingDistrictPopulation({ apiKey, gu }) {
  const codeMapping = readJSON('dong_code_mapping.json');
  if (codeMapping && codeMapping.nameToCode) {
    const dongs = Object.keys(codeMapping.nameToCode)
      .filter(key => key.startsWith(`${gu} `))
      .map(key => key.replace(`${gu} `, ''));

    if (dongs.length > 0) {
      const summary = await fetchLiveDongPopulation({
        apiKey,
        gu,
        dongs,
        dongAreas: dongs.map(dong => ({ gu, dong }))
      });
      if (summary.source === 'SPOP_LOCAL_RESD_DONG') {
        return summary;
      }
    }
  }

  const summary = createEmptyPopulationSummary();
  summary.source = 'living_population_unavailable';
  return summary;
}

function fetchResidentLibraryPopulationFromCsv({ dongs }) {
  const popAgeCSV = parseCSV('2_population_and_senior.csv');
  const popGenderCSV = parseCSV('3_gender.csv');
  const matchedAgeRows = popAgeCSV.filter(r => dongs.includes(r['행정동']));
  const matchedGenderRows = popGenderCSV.filter(r => dongs.includes(r['행정동']));
  const summary = createEmptyPopulationSummary();

  matchedAgeRows.forEach(row => {
    Object.keys(row).forEach(key => {
      if (key !== '자치구' && key !== '행정동' && key !== '고령자' && key !== '학령인구') {
        const count = parseInt(row[key] || 0, 10);
        if (!Number.isFinite(count)) return;
        summary.ageDistribution[key] = (summary.ageDistribution[key] || 0) + count;
      }
    });
  });

  matchedGenderRows.forEach(row => {
    summary.genderRatio.male += parseInt(row['남자'] || 0, 10);
    summary.genderRatio.female += parseInt(row['여자'] || 0, 10);
  });

  summary.source = 'resident_registration_csv_fallback';
  summary.matchedDongs = matchedAgeRows.map(row => row['행정동']);
  summary.missingDongs = dongs.filter(dong => !matchedAgeRows.some(row => row['행정동'] === dong));
  finalizePopulationSummary(summary);
  return summary;
}

async function withSupabaseFallback(label, fetcher, fallback) {
  try {
    const value = await fetcher();
    if (value) return value;
  } catch (err) {
    console.warn(`[Supabase] ${label} fallback:`, err.message);
  }
  return fallback();
}

exports.handler = async (event, context) => {
  const queryParams = event.queryStringParameters || {};
  const { type, gu, library } = queryParams;
  const SEOUL_API_KEY = process.env.SEOUL_API_KEY || '';
  const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || '';
  const KCISA_CULTURE_API_KEY = process.env.KCISA_CULTURE_API_KEY || '';
  const forceRefresh = queryParams.forceRefresh === '1';
  const includeCacheMeta = queryParams.includeCacheMeta === '1';
  const cacheVersion = queryParams.cacheVersion || 'default';
  // API 값은 월간 스냅샷으로 고정하고 다음 달 버킷에서 자동 갱신한다.
  const populationCacheBucket = queryParams.populationCacheBucket || formatYYYYMMDD(new Date()).slice(0, 6);
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

    // ------------------ 주소 좌표 변환 API ------------------
    if (type === 'geocode') {
      const addressQuery = String(queryParams.address || '').trim();
      if (!addressQuery) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'address 파라미터가 필요합니다.' }) };
      }
      if (addressQuery.length > 160) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: '주소는 160자 이내로 입력해 주세요.' }) };
      }
      if (!KAKAO_REST_API_KEY) {
        return { statusCode: 503, headers, body: JSON.stringify({ error: '서버의 주소 검색 설정을 확인해 주세요.' }) };
      }

      const response = await axios.get('https://dapi.kakao.com/v2/local/search/address.json', {
        headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
        params: { query: addressQuery },
        timeout: 4000
      });
      const match = response.data?.documents?.[0];
      if (!match) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: '주소를 찾을 수 없습니다. 도로명 또는 지번 주소를 확인하세요.' }) };
      }

      const addressInfo = match.road_address || match.address;
      const region = addressInfo?.region_1depth_name?.trim();
      const matchedGu = addressInfo?.region_2depth_name?.trim();
      const lat = Number.parseFloat(match.y);
      const lng = Number.parseFloat(match.x);
      if (!['서울', '서울특별시'].includes(region) || !matchedGu || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: '서울시 25개 자치구에 해당하는 주소만 분석할 수 있습니다.' }) };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          gu: matchedGu,
          address: match.road_address?.address_name || match.address?.address_name || addressQuery,
          lat,
          lng
        })
      };
    }

    // ------------------ 1. 자치구별 대시보드 API ------------------
    if (type === 'district') {
      if (!gu) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'gu 파라미터가 필요합니다.' }) };
      }

      const cacheKey = buildCacheKey('district', { version: cacheVersion, gu, source: 'district', populationCacheBucket });
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

      // 1) 자치구 인구 통계: 주민등록인구 기본 + 생활인구 병행 사전 로드
      const populationPromise = Promise.all([
        withSupabaseFallback(
          `district resident population ${gu}`,
          () => supabaseMetrics.fetchDistrictResidentPopulation(gu),
          () => fetchResidentDistrictPopulationFromCsv(gu)
        ),
        fetchLivingDistrictPopulation({ apiKey: SEOUL_API_KEY, gu })
      ]);
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
      const disabilityCols = ['지체', '뇌병변', '시각', '청각', '지적', '정신', '언어', '자폐성', '기타장애'];
      disabilityCols.forEach(col => {
        const val = parseFloat(guCombined[col] || 0);
        if (val > 0) disability[col] = val;
      });

      // 가구원수 비율 구성 파싱
      const householdTypes = {};
      const houseCols = [
        ['1인가구', '1인가구'],
        ['2인가구', '2인가구'],
        ['3인 이상 가구', '3인이상가구'],
        ['5인 이상 가구', '5인이상가구']
      ];
      houseCols.forEach(([col, label]) => {
        const val = parseFloat(guCombined[col] || 0);
        if (val > 0) householdTypes[label] = val;
      });

      // 3) 실시간 초·중·고교 인프라 API 연동 (neisSchoolInfo) + 대학교 API 연동 (SebcCollegeInfoKor)
      let schoolStats = {
        elementary: parseInt(guCombined['초등학교'] || 0),
        middle: parseInt(guCombined['중학교'] || 0),
        high: parseInt(guCombined['고등학교'] || 0),
        university: 0
      };
      const schoolDetails = {
        elementary: [],
        middle: [],
        high: [],
        university: []
      };
      const normalizeSchoolText = (value) => String(value || '').trim();
      const normalizeSchoolDetails = (schools = [], category = '학교') => {
        const unique = new Map();
        schools.forEach((school) => {
          const name = normalizeSchoolText(school.name);
          const address = normalizeSchoolText(school.address);
          if (!name && !address) return;
          const key = `${name}|${address}`;
          if (!unique.has(key)) {
            const lat = Number.parseFloat(school.lat);
            const lng = Number.parseFloat(school.lng);
            unique.set(key, {
              name,
              address,
              category: school.category || category,
              ...(Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : {})
            });
          }
        });
        return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      };
      const fetchKakaoSchoolDetails = async (query, category) => {
        if (!KAKAO_REST_API_KEY) return [];
        try {
          const responses = await Promise.all([1, 2, 3].map(page => axios.get('https://dapi.kakao.com/v2/local/search/keyword.json', {
              headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
              params: {
                query: `${gu} ${query}`,
                size: 15,
                page,
                sort: 'accuracy'
              },
              timeout: 2200
            }).catch(err => {
              console.warn(`[KakaoSchoolAPI] ${gu} ${query} ${page}페이지 검색 실패:`, err.message);
              return null;
            })
          ));
          const documents = responses.flatMap(res => (
            res && res.data && Array.isArray(res.data.documents) ? res.data.documents : []
          ));
          return normalizeSchoolDetails(
            documents
              .map((place) => ({
                name: place.place_name,
                address: place.road_address_name || place.address_name,
                category,
                sourceCategory: place.category_name || '',
                lat: place.y,
                lng: place.x
              }))
              .filter((school) => {
                if (!school.name || !school.address || !school.address.includes(gu)) return false;
                if (category === '대학교') {
                  const isUniversity = /(대학교$|대학원대학교$|대학교\s|대학원대학교\s|캠퍼스$|KAIST|한국과학기술원)/.test(school.name);
                  const isNonSchoolFacility = /(병원|장례식장|의료원|클리닉|약국|주차장|연구소|부속|입시|홍보|자료실|센터|콘서트홀|별관|사무소|에듀홀|학습관|임상교육장|의과대학|의과학원|고등학교|중학교|초등학교|카이로스|와플대학|반지대학|SLP)/.test(school.name);
                  return isUniversity && !isNonSchoolFacility;
                }
                return school.name.includes(query);
              }),
            category
          );
        } catch (err) {
          console.warn(`[KakaoSchoolAPI] ${gu} ${query} 검색 실패:`, err.message);
          return [];
        }
      };
      const classifyCultureFacility = (place = {}) => {
        const text = `${place.place_name || ''} ${place.category_name || ''}`;
        if (/(박물관|기념관)/.test(text)) return { typeKey: 'museum', typeLabel: '박물관·기념관' };
        if (/(미술관|갤러리|전시)/.test(text)) return { typeKey: 'exhibition', typeLabel: '미술관·전시' };
        if (/(공연|극장|콘서트|아트홀|예술의전당)/.test(text)) return { typeKey: 'performance', typeLabel: '공연장·극장' };
        if (/(문화센터|문화원|문화회관|문화예술)/.test(text)) return { typeKey: 'community', typeLabel: '문화센터·문화회관' };
        return { typeKey: 'other', typeLabel: '기타 문화시설' };
      };
      const fetchKakaoCultureFacilities = async () => {
        if (!KAKAO_REST_API_KEY) {
          return { facilities: [], sourceStatus: 'missing_key' };
        }
        try {
          const queries = ['문화시설', '박물관', '미술관', '공연장', '문화센터', '문화회관'];
          const responses = await Promise.all(queries.flatMap(query => [1, 2, 3].map(page => (
            axios.get('https://dapi.kakao.com/v2/local/search/keyword.json', {
              headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
              params: {
                query: `${gu} ${query}`,
                category_group_code: 'CT1',
                size: 15,
                page,
                sort: 'accuracy'
              },
              timeout: 3000
            }).catch(err => {
              console.warn(`[KakaoCultureFacilityAPI] ${gu} ${query} ${page}페이지 검색 실패:`, err.message);
              return null;
            })
          ))));
          const facilityMap = new Map();
          responses.flatMap(response => response?.data?.documents || []).forEach(place => {
            const address = place.road_address_name || place.address_name || '';
            const lat = Number.parseFloat(place.y);
            const lng = Number.parseFloat(place.x);
            if (!address.includes(gu) || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
            const classification = classifyCultureFacility(place);
            const key = place.id || `${place.place_name}|${address}`;
            facilityMap.set(key, {
              id: String(place.id || key),
              name: place.place_name || '문화시설',
              address,
              lat,
              lng,
              phone: place.phone || '',
              placeUrl: place.place_url || '',
              categoryName: place.category_name || '',
              ...classification
            });
          });
          return {
            facilities: [...facilityMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
            sourceStatus: 'kakao_keyword_search'
          };
        } catch (err) {
          console.warn(`[KakaoCultureFacilityAPI] ${gu} 검색 실패:`, err.message);
          return { facilities: [], sourceStatus: 'request_failed' };
        }
      };
      const schoolKeys = ['elementary', 'middle', 'high', 'university'];
      const schoolCategories = ['초등학교', '중학교', '고등학교', '대학교'];
      const schoolLocationCandidatesPromise = Promise.all(
        schoolCategories.map(category => fetchKakaoSchoolDetails(category, category))
      );
      const cultureFacilityPromise = fetchKakaoCultureFacilities();
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
          return axios.get(url, { timeout: 1600 }).catch(err => {
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

          uniqueSchoolsMap.forEach(r => {
            const scClass = r.SCHUL_KND_SC_NM || '';
            const school = {
              name: r.SCHUL_NM || '',
              address: r.ORG_RDNMA || r.ORG_RDNDA || '',
              category: scClass || '학교'
            };
            if (scClass === '초등학교') {
              schoolDetails.elementary.push(school);
            } else if (scClass === '중학교') {
              schoolDetails.middle.push(school);
            } else if (scClass === '고등학교') {
              schoolDetails.high.push(school);
            }
          });
        }
      } catch (err) {
        console.warn('[SchoolAPI] neisSchoolInfo API 호출 처리 중 예외 발생, CSV Fallback 진행:', err.message);
      }

      // 학교 수는 API의 부분 응답에 흔들리지 않도록 내재화된 공식 집계값을 사용한다.

      const univFallback = {
        "강남구": 1, "강동구": 1, "강북구": 1, "강서구": 1, "관악구": 1,
        "광진구": 3, "구로구": 3, "금천구": 0, "노원구": 6, "도봉구": 1,
        "동대문구": 4, "동작구": 3, "마포구": 2, "서대문구": 6, "서초구": 1,
        "성동구": 2, "성북구": 6, "송파구": 1, "양천구": 0, "영등포구": 0,
        "용산구": 1, "은평구": 1, "종로구": 8, "중구": 3, "중랑구": 1
      };
      schoolStats.university = univFallback[gu] || 0;

      // 대학교(대학/전문대) API 호출 추가
      try {
        const univUrl = `http://openapi.seoul.go.kr:8088/${SEOUL_API_KEY}/json/SebcCollegeInfoKor/1/100/`;
        const univRes = await axios.get(univUrl, { timeout: 1600 });
        if (univRes.data && univRes.data.SebcCollegeInfoKor && univRes.data.SebcCollegeInfoKor.row) {
          const univRows = univRes.data.SebcCollegeInfoKor.row.filter(r => {
            const rowGu = r.H_KOR_GU || '';
            const rowAddr = r.ADD_KOR || '';
            return rowGu === gu || rowAddr.includes(gu);
          });
          schoolDetails.university = univRows.map(r => ({
            name: r.H_KOR_NAME || r.SCHUL_NM || r.NAME_KOR || r.NAME || '',
            address: r.ADD_KOR || r.ADDRESS || '',
            category: '대학교'
          })).filter(school => school.name || school.address);
          console.log(`[SchoolAPI] SebcCollegeInfoKor 실시간 대학교 수 (${gu}):`, schoolStats.university);
        }
      } catch (err) {
        console.warn('[SchoolAPI] 대학교 API 호출 실패, 하드코딩 Fallback 진행:', err.message);
      }

      const schoolLocationCandidates = await schoolLocationCandidatesPromise;
      schoolKeys.forEach((key, index) => {
        const candidates = schoolLocationCandidates[index];
        const candidateByName = new Map(candidates.map(school => [school.name, school]));
        const normalizedDetails = normalizeSchoolDetails(schoolDetails[key], schoolCategories[index]);
        schoolDetails[key] = (normalizedDetails.length > 0 ? normalizedDetails : candidates).map(school => {
          const location = candidateByName.get(school.name);
          return location ? { ...school, lat: location.lat, lng: location.lng } : school;
        });
      });
      console.log(`[SchoolAPI] 최종 교육기관 통계 (${gu}):`, schoolStats);

      const cultureFacilityResult = await cultureFacilityPromise;

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

      // 5) 서울시 문화행사를 기본으로 사용하고 한국문화정보원 데이터를 보강한다.
      const today = formatYYYYMMDD(new Date()).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
      const currentMonth = today.slice(0, 7);
      let seoulCultureEvents = [];
      try {
        const eventUrl = `http://openapi.seoul.go.kr:8088/${SEOUL_API_KEY}/json/culturalEventInfo/1/1000/`;
        const eventRes = await axios.get(eventUrl, { timeout: 3000 });
        if (eventRes.data && eventRes.data.culturalEventInfo && eventRes.data.culturalEventInfo.row) {
          seoulCultureEvents = normalizeSeoulCultureEvents(eventRes.data.culturalEventInfo.row, gu, today);
        }
      } catch (err) {
        console.warn('서울시 문화행사 API 호출 실패:', err.message);
      }

      let kcisaCultureEvents = [];
      if (KCISA_CULTURE_API_KEY) {
        try {
          kcisaCultureEvents = await fetchKcisaCultureEvents({ apiKey: KCISA_CULTURE_API_KEY, gu, today });
        } catch (err) {
          console.warn('한국문화정보원 문화정보 API 호출 실패:', err.message);
        }
      }

      const cultureEvents = mergeCultureEvents(seoulCultureEvents, kcisaCultureEvents)
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === 'ongoing' ? -1 : 1;
          return String(a.startDate).localeCompare(String(b.startDate)) || a.title.localeCompare(b.title, 'ko');
        })
        .slice(0, 100);
      const cultureEventsCount = cultureEvents.filter(eventItem => eventItem.startDate.startsWith(currentMonth)).length;
      const cultureEventSources = {
        seoul: cultureEvents.filter(eventItem => eventItem.source.includes('seoul')).length,
        kcisa: cultureEvents.filter(eventItem => eventItem.source.includes('kcisa')).length
      };

      // 최종 자치구 분석 데이터 반환
      const [supabaseWelfare, supabaseSocialIndicators] = await Promise.all([
        withSupabaseFallback(
          `district welfare ${gu}`,
          () => supabaseMetrics.fetchDistrictWelfare(gu),
          () => null
        ),
        withSupabaseFallback(
          `district social safety composition ${gu}`,
          () => supabaseMetrics.fetchDistrictSocialIndicators(gu),
          () => null
        )
      ]);

      const [residentPopulation, livingPopulation] = await populationPromise;
      const populationModes = buildPopulationModes({
        resident: residentPopulation,
        living: livingPopulation
      });
      const defaultPopulation = getDefaultPopulation(populationModes);

      const responseData = {
        gu,
        population: {
          ageDistribution: defaultPopulation.ageDistribution,
          genderRatio: defaultPopulation.genderRatio,
          total: defaultPopulation.total,
          source: defaultPopulation.source,
          referenceDate: defaultPopulation.referenceDate,
          mode: populationModes.defaultMode,
          modes: populationModes.modes
        },
        populationModes,
        welfare: supabaseWelfare || {
          recipientRate: parseFloat(guCombined['수급률'] || 0),
          seoulAvgRecipientRate: parseFloat(seoulAvgRecipientRate.toFixed(3)),
          denominator: 'resident_population'
        },
        socialIndicators: supabaseSocialIndicators || {
          multicultural: {},
          foreignResidents: {},
          disability,
          disabilityGroups: groupDisabilityTypes(disability),
          householdTypes,
          nationalityComposition: topComposition(multicultural, 8, '기타 국적'),
          registeredForeignerNationalities: multicultural,
          onePersonCount: parseInt(guCombined['1인가구'] || 0),
          seoulAvgOnePerson: Math.round(seoulAvgOnePerson),
          totalRegisteredForeigners: Object.values(multicultural).reduce((sum, value) => sum + Number(value || 0), 0),
          source: 'csv_social_safety_fallback',
          sourceLabel: '서울시 자치구 통계 CSV fallback',
          referenceDate: null
        },
        cultureAndEducation: {
          schools: schoolStats,
          schoolDetails,
          publicLibraryCount,
          liveCultureEventsMonth: cultureEventsCount,
          cultureEvents,
          cultureEventSources,
          cultureFacilities: cultureFacilityResult.facilities,
          cultureFacilitySourceStatus: cultureFacilityResult.sourceStatus
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
    else if (type === 'library' || type === 'location') {
      const isLocationTarget = type === 'location';
      const requestedLat = parseCoordinate(queryParams.lat);
      const requestedLng = parseCoordinate(queryParams.lng);

      if (!gu || (!isLocationTarget && !library)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: isLocationTarget ? 'gu 파라미터가 필요합니다.' : 'gu 및 library 파라미터가 필요합니다.' }) };
      }
      if (isLocationTarget && (requestedLat === null || requestedLng === null || !isSeoulCoordinate(requestedLat, requestedLng))) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: '서울시 범위의 올바른 위도·경도가 필요합니다.' }) };
      }

      const roundedLat = isLocationTarget ? roundCoordinate(requestedLat) : null;
      const roundedLng = isLocationTarget ? roundCoordinate(requestedLng) : null;
      const cacheKey = isLocationTarget
        ? buildCacheKey('location', { version: cacheVersion, gu, lat: roundedLat, lng: roundedLng, populationCacheBucket })
        : buildCacheKey('library', { version: cacheVersion, gu, library, populationCacheBucket });
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

      const validDistricts = new Set(mappingData.libraries.map(item => item.gu));
      if (!validDistricts.has(gu)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: '서울시 자치구 정보를 확인할 수 없습니다.' }) };
      }

      const targetInfo = isLocationTarget
        ? {
          name: '입력 위치',
          gu,
          lat: roundedLat,
          lng: roundedLng,
          address: '',
          dongs: []
        }
        : mappingData.libraries.find(item => (
          normalizeLookupText(item.name) === normalizeLookupText(library)
          && normalizeLookupText(item.gu) === normalizeLookupText(gu)
        ));
      if (!targetInfo) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: '해당 도서관 정보를 찾을 수 없습니다.' }) };
      }
      const targetLabel = targetInfo.name;

      // 2) 실시간 하버사인 거리 계산으로 반경 2km 이내 행정동 동적 추출
      const dongCoords = readJSON('dong_coordinates.json');
      let dongs = [];
      let dongDistances = {}; // 디버깅 및 프론트엔드 참조용
      let dongAreas = [];
      let dongMatchMode = 'radius_centroid';

      let nearestDong = null;
      if (dongCoords && targetInfo.lat && targetInfo.lng) {
        Object.values(dongCoords).forEach(dongEntry => {
          if (!dongEntry.lat || !dongEntry.lng) return;
          const dist = haversine(targetInfo.lat, targetInfo.lng, dongEntry.lat, dongEntry.lng);
          if (!nearestDong || dist < nearestDong.distance) {
            nearestDong = { ...dongEntry, distance: dist };
          }
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
        if (dongs.length === 0 && nearestDong) {
          dongMatchMode = 'nearest_centroid_fallback';
          dongs.push(nearestDong.dong);
          dongDistances[nearestDong.dong] = Math.round(nearestDong.distance);
          dongAreas.push({
            gu: nearestDong.gu,
            dong: nearestDong.dong,
            distance: Math.round(nearestDong.distance)
          });
        }
        console.log(`[Haversine] ${targetLabel}: ${dongs.length}개 행정동 매칭 (2km 이내)`, dongs);
      } else {
        // dong_coordinates.json 로드 실패 시 기존 하드코딩 dongs 폴백
        console.warn('[Haversine] dong_coordinates.json 로드 실패, 기존 dongs 폴백 사용');
        dongMatchMode = 'mapping_fallback';
        dongs = targetInfo.dongs || [];
      }


      // 2) 행정동 인구 현황 집계: 주민등록인구 기본 + 생활인구 병행 사전 로드
      const residentPopulation = await withSupabaseFallback(
        `library resident population ${targetLabel}`,
        () => supabaseMetrics.fetchLibraryResidentPopulation(dongs),
        () => fetchResidentLibraryPopulationFromCsv({ dongs })
      );
      const livingPopulation = await fetchLiveDongPopulation({
        apiKey: SEOUL_API_KEY,
        gu,
        dongs,
        dongAreas
      });
      const populationModes = buildPopulationModes({
        resident: residentPopulation,
        living: livingPopulation
      });
      const defaultPopulation = getDefaultPopulation(populationModes);

      // 수급자 현황 집계 (5_number_of_recipients.csv)
      const welfareCSV = parseCSV('5_number_of_recipients.csv');
      const matchedWelfareRows = welfareCSV.filter(r => dongs.includes(r['행정동']));
      const avgWelfare = matchedWelfareRows.reduce((sum, r) => sum + parseInt(r['수급자수'] || 0), 0) / (matchedWelfareRows.length || 1);
      const seoulAvgWelfare = welfareCSV.reduce((sum, r) => sum + parseInt(r['수급자수'] || 0), 0) / (welfareCSV.length || 1);
      const supabaseLibraryWelfare = await withSupabaseFallback(
        `library welfare ${targetLabel}`,
        () => supabaseMetrics.fetchLibraryWelfare(dongs),
        () => null
      );

      // 3) 카카오 Local API를 통한 도서관 반경 2km 이내 공공기관(PO3) + 문화시설(CT1) 검색
      let publicPlaces = [];
      try {
        const kakaoUrl = 'https://dapi.kakao.com/v2/local/search/category.json';
        const placeCategories = [
          { code: 'PO3', label: '공공기관' },
          { code: 'CT1', label: '문화시설' }
        ];
        const responses = await Promise.all(placeCategories.map(category => axios.get(kakaoUrl, {
          headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
          params: {
            category_group_code: category.code,
            x: targetInfo.lng,
            y: targetInfo.lat,
            radius: 2000,
            sort: 'distance',
            size: 15
          },
          timeout: 3000
        })
          .then(res => ({ ...category, documents: res.data?.documents || [] }))
          .catch(err => {
            console.warn(`카카오 Local API ${category.label} 검색 실패:`, err.message);
            return { ...category, documents: [] };
          })));

        const placeMap = new Map();
        responses.forEach(category => {
          category.documents.forEach(d => {
            const key = d.id || `${d.place_name}|${d.x}|${d.y}`;
            const distance = parseInt(d.distance, 10);
            const place = {
              name: d.place_name,
              address: d.road_address_name || d.address_name,
              lat: parseFloat(d.y),
              lng: parseFloat(d.x),
              distance: Number.isFinite(distance) ? distance : 0,
              category: category.label,
              categoryCode: category.code
            };
            if (!placeMap.has(key) || place.distance < placeMap.get(key).distance) {
              placeMap.set(key, place);
            }
          });
        });
        publicPlaces = [...placeMap.values()]
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 20);
      } catch (err) {
        console.warn('카카오 Local API 검색 실패:', err.message);
      }

      // 4) 서울시·한국문화정보원 문화행사 중 기준 위치 반경 2km 이내만 계산
      const todayStr = formatYYYYMMDD(new Date()).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
      let seoulNearbyCandidates = [];
      try {
        const eventUrl = `http://openapi.seoul.go.kr:8088/${SEOUL_API_KEY}/json/culturalEventInfo/1/1000/`;
        const eventRes = await axios.get(eventUrl, { timeout: 3000 });
        if (eventRes.data && eventRes.data.culturalEventInfo && eventRes.data.culturalEventInfo.row) {
          seoulNearbyCandidates = normalizeSeoulCultureEvents(eventRes.data.culturalEventInfo.row, gu, todayStr);
        }
      } catch (err) {
        console.warn('서울시 문화행사 API 기반 반경 필터링 실패:', err.message);
      }

      let kcisaNearbyCandidates = [];
      try {
        kcisaNearbyCandidates = await fetchKcisaCultureEvents({
          apiKey: KCISA_CULTURE_API_KEY,
          gu,
          today: todayStr
        });
      } catch (err) {
        console.warn('한국문화정보원 문화행사 API 기반 반경 필터링 실패:', err.message);
      }

      const nearbyEvents = mergeCultureEvents(seoulNearbyCandidates, kcisaNearbyCandidates)
        .filter(eventItem => isSeoulCoordinate(eventItem.lat, eventItem.lng))
        .map(eventItem => ({
          ...eventItem,
          distance: Math.round(haversine(targetInfo.lat, targetInfo.lng, eventItem.lat, eventItem.lng))
        }))
        .filter(eventItem => eventItem.distance <= 2000)
        .sort((a, b) => a.distance - b.distance || String(a.startDate).localeCompare(String(b.startDate)))
        .slice(0, 15);
      const nearbyEventSources = {
        seoul: nearbyEvents.filter(eventItem => eventItem.source.includes('seoul')).length,
        kcisa: nearbyEvents.filter(eventItem => eventItem.source.includes('kcisa')).length
      };
      console.log(`[CultureAPI] 최종 매칭된 문화행사 수 (${targetLabel}, 2km):`, nearbyEvents.length);

      const responseData = {
        library: targetInfo.name,
        targetType: isLocationTarget ? 'address' : 'library',
        targetLabel,
        gu: targetInfo.gu,
        coordinates: { lat: targetInfo.lat, lng: targetInfo.lng },
        address: targetInfo.address,
        dongs,
        dongDistances,
        dongAreas,
        dongMatchMode,
        demographics: {
          ageDistribution: defaultPopulation.ageDistribution,
          genderRatio: defaultPopulation.genderRatio,
          total: defaultPopulation.total,
          source: defaultPopulation.source,
          referenceDate: defaultPopulation.referenceDate,
          matchedDongs: defaultPopulation.matchedDongs,
          missingDongs: defaultPopulation.missingDongs,
          mode: populationModes.defaultMode,
          modes: populationModes.modes
        },
        populationModes,
        welfare: supabaseLibraryWelfare || {
          avgRecipientCount: Math.round(avgWelfare),
          seoulAvgRecipientCount: Math.round(seoulAvgWelfare),
          denominator: 'resident_population'
        },
        infrastructure: {
          publicPlaces,
          nearbyEvents,
          nearbyEventSources
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
        return { statusCode: 400, headers, body: JSON.stringify({ error: '올바른 type 파라미터(district, library 또는 location)를 입력하세요.' }) };
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
