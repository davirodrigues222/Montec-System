-- =====================================================================
-- Estoque de peças
--
-- Requer as migrações anteriores (usa conta_atual(), operador_pode(), pode_ver_custos(),
-- assinatura_ativa() e cabecalho_requisicao()). Pode ser executada de novo sem perder dados.
--
--   estoque_pecas       cadastro da peça: quantidade, estoque mínimo, custo médio e fornecedor
--   estoque_movimentos  histórico de cada entrada, ajuste, baixa por OS e devolução
--   os_pecas            peças do estoque usadas em cada OS (quantidade e custo do dia da baixa)
--
-- Gravar: SÓ pelas funções abaixo (a quantidade nunca é alterada direto na tabela):
--   salvar_peca_estoque / excluir_peca_estoque / movimentar_estoque   permissão Cadastros
--   definir_pecas_os                                                  Nova ordem ou Ordens de serviço
-- Ler: pelas views estoque_pecas_lista, estoque_movimentos_lista e os_pecas_lista. Custos vêm vazios
-- para quem não tem acesso financeiro (mesma regra das OS, migração 20261026180000).
--
-- Baixa na OS: definir_pecas_os recebe a lista completa de peças da OS, baixa ou devolve a diferença ao
-- estoque e soma ao custo_peca da OS (descontando do lucro) a diferença do custo das peças do estoque.
-- O custo digitado à mão na OS ("outras peças") continua somado no mesmo custo_peca.
-- OS excluída: as peças voltam para o estoque.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.estoque_pecas (
  id_peca         uuid primary key default gen_random_uuid(),
  user_id         uuid not null default public.conta_atual() references auth.users (id) on delete cascade,
  nome            text not null check (length(btrim(nome)) between 2 and 120),
  codigo          text,
  categoria       text,
  compatibilidade text,
  id_fornecedor   text,
  quantidade      integer not null default 0,
  estoque_minimo  integer not null default 1 check (estoque_minimo >= 0),
  custo_medio     numeric(12, 2) not null default 0 check (custo_medio >= 0),
  observacoes     text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create unique index if not exists estoque_pecas_nome_unico on public.estoque_pecas (user_id, lower(btrim(nome)));

create table if not exists public.estoque_movimentos (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  id_peca        uuid not null references public.estoque_pecas (id_peca) on delete cascade,
  tipo           text not null check (tipo in ('ENTRADA', 'AJUSTE', 'SAIDA_OS', 'ESTORNO_OS')),
  quantidade     integer not null, -- com sinal: positivo entrou, negativo saiu
  saldo          integer not null, -- quantidade da peça depois do movimento
  custo_unitario numeric(12, 2),
  id_os          text,
  numero_os      text,
  id_fornecedor  text,
  observacao     text,
  autor          text,
  criado_em      timestamptz not null default now()
);
create index if not exists estoque_movimentos_por_peca on public.estoque_movimentos (user_id, id_peca, criado_em desc);

create table if not exists public.os_pecas (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  id_os          text not null,
  id_peca        uuid references public.estoque_pecas (id_peca) on delete set null, -- peça excluída: fica o nome
  nome_peca      text not null,
  quantidade     integer not null check (quantidade > 0),
  custo_unitario numeric(12, 2) not null default 0,
  criado_em      timestamptz not null default now(),
  unique (user_id, id_os, id_peca)
);
create index if not exists os_pecas_por_os on public.os_pecas (user_id, id_os);

-- Sem acesso direto: ler pelas views, gravar pelas funções
alter table public.estoque_pecas enable row level security;
alter table public.estoque_movimentos enable row level security;
alter table public.os_pecas enable row level security;
revoke all on public.estoque_pecas from anon, authenticated;
revoke all on public.estoque_movimentos from anon, authenticated;
revoke all on public.os_pecas from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Leitura (custos só para quem tem acesso financeiro)
-- ---------------------------------------------------------------------
drop view if exists public.estoque_pecas_lista;
create view public.estoque_pecas_lista with (security_barrier = true) as
  select p.id_peca, p.nome, p.codigo, p.categoria, p.compatibilidade, p.id_fornecedor,
         f.nome as fornecedor_nome,
         p.quantidade, p.estoque_minimo,
         case when public.pode_ver_custos() then p.custo_medio end as custo_medio,
         p.observacoes, p.criado_em, p.atualizado_em
    from public.estoque_pecas p
    left join public.cad_fornecedores f on f.id_fornecedor::text = p.id_fornecedor and f.user_id = p.user_id
   where p.user_id = public.conta_atual();

drop view if exists public.estoque_movimentos_lista;
create view public.estoque_movimentos_lista with (security_barrier = true) as
  select m.id, m.id_peca, m.tipo, m.quantidade, m.saldo,
         case when public.pode_ver_custos() then m.custo_unitario end as custo_unitario,
         m.id_os, m.numero_os, m.id_fornecedor, f.nome as fornecedor_nome,
         m.observacao, m.autor, m.criado_em
    from public.estoque_movimentos m
    left join public.cad_fornecedores f on f.id_fornecedor::text = m.id_fornecedor and f.user_id = m.user_id
   where m.user_id = public.conta_atual();

drop view if exists public.os_pecas_lista;
create view public.os_pecas_lista with (security_barrier = true) as
  select op.id, op.id_os, op.id_peca, op.nome_peca, op.quantidade,
         case when public.pode_ver_custos() then op.custo_unitario end as custo_unitario,
         op.criado_em
    from public.os_pecas op
   where op.user_id = public.conta_atual();

revoke all on public.estoque_pecas_lista from anon;
revoke all on public.estoque_movimentos_lista from anon;
revoke all on public.os_pecas_lista from anon;
grant select on public.estoque_pecas_lista to authenticated;
grant select on public.estoque_movimentos_lista to authenticated;
grant select on public.os_pecas_lista to authenticated;

-- ---------------------------------------------------------------------
-- 3. Quem fez o movimento (nome do funcionário ou do proprietário identificado)
-- ---------------------------------------------------------------------
create or replace function public.nome_operador_atual()
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(nullif(btrim(f.nome), ''), nullif(btrim(s.nome), ''), case when s.proprietario then 'Proprietário' end)
    from public.sessoes_operador s
    left join public.funcionarios f on f.id_funcionario = s.id_funcionario
   where s.token_hash = encode(extensions.digest(public.cabecalho_requisicao('x-operador-token'), 'sha256'), 'hex')
     and s.user_id = auth.uid()
     and s.expira_em > now()
   limit 1
$$;
revoke all on function public.nome_operador_atual() from public, anon;
grant execute on function public.nome_operador_atual() to authenticated;

-- ---------------------------------------------------------------------
-- 4. Cadastro da peça
-- ---------------------------------------------------------------------
create or replace function public.salvar_peca_estoque(
  p_id_peca            uuid,
  p_nome               text,
  p_codigo             text,
  p_categoria          text,
  p_compatibilidade    text,
  p_id_fornecedor      text,
  p_estoque_minimo     integer,
  p_custo              numeric,
  p_quantidade_inicial integer,
  p_observacoes        text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conta uuid := public.conta_atual();
  v_id    uuid;
  v_nome  text := btrim(coalesce(p_nome, ''));
  v_qtd   integer := coalesce(p_quantidade_inicial, 0);
  v_forn  text := nullif(btrim(coalesce(p_id_fornecedor, '')), '');
begin
  if not public.operador_pode('tela_cadastros') then
    raise exception 'new row violates row-level security policy for table "estoque_pecas"' using errcode = '42501';
  end if;
  if not public.assinatura_ativa() then
    raise exception 'Assinatura vencida: renove o plano para alterar o estoque.' using errcode = '42501';
  end if;
  if length(v_nome) < 2 or length(v_nome) > 120 then
    raise exception 'Informe o nome da peça (de 2 a 120 caracteres).';
  end if;
  if coalesce(p_estoque_minimo, 0) < 0 or coalesce(p_custo, 0) < 0 or v_qtd < 0 then
    raise exception 'Quantidade, estoque mínimo e custo não podem ser negativos.';
  end if;
  if v_forn is not null and not exists (
    select 1 from public.cad_fornecedores f where f.id_fornecedor::text = v_forn and f.user_id = v_conta
  ) then
    raise exception 'Fornecedor não encontrado.';
  end if;

  begin
    if p_id_peca is null then
      insert into public.estoque_pecas
        (user_id, nome, codigo, categoria, compatibilidade, id_fornecedor, quantidade, estoque_minimo, custo_medio, observacoes)
      values
        (v_conta, v_nome, nullif(btrim(p_codigo), ''), nullif(btrim(p_categoria), ''), nullif(btrim(p_compatibilidade), ''),
         v_forn, v_qtd, coalesce(p_estoque_minimo, 1), round(coalesce(p_custo, 0), 2), nullif(btrim(p_observacoes), ''))
      returning id_peca into v_id;

      if v_qtd > 0 then
        insert into public.estoque_movimentos
          (user_id, id_peca, tipo, quantidade, saldo, custo_unitario, id_fornecedor, observacao, autor)
        values
          (v_conta, v_id, 'ENTRADA', v_qtd, v_qtd, round(coalesce(p_custo, 0), 2), v_forn, 'Estoque inicial',
           public.nome_operador_atual());
      end if;
    else
      -- A quantidade só muda por movimento. O custo médio só é corrigido por quem vê custos.
      update public.estoque_pecas
         set nome            = v_nome,
             codigo          = nullif(btrim(p_codigo), ''),
             categoria       = nullif(btrim(p_categoria), ''),
             compatibilidade = nullif(btrim(p_compatibilidade), ''),
             id_fornecedor   = v_forn,
             estoque_minimo  = coalesce(p_estoque_minimo, estoque_minimo),
             custo_medio     = case when p_custo is not null and public.pode_ver_custos() then round(p_custo, 2) else custo_medio end,
             observacoes     = nullif(btrim(p_observacoes), ''),
             atualizado_em   = now()
       where id_peca = p_id_peca and user_id = v_conta
      returning id_peca into v_id;
      if v_id is null then
        raise exception 'Peça não encontrada.';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'Já existe uma peça com este nome no estoque.';
  end;
  return v_id;
end;
$$;

-- Os movimentos saem junto; nas OS que usaram a peça fica o nome e o custo (sem vínculo)
create or replace function public.excluir_peca_estoque(p_id_peca uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.operador_pode('tela_cadastros') then
    raise exception 'new row violates row-level security policy for table "estoque_pecas"' using errcode = '42501';
  end if;
  if not public.assinatura_ativa() then
    raise exception 'Assinatura vencida: renove o plano para alterar o estoque.' using errcode = '42501';
  end if;
  delete from public.estoque_pecas where id_peca = p_id_peca and user_id = public.conta_atual();
  if not found then
    raise exception 'Peça não encontrada.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Entrada (compra) e ajuste (contagem) de estoque
--    ENTRADA: p_quantidade = quantas chegaram; com custo, recalcula o custo médio ponderado.
--    AJUSTE:  p_quantidade = quantas existem de fato (contagem); grava a diferença.
--    Devolve o novo saldo.
-- ---------------------------------------------------------------------
create or replace function public.movimentar_estoque(
  p_id_peca        uuid,
  p_tipo           text,
  p_quantidade     integer,
  p_custo_unitario numeric,
  p_id_fornecedor  text,
  p_observacao     text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conta uuid := public.conta_atual();
  v_peca  public.estoque_pecas%rowtype;
  v_delta integer;
  v_custo numeric(12, 2);
  v_base  integer;
  v_forn  text := nullif(btrim(coalesce(p_id_fornecedor, '')), '');
begin
  if not public.operador_pode('tela_cadastros') then
    raise exception 'new row violates row-level security policy for table "estoque_pecas"' using errcode = '42501';
  end if;
  if not public.assinatura_ativa() then
    raise exception 'Assinatura vencida: renove o plano para alterar o estoque.' using errcode = '42501';
  end if;

  select * into v_peca from public.estoque_pecas where id_peca = p_id_peca and user_id = v_conta for update;
  if not found then
    raise exception 'Peça não encontrada.';
  end if;
  if v_forn is not null and not exists (
    select 1 from public.cad_fornecedores f where f.id_fornecedor::text = v_forn and f.user_id = v_conta
  ) then
    raise exception 'Fornecedor não encontrado.';
  end if;

  if p_tipo = 'ENTRADA' then
    if p_quantidade is null or p_quantidade < 1 or p_quantidade > 100000 then
      raise exception 'Informe quantas unidades entraram.';
    end if;
    if p_custo_unitario is not null and p_custo_unitario < 0 then
      raise exception 'O custo não pode ser negativo.';
    end if;
    v_delta := p_quantidade;
    -- Saldo negativo (baixas sem estoque registrado) não entra na média
    v_base := greatest(v_peca.quantidade, 0);
    v_custo := case
      when p_custo_unitario is null then v_peca.custo_medio
      else round((v_base * v_peca.custo_medio + p_quantidade * p_custo_unitario) / (v_base + p_quantidade), 2)
    end;
  elsif p_tipo = 'AJUSTE' then
    if p_quantidade is null or p_quantidade < 0 or p_quantidade > 100000 then
      raise exception 'Informe a quantidade contada (zero ou mais).';
    end if;
    v_delta := p_quantidade - v_peca.quantidade;
    v_custo := v_peca.custo_medio;
    if v_delta = 0 then
      return v_peca.quantidade;
    end if;
  else
    raise exception 'Tipo de movimento inválido.';
  end if;

  update public.estoque_pecas
     set quantidade = quantidade + v_delta, custo_medio = v_custo, atualizado_em = now()
   where id_peca = v_peca.id_peca;

  insert into public.estoque_movimentos
    (user_id, id_peca, tipo, quantidade, saldo, custo_unitario, id_fornecedor, observacao, autor)
  values
    (v_conta, v_peca.id_peca, p_tipo, v_delta, v_peca.quantidade + v_delta,
     case when p_tipo = 'ENTRADA' then round(coalesce(p_custo_unitario, v_peca.custo_medio), 2) else v_peca.custo_medio end,
     v_forn, nullif(btrim(coalesce(p_observacao, '')), ''), public.nome_operador_atual());

  return v_peca.quantidade + v_delta;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Peças usadas na OS (baixa automática)
--    p_itens: lista COMPLETA de peças do estoque na OS: [{"id_peca": "...", "quantidade": 2}, ...]
--    Peça nova ou quantidade maior: baixa do estoque. Peça retirada ou quantidade menor: volta ao estoque.
--    O custo de cada peça é o custo médio do dia em que entrou na OS.
--    Peças já excluídas do cadastro continuam na OS (sem vínculo) e não são mexidas.
--    O estoque pode ficar negativo (peça usada antes de a entrada ser lançada): a tela avisa antes.
-- ---------------------------------------------------------------------
create or replace function public.definir_pecas_os(p_id_os text, p_itens jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conta  uuid := public.conta_atual();
  v_autor  text := public.nome_operador_atual();
  v_numero text;
  v_antes  numeric;
  v_depois numeric;
  v_delta  numeric;
  v_saldo  integer;
  r        record;
  v_peca   public.estoque_pecas%rowtype;
begin
  if not (public.operador_pode('tela_nova_os') or public.operador_pode('tela_ordens')) then
    raise exception 'new row violates row-level security policy for table "os_pecas"' using errcode = '42501';
  end if;
  if not public.assinatura_ativa() then
    raise exception 'Assinatura vencida: renove o plano para dar baixa no estoque.' using errcode = '42501';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 50 then
    raise exception 'Lista de peças inválida.';
  end if;

  select os.numero_os::text into v_numero
    from public.ordens_servico os
   where os.id_os::text = p_id_os and os.user_id::text = v_conta::text
   for update;
  if not found then
    raise exception 'Ordem de serviço não encontrada.';
  end if;

  -- Pedido agregado por peça
  create temporary table if not exists pg_temp.pedido_pecas (id_peca uuid primary key, quantidade integer not null) on commit drop;
  delete from pg_temp.pedido_pecas;
  begin
    insert into pg_temp.pedido_pecas (id_peca, quantidade)
    select (e ->> 'id_peca')::uuid, sum((e ->> 'quantidade')::integer)
      from jsonb_array_elements(p_itens) e
     group by 1;
  exception when invalid_text_representation or numeric_value_out_of_range or not_null_violation then
    raise exception 'Lista de peças inválida.';
  end;
  if exists (select 1 from pg_temp.pedido_pecas where quantidade < 1 or quantidade > 999) then
    raise exception 'A quantidade de cada peça deve ficar entre 1 e 999.';
  end if;

  -- Trava as peças envolvidas sempre na mesma ordem (evita duas OS travarem uma à outra)
  perform 1 from public.estoque_pecas p
   where p.user_id = v_conta
     and (p.id_peca in (select id_peca from pg_temp.pedido_pecas)
          or p.id_peca in (select op.id_peca from public.os_pecas op where op.user_id = v_conta and op.id_os = p_id_os))
   order by p.id_peca
   for update;

  if exists (
    select 1 from pg_temp.pedido_pecas pp
     where not exists (select 1 from public.estoque_pecas p where p.id_peca = pp.id_peca and p.user_id = v_conta)
  ) then
    raise exception 'Uma das peças não foi encontrada no estoque (atualize a tela).';
  end if;

  select coalesce(sum(op.quantidade * op.custo_unitario), 0) into v_antes
    from public.os_pecas op where op.user_id = v_conta and op.id_os = p_id_os;

  -- Retiradas e reduções: voltam ao estoque
  for r in
    select op.id, op.id_peca, op.quantidade as atual, coalesce(pp.quantidade, 0) as nova, op.custo_unitario
      from public.os_pecas op
      left join pg_temp.pedido_pecas pp on pp.id_peca = op.id_peca
     where op.user_id = v_conta and op.id_os = p_id_os and op.id_peca is not null
       and coalesce(pp.quantidade, 0) < op.quantidade
  loop
    update public.estoque_pecas set quantidade = quantidade + (r.atual - r.nova), atualizado_em = now()
     where id_peca = r.id_peca
    returning quantidade into v_saldo;
    insert into public.estoque_movimentos (user_id, id_peca, tipo, quantidade, saldo, custo_unitario, id_os, numero_os, observacao, autor)
    values (v_conta, r.id_peca, 'ESTORNO_OS', r.atual - r.nova, v_saldo, r.custo_unitario, p_id_os, v_numero,
            case when r.nova = 0 then 'Peça retirada da OS' else 'Quantidade reduzida na OS' end, v_autor);
    if r.nova = 0 then
      delete from public.os_pecas where id = r.id;
    else
      update public.os_pecas set quantidade = r.nova where id = r.id;
    end if;
  end loop;

  -- Peças novas e aumentos: baixa do estoque
  for r in
    select pp.id_peca, pp.quantidade as nova, op.id, coalesce(op.quantidade, 0) as atual, op.custo_unitario
      from pg_temp.pedido_pecas pp
      left join public.os_pecas op on op.user_id = v_conta and op.id_os = p_id_os and op.id_peca = pp.id_peca
     where pp.quantidade > coalesce(op.quantidade, 0)
  loop
    update public.estoque_pecas set quantidade = quantidade - (r.nova - r.atual), atualizado_em = now()
     where id_peca = r.id_peca
    returning * into v_peca;
    if r.id is null then
      insert into public.os_pecas (user_id, id_os, id_peca, nome_peca, quantidade, custo_unitario)
      values (v_conta, p_id_os, r.id_peca, v_peca.nome, r.nova, v_peca.custo_medio);
    else
      update public.os_pecas set quantidade = r.nova where id = r.id;
    end if;
    insert into public.estoque_movimentos (user_id, id_peca, tipo, quantidade, saldo, custo_unitario, id_os, numero_os, observacao, autor)
    values (v_conta, r.id_peca, 'SAIDA_OS', -(r.nova - r.atual), v_peca.quantidade, coalesce(r.custo_unitario, v_peca.custo_medio),
            p_id_os, v_numero, 'Usada na OS', v_autor);
  end loop;

  -- Custo e lucro da OS acompanham a diferença do custo das peças do estoque
  select coalesce(sum(op.quantidade * op.custo_unitario), 0) into v_depois
    from public.os_pecas op where op.user_id = v_conta and op.id_os = p_id_os;
  v_delta := round(v_depois - v_antes, 2);
  if v_delta <> 0 then
    update public.ordens_servico
       set custo_peca = coalesce(custo_peca, 0) + v_delta,
           lucro_estimado_total = coalesce(lucro_estimado_total, 0) - v_delta
     where id_os::text = p_id_os and user_id::text = v_conta::text;
  end if;
end;
$$;

revoke all on function public.salvar_peca_estoque(uuid, text, text, text, text, text, integer, numeric, integer, text) from public, anon;
revoke all on function public.excluir_peca_estoque(uuid) from public, anon;
revoke all on function public.movimentar_estoque(uuid, text, integer, numeric, text, text) from public, anon;
revoke all on function public.definir_pecas_os(text, jsonb) from public, anon;
grant execute on function public.salvar_peca_estoque(uuid, text, text, text, text, text, integer, numeric, integer, text) to authenticated;
grant execute on function public.excluir_peca_estoque(uuid) to authenticated;
grant execute on function public.movimentar_estoque(uuid, text, integer, numeric, text, text) to authenticated;
grant execute on function public.definir_pecas_os(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 7. OS excluída: as peças voltam ao estoque (quem exclui já passou pela permissão "Excluir OS")
-- ---------------------------------------------------------------------
create or replace function public.devolver_pecas_da_os()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r       record;
  v_saldo integer;
begin
  for r in
    select op.id_peca, op.quantidade, op.custo_unitario
      from public.os_pecas op
     where op.user_id::text = old.user_id::text and op.id_os = old.id_os::text and op.id_peca is not null
     order by op.id_peca
  loop
    update public.estoque_pecas set quantidade = quantidade + r.quantidade, atualizado_em = now()
     where id_peca = r.id_peca
    returning quantidade into v_saldo;
    insert into public.estoque_movimentos (user_id, id_peca, tipo, quantidade, saldo, custo_unitario, id_os, numero_os, observacao, autor)
    values (old.user_id, r.id_peca, 'ESTORNO_OS', r.quantidade, v_saldo, r.custo_unitario, old.id_os::text, old.numero_os::text,
            'OS excluída', public.nome_operador_atual());
  end loop;
  delete from public.os_pecas where user_id::text = old.user_id::text and id_os = old.id_os::text;
  return old;
end;
$$;
revoke all on function public.devolver_pecas_da_os() from public, anon, authenticated;

drop trigger if exists devolver_pecas_da_os on public.ordens_servico;
create trigger devolver_pecas_da_os
  after delete on public.ordens_servico
  for each row execute function public.devolver_pecas_da_os();

notify pgrst, 'reload schema';
