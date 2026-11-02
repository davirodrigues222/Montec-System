-- =====================================================================
-- Link de acompanhamento da OS para o cliente
--
-- Requer as migrações anteriores (usa conta_atual(), operador_pode() e assinatura_ativa()).
-- Pode ser executada de novo sem perder dados.
--
-- O cliente recebe um link (…/acompanhar/<código>) e vê, sem login, o andamento da OS e o
-- orçamento, e pode aprovar o orçamento por ali. A página mostra só o necessário: primeiro nome,
-- aparelho, defeito, serviço, valor, datas, garantia e status. Nada de telefone, CPF, IMEI, senha,
-- custos, lucro, diagnóstico ou observações internas.
--
--   links_acompanhamento                      código secreto de cada OS (ninguém lê a tabela direto)
--   link_acompanhamento_os(id_os)             gera o código (ou devolve o atual): Nova ordem ou Ordens
--   revogar_link_acompanhamento(id_os)        invalida o código; o próximo gerado é outro
--   consultar_acompanhamento(código)          o que a página pública mostra (visitante sem login)
--   aprovar_orcamento_acompanhamento(código)  o cliente aprova o orçamento pelo link
--
-- O link deixa de funcionar 30 dias depois da entrega da OS. OS em rascunho não têm link.
-- =====================================================================

create table if not exists public.links_acompanhamento (
  token     text primary key,
  id_os     text not null,
  user_id   uuid not null references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now(),
  unique (user_id, id_os)
);
-- Só as funções abaixo usam a tabela
alter table public.links_acompanhamento enable row level security;
revoke all on public.links_acompanhamento from anon, authenticated;

-- ---------------------------------------------------------------------
-- Gerar e revogar (sistema, com login)
-- ---------------------------------------------------------------------
create or replace function public.link_acompanhamento_os(p_id_os text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_conta uuid := public.conta_atual();
  v_token text;
begin
  if not (public.operador_pode('tela_ordens') or public.operador_pode('tela_nova_os')) then
    raise exception 'new row violates row-level security policy for table "links_acompanhamento"' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.ordens_servico os
     where os.id_os::text = p_id_os and os.user_id::text = v_conta::text and os.status_os <> 'RASCUNHO'
  ) then
    raise exception 'Ordem de serviço não encontrada.';
  end if;

  select l.token into v_token from public.links_acompanhamento l where l.user_id = v_conta and l.id_os = p_id_os;
  if v_token is not null then
    return v_token;
  end if;

  if not public.assinatura_ativa() then
    raise exception 'Assinatura vencida: renove o plano para gerar links de acompanhamento.' using errcode = '42501';
  end if;
  -- 18 bytes aleatórios em base64 próprio para URL: 24 caracteres, impossível de adivinhar
  v_token := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
  insert into public.links_acompanhamento (token, id_os, user_id)
  values (v_token, p_id_os, v_conta)
  on conflict (user_id, id_os) do update set user_id = excluded.user_id
  returning token into v_token;
  return v_token;
end;
$$;

create or replace function public.revogar_link_acompanhamento(p_id_os text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.operador_pode('tela_ordens') or public.operador_pode('tela_nova_os')) then
    raise exception 'new row violates row-level security policy for table "links_acompanhamento"' using errcode = '42501';
  end if;
  delete from public.links_acompanhamento where user_id = public.conta_atual() and id_os = p_id_os;
end;
$$;

revoke all on function public.link_acompanhamento_os(text) from public, anon;
revoke all on function public.revogar_link_acompanhamento(text) from public, anon;
grant execute on function public.link_acompanhamento_os(text) to authenticated;
grant execute on function public.revogar_link_acompanhamento(text) to authenticated;

-- ---------------------------------------------------------------------
-- Página pública (visitante sem login, só com o código)
-- ---------------------------------------------------------------------

-- OS do código, com o JSON checklist_entrada já normalizado (a coluna pode ser json, jsonb ou texto).
-- Lê a linha como JSON para não depender de colunas opcionais (ex.: data_conclusao).
create or replace function public.os_do_acompanhamento(p_token text)
returns table (id_os text, conta uuid, os jsonb, checklist jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_link public.links_acompanhamento;
  v_os   jsonb;
  v_ck   jsonb;
begin
  select * into v_link from public.links_acompanhamento l where l.token = p_token;
  if not found then
    return;
  end if;
  select to_jsonb(o) into v_os
    from public.ordens_servico o
   where o.id_os::text = v_link.id_os and o.user_id::text = v_link.user_id::text;
  if v_os is null or v_os ->> 'status_os' = 'RASCUNHO' then
    return;
  end if;

  v_ck := v_os -> 'checklist_entrada';
  if v_ck is not null and jsonb_typeof(v_ck) = 'string' then
    begin
      v_ck := (v_ck #>> '{}')::jsonb;
    exception when others then
      v_ck := null;
    end;
  end if;
  if v_ck is null or jsonb_typeof(v_ck) <> 'object' then
    v_ck := '{}'::jsonb;
  end if;

  -- Link vencido: 30 dias depois da entrega (data em formato inesperado não derruba a página)
  if v_os ->> 'status_os' = 'ENTREGUE' then
    begin
      if coalesce(nullif(v_os ->> 'data_conclusao', ''), nullif(v_ck ->> '__dataConclusao', ''))::timestamptz
         < now() - interval '30 days' then
        return;
      end if;
    exception when others then
      null;
    end;
  end if;

  id_os := v_link.id_os;
  conta := v_link.user_id;
  os := v_os;
  checklist := v_ck;
  return next;
end;
$$;
-- Função interna: só as duas abaixo a usam
revoke all on function public.os_do_acompanhamento(text) from public, anon, authenticated;

create or replace function public.consultar_acompanhamento(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r        record;
  v_loja   jsonb;
  v_modelo text;
  v_valor  numeric;
begin
  if p_token is null or length(p_token) <> 24 then
    return null;
  end if;
  select * into r from public.os_do_acompanhamento(p_token);
  if not found then
    return null;
  end if;

  select c.dados into v_loja from public.configuracoes_conta c where c.conta_id = r.conta;
  v_loja := coalesce(v_loja, '{}'::jsonb);
  select a.modelo into v_modelo from public.aparelhos_cliente a where a.id_aparelho::text = r.os ->> 'id_aparelho';
  v_valor := coalesce(nullif(r.os ->> 'valor_total', '')::numeric, 0);

  return jsonb_build_object(
    'loja', jsonb_build_object(
      'nome', coalesce(nullif(v_loja ->> 'nomeLoja', ''), 'Assistência técnica'),
      'telefone', coalesce(v_loja ->> 'telefone', ''),
      'endereco', coalesce(v_loja ->> 'endereco', ''),
      'horario', coalesce(v_loja ->> 'horarioFuncionamento', ''),
      'logo', coalesce(v_loja ->> 'logoUrl', '')
    ),
    'os', jsonb_build_object(
      'numero', r.os ->> 'numero_os',
      'status', r.os ->> 'status_os',
      'cliente', split_part(trim(coalesce((select c.nome from public.clientes c where c.id_cliente::text = r.os ->> 'id_cliente'), '')), ' ', 1),
      'aparelho', coalesce(v_modelo, ''),
      'defeito', coalesce(r.os ->> 'defeito_relatado', ''),
      'servico', coalesce(r.checklist ->> '__servicoRealizado', ''),
      'valor', v_valor,
      'data_abertura', r.os ->> 'data_abertura',
      'data_prevista', nullif(coalesce(r.os ->> 'data_prevista_entrega', r.checklist ->> '__dataPrevistaEntrega'), ''),
      'data_conclusao', nullif(coalesce(r.os ->> 'data_conclusao', r.checklist ->> '__dataConclusao'), ''),
      'possui_garantia', coalesce((r.os ->> 'possui_garantia')::boolean, true),
      'garantia_dias', case when r.checklist ->> '__prazoGarantiaDias' ~ '^\d{1,5}$'
                            then (r.checklist ->> '__prazoGarantiaDias')::integer end,
      'aprovado_em', nullif(r.checklist ->> '__orcamentoAprovadoEm', ''),
      'pode_aprovar', r.os ->> 'status_os' in ('AGUARDANDO_AVALIACAO', 'EM_ANALISE')
                      and v_valor > 0
                      and coalesce(r.checklist ->> '__orcamentoAprovadoEm', '') = ''
    )
  );
end;
$$;

create or replace function public.aprovar_orcamento_acompanhamento(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r      record;
  v_tipo text;
  v_novo jsonb;
begin
  if p_token is null or length(p_token) <> 24 then
    raise exception 'Link inválido ou vencido.';
  end if;
  select * into r from public.os_do_acompanhamento(p_token);
  if not found then
    raise exception 'Link inválido ou vencido.';
  end if;
  if coalesce(r.checklist ->> '__orcamentoAprovadoEm', '') <> '' then
    return public.consultar_acompanhamento(p_token); -- já aprovado: nada a fazer
  end if;
  if not (r.os ->> 'status_os' in ('AGUARDANDO_AVALIACAO', 'EM_ANALISE')
          and coalesce(nullif(r.os ->> 'valor_total', '')::numeric, 0) > 0) then
    raise exception 'Este orçamento não pode mais ser aprovado pelo link. Fale com a loja.';
  end if;

  -- Mesmas chaves que o sistema grava ao registrar a aprovação (utils/conformidade.ts)
  v_novo := r.checklist || jsonb_build_object(
    '__orcamentoAprovadoEm', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    '__orcamentoAprovacaoForma', 'Link de acompanhamento'
  );
  select data_type into v_tipo
    from information_schema.columns
   where table_schema = 'public' and table_name = 'ordens_servico' and column_name = 'checklist_entrada';
  execute format(
    'update public.ordens_servico set checklist_entrada = %s where id_os::text = $2 and user_id::text = $3',
    case when v_tipo in ('json', 'jsonb') then format('$1::%s', v_tipo) else '$1::text' end
  ) using v_novo, r.id_os, r.conta::text;

  return public.consultar_acompanhamento(p_token);
end;
$$;

-- Visitante sem login usa só estas duas (a migração 20261026200000 tira o resto do "anon")
revoke all on function public.consultar_acompanhamento(text) from public;
revoke all on function public.aprovar_orcamento_acompanhamento(text) from public;
grant execute on function public.consultar_acompanhamento(text) to anon, authenticated;
grant execute on function public.aprovar_orcamento_acompanhamento(text) to anon, authenticated;

notify pgrst, 'reload schema';
