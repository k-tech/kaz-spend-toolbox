import {adminHeaders, fetchAdminSpends} from './admin-spend.js';
import {nextDate} from './date.js';

const countFields = ['impression','clicks_count','installs_count','client_paid_action_count','partner_paid_action_count'];
const allowed = new Set(['click_url_id','spend_date','net_spend','gross_spend','billing_type',...countFields,'creative','audit_comment']);

export function validateCreate(input) {
  if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).some(k => !allowed.has(k))) throw new Error('录入数据格式无效或包含不支持的字段。');
  if (!Number.isSafeInteger(input.click_url_id) || input.click_url_id <= 0) throw new Error('click_url_id 必须是正整数。');
  nextDate(input.spend_date);
  for (const name of ['net_spend','gross_spend']) if (typeof input[name] !== 'string' || !/^\d+(?:\.\d+)?$/.test(input[name]) || !Number.isFinite(Number(input[name]))) throw new Error(`${name} 必须是非负十进制字符串。`);
  if (!['CPM','CPA','OTHER'].includes(input.billing_type)) throw new Error('请指定 billing_type 为 CPM、CPA 或 OTHER。');
  for (const name of countFields) if (input[name] !== undefined && (!Number.isSafeInteger(input[name]) || input[name] < 0)) throw new Error(`${name} 必须是非负安全整数。`);
  if (input.billing_type === 'CPM' && input.impression === undefined) throw new Error('CPM 录入必须提供 impression。');
  for (const name of ['creative','audit_comment']) if (input[name] !== undefined && (typeof input[name] !== 'string' || !input[name].trim())) throw new Error(`${name} 必须是非空字符串。`);
  const {billing_type, ...body} = input;
  return {billing_type,body};
}

function normalizedDecimal(value) {
  const s = String(value); if (!/^\d+(?:\.\d+)?$/.test(s)) return null;
  const [int, frac = ''] = s.split('.');
  return `${int.replace(/^0+(?=\d)/,'')}.${frac.replace(/0+$/,'')}`;
}

export async function createAdminSpend({input,submit = false,key = process.env.FEEDMOB_KEY,secret = process.env.FEEDMOB_SECRET,fetchImpl = fetch}) {
  const {billing_type,body} = validateCreate(input);
  if (!submit) return {status:'preview',billing_type,record:body};
  const query = async () => {
    const raw = await fetchAdminSpends({startDate:body.spend_date,endDate:body.spend_date,clickUrlIds:[String(body.click_url_id)],key,secret,fetchImpl});
    const parsed = JSON.parse(raw); const data = Array.isArray(parsed) ? parsed : parsed.data;
    if ((!Array.isArray(parsed) && (parsed.status !== 200 || (parsed.errors && (!Array.isArray(parsed.errors) || parsed.errors.length > 0)))) || !Array.isArray(data) || data.some(r => !r || String(r.click_url_id) !== String(body.click_url_id) || r.date !== body.spend_date)) throw new Error('查询结果不符合目标范围。');
    return data;
  };
  const existing = await query();
  if (existing.length) return {status:'existing',message:'目标日期和 Click URL 已有记录，未创建；请先核对现有记录。',count:existing.length};
  const headers = {...adminHeaders(key,secret),'Content-Type':'application/json'};
  const uncertain = async message => {
    try { const rows = await query(); return {status:'unverified',message,readback_count:rows.length}; }
    catch { return {status:'unverified',message,readback_count:null}; }
  };
  let response, result;
  try { response = await fetchImpl('https://admin.feedmob.com/ai/api/direct_spends',{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(30000),redirect:'error'}); }
  catch { return uncertain('提交结果不明确；已尝试回读，勿自动重试。'); }
  if (!response.ok) {
    if ([400,401,403,404,422].includes(response.status)) return {status:'rejected',http_status:response.status,message:'接口拒绝请求；请核对权限和数据。'};
    return uncertain(`提交返回 HTTP ${response.status}；已尝试回读，勿自动重试。`);
  }
  try { result = JSON.parse(await response.text()); } catch { return uncertain('提交响应无法解析；已尝试回读，勿自动重试。'); }
  if (!result || result.status !== 200 || !result.data || (Array.isArray(result.errors) && result.errors.length) || (result.errors && !Array.isArray(result.errors) && Object.keys(result.errors).length)) return uncertain('提交响应未明确成功；已尝试回读，勿自动重试。');
  let rows; try { rows = await query(); } catch { return {status:'unverified',message:'提交后无法回读；请先查询，勿自动重试。'}; }
  if (rows.length !== 1) return {status:'unverified',message:'回读记录数量不为一；请核实。'};
  const row = rows[0];
  const amountsMatch = ['net_spend','gross_spend'].every(k => normalizedDecimal(body[k]) === normalizedDecimal(row[`feedmob_${k}`]) && normalizedDecimal(row[`feedmob_${k}`]) !== null);
  const countsMatch = countFields.every(k => body[k] === undefined || (Number.isSafeInteger(row[k]) && row[k] === body[k]));
  const creativeMatch = body.creative === undefined || row.creative === body.creative;
  if (!amountsMatch || !countsMatch || !creativeMatch) return {status:'unverified',message:'回读字段缺失或不一致；请核实。'};
  if (!Number.isSafeInteger(row.id) || row.id <= 0 || result.data.id !== row.id || body.audit_comment !== undefined) return {status:'unverified',message:'记录 ID 或审核备注无法通过查询完整核验；请核实。'};
  return {status:'created_verified',id:row.id,click_url_id:body.click_url_id,spend_date:body.spend_date};
}
