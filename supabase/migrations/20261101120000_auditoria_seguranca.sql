-- =====================================================================
-- Auditoria de segurança (novembro/2026)
--
-- Requer todas as migrações anteriores (usa conta_atual(), operador_pode() e situacao_assinatura()).
-- Pode ser executada de novo sem perder dados.
--
-- 1. Todo registro tem dono. ordens_servico, clientes, aparelhos_cliente, cad_fornecedores e
--    cad_servicos aceitavam user_id vazio, e as regras de acesso liberavam esses registros para
--    QUALQUER conta logada (ler, alterar e excluir). Agora:
--      * os registros sem dono herdam o dono pelos vínculos (OS <-> cliente <-> aparelho);
--      * os que continuarem sem dono vão para a cópia de segurança registros_sem_dono e saem da tabela;
--      * user_id passa a ser obrigatório. Com isso, o trecho "user_id is null" das regras nunca mais vale.
-- 2. Assinatura exigida também no banco. Antes o bloqueio era só na tela: uma conta vencida seguia
--    gravando direto pela API. Agora criar, alterar e excluir exigem assinatura ativa ou período de
--    teste (assinatura_ativa()). A LEITURA continua liberada: quem venceu ainda vê e exporta os dados.
--    As configurações da conta (tema, logo) ficam de fora: não são o serviço pago.
--    Para desligar a cobrança no banco: apague as regras "assinatura: cria", "assinatura: altera" e
--    "assinatura: exclui" de cada tabela.
-- 3. Retorno em garantia: a gravação final também confere a loja e a assinatura.
-- 4. Senha de desbloqueio apagada das OS antigas já entregues ou canceladas (LGPD).
--
-- Antes de executar, veja quantos registros estão sem dono (o passo 1 move os que sobrarem):
--   select 'ordens_servico' t, count(*) from public.ordens_servico where user_id is null
--   union all select 'clientes', count(*) from public.clientes where user_id is null
--   union all select 'aparelhos_cliente', count(*) from public.aparelhos_cliente where user_id is null
--   union all select 'cad_fornecedores', count(*) from public.cad_fornecedores where user_id is null
--   union all select 'cad_servicos', count(*) from public.cad_servicos where user_id is null;
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Todo registro tem dono
-- ---------------------------------------------------------------------
create table if not exists public.registros_sem_dono (
  id          bigint generated always as identity primary key,
  tabela      text not null,
  registro    jsonb not null,
  removido_em timestamptz not null default now()
);
-- Só quem administra o banco (SQL Editor) lê: nenhuma conta do sistema tem acesso
alter table public.registros_sem_dono enable row level security;
revoke all on public.registros_sem_dono from anon, authenticated;

-- Dono pelos vínculos, nos dois sentidos (cliente -> OS/aparelho e OS -> cliente/aparelho)
update public.ordens_servico os
   set user_id = c.user_id
  from public.clientes c
 where os.user_id is null and c.user_id is not null and c.id_cliente::text = os.id_cliente::text;

update public.clientes c
   set user_id = os.user_id
  from public.ordens_servico os
 where c.user_id is null and os.user_id is not null and c.id_cliente::text = os.id_cliente::text;

update public.aparelhos_cliente a
   set user_id = c.user_id
  from public.clientes c
 where a.user_id is null and c.user_id is not null and c.id_cliente::text = a.id_cliente::text;

do $$
declare
  t   text;
  qtd integer;
begin
  -- A ordem importa: OS antes de aparelhos e clientes (vínculos)
  foreach t in array array['ordens_servico', 'aparelhos_cliente', 'clientes', 'cad_fornecedores', 'cad_servicos'] loop
    execute format(
      'with removidos as (delete from public.%I x where x.user_id is null returning x)
       insert into public.registros_sem_dono (tabela, registro) select %L, to_jsonb(r) from removidos r',
      t, t
    );
    get diagnostics qtd = row_count;
    if qtd > 0 then
      raise notice '%: % registro(s) sem dono movido(s) para registros_sem_dono', t, qtd;
    end if;
    execute format('alter table public.%I alter column user_id set not null', t);
    execute format('alter table public.%I alter column user_id set default public.conta_atual()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Assinatura exigida no banco para gravar
-- ---------------------------------------------------------------------
create or replace function public.assinatura_ativa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select s.acesso_liberado from public.situacao_assinatura() s limit 1), false)
$$;
revoke all on function public.assinatura_ativa() from public, anon;
grant execute on function public.assinatura_ativa() to authenticated;

-- Regras RESTRITIVAS: valem junto com as regras de cada tabela (as duas precisam deixar)
do $$
declare
  t text;
begin
  foreach t in array array[
    'ordens_servico', 'clientes', 'aparelhos_cliente', 'cad_fornecedores', 'cad_servicos',
    'lojas', 'formas_pagamento', 'formas_pagamento_taxas', 'funcionarios', 'funcionario_lojas'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop policy if exists "assinatura: cria" on public.%I', t);
    execute format('drop policy if exists "assinatura: altera" on public.%I', t);
    execute format('drop policy if exists "assinatura: exclui" on public.%I', t);
    execute format(
      'create policy "assinatura: cria" on public.%I as restrictive for insert to authenticated
         with check (public.assinatura_ativa())', t);
    execute format(
      'create policy "assinatura: altera" on public.%I as restrictive for update to authenticated
         using (public.assinatura_ativa()) with check (public.assinatura_ativa())', t);
    execute format(
      'create policy "assinatura: exclui" on public.%I as restrictive for delete to authenticated
         using (public.assinatura_ativa())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Retorno em garantia: loja e assinatura conferidas também na gravação
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
  if not public.assinatura_ativa() then
    raise exception 'Assinatura vencida: renove o plano para registrar retornos.' using errcode = '42501';
  end if;

  select to_jsonb(os.garantia_json) into atual
    from public.ordens_servico os
   where os.id_os::text = p_id_os
     and os.user_id::text = public.conta_atual()::text
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
   where id_os::text = p_id_os
     and user_id::text = public.conta_atual()::text;
end;
$$;
revoke all on function public.acrescentar_retorno_garantia(text, jsonb) from public, anon;
grant execute on function public.acrescentar_retorno_garantia(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Senha de desbloqueio das OS antigas já entregues ou canceladas (LGPD)
--    O sistema já apaga a senha ao entregar/cancelar; isto limpa as OS de antes dessa regra.
-- ---------------------------------------------------------------------
do $$
declare
  tipo text;
begin
  select data_type into tipo
    from information_schema.columns
   where table_schema = 'public' and table_name = 'ordens_servico' and column_name = 'checklist_entrada';
  if tipo in ('json', 'jsonb') then
    execute format(
      'update public.ordens_servico
          set checklist_entrada = (checklist_entrada::jsonb || ''{"__senhaDesbloqueio": ""}''::jsonb)::%s
        where status_os in (''ENTREGUE'', ''CANCELADO'')
          and jsonb_typeof(checklist_entrada::jsonb) = ''object''
          and coalesce(checklist_entrada::jsonb ->> ''__senhaDesbloqueio'', '''') <> ''''',
      tipo
    );
  end if;
end $$;

notify pgrst, 'reload schema';
