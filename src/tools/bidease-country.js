const endpoint = 'https://ui-api.bidease.com/api/reporting/v1/stats';

export function nextDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期须为 YYYY-MM-DD（UTC）。');
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.valueOf()) || d.toISOString().slice(0, 10) !== date) throw new Error('日期无效。');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// CSV records may contain quoted commas, line breaks and escaped quotes.
export function parseCsv(input) {
  const records = []; let row = [], cell = '', quoted = false, closed = false;
  const text = input.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === '"' && cell === '' && !closed) quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; closed = false; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); if (row.some(v => v.trim())) records.push(row);
      row = []; cell = ''; closed = false;
    } else if (closed) { if (!/\s/.test(c)) throw new Error('CSV 格式无效。'); }
    else if (c === '"') throw new Error('CSV 格式无效。');
    else cell += c;
  }
  if (quoted) throw new Error('CSV 引号未闭合。');
  if (cell || row.length || closed) { row.push(cell); if (row.some(v => v.trim())) records.push(row); }
  return records;
}

export function parseReport(csv, date) {
  const records = parseCsv(csv);
  if (!records.length) throw new Error('API 返回空内容，无法判断是否有数据。');
  const headers = records[0].map(x => x.trim().toLowerCase());
  for (const name of ['country', 'spend', 'impressions']) {
    if (headers.filter(x => x === name).length !== 1) throw new Error(`报告缺少或重复 ${name} 字段。`);
  }
  const selected = new Map();
  for (const fields of records.slice(1)) {
    if (fields.length !== headers.length) throw new Error('报告行的字段数量与表头不一致。');
    const r = Object.fromEntries(headers.map((h, i) => [h, fields[i].trim()]));
    const country = ({VN:'VN', VNM:'VN', TR:'TR', TUR:'TR'})[r.country.toUpperCase()];
    if (!country) continue;
    if (selected.has(country)) throw new Error(`${country} 有多行，无法确定是否应汇总；请核实报告维度。`);
    if (!/^\d+(?:\.\d+)?$/.test(r.spend) || !/^\d+$/.test(r.impressions)) throw new Error(`${country} 的 spend 或 impressions 无效。`);
    const impressions = Number(r.impressions);
    if (!Number.isSafeInteger(impressions)) throw new Error(`${country} 的 impressions 超出安全整数范围。`);
    selected.set(country, {country, source_country:r.country, spend:r.spend, impressions});
  }
  return {
    tool:'bidease-country', status:'ok', date, timezone:'UTC',
    source:{provider:'Bidease Reporting API', endpoint, grouping:'Country', fetched_at:new Date().toISOString(), account_scope:'由所用 token 的账户决定', campaign_filter:null, currency:'未由工具确认'},
    scope_note:'国家维度账户范围汇总，未按 campaign 筛选；不能直接认定为 Binance 或指定 Click URL 的数据。',
    rows:['VN','TR'].map(country => selected.get(country) ?? {country, status:'no_row', spend:null, impressions:null})
  };
}

export async function fetchBideaseCountry({date, token = process.env.BIDEASE_API_TOKEN, fetchImpl = fetch}) {
  const todate = nextDate(date);
  if (!token) throw new Error('缺少 BIDEASE_API_TOKEN 环境变量。');
  const url = new URL(endpoint);
  url.search = new URLSearchParams({'api-token':token, fromdate:date, todate, group:'Country'}).toString();
  let response;
  try { response = await fetchImpl(url, {signal:AbortSignal.timeout(30000), redirect:'error'}); }
  catch { throw new Error('无法连接 Bidease API（或请求超时）；请检查网络及接口。'); }
  if (!response.ok) throw new Error(`Bidease API 返回 HTTP ${response.status}；请检查授权和接口。`);
  return parseReport(await response.text(), date);
}
