import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAdminSpend} from '../src/tools/admin-create.js';

const input = {click_url_id:123,spend_date:'2026-11-08',net_spend:'10.10',gross_spend:'12.00',billing_type:'CPM',impression:0};
const row = {id:99,click_url_id:123,date:'2026-11-08',feedmob_net_spend:10.1,feedmob_gross_spend:12,impression:0};
const ok = data => ({ok:true,status:200,text:async()=>JSON.stringify(data)});
const opts = {input,submit:true,key:'fake-key',secret:'fake-secret'};

test('默认只预览，CPM 缺展示数、无效金额或额外字段会拒绝', async () => {
  assert.equal((await createAdminSpend({input,fetchImpl:()=>{throw Error('unexpected')}})).status,'preview');
  await assert.rejects(createAdminSpend({input:{...input,impression:undefined}}),/impression/);
  await assert.rejects(createAdminSpend({input:{...input,net_spend:'-1'}}),/net_spend/);
  await assert.rejects(createAdminSpend({input:{...input,unknown:'x'}}),/不支持/);
});
test('查重后新增并回读金额及展示数，零值不丢失', async () => {
  const requests = [];
  const result = await createAdminSpend({...opts,fetchImpl:async(url,init)=>{
    requests.push({url:String(url),init});
    if (requests.length === 1) return ok({status:200,data:[]});
    if (requests.length === 2) return ok({status:200,data:{id:99},errors:[]});
    return ok({status:200,data:[row]});
  }});
  assert.equal(result.status,'created_verified'); assert.deepEqual(requests.map(r=>r.init.method ?? 'GET'),['GET','POST','GET']);
  const body = JSON.parse(requests[1].init.body); assert.equal(body.impression,0); assert.equal(body.net_spend,'10.10'); assert.equal(body.billing_type,undefined);
});
test('已有记录不提交；响应不明时回读且不重试 POST', async () => {
  let calls=0;
  const existing=await createAdminSpend({...opts,fetchImpl:async()=>{calls++; return ok({status:200,data:[row]});}});
  assert.equal(existing.status,'existing'); assert.equal(calls,1);
  calls=0;
  const unknown=await createAdminSpend({...opts,fetchImpl:async()=>{calls++; if(calls===2) throw Error('fake-secret'); return ok({status:200,data:calls===1?[]:[row]});}});
  assert.equal(unknown.status,'unverified'); assert.equal(unknown.readback_count,1); assert.equal(calls,3); assert.ok(!JSON.stringify(unknown).includes('fake-secret'));
});
test('回读不一致或字段缺失不得报告完成；明确拒绝不得重试', async () => {
  let calls=0;
  const mismatched=await createAdminSpend({...opts,fetchImpl:async()=>{calls++; return calls===1?ok({status:200,data:[]}):calls===2?ok({status:200,data:{id:99}}):ok({status:200,data:[{...row,impression:null}]});}});
  assert.equal(mismatched.status,'unverified');
  calls=0;
  const refused=await createAdminSpend({...opts,fetchImpl:async()=>{calls++; return calls===1?ok({status:200,data:[]}):{ok:false,status:403};}});
  assert.equal(refused.status,'rejected'); assert.equal(calls,2);
});

test('拒绝不明确的预查，创建响应与回读 ID 不同不可判成功', async () => {
  let calls=0;
  await assert.rejects(createAdminSpend({...opts,fetchImpl:async()=>{calls++;return ok({data:[]});}}),/范围/);
  assert.equal(calls,1);
  calls=0;
  const result=await createAdminSpend({...opts,fetchImpl:async()=>{calls++; return calls===1?ok({status:200,data:[]}):calls===2?ok({status:200,data:{id:98}}):ok({status:200,data:[row]});}});
  assert.equal(result.status,'unverified'); assert.equal(calls,3);
});

test('命令行默认只预览输入并列出录入工具', async () => {
  const {mkdtempSync,writeFileSync,rmSync} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const {execFileSync} = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(),'spend-create-'));
  try {
    const path = join(dir,'entry.json'); writeFileSync(path,JSON.stringify(input));
    const output = JSON.parse(execFileSync(process.execPath,['src/cli.js','admin-create','--input',path],{encoding:'utf8'}));
    assert.equal(output.status,'preview'); assert.equal(output.record.impression,0);
    assert.match(execFileSync(process.execPath,['src/cli.js','list'],{encoding:'utf8'}),/admin-create/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
