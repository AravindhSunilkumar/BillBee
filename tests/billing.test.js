import test from 'node:test';
import assert from 'node:assert/strict';
import {decimalInt,calculate,csv,invoiceStatus,esc} from '../public/billing.js';
const regular={registration:'regular',state_code:'32'};
const line=(overrides={})=>({quantity_milli:1000,price_paise:100000,discount_bps:0,gst_rate_bps:1800,tax_treatment:'taxable',...overrides});
test('converts decimal currency and quantities without floating point loss',()=>{
 assert.equal(decimalInt('0.29'),29);assert.equal(decimalInt('12.345',3),12345);assert.equal(decimalInt('100.00'),10000);
 for(const invalid of ['1.999','-1','1e6','Infinity','',null])assert.throws(()=>decimalInt(invalid));
});
test('intra-state product and service invoice with a line discount',()=>{
 const result=calculate([line({quantity_milli:2000,discount_bps:1000}),line({price_paise:200000})],regular,'32');
 assert.equal(result.subtotal_paise,400000);assert.equal(result.discount_paise,20000);assert.equal(result.taxable_paise,380000);
 assert.equal(result.cgst_paise,34200);assert.equal(result.sgst_paise,34200);assert.equal(result.igst_paise,0);assert.equal(result.total_paise,448400);
});
test('inter-state invoice uses IGST rather than the two state taxes',()=>{
 const result=calculate([line()],regular,'33');assert.equal(result.cgst_paise,0);assert.equal(result.sgst_paise,0);assert.equal(result.igst_paise,18000);assert.equal(result.total_paise,118000);
});
test('rounds each tax component to the paise, including tiny amounts',()=>{
 const intra=calculate([line({price_paise:6})],regular,'32'),inter=calculate([line({price_paise:6})],regular,'33');
 assert.equal(intra.cgst_paise,1);assert.equal(intra.sgst_paise,1);assert.equal(intra.total_paise,8);assert.equal(inter.igst_paise,1);assert.equal(inter.total_paise,7);
});
test('non-GST and composition businesses never collect tax',()=>{
 for(const registration of ['unregistered','composition']){const result=calculate([line()],{...regular,registration},'32');assert.equal(result.tax_paise,0);assert.equal(result.total_paise,100000);assert.equal(result.document_type,registration==='composition'?'bill_of_supply':'invoice');}
});
test('exempt lines do not carry GST and mixed lines use the combined document type',()=>{
 const exempt=line({tax_treatment:'exempt'});assert.equal(calculate([exempt],regular,'32').document_type,'bill_of_supply');
 const result=calculate([line(),exempt],regular,'32');assert.equal(result.tax_paise,18000);assert.equal(result.document_type,'invoice_bill_supply');
});
test('rejects excessive line amounts, discounts and quantities',()=>{
 for(const value of [line({quantity_milli:0}),line({discount_bps:10001}),line({gst_rate_bps:10001}),line({quantity_milli:1000000000,price_paise:9000000000000,discount_bps:10000})])assert.throws(()=>calculate([value],regular,'32'));
});
test('escapes HTML and prevents formulas in CSV exports',()=>{
 assert.equal(esc('<img onerror="evil()">'),'&lt;img onerror=&quot;evil()&quot;&gt;');
 assert.equal(csv([['=HYPERLINK("bad")','a,b','plain']]),'"\'=HYPERLINK(""bad"")","a,b","plain"');
});
test('paid and cancelled statuses take priority over dates',()=>{
 assert.equal(invoiceStatus({status:'issued',total_paise:100,paid_paise:100,due_date:'2000-01-01'}),'paid');
 assert.equal(invoiceStatus({status:'cancelled',total_paise:100,paid_paise:0,due_date:'2000-01-01'}),'cancelled');
 assert.equal(invoiceStatus({status:'issued',total_paise:100,paid_paise:0,due_date:'2000-01-01'}),'overdue');
});
