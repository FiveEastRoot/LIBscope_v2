function currentReportMonth(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7);
}
function reportMonth(value, now = new Date()) {
  const month = value || currentReportMonth(now);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid report month');
  return month;
}
function reportValidUntil(month) {
  const [year, number] = reportMonth(month).split('-').map(Number);
  return new Date(Date.UTC(year, number, 1) - 9 * 60 * 60 * 1000).toISOString();
}
module.exports = { currentReportMonth, reportMonth, reportValidUntil };
