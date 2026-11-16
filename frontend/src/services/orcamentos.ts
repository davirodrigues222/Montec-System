import { supabase } from './supabaseClient';
import { MENSAGEM_SEM_PERMISSAO, ehRecusaDePermissao, exigirLinhaAfetada } from './errosBanco';
import { formatarMoeda } from '../utils/formatadores';
import { dataBR } from '../utils/meses';

// ==========================================
// Orçamento rápido pelo WhatsApp (migração 20261114090000_orcamentos.sql).
// A loja monta o orçamento e manda pelo WhatsApp do cliente com um link (/orcamento/<código>);
// pelo link o cliente autoriza ou não o serviço. Não cria OS.
// Cada orçamento tem de 1 a 6 opções de preço (migração 20261116090000_orcamento_opcoes.sql), por
// exemplo tela original e primeira linha; o cliente escolhe qual autoriza.
// ==========================================

export type StatusOrcamento = 'PENDENTE' | 'APROVADO' | 'RECUSADO';

/** Uma opção de preço do orçamento (ex.: Original – R$ 450,00 – garantia de 6 meses). */
export interface OpcaoOrcamento {
  id?: string;
  qualidade: string | null;
  valor: number;
  descricao: string | null;
}

/** Cópia da opção que o cliente (ou a loja) autorizou, guardada no orçamento. */
export interface OpcaoAprovada {
  id?: string;
  qualidade: string;
  valor: number;
  descricao: string;
}

export const MAX_OPCOES_ORCAMENTO = 6;

/** Sugestões do campo Qualidade (o campo aceita qualquer texto). */
export const QUALIDADES_SUGERIDAS = ['Original', 'Original retirada', 'Primeira linha', 'Incell', 'OLED', 'Nacional', 'Paralela'];

export interface Orcamento {
  id: string;
  token: string;
  cliente_nome: string;
  cliente_whatsapp: string;
  id_cliente: string | null;
  titulo: string;
  aparelho: string;
  /** Menor valor entre as opções. */
  valor: number;
  opcoes: OpcaoOrcamento[];
  opcao_aprovada: OpcaoAprovada | null;
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
  'cliente_nome' | 'cliente_whatsapp' | 'id_cliente' | 'titulo' | 'aparelho' | 'opcoes' | 'garantia' | 'brinde' | 'condicoes' | 'observacoes' | 'validade'
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

const MIGRACAO_ORCAMENTOS = '20261114090000_orcamentos.sql';
const MIGRACAO_OPCOES = '20261116090000_orcamento_opcoes.sql';

export class OrcamentosAusenteError extends Error {
  /** Arquivo em supabase/migrations que falta executar. */
  readonly migracao: string;
  constructor(migracao = MIGRACAO_ORCAMENTOS) {
    super('Os orçamentos ainda não foram ativados no banco (falta executar a migração dos orçamentos).');
    this.name = 'OrcamentosAusenteError';
    this.migracao = migracao;
  }
}

function tratarErro(error: any, padrao: string): never {
  // Tabela orcamentos inexistente: falta a primeira migração
  if (['PGRST205', '42P01'].includes(error?.code)) throw new OrcamentosAusenteError();
  // Opções ou funções novas inexistentes: falta a migração das opções
  if (['PGRST200', 'PGRST202', '42883'].includes(error?.code)) throw new OrcamentosAusenteError(MIGRACAO_OPCOES);
  if (ehRecusaDePermissao(error)) throw new Error(MENSAGEM_SEM_PERMISSAO);
  if (error?.code === '23514') throw new Error('Confira os dados: nome, WhatsApp com DDD, serviço, aparelho e o valor de cada opção.');
  throw new Error(error?.message || padrao);
}

const COLUNAS = '*, opcoes:orcamento_opcoes(id, ordem, qualidade, valor, descricao)';

const normalizar = (o: any): Orcamento => {
  const opcoes: OpcaoOrcamento[] = (Array.isArray(o.opcoes) ? [...o.opcoes] : [])
    .sort((a: any, b: any) => a.ordem - b.ordem)
    .map((p: any) => ({ id: p.id, qualidade: p.qualidade || null, valor: Number(p.valor) || 0, descricao: p.descricao || null }));
  return {
    ...o,
    valor: Number(o.valor) || 0,
    // Orçamento sem opções gravadas (não deveria acontecer depois da migração): vira uma opção com o valor dele
    opcoes: opcoes.length ? opcoes : [{ qualidade: null, valor: Number(o.valor) || 0, descricao: null }],
    opcao_aprovada: o.opcao_aprovada ? { ...o.opcao_aprovada, valor: Number(o.opcao_aprovada.valor) || 0 } : null,
    condicoes: Array.isArray(o.condicoes) ? o.condicoes.map(String) : [],
  };
};

const limpar = (d: DadosOrcamento) => ({
  cliente_nome: d.cliente_nome.trim(),
  cliente_whatsapp: d.cliente_whatsapp.replace(/\D/g, ''),
  id_cliente: d.id_cliente || null,
  titulo: d.titulo.trim(),
  aparelho: d.aparelho.trim(),
  garantia: d.garantia?.trim() || null,
  brinde: d.brinde?.trim() || null,
  condicoes: d.condicoes.map((c) => c.trim()).filter(Boolean).slice(0, 10),
  observacoes: d.observacoes?.trim() || null,
  validade: d.validade || null,
});

const limparOpcoes = (opcoes: OpcaoOrcamento[]) =>
  opcoes.map((p) => ({
    qualidade: p.qualidade?.trim() || null,
    valor: Math.round(p.valor * 100) / 100,
    descricao: p.descricao?.trim() || null,
  }));

/** Rótulo curto da opção: "Original" ou, sem qualidade, "Opção 2". */
export const rotuloOpcao = (p: { qualidade?: string | null }, indice: number) => p.qualidade?.trim() || `Opção ${indice + 1}`;

/** Os 200 orçamentos mais recentes, com as opções. */
export async function listarOrcamentos(): Promise<Orcamento[]> {
  const { data, error } = await supabase.from('orcamentos').select(COLUNAS).order('criado_em', { ascending: false }).limit(200);
  if (error) tratarErro(error, 'Não foi possível carregar os orçamentos.');
  return (data || []).map(normalizar);
}

/**
 * Cria (sem id) ou edita (com id) o orçamento junto com as opções, numa transação só no banco.
 * Editar só funciona enquanto o cliente não respondeu.
 */
export async function salvarOrcamento(dados: DadosOrcamento, id?: string): Promise<Orcamento> {
  const { data: idSalvo, error } = await supabase.rpc('salvar_orcamento', {
    p_dados: limpar(dados),
    p_opcoes: limparOpcoes(dados.opcoes),
    p_id: id ?? null,
  });
  if (error) tratarErro(error, 'Não foi possível salvar o orçamento.');
  const { data, error: erroLeitura } = await supabase.from('orcamentos').select(COLUNAS).eq('id', idSalvo).single();
  if (erroLeitura) tratarErro(erroLeitura, 'Orçamento salvo, mas não foi possível carregá-lo. Recarregue a página.');
  return normalizar(data);
}

/**
 * A loja registra a resposta que o cliente deu por fora do link (conversa, telefone, balcão).
 * Ao marcar como autorizado, `opcao` é a opção que o cliente escolheu.
 */
export async function definirStatusOrcamento(
  id: string,
  status: StatusOrcamento,
  opcao?: OpcaoOrcamento | null
): Promise<OpcaoAprovada | null> {
  const opcaoAprovada: OpcaoAprovada | null =
    status === 'APROVADO' && opcao
      ? { ...(opcao.id ? { id: opcao.id } : {}), qualidade: opcao.qualidade || '', valor: opcao.valor, descricao: opcao.descricao || '' }
      : null;
  const { data, error } = await supabase
    .from('orcamentos')
    .update({
      status,
      respondido_em: status === 'PENDENTE' ? null : new Date().toISOString(),
      respondido_por: status === 'PENDENTE' ? null : 'LOJA',
      opcao_aprovada: opcaoAprovada,
      ...(status !== 'RECUSADO' ? { motivo_recusa: null } : {}),
    })
    .eq('id', id)
    .select('id');
  if (error) tratarErro(error, 'Não foi possível atualizar o orçamento.');
  exigirLinhaAfetada(data);
  return opcaoAprovada;
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
  const varias = o.opcoes.length > 1;
  const linhas = o.opcoes.map((p, i) => {
    const valor = formatarMoeda(p.valor || 0);
    const linha = varias || p.qualidade?.trim() ? `• *${rotuloOpcao(p, i)}:* ${valor}` : `• ${valor}`;
    return p.descricao?.trim() ? `${linha}\n   ${p.descricao.trim()}` : linha;
  });
  blocos.push(`${varias ? 'Opções' : 'Orçamento'}:\n${linhas.join('\n')}`);
  if (o.garantia?.trim()) blocos.push(`Garantia:\n✔️ ${o.garantia.trim()}`);
  if (o.brinde?.trim()) blocos.push(`🎁 ${o.brinde.trim()}`);
  const condicoes = o.condicoes.map((c) => c.trim()).filter(Boolean);
  if (condicoes.length) blocos.push(`Formas de Pagamento:\n${condicoes.map((c) => `✔️ ${c}`).join('\n')}`);
  if (o.observacoes?.trim()) blocos.push(o.observacoes.trim());
  if (o.validade) blocos.push(`Orçamento válido até ${dataBR(o.validade)}.`);
  if (link) {
    blocos.push(
      varias
        ? `👉 Para *escolher a opção* e autorizar ou não o serviço, toque no link:\n${link}`
        : `👉 Para *autorizar ou não* o serviço, toque no link:\n${link}`
    );
  }
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
    /** Menor valor entre as opções. */
    valor: number;
    opcoes: { id: string | null; qualidade: string; valor: number; descricao: string }[];
    opcao_aprovada: OpcaoAprovada | null;
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

/** `opcaoId`: a opção escolhida pelo cliente (obrigatória ao autorizar orçamento com mais de uma opção). */
export async function responderOrcamentoPublico(
  codigo: string,
  aprovar: boolean,
  motivo?: string,
  opcaoId?: string | null
): Promise<OrcamentoPublicoDados | null> {
  const { data, error } = await supabase.rpc('responder_orcamento', {
    p_token: codigo,
    p_aprovar: aprovar,
    p_motivo: motivo || null,
    p_opcao: opcaoId || null,
  });
  if (error) throw new Error(error.message || 'Não foi possível enviar a resposta. Tente de novo.');
  return (data as OrcamentoPublicoDados) || null;
}
