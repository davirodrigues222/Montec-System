-- =====================================================================
-- Permissões de funcionário aplicadas pelo banco (segurança, nível 1)
--
-- Requer as migrações 20261025130000, 20261025140000 e 20261025150000. Execute depois delas.
--
-- Antes: as telas escondiam o que cada funcionário não podia usar, mas o banco só conferia
-- "é desta conta?". Pelo console do navegador, qualquer funcionário conseguia excluir OS,
-- alterar cadastros e formas de pagamento.
--
-- Agora cada GRAVAÇÃO (inserir, alterar, excluir) exige que o operador identificado tenha a
-- permissão daquela tela, conferida pelo cabeçalho x-operador-token (sessão aberta no login do
-- funcionário ou do proprietário) ou por uma liberação de administrador (x-autorizacao-token).
--
--   ordens_servico      criar: Nova ordem · alterar: Nova ordem, Ordens ou Garantias · excluir: "Excluir OS"
--   clientes / aparelhos criar: Nova ordem ou Cadastros · alterar: Nova ordem, Ordens ou Cadastros · excluir: Cadastros
--   cad_servicos / cad_fornecedores                      tudo: Cadastros
--   lojas / formas_pagamento / formas_pagamento_taxas    tudo: Cadastros da empresa
--   funcionario_lojas                                    tudo: administrador (como funcionarios)
--
-- A LEITURA continua liberada para a conta (as telas precisam dela). Esconder valores de quem
-- não tem acesso financeiro e impedir a troca da senha da conta exigem login próprio por
-- funcionário (nível 3).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Permissões efetivas do operador da requisição (mesma regra de normalizarPermissoes no app)
-- ---------------------------------------------------------------------
create or replace function public.permissoes_operador_atual()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  chaves  text[] := array['tela_painel', 'tela_nova_os', 'tela_ordens', 'tela_garantias', 'tela_relatorios',
                          'tela_cadastros', 'tela_empresa', 'tela_configuracoes', 'excluir_os'];
  todas   jsonb;
  v_token text := public.cabecalho_requisicao('x-operador-token');
  v       record;
  p       jsonb;
  r       jsonb := '{}'::jsonb;
  item    record;
begin
  select jsonb_object_agg(c, true) into todas from unnest(chaves) c;
  if v_token = '' then
    return '{}'::jsonb;
  end if;

  select s.proprietario, f.cargo, f.permissoes, f.ativo
    into v
    from public.sessoes_operador s
    left join public.funcionarios f on f.id_funcionario = s.id_funcionario
   where s.token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
     and s.user_id = auth.uid()
     and s.expira_em > now();

  if not found then
    return '{}'::jsonb;
  end if;
  if v.proprietario then
    return todas;
  end if;
  if v.ativo is not true then
    return '{}'::jsonb;
  end if;
  -- Administrador tem tudo, sempre
  if v.cargo = 'ADMIN' then
    return todas;
  end if;

  p := coalesce(v.permissoes, '{}'::jsonb);

  -- Sem nenhuma permissão salva: padrão do cargo
  if not exists (
       select 1 from jsonb_object_keys(p) k
        where k = any(chaves) or k in ('abrir_os', 'ver_financeiro', 'gerenciar_cadastros', 'gerenciar_configuracoes')) then
    return case v.cargo
      when 'GERENTE'   then todas - 'tela_configuracoes'
      when 'TECNICO'   then jsonb_build_object('tela_painel', true, 'tela_nova_os', true, 'tela_ordens', true, 'tela_garantias', true)
      when 'ATENDENTE' then jsonb_build_object('tela_painel', true, 'tela_nova_os', true, 'tela_ordens', true, 'tela_garantias', true,
                                               'tela_cadastros', true)
      else '{}'::jsonb
    end;
  end if;

  -- Permissões salvas (inclui as chaves da primeira versão do cadastro)
  for item in select key, value from jsonb_each(p) loop
    if item.key = any(chaves) then
      r := r || jsonb_build_object(item.key, item.value = 'true'::jsonb);
    elsif item.value = 'true'::jsonb then
      r := r || case item.key
        when 'abrir_os'                then jsonb_build_object('tela_painel', true, 'tela_nova_os', true, 'tela_ordens', true, 'tela_garantias', true)
        when 'ver_financeiro'          then jsonb_build_object('tela_relatorios', true)
        when 'gerenciar_cadastros'     then jsonb_build_object('tela_cadastros', true)
        when 'gerenciar_configuracoes' then jsonb_build_object('tela_configuracoes', true, 'tela_empresa', true)
        else '{}'::jsonb
      end;
    end if;
  end loop;
  return r;
end;
$$;

-- O operador tem a permissão, ou um administrador (sessão ou liberação pontual) está autorizando
create or replace function public.operador_pode(p_chave text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((public.permissoes_operador_atual() ->> p_chave)::boolean, false)
      or public.operador_e_admin()
$$;

revoke all on function public.permissoes_operador_atual() from public, anon;
revoke all on function public.operador_pode(text) from public, anon;
grant execute on function public.permissoes_operador_atual() to authenticated;
grant execute on function public.operador_pode(text) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Regras por tabela: leitura pela conta, gravação pela permissão do operador
-- ---------------------------------------------------------------------
create or replace function pg_temp.aplicar_regras(
  p_tabela text, p_criar text, p_alterar text, p_excluir text, p_dono text default 'user_id is null or user_id::text = auth.uid()::text'
)
returns void
language plpgsql
as $$
declare
  pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = p_tabela loop
    execute format('drop policy %I on public.%I', pol.policyname, p_tabela);
  end loop;
  execute format('alter table public.%I enable row level security', p_tabela);
  execute format('create policy "conta: lê" on public.%I for select to authenticated using (%s)', p_tabela, p_dono);
  execute format('create policy "operador: cria" on public.%I for insert to authenticated with check ((%s) and (%s))', p_tabela, p_dono, p_criar);
  execute format('create policy "operador: altera" on public.%I for update to authenticated using (%s) with check ((%s) and (%s))',
                 p_tabela, p_dono, p_dono, p_alterar);
  execute format('create policy "operador: exclui" on public.%I for delete to authenticated using ((%s) and (%s))', p_tabela, p_dono, p_excluir);
end;
$$;

select pg_temp.aplicar_regras('ordens_servico',
  $p$public.operador_pode('tela_nova_os')$p$,
  $p$public.operador_pode('tela_nova_os') or public.operador_pode('tela_ordens') or public.operador_pode('tela_garantias')$p$,
  $p$public.operador_pode('excluir_os')$p$);

select pg_temp.aplicar_regras('clientes',
  $p$public.operador_pode('tela_nova_os') or public.operador_pode('tela_cadastros')$p$,
  $p$public.operador_pode('tela_nova_os') or public.operador_pode('tela_ordens') or public.operador_pode('tela_cadastros')$p$,
  $p$public.operador_pode('tela_cadastros')$p$);

select pg_temp.aplicar_regras('aparelhos_cliente',
  $p$public.operador_pode('tela_nova_os') or public.operador_pode('tela_cadastros')$p$,
  $p$public.operador_pode('tela_nova_os') or public.operador_pode('tela_ordens') or public.operador_pode('tela_cadastros')$p$,
  $p$public.operador_pode('tela_cadastros') or public.operador_pode('excluir_os')$p$);

select pg_temp.aplicar_regras('cad_servicos',
  $p$public.operador_pode('tela_cadastros')$p$, $p$public.operador_pode('tela_cadastros')$p$, $p$public.operador_pode('tela_cadastros')$p$);

select pg_temp.aplicar_regras('cad_fornecedores',
  $p$public.operador_pode('tela_cadastros')$p$, $p$public.operador_pode('tela_cadastros')$p$, $p$public.operador_pode('tela_cadastros')$p$);

-- Tabelas criadas pela migração 20261024120000: o dono é sempre obrigatório (user_id not null)
select pg_temp.aplicar_regras('lojas',
  $p$public.operador_pode('tela_empresa')$p$, $p$public.operador_pode('tela_empresa')$p$, $p$public.operador_pode('tela_empresa')$p$,
  'user_id = auth.uid()');

select pg_temp.aplicar_regras('formas_pagamento',
  $p$public.operador_pode('tela_empresa')$p$, $p$public.operador_pode('tela_empresa')$p$, $p$public.operador_pode('tela_empresa')$p$,
  'user_id = auth.uid()');

select pg_temp.aplicar_regras('formas_pagamento_taxas',
  $p$public.operador_pode('tela_empresa')$p$, $p$public.operador_pode('tela_empresa')$p$, $p$public.operador_pode('tela_empresa')$p$,
  'exists (select 1 from public.formas_pagamento fp where fp.id_forma_pagamento = formas_pagamento_taxas.id_forma_pagamento and fp.user_id = auth.uid())');

-- Vínculo funcionário × loja: mesma proteção do cadastro de funcionários (só administrador)
select pg_temp.aplicar_regras('funcionario_lojas',
  $p$public.operador_e_admin() or public.conta_em_configuracao()$p$,
  $p$public.operador_e_admin()$p$,
  $p$public.operador_e_admin()$p$,
  'exists (select 1 from public.funcionarios f where f.id_funcionario = funcionario_lojas.id_funcionario and f.user_id = auth.uid())
   and exists (select 1 from public.lojas l where l.id_loja = funcionario_lojas.id_loja and l.user_id = auth.uid())');

notify pgrst, 'reload schema';
