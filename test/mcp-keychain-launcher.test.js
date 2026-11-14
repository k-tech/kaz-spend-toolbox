import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withKeychainCredentials} from '../src/mcp-keychain-launcher.js';

test('existing environment wins; helper may provide only the other named credential',()=>{
  let calls=0;
  const got=withKeychainCredentials({FEEDMOB_KEY:'example-env',OTHER:'keep'},()=>{calls++;return {values:{FEEDMOB_KEY:'ignored',FEEDMOB_SECRET:'example-secret'},status:{FEEDMOB_KEY:'keychain',FEEDMOB_SECRET:'keychain'}}});
  assert.equal(calls,1);assert.equal(got.FEEDMOB_KEY,'example-env');assert.equal(got.FEEDMOB_SECRET,'example-secret');assert.equal(got.OTHER,'keep');
  assert.deepEqual(JSON.parse(got.KAZ_SPEND_CREDENTIAL_STATUS),{FEEDMOB_KEY:'environment',FEEDMOB_SECRET:'keychain'});
});
test('both environment credentials avoid calling helper',()=>{
  const got=withKeychainCredentials({FEEDMOB_KEY:'a',FEEDMOB_SECRET:'b'},()=>{throw Error('unexpected')});
  assert.deepEqual(JSON.parse(got.KAZ_SPEND_CREDENTIAL_STATUS),{FEEDMOB_KEY:'environment',FEEDMOB_SECRET:'environment'});
});
test('denied, missing, malformed or unavailable results are safe and distinct',()=>{
  const a=withKeychainCredentials({},()=>({values:{},status:{FEEDMOB_KEY:'access_denied',FEEDMOB_SECRET:'not_found'}}));
  assert.deepEqual(JSON.parse(a.KAZ_SPEND_CREDENTIAL_STATUS),{FEEDMOB_KEY:'access_denied',FEEDMOB_SECRET:'not_found'});
  const b=withKeychainCredentials({},()=>{throw Error('private diagnostic')});
  assert.deepEqual(JSON.parse(b.KAZ_SPEND_CREDENTIAL_STATUS),{FEEDMOB_KEY:'unavailable',FEEDMOB_SECRET:'unavailable'});assert.ok(!JSON.stringify(b).includes('private diagnostic'));
  const c=withKeychainCredentials({},()=>({values:{OTHER:'not used'},status:{FEEDMOB_KEY:'keychain',FEEDMOB_SECRET:'unexpected'}}));
  assert.equal(c.FEEDMOB_KEY,undefined);assert.equal(c.OTHER,undefined);
});
