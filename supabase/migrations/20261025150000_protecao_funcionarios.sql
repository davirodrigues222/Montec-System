-- =====================================================================
-- Proteção do cadastro de funcionários e senhas fortes (análise de segurança, itens 1 e 5)
--
-- Requer as migrações 20261025120000 e 20261025140000. Execute depois delas.
--
-- Antes: qualquer pessoa com a sessão da conta (inclusive um funcionário, pelo console do
-- navegador) podia se promover a administrador ou trocar a senha de outro funcionário.
-- Agora o banco exige um ADMINISTRADOR IDENTIFICADO para cadastrar, alterar ou excluir
-- funcionários e definir senhas:
--   * cabeçalho x-operador-token: sessão aberta no login do proprietário ou de um funcionário ADMIN;
--   * cabeçalho x-autorizacao-token: liberação pontual dada por um ADMIN (ID e senha), 30 minutos.
-- Continuam liberados sem administrador: o cadastro do primeiro administrador (conta sem nenhum
-- funcionário com senha) e a solicitação de acesso (funcionário Atendente sem nenhuma tela).
--
-- Limite: isto não impede a LEITURA de dados nem a troca da senha da conta pelo console.
-- Isso só se resolve com um login próprio do Supabase para cada funcionário.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Liberações pontuais de administrador
-- ---------------------------------------------------------------------
create table if not exists public.autorizacoes_admin (
  token_hash     text primary key,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id_funcionario uuid not null references public.funcionarios (id_funcionario) on delete cascade,
  expira_em      timestamptz not null
);
alter table public.autorizacoes_admin enable row level security; -- sem políticas: só as funções acessam

-- Valor de um cabeçalho da requisição atual (vazio fora do PostgREST)
create or replace function public.cabecalho_requisicao(p_nome text)
returns text
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.headers', true), '')::json ->> p_nome, '')
$$;

-- Quem está operando é o proprietário ou um ADMIN ativo, ou um ADMIN liberou a ação há pouco
create or replace function public.operador_e_admin()
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
           select 1
             from public.sessoes_operador s
             left join public.funcionarios f on f.id_funcionario = s.id_funcionario and f.ativo
            where s.token_hash = encode(extensions.digest(public.cabecalho_requisicao('x-operador-token'), 'sha256'), 'hex')
              and s.user_id = auth.uid()
              and s.expira_em > now()
              and (s.proprietario or f.cargo = 'ADMIN'))
      or exists (
           select 1
             from public.autorizacoes_admin a
             join public.funcionarios f on f.id_funcionario = a.id_funcionario and f.ativo and f.cargo = 'ADMIN'
            where a.token_hash = encode(extensions.digest(public.cabecalho_requisicao('x-autorizacao-token'), 'sha256'), 'hex')
              and a.user_id = auth.uid()
              and a.expira_em > now())
$$;

-- Primeiro acesso: nenhum funcionário da conta tem senha ainda
create or replace function public.conta_em_configuracao()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.funcionarios where user_id = auth.uid() and senha_hash is not null)
$$;

-- Solicitação de acesso: Atendente com todas as permissões desligadas (precisa da lista nova
-- de permissões; com o objeto vazio o sistema aplicaria as permissões padrão do cargo)
create or replace function public.funcionario_pendente(p_cargo text, p_permissoes jsonb)
returns boolean
language sql
immutable
as $$
  select p_cargo = 'ATENDENTE'
     and jsonb_typeof(p_permissoes) = 'object'
     and p_permissoes ? 'tela_painel'
     and not exists (select 1 from jsonb_each(p_permissoes) e where e.value <> 'false'::jsonb)
$$;

-- ---------------------------------------------------------------------
-- 2. Regras de acesso da tabela de funcionários
-- ---------------------------------------------------------------------
drop policy if exists "funcionarios: dono gerencia" on public.funcionarios;
drop policy if exists "funcionarios: conta lê" on public.funcionarios;
drop policy if exists "funcionarios: admin cadastra" on public.funcionarios;
drop policy if exists "funcionarios: admin altera" on public.funcionarios;
drop policy if exists "funcionarios: admin exclui" on public.funcionarios;

create policy "funcionarios: conta lê" on public.funcionarios
  for select to authenticated
  using (user_id = auth.uid());

create policy "funcionarios: admin cadastra" on public.funcionarios
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (public.operador_e_admin() or public.conta_em_configuracao() or public.funcionario_pendente(cargo, permissoes))
  );

create policy "funcionarios: admin altera" on public.funcionarios
  for update to authenticated
  using (user_id = auth.uid() and (public.operador_e_admin() or public.conta_em_configuracao()))
  with check (user_id = auth.uid());

create policy "funcionarios: admin exclui" on public.funcionarios
  for delete to authenticated
  using (user_id = auth.uid() and public.operador_e_admin());

-- ---------------------------------------------------------------------
-- 3. Autorização de administrador passa a emitir um token de 30 minutos
-- ---------------------------------------------------------------------
drop function if exists public.autorizar_administrador(text, text);

create function public.autorizar_administrador(p_codigo text, p_senha text)
returns table (id_funcionario uuid, nome text, token text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  f public.funcionarios%rowtype;
  t text;
begin
  perform public.verificar_bloqueio_autorizacao();

  select * into f
    from public.funcionarios fu
   where fu.user_id = auth.uid()
     and lower(fu.codigo_acesso) = lower(trim(p_codigo))
     and fu.ativo
     and fu.cargo = 'ADMIN'
     and fu.senha_hash is not null;

  if not found or extensions.crypt(p_senha, f.senha_hash) <> f.senha_hash then
    perform public.registrar_falha_autorizacao();
    return; -- mesma resposta para código inexistente, não-administrador ou senha errada
  end if;

  delete from public.tentativas_autorizacao where user_id = auth.uid();
  delete from public.autorizacoes_admin where expira_em < now();

  t := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.autorizacoes_admin (token_hash, user_id, id_funcionario, expira_em)
  values (encode(extensions.digest(t, 'sha256'), 'hex'), auth.uid(), f.id_funcionario, now() + interval '30 minutes');

  return query select f.id_funcionario, f.nome, t;
end;
$$;

-- Encerra a liberação ao sair da tela liberada
create or replace function public.encerrar_autorizacao_admin(p_token text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  delete from public.autorizacoes_admin
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- 4. Definir senha: só administrador identificado, e senha forte
-- ---------------------------------------------------------------------
create or replace function public.definir_senha_funcionario(p_id_funcionario uuid, p_senha text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_senha is null or length(p_senha) < 8 or p_senha !~ '[A-Za-z]' or p_senha !~ '[0-9]' then
    raise exception 'A senha deve ter pelo menos 8 caracteres, com letras e números.';
  end if;

  -- Sem administrador, só a primeira senha de quem acabou de ser cadastrado no primeiro acesso
  -- ou de quem solicitou acesso (Atendente sem telas)
  if not (
    public.operador_e_admin()
    or public.conta_em_configuracao()
    or exists (select 1 from public.funcionarios fu
                where fu.id_funcionario = p_id_funcionario
                  and fu.user_id = auth.uid()
                  and fu.senha_hash is null
                  and public.funcionario_pendente(fu.cargo, fu.permissoes))
  ) then
    raise exception 'Somente um administrador pode definir senhas de funcionários.' using errcode = '42501';
  end if;

  update public.funcionarios
     set senha_hash = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)),
         tentativas_falhas = 0,
         bloqueado_ate = null
   where id_funcionario = p_id_funcionario
     and user_id = auth.uid();

  if not found then
    raise exception 'Funcionário não encontrado nesta conta.';
  end if;
end;
$$;

revoke all on function public.operador_e_admin() from public, anon;
revoke all on function public.conta_em_configuracao() from public, anon;
revoke all on function public.autorizar_administrador(text, text) from public, anon;
revoke all on function public.encerrar_autorizacao_admin(text) from public, anon;
revoke all on function public.definir_senha_funcionario(uuid, text) from public, anon;
grant execute on function public.operador_e_admin() to authenticated;
grant execute on function public.conta_em_configuracao() to authenticated;
grant execute on function public.autorizar_administrador(text, text) to authenticated;
grant execute on function public.encerrar_autorizacao_admin(text) to authenticated;
grant execute on function public.definir_senha_funcionario(uuid, text) to authenticated;

notify pgrst, 'reload schema';
