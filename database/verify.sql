-- Integration checks with a synthetic account, entirely rolled back.
-- Does not read or change any existing authentication account or business row.
-- Requires database/upgrade.sql (multi-item batches and the validity calendar).
begin;
select set_config('itape.test_uid', gen_random_uuid()::text, true);
select set_config('itape.test_product', gen_random_uuid()::text, true);
select set_config('itape.test_purchase', gen_random_uuid()::text, true);
insert into auth.users(id, aud, role, email)
values(current_setting('itape.test_uid')::uuid, 'authenticated', 'authenticated', 'itape-transaction-test-' || current_setting('itape.test_uid') || '@example.invalid');
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
  s := public.itape_state();
  if jsonb_array_length(s->'products') <> 0 or jsonb_array_length(s->'movements') <> 0 or coalesce(jsonb_array_length(s->'validities'), -1) <> 0 then raise exception 'Test failed: RLS isolation'; end if;
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
select 'PASS: creation, purchase, idempotency, version conflict, oversell, rollback, sale, average cost, historical snapshot, direct write denial, multi-item batch, validity scheduling, renewal, dismissal, owner isolation, anonymous denial' as verification;
rollback;
