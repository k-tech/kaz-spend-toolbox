export function nextDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期须为 YYYY-MM-DD（UTC）。');
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.valueOf()) || d.toISOString().slice(0, 10) !== date) throw new Error('日期无效。');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
