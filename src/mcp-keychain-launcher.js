#!/usr/bin/env node
import {execFileSync, spawn} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

const accounts = ['FEEDMOB_KEY', 'FEEDMOB_SECRET'];
const statuses = new Set(['environment','keychain','empty','not_found','access_denied','unavailable']);
const helper=fileURLToPath(new URL('./mcp-keychain-read.py',import.meta.url));

// The helper disables Keychain UI before any lookup; only its private pipe
// contains values. Neither helper output nor errors are written to logs/stdout.
export function withKeychainCredentials(env, lookup = () => JSON.parse(execFileSync('/usr/bin/python3',[helper],{env,encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:5000}))) {
  const result={...env}, state={}; let found;
  try {found=accounts.every(k=>env[k])?{values:{},status:{}}:lookup();} catch {found={values:{},status:{}};}
  for (const account of accounts) {
    if (env[account]) {state[account]='environment';continue;}
    const status=found?.status?.[account];
    if (status==='keychain' && typeof found?.values?.[account]==='string' && found.values[account]) {result[account]=found.values[account];state[account]='keychain';}
    else state[account]=statuses.has(status) && !['environment','keychain'].includes(status)?status:'unavailable';
  }
  result.KAZ_SPEND_CREDENTIAL_STATUS=JSON.stringify(state);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const child=spawn(process.execPath,[fileURLToPath(new URL('./mcp.js',import.meta.url))],{env:withKeychainCredentials(process.env),stdio:'inherit'});
  child.on('error',()=>{console.error('无法启动 Spend Toolbox 服务。');process.exitCode=1});
  child.on('exit',(code,signal)=>{if(signal){process.kill(process.pid,signal)}else process.exitCode=code??1});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
}
