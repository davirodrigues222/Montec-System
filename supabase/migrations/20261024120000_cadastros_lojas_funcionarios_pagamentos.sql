-- =====================================================================
-- Montec System — Submódulos de Cadastro: Lojas, Funcionários e Formas de Pagamento
--
-- NÃO ALTERA nenhuma tabela existente (ordens_servico, clientes, aparelhos_cliente,
-- cad_fornecedores, cad_servicos). Apenas cria tabelas novas, isoladas por conta (user_id)
-- com Row Level Security.
--
-- Como aplicar: Supabase > SQL Editor > colar e executar (ou `supabase db push`).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- Atualiza updated_at automaticamente
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =====================================================================
-- 1. LOJAS (multi-loja)
-- =====================================================================
create table if not exists public.lojas (
  id_loja       uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome          text not null check (length(trim(nome)) > 0),
  cnpj          text,
  telefone      text,
  email         text,
  cep           text,
  logradouro    text,
  numero        text,
  bairro        text,
  cidade        text,
  uf            char(2),
  principal     boolean not null default false,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists lojas_user_idx on public.lojas (user_id);
-- No máximo uma loja principal por conta
create unique index if not exists lojas_principal_unica on public.lojas (user_id) where principal;

create trigger lojas_updated_at before update on public.lojas
  for each row execute function public.tg_set_updated_at();

alter table public.lojas enable row level security;

create policy "lojas: dono gerencia" on public.lojas
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =====================================================================
-- 2. FUNCIONÁRIOS
--    codigo_acesso = "ID único" usado para entrar; senha guardada só como hash bcrypt.
--    O hash NUNCA é lido pelo navegador: a coluna não tem permissão de SELECT e a
--    senha só é definida/verificada pelas funções RPC abaixo.
-- =====================================================================
create table if not exists public.funcionarios (
  id_funcionario     uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  codigo_acesso      text not null check (codigo_acesso ~ '^[A-Za-z0-9._-]{3,30}$'),
  nome               text not null check (length(trim(nome)) > 0),
  cpf                text,
  telefone           text,
  email              text,
  cargo              text not null default 'ATENDENTE'
                       check (cargo in ('ADMIN', 'GERENTE', 'TECNICO', 'ATENDENTE')),
  -- Ajustes finos sobre o cargo, ex.: {"ver_relatorios": true, "excluir_os": false}
  permissoes         jsonb not null default '{}'::jsonb,
  senha_hash         text,
  ativo              boolean not null default true,
  tentativas_falhas  integer not null default 0,
  bloqueado_ate      timestamptz,
  ultimo_acesso      timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, codigo_acesso)
);

create index if not exists funcionarios_user_idx on public.funcionarios (user_id);

create trigger funcionarios_updated_at before update on public.funcionarios
  for each row execute function public.tg_set_updated_at();

alter table public.funcionarios enable row level security;

create policy "funcionarios: dono gerencia" on public.funcionarios
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Permissões por coluna: o navegador lê/grava tudo, exceto senha_hash e os campos de bloqueio
revoke all on public.funcionarios from anon, authenticated;
grant select (id_funcionario, user_id, codigo_acesso, nome, cpf, telefone, email, cargo, permissoes,
              ativo, bloqueado_ate, ultimo_acesso, created_at, updated_at)
  on public.funcionarios to authenticated;
grant insert (codigo_acesso, nome, cpf, telefone, email, cargo, permissoes, ativo)
  on public.funcionarios to authenticated;
grant update (codigo_acesso, nome, cpf, telefone, email, cargo, permissoes, ativo)
  on public.funcionarios to authenticated;
grant delete on public.funcionarios to authenticated;

-- Funcionário x Loja (um funcionário pode atuar em várias lojas)
create table if not exists public.funcionario_lojas (
  id_funcionario  uuid not null references public.funcionarios (id_funcionario) on delete cascade,
  id_loja         uuid not null references public.lojas (id_loja) on delete cascade,
  primary key (id_funcionario, id_loja)
);

alter table public.funcionario_lojas enable row level security;

create policy "funcionario_lojas: dono gerencia" on public.funcionario_lojas
  for all to authenticated
  using (
    exists (select 1 from public.funcionarios f
            where f.id_funcionario = funcionario_lojas.id_funcionario and f.user_id = auth.uid())
    and exists (select 1 from public.lojas l
                where l.id_loja = funcionario_lojas.id_loja and l.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.funcionarios f
            where f.id_funcionario = funcionario_lojas.id_funcionario and f.user_id = auth.uid())
    and exists (select 1 from public.lojas l
                where l.id_loja = funcionario_lojas.id_loja and l.user_id = auth.uid())
  );

-- Define/troca a senha de um funcionário da própria conta
create or replace function public.definir_senha_funcionario(p_id_funcionario uuid, p_senha text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_senha is null or length(p_senha) < 6 then
    raise exception 'A senha deve ter pelo menos 6 caracteres.';
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

-- Verifica código + senha. Bloqueia por 15 minutos após 5 tentativas inválidas.
-- Retorna 1 linha com os dados do funcionário (sem o hash) ou NENHUMA linha se código/senha
-- forem inválidos. Senha errada não usa RAISE: uma exceção desfaria o UPDATE do contador
-- de tentativas e o bloqueio nunca aconteceria.
create or replace function public.verificar_acesso_funcionario(p_codigo text, p_senha text)
returns table (id_funcionario uuid, nome text, cargo text, permissoes jsonb, lojas uuid[])
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  f public.funcionarios%rowtype;
begin
  select * into f
    from public.funcionarios
   where user_id = auth.uid()
     and lower(codigo_acesso) = lower(trim(p_codigo))
   for update;

  if not found or not f.ativo or f.senha_hash is null then
    return; -- mesma resposta de senha errada, para não revelar quais códigos existem
  end if;

  if f.bloqueado_ate is not null and f.bloqueado_ate > now() then
    raise exception 'Acesso bloqueado temporariamente. Tente novamente mais tarde.';
  end if;

  if extensions.crypt(p_senha, f.senha_hash) <> f.senha_hash then
    update public.funcionarios
       set tentativas_falhas = f.tentativas_falhas + 1,
           bloqueado_ate = case when f.tentativas_falhas + 1 >= 5
                                then now() + interval '15 minutes' end
     where funcionarios.id_funcionario = f.id_funcionario;
    return;
  end if;

  update public.funcionarios
     set tentativas_falhas = 0, bloqueado_ate = null, ultimo_acesso = now()
   where funcionarios.id_funcionario = f.id_funcionario;

  return query
    select f.id_funcionario, f.nome, f.cargo, f.permissoes,
           coalesce(array_agg(fl.id_loja) filter (where fl.id_loja is not null), '{}')
      from public.funcionario_lojas fl
     where fl.id_funcionario = f.id_funcionario;
end;
$$;

revoke all on function public.definir_senha_funcionario(uuid, text) from public, anon;
revoke all on function public.verificar_acesso_funcionario(text, text) from public, anon;
grant execute on function public.definir_senha_funcionario(uuid, text) to authenticated;
grant execute on function public.verificar_acesso_funcionario(text, text) to authenticated;

-- =====================================================================
-- 3. FORMAS DE PAGAMENTO
-- =====================================================================
create table if not exists public.formas_pagamento (
  id_forma_pagamento      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id_loja                 uuid references public.lojas (id_loja) on delete cascade, -- null = vale para todas as lojas
  nome                    text not null check (length(trim(nome)) > 0),
  tipo                    text not null
                            check (tipo in ('DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO',
                                            'BOLETO', 'TRANSFERENCIA', 'OUTRO')),
  taxa_percentual         numeric(6, 3) not null default 0 check (taxa_percentual between 0 and 100),
  taxa_fixa               numeric(10, 2) not null default 0 check (taxa_fixa >= 0),
  permite_parcelamento    boolean not null default false,
  parcelas_max            integer not null default 1 check (parcelas_max between 1 and 24),
  parcelas_sem_juros      integer not null default 1,
  repassar_juros_cliente  boolean not null default false,
  prazo_recebimento_dias  integer not null default 0 check (prazo_recebimento_dias >= 0), -- D+N
  ativo                   boolean not null default true,
  ordem                   integer not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (parcelas_sem_juros between 1 and parcelas_max),
  check (permite_parcelamento or parcelas_max = 1)
);

create index if not exists formas_pagamento_user_idx on public.formas_pagamento (user_id, ativo, ordem);

create trigger formas_pagamento_updated_at before update on public.formas_pagamento
  for each row execute function public.tg_set_updated_at();

alter table public.formas_pagamento enable row level security;

create policy "formas_pagamento: dono gerencia" on public.formas_pagamento
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (id_loja is null or exists (select 1 from public.lojas l
                                    where l.id_loja = formas_pagamento.id_loja and l.user_id = auth.uid()))
  );

-- Taxa específica por número de parcelas (ex.: crédito 1x 3,19%, 2x 4,59%, ...)
create table if not exists public.formas_pagamento_taxas (
  id_forma_pagamento  uuid not null references public.formas_pagamento (id_forma_pagamento) on delete cascade,
  parcelas            integer not null check (parcelas between 1 and 24),
  taxa_percentual     numeric(6, 3) not null check (taxa_percentual between 0 and 100),
  primary key (id_forma_pagamento, parcelas)
);

alter table public.formas_pagamento_taxas enable row level security;

create policy "formas_pagamento_taxas: dono gerencia" on public.formas_pagamento_taxas
  for all to authenticated
  using (exists (select 1 from public.formas_pagamento fp
                 where fp.id_forma_pagamento = formas_pagamento_taxas.id_forma_pagamento
                   and fp.user_id = auth.uid()))
  with check (exists (select 1 from public.formas_pagamento fp
                      where fp.id_forma_pagamento = formas_pagamento_taxas.id_forma_pagamento
                        and fp.user_id = auth.uid()));

-- =====================================================================
-- 4. (ETAPA FUTURA — deixada comentada de propósito)
--    Vincular OS a loja e funcionário. Colunas NULLABLE: inserts atuais continuam funcionando.
--    Só descomente quando o frontend passar a enviar esses campos.
-- =====================================================================
-- alter table public.ordens_servico add column if not exists id_loja uuid references public.lojas (id_loja) on delete set null;
-- alter table public.ordens_servico add column if not exists id_funcionario uuid references public.funcionarios (id_funcionario) on delete set null;
-- create index if not exists ordens_servico_loja_idx on public.ordens_servico (id_loja);
