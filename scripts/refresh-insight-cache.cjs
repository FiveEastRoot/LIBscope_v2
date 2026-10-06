const fs = require('fs');
const path = require('path');
const axios = require('axios');

const BASE_URL = process.env.INSIGHT_API_BASE_URL || 'http://localhost:3000/api/insight-api';
const CONCURRENCY = Math.max(1, parseInt(process.env.INSIGHT_REFRESH_CONCURRENCY || '6', 10));
const DEFAULT_SLEEP_MS = 250;
const SLEEP_MS = Math.max(0, parseInt(process.env.INSIGHT_REFRESH_SLEEP_MS || `${DEFAULT_SLEEP_MS}`, 10));
const TARGET_SCOPE = (process.env.INSIGHT_REFRESH_SCOPE || 'all').toLowerCase();
const INCLUDE_CACHE_META = process.env.INSIGHT_INCLUDE_CACHE_META === '1';
const REQUEST_TIMEOUT_MS = Math.max(1000, parseInt(process.env.INSIGHT_REFRESH_TIMEOUT_MS || '90000', 10));
const MAX_ATTEMPTS = Math.max(1, parseInt(process.env.INSIGHT_REFRESH_MAX_ATTEMPTS || '3', 10));
const RETRY_DELAY_MS = Math.max(0, parseInt(process.env.INSIGHT_REFRESH_RETRY_DELAY_MS || '1500', 10));

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getLibraryMapping() {
  const filePath = path.resolve(process.cwd(), 'library_dong_mapping.json');
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function isRetryableError(err) {
  const status = err?.response?.status;
  return !status || status === 408 || status === 429 || status >= 500;
}

async function refreshOne(url, item) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await axios.get(url, {
        params: {
          ...item.params,
          forceRefresh: '1',
          includeCacheMeta: INCLUDE_CACHE_META ? '1' : '0'
        },
        timeout: REQUEST_TIMEOUT_MS
      });
      const population = response.data.population?.modes?.resident || response.data.populationModes?.modes?.resident;
      const date = population?.referenceDate;
      if (!date || population.source?.includes('fallback') || !(population.total > 0)) throw new Error(`Missing resident source: ${item.label}`);
      const current = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 7);
      const lag = (Number(current.slice(0, 4)) - Number(date.slice(0, 4))) * 12 + Number(current.slice(5)) - Number(date.slice(5, 7));
      if (lag < 0 || lag > 2 || population.missingDongs?.length) throw new Error(`Stale or incomplete resident source: ${item.label}, ${date}`);
      return response.data;
    } catch (err) {
      if (!isRetryableError(err) || attempt === MAX_ATTEMPTS) throw err;
      console.warn(`↻ ${item.label} 재시도 ${attempt}/${MAX_ATTEMPTS - 1}: ${err.message}`);
      if (RETRY_DELAY_MS > 0) await sleep(RETRY_DELAY_MS * attempt);
    }
  }
}

async function runQueue(items) {
  const queue = [...items];
  let idx = 0;
  let failCount = 0;

  async function worker() {
    while (idx < queue.length) {
      const item = queue[idx++];
      try {
        const startedAt = Date.now();
        const result = await refreshOne(BASE_URL, item);
        const elapsed = Date.now() - startedAt;
        const cacheState = result._cache ? `(cache:${result._cache.fromCache ? 'hit' : 'fresh'})` : '';
        console.log(`✅ ${item.label} ${cacheState} (${elapsed}ms)`);
      } catch (err) {
        failCount++;
        console.warn(`⚠️ ${item.label} refresh failed:`, err?.response?.data || err.message);
      }
      if (SLEEP_MS > 0) {
        await sleep(SLEEP_MS);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return failCount;
}

async function main() {
  const mapping = getLibraryMapping();
  const guList = [...new Set(mapping.libraries.map(item => item.gu).values())].sort();

  const targets = [];
  const includeLibraries = TARGET_SCOPE === 'all' || TARGET_SCOPE === 'library';
  const includeDistricts = TARGET_SCOPE === 'all' || TARGET_SCOPE === 'district';

  if (includeDistricts) {
    guList.forEach(gu => {
      targets.push({
        label: `district:${gu}`,
        params: { type: 'district', gu, cacheVersion: 'culture-events-kcisa-v7' }
      });
    });
  }

  if (includeLibraries) {
    mapping.libraries.forEach(item => {
      targets.push({
        label: `library:${item.gu}/${item.name}`,
        params: { type: 'library', gu: item.gu, library: item.name, cacheVersion: 'nearby-events-dual-source-v2' }
      });
    });
  }

  console.log(`Refresh target count: ${targets.length} (${TARGET_SCOPE})`);
  const failCount = await runQueue(targets);
  console.log(`완료: ${targets.length - failCount} 성공 / ${failCount} 실패`);

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error('refresh script error:', err.message);
  process.exit(1);
});
