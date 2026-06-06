const fs = require('fs');
const path = require('path');
const axios = require('axios');

const BASE_URL = process.env.INSIGHT_API_BASE_URL || 'http://localhost:3000/api/insight-api';
const CONCURRENCY = Math.max(1, parseInt(process.env.INSIGHT_REFRESH_CONCURRENCY || '6', 10));
const DEFAULT_SLEEP_MS = 250;
const SLEEP_MS = Math.max(0, parseInt(process.env.INSIGHT_REFRESH_SLEEP_MS || `${DEFAULT_SLEEP_MS}`, 10));
const TARGET_SCOPE = (process.env.INSIGHT_REFRESH_SCOPE || 'all').toLowerCase();
const INCLUDE_CACHE_META = process.env.INSIGHT_INCLUDE_CACHE_META === '1';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getLibraryMapping() {
  const filePath = path.resolve(process.cwd(), 'library_dong_mapping.json');
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

async function refreshOne(url, params) {
  const response = await axios.get(url, {
    params: {
      ...params,
      forceRefresh: '1',
      includeCacheMeta: INCLUDE_CACHE_META ? '1' : '0'
    },
    timeout: 45000
  });
  return response.data;
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
        const result = await refreshOne(BASE_URL, item.params);
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
        params: { type: 'district', gu }
      });
    });
  }

  if (includeLibraries) {
    mapping.libraries.forEach(item => {
      targets.push({
        label: `library:${item.gu}/${item.name}`,
        params: { type: 'library', gu: item.gu, library: item.name }
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

