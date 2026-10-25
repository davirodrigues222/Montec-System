-- =====================================================================
-- Isolamento dos dados por conta (revisão de código, 25/10/2026)
--
-- PROBLEMA: o app consulta ordens_servico, clientes, aparelhos_cliente, cad_fornecedores e
-- cad_servicos sem filtrar pela conta logada. Se essas tabelas não tiverem regras de acesso
-- (RLS) por dono, uma assistência enxerga e altera os dados de outra.
--
-- O QUE ESTA MIGRAÇÃO FAZ, em cada uma das 5 tabelas:
--   1. Garante a coluna user_id (dono do registro), preenchida automaticamente nas próximas gravações.
--   2. Preenche o dono dos registros antigos:
--        - ordens_servico e aparelhos_cliente: pelo dono do cliente vinculado;
--        - se só UMA conta tem clientes cadastrados, os registros ainda sem dono vão para ela.
--   3. Liga o RLS e troca as regras atuais por "cada conta só acessa os próprios registros".
--      Registros que continuarem sem dono seguem visíveis (nada some), até receberem um dono.
--
-- ANTES DE EXECUTAR, rode a consulta de diagnóstico abaixo e confira o resultado:
--
--   select 'clientes' t, count(*) total, count(user_id) com_dono, count(distinct user_id) contas from public.clientes
--   union all select 'ordens_servico', count(*), null, null from public.ordens_servico;
--
-- ATENÇÃO: depois desta migração, acessos SEM login (ex.: o servidor da pasta backend com a
-- chave pública) deixam de ver esses dados. O app em si continua funcionando normalmente.
-- =====================================================================

do $$
declare
  t text;
begin
  foreach t in array array['ordens_servico', 'clientes', 'aparelhos_cliente', 'cad_fornecedores', 'cad_servicos'] loop
    execute format('alter table public.%I add column if not exists user_id uuid references auth.users (id) on delete cascade', t);
    execute format('alter table public.%I alter column user_id set default auth.uid()', t);
  end loop;
end $$;

-- Dono das OS e dos aparelhos antigos = dono do cliente vinculado
update public.ordens_servico os
   set user_id = c.user_id
  from public.clientes c
 where os.user_id is null
   and c.id_cliente::text = os.id_cliente::text
   and c.user_id is not null;

update public.aparelhos_cliente a
   set user_id = c.user_id
  from public.clientes c
 where a.user_id is null
   and c.id_cliente::text = a.id_cliente::text
   and c.user_id is not null;

-- Uma única conta com clientes: os registros restantes sem dono pertencem a ela
do $$
declare
  qtd  integer;
  dono uuid;
  t    text;
begin
  select count(distinct user_id), min(user_id::text)::uuid
    into qtd, dono
    from public.clientes
   where user_id is not null;

  if qtd = 1 then
    foreach t in array array['ordens_servico', 'clientes', 'aparelhos_cliente', 'cad_fornecedores', 'cad_servicos'] loop
      execute format('update public.%I set user_id = $1 where user_id is null', t) using dono;
    end loop;
  end if;
end $$;

-- Regras de acesso: cada conta só enxerga e altera os próprios registros
do $$
declare
  t text;
  p record;
begin
  foreach t in array array['ordens_servico', 'clientes', 'aparelhos_cliente', 'cad_fornecedores', 'cad_servicos'] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "conta: dono gerencia" on public.%I for all to authenticated
         using (user_id is null or user_id::text = auth.uid()::text)
         with check (user_id is null or user_id::text = auth.uid()::text)',
      t
    );
  end loop;
end $$;

notify pgrst, 'reload schema';
