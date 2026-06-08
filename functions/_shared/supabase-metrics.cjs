const DEFAULT_TIMEOUT_MS = 10000;

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  return { url, key, enabled: Boolean(url && key) };
}

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  return query.toString();
}

async function supabaseFetch(table, params = {}) {
  const config = getSupabaseConfig();
  if (!config.enabled) return null;

  const query = buildQuery(params);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.url}/rest/v1/${table}${query ? `?${query}` : ''}`, {
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        Accept: 'application/json'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Supabase ${table} read failed: ${response.status} ${body}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeFiveYearAgeDistribution(ageDistribution = {}) {
  const result = {};
  const addValue = (label, value) => {
    result[label] = (result[label] || 0) + value;
  };

  Object.entries(ageDistribution).forEach(([label, rawValue]) => {
    const value = Number(rawValue || 0);
    if (!Number.isFinite(value) || !value || label === '총인구') return;

    const range = String(label).match(/^(\d{1,3})-(\d{1,3})세$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
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
        if (overlapYears > 0) buckets.push({ label: `${bucketStart}-${bucketEnd}세`, years: overlapYears });
      }

      const totalYears = buckets.reduce((sum, bucket) => sum + bucket.years, 0);
      buckets.forEach(bucket => addValue(bucket.label, value * (bucket.years / totalYears)));
      return;
    }

    const over = String(label).match(/^(\d{1,3})세 이상$/);
    if (over) {
      const start = Number(over[1]);
      if (start >= 100) addValue('100세 이상', value);
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

function rowsToPopulationSummary(rows, source) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const firstMetric = rows[0]?.metric_json || {};
  const summary = {
    ageDistribution: {},
    genderRatio: { male: 0, female: 0 },
    total: 0,
    source: firstMetric.source || source,
    referenceDate: firstMetric.referenceDate || null,
    matchedDongs: [],
    missingDongs: []
  };

  rows.forEach(row => {
    const metric = row.metric_json || {};
    const ageDistribution = metric.ageDistribution || {};
    Object.entries(ageDistribution).forEach(([age, count]) => {
      const parsed = Number(count || 0);
      if (Number.isFinite(parsed)) {
        summary.ageDistribution[age] = (summary.ageDistribution[age] || 0) + parsed;
      }
    });

    const genderRatio = metric.genderRatio || {};
    summary.genderRatio.male += Number(genderRatio.male || 0);
    summary.genderRatio.female += Number(genderRatio.female || 0);
    summary.total += Number(row.metric_value || metric.total || 0);
    if (!summary.referenceDate && row.reference_date) summary.referenceDate = row.reference_date;
    if (row.dong) summary.matchedDongs.push(row.dong);
  });

  summary.genderRatio.male = Math.round(summary.genderRatio.male);
  summary.genderRatio.female = Math.round(summary.genderRatio.female);
  summary.total = Math.round(summary.total || summary.genderRatio.male + summary.genderRatio.female);
  summary.ageDistribution = normalizeFiveYearAgeDistribution(summary.ageDistribution);

  return summary;
}

async function fetchDistrictResidentPopulation(gu) {
  const rows = await supabaseFetch('district_metrics', {
    select: 'metric_value,metric_json,reference_date',
    gu: `eq.${gu}`,
    metric_key: 'eq.resident_population_age_gender',
    population_mode: 'eq.resident',
    order: 'reference_date.desc.nullslast,fetched_at.desc',
    limit: '1'
  });

  const summary = rowsToPopulationSummary(rows, 'supabase_resident_population');
  return summary;
}

async function fetchLibraryResidentPopulation(dongs = []) {
  if (!dongs.length) return null;
  const quoted = dongs.map(dong => `"${String(dong).replace(/"/g, '\\"')}"`).join(',');
  const rows = await supabaseFetch('dong_metrics', {
    select: 'dong,metric_value,metric_json,reference_date',
    dong: `in.(${quoted})`,
    metric_key: 'eq.resident_population_age_gender',
    population_mode: 'eq.resident',
    order: 'reference_date.desc.nullslast,fetched_at.desc'
  });

  const latestByDong = new Map();
  (rows || []).forEach(row => {
    if (!latestByDong.has(row.dong)) latestByDong.set(row.dong, row);
  });

  const summary = rowsToPopulationSummary([...latestByDong.values()], 'supabase_resident_population');
  if (summary) {
    summary.missingDongs = dongs.filter(dong => !latestByDong.has(dong));
  }
  return summary;
}

async function fetchDistrictWelfare(gu) {
  const rows = await supabaseFetch('district_metrics', {
    select: 'metric_value,metric_json',
    gu: `eq.${gu}`,
    metric_key: 'eq.welfare_recipient_rate',
    order: 'reference_date.desc.nullslast,fetched_at.desc',
    limit: '1'
  });
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const metric = rows[0].metric_json || {};
  return {
    recipientRate: Number(rows[0].metric_value || 0),
    seoulAvgRecipientRate: Number(metric.seoulAvgRecipientRate || 0),
    denominator: 'resident_population'
  };
}

async function fetchDistrictSocialIndicators(gu) {
  const rows = await supabaseFetch('district_metrics', {
    select: 'metric_json,reference_date',
    gu: `eq.${gu}`,
    metric_key: 'eq.social_safety_composition',
    order: 'reference_date.desc.nullslast,fetched_at.desc',
    limit: '1'
  });
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const metric = rows[0].metric_json || {};
  return {
    multicultural: metric.multicultural || metric.foreignResidents || {},
    disability: metric.disability || {},
    disabilityGroups: metric.disabilityGroups || metric.disability || {},
    householdTypes: metric.householdTypes || {},
    nationalityComposition: metric.nationalityComposition || {},
    registeredForeignerNationalities: metric.registeredForeignerNationalities || {},
    onePersonCount: Number(metric.onePersonCount || 0),
    seoulAvgOnePerson: Number(metric.seoulAvgOnePerson || 0),
    totalHouseholds: Number(metric.totalHouseholds || 0),
    totalDisabled: Number(metric.totalDisabled || 0),
    totalForeignResidents: Number(metric.totalForeignResidents || 0),
    totalRegisteredForeigners: Number(metric.totalRegisteredForeigners || 0),
    averageHouseholdSize: Number(metric.averageHouseholdSize || 0),
    periods: metric.periods || {},
    source: metric.source || 'supabase_social_safety_composition',
    sourceLabel: metric.sourceLabel || 'Supabase 사회안전망 구성',
    referenceDate: metric.referenceDate || rows[0].reference_date || null
  };
}

async function fetchLibraryWelfare(dongs = []) {
  if (!dongs.length) return null;
  const quoted = dongs.map(dong => `"${String(dong).replace(/"/g, '\\"')}"`).join(',');
  const rows = await supabaseFetch('dong_metrics', {
    select: 'dong,metric_value',
    dong: `in.(${quoted})`,
    metric_key: 'eq.welfare_recipients',
    order: 'reference_date.desc.nullslast,fetched_at.desc'
  });
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const latestByDong = new Map();
  rows.forEach(row => {
    if (!latestByDong.has(row.dong)) latestByDong.set(row.dong, row);
  });
  const values = [...latestByDong.values()].map(row => Number(row.metric_value || 0));
  const allRows = await supabaseFetch('dong_metrics', {
    select: 'dong,metric_value',
    metric_key: 'eq.welfare_recipients',
    order: 'reference_date.desc.nullslast,fetched_at.desc'
  });
  const latestAll = new Map();
  (allRows || []).forEach(row => {
    if (!latestAll.has(row.dong)) latestAll.set(row.dong, row);
  });
  const allValues = [...latestAll.values()].map(row => Number(row.metric_value || 0));

  return {
    avgRecipientCount: Math.round(values.reduce((sum, value) => sum + value, 0) / (values.length || 1)),
    seoulAvgRecipientCount: Math.round(allValues.reduce((sum, value) => sum + value, 0) / (allValues.length || 1)),
    denominator: 'resident_population'
  };
}

module.exports = {
  getSupabaseConfig,
  fetchDistrictResidentPopulation,
  fetchLibraryResidentPopulation,
  fetchDistrictWelfare,
  fetchDistrictSocialIndicators,
  fetchLibraryWelfare
};
