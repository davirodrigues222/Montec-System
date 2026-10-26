-- =====================================================================
-- Segurança nível 3 — FASE 3: configurações da loja numa tabela da conta
--
-- Requer 20261026120000_login_proprio_funcionarios.sql. Execute depois dela.
--
-- As configurações (nome da loja, logotipo, termos, taxas, mensagens...) ficavam no perfil do
-- dono da conta (Supabase Auth). Com login próprio, o funcionário não tem mais acesso ao perfil do
-- dono — e nem deve ter. Agora elas ficam aqui:
--   * leitura: todos da loja (dono e funcionários com login próprio);
--   * gravação: quem tem a permissão de Configurações (ou de Análises, que grava a meta do mês).
-- O sistema copia sozinho as configurações atuais do dono para cá no primeiro acesso dele.
-- =====================================================================

create table if not exists public.configuracoes_conta (
  conta_id      uuid primary key default public.conta_atual() references auth.users (id) on delete cascade,
  dados         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

alter table public.configuracoes_conta enable row level security;

drop policy if exists "configuracoes: loja lê" on public.configuracoes_conta;
drop policy if exists "configuracoes: permissão grava" on public.configuracoes_conta;
drop policy if exists "configuracoes: permissão altera" on public.configuracoes_conta;

create policy "configuracoes: loja lê" on public.configuracoes_conta
  for select to authenticated
  using (conta_id = public.conta_atual());

-- Criar a linha: quem tem a permissão, ou o próprio dono na cópia inicial (o login dele, antes de
-- escolher o funcionário). A linha é única por conta, então depois disso só a permissão altera.
create policy "configuracoes: permissão grava" on public.configuracoes_conta
  for insert to authenticated
  with check (conta_id = public.conta_atual()
              and (conta_id = auth.uid()
                   or public.operador_pode('tela_configuracoes') or public.operador_pode('tela_relatorios')));

create policy "configuracoes: permissão altera" on public.configuracoes_conta
  for update to authenticated
  using (conta_id = public.conta_atual())
  with check (conta_id = public.conta_atual()
              and (public.operador_pode('tela_configuracoes') or public.operador_pode('tela_relatorios')));

revoke all on public.configuracoes_conta from anon;

-- O vínculo dos funcionários não é lido sem login
revoke all on public.membros_conta from anon;

notify pgrst, 'reload schema';
