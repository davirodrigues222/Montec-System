import { supabase } from './supabaseClient';
import { MENSAGEM_SEM_PERMISSAO, ehRecusaDePermissao, exigirLinhaAfetada } from './errosBanco';
import { formatarMoeda } from '../utils/formatadores';
import { dataBR } from '../utils/meses';

// ==========================================
// Orçamento rápido pelo WhatsApp (migração 20261114090000_orcamentos.sql).
// A loja monta o orçamento e manda pelo WhatsApp do cliente com um link (/orcamento/<código>);
// pelo link o cliente autoriza ou não o serviço. Não cria OS.
// ==========================================

export type StatusOrcamento = 'PENDENTE' | 'APROVADO' | 'RECUSADO';

export interface Orcamento {
  id: string;
  token: string;
  cliente_nome: string;
  cliente_whatsapp: string;
  id_cliente: string | null;
  titulo: string;
  aparelho: string;
  valor: number;
  garantia: string | null;
  brinde: string | null;
  condicoes: string[];
  observacoes: string | null;
  validade: string | null;
  status: StatusOrcamento;
  respondido_em: string | null;
  respondido_por: 'CLIENTE' | 'LOJA' | null;
  motivo_recusa: string | null;
  criado_por: string | null;
  criado_em: string;
}

export type DadosOrcamento = Pick<
  Orcamento,
  'cliente_nome' | 'cliente_whatsapp' | 'id_cliente' | 'titulo' | 'aparelho' | 'valor' | 'garantia' | 'brinde' | 'condicoes' | 'observacoes' | 'validade'
>;

export const ROTULO_STATUS_ORCAMENTO: Record<StatusOrcamento, string> = {
  PENDENTE: 'Aguardando cliente',
  APROVADO: 'Autorizado',
  RECUSADO: 'Não autorizado',
};

/** Formas de pagamento sugeridas no primeiro orçamento (depois valem as do último enviado). */
export const CONDICOES_PADRAO = [
  '5% de desconto no pagamento à vista',
  'Até 3x sem juros no cartão',
  'Parcelamentos acima de 3x sujeitos à taxa da operadora da maquininha',
];

export const CAMINHO_ORCAMENTO = '/orcamento/';

export class OrcamentosAusenteError extends Error {
  constructor() {
    super('Os orçamentos ainda não foram ativados no banco (falta executar a migração dos orçamentos).');
    this.name = 'OrcamentosAusenteError';
  }
}

function tratarErro(error: any, padrao: string): never {
  if (['PGRST205', '42P01', 'PGRST202', '42883'].includes(error?.code)) throw new OrcamentosAusenteError();
  if (ehRecusaDePermissao(error)) throw new Error(MENSAGEM_SEM_PERMISSAO);
  if (error?.code === '23514') throw new Error('Confira os dados: nome, WhatsApp com DDD, serviço, aparelho e valor maior que zero.');
  throw new Error(error?.message || padrao);
}

const normalizar = (o: any): Orcamento => ({
  ...o,
  valor: Number(o.valor) || 0,
  condicoes: Array.isArray(o.condicoes) ? o.condicoes.map(String) : [],
});

const limpar = (d: DadosOrcamento) => ({
  cliente_nome: d.cliente_nome.trim(),
  cliente_whatsapp: d.cliente_whatsapp.replace(/\D/g, ''),
  id_cliente: d.id_cliente || null,
  titulo: d.titulo.trim(),
  aparelho: d.aparelho.trim(),
  valor: Math.round(d.valor * 100) / 100,
  garantia: d.garantia?.trim() || null,
  brinde: d.brinde?.trim() || null,
  condicoes: d.condicoes.map((c) => c.trim()).filter(Boolean).slice(0, 10),
  observacoes: d.observacoes?.trim() || null,
  validade: d.validade || null,
});

/** Os 200 orçamentos mais recentes. */
export async function listarOrcamentos(): Promise<Orcamento[]> {
  const { data, error } = await supabase.from('orcamentos').select('*').order('criado_em', { ascending: false }).limit(200);
  if (error) tratarErro(error, 'Não foi possível carregar os orçamentos.');
  return (data || []).map(normalizar);
}

export async function criarOrcamento(dados: DadosOrcamento): Promise<Orcamento> {
  const { data, error } = await supabase.from('orcamentos').insert(limpar(dados)).select('*').single();
  if (error) tratarErro(error, 'Não foi possível salvar o orçamento.');
  return normalizar(data);
}

/** A loja registra a resposta que o cliente deu por fora do link (conversa, telefone, balcão). */
export async function definirStatusOrcamento(id: string, status: StatusOrcamento): Promise<void> {
  const { data, error } = await supabase
    .from('orcamentos')
    .update({
      status,
      respondido_em: status === 'PENDENTE' ? null : new Date().toISOString(),
      respondido_por: status === 'PENDENTE' ? null : 'LOJA',
      ...(status !== 'RECUSADO' ? { motivo_recusa: null } : {}),
    })
    .eq('id', id)
    .select('id');
  if (error) tratarErro(error, 'Não foi possível atualizar o orçamento.');
  exigirLinhaAfetada(data);
}

export async function excluirOrcamento(id: string): Promise<void> {
  const { data, error } = await supabase.from('orcamentos').delete().eq('id', id).select('id');
  if (error) tratarErro(error, 'Não foi possível excluir o orçamento.');
  exigirLinhaAfetada(data);
}

export const linkDoOrcamento = (token: string) => `${window.location.origin}${CAMINHO_ORCAMENTO}${token}`;

/** Código da página pública na URL atual, ou null se não for a página de orçamento. */
export function codigoOrcamentoNaUrl(): string | null {
  const m = window.location.pathname.match(/^\/orcamento\/([A-Za-z0-9_-]{24})\/?$/);
  return m ? m[1] : null;
}

/**
 * Texto da mensagem do WhatsApp (no formato que a loja já usa). Os campos vazios não aparecem.
 * Com link, termina com o convite para autorizar ou não o serviço.
 */
export function mensagemOrcamento(o: Omit<DadosOrcamento, 'cliente_whatsapp' | 'id_cliente'>, link?: string): string {
  const blocos: string[] = [`*ORÇAMENTO – ${o.titulo.trim().toUpperCase()}*`];
  if (o.aparelho.trim()) blocos.push(`Modelo: ${o.aparelho.trim()}`);
  blocos.push(`Orçamento:\n• ${formatarMoeda(o.valor || 0)}`);
  if (o.garantia?.trim()) blocos.push(`Garantia:\n✔️ ${o.garantia.trim()}`);
  if (o.brinde?.trim()) blocos.push(`🎁 ${o.brinde.trim()}`);
  const condicoes = o.condicoes.map((c) => c.trim()).filter(Boolean);
  if (condicoes.length) blocos.push(`Formas de Pagamento:\n${condicoes.map((c) => `✔️ ${c}`).join('\n')}`);
  if (o.observacoes?.trim()) blocos.push(o.observacoes.trim());
  if (o.validade) blocos.push(`Orçamento válido até ${dataBR(o.validade)}.`);
  if (link) blocos.push(`👉 Para *autorizar ou não* o serviço, toque no link:\n${link}`);
  return blocos.join('\n\n');
}

// ------------------------------------------
// Página pública
// ------------------------------------------

export interface OrcamentoPublicoDados {
  loja: { nome: string; telefone: string; endereco: string; horario: string; logo: string };
  orcamento: {
    cliente: string;
    titulo: string;
    aparelho: string;
    valor: number;
    garantia: string;
    brinde: string;
    condicoes: string[];
    observacoes: string;
    validade: string | null;
    criado_em: string;
    status: StatusOrcamento;
    respondido_em: string | null;
    vencido: boolean;
  };
}

/** Dados do orçamento para a página pública; null se o link não existe, foi excluído ou venceu. */
export async function consultarOrcamentoPublico(codigo: string): Promise<OrcamentoPublicoDados | null> {
  const { data, error } = await supabase.rpc('consultar_orcamento', { p_token: codigo });
  if (error) throw new Error('Não foi possível carregar o orçamento. Verifique a internet e tente de novo.');
  return (data as OrcamentoPublicoDados) || null;
}

export async function responderOrcamentoPublico(codigo: string, aprovar: boolean, motivo?: string): Promise<OrcamentoPublicoDados | null> {
  const { data, error } = await supabase.rpc('responder_orcamento', { p_token: codigo, p_aprovar: aprovar, p_motivo: motivo || null });
  if (error) throw new Error(error.message || 'Não foi possível enviar a resposta. Tente de novo.');
  return (data as OrcamentoPublicoDados) || null;
}
