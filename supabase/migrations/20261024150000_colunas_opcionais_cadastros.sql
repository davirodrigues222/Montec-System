-- =====================================================================
-- Montec System — Colunas opcionais dos cadastros existentes
--
-- As telas de Clientes e Fornecedores têm campos que hoje NÃO são salvos porque as
-- colunas não existem no banco (o app salva o resto e avisa o que ficou de fora).
--
-- Seguro: apenas ADICIONA colunas NULLABLE e sem valor padrão.
-- Não altera, remove nem reescreve dados existentes; inserts atuais continuam funcionando.
-- =====================================================================

alter table public.clientes          add column if not exists observacoes text;
alter table public.cad_fornecedores  add column if not exists email       text;
alter table public.cad_fornecedores  add column if not exists observacoes text;

-- Recarrega o cache de schema do PostgREST para as colunas ficarem visíveis imediatamente
notify pgrst, 'reload schema';
