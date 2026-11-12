import {createHmac} from 'node:crypto';
import {nextDate} from './bidease-country.js';

const host = 'https://admin.feedmob.com';
const b64 = value => Buffer.from(value).toString('base64url');

export function adminHeaders(key, secret, now = new Date()) {
  if (!key || !secret) throw new Error('缺少 FEEDMOB_KEY 或 FEEDMOB_SECRET。');
  const expires = new Date(now); expires.setUTCDate(expires.getUTCDate() + 7);
  const unsigned = `${b64(JSON.stringify({alg:'HS256',typ:'JWT'}))}.${b64(JSON.stringify({key,expired_at:expires.toISOString().slice(0,10),iat:Math.floor(now.getTime()/1000)}))}`;
  const token = `${unsigned}.${createHmac('sha256', secret).update(unsigned).digest('base64url')}`;
  return {'Accept':'application/json','FEEDMOB-KEY':key,'FEEDMOB-TOKEN':token};
}

export async function fetchAdminSpends({startDate, endDate, clickUrlIds = [], clientId, key = process.env.FEEDMOB_KEY, secret = process.env.FEEDMOB_SECRET, fetchImpl = fetch, now = new Date()}) {
  nextDate(startDate); nextDate(endDate);
  if (startDate > endDate) throw new Error('开始日期不能晚于结束日期。');
  if (!Array.isArray(clickUrlIds) || clickUrlIds.some(id => typeof id !== 'string' || !/^[1-9]\d*$/.test(id)) || (clientId !== undefined && (!Number.isSafeInteger(clientId) || clientId <= 0))) throw new Error('Click URL 或 Client ID 无效。');
  if (!clickUrlIds.length && clientId === undefined) throw new Error('必须提供至少一个 Click URL 或 Client ID。');
  const headers = adminHeaders(key, secret, now);
  const url = new URL('/ai/api/direct_spends', host);
  url.searchParams.set('start_date', startDate); url.searchParams.set('end_date', endDate);
  for (const id of clickUrlIds) url.searchParams.append('click_url_ids[]', id);
  if (clientId !== undefined) url.searchParams.set('client_id', String(clientId));
  let response, body;
  try { response = await fetchImpl(url, {headers, signal:AbortSignal.timeout(30000), redirect:'error'}); }
  catch { throw new Error('Admin 查询连接失败或超时。'); }
  if (!response.ok) throw new Error(`Admin 查询返回 HTTP ${response.status}。`);
  try { body = await response.text(); } catch { throw new Error('无法读取 Admin 响应。'); }
  let parsed;
  try { parsed = JSON.parse(body); } catch { throw new Error('Admin 响应不是有效 JSON。'); }
  if (!Array.isArray(parsed) && !(parsed && typeof parsed === 'object' && Array.isArray(parsed.data))) throw new Error('Admin 响应缺少记录数组；无法确认查询结果。');
  // Preserve the original bytes: JSON numeric amounts may otherwise lose precision.
  return body;
}

function amountParts(value) {
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error('每条记录的 net_spend 必须是十进制字符串。');
  const negative = value.startsWith('-');
  const [int, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  return {coefficient:BigInt((negative ? '-' : '') + int + fraction), scale:fraction.length};
}
function add(a,b) {
  const scale = Math.max(a.scale,b.scale);
  return {coefficient:a.coefficient * 10n ** BigInt(scale-a.scale) + b.coefficient * 10n ** BigInt(scale-b.scale), scale};
}
function format({coefficient,scale}) {
  const sign = coefficient < 0n ? '-' : ''; const digits = (coefficient < 0n ? -coefficient : coefficient).toString().padStart(scale+1,'0');
  return scale ? `${sign}${digits.slice(0,-scale)}.${digits.slice(-scale)}` : sign + digits;
}

export function summarizeCreatedSpends({records, startDate, endDate, currency}) {
  nextDate(startDate); nextDate(endDate);
  if (startDate > endDate || typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency) || !Array.isArray(records)) throw new Error('日期、币种或记录格式无效。');
  const seen = new Set(), people = new Map(), daily = new Map();
  let total = {coefficient:0n,scale:0};
  for (const r of records) {
    if (!r || typeof r.id !== 'string' || !r.id.trim() || seen.has(r.id)) throw new Error('记录 ID 缺失或重复。');
    seen.add(r.id);
    if (typeof r.created_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(r.created_at)) throw new Error('created_at 须为 UTC ISO 时间。');
    const date = r.created_at.slice(0,10); nextDate(date);
    const instant = new Date(r.created_at);
    if (Number.isNaN(instant.valueOf()) || instant.toISOString().slice(0,19) !== r.created_at.slice(0,19)) throw new Error('created_at 时间无效。');
    if (date < startDate || date > endDate) continue;
    if (r.created_by !== null && (typeof r.created_by !== 'string' || !r.created_by.trim())) throw new Error('created_by 须为非空字符串或 null。');
    const value = amountParts(r.net_spend); total = add(total,value);
    const update = (map,key) => {const g = map.get(key) ?? {count:0,amount:{coefficient:0n,scale:0}}; g.count++; g.amount = add(g.amount,value); map.set(key,g);};
    update(people,r.created_by); update(daily,date);
  }
  const count = [...people.values()].reduce((n,g)=>n+g.count,0);
  const days = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000 + 1;
  const ratio = (num, den) => { const scaled = (BigInt(num) * 10000n + BigInt(den) / 2n) / BigInt(den); return `${scaled / 10000n}.${String(scaled % 10000n).padStart(4,'0')}`; };
  return {method:'created_at UTC; created_by; current net_spend', start_date:startDate, end_date:endDate, currency, coverage:'输入数据的完整性、排除规则及金额币种由操作者核实；当前金额不一定是创建时金额', days, count, net_spend:format(total), by_creator:[...people].map(([created_by,g])=>({created_by,count:g.count,record_share:ratio(g.count,count),records_per_calendar_day:ratio(g.count,days),net_spend:format(g.amount)})), by_day:[...daily].sort(([a],[b])=>a.localeCompare(b)).map(([date,g])=>({date,count:g.count,net_spend:format(g.amount)})), limitations:'记录数不是上传批次数；不推断 AI、系统或人工来源，也不推断个人归因。'};
}

// Explicit, evidence-backed classifications and snapshot statuses only; never infer them from user names.
export function summarizeSpendTrends({records,startDate,endDate,currency,statusAsOf}) {
  nextDate(startDate); nextDate(endDate);
  if (statusAsOf !== null && statusAsOf !== undefined) nextDate(statusAsOf);
  if (startDate > endDate || !/^[A-Z]{3}$/.test(currency ?? '') || !Array.isArray(records)) throw new Error('日期、币种或记录格式无效。');
  const groups = {total:new Map(), by_day:new Map(), by_week:new Map(), by_month:new Map(), by_status:new Map(), status_totals:new Map()};
  const seen = new Set(), urlStatus = new Map(); let excluded = 0, testStatusUnknown = 0;
  const blank = () => ({count:0,net:{coefficient:0n,scale:0},gross:{coefficient:0n,scale:0},urls:new Set()});
  function accumulate(map,key,row,net,gross) {
    let g = map.get(key); if (!g) {g = blank(); map.set(key,g);}
    g.count++; g.net = add(g.net,net); g.gross = add(g.gross,gross); g.urls.add(row.click_url_id);
  }
  for (const r of records) {
    if (!r || typeof r.id !== 'string' || !r.id.trim() || seen.has(r.id)) throw new Error('记录 ID 缺失或重复。');
    seen.add(r.id); nextDate(r.spend_date);
    if (typeof r.click_url_id !== 'string' || !/^[1-9]\d*$/.test(r.click_url_id) || ![true,false,null].includes(r.is_test) || !['automatic','agent','manual','unknown'].includes(r.category) || !['active','paused','unknown'].includes(r.status)) throw new Error('Click URL、测试标记、分类或状态无效。');
    const net = amountParts(r.net_spend), gross = amountParts(r.gross_spend);
    if (net.coefficient < 0n || gross.coefficient < 0n) throw new Error('Net 和 Gross 须为非负数。');
    if (r.spend_date < startDate || r.spend_date > endDate) continue;
    if (r.is_test === true) {excluded++; continue;}
    if (r.is_test === null) testStatusUnknown++;
    if (r.status !== 'unknown' && !statusAsOf) throw new Error('已知状态须提供快照日期。');
    if (urlStatus.has(r.click_url_id) && urlStatus.get(r.click_url_id) !== r.status) throw new Error('同一 Click URL 的状态快照不一致。');
    urlStatus.set(r.click_url_id,r.status);
    accumulate(groups.total,r.category,r,net,gross);
    accumulate(groups.by_day,`${r.spend_date}|${r.category}`,r,net,gross);
    const offset = Math.floor((Date.parse(`${r.spend_date}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 604800000);
    const weekStart = new Date(Date.parse(`${startDate}T00:00:00Z`) + offset * 604800000).toISOString().slice(0,10);
    accumulate(groups.by_week,`${weekStart}|${r.category}`,r,net,gross);
    accumulate(groups.by_month,`${r.spend_date.slice(0,7)}|${r.category}`,r,net,gross);
    accumulate(groups.by_status,`${r.status}|${r.category}`,r,net,gross);
    accumulate(groups.status_totals,r.status,r,net,gross);
  }
  function percentage(a,b) {
    if (b.coefficient === 0n) return null;
    const scale = Math.max(a.scale,b.scale);
    const numerator = a.coefficient * 10n ** BigInt(scale-a.scale) * 10000n;
    const denominator = b.coefficient * 10n ** BigInt(scale-b.scale);
    const value = (numerator + denominator / 2n) / denominator;
    return `${value / 100n}.${String(value % 100n).padStart(2,'0')}`;
  }
  function render(map) {
    const denominators = new Map();
    for (const [key,g] of map) {
      const period = key.includes('|') ? key.split('|')[0] : 'all';
      const d = denominators.get(period) ?? blank(); d.count += g.count; d.net = add(d.net,g.net); d.gross = add(d.gross,g.gross); denominators.set(period,d);
    }
    return [...map].sort(([a],[b])=>a.localeCompare(b)).map(([key,g])=>{
      const d = denominators.get(key.includes('|') ? key.split('|')[0] : 'all');
      return {key,count:g.count,click_urls:g.urls.size,net_spend:format(g.net),gross_spend:format(g.gross),count_percent:percentage({coefficient:BigInt(g.count),scale:0},{coefficient:BigInt(d.count),scale:0}),net_percent:percentage(g.net,d.net),gross_percent:percentage(g.gross,d.gross)};
    });
  }
  return {method:'spend_date inclusive; explicit per-row category; current values and status snapshot',start_date:startDate,end_date:endDate,currency,status_as_of:statusAsOf ?? null,excluded_test_rows:excluded,test_status_unknown_rows:testStatusUnknown,click_urls:urlStatus.size,...Object.fromEntries(Object.entries(groups).map(([key,map])=>[key,render(map)])), limitations:'分类、测试标记、状态及数据完整性由操作者提供证据；相同 URL 可在不同分类中重复出现；金额为当前值而非创建时金额。'};
}

// The API exposes spend-date records only; unknown metadata remains unknown.
export function analyzeAdminResponse({response,startDate,endDate,currency,scope,evidence}) {
  if (evidence !== undefined) throw new Error('不支持使用外部证据补充查询结果。');
  const data = Array.isArray(response) ? response : response?.data;
  if (!Array.isArray(data) || (!Array.isArray(response) && response.status !== undefined && response.status !== 200)) throw new Error('Admin 返回数据格式或状态无效。');
  const ids = scope?.clickUrlIds ?? [];
  if (!Array.isArray(ids) || (!ids.length && scope?.clientId === undefined)) throw new Error('须提供查询范围。');
  const amount = value => {
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER || /e/i.test(String(value))) throw new Error('Admin 金额无法安全转换；请核实原始数据。');
      return String(value);
    }
    if (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)) return value;
    throw new Error('Admin 金额缺失或无效。');
  };
  const records = data.map(r => {
    if (!r || !Number.isSafeInteger(r.id) || r.id <= 0 || !Number.isSafeInteger(r.click_url_id) || r.click_url_id <= 0) throw new Error('Admin 记录 ID 或 Click URL 无效。');
    if (ids.length && !ids.includes(String(r.click_url_id))) throw new Error('Admin 返回的 Click URL 不在请求范围。');
    if (typeof r.date !== 'string') throw new Error('Admin 记录缺少 Spend Date。');
    nextDate(r.date);
    if (r.date < startDate || r.date > endDate) throw new Error('Admin 返回了请求范围外的 Spend Date。');
    return {id:String(r.id),click_url_id:String(r.click_url_id),spend_date:r.date,net_spend:amount(r.feedmob_net_spend),gross_spend:amount(r.feedmob_gross_spend),category:'unknown',status:'unknown',is_test:null};
  });
  const result = summarizeSpendTrends({records,startDate,endDate,currency,statusAsOf:null});
  const urls = new Map(), days = new Set();
  for (const row of records) {
    const group = urls.get(row.click_url_id) ?? {count:0,net:{coefficient:0n,scale:0},gross:{coefficient:0n,scale:0},dates:new Map()};
    group.count++; group.net = add(group.net,amountParts(row.net_spend)); group.gross = add(group.gross,amountParts(row.gross_spend));
    group.dates.set(row.spend_date,(group.dates.get(row.spend_date) ?? 0)+1); days.add(row.spend_date);
    urls.set(row.click_url_id,group);
  }
  const calendarDays = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000 + 1;
  const byClickUrl = [...urls].sort(([a],[b])=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0).map(([click_url_id,g])=>({
    click_url_id,count:g.count,net_spend:format(g.net),gross_spend:format(g.gross),
    dates_with_records:g.dates.size,dates_without_returned_records:calendarDays-g.dates.size,
    multiple_record_dates:[...g.dates].filter(([,count])=>count>1).sort(([a],[b])=>a.localeCompare(b)).map(([date,count])=>({date,count}))
  }));
  return {...result,source:'FeedMob Admin Direct Spend',scope:{click_url_ids:ids,client_id:scope.clientId ?? null},returned_record_coverage:{calendar_days:calendarDays,dates_with_records:days.size,dates_without_returned_records:calendarDays-days.size},by_click_url:byClickUrl,coverage:'仅为所选过滤条件内返回的记录；无返回记录不等于零消耗或漏录，同日多条也不一定重复。测试标记未知且未排除；响应完整性和币种需核实。',limitations:'Admin 不返回创建人、录入类别、测试标记和状态；全部保留未知，不能解读为生产数据或人工/自动/AI 占比。服务端已将金额转为浮点。'};
}
