import {authReturn} from './auth.js';
import {STATES,DOCUMENTS,money,compactMoney,today,stateName,stateTaxName,esc as e,decimalInt,decimalValue,calculate,invoiceStatus,csv,uuidv4} from './billing.js';
import {icon,brand,initials,status,date,empty,loading,field,textarea,select,search,pagination,invoiceTable,invoicePaper} from './ui.js';

const app=document.querySelector('#app'),modal=document.querySelector('#modal');
const s={user:null,businesses:[],bid:null,page:'overview',rows:[],query:'',pageNo:1,filter:'all',kind:'all',nav:0,editor:null,options:{customers:[],items:[]},detail:null,report:null,reportFrom:today().slice(0,7)+'-01',reportTo:today(),authMode:'signin',authEmail:'',busy:false};
const business=()=>s.businesses.find(b=>b.id===s.bid);
const labels={overview:'Overview',invoices:'Invoices',customers:'Customers',catalog:'Products & services',payments:'Payments',reports:'Reports',settings:'Settings',editor:'New invoice',detail:'Invoice details'};
const navItems=[['overview','grid'],['invoices','invoice'],['customers','people'],['catalog','box'],['payments','wallet'],['reports','chart'],['settings','settings']];
function resetAccount(){s.nav++;listSequence++;paymentChoiceSeq++;reportSeq++;s.user=null;s.businesses=[];s.bid=null;s.editor=null;s.detail=null;s.options={customers:[],items:[]};s.report=null;s.rows=[];paymentChoices=[];document.querySelector('#print-root').innerHTML='';if(modal.open)modal.close();modal.innerHTML='';}
function toast(text,error=false){const t=document.createElement('div');t.className='toast'+(error?' error':'');t.textContent=text;document.querySelector('#toasts').append(t);setTimeout(()=>t.remove(),6000);}
async function api(action,params={},body){
 const query=new URLSearchParams({action,...Object.fromEntries(Object.entries(params).filter(([,v])=>v!==undefined&&v!==null))});
 const response=await fetch('/api/index?'+query,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin',signal:AbortSignal.timeout(30000)});
 let data;try{data=await response.json();}catch{throw new Error('The billing service did not respond. Please try again.');}
 if(!response.ok){if(response.status===401&&s.user){resetAccount();renderAuth();}throw new Error(data.error||'Please try again.');}
 return data;
}
const write=(action,data)=>api('write',{}, {action,data:{business_id:s.bid,...data}}).then(r=>r.data);
function formData(form){return Object.fromEntries(new FormData(form).entries());}
function showModal(title,html,{wide=false}={}){if(modal.open)modal.close();modal.className=wide?'wide':'';modal.innerHTML=`<div class="modal-header"><h2>${e(title)}</h2><button class="icon-btn" data-action="close-modal" aria-label="Close">${icon('close')}</button></div><div class="modal-body"><div id="modal-error" class="form-error hidden" role="alert"></div>${html}</div>`;modal.showModal();}
function modalError(error){const box=document.querySelector('#modal-error');if(box){box.textContent=error.message||error;box.classList.remove('hidden');}else toast(error.message||error,true);}
const modalFooter=(label='Save')=>`<div class="modal-footer"><button type="button" class="btn" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">${e(label)}</button></div>`;
async function withForm(form,fn){const buttons=[...form.querySelectorAll('button[type=submit]')];buttons.forEach(b=>b.disabled=true);form.querySelectorAll('.form-error').forEach(x=>x.classList.add('hidden'));try{await fn();}catch(error){if(form.closest('dialog'))modalError(error);else{const box=form.querySelector('.form-error');if(box){box.textContent=error.message;box.classList.remove('hidden');}else toast(error.message,true);}}finally{buttons.forEach(b=>b.disabled=false);}}
function renderAuth(mode=s.authMode,message='',isError=false){
 s.authMode=mode;
 const copy={signin:['Welcome back.','Sign in to pick up where you left off.','Sign in'],signup:['Make room for growth.','Create your account. Set up your business next.','Create account'],confirm:['Confirm your email.','Request a fresh confirmation link for your BillBee account.','Resend confirmation email'],recover:['Reset your password.','Request a password reset for your BillBee account.','Send reset email'],reset:['Choose a new password.','Your reset link has been verified. Set your new BillBee password.','Save new password']}[mode];
 const emailOnly=['confirm','recover'].includes(mode),newPassword=['signup','reset'].includes(mode);
 const emailInput=mode==='reset'?`<p class="fine">${e(s.user?.email||'')}</p>`:field('Email address','email',s.authEmail,{type:'email',required:true,placeholder:'you@business.com',maxlength:254});
 const passwordInput=emailOnly?'':`<label class="field">${mode==='reset'?'New password':'Password'}<div class="password-wrap"><input name="password" id="auth-password" type="password" required minlength="8" maxlength="128" placeholder="At least 8 characters" autocomplete="${newPassword?'new-password':'current-password'}"><button type="button" class="icon-btn" data-action="toggle-password" aria-label="Show password">${icon('eye')}</button></div></label>${mode==='reset'?'<label class="field">Confirm new password<input name="password_confirm" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label>':''}`;
 const switchLink=['signin','signup'].includes(mode)?`<div class="switch">${mode==='signup'?'Already have an account?':'New to BillBee?'} <button class="btn link" data-action="auth-toggle">${mode==='signup'?'Sign in':'Create an account'}</button></div>`:`<div class="switch"><button class="btn link" data-action="auth-mode" data-mode="signin">Back to sign in</button></div>`;
 const helpLinks=mode==='signin'?`<div class="switch"><button class="btn link" data-action="auth-mode" data-mode="recover">Forgot password?</button><button class="btn link" data-action="auth-mode" data-mode="confirm">Resend confirmation email</button></div>`:'';
 const fine=mode==='recover'?'Open the newest reset email in this same browser. Keep this browser available until your password is updated.':mode==='confirm'?'Use only the newest confirmation email. After confirming, return here to sign in.':mode==='signup'?'Confirm your email before signing in. If you already have an account, use Sign in or Forgot password.':'A clear view of your invoices, payments and customers. One workspace at a time.';
 app.innerHTML=`<main class="auth"><section class="auth-story">${brand()}<div class="auth-copy"><span class="eyebrow">${icon('spark')} A little less admin</span><h1>Less paperwork.<br><em>More business.</em></h1><p>From your first sale to your next milestone. Give every business a better way to bill.</p></div><div class="auth-sample" aria-label="Example invoice illustration"><div class="auth-sample-head"><div><span class="caps muted">Example invoice</span><h3 style="margin-top:4px">A good day's work.</h3></div><span class="avatar">${icon('check')}</span></div><div class="sample-line"><span>Products & services</span><span>₹10,000.00</span></div><div class="sample-line"><span>GST · example rate</span><span>₹1,800.00</span></div><div class="sample-line sample-total"><strong>Total</strong><strong style="color:#365e2e">₹11,800.00</strong></div></div><div class="auth-foot">PRODUCTS + SERVICES &nbsp; / &nbsp; MADE FOR YOUR EVERYDAY</div></section><section class="auth-main"><div class="auth-box"><div class="auth-mobile-brand">${brand()}</div><div class="caps">Your business, together</div><h2>${copy[0]}</h2><p>${copy[1]}</p>${message?`<div class="${isError?'form-error':'notice'}" role="${isError?'alert':'status'}" style="margin-top:22px">${e(message)}</div>`:''}<form id="auth-form"><div class="form-error hidden" role="alert"></div>${emailInput}${passwordInput}<button type="submit" class="btn primary block">${copy[2]}${icon('arrow')}</button></form>${switchLink}${helpLinks}<p class="fine">${fine}</p></div></section></main>`;
}
function businessFields(b={}){
 return `<div class="form-grid">${field('Business / legal name','name',b.name||'',{required:true,full:true,placeholder:'Your business name',maxlength:120})}${select('State / union territory','state_code',b.state_code||'', [['','Select a state'],...STATES],{required:true})}${select('GST registration','registration',b.registration||'unregistered',[['unregistered','Not registered under GST'],['regular','Regular GST registered'],['composition','Composition scheme']])}${field('GSTIN','gstin',b.gstin||'',{placeholder:'Required for a registered business',maxlength:15,hint:'Must match the state selected above.'})}${field('Business phone','phone',b.phone||'',{type:'tel',maxlength:40})}${field('Business email','email',b.email||s.user?.email||'',{type:'email',full:true,maxlength:200})}${textarea('Business address','address',b.address||'',{required:true,full:true,maxlength:1000,placeholder:'Building, street, city and PIN code'})}${textarea('Bank / payment details','bank_details',b.bank_details||'',{full:true,maxlength:1000,placeholder:'Bank name, account number, IFSC or UPI ID (optional)'})}${textarea('Default invoice terms','invoice_terms',b.invoice_terms??'Thank you for your business.',{full:true})}</div>`;
}
function renderSetup(){
 app.innerHTML=`<main class="setup">${brand()}<div class="setup-header"><span class="caps muted">A fresh start</span><h1 style="margin-top:12px">Let's set up your business.</h1><p>Your invoices will use these details. You can update them anytime.</p></div><div class="setup-steps"><span class="active"><span class="step-num">1</span>Business details</span><span><span class="step-num">2</span>Add customers & items</span><span><span class="step-num">3</span>First invoice</span></div><div class="panel"><div class="panel-body"><form id="setup-form"><div class="form-error hidden" role="alert"></div>${businessFields()}<div class="modal-footer"><button type="button" class="btn" data-action="signout">Sign out</button><button type="submit" class="btn primary">Create business${icon('arrow')}</button></div></form></div></div><p class="footnote">Another business can have its own workspace and separate records.</p></main>`;
}
async function loadBusinesses(preferred){
 const response=await api('businesses');s.businesses=response.data;
 if(!s.businesses.length){renderSetup();return;}
 const stored=preferred||s.bid||localStorage.getItem('billbee:business:'+s.user.id);
 s.bid=s.businesses.some(b=>b.id===stored)?stored:s.businesses[0].id;
 localStorage.setItem('billbee:business:'+s.user.id,s.bid);
 await navigate('overview');
}
function shell(){
 const b=business();
 app.innerHTML=`<div class="mobile-overlay" data-action="close-menu"></div><aside class="sidebar">${brand()}<div class="workspace"><div class="workspace-label">Your workspace</div><select id="business-switch" aria-label="Switch business">${s.businesses.map(x=>`<option value="${x.id}" ${x.id===s.bid?'selected':''}>${e(x.name)}</option>`).join('')}<option value="new">＋ Add a business</option></select></div><div class="nav-group-title">Business</div><nav class="nav" aria-label="Main navigation">${navItems.map(([key,ic])=>`<button data-nav="${key}" class="${s.page===key||(key==='invoices'&&['editor','detail'].includes(s.page))?'active':''}">${icon(ic)}${labels[key]}</button>`).join('')}</nav><div class="sidebar-bottom"><div class="help-card"><h4>A smoother start.</h4><p>A few simple steps to your first invoice.</p><button class="btn link" data-action="setup-guide">Open setup guide ${icon('arrow')}</button></div><div class="account"><span class="avatar">${initials(s.user.email)}</span><div class="grow"><strong>Your account</strong><div class="email" title="${e(s.user.email)}">${e(s.user.email)}</div></div><button class="icon-btn" data-action="signout" aria-label="Sign out">${icon('logout')}</button></div></div></aside><main class="main"><header class="topbar"><div class="row"><button class="icon-btn mobile-menu" data-action="open-menu" aria-label="Open navigation">${icon('menu')}</button><div class="breadcrumb"><span>${e(b.name)}</span>${icon('chevron')}<strong>${labels[s.page]}</strong></div></div><div class="topbar-right"><span class="date">${date(today())}</span><button class="btn primary" data-action="new-invoice">${icon('plus')}New invoice</button></div></header><div id="content" class="content"></div></main>`;
}
function heading(title,subtitle,action,label,ic='plus'){return `<div class="page-heading"><div><h1>${e(title)}</h1><p>${e(subtitle)}</p></div>${action?`<button class="btn primary" data-action="${action}">${icon(ic)}${e(label)}</button>`:''}</div>`;}
function foot(){return '<div class="footnote">A little less paperwork. <span class="footer-brand">A little more BillBee.</span></div>';}
async function navigate(page,{reset=true,id}={}){
 if(!s.user)return renderAuth();
 if(!business())return renderSetup();
 if(s.busy)return;
 if(s.page==='editor'&&page!=='editor'&&s.editor?.dirty){if(!confirm('Leave this page and discard unsaved invoice changes?'))return;s.editor=null;}
 s.page=page;if(reset){s.query='';s.pageNo=1;s.filter='all';s.kind='all';}
 const nav=++s.nav,bid=s.bid;shell();const content=document.querySelector('#content');content.innerHTML=loading();
 try{
  if(page==='overview'){const data=await api('workspace',{business_id:bid});if(nav!==s.nav||bid!==s.bid)return;renderOverview(data);}
  else if(['invoices','customers','catalog','payments'].includes(page)){renderListFrame();await loadList();}
  else if(page==='settings'){content.innerHTML=heading('Business settings','The details that make every invoice yours.')+`<div class="settings-wrap"><form id="business-form" class="settings-form"><div class="panel"><div class="panel-head"><h2>Business profile</h2><span class="badge">${business().registration==='unregistered'?'Non-GST':'GST registered'}</span></div><div class="panel-body"><div class="form-error hidden" role="alert"></div>${businessFields(business())}<div class="modal-footer"><button type="submit" class="btn primary">Save changes</button></div></div></div><div class="notice warning" style="margin-top:20px">${icon('help')}<span>Standard domestic billing is supported. IRN generation, e-way bills, exports and reverse-charge documents are not connected in this first release.</span></div></form></div>`;}
  else if(page==='editor'){await loadOptions();if(nav!==s.nav||bid!==s.bid)return;renderEditor();}
  else if(page==='detail'){const detail=await api('invoice',{business_id:bid,id:id||s.detail?.invoice.id});if(nav!==s.nav||bid!==s.bid)return;s.detail=detail;renderDetail();}
  else if(page==='reports'){renderReportFrame();await loadReport();}
 }catch(error){if(nav===s.nav&&s.user){content.innerHTML=`<div class="panel">${empty('We could not load this page',error.message,'retry-page','Try again','refresh')}</div>`;} }
}
function renderOverview({metrics:m,recent}){
 const max=Math.max(...m.months.map(x=>Number(x.total_paise)),10000),metricCards=[['Sales this month',m.sales_month_paise,'Issued invoices · including GST','chart',true],['Collected this month',m.collected_month_paise,'Receipts by payment date','wallet'],['Outstanding balance',m.receivable_paise,'All unpaid invoice balances','invoice'],['Overdue amount',m.overdue_paise,'Past their payment due date','clock']];
 const monthTitle=new Intl.DateTimeFormat('en-IN',{month:'long',year:'numeric'}).format(new Date());
 document.querySelector('#content').innerHTML=heading('Your business, at a glance.','A clear picture of where things stand today.')+`${Number(m.issued_count)===0?`<div class="banner"><div><strong>Good things start with a first invoice.</strong><p>Add a customer and a product or service, then make it official.</p></div><button class="btn soft small" data-action="setup-guide">Get started ${icon('arrow')}</button></div>`:''}<div class="stats">${metricCards.map(([label,value,note,ic,featured])=>`<div class="stat ${featured?'featured':''}"><div class="stat-label">${label}${icon(ic)}</div><div class="stat-value num">${money(value)}</div><div class="stat-note">${note}</div></div>`).join('')}</div><div class="dashboard-grid"><div class="panel chart-panel"><div class="panel-head"><div><h2>Sales overview</h2><p class="subtext">Your last six months, in view</p></div><span class="legend">Invoice value</span></div><div class="chart-area" role="img" aria-label="Monthly invoice sales: ${m.months.map(x=>e(x.month)+' '+money(x.total_paise)).join(', ')}"><div class="chart-scale"><span>${compactMoney(max)}</span><span>${compactMoney(max/2)}</span><span>₹0</span></div><div class="chart-bars">${m.months.map(x=>`<div class="bar-col" title="${e(x.month)}: ${money(x.total_paise)}"><div class="bar" style="height:${Math.max(1,Number(x.total_paise)/max*100)}%"></div><span class="bar-label">${e(x.month)}</span></div>`).join('')}</div></div><div class="chart-note">Issued invoices including GST. Cancelled invoices and drafts are excluded.</div></div><div class="panel setup-card">${icon('leaf')}<h2>A little room<br>for big plans.</h2><p>Your customers and catalogue, ready whenever you are.</p><div class="setup-metrics"><div><strong>${m.customers}</strong><span>Customers</span></div><div><strong>${m.items}</strong><span>Products & services</span></div></div><button class="btn" data-nav="catalog">Manage catalogue ${icon('arrow')}</button></div></div><div class="panel"><div class="panel-head"><div><h2>Recent invoices</h2><p class="subtext">The latest from your business</p></div><button class="btn link small" data-nav="invoices">View all ${icon('arrow')}</button></div>${invoiceTable(recent)}</div><div class="row between" style="margin-top:17px"><span class="hint">${e(monthTitle)} · GST on issued invoices: ${money(m.gst_month_paise)}</span><span class="hint">${m.draft_count} draft${Number(m.draft_count)===1?'':'s'}</span></div>${foot()}`;
}
function renderListFrame(){
 const page=s.page,info={invoices:['Invoices','From first draft to final payment.','new-invoice','Create invoice'],customers:['Customers','Good relationships start with the right details.','new-customer','Add customer'],catalog:['Products & services','Everything you sell, ready to bill.','new-item','Add item'],payments:['Payments','Track what came in and what it was for.','choose-payment','Record payment']}[page];
 const statusOptions=['all','draft','unpaid','partial','overdue','paid','cancelled'];
 document.querySelector('#content').innerHTML=heading(...info)+`<div class="panel"><div class="toolbar">${page==='payments'?`<div class="row">${icon('wallet')}<span class="hint">Payment history · includes reversals</span></div>`:search(page==='invoices'?'Search invoice or customer…':page==='catalog'?'Search items…':'Search customers…',s.query)}${page==='invoices'?`<select id="invoice-filter" aria-label="Filter invoices">${statusOptions.map(x=>`<option value="${x}" ${s.filter===x?'selected':''}>${x==='all'?'All invoices':x[0].toUpperCase()+x.slice(1)}</option>`).join('')}</select>`:page==='catalog'?`<select id="kind-filter" aria-label="Item type"><option value="all">All items</option><option value="product" ${s.kind==='product'?'selected':''}>Products</option><option value="service" ${s.kind==='service'?'selected':''}>Services</option></select>`:`<span class="hint">${page==='customers'?'Saved for this business':page==='catalog'?'Prices exclude GST':''}</span>`}</div><div id="table-slot">${loading()}</div></div>${foot()}`;
}
let listSequence=0;
async function loadList(){
 const seq=++listSequence,page=s.page,bid=s.bid,slot=document.querySelector('#table-slot');if(!slot)return;
 try{
  let result;
  if(page==='invoices')result=await api('invoices',{business_id:bid,page:s.pageNo,status:s.filter,q:s.query});
  else result=await api('list',{business_id:bid,entity:{customers:'customers',catalog:'catalog_items',payments:'payments'}[page],page:s.pageNo,limit:30,q:s.query,kind:s.kind});
  if(seq!==listSequence||page!==s.page||bid!==s.bid)return;
  s.rows=result.data;
  if(page==='invoices')slot.innerHTML=invoiceTable(result.data)+pagination(s.pageNo,s.pageNo*30<result.count,result.count);
  else if(page==='customers')slot.innerHTML=customerTable(result.data)+pagination(s.pageNo,result.has_more);
  else if(page==='catalog')slot.innerHTML=catalogTable(result.data)+pagination(s.pageNo,result.has_more);
  else slot.innerHTML=paymentsTable(result.data)+pagination(s.pageNo,result.has_more);
 }catch(error){if(seq===listSequence&&s.user)slot.innerHTML=empty('Could not load records',error.message,'retry-list','Try again','refresh');}
}
function customerTable(rows){
 if(!rows.length)return empty(s.query?'No matching customers':'Meet your first customer',s.query?'Try another name.':'Add customer details once. They will be ready for every invoice.','new-customer','Add customer','people');
 return `<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Contact</th><th>GSTIN</th><th>State</th><th></th></tr></thead><tbody>${rows.map(c=>`<tr><td><div class="row"><span class="avatar">${initials(c.name)}</span><span class="table-title">${e(c.name)}</span></div></td><td>${e(c.email||'—')}<div class="subtext">${e(c.phone)}</div></td><td class="muted">${e(c.gstin||'Not registered')}</td><td class="muted">${e(stateName(c.state_code))}</td><td class="right"><button class="icon-btn" data-action="edit-customer" data-id="${c.id}" aria-label="Edit customer">${icon('edit')}</button></td></tr>`).join('')}</tbody></table></div>`;
}
function catalogTable(rows){
 if(!rows.length)return empty(s.query?'No matching items':'Your catalogue starts here',s.query?'Try a different item name.':'Add your products and services with their prices and tax details.','new-item','Add item','box');
 return `<div class="table-wrap"><table><thead><tr><th>Item</th><th>Type</th><th>HSN/SAC</th><th class="right">Price</th><th>GST</th><th></th></tr></thead><tbody>${rows.map(it=>`<tr><td><div class="row"><span class="avatar ${it.kind==='service'?'blue':''}">${icon(it.kind==='service'?'spark':'box')}</span><div><span class="table-title">${e(it.name)}</span><div class="subtext">${e(it.sku||it.unit)} ${!it.active?'· Archived':''}</div></div></div></td><td><span class="badge">${e(it.kind)}</span></td><td class="muted">${e(it.hsn_sac||'—')}</td><td class="right num table-title">${money(it.price_paise)}<div class="subtext">per ${e(it.unit)}</div></td><td class="muted">${it.tax_treatment==='taxable'?Number(it.gst_rate_bps)/100+'%':e(it.tax_treatment.replaceAll('_',' '))}</td><td class="right"><button class="icon-btn" data-action="edit-item" data-id="${it.id}" aria-label="Edit item">${icon('edit')}</button></td></tr>`).join('')}</tbody></table></div>`;
}
function paymentsTable(rows){
 if(!rows.length)return empty('Every payment, accounted for.','Record a receipt against an issued invoice to see it here.','choose-payment','Record payment','wallet');
 return `<div class="table-wrap"><table><thead><tr><th>Invoice / customer</th><th>Date</th><th>Method / reference</th><th class="right">Amount</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(p=>`<tr><td><button class="btn link" data-action="view-invoice" data-id="${p.invoice_id}">${e(p.invoices?.invoice_no||'View invoice')}</button><div class="subtext">${e(p.invoices?.customer_snapshot?.name||'')}</div></td><td class="muted">${date(p.payment_date)}</td><td><span class="table-title" style="text-transform:capitalize">${e(p.method)}</span><div class="subtext">${e(p.reference||'—')}</div></td><td class="right num table-title">${money(p.amount_paise)}</td><td><span class="badge ${p.reversed_at?'cancelled':'paid'}">${p.reversed_at?'Reversed':'Received'}</span></td><td>${!p.reversed_at?`<button class="icon-btn" data-action="reverse-payment" data-id="${p.id}" aria-label="Reverse payment">${icon('refresh')}</button>`:''}</td></tr>`).join('')}</tbody></table></div>`;
}
function customerModal(c={}){
 showModal(c.id?'Edit customer':'Add a customer',`<form id="customer-form" data-id="${c.id||''}"><div class="form-grid">${field('Customer name','name',c.name||'',{required:true,full:true,maxlength:120})}${field('Email','email',c.email||'',{type:'email',maxlength:200})}${field('Phone','phone',c.phone||'',{type:'tel',maxlength:40})}${select('State / union territory','state_code',c.state_code||business().state_code,STATES)}${field('GSTIN (optional)','gstin',c.gstin||'',{maxlength:15,placeholder:'For a GST-registered customer'})}${textarea('Billing address','address',c.address||'',{required:true,full:true,maxlength:1000,placeholder:'Street, city and PIN code'})}</div>${modalFooter(c.id?'Save changes':'Add customer')}</form>`);
}
function itemModal(it={}){
 showModal(it.id?'Edit item':'Add a product or service',`<form id="item-form" data-id="${it.id||''}"><div class="form-grid">${field('Item name','name',it.name||'',{required:true,full:true,maxlength:180})}${select('Item type','kind',it.kind||'product',[['product','Product'],['service','Service']])}${field('SKU / reference (optional)','sku',it.sku||'',{maxlength:80})}${field('Unit','unit',it.unit||'Nos',{required:true,placeholder:'Nos, Hour, Job, Kg…',maxlength:30})}${field('HSN / SAC','hsn_sac',it.hsn_sac||'',{placeholder:'4–8 digit HSN / 6 digit SAC',maxlength:8})}${field('Unit price ₹ (before GST)','price',decimalValue(it.price_paise||0),{required:true,type:'number',min:0,step:'0.01'})}${select('Tax treatment','tax_treatment',it.tax_treatment||'taxable',[['taxable','Taxable'],['exempt','Exempt'],['nil_rated','Nil rated'],['non_gst','Outside GST']])}${field('Applicable GST rate %','gst_rate',decimalValue(it.gst_rate_bps||0),{required:true,type:'number',min:0,max:100,step:'0.01',hint:'Enter the rate applicable to this item.'})}${select('Catalogue status','active',it.active===false?'false':'true',[['true','Active'],['false','Archived']])}</div><div class="hint" style="margin-top:15px">Non-taxable treatments use a 0% rate. Non-GST and composition businesses do not charge GST.</div>${modalFooter(it.id?'Save changes':'Add item')}</form>`);
}
function newBusinessModal(){showModal('Add another business',`<form id="business-modal-form">${businessFields()}${modalFooter('Create business')}</form>`,{wide:true});}
async function loadOptions(){
 const bid=s.bid;const [customers,items]=await Promise.all([api('list',{business_id:bid,entity:'customers',limit:1000}),api('list',{business_id:bid,entity:'catalog_items',limit:1000,active:true})]);
 if(bid===s.bid)s.options={customers:customers.data,items:items.data};
}
function newLine(l={}){return {item_id:l.item_id||'',description:l.description||'',kind:l.kind||'product',hsn_sac:l.hsn_sac||'',unit:l.unit||'Nos',quantity:l.quantity_milli?String(Number(l.quantity_milli)/1000):'1',price:decimalValue(l.price_paise||0),discount:decimalValue(l.discount_bps||0),gst_rate:decimalValue(l.gst_rate_bps||0),tax_treatment:l.tax_treatment||'taxable'};}
async function newInvoice(){
 if(s.busy)return;
 if(s.editor?.dirty&&!confirm('Start a new invoice and discard unsaved changes?'))return;
 s.editor={id:null,client_key:uuidv4(),customer_id:'',issue_date:today(),due_date:today(),place_of_supply:business().state_code,notes:'',terms:business().invoice_terms,lines:[newLine()],dirty:false};
 await navigate('editor');
}
function editorPayload(){
 const ed=s.editor;if(!ed)throw new Error('Open an invoice first.');
 const lines=ed.lines.map(l=>({item_id:l.item_id||null,description:l.description,kind:l.kind,hsn_sac:l.hsn_sac,unit:l.unit,quantity_milli:decimalInt(l.quantity,3),price_paise:decimalInt(l.price),discount_bps:decimalInt(l.discount),gst_rate_bps:decimalInt(l.gst_rate),tax_treatment:l.tax_treatment}));
 return{id:ed.id,client_key:ed.client_key,customer_id:ed.customer_id,issue_date:ed.issue_date,due_date:ed.due_date,place_of_supply:ed.place_of_supply,notes:ed.notes,terms:ed.terms,lines};
}
function renderEditor(){
 if(!s.editor)return newInvoice();
 const ed=s.editor,b=business(),customer=s.options.customers.find(c=>c.id===ed.customer_id);
 document.querySelector('#content').innerHTML=heading(ed.id?'Edit draft invoice':'Make it a good invoice.','Products, services, or a little of both. Prices are before GST.')+`<form id="editor-form"><div id="editor-error" class="form-error hidden" role="alert"></div><div class="editor-grid"><div class="stack"><div class="panel"><div class="editor-section"><div class="invoice-meta"><div><div class="row between" style="margin-bottom:12px"><span class="section-label" style="margin-bottom:0">Bill to</span><button type="button" class="btn link small" data-action="new-customer">${icon('plus')}New customer</button></div><label class="field">Customer<select name="customer_id" id="editor-customer" required><option value="">Choose a customer</option>${s.options.customers.map(c=>`<option value="${c.id}" ${ed.customer_id===c.id?'selected':''}>${e(c.name)}${c.phone?' · '+e(c.phone):''}</option>`).join('')}</select></label><div class="subtext preline" id="customer-address" style="margin-top:10px">${customer?e(customer.address):'Customer details appear here.'}</div>${customer?.gstin?`<div class="subtext">GSTIN: ${e(customer.gstin)}</div>`:''}</div><div class="invoice-dates">${field('Invoice date','issue_date',ed.issue_date,{type:'date',required:true,max:today()})}${field('Due date','due_date',ed.due_date,{type:'date',required:true,min:ed.issue_date})}${select('Place of supply','place_of_supply',ed.place_of_supply,STATES,{full:true})}</div></div></div><div class="row between editor-section" style="padding-top:16px;padding-bottom:16px"><h3>Line items</h3><span class="hint">${ed.lines.length} item${ed.lines.length===1?'':'s'}</span></div><div class="table-wrap"><table class="editor-table"><thead><tr><th>Product / service</th><th class="right">Qty</th><th class="right">Rate ₹</th><th class="right">Disc. %</th><th>Tax treatment</th><th class="right">Amount</th><th></th></tr></thead><tbody>${ed.lines.map((l,i)=>editorLine(l,i,b)).join('')}</tbody></table></div><div class="editor-add"><button type="button" class="btn soft small" data-action="add-line">${icon('plus')}Add line item</button></div><div class="editor-section"><div class="form-grid">${textarea('Notes','notes',ed.notes,{placeholder:'Anything your customer should know'})}${textarea('Terms & conditions','terms',ed.terms)}</div></div></div>${b.registration!=='regular'?`<div class="notice">${icon('shield')}<span>${b.registration==='composition'?'Composition scheme: a bill of supply will be issued without charging GST.':'Non-GST business: an ordinary invoice will be issued without charging GST.'}</span></div>`:''}</div><aside class="panel summary"><div class="panel-head"><h2>Invoice summary</h2><span class="badge draft">Draft</span></div><div class="panel-body" id="editor-summary"></div><div class="summary-actions"><button type="submit" class="btn block">Save draft</button><button type="button" class="btn primary block" data-action="save-issue">Save & issue ${icon('arrow')}</button><button type="button" class="btn link small" data-action="preview-draft">Preview</button></div><div class="summary-note">Invoice numbers are assigned when issued. Issued invoices preserve their original details and cannot be edited.</div></aside></div></form>`;
 updateEditorTotals();
}
function editorLine(l,i,b){
 return `<tr><td><select data-line="${i}" data-key="item_id" aria-label="Catalogue item for line ${i+1}"><option value="">Custom line item</option>${s.options.items.map(x=>`<option value="${x.id}" ${l.item_id===x.id?'selected':''}>${e(x.name)}</option>`).join('')}</select><input class="line-description" data-line="${i}" data-key="description" value="${e(l.description)}" placeholder="Item description" maxlength="300" required aria-label="Description for line ${i+1}"><div class="line-options"><select data-line="${i}" data-key="kind" aria-label="Item type"><option value="product" ${l.kind==='product'?'selected':''}>Product</option><option value="service" ${l.kind==='service'?'selected':''}>Service</option></select><input data-line="${i}" data-key="hsn_sac" value="${e(l.hsn_sac)}" placeholder="HSN/SAC" maxlength="8" aria-label="HSN or SAC code"><input data-line="${i}" data-key="unit" value="${e(l.unit)}" placeholder="Unit" maxlength="30" aria-label="Unit"></div></td><td><input class="numeric" data-line="${i}" data-key="quantity" value="${e(l.quantity)}" type="number" min="0.001" step="0.001" required aria-label="Quantity for line ${i+1}"></td><td><input class="numeric price-input" data-line="${i}" data-key="price" value="${e(l.price)}" type="number" min="0" step="0.01" required aria-label="Unit price for line ${i+1}"></td><td><input class="numeric" data-line="${i}" data-key="discount" value="${e(l.discount)}" type="number" min="0" max="100" step="0.01" required aria-label="Discount percent for line ${i+1}"></td><td class="line-tax"><select data-line="${i}" data-key="tax_treatment" aria-label="Tax treatment for line ${i+1}">${[['taxable','Taxable'],['exempt','Exempt'],['nil_rated','Nil rated'],['non_gst','Outside GST']].map(([v,n])=>`<option value="${v}" ${l.tax_treatment===v?'selected':''}>${n}</option>`).join('')}</select><input class="numeric" data-line="${i}" data-key="gst_rate" value="${b.registration==='regular'&&l.tax_treatment==='taxable'?e(l.gst_rate):'0.00'}" type="number" min="0" max="100" step="0.01" ${b.registration!=='regular'||l.tax_treatment!=='taxable'?'disabled':''} aria-label="GST percent for line ${i+1}"></td><td><div class="line-total num" id="line-total-${i}">—</div></td><td><button type="button" class="icon-btn danger" data-action="remove-line" data-index="${i}" aria-label="Remove line ${i+1}" ${s.editor.lines.length===1?'disabled':''}>${icon('close')}</button></td></tr>`;
}
function updateEditorTotals(){
 const box=document.querySelector('#editor-summary');if(!box||!s.editor)return;
 try{
  const p=editorPayload(),t=calculate(p.lines,business(),p.place_of_supply),b=business();
  box.innerHTML=`<div class="summary-amount"><span>Subtotal</span><strong>${money(t.subtotal_paise)}</strong></div><div class="summary-amount"><span>Discount</span><strong>−${money(t.discount_paise)}</strong></div><div class="summary-amount"><span>Value before tax</span><strong>${money(t.taxable_paise)}</strong></div>${t.cgst_paise||t.sgst_paise?`<div class="summary-amount"><span>CGST</span><strong>${money(t.cgst_paise)}</strong></div><div class="summary-amount"><span>${stateTaxName(b.state_code)}</span><strong>${money(t.sgst_paise)}</strong></div>`:''}${t.igst_paise?`<div class="summary-amount"><span>IGST</span><strong>${money(t.igst_paise)}</strong></div>`:''}<div class="summary-amount summary-total"><span>Total</span><strong>${money(t.total_paise)}</strong></div><span class="hint">${e(DOCUMENTS[t.document_type])}</span>`;
  t.lines.forEach((l,i)=>{const elem=document.querySelector('#line-total-'+i);if(elem)elem.textContent=money(l.total_paise);});
 }catch(error){box.innerHTML=`<p class="hint">Complete the quantities, rates and discounts to calculate the total.</p>`;}
}
async function saveEditor(issue=false){
 if(s.busy)return;const form=document.querySelector('#editor-form');if(!form.reportValidity())return;
 const errorBox=document.querySelector('#editor-error');errorBox.classList.add('hidden');s.busy=true;form.querySelectorAll('button').forEach(x=>x.disabled=true);
 try{
  const p=editorPayload();if(p.lines.some(l=>!l.description.trim()))throw new Error('Add a description to every invoice line.');
  const saved=await write('invoice_save',p);s.editor.id=saved.id;s.editor.dirty=false;
  let result=saved;if(issue)result=await write('invoice_issue',{id:saved.id});
  toast(issue?`${result.invoice_no} issued.`:'Draft saved.');s.busy=false;await navigate('detail',{id:result.id});
 }catch(error){errorBox.textContent=error.message;errorBox.classList.remove('hidden');errorBox.scrollIntoView({block:'center',behavior:'smooth'});}
 finally{s.busy=false;form.querySelectorAll('button').forEach(x=>x.disabled=false);}
}
function previewDraft(){try{const p=editorPayload(),c=s.options.customers.find(x=>x.id===p.customer_id);if(!c)throw new Error('Choose a customer before previewing.');const t=calculate(p.lines,business(),p.place_of_supply);showModal('Draft preview',invoicePaper({...p,...t,status:'draft',paid_paise:0,business_snapshot:business(),customer_snapshot:c}),{wide:true});}catch(error){toast(error.message,true);}}
function renderDetail(){
 const {invoice:inv,payments}=s.detail,due=Number(inv.total_paise)-Number(inv.paid_paise);
 document.querySelector('#content').innerHTML=`<div class="document-wrap"><div class="page-heading"><div><button class="btn link small" data-nav="invoices" style="margin-bottom:10px">${icon('back')}All invoices</button><h1>${e(inv.invoice_no||'Draft invoice')}</h1><div class="row" style="margin-top:9px">${status(inv)}<span class="hint">${e(inv.customer_snapshot.name)}</span></div></div><div class="document-actions">${inv.status==='draft'?`<button class="btn" data-action="edit-draft">${icon('edit')}Edit draft</button><button class="btn primary" data-action="issue-draft">Issue invoice ${icon('arrow')}</button>`:inv.status==='issued'&&due>0?`<button class="btn primary" data-action="pay-current">${icon('plus')}Record payment</button>`:''}<button class="btn" data-action="print-invoice">${icon('print')}Print / PDF</button>${inv.status==='issued'&&Number(inv.paid_paise)===0?'<button class="btn danger small" data-action="cancel-invoice">Cancel</button>':''}</div></div>${inv.status==='draft'?`<div class="notice" style="margin-bottom:20px">${icon('invoice')}<span>This is a draft. Issue it to assign its invoice number and include it in sales reports.</span></div>`:''}${invoicePaper(inv)}<div class="panel payment-history"><div class="panel-head"><h2>Payment history</h2><span class="hint">${payments.filter(p=>!p.reversed_at).length} receipt${payments.filter(p=>!p.reversed_at).length===1?'':'s'}</span></div>${payments.length?`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Method</th><th>Reference</th><th class="right">Amount</th><th></th></tr></thead><tbody>${payments.map(p=>`<tr><td>${date(p.payment_date)}</td><td style="text-transform:capitalize">${e(p.method)}</td><td>${e(p.reference||'—')}${p.reversed_at?`<div class="subtext">Reversed: ${e(p.reversal_reason)}</div>`:''}</td><td class="right num" ${p.reversed_at?'style="text-decoration:line-through;color:#a5ad9c"':''}>${money(p.amount_paise)}</td><td class="right">${!p.reversed_at?`<button class="btn link small" data-action="reverse-payment" data-id="${p.id}">Reverse</button>`:'<span class="badge cancelled">Reversed</span>'}</td></tr>`).join('')}</tbody></table></div>`:empty('No payments recorded',inv.status==='draft'?'Issue the invoice to start recording payments.':'Record a payment when it has been received.','','','wallet')}</div>${foot()}</div>`;
}
async function editDraft(){const inv=s.detail.invoice;s.editor={id:inv.id,client_key:inv.client_key,customer_id:inv.customer_id,issue_date:inv.issue_date,due_date:inv.due_date,place_of_supply:inv.place_of_supply,notes:inv.notes,terms:inv.terms,lines:inv.lines.map(newLine),dirty:false};await navigate('editor');}
async function issueCurrent(){if(s.busy)return;s.busy=true;try{const result=await write('invoice_issue',{id:s.detail.invoice.id});toast(`${result.invoice_no} issued.`);s.busy=false;await navigate('detail',{id:result.id});}catch(error){toast(error.message,true);}finally{s.busy=false;}}
function paymentModal(inv){
 const due=Number(inv.total_paise)-Number(inv.paid_paise);
 showModal('Record a payment',`<div class="notice">${icon('invoice')}<span><strong>${e(inv.invoice_no)}</strong> · ${e(inv.customer_snapshot.name)}<br>Balance due: ${money(due)}</span></div><form id="payment-form" data-id="${inv.id}" data-key="${uuidv4()}"><div class="form-grid">${field('Amount received ₹','amount',decimalValue(due),{required:true,type:'number',min:'0.01',max:decimalValue(due),step:'0.01'})}${field('Payment date','payment_date',today(),{required:true,type:'date',min:inv.issue_date,max:today()})}${select('Payment method','method','upi',[['upi','UPI'],['cash','Cash'],['bank','Bank transfer'],['card','Card'],['other','Other']])}${field('Reference (optional)','reference','',{placeholder:'Transaction ID / receipt note',maxlength:200})}</div><p class="hint" style="margin-top:15px">Record money already received. This form does not charge the customer.</p>${modalFooter('Save payment')}</form>`);
}
async function choosePayment(){
 showModal('Choose an invoice',`${search('Search invoice or customer…')}<div id="payment-choice-list" style="margin-top:18px">${loading()}</div>`);await refreshPaymentChoices('');
}
let paymentChoices=[],paymentChoiceSeq=0;
async function refreshPaymentChoices(q){const seq=++paymentChoiceSeq;try{const result=await api('invoices',{business_id:s.bid,status:'issued',q});if(seq!==paymentChoiceSeq||!modal.open)return;paymentChoices=result.data.filter(i=>Number(i.paid_paise)<Number(i.total_paise));const slot=document.querySelector('#payment-choice-list');if(!slot)return;slot.innerHTML=paymentChoices.length?`<div class="stack">${paymentChoices.map(inv=>`<button class="btn between" data-action="select-payment-invoice" data-id="${inv.id}" style="text-align:left"><span>${e(inv.invoice_no)}<span class="subtext" style="display:block">${e(inv.customer_snapshot.name)}</span></span><span class="num">${money(Number(inv.total_paise)-Number(inv.paid_paise))}</span></button>`).join('')}</div><p class="hint" style="margin-top:15px">Search by customer or invoice number to find an older invoice.</p>`:empty('No unpaid invoices found','Issue an invoice or try a different search.','','','invoice');}catch(error){modalError(error);}}
function reasonModal(action,id){const cancel=action==='invoice_cancel';showModal(cancel?'Cancel this invoice?':'Reverse this payment?',`<div class="notice warning">${icon('help')}<span>${cancel?'The invoice number and original details will be kept. The invoice will be excluded from sales totals.':'The original receipt will remain in the history and the invoice balance will increase.'}</span></div><form id="reason-form" data-action-name="${action}" data-id="${id}">${textarea(cancel?'Cancellation reason':'Reversal reason','reason','',{required:true,maxlength:1000,placeholder:'Why is this correction needed?'})}${modalFooter(cancel?'Cancel invoice':'Reverse payment')}</form>`);}
function setupGuide(){
 showModal('Your first invoice, in four steps',`<div class="onboarding-checks"><div class="check-row done"><span class="check-circle">${icon('check')}</span><div><strong>Set up your business</strong><p class="subtext">Your business details are ready.</p></div></div>${[['1','Add a customer','Their billing address and GST details.','customers'],['2','Build your catalogue','Add the products and services you sell.','catalog'],['3','Create your first invoice','Save a draft, check it, and issue it.','editor']].map(([n,title,text,page])=>`<div class="check-row"><span class="check-circle">${n}</span><div class="grow"><strong>${title}</strong><p class="subtext">${text}</p></div><button class="icon-btn" data-action="guide-go" data-page="${page}" aria-label="${title}">${icon('arrow')}</button></div>`).join('')}</div>`);
}
function renderReportFrame(){
 document.querySelector('#content').innerHTML=heading('Sales, with a little perspective.','Review your sales register and receipts for a chosen period.')+`<div class="panel"><div class="panel-body"><form id="report-form" class="report-filters">${field('From','from',s.reportFrom,{type:'date',required:true})}${field('To','to',s.reportTo,{type:'date',required:true})}<button class="btn primary" type="submit">View report ${icon('arrow')}</button><button class="btn" type="button" data-action="export-report">${icon('download')}Export CSV</button></form></div></div><div id="report-slot">${loading()}</div>${foot()}`;
}
let reportSeq=0;
async function loadReport(){
 const seq=++reportSeq,bid=s.bid;
 try{
  const result=await api('report',{business_id:bid,from:s.reportFrom,to:s.reportTo});if(seq!==reportSeq||bid!==s.bid||s.page!=='reports')return;s.report=result;
  const m=result.summary;document.querySelector('#report-slot').innerHTML=`<div class="stats report-summary">${[['Total invoiced',m.total_paise,'Issued in selected period',true],['GST on invoices',Number(m.cgst_paise)+Number(m.sgst_paise)+Number(m.igst_paise),'Tax shown on issued invoices'],['Receipts in period',result.receipts_in_period_paise,'By receipt date · reversals excluded'],['Balance on these invoices',m.due_paise,'Current outstanding balance']].map(([title,n,note,featured])=>`<div class="stat ${featured?'featured':''}"><div class="stat-label">${title}</div><div class="stat-value num">${money(n)}</div><div class="stat-note">${note}</div></div>`).join('')}</div><div class="panel"><div class="panel-head"><h2>Sales register</h2><span class="hint">${m.count} issued invoice${Number(m.count)===1?'':'s'}</span></div>${result.truncated?'<div class="notice warning">This range has more than 10,000 invoices. Narrow the date range for a complete export.</div>':''}${result.rows.length?`<div class="table-wrap"><table><thead><tr><th>Invoice / customer</th><th>Date</th><th class="right">Value before tax</th><th class="right">GST</th><th class="right">Total</th><th class="right">Balance</th></tr></thead><tbody>${result.rows.map(i=>`<tr class="clickable" data-action="view-invoice" data-id="${i.id}"><td><span class="table-title">${e(i.invoice_no)}</span><div class="subtext">${e(i.customer_snapshot.name)}</div></td><td class="muted">${date(i.issue_date)}</td><td class="right num">${money(i.taxable_paise)}</td><td class="right num">${money(i.tax_paise)}</td><td class="right num table-title">${money(i.total_paise)}</td><td class="right num">${money(Number(i.total_paise)-Number(i.paid_paise))}</td></tr>`).join('')}</tbody></table></div>`:empty('A fresh page in your books.','Issued invoices for this date range will appear here.','','','chart')}</div><div class="notice" style="margin-top:18px">${icon('help')}<span>This is a sales register, not a filed GST return. Receipts are shown by payment date; invoice balances reflect payments and reversals recorded so far.</span></div>`;
 }catch(error){if(seq===reportSeq&&s.user)document.querySelector('#report-slot').innerHTML=`<div class="panel">${empty('Check the report range',error.message,'retry-report','Try again','chart')}</div>`;}
}
function exportReport(){
 if(!s.report?.rows.length){toast('Load a report with issued invoices first.');return;}
 if(s.report.truncated){toast('Narrow the date range to export all invoices.',true);return;}
 const headers=['Invoice number','Document type','Invoice date','Due date','Customer','Customer GSTIN','Place of supply code','Value before tax INR','CGST INR',stateTaxName(business().state_code)+' INR','IGST INR','Total INR','Paid INR','Balance INR'];
 const rows=s.report.rows.map(i=>[i.invoice_no,DOCUMENTS[i.document_type],i.issue_date,i.due_date,i.customer_snapshot.name,i.customer_snapshot.gstin,i.place_of_supply,decimalValue(i.taxable_paise),decimalValue(i.cgst_paise),decimalValue(i.sgst_paise),decimalValue(i.igst_paise),decimalValue(i.total_paise),decimalValue(i.paid_paise),decimalValue(Number(i.total_paise)-Number(i.paid_paise))]);
 const blob=new Blob(['\uFEFF'+csv([headers,...rows])],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`billnest-sales-${s.reportFrom}-to-${s.reportTo}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

document.addEventListener('submit',event=>{
 const form=event.target;if(!(form instanceof HTMLFormElement))return;event.preventDefault();
 if(form.id==='auth-form')withForm(form,async()=>{
  const values=formData(form);if(values.email)s.authEmail=values.email.trim();
  if(['confirm','recover'].includes(s.authMode)){
   const mode=s.authMode;await api(mode==='confirm'?'resend_confirmation':'password_reset_request',{}, {email:s.authEmail});
   renderAuth(mode,mode==='confirm'?'If this email is eligible, a new confirmation email has been requested. Open only the newest email.':'If this email has an account, a reset email has been requested. Open the newest reset email in this same browser.');return;
  }
  if(s.authMode==='reset'){
   if(values.password!==values.password_confirm)throw new Error('The two passwords do not match.');
   await api('password_update',{}, {password:values.password});await loadBusinesses();toast('Your password has been updated.');return;
  }
  const r=await api(s.authMode,{},values);
  if(r.confirmation_required){renderAuth('confirm','Check your email for the newest confirmation link. If you already have an account, sign in or reset your password.');return;}
  const session=await api('session');s.user=session.user;await loadBusinesses();
 });
 else if(['setup-form','business-form','business-modal-form'].includes(form.id))withForm(form,async()=>{const isEdit=form.id==='business-form',b=await write('business_save',{...formData(form),id:isEdit?s.bid:undefined});if(modal.open)modal.close();s.editor=null;await loadBusinesses(b.id);toast(isEdit?'Business details updated.':'Your business workspace is ready.');});
 else if(form.id==='customer-form')withForm(form,async()=>{const c=await write('customer_save',{...formData(form),id:form.dataset.id||undefined});modal.close();toast('Customer saved.');if(s.page==='editor'){await loadOptions();s.editor.customer_id=c.id;s.editor.place_of_supply=c.state_code;s.editor.dirty=true;renderEditor();}else await loadList();});
 else if(form.id==='item-form')withForm(form,async()=>{const v=formData(form);await write('item_save',{...v,id:form.dataset.id||undefined,price_paise:decimalInt(v.price),gst_rate_bps:decimalInt(v.gst_rate),active:v.active==='true'});modal.close();toast('Catalogue item saved.');await loadList();});
 else if(form.id==='editor-form')saveEditor(false);
 else if(form.id==='payment-form')withForm(form,async()=>{const v=formData(form);await write('payment_add',{id:form.dataset.id,client_key:form.dataset.key,amount_paise:decimalInt(v.amount),payment_date:v.payment_date,method:v.method,reference:v.reference});modal.close();toast('Payment recorded.');if(s.page==='detail')await navigate('detail',{id:form.dataset.id});else await navigate('payments');});
 else if(form.id==='reason-form')withForm(form,async()=>{await write(form.dataset.actionName,{id:form.dataset.id,reason:formData(form).reason});modal.close();toast(form.dataset.actionName==='invoice_cancel'?'Invoice cancelled.':'Payment reversed.');if(s.page==='detail')await navigate('detail',{id:s.detail.invoice.id});else await loadList();});
 else if(form.id==='report-form'){const v=formData(form);s.reportFrom=v.from;s.reportTo=v.to;loadReport();}
});
let searchTimer;
document.addEventListener('input',event=>{
 const elem=event.target;
 if(elem.id==='list-search'){
  clearTimeout(searchTimer);const value=elem.value;
  if(modal.open&&document.querySelector('#payment-choice-list'))searchTimer=setTimeout(()=>refreshPaymentChoices(value),300);
  else{s.query=value;s.pageNo=1;searchTimer=setTimeout(loadList,300);}return;
 }
 if(elem.dataset.line!==undefined&&s.editor){const l=s.editor.lines[Number(elem.dataset.line)];if(l){l[elem.dataset.key]=elem.value;s.editor.dirty=true;updateEditorTotals();}return;}
 if(elem.closest('#editor-form')&&s.editor&&elem.name){s.editor[elem.name]=elem.value;s.editor.dirty=true;updateEditorTotals();}
});
document.addEventListener('change',async event=>{
 const elem=event.target;
 try{
  if(elem.id==='business-switch'){
   if(elem.value==='new'){elem.value=s.bid;newBusinessModal();return;}
   if(s.editor?.dirty&&!confirm('Switch business and discard unsaved invoice changes?')){elem.value=s.bid;return;}
   s.bid=elem.value;s.editor=null;s.detail=null;s.options={customers:[],items:[]};s.report=null;s.rows=[];localStorage.setItem('billbee:business:'+s.user.id,s.bid);await navigate('overview');
  }else if(elem.id==='invoice-filter'){s.filter=elem.value;s.pageNo=1;await loadList();}
  else if(elem.id==='kind-filter'){s.kind=elem.value;s.pageNo=1;await loadList();}
  else if(elem.id==='editor-customer'){
   s.editor.customer_id=elem.value;const c=s.options.customers.find(x=>x.id===elem.value);if(c)s.editor.place_of_supply=c.state_code;s.editor.dirty=true;renderEditor();
  }else if(elem.dataset.line!==undefined&&s.editor){
   const i=Number(elem.dataset.line),key=elem.dataset.key,l=s.editor.lines[i];if(!l)return;
   l[key]=elem.value;s.editor.dirty=true;
   if(key==='item_id'){
    const it=s.options.items.find(x=>x.id===elem.value);
    if(it)s.editor.lines[i]=newLine({item_id:it.id,description:it.name,kind:it.kind,hsn_sac:it.hsn_sac,unit:it.unit,price_paise:Number(it.price_paise),gst_rate_bps:Number(it.gst_rate_bps),tax_treatment:it.tax_treatment});
    renderEditor();
   }else if(key==='tax_treatment'){if(l.tax_treatment!=='taxable')l.gst_rate='0.00';renderEditor();}
  }else if(elem.closest('#editor-form')&&s.editor&&elem.name){s.editor[elem.name]=elem.value;s.editor.dirty=true;if(elem.name==='issue_date'&&s.editor.due_date<elem.value){s.editor.due_date=elem.value;renderEditor();}else updateEditorTotals();}
 }catch(error){toast(error.message,true);}
});
document.addEventListener('click',async event=>{
 const elem=event.target.closest('[data-action],[data-nav]');if(!elem)return;
 if(elem.tagName==='BUTTON')event.preventDefault();
 try{
  if(elem.dataset.nav){await navigate(elem.dataset.nav);return;}
  const action=elem.dataset.action;
  if(action==='auth-toggle'){s.authEmail=document.querySelector('#auth-form [name=email]')?.value?.trim()||s.authEmail;renderAuth(s.authMode==='signin'?'signup':'signin');}
  else if(action==='auth-mode'&&['signin','confirm','recover'].includes(elem.dataset.mode)){s.authEmail=document.querySelector('#auth-form [name=email]')?.value?.trim()||s.authEmail;renderAuth(elem.dataset.mode);}
  else if(action==='toggle-password'){const inp=document.querySelector('#auth-password');inp.type=inp.type==='password'?'text':'password';elem.setAttribute('aria-label',inp.type==='password'?'Show password':'Hide password');}
  else if(action==='signout'){
   if(s.editor?.dirty&&!confirm('Sign out and discard unsaved invoice changes?'))return;
   try{await api('signout',{},{});}finally{resetAccount();renderAuth();}
  }
  else if(action==='new-invoice')await newInvoice();
  else if(action==='new-customer')customerModal();
  else if(action==='edit-customer')customerModal(s.rows.find(c=>c.id===elem.dataset.id));
  else if(action==='new-item')itemModal();
  else if(action==='edit-item')itemModal(s.rows.find(it=>it.id===elem.dataset.id));
  else if(action==='close-modal')modal.close();
  else if(action==='open-menu'){document.querySelector('.sidebar').classList.add('open');document.querySelector('.mobile-overlay').classList.add('open');}
  else if(action==='close-menu'){document.querySelector('.sidebar').classList.remove('open');document.querySelector('.mobile-overlay').classList.remove('open');}
  else if(action==='setup-guide')setupGuide();
  else if(action==='guide-go'){modal.close();if(elem.dataset.page==='editor')await newInvoice();else await navigate(elem.dataset.page);}
  else if(action==='view-invoice')await navigate('detail',{id:elem.dataset.id});
  else if(action==='add-line'){if(s.editor.lines.length>=200)throw new Error('An invoice can contain up to 200 lines.');s.editor.lines.push(newLine());s.editor.dirty=true;renderEditor();}
  else if(action==='remove-line'){if(s.editor.lines.length>1){s.editor.lines.splice(Number(elem.dataset.index),1);s.editor.dirty=true;renderEditor();}}
  else if(action==='save-issue')await saveEditor(true);
  else if(action==='preview-draft')previewDraft();
  else if(action==='edit-draft')await editDraft();
  else if(action==='issue-draft')await issueCurrent();
  else if(action==='print-invoice'){document.querySelector('#print-root').innerHTML=invoicePaper(s.detail.invoice);window.print();}
  else if(action==='pay-current')paymentModal(s.detail.invoice);
  else if(action==='choose-payment')await choosePayment();
  else if(action==='select-payment-invoice'){const inv=paymentChoices.find(i=>i.id===elem.dataset.id);if(inv)paymentModal(inv);}
  else if(action==='cancel-invoice')reasonModal('invoice_cancel',s.detail.invoice.id);
  else if(action==='reverse-payment')reasonModal('payment_reverse',elem.dataset.id);
  else if(action==='prev-page'){if(s.pageNo>1){s.pageNo--;await loadList();}}
  else if(action==='next-page'){s.pageNo++;await loadList();}
  else if(action==='retry-page')await navigate(s.page,{reset:false});
  else if(action==='retry-list')await loadList();
  else if(action==='retry-report')await loadReport();
  else if(action==='export-report')exportReport();
 }catch(error){toast(error.message,true);}
});
window.addEventListener('beforeunload',event=>{if(s.editor?.dirty){event.preventDefault();event.returnValue='';}});
async function init(){
 const callback=authReturn(window.location.href);
 if(callback.cleanUrl)window.history.replaceState(null,'',callback.cleanUrl);
 if(callback.kind==='error'){renderAuth('signin',callback.message,true);return;}
 if(callback.kind==='confirmation'){renderAuth('signin',callback.message);return;}
 if(callback.kind==='recovery'){
  try{const r=await api('auth_code_exchange',{}, {code:callback.code});s.user=r.user;renderAuth('reset');}
  catch(error){renderAuth('recover',error.message,true);}
  return;
 }
 try{const r=await api('session');s.user=r.user;await loadBusinesses();}
 catch{renderAuth();}
}
init();
