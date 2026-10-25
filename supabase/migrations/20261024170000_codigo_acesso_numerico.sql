-- =====================================================================
-- Montec System — Código de acesso do funcionário somente numérico
--
-- Troca a regra antiga (3 a 30 caracteres com letras, ponto e hífen) por:
-- número inteiro de 1 a 15 dígitos, sem vírgula, ponto, sinal ou letras.
--
-- Pode ser executada mais de uma vez com segurança.
-- =====================================================================

-- Remove TODAS as regras (CHECK) existentes sobre codigo_acesso, seja qual for o nome delas
do $$
declare
  r record;
begin
  for r in
    select conname
      from pg_constraint
     where conrelid = 'public.funcionarios'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%codigo_acesso%'
  loop
    execute format('alter table public.funcionarios drop constraint %I', r.conname);
  end loop;
end $$;

-- NOT VALID: não verifica os funcionários já cadastrados (não falha se algum tiver código antigo
-- com letras). A regra vale para todo cadastro novo e toda edição.
alter table public.funcionarios
  add constraint funcionarios_codigo_acesso_numerico
  check (codigo_acesso ~ '^[0-9]{1,15}$') not valid;
