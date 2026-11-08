-- =====================================================================
-- Despesas da loja (aluguel, energia, salários...) para o resultado do mês
--
-- Requer as migrações anteriores (usa conta_atual(), operador_pode(), assinatura_ativa() e
-- nome_operador_atual(), da migração 20261108090000_estoque_pecas.sql). Pode ser executada de novo.
--
-- Despesa é dado financeiro: ler e gravar exigem a permissão "Análises e relatórios" (a mesma que
-- mostra custo e lucro). Gravar também exige assinatura ativa ou período de teste.
-- "Repetir todo mês" cria uma despesa por mês com o mesmo código em "recorrencia".
-- =====================================================================

create table if not exists public.despesas (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default public.conta_atual() references auth.users (id) on delete cascade,
  descricao       text not null check (length(btrim(descricao)) between 2 and 120),
  categoria       text not null default 'Outros' check (length(btrim(categoria)) between 1 and 60),
  valor           numeric(12, 2) not null check (valor > 0 and valor < 10000000),
  data            date not null, -- vencimento: define o mês da despesa
  pago            boolean not null default false,
  data_pagamento  date,
  forma_pagamento text,
  id_fornecedor   text,
  recorrencia     uuid,
  observacoes     text,
  criado_por      text default public.nome_operador_atual(),
  criado_em       timestamptz not null default now()
);
create index if not exists despesas_por_data on public.despesas (user_id, data);
create index if not exists despesas_por_recorrencia on public.despesas (user_id, recorrencia) where recorrencia is not null;

alter table public.despesas enable row level security;
revoke all on public.despesas from anon;
grant select, insert, update, delete on public.despesas to authenticated;

do $$
declare
  pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'despesas' loop
    execute format('drop policy %I on public.despesas', pol.policyname);
  end loop;
end $$;

create policy "financeiro: lê" on public.despesas for select to authenticated
  using (user_id = public.conta_atual() and public.operador_pode('tela_relatorios'));
create policy "financeiro: cria" on public.despesas for insert to authenticated
  with check (user_id = public.conta_atual() and public.operador_pode('tela_relatorios'));
create policy "financeiro: altera" on public.despesas for update to authenticated
  using (user_id = public.conta_atual() and public.operador_pode('tela_relatorios'))
  with check (user_id = public.conta_atual() and public.operador_pode('tela_relatorios'));
create policy "financeiro: exclui" on public.despesas for delete to authenticated
  using (user_id = public.conta_atual() and public.operador_pode('tela_relatorios'));

-- Assinatura exigida para gravar (mesmas regras restritivas da migração 20261101120000)
create policy "assinatura: cria" on public.despesas as restrictive for insert to authenticated
  with check (public.assinatura_ativa());
create policy "assinatura: altera" on public.despesas as restrictive for update to authenticated
  using (public.assinatura_ativa()) with check (public.assinatura_ativa());
create policy "assinatura: exclui" on public.despesas as restrictive for delete to authenticated
  using (public.assinatura_ativa());

notify pgrst, 'reload schema';
