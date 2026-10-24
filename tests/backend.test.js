import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import handler,{checkOrigin} from '../server/backend.js';
const response=()=>({headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},end(v){this.body=JSON.parse(v);}});
const req=(extra={})=>({method:'GET',url:'/api/index?action=session',headers:{host:'billing.example'},...extra});
test('rejects cross-origin and non-JSON writes',()=>{
 assert.throws(()=>checkOrigin(req({headers:{host:'billing.example',origin:'https://attacker.example','content-type':'application/json'}})));
 assert.throws(()=>checkOrigin(req({headers:{host:'billing.example',origin:'https://billing.example','content-type':'text/plain'}})));
 assert.doesNotThrow(()=>checkOrigin(req({headers:{host:'billing.example',origin:'https://billing.example','content-type':'application/json'}})));
});
test('a fresh browser cannot read business data',async()=>{
 const res=response();await handler(req({url:'/api/index?action=businesses'}),res);assert.equal(res.statusCode,401);assert.match(res.body.error,/sign in/i);assert.equal(res.headers['cache-control'],'no-store, private');
});
test('rejects missing JSON origins before processing sign-in',async()=>{
 const res=response();await handler(req({method:'POST',url:'/api/index?action=signin',body:{email:'test@example.invalid',password:'password1'}}),res);assert.equal(res.statusCode,403);
});
test('sign-in keeps tokens in HttpOnly cookies and out of its JSON response',async()=>{
 const previousFetch=global.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_PUBLISHABLE_KEY;
 process.env.SUPABASE_URL='https://supabase.example';process.env.SUPABASE_PUBLISHABLE_KEY='test-public-key';
 global.fetch=async()=>new Response(JSON.stringify({access_token:'test-access',refresh_token:'test-refresh',user:{id:'test-user',email:'test@example.invalid'}}),{status:200});
 try{const res=response();await handler(req({method:'POST',url:'/api/index?action=signin',headers:{host:'billing.example',origin:'https://billing.example','content-type':'application/json'},body:{email:'test@example.invalid',password:'password1'}}),res);assert.equal(res.statusCode,200);assert.equal(JSON.stringify(res.body).includes('test-access'),false);assert.ok(res.headers['set-cookie'].every(c=>c.includes('HttpOnly')&&c.includes('SameSite=Lax')&&c.includes('Secure')));}
 finally{global.fetch=previousFetch;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_PUBLISHABLE_KEY;else process.env.SUPABASE_PUBLISHABLE_KEY=oldKey;}
});
test('method restrictions are applied without attempting authentication',async()=>{const res=response();await handler(req({method:'DELETE'}),res);assert.equal(res.statusCode,405);});

const authRequest=(action,body,headers={})=>req({method:'POST',url:'/api/index?action='+action,headers:{host:'billing.example',origin:'https://billing.example','content-type':'application/json',...headers},body});
async function withAuthUpstream(mock,run){
 const previousFetch=global.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_PUBLISHABLE_KEY;
 process.env.SUPABASE_URL='https://supabase.example';process.env.SUPABASE_PUBLISHABLE_KEY='test-public-key';global.fetch=mock;
 try{await run();}finally{global.fetch=previousFetch;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_PUBLISHABLE_KEY;else process.env.SUPABASE_PUBLISHABLE_KEY=oldKey;}
}
test('email recovery requires a same-origin POST and a valid email before contacting Auth',async()=>{
 await withAuthUpstream(()=>{throw new Error('Unexpected upstream request');},async()=>{
  for(const action of ['resend_confirmation','password_reset_request','auth_code_exchange','password_update']){const res=response();await handler(req({url:'/api/index?action='+action}),res);assert.equal(res.statusCode,405);}
  const crossOrigin=response();await handler(authRequest('password_reset_request',{email:'test@example.invalid'},{origin:'https://attacker.example'}),crossOrigin);assert.equal(crossOrigin.statusCode,403);
  const invalid=response();await handler(authRequest('resend_confirmation',{email:'invalid'}),invalid);assert.equal(invalid.statusCode,400);
 });
});
test('resending confirmation uses the signup flow and the request origin rather than a supplied redirect',async()=>{
 let requested;
 await withAuthUpstream(async(url,options)=>{requested={url,body:JSON.parse(options.body)};return new Response('{}',{status:200});},async()=>{
  const res=response();await handler(authRequest('resend_confirmation',{email:'test@example.invalid',redirect_to:'https://attacker.example'}),res);
  assert.equal(res.statusCode,200);assert.deepEqual(res.body,{ok:true});assert.deepEqual(requested.body,{type:'signup',email:'test@example.invalid'});
  assert.equal(new URL(requested.url).searchParams.get('redirect_to'),'https://billing.example/');
 });
});
test('password reset binds the emailed code to a private S256 verifier cookie',async()=>{
 let requested;
 await withAuthUpstream(async(url,options)=>{requested={url,body:JSON.parse(options.body)};return new Response('{}',{status:200});},async()=>{
  const res=response();await handler(authRequest('password_reset_request',{email:'test@example.invalid'}),res);
  assert.equal(res.statusCode,200);assert.match(requested.url,/\/auth\/v1\/recover\?/);
  const cookie=res.headers['set-cookie'][0],verifier=cookie.match(/^bn_recovery=([^;]+)/)[1];
  assert.match(cookie,/HttpOnly; SameSite=Lax; Secure/);assert.equal(requested.body.code_challenge_method,'s256');
  assert.equal(requested.body.code_challenge,createHash('sha256').update(verifier).digest('base64url'));
  assert.equal(JSON.stringify(res.body).includes(verifier),false);
 });
});
test('a reset code from another browser cannot be exchanged without the verifier',async()=>{
 await withAuthUpstream(()=>{throw new Error('Unexpected upstream request');},async()=>{
  const res=response();await handler(authRequest('auth_code_exchange',{code:'dummy-code'}),res);assert.equal(res.statusCode,400);assert.match(res.body.error,/same browser/);
 });
});
test('verified recovery codes create HttpOnly sessions without returning tokens to the browser script',async()=>{
 const verifier='a'.repeat(64);let requested;
 await withAuthUpstream(async(url,options)=>{requested={url,body:JSON.parse(options.body)};return new Response(JSON.stringify({access_token:'dummy-access',refresh_token:'dummy-refresh',user:{id:'test-user',email:'test@example.invalid'}}),{status:200});},async()=>{
  const res=response();await handler(authRequest('auth_code_exchange',{code:'dummy-code'},{cookie:'bn_recovery='+verifier}),res);
  assert.equal(res.statusCode,200);assert.equal(new URL(requested.url).searchParams.get('grant_type'),'pkce');assert.deepEqual(requested.body,{auth_code:'dummy-code',code_verifier:verifier});
  assert.equal(JSON.stringify(res.body).includes('dummy-access'),false);assert.equal(JSON.stringify(res.body).includes('dummy-refresh'),false);
  assert.equal(res.headers['set-cookie'].length,3);assert.ok(res.headers['set-cookie'].every(cookie=>cookie.includes('HttpOnly')&&cookie.includes('Secure')));assert.ok(res.headers['set-cookie'].some(cookie=>cookie.startsWith('bn_recovery=; Max-Age=0')));
 });
});
test('password changes require an authenticated registered user and target only that user',async()=>{
 const unauthenticated=response();await handler(authRequest('password_update',{password:'new-password-for-test'}),unauthenticated);assert.equal(unauthenticated.statusCode,401);
 const token='header.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature';
 let update;
 await withAuthUpstream(async(url,options)=>{
  if(options.method==='PUT'){update={url,body:JSON.parse(options.body),authorization:options.headers.Authorization};return new Response(JSON.stringify({id:'test-user'}),{status:200});}
  return new Response(JSON.stringify({id:'test-user',is_anonymous:false}),{status:200});
 },async()=>{
  const res=response();await handler(authRequest('password_update',{password:'new-password-for-test',user_id:'someone-else'},{cookie:'bn_access='+token}),res);
  assert.equal(res.statusCode,200);assert.equal(update.url,'https://supabase.example/auth/v1/user');assert.deepEqual(update.body,{password:'new-password-for-test'});assert.equal(update.authorization,'Bearer '+token);
 });
});
