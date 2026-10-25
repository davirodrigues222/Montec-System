-- =====================================================================
-- Correções da revisão de código (25/10/2026)
--
-- Só ACRESCENTA tabelas e funções; não altera nem apaga dados existentes.
-- O sistema funciona antes e depois desta migração (cada recurso tem alternativa no app).
-- Execute no SQL Editor do Supabase. Pode ser executada mais de uma vez.
--
--  1. gerar_numero_os            numeração sequencial da OS por conta (fim dos números repetidos)
--  2. sessões de funcionário     F5 restaura o funcionário pelo banco, com permissões atuais
--  3. autorizar_administrador    autorização sem travar o login do administrador
--  4. conferir_senha_funcionario confere a senha atual sem registrar "último acesso"
--  5. acrescentar_retorno_garantia  registra retornos sem um apagar o outro
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. NUMERAÇÃO SEQUENCIAL DA OS (por conta)
-- ---------------------------------------------------------------------
create table if not exists public.contador_os (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  ultimo  integer not null default 0
);
alter table public.contador_os enable row level security; -- sem políticas: só a função acessa

create or replace function public.gerar_numero_os()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v integer;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.';
  end if;
  insert into public.contador_os as c (user_id, ultimo)
  values (auth.uid(), 1)
  on conflict (user_id) do update set ultimo = c.ultimo + 1
  returning c.ultimo into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. SESSÕES DE FUNCIONÁRIO
-- O navegador guarda só um token aleatório. Ao recarregar (F5), o funcionário e as permissões
-- são lidos de novo do banco: editar o armazenamento do navegador não dá acesso a nada.
-- ---------------------------------------------------------------------
create table if not exists public.sessoes_operador (
  token_hash     text primary key,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id_funcionario uuid not null references public.funcionarios (id_funcionario) on delete cascade,
  criado_em      timestamptz not null default now(),
  expira_em      timestamptz not null
);
alter table public.sessoes_operador enable row level security; -- sem políticas: só as funções acessam

create or replace function public.entrar_funcionario(p_codigo text, p_senha text)
returns table (id_funcionario uuid, nome text, cargo text, permissoes jsonb, lojas uuid[], token text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v record;
  t text;
begin
  -- Mesma verificação do login (hash da senha, contador de tentativas e bloqueio)
  select * into v from public.verificar_acesso_funcionario(p_codigo, p_senha) limit 1;
  if v is null or v.id_funcionario is null then
    return;
  end if;

  delete from public.sessoes_operador where expira_em < now();
  t := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.sessoes_operador (token_hash, user_id, id_funcionario, expira_em)
  values (encode(extensions.digest(t, 'sha256'), 'hex'), auth.uid(), v.id_funcionario, now() + interval '12 hours');

  return query select v.id_funcionario, v.nome, v.cargo, v.permissoes, v.lojas, t;
end;
$$;

create or replace function public.restaurar_sessao_operador(p_token text)
returns table (id_funcionario uuid, nome text, cargo text, permissoes jsonb, lojas uuid[])
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
    select f.id_funcionario, f.nome, f.cargo, f.permissoes,
           coalesce(array_agg(fl.id_loja) filter (where fl.id_loja is not null), '{}')
      from public.sessoes_operador s
      join public.funcionarios f on f.id_funcionario = s.id_funcionario
      left join public.funcionario_lojas fl on fl.id_funcionario = f.id_funcionario
     where s.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
       and s.user_id = auth.uid()
       and s.expira_em > now()
       and f.ativo
     group by f.id_funcionario, f.nome, f.cargo, f.permissoes;
end;
$$;

create or replace function public.encerrar_sessao_operador(p_token text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from public.sessoes_operador
   where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------
-- 3 e 4. AUTORIZAÇÃO DE ADMINISTRADOR E CONFERÊNCIA DE SENHA
-- Contador de tentativas próprio, por conta: senhas erradas digitadas aqui não travam o login
-- do administrador, mas 5 erros seguidos bloqueiam estas conferências por 15 minutos.
-- ---------------------------------------------------------------------
create table if not exists public.tentativas_autorizacao (
  user_id       uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  falhas        integer not null default 0,
  bloqueado_ate timestamptz
);
alter table public.tentativas_autorizacao enable row level security; -- sem políticas: só as funções acessam

create or replace function public.registrar_falha_autorizacao()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tentativas_autorizacao as t (user_id, falhas, bloqueado_ate)
  values (auth.uid(), 1, null)
  on conflict (user_id) do update
    set falhas        = case when t.falhas + 1 >= 5 then 0 else t.falhas + 1 end,
        bloqueado_ate = case when t.falhas + 1 >= 5 then now() + interval '15 minutes' else t.bloqueado_ate end;
end;
$$;

create or replace function public.verificar_bloqueio_autorizacao()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.tentativas_autorizacao
     where user_id = auth.uid() and bloqueado_ate is not null and bloqueado_ate > now()
  ) then
    raise exception 'Muitas tentativas incorretas. Aguarde 15 minutos e tente novamente.';
  end if;
end;
$$;

create or replace function public.autorizar_administrador(p_codigo text, p_senha text)
returns table (id_funcionario uuid, nome text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  f public.funcionarios%rowtype;
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
  return query select f.id_funcionario, f.nome;
end;
$$;

create or replace function public.conferir_senha_funcionario(p_id_funcionario uuid, p_senha text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  f public.funcionarios%rowtype;
begin
  perform public.verificar_bloqueio_autorizacao();

  select * into f
    from public.funcionarios fu
   where fu.user_id = auth.uid()
     and fu.id_funcionario = p_id_funcionario
     and fu.senha_hash is not null;

  if not found or extensions.crypt(p_senha, f.senha_hash) <> f.senha_hash then
    perform public.registrar_falha_autorizacao();
    return false;
  end if;

  delete from public.tentativas_autorizacao where user_id = auth.uid();
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. RETORNO EM GARANTIA SEM PERDER REGISTROS
-- Acrescenta o retorno dentro do banco, com a linha travada: dois registros simultâneos
-- não apagam um ao outro. Respeita as regras de acesso da tabela (security invoker).
-- ---------------------------------------------------------------------
create or replace function public.acrescentar_retorno_garantia(p_id_os text, p_retorno jsonb)
returns void
language plpgsql
as $$
declare
  atual jsonb;
  lista jsonb;
begin
  select os.garantia_json::jsonb into atual
    from public.ordens_servico os
   where os.id_os::text = p_id_os
   for update;
  if not found then
    raise exception 'Ordem de serviço não encontrada.';
  end if;

  -- Formatos já usados: lista, objeto com listaRetornos, objeto único, texto com JSON
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

-- ---------------------------------------------------------------------
-- Permissões das funções
-- ---------------------------------------------------------------------
revoke all on function public.gerar_numero_os() from public, anon;
revoke all on function public.entrar_funcionario(text, text) from public, anon;
revoke all on function public.restaurar_sessao_operador(text) from public, anon;
revoke all on function public.encerrar_sessao_operador(text) from public, anon;
revoke all on function public.registrar_falha_autorizacao() from public, anon, authenticated;
revoke all on function public.verificar_bloqueio_autorizacao() from public, anon, authenticated;
revoke all on function public.autorizar_administrador(text, text) from public, anon;
revoke all on function public.conferir_senha_funcionario(uuid, text) from public, anon;
revoke all on function public.acrescentar_retorno_garantia(text, jsonb) from public, anon;

grant execute on function public.gerar_numero_os() to authenticated;
grant execute on function public.entrar_funcionario(text, text) to authenticated;
grant execute on function public.restaurar_sessao_operador(text) to authenticated;
grant execute on function public.encerrar_sessao_operador(text) to authenticated;
grant execute on function public.autorizar_administrador(text, text) to authenticated;
grant execute on function public.conferir_senha_funcionario(uuid, text) to authenticated;
grant execute on function public.acrescentar_retorno_garantia(text, jsonb) to authenticated;

notify pgrst, 'reload schema';
