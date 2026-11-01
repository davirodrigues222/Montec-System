-- =====================================================================
-- Assinatura: período de teste de 3 dias
--
-- Requer 20261027120000_assinatura_troca_plano.sql. Pode ser executada de novo.
--
-- Contas novas passam a ter 3 dias de teste. Contas criadas até 01/11/2026 continuam com os 7 dias
-- que já tinham, para ninguém que está testando perder acesso de uma hora para outra.
-- =====================================================================

create or replace function public.fim_periodo_teste(p_conta uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select u.created_at + case
           when u.created_at < timestamptz '2026-11-02 00:00:00-03' then interval '7 days'
           else interval '3 days'
         end
    from auth.users u
   where u.id = p_conta
$$;
revoke all on function public.fim_periodo_teste(uuid) from public, anon, authenticated;
grant execute on function public.fim_periodo_teste(uuid) to service_role;

notify pgrst, 'reload schema';
