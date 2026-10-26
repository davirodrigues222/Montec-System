-- =====================================================================
-- Segurança nível 3 — FASE 1: base no banco para cada funcionário ter o próprio login
--
-- Requer todas as migrações anteriores (até 20261026090000). Execute depois delas.
--
-- Hoje todos os funcionários usam a sessão do dono da conta: quem mexe no console do navegador
-- consegue ler tudo e até trocar a senha da conta. Com login próprio, cada funcionário entra com
-- um usuário do Supabase só dele, ligado à loja pela tabela membros_conta.
--
-- O QUE ESTA FASE FAZ
--   1. Cria membros_conta (usuário do funcionário -> conta da loja -> cadastro do funcionário).
--   2. Cria public.conta_atual(): a conta da loja de quem está logado
--        - dono da conta: o próprio id (igual a auth.uid(), como hoje);
--        - funcionário ATIVO com login próprio: o id da conta da loja;
--        - funcionário desativado: o id dele mesmo, que não é dono de nada (não vê nenhum dado).
--   3. Troca auth.uid() por public.conta_atual() em TODAS as funções, regras de acesso (RLS) e
--      valores padrão de user_id do schema public. Assim um funcionário com login próprio lê e
--      grava os dados da loja, e o que ele cadastra fica com o dono certo.
--   4. Permissões: funcionário com login próprio usa as permissões do cadastro dele, sem token.
--   5. Função usada só pelo servidor (Edge Function) para criar o login do funcionário.
--
-- SEGURO PARA APLICAR JÁ: enquanto ninguém tiver login próprio, conta_atual() = auth.uid() e o
-- sistema funciona exatamente como antes. O login próprio só passa a valer com as fases 2 e 3.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Membros da conta
-- ---------------------------------------------------------------------
create table if not exists public.membros_conta (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  conta_id       uuid not null references auth.users (id) on delete cascade,
  id_funcionario uuid not null unique references public.funcionarios (id_funcionario) on delete cascade,
  criado_em      timestamptz not null default now(),
  check (user_id <> conta_id)
);
create index if not exists membros_conta_conta_idx on public.membros_conta (conta_id);

-- Leitura: o próprio vínculo. Gravação: só o servidor (chave secreta), nunca o navegador.
alter table public.membros_conta enable row level security;
drop policy if exists "membros: próprio vínculo" on public.membros_conta;
create policy "membros: próprio vínculo" on public.membros_conta
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.membros_conta from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Conta da loja de quem está logado
-- ---------------------------------------------------------------------
create or replace function public.conta_atual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select mc.conta_id
       from public.membros_conta mc
       join public.funcionarios f on f.id_funcionario = mc.id_funcionario and f.ativo
      where mc.user_id = auth.uid()),
    auth.uid()
  )
$$;
revoke all on function public.conta_atual() from public, anon;
grant execute on function public.conta_atual() to authenticated;

-- ---------------------------------------------------------------------
-- 3. auth.uid() -> conta_atual() em funções, regras e valores padrão
-- ---------------------------------------------------------------------
do $$
declare
  fn  record;
  pol record;
  col record;
  sql text;
begin
  -- Funções. Ficam de fora as que precisam do usuário REAL (são recriadas abaixo nesta migração):
  -- assim rodar o arquivo de novo não quebra nada.
  for fn in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proname not in ('conta_atual', 'permissoes_operador_atual', 'operador_e_admin', 'funcionario_do_login')
       and p.prosrc like '%auth.uid()%'
  loop
    execute replace(pg_get_functiondef(fn.oid), 'auth.uid()', 'public.conta_atual()');
  end loop;

  -- Regras de acesso (RLS)
  for pol in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and tablename <> 'membros_conta'
       and (coalesce(qual, '') like '%auth.uid()%' or coalesce(with_check, '') like '%auth.uid()%')
  loop
    sql := format('alter policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    if pol.qual is not null then
      sql := sql || ' using (' || replace(pol.qual, 'auth.uid()', 'public.conta_atual()') || ')';
    end if;
    if pol.with_check is not null then
      sql := sql || ' with check (' || replace(pol.with_check, 'auth.uid()', 'public.conta_atual()') || ')';
    end if;
    execute sql;
  end loop;

  -- Valores padrão de user_id: o que o funcionário cadastra pertence à conta da loja
  for col in
    select table_name, column_name
      from information_schema.columns
     where table_schema = 'public'
       and column_default like '%auth.uid()%'
  loop
    execute format('alter table public.%I alter column %I set default public.conta_atual()', col.table_name, col.column_name);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Permissões: funcionário com login próprio usa o próprio cadastro (sem token)
-- ---------------------------------------------------------------------
-- Mesma regra de normalizarPermissoes no app (padrão do cargo, chaves antigas, ADMIN tem tudo)
create or replace function public.permissoes_efetivas(p_cargo text, p_permissoes jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  chaves text[] := array['tela_painel', 'tela_nova_os', 'tela_ordens', 'tela_garantias', 'tela_relatorios',
                         'tela_cadastros', 'tela_empresa', 'tela_configuracoes', 'excluir_os'];
  todas  jsonb;
  p      jsonb := coalesce(p_permissoes, '{}'::jsonb);
  r      jsonb := '{}'::jsonb;
  item   record;
begin
  select jsonb_object_agg(c, true) into todas from unnest(chaves) c;
  if p_cargo = 'ADMIN' then
    return todas;
  end if;
  if not exists (
       select 1 from jsonb_object_keys(p) k
        where k = any(chaves) or k in ('abrir_os', 'ver_financeiro', 'gerenciar_cadastros', 'gerenciar_configuracoes')) then
    return case p_cargo
      when 'GERENTE'   then todas - 'tela_configuracoes'
      when 'TECNICO'   then jsonb_build_object('tela_painel', true, 'tela_nova_os', true, 'tela_ordens', true, 'tela_garantias', true)
      when 'ATENDENTE' then jsonb_build_object('tela_painel', true, 'tela_nova_os', true, 'tela_ordens', true, 'tela_garantias', true,
                                               'tela_cadastros', true)
      else '{}'::jsonb
    end;
  end if;
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

create or replace function public.permissoes_operador_atual()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_token text := public.cabecalho_requisicao('x-operador-token');
  m       record;
  v       record;
begin
  -- Funcionário com login próprio: as permissões do cadastro dele
  select f.cargo, f.permissoes
    into m
    from public.membros_conta mc
    join public.funcionarios f on f.id_funcionario = mc.id_funcionario and f.ativo
   where mc.user_id = auth.uid();
  if found then
    return public.permissoes_efetivas(m.cargo, m.permissoes);
  end if;

  -- Sessão da conta (dono): o funcionário identificado pelo token
  if v_token = '' then
    return '{}'::jsonb;
  end if;
  select s.proprietario, f.cargo, f.permissoes, f.ativo
    into v
    from public.sessoes_operador s
    left join public.funcionarios f on f.id_funcionario = s.id_funcionario
   where s.token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
     and s.user_id = public.conta_atual()
     and s.expira_em > now();
  if not found then
    return '{}'::jsonb;
  end if;
  if v.proprietario then
    return public.permissoes_efetivas('ADMIN', null);
  end if;
  if v.ativo is not true then
    return '{}'::jsonb;
  end if;
  return public.permissoes_efetivas(v.cargo, v.permissoes);
end;
$$;

-- Administrador: funcionário ADMIN com login próprio, sessão do dono/ADMIN ou liberação pontual
create or replace function public.operador_e_admin()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
           select 1
             from public.membros_conta mc
             join public.funcionarios f on f.id_funcionario = mc.id_funcionario and f.ativo and f.cargo = 'ADMIN'
            where mc.user_id = auth.uid())
      or exists (
           select 1
             from public.sessoes_operador s
             left join public.funcionarios f on f.id_funcionario = s.id_funcionario and f.ativo
            where s.token_hash = encode(extensions.digest(public.cabecalho_requisicao('x-operador-token'), 'sha256'), 'hex')
              and s.user_id = public.conta_atual()
              and s.expira_em > now()
              and (s.proprietario or f.cargo = 'ADMIN'))
      or exists (
           select 1
             from public.autorizacoes_admin a
             join public.funcionarios f on f.id_funcionario = a.id_funcionario and f.ativo and f.cargo = 'ADMIN'
            where a.token_hash = encode(extensions.digest(public.cabecalho_requisicao('x-autorizacao-token'), 'sha256'), 'hex')
              and a.user_id = public.conta_atual()
              and a.expira_em > now())
$$;

-- Quem é o funcionário logado com login próprio (null para o dono da conta)
create or replace function public.funcionario_do_login()
returns table (id_funcionario uuid, nome text, cargo text, permissoes jsonb, lojas uuid[], conta_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select f.id_funcionario, f.nome, f.cargo, f.permissoes,
         coalesce(array_agg(fl.id_loja) filter (where fl.id_loja is not null), '{}'),
         mc.conta_id
    from public.membros_conta mc
    join public.funcionarios f on f.id_funcionario = mc.id_funcionario and f.ativo
    left join public.funcionario_lojas fl on fl.id_funcionario = f.id_funcionario
   where mc.user_id = auth.uid()
   group by f.id_funcionario, f.nome, f.cargo, f.permissoes, mc.conta_id
$$;

revoke all on function public.permissoes_efetivas(text, jsonb) from public, anon;
revoke all on function public.funcionario_do_login() from public, anon;
grant execute on function public.permissoes_efetivas(text, jsonb) to authenticated;
grant execute on function public.funcionario_do_login() to authenticated;

-- ---------------------------------------------------------------------
-- 5. Só para o servidor (Edge Function "login-funcionario", chave secreta)
-- ---------------------------------------------------------------------
-- Confere código + senha do funcionário de uma conta. Respeita o bloqueio por tentativas.
create or replace function public.conferir_funcionario_servidor(p_conta uuid, p_codigo text, p_senha text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  f public.funcionarios%rowtype;
begin
  select * into f
    from public.funcionarios
   where user_id = p_conta
     and lower(codigo_acesso) = lower(trim(p_codigo));
  if not found or not f.ativo or f.senha_hash is null then
    return null;
  end if;
  if f.bloqueado_ate is not null and f.bloqueado_ate > now() then
    return null;
  end if;
  if extensions.crypt(p_senha, f.senha_hash) <> f.senha_hash then
    -- Mesmo contador do login: 5 erros bloqueiam por 15 minutos
    update public.funcionarios
       set tentativas_falhas = f.tentativas_falhas + 1,
           bloqueado_ate = case when f.tentativas_falhas + 1 >= 5 then now() + interval '15 minutes' else bloqueado_ate end
     where id_funcionario = f.id_funcionario;
    return null;
  end if;
  update public.funcionarios set tentativas_falhas = 0, bloqueado_ate = null where id_funcionario = f.id_funcionario;
  return f.id_funcionario;
end;
$$;
revoke all on function public.conferir_funcionario_servidor(uuid, text, text) from public, anon, authenticated;
grant execute on function public.conferir_funcionario_servidor(uuid, text, text) to service_role;

-- Funcionário excluído: o login dele é apagado junto (o vínculo some em cascata e leva o usuário)
create or replace function public.tg_apagar_login_funcionario()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  delete from auth.users where id = old.user_id;
  return old;
end;
$$;
drop trigger if exists membros_conta_apagar_login on public.membros_conta;
create trigger membros_conta_apagar_login after delete on public.membros_conta
  for each row execute function public.tg_apagar_login_funcionario();

notify pgrst, 'reload schema';
