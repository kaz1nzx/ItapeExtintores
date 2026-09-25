-- Integration checks with a synthetic account, entirely rolled back.
-- Does not read or change any existing authentication account or business row.
-- Requires database/upgrade.sql (multi-item batches and the validity calendar).
begin;
select set_config('itape.test_uid', gen_random_uuid()::text, true);
select set_config('itape.test_product', gen_random_uuid()::text, true);
select set_config('itape.test_purchase', gen_random_uuid()::text, true);
insert into auth.users(id, aud, role, email)
values(current_setting('itape.test_uid')::uuid, 'authenticated', 'authenticated', 'itape-transaction-test-' || current_setting('itape.test_uid') || '@example.invalid');
-- New accounts wait for activation; this fixture starts active.
insert into itape_private.subscriptions(owner_id, status) values(current_setting('itape.test_uid')::uuid, 'active');
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('itape.test_uid'), 'role', 'authenticated', 'email', 'fixture@example.invalid')::text, true);
set local role authenticated;
do $$
declare
  s jsonb;
  cmd jsonb;
  p uuid := current_setting('itape.test_product')::uuid;
  purchase_id uuid := current_setting('itape.test_purchase')::uuid;
  sale_id uuid := gen_random_uuid();
  manual_id uuid := gen_random_uuid();
  d text := (now() at time zone 'America/Sao_Paulo')::date::text;
  blocked boolean;
begin
  s := public.itape_state();
  if (s->>'version')::int <> 0 or jsonb_array_length(s->'products') <> 0 then raise exception 'Test failed: isolated empty state'; end if;
  s := public.itape_command(jsonb_build_object('kind','product','name','Fixture extinguisher','sku','FIXTURE-001','type','Pó ABC','capacity','4 kg','cost',6200,'price',11000,'tax',12,'minimum',5), p, 0);
  if (s->>'version')::int <> 1 then raise exception 'Test failed: create product'; end if;
  cmd := jsonb_build_object('kind','purchase','productId',p,'quantity',10,'unitPrice',6200,'date',d,'party','Fixture supplier');
  s := public.itape_command(cmd, purchase_id, 1);
  if (s->'products'->0->>'stock')::int <> 10 then raise exception 'Test failed: purchase'; end if;
  s := public.itape_command(cmd, purchase_id, 1);
  if (s->>'version')::int <> 2 or jsonb_array_length(s->'movements') <> 1 then raise exception 'Test failed: idempotency'; end if;
  blocked := false;
  begin perform public.itape_command(cmd, gen_random_uuid(), 1); exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Test failed: stale version accepted'; end if;
  blocked := false;
  begin perform public.itape_command(jsonb_build_object('kind','sale','productId',p,'quantity',11,'unitPrice',11000,'date',d,'party','Fixture client'), gen_random_uuid(), 2); exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Test failed: oversell accepted'; end if;
  s := public.itape_state();
  if (s->'products'->0->>'stock')::int <> 10 then raise exception 'Test failed: rollback'; end if;
  s := public.itape_command(jsonb_build_object('kind','sale','productId',p,'quantity',3,'unitPrice',11000,'date',d,'party','Fixture client'), sale_id, 2);
  if (s->'products'->0->>'stock')::int <> 7 then raise exception 'Test failed: sale'; end if;
  s := public.itape_command(jsonb_build_object('kind','purchase','productId',p,'quantity',7,'unitPrice',8200,'date',d,'party','Fixture supplier'), gen_random_uuid(), 3);
  if (s->'products'->0->>'cost')::int <> 7200 then raise exception 'Test failed: weighted cost'; end if;
  if not exists(select 1 from public.itape_movements where id = sale_id and unit_cost = 6200 and tax = 12) then raise exception 'Test failed: historical cost changed'; end if;
  blocked := false;
  begin update public.itape_products set stock = 999 where id = p; exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Test failed: direct stock update accepted'; end if;
  -- Validity calendar: the sale above already scheduled its 12-month expiry.
  s := public.itape_state();
  if coalesce(jsonb_array_length(s->'validities'), -1) <> 1 or s->'validities'->0->>'movementId' <> sale_id::text or s->'validities'->0->>'dueDate' <> ((d::date + interval '12 months')::date)::text then raise exception 'Test failed: sale schedules validity'; end if;
  s := public.itape_command(jsonb_build_object('kind','batch','operation','sale','date',d,'party','Fixture batch client','phone','(11) 3000-0000','items',jsonb_build_array(jsonb_build_object('productId',p,'quantity',1,'unitPrice',11000),jsonb_build_object('productId',p,'quantity',2,'unitPrice',10500))), gen_random_uuid(), 4);
  if (s->'products'->0->>'stock')::int <> 11 or jsonb_array_length(s->'movements') <> 5 or coalesce(jsonb_array_length(s->'validities'), -1) <> 3 then raise exception 'Test failed: batch sale'; end if;
  s := public.itape_command(jsonb_build_object('kind','sale','productId',p,'quantity',1,'unitPrice',11000,'date',d,'party','Untracked client','track',false), gen_random_uuid(), 5);
  if coalesce(jsonb_array_length(s->'validities'), -1) <> 3 then raise exception 'Test failed: untracked sale scheduled a validity'; end if;
  s := public.itape_command(jsonb_build_object('kind','validity','client','Fixture recharge','item','Extintor CO2 · 6 kg','quantity',4,'startDate',d), manual_id, 6);
  s := public.itape_command(jsonb_build_object('kind','validity_renew','validityId',manual_id,'date',d), gen_random_uuid(), 7);
  if (select status from public.itape_validities where id = manual_id) <> 'renewed' or (select count(*) from public.itape_validities where client = 'Fixture recharge' and status = 'pending') <> 1 then raise exception 'Test failed: renewal'; end if;
  blocked := false;
  begin perform public.itape_command(jsonb_build_object('kind','validity_renew','validityId',manual_id,'date',d), gen_random_uuid(), 8); exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Test failed: validity renewed twice'; end if;
  s := public.itape_command(jsonb_build_object('kind','validity_dismiss','validityId',(select id from public.itape_validities where client = 'Fixture batch client' and status = 'pending' limit 1)), gen_random_uuid(), 8);
  if (select count(*) from public.itape_validities where status = 'dismissed') <> 1 then raise exception 'Test failed: dismissal'; end if;
  blocked := false;
  begin update public.itape_validities set due_date = d::date where true; exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Test failed: direct validity update accepted'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
  blocked := false;
  begin perform public.itape_state(); exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Test failed: account without activation read state'; end if;
  if exists(select 1 from public.itape_products) or exists(select 1 from public.itape_movements) or exists(select 1 from public.itape_validities) then raise exception 'Test failed: RLS isolation'; end if;
end;
$$;
reset role;
set local role anon;
do $$
declare blocked boolean := false;
begin
  begin perform public.itape_state(); exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Test failed: anonymous access accepted'; end if;
end;
$$;
reset role;
-- Subscriptions: a suspended account neither reads nor writes; only the admin manages them.
select set_config('itape.test_admin', gen_random_uuid()::text, true);
insert into auth.users(id, aud, role, email)
values(current_setting('itape.test_admin')::uuid, 'authenticated', 'authenticated', 'itape-admin-test-' || current_setting('itape.test_admin') || '@example.invalid');
insert into itape_private.admins(user_id) values(current_setting('itape.test_admin')::uuid);
do $$
declare
  customer uuid := current_setting('itape.test_uid')::uuid;
  admin uuid := current_setting('itape.test_admin')::uuid;
  o jsonb;
  s jsonb;
  account jsonb;
  blocked boolean;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', customer, 'role', 'authenticated')::text, true);
  if not public.itape_access() @> '{"active": true, "admin": false, "status": "active", "paidUntil": null}'::jsonb then raise exception 'Test failed: customer access'; end if;
  blocked := false;
  begin perform public.itape_admin_overview(); exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Test failed: customer opened admin overview'; end if;
  blocked := false;
  begin perform public.itape_admin_command(jsonb_build_object('kind','status','accountId',customer,'status','suspended')); exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Test failed: customer ran admin command'; end if;
  blocked := false;
  begin perform 1 from itape_private.subscriptions; exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Test failed: direct subscription read'; end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin, 'role', 'authenticated')::text, true);
  if not public.itape_access() @> '{"active": true, "admin": true}'::jsonb then raise exception 'Test failed: admin access'; end if;
  o := public.itape_admin_command(jsonb_build_object('kind','status','accountId',customer,'status','suspended'));
  select a into account from jsonb_array_elements(o->'accounts') a where a->>'id' = customer::text;
  if account->>'status' <> 'suspended' or (account->>'products')::int <> 1 or (account->>'operations30')::int < 1 then raise exception 'Test failed: suspension in overview'; end if;
  if jsonb_array_length(o->'activity') <> 30 then raise exception 'Test failed: activity window'; end if;
  blocked := false;
  begin perform public.itape_admin_command(jsonb_build_object('kind','status','accountId',admin,'status','suspended')); exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Test failed: admin account suspended'; end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', customer, 'role', 'authenticated')::text, true);
  if (public.itape_access()->>'active')::boolean then raise exception 'Test failed: suspended access reported active'; end if;
  blocked := false;
  begin perform public.itape_state(); exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Test failed: suspended account read state'; end if;
  blocked := false;
  begin perform public.itape_command(jsonb_build_object('kind','expense','description','Fixture','amount',100,'date',(now() at time zone 'America/Sao_Paulo')::date), gen_random_uuid(), 9); exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Test failed: suspended account wrote'; end if;
  if exists(select 1 from public.itape_products) then raise exception 'Test failed: suspended account read a table'; end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin, 'role', 'authenticated')::text, true);
  perform public.itape_admin_command(jsonb_build_object('kind','plan','accountId',customer,'monthlyFee',14990,'paidUntil','2026-01-31','notes','  Plano mensal  '));
  o := public.itape_admin_command(jsonb_build_object('kind','payment','accountId',customer,'paidUntil','2026-01-31','reactivate',true));
  select a into account from jsonb_array_elements(o->'accounts') a where a->>'id' = customer::text;
  if account->>'paidUntil' <> '2026-02-28' or account->>'status' <> 'active' or (account->>'monthlyFee')::int <> 14990 or account->>'notes' <> 'Plano mensal' then raise exception 'Test failed: plan and payment'; end if;
  blocked := false;
  begin perform public.itape_admin_command(jsonb_build_object('kind','payment','accountId',customer,'paidUntil','2026-01-31','reactivate',true)); exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Test failed: repeated payment advanced twice'; end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', customer, 'role', 'authenticated')::text, true);
  s := public.itape_state();
  if jsonb_array_length(s->'products') <> 1 then raise exception 'Test failed: data back after reactivation'; end if;
  if not public.itape_access() @> '{"paidUntil": "2026-02-28", "monthlyFee": 14990}'::jsonb then raise exception 'Test failed: own subscription in access'; end if;
  -- Preferences: monthly goals kept per month and the average recharge price.
  if s->'settings' <> '{}'::jsonb then raise exception 'Test failed: empty settings'; end if;
  s := public.itape_command(jsonb_build_object('kind','goal','month','2026-09','amount',1800000), gen_random_uuid(), (s->>'version')::int);
  s := public.itape_command(jsonb_build_object('kind','goal','month','2026-11','amount',2500000), gen_random_uuid(), (s->>'version')::int);
  s := public.itape_command(jsonb_build_object('kind','recharge_price','amount',4500), gen_random_uuid(), (s->>'version')::int);
  if s->'settings' <> '{"goals": {"2026-09": 1800000, "2026-11": 2500000}, "rechargePrice": 4500}'::jsonb then raise exception 'Test failed: settings'; end if;
  blocked := false;
  begin perform public.itape_command(jsonb_build_object('kind','goal','month','2026-13','amount',100), gen_random_uuid(), (s->>'version')::int); exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Test failed: invalid goal month accepted'; end if;
  blocked := false;
  begin perform public.itape_command(jsonb_build_object('kind','recharge_price','amount',-1), gen_random_uuid(), (s->>'version')::int); exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Test failed: negative recharge price accepted'; end if;
  execute 'reset role';
end;
$$;
-- New accounts wait for the admin; every admin action is logged.
select set_config('itape.test_new', gen_random_uuid()::text, true);
insert into auth.users(id, aud, role, email)
values(current_setting('itape.test_new')::uuid, 'authenticated', 'authenticated', 'itape-new-test-' || current_setting('itape.test_new') || '@example.invalid');
do $$
declare
  fresh uuid := current_setting('itape.test_new')::uuid;
  admin uuid := current_setting('itape.test_admin')::uuid;
  o jsonb;
  account jsonb;
  blocked boolean;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', fresh, 'role', 'authenticated')::text, true);
  if not public.itape_access() @> '{"active": false, "status": "pending"}'::jsonb then raise exception 'Test failed: new account starts pending'; end if;
  blocked := false;
  begin perform public.itape_command(jsonb_build_object('kind','recharge_price','amount',100), gen_random_uuid(), 0); exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Test failed: pending account wrote'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin, 'role', 'authenticated')::text, true);
  o := public.itape_admin_command(jsonb_build_object('kind','plan','accountId',fresh,'monthlyFee',9900,'paidUntil',null,'notes',''));
  select a into account from jsonb_array_elements(o->'accounts') a where a->>'id' = fresh::text;
  if account->>'status' <> 'pending' then raise exception 'Test failed: editing the plan activated the account'; end if;
  o := public.itape_admin_command(jsonb_build_object('kind','status','accountId',fresh,'status','active'));
  if (select count(*) from jsonb_array_elements(o->'events') e where e->>'account' like 'itape-new-test-%') <> 2 then raise exception 'Test failed: admin events logged'; end if;
  if not exists(select 1 from jsonb_array_elements(o->'events') e where e->>'action' = 'status' and e->'details' = '{"from": "pending", "to": "active"}'::jsonb and e->>'admin' like 'itape-admin-test-%') then raise exception 'Test failed: activation event'; end if;
  blocked := false;
  begin perform 1 from itape_private.admin_events; exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Test failed: direct event read'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', fresh, 'role', 'authenticated')::text, true);
  if not public.itape_access() @> '{"active": true, "status": "active"}'::jsonb then raise exception 'Test failed: activation'; end if;
  perform public.itape_state();
  execute 'reset role';
end;
$$;
-- Data window: recent months in the snapshot, older periods and quotations on demand.
do $$
declare
  s jsonb;
  h jsonb;
  qs jsonb;
  v integer;
  p uuid := gen_random_uuid();
  old_sale uuid := gen_random_uuid();
  new_sale uuid := gen_random_uuid();
  local_today date := (now() at time zone 'America/Sao_Paulo')::date;
  window_start date := (date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date) - interval '1 month')::date;
  old date;
  sale_cmd jsonb;
  needle text;
  blocked boolean;
begin
  old := window_start - 40;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('itape.test_uid'), 'role', 'authenticated', 'email', 'fixture@example.invalid')::text, true);
  v := (public.itape_snapshot()->>'version')::int;
  perform public.itape_command(jsonb_build_object('kind','product','name','Window extinguisher','sku','WINDOW-001','type','CO₂','capacity','6 kg','cost',9000,'price',15000,'tax',10,'minimum',1), p, v);
  perform public.itape_command(jsonb_build_object('kind','purchase','productId',p,'quantity',10,'unitPrice',9000,'date',old,'party','Window supplier'), gen_random_uuid(), v + 1);
  perform public.itape_command(jsonb_build_object('kind','sale','productId',p,'quantity',2,'unitPrice',15000,'date',old + 1,'party','Cliente Antigo Janela'), old_sale, v + 2);
  perform public.itape_command(jsonb_build_object('kind','expense','description','Window rent','amount',50000,'date',old), gen_random_uuid(), v + 3);
  sale_cmd := jsonb_build_object('kind','sale','productId',p,'quantity',1,'unitPrice',15000,'date',local_today,'party','Cliente Novo Janela');
  s := public.itape_apply(sale_cmd, new_sale, v + 4);
  if s->>'since' <> window_start::text then raise exception 'Test failed: window start'; end if;
  if exists(select 1 from jsonb_array_elements(s->'movements') m where (m->>'date')::date < window_start) then raise exception 'Test failed: window leaked older movements'; end if;
  if exists(select 1 from jsonb_array_elements(s->'expenses') e where (e->>'date')::date < window_start) then raise exception 'Test failed: window leaked older expenses'; end if;
  if not exists(select 1 from jsonb_array_elements(s->'movements') m where m->>'id' = new_sale::text) then raise exception 'Test failed: window missing new sale'; end if;
  if s ? 'quotations' or s->'quotation'->>'id' <> new_sale::text or s->'quotation'->>'client' <> 'Cliente Novo Janela' then raise exception 'Test failed: apply returns only the new quotation'; end if;
  if exists(select 1 from jsonb_array_elements(s->'validities') x where x->>'status' <> 'pending' or x ? 'createdAt') then raise exception 'Test failed: window validities are pending and slim'; end if;
  if not exists(select 1 from jsonb_array_elements(s->'validities') x where x->>'client' = 'Cliente Antigo Janela') then raise exception 'Test failed: pending validity from an older sale'; end if;
  if (s->'counts'->>'sales')::int <> (select count(*) from public.itape_movements where kind = 'sale')
    or (s->'counts'->>'purchases')::int <> (select count(*) from public.itape_movements where kind = 'purchase')
    or (s->'counts'->>'quotations')::int <> (select count(*) from public.itape_quotations)
    or (s->'counts'->>'firstDate')::date > old then raise exception 'Test failed: account counts'; end if;
  if jsonb_array_length(public.itape_state()->'movements') <= jsonb_array_length(s->'movements') then raise exception 'Test failed: itape_state keeps the full history'; end if;
  -- Retrying the same request returns the same quotation without a new sale.
  s := public.itape_apply(sale_cmd, new_sale, v + 4);
  if s->'quotation'->>'id' <> new_sale::text or (select count(*) from public.itape_movements where quotation_id = new_sale) <> 1 then raise exception 'Test failed: apply retry'; end if;
  h := public.itape_history(old, window_start - 1, false);
  if jsonb_array_length(h->'movements') <> 2 or jsonb_array_length(h->'expenses') <> 1 or h ? 'quotations' then raise exception 'Test failed: history period'; end if;
  h := public.itape_history(old, window_start - 1, true);
  if not exists(select 1 from jsonb_array_elements(h->'quotations') q where q->>'id' = old_sale::text)
    or not exists(select 1 from jsonb_array_elements(h->'validities') x where x->>'client' = 'Cliente Antigo Janela' and x ? 'createdAt')
    then raise exception 'Test failed: full export period'; end if;
  blocked := false;
  begin perform public.itape_history(local_today, local_today - 1, false); exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Test failed: inverted period accepted'; end if;
  blocked := false;
  begin perform public.itape_history(local_today - 500, local_today, false); exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Test failed: oversized period accepted'; end if;
  qs := public.itape_quotations('  cliente ANTIGO ', 0);
  if (qs->>'total')::int <> 1 or qs->'items'->0->>'id' <> old_sale::text then raise exception 'Test failed: quotation search by client'; end if;
  select lpad(number::text, 4, '0') || '/' || year into needle from public.itape_quotations where id = old_sale;
  qs := public.itape_quotations(needle, 0);
  if not exists(select 1 from jsonb_array_elements(qs->'items') q where q->>'id' = old_sale::text) then raise exception 'Test failed: quotation search by number'; end if;
  qs := public.itape_quotations('', 0);
  if (qs->>'total')::int <> (select count(*) from public.itape_quotations) or jsonb_array_length(qs->'items') <> least(10, (qs->>'total')::int)
    or (qs->'items'->0->>'date')::date <> (select max(date) from public.itape_quotations) then raise exception 'Test failed: quotation list'; end if;
  if jsonb_array_length(public.itape_quotations('', 99999)->'items') <> 0 then raise exception 'Test failed: quotation page past the end'; end if;
  blocked := false;
  begin perform public.itape_quotations(repeat('x', 121), 0); exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Test failed: oversized search accepted'; end if;
  -- Accounts without access read nothing through the new functions.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  blocked := false;
  begin perform public.itape_snapshot(); exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Test failed: snapshot without access'; end if;
  blocked := false;
  begin perform public.itape_history(old, local_today, false); exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Test failed: history without access'; end if;
  blocked := false;
  begin perform public.itape_quotations('', 0); exception when raise_exception then blocked := true; end;
  if not blocked then raise exception 'Test failed: quotations without access'; end if;
  execute 'reset role';
  execute 'set local role anon';
  blocked := false;
  begin perform public.itape_snapshot(); exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Test failed: anonymous snapshot'; end if;
  execute 'reset role';
end;
$$;
select 'PASS: creation, purchase, idempotency, version conflict, oversell, rollback, sale, average cost, historical snapshot, direct write denial, multi-item batch, validity scheduling, renewal, dismissal, owner isolation, anonymous denial, subscription suspension, admin-only management, payment retry, own subscription notice, sales goals, recharge price, activation required, admin audit log, data window, history periods, quotation search' as verification;
rollback;
