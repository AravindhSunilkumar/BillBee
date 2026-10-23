// Local-only UI harness. No authentication accounts or database records are created.
// This file is excluded from deployment; the production API remains server/backend.js.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {calculate,today} from '../public/billing.js';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const b={id:id(1),name:'QA Studio · interface test',owner_id:id(99),state_code:'32',registration:'regular',gstin:'32ABCDE1234F1Z5',address:'Example Road, Kochi 682001',phone:'0000000000',email:'qa@example.invalid',invoice_terms:'Thank you for your business.',bank_details:'Example payment details'};
const b2={...b,id:id(2),name:'QA Services · separate workspace',registration:'unregistered',gstin:''};
const customers=[{id:id(3),business_id:b.id,name:'Example Customer',address:'Example Customer Street, Kochi',state_code:'32',gstin:'',phone:'0000000000',email:'customer@example.invalid'}];
const items=[{id:id(4),business_id:b.id,name:'Office chair',kind:'product',sku:'CHAIR-01',hsn_sac:'9403',unit:'Nos',price_paise:500000,gst_rate_bps:1800,tax_treatment:'taxable',active:true},{id:id(5),business_id:b.id,name:'Design consultation',kind:'service',sku:'CONSULT-01',hsn_sac:'998313',unit:'Hour',price_paise:200000,gst_rate_bps:1800,tax_treatment:'taxable',active:true}];
const invoices=[],payments=[];let sequence=100;
function metrics(bid){const issued=invoices.filter(i=>i.business_id===bid&&i.status==='issued'),receipts=payments.filter(p=>p.business_id===bid&&!p.reversed_at),sum=(rows,key)=>rows.reduce((a,r)=>a+Number(r[key]||0),0);return{sales_month_paise:sum(issued,'total_paise'),collected_month_paise:sum(receipts,'amount_paise'),receivable_paise:sum(issued,'total_paise')-sum(issued,'paid_paise'),overdue_paise:0,issued_count:issued.length,draft_count:invoices.filter(i=>i.business_id===bid&&i.status==='draft').length,gst_month_paise:sum(issued,'tax_paise'),customers:customers.filter(c=>c.business_id===bid).length,items:items.filter(i=>i.business_id===bid).length,months:['May','Jun','Jul','Aug','Sep','Oct'].map((month,i)=>({month,total_paise:i===5?sum(issued,'total_paise'):0}))};}
function reply(res,obj,status=200){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(obj));}
const root=path.resolve('public');
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),p=url.searchParams,action=p.get('action'),bid=p.get('business_id');
  if(url.pathname.startsWith('/api')){
   if(req.method==='POST'){
    let raw='';for await(const part of req)raw+=part;const body=JSON.parse(raw||'{}'),d=body.data||{};let result;
    if(action==='signout')return reply(res,{ok:true});
    const biz=[b,b2].find(x=>x.id===d.business_id)||b;
    if(body.action==='customer_save'){result={...d,id:d.id||id(++sequence)};customers.push(result);}
    else if(body.action==='item_save'){result={...d,id:d.id||id(++sequence)};items.push(result);}
    else if(body.action==='invoice_save'){
     const c=customers.find(c=>c.id===d.customer_id),calc=calculate(d.lines,biz,d.place_of_supply);
     result={...d,...calc,id:d.id||id(++sequence),status:'draft',paid_paise:0,customer_snapshot:c,business_snapshot:biz,created_at:new Date().toISOString()};
     const index=invoices.findIndex(i=>i.id===result.id);if(index>=0)invoices[index]=result;else invoices.push(result);
    }else if(body.action==='invoice_issue'){result=invoices.find(i=>i.id===d.id);result.status='issued';result.invoice_no='INV/26-27/'+String(invoices.indexOf(result)+1).padStart(4,'0');}
    else if(body.action==='payment_add'){const inv=invoices.find(i=>i.id===d.id);result={...d,id:id(++sequence),invoice_id:inv.id,created_at:new Date().toISOString(),invoices:{invoice_no:inv.invoice_no,customer_snapshot:inv.customer_snapshot}};payments.push(result);inv.paid_paise+=Number(d.amount_paise);}
    else if(body.action==='payment_reverse'){result=payments.find(p=>p.id===d.id);result.reversed_at=new Date().toISOString();result.reversal_reason=d.reason;invoices.find(i=>i.id===result.invoice_id).paid_paise-=Number(result.amount_paise);}
    else if(body.action==='invoice_cancel'){result=invoices.find(i=>i.id===d.id);result.status='cancelled';result.cancellation_reason=d.reason;}
    else if(body.action==='business_save'){result=Object.assign(b,d);}
    else return reply(res,{error:'Unsupported UI harness action'},400);
    return reply(res,{data:result});
   }
   if(action==='session')return reply(res,{user:{id:id(99),email:'interface-test@example.invalid'}});
   if(action==='businesses')return reply(res,{data:[b,b2]});
   if(action==='workspace')return reply(res,{metrics:metrics(bid),recent:invoices.filter(i=>i.business_id===bid).slice(-8).reverse()});
   if(action==='list'){
    const entity=p.get('entity'),rows=({customers,catalog_items:items,payments}[entity]||[]).filter(x=>x.business_id===bid).filter(x=>!p.get('q')||x.name?.toLowerCase().includes(p.get('q').toLowerCase())).filter(x=>!['product','service'].includes(p.get('kind'))||x.kind===p.get('kind'));
    return reply(res,{data:rows,page:1,has_more:false});
   }
   if(action==='invoices'){const rows=invoices.filter(i=>i.business_id===bid).filter(i=>p.get('status')==='all'||!p.get('status')||i.status===p.get('status'));return reply(res,{data:rows,count:rows.length,page:1,page_size:30});}
   if(action==='invoice'){const inv=invoices.find(i=>i.id===p.get('id')&&i.business_id===bid);return inv?reply(res,{invoice:inv,payments:payments.filter(p=>p.invoice_id===inv.id)}):reply(res,{error:'Invoice not found'},404);}
   if(action==='report'){const rows=invoices.filter(i=>i.business_id===bid&&i.status==='issued'),summary={count:rows.length,total_paise:0,taxable_paise:0,cgst_paise:0,sgst_paise:0,igst_paise:0,paid_paise:0,due_paise:0};for(const i of rows){for(const key of ['total_paise','taxable_paise','cgst_paise','sgst_paise','igst_paise','paid_paise'])summary[key]+=Number(i[key]);summary.due_paise+=i.total_paise-i.paid_paise;}return reply(res,{rows,summary,receipts_in_period_paise:metrics(bid).collected_month_paise,truncated:false});}
   return reply(res,{error:'Not found'},404);
  }
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  const bytes=await fs.readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(bytes);
 }catch(error){reply(res,{error:error.message},400);}
}).listen(4173,'0.0.0.0',()=>console.log('Local interface harness ready. No real authentication or database writes.'));
