-- =====================================================================
-- Várias opções de preço no mesmo orçamento
--
-- Requer a migração 20261114090000_orcamentos.sql. Pode ser executada de novo sem perder dados.
--
-- Antes o orçamento tinha um valor só; para passar "tela original" e "primeira linha" ao mesmo cliente
-- era preciso mandar dois orçamentos. Agora cada orçamento tem de 1 a 6 opções (qualidade da peça,
-- valor e descrição) e o cliente escolhe qual autoriza pelo link.
--
--   orcamento_opcoes                        as opções de cada orçamento (1:N, apagadas junto com ele)
--   orcamentos.valor                        passa a ser o MENOR valor entre as opções (listagem e ordenação)
--   orcamentos.opcao_aprovada               cópia da opção autorizada (qualidade, valor, descrição), para
--                                           ficar registrado o que foi combinado
--   salvar_orcamento(dados, opcoes, id)     cria ou edita o orçamento com as opções numa transação só
--   consultar_orcamento / responder_orcamento   página pública: mostra as opções e grava a escolhida
--
-- Só dá para editar orçamento que ainda está aguardando resposta. Os orçamentos que já existem ganham
-- uma opção com o valor deles.
-- =====================================================================

create table if not exists public.orcamento_opcoes (
  id           uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references public.orcamentos (id) on delete cascade,
  user_id      uuid not null default public.conta_atual() references auth.users (id) on delete cascade,
  ordem        smallint not null check (ordem between 1 and 6),
  qualidade    text check (qualidade is null or length(btrim(qualidade)) between 1 and 40),  -- ex.: Original, Incell
  valor        numeric(12, 2) not null check (valor > 0 and valor < 10000000),
  descricao    text check (descricao is null or length(descricao) <= 200),                    -- ex.: garantia de 6 meses
  unique (orcamento_id, ordem)
);

alter table public.orcamentos add column if not exists opcao_aprovada jsonb;
alter table public.orcamentos drop constraint if exists orcamentos_opcao_aprovada_check;
alter table public.orcamentos add constraint orcamentos_opcao_aprovada_check
  check (opcao_aprovada is null or (jsonb_typeof(opcao_aprovada) = 'object' and status = 'APROVADO'));

grant update (cliente_nome, cliente_whatsapp, id_cliente, titulo, aparelho, valor, garantia, brinde, condicoes,
              observacoes, validade, status, respondido_em, respondido_por, motivo_recusa, opcao_aprovada)
  on public.orcamentos to authenticated;

-- Orçamentos antigos: uma opção com o valor que já tinham
insert into public.orcamento_opcoes (orcamento_id, user_id, ordem, valor)
select o.id, o.user_id, 1, o.valor
  from public.orcamentos o
 where not exists (select 1 from public.orcamento_opcoes p where p.orcamento_id = o.id);

update public.orcamentos
   set opcao_aprovada = jsonb_build_object('qualidade', '', 'valor', valor, 'descricao', '')
 where status = 'APROVADO' and opcao_aprovada is null;

-- ---------------------------------------------------------------------
-- Acesso: mesmas regras dos orçamentos. As opções são trocadas inteiras ao editar (apaga e grava de
-- novo), por isso não há UPDATE.
-- ---------------------------------------------------------------------
alter table public.orcamento_opcoes enable row level security;
revoke all on public.orcamento_opcoes from anon, authenticated;
grant select, insert, delete on public.orcamento_opcoes to authenticated;

do $$
declare
  pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'orcamento_opcoes' loop
    execute format('drop policy %I on public.orcamento_opcoes', pol.policyname);
  end loop;
end $$;

create policy "orcamento_opcoes: lê" on public.orcamento_opcoes for select to authenticated
  using (user_id = public.conta_atual() and (public.operador_pode('tela_nova_os') or public.operador_pode('tela_ordens')));
-- O orçamento precisa ser visível para quem grava (ou seja, ser da mesma conta)
create policy "orcamento_opcoes: cria" on public.orcamento_opcoes for insert to authenticated
  with check (
    user_id = public.conta_atual()
    and (public.operador_pode('tela_nova_os') or public.operador_pode('tela_ordens'))
    and exists (select 1 from public.orcamentos o where o.id = orcamento_id)
  );
create policy "orcamento_opcoes: exclui" on public.orcamento_opcoes for delete to authenticated
  using (user_id = public.conta_atual() and (public.operador_pode('tela_nova_os') or public.operador_pode('tela_ordens')));

create policy "assinatura: cria" on public.orcamento_opcoes as restrictive for insert to authenticated
  with check (public.assinatura_ativa());
create policy "assinatura: exclui" on public.orcamento_opcoes as restrictive for delete to authenticated
  using (public.assinatura_ativa());

-- ---------------------------------------------------------------------
-- Criar ou editar o orçamento com as opções (tudo ou nada).
-- Roda com as permissões de quem chama (security invoker): as regras acima continuam valendo.
--   p_dados   { cliente_nome, cliente_whatsapp, id_cliente, titulo, aparelho, garantia, brinde,
--               condicoes[], observacoes, validade }
--   p_opcoes  [ { qualidade, valor, descricao }, … ]  na ordem em que aparecem para o cliente
--   p_id      null para criar; o id do orçamento para editar
-- Devolve o id do orçamento.
-- ---------------------------------------------------------------------
create or replace function public.salvar_orcamento(p_dados jsonb, p_opcoes jsonb, p_id uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id    uuid;
  v_qtd   int;
  v_menor numeric(12, 2);
  v_op    jsonb;
  v_n     int := 0;
  v_valor numeric;
  v_qual  text;
begin
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then
    raise exception 'Dados do orçamento inválidos.';
  end if;
  if p_opcoes is null or jsonb_typeof(p_opcoes) <> 'array' or jsonb_array_length(p_opcoes) = 0 then
    raise exception 'Informe ao menos uma opção de preço.';
  end if;
  v_qtd := jsonb_array_length(p_opcoes);
  if v_qtd > 6 then
    raise exception 'Use no máximo 6 opções por orçamento.';
  end if;

  for v_op in select value from jsonb_array_elements(p_opcoes) loop
    v_n := v_n + 1;
    if jsonb_typeof(v_op) <> 'object' then
      raise exception 'Opção %: dados inválidos.', v_n;
    end if;
    begin
      v_valor := round((v_op ->> 'valor')::numeric, 2);
    exception when others then
      v_valor := null;
    end;
    if v_valor is null or v_valor <= 0 or v_valor >= 10000000 then
      raise exception 'Opção %: informe um valor maior que zero.', v_n;
    end if;
    v_qual := nullif(btrim(coalesce(v_op ->> 'qualidade', '')), '');
    -- Com mais de uma opção, o cliente precisa saber a diferença entre elas
    if v_qtd > 1 and v_qual is null then
      raise exception 'Opção %: informe a qualidade da peça (ex.: Original, Primeira linha).', v_n;
    end if;
    if length(v_qual) > 40 then
      raise exception 'Opção %: a qualidade pode ter no máximo 40 caracteres.', v_n;
    end if;
    if length(btrim(coalesce(v_op ->> 'descricao', ''))) > 200 then
      raise exception 'Opção %: a descrição pode ter no máximo 200 caracteres.', v_n;
    end if;
    v_menor := least(coalesce(v_menor, v_valor), v_valor);
  end loop;

  if v_qtd > 1 and (select count(distinct lower(btrim(value ->> 'qualidade'))) from jsonb_array_elements(p_opcoes)) < v_qtd then
    raise exception 'Há opções com a mesma qualidade. Diferencie cada uma (ex.: Original e Primeira linha).';
  end if;

  if p_id is null then
    insert into public.orcamentos (cliente_nome, cliente_whatsapp, id_cliente, titulo, aparelho, valor, garantia, brinde,
                                   condicoes, observacoes, validade)
    values (p_dados ->> 'cliente_nome', p_dados ->> 'cliente_whatsapp', nullif(p_dados ->> 'id_cliente', ''),
            p_dados ->> 'titulo', p_dados ->> 'aparelho', v_menor, nullif(p_dados ->> 'garantia', ''),
            nullif(p_dados ->> 'brinde', ''), coalesce(p_dados -> 'condicoes', '[]'::jsonb),
            nullif(p_dados ->> 'observacoes', ''), nullif(p_dados ->> 'validade', '')::date)
    returning id into v_id;
  else
    -- Só enquanto o cliente não respondeu: depois disso o orçamento é o registro do que foi combinado
    update public.orcamentos
       set cliente_nome     = p_dados ->> 'cliente_nome',
           cliente_whatsapp = p_dados ->> 'cliente_whatsapp',
           id_cliente       = nullif(p_dados ->> 'id_cliente', ''),
           titulo           = p_dados ->> 'titulo',
           aparelho         = p_dados ->> 'aparelho',
           valor            = v_menor,
           garantia         = nullif(p_dados ->> 'garantia', ''),
           brinde           = nullif(p_dados ->> 'brinde', ''),
           condicoes        = coalesce(p_dados -> 'condicoes', '[]'::jsonb),
           observacoes      = nullif(p_dados ->> 'observacoes', ''),
           validade         = nullif(p_dados ->> 'validade', '')::date
     where id = p_id and status = 'PENDENTE'
    returning id into v_id;
    if v_id is null then
      if exists (select 1 from public.orcamentos where id = p_id) then
        raise exception 'Este orçamento já foi respondido e não pode mais ser alterado. Use "Usar como modelo" para montar um novo.';
      end if;
      raise exception 'Orçamento não encontrado. Ele pode ter sido excluído.';
    end if;
    delete from public.orcamento_opcoes where orcamento_id = v_id;
  end if;

  insert into public.orcamento_opcoes (orcamento_id, ordem, qualidade, valor, descricao)
  select v_id,
         t.ordem,
         nullif(btrim(coalesce(t.value ->> 'qualidade', '')), ''),
         round((t.value ->> 'valor')::numeric, 2),
         nullif(btrim(coalesce(t.value ->> 'descricao', '')), '')
    from jsonb_array_elements(p_opcoes) with ordinality as t(value, ordem);

  return v_id;
end;
$$;

revoke all on function public.salvar_orcamento(jsonb, jsonb, uuid) from public;
grant execute on function public.salvar_orcamento(jsonb, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Página pública: agora com as opções e a opção autorizada
-- ---------------------------------------------------------------------
create or replace function public.consultar_orcamento(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  o        public.orcamentos;
  v_loja   jsonb;
  v_opcoes jsonb;
begin
  if p_token is null or length(p_token) <> 24 then
    return null;
  end if;
  select * into o from public.orcamentos where token = p_token and criado_em > now() - interval '90 days';
  if not found then
    return null;
  end if;
  select c.dados into v_loja from public.configuracoes_conta c where c.conta_id = o.user_id;
  v_loja := coalesce(v_loja, '{}'::jsonb);
  select jsonb_agg(jsonb_build_object('id', p.id, 'qualidade', coalesce(p.qualidade, ''), 'valor', p.valor,
                                      'descricao', coalesce(p.descricao, '')) order by p.ordem)
    into v_opcoes
    from public.orcamento_opcoes p
   where p.orcamento_id = o.id;
  -- Só o necessário: primeiro nome do cliente, nada de telefone
  return jsonb_build_object(
    'loja', jsonb_build_object(
      'nome', coalesce(nullif(v_loja ->> 'nomeLoja', ''), 'Assistência técnica'),
      'telefone', coalesce(v_loja ->> 'telefone', ''),
      'endereco', coalesce(v_loja ->> 'endereco', ''),
      'horario', coalesce(v_loja ->> 'horarioFuncionamento', ''),
      'logo', coalesce(v_loja ->> 'logoUrl', '')
    ),
    'orcamento', jsonb_build_object(
      'cliente', split_part(btrim(o.cliente_nome), ' ', 1),
      'titulo', o.titulo,
      'aparelho', o.aparelho,
      'valor', o.valor,
      'opcoes', coalesce(v_opcoes, jsonb_build_array(jsonb_build_object('id', null, 'qualidade', '', 'valor', o.valor, 'descricao', ''))),
      'opcao_aprovada', o.opcao_aprovada,
      'garantia', coalesce(o.garantia, ''),
      'brinde', coalesce(o.brinde, ''),
      'condicoes', o.condicoes,
      'observacoes', coalesce(o.observacoes, ''),
      'validade', o.validade,
      'criado_em', o.criado_em,
      'status', o.status,
      'respondido_em', o.respondido_em,
      'vencido', o.status = 'PENDENTE' and o.validade is not null and o.validade < (now() at time zone 'America/Sao_Paulo')::date
    )
  );
end;
$$;

-- Novo parâmetro p_opcao: a versão antiga (3 parâmetros) sai para não haver duas funções com o mesmo nome
drop function if exists public.responder_orcamento(text, boolean, text);

create or replace function public.responder_orcamento(p_token text, p_aprovar boolean, p_motivo text default null, p_opcao uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o      public.orcamentos;
  v_op   public.orcamento_opcoes;
  v_qtd  int;
  v_snap jsonb;
begin
  if p_token is null or length(p_token) <> 24 or p_aprovar is null then
    raise exception 'Link inválido ou vencido.';
  end if;
  select * into o from public.orcamentos
   where token = p_token and criado_em > now() - interval '90 days'
   for update;
  if not found then
    raise exception 'Link inválido ou vencido.';
  end if;
  if o.status <> 'PENDENTE' then
    return public.consultar_orcamento(p_token); -- já respondido: nada a fazer
  end if;
  if o.validade is not null and o.validade < (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Este orçamento venceu. Fale com a loja para receber um novo.';
  end if;

  if p_aprovar then
    select count(*) into v_qtd from public.orcamento_opcoes where orcamento_id = o.id;
    if p_opcao is not null then
      select * into v_op from public.orcamento_opcoes where id = p_opcao and orcamento_id = o.id;
      if not found then
        -- A loja alterou o orçamento depois que a página foi aberta
        raise exception 'O orçamento foi atualizado pela loja. Recarregue a página para ver os valores novos.';
      end if;
    elsif v_qtd > 1 then
      raise exception 'Escolha uma das opções antes de autorizar.';
    elsif v_qtd = 1 then
      select * into v_op from public.orcamento_opcoes where orcamento_id = o.id;
    end if;
    v_snap := case
      when v_op.id is null then jsonb_build_object('qualidade', '', 'valor', o.valor, 'descricao', '')
      else jsonb_build_object('id', v_op.id, 'qualidade', coalesce(v_op.qualidade, ''), 'valor', v_op.valor,
                              'descricao', coalesce(v_op.descricao, ''))
    end;
  end if;

  update public.orcamentos
     set status = case when p_aprovar then 'APROVADO' else 'RECUSADO' end,
         respondido_em = now(),
         respondido_por = 'CLIENTE',
         opcao_aprovada = v_snap,
         motivo_recusa = case when p_aprovar then null else nullif(left(btrim(coalesce(p_motivo, '')), 300), '') end
   where id = o.id;
  return public.consultar_orcamento(p_token);
end;
$$;

revoke all on function public.consultar_orcamento(text) from public;
revoke all on function public.responder_orcamento(text, boolean, text, uuid) from public;
grant execute on function public.consultar_orcamento(text) to anon, authenticated;
grant execute on function public.responder_orcamento(text, boolean, text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
