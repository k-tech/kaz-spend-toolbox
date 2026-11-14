#!/usr/bin/env node
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {pathToFileURL} from 'node:url';
import {fetchAdminSpends, analyzeAdminResponse, summarizeCreatedSpends, summarizeSpendTrends} from './tools/admin-spend.js';
import {createAdminSpend} from './tools/admin-create.js';

const date = z.string().describe('YYYY-MM-DD 日期；Direct Spend 为 Spend Date，创建统计为 UTC 创建日。');
const currency = z.string().regex(/^[A-Z]{3}$/).describe('操作者已核实的三位币种；接口本身不提供逐条币种。');
const id = z.string().regex(/^[1-9]\d*$/).describe('正整数字符串 ID。');
const amount = z.string().regex(/^-?\d+(?:\.\d+)?$/).describe('十进制字符串，避免浮点精度损失。');
const scope = {startDate:date,endDate:date,clickUrlIds:z.array(id).optional().describe('Click URL ID 列表；与 clientId 取交集。'),clientId:z.number().int().positive().safe().optional().describe('Client ID；至少提供该字段或非空 Click URL 列表。')};
const created = z.object({id:z.string().min(1),created_at:z.string(),created_by:z.string().min(1).nullable(),net_spend:amount}).strict();
const trend = z.object({id:z.string().min(1),spend_date:date,click_url_id:id,net_spend:amount,gross_spend:amount,category:z.enum(['automatic','agent','manual','unknown']),status:z.enum(['active','paused','unknown']),is_test:z.boolean().nullable()}).strict();
const createInput = z.object({click_url_id:z.number().int().positive().safe(),spend_date:date,net_spend:amount,gross_spend:amount,billing_type:z.enum(['CPM','CPA','OTHER']),impression:z.number().int().nonnegative().safe().optional(),clicks_count:z.number().int().nonnegative().safe().optional(),installs_count:z.number().int().nonnegative().safe().optional(),client_paid_action_count:z.number().int().nonnegative().safe().optional(),partner_paid_action_count:z.number().int().nonnegative().safe().optional(),creative:z.string().min(1).optional(),audit_comment:z.string().min(1).optional()}).strict();

function missingCredentialStatus() {
  let state={}; try { state=JSON.parse(process.env.KAZ_SPEND_CREDENTIAL_STATUS || '{}'); } catch {}
  const allowed=new Set(['not_found','access_denied','empty','unavailable']);
  const missing={};
  for (const key of ['FEEDMOB_KEY','FEEDMOB_SECRET']) if (!process.env[key]) missing[key]=allowed.has(state[key])?state[key]:'not_configured';
  return missing;
}

export function createServer() {
  const server = new McpServer({name:'kaz-spend-toolbox',version:'0.1.0'});
  const register=(name,description,inputSchema,run,annotations)=>server.registerTool(name,{description,inputSchema,annotations},async args=>{
    try {
      if (name==='admin_query'||name==='admin_analyze'||(name==='admin_create'&&args.submit===true)) {
        const missing=missingCredentialStatus();
        if (Object.keys(missing).length) {
          const detail={code:'FEEDMOB_CREDENTIAL_UNAVAILABLE',credentials:missing,message:'缺少或无法在无交互模式读取 FeedMob 凭据；没有进行业务请求。请检查钥匙串访问状态。'};
          return {isError:true,content:[{type:'text',text:JSON.stringify(detail)}],structuredContent:detail};
        }
      }
      const value = await run(args);
      const failed=name==='admin_create' && ['existing','rejected','unverified'].includes(value.status);
      return {content:[{type:'text',text:JSON.stringify(value,null,2)}],structuredContent:value,...(failed?{isError:true}:{})};
    } catch (error) {
      // Never echo upstream bodies, credentials, or arbitrary exception details.
      const message = error instanceof Error && /^[\u4e00-\u9fffA-Za-z0-9 _，。、；：()（）/\-]+$/.test(error.message) ? error.message : '执行失败；请核实参数、凭据及上游服务。';
      return {isError:true,content:[{type:'text',text:message}]};
    }
  });
  const read={readOnlyHint:true,destructiveHint:false,openWorldHint:true};
  const local={readOnlyHint:true,destructiveHint:false,openWorldHint:false};
  register('admin_query','实时只读查询 Admin Direct Spend；日期为 Spend Date（两端包含），缺创建人、创建日、分类、测试标记及状态，结果完整性需核实；需 FEEDMOB_KEY 和 FEEDMOB_SECRET。',{...scope},async a=>({raw_json:await fetchAdminSpends(a),note:'原始 JSON 字符串；金额已由上游转浮点；不能推断创建人或人工录入。'}),read);
  register('admin_analyze','实时只读查询并按 Spend Date 分析 Admin 数据；分类、状态、测试标记为未知，币种及覆盖完整性需核实。',{...scope,currency},async ({currency,...a})=>{const response=JSON.parse(await fetchAdminSpends(a));return analyzeAdminResponse({response,startDate:a.startDate,endDate:a.endDate,currency,scope:{clickUrlIds:a.clickUrlIds,clientId:a.clientId}})},read);
  register('admin_stats','离线按 UTC created_at 汇总用户提供的已核实完整记录；不自动取数，创建人可为 null，当前金额不保证为创建时金额。',{startDate:date,endDate:date,currency,records:z.array(created)},summarizeCreatedSpends,local);
  register('spend_trends','离线按 Spend Date 汇总用户提供的记录；分类、测试标记、状态需独立证据，未知必须填 unknown 或 null。',{startDate:date,endDate:date,currency,statusAsOf:date.nullable().optional(),records:z.array(trend)},summarizeSpendTrends,local);
  register('admin_create','写入工具：默认仅预览。submit=true 会真实创建生产 Spend，须用户明确授权本次录入并核实 URL、日期、币种、Margin、金额和计费；提交前查重、提交后回读，不确定时绝不重试。',{input:createInput,submit:z.boolean().default(false).describe('默认 false 仅预览；true 将真实写入，必须另有用户明确授权。')},createAdminSpend,{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:true});
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server=createServer();
  await server.connect(new StdioServerTransport());
}
