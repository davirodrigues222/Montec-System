-- =====================================================================
-- Limpeza de segurança: nada do banco responde a quem não está logado
--
-- Pode ser executada a qualquer momento (depois das anteriores).
--
-- O Supabase dá, por padrão, permissão de consulta ao papel "anon" (visitante sem login) em toda
-- tabela nova. As regras de acesso (RLS) já escondiam todas as linhas — nenhum dado vazava —, mas o
-- certo é o banco nem aceitar a consulta. Esta migração:
--   1. tira do "anon" qualquer permissão em tabelas, visões, sequências e funções do schema public;
--   2. faz o mesmo valer para o que for criado no futuro.
--
-- Não muda nada para quem usa o sistema: todas as telas trabalham com login (dono ou funcionário),
-- e a identificação sem login usa a Edge Function "login-funcionario" (chave do servidor).
-- =====================================================================

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;

-- Objetos criados daqui para a frente também nascem sem acesso para visitantes
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

notify pgrst, 'reload schema';
