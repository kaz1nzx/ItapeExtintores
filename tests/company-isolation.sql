-- Verificação transacional: nenhum usuário ou registro de teste é persistido.
begin;
do $verify$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  profile_request uuid := gen_random_uuid();
  product uuid := gen_random_uuid();
  sale uuid := gen_random_uuid();
  blank jsonb := '{"name":"Empresa A","suffix":"","cnpj":"","address":"Rua A","city":"","email":"","contact":"","phone":""}';
  cmd jsonb;
  state jsonb;
  rows_found integer;
begin
  insert into auth.users(id) values(a),(b);
  -- Contas novas aguardam ativação; as duas deste teste já começam ativas.
  insert into itape_private.subscriptions(owner_id, status) values(a, 'active'), (b, 'active');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated','is_anonymous',false)::text,true);
  execute 'set local role authenticated';
  if public.itape_state()->'company' <> 'null'::jsonb then raise exception 'New account inherited company'; end if;
  cmd := jsonb_build_object('kind','company','company',blank);
  state := public.itape_command(cmd,profile_request,0);
  if state->'company' <> blank then raise exception 'Company not saved'; end if;
  state := public.itape_command(cmd,profile_request,0);
  if (state->>'version')::integer <> 1 then raise exception 'Retry changed version'; end if;
  begin
    perform public.itape_command(jsonb_build_object('kind','company','company',jsonb_set(blank,'{name}','""')),gen_random_uuid(),1);
    raise exception 'Invalid company accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm = 'Invalid company accepted' then raise; end if;
  end;
  perform public.itape_command(jsonb_build_object('kind','product','name','Produto','sku','TEST','type','ABC','capacity','4 kg','cost',5000,'price',10000,'tax',0,'minimum',0),product,1);
  perform public.itape_command(jsonb_build_object('kind','purchase','productId',product,'quantity',2,'unitPrice',5000,'date',current_date,'party','Fornecedor'),gen_random_uuid(),2);
  state := public.itape_command(jsonb_build_object('kind','sale','productId',product,'quantity',1,'unitPrice',10000,'date',current_date,'party','Cliente','track',false),sale,3);
  if state->'quotations'->0->'company' <> blank then raise exception 'Quotation missing company snapshot'; end if;
  state := public.itape_command(jsonb_build_object('kind','company','company',jsonb_set(blank,'{name}','"Empresa A editada"')),gen_random_uuid(),4);
  if state->'quotations'->0->'company' <> blank then raise exception 'Historical quotation changed'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated','is_anonymous',false)::text,true);
  execute 'set local role authenticated';
  state := public.itape_state();
  if state->'company' <> 'null'::jsonb or jsonb_array_length(state->'quotations') <> 0 then raise exception 'Company data leaked'; end if;
  select count(*) into rows_found from public.itape_accounts where owner_id = a;
  if rows_found <> 0 then raise exception 'RLS allowed other company'; end if;
  begin
    update public.itape_accounts set company = blank where owner_id = a;
    raise exception 'Direct update permitted';
  exception when insufficient_privilege then null;
  end;
  state := public.itape_command(jsonb_build_object('kind','company','owner_id',a,'company',jsonb_set(blank,'{name}','"Empresa B"')),gen_random_uuid(),0);
  if state->'company'->>'name' <> 'Empresa B' then raise exception 'Company B not saved'; end if;
  execute 'reset role';
  if (select company->>'name' from public.itape_accounts where owner_id = a) <> 'Empresa A editada' then raise exception 'Owner spoof changed A'; end if;
end $verify$;
rollback;
