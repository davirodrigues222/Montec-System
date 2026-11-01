-- =====================================================================
-- Funcionários passam a ser opcionais
--
-- Requer as migrações 20261025140000, 20261025150000 e 20261026120000. Execute depois delas.
--
-- Antes: logo depois do login da conta, o sistema obrigava a cadastrar um administrador (código
-- e senha) para conseguir usar qualquer tela.
-- Agora:
--   1. Conta SEM funcionários: o dono entra direto, com acesso total. O banco abre uma sessão de
--      proprietário sem pedir senha, mas só enquanto nenhum funcionário da conta tiver senha
--      (conta_em_configuracao) e só para o dono (nunca para um funcionário com login próprio).
--   2. Quem quiser usar funcionários cadastra em Cadastros › Funcionários. O PRIMEIRO precisa ser
--      Administrador e ativo; depois dele o sistema passa a pedir código e senha ao entrar, e os
--      demais seguem as regras de sempre.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Entrada do dono sem funcionários
-- ---------------------------------------------------------------------
create or replace function public.entrar_proprietario_sem_funcionarios()
returns table (token text, nome text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_nome text;
  t      text;
begin
  if auth.uid() is null or public.conta_atual() <> auth.uid() or not public.conta_em_configuracao() then
    return; -- funcionário com login próprio ou conta que já tem funcionários: identificação normal
  end if;

  select coalesce(nullif(u.raw_user_meta_data ->> 'nome_responsavel', ''), 'Proprietário')
    into v_nome
    from auth.users u
   where u.id = auth.uid();

  delete from public.sessoes_operador where expira_em < now();

  t := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.sessoes_operador (token_hash, user_id, id_funcionario, proprietario, nome, expira_em)
  values (encode(extensions.digest(t, 'sha256'), 'hex'), auth.uid(), null, true, v_nome, now() + interval '12 hours');

  return query select t, v_nome;
end;
$$;

revoke all on function public.entrar_proprietario_sem_funcionarios() from public, anon;
grant execute on function public.entrar_proprietario_sem_funcionarios() to authenticated;

-- ---------------------------------------------------------------------
-- 2. O primeiro funcionário da conta é sempre um Administrador ativo
-- ---------------------------------------------------------------------
create or replace function public.tg_primeiro_funcionario_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.cargo <> 'ADMIN' or not new.ativo)
     and not exists (select 1 from public.funcionarios f where f.user_id = new.user_id) then
    raise exception 'O primeiro funcionário da conta precisa ser o Administrador (ativo, com acesso total).';
  end if;
  return new;
end;
$$;

drop trigger if exists primeiro_funcionario_admin on public.funcionarios;
create trigger primeiro_funcionario_admin
  before insert on public.funcionarios
  for each row execute function public.tg_primeiro_funcionario_admin();

notify pgrst, 'reload schema';
