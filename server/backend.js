const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedWrites=new Set(['business_save','customer_save','item_save','invoice_save','invoice_issue','invoice_cancel','payment_add','payment_reverse']);
export class HttpError extends Error{constructor(message,status=400){super(message);this.status=status;}}
export function parseCookies(req){return Object.fromEntries(String(req.headers.cookie||'').split(';').filter(Boolean).map(s=>{const i=s.indexOf('=');return[s.slice(0,i).trim(),s.slice(i+1)];}));}
function isSecure(req){return req.headers['x-forwarded-proto']==='https'||!String(req.headers.host||'').startsWith('localhost')&&!String(req.headers.host||'').startsWith('terminal.local')&&!String(req.headers.host||'').startsWith('127.0.0.1');}
function cookies(res,session,req){
 const suffix=`; Path=/; HttpOnly; SameSite=Lax${isSecure(req)?'; Secure':''}`;
 res.setHeader('Set-Cookie',[
  `bn_access=${session?.access_token||''}; Max-Age=${session?3600:0}${suffix}`,
  `bn_refresh=${session?.refresh_token||''}; Max-Age=${session?60*60*24*30:0}${suffix}`
 ]);
}
function json(res,status,value){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value));}
export function checkOrigin(req){
 const host=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim();
 const origin=req.headers.origin;
 if(!origin||!['http://'+host,'https://'+host].includes(origin)||req.headers['sec-fetch-site']==='cross-site')throw new HttpError('Request origin was rejected.',403);
 if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new HttpError('Use a JSON request.',415);
}
async function readBody(req){
 let body=req.body;
 if(body===undefined){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>262144)throw new HttpError('The request is too large.',413);}try{body=raw?JSON.parse(raw):{};}catch{throw new HttpError('Invalid JSON request.');}}
 if(typeof body==='string'){try{body=JSON.parse(body);}catch{throw new HttpError('Invalid JSON request.');}}
 if(!body||typeof body!=='object'||Array.isArray(body)||Buffer.byteLength(JSON.stringify(body))>262144)throw new HttpError('Invalid request.');
 return body;
}
export async function upstream(path,{method='GET',body,token,headers={}}={}){
 const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
 if(!base||!key)throw new HttpError('The billing service is not configured yet.',503);
 const response=await fetch(base+path,{method,headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 let data;try{data=await response.json();}catch{data=null;}
 if(!response.ok){
  const msg=data?.msg||data?.error_description||data?.message||'The service could not complete this request.';
  const status=response.status===401?401:response.status===429?429:response.status>=500?502:400;
  throw new HttpError(msg,status);
 }
 return data;
}
async function session(req,res){
 const c=parseCookies(req);let token=c.bn_access;
 let expired=true;try{expired=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).exp*1000<Date.now()+60000;}catch{}
 if((!token||expired)&&c.bn_refresh){
  try{const next=await upstream('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:c.bn_refresh}});cookies(res,next,req);token=next.access_token;}catch(e){if(e.status===400||e.status===401){cookies(res,null,req);throw new HttpError('Your session has expired. Please sign in again.',401);}throw e;}
 }
 if(!token)throw new HttpError('Please sign in to continue.',401);
 try{const user=await upstream('/auth/v1/user',{token});if(!user?.id||user.is_anonymous)throw new HttpError('A registered account is required.',401);return{user,token};}
 catch(e){if(e.status===401)cookies(res,null,req);throw e;}
}
function businessId(params){const id=params.get('business_id');if(!uuid.test(id||''))throw new HttpError('Select a business first.');return id;}
function cleanSearch(value){return String(value||'').replace(/[^\p{L}\p{N}\s.@+\-]/gu,'').slice(0,100);}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Cookie');
 try{
  const url=new URL(req.url,'http://app.local'),params=url.searchParams,action=params.get('action')||'session';
  if(!['GET','POST'].includes(req.method))throw new HttpError('Method not allowed.',405);
  const write=req.method==='POST';if(write)checkOrigin(req);
  if(action==='health'&&!write){json(res,200,{ok:true,service:'BillBee',configured:Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_PUBLISHABLE_KEY)});return;}
  if(['signin','signup'].includes(action)){
   if(!write)throw new HttpError('Method not allowed.',405);
   const body=await readBody(req),email=String(body.email||'').trim(),password=String(body.password||'');
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||password.length<8||password.length>128)throw new HttpError('Enter a valid email and a password of 8–128 characters.');
   const path=action==='signin'?'/auth/v1/token?grant_type=password':'/auth/v1/signup';
   const data=await upstream(path,{method:'POST',body:{email,password}});
   if(data.access_token)cookies(res,data,req);
   json(res,200,{user:data.user?{id:data.user.id,email:data.user.email}:null,confirmation_required:!data.access_token});return;
  }
  if(action==='signout'){
   if(!write)throw new HttpError('Method not allowed.',405);
   const c=parseCookies(req);try{if(c.bn_access)await upstream('/auth/v1/logout?scope=local',{method:'POST',token:c.bn_access});}catch{}
   cookies(res,null,req);json(res,200,{ok:true});return;
  }
  if(write&&action!=='write')throw new HttpError('Unknown action.',404);
  const {user,token}=await session(req,res);
  if(action==='session'&&!write){json(res,200,{user:{id:user.id,email:user.email}});return;}
  if(action==='write'&&write){
   const body=await readBody(req);if(!allowedWrites.has(body.action))throw new HttpError('Unknown billing action.');
   const result=await upstream('/rest/v1/rpc/billing_action',{method:'POST',token,body:{p_action:body.action,p_data:body.data||{}}});json(res,200,{data:result});return;
  }
  if(write)throw new HttpError('Method not allowed.',405);
  if(action==='businesses'){const rows=await upstream('/rest/v1/businesses?select=*&order=created_at.asc',{token});json(res,200,{data:rows});return;}
  const bid=businessId(params);
  if(action==='workspace'){
   const [metrics,recent]=await Promise.all([
    upstream('/rest/v1/rpc/billing_dashboard',{method:'POST',token,body:{p_business_id:bid}}),
    upstream('/rest/v1/invoices?business_id=eq.'+bid+'&select=*&order=created_at.desc&limit=8',{token})
   ]);json(res,200,{metrics,recent});return;
  }
  if(action==='list'){
   const entity=params.get('entity');if(!['customers','catalog_items','payments'].includes(entity))throw new HttpError('Unknown list.');
   const limit=Math.max(1,Math.min(1000,Number(params.get('limit')||50))),page=Math.max(1,Math.min(10000,Number(params.get('page')||1)));
   if(!Number.isInteger(limit)||!Number.isInteger(page))throw new HttpError('Invalid page.');
   const q=new URLSearchParams({business_id:'eq.'+bid,select:entity==='payments'?'*,invoices(invoice_no,customer_snapshot)':'*',order:entity==='payments'?'payment_date.desc,created_at.desc':'name.asc',limit:String(limit+1),offset:String((page-1)*limit)});
   const search=cleanSearch(params.get('q'));if(search&&entity!=='payments')q.set('name','ilike.*'+search+'*');
   if(entity==='catalog_items'&&['product','service'].includes(params.get('kind')))q.set('kind','eq.'+params.get('kind'));
   if(entity==='catalog_items'&&params.get('active')==='true')q.set('active','eq.true');
   const rows=await upstream('/rest/v1/'+entity+'?'+q,{token});
   json(res,200,{data:rows.slice(0,limit),page,limit,has_more:rows.length>limit});return;
  }
  if(action==='invoices'){
   const result=await upstream('/rest/v1/rpc/billing_invoices',{method:'POST',token,body:{p_business_id:bid,p_page:Math.max(1,Math.min(10000,Number(params.get('page')||1))),p_status:params.get('status')||'all',p_query:cleanSearch(params.get('q'))}});json(res,200,result);return;
  }
  if(action==='invoice'){
   const id=params.get('id');if(!uuid.test(id||''))throw new HttpError('Invalid invoice.');
   const [rows,payments]=await Promise.all([
    upstream('/rest/v1/invoices?business_id=eq.'+bid+'&id=eq.'+id+'&select=*',{token}),
    upstream('/rest/v1/payments?business_id=eq.'+bid+'&invoice_id=eq.'+id+'&select=*&order=created_at.asc',{token})
   ]);if(!rows.length)throw new HttpError('Invoice not found.',404);json(res,200,{invoice:rows[0],payments});return;
  }
  if(action==='report'){
   const from=params.get('from'),to=params.get('to');if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||''))throw new HttpError('Choose a report date range.');
   json(res,200,await upstream('/rest/v1/rpc/billing_report',{method:'POST',token,body:{p_business_id:bid,p_from:from,p_to:to}}));return;
  }
  throw new HttpError('Unknown action.',404);
 }catch(e){
  const status=e instanceof HttpError?e.status:503;
  // Do not log session cookies, upstream response bodies or credentials.
  json(res,status,{error:e instanceof HttpError?e.message:'The service is temporarily unavailable. Please try again.'});
 }
}
