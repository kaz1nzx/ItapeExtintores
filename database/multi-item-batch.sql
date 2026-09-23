-- Itapê Extintores · compras e vendas com vários itens na mesma remessa.
--
-- Aplique UMA vez, no SQL Editor do projeto Supabase já configurado.
-- É aditivo e seguro: substitui somente a função itape_private.apply_command,
-- acrescentando o ramo 'batch'. Nenhuma tabela, política, permissão ou dado é
-- alterado, e os comandos 'sale' e 'purchase' de item único continuam
-- funcionando exatamente como antes.
--
-- Sem esta migração o sistema segue operando; apenas o registro de mais de um
-- produto por operação é recusado com "Operação desconhecida.".

create or replace function itape_private.apply_command(command jsonb, request_id uuid, expected_version integer)
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
  op text;
  item jsonb;
  item_count integer;
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

  -- Remessa com vários produtos. Data e contraparte são compartilhadas; cada
  -- item entra como uma movimentação própria, e todas compartilham a mesma
  -- transação: ou a compra inteira é registrada, ou nada é.
  elsif k = 'batch' then
    op := command->>'operation';
    if op is null or op not in ('sale', 'purchase') then raise exception 'Operação desconhecida.'; end if;
    movement_date := (command->>'date')::date;
    if movement_date is null or movement_date > (now() at time zone 'America/Sao_Paulo')::date or movement_date < '2000-01-01'::date then raise exception 'Data inválida.'; end if;
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
      insert into public.itape_movements(id, owner_id, product_id, product_name, kind, quantity, unit_price, unit_cost, tax, date, party, actor)
      values(pg_catalog.gen_random_uuid(), uid, p.id, p.name, op, q, price_cents, case when op = 'sale' then p.cost else price_cents end, case when op = 'sale' then p.tax else 0 end, movement_date, trim(command->>'party'), actor_name);
      if op = 'sale' then
        update public.itape_products set stock = stock - q where id = p.id and owner_id = uid;
      else
        update public.itape_products set cost = round((p.stock::numeric * p.cost + q::numeric * price_cents) / (p.stock + q)), stock = stock + q where id = p.id and owner_id = uid;
      end if;
    end loop;

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
revoke all on function itape_private.apply_command(jsonb, uuid, integer) from public, anon;
grant execute on function itape_private.apply_command(jsonb, uuid, integer) to authenticated;
