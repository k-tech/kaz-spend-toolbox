import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const script = 'agent-tools/feedmob-spend-entry/scripts/freewheel_spend.js';
test('离线汇总和百分数 margin，省略未经提供的计数', () => {
  const args = [script,'--date','2026-01-01','--click-url-id','123','--impressions','1000','--media-spend','10','--vendor-fees','1','--bid-shading-fee','1','--margin','1','--json'];
  const result = JSON.parse(execFileSync(process.execPath,args,{encoding:'utf8'}));
  assert.equal(result.net_spend,12);
  assert.equal(result.gross_spend,12.12);
  assert.equal(result.margin_percent,1);
  assert.equal(result.admin_fields.clicks_count,undefined);
});
