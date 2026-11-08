import { supabase } from './supabaseClient';
import { buscarTodasAsLinhas } from './paginacao';
import { MENSAGEM_SEM_PERMISSAO, ehRecusaDePermissao, exigirLinhaAfetada } from './errosBanco';

// ==========================================
// Despesas da loja (migração 20261108120000_despesas.sql).
// Só quem tem "Análises e relatórios" lê e grava (o banco confere).
// ==========================================

export interface Despesa {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  /** Vencimento AAAA-MM-DD: define o mês da despesa */
  data: string;
  pago: boolean;
  data_pagamento: string | null;
  forma_pagamento: string | null;
  id_fornecedor: string | null;
  recorrencia: string | null;
  observacoes: string | null;
  criado_por: string | null;
}

export type DadosDespesa = Omit<Despesa, 'id' | 'recorrencia' | 'criado_por'>;

export const CATEGORIAS_DESPESA = [
  'Aluguel',
  'Energia',
  'Água',
  'Internet e telefone',
  'Salários e pró-labore',
  'Impostos e taxas',
  'Contador',
  'Sistemas e assinaturas',
  'Marketing',
  'Ferramentas e equipamentos',
  'Material de escritório e limpeza',
  'Transporte',
  'Manutenção da loja',
  'Outros',
];

export class DespesasAusenteError extends Error {
  constructor() {
    super('As despesas ainda não foram ativadas no banco (falta executar a migração das despesas).');
    this.name = 'DespesasAusenteError';
  }
}

function tratarErro(error: any, padrao: string): never {
  if (['PGRST205', '42P01'].includes(error?.code)) throw new DespesasAusenteError();
  if (ehRecusaDePermissao(error)) throw new Error(MENSAGEM_SEM_PERMISSAO);
  if (error?.code === '23514') throw new Error('Confira os dados: descrição de 2 a 120 letras e valor maior que zero.');
  throw new Error(error?.message || padrao);
}

const normalizar = (d: any): Despesa => ({ ...d, valor: Number(d.valor) || 0 });

export async function listarDespesas(): Promise<Despesa[]> {
  const { data, error } = await buscarTodasAsLinhas((de, ate) =>
    supabase.from('despesas').select('*').order('data', { ascending: true }).order('id').range(de, ate)
  );
  if (error) tratarErro(error, 'Não foi possível carregar as despesas.');
  return (data || []).map(normalizar);
}

/** Despesas da loja, ou lista vazia se não houver acesso ou o módulo não estiver ativado. */
export async function listarDespesasSeDisponivel(): Promise<Despesa[]> {
  try {
    return await listarDespesas();
  } catch {
    return [];
  }
}

const limpar = (d: DadosDespesa) => ({
  descricao: d.descricao.trim(),
  categoria: d.categoria.trim() || 'Outros',
  valor: Math.round(d.valor * 100) / 100,
  data: d.data,
  pago: d.pago,
  data_pagamento: d.pago ? d.data_pagamento || d.data : null,
  forma_pagamento: d.forma_pagamento?.trim() || null,
  id_fornecedor: d.id_fornecedor || null,
  observacoes: d.observacoes?.trim() || null,
});

/** Mesmo dia em outro mês (31 vira o último dia dos meses mais curtos). */
export function mesmoDiaEmOutroMes(data: string, meses: number): string {
  const [a, m, d] = data.split('-').map(Number);
  const alvo = new Date(a, m - 1 + meses, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

/**
 * Cria a despesa. Com repetirMeses > 1, cria uma por mês (a partir do vencimento informado), todas
 * com o mesmo código de recorrência. Só a primeira pode entrar como paga.
 */
export async function criarDespesa(dados: DadosDespesa, repetirMeses = 1): Promise<void> {
  const base = limpar(dados);
  const qtd = Math.max(1, Math.min(24, Math.floor(repetirMeses)));
  const recorrencia = qtd > 1 ? crypto.randomUUID() : null;
  const linhas = Array.from({ length: qtd }, (_, i) => ({
    ...base,
    data: mesmoDiaEmOutroMes(base.data, i),
    pago: i === 0 ? base.pago : false,
    data_pagamento: i === 0 ? base.data_pagamento : null,
    recorrencia,
  }));
  const { error } = await supabase.from('despesas').insert(linhas);
  if (error) tratarErro(error, 'Não foi possível salvar a despesa.');
}

export async function atualizarDespesa(id: string, dados: DadosDespesa): Promise<void> {
  const { data, error } = await supabase.from('despesas').update(limpar(dados)).eq('id', id).select('id');
  if (error) tratarErro(error, 'Não foi possível salvar a despesa.');
  exigirLinhaAfetada(data);
}

export async function marcarDespesaPaga(id: string, pago: boolean, dataPagamento?: string): Promise<void> {
  const { data, error } = await supabase
    .from('despesas')
    .update({ pago, data_pagamento: pago ? dataPagamento || hojeISO() : null })
    .eq('id', id)
    .select('id');
  if (error) tratarErro(error, 'Não foi possível atualizar a despesa.');
  exigirLinhaAfetada(data);
}

/** Exclui a despesa; com "eProximas", também as do mesmo grupo de repetição com vencimento igual ou depois. */
export async function excluirDespesa(despesa: Despesa, eProximas = false): Promise<number> {
  const consulta =
    eProximas && despesa.recorrencia
      ? supabase.from('despesas').delete().eq('recorrencia', despesa.recorrencia).gte('data', despesa.data)
      : supabase.from('despesas').delete().eq('id', despesa.id);
  const { data, error } = await consulta.select('id');
  if (error) tratarErro(error, 'Não foi possível excluir a despesa.');
  exigirLinhaAfetada(data);
  return data?.length || 0;
}

export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type SituacaoDespesa = 'PAGA' | 'VENCIDA' | 'A_PAGAR';
export const situacaoDespesa = (d: Pick<Despesa, 'pago' | 'data'>, hoje = hojeISO()): SituacaoDespesa =>
  d.pago ? 'PAGA' : d.data < hoje ? 'VENCIDA' : 'A_PAGAR';

export const somarDespesas = (lista: Despesa[]) => Math.round(lista.reduce((t, d) => t + d.valor, 0) * 100) / 100;
