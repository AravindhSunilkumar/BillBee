begin;
create schema if not exists billing_private;
revoke all on schema billing_private from public, anon;
grant usage on schema billing_private to authenticated;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null check (length(name) between 2 and 120),
  address text not null default '' check (length(address) <= 1000),
  email text not null default '', phone text not null default '',
  state_code text not null check (state_code ~ '^[0-9]{2}$'),
  registration text not null default 'unregistered' check (registration in ('regular','composition','unregistered')),
  gstin text not null default '',
  bank_details text not null default '',
  invoice_terms text not null default 'Thank you for your business.',
  created_at timestamptz not null default now()
);
create index businesses_owner_idx on public.businesses(owner_id);

create table public.customers (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 name text not null check(length(name) between 1 and 120), email text not null default '', phone text not null default '',
 address text not null default '', state_code text not null default '', gstin text not null default '',
 created_at timestamptz not null default now(), unique(business_id,id)
);
create index customers_business_idx on public.customers(business_id, name);

create table public.catalog_items (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 name text not null check(length(name) between 1 and 180), kind text not null check(kind in ('product','service')),
 sku text not null default '', hsn_sac text not null default '', unit text not null default 'Nos',
 price_paise bigint not null check(price_paise between 0 and 9000000000000),
 tax_treatment text not null check(tax_treatment in ('taxable','exempt','nil_rated','non_gst')),
 gst_rate_bps integer not null default 0 check(gst_rate_bps between 0 and 10000),
 active boolean not null default true, created_at timestamptz not null default now(), unique(business_id,id),
 check(tax_treatment='taxable' or gst_rate_bps=0)
);
create index catalog_business_idx on public.catalog_items(business_id,active,name);

create table public.invoices (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 customer_id uuid not null, client_key uuid not null,
 status text not null default 'draft' check(status in ('draft','issued','cancelled')),
 invoice_no text, financial_year text,
 document_type text not null check(document_type in ('invoice','tax_invoice','bill_of_supply','invoice_bill_supply')),
 issue_date date not null, due_date date not null, place_of_supply text not null,
 business_snapshot jsonb not null, customer_snapshot jsonb not null, lines jsonb not null,
 subtotal_paise bigint not null, discount_paise bigint not null, taxable_paise bigint not null,
 cgst_paise bigint not null, sgst_paise bigint not null, igst_paise bigint not null,
 tax_paise bigint not null, total_paise bigint not null check(total_paise between 0 and 9000000000000),
 paid_paise bigint not null default 0 check(paid_paise >= 0 and paid_paise <= total_paise),
 notes text not null default '', terms text not null default '',
 issued_at timestamptz, cancelled_at timestamptz, cancellation_reason text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(business_id,customer_id) references public.customers(business_id,id),
 unique(business_id,client_key), unique(business_id,invoice_no), unique(business_id,id),
 check(due_date >= issue_date), check(jsonb_array_length(lines) between 1 and 200),
 check(invoice_no is null or length(invoice_no)<=16),
 check(status='draft' or (invoice_no is not null and issued_at is not null))
);
create index invoices_business_date_idx on public.invoices(business_id,issue_date desc,created_at desc);
create index invoices_customer_idx on public.invoices(business_id,customer_id);
create index invoices_due_idx on public.invoices(business_id,due_date) where status='issued';

create table public.payments (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id),
 invoice_id uuid not null, client_key uuid not null, amount_paise bigint not null check(amount_paise>0),
 payment_date date not null, method text not null check(method in ('cash','upi','bank','card','other')),
 reference text not null default '', reversed_at timestamptz, reversal_reason text,
 created_at timestamptz not null default now(),
 foreign key(business_id,invoice_id) references public.invoices(business_id,id),
 unique(business_id,client_key)
);
create index payments_invoice_idx on public.payments(business_id,invoice_id);
create index payments_date_idx on public.payments(business_id,payment_date desc);

create table public.audit_events (
 id bigint generated always as identity primary key,
 business_id uuid not null references public.businesses(id), actor_id uuid not null references auth.users(id),
 action text not null, entity_id uuid not null, details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index audit_business_idx on public.audit_events(business_id,created_at desc);
create index audit_actor_idx on public.audit_events(actor_id);
create table billing_private.invoice_counters (
 business_id uuid not null references public.businesses(id), financial_year text not null,
 next_number integer not null default 1, primary key(business_id,financial_year)
);

alter table public.businesses enable row level security;
create policy business_owner_read on public.businesses for select to authenticated using(owner_id=(select auth.uid()));
do $$ declare t text; begin
 foreach t in array array['customers','catalog_items','invoices','payments','audit_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy tenant_owner_read on public.%I for select to authenticated using(business_id in (select id from public.businesses where owner_id=(select auth.uid())))',t);
 end loop;
end $$;
revoke all on all tables in schema public from anon, authenticated;
grant select on public.businesses, public.customers, public.catalog_items, public.invoices, public.payments, public.audit_events to authenticated;
revoke all on all tables in schema billing_private from public,anon,authenticated;

create function billing_private.require_business(p_id uuid) returns public.businesses
language plpgsql security invoker set search_path='' as $$
declare b public.businesses;
begin
 select * into b from public.businesses where id=p_id and owner_id=auth.uid();
 if b.id is null then raise exception 'Business not found or access denied.' using errcode='42501'; end if;
 return b;
end $$;

create function billing_private.write_action(p_action text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 b public.businesses; c public.customers; it public.catalog_items; inv public.invoices; pay public.payments;
 bid uuid; eid uuid; request_key uuid; rec jsonb; out_lines jsonb:='[]'::jsonb;
 issue_day date; due_day date; supply text; doc text; reg text; gst text; name_value text;
 qty bigint; price bigint; disc integer; rate integer; base bigint; discount_amount bigint; taxable bigint;
 cg bigint; sg bigint; ig bigint; line_total bigint;
 sub_total bigint:=0; disc_total bigint:=0; taxable_total bigint:=0; cg_total bigint:=0; sg_total bigint:=0; ig_total bigint:=0;
 has_taxable boolean:=false; has_exempt boolean:=false; tax_kind text; item_kind text; description_value text; hsn text;
 fy_year integer; fy text; fy_short text; serial integer; no_value text; amount bigint; day_value date;
 today date:=(now() at time zone 'Asia/Kolkata')::date;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
  raise exception 'Sign in with a registered account to continue.' using errcode='42501';
 end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid request.'; end if;
 if p_action='business_save' then
  eid:=nullif(p_data->>'id','')::uuid;
  if eid is not null then b:=billing_private.require_business(eid); end if;
  name_value:=trim(coalesce(p_data->>'name',''));
  if length(name_value) not between 2 and 120 then raise exception 'Enter a business name between 2 and 120 characters.'; end if;
  reg:=coalesce(p_data->>'registration','unregistered'); gst:=upper(trim(coalesce(p_data->>'gstin','')));
  supply:=p_data->>'state_code';
  if supply is null or not(supply=any(array['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','26','27','29','30','31','32','33','34','35','36','37','38','97'])) then raise exception 'Choose a valid state or union territory.'; end if;
  if reg not in ('regular','composition','unregistered') then raise exception 'Invalid GST registration type.'; end if;
  if reg<>'unregistered' and (gst!~'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' or left(gst,2)<>supply) then raise exception 'Enter a valid GSTIN matching the business state.'; end if;
  if reg='unregistered' then gst:=''; end if;
  if length(coalesce(p_data->>'address',''))>1000 or length(coalesce(p_data->>'invoice_terms',''))>2000 or length(coalesce(p_data->>'bank_details',''))>1000 then raise exception 'Business details are too long.'; end if;
  if eid is null then
   insert into public.businesses(owner_id,name,address,email,phone,state_code,registration,gstin,bank_details,invoice_terms)
   values(auth.uid(),name_value,coalesce(p_data->>'address',''),left(coalesce(p_data->>'email',''),200),left(coalesce(p_data->>'phone',''),40),supply,reg,gst,coalesce(p_data->>'bank_details',''),coalesce(p_data->>'invoice_terms','Thank you for your business.')) returning * into b;
  else
   update public.businesses set name=name_value,address=coalesce(p_data->>'address',''),email=left(coalesce(p_data->>'email',''),200),phone=left(coalesce(p_data->>'phone',''),40),state_code=supply,registration=reg,gstin=gst,bank_details=coalesce(p_data->>'bank_details',''),invoice_terms=coalesce(p_data->>'invoice_terms','Thank you for your business.') where id=eid returning * into b;
  end if;
  insert into public.audit_events(business_id,actor_id,action,entity_id) values(b.id,auth.uid(),p_action,b.id);
  return to_jsonb(b);
 end if;

 bid:=nullif(p_data->>'business_id','')::uuid;
 b:=billing_private.require_business(bid);
 eid:=nullif(p_data->>'id','')::uuid;
 if p_action='customer_save' then
  if eid is not null and not exists(select 1 from public.customers where id=eid and business_id=bid) then raise exception 'Customer not found.'; end if;
  name_value:=trim(coalesce(p_data->>'name','')); gst:=upper(trim(coalesce(p_data->>'gstin','')));
  supply:=coalesce(nullif(p_data->>'state_code',''),b.state_code);
  if length(name_value) not between 1 and 120 or length(coalesce(p_data->>'address',''))>1000 then raise exception 'Enter a customer name and a shorter address.'; end if;
  if supply!~'^[0-9]{2}$' then raise exception 'Choose a valid customer state.'; end if;
  if gst<>'' and (gst!~'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' or left(gst,2)<>supply) then raise exception 'Customer GSTIN must match the customer state.'; end if;
  insert into public.customers(id,business_id,name,email,phone,address,state_code,gstin)
  values(coalesce(eid,gen_random_uuid()),bid,name_value,left(coalesce(p_data->>'email',''),200),left(coalesce(p_data->>'phone',''),40),coalesce(p_data->>'address',''),supply,gst)
  on conflict(id) do update set name=excluded.name,email=excluded.email,phone=excluded.phone,address=excluded.address,state_code=excluded.state_code,gstin=excluded.gstin returning * into c;
  insert into public.audit_events(business_id,actor_id,action,entity_id) values(bid,auth.uid(),p_action,c.id);
  return to_jsonb(c);
 elsif p_action='item_save' then
  if eid is not null and not exists(select 1 from public.catalog_items where id=eid and business_id=bid) then raise exception 'Item not found.'; end if;
  name_value:=trim(coalesce(p_data->>'name','')); item_kind:=p_data->>'kind';
  tax_kind:=coalesce(p_data->>'tax_treatment','taxable'); rate:=coalesce((p_data->>'gst_rate_bps')::integer,0);
  price:=(p_data->>'price_paise')::bigint; hsn:=trim(coalesce(p_data->>'hsn_sac',''));
  if length(name_value) not between 1 and 180 or item_kind not in ('product','service') then raise exception 'Enter the item name and type.'; end if;
  if price is null or price<0 or price>9000000000000 or rate<0 or rate>10000 then raise exception 'Enter a valid price and GST rate.'; end if;
  if tax_kind not in ('taxable','exempt','nil_rated','non_gst') then raise exception 'Choose a valid tax treatment.'; end if;
  if tax_kind<>'taxable' then rate:=0; end if;
  if hsn<>'' and (hsn!~'^[0-9]{4,8}$' or (item_kind='service' and length(hsn)<>6)) then raise exception 'Use a 4–8 digit HSN or a 6 digit SAC.'; end if;
  insert into public.catalog_items(id,business_id,name,kind,sku,hsn_sac,unit,price_paise,tax_treatment,gst_rate_bps,active)
  values(coalesce(eid,gen_random_uuid()),bid,name_value,item_kind,left(coalesce(p_data->>'sku',''),80),hsn,left(coalesce(nullif(p_data->>'unit',''),'Nos'),30),price,tax_kind,rate,coalesce((p_data->>'active')::boolean,true))
  on conflict(id) do update set name=excluded.name,kind=excluded.kind,sku=excluded.sku,hsn_sac=excluded.hsn_sac,unit=excluded.unit,price_paise=excluded.price_paise,tax_treatment=excluded.tax_treatment,gst_rate_bps=excluded.gst_rate_bps,active=excluded.active returning * into it;
  insert into public.audit_events(business_id,actor_id,action,entity_id) values(bid,auth.uid(),p_action,it.id);
  return to_jsonb(it);
 elsif p_action='invoice_save' then
  request_key:=(p_data->>'client_key')::uuid;
  if request_key is null then raise exception 'Missing request identifier.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(bid::text||request_key::text,0));
  if eid is null then select id into eid from public.invoices where business_id=bid and client_key=request_key; end if;
  if eid is not null then
   select * into inv from public.invoices where id=eid and business_id=bid for update;
   if inv.id is null or inv.status<>'draft' then raise exception 'Only drafts can be edited. Issued invoices are preserved.'; end if;
   request_key:=inv.client_key;
  end if;
  select * into c from public.customers where id=(p_data->>'customer_id')::uuid and business_id=bid;
  if c.id is null then raise exception 'Choose a customer from this business.'; end if;
  issue_day:=(p_data->>'issue_date')::date; due_day:=(p_data->>'due_date')::date; supply:=p_data->>'place_of_supply';
  if issue_day is null or due_day is null or issue_day>today or issue_day<date '2000-01-01' or due_day<issue_day then raise exception 'Check the invoice and due dates. The invoice date cannot be in the future.'; end if;
  if supply is null or supply!~'^[0-9]{2}$' then raise exception 'Choose a place of supply.'; end if;
  if jsonb_typeof(p_data->'lines') is distinct from 'array' or jsonb_array_length(p_data->'lines') not between 1 and 200 then raise exception 'Add between 1 and 200 invoice lines.'; end if;
  for rec in select value from jsonb_array_elements(p_data->'lines') loop
   if nullif(rec->>'item_id','') is not null and not exists(select 1 from public.catalog_items where id=(rec->>'item_id')::uuid and business_id=bid) then raise exception 'An item belongs to another business or no longer exists.'; end if;
   qty:=(rec->>'quantity_milli')::bigint; price:=(rec->>'price_paise')::bigint;
   disc:=coalesce((rec->>'discount_bps')::integer,0); rate:=coalesce((rec->>'gst_rate_bps')::integer,0);
   description_value:=trim(coalesce(rec->>'description','')); tax_kind:=rec->>'tax_treatment'; item_kind:=rec->>'kind'; hsn:=coalesce(rec->>'hsn_sac','');
   if qty is null or price is null or qty<=0 or qty>1000000000 or price<0 or price>9000000000000 or disc<0 or disc>10000 or rate<0 or rate>10000 then raise exception 'Check the quantity, price, discount and GST rate on each line.'; end if;
   if length(description_value) not between 1 and 300 or item_kind is null or item_kind not in ('product','service') or tax_kind is null or tax_kind not in ('taxable','exempt','nil_rated','non_gst') then raise exception 'Each line needs a description, item type and tax treatment.'; end if;
   if b.registration<>'regular' or tax_kind<>'taxable' then rate:=0; end if;
   if b.registration='regular' and tax_kind='taxable' then has_taxable:=true; else has_exempt:=true; end if;
   if round(qty::numeric*price/1000)>9000000000000 then raise exception 'The line amount is too large.'; end if;
   base:=round(qty::numeric*price/1000); discount_amount:=round(base::numeric*disc/10000); taxable:=base-discount_amount;
   cg:=0; sg:=0; ig:=0;
   if supply=b.state_code then cg:=round(taxable::numeric*rate/20000); sg:=cg; else ig:=round(taxable::numeric*rate/10000); end if;
   line_total:=taxable+cg+sg+ig;
   out_lines:=out_lines||jsonb_build_array(jsonb_build_object('item_id',nullif(rec->>'item_id',''),'description',description_value,'kind',item_kind,'hsn_sac',hsn,'unit',left(coalesce(rec->>'unit','Nos'),30),'quantity_milli',qty,'price_paise',price,'discount_bps',disc,'tax_treatment',tax_kind,'gst_rate_bps',rate,'subtotal_paise',base,'discount_paise',discount_amount,'taxable_paise',taxable,'cgst_paise',cg,'sgst_paise',sg,'igst_paise',ig,'total_paise',line_total));
   sub_total:=sub_total+base; disc_total:=disc_total+discount_amount; taxable_total:=taxable_total+taxable; cg_total:=cg_total+cg; sg_total:=sg_total+sg; ig_total:=ig_total+ig;
  end loop;
  if taxable_total+cg_total+sg_total+ig_total>9000000000000 then raise exception 'The invoice amount is too large.'; end if;
  doc:=case when b.registration='unregistered' then 'invoice' when b.registration='composition' or not has_taxable then 'bill_of_supply' when has_exempt then 'invoice_bill_supply' else 'tax_invoice' end;
  if length(coalesce(p_data->>'notes',''))>2000 or length(coalesce(p_data->>'terms',''))>2000 then raise exception 'Notes and terms must each be under 2000 characters.'; end if;
  insert into public.invoices(id,business_id,customer_id,client_key,document_type,issue_date,due_date,place_of_supply,business_snapshot,customer_snapshot,lines,subtotal_paise,discount_paise,taxable_paise,cgst_paise,sgst_paise,igst_paise,tax_paise,total_paise,notes,terms)
  values(coalesce(eid,gen_random_uuid()),bid,c.id,request_key,doc,issue_day,due_day,supply,to_jsonb(b)-'owner_id',to_jsonb(c),out_lines,sub_total,disc_total,taxable_total,cg_total,sg_total,ig_total,cg_total+sg_total+ig_total,taxable_total+cg_total+sg_total+ig_total,coalesce(p_data->>'notes',''),coalesce(p_data->>'terms',b.invoice_terms))
  on conflict(id) do update set customer_id=excluded.customer_id,document_type=excluded.document_type,issue_date=excluded.issue_date,due_date=excluded.due_date,place_of_supply=excluded.place_of_supply,business_snapshot=excluded.business_snapshot,customer_snapshot=excluded.customer_snapshot,lines=excluded.lines,subtotal_paise=excluded.subtotal_paise,discount_paise=excluded.discount_paise,taxable_paise=excluded.taxable_paise,cgst_paise=excluded.cgst_paise,sgst_paise=excluded.sgst_paise,igst_paise=excluded.igst_paise,tax_paise=excluded.tax_paise,total_paise=excluded.total_paise,notes=excluded.notes,terms=excluded.terms,updated_at=now() returning * into inv;
  insert into public.audit_events(business_id,actor_id,action,entity_id) values(bid,auth.uid(),p_action,inv.id);
  return to_jsonb(inv);
 elsif p_action in ('invoice_issue','invoice_cancel','payment_add') then
  select * into inv from public.invoices where id=eid and business_id=bid for update;
  if inv.id is null then raise exception 'Invoice not found.'; end if;
  if p_action='invoice_issue' then
   if inv.status='issued' then return to_jsonb(inv); end if;
   if inv.status<>'draft' then raise exception 'Only a draft can be issued.'; end if;
   if inv.business_snapshot is distinct from (to_jsonb(b)-'owner_id') then raise exception 'Business details changed. Edit and save the draft again before issuing it.'; end if;
   if trim(inv.business_snapshot->>'address')='' or trim(inv.customer_snapshot->>'address')='' then raise exception 'Add the business and customer addresses before issuing an invoice.'; end if;
   if inv.business_snapshot->>'registration'<>'unregistered' then
    if inv.business_snapshot->>'gstin'='' then raise exception 'A GSTIN is required before issuing a GST document.'; end if;
    if exists(select 1 from jsonb_array_elements(inv.lines) l where coalesce(l->>'hsn_sac','')!~'^[0-9]{4,8}$' or (l->>'kind'='service' and length(l->>'hsn_sac')<>6)) then raise exception 'Add HSN/SAC codes to every line for a registered business.'; end if;
   end if;
   if inv.business_snapshot->>'registration'='regular' and exists(select 1 from jsonb_array_elements(inv.lines) l where l->>'tax_treatment'='taxable' and (l->>'gst_rate_bps')::integer=0) then raise exception 'Enter the applicable GST rate, or choose a nil-rated/exempt tax treatment. Export and reverse-charge invoices are not supported in this version.'; end if;
   if inv.document_type='invoice_bill_supply' and inv.customer_snapshot->>'gstin'<>'' then raise exception 'Use separate invoices for taxable and exempt supplies to a GST-registered customer.'; end if;
   fy_year:=extract(year from inv.issue_date)::integer-case when extract(month from inv.issue_date)<4 then 1 else 0 end;
   fy:=fy_year::text||'-'||right((fy_year+1)::text,2); fy_short:=right(fy_year::text,2)||'-'||right((fy_year+1)::text,2);
   insert into billing_private.invoice_counters(business_id,financial_year,next_number) values(bid,fy,1) on conflict do nothing;
   update billing_private.invoice_counters set next_number=next_number+1 where business_id=bid and financial_year=fy returning next_number-1 into serial;
   if serial>999999 then raise exception 'This invoice series has reached its number limit.'; end if;
   no_value:=case when inv.document_type='bill_of_supply' then 'BOS' else 'INV' end||'/'||fy_short||'/'||lpad(serial::text,greatest(4,length(serial::text)),'0');
   update public.invoices set status='issued',invoice_no=no_value,financial_year=fy,issued_at=now(),updated_at=now() where id=inv.id returning * into inv;
  elsif p_action='invoice_cancel' then
   if inv.status<>'issued' or inv.paid_paise<>0 then raise exception 'Only an unpaid issued invoice can be cancelled. Reverse its payments first.'; end if;
   if length(trim(coalesce(p_data->>'reason','')))<3 then raise exception 'Enter a cancellation reason.'; end if;
   update public.invoices set status='cancelled',cancelled_at=now(),cancellation_reason=left(trim(p_data->>'reason'),1000),updated_at=now() where id=inv.id returning * into inv;
  else
   request_key:=(p_data->>'client_key')::uuid;
   if request_key is null then raise exception 'Missing payment request identifier.'; end if;
   select * into pay from public.payments where business_id=bid and client_key=request_key;
   if pay.id is not null then
    if pay.invoice_id<>inv.id or pay.amount_paise<>(p_data->>'amount_paise')::bigint then raise exception 'Payment identifier already used. Refresh and try again.'; end if;
    return to_jsonb(pay);
   end if;
   amount:=(p_data->>'amount_paise')::bigint; day_value:=(p_data->>'payment_date')::date;
   if inv.status<>'issued' then raise exception 'Issue the invoice before recording a payment.'; end if;
   if amount is null or amount<=0 or amount>inv.total_paise-inv.paid_paise then raise exception 'Payment must be greater than zero and no more than the balance due.'; end if;
   if day_value is null or day_value<inv.issue_date or day_value>today then raise exception 'Payment date must be between the invoice date and today.'; end if;
   insert into public.payments(business_id,invoice_id,client_key,amount_paise,payment_date,method,reference)
   values(bid,inv.id,request_key,amount,day_value,p_data->>'method',left(coalesce(p_data->>'reference',''),200)) returning * into pay;
   update public.invoices set paid_paise=paid_paise+amount,updated_at=now() where id=inv.id;
   insert into public.audit_events(business_id,actor_id,action,entity_id,details) values(bid,auth.uid(),p_action,pay.id,jsonb_build_object('invoice_id',inv.id,'amount_paise',amount));
   return to_jsonb(pay);
  end if;
  insert into public.audit_events(business_id,actor_id,action,entity_id,details) values(bid,auth.uid(),p_action,inv.id,jsonb_build_object('invoice_no',inv.invoice_no,'reason',p_data->>'reason'));
  return to_jsonb(inv);
 elsif p_action='payment_reverse' then
  select * into pay from public.payments where id=eid and business_id=bid;
  if pay.id is null then raise exception 'Payment not found.'; end if;
  select * into inv from public.invoices where id=pay.invoice_id and business_id=bid for update;
  select * into pay from public.payments where id=eid and business_id=bid for update;
  if pay.reversed_at is not null then raise exception 'This payment has already been reversed.'; end if;
  if length(trim(coalesce(p_data->>'reason','')))<3 then raise exception 'Enter a reversal reason.'; end if;
  update public.payments set reversed_at=now(),reversal_reason=left(trim(p_data->>'reason'),1000) where id=pay.id returning * into pay;
  update public.invoices set paid_paise=paid_paise-pay.amount_paise,updated_at=now() where id=inv.id;
  insert into public.audit_events(business_id,actor_id,action,entity_id,details) values(bid,auth.uid(),p_action,pay.id,jsonb_build_object('reason',p_data->>'reason'));
  return to_jsonb(pay);
 else raise exception 'Unknown billing action.';
 end if;
end $$;
revoke all on function billing_private.require_business(uuid) from public,anon,authenticated;
revoke all on function billing_private.write_action(text,jsonb) from public,anon;
grant execute on function billing_private.write_action(text,jsonb) to authenticated;

create function public.billing_action(p_action text,p_data jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select billing_private.write_action(p_action,p_data); $$;
revoke all on function public.billing_action(text,jsonb) from public,anon;
grant execute on function public.billing_action(text,jsonb) to authenticated;

create function public.billing_dashboard(p_business_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb; today date:=(now() at time zone 'Asia/Kolkata')::date;
begin
 if not exists(select 1 from public.businesses where id=p_business_id and owner_id=auth.uid()) then raise exception 'Business not found or access denied.' using errcode='42501'; end if;
 select jsonb_build_object(
  'sales_month_paise',coalesce(sum(total_paise) filter(where status='issued' and issue_date>=date_trunc('month',today)),0),
  'receivable_paise',coalesce(sum(total_paise-paid_paise) filter(where status='issued'),0),
  'overdue_paise',coalesce(sum(total_paise-paid_paise) filter(where status='issued' and due_date<today),0),
  'issued_count',count(*) filter(where status='issued'),
  'draft_count',count(*) filter(where status='draft'),
  'gst_month_paise',coalesce(sum(tax_paise) filter(where status='issued' and issue_date>=date_trunc('month',today)),0)
 ) into result from public.invoices where business_id=p_business_id;
 result:=result||jsonb_build_object('customers', (select count(*) from public.customers where business_id=p_business_id),
 'items',(select count(*) from public.catalog_items where business_id=p_business_id and active),
 'collected_month_paise',(select coalesce(sum(amount_paise),0) from public.payments where business_id=p_business_id and reversed_at is null and payment_date>=date_trunc('month',today)),
 'months',(select jsonb_agg(jsonb_build_object('month',to_char(m.month,'Mon'),'total_paise',(select coalesce(sum(i.total_paise),0) from public.invoices i where i.business_id=p_business_id and i.status='issued' and i.issue_date>=m.month and i.issue_date<m.month+interval '1 month')) order by m.month) from generate_series(date_trunc('month',today)-interval '5 months',date_trunc('month',today),interval '1 month') m(month)));
 return result;
end $$;
revoke all on function public.billing_dashboard(uuid) from public,anon;
grant execute on function public.billing_dashboard(uuid) to authenticated;

create function public.billing_invoices(p_business_id uuid,p_page integer default 1,p_status text default 'all',p_query text default '') returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare output jsonb; today date:=(now() at time zone 'Asia/Kolkata')::date;
begin
 if not exists(select 1 from public.businesses where id=p_business_id and owner_id=auth.uid()) then raise exception 'Business not found or access denied.' using errcode='42501'; end if;
 if p_page not between 1 and 10000 then raise exception 'Invalid page.'; end if;
 if p_status not in ('all','draft','issued','cancelled','paid','partial','unpaid','overdue') then raise exception 'Invalid invoice status.'; end if;
 with filtered as (
  select * from public.invoices where business_id=p_business_id
  and (coalesce(p_query,'')='' or invoice_no ilike '%'||p_query||'%' or customer_snapshot->>'name' ilike '%'||p_query||'%')
  and case p_status when 'all' then true when 'draft' then status='draft' when 'issued' then status='issued' when 'cancelled' then status='cancelled'
   when 'paid' then status='issued' and paid_paise=total_paise
   when 'partial' then status='issued' and paid_paise>0 and paid_paise<total_paise
   when 'unpaid' then status='issued' and paid_paise=0 and total_paise>0
   when 'overdue' then status='issued' and due_date<today and paid_paise<total_paise else false end
 ), paged as (select * from filtered order by issue_date desc,created_at desc limit 30 offset (p_page-1)*30)
 select jsonb_build_object('data',coalesce((select jsonb_agg(to_jsonb(p) order by p.issue_date desc,p.created_at desc) from paged p),'[]'::jsonb),'count',(select count(*) from filtered),'page',p_page,'page_size',30) into output;
 return output;
end $$;
revoke all on function public.billing_invoices(uuid,integer,text,text) from public,anon;
grant execute on function public.billing_invoices(uuid,integer,text,text) to authenticated;

create function public.billing_report(p_business_id uuid,p_from date,p_to date) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.businesses where id=p_business_id and owner_id=auth.uid()) then raise exception 'Business not found or access denied.' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Choose a date range of up to one year.'; end if;
 with filtered as(select * from public.invoices where business_id=p_business_id and status='issued' and issue_date between p_from and p_to),
 limited as(select * from filtered order by issue_date,invoice_no limit 10000)
 select jsonb_build_object('summary',jsonb_build_object('count',count(*),'taxable_paise',coalesce(sum(taxable_paise),0),'cgst_paise',coalesce(sum(cgst_paise),0),'sgst_paise',coalesce(sum(sgst_paise),0),'igst_paise',coalesce(sum(igst_paise),0),'total_paise',coalesce(sum(total_paise),0),'paid_paise',coalesce(sum(paid_paise),0),'due_paise',coalesce(sum(total_paise-paid_paise),0)),
 'rows',coalesce((select jsonb_agg(to_jsonb(l) order by l.issue_date,l.invoice_no) from limited l),'[]'::jsonb),'truncated',count(*)>10000) into result from filtered;
 result:=result||jsonb_build_object('receipts_in_period_paise',(select coalesce(sum(amount_paise),0) from public.payments where business_id=p_business_id and reversed_at is null and payment_date between p_from and p_to));
 return result;
end $$;
revoke all on function public.billing_report(uuid,date,date) from public,anon;
grant execute on function public.billing_report(uuid,date,date) to authenticated;
commit;
