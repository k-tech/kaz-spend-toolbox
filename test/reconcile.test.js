import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseReport} from '../src/tools/bidease-country.js';
import {reconcileBidease} from '../src/tools/bidease-reconcile.js';

const date = '2026-11-08';
const csv = 'country,spend,impressions\nVNM,12345678901234567890.1000,10\nTUR,0,0\n';
const api = () => parseReport(csv, date);
const compare = (a = api(), reportCsv = csv, sameScope = true) => reconcileBidease({api:a, reportCsv, date, sameScope});

test('精确对比金额与展示数，尾随零不影响相等', () => {
  const a = api(); a.rows[0].spend = '12345678901234567890.1';
  assert.equal(compare(a).status, 'match');
  a.rows[0].spend = '12345678901234567890.1001';
  assert.equal(compare(a).status, 'mismatch');
  a.rows[0].spend = '12345678901234567890.1'; a.rows[1].impressions = 1;
  assert.equal(compare(a).status, 'mismatch');
});
test('缺行无法得出一致结论，差异优先报告', () => {
  assert.equal(compare(api(), 'country,spend,impressions\nVN,12345678901234567890.1,10\n').status, 'inconclusive');
  assert.equal(compare(api(), 'country,spend,impressions\nVN,1,10\n').status, 'mismatch');
});
test('拒绝未确认范围、日期或维度不匹配与损坏的数据', () => {
  assert.throws(() => compare(api(), csv, false), /人工核实/);
  const a = api(); a.date = '2026-11-07'; assert.throws(() => compare(a), /范围/);
  a.date = date; a.source.campaign_filter = 'x'; assert.throws(() => compare(a), /范围/);
  a.source.campaign_filter = null; a.rows[1].country = 'VN'; assert.throws(() => compare(a), /重复/);
  assert.throws(() => compare(api(), 'country,spend,impressions\nVN,1,2\nVNM,2,3\n'), /多行/);
});
test('CLI 输出结果，并用退出码区分一致、差异、缺行与参数错误', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spend-test-'));
  try {
    const apiPath = join(dir, 'api.json'), reportPath = join(dir, 'report.csv');
    writeFileSync(apiPath, JSON.stringify(api())); writeFileSync(reportPath, csv);
    const args = ['src/cli.js','bidease-reconcile','--date',date,'--api',apiPath,'--report',reportPath,'--confirm-same-scope'];
    assert.equal(JSON.parse(execFileSync(process.execPath, args, {encoding:'utf8'})).status, 'match');
    writeFileSync(reportPath, csv.replace('TUR,0,0', 'TUR,1,0'));
    assert.equal(spawnSync(process.execPath, args).status, 2);
    writeFileSync(reportPath, 'country,spend,impressions\n');
    assert.equal(spawnSync(process.execPath, args).status, 2);
    assert.equal(spawnSync(process.execPath, args.slice(0,-1)).status, 1);
  } finally { rmSync(dir, {recursive:true, force:true}); }
});
