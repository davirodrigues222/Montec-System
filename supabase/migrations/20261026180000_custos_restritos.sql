-- =====================================================================
-- Segurança nível 3 — FASE 4: custo e lucro só para quem tem acesso financeiro
--
-- Requer 20261026120000 e 20261026150000. Execute depois delas.
--
-- As telas já escondiam custo e lucro de quem não tem "Análises e relatórios", mas o banco
-- entregava esses valores para qualquer login da loja. Agora:
--   * as colunas custo_peca, frete_real, lucro_estimado_total e garantia_json NÃO podem mais ser
--     lidas direto da tabela ordens_servico (todas as outras colunas continuam liberadas);
--   * ordens_servico_leitura: as OS sem essas colunas (mesmas regras de acesso da tabela);
--   * ordens_servico_reservado: custos, lucro e retornos em garantia de cada OS da loja. Para quem
--     NÃO tem acesso financeiro, custo e lucro vêm vazios e os retornos vêm sem os valores gastos.
-- Gravar continua igual (as regras de permissão do nível 1 seguem valendo).
-- =====================================================================

-- Quem pode ver custo e lucro: a permissão de Análises e relatórios (a mesma do financeiro do Painel)
create or replace function public.pode_ver_custos()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.operador_pode('tela_relatorios')
$$;
revoke all on function public.pode_ver_custos() from public, anon;
grant execute on function public.pode_ver_custos() to authenticated;

-- Retornos em garantia sem os valores gastos (peça, frete, prejuízo); aceita os formatos já usados
create or replace function public.garantia_sem_custos(p_garantia jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  atual  jsonb := p_garantia;
  lista  jsonb;
  chaves text[] := array['custoPecaGarantia', 'custo_peca_garantia', 'custoPeca', 'freteGarantia', 'frete_garantia',
                         'freteReal', 'frete', 'prejuizoTotalGarantia'];
begin
  if atual is not null and jsonb_typeof(atual) = 'string' then
    begin
      atual := (atual #>> '{}')::jsonb;
    exception when others then
      return null;
    end;
  end if;
  lista := case
    when atual is null then '[]'::jsonb
    when jsonb_typeof(atual) = 'array' then atual
    when jsonb_typeof(atual) = 'object' and jsonb_typeof(atual -> 'listaRetornos') = 'array' then atual -> 'listaRetornos'
    when jsonb_typeof(atual) = 'object' then jsonb_build_array(atual)
    else '[]'::jsonb
  end;
  return coalesce(
    (select jsonb_agg(case when jsonb_typeof(r) = 'object' then r - chaves else r end) from jsonb_array_elements(lista) r),
    '[]'::jsonb
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Leitura da tabela sem as colunas de custo e lucro
-- ---------------------------------------------------------------------
do $$
declare
  colunas text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into colunas
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'ordens_servico'
     and column_name not in ('custo_peca', 'frete_real', 'lucro_estimado_total', 'garantia_json');

  -- Sem leitura da tabela inteira: só das colunas listadas (gravar continua igual)
  execute 'revoke select on public.ordens_servico from anon, authenticated';
  execute format('grant select (%s) on public.ordens_servico to authenticated', colunas);

  -- As OS sem custo e lucro, com as mesmas regras de acesso (RLS) de quem consulta
  execute 'drop view if exists public.ordens_servico_leitura';
  execute format(
    'create view public.ordens_servico_leitura with (security_invoker = true) as select %s from public.ordens_servico',
    colunas
  );
end $$;

-- Custos, lucro e retornos de cada OS da loja (vazios / sem valores para quem não tem acesso financeiro)
drop view if exists public.ordens_servico_reservado;
create view public.ordens_servico_reservado with (security_barrier = true) as
  select os.id_os,
         case when public.pode_ver_custos() then os.custo_peca end            as custo_peca,
         case when public.pode_ver_custos() then os.frete_real end            as frete_real,
         case when public.pode_ver_custos() then os.lucro_estimado_total end  as lucro_estimado_total,
         case when public.pode_ver_custos() then to_jsonb(os.garantia_json)
              else public.garantia_sem_custos(to_jsonb(os.garantia_json)) end as garantia_json
    from public.ordens_servico os
   where os.user_id is null or os.user_id::text = public.conta_atual()::text;

revoke all on public.ordens_servico_leitura from anon;
revoke all on public.ordens_servico_reservado from anon;
grant select on public.ordens_servico_leitura to authenticated;
grant select on public.ordens_servico_reservado to authenticated;

-- ---------------------------------------------------------------------
-- Retorno em garantia: a função lê garantia_json, que o login não lê mais direto.
-- Passa a rodar com permissão própria e confere a loja e a permissão de quem registra.
-- ---------------------------------------------------------------------
create or replace function public.acrescentar_retorno_garantia(p_id_os text, p_retorno jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  atual jsonb;
  lista jsonb;
begin
  if not (public.operador_pode('tela_garantias') or public.operador_pode('tela_ordens')) then
    raise exception 'new row violates row-level security policy for table "ordens_servico"' using errcode = '42501';
  end if;

  select to_jsonb(os.garantia_json) into atual
    from public.ordens_servico os
   where os.id_os::text = p_id_os
     and (os.user_id is null or os.user_id::text = public.conta_atual()::text)
   for update;
  if not found then
    raise exception 'Ordem de serviço não encontrada.';
  end if;

  if atual is not null and jsonb_typeof(atual) = 'string' then
    begin
      atual := (atual #>> '{}')::jsonb;
    exception when others then
      atual := null;
    end;
  end if;

  lista := case
    when atual is null then '[]'::jsonb
    when jsonb_typeof(atual) = 'array' then atual
    when jsonb_typeof(atual) = 'object' and jsonb_typeof(atual -> 'listaRetornos') = 'array' then atual -> 'listaRetornos'
    when jsonb_typeof(atual) = 'object' then jsonb_build_array(atual)
    else '[]'::jsonb
  end;

  update public.ordens_servico
     set garantia_json = lista || jsonb_build_array(p_retorno)
   where id_os::text = p_id_os;
end;
$$;
revoke all on function public.acrescentar_retorno_garantia(text, jsonb) from public, anon;
grant execute on function public.acrescentar_retorno_garantia(text, jsonb) to authenticated;

notify pgrst, 'reload schema';
