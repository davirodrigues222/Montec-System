// Planos do Montec System e assinatura da conta (pagamento pela Cakto).
//
// A assinatura é da conta da loja: funcionários com login próprio herdam o plano do dono.
// Quem libera o acesso é o servidor (Edge Function "cakto-webhook"), quando a Cakto confirma o
// pagamento; aqui o sistema só lê a situação (situacao_assinatura, migração 20261027090000).

import { supabase } from './supabaseClient';

// ---------------------------------------------------------------------------------------------
// Links de checkout da Cakto. Vêm do .env (VITE_CAKTO_LINK_MENSAL / VITE_CAKTO_LINK_ANUAL); sem o
// .env, valem os links colados aqui.
// ---------------------------------------------------------------------------------------------
const LINK_CAKTO_MENSAL = 'https://pay.cakto.com.br/thwo3ys_1246997'; // Plano Profissional Mensal
const LINK_CAKTO_ANUAL = 'https://pay.cakto.com.br/32sr59s'; // Plano Profissional Anual

/**
 * Chave de bloqueio (ligada): conta sem assinatura ativa (ou com o teste vencido) vê a tela de
 * renovação em vez do sistema. Para desligar sem mudar o código, cadastre
 * VITE_ASSINATURA_OBRIGATORIA=false nas variáveis da Vercel e faça um novo deploy.
 */
export const ASSINATURA_OBRIGATORIA = import.meta.env.VITE_ASSINATURA_OBRIGATORIA !== 'false';

export type IdPlano = 'mensal' | 'anual';

export interface Plano {
  id: IdPlano;
  nome: string;
  preco: number;
  ciclo: string; // texto do card ("/mês", "/ano")
  diasAcesso: number;
  equivalenteMensal?: number;
  destaque?: string;
  beneficios: string[];
  linkCheckout: string;
}

const BENEFICIOS_MENSAL = [
  'Ordens de Serviço ilimitadas',
  'Controle Financeiro e Lucro Real',
  'Gestão de Garantias e Retornos',
  'Impressão A4 e Térmica 80mm',
  'Cadastro de Clientes, Peças e Fornecedores',
  'Suporte via WhatsApp',
];

export const PLANOS: Record<IdPlano, Plano> = {
  mensal: {
    id: 'mensal',
    nome: 'Plano Profissional Mensal',
    preco: 29.99,
    ciclo: '/mês',
    diasAcesso: 30,
    beneficios: BENEFICIOS_MENSAL,
    linkCheckout: import.meta.env.VITE_CAKTO_LINK_MENSAL || LINK_CAKTO_MENSAL,
  },
  anual: {
    id: 'anual',
    nome: 'Plano Profissional Anual',
    preco: 342.0,
    ciclo: '/ano',
    diasAcesso: 365,
    equivalenteMensal: 28.5,
    destaque: 'MAIS VANTAJOSO • ECONOMIZE NO ANUAL',
    beneficios: [
      'Tudo do Plano Mensal',
      '12 meses de acesso garantido sem reajuste',
      'Prioridade no Suporte',
      'Backup Completo de Dados',
    ],
    linkCheckout: import.meta.env.VITE_CAKTO_LINK_ANUAL || LINK_CAKTO_ANUAL,
  },
};

export const LISTA_PLANOS: Plano[] = [PLANOS.mensal, PLANOS.anual];

export type StatusAssinatura = 'ativa' | 'trial' | 'vencida' | 'cancelada';

export interface SituacaoAssinatura {
  /** false: a tabela/função ainda não existe no banco (ou não respondeu). O sistema não bloqueia. */
  disponivel: boolean;
  status: StatusAssinatura;
  plano: IdPlano | null;
  valor: number | null;
  dataInicio: string | null;
  dataExpiracao: string | null;
  acessoLiberado: boolean;
  /** Dados do dono da conta, usados para preencher o checkout (o webhook acha a conta pelo e-mail). */
  emailConta: string;
  nomeConta: string;
  telefoneConta: string;
}

export const SITUACAO_INDISPONIVEL: SituacaoAssinatura = {
  disponivel: false,
  status: 'trial',
  plano: null,
  valor: null,
  dataInicio: null,
  dataExpiracao: null,
  acessoLiberado: true,
  emailConta: '',
  nomeConta: '',
  telefoneConta: '',
};

/**
 * Situação da assinatura da loja logada. Nunca lança erro: se a migração ainda não foi executada
 * (ou o banco não respondeu), devolve "indisponível" e o sistema segue funcionando normalmente.
 */
export async function buscarSituacaoAssinatura(): Promise<SituacaoAssinatura> {
  try {
    const { data, error } = await supabase.rpc('situacao_assinatura');
    const linha = Array.isArray(data) ? data[0] : data;
    if (error || !linha) return SITUACAO_INDISPONIVEL;
    return {
      disponivel: true,
      status: linha.status,
      plano: linha.plano ?? null,
      valor: linha.valor === null || linha.valor === undefined ? null : Number(linha.valor),
      dataInicio: linha.data_inicio ?? null,
      dataExpiracao: linha.data_expiracao ?? null,
      acessoLiberado: !!linha.acesso_liberado,
      emailConta: linha.email_conta || '',
      nomeConta: linha.nome_conta || '',
      telefoneConta: linha.telefone_conta || '',
    };
  } catch {
    return SITUACAO_INDISPONIVEL;
  }
}

/**
 * Acesso de cortesia: liberado sem plano pago (ex.: a conta do dono do sistema), gravado à mão no
 * banco com status 'ativa', sem plano e validade em 2100.
 */
export const ehCortesia = (s: SituacaoAssinatura) => s.status === 'ativa' && s.acessoLiberado && !s.plano;

/** Dias até o fim do acesso (0 quando já venceu). */
export function diasRestantes(dataExpiracao: string | null): number {
  if (!dataExpiracao) return 0;
  const ms = new Date(dataExpiracao).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 86_400_000) : 0;
}

export const formatarDataAssinatura = (data: string | null) =>
  data ? new Date(data).toLocaleDateString('pt-BR') : '—';

export const formatarPrecoPlano = (valor: number) =>
  valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Link do checkout da Cakto já preenchido com o e-mail, o nome e o WhatsApp da conta.
 * O e-mail precisa ser o da conta: é por ele que o webhook libera o acesso.
 * Devolve null quando o link do plano não foi configurado.
 */
export function montarLinkCheckout(plano: IdPlano, situacao: Pick<SituacaoAssinatura, 'emailConta' | 'nomeConta' | 'telefoneConta'>) {
  const base = PLANOS[plano].linkCheckout.trim();
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return null; // vazio ou inválido
  }
  if (situacao.emailConta) url.searchParams.set('email', situacao.emailConta);
  if (situacao.nomeConta) url.searchParams.set('name', situacao.nomeConta);
  const telefone = situacao.telefoneConta.replace(/\D/g, '');
  if (telefone) url.searchParams.set('phone', telefone);
  return url.toString();
}

/** Abre o checkout do plano numa nova aba. Devolve false se o link do plano não está configurado. */
export function abrirCheckout(plano: IdPlano, situacao: SituacaoAssinatura): boolean {
  const link = montarLinkCheckout(plano, situacao);
  if (!link) return false;
  window.open(link, '_blank', 'noopener,noreferrer');
  return true;
}
