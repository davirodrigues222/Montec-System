// O Supabase devolve no máximo 1.000 linhas por consulta: sem paginar, a loja com mais de 1.000 OS
// (ou clientes) veria listas e relatórios incompletos, sem nenhum aviso.

const TAMANHO_PAGINA = 1000;

/**
 * Busca TODAS as linhas de uma consulta, de 1.000 em 1.000. A consulta precisa de uma ordem estável,
 * com desempate por uma coluna única (ex.: id), senão uma linha pode cair em duas páginas ou em nenhuma.
 */
export async function buscarTodasAsLinhas<T = any>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<{ data: T[]; error: any }> {
  const linhas: T[] = [];
  for (let de = 0; ; de += TAMANHO_PAGINA) {
    const { data, error } = await consulta(de, de + TAMANHO_PAGINA - 1);
    if (error) return { data: linhas, error };
    linhas.push(...(data || []));
    if (!data || data.length < TAMANHO_PAGINA) return { data: linhas, error: null };
  }
}
