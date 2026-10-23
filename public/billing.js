export const STATES = [
 ['01','Jammu and Kashmir'],['02','Himachal Pradesh'],['03','Punjab'],['04','Chandigarh'],['05','Uttarakhand'],['06','Haryana'],['07','Delhi'],['08','Rajasthan'],['09','Uttar Pradesh'],['10','Bihar'],['11','Sikkim'],['12','Arunachal Pradesh'],['13','Nagaland'],['14','Manipur'],['15','Mizoram'],['16','Tripura'],['17','Meghalaya'],['18','Assam'],['19','West Bengal'],['20','Jharkhand'],['21','Odisha'],['22','Chhattisgarh'],['23','Madhya Pradesh'],['24','Gujarat'],['26','Dadra and Nagar Haveli and Daman and Diu'],['27','Maharashtra'],['29','Karnataka'],['30','Goa'],['31','Lakshadweep'],['32','Kerala'],['33','Tamil Nadu'],['34','Puducherry'],['35','Andaman and Nicobar Islands'],['36','Telangana'],['37','Andhra Pradesh'],['38','Ladakh'],['97','Other territory']
];
export const DOCUMENTS={invoice:'Invoice',tax_invoice:'Tax invoice',bill_of_supply:'Bill of supply',invoice_bill_supply:'Invoice-cum-bill of supply'};
export const money = n => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(n||0)/100);
export const compactMoney = n => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',notation:'compact',maximumFractionDigits:1}).format(Number(n||0)/100);
export const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const stateName = code => STATES.find(([c])=>c===code)?.[1] || code;
export const stateTaxName = code => ['04','26','31','35','38'].includes(code)?'UTGST':'SGST';
export const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function uuidv4(){
 if(globalThis.crypto.randomUUID)return globalThis.crypto.randomUUID();
 const a=globalThis.crypto.getRandomValues(new Uint8Array(16));a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;
 const h=Array.from(a,x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export function decimalInt(value,places=2){
 const s=String(value??'').trim();
 if(!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(s))throw new Error(`Enter a positive number with up to ${places} decimal places.`);
 const [a,b='']=s.split('.'); const result=Number(a)*10**places+Number(b.padEnd(places,'0'));
 if(!Number.isSafeInteger(result)||result>9000000000000)throw new Error('The amount is too large.');
 return result;
}
export const decimalValue=(n,places=2)=>(Number(n||0)/10**places).toFixed(places);
export function calculate(lines,business,supply){
 const result={subtotal_paise:0,discount_paise:0,taxable_paise:0,cgst_paise:0,sgst_paise:0,igst_paise:0,tax_paise:0,total_paise:0,lines:[]};
 let taxableFound=false,exemptFound=false;
 for(const line of lines){
  const l={...line};
  for(const key of ['quantity_milli','price_paise','discount_bps','gst_rate_bps'])if(!Number.isSafeInteger(l[key]))throw new Error('Check the line amounts.');
  if(l.quantity_milli<=0||l.quantity_milli>1e9||l.price_paise<0||l.discount_bps<0||l.discount_bps>10000||l.gst_rate_bps<0||l.gst_rate_bps>10000)throw new Error('Check the quantity, price, discount and GST rate.');
  // All arithmetic uses integer paise. BigInt avoids intermediate floating-point rounding.
  const round=(a,b)=>Number((BigInt(a)+BigInt(b)/2n)/BigInt(b));
  l.subtotal_paise=round(BigInt(l.quantity_milli)*BigInt(l.price_paise),1000);
  if(!Number.isSafeInteger(l.subtotal_paise)||l.subtotal_paise>9000000000000)throw new Error('The line amount is too large.');
  l.discount_paise=round(BigInt(l.subtotal_paise)*BigInt(l.discount_bps),10000);
  l.taxable_paise=l.subtotal_paise-l.discount_paise;
  const rate=business.registration==='regular'&&l.tax_treatment==='taxable'?l.gst_rate_bps:0;
  if(business.registration==='regular'&&l.tax_treatment==='taxable')taxableFound=true;else exemptFound=true;
  l.gst_rate_bps=rate;
  l.cgst_paise=supply===business.state_code?round(BigInt(l.taxable_paise)*BigInt(rate),20000):0;
  l.sgst_paise=l.cgst_paise;
  l.igst_paise=supply!==business.state_code?round(BigInt(l.taxable_paise)*BigInt(rate),10000):0;
  l.tax_paise=l.cgst_paise+l.sgst_paise+l.igst_paise;
  l.total_paise=l.taxable_paise+l.tax_paise;
  if(l.total_paise>9000000000000)throw new Error('The line amount is too large.');
  for(const key of Object.keys(result).filter(k=>k!=='lines'))result[key]+=l[key]||0;
  result.lines.push(l);
 }
 if(result.total_paise>9000000000000)throw new Error('The invoice amount is too large.');
 result.document_type=business.registration==='unregistered'?'invoice':business.registration==='composition'||!taxableFound?'bill_of_supply':exemptFound?'invoice_bill_supply':'tax_invoice';
 return result;
}
export function invoiceStatus(inv){
 if(inv.status!=='issued')return inv.status;
 if(Number(inv.paid_paise)>=Number(inv.total_paise))return 'paid';
 if(inv.due_date<today())return 'overdue';
 return Number(inv.paid_paise)>0?'partial':'unpaid';
}
export function csv(rows){
 // Prefix formula-leading text so exports cannot execute spreadsheet formulas.
 return rows.map(row=>row.map(value=>{
  let v=String(value??'');if(/^[=+\-@\t\r]/.test(v))v="'"+v;
  return '"'+v.replaceAll('"','""')+'"';
 }).join(',')).join('\r\n');
}
