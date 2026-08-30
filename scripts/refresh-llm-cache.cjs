const fs = require('fs');
const path = require('path');
const axios = require('axios');

const INSIGHT_API_BASE_URL = process.env.INSIGHT_API_BASE_URL || 'http://localhost:3000/api/insight-api';
const LLM_HARNESS_BASE_URL = process.env.LLM_HARNESS_BASE_URL
  || INSIGHT_API_BASE_URL.replace(/\/api\/insight-api\/?$/, '/api/llm-harness');
const CONCURRENCY = Math.max(1, parseInt(process.env.LLM_REFRESH_CONCURRENCY || '2', 10));
const SLEEP_MS = Math.max(0, parseInt(process.env.LLM_REFRESH_SLEEP_MS || '500', 10));
const PROVIDER = process.env.LLM_REFRESH_PROVIDER || 'direct-openai';
const MODEL = process.env.LLM_REFRESH_MODEL || '';
const FORCE_GENERATE = process.env.LLM_REFRESH_FORCE_GENERATE === '1';
const INSIGHT_ONLY = process.env.LLM_REFRESH_INSIGHT_ONLY === '1';
const QUALITY_RETRIES = process.env.LLM_REFRESH_QUALITY_RETRIES === '1' ? 1 : 0;
const SOURCE_FORCE_REFRESH = process.env.LLM_SOURCE_FORCE_REFRESH === '1';
const DISTRICT_CACHE_VERSION = process.env.LLM_DISTRICT_CACHE_VERSION || 'culture-events-kcisa-v7';
const LIMIT = Math.max(0, parseInt(process.env.LLM_REFRESH_LIMIT || '0', 10));

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function getCultureMetrics(gu) {
  const filePath = path.resolve(process.cwd(), 'district_culture_enjoyment_metrics.csv');
  const lines = fs.readFileSync(filePath, 'utf-8').trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0]).map(header => header.replace(/^\uFEFF/, ''));

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    if (row.gu === gu) return row;
  }
  return {};
}

function getDistricts() {
  const filePath = path.resolve(process.cwd(), 'library_dong_mapping.json');
  const mapping = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const availableDistricts = [...new Set(mapping.libraries.map(item => item.gu))]
    .filter(gu => typeof gu === 'string' && gu.endsWith('구'))
    .sort();
  const requestedDistricts = String(process.env.LLM_REFRESH_DISTRICTS || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  return requestedDistricts.length > 0
    ? requestedDistricts.filter(gu => availableDistricts.includes(gu))
    : availableDistricts;
}

async function fetchDistrictData(gu) {
  const response = await axios.get(INSIGHT_API_BASE_URL, {
    params: {
      type: 'district',
      gu,
      cacheVersion: DISTRICT_CACHE_VERSION,
      forceRefresh: SOURCE_FORCE_REFRESH ? '1' : '0',
      includeCacheMeta: '0'
    },
    timeout: 45000
  });
  return response.data;
}

async function refreshDistrictLlmCache(gu) {
  const districtData = await fetchDistrictData(gu);
  const cultureMetrics = getCultureMetrics(gu);
  const response = await axios.post(LLM_HARNESS_BASE_URL, {
    type: 'district_screen',
    provider: PROVIDER,
    model: MODEL || undefined,
    forceGenerate: FORCE_GENERATE,
    regenerateInsightOnly: INSIGHT_ONLY,
    qualityRetries: QUALITY_RETRIES,
    districtData,
    cultureMetrics
  }, {
    timeout: 120000
  });

  const payload = response.data || {};
  const cacheStatus = payload.cacheStatus || {};
  if (payload.fallbackReason) {
    throw new Error(payload.aiMeta?.error || payload.fallbackReason);
  }
  if (PROVIDER === 'cache' && !cacheStatus.hit && cacheStatus.canGenerate) {
    return {
      skipped: true,
      reason: cacheStatus.reason || 'cache_miss'
    };
  }
  if (!cacheStatus.hit) {
    throw new Error(cacheStatus.error || cacheStatus.reason || 'llm_cache_not_saved');
  }
  const insightQuality = payload.aiMeta?.insightQuality;
  if (INSIGHT_ONLY && insightQuality && !insightQuality.screenCardPassed) {
    throw new Error(`insight_quality_failed:${insightQuality.screenCardHardWarningCount || 0}`);
  }

  return {
    reason: cacheStatus.reason,
    generatedAt: cacheStatus.generatedAt,
    model: cacheStatus.model || payload.aiMeta?.model
  };
}

async function runQueue(items) {
  const queue = [...items];
  let index = 0;
  let failCount = 0;
  let skipCount = 0;

  async function worker() {
    while (index < queue.length) {
      const gu = queue[index++];
      try {
        const startedAt = Date.now();
        const result = await refreshDistrictLlmCache(gu);
        const elapsed = Date.now() - startedAt;
        if (result.skipped) {
          skipCount += 1;
          console.log(`↪️ llm:${gu} skipped:${result.reason} (${elapsed}ms)`);
        } else {
          console.log(`✅ llm:${gu} ${result.reason || 'cache_hit'} ${result.model || ''} (${elapsed}ms)`);
        }
      } catch (error) {
        failCount += 1;
        console.warn(`⚠️ llm:${gu} failed:`, error?.response?.data || error.message);
      }

      if (SLEEP_MS > 0) {
        await sleep(SLEEP_MS);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return { failCount, skipCount };
}

async function main() {
  const districts = LIMIT > 0 ? getDistricts().slice(0, LIMIT) : getDistricts();
  console.log(`LLM cache refresh target count: ${districts.length}`);
  console.log(`Insight API: ${INSIGHT_API_BASE_URL}`);
  console.log(`LLM harness: ${LLM_HARNESS_BASE_URL}`);
  console.log(`Provider: ${PROVIDER}`);
  console.log(`Model: ${MODEL || 'route default'}`);
  console.log(`Insight only: ${INSIGHT_ONLY ? 'yes' : 'no'}`);
  console.log(`Quality repair retries: ${QUALITY_RETRIES}`);

  const { failCount, skipCount } = await runQueue(districts);
  console.log(`완료: ${districts.length - failCount - skipCount} 성공 / ${skipCount} 스킵 / ${failCount} 실패`);

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('llm cache refresh script error:', error.message);
  process.exit(1);
});
