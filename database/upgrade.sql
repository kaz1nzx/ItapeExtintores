-- ExtinPro · atualização cumulativa do banco.
--
-- Execute no SQL Editor do projeto Supabase já configurado (em um banco novo,
-- rode antes o database/schema.sql). Pode ser executado mais de uma vez: cria
-- só o que falta e substitui as funções pela versão atual. Nenhuma tabela,
-- política ou dado existente é removido.
--
-- Inclui:
--   1. Compras e vendas com vários produtos na mesma remessa (comando 'batch').
--   2. Calendário de validades: cada venda agenda o vencimento de 12 meses dos
--      extintores do cliente, com registro manual, renovação e dispensa.
--   3. Lembretes livres por data, com observações e conclusão.
--   4. Orçamentos numerados e preservados junto de cada venda.
--   5. Cadastro da empresa por conta, preservado nos novos orçamentos.

alter table public.itape_accounts add column if not exists company jsonb
  check (company is null or jsonb_typeof(company) = 'object');

create table if not exists public.itape_quotations (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  number integer not null check (number > 0),
  year integer not null,
  date date not null check (extract(year from date) = year),
  client text not null check (length(trim(client)) between 1 and 120),
  phone text not null default '' check (length(phone) <= 30 and phone ~ '^[0-9+(). -]*$'),
  payment_terms text not null check (length(trim(payment_terms)) between 1 and 240),
  notes text not null default '' check (length(notes) <= 1000),
  company jsonb not null check (jsonb_typeof(company) = 'object'),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 20),
  created_at timestamptz not null default now(),
  unique(owner_id, year, number)
);
alter table public.itape_quotations enable row level security;
do $$
begin
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'itape_quotations' and policyname = 'owner_read') then
    create policy owner_read on public.itape_quotations for select to authenticated using (owner_id = (select auth.uid()));
  end if;
end;
$$;
revoke all on public.itape_quotations from anon, authenticated;
grant select on public.itape_quotations to authenticated;
alter table public.itape_movements add column if not exists quotation_id uuid references public.itape_quotations(id);
create index if not exists itape_movements_quotation on public.itape_movements(quotation_id);

create table if not exists public.itape_reminders (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  title text not null check (length(trim(title)) between 1 and 120),
  date date not null check (date between '2000-01-01'::date and '2100-12-31'::date),
  notes text not null default '' check (length(notes) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'done')),
  created_at timestamptz not null default now()
);
create index if not exists itape_reminders_owner_date on public.itape_reminders(owner_id, date);
alter table public.itape_reminders enable row level security;
do $$
begin
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'itape_reminders' and policyname = 'owner_read') then
    create policy owner_read on public.itape_reminders for select to authenticated using (owner_id = (select auth.uid()));
  end if;
end;
$$;
revoke all on public.itape_reminders from anon, authenticated;
grant select on public.itape_reminders to authenticated;

create table if not exists public.itape_validities (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  client text not null check (length(trim(client)) between 1 and 120),
  phone text not null default '' check (length(phone) <= 30 and phone ~ '^[0-9+(). -]*$'),
  item text not null check (length(trim(item)) between 1 and 120),
  quantity integer not null check (quantity between 1 and 100000),
  start_date date not null,
  due_date date not null check (due_date >= start_date),
  status text not null default 'pending' check (status in ('pending', 'renewed', 'dismissed')),
  movement_id uuid references public.itape_movements(id),
  resolved_at date,
  created_at timestamptz not null default now()
);
create index if not exists itape_validities_owner_due on public.itape_validities(owner_id, due_date);
alter table public.itape_validities enable row level security;
do $$
begin
  if not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'itape_validities' and policyname = 'owner_read') then
    create policy owner_read on public.itape_validities for select to authenticated using (owner_id = (select auth.uid()));
  end if;
end;
$$;
revoke all on public.itape_validities from anon, authenticated;
grant select on public.itape_validities to authenticated;

create or replace function public.itape_state() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'version', coalesce((select version from public.itape_accounts where owner_id = (select auth.uid())), 0),
    'company', (select company from public.itape_accounts where owner_id = (select auth.uid())),
    'products', coalesce((select jsonb_agg(to_jsonb(p) - 'owner_id' order by p.sku) from public.itape_products p where owner_id = (select auth.uid())), '[]'::jsonb),
    'movements', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'quotationId', m.quotation_id, 'productId', m.product_id, 'productName', m.product_name, 'kind', m.kind, 'quantity', m.quantity, 'unitPrice', m.unit_price, 'unitCost', m.unit_cost, 'tax', m.tax, 'date', m.date, 'party', m.party, 'actor', m.actor, 'createdAt', m.created_at) order by m.date, m.created_at) from public.itape_movements m where owner_id = (select auth.uid())), '[]'::jsonb),
    'quotations', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'number', q.number, 'date', q.date, 'client', q.client, 'phone', q.phone, 'paymentTerms', q.payment_terms, 'notes', q.notes, 'company', q.company, 'items', q.items, 'createdAt', q.created_at) order by q.date, q.number) from public.itape_quotations q where owner_id = (select auth.uid())), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'description', e.description, 'amount', e.amount, 'date', e.date, 'actor', e.actor, 'createdAt', e.created_at) order by e.date, e.created_at) from public.itape_expenses e where owner_id = (select auth.uid())), '[]'::jsonb),
    'validities', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'client', v.client, 'phone', v.phone, 'item', v.item, 'quantity', v.quantity, 'startDate', v.start_date, 'dueDate', v.due_date, 'status', v.status, 'movementId', v.movement_id, 'resolvedAt', v.resolved_at, 'createdAt', v.created_at) order by v.due_date, v.created_at) from public.itape_validities v where owner_id = (select auth.uid())), '[]'::jsonb),
    'reminders', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'title', r.title, 'date', r.date, 'notes', r.notes, 'status', r.status, 'createdAt', r.created_at) order by r.date, r.created_at) from public.itape_reminders r where owner_id = (select auth.uid())), '[]'::jsonb)
  );
$$;

create or replace function itape_private.apply_command(command jsonb, request_id uuid, expected_version integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  k text := command->>'kind';
  p public.itape_products%rowtype;
  v public.itape_validities%rowtype;
  pid uuid;
  mid uuid;
  q integer;
  price_cents bigint;
  movement_date date;
  last_date date;
  current_version integer;
  old_command jsonb;
  actor_name text;
  op text;
  item jsonb;
  item_count integer;
  track boolean;
  quotation_items jsonb;
  quotation_number integer;
  local_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then raise exception 'Autenticação necessária.'; end if;
  if request_id is null or expected_version is null or command is null then raise exception 'Solicitação inválida.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text, 0));
  select r.command into old_command from itape_private.requests r where r.owner_id = uid and r.request_id = apply_command.request_id;
  if found then
    if old_command <> command then raise exception 'Identificador já utilizado por outra operação.'; end if;
    return;
  end if;
  insert into public.itape_accounts(owner_id) values(uid) on conflict do nothing;
  select version into current_version from public.itape_accounts where owner_id = uid for update;
  if current_version <> expected_version then raise exception 'Os dados mudaram. Atualize e tente novamente.'; end if;
  actor_name := coalesce(nullif(auth.jwt()->>'email', ''), uid::text);
  -- Numeração e venda compartilham o bloqueio da conta e a mesma transação.
  -- Repetir request_id retorna antes daqui, sem duplicar orçamento ou estoque.
  if k = 'sale' or (k = 'batch' and command->>'operation' = 'sale') then
    movement_date := (command->>'date')::date;
    if movement_date is null or movement_date > local_today or movement_date < '2000-01-01'::date then raise exception 'Data inválida.'; end if;
    quotation_items := '[]'::jsonb;
    for item in select value from pg_catalog.jsonb_array_elements(case when k = 'batch' then command->'items' else jsonb_build_array(command) end) loop
      select * into p from public.itape_products where id = (item->>'productId')::uuid and owner_id = uid and active;
      if not found then raise exception 'Produto não encontrado.'; end if;
      quotation_items := quotation_items || jsonb_build_array(jsonb_build_object('productId', p.id, 'name', p.name || ' · ' || p.capacity, 'quantity', (item->>'quantity')::integer, 'unitPrice', (item->>'unitPrice')::bigint));
    end loop;
    select coalesce(max(number), 0) + 1 into quotation_number from public.itape_quotations where owner_id = uid and year = extract(year from movement_date)::integer;
    insert into public.itape_quotations(id, owner_id, number, year, date, client, phone, payment_terms, notes, company, items)
    values(request_id, uid, quotation_number, extract(year from movement_date)::integer, movement_date, trim(command->>'party'), trim(coalesce(command->>'phone', '')),
      trim(coalesce(command->'quotation'->>'paymentTerms', 'PIX, Transferência Bancária, Boleto 28 dias')), trim(coalesce(command->'quotation'->>'notes', '')),
      coalesce((select company from public.itape_accounts where owner_id = uid), jsonb_build_object('name', '', 'suffix', '', 'cnpj', '', 'address', '', 'city', '', 'email', '', 'contact', '', 'phone', '')), quotation_items);
  end if;
  if k = 'company' then
    if jsonb_typeof(command->'company') is distinct from 'object' then raise exception 'Dados da empresa inválidos.'; end if;
    for item in select jsonb_build_object('field', field, 'limit', max_length)
      from (values ('name',120),('suffix',40),('cnpj',30),('address',240),('city',120),('email',254),('contact',120),('phone',30)) as fields(field,max_length)
    loop
      if jsonb_typeof(command->'company'->(item->>'field')) is distinct from 'string'
        or length(command->'company'->>(item->>'field')) > (item->>'limit')::integer
      then raise exception 'Dados da empresa inválidos.'; end if;
    end loop;
    if length(trim(command->'company'->>'name')) = 0
      or ((command->'company'->>'email') <> '' and (command->'company'->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
      or (command->'company'->>'phone') !~ '^[0-9+() .-]*$'
    then raise exception 'Confira o nome, o e-mail e o telefone da empresa.'; end if;
    update public.itape_accounts set company = (
      select jsonb_object_agg(field, trim(command->'company'->>field))
      from unnest(array['name','suffix','cnpj','address','city','email','contact','phone']) as fields(field)
    ) where owner_id = uid;
  elsif k = 'product' then
    if command->>'id' is not null then
      pid := (command->>'id')::uuid;
      select * into p from public.itape_products where id = pid and owner_id = uid and active for update;
      if not found then raise exception 'Produto não encontrado.'; end if;
      if p.stock > 0 and (command->>'cost')::bigint <> p.cost then raise exception 'O custo com estoque disponível é atualizado pelas compras.'; end if;
      update public.itape_products set name = trim(command->>'name'), sku = trim(command->>'sku'), type = trim(command->>'type'), capacity = trim(command->>'capacity'), cost = (command->>'cost')::bigint, price = (command->>'price')::bigint, tax = (command->>'tax')::numeric, minimum = (command->>'minimum')::integer where id = pid and owner_id = uid;
    else
      insert into public.itape_products(id, owner_id, name, sku, type, capacity, cost, price, tax, minimum)
      values(request_id, uid, trim(command->>'name'), trim(command->>'sku'), trim(command->>'type'), trim(command->>'capacity'), (command->>'cost')::bigint, (command->>'price')::bigint, (command->>'tax')::numeric, (command->>'minimum')::integer);
    end if;
  elsif k = 'archive' then
    select * into p from public.itape_products where id = (command->>'productId')::uuid and owner_id = uid and active for update;
    if not found then raise exception 'Produto não encontrado.'; end if;
    if p.stock <> 0 then raise exception 'Só é possível arquivar produtos sem estoque.'; end if;
    update public.itape_products set active = false where id = p.id and owner_id = uid;

  -- Remessa com vários produtos. Data e contraparte são compartilhadas; cada
  -- item entra como uma movimentação própria, e todas estão na mesma
  -- transação: ou a remessa inteira é registrada, ou nada é.
  elsif k = 'batch' then
    op := command->>'operation';
    if op is null or op not in ('sale', 'purchase') then raise exception 'Operação desconhecida.'; end if;
    movement_date := (command->>'date')::date;
    if movement_date is null or movement_date > local_today or movement_date < '2000-01-01'::date then raise exception 'Data inválida.'; end if;
    track := op = 'sale' and coalesce((command->>'track')::boolean, true);
    if pg_catalog.jsonb_typeof(command->'items') <> 'array' then raise exception 'Itens inválidos.'; end if;
    item_count := pg_catalog.jsonb_array_length(command->'items');
    if item_count < 1 or item_count > 20 then raise exception 'Informe de 1 a 20 itens.'; end if;
    for item in select value from pg_catalog.jsonb_array_elements(command->'items') loop
      q := (item->>'quantity')::integer;
      price_cents := (item->>'unitPrice')::bigint;
      if q is null or q < 1 or q > 100000 or price_cents is null or price_cents < 0 or price_cents > 100000000 then raise exception 'Quantidade ou valor inválido.'; end if;
      -- Reler o produto a cada item mantém estoque e custo médio corretos
      -- quando o mesmo produto aparece em mais de uma linha da remessa.
      select * into p from public.itape_products where id = (item->>'productId')::uuid and owner_id = uid and active for update;
      if not found then raise exception 'Produto não encontrado.'; end if;
      select max(date) into last_date from public.itape_movements where owner_id = uid and product_id = p.id;
      if movement_date < last_date then raise exception 'A data deve ser igual ou posterior à última movimentação do produto.'; end if;
      if op = 'sale' and p.stock < q then raise exception 'Estoque insuficiente de %. Disponível: % unidades.', p.name, p.stock; end if;
      mid := pg_catalog.gen_random_uuid();
      insert into public.itape_movements(id, owner_id, product_id, product_name, kind, quantity, unit_price, unit_cost, tax, date, party, actor, quotation_id)
      values(mid, uid, p.id, p.name, op, q, price_cents, case when op = 'sale' then p.cost else price_cents end, case when op = 'sale' then p.tax else 0 end, movement_date, trim(command->>'party'), actor_name, case when op = 'sale' then request_id else null end);
      if op = 'sale' then
        update public.itape_products set stock = stock - q where id = p.id and owner_id = uid;
      else
        update public.itape_products set cost = round((p.stock::numeric * p.cost + q::numeric * price_cents) / (p.stock + q)), stock = stock + q where id = p.id and owner_id = uid;
      end if;
      if track then
        insert into public.itape_validities(id, owner_id, client, phone, item, quantity, start_date, due_date, movement_id)
        values(pg_catalog.gen_random_uuid(), uid, trim(command->>'party'), trim(coalesce(command->>'phone', '')), p.name || ' · ' || p.capacity, q, movement_date, (movement_date + interval '12 months')::date, mid);
      end if;
    end loop;

  elsif k = 'reminder' then
    movement_date := (command->>'date')::date;
    if movement_date is null or movement_date < '2000-01-01'::date or movement_date > '2100-12-31'::date then raise exception 'Data inválida.'; end if;
    insert into public.itape_reminders(id, owner_id, title, date, notes)
    values(request_id, uid, trim(command->>'title'), movement_date, trim(coalesce(command->>'notes', '')));
  elsif k = 'reminder_complete' then
    update public.itape_reminders set status = 'done' where id = (command->>'reminderId')::uuid and owner_id = uid and status = 'pending';
    if not found then raise exception 'Lembrete não encontrado ou já concluído.'; end if;

  -- Validade registrada à mão (recarga ou extintor vendido fora do sistema).
  elsif k = 'validity' then
    movement_date := (command->>'startDate')::date;
    if movement_date is null or movement_date > local_today or movement_date < '2000-01-01'::date then raise exception 'Data inválida.'; end if;
    q := (command->>'quantity')::integer;
    if q is null or q < 1 or q > 100000 then raise exception 'Quantidade inválida.'; end if;
    insert into public.itape_validities(id, owner_id, client, phone, item, quantity, start_date, due_date)
    values(request_id, uid, trim(command->>'client'), trim(coalesce(command->>'phone', '')), trim(command->>'item'), q, movement_date, (movement_date + interval '12 months')::date);

  -- A recarga fecha o ciclo atual e abre o próximo, para o mesmo cliente.
  elsif k = 'validity_renew' then
    movement_date := (command->>'date')::date;
    if movement_date is null or movement_date > local_today or movement_date < '2000-01-01'::date then raise exception 'Data inválida.'; end if;
    select * into v from public.itape_validities where id = (command->>'validityId')::uuid and owner_id = uid and status = 'pending' for update;
    if not found then raise exception 'Validade não encontrada ou já resolvida.'; end if;
    if movement_date < v.start_date then raise exception 'A renovação deve ser igual ou posterior ao início da validade.'; end if;
    update public.itape_validities set status = 'renewed', resolved_at = movement_date where id = v.id and owner_id = uid;
    insert into public.itape_validities(id, owner_id, client, phone, item, quantity, start_date, due_date)
    values(request_id, uid, v.client, v.phone, v.item, v.quantity, movement_date, (movement_date + interval '12 months')::date);
  elsif k = 'validity_dismiss' then
    select * into v from public.itape_validities where id = (command->>'validityId')::uuid and owner_id = uid and status = 'pending' for update;
    if not found then raise exception 'Validade não encontrada ou já resolvida.'; end if;
    update public.itape_validities set status = 'dismissed', resolved_at = local_today where id = v.id and owner_id = uid;

  elsif k in ('sale', 'purchase', 'expense') then
    movement_date := (command->>'date')::date;
    if movement_date is null or movement_date > local_today or movement_date < '2000-01-01'::date then raise exception 'Data inválida.'; end if;
    if k = 'expense' then
      insert into public.itape_expenses(id, owner_id, description, amount, date, actor) values(request_id, uid, trim(command->>'description'), (command->>'amount')::bigint, movement_date, actor_name);
    else
      q := (command->>'quantity')::integer;
      price_cents := (command->>'unitPrice')::bigint;
      if q is null or q < 1 or q > 100000 or price_cents is null or price_cents < 0 or price_cents > 100000000 then raise exception 'Quantidade ou valor inválido.'; end if;
      select * into p from public.itape_products where id = (command->>'productId')::uuid and owner_id = uid and active for update;
      if not found then raise exception 'Produto não encontrado.'; end if;
      select max(date) into last_date from public.itape_movements where owner_id = uid and product_id = p.id;
      if movement_date < last_date then raise exception 'A data deve ser igual ou posterior à última movimentação do produto.'; end if;
      if k = 'sale' and p.stock < q then raise exception 'Estoque insuficiente.'; end if;
      insert into public.itape_movements(id, owner_id, product_id, product_name, kind, quantity, unit_price, unit_cost, tax, date, party, actor, quotation_id)
      values(request_id, uid, p.id, p.name, k, q, price_cents, case when k = 'sale' then p.cost else price_cents end, case when k = 'sale' then p.tax else 0 end, movement_date, trim(command->>'party'), actor_name, case when k = 'sale' then request_id else null end);
      if k = 'sale' then
        update public.itape_products set stock = stock - q where id = p.id and owner_id = uid;
        if coalesce((command->>'track')::boolean, true) then
          insert into public.itape_validities(id, owner_id, client, phone, item, quantity, start_date, due_date, movement_id)
          values(pg_catalog.gen_random_uuid(), uid, trim(command->>'party'), trim(coalesce(command->>'phone', '')), p.name || ' · ' || p.capacity, q, movement_date, (movement_date + interval '12 months')::date, request_id);
        end if;
      else
        update public.itape_products set cost = round((p.stock::numeric * p.cost + q::numeric * price_cents) / (p.stock + q)), stock = stock + q where id = p.id and owner_id = uid;
      end if;
    end if;
  else raise exception 'Operação desconhecida.';
  end if;
  insert into itape_private.requests(owner_id, request_id, command) values(uid, request_id, command);
  update public.itape_accounts set version = version + 1 where owner_id = uid;
end;
$$;
revoke all on function public.itape_state() from public, anon;
revoke all on function itape_private.apply_command(jsonb, uuid, integer) from public, anon;
grant execute on function public.itape_state(), itape_private.apply_command(jsonb, uuid, integer) to authenticated;
