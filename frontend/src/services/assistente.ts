import { supabase } from './supabaseClient';
import { type AbaSistema, type Operador, podeAcessar } from './acesso';
import {
  type ChavePermissao,
  type FormaPagamento,
  type FormaPagamentoInput,
  type Servico,
  type TaxaParcela,
  type TipoFormaPagamento,
  CARGOS,
  PERMISSOES_DISPONIVEIS,
  TIPOS_FORMA_PAGAMENTO,
  criarFormasPagamentoPadrao,
  formasPadraoFaltantes,
  listarFormasPagamento,
  listarServicos,
  salvarFormaPagamento,
  salvarServico,
} from './cadastros';
import { avisarFormasPagamentoAlteradas } from './formasPagamentoOS';
import { GARANTIA_LEGAL_DIAS } from '../utils/conformidade';
import { formatarMoeda } from '../utils/formatadores';
import type { SecaoCadastro, SecaoConfiguracao } from '../types';

// ==========================================
// Assistente de IA (Google Gemini, pela Edge Function supabase/functions/assistente).
// A Edge Function só conversa com o Gemini; as ferramentas que ele pede rodam AQUI, com o login e as
// permissões de quem está usando. Tudo o que grava passa antes pela confirmação do usuário.
// Os nomes e parâmetros das ferramentas precisam bater com FERRAMENTAS na Edge Function.
// Nada de dados de clientes ou de OS vai para o Gemini (no plano gratuito o Google pode usar as conversas).
// ==========================================

export interface ParteGemini {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { id?: string; name: string; args?: Record<string, any> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
}

export interface ConteudoGemini {
  role: 'user' | 'model';
  parts: ParteGemini[];
}

/** Evento disparado quando o assistente grava algo: as telas de cadastro abertas recarregam. */
export const EVENTO_ASSISTENTE_GRAVOU = 'assistente_gravou';
const avisarGravacao = () => window.dispatchEvent(new Event(EVENTO_ASSISTENTE_GRAVOU));

/** Contexto curto de quem está usando, para o assistente não oferecer o que a pessoa não pode fazer. */
export function contextoDoOperador(operador: Operador | null, tela: string) {
  return {
    nome: operador?.nome || '',
    cargo: operador ? CARGOS[operador.cargo]?.label || operador.cargo : '',
    proprietario: !!operador?.proprietario,
    permissoes: PERMISSOES_DISPONIVEIS.filter((p) => podeAcessar(operador, p.chave)).map((p) => p.label),
    tela,
  };
}

/** Manda a conversa para a Edge Function e devolve a próxima mensagem do assistente. */
export async function perguntarAoAssistente(
  conversa: ConteudoGemini[],
  contexto: ReturnType<typeof contextoDoOperador>
): Promise<ConteudoGemini> {
  // A Edge Function desiste do Gemini em 50 s; aqui espera um pouco mais para receber a mensagem de erro dela
  const { data, error } = await supabase.functions.invoke('assistente', { body: { contents: conversa, contexto }, timeout: 65_000 });
  if (error) {
    let mensagem = '';
    try {
      mensagem = (await (error as any)?.context?.json?.())?.erro || '';
    } catch {
      /* resposta sem corpo */
    }
    throw new Error(mensagem || 'O assistente demorou demais ou está fora do ar. Verifique a internet e tente de novo.');
  }
  if (!data?.conteudo?.parts) throw new Error('Resposta inválida do assistente.');
  return data.conteudo as ConteudoGemini;
}

// ------------------------------------------
// Telas que o assistente pode abrir
// ------------------------------------------

export interface DestinoTela {
  aba: AbaSistema;
  secaoCadastro?: SecaoCadastro;
  secaoConfiguracao?: SecaoConfiguracao;
}

const TELAS: Record<string, DestinoTela> = {
  painel: { aba: 'dashboard' },
  'nova-os': { aba: 'nova-os' },
  orcamentos: { aba: 'orcamentos' },
  ordens: { aba: 'historico' },
  garantias: { aba: 'garantia-retorno' },
  relatorios: { aba: 'relatorios' },
  clientes: { aba: 'cadastros', secaoCadastro: 'clientes' },
  servicos: { aba: 'cadastros', secaoCadastro: 'servicos' },
  fornecedores: { aba: 'cadastros', secaoCadastro: 'fornecedores' },
  lojas: { aba: 'cadastros', secaoCadastro: 'lojas' },
  funcionarios: { aba: 'cadastros', secaoCadastro: 'funcionarios' },
  'formas-pagamento': { aba: 'cadastros', secaoCadastro: 'formas-pagamento' },
  'config-impressao': { aba: 'configuracoes', secaoConfiguracao: 'loja' },
  'config-taxas': { aba: 'configuracoes', secaoConfiguracao: 'financeiro' },
  'config-operacional': { aba: 'configuracoes', secaoConfiguracao: 'operacional' },
  'config-whatsapp': { aba: 'configuracoes', secaoConfiguracao: 'whatsapp' },
  'config-equipe': { aba: 'configuracoes', secaoConfiguracao: 'equipe' },
  'config-conta': { aba: 'configuracoes', secaoConfiguracao: 'conta' },
  'config-assinatura': { aba: 'configuracoes', secaoConfiguracao: 'assinatura' },
  'config-leis': { aba: 'configuracoes', secaoConfiguracao: 'leis' },
};

// ------------------------------------------
// Ferramentas
// ------------------------------------------

export interface ContextoFerramenta {
  operador: Operador | null;
  abrirTela: (destino: DestinoTela) => void;
}

/** Ação que grava: o painel mostra o resumo e só executa depois do "Confirmar". */
export interface AcaoPendente {
  titulo: string;
  linhas: string[];
  executar: () => Promise<Record<string, unknown>>;
}

/** Resultado de uma ferramenta: pronto (consultas, telas) ou à espera da confirmação (gravações). */
export type ResultadoFerramenta = { resultado: Record<string, unknown> } | { confirmar: AcaoPendente };

const MENSAGEM_SEM_PERMISSAO_TELA = 'O usuário atual não tem permissão para esta tela. Um administrador precisa liberar.';

function exigirPermissao(ctx: ContextoFerramenta, chave: ChavePermissao) {
  if (!podeAcessar(ctx.operador, chave)) throw new Error(MENSAGEM_SEM_PERMISSAO_TELA);
}

const numero = (v: unknown, campo: string, min: number, max: number, inteiro = false): number => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  if (!Number.isFinite(n) || n < min || n > max || (inteiro && !Number.isInteger(n))) {
    throw new Error(`Valor inválido em ${campo}: use ${inteiro ? 'um número inteiro ' : ''}entre ${min} e ${max}.`);
  }
  return n;
};

const texto = (v: unknown) => (v === undefined || v === null ? undefined : String(v).trim());
const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

const MAX_PARCELAS = 24;

const resumoForma = (f: FormaPagamento) => ({
  id_forma_pagamento: f.id_forma_pagamento,
  nome: f.nome,
  tipo: f.tipo,
  ativo: f.ativo,
  ordem: f.ordem,
  taxa_percentual: f.taxa_percentual,
  taxa_fixa: f.taxa_fixa,
  prazo_recebimento_dias: f.prazo_recebimento_dias,
  permite_parcelamento: f.permite_parcelamento,
  parcelas_max: f.parcelas_max,
  parcelas_sem_juros: f.parcelas_sem_juros,
  repassar_juros_cliente: f.repassar_juros_cliente,
  todas_as_lojas: !f.id_loja,
  taxas_por_parcela: f.taxas,
});

async function prepararFormaPagamento(args: Record<string, any>): Promise<AcaoPendente> {
  const formas = await listarFormasPagamento();
  const idForma = texto(args.id_forma_pagamento);
  const atual = idForma ? formas.find((f) => f.id_forma_pagamento === idForma) : undefined;
  if (idForma && !atual) throw new Error('Forma de pagamento não encontrada. Consulte a lista de novo para pegar o id certo.');

  const tipo = (texto(args.tipo) ?? atual?.tipo) as TipoFormaPagamento | undefined;
  if (!tipo || !TIPOS_FORMA_PAGAMENTO[tipo]) throw new Error('Informe o tipo da forma de pagamento.');
  const nome = texto(args.nome) || atual?.nome || TIPOS_FORMA_PAGAMENTO[tipo].label;
  const idLoja = atual ? atual.id_loja : null;
  if (
    formas.some(
      (f) => f.id_forma_pagamento !== idForma && f.nome.trim().toLowerCase() === nome.toLowerCase() && (f.id_loja || '') === (idLoja || '')
    )
  ) {
    throw new Error(`Já existe uma forma de pagamento chamada "${nome}". Altere a existente em vez de criar outra.`);
  }

  const aceita = TIPOS_FORMA_PAGAMENTO[tipo].aceitaParcelamento;
  const permite = aceita && (args.permite_parcelamento ?? (args.parcelas_max > 1 ? true : atual?.permite_parcelamento ?? false)) === true;
  const parcelasMax = permite ? numero(args.parcelas_max ?? atual?.parcelas_max ?? 12, 'parcelas_max', 2, MAX_PARCELAS, true) : 1;
  const semJurosBase = args.parcelas_sem_juros ?? Math.min(atual?.parcelas_sem_juros ?? 1, parcelasMax);
  const parcelasSemJuros = permite ? numero(semJurosBase, 'parcelas_sem_juros', 1, parcelasMax, true) : 1;
  if (!aceita && (args.permite_parcelamento === true || Number(args.parcelas_max) > 1)) {
    throw new Error(`${TIPOS_FORMA_PAGAMENTO[tipo].label} não aceita parcelamento.`);
  }

  const dados: FormaPagamentoInput = {
    nome,
    tipo,
    id_loja: idLoja,
    taxa_percentual: numero(args.taxa_percentual ?? atual?.taxa_percentual ?? 0, 'taxa_percentual', 0, 100),
    taxa_fixa: numero(args.taxa_fixa ?? atual?.taxa_fixa ?? 0, 'taxa_fixa', 0, 100000),
    prazo_recebimento_dias: numero(args.prazo_recebimento_dias ?? atual?.prazo_recebimento_dias ?? 0, 'prazo_recebimento_dias', 0, 365, true),
    permite_parcelamento: permite,
    parcelas_max: parcelasMax,
    parcelas_sem_juros: parcelasSemJuros,
    repassar_juros_cliente: permite && (args.repassar_juros_cliente ?? atual?.repassar_juros_cliente ?? false) === true,
    ativo: (args.ativo ?? atual?.ativo ?? true) === true,
    ordem: numero(args.ordem ?? atual?.ordem ?? formas.length + 1, 'ordem', 0, 9999, true),
  };

  let taxas: TaxaParcela[] = atual?.taxas || [];
  if (Array.isArray(args.taxas_por_parcela)) {
    taxas = args.taxas_por_parcela.map((t: any) => ({
      parcelas: numero(t?.parcelas, 'taxas_por_parcela.parcelas', 1, MAX_PARCELAS, true),
      taxa_percentual: numero(t?.taxa_percentual, 'taxas_por_parcela.taxa_percentual', 0, 100),
    }));
  }
  taxas = permite ? taxas.filter((t) => t.parcelas <= parcelasMax).sort((a, b) => a.parcelas - b.parcelas) : [];

  const linhas = [
    `Nome: ${dados.nome} (${TIPOS_FORMA_PAGAMENTO[tipo].label})`,
    `Taxa padrão: ${pct(dados.taxa_percentual)}${dados.taxa_fixa > 0 ? ` + ${formatarMoeda(dados.taxa_fixa)} por venda` : ''}`,
    `Recebimento: ${dados.prazo_recebimento_dias === 0 ? 'na hora' : `em ${dados.prazo_recebimento_dias} dia(s)`}`,
  ];
  if (permite) {
    linhas.push(
      `Parcelamento: até ${parcelasMax}x, ${parcelasSemJuros > 1 ? `${parcelasSemJuros}x sem juros` : 'com juros'}${dados.repassar_juros_cliente ? ', juros repassados ao cliente' : ''}`
    );
    if (taxas.length > 0) linhas.push(`Taxas por parcela: ${taxas.map((t) => `${t.parcelas}x ${pct(t.taxa_percentual)}`).join(' · ')}`);
  }
  linhas.push(`Situação: ${dados.ativo ? 'ativa' : 'inativa'} · ordem ${dados.ordem}${atual ? '' : ' · todas as lojas'}`);

  return {
    titulo: atual ? `Alterar a forma de pagamento "${atual.nome}"` : 'Criar forma de pagamento',
    linhas,
    executar: async () => {
      await salvarFormaPagamento(dados, taxas, atual?.id_forma_pagamento);
      avisarFormasPagamentoAlteradas();
      avisarGravacao();
      return { ok: true, mensagem: atual ? 'Forma de pagamento alterada.' : 'Forma de pagamento criada.' };
    },
  };
}

const resumoServico = (s: Servico) => ({
  id_servico: s.id_servico,
  nome: s.nome,
  preco_sugerido: s.preco_sugerido,
  tempo_estimado: s.tempo_estimado,
  garantia_padrao: s.garantia_padrao || 'prazo padrão da loja',
  descricao: s.descricao,
});

/** Mesmos valores que a tela de Serviços grava em garantia_padrao (lidos por extrairDiasGarantia). */
function normalizarGarantia(v: unknown): string | null {
  const g = String(v ?? '').trim().toLowerCase();
  if (!g || g.includes('padr')) return null;
  if (g.includes('sem garantia') || g.includes('legal')) return 'Sem garantia';
  const anos = g.match(/^(\d{1,2})\s*anos?$/);
  if (anos) return Number(anos[1]) === 1 ? '1 ano' : `${Number(anos[1])} anos`;
  const meses = g.match(/^(\d{1,2})\s*m[eê]s(es)?$/);
  const dias = meses ? Number(meses[1]) * 30 : Number(g.match(/^(\d{1,4})\s*dias?$/)?.[1]);
  if (!Number.isInteger(dias) || dias <= 0) throw new Error('Garantia inválida: use "90 dias", "180 dias", "1 ano", "Sem garantia" ou vazio.');
  if (dias < GARANTIA_LEGAL_DIAS) {
    throw new Error(`A garantia não pode ser menor que a legal de ${GARANTIA_LEGAL_DIAS} dias (CDC). Use "Sem garantia" para ficar só com a legal.`);
  }
  return `${dias} dias`;
}

async function prepararServico(args: Record<string, any>): Promise<AcaoPendente> {
  const servicos = await listarServicos();
  const idServico = texto(args.id_servico);
  const atual = idServico ? servicos.find((s) => s.id_servico === idServico) : undefined;
  if (idServico && !atual) throw new Error('Serviço não encontrado. Consulte a lista de novo para pegar o id certo.');

  const nome = texto(args.nome) || atual?.nome || '';
  if (!nome) throw new Error('Informe o nome do serviço.');
  if (servicos.some((s) => s.id_servico !== idServico && s.nome.trim().toLowerCase() === nome.toLowerCase())) {
    throw new Error(`Já existe um serviço chamado "${nome}". Altere o existente em vez de criar outro.`);
  }
  const dados: Omit<Servico, 'id_servico'> = {
    nome,
    preco_sugerido: numero(args.preco_sugerido ?? atual?.preco_sugerido ?? 0, 'preco_sugerido', 0, 1000000),
    tempo_estimado: args.tempo_estimado !== undefined ? texto(args.tempo_estimado) || null : atual?.tempo_estimado ?? null,
    garantia_padrao: args.garantia_padrao !== undefined ? normalizarGarantia(args.garantia_padrao) : atual?.garantia_padrao ?? null,
    descricao: args.descricao !== undefined ? texto(args.descricao) || null : atual?.descricao ?? null,
  };

  return {
    titulo: atual ? `Alterar o serviço "${atual.nome}"` : 'Criar serviço',
    linhas: [
      `Nome: ${dados.nome}`,
      `Preço sugerido: ${formatarMoeda(dados.preco_sugerido)}`,
      `Tempo estimado: ${dados.tempo_estimado || 'não informado'}`,
      `Garantia: ${dados.garantia_padrao === 'Sem garantia' ? `só a legal (${GARANTIA_LEGAL_DIAS} dias)` : dados.garantia_padrao || 'prazo padrão da loja'}`,
      ...(dados.descricao ? [`Descrição: ${dados.descricao}`] : []),
    ],
    executar: async () => {
      const ignoradas = await salvarServico(dados, atual?.id_servico);
      avisarGravacao();
      return {
        ok: true,
        mensagem: atual ? 'Serviço alterado.' : 'Serviço criado.',
        ...(ignoradas.length ? { campos_nao_salvos: ignoradas } : {}),
      };
    },
  };
}

const FERRAMENTAS: Record<string, (args: Record<string, any>, ctx: ContextoFerramenta) => Promise<ResultadoFerramenta>> = {
  abrir_tela: async (args, ctx) => {
    const destino = TELAS[String(args.tela)];
    if (!destino) throw new Error('Tela desconhecida.');
    ctx.abrirTela(destino);
    return { resultado: { ok: true, mensagem: 'Tela aberta.' } };
  },

  listar_formas_pagamento: async (_args, ctx) => {
    exigirPermissao(ctx, 'tela_empresa');
    return { resultado: { formas: (await listarFormasPagamento()).map(resumoForma) } };
  },

  salvar_forma_pagamento: async (args, ctx) => {
    exigirPermissao(ctx, 'tela_empresa');
    return { confirmar: await prepararFormaPagamento(args) };
  },

  criar_formas_pagamento_padrao: async (_args, ctx) => {
    exigirPermissao(ctx, 'tela_empresa');
    const existentes = await listarFormasPagamento();
    const faltantes = formasPadraoFaltantes(existentes);
    if (faltantes.length === 0) return { resultado: { ok: true, mensagem: 'A conta já tem todas as formas nativas.' } };
    return {
      confirmar: {
        titulo: 'Criar formas de pagamento padrão',
        linhas: faltantes.map(({ dados }) => `${dados.nome}: taxa ${pct(dados.taxa_percentual)}${dados.permite_parcelamento ? `, até ${dados.parcelas_max}x` : ''}`),
        executar: async () => {
          await criarFormasPagamentoPadrao(existentes);
          avisarFormasPagamentoAlteradas();
          avisarGravacao();
          return { ok: true, criadas: faltantes.map(({ dados }) => dados.nome) };
        },
      },
    };
  },

  listar_servicos: async (_args, ctx) => {
    exigirPermissao(ctx, 'tela_cadastros');
    return { resultado: { servicos: (await listarServicos()).map(resumoServico) } };
  },

  salvar_servico: async (args, ctx) => {
    exigirPermissao(ctx, 'tela_cadastros');
    return { confirmar: await prepararServico(args) };
  },
};

/** Roda a ferramenta pedida pelo assistente; erros viram resultado (o assistente explica ao usuário). */
export async function rodarFerramenta(
  nome: string,
  args: Record<string, any> | undefined,
  ctx: ContextoFerramenta
): Promise<ResultadoFerramenta> {
  const ferramenta = FERRAMENTAS[nome];
  if (!ferramenta) return { resultado: { erro: `Ferramenta "${nome}" não existe.` } };
  try {
    return await ferramenta(args || {}, ctx);
  } catch (e: any) {
    return { resultado: { erro: e?.message || 'Falha ao executar.' } };
  }
}
