import { supabase } from './supabaseClient';
import { validarSenhaForte } from '../utils/formatadores';
import { GARANTIA_LEGAL_DIAS, STATUS_APAGAM_SENHA } from '../utils/conformidade';

// ==========================================
// 1. ISOLAMENTO DE CONFIGURAÇÕES, TEMA, METAS E IDENTIDADE VISUAL POR CONTA
// ==========================================

export type TemaVisual = 'dark' | 'midnight' | 'light';

/** Formato do comprovante de entrada e da certidão de garantia. */
export type FormatoImpressao = 'A4' | 'A4_DUAS_VIAS' | 'TERMICA_80';

/** Taxas (%) cobradas pela maquininha da loja, usadas na Nova OS. */
/**
 * Taxas (%) de uma maquininha: débito e uma taxa para cada número de parcelas no crédito.
 * credito[0] = 1x, credito[1] = 2x ... O tamanho da lista é o parcelamento máximo da maquininha.
 */
export interface TaxasMaquininha {
  debito: number;
  credito: number[];
}

/** Maior parcelamento que uma maquininha pode ter no sistema. */
export const PARCELAS_LIMITE = 48;

/** Modelos de mensagem de WhatsApp com variáveis {cliente}, {aparelho}, {numero_os}, {valor}, {loja}, {prazo_garantia}. */
export interface MensagensWhatsapp {
  entrada: string;
  orcamento: string;
  pronto: string;
  entrega: string;
}

export interface ConfiguracoesLojaIsolada {
  ownerUserId?: string;
  nomeLoja: string;
  subtitulo: string;
  cnpj: string;
  telefone: string;
  endereco: string;
  logoUrl: string;
  temaVisual: TemaVisual;
  prazoGarantiaDias: number;
  prazoAbandonoDias: number;
  termosGarantiaTexto: string;
  metaFaturamentoMensal?: number;
  historicoMetasMensais?: Record<string, number>;

  // Dados complementares impressos nos documentos
  inscricaoEstadual: string;
  emailAtendimento: string;
  instagram: string;
  horarioFuncionamento: string;
  formatoImpressao: FormatoImpressao;
  exibirPixImpressao: boolean;
  exibirContatosImpressao: boolean;

  // Financeiro
  chavePix: string;
  favorecidoPix: string;
  /** Maquininhas de cartão da loja, cada uma com as taxas do próprio contrato. */
  maquininhas: Maquininha[];
  /** Maquininha que já vem selecionada na Nova OS. */
  maquininhaPadraoId: string;

  // Operacional
  prazoEntregaDiasUteis: number; // 0 = não sugere data prevista
  prefixoOS: string;
  checklistItensAtivos: string[];

  mensagensWhatsapp: MensagensWhatsapp;
}

export interface Maquininha {
  id: string;
  nome: string;
  operadora: string;
  taxas: TaxasMaquininha;
}

/** Valores iniciais de uma maquininha nova (o usuário ajusta conforme o contrato). */
export const TAXAS_MAQUININHA_PADRAO: TaxasMaquininha = {
  debito: 1.49,
  // 1x | 2x-3x | 4x-6x | 7x-12x
  credito: [3.19, 4.89, 4.89, 6.49, 6.49, 6.49, 8.99, 8.99, 8.99, 8.99, 8.99, 8.99],
};

const taxaValida = (v: any, padrao: number) => numeroEntre(v, padrao, 0, 100);

/**
 * Ajusta a tabela de crédito para N parcelas: mantém as taxas existentes e, nas parcelas novas,
 * repete a taxa da última parcela configurada.
 */
export function redimensionarTaxasCredito(credito: number[], parcelasMaximas: number): number[] {
  const n = Math.min(PARCELAS_LIMITE, Math.max(1, Math.floor(parcelasMaximas) || 1));
  const base = credito.length > 0 ? credito : TAXAS_MAQUININHA_PADRAO.credito;
  return Array.from({ length: n }, (_, i) => base[i] ?? base[base.length - 1]);
}

/** Operadoras para identificar a maquininha (só o nome; as taxas são as do contrato do usuário). */
export const OPERADORAS_MAQUININHA = [
  'InfinitePay',
  'Ton',
  'Mercado Pago',
  'Stone',
  'PagBank',
  'SumUp',
  'Cielo',
  'Rede',
  'Getnet',
  'Sicredi',
  'Outra',
];

/** Tabela salva: formato atual (uma taxa por parcela) ou o anterior por faixas (1x, 2-3x, 4-6x, 7-12x). */
const normalizarTaxas = (taxas: any): TaxasMaquininha => {
  const padrao = TAXAS_MAQUININHA_PADRAO;
  const debito = taxaValida(taxas?.debito, padrao.debito);
  if (Array.isArray(taxas?.credito) && taxas.credito.length > 0) {
    const credito = taxas.credito.slice(0, PARCELAS_LIMITE).map((v: any, i: number) => taxaValida(v, padrao.credito[i] ?? 0));
    return { debito, credito };
  }
  const faixa = (chave: string, i: number) => taxaValida(taxas?.[chave], padrao.credito[i]);
  const credito = Array.from({ length: 12 }, (_, i) => {
    const parcela = i + 1;
    if (parcela === 1) return faixa('credito1x', 0);
    if (parcela <= 3) return faixa('credito2a3', 1);
    if (parcela <= 6) return faixa('credito4a6', 3);
    return faixa('credito7a12', 6);
  });
  return { debito, credito };
};

/** Maquininha nova com as taxas iniciais. */
export const criarMaquininha = (nome: string, operadora = ''): Maquininha => ({
  id: `maq_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  nome,
  operadora,
  taxas: { debito: TAXAS_MAQUININHA_PADRAO.debito, credito: [...TAXAS_MAQUININHA_PADRAO.credito] },
});

// {numero_os} já traz o prefixo da OS (ex.: OS-128584), então o texto não repete "OS".
export const MENSAGENS_WHATSAPP_PADRAO: MensagensWhatsapp = {
  entrada:
    'Olá {cliente}, recebemos seu {aparelho} na {loja}. Número da ordem de serviço: {numero_os}. Assim que o diagnóstico ficar pronto, avisaremos por aqui.',
  orcamento:
    'Olá {cliente}, o diagnóstico do seu {aparelho} (ordem {numero_os}) foi concluído. O valor ficou em {valor}. Podemos seguir com o reparo?',
  pronto:
    'Boas notícias, {cliente}! Seu {aparelho} (ordem {numero_os}) já está pronto para retirada na {loja}.',
  entrega:
    'Obrigado pela preferência, {cliente}! Seu {aparelho} foi entregue com garantia de {prazo_garantia} dias. Qualquer dúvida, é só chamar a {loja}.',
};

// Primeira versão dos modelos (repetia "OS #OS-..."): quem não editou o texto recebe a versão corrigida
const MENSAGENS_WHATSAPP_ANTIGAS: Partial<MensagensWhatsapp> = {
  entrada:
    'Olá {cliente}, recebemos seu {aparelho} na {loja} (OS #{numero_os}). Assim que o diagnóstico ficar pronto, avisaremos por aqui.',
  orcamento:
    'Olá {cliente}, o diagnóstico do seu {aparelho} (OS #{numero_os}) foi concluído. O valor ficou em {valor}. Podemos seguir com o reparo?',
  pronto: 'Boas notícias, {cliente}! Seu {aparelho} (OS #{numero_os}) já está pronto para retirada na {loja}.',
};

const modeloMensagem = (chave: keyof MensagensWhatsapp, salvo?: string) =>
  !salvo || salvo === MENSAGENS_WHATSAPP_ANTIGAS[chave] ? MENSAGENS_WHATSAPP_PADRAO[chave] : salvo;

const ITENS_CHECKLIST_PADRAO = [
  'ligando', 'touchScreen', 'display', 'cameraTraseira', 'cameraFrontal', 'microfone',
  'altoFalante', 'conectorCarga', 'bateria', 'wifi', 'bluetooth', 'botoesLaterais', 'faceId', 'carcaca',
];

const FORMATOS_IMPRESSAO: FormatoImpressao[] = ['A4', 'A4_DUAS_VIAS', 'TERMICA_80'];

/** Prefixo do número da OS: letras, números e hífen, até 6 caracteres (padrão "OS-"). */
export function normalizarPrefixoOS(valor: any): string {
  const limpo = String(valor ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 6);
  return limpo || 'OS-';
}

const numeroEntre = (valor: any, padrao: number, min: number, max: number) => {
  const n = Number(valor);
  return Number.isFinite(n) && n >= min && n <= max ? n : padrao;
};

/**
 * Completa uma configuração salva com os valores padrão dos campos novos ou ausentes
 * (contas antigas não têm taxas, mensagens, checklist...), sem perder o que já foi gravado.
 */
function completarConfigLoja(cfgEntrada: Partial<ConfiguracoesLojaIsolada>, padrao: ConfiguracoesLojaIsolada): ConfiguracoesLojaIsolada {
  // Versão anterior tinha uma única tabela (taxasMaquininha): vira a "Maquininha principal"
  const { taxasMaquininha: taxasLegadas, ...cfg } = cfgEntrada as Partial<ConfiguracoesLojaIsolada> & {
    taxasMaquininha?: Partial<TaxasMaquininha>;
  };
  const mensagens: Partial<MensagensWhatsapp> = cfg.mensagensWhatsapp || {};

  let maquininhas: Maquininha[] = (Array.isArray(cfg.maquininhas) ? cfg.maquininhas : [])
    .filter((m) => m && typeof m.id === 'string' && m.id)
    .map((m) => ({
      id: m.id,
      nome: String(m.nome || '').trim() || 'Maquininha',
      operadora: String(m.operadora || ''),
      taxas: normalizarTaxas(m.taxas),
    }));
  if (maquininhas.length === 0) {
    maquininhas = [{ id: 'principal', nome: 'Maquininha principal', operadora: '', taxas: normalizarTaxas(taxasLegadas) }];
  }
  const maquininhaPadraoId = maquininhas.some((m) => m.id === cfg.maquininhaPadraoId)
    ? (cfg.maquininhaPadraoId as string)
    : maquininhas[0].id;

  return {
    ...padrao,
    ...cfg,
    maquininhas,
    maquininhaPadraoId,
    formatoImpressao: FORMATOS_IMPRESSAO.includes(cfg.formatoImpressao as FormatoImpressao)
      ? (cfg.formatoImpressao as FormatoImpressao)
      : 'A4',
    exibirPixImpressao: cfg.exibirPixImpressao ?? padrao.exibirPixImpressao,
    exibirContatosImpressao: cfg.exibirContatosImpressao ?? padrao.exibirContatosImpressao,
    // Nunca abaixo da garantia legal (CDC, arts. 24 e 26)
    prazoGarantiaDias: numeroEntre(cfg.prazoGarantiaDias, padrao.prazoGarantiaDias, GARANTIA_LEGAL_DIAS, 3650),
    prazoAbandonoDias: numeroEntre(cfg.prazoAbandonoDias, padrao.prazoAbandonoDias, 1, 3650),
    prazoEntregaDiasUteis: Math.floor(numeroEntre(cfg.prazoEntregaDiasUteis, padrao.prazoEntregaDiasUteis, 0, 120)),
    prefixoOS: normalizarPrefixoOS(cfg.prefixoOS),
    checklistItensAtivos: Array.isArray(cfg.checklistItensAtivos) ? cfg.checklistItensAtivos : padrao.checklistItensAtivos,
    mensagensWhatsapp: {
      entrada: modeloMensagem('entrada', mensagens.entrada),
      orcamento: modeloMensagem('orcamento', mensagens.orcamento),
      pronto: modeloMensagem('pronto', mensagens.pronto),
      entrega: modeloMensagem('entrega', mensagens.entrega),
    },
  };
}

export const TERMOS_GARANTIA_PADRAO = `1. A garantia cobre o serviço executado e as peças substituídas discriminados nesta ordem de serviço, pelo prazo indicado acima, contado da entrega do aparelho (CDC, art. 26).
2. Não são cobertos defeitos causados após a entrega por quedas, trincos, pressão, contato com líquidos, violação dos selos de segurança ou reparo feito por terceiros.
3. Recomendamos fazer backup dos dados antes do reparo. Se o serviço exigir apagar dados do aparelho, o cliente será avisado antes da execução.
4. Peças usadas, recondicionadas ou não originais só são empregadas com autorização do cliente (CDC, arts. 21 e 70).`;

const CHAVE_USUARIO_ATIVO = 'montec_active_user_json';
const PREFIXO_CONFIG_CONTA = 'sig_apple_configs_user_';
const CHAVE_ESPELHO_SESSAO = 'sig_apple_configs';
export const META_FATURAMENTO_PADRAO = 8000;

/**
 * Normaliza qualquer valor de tema salvo para um dos três temas suportados ('dark' | 'midnight' | 'light').
 */
export function normalizarTemaVisual(tema?: any): TemaVisual {
  const valor = String(tema || '').toLowerCase().trim();
  if (valor === 'light' || valor === 'claro' || valor === 'branco') return 'light';
  if (valor === 'dark' || valor === 'escuro') return 'dark';
  return 'midnight';
}

/**
 * Aplica imediatamente o tema visual no elemento raiz (<html> e <body>),
 * atualizando atributos data-theme, classes CSS e color-scheme nativo do navegador.
 */
export function aplicarTemaVisualNoDOM(tema?: any): TemaVisual {
  const temaFinal = normalizarTemaVisual(tema);
  try {
    if (typeof document !== 'undefined' && document.documentElement) {
      const root = document.documentElement;
      root.setAttribute('data-theme', temaFinal);
      root.classList.remove('theme-light', 'theme-dark', 'theme-midnight', 'light', 'dark');
      root.classList.add(`theme-${temaFinal}`, temaFinal === 'light' ? 'light' : 'dark');
      root.style.colorScheme = temaFinal === 'light' ? 'light' : 'dark';

      if (document.body) {
        document.body.setAttribute('data-theme', temaFinal);
        document.body.classList.remove('theme-light', 'theme-dark', 'theme-midnight', 'light', 'dark');
        document.body.classList.add(`theme-${temaFinal}`, temaFinal === 'light' ? 'light' : 'dark');
      }
    }
  } catch (e) {
    console.error('Erro ao aplicar tema visual no DOM:', e);
  }
  return temaFinal;
}

/**
 * Sanitiza um valor numérico de meta financeira salvo, garantindo número >= 0 finito.
 */
function sanitizarNumeroMeta(valor: any): number {
  if (valor === null || valor === undefined || valor === '') return 0;
  const num = Number(valor);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100) / 100;
}

function sanitizarHistoricoMetas(raw: any): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const resultado: Record<string, number> = {};
  for (const [chave, val] of Object.entries(raw)) {
    if (/^\d{4}-\d{2}$/.test(chave)) {
      const num = sanitizarNumeroMeta(val);
      if (num > 0) {
        resultado[chave] = num;
      }
    }
  }
  return resultado;
}

/**
 * Retorna a estrutura de configuração padrão limpa para uma conta,
 * sem herdar absolutamente nenhuma logo, tema, meta ou dado privado de outra conta.
 */
export function obterConfigPadraoConta(user?: any): ConfiguracoesLojaIsolada {
  const meta = user?.user_metadata || {};
  return {
    ownerUserId: user?.id || '',
    nomeLoja: meta.nome_assistencia || 'Minha Assistência',
    subtitulo: 'Assistência Técnica',
    cnpj: meta.cpf_cnpj || '',
    telefone: meta.whatsapp || '',
    endereco: '',
    logoUrl: '',
    temaVisual: 'midnight',
    prazoGarantiaDias: 90,
    prazoAbandonoDias: 90,
    termosGarantiaTexto: TERMOS_GARANTIA_PADRAO,
    metaFaturamentoMensal: META_FATURAMENTO_PADRAO,
    historicoMetasMensais: {},
    inscricaoEstadual: '',
    emailAtendimento: user?.email || '',
    instagram: '',
    horarioFuncionamento: '',
    formatoImpressao: 'A4',
    exibirPixImpressao: false,
    exibirContatosImpressao: true,
    chavePix: '',
    favorecidoPix: '',
    maquininhas: [
      {
        id: 'principal',
        nome: 'Maquininha principal',
        operadora: '',
        taxas: { debito: TAXAS_MAQUININHA_PADRAO.debito, credito: [...TAXAS_MAQUININHA_PADRAO.credito] },
      },
    ],
    maquininhaPadraoId: 'principal',
    prazoEntregaDiasUteis: 0,
    prefixoOS: 'OS-',
    checklistItensAtivos: [...ITENS_CHECKLIST_PADRAO],
    mensagensWhatsapp: { ...MENSAGENS_WHATSAPP_PADRAO },
  };
}

/**
 * Identifica de forma síncrona o usuário autenticado na sessão atual.
 */
export function obterUsuarioAtivoSincrono(userParam?: any): any | null {
  if (userParam && userParam.id) {
    return userParam;
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const salvo = window.localStorage.getItem(CHAVE_USUARIO_ATIVO);
      if (salvo) {
        const parsed = JSON.parse(salvo);
        if (parsed && parsed.id) return parsed;
      }
      // Fallback: verifica token de sessão nativo do Supabase no localStorage
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
          const rawSession = window.localStorage.getItem(k);
          if (rawSession) {
            const parsedSession = JSON.parse(rawSession);
            const sessionUser = parsedSession?.user || parsedSession?.currentSession?.user;
            if (sessionUser && sessionUser.id) {
              return sessionUser;
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('Erro ao obter usuário ativo síncrono:', e);
  }
  return null;
}

/**
 * Registra o usuário autenticado atual, sincroniza o espelho de sessão de forma isolada
 * e aplica imediatamente o tema visual exclusivo da conta.
 */
export function sincronizarSessaoConfiguracoesLoja(user: any | null): ConfiguracoesLojaIsolada {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (!user || !user.id) {
        window.localStorage.removeItem(CHAVE_USUARIO_ATIVO);
        window.localStorage.removeItem(CHAVE_ESPELHO_SESSAO);
        const padraoDeslogado = obterConfigPadraoConta(null);
        aplicarTemaVisualNoDOM(padraoDeslogado.temaVisual);
        window.dispatchEvent(new Event('storage_configs_updated'));
        return padraoDeslogado;
      }

      window.localStorage.setItem(
        CHAVE_USUARIO_ATIVO,
        JSON.stringify({
          id: user.id,
          email: user.email,
          user_metadata: user.user_metadata || {},
        })
      );

      const configConta = obterConfiguracoesLojaSincrono(user);
      gravarEspelhoSessao(configConta);
      aplicarTemaVisualNoDOM(configConta.temaVisual);
      window.dispatchEvent(new Event('storage_configs_updated'));
      return configConta;
    }
  } catch (e) {
    console.error('Erro ao sincronizar sessão de configurações:', e);
  }
  const padrao = obterConfigPadraoConta(user);
  aplicarTemaVisualNoDOM(padrao.temaVisual);
  return padrao;
}

/**
 * Lê de forma síncrona e estritamente isolada as configurações da conta autenticada.
 * Jamais retorna dados, tema, meta ou logo pertencentes a outro userId.
 */
/** Espelho da sessão (compatibilidade): sem o logotipo, que fica só no cofre da conta. */
function gravarEspelhoSessao(cfg: Partial<ConfiguracoesLojaIsolada>) {
  try {
    window.localStorage.setItem(CHAVE_ESPELHO_SESSAO, JSON.stringify({ ...cfg, logoUrl: '' }));
  } catch (e) {
    console.warn('Não foi possível atualizar o espelho das configurações:', e);
  }
}

/** Grava no armazenamento do navegador com mensagem clara quando o espaço acaba. */
function gravarLocal(chave: string, valor: string) {
  try {
    window.localStorage.setItem(chave, valor);
  } catch (e: any) {
    if (e?.name === 'QuotaExceededError' || /quota/i.test(String(e?.message))) {
      throw new Error('O armazenamento do navegador está cheio. Use um logotipo menor e tente novamente.');
    }
    throw e;
  }
}

// Leitura das configurações é chamada muitas vezes por tela: guarda o último resultado e só
// recalcula quando o cofre da conta ou os metadados mudam.
let cacheConfig: { chave: string; config: ConfiguracoesLojaIsolada } | null = null;

export function obterConfiguracoesLojaSincrono(userParam?: any): ConfiguracoesLojaIsolada {
  const user = obterUsuarioAtivoSincrono(userParam);
  const padrao = obterConfigPadraoConta(user);

  if (!user || !user.id) {
    return padrao;
  }

  const chaveConta = `${PREFIXO_CONFIG_CONTA}${user.id}`;
  const metaConfig = user.user_metadata?.configuracoes_loja;

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      // 1. Verifica cofre exclusivo desta conta no localStorage
      const rawConta = window.localStorage.getItem(chaveConta);
      const chaveCache = rawConta ? `${user.id}|${metaConfig ? JSON.stringify(metaConfig) : ''}|${rawConta}` : '';
      if (rawConta && cacheConfig?.chave === chaveCache) return cacheConfig.config;
      if (rawConta) {
        const parsedConta = JSON.parse(rawConta);
        if (!parsedConta.ownerUserId || parsedConta.ownerUserId === user.id) {
          const metaRemotaValida =
            metaConfig && (!metaConfig.ownerUserId || metaConfig.ownerUserId === user.id) ? metaConfig : {};
          const mesclado: ConfiguracoesLojaIsolada = completarConfigLoja({
            ...metaRemotaValida,
            ...parsedConta,
            ownerUserId: user.id,
            temaVisual: normalizarTemaVisual(parsedConta.temaVisual ?? metaRemotaValida?.temaVisual ?? padrao.temaVisual),
            termosGarantiaTexto: parsedConta.termosGarantiaTexto || padrao.termosGarantiaTexto,
            metaFaturamentoMensal: sanitizarNumeroMeta(
              parsedConta.metaFaturamentoMensal ?? metaRemotaValida?.metaFaturamentoMensal ?? 0
            ),
            historicoMetasMensais: {
              ...sanitizarHistoricoMetas(metaRemotaValida?.historicoMetasMensais),
              ...sanitizarHistoricoMetas(parsedConta.historicoMetasMensais),
            },
          }, padrao);
          cacheConfig = { chave: chaveCache, config: mesclado };
          return mesclado;
        }
      }

      // 2. Se não houver cofre local ainda, mas houver configuracoes_loja salvas no user_metadata da conta no Supabase
      if (metaConfig && typeof metaConfig === 'object') {
        if (!metaConfig.ownerUserId || metaConfig.ownerUserId === user.id) {
          const restaurado: ConfiguracoesLojaIsolada = completarConfigLoja({
            ...metaConfig,
            ownerUserId: user.id,
            temaVisual: normalizarTemaVisual(metaConfig.temaVisual ?? padrao.temaVisual),
            termosGarantiaTexto: metaConfig.termosGarantiaTexto || padrao.termosGarantiaTexto,
            metaFaturamentoMensal: sanitizarNumeroMeta(metaConfig.metaFaturamentoMensal ?? 0),
            historicoMetasMensais: sanitizarHistoricoMetas(metaConfig.historicoMetasMensais),
          }, padrao);
          window.localStorage.setItem(chaveConta, JSON.stringify(restaurado));
          gravarEspelhoSessao(restaurado);
          return restaurado;
        }
      }

      // 3. Migração segura para contas pré-existentes
      const rawLegado = window.localStorage.getItem(CHAVE_ESPELHO_SESSAO);
      if (rawLegado) {
        const legado = JSON.parse(rawLegado);
        if (legado && !legado.ownerUserId) {
          const nomeAssistenciaUsuario = String(user.user_metadata?.nome_assistencia || '').trim().toLowerCase();
          const nomeLojaLegado = String(legado.nomeLoja || '').trim().toLowerCase();
          if (nomeAssistenciaUsuario && nomeLojaLegado && nomeAssistenciaUsuario === nomeLojaLegado) {
            const migrado: ConfiguracoesLojaIsolada = completarConfigLoja({
              ...legado,
              ownerUserId: user.id,
              temaVisual: normalizarTemaVisual(legado.temaVisual ?? padrao.temaVisual),
              metaFaturamentoMensal: sanitizarNumeroMeta(legado.metaFaturamentoMensal ?? 0),
              historicoMetasMensais: sanitizarHistoricoMetas(legado.historicoMetasMensais),
            }, padrao);
            window.localStorage.setItem(chaveConta, JSON.stringify(migrado));
            gravarEspelhoSessao(migrado);
            return migrado;
          }
        }
      }

      // 4. Conta sem configurações personalizadas prévias: inicializa cofre limpo da conta
      window.localStorage.setItem(chaveConta, JSON.stringify(padrao));
      gravarEspelhoSessao(padrao);
    }
  } catch (e) {
    console.error('Erro ao obter configurações isoladas da loja:', e);
  }

  return padrao;
}

/**
 * Carrega as configurações da loja validando a autenticação e a autorização da conta no Supabase.
 * Bloqueia qualquer tentativa de consultar configurações de outro usuário (targetUserId divergente).
 */
export async function carregarConfiguracoesLoja(targetUserId?: string): Promise<ConfiguracoesLojaIsolada> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user || obterUsuarioAtivoSincrono();

  if (authError || !user || !user.id) {
    throw new Error('Não autorizado: é necessário estar autenticado para acessar as configurações da loja.');
  }

  if (targetUserId && targetUserId !== user.id) {
    throw new Error('Acesso negado: não é permitido acessar as configurações de outra conta.');
  }

  return sincronizarSessaoConfiguracoesLoja(user);
}

/**
 * Salva as configurações, o tema, a meta financeira e a logo exclusivamente na conta autenticada.
 * Aplica o tema visual imediatamente e bloqueia qualquer tentativa de modificar configurações de outra conta.
 */
export async function salvarConfiguracoesLoja(
  novaConfig: Partial<ConfiguracoesLojaIsolada>,
  targetUserId?: string
): Promise<ConfiguracoesLojaIsolada> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user || obterUsuarioAtivoSincrono();

  if (authError || !user || !user.id) {
    throw new Error('Não autorizado: faça login para salvar as configurações da loja.');
  }

  if (targetUserId && targetUserId !== user.id) {
    throw new Error('Acesso negado: não é permitido modificar as configurações de outra conta.');
  }

  if (novaConfig.ownerUserId && novaConfig.ownerUserId !== user.id) {
    throw new Error('Acesso negado: tentativa de gravar configurações vinculadas a outro usuário.');
  }

  const configAtual = obterConfiguracoesLojaSincrono(user);
  const temaEscolhido = normalizarTemaVisual(
    novaConfig.temaVisual !== undefined ? novaConfig.temaVisual : configAtual.temaVisual
  );

  const metaMensalFinal =
    novaConfig.metaFaturamentoMensal !== undefined
      ? sanitizarNumeroMeta(novaConfig.metaFaturamentoMensal)
      : sanitizarNumeroMeta(configAtual.metaFaturamentoMensal);

  const historicoMetasFinal = {
    ...sanitizarHistoricoMetas(configAtual.historicoMetasMensais),
    ...sanitizarHistoricoMetas(novaConfig.historicoMetasMensais),
  };

  const configFinal: ConfiguracoesLojaIsolada = completarConfigLoja(
    {
      ...configAtual,
      ...novaConfig,
      temaVisual: temaEscolhido,
      metaFaturamentoMensal: metaMensalFinal,
      historicoMetasMensais: historicoMetasFinal,
      ownerUserId: user.id,
    },
    obterConfigPadraoConta(user)
  );

  // Aplica imediatamente o tema no DOM
  aplicarTemaVisualNoDOM(configFinal.temaVisual);

  const chaveConta = `${PREFIXO_CONFIG_CONTA}${user.id}`;
  if (typeof window !== 'undefined' && window.localStorage) {
    // O logotipo é gravado uma única vez (no cofre da conta); antes ia em 3 cópias e estourava o espaço
    gravarLocal(chaveConta, JSON.stringify(configFinal));
    gravarEspelhoSessao(configFinal);
    const { logoUrl: _logoSessao, ...configSemLogoSessao } = configFinal;
    gravarLocal(
      CHAVE_USUARIO_ATIVO,
      JSON.stringify({
        id: user.id,
        email: user.email,
        user_metadata: {
          ...(user.user_metadata || {}),
          nome_assistencia: configFinal.nomeLoja,
          whatsapp: configFinal.telefone,
          cpf_cnpj: configFinal.cnpj,
          configuracoes_loja: configSemLogoSessao,
        },
      })
    );
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('storage_configs_updated'));
  }

  // Persiste nos metadados exclusivos do usuário autenticado no Supabase.
  // O user_metadata vai dentro do token JWT enviado em TODA requisição: a logo (base64)
  // nunca pode ir para lá, senão o cabeçalho estoura e o navegador falha com ERR_HTTP2_PROTOCOL_ERROR.
  const { logoUrl: _logoLocal, ...configSemLogo } = configFinal;
  const { data: updateData, error: updateError } = await supabase.auth.updateUser({
    data: {
      nome_assistencia: configFinal.nomeLoja,
      whatsapp: configFinal.telefone,
      cpf_cnpj: configFinal.cnpj,
      configuracoes_loja: configSemLogo,
    },
  });

  if (updateError) {
    console.warn('Aviso ao sincronizar configurações na nuvem:', updateError.message);
  } else if (updateData?.user && typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(
      CHAVE_USUARIO_ATIVO,
      JSON.stringify({
        id: updateData.user.id,
        email: updateData.user.email,
        user_metadata: updateData.user.user_metadata || {},
      })
    );
  }

  return configFinal;
}

/** Maquininha pelo id; sem id (ou id removido), a maquininha padrão da conta. */
export function obterMaquininha(maquininhaId?: string): Maquininha {
  const cfg = obterConfiguracoesLojaSincrono();
  return (
    cfg.maquininhas.find((m) => m.id === maquininhaId) ||
    cfg.maquininhas.find((m) => m.id === cfg.maquininhaPadraoId) ||
    cfg.maquininhas[0]
  );
}

/**
 * Taxa (%) da maquininha escolhida (ou da padrão) para a forma de pagamento e o número de parcelas.
 * Dinheiro, PIX e formas desconhecidas não têm taxa.
 */
export function obterTaxaMaquininha(forma: string, parcelas: number = 1, maquininhaId?: string): number {
  const taxas = normalizarTaxas(obterMaquininha(maquininhaId).taxas);
  if (forma === 'Cartão de débito') return taxas.debito;
  if (forma === 'Cartão de crédito') {
    const indice = Math.min(Math.max(1, Math.floor(parcelas) || 1), taxas.credito.length) - 1;
    return taxas.credito[indice] ?? 0;
  }
  return 0;
}

/** Parcelamento máximo no crédito da maquininha (tamanho da tabela de taxas). */
export const parcelasMaximasMaquininha = (maquininhaId?: string) =>
  normalizarTaxas(obterMaquininha(maquininhaId).taxas).credito.length;

/** Taxas sempre no formato atual (uma por parcela), mesmo vindas de uma configuração antiga em memória. */
export const normalizarTaxasMaquininha = (taxas: any): TaxasMaquininha => normalizarTaxas(taxas);

/** Data (AAAA-MM-DD) somando dias úteis (segunda a sexta) a partir de hoje. */
export function calcularDataPrevistaEntrega(diasUteis: number, base: Date = new Date()): string {
  const data = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12);
  let restantes = Math.max(0, Math.floor(diasUteis));
  while (restantes > 0) {
    data.setDate(data.getDate() + 1);
    const diaSemana = data.getDay();
    if (diaSemana !== 0 && diaSemana !== 6) restantes--;
  }
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

/** Troca as variáveis {cliente}, {aparelho}, {numero_os}, {valor}, {loja} e {prazo_garantia} de um modelo de mensagem. */
export function preencherModeloMensagem(modelo: string, variaveis: Record<string, string>): string {
  return modelo.replace(/\{(\w+)\}/g, (trecho, nome) => (nome in variaveis ? variaveis[nome] : trecho));
}

/** Valores das variáveis de mensagem a partir de uma OS real e da configuração da loja. */
export function variaveisMensagemOS(os: any, cfg: ConfiguracoesLojaIsolada = obterConfiguracoesLojaSincrono()) {
  const valor = Number(os?.orcamentoCalculado?.valorTotalOrcamento ?? os?.valor_total ?? 0);
  return {
    cliente: String(os?.cliente?.nome || 'cliente').trim(),
    aparelho: String(os?.aparelho?.modelo || 'aparelho').trim(),
    numero_os: String(os?.numero_os || ''),
    valor: valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
    loja: cfg.nomeLoja,
    prazo_garantia: String(
      Math.max(GARANTIA_LEGAL_DIAS, os?.possuiGarantia === false ? 0 : Number(os?.prazoGarantiaDias) || cfg.prazoGarantiaDias)
    ),
  };
}

/**
 * Link do WhatsApp (wa.me) com a mensagem pronta. Telefones brasileiros com DDD (10 ou 11 dígitos)
 * recebem o código do país 55. Retorna null se o número for inválido.
 */
export function linkWhatsapp(telefone: string, mensagem: string): string | null {
  let digitos = String(telefone || '').replace(/\D/g, '');
  if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`;
  if (digitos.length < 12 || digitos.length > 13) return null;
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensagem)}`;
}

// ==========================================
// 1.1 GESTÃO E APURAÇÃO DE METAS FINANCEIRAS MENSAIS (DASHBOARD & RELATÓRIOS)
// ==========================================

export interface ValidacaoValorMonetario {
  valido: boolean;
  valor: number;
  erro?: string;
}

export interface ResumoMetaFinanceira {
  competencia: string; // 'YYYY-MM'
  rotuloCompetencia: string; // Ex.: 'outubro de 2026'
  metaConfigurada: boolean;
  metaDefinida: number;
  valorAlcancado: number;
  percentualAtingido: number; // Percentual real (pode ultrapassar 100%, ex: 125.5)
  percentualBarraVisual: number; // Limitado entre 0 e 100 apenas para a largura CSS da barra
  valorRestante: number;
  valorExcedente: number;
  metaBatida: boolean;
  quantidadeOrdensPeriodo: number;
}

/**
 * Retorna a chave de competência mensal no formato 'YYYY-MM'.
 */
export function obterChaveCompetenciaMensal(dataReferencia: Date = new Date()): string {
  const ano = dataReferencia.getFullYear();
  const mes = String(dataReferencia.getMonth() + 1).padStart(2, '0');
  return `${ano}-${mes}`;
}

/**
 * Formata uma chave 'YYYY-MM' em rótulo legível em português (ex.: 'Outubro de 2026').
 */
export function formatarRotuloCompetenciaMensal(competencia?: string): string {
  const chave = competencia && /^\d{4}-\d{2}$/.test(competencia) ? competencia : obterChaveCompetenciaMensal();
  const [anoStr, mesStr] = chave.split('-');
  const nomesMeses = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];
  const idx = Math.max(0, Math.min(11, Number(mesStr) - 1));
  return `${nomesMeses[idx]} de ${anoStr}`;
}

/**
 * Extrai com precisão a competência 'YYYY-MM' da data de abertura de uma OS,
 * evitando deslocamentos indevidos de fuso horário.
 */
/** Ordens que entram no faturamento: rascunhos e canceladas não são receita. */
export const contaNoFaturamento = (os: any) => {
  const status = String(os?.status_os || '').toUpperCase();
  return status !== 'RASCUNHO' && status !== 'CANCELADO';
};

/** Data local AAAA-MM-DD de uma data da OS (com horário, converte para o fuso do computador). */
export function diaLocalDaData(dataInput: any): string {
  if (!dataInput) return '';
  const str = String(dataInput).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function extrairCompetenciaDeDataOS(dataInput: any): string | null {
  if (!dataInput) return null;
  if (typeof dataInput === 'string') {
    const str = dataInput.trim();
    const matchIso = str.match(/^(\d{4})-(\d{2})/);
    if (matchIso && !str.includes('T')) {
      return `${matchIso[1]}-${matchIso[2]}`;
    }
    const matchBr = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (matchBr) {
      return `${matchBr[3]}-${matchBr[2]}`;
    }
  }
  const dt = dataInput instanceof Date ? dataInput : new Date(dataInput);
  if (isNaN(dt.getTime())) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Filtra as Ordens de Serviço pertencentes exclusivamente à competência mensal informada ('YYYY-MM').
 */
export function filtrarOrdensPorCompetenciaMensal(ordens: any[], competencia?: string): any[] {
  if (!Array.isArray(ordens)) return [];
  const chaveAlvo =
    competencia && /^\d{4}-\d{2}$/.test(competencia) ? competencia : obterChaveCompetenciaMensal();

  return ordens.filter((os) => {
    const dataRaw = os?.data_abertura || os?.dataAbertura;
    const compOS = extrairCompetenciaDeDataOS(dataRaw);
    return compOS === chaveAlvo;
  });
}

/**
 * Calcula o faturamento bruto total de uma lista de Ordens de Serviço,
 * utilizando exatamente a mesma regra financeira dos Relatórios e do Dashboard.
 */
export function calcularFaturamentoBrutoOrdens(ordens: any[]): number {
  if (!Array.isArray(ordens)) return 0;
  const soma = ordens.reduce((acc, os) => {
    const valor = Number(os?.orcamentoCalculado?.valorTotalOrcamento ?? os?.valor_total ?? 0);
    return acc + (Number.isFinite(valor) ? valor : 0);
  }, 0);
  return Math.round(soma * 100) / 100;
}

/**
 * Valida e converte entradas monetárias no formato brasileiro (ex.: "R$ 10.000,00", "1.500,50", "8000")
 * ou numérico. Impede valores vazios, negativos, iguais a zero ou inválidos.
 */
export function parsearValorMonetarioBR(entrada: any): ValidacaoValorMonetario {
  if (entrada === null || entrada === undefined) {
    return { valido: false, valor: 0, erro: 'Informe um valor para a meta financeira.' };
  }

  if (typeof entrada === 'number') {
    if (!Number.isFinite(entrada)) {
      return { valido: false, valor: 0, erro: 'Valor numérico inválido para a meta.' };
    }
    if (entrada < 0) {
      return { valido: false, valor: 0, erro: 'A meta financeira não pode ser negativa.' };
    }
    if (entrada === 0) {
      return { valido: false, valor: 0, erro: 'A meta financeira deve ser maior que R$ 0,00.' };
    }
    return { valido: true, valor: Math.round(entrada * 100) / 100 };
  }

  const textoOriginal = String(entrada).trim();
  if (!textoOriginal) {
    return { valido: false, valor: 0, erro: 'Informe um valor para a meta financeira.' };
  }

  // Remove símbolo R$ e espaços
  const semSimbolo = textoOriginal.replace(/R\$/gi, '').replace(/\s+/g, '');
  if (!semSimbolo) {
    return { valido: false, valor: 0, erro: 'Informe um valor para a meta financeira.' };
  }

  // Verifica sinal negativo
  if (semSimbolo.startsWith('-')) {
    return { valido: false, valor: 0, erro: 'A meta financeira não pode ser negativa.' };
  }

  // Permite apenas dígitos, pontos e vírgulas
  if (!/^[+]?[\d.,]+$/.test(semSimbolo) || /[.,]{2,}/.test(semSimbolo) || /^[+]?[.,]|[.,]$/.test(semSimbolo)) {
    return {
      valido: false,
      valor: 0,
      erro: 'Formato inválido. Digite apenas números no padrão brasileiro (ex.: 10.000,00).',
    };
  }

  let normalizado = semSimbolo.replace(/^\+/, '');
  const temVirgula = normalizado.includes(',');
  const temPonto = normalizado.includes('.');

  if (temVirgula && temPonto) {
    // Formato brasileiro "10.000,00": pontos são separadores de milhar e a última vírgula é decimal
    const partesVirgula = normalizado.split(',');
    if (partesVirgula.length > 2) {
      return { valido: false, valor: 0, erro: 'Formato monetário inválido.' };
    }
    normalizado = partesVirgula[0].replace(/\./g, '') + '.' + partesVirgula[1];
  } else if (temVirgula) {
    const partesVirgula = normalizado.split(',');
    if (partesVirgula.length > 2) {
      return { valido: false, valor: 0, erro: 'Formato monetário inválido.' };
    }
    normalizado = partesVirgula[0] + '.' + partesVirgula[1];
  } else if (temPonto) {
    const partesPonto = normalizado.split('.');
    // Se tiver mais de um ponto (ex.: "1.000.000") ou exatamente 3 casas após o ponto (ex.: "10.000" milhar brasileiro)
    if (partesPonto.length > 2 || (partesPonto.length === 2 && partesPonto[1].length === 3)) {
      normalizado = normalizado.replace(/\./g, '');
    }
  }

  const numero = Number(normalizado);
  if (!Number.isFinite(numero) || isNaN(numero)) {
    return { valido: false, valor: 0, erro: 'Não foi possível interpretar o valor informado.' };
  }
  if (numero < 0) {
    return { valido: false, valor: 0, erro: 'A meta financeira não pode ser negativa.' };
  }
  if (numero === 0) {
    return { valido: false, valor: 0, erro: 'A meta financeira deve ser maior que R$ 0,00.' };
  }

  return { valido: true, valor: Math.round(numero * 100) / 100 };
}

/**
 * Obtém o valor da meta financeira configurada na conta autenticada para uma competência mensal ('YYYY-MM').
 * Se houver valor específico salvo no histórico daquela competência, utiliza-o;
 * caso contrário, utiliza a meta mensal vigente da conta (ou META_FATURAMENTO_PADRAO se ainda não configurada).
 */
export function obterMetaFinanceiraConta(opcoes?: { competencia?: string; user?: any }): number {
  const cfg = obterConfiguracoesLojaSincrono(opcoes?.user);
  const comp =
    opcoes?.competencia && /^\d{4}-\d{2}$/.test(opcoes.competencia)
      ? opcoes.competencia
      : obterChaveCompetenciaMensal();

  const metaDaCompetencia = cfg.historicoMetasMensais?.[comp];
  if (typeof metaDaCompetencia === 'number' && Number.isFinite(metaDaCompetencia) && metaDaCompetencia > 0) {
    return metaDaCompetencia;
  }

  // Conta que ainda não alterou a meta usa o padrão de R$ 8.000
  const metaMensal = sanitizarNumeroMeta(cfg.metaFaturamentoMensal);
  return metaMensal > 0 ? metaMensal : META_FATURAMENTO_PADRAO;
}

/**
 * Calcula todos os indicadores de acompanhamento da meta financeira para o período mensal:
 * Meta definida, Valor alcançado, Percentual real atingido (sem travar em 100%), Valor restante e Excedente.
 */
export function calcularResumoMetaFinanceira(
  ordens: any[],
  opcoes?: { competencia?: string; metaOverride?: number; user?: any }
): ResumoMetaFinanceira {
  const competencia =
    opcoes?.competencia && /^\d{4}-\d{2}$/.test(opcoes.competencia)
      ? opcoes.competencia
      : obterChaveCompetenciaMensal();

  const ordensDoPeriodo = filtrarOrdensPorCompetenciaMensal(ordens, competencia).filter(contaNoFaturamento);
  const valorAlcancado = calcularFaturamentoBrutoOrdens(ordensDoPeriodo);

  const metaBruta =
    opcoes?.metaOverride !== undefined
      ? sanitizarNumeroMeta(opcoes.metaOverride)
      : obterMetaFinanceiraConta({ competencia, user: opcoes?.user });

  const metaConfigurada = metaBruta > 0;
  const metaDefinida = metaConfigurada ? metaBruta : 0;

  // Cálculo protegido contra divisão por zero e sem limitar o percentual real a 100%
  const percentualAtingido = metaConfigurada
    ? Math.round(((valorAlcancado / metaDefinida) * 100) * 10) / 10
    : 0;

  const percentualBarraVisual = metaConfigurada
    ? Math.min(100, Math.max(0, Math.round((valorAlcancado / metaDefinida) * 100)))
    : 0;

  const valorRestante = metaConfigurada
    ? Math.max(0, Math.round((metaDefinida - valorAlcancado) * 100) / 100)
    : 0;

  const valorExcedente =
    metaConfigurada && valorAlcancado > metaDefinida
      ? Math.round((valorAlcancado - metaDefinida) * 100) / 100
      : 0;

  const metaBatida = metaConfigurada && valorAlcancado >= metaDefinida;

  return {
    competencia,
    rotuloCompetencia: formatarRotuloCompetenciaMensal(competencia),
    metaConfigurada,
    metaDefinida,
    valorAlcancado,
    percentualAtingido,
    percentualBarraVisual,
    valorRestante,
    valorExcedente,
    metaBatida,
    quantidadeOrdensPeriodo: ordensDoPeriodo.length,
  };
}

/**
 * Valida e persiste a meta financeira mensal exclusivamente na conta autenticada,
 * atualizando tanto o histórico da competência quanto a meta mensal padrão da loja.
 */
export async function salvarMetaFinanceiraConta(
  valorEntrada: any,
  opcoes?: { competencia?: string; targetUserId?: string }
): Promise<{ config: ConfiguracoesLojaIsolada; valorSalvo: number; competencia: string }> {
  const validacao = parsearValorMonetarioBR(valorEntrada);
  if (!validacao.valido) {
    throw new Error(validacao.erro || 'Valor de meta financeira inválido.');
  }

  const competencia =
    opcoes?.competencia && /^\d{4}-\d{2}$/.test(opcoes.competencia)
      ? opcoes.competencia
      : obterChaveCompetenciaMensal();

  const cfgAtual = obterConfiguracoesLojaSincrono();
  const novoHistorico: Record<string, number> = {
    ...(cfgAtual.historicoMetasMensais || {}),
    [competencia]: validacao.valor,
  };

  // Se estiver salvando a meta do mês atual (ou se a conta ainda não tinha meta padrão), atualiza também a metaFaturamentoMensal
  const competenciaAtual = obterChaveCompetenciaMensal();
  const novaMetaPadrao =
    competencia === competenciaAtual || !cfgAtual.metaFaturamentoMensal
      ? validacao.valor
      : cfgAtual.metaFaturamentoMensal;

  const configSalva = await salvarConfiguracoesLoja(
    {
      metaFaturamentoMensal: novaMetaPadrao,
      historicoMetasMensais: novoHistorico,
    },
    opcoes?.targetUserId
  );

  return {
    config: configSalva,
    valorSalvo: validacao.valor,
    competencia,
  };
}

// ==========================================
// 2. AUTENTICAÇÃO E GESTÃO DE ACESSO
// ==========================================

export async function fazerLogin(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;

  if (data?.user) {
    sincronizarSessaoConfiguracoesLoja(data.user);
  }
  return data;
}

export async function cadastrarUsuario(dados: {
  email: string;
  password: string;
  nomeResponsavel: string;
  nomeAssistencia: string;
  whatsapp: string;
  cpfCnpj?: string;
}) {
  // Inicializa configurações limpas e exclusivas para a nova conta (sem herdar logo, tema ou meta de nenhuma outra conta)
  const configInicialLimpa: ConfiguracoesLojaIsolada = {
    ...obterConfigPadraoConta({ email: dados.email }),
    ownerUserId: '',
    nomeLoja: dados.nomeAssistencia.trim() || 'Minha Assistência',
    cnpj: dados.cpfCnpj?.trim() || '',
    telefone: dados.whatsapp.trim() || '',
    logoUrl: '', // Sempre vazia para novas contas
  };

  const { data, error } = await supabase.auth.signUp({
    email: dados.email,
    password: dados.password,
    options: {
      data: {
        nome_responsavel: dados.nomeResponsavel,
        nome_assistencia: dados.nomeAssistencia.trim(),
        whatsapp: dados.whatsapp.trim(),
        cpf_cnpj: dados.cpfCnpj?.trim() || '',
        configuracoes_loja: configInicialLimpa,
      },
    },
  });
  if (error) throw error;

  if (data?.user?.id) {
    const configComOwner: ConfiguracoesLojaIsolada = {
      ...configInicialLimpa,
      ownerUserId: data.user.id,
    };

    if (typeof window !== 'undefined' && window.localStorage) {
      // Grava no cofre exclusivo da nova conta
      window.localStorage.setItem(
        `${PREFIXO_CONFIG_CONTA}${data.user.id}`,
        JSON.stringify(configComOwner)
      );

      // Se já iniciou sessão autenticada, atualiza a sessão ativa para a nova conta limpa
      if (data.session) {
        window.localStorage.setItem(
          CHAVE_USUARIO_ATIVO,
          JSON.stringify({
            id: data.user.id,
            email: data.user.email,
            user_metadata: {
              ...(data.user.user_metadata || {}),
              configuracoes_loja: configComOwner,
            },
          })
        );
        gravarEspelhoSessao(configComOwner);
        aplicarTemaVisualNoDOM(configComOwner.temaVisual);
        window.dispatchEvent(new Event('storage_configs_updated'));
      }
    }
  }

  return data;
}

export async function recuperarSenha(email: string) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
  return data;
}

/** Troca a senha da conta autenticada (Supabase Auth). */
export async function alterarSenhaConta(novaSenha: string): Promise<void> {
  const erroSenha = validarSenhaForte(novaSenha || '');
  if (erroSenha) throw new Error(erroSenha);
  const { error } = await supabase.auth.updateUser({ password: novaSenha });
  if (error) {
    const msg = error.message || '';
    if (/different from the old/i.test(msg)) throw new Error('A nova senha precisa ser diferente da atual.');
    if (/reauthentication|recent login/i.test(msg)) throw new Error('Por segurança, saia e entre novamente na conta antes de trocar a senha.');
    throw new Error(msg || 'Não foi possível alterar a senha.');
  }
}

/**
 * Backup somente leitura da conta: configurações, ordens de serviço, clientes, fornecedores e serviços,
 * exatamente como estão no banco. Nada é alterado.
 */
export async function gerarBackupConta() {
  const [ordens, clientes, fornecedores, servicos, { data: authData }] = await Promise.all([
    buscarOrdensServico(),
    buscarClientes(),
    buscarFornecedores(),
    buscarServicosCadastrados(),
    supabase.auth.getUser(),
  ]);
  return {
    geradoEm: new Date().toISOString(),
    conta: authData?.user?.email || '',
    configuracoes: obterConfiguracoesLojaSincrono(),
    ordens_servico: ordens,
    clientes,
    cad_fornecedores: fornecedores,
    cad_servicos: servicos,
  };
}

export async function fazerLogout() {
  const { error } = await supabase.auth.signOut();
  invalidarCacheOrdens();
  cacheConfig = null;
  // Limpa os ponteiros da sessão ativa sem apagar os cofres individuais (`sig_apple_configs_user_<id>`) de cada conta
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(CHAVE_USUARIO_ATIVO);
    window.localStorage.removeItem(CHAVE_ESPELHO_SESSAO);
    aplicarTemaVisualNoDOM('midnight');
    window.dispatchEvent(new Event('storage_configs_updated'));
  }
  if (error) throw error;
}

// ==========================================
// 3. ORÇAMENTO, GARANTIA E AUXILIARES
// ==========================================

/**
 * Converte qualquer representação de prazo de garantia (ex.: 30, "90 dias", "120 dias", "180 dias", "1 ano", "6 meses")
 * em quantidade numérica de dias. Retorna 0 se for "Sem garantia" e null se não houver valor definido.
 */
export function extrairDiasGarantia(valor: any): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'boolean') return valor ? null : 0;
  if (typeof valor === 'number') {
    return Number.isFinite(valor) && valor >= 0 ? Math.floor(valor) : null;
  }
  const str = String(valor).toLowerCase().trim();
  if (!str || str === 'sem padrão' || str === 'sem padrao') return null;
  if (str.includes('sem garantia') || str === '0' || str === '0 dias' || str === 'false') {
    return 0;
  }
  if (str.includes('ano')) {
    const mAno = str.match(/(\d+)/);
    const anos = mAno ? Number(mAno[1]) : 1;
    return anos * 365;
  }
  if (str.includes('mes') || str.includes('mês')) {
    const mMes = str.match(/(\d+)/);
    const meses = mMes ? Number(mMes[1]) : 1;
    return meses * 30;
  }
  const match = str.match(/(\d+)/);
  if (match) {
    const dias = Number(match[1]);
    return Number.isFinite(dias) && dias >= 0 ? dias : null;
  }
  return null;
}

/**
 * Obtém o prazo padrão de garantia configurado exclusivamente na conta autenticada atual.
 */
export function obterPrazoGarantiaConfiguradoLoja(): number {
  try {
    const configIsolada = obterConfiguracoesLojaSincrono();
    const dias = extrairDiasGarantia(configIsolada?.prazoGarantiaDias);
    if (dias !== null && dias > 0) {
      return Math.max(GARANTIA_LEGAL_DIAS, dias);
    }
  } catch (e) {
    console.error('Erro ao ler configuração de prazo de garantia:', e);
  }
  return 90;
}

/**
 * Verifica de forma estrita se a OS possui cobertura de garantia ativa ("Com garantia").
 * Se a OS foi marcada como "Sem garantia", retorna sempre false.
 */
export function verificarPossuiGarantiaOS(os: any): boolean {
  if (!os) return false;

  const flagDireta = os.possuiGarantia !== undefined ? os.possuiGarantia : os.possui_garantia;
  if (
    flagDireta === false ||
    flagDireta === 0 ||
    String(flagDireta).toLowerCase().trim() === 'false' ||
    String(flagDireta).toLowerCase().trim() === '0' ||
    String(flagDireta).toLowerCase().trim() === 'sem garantia'
  ) {
    return false;
  }

  const checklist = os.checklist_entrada || os.checklistEntrada;
  if (checklist && typeof checklist === 'object') {
    if (
      checklist.__possuiGarantia === false ||
      checklist.__possuiGarantia === 0 ||
      String(checklist.__possuiGarantia).toLowerCase().trim() === 'false'
    ) {
      return false;
    }
    if (checklist.__prazoGarantiaDias === 0 || checklist.__prazoGarantiaDias === '0') {
      return false;
    }
  }

  if (
    os.prazoGarantiaDias === 0 ||
    os.prazo_garantia_dias === 0 ||
    os.orcamentoCalculado?.possuiGarantia === false
  ) {
    return false;
  }

  return true;
}

/**
 * Obtém a duração (em dias) da garantia atribuída individualmente à OS original.
 * Nunca é menor que a garantia legal de 90 dias: OS "sem garantia" da loja ou com prazo menor
 * continuam com a garantia legal, que não pode ser excluída (CDC, arts. 24 e 26, II).
 */
export function obterPrazoGarantiaOS(os: any, servicosCadastrados?: any[]): number {
  return Math.max(GARANTIA_LEGAL_DIAS, prazoGarantiaInformadoOS(os, servicosCadastrados));
}

/** Prazo gravado na OS, no serviço do catálogo, no texto da OS ou na configuração (0 = só a garantia legal). */
function prazoGarantiaInformadoOS(os: any, servicosCadastrados?: any[]): number {
  if (!verificarPossuiGarantiaOS(os)) {
    return 0;
  }

  const checklist = os.checklist_entrada || os.checklistEntrada || {};
  let garantiaObj = os.garantia_json || os.garantia;
  if (typeof garantiaObj === 'string') {
    try {
      garantiaObj = JSON.parse(garantiaObj);
    } catch {
      garantiaObj = null;
    }
  }

  // 1. Prioridade máxima: prazo individual gravado diretamente na OS original
  const candidatosOS = [
    os.prazoGarantiaDias,
    os.prazo_garantia_dias,
    os.prazo_garantia,
    os.prazoGarantia,
    os.dias_garantia,
    os.diasGarantia,
    os.garantia_dias,
    os.garantiaDias,
    checklist?.__prazoGarantiaDias,
    checklist?.prazoGarantiaDias,
    checklist?.prazo_garantia_dias,
    os.orcamentoCalculado?.prazoGarantiaDias,
    os.orcamentoCalculado?.prazo_garantia_dias,
    garantiaObj?.prazoGarantiaDias,
    garantiaObj?.prazo_garantia_dias,
  ];

  for (const cand of candidatosOS) {
    const dias = extrairDiasGarantia(cand);
    if (dias !== null && dias > 0) {
      return dias;
    }
  }

  // 2. Se a OS tiver um serviço vinculado e houver lista de serviços cadastrados com garantia_padrao
  if (Array.isArray(servicosCadastrados) && servicosCadastrados.length > 0) {
    const nomeServicoOS = String(
      os.servicoRealizado || os.servico_realizado || os.defeitoRelatado || os.defeito_relatado || ''
    )
      .toLowerCase()
      .trim();

    if (nomeServicoOS) {
      const servicoMatch = servicosCadastrados.find(
        (s: any) => String(s?.nome || s?.titulo || '').toLowerCase().trim() === nomeServicoOS
      );
      if (servicoMatch) {
        const diasServ = extrairDiasGarantia(
          servicoMatch.garantia_padrao ?? servicoMatch.garantiaPadrao ?? servicoMatch.prazo_garantia
        );
        if (diasServ !== null && diasServ > 0) {
          return diasServ;
        }
      }
    }
  }

  // 3. Verifica se há menção explícita de prazo nas observações/diagnóstico da OS (ex.: "garantia de 180 dias")
  const textoObs = `${os.observacoes || ''} ${os.observacoes_internas || ''} ${os.diagnostico || ''} ${os.diagnostico_tecnico || ''}`;
  const matchTexto = textoObs.match(/garantia\s*(?:de|:)?\s*(\d+)\s*(dias?|meses|mês|ano)/i);
  if (matchTexto) {
    const diasExtraidos = extrairDiasGarantia(`${matchTexto[1]} ${matchTexto[2]}`);
    if (diasExtraidos !== null && diasExtraidos > 0) {
      return diasExtraidos;
    }
  }

  // 4. Fallback compatível: configuração padrão da loja
  return obterPrazoGarantiaConfiguradoLoja();
}

/**
 * Calcula a diferença exata em dias civis (calendário) entre a data de início da garantia e a data atual,
 * eliminando problemas de fuso horário, horas quebradas e considerando corretamente o último dia válido.
 */
export function calcularDiasDecorridosGarantia(
  dataInicioInput: any,
  dataReferenciaAtual: Date = new Date()
): number | null {
  if (!dataInicioInput) return null;

  let anoInicio: number;
  let mesInicio: number;
  let diaInicio: number;

  if (typeof dataInicioInput === 'string') {
    const str = dataInicioInput.trim();
    // Com horário (ISO com "T"), usa a data local; só "AAAA-MM-DD" puro é lido direto
    const mIso = str.includes('T') ? null : str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const mBr = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (mIso) {
      anoInicio = Number(mIso[1]);
      mesInicio = Number(mIso[2]) - 1;
      diaInicio = Number(mIso[3]);
    } else if (mBr) {
      diaInicio = Number(mBr[1]);
      mesInicio = Number(mBr[2]) - 1;
      anoInicio = Number(mBr[3]);
    } else {
      const dt = new Date(str);
      if (isNaN(dt.getTime())) return null;
      anoInicio = dt.getFullYear();
      mesInicio = dt.getMonth();
      diaInicio = dt.getDate();
    }
  } else if (dataInicioInput instanceof Date) {
    if (isNaN(dataInicioInput.getTime())) return null;
    anoInicio = dataInicioInput.getFullYear();
    mesInicio = dataInicioInput.getMonth();
    diaInicio = dataInicioInput.getDate();
  } else {
    return null;
  }

  const utcInicio = Date.UTC(anoInicio, mesInicio, diaInicio);
  const utcAtual = Date.UTC(
    dataReferenciaAtual.getFullYear(),
    dataReferenciaAtual.getMonth(),
    dataReferenciaAtual.getDate()
  );

  const diffMs = utcAtual - utcInicio;
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export interface ResultadoElegibilidadeGarantia {
  elegivel: boolean;
  codigo?: 'SEM_GARANTIA' | 'PRAZO_EXPIRADO' | 'STATUS_INVALIDO' | 'DATA_INVALIDA';
  motivo?: string;
  detalhe?: string;
  prazoDias: number;
  diasDecorridos: number;
  diasRestantes: number;
  dataInicio?: string;
}

/**
 * Valida de ponta a ponta se uma Ordem de Serviço é elegível para registro de retorno em garantia.
 */
export function validarElegibilidadeGarantiaOS(
  os: any,
  opcoes?: { dataReferenciaAtual?: Date; servicosCadastrados?: any[] }
): ResultadoElegibilidadeGarantia {
  if (!os) {
    return {
      elegivel: false,
      codigo: 'DATA_INVALIDA',
      motivo: 'Ordem de Serviço não localizada.',
      prazoDias: 0,
      diasDecorridos: 0,
      diasRestantes: 0,
    };
  }

  // 1. OS registrada "sem garantia" da loja continua com a garantia legal de 90 dias (CDC, art. 24):
  //    o prazo vem de obterPrazoGarantiaOS, que nunca fica abaixo dela.

  // 2. Verifica se a OS está cancelada ou em rascunho
  const statusUpper = String(os.status_os || os.statusOs || '').toUpperCase().trim();
  if (statusUpper === 'CANCELADO' || statusUpper === 'RASCUNHO') {
    return {
      elegivel: false,
      codigo: 'STATUS_INVALIDO',
      motivo: `Esta Ordem de Serviço está com status "${statusUpper}" e não permite retorno em garantia.`,
      prazoDias: 0,
      diasDecorridos: 0,
      diasRestantes: 0,
    };
  }

  // 3. Obtém a duração individual da garantia atribuída à OS original (sem limite fixo de 90 dias)
  const prazoDias = obterPrazoGarantiaOS(os, opcoes?.servicosCadastrados);
  if (!prazoDias || prazoDias <= 0) {
    return {
      elegivel: false,
      codigo: 'SEM_GARANTIA',
      motivo: 'Esta Ordem de Serviço foi registrada sem garantia e não permite retorno em garantia.',
      prazoDias: 0,
      diasDecorridos: 0,
      diasRestantes: 0,
    };
  }

  // 4. Obtém a data de início da garantia da OS original
  const checklist = os.checklist_entrada || os.checklistEntrada || {};
  // Garantia conta a partir da ENTREGA (CDC, art. 26); OS ainda não entregue usa a data de abertura
  const dataInicioRaw =
    os.data_inicio_garantia ||
    os.dataInicioGarantia ||
    checklist.__dataInicioGarantia ||
    os.data_conclusao ||
    checklist.__dataConclusao ||
    os.data_abertura ||
    os.dataAbertura;

  const diasDecorridos = calcularDiasDecorridosGarantia(
    dataInicioRaw,
    opcoes?.dataReferenciaAtual || new Date()
  );

  if (diasDecorridos === null) {
    return {
      elegivel: false,
      codigo: 'DATA_INVALIDA',
      motivo: 'Data de início da garantia não encontrada ou inválida nesta Ordem de Serviço.',
      prazoDias,
      diasDecorridos: 0,
      diasRestantes: 0,
    };
  }

  // 5. Verifica se o prazo calculado ainda está vigente (incluindo o último dia válido: diasDecorridos <= prazoDias)
  if (diasDecorridos > prazoDias) {
    const diasExpirados = diasDecorridos - prazoDias;
    return {
      elegivel: false,
      codigo: 'PRAZO_EXPIRADO',
      motivo: 'O prazo de garantia desta Ordem de Serviço expirou. O retorno em garantia não pode ser registrado.',
      detalhe: `Garantia de ${prazoDias} dias expirada há ${diasExpirados} dia(s) (${diasDecorridos} dias decorridos desde o início).`,
      prazoDias,
      diasDecorridos,
      diasRestantes: 0,
      dataInicio: String(dataInicioRaw),
    };
  }

  const diasDecorridosNormalizado = Math.max(0, diasDecorridos);
  const diasRestantes = Math.max(0, prazoDias - diasDecorridosNormalizado);

  return {
    elegivel: true,
    prazoDias,
    diasDecorridos: diasDecorridosNormalizado,
    diasRestantes,
    dataInicio: String(dataInicioRaw),
  };
}

export async function buscarClientes(): Promise<any[]> {
  try {
    const { data, error } = await supabase.from('clientes').select('*').order('nome', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Erro ao buscar clientes:', err);
    return [];
  }
}

export async function buscarFornecedores(): Promise<any[]> {
  try {
    const { data, error } = await supabase.from('cad_fornecedores').select('*').order('nome', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Erro ao buscar fornecedores:', err);
    return [];
  }
}

/**
 * Modelos de aparelho já cadastrados nas OS da loja (somente leitura de aparelhos_cliente),
 * sem repetição e sem os nomes genéricos usados quando o modelo não foi informado.
 */
export async function buscarModelosAparelhos(): Promise<string[]> {
  try {
    const { data, error } = await supabase.from('aparelhos_cliente').select('modelo').limit(2000);
    if (error) throw error;
    const genericos = ['smartphone genérico', 'aparelho em avaliação', 'smartphone'];
    const vistos = new Map<string, string>();
    (data || []).forEach((linha: any) => {
      const modelo = String(linha?.modelo || '').trim();
      const chave = modelo.toLowerCase();
      if (modelo && !genericos.includes(chave) && !vistos.has(chave)) vistos.set(chave, modelo);
    });
    return [...vistos.values()];
  } catch (err) {
    console.error('Erro ao buscar modelos de aparelhos:', err);
    return [];
  }
}

export async function buscarServicosCadastrados(): Promise<any[]> {
  try {
    const { data, error } = await supabase.from('cad_servicos').select('*').order('nome', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Erro ao buscar serviços:', err);
    return [];
  }
}

// Função auxiliar para ajustar a data e evitar o bug do fuso horário (+1 dia)
function formatarDataParaBanco(dataStr: string): string {
  if (!dataStr) return new Date().toISOString();
  if (dataStr.includes('T')) return new Date(dataStr).toISOString();
  return new Date(`${dataStr}T12:00:00`).toISOString();
}

/** UUID para novos registros; o prefixo só é usado em ambientes sem crypto.randomUUID. */
function gerarId(prefixo: string): string {
  return crypto.randomUUID ? crypto.randomUUID() : `${prefixo}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Normaliza a coluna garantia_json para a lista de retornos em garantia.
 * Aceita o formato atual (array), o objeto { listaRetornos } e o legado com um único retorno.
 */
function extrairListaRetornosGarantia(garantiaJson: any): any[] {
  let garantiaRaw = garantiaJson;
  if (typeof garantiaRaw === 'string') {
    try {
      garantiaRaw = JSON.parse(garantiaRaw);
    } catch {
      return [];
    }
  }
  if (Array.isArray(garantiaRaw)) return garantiaRaw;
  if (garantiaRaw && typeof garantiaRaw === 'object') {
    return Array.isArray(garantiaRaw.listaRetornos) ? garantiaRaw.listaRetornos : [garantiaRaw];
  }
  return [];
}

// ==========================================
// 4. ORDENS DE SERVIÇO (CRIAÇÃO, RASCUNHO E EDIÇÃO)
// ==========================================

// ==========================================
// TAXAS DE PAGAMENTO (bruto x líquido)
// Colunas valor_taxas e modalidade_pagamento: migração 20261025090000_taxas_pagamento_ordens.sql
// ==========================================

export type ModalidadePagamento = 'DEBITO' | 'CREDITO_VISTA' | 'CREDITO_PARCELADO' | 'PIX' | 'DINHEIRO' | 'MISTO' | 'OUTRO';

export const ROTULOS_MODALIDADE: Record<ModalidadePagamento, string> = {
  DEBITO: 'Débito',
  CREDITO_VISTA: 'Crédito à vista',
  CREDITO_PARCELADO: 'Crédito parcelado',
  PIX: 'PIX',
  DINHEIRO: 'Dinheiro',
  MISTO: 'Pagamento dividido',
  OUTRO: 'Outra forma',
};

/** Modalidade de uma forma de pagamento em texto (ex.: "Cartão de crédito (3x)"). */
export function modalidadeDaForma(forma: string, parcelas: number = 1): ModalidadePagamento {
  const f = String(forma || '').toLowerCase();
  if (f.includes('+')) return 'MISTO';
  if (f.includes('pix')) return 'PIX';
  if (f.includes('dinheiro')) return 'DINHEIRO';
  if (f.includes('débito') || f.includes('debito')) return 'DEBITO';
  if (f.includes('crédito') || f.includes('credito')) return Number(parcelas) > 1 ? 'CREDITO_PARCELADO' : 'CREDITO_VISTA';
  return 'OUTRO';
}

/** Modalidade da OS: pelos pagamentos estruturados (2 formas = MISTO) ou pelo texto da forma. */
function modalidadeDaOS(pagamentos: any[] | null | undefined, forma: string, parcelas: number): ModalidadePagamento {
  const lista = Array.isArray(pagamentos) ? pagamentos.filter((p) => Number(p?.valor) > 0) : [];
  if (lista.length > 1) return 'MISTO';
  if (lista.length === 1) return modalidadeDaForma(lista[0].forma, Number(lista[0].parcelas) || 1);
  return modalidadeDaForma(forma, parcelas);
}

const arredondar2 = (v: number) => Math.round(v * 100) / 100;

/** Taxa retida (R$) = bruto − líquido, nunca negativa. */
export const calcularValorTaxas = (bruto: number, liquido: number) => arredondar2(Math.max(0, Number(bruto || 0) - Number(liquido || 0)));

// Colunas que podem ainda não existir no banco (migrações opcionais): a gravação tenta de novo sem elas
const COLUNAS_TAXAS = ['valor_taxas', 'modalidade_pagamento', 'data_conclusao'];

/** A coluna forma_pagamento aceita no máximo 50 caracteres no banco. */
const LIMITE_FORMA_PAGAMENTO = 50;
const limitarFormaPagamento = (texto: string) => {
  const t = String(texto || '').trim();
  return t.length <= LIMITE_FORMA_PAGAMENTO ? t : `${t.slice(0, LIMITE_FORMA_PAGAMENTO - 1).trimEnd()}…`;
};

/** Mensagens do banco em português para os erros mais comuns ao gravar uma OS. */
function traduzirErroBanco(error: any, padrao: string): string {
  const msg = String(error?.message || '');
  const limite = msg.match(/value too long for type character varying\((\d+)\)/i);
  if (limite) return `Um dos campos da OS passou do limite de ${limite[1]} caracteres do banco. Encurte o texto e tente novamente.`;
  return msg || padrao;
}

/**
 * Grava a OS com as colunas de taxas. Se a migração ainda não foi executada (coluna inexistente),
 * grava de novo sem elas: o sistema continua funcionando e as colunas passam a ser preenchidas
 * assim que a migração rodar.
 */
async function gravarComColunasDeTaxas<T extends { error: any }>(
  dados: Record<string, any>,
  executar: (d: Record<string, any>) => PromiseLike<T>
): Promise<T> {
  const resultado = await executar(dados);
  const msg = String(resultado.error?.message || '');
  const colunaAusente = resultado.error && COLUNAS_TAXAS.some((c) => msg.includes(c));
  if (!colunaAusente) return resultado;
  const semTaxas = { ...dados };
  COLUNAS_TAXAS.forEach((c) => delete semTaxas[c]);
  return executar(semTaxas);
}

/**
 * Número da OS: sequência por conta no banco (função gerar_numero_os, migração 20261025120000);
 * sem a migração, número aleatório. Em ambos os casos confere se o número ainda não existe.
 */
async function gerarNumeroOS(): Promise<string> {
  const prefixo = obterConfiguracoesLojaSincrono().prefixoOS; // Configurações › Operacional
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const { data, error } = await supabase.rpc('gerar_numero_os');
    const sequencia = Number(data);
    const numero =
      !error && Number.isFinite(sequencia) && sequencia > 0
        ? `${prefixo}${String(sequencia).padStart(6, '0')}`
        : `${prefixo}${Math.floor(100000 + Math.random() * 900000)}`;
    const { count, error: erroBusca } = await supabase
      .from('ordens_servico')
      .select('id_os', { count: 'exact', head: true })
      .eq('numero_os', numero);
    if (erroBusca || !count) return numero;
  }
  throw new Error('Não foi possível gerar um número de OS único. Tente novamente.');
}

/** Escapa % e _ para buscas com ilike (o texto digitado é comparado literalmente). */
const escaparLike = (texto: string) => texto.replace(/[\\%_]/g, (c) => `\\${c}`);

const digitosTelefone = (v: any) => {
  const d = String(v || '').replace(/\D/g, '');
  return d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
};

const nomeComparavel = (v: any) =>
  String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Cliente da OS. Com id (escolhido na lista) usa o próprio cadastro. Avulso: reaproveita um cadastro
 * só quando WhatsApp E nome coincidem; caso contrário cria um cadastro novo. Nunca vincula só pelo nome
 * (dois clientes "Maria" ficariam misturados e editar um alteraria o outro).
 */
async function resolverClienteDaOS(cliente: any): Promise<string> {
  if (cliente?.idCliente) return cliente.idCliente;

  const nome = String(cliente?.nome || '').trim() || 'Cliente Balcão';
  const whatsapp = String(cliente?.whatsapp || '').trim();
  const fone = digitosTelefone(whatsapp);

  if (fone.length >= 10) {
    const { data: candidatos, error } = await supabase
      .from('clientes')
      .select('id_cliente, nome, whatsapp')
      .ilike('whatsapp', `%${escaparLike(fone.slice(-4))}`)
      .limit(50);
    if (error) throw new Error(`Falha ao procurar o cliente: ${error.message}`);
    const mesmo = (candidatos || []).find(
      (c: any) => digitosTelefone(c.whatsapp) === fone && nomeComparavel(c.nome) === nomeComparavel(nome)
    );
    if (mesmo?.id_cliente) return mesmo.id_cliente;
  }

  const { data: authData } = await supabase.auth.getUser();
  const novoId = gerarId('cli');
  const { error } = await supabase.from('clientes').insert([
    {
      id_cliente: novoId,
      nome,
      whatsapp,
      cpf_cnpj: String(cliente?.cpfCnpj || '').trim() || null,
      ...(authData?.user?.id ? { user_id: authData.user.id } : {}),
    },
  ]);
  if (error) throw new Error(`Falha ao cadastrar o cliente: ${error.message}`);
  return novoId;
}

/** Aparelho da OS: reaproveita o mesmo modelo já cadastrado para o cliente ou cria um novo. */
async function resolverAparelhoDaOS(idCliente: string, aparelho: any): Promise<string> {
  if (aparelho?.idAparelho) return aparelho.idAparelho;
  const modelo = String(aparelho?.modelo || '').trim() || 'Smartphone Genérico';
  const imei = aparelho?.imei1 || aparelho?.imei || null;

  const { data: existentes, error } = await supabase
    .from('aparelhos_cliente')
    .select('id_aparelho')
    .eq('id_cliente', idCliente)
    .ilike('modelo', escaparLike(modelo))
    .limit(1);
  if (error) throw new Error(`Falha ao procurar o aparelho: ${error.message}`);
  if (existentes?.[0]?.id_aparelho) return existentes[0].id_aparelho;

  const novoId = gerarId('apr');
  const { error: erroInsert } = await supabase
    .from('aparelhos_cliente')
    .insert([{ id_aparelho: novoId, id_cliente: idCliente, modelo, imei_1: imei }]);
  if (erroInsert) throw new Error(`Falha ao cadastrar o aparelho: ${erroInsert.message}`);
  return novoId;
}

export async function criarOrdemServico(payload: {
  cliente: any;
  aparelho: any;
  defeitoRelatado: string;
  diagnostico?: string;
  servicoRealizado?: string;
  pecasUtilizadas?: string;
  observacoes?: string;
  dataAbertura?: string;
  dataPrevistaEntrega?: string;
  checklistEntrada: any;
  orcamentoCalculado: any;
  possuiGarantia?: boolean;
  prazoGarantiaDias?: number;
  formaPagamento?: string;
  parcelas?: number;
  valorLiquido?: number | null;
  status_os?: string;
  pagamentos?: any[];
}): Promise<{ idOs: string; numeroOs: string }> {
  const numeroOsGerado = await gerarNumeroOS();
  const idOsGerado = gerarId('os');

  // Cliente e aparelho: escolhido na lista = usa o cadastro; avulso = reaproveita só se WhatsApp e nome baterem
  const idClienteFinal = await resolverClienteDaOS(payload.cliente);
  const idAparelhoFinal = await resolverAparelhoDaOS(idClienteFinal, payload.aparelho);

  const possuiGarantiaFinal = payload.possuiGarantia ?? true;
  const prazoGarantiaFinal = possuiGarantiaFinal
    ? (extrairDiasGarantia(
        payload.prazoGarantiaDias ??
        (payload.checklistEntrada as any)?.__prazoGarantiaDias ??
        payload.orcamentoCalculado?.prazoGarantiaDias
      ) ?? obterPrazoGarantiaConfiguradoLoja())
    : 0;

  // Prepara checklist_entrada incluindo a persistência estruturada dos pagamentos e do prazo individual de garantia da OS
  const checklistFinal = {
    ...(payload.checklistEntrada || {}),
    __pagamentos: payload.pagamentos || (payload.checklistEntrada as any)?.__pagamentos || null,
    __possuiGarantia: possuiGarantiaFinal,
    __prazoGarantiaDias: prazoGarantiaFinal,
    // Metadados do desconto ficam no JSON checklist_entrada (a tabela não tem colunas próprias para eles)
    __subtotalServicos: Number(payload.orcamentoCalculado?.subtotalServicos ?? payload.orcamentoCalculado?.valorTotalOrcamento ?? 0),
    __tipoDesconto: payload.orcamentoCalculado?.tipoDesconto || 'VALOR',
    __descontoValor: Number(payload.orcamentoCalculado?.descontoGeralAplicado || 0),
    __descontoInput: Number(payload.orcamentoCalculado?.descontoInput ?? payload.orcamentoCalculado?.descontoGeralAplicado ?? 0),
    // Campos sem coluna própria na tabela: ficam no JSON da OS
    __servicoRealizado: payload.servicoRealizado || '',
    __pecasUtilizadas: payload.pecasUtilizadas || '',
    __senhaDesbloqueio: payload.aparelho?.senhaDesbloqueio || '',
    // Previsão de término informada ao cliente no orçamento (CDC, art. 40)
    __dataPrevistaEntrega: payload.dataPrevistaEntrega || (payload.checklistEntrada as any)?.__dataPrevistaEntrega || null,
  };

  const valorLiqFinal = payload.valorLiquido !== undefined && payload.valorLiquido !== null
    ? payload.valorLiquido
    : (payload.orcamentoCalculado?.valorLiquido ?? payload.orcamentoCalculado?.valorTotalOrcamento ?? 0);

  const dadosParaSalvar: any = {
    id_os: idOsGerado,
    numero_os: numeroOsGerado,
    id_cliente: idClienteFinal,
    id_aparelho: idAparelhoFinal,
    defeito_relatado: payload.defeitoRelatado || '',
    diagnostico_tecnico: payload.diagnostico || '',
    observacoes_internas: payload.observacoes || '',
    status_os: payload.status_os || 'AGUARDANDO_AVALIACAO',
    checklist_entrada: checklistFinal,
    valor_total: payload.orcamentoCalculado?.valorTotalOrcamento || 0,
    lucro_estimado_total: payload.orcamentoCalculado?.lucroTotalEstimadoInterno || 0,
    custo_peca: payload.orcamentoCalculado?.custoPeca || 0,
    frete_real: payload.orcamentoCalculado?.freteReal || 0,
    forma_pagamento: limitarFormaPagamento(payload.formaPagamento || 'Dinheiro'),
    parcelas: payload.parcelas || 1,
    valor_liquido: valorLiqFinal,
    // Bruto (valor_total) x líquido (valor_liquido): a diferença é o que a maquininha reteve
    valor_taxas: calcularValorTaxas(payload.orcamentoCalculado?.valorTotalOrcamento || 0, valorLiqFinal),
    modalidade_pagamento: modalidadeDaOS(payload.pagamentos, payload.formaPagamento || 'Dinheiro', payload.parcelas || 1),
    possui_garantia: possuiGarantiaFinal,
    data_abertura: payload.dataAbertura ? formatarDataParaBanco(payload.dataAbertura) : new Date().toISOString(),
  };

  const { data, error } = await gravarComColunasDeTaxas(dadosParaSalvar, (dados) =>
    supabase.from('ordens_servico').insert([dados]).select().single()
  );

  if (error) {
    throw new Error(traduzirErroBanco(error, 'Falha ao salvar Ordem de Serviço no Supabase'));
  }

  invalidarCacheOrdens();
  return {
    idOs: data?.id_os || idOsGerado, 
    numeroOs: data?.numero_os || numeroOsGerado 
  };
}

export async function editarOrdemServico(id_os: string, payload: any): Promise<void> {
  // 1. Busca a OS atual para sabermos o id_cliente, id_aparelho e metadados de garantia/pagamento
  const { data: osAtual, error: errBusca } = await supabase
    .from('ordens_servico')
    .select('id_cliente, id_aparelho, checklist_entrada, possui_garantia, status_os')
    .eq('id_os', id_os)
    .single();

  if (errBusca) throw new Error('Falha ao localizar Ordem de Serviço para edição.');

  // 2. Se o cliente foi alterado, atualiza na tabela de clientes (inclui CPF/CNPJ)
  if (payload.cliente?.nome && osAtual?.id_cliente) {
    const dadosCliente: Record<string, any> = {
      nome: payload.cliente.nome.trim(),
      whatsapp: payload.cliente.whatsapp || '',
    };
    if (payload.cliente.cpfCnpj !== undefined) dadosCliente.cpf_cnpj = String(payload.cliente.cpfCnpj || '').trim() || null;
    const { error: erroCliente } = await supabase.from('clientes').update(dadosCliente).eq('id_cliente', osAtual.id_cliente);
    if (erroCliente) throw new Error(`Falha ao atualizar o cliente: ${erroCliente.message}`);
  }

  // 3. Se o aparelho foi alterado, atualiza na tabela de aparelhos
  if (payload.aparelho?.modelo && osAtual?.id_aparelho) {
    const { error: erroAparelho } = await supabase
      .from('aparelhos_cliente')
      .update({
        modelo: payload.aparelho.modelo.trim(),
        imei_1: payload.aparelho?.imei1 || payload.aparelho?.imei || null,
      })
      .eq('id_aparelho', osAtual.id_aparelho);
    if (erroAparelho) throw new Error(`Falha ao atualizar o aparelho: ${erroAparelho.message}`);
  }

  // 4. Prepara a atualização dos campos da Ordem de Serviço
  const dadosAtualizados: any = {};

  const defeito = payload.defeitoRelatado !== undefined ? payload.defeitoRelatado : payload.defeito_relatado;
  if (defeito !== undefined) dadosAtualizados.defeito_relatado = defeito;

  const status = payload.statusOs !== undefined ? payload.statusOs : (payload.status_os !== undefined ? payload.status_os : payload.statusOS);
  if (status !== undefined) dadosAtualizados.status_os = status;

  const formaPg = payload.formaPagamento !== undefined ? payload.formaPagamento : payload.forma_pagamento;
  if (formaPg !== undefined) dadosAtualizados.forma_pagamento = limitarFormaPagamento(formaPg);

  if (payload.parcelas !== undefined) dadosAtualizados.parcelas = payload.parcelas;

  const diag = payload.diagnostico !== undefined ? payload.diagnostico : (payload.diagnostico_tecnico !== undefined ? payload.diagnostico_tecnico : payload.diagnosticoTecnico);
  if (diag !== undefined) dadosAtualizados.diagnostico_tecnico = diag;

  const obs = payload.observacoes !== undefined ? payload.observacoes : (payload.observacoes_internas !== undefined ? payload.observacoes_internas : payload.observacoesInternas);
  if (obs !== undefined) dadosAtualizados.observacoes_internas = obs;

  const possuiGarantiaInput = payload.possuiGarantia !== undefined ? payload.possuiGarantia : payload.possui_garantia;
  if (possuiGarantiaInput !== undefined) {
    dadosAtualizados.possui_garantia = Boolean(possuiGarantiaInput);
  }

  const checklistExistente = osAtual?.checklist_entrada || {};
  const orc = payload.orcamentoCalculado;

  // Campos sem coluna própria (antes descartados na edição) e datas de pronto/entrega
  const extras: Record<string, any> = {};
  if (payload.servicoRealizado !== undefined) extras.__servicoRealizado = payload.servicoRealizado || '';
  if (payload.pecasUtilizadas !== undefined) extras.__pecasUtilizadas = payload.pecasUtilizadas || '';
  if (payload.aparelho?.senhaDesbloqueio !== undefined) extras.__senhaDesbloqueio = payload.aparelho.senhaDesbloqueio || '';
  // Entregue ou cancelada: a senha do aparelho deixa de ser necessária e é apagada (LGPD, arts. 6º, III, e 16)
  if (status && STATUS_APAGAM_SENHA.includes(status)) extras.__senhaDesbloqueio = '';
  const conclusaoInformada = payload.dataConclusao ?? payload.data_conclusao;
  if (conclusaoInformada) {
    extras.__dataConclusao = formatarDataParaBanco(conclusaoInformada);
  } else if (status === 'ENTREGUE' && osAtual?.status_os !== 'ENTREGUE' && !checklistExistente.__dataConclusao) {
    // Entregue agora: a garantia passa a contar a partir de hoje
    extras.__dataConclusao = new Date().toISOString();
  }
  if (status === 'PRONTO' && osAtual?.status_os !== 'PRONTO' && !checklistExistente.__dataPronto) {
    extras.__dataPronto = new Date().toISOString();
  }
  if (extras.__dataConclusao) dadosAtualizados.data_conclusao = extras.__dataConclusao;

  if (
    payload.checklistEntrada !== undefined ||
    payload.pagamentos !== undefined ||
    payload.prazoGarantiaDias !== undefined ||
    possuiGarantiaInput !== undefined ||
    orc !== undefined ||
    Object.keys(extras).length > 0
  ) {
    const checklistBase = payload.checklistEntrada !== undefined ? payload.checklistEntrada : checklistExistente;
    const possuiGarantiaPreservado =
      possuiGarantiaInput !== undefined
        ? Boolean(possuiGarantiaInput)
        : (checklistExistente.__possuiGarantia ?? osAtual?.possui_garantia ?? true);

    const prazoPreservado = possuiGarantiaPreservado
      ? (extrairDiasGarantia(
          payload.prazoGarantiaDias ??
          (checklistBase as any)?.__prazoGarantiaDias ??
          checklistExistente.__prazoGarantiaDias
        ) ?? obterPrazoGarantiaConfiguradoLoja())
      : 0;

    dadosAtualizados.checklist_entrada = {
      ...(checklistBase || {}),
      __pagamentos:
        payload.pagamentos !== undefined
          ? payload.pagamentos
          : ((checklistBase as any)?.__pagamentos ?? checklistExistente.__pagamentos),
      __possuiGarantia: possuiGarantiaPreservado,
      __prazoGarantiaDias: prazoPreservado,
      // Desconto: atualiza com o orçamento enviado; campos ausentes preservam o que já estava salvo
      __subtotalServicos:
        orc?.subtotalServicos !== undefined || orc?.valorTotalOrcamento !== undefined
          ? Number(orc.subtotalServicos ?? orc.valorTotalOrcamento ?? 0)
          : ((checklistBase as any)?.__subtotalServicos ?? checklistExistente.__subtotalServicos),
      __tipoDesconto:
        orc?.tipoDesconto || (checklistBase as any)?.__tipoDesconto || checklistExistente.__tipoDesconto || 'VALOR',
      __descontoValor:
        orc?.descontoGeralAplicado !== undefined
          ? Number(orc.descontoGeralAplicado || 0)
          : ((checklistBase as any)?.__descontoValor ?? checklistExistente.__descontoValor),
      __descontoInput:
        orc?.descontoInput !== undefined || orc?.descontoGeralAplicado !== undefined
          ? Number(orc.descontoInput ?? orc.descontoGeralAplicado ?? 0)
          : ((checklistBase as any)?.__descontoInput ?? checklistExistente.__descontoInput),
      // Metadados que o checklist enviado pela tela não traz: preserva os já salvos
      __servicoRealizado: (checklistBase as any)?.__servicoRealizado ?? checklistExistente.__servicoRealizado,
      __pecasUtilizadas: (checklistBase as any)?.__pecasUtilizadas ?? checklistExistente.__pecasUtilizadas,
      __senhaDesbloqueio: (checklistBase as any)?.__senhaDesbloqueio ?? checklistExistente.__senhaDesbloqueio,
      __dataConclusao: (checklistBase as any)?.__dataConclusao ?? checklistExistente.__dataConclusao,
      __dataPronto: (checklistBase as any)?.__dataPronto ?? checklistExistente.__dataPronto,
      __servicoNome: (checklistBase as any)?.__servicoNome ?? checklistExistente.__servicoNome,
      __servicoId: (checklistBase as any)?.__servicoId ?? checklistExistente.__servicoId,
      ...extras,
    };
  }

  const dataAberturaInput = payload.dataAbertura !== undefined ? payload.dataAbertura : payload.data_abertura;
  if (dataAberturaInput) {
    dadosAtualizados.data_abertura = formatarDataParaBanco(dataAberturaInput);
  }

  if (payload.orcamentoCalculado?.valorTotalOrcamento !== undefined) {
    dadosAtualizados.valor_total = payload.orcamentoCalculado.valorTotalOrcamento;
  }
  if (payload.orcamentoCalculado?.lucroTotalEstimadoInterno !== undefined) {
    dadosAtualizados.lucro_estimado_total = payload.orcamentoCalculado.lucroTotalEstimadoInterno;
  }
  if (payload.orcamentoCalculado?.custoPeca !== undefined) {
    dadosAtualizados.custo_peca = payload.orcamentoCalculado.custoPeca;
  }
  if (payload.orcamentoCalculado?.freteReal !== undefined) {
    dadosAtualizados.frete_real = payload.orcamentoCalculado.freteReal;
  }
  if (payload.orcamentoCalculado?.fornecedorPeca !== undefined) {
    dadosAtualizados.fornecedor_peca = payload.orcamentoCalculado.fornecedorPeca;
  }

  const vLiq = payload.valorLiquido !== undefined ? payload.valorLiquido : payload.valor_liquido;
  if (vLiq !== undefined) {
    dadosAtualizados.valor_liquido = vLiq;
  } else if (payload.orcamentoCalculado?.valorTotalOrcamento !== undefined && dadosAtualizados.valor_liquido === undefined) {
    dadosAtualizados.valor_liquido = payload.orcamentoCalculado.valorTotalOrcamento;
  }

  // Bruto e líquido alterados juntos: recalcula a taxa retida
  if (dadosAtualizados.valor_total !== undefined && dadosAtualizados.valor_liquido !== undefined) {
    dadosAtualizados.valor_taxas = calcularValorTaxas(dadosAtualizados.valor_total, dadosAtualizados.valor_liquido);
  }
  if (dadosAtualizados.forma_pagamento !== undefined) {
    dadosAtualizados.modalidade_pagamento = modalidadeDaForma(dadosAtualizados.forma_pagamento, dadosAtualizados.parcelas ?? 1);
  }

  const { error } = await gravarComColunasDeTaxas(dadosAtualizados, (dados) =>
    supabase.from('ordens_servico').update(dados).eq('id_os', id_os)
  );

  if (error) {
    throw new Error(traduzirErroBanco(error, 'Falha ao atualizar Ordem de Serviço'));
  }
  invalidarCacheOrdens();
}

// Cache curto das ordens: várias telas abertas em sequência não baixam tudo de novo a cada vez.
// É por conta (troca de conta não mostra dados da anterior) e é limpo a cada gravação.
const VALIDADE_CACHE_ORDENS_MS = 30_000;
let cacheOrdens: { conta: string; em: number; promessa: Promise<any[]> } | null = null;

export function invalidarCacheOrdens() {
  cacheOrdens = null;
}

/**
 * Ordens de serviço da conta. Em falha de conexão LANÇA um erro (antes devolvia lista vazia e a tela
 * mostrava "nenhuma ordem", como se os dados tivessem sumido).
 * forcarAtualizacao ignora o cache (botões "Atualizar").
 */
export async function buscarOrdensServico(forcarAtualizacao = false): Promise<any[]> {
  const conta = obterUsuarioAtivoSincrono()?.id || '';
  if (!forcarAtualizacao && cacheOrdens && cacheOrdens.conta === conta && Date.now() - cacheOrdens.em < VALIDADE_CACHE_ORDENS_MS) {
    return cacheOrdens.promessa;
  }
  const promessa = carregarOrdensDoBanco();
  cacheOrdens = { conta, em: Date.now(), promessa };
  promessa.catch(() => {
    if (cacheOrdens?.promessa === promessa) cacheOrdens = null;
  });
  return promessa;
}

async function carregarOrdensDoBanco(): Promise<any[]> {
  try {
    const [{ data, error }, servicosCadastrados] = await Promise.all([
      supabase
        .from('ordens_servico')
        .select(`
          *,
          clientes:id_cliente (nome, whatsapp, cpf_cnpj),
          aparelhos_cliente:id_aparelho (modelo, imei_1)
        `)
        .order('data_abertura', { ascending: false }),
      buscarServicosCadastrados(),
    ]);

    if (error) throw error;

    return (data || []).map((item: any) => {
      const listaRetornos = extrairListaRetornosGarantia(item.garantia_json);

      let custoTotalGarantiaOS = 0;
      listaRetornos.forEach((g: any) => {
        const pecaG = Number(g?.custoPecaGarantia ?? g?.custo_peca_garantia ?? g?.custoPeca ?? g?.prejuizoTotalGarantia ?? 0);
        const freteG = Number(g?.freteGarantia ?? g?.frete_garantia ?? g?.freteReal ?? g?.frete ?? 0);
        custoTotalGarantiaOS += (pecaG + freteG);
      });

      const valorBruto = Number(item.valor_total || 0);
      const valorLiq = Number(item.valor_liquido !== null && item.valor_liquido !== undefined ? item.valor_liquido : valorBruto);
      // Taxa retida pela maquininha: coluna própria (após a migração) ou bruto − líquido
      const valorTaxas =
        item.valor_taxas !== null && item.valor_taxas !== undefined
          ? Number(item.valor_taxas)
          : calcularValorTaxas(valorBruto, valorLiq);
      const pecaBase = Number(item.custo_peca || 0);
      const freteBase = Number(item.frete_real || 0);

      const lucroLiquidoReal = valorLiq - (pecaBase + freteBase + custoTotalGarantiaOS);

      // Resgata pagamentos estruturados (misto ou único)
      let pagamentosLista: any[] = [];
      const pagamentosRaw = item.checklist_entrada?.__pagamentos || item.pagamentos || item.orcamentoCalculado?.pagamentos;
      if (Array.isArray(pagamentosRaw) && pagamentosRaw.length > 0) {
        pagamentosLista = pagamentosRaw;
      } else if (item.forma_pagamento) {
        pagamentosLista = [{
          id: 'pg_1',
          forma: item.forma_pagamento,
          valor: valorBruto,
          parcelas: Number(item.parcelas || 1),
          taxaPercentual: 0,
          valorTaxa: 0,
          valorLiquido: valorLiq,
        }];
      }

      let possuiGarantiaReal = item.possui_garantia ?? true;
      let prazoGarantiaDiasReal = 90;
      try {
        possuiGarantiaReal = verificarPossuiGarantiaOS(item);
        prazoGarantiaDiasReal = obterPrazoGarantiaOS(item, servicosCadastrados);
      } catch {
        possuiGarantiaReal = item.possui_garantia ?? true;
        prazoGarantiaDiasReal = 90;
      }

      return {
        ...item,
        id_os: item.id_os,
        numero_os: item.numero_os,
        status_os: item.status_os || 'AGUARDANDO_AVALIACAO',
        defeitoRelatado: item.defeito_relatado || '',
        // Serviço do catálogo escolhido na abertura (salvo em checklist_entrada)
        servicoRealizado:
          item.servico_realizado || item.checklist_entrada?.__servicoRealizado || item.checklist_entrada?.__servicoNome || '',
        pecasUtilizadas: item.pecas_utilizadas || item.checklist_entrada?.__pecasUtilizadas || '',
        // Data de entrega: coluna (se existir) ou JSON da OS; é o início da garantia
        data_conclusao: item.data_conclusao || item.checklist_entrada?.__dataConclusao || undefined,
        data_prevista_entrega: item.data_prevista_entrega || item.checklist_entrada?.__dataPrevistaEntrega || undefined,
        diagnostico: item.diagnostico_tecnico || '',
        observacoes: item.observacoes_internas || '',
        formaPagamento: item.forma_pagamento || 'PIX',
        parcelas: Number(item.parcelas || 1),
        valorLiquido: valorLiq,
        valorTaxas,
        modalidadePagamento:
          (item.modalidade_pagamento as ModalidadePagamento) ||
          modalidadeDaOS(pagamentosLista, item.forma_pagamento || '', Number(item.parcelas || 1)),
        pagamentos: pagamentosLista,
        possuiGarantia: possuiGarantiaReal,
        prazoGarantiaDias: prazoGarantiaDiasReal,
        dataAbertura: item.data_abertura || '',
        cliente: {
          nome: item.clientes?.nome || item.cliente_nome || 'Cliente Balcão',
          whatsapp: item.clientes?.whatsapp || item.cliente_telefone || '',
          cpfCnpj: item.clientes?.cpf_cnpj || '',
        },
        aparelho: {
          modelo: item.aparelhos_cliente?.modelo || item.aparelho_modelo || 'Smartphone',
          imei1: item.aparelhos_cliente?.imei_1 || item.aparelho_imei || '',
          senhaDesbloqueio: item.checklist_entrada?.__senhaDesbloqueio || '',
        },
        orcamentoCalculado: {
          // Desconto: prioriza colunas diretas (se existirem) e depois os metadados salvos em checklist_entrada
          subtotalServicos: Number(item.subtotal_servicos ?? item.checklist_entrada?.__subtotalServicos ?? valorBruto),
          tipoDesconto: item.tipo_desconto || item.checklist_entrada?.__tipoDesconto || 'VALOR',
          descontoGeralAplicado: Number(item.desconto_valor ?? item.checklist_entrada?.__descontoValor ?? 0),
          descontoInput: Number(
            item.checklist_entrada?.__descontoInput ?? item.desconto_valor ?? item.checklist_entrada?.__descontoValor ?? 0
          ),
          valorTotalOrcamento: valorBruto,
          lucroTotalEstimadoInterno: lucroLiquidoReal,
          custoPeca: pecaBase,
          freteReal: freteBase,
          fornecedorPeca: item.fornecedor_peca || '',
          custoPecaGarantia: custoTotalGarantiaOS,
          pagamentos: pagamentosLista,
          prazoGarantiaDias: prazoGarantiaDiasReal,
        },
        checklistEntrada: item.checklist_entrada || {},
        garantia: listaRetornos.length > 0 || custoTotalGarantiaOS > 0 ? {
          listaRetornos,
          custoTotalGarantia: custoTotalGarantiaOS,
          custoPecaGarantia: custoTotalGarantiaOS,
          totalVoltas: listaRetornos.length || 1,
          prazoGarantiaDias: prazoGarantiaDiasReal,
        } : null,
      };
    });
  } catch (error) {
    console.error('Erro ao buscar ordens no Supabase:', error);
    throw new Error('Não foi possível carregar as ordens de serviço. Verifique a conexão e tente novamente.');
  }
}

export async function atualizarStatusOS(id_os: string, status_os: string): Promise<void> {
  // Pela edição: registra a data de pronto/entrega (início da garantia) junto com o status
  await editarOrdemServico(id_os, { status_os });
}

export async function registrarGarantiaOS(
  id_os: string,
  garantia: any,
  _descricaoOcorrencia?: string
): Promise<void> {
  const [{ data: osAtual, error: errBusca }, servicosCadastrados] = await Promise.all([
    supabase
      .from('ordens_servico')
      .select('*')
      .eq('id_os', id_os)
      .single(),
    buscarServicosCadastrados(),
  ]);

  if (errBusca || !osAtual) {
    throw new Error('Falha ao localizar OS para registrar garantia.');
  }

  // VALIDAÇÃO ESTRITA DE ELEGIBILIDADE NA CAMADA DE NEGÓCIO / PERSISTÊNCIA
  const validacao = validarElegibilidadeGarantiaOS(osAtual, { servicosCadastrados });
  if (!validacao.elegivel) {
    throw new Error(validacao.motivo || 'Esta Ordem de Serviço não é elegível para retorno em garantia.');
  }

  const retorno = {
    ...garantia,
    prazoGarantiaDiasOriginal: validacao.prazoDias,
    diasDecorridosNoRetorno: validacao.diasDecorridos,
  };

  // Acrescenta dentro do banco com a linha travada (migração 20261025120000)
  const { error: erroRpc } = await supabase.rpc('acrescentar_retorno_garantia', { p_id_os: String(id_os), p_retorno: retorno });
  if (!erroRpc) {
    invalidarCacheOrdens();
    return;
  }
  const funcaoAusente = /acrescentar_retorno_garantia|PGRST202|function/i.test(`${erroRpc.code} ${erroRpc.message}`);
  if (!funcaoAusente) throw new Error(erroRpc.message || 'Falha ao registrar garantia');

  // Sem a migração: grava a lista completa (como antes)
  const listaRetornos = extrairListaRetornosGarantia(osAtual.garantia_json);
  listaRetornos.push(retorno);
  const { error } = await supabase
    .from('ordens_servico')
    .update({ garantia_json: listaRetornos })
    .eq('id_os', id_os);

  if (error) {
    throw new Error(error.message || 'Falha ao registrar garantia');
  }
  invalidarCacheOrdens();
}

export async function excluirOrdemServico(id_os: string): Promise<void> {
  const { error } = await supabase
    .from('ordens_servico')
    .delete()
    .eq('id_os', id_os);

  if (error) {
    throw new Error(error.message || 'Falha ao excluir a Ordem de Serviço');
  }
  invalidarCacheOrdens();
}