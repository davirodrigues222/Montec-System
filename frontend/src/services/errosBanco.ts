// Recusas das regras de acesso do banco (migração 20261026090000_permissoes_operador.sql)

export const MENSAGEM_SEM_PERMISSAO =
  'O seu acesso não permite esta ação. Peça a um administrador para liberar ou, se a sua identificação expirou, ' +
  'use "Trocar funcionário" e entre de novo.';

/** Gravação recusada pelo RLS (insert/update). */
export const ehRecusaDePermissao = (error: any) =>
  error?.code === '42501' || /row-level security|permission denied/i.test(String(error?.message || ''));

/**
 * Exclusão ou alteração recusada pelo RLS não dá erro: só não afeta nenhuma linha.
 * Use com `.select(...)` na consulta para saber quantas linhas foram afetadas.
 */
export function exigirLinhaAfetada(data: unknown[] | null | undefined) {
  if (!data || data.length === 0) throw new Error(MENSAGEM_SEM_PERMISSAO);
}
