import { supabase } from './supabaseClient';

// ==========================================
// 1. ISOLAMENTO DE CONFIGURAÇÕES, TEMA, METAS E IDENTIDADE VISUAL POR CONTA
// ==========================================

export type TemaVisual = 'dark' | 'midnight' | 'light';

/** Formato do comprovante de entrada e da certidão de garantia. */
export type FormatoImpressao = 'A4' | 'A4_DUAS_VIAS' | 'TERMICA_80';

/** Taxas (%) cobradas pela maquininha da loja, usadas na Nova OS. */
export interface TaxasMaquininha {
  debito: number;
  credito1x: number;
  credito2a3: number;
  credito4a6: number;
  credito7a12: number;
}

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
  taxasMaquininha: TaxasMaquininha;

  // Operacional
  prazoEntregaDiasUteis: number; // 0 = não sugere data prevista
  prefixoOS: string;
  checklistItensAtivos: string[];

  mensagensWhatsapp: MensagensWhatsapp;
}

export const TAXAS_MAQUININHA_PADRAO: TaxasMaquininha = {
  debito: 1.49,
  credito1x: 3.19,
  credito2a3: 4.89,
  credito4a6: 6.49,
  credito7a12: 8.99,
};

export const MENSAGENS_WHATSAPP_PADRAO: MensagensWhatsapp = {
  entrada:
    'Olá {cliente}, recebemos seu {aparelho} na {loja} (OS #{numero_os}). Assim que o diagnóstico ficar pronto, avisaremos por aqui.',
  orcamento:
    'Olá {cliente}, o diagnóstico do seu {aparelho} (OS #{numero_os}) foi concluído. O valor ficou em {valor}. Podemos seguir com o reparo?',
  pronto:
    'Boas notícias, {cliente}! Seu {aparelho} (OS #{numero_os}) já está pronto para retirada na {loja}.',
  entrega:
    'Obrigado pela preferência, {cliente}! Seu {aparelho} foi entregue com garantia de {prazo_garantia} dias. Qualquer dúvida, é só chamar a {loja}.',
};

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
function completarConfigLoja(cfg: Partial<ConfiguracoesLojaIsolada>, padrao: ConfiguracoesLojaIsolada): ConfiguracoesLojaIsolada {
  const taxas: Partial<TaxasMaquininha> = cfg.taxasMaquininha || {};
  const mensagens: Partial<MensagensWhatsapp> = cfg.mensagensWhatsapp || {};
  return {
    ...padrao,
    ...cfg,
    formatoImpressao: FORMATOS_IMPRESSAO.includes(cfg.formatoImpressao as FormatoImpressao)
      ? (cfg.formatoImpressao as FormatoImpressao)
      : 'A4',
    exibirPixImpressao: cfg.exibirPixImpressao ?? padrao.exibirPixImpressao,
    exibirContatosImpressao: cfg.exibirContatosImpressao ?? padrao.exibirContatosImpressao,
    taxasMaquininha: {
      debito: numeroEntre(taxas.debito, TAXAS_MAQUININHA_PADRAO.debito, 0, 100),
      credito1x: numeroEntre(taxas.credito1x, TAXAS_MAQUININHA_PADRAO.credito1x, 0, 100),
      credito2a3: numeroEntre(taxas.credito2a3, TAXAS_MAQUININHA_PADRAO.credito2a3, 0, 100),
      credito4a6: numeroEntre(taxas.credito4a6, TAXAS_MAQUININHA_PADRAO.credito4a6, 0, 100),
      credito7a12: numeroEntre(taxas.credito7a12, TAXAS_MAQUININHA_PADRAO.credito7a12, 0, 100),
    },
    prazoGarantiaDias: numeroEntre(cfg.prazoGarantiaDias, padrao.prazoGarantiaDias, 1, 3650),
    prazoAbandonoDias: numeroEntre(cfg.prazoAbandonoDias, padrao.prazoAbandonoDias, 1, 3650),
    prazoEntregaDiasUteis: Math.floor(numeroEntre(cfg.prazoEntregaDiasUteis, padrao.prazoEntregaDiasUteis, 0, 120)),
    prefixoOS: normalizarPrefixoOS(cfg.prefixoOS),
    checklistItensAtivos: Array.isArray(cfg.checklistItensAtivos) ? cfg.checklistItensAtivos : padrao.checklistItensAtivos,
    mensagensWhatsapp: {
      entrada: mensagens.entrada || MENSAGENS_WHATSAPP_PADRAO.entrada,
      orcamento: mensagens.orcamento || MENSAGENS_WHATSAPP_PADRAO.orcamento,
      pronto: mensagens.pronto || MENSAGENS_WHATSAPP_PADRAO.pronto,
      entrega: mensagens.entrega || MENSAGENS_WHATSAPP_PADRAO.entrega,
    },
  };
}

export const TERMOS_GARANTIA_PADRAO = `1. A garantia legal de 90 (noventa) dias cobre exclusivamente as peças substituídas e os serviços expressamente discriminados nesta ordem de serviço, contados a partir da data de entrega do dispositivo (Art. 26 do Código de Defesa do Consumidor).
2. A garantia será automaticamente invalidada em caso de: quedas, trincos, pressões mecânicas, oxidação/contato com líquidos, violação dos selos internos de segurança ou intervenção técnica efetuada por terceiros não autorizados.
3. Não nos responsabilizamos por perdas de dados, contas ou mídias armazenadas no dispositivo. Recomendamos expressamente a realização de backup prévio antes do reparo.
4. Conforme o Código Civil Brasileiro, aparelhos prontos não retirados no prazo superior a 90 dias após a notificação serão considerados abandonados, podendo ser descartados ou vendidos para custeio de despesas operacionais.`;

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
    taxasMaquininha: { ...TAXAS_MAQUININHA_PADRAO },
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
      window.localStorage.setItem(CHAVE_ESPELHO_SESSAO, JSON.stringify(configConta));
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
          window.localStorage.setItem(CHAVE_ESPELHO_SESSAO, JSON.stringify(restaurado));
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
            window.localStorage.setItem(CHAVE_ESPELHO_SESSAO, JSON.stringify(migrado));
            return migrado;
          }
        }
      }

      // 4. Conta sem configurações personalizadas prévias: inicializa cofre limpo da conta
      window.localStorage.setItem(chaveConta, JSON.stringify(padrao));
      window.localStorage.setItem(CHAVE_ESPELHO_SESSAO, JSON.stringify(padrao));
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
    window.localStorage.setItem(chaveConta, JSON.stringify(configFinal));
    window.localStorage.setItem(CHAVE_ESPELHO_SESSAO, JSON.stringify(configFinal));
    window.localStorage.setItem(
      CHAVE_USUARIO_ATIVO,
      JSON.stringify({
        id: user.id,
        email: user.email,
        user_metadata: {
          ...(user.user_metadata || {}),
          nome_assistencia: configFinal.nomeLoja,
          whatsapp: configFinal.telefone,
          cpf_cnpj: configFinal.cnpj,
          configuracoes_loja: configFinal,
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

/**
 * Taxa (%) da maquininha configurada na conta para a forma de pagamento e o número de parcelas.
 * Dinheiro, PIX e formas desconhecidas não têm taxa.
 */
export function obterTaxaMaquininha(forma: string, parcelas: number = 1): number {
  const taxas = obterConfiguracoesLojaSincrono().taxasMaquininha;
  if (forma === 'Cartão de débito') return taxas.debito;
  if (forma === 'Cartão de crédito') {
    if (parcelas <= 1) return taxas.credito1x;
    if (parcelas <= 3) return taxas.credito2a3;
    if (parcelas <= 6) return taxas.credito4a6;
    return taxas.credito7a12;
  }
  return 0;
}

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
    prazo_garantia: String(os?.possuiGarantia === false ? 0 : Number(os?.prazoGarantiaDias) || cfg.prazoGarantiaDias),
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
export function extrairCompetenciaDeDataOS(dataInput: any): string | null {
  if (!dataInput) return null;
  if (typeof dataInput === 'string') {
    const str = dataInput.trim();
    const matchIso = str.match(/^(\d{4})-(\d{2})/);
    if (matchIso) {
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

  const ordensDoPeriodo = filtrarOrdensPorCompetenciaMensal(ordens, competencia);
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
        window.localStorage.setItem(CHAVE_ESPELHO_SESSAO, JSON.stringify(configComOwner));
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
  if (!novaSenha || novaSenha.length < 6) throw new Error('A nova senha deve ter pelo menos 6 caracteres.');
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
      return dias;
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
 * Respeita qualquer prazo configurado (30, 90, 120, 180, 365 dias, etc.) sem limite fixo de 90 dias.
 */
export function obterPrazoGarantiaOS(os: any, servicosCadastrados?: any[]): number {
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
    const mIso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
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

  // 1. Regra prioritária: OS marcada como "Sem garantia" NUNCA permite retorno em garantia
  if (!verificarPossuiGarantiaOS(os)) {
    return {
      elegivel: false,
      codigo: 'SEM_GARANTIA',
      motivo: 'Esta Ordem de Serviço foi registrada sem garantia e não permite retorno em garantia.',
      prazoDias: 0,
      diasDecorridos: 0,
      diasRestantes: 0,
    };
  }

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
  const dataInicioRaw =
    os.data_inicio_garantia ||
    os.dataInicioGarantia ||
    checklist.__dataInicioGarantia ||
    os.data_abertura ||
    os.dataAbertura ||
    os.data_conclusao;

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
  // Prefixo configurável em Configurações › Operacional (padrão "OS-")
  const prefixoOS = obterConfiguracoesLojaSincrono().prefixoOS;
  const numeroOsGerado = `${prefixoOS}${Math.floor(100000 + Math.random() * 900000)}`;
  const idOsGerado = gerarId('os');

  let idClienteFinal = payload.cliente?.idCliente;
  if (!idClienteFinal && payload.cliente?.nome) {
    const { data: clienteExistente } = await supabase
      .from('clientes')
      .select('id_cliente')
      .ilike('nome', payload.cliente.nome.trim())
      .maybeSingle();

    if (clienteExistente?.id_cliente) {
      idClienteFinal = clienteExistente.id_cliente;
    } else {
      const novoIdCliente = gerarId('cli');
      const { error: erroCli } = await supabase.from('clientes').insert([{
        id_cliente: novoIdCliente,
        nome: payload.cliente.nome.trim(),
        whatsapp: payload.cliente.whatsapp || '',
      }]);
      if (!erroCli) idClienteFinal = novoIdCliente;
    }
  }

  if (!idClienteFinal) {
    idClienteFinal = crypto.randomUUID ? crypto.randomUUID() : 'cli_balcao';
    await supabase.from('clientes').upsert([{
      id_cliente: idClienteFinal,
      nome: 'Cliente Balcão',
      whatsapp: ''
    }], { onConflict: 'id_cliente' });
  }

  let idAparelhoFinal = payload.aparelho?.idAparelho;
  if (!idAparelhoFinal && payload.aparelho?.modelo) {
    const modeloStr = payload.aparelho.modelo.trim();
    const { data: aparelhoExistente } = await supabase
      .from('aparelhos_cliente')
      .select('id_aparelho')
      .eq('id_cliente', idClienteFinal)
      .ilike('modelo', modeloStr)
      .maybeSingle();

    if (aparelhoExistente?.id_aparelho) {
      idAparelhoFinal = aparelhoExistente.id_aparelho;
    } else {
      const novoIdAparelho = gerarId('apr');
      const { error: erroApr } = await supabase.from('aparelhos_cliente').insert([{
        id_aparelho: novoIdAparelho,
        id_cliente: idClienteFinal,
        modelo: modeloStr,
        imei_1: payload.aparelho?.imei1 || payload.aparelho?.imei || null
      }]);
      if (!erroApr) idAparelhoFinal = novoIdAparelho;
    }
  }

  if (!idAparelhoFinal) {
    idAparelhoFinal = crypto.randomUUID ? crypto.randomUUID() : 'apr_generico';
    await supabase.from('aparelhos_cliente').upsert([{
      id_aparelho: idAparelhoFinal,
      id_cliente: idClienteFinal,
      modelo: 'Smartphone Genérico',
    }], { onConflict: 'id_aparelho' });
  }

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
    forma_pagamento: payload.formaPagamento || 'Dinheiro',
    parcelas: payload.parcelas || 1,
    valor_liquido: valorLiqFinal,
    possui_garantia: possuiGarantiaFinal,
    data_abertura: payload.dataAbertura ? formatarDataParaBanco(payload.dataAbertura) : new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('ordens_servico')
    .insert([dadosParaSalvar])
    .select()
    .single();

  if (error) {
    throw new Error(error.message || 'Falha ao salvar Ordem de Serviço no Supabase');
  }

  return { 
    idOs: data?.id_os || idOsGerado, 
    numeroOs: data?.numero_os || numeroOsGerado 
  };
}

export async function editarOrdemServico(id_os: string, payload: any): Promise<void> {
  // 1. Busca a OS atual para sabermos o id_cliente, id_aparelho e metadados de garantia/pagamento
  const { data: osAtual, error: errBusca } = await supabase
    .from('ordens_servico')
    .select('id_cliente, id_aparelho, checklist_entrada, possui_garantia')
    .eq('id_os', id_os)
    .single();

  if (errBusca) throw new Error('Falha ao localizar Ordem de Serviço para edição.');

  // 2. Se o cliente foi alterado, atualiza na tabela de clientes
  if (payload.cliente?.nome && osAtual?.id_cliente) {
    await supabase
      .from('clientes')
      .update({
        nome: payload.cliente.nome.trim(),
        whatsapp: payload.cliente.whatsapp || '',
      })
      .eq('id_cliente', osAtual.id_cliente);
  }

  // 3. Se o aparelho foi alterado, atualiza na tabela de aparelhos
  if (payload.aparelho?.modelo && osAtual?.id_aparelho) {
    await supabase
      .from('aparelhos_cliente')
      .update({
        modelo: payload.aparelho.modelo.trim(),
        imei_1: payload.aparelho?.imei1 || payload.aparelho?.imei || null,
      })
      .eq('id_aparelho', osAtual.id_aparelho);
  }

  // 4. Prepara a atualização dos campos da Ordem de Serviço
  const dadosAtualizados: any = {};

  const defeito = payload.defeitoRelatado !== undefined ? payload.defeitoRelatado : payload.defeito_relatado;
  if (defeito !== undefined) dadosAtualizados.defeito_relatado = defeito;

  const status = payload.statusOs !== undefined ? payload.statusOs : (payload.status_os !== undefined ? payload.status_os : payload.statusOS);
  if (status !== undefined) dadosAtualizados.status_os = status;

  const formaPg = payload.formaPagamento !== undefined ? payload.formaPagamento : payload.forma_pagamento;
  if (formaPg !== undefined) dadosAtualizados.forma_pagamento = formaPg;

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
  if (
    payload.checklistEntrada !== undefined ||
    payload.pagamentos !== undefined ||
    payload.prazoGarantiaDias !== undefined ||
    possuiGarantiaInput !== undefined ||
    orc !== undefined
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

  const { error } = await supabase
    .from('ordens_servico')
    .update(dadosAtualizados)
    .eq('id_os', id_os);

  if (error) {
    throw new Error(error.message || 'Falha ao atualizar Ordem de Serviço');
  }
}

export async function buscarOrdensServico(): Promise<any[]> {
  try {
    const [{ data, error }, servicosCadastrados] = await Promise.all([
      supabase
        .from('ordens_servico')
        .select(`
          *,
          clientes:id_cliente (nome, whatsapp),
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
        servicoRealizado: item.servico_realizado || item.checklist_entrada?.__servicoNome || '',
        diagnostico: item.diagnostico_tecnico || '',
        observacoes: item.observacoes_internas || '',
        formaPagamento: item.forma_pagamento || 'PIX',
        parcelas: Number(item.parcelas || 1),
        valorLiquido: valorLiq,
        pagamentos: pagamentosLista,
        possuiGarantia: possuiGarantiaReal,
        prazoGarantiaDias: prazoGarantiaDiasReal,
        dataAbertura: item.data_abertura || '',
        cliente: {
          nome: item.clientes?.nome || item.cliente_nome || 'Cliente Balcão',
          whatsapp: item.clientes?.whatsapp || item.cliente_telefone || '',
        },
        aparelho: {
          modelo: item.aparelhos_cliente?.modelo || item.aparelho_modelo || 'Smartphone',
          imei1: item.aparelhos_cliente?.imei_1 || item.aparelho_imei || '',
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
    return [];
  }
}

export async function atualizarStatusOS(id_os: string, status_os: string): Promise<void> {
  const { error } = await supabase
    .from('ordens_servico')
    .update({ status_os })
    .eq('id_os', id_os);

  if (error) {
    throw new Error(error.message || 'Falha ao atualizar status');
  }
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

  const listaRetornos = extrairListaRetornosGarantia(osAtual.garantia_json);
  listaRetornos.push({
    ...garantia,
    prazoGarantiaDiasOriginal: validacao.prazoDias,
    diasDecorridosNoRetorno: validacao.diasDecorridos,
  });

  const { error } = await supabase
    .from('ordens_servico')
    .update({ garantia_json: listaRetornos })
    .eq('id_os', id_os);

  if (error) {
    throw new Error(error.message || 'Falha ao registrar garantia');
  }
}

export async function excluirOrdemServico(id_os: string): Promise<void> {
  const { error } = await supabase
    .from('ordens_servico')
    .delete()
    .eq('id_os', id_os);

  if (error) {
    throw new Error(error.message || 'Falha ao excluir a Ordem de Serviço');
  }
}