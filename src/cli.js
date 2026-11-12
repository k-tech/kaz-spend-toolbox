#!/usr/bin/env node
import {fetchBideaseCountry} from './tools/bidease-country.js';
import {reconcileBidease} from './tools/bidease-reconcile.js';
import {readFile} from 'node:fs/promises';
import {createAdminSpend} from './tools/admin-create.js';
import {fetchAdminSpends, summarizeCreatedSpends, summarizeSpendTrends, analyzeAdminResponse} from './tools/admin-spend.js';

const tools = {'bidease-country': {description:'按 UTC 日期读取 Bidease 报表的 VN / TR 国家维度 Spend 和展示数', run:fetchBideaseCountry}};
const usage = `Kaz Spend Toolbox\n\n用法：\n  node src/cli.js list\n  node src/cli.js bidease-country --date YYYY-MM-DD [--json]\n  node src/cli.js bidease-reconcile --date YYYY-MM-DD --api API.json --report report.csv --confirm-same-scope\n  node src/cli.js admin-create --input FILE [--submit]\n  node src/cli.js admin-query --start YYYY-MM-DD --end YYYY-MM-DD [--client ID] [--click-url ID ...]\n  node src/cli.js admin-analyze --start YYYY-MM-DD --end YYYY-MM-DD --currency USD [--client ID] [--click-url ID ...]\n  node src/cli.js admin-stats --start YYYY-MM-DD --end YYYY-MM-DD --currency USD --input records.json\n  node src/cli.js spend-trends --start YYYY-MM-DD --end YYYY-MM-DD --currency USD --status-as-of YYYY-MM-DD --input records.json\n\n数据为 Bidease 账户国家汇总，不限定 campaign；日期按 UTC。`;
async function main(args) {
  const [name, ...rest] = args;
  if (!name || name === '--help' || name === 'help') { console.log(usage); return; }
  if (name === 'list') { if (rest.length) throw new Error('list 不接受参数。'); for (const [key, value] of Object.entries(tools)) console.log(`${key}  ${value.description}`); console.log('bidease-reconcile  对照同范围 Bidease 国家汇总 CSV'); console.log('admin-create  预览或新增一条 Admin Direct Spend'); console.log('admin-query  只读查询 Admin Direct Spend'); console.log('admin-analyze  查询并分析 Admin 返回的 Spend 数据'); console.log('admin-stats  按创建时间及创建人汇总已整理的记录'); console.log('spend-trends  按 Spend Date 汇总分类和状态'); return; }
  if (name === 'admin-create') {
    let path, submit = false;
    for (let i=0; i<rest.length; i++) {
      if (rest[i] === '--input' && path === undefined && rest[i+1] && !rest[i+1].startsWith('--')) path = rest[++i];
      else if (rest[i] === '--submit' && !submit) submit = true;
      else throw new Error(`无效或重复参数：${rest[i]}`);
    }
    if (!path) throw new Error('请用 --input 指定录入数据 JSON 文件。');
    let input; try { input = JSON.parse(await readFile(path,'utf8')); } catch { throw new Error('无法读取或解析录入数据文件。'); }
    const result = await createAdminSpend({input,submit});
    console.log(JSON.stringify(result,null,2));
    if (['existing','rejected','unverified'].includes(result.status)) process.exitCode = 2;
    return;
  }
  if (name === 'admin-query' || name === 'admin-analyze' || name === 'admin-stats' || name === 'spend-trends') {
    const options = {}, ids = [];
    const allowed = (name === 'admin-query' || name === 'admin-analyze') ? ['--start','--end','--client','--click-url', ...(name === 'admin-analyze' ? ['--currency'] : [])] : ['--start','--end','--currency','--input', ...(name === 'spend-trends' ? ['--status-as-of'] : [])];
    for (let i=0; i<rest.length; i++) {
      const arg = rest[i], value = rest[i+1];
      if (!allowed.includes(arg) || !value || value.startsWith('--') || (arg !== '--click-url' && options[arg] !== undefined)) throw new Error(`无效或重复参数：${arg}`);
      i++; if (arg === '--click-url') ids.push(value); else options[arg] = value;
    }
    if (!options['--start'] || !options['--end']) throw new Error('请指定 --start 和 --end。');
    if (name === 'admin-query' || name === 'admin-analyze') {
      if (name === 'admin-analyze' && !/^[A-Z]{3}$/.test(options['--currency'] ?? '')) throw new Error('请用 --currency 指定已核实的三位币种代码。');
      const client = options['--client'];
      if (client !== undefined && !/^[1-9]\d*$/.test(client)) throw new Error('Client ID 无效。');
      const body = await fetchAdminSpends({startDate:options['--start'],endDate:options['--end'],clickUrlIds:ids,clientId:client === undefined ? undefined : Number(client)});
      if (name === 'admin-query') console.log(body);
      else {
        const result = analyzeAdminResponse({response:JSON.parse(body),startDate:options['--start'],endDate:options['--end'],currency:options['--currency'],scope:{clickUrlIds:ids,clientId:client === undefined ? undefined : Number(client)}});
        console.log(JSON.stringify(result,null,2));
      }
    } else {
      if (!options['--currency'] || !options['--input']) throw new Error('请指定 --currency 和 --input。');
      let records;
      try { records = JSON.parse(await readFile(options['--input'],'utf8')); } catch { throw new Error('无法读取或解析输入文件。'); }
      const common = {records,startDate:options['--start'],endDate:options['--end'],currency:options['--currency']};
      const result = name === 'spend-trends' ? summarizeSpendTrends({...common,statusAsOf:options['--status-as-of']}) : summarizeCreatedSpends(common);
      console.log(JSON.stringify(result,null,2));
    }
    return;
  }
  if (name === 'bidease-reconcile') {
    const options = {};
    for (let i=0; i<rest.length; i++) {
      const arg = rest[i];
      if (arg === '--confirm-same-scope' && !options.confirm) options.confirm = true;
      else if (['--date','--api','--report'].includes(arg) && options[arg] === undefined && rest[i+1] && !rest[i+1].startsWith('--')) options[arg] = rest[++i];
      else throw new Error(`无效或重复参数：${arg}`);
    }
    if (!options['--date'] || !options['--api'] || !options['--report']) throw new Error('请指定 --date、--api 和 --report。');
    if (!options.confirm) throw new Error('请先核实账户、日期、时区、币种和汇总范围，并使用 --confirm-same-scope。');
    let api, reportCsv;
    try { api = JSON.parse(await readFile(options['--api'], 'utf8')); reportCsv = await readFile(options['--report'], 'utf8'); }
    catch { throw new Error('无法读取或解析输入文件。'); }
    const result = reconcileBidease({api, reportCsv, date:options['--date'], sameScope:true});
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'match') process.exitCode = 2;
    return;
  }
  if (!tools[name]) throw new Error(`未知工具：${name}。使用 list 查看工具。`);
  let date, json = false;
  for (let i=0; i<rest.length; i++) {
    if (rest[i] === '--date' && date === undefined && rest[i+1] && !rest[i+1].startsWith('--')) date = rest[++i];
    else if (rest[i] === '--json' && !json) json = true;
    else throw new Error(`无效或重复参数：${rest[i]}`);
  }
  if (!date) throw new Error('请用 --date 指定 UTC 日期。');
  const result = await tools[name].run({date});
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Bidease 国家报表 | ${result.date} UTC | 获取时间 ${result.source.fetched_at}`);
    console.log(result.scope_note);
    console.log('币种：未确认；账户：由所用 token 决定');
    for (const row of result.rows) console.log(row.status === 'no_row' ? `${row.country}: 无返回行（不是 0）` : `${row.country}: Spend ${row.spend} | Impressions ${row.impressions}`);
  }
}
main(process.argv.slice(2)).catch(error => { console.error(`错误：${error.message}`); process.exitCode=1; });
