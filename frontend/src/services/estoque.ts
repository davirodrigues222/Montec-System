import { supabase } from './supabaseClient';
import { buscarTodasAsLinhas } from './paginacao';
import { MENSAGEM_SEM_PERMISSAO, ehRecusaDePermissao } from './errosBanco';

// ==========================================
// Estoque de peças (migração 20261108090000_estoque_pecas.sql).
// Ler: views *_lista (custos vêm vazios para quem não tem acesso financeiro).
// Gravar: só pelas funções do banco, que conferem a permissão e mantêm a quantidade certa.
// ==========================================

export interface PecaEstoque {
  id_peca: string;
  nome: string;
  codigo: string | null;
  categoria: string | null;
  compatibilidade: string | null;
  id_fornecedor: string | null;
  fornecedor_nome: string | null;
  quantidade: number;
  estoque_minimo: number;
  /** null para quem não tem acesso financeiro */
  custo_medio: number | null;
  observacoes: string | null;
  atualizado_em: string;
}

export type TipoMovimento = 'ENTRADA' | 'AJUSTE' | 'SAIDA_OS' | 'ESTORNO_OS';

export interface MovimentoEstoque {
  id: number;
  id_peca: string;
  tipo: TipoMovimento;
  quantidade: number;
  saldo: number;
  custo_unitario: number | null;
  numero_os: string | null;
  fornecedor_nome: string | null;
  observacao: string | null;
  autor: string | null;
  criado_em: string;
}

/** Peça do estoque usada numa OS. */
export interface PecaDaOS {
  /** null quando a peça foi excluída do cadastro depois (fica só o nome na OS) */
  id_peca: string | null;
  nome_peca: string;
  quantidade: number;
  /** null para quem não tem acesso financeiro */
  custo_unitario: number | null;
}

export const ROTULO_MOVIMENTO: Record<TipoMovimento, string> = {
  ENTRADA: 'Entrada',
  AJUSTE: 'Ajuste de contagem',
  SAIDA_OS: 'Usada em OS',
  ESTORNO_OS: 'Devolvida da OS',
};

export const CATEGORIAS_PECA = ['Telas & Displays', 'Baterias', 'Conectores & Flex', 'Câmeras', 'Carcaças & Tampas', 'Componentes', 'Insumos'];

export class EstoqueAusenteError extends Error {
  constructor() {
    super('O estoque ainda não foi ativado no banco (falta executar a migração do estoque).');
    this.name = 'EstoqueAusenteError';
  }
}

function tratarErro(error: any, padrao: string): never {
  // Tabela/view ou função que não existe: migração não executada
  if (['PGRST205', '42P01', 'PGRST202', '42883'].includes(error?.code)) throw new EstoqueAusenteError();
  if (ehRecusaDePermissao(error)) throw new Error(MENSAGEM_SEM_PERMISSAO);
  throw new Error(error?.message || padrao);
}

export type SituacaoEstoque = 'SEM_ESTOQUE' | 'BAIXO' | 'OK';

/** Sem estoque: zero ou menos. Baixo: no mínimo definido ou abaixo (mínimo 0 desliga o aviso de baixo). */
export function situacaoEstoque(p: Pick<PecaEstoque, 'quantidade' | 'estoque_minimo'>): SituacaoEstoque {
  if (p.quantidade <= 0) return 'SEM_ESTOQUE';
  if (p.estoque_minimo > 0 && p.quantidade <= p.estoque_minimo) return 'BAIXO';
  return 'OK';
}

const numero = (v: any) => (v === null || v === undefined ? null : Number(v));
const normalizarPeca = (p: any): PecaEstoque => ({
  ...p,
  quantidade: Number(p.quantidade) || 0,
  estoque_minimo: Number(p.estoque_minimo) || 0,
  custo_medio: numero(p.custo_medio),
});

export async function listarPecasEstoque(): Promise<PecaEstoque[]> {
  const { data, error } = await buscarTodasAsLinhas((de, ate) =>
    supabase.from('estoque_pecas_lista').select('*').order('nome', { ascending: true }).order('id_peca').range(de, ate)
  );
  if (error) tratarErro(error, 'Não foi possível carregar o estoque.');
  return (data || []).map(normalizarPeca);
}

/** Peças sem estoque ou com estoque baixo. Lista vazia se o estoque ainda não foi ativado. */
export async function listarPecasEstoqueBaixo(): Promise<PecaEstoque[]> {
  try {
    return (await listarPecasEstoque()).filter((p) => situacaoEstoque(p) !== 'OK');
  } catch {
    return [];
  }
}

export interface DadosPeca {
  nome: string;
  codigo: string;
  categoria: string;
  compatibilidade: string;
  idFornecedor: string;
  estoqueMinimo: number;
  /** undefined: não altera o custo (quem não vê custos) */
  custo?: number;
  /** só no cadastro */
  quantidadeInicial?: number;
  observacoes: string;
}

export async function salvarPecaEstoque(dados: DadosPeca, idPeca?: string): Promise<string> {
  const { data, error } = await supabase.rpc('salvar_peca_estoque', {
    p_id_peca: idPeca ?? null,
    p_nome: dados.nome,
    p_codigo: dados.codigo,
    p_categoria: dados.categoria,
    p_compatibilidade: dados.compatibilidade,
    p_id_fornecedor: dados.idFornecedor,
    p_estoque_minimo: dados.estoqueMinimo,
    p_custo: dados.custo ?? null,
    p_quantidade_inicial: idPeca ? 0 : dados.quantidadeInicial ?? 0,
    p_observacoes: dados.observacoes,
  });
  if (error) tratarErro(error, 'Não foi possível salvar a peça.');
  return String(data);
}

export async function excluirPecaEstoque(idPeca: string): Promise<void> {
  const { error } = await supabase.rpc('excluir_peca_estoque', { p_id_peca: idPeca });
  if (error) tratarErro(error, 'Não foi possível excluir a peça.');
}

/**
 * ENTRADA: quantidade que chegou (com custo, o custo médio é recalculado).
 * AJUSTE: quantidade contada de fato. Devolve o novo saldo.
 */
export async function movimentarEstoque(
  idPeca: string,
  tipo: 'ENTRADA' | 'AJUSTE',
  quantidade: number,
  opcoes: { custoUnitario?: number | null; idFornecedor?: string; observacao?: string } = {}
): Promise<number> {
  const { data, error } = await supabase.rpc('movimentar_estoque', {
    p_id_peca: idPeca,
    p_tipo: tipo,
    p_quantidade: quantidade,
    p_custo_unitario: opcoes.custoUnitario ?? null,
    p_id_fornecedor: opcoes.idFornecedor || null,
    p_observacao: opcoes.observacao || null,
  });
  if (error) tratarErro(error, 'Não foi possível registrar o movimento.');
  return Number(data);
}

export async function listarMovimentosPeca(idPeca: string, limite = 50): Promise<MovimentoEstoque[]> {
  const { data, error } = await supabase
    .from('estoque_movimentos_lista')
    .select('*')
    .eq('id_peca', idPeca)
    .order('criado_em', { ascending: false })
    .order('id', { ascending: false })
    .limit(limite);
  if (error) tratarErro(error, 'Não foi possível carregar o histórico da peça.');
  return (data || []).map((m: any) => ({ ...m, quantidade: Number(m.quantidade), saldo: Number(m.saldo), custo_unitario: numero(m.custo_unitario) }));
}

/** Peças do estoque usadas na OS. Lista vazia se o estoque ainda não foi ativado. */
export async function listarPecasDaOS(idOs: string): Promise<PecaDaOS[]> {
  const { data, error } = await supabase.from('os_pecas_lista').select('id_peca, nome_peca, quantidade, custo_unitario').eq('id_os', idOs).order('criado_em');
  if (error) {
    if (['PGRST205', '42P01'].includes(error.code)) return [];
    tratarErro(error, 'Não foi possível carregar as peças da OS.');
  }
  return (data || []).map((p: any) => ({ ...p, quantidade: Number(p.quantidade), custo_unitario: numero(p.custo_unitario) }));
}

/**
 * Grava a lista COMPLETA de peças do estoque da OS: o banco baixa ou devolve a diferença ao estoque e
 * ajusta o custo e o lucro da OS pela diferença do custo das peças.
 */
export async function definirPecasDaOS(idOs: string, itens: { id_peca: string; quantidade: number }[]): Promise<void> {
  const { error } = await supabase.rpc('definir_pecas_os', { p_id_os: idOs, p_itens: itens });
  if (error) tratarErro(error, 'Não foi possível dar baixa nas peças do estoque.');
}

/** Custo total das peças (null se algum custo não estiver visível). */
export function custoTotalPecas(pecas: { quantidade: number; custo_unitario: number | null }[]): number | null {
  let total = 0;
  for (const p of pecas) {
    if (p.custo_unitario === null) return null;
    total += p.quantidade * p.custo_unitario;
  }
  return Math.round(total * 100) / 100;
}

/** Mesma lista? (para só chamar o banco quando as peças da OS mudaram) */
export function mesmasPecas(a: { id_peca: string | null; quantidade: number }[], b: { id_peca: string | null; quantidade: number }[]): boolean {
  const mapa = (l: typeof a) =>
    l
      .filter((p) => p.id_peca)
      .map((p) => `${p.id_peca}:${p.quantidade}`)
      .sort()
      .join('|');
  return mapa(a) === mapa(b);
}

/** Texto curto das peças, ex.: "1x Tela iPhone 11, 2x Parafuso" */
export const textoPecas = (pecas: { nome_peca: string; quantidade: number }[]) =>
  pecas.map((p) => `${p.quantidade}x ${p.nome_peca}`).join(', ');
