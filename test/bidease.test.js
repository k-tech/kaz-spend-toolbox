import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nextDate, parseCsv, parseReport, fetchBideaseCountry} from '../src/tools/bidease-country.js';
test('日期跨月、闰年并拒绝无效日期', () => {
  assert.equal(nextDate('2024-02-29'), '2024-03-01');
  assert.throws(() => nextDate('2025-02-29'));
  assert.throws(() => nextDate('2026-1-01'));
});
test('CSV 引号、逗号、换行和双引号', () => {
  assert.deepEqual(parseCsv('country,note\nVNM,"a,b\n""c"""\n'), [['country','note'],['VNM','a,b\n"c"']]);
  assert.throws(() => parseCsv('a\n"unclosed'));
});
test('保留精确 spend 字符串，区分零与无行', () => {
  const r = parseReport('country,spend,impressions\nVNM,0.00,0\nUSA,15,10\n','2026-11-08');
  assert.equal(r.rows[0].spend,'0.00');
  assert.equal(r.rows[1].spend,null);
  assert.equal(r.rows[1].status,'no_row');
  assert.equal(r.source.campaign_filter,null);
});
test('拒绝重复国家、错误数字、缺字段、错误行宽', () => {
  assert.throws(() => parseReport('country,spend,impressions\nVN,1,2\nVNM,2,3\n','2026-11-08'));
  assert.throws(() => parseReport('country,spend,impressions\nVN,2oops,3\n','2026-11-08'));
  assert.throws(() => parseReport('country,spend\nVN,2\n','2026-11-08'));
  assert.throws(() => parseReport('country,spend,impressions\nVN,2\n','2026-11-08'));
});
test('请求使用指定 UTC 日及次日，错误不泄露 token', async () => {
  let request;
  const result = await fetchBideaseCountry({date:'2026-11-08',token:'test-secret',fetchImpl:async url => { request=url; return {ok:true,text:async()=> 'country,spend,impressions\nTUR,10.10,55\n'}; }});
  assert.equal(request.searchParams.get('fromdate'),'2026-11-08');
  assert.equal(request.searchParams.get('todate'),'2026-11-09');
  assert.equal(request.searchParams.get('group'),'Country');
  assert.equal(result.rows[1].spend,'10.10');
  assert.ok(!JSON.stringify(result).includes('test-secret'));
  await assert.rejects(fetchBideaseCountry({date:'2026-11-08',token:'test-secret',fetchImpl:async()=>{throw new Error('test-secret');}}), e => !e.message.includes('test-secret'));
  await assert.rejects(fetchBideaseCountry({date:'2026-11-08',token:'test-secret',fetchImpl:async()=>({ok:false,status:401})}), /HTTP 401/);
});
