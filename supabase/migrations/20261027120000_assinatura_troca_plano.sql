-- =====================================================================
-- Assinatura: troca de plano e período de teste preservado
--
-- Requer 20261027090000_assinaturas_saas.sql. Execute ANTES de publicar a versão nova da Edge
-- Function "cakto-webhook" (ela passa a enviar o plano no cancelamento). Pode ser executada de novo.
--
-- 1. Período de teste num lugar só: fim_periodo_teste() (7 dias desde a criação da conta).
-- 2. Assinar durante o teste não perde os dias de teste: o período pago começa depois do fim dele.
-- 3. Reembolso/chargeback tira só o período pago: quem ainda estava no teste volta para o teste.
--    (Cancelamento sem reembolso continua mantendo o acesso até o fim do que já foi pago.)
-- 4. Troca de plano (Mensal <-> Anual): o cancelamento/reembolso da assinatura antiga não atinge a
--    nova — o aviso só vale quando o plano dele é o plano atual da conta.
-- 5. Contas que perderam o teste por causa de um reembolso voltam para o teste.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Fim do período de teste da conta
-- ---------------------------------------------------------------------
create or replace function public.fim_periodo_teste(p_conta uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select u.created_at + interval '7 days' from auth.users u where u.id = p_conta
$$;
revoke all on function public.fim_periodo_teste(uuid) from public, anon, authenticated;
grant execute on function public.fim_periodo_teste(uuid) to service_role;

-- Situação da assinatura: mesma de antes, com o teste vindo de fim_periodo_teste()
create or replace function public.situacao_assinatura()
returns table (
  status          text,
  plano           text,
  valor           numeric,
  data_inicio     timestamptz,
  data_expiracao  timestamptz,
  acesso_liberado boolean,
  email_conta     text,
  nome_conta      text,
  telefone_conta  text
)
language sql
stable
security definer
set search_path = public
as $$
  with conta as (
    select u.id, u.email, u.created_at, u.raw_user_meta_data as meta
      from auth.users u
     where u.id = public.conta_atual()
  ),
  base as (
    select
      coalesce(a.status, 'trial') as status,
      a.plano,
      a.valor,
      coalesce(a.data_inicio, c.created_at) as data_inicio,
      coalesce(a.data_expiracao, public.fim_periodo_teste(c.id)) as data_expiracao,
      c.email,
      c.meta
    from conta c
    left join public.assinaturas_saas a on a.conta_id = c.id
  )
  select
    -- Ativa ou em teste com a validade passada aparece como vencida
    case when b.status in ('ativa', 'trial') and b.data_expiracao <= now() then 'vencida' else b.status end,
    b.plano,
    b.valor,
    b.data_inicio,
    b.data_expiracao,
    -- Cancelada continua com acesso até o fim do período já pago
    b.status in ('ativa', 'trial', 'cancelada') and b.data_expiracao > now(),
    b.email,
    coalesce(b.meta ->> 'nome_responsavel', ''),
    coalesce(b.meta ->> 'whatsapp', '')
  from base b
$$;
revoke all on function public.situacao_assinatura() from public, anon;
grant execute on function public.situacao_assinatura() to authenticated;

-- ---------------------------------------------------------------------
-- 2. Pagamento: o período pago começa depois do fim do teste (ou da validade atual)
-- ---------------------------------------------------------------------
create or replace function public.registrar_pagamento_assinatura(
  p_conta    uuid,
  p_email    text,
  p_plano    text,
  p_valor    numeric,
  p_order_id text,
  p_evento   text,
  p_payload  jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dias int := case p_plano when 'anual' then 365 when 'mensal' then 30 end;
  v_fim_teste timestamptz := coalesce(public.fim_periodo_teste(p_conta), now());
begin
  if v_dias is null then
    raise exception 'Plano inválido: %', p_plano;
  end if;

  insert into public.cakto_eventos (chave, evento, conta_id, resultado, payload)
  values ('pagamento:' || p_order_id, p_evento, p_conta, 'pagamento', p_payload)
  on conflict (chave) do nothing;
  if not found then
    return 'duplicado';
  end if;

  insert into public.assinaturas_saas as a
    (conta_id, email, plano, valor, status, data_inicio, data_expiracao, cakto_order_id)
  values
    -- Primeira assinatura: os dias de teste que sobravam não se perdem
    (p_conta, p_email, p_plano, p_valor, 'ativa', now(),
     greatest(now(), v_fim_teste) + make_interval(days => v_dias), p_order_id)
  on conflict (conta_id) do update set
    email          = excluded.email,
    plano          = excluded.plano,
    valor          = excluded.valor,
    -- Renovação em dia mantém a data de início e soma os dias ao fim do período atual;
    -- assinatura vencida (ou reembolsada) recomeça agora
    data_inicio    = case when a.data_expiracao > now() then a.data_inicio else now() end,
    data_expiracao = greatest(a.data_expiracao, now()) + make_interval(days => v_dias),
    status         = 'ativa',
    cakto_order_id = excluded.cakto_order_id;

  return 'ativada';
end;
$$;
revoke all on function public.registrar_pagamento_assinatura(uuid, text, text, numeric, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_pagamento_assinatura(uuid, text, text, numeric, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------
-- 3 e 4. Cancelamento / reembolso
-- ---------------------------------------------------------------------
drop function if exists public.encerrar_assinatura(uuid, text, text, boolean, jsonb);

create or replace function public.encerrar_assinatura(
  p_conta    uuid,
  p_order_id text,
  p_evento   text,
  p_imediato boolean,
  p_payload  jsonb,
  p_plano    text default null   -- plano do pedido cancelado; null = não identificado (vale para a conta)
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plano_atual text;
  v_fim_teste   timestamptz;
begin
  insert into public.cakto_eventos (chave, evento, conta_id, resultado, payload)
  values (p_evento || ':' || p_order_id, p_evento, p_conta, 'encerramento', p_payload)
  on conflict (chave) do nothing;
  if not found then
    return 'duplicado';
  end if;

  select plano into v_plano_atual from public.assinaturas_saas where conta_id = p_conta;
  if not found then
    return 'sem_assinatura';
  end if;

  -- Cancelamento da assinatura antiga depois de trocar de plano: a assinatura atual continua
  if p_plano is not null and v_plano_atual is distinct from p_plano then
    update public.cakto_eventos set resultado = 'outro_plano' where chave = p_evento || ':' || p_order_id;
    return 'outro_plano';
  end if;

  -- Cancelamento sem reembolso: o acesso continua até o fim do que já foi pago (inclusive o teste)
  if not p_imediato then
    update public.assinaturas_saas set status = 'cancelada' where conta_id = p_conta;
    return 'cancelada';
  end if;

  -- Reembolso / chargeback: sai só o período pago; quem ainda estava no teste volta para o teste
  v_fim_teste := public.fim_periodo_teste(p_conta);
  if v_fim_teste > now() then
    update public.assinaturas_saas
       set status = 'trial', plano = null, valor = null, data_expiracao = v_fim_teste
     where conta_id = p_conta;
    return 'reembolsada_volta_teste';
  end if;

  update public.assinaturas_saas
     set status = 'cancelada', data_expiracao = least(data_expiracao, now())
   where conta_id = p_conta;
  return 'reembolsada';
end;
$$;
revoke all on function public.encerrar_assinatura(uuid, text, text, boolean, jsonb, text) from public, anon, authenticated;
grant execute on function public.encerrar_assinatura(uuid, text, text, boolean, jsonb, text) to service_role;

-- ---------------------------------------------------------------------
-- 5. Quem perdeu o teste por causa de um reembolso volta para o teste
-- ---------------------------------------------------------------------
update public.assinaturas_saas a
   set status = 'trial', plano = null, valor = null, data_expiracao = public.fim_periodo_teste(a.conta_id)
 where a.status = 'cancelada'
   and a.data_expiracao <= now()
   and public.fim_periodo_teste(a.conta_id) > now();

notify pgrst, 'reload schema';
