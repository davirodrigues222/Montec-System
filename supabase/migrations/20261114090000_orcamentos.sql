-- =====================================================================
-- Orçamento rápido pelo WhatsApp
--
-- Requer as migrações anteriores (usa conta_atual(), operador_pode(), assinatura_ativa() e
-- nome_operador_atual()). Pode ser executada de novo sem perder dados.
--
-- A loja monta o orçamento (aparelho, serviço, valor, garantia, brinde e formas de pagamento) e manda
-- pelo WhatsApp do cliente com um link (…/orcamento/<código>). Pelo link, sem login, o cliente vê o
-- orçamento e autoriza ou não o serviço. Não cria OS: serve para passar o preço antes de o aparelho
-- entrar na loja.
--
--   orcamentos                           o orçamento e a resposta do cliente
--   consultar_orcamento(código)          o que a página pública mostra (visitante sem login)
--   responder_orcamento(código, …)       o cliente autoriza ou recusa pelo link
--
-- Ler e gravar no sistema: permissão "Nova ordem" ou "Ordens de serviço". Gravar exige assinatura ativa.
-- O link para de funcionar 90 dias depois de criado; a resposta só vale até a validade do orçamento.
-- =====================================================================

create table if not exists public.orcamentos (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default public.conta_atual() references auth.users (id) on delete cascade,
  -- 18 bytes aleatórios em base64 próprio para URL: 24 caracteres, impossível de adivinhar
  token            text not null unique default translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_'),
  cliente_nome     text not null check (length(btrim(cliente_nome)) between 1 and 120),
  cliente_whatsapp text not null check (cliente_whatsapp ~ '^\d{10,13}$'),
  id_cliente       text,
  titulo           text not null check (length(btrim(titulo)) between 2 and 80),   -- ex.: TROCA DE TELA
  aparelho         text not null check (length(btrim(aparelho)) between 1 and 120),
  valor            numeric(12, 2) not null check (valor > 0 and valor < 10000000),
  garantia         text check (garantia is null or length(garantia) <= 60),
  brinde           text check (brinde is null or length(brinde) <= 200),
  condicoes        jsonb not null default '[]'::jsonb check (jsonb_typeof(condicoes) = 'array' and jsonb_array_length(condicoes) <= 10),
  observacoes      text check (observacoes is null or length(observacoes) <= 500),
  validade         date,
  status           text not null default 'PENDENTE' check (status in ('PENDENTE', 'APROVADO', 'RECUSADO')),
  respondido_em    timestamptz,
  respondido_por   text check (respondido_por is null or respondido_por in ('CLIENTE', 'LOJA')),
  motivo_recusa    text check (motivo_recusa is null or length(motivo_recusa) <= 300),
  criado_por       text default public.nome_operador_atual(),
  criado_em        timestamptz not null default now()
);
create index if not exists orcamentos_por_data on public.orcamentos (user_id, criado_em desc);

alter table public.orcamentos enable row level security;
revoke all on public.orcamentos from anon, authenticated;
grant select, insert, delete on public.orcamentos to authenticated;
-- O código do link e a conta nunca mudam depois de criados
grant update (cliente_nome, cliente_whatsapp, id_cliente, titulo, aparelho, valor, garantia, brinde, condicoes,
              observacoes, validade, status, respondido_em, respondido_por, motivo_recusa)
  on public.orcamentos to authenticated;

do $$
declare
  pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'orcamentos' loop
    execute format('drop policy %I on public.orcamentos', pol.policyname);
  end loop;
end $$;

create policy "orcamentos: lê" on public.orcamentos for select to authenticated
  using (user_id = public.conta_atual() and (public.operador_pode('tela_nova_os') or public.operador_pode('tela_ordens')));
create policy "orcamentos: cria" on public.orcamentos for insert to authenticated
  with check (user_id = public.conta_atual() and (public.operador_pode('tela_nova_os') or public.operador_pode('tela_ordens')));
create policy "orcamentos: altera" on public.orcamentos for update to authenticated
  using (user_id = public.conta_atual() and (public.operador_pode('tela_nova_os') or public.operador_pode('tela_ordens')))
  with check (user_id = public.conta_atual() and (public.operador_pode('tela_nova_os') or public.operador_pode('tela_ordens')));
create policy "orcamentos: exclui" on public.orcamentos for delete to authenticated
  using (user_id = public.conta_atual() and (public.operador_pode('tela_nova_os') or public.operador_pode('tela_ordens')));

-- Assinatura exigida para gravar (mesmas regras restritivas da migração 20261101120000)
create policy "assinatura: cria" on public.orcamentos as restrictive for insert to authenticated
  with check (public.assinatura_ativa());
create policy "assinatura: altera" on public.orcamentos as restrictive for update to authenticated
  using (public.assinatura_ativa()) with check (public.assinatura_ativa());
create policy "assinatura: exclui" on public.orcamentos as restrictive for delete to authenticated
  using (public.assinatura_ativa());

-- ---------------------------------------------------------------------
-- Página pública (visitante sem login, só com o código)
-- ---------------------------------------------------------------------
create or replace function public.consultar_orcamento(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  o      public.orcamentos;
  v_loja jsonb;
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

create or replace function public.responder_orcamento(p_token text, p_aprovar boolean, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.orcamentos;
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
  update public.orcamentos
     set status = case when p_aprovar then 'APROVADO' else 'RECUSADO' end,
         respondido_em = now(),
         respondido_por = 'CLIENTE',
         motivo_recusa = case when p_aprovar then null else nullif(left(btrim(coalesce(p_motivo, '')), 300), '') end
   where id = o.id;
  return public.consultar_orcamento(p_token);
end;
$$;

revoke all on function public.consultar_orcamento(text) from public;
revoke all on function public.responder_orcamento(text, boolean, text) from public;
grant execute on function public.consultar_orcamento(text) to anon, authenticated;
grant execute on function public.responder_orcamento(text, boolean, text) to anon, authenticated;

notify pgrst, 'reload schema';
