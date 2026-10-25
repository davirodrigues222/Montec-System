-- =====================================================================
-- Sessão do PROPRIETÁRIO (entrada com a senha da conta) também sobrevive ao F5
--
-- Requer a migração 20261025120000_correcoes_revisao.sql. Execute depois dela.
-- A senha da conta é conferida no próprio banco (hash do Supabase Auth), então o token só é
-- emitido para quem sabe a senha; editar o navegador não dá acesso de proprietário.
-- =====================================================================

alter table public.sessoes_operador alter column id_funcionario drop not null;
alter table public.sessoes_operador add column if not exists proprietario boolean not null default false;
alter table public.sessoes_operador add column if not exists nome text;

create or replace function public.entrar_proprietario(p_senha text)
returns table (token text, nome text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_nome text;
  t      text;
begin
  perform public.verificar_bloqueio_autorizacao();

  select u.encrypted_password, coalesce(nullif(u.raw_user_meta_data ->> 'nome_responsavel', ''), 'Proprietário')
    into v_hash, v_nome
    from auth.users u
   where u.id = auth.uid();

  if v_hash is null or extensions.crypt(p_senha, v_hash) <> v_hash then
    perform public.registrar_falha_autorizacao();
    return;
  end if;

  delete from public.tentativas_autorizacao where user_id = auth.uid();
  delete from public.sessoes_operador where expira_em < now();

  t := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.sessoes_operador (token_hash, user_id, id_funcionario, proprietario, nome, expira_em)
  values (encode(extensions.digest(t, 'sha256'), 'hex'), auth.uid(), null, true, v_nome, now() + interval '12 hours');

  return query select t, v_nome;
end;
$$;

-- Restauração passa a devolver também as sessões de proprietário
drop function if exists public.restaurar_sessao_operador(text);

create function public.restaurar_sessao_operador(p_token text)
returns table (id_funcionario uuid, nome text, cargo text, permissoes jsonb, lojas uuid[], proprietario boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
    -- Funcionário: dados e permissões atuais do cadastro
    select f.id_funcionario, f.nome, f.cargo, f.permissoes,
           coalesce(array_agg(fl.id_loja) filter (where fl.id_loja is not null), '{}'),
           false
      from public.sessoes_operador s
      join public.funcionarios f on f.id_funcionario = s.id_funcionario
      left join public.funcionario_lojas fl on fl.id_funcionario = f.id_funcionario
     where s.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
       and s.user_id = auth.uid()
       and s.expira_em > now()
       and not s.proprietario
       and f.ativo
     group by f.id_funcionario, f.nome, f.cargo, f.permissoes
    union all
    -- Proprietário: acesso total
    select null::uuid, coalesce(s.nome, 'Proprietário'), 'ADMIN'::text, '{}'::jsonb, '{}'::uuid[], true
      from public.sessoes_operador s
     where s.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
       and s.user_id = auth.uid()
       and s.expira_em > now()
       and s.proprietario;
end;
$$;

revoke all on function public.entrar_proprietario(text) from public, anon;
revoke all on function public.restaurar_sessao_operador(text) from public, anon;
grant execute on function public.entrar_proprietario(text) to authenticated;
grant execute on function public.restaurar_sessao_operador(text) to authenticated;

notify pgrst, 'reload schema';
