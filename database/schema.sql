-- Itapê Extintores. Monetary values are integer cents; taxes are percentages.
-- No existing objects are removed and no sample business data is inserted.
create schema if not exists itape_private;
revoke all on schema itape_private from public, anon;
grant usage on schema itape_private to authenticated;

create table public.itape_accounts (
  owner_id uuid primary key references auth.users(id),
  version integer not null default 0
);
create table public.itape_products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null check (length(trim(name)) between 1 and 120),
  sku text not null check (length(trim(sku)) between 1 and 120),
  type text not null check (length(trim(type)) between 1 and 120),
  capacity text not null check (length(trim(capacity)) between 1 and 120),
  cost bigint not null check (cost between 0 and 100000000),
  price bigint not null check (price between 0 and 100000000),
  tax numeric(5,2) not null check (tax between 0 and 100),
  stock integer not null default 0 check (stock between 0 and 100000),
  minimum integer not null default 5 check (minimum between 0 and 100000),
  active boolean not null default true,
  unique(owner_id, id)
);
create unique index itape_products_owner_sku on public.itape_products(owner_id, lower(sku));
create table public.itape_movements (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  product_id uuid not null,
  product_name text not null,
  kind text not null check (kind in ('sale', 'purchase')),
  quantity integer not null check (quantity between 1 and 100000),
  unit_price bigint not null check (unit_price between 0 and 100000000),
  unit_cost bigint not null check (unit_cost between 0 and 100000000),
  tax numeric(5,2) not null check (tax between 0 and 100),
  date date not null,
  party text not null check (length(trim(party)) between 1 and 120),
  actor text not null,
  created_at timestamptz not null default now(),
  foreign key(owner_id, product_id) references public.itape_products(owner_id, id)
);
create index itape_movements_owner_date on public.itape_movements(owner_id, date desc);
create index itape_movements_product_date on public.itape_movements(owner_id, product_id, date desc);
create table public.itape_expenses (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  description text not null check (length(trim(description)) between 1 and 120),
  amount bigint not null check (amount between 1 and 100000000),
  date date not null,
  actor text not null,
  created_at timestamptz not null default now()
);
create index itape_expenses_owner_date on public.itape_expenses(owner_id, date desc);
create table itape_private.requests (
  owner_id uuid not null references auth.users(id),
  request_id uuid not null,
  command jsonb not null,
  created_at timestamptz not null default now(),
  primary key(owner_id, request_id)
);
alter table public.itape_accounts enable row level security;
alter table public.itape_products enable row level security;
alter table public.itape_movements enable row level security;
alter table public.itape_expenses enable row level security;
alter table itape_private.requests enable row level security;
create policy deny_direct_access on itape_private.requests for all to authenticated using (false) with check (false);
create policy owner_read on public.itape_accounts for select to authenticated using (owner_id = (select auth.uid()));
create policy owner_read on public.itape_products for select to authenticated using (owner_id = (select auth.uid()));
create policy owner_read on public.itape_movements for select to authenticated using (owner_id = (select auth.uid()));
create policy owner_read on public.itape_expenses for select to authenticated using (owner_id = (select auth.uid()));
revoke all on public.itape_accounts, public.itape_products, public.itape_movements, public.itape_expenses from anon, authenticated;
grant select on public.itape_accounts, public.itape_products, public.itape_movements, public.itape_expenses to authenticated;
revoke all on itape_private.requests from anon, authenticated;

create function public.itape_state() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'version', coalesce((select version from public.itape_accounts where owner_id = (select auth.uid())), 0),
    'products', coalesce((select jsonb_agg(to_jsonb(p) - 'owner_id' order by p.sku) from public.itape_products p where owner_id = (select auth.uid())), '[]'::jsonb),
    'movements', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'productId', m.product_id, 'productName', m.product_name, 'kind', m.kind, 'quantity', m.quantity, 'unitPrice', m.unit_price, 'unitCost', m.unit_cost, 'tax', m.tax, 'date', m.date, 'party', m.party, 'actor', m.actor, 'createdAt', m.created_at) order by m.date, m.created_at) from public.itape_movements m where owner_id = (select auth.uid())), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'description', e.description, 'amount', e.amount, 'date', e.date, 'actor', e.actor, 'createdAt', e.created_at) order by e.date, e.created_at) from public.itape_expenses e where owner_id = (select auth.uid())), '[]'::jsonb)
  );
$$;

-- A narrowly scoped definer is required because clients must NOT write directly
-- to ledger tables or change stock independently of a transaction. It is private,
-- verifies auth.uid(), filters every object by owner, and has a fixed search path.
create function itape_private.apply_command(command jsonb, request_id uuid, expected_version integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  k text := command->>'kind';
  p public.itape_products%rowtype;
  pid uuid;
  q integer;
  price_cents bigint;
  movement_date date;
  last_date date;
  current_version integer;
  old_command jsonb;
  actor_name text;
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
  if k = 'product' then
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
  elsif k in ('sale', 'purchase', 'expense') then
    movement_date := (command->>'date')::date;
    if movement_date is null or movement_date > (now() at time zone 'America/Sao_Paulo')::date or movement_date < '2000-01-01'::date then raise exception 'Data inválida.'; end if;
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
      insert into public.itape_movements(id, owner_id, product_id, product_name, kind, quantity, unit_price, unit_cost, tax, date, party, actor)
      values(request_id, uid, p.id, p.name, k, q, price_cents, case when k = 'sale' then p.cost else price_cents end, case when k = 'sale' then p.tax else 0 end, movement_date, trim(command->>'party'), actor_name);
      if k = 'sale' then
        update public.itape_products set stock = stock - q where id = p.id and owner_id = uid;
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
create function public.itape_command(command jsonb, request_id uuid, expected_version integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  perform itape_private.apply_command(command, request_id, expected_version);
  return public.itape_state();
end;
$$;
revoke all on function public.itape_state() from public, anon;
revoke all on function public.itape_command(jsonb, uuid, integer) from public, anon;
revoke all on function itape_private.apply_command(jsonb, uuid, integer) from public, anon;
grant execute on function public.itape_state(), public.itape_command(jsonb, uuid, integer), itape_private.apply_command(jsonb, uuid, integer) to authenticated;
