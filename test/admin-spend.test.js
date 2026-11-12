import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {fetchAdminSpends, summarizeCreatedSpends} from '../src/tools/admin-spend.js';

const opts = {startDate:'2026-11-01',endDate:'2026-11-02',currency:'USD'};
const records = [
  {id:'1',created_at:'2026-11-01T23:59:59Z',created_by:'A',net_spend:'9007199254740993.10'},
  {id:'2',created_at:'2026-11-02T00:00:00Z',created_by:'A',net_spend:'0.02'},
  {id:'3',created_at:'2026-11-02T00:00:00Z',created_by:null,net_spend:'1.001'},
  {id:'4',created_at:'2026-11-03T00:00:00Z',created_by:'B',net_spend:'10'}
];
test('按 UTC 创建时间、创建人计算当前 Net，精确累加并保留未知创建人', () => {
  const r = summarizeCreatedSpends({...opts,records});
  assert.equal(r.count,3); assert.equal(r.net_spend,'9007199254740994.121');
  assert.equal(r.by_creator[0].net_spend,'9007199254740993.12');
  assert.equal(r.by_creator[0].record_share,'0.6667'); assert.equal(r.by_creator[0].records_per_calendar_day,'1.0000');
  assert.equal(r.by_creator[1].created_by,null); assert.deepEqual(r.by_day.map(d=>d.count),[1,2]);
});
test('拒绝重复记录、缺少归因字段和无效金额及时间', () => {
  for (const row of [{...records[0],id:'1'}, {...records[1],id:'5',created_by:undefined}, {...records[1],id:'5',net_spend:1}, {...records[1],id:'5',created_at:'2026-11-01T25:00:00Z'}]) assert.throws(()=>summarizeCreatedSpends({...opts,records:[records[0],row]}));
});
test('只读请求匹配公司接口，签名正确且保留原始数字', async () => {
  let req;
  const body = '{"data":[{"net_spend":9007199254740993.12}]}';
  const result = await fetchAdminSpends({startDate:opts.startDate,endDate:opts.endDate,key:'fake-key',secret:'fake-secret',now:new Date('2026-11-11T00:00:00Z'),clickUrlIds:['12','34'],clientId:5,fetchImpl:async(url,init)=>{req={url,init};return {ok:true,text:async()=>body};}});
  assert.equal(result,body); assert.equal(req.url.origin,'https://admin.feedmob.com'); assert.equal(req.url.pathname,'/ai/api/direct_spends');
  assert.deepEqual(req.url.searchParams.getAll('click_url_ids[]'),['12','34']); assert.equal(req.url.searchParams.get('client_id'),'5'); assert.equal(req.init.redirect,'error'); assert.equal(req.init.method,undefined);
  const parts=req.init.headers['FEEDMOB-TOKEN'].split('.'); assert.equal(parts[2],createHmac('sha256','fake-secret').update(parts[0]+'.'+parts[1]).digest('base64url'));
  assert.equal(JSON.parse(Buffer.from(parts[1],'base64url')).expired_at,'2026-11-18');
});
test('查询错误不会暴露认证信息，拒绝非记录响应', async () => {
  const base={startDate:opts.startDate,endDate:opts.endDate,clientId:5,key:'fake-key',secret:'fake-secret'};
  await assert.rejects(fetchAdminSpends({...base,clientId:undefined}),/至少一个/);
  await assert.rejects(fetchAdminSpends({...base,fetchImpl:async()=>{throw Error('fake-secret');}}),e=>!e.message.includes('fake-secret'));
  await assert.rejects(fetchAdminSpends({...base,fetchImpl:async()=>({ok:true,text:async()=>'{"error":"x"}'})}),/记录数组/);
  await assert.rejects(fetchAdminSpends({...base,fetchImpl:async()=>({ok:false,status:401})}),/HTTP 401/);
});

test('空记录返回零计数且不伪造人员比例', () => {
  const r = summarizeCreatedSpends({...opts,records:[]});
  assert.equal(r.count,0); assert.equal(r.net_spend,'0'); assert.deepEqual(r.by_creator,[]);
});

test('Spend Date 分类趋势按日、月及状态汇总，排除测试并保留未知分类', async () => {
  const {summarizeSpendTrends} = await import('../src/tools/admin-spend.js');
  const row = {id:'1',spend_date:'2026-11-01',click_url_id:'123',net_spend:'10.01',gross_spend:'20.00',category:'automatic',status:'active',is_test:false};
  const rows = [row,{...row,id:'2',spend_date:'2026-11-02',net_spend:'0.09',category:'unknown'},{...row,id:'3',click_url_id:'124',is_test:true}];
  const options = {...opts,statusAsOf:'2026-11-03',records:rows};
  const r = summarizeSpendTrends(options);
  assert.equal(r.excluded_test_rows,1); assert.equal(r.click_urls,1); assert.equal(r.by_day.length,2);
  assert.equal(r.total.find(x=>x.key==='automatic').net_spend,'10.01');
  assert.equal(r.total.find(x=>x.key==='unknown').net_spend,'0.09');
  assert.equal(r.total.find(x=>x.key==='automatic').net_percent,'99.11'); assert.equal(r.by_week.length,2);
  assert.throws(()=>summarizeSpendTrends({...options,records:[row,{...row,id:'4',status:'paused'}]}),/不一致/);
  assert.throws(()=>summarizeSpendTrends({...options,records:[{...row,category:undefined}]}));
});

test('真实格式查询响应可直接统计，并标明测试和分类未知', async () => {
  const {analyzeAdminResponse} = await import('../src/tools/admin-spend.js');
  const response = {status:200,data:[{id:123,click_url_id:23567,date:'2026-11-01',feedmob_net_spend:2.25,feedmob_gross_spend:3.5},{id:124,click_url_id:23567,date:'2026-11-02',feedmob_net_spend:0.75,feedmob_gross_spend:1}]};
  const input = {...opts,response,scope:{clickUrlIds:['23567']}};
  const r = analyzeAdminResponse(input);
  assert.equal(r.total[0].key,'unknown'); assert.equal(r.total[0].count,2); assert.equal(r.total[0].net_spend,'3.00'); assert.equal(r.total[0].gross_spend,'4.5');
  assert.equal(r.test_status_unknown_rows,2); assert.equal(r.status_as_of,null); assert.equal(r.by_day.length,2);
  assert.throws(()=>analyzeAdminResponse({...input,scope:{clickUrlIds:['123']}}),/范围/);
  assert.throws(()=>analyzeAdminResponse({...input,response:{status:400,data:[]}}),/状态/);
  assert.throws(()=>analyzeAdminResponse({...input,response:{data:[{...response.data[0],feedmob_net_spend:null}]}}),/金额/);
  assert.throws(()=>analyzeAdminResponse({...input,response:{data:[response.data[0],response.data[0]]}}),/重复/);
  assert.equal(analyzeAdminResponse({...input,response:{status:200,data:[]}}).total.length,0);
});

test('一次查询与统计衔接，日期和 URL 超出范围时拒绝', async () => {
  const {analyzeAdminResponse} = await import('../src/tools/admin-spend.js');
  const body = JSON.stringify({status:200,data:[{id:1,click_url_id:123,date:'2026-11-01',feedmob_net_spend:1.5,feedmob_gross_spend:2}]});
  const raw = await fetchAdminSpends({startDate:opts.startDate,endDate:opts.endDate,clickUrlIds:['123'],key:'fake',secret:'fake',fetchImpl:async()=>({ok:true,text:async()=>body})});
  const input = {...opts,response:JSON.parse(raw),scope:{clickUrlIds:['123']}};
  assert.equal(analyzeAdminResponse(input).total[0].net_spend,'1.5');
  assert.throws(()=>analyzeAdminResponse({...input,endDate:'2026-10-30'}));
});

test('拒绝使用外部证据修改 Admin 查询统计', async () => {
  const {analyzeAdminResponse} = await import('../src/tools/admin-spend.js');
  const response = {status:200,data:[{id:1,click_url_id:123,date:'2026-11-01',feedmob_net_spend:10,feedmob_gross_spend:20}]};
  const input = {...opts,response,scope:{clickUrlIds:['123']}};
  assert.throws(() => analyzeAdminResponse({...input,evidence:{records:[{id:'1',category:'automatic'}],click_urls:[]}}), /不支持/);
  const result = analyzeAdminResponse(input);
  assert.equal(result.total[0].key,'unknown');
  assert.equal(result.test_status_unknown_rows,1);
});

test('按 URL 汇总金额并报告有记录日期及同日多条；空查询不推断零消耗', async () => {
  const {analyzeAdminResponse} = await import('../src/tools/admin-spend.js');
  const row = {id:1,click_url_id:12,date:'2026-11-01',feedmob_net_spend:1.1,feedmob_gross_spend:2};
  const input = {startDate:'2026-11-01',endDate:'2026-11-03',currency:'USD',scope:{clickUrlIds:['12','13']},response:{status:200,data:[row,{...row,id:2,feedmob_net_spend:0.2},{...row,id:3,click_url_id:13,date:'2026-11-03'}]}};
  const r = analyzeAdminResponse(input);
  assert.deepEqual(r.returned_record_coverage,{calendar_days:3,dates_with_records:2,dates_without_returned_records:1});
  assert.deepEqual(r.by_click_url[0],{click_url_id:'12',count:2,net_spend:'1.3',gross_spend:'4',dates_with_records:1,dates_without_returned_records:2,multiple_record_dates:[{date:'2026-11-01',count:2}]});
  assert.equal(r.by_click_url[1].click_url_id,'13');
  const empty = analyzeAdminResponse({...input,response:{status:200,data:[]}});
  assert.equal(empty.returned_record_coverage.dates_without_returned_records,3);
  assert.deepEqual(empty.by_click_url,[]);
});
