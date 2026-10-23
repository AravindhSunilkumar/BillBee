import test from 'node:test';
import assert from 'node:assert/strict';
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
