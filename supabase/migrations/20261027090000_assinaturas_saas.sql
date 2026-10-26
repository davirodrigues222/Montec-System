-- =====================================================================
-- Planos e assinatura (SaaS) com pagamento pela Cakto
--
-- Requer 20261026120000_login_proprio_funcionarios.sql (usa conta_atual()). Execute depois das
-- anteriores. Pode ser executada de novo sem perder dados.
--
-- A assinatura é da CONTA DA LOJA (o dono): os funcionários com login próprio herdam o plano dela.
--   * assinaturas_saas: uma linha por conta (plano, status, validade). Só o servidor grava —
--     a Edge Function "cakto-webhook", com a chave secreta, quando a Cakto avisa um pagamento.
--     Quem está logado só LÊ a da própria loja.
--   * cakto_eventos: avisos já recebidos da Cakto. A Cakto pode mandar o mesmo aviso mais de uma
--     vez; o id do pedido garante que um pagamento soma dias uma única vez.
--   * situacao_assinatura(): o que o sistema mostra (status, plano, validade). Conta sem linha
--     está no período de teste, contado a partir da criação da conta.
--
-- O bloqueio das telas só liga com VITE_ASSINATURA_OBRIGATORIA=true no frontend. Antes disso (ou
-- se esta migração ainda não foi executada) o sistema funciona normalmente para todas as contas.
-- =====================================================================

create table if not exists public.assinaturas_saas (
  conta_id        uuid primary key references auth.users (id) on delete cascade,
  email           text not null,
  plano           text check (plano in ('mensal', 'anual')),
  valor           numeric(10, 2),
  status          text not null default 'trial' check (status in ('ativa', 'trial', 'vencida', 'cancelada')),
  data_inicio     timestamptz not null default now(),
  data_expiracao  timestamptz not null,
  cakto_order_id  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists assinaturas_saas_updated_at on public.assinaturas_saas;
create trigger assinaturas_saas_updated_at
  before update on public.assinaturas_saas
  for each row execute function public.tg_set_updated_at();

alter table public.assinaturas_saas enable row level security;

-- Cada loja lê só a própria assinatura; ninguém logado grava (só o servidor, com a chave secreta)
drop policy if exists "assinatura: loja lê" on public.assinaturas_saas;
create policy "assinatura: loja lê" on public.assinaturas_saas
  for select to authenticated
  using (conta_id = public.conta_atual());

revoke all on public.assinaturas_saas from anon;
revoke insert, update, delete on public.assinaturas_saas from authenticated;

create table if not exists public.cakto_eventos (
  chave        text primary key,            -- 'pagamento:<id do pedido>' ou '<evento>:<id do pedido>'
  evento       text not null,
  conta_id     uuid references auth.users (id) on delete set null,
  resultado    text not null,
  payload      jsonb,
  recebido_em  timestamptz not null default now()
);

-- Só o servidor lê e grava (RLS ligado e nenhuma regra para quem está logado)
alter table public.cakto_eventos enable row level security;
revoke all on public.cakto_eventos from anon, authenticated;

-- ---------------------------------------------------------------------
-- Situação da assinatura da loja de quem está logado
-- ---------------------------------------------------------------------
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
      -- Período de teste: 7 dias desde a criação da conta
      coalesce(a.data_expiracao, c.created_at + interval '7 days') as data_expiracao,
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
-- Usadas só pela Edge Function "cakto-webhook" (chave secreta)
-- ---------------------------------------------------------------------

-- Conta da loja pelo e-mail do comprador (só contas de dono; logins internos de funcionário ficam de fora)
create or replace function public.conta_por_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
    from auth.users u
   where lower(u.email) = lower(trim(p_email))
     and u.email not like '%@funcionarios.montec.app'
     and not exists (select 1 from public.membros_conta mc where mc.user_id = u.id)
   limit 1
$$;
revoke all on function public.conta_por_email(text) from public, anon, authenticated;
grant execute on function public.conta_por_email(text) to service_role;

-- Pagamento aprovado ou renovado: soma 30 (mensal) ou 365 (anual) dias a partir da validade atual
-- (ou de agora, se já venceu). Devolve 'duplicado' quando esse pedido já tinha sido contado.
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
    (p_conta, p_email, p_plano, p_valor, 'ativa', now(), now() + make_interval(days => v_dias), p_order_id)
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

-- Cancelamento (mantém o acesso até o fim do período pago) ou reembolso/chargeback (corta na hora)
create or replace function public.encerrar_assinatura(
  p_conta    uuid,
  p_order_id text,
  p_evento   text,
  p_imediato boolean,
  p_payload  jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cakto_eventos (chave, evento, conta_id, resultado, payload)
  values (p_evento || ':' || p_order_id, p_evento, p_conta, 'encerramento', p_payload)
  on conflict (chave) do nothing;
  if not found then
    return 'duplicado';
  end if;

  update public.assinaturas_saas
     set status         = 'cancelada',
         data_expiracao = case when p_imediato then least(data_expiracao, now()) else data_expiracao end
   where conta_id = p_conta;

  return case when found then 'cancelada' else 'sem_assinatura' end;
end;
$$;
revoke all on function public.encerrar_assinatura(uuid, text, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.encerrar_assinatura(uuid, text, text, boolean, jsonb) to service_role;

notify pgrst, 'reload schema';
