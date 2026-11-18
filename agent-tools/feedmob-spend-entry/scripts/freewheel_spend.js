#!/usr/bin/env node
'use strict';

// Calculate a FreeWheel vendor-managed CPM direct-spend row from already
// verified report values. This script is intentionally offline and read-only.

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function usage() {
  return `Usage:
  node freewheel_spend.js --date YYYY-MM-DD --click-url-id <id> --impressions <integer>
    --media-spend <amount> --vendor-fees <amount> --bid-shading-fee <amount>
    --margin <percent> [--line-items <id1,id2>] [--campaign-id <id>]
    [--campaign-name <name>] [--reported-spend <amount>] [--json]`;
}

function fail(message) {
  throw new Error(message);
}

function required(args, key) {
  if (args[key] === undefined || args[key] === '') {
    fail(`Missing required argument: --${key}`);
  }
  return String(args[key]);
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseMoney(value, key) {
  const cleaned = String(value).replace(/[,$\s]/g, '');
  const number = Number(cleaned);
  if (!Number.isFinite(number) || number < 0) {
    fail(`--${key} must be a non-negative number`);
  }
  return number;
}

function parseInteger(value, key) {
  const cleaned = String(value).replace(/[,_\s]/g, '');
  if (!/^\d+$/.test(cleaned)) fail(`--${key} must be a non-negative integer`);
  return Number(cleaned);
}

function parseMargin(value) {
  const number = Number(String(value).replace(/[%\s]/g, ''));
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    fail('--margin must be between 0 and 100 percent');
  }
  const rate = number / 100;
  if (rate >= 1) fail('--margin must be lower than 100 percent');
  return rate;
}

function validateDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail('--date must use YYYY-MM-DD');
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    fail('--date is not a valid calendar date');
  }
  return value;
}

function parseLineItems(value) {
  if (!value) return [];
  return String(value).split(/[\s,]+/).filter(Boolean).map((item) => parseInteger(item, 'line-items'));
}

function money(value) {
  return `$${value.toFixed(2)}`;
}

function buildResult(args) {
  const date = validateDate(required(args, 'date'));
  const clickUrlId = parseInteger(required(args, 'click-url-id'), 'click-url-id');
  const impressions = parseInteger(required(args, 'impressions'), 'impressions');
  const mediaSpend = parseMoney(required(args, 'media-spend'), 'media-spend');
  const vendorFees = parseMoney(required(args, 'vendor-fees'), 'vendor-fees');
  const bidShadingFee = parseMoney(required(args, 'bid-shading-fee'), 'bid-shading-fee');
  const marginRate = parseMargin(required(args, 'margin'));
  const netSpend = round2(mediaSpend + vendorFees + bidShadingFee);
  const grossSpend = round2(netSpend / (1 - marginRate));
  const actualMarginPercent = grossSpend === 0
    ? null
    : round2(((grossSpend - netSpend) / grossSpend) * 100);
  const reportedSpend = args['reported-spend'] === undefined
    ? null
    : parseMoney(args['reported-spend'], 'reported-spend');
  const lineItems = parseLineItems(args['line-items'] || args['line-item-ids']);

  return {
    date,
    timezone: args.timezone || 'UTC',
    click_url_id: clickUrlId,
    vendor: args.vendor || 'Freewheel',
    campaign_id: args['campaign-id'] === undefined ? null : String(args['campaign-id']),
    campaign_name: args['campaign-name'] || null,
    line_item_ids: lineItems,
    source: args.source || 'FreeWheel/Beeswax Performance Report',
    raw_report: {
      impressions,
      media_spend: round2(mediaSpend),
      vendor_fees: round2(vendorFees),
      bid_shading_fee: round2(bidShadingFee),
      reported_spend: reportedSpend,
    },
    net_spend: netSpend,
    gross_spend: grossSpend,
    margin_percent: round2(marginRate * 100),
    actual_margin_percent: actualMarginPercent,
    reconciliation_difference: reportedSpend === null ? null : round2(reportedSpend - netSpend),
    admin_fields: {
      spend_date: date,
      click_url_id: clickUrlId,
      vendor: args.vendor || 'Freewheel',
      impressions_count: impressions,
      net_spend: netSpend,
      gross_spend: grossSpend,
      margin_percent: round2(marginRate * 100),
    },
  };
}

function printHuman(result) {
  const lineItems = result.line_item_ids.length ? result.line_item_ids.join(', ') : 'not specified';
  const raw = result.raw_report;
  console.log(`FreeWheel vendor-managed CPM spend (${result.date} ${result.timezone})`);
  console.log(`Source: ${result.source}`);
  console.log(`Click URL: ${result.click_url_id} | Vendor: ${result.vendor}`);
  console.log(`Line items: ${lineItems}`);
  if (result.campaign_id || result.campaign_name) {
    console.log(`Campaign: ${result.campaign_id || 'n/a'}${result.campaign_name ? ` | ${result.campaign_name}` : ''}`);
  }
  console.log(`Impressions: ${raw.impressions.toLocaleString()}`);
  console.log(`Media Spend: ${money(raw.media_spend)}`);
  console.log(`Vendor Fees: ${money(raw.vendor_fees)}`);
  console.log(`Bid Shading Fee: ${money(raw.bid_shading_fee)}`);
  console.log(`Net Spend: ${money(result.net_spend)}`);
  console.log(`Gross Spend: ${money(result.gross_spend)} (margin ${result.margin_percent.toFixed(2)}%; Net / (1 - margin))`);
  console.log(`Actual Margin after rounding: ${result.actual_margin_percent === null ? 'N/A' : `${result.actual_margin_percent.toFixed(2)}%`}`);
  if (result.raw_report.reported_spend !== null) {
    console.log(`Reported Spend for reconciliation: ${money(result.raw_report.reported_spend)}; difference vs component Net: ${money(result.reconciliation_difference)}`);
  }
  console.log('\nFeedMob Admin fields:');
  console.log(`  Spend date: ${result.admin_fields.spend_date}`);
  console.log(`  Click URL ID: ${result.admin_fields.click_url_id}`);
  console.log(`  Vendor: ${result.admin_fields.vendor}`);
  console.log(`  Impressions count: ${result.admin_fields.impressions_count}`);
  console.log(`  Net spend: ${result.admin_fields.net_spend.toFixed(2)}`);
  console.log(`  Gross spend: ${result.admin_fields.gross_spend.toFixed(2)}`);
  console.log(`  Margin: ${result.admin_fields.margin_percent.toFixed(2)}%`);
  console.log('  Optional counts: supply only when supported by the applicable rules and source');
  console.log(`  Audit comment: ${result.source} (${result.timezone}, ${result.date}), line items ${lineItems}; Net = Media + Vendor Fees + Bid Shading Fee; margin=${result.margin_percent.toFixed(2)}%`);
  console.log('\nGitHub comment draft:');
  console.log(`### ${result.date} FreeWheel spend`);
  console.log(`- Click URL #${result.click_url_id}; line items: ${lineItems}`);
  console.log(`- Source: ${result.source}, timezone: ${result.timezone}`);
  console.log(`- Impressions: ${raw.impressions.toLocaleString()}`);
  console.log(`- Media Spend: ${money(raw.media_spend)}; Vendor Fees: ${money(raw.vendor_fees)}; Bid Shading Fee: ${money(raw.bid_shading_fee)}`);
  console.log(`- Net Spend: ${money(result.net_spend)}`);
  console.log(`- Gross Spend: ${money(result.gross_spend)} (${result.margin_percent.toFixed(2)}% margin; Net / (1 - margin))`);
  console.log('- Admin status: not entered');
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(usage());
    process.exit(0);
  }
  const result = buildResult(args);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  console.error(usage());
  process.exitCode = 1;
}
