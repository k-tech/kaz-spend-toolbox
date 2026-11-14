import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const script=fileURLToPath(new URL('../src/mcp.js',import.meta.url));
test('MCP stdio: discovery, local calls, preview and safe failures from another cwd', async t=>{
  const transport=new StdioClientTransport({command:process.execPath,args:[script],cwd:'/tmp',env:{PATH:process.env.PATH},stderr:'pipe'});
  const client=new Client({name:'toolbox-test',version:'1.0.0'});
  await client.connect(transport); t.after(()=>client.close());
  const tools=(await client.listTools()).tools;
  assert.deepEqual(tools.map(t=>t.name).sort(),['admin_analyze','admin_create','admin_query','admin_stats','spend_trends'].sort());
  assert.equal(tools.find(t=>t.name==='admin_create').annotations.destructiveHint,true);
  const stats=await client.callTool({name:'admin_stats',arguments:{startDate:'2026-01-01',endDate:'2026-01-01',currency:'USD',records:[{id:'fictional',created_at:'2026-01-01T00:00:00Z',created_by:null,net_spend:'1.23'}]}});
  assert.equal(stats.isError,undefined);assert.equal(stats.structuredContent.count,1);assert.equal(stats.structuredContent.net_spend,'1.23');
  const preview=await client.callTool({name:'admin_create',arguments:{input:{click_url_id:123,spend_date:'2026-01-01',net_spend:'1.23',gross_spend:'2.00',billing_type:'CPA'}}});
  assert.equal(preview.structuredContent.status,'preview');
  const invalid=await client.callTool({name:'admin_create',arguments:{input:{click_url_id:123,spend_date:'2026-01-01',net_spend:'1',gross_spend:'2',billing_type:'CPM'}}});
  assert.equal(invalid.isError,true);
  const missing=await client.callTool({name:'admin_query',arguments:{startDate:'2026-01-01',endDate:'2026-01-01',clickUrlIds:['123']}});
  assert.equal(missing.isError,true);assert.match(missing.content[0].text,/缺少/);
});

test('MCP submit uses the existing duplicate check and readback with a mocked backend', async t=>{
  const {InMemoryTransport}=await import('@modelcontextprotocol/sdk/inMemory.js');
  const {createServer}=await import('../src/mcp.js');
  const originalFetch=globalThis.fetch, oldKey=process.env.FEEDMOB_KEY, oldSecret=process.env.FEEDMOB_SECRET;
  process.env.FEEDMOB_KEY='fake-key';process.env.FEEDMOB_SECRET='fake-secret';
  const methods=[];const reply=data=>({ok:true,status:200,text:async()=>JSON.stringify(data)});
  globalThis.fetch=async (_url,init)=>{methods.push(init.method??'GET');if(methods.length===1)return reply({status:200,data:[]});if(methods.length===2)return reply({status:200,data:{id:99},errors:[]});return reply({status:200,data:[{id:99,click_url_id:123,date:'2026-01-01',feedmob_net_spend:1,feedmob_gross_spend:2}]})};
  t.after(()=>{globalThis.fetch=originalFetch;if(oldKey===undefined)delete process.env.FEEDMOB_KEY;else process.env.FEEDMOB_KEY=oldKey;if(oldSecret===undefined)delete process.env.FEEDMOB_SECRET;else process.env.FEEDMOB_SECRET=oldSecret});
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();const server=createServer(), client=new Client({name:'mock',version:'1'});
  await server.connect(serverTransport);await client.connect(clientTransport);t.after(async()=>{await client.close();await server.close()});
  const result=await client.callTool({name:'admin_create',arguments:{input:{click_url_id:123,spend_date:'2026-01-01',net_spend:'1',gross_spend:'2',billing_type:'CPA'},submit:true}});
  assert.equal(result.isError,undefined);assert.equal(result.structuredContent.status,'created_verified');assert.deepEqual(methods,['GET','POST','GET']);
});

test('credential access denial reports safe structured status and leaves preview available', async t=>{
  const env={PATH:process.env.PATH,KAZ_SPEND_CREDENTIAL_STATUS:JSON.stringify({FEEDMOB_KEY:'access_denied',FEEDMOB_SECRET:'not_found'})};
  const transport=new StdioClientTransport({command:process.execPath,args:[script],cwd:'/tmp',env,stderr:'pipe'});
  const client=new Client({name:'diagnostic-test',version:'1'});await client.connect(transport);t.after(()=>client.close());
  const query=await client.callTool({name:'admin_query',arguments:{startDate:'2026-01-01',endDate:'2026-01-01',clickUrlIds:['123']}});
  assert.equal(query.isError,true);assert.deepEqual(query.structuredContent.credentials,{FEEDMOB_KEY:'access_denied',FEEDMOB_SECRET:'not_found'});assert.equal(query.structuredContent.code,'FEEDMOB_CREDENTIAL_UNAVAILABLE');
  const preview=await client.callTool({name:'admin_create',arguments:{input:{click_url_id:123,spend_date:'2026-01-01',net_spend:'1',gross_spend:'2',billing_type:'CPA'}}});
  assert.equal(preview.structuredContent.status,'preview');
});
