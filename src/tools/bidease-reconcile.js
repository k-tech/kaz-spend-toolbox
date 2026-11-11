import {parseReport, nextDate} from './bidease-country.js';

// Compare decimal values without floating-point rounding.
function decimal(value) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) throw new Error('API 结果中的 spend 无效。');
  const [integer, fraction = ''] = value.split('.');
  return `${integer.replace(/^0+(?=\d)/, '')}.${fraction.replace(/0+$/, '')}`;
}

export function reconcileBidease({api, reportCsv, date, sameScope}) {
  nextDate(date);
  if (sameScope !== true) throw new Error('请先人工核实两个报表的账户、日期、时区、币种和国家汇总范围一致，再明确确认范围。');
  if (!api || api.tool !== 'bidease-country' || api.status !== 'ok' || api.date !== date || api.timezone !== 'UTC' || api.source?.grouping !== 'Country' || api.source?.campaign_filter !== null || !Array.isArray(api.rows) || api.rows.length !== 2) throw new Error('API 结果的日期或范围不符合账户国家汇总格式。');
  const byCountry = new Map();
  for (const row of api.rows) {
    if (!row || !['VN', 'TR'].includes(row.country) || byCountry.has(row.country)) throw new Error('API 结果的国家行无效或重复。');
    if (row.status === 'no_row') {
      if (row.spend !== null || row.impressions !== null) throw new Error('API 无返回行的数据无效。');
    } else {
      if (row.status !== undefined || !Number.isSafeInteger(row.impressions) || row.impressions < 0) throw new Error('API 结果的展示数或状态无效。');
      decimal(row.spend);
    }
    byCountry.set(row.country, row);
  }
  const report = parseReport(reportCsv, date);
  const rows = report.rows.map(expected => {
    const actual = byCountry.get(expected.country);
    if (actual.status === 'no_row' || expected.status === 'no_row') {
      return {country:expected.country, status:'inconclusive', reason:'至少一侧无返回行；不能视为零或验证一致'};
    }
    return {country:expected.country, status:decimal(actual.spend) === decimal(expected.spend) && actual.impressions === expected.impressions ? 'match' : 'mismatch', api:{spend:actual.spend, impressions:actual.impressions}, report:{spend:expected.spend, impressions:expected.impressions}};
  });
  return {tool:'bidease-reconcile', date, timezone:'UTC', scope:'账户国家汇总；范围一致由操作者确认，工具不能独立验证账户、币种、时区或来源', status:rows.some(r => r.status === 'mismatch') ? 'mismatch' : rows.some(r => r.status === 'inconclusive') ? 'inconclusive' : 'match', rows};
}
