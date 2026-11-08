-- =====================================================================
-- Comissão por técnico
--
-- Requer as migrações anteriores (usa conta_atual(), operador_pode() e assinatura_ativa()).
-- Pode ser executada de novo sem perder dados.
--
-- Uma linha por loja com as regras:
--   base         VALOR = sobre o valor cobrado da OS · LUCRO = sobre o lucro da OS (líquido − peças, frete, garantia)
--   por_tecnico  {"<id_funcionario>": 10}  percentual de cada técnico
--   por_servico  {"<id_servico>": 15}      percentual do serviço do catálogo (vale mais que o do técnico)
-- O técnico de cada OS fica no JSON da OS (checklist_entrada.__tecnicoId), gravado pela Nova OS / Editar OS.
-- Ler e gravar as regras exigem "Análises e relatórios" (dado financeiro); gravar exige assinatura ativa.
-- =====================================================================

create table if not exists public.comissao_config (
  user_id       uuid primary key default public.conta_atual() references auth.users (id) on delete cascade,
  base          text not null default 'LUCRO' check (base in ('VALOR', 'LUCRO')),
  por_tecnico   jsonb not null default '{}'::jsonb check (jsonb_typeof(por_tecnico) = 'object'),
  por_servico   jsonb not null default '{}'::jsonb check (jsonb_typeof(por_servico) = 'object'),
  atualizado_em timestamptz not null default now()
);

-- Percentuais entre 0 e 100
create or replace function public.percentuais_validos(p jsonb)
returns boolean
language sql
immutable
as $$
  select not exists (
    select 1 from jsonb_each(p) e
     where jsonb_typeof(e.value) <> 'number' or (e.value)::numeric < 0 or (e.value)::numeric > 100
  )
$$;

alter table public.comissao_config drop constraint if exists comissao_percentuais_validos;
alter table public.comissao_config add constraint comissao_percentuais_validos
  check (public.percentuais_validos(por_tecnico) and public.percentuais_validos(por_servico));

alter table public.comissao_config enable row level security;
revoke all on public.comissao_config from anon;
grant select, insert, update on public.comissao_config to authenticated;

do $$
declare
  pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'comissao_config' loop
    execute format('drop policy %I on public.comissao_config', pol.policyname);
  end loop;
end $$;

create policy "financeiro: lê" on public.comissao_config for select to authenticated
  using (user_id = public.conta_atual() and public.operador_pode('tela_relatorios'));
create policy "financeiro: cria" on public.comissao_config for insert to authenticated
  with check (user_id = public.conta_atual() and public.operador_pode('tela_relatorios'));
create policy "financeiro: altera" on public.comissao_config for update to authenticated
  using (user_id = public.conta_atual() and public.operador_pode('tela_relatorios'))
  with check (user_id = public.conta_atual() and public.operador_pode('tela_relatorios'));

create policy "assinatura: cria" on public.comissao_config as restrictive for insert to authenticated
  with check (public.assinatura_ativa());
create policy "assinatura: altera" on public.comissao_config as restrictive for update to authenticated
  using (public.assinatura_ativa()) with check (public.assinatura_ativa());

notify pgrst, 'reload schema';
