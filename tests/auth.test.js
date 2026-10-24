import test from 'node:test';
import assert from 'node:assert/strict';
import {authReturn} from '../public/auth.js';

test('expired email callbacks produce a useful error and clear authentication parameters',()=>{
 const result=authReturn('https://billing.example/?view=welcome#error=access_denied&error_code=otp_expired&error_description=untrusted-text');
 assert.equal(result.kind,'error');assert.match(result.message,/newest email/);assert.equal(result.cleanUrl,'/?view=welcome');assert.equal(JSON.stringify(result).includes('untrusted-text'),false);
});
test('PKCE codes are separated from the clean address and errors take priority',()=>{
 const result=authReturn('https://billing.example/?code=dummy-code&view=welcome');
 assert.equal(result.kind,'recovery');assert.equal(result.code,'dummy-code');assert.equal(result.cleanUrl,'/?view=welcome');
 const error=authReturn('https://billing.example/?code=dummy-code&error_code=otp_expired');assert.equal(error.kind,'error');assert.equal(error.code,undefined);
});
test('legacy callback tokens are never returned to application state',()=>{
 const result=authReturn('https://billing.example/#access_token=dummy-access&refresh_token=dummy-refresh&type=signup');
 assert.equal(result.kind,'confirmation');assert.equal(result.cleanUrl,'/');assert.equal(JSON.stringify(result).includes('dummy-access'),false);assert.equal(JSON.stringify(result).includes('dummy-refresh'),false);
 const recovery=authReturn('https://billing.example/#access_token=dummy-access&type=recovery');assert.equal(recovery.kind,'error');assert.match(recovery.message,/new password reset/);
});
test('ordinary application URLs stay outside authentication callback handling',()=>assert.deepEqual(authReturn('https://billing.example/#invoices'),{kind:'none'}));
