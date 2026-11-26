-- Remove duas tabelas de uma versão antiga do sistema: regras_precificacao e servicos_itens_os.
-- Não são criadas por nenhuma migração, o sistema não usa e estavam SEM RLS: qualquer usuário
-- logado, de qualquer loja, conseguia ler e gravar nelas.
--
-- regras_precificacao tinha só 7 regras de EXEMPLO (IDs digitados à mão, como a0eebc99-...-380a11,
-- sem coluna de loja): conferidas em 26/11/2026 e liberadas para apagar.
-- Segurança: se servicos_itens_os (itens de OS) tiver dados, a migração para e nada é apagado.

do $$
begin
  if to_regclass('public.servicos_itens_os') is not null
     and exists (select 1 from public.servicos_itens_os) then
    raise exception 'servicos_itens_os tem dados: confira antes de apagar (nada foi alterado).';
  end if;
end
$$;

-- servicos_itens_os primeiro: ela aponta para regras_precificacao
drop table if exists public.servicos_itens_os;
drop table if exists public.regras_precificacao;
