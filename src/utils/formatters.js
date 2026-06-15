export const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatMetric = (value, unit = '개') => {
  const numericValue = toNumber(value);
  if (numericValue === null) return '-';
  return `${numericValue.toLocaleString()}${unit}`;
};

export const formatCount = (value, unit = '') => {
  const numericValue = toNumber(value);
  if (numericValue === null) return '-';
  return `${numericValue.toLocaleString()}${unit}`;
};
