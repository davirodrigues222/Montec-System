import { supabase } from './supabaseClient';

// ==========================================
// 1. AUTENTICAÇÃO E GESTÃO DE ACESSO
// ==========================================

export async function fazerLogin(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
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
  const { data, error } = await supabase.auth.signUp({
    email: dados.email,
    password: dados.password,
    options: {
      data: {
        nome_responsavel: dados.nomeResponsavel,
        nome_assistencia: dados.nomeAssistencia,
        whatsapp: dados.whatsapp,
        cpf_cnpj: dados.cpfCnpj || '',
      },
    },
  });
  if (error) throw error;
  return data;
}

export async function recuperarSenha(email: string) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw error;
  return data;
}

export async function fazerLogout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ==========================================
// 2. ORÇAMENTO, GARANTIA E AUXILIARES
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
 * Obtém o prazo padrão de garantia configurado na loja (Configurações -> sig_apple_configs).
 * Caso não haja configuração salva no navegador, utiliza 90 dias como padrão inicial.
 */
export function obterPrazoGarantiaConfiguradoLoja(): number {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const chaves = ['sig_apple_configs', 'configuracoes_loja', 'dados_loja', 'configuracoes'];
      for (const chave of chaves) {
        const raw = window.localStorage.getItem(chave);
        if (raw) {
          const parsed = JSON.parse(raw);
          const dias = extrairDiasGarantia(
            parsed?.prazoGarantiaDias ?? parsed?.prazo_garantia_dias ?? parsed?.prazoGarantia
          );
          if (dias !== null && dias > 0) {
            return dias;
          }
        }
      }
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
    // Se começar com YYYY-MM-DD, extrai os componentes da data diretamente para evitar desvios de fuso horário
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

export async function calcularOrcamento(
  itens: any[],
  descontoGeral: { valor: number } = { valor: 0 }
): Promise<any> {
  const custoPeca = Number(itens[0]?.custoPeca) || 0;
  const freteReal = Number(itens[0]?.freteReal) || 0;
  const desconto = Number(descontoGeral?.valor) || 0;
  const subtotalEstimado = custoPeca * 2 + freteReal;
  const valorTotal = Math.max(0, subtotalEstimado - desconto);

  return {
    subtotalServicos: subtotalEstimado,
    descontoGeralAplicado: desconto,
    valorTotalOrcamento: valorTotal,
    lucroTotalEstimadoInterno: valorTotal - (custoPeca + freteReal),
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

// ==========================================
// 3. ORDENS DE SERVIÇO (CRIAÇÃO, RASCUNHO E EDIÇÃO)
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
  const numeroOsGerado = `OS-${Math.floor(100000 + Math.random() * 900000)}`;
  const idOsGerado = crypto.randomUUID ? crypto.randomUUID() : 'os_' + Math.random().toString(36).substring(2, 11);

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
      const novoIdCliente = crypto.randomUUID ? crypto.randomUUID() : 'cli_' + Math.random().toString(36).substring(2, 11);
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
      const novoIdAparelho = crypto.randomUUID ? crypto.randomUUID() : 'apr_' + Math.random().toString(36).substring(2, 11);
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
  if (
    payload.checklistEntrada !== undefined ||
    payload.pagamentos !== undefined ||
    payload.prazoGarantiaDias !== undefined ||
    possuiGarantiaInput !== undefined
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
      let garantiaRaw = item.garantia_json;
      if (typeof garantiaRaw === 'string') {
        try { garantiaRaw = JSON.parse(garantiaRaw); } catch (e) { garantiaRaw = null; }
      }

      let listaRetornos: any[] = [];
      if (Array.isArray(garantiaRaw)) {
        listaRetornos = garantiaRaw;
      } else if (garantiaRaw && typeof garantiaRaw === 'object') {
        if (Array.isArray(garantiaRaw.listaRetornos)) {
          listaRetornos = garantiaRaw.listaRetornos;
        } else {
          listaRetornos = [garantiaRaw];
        }
      }

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
      const pagamentosRaw = item.checklist_entrada?.__pagamentos || (item as any).pagamentos || item.orcamentoCalculado?.pagamentos;
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

      const possuiGarantiaReal = verificarPossuiGarantiaOS(item);
      const prazoGarantiaDiasReal = obterPrazoGarantiaOS(item, servicosCadastrados);

      return {
        ...item,
        id_os: item.id_os,
        numero_os: item.numero_os,
        status_os: item.status_os || 'AGUARDANDO_AVALIACAO',
        defeitoRelatado: item.defeito_relatado || '',
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
          subtotalServicos: Number(item.subtotal_servicos || valorBruto),
          tipoDesconto: item.tipo_desconto || 'VALOR',
          descontoGeralAplicado: Number(item.desconto_valor || 0),
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

  let listaRetornos: any[] = [];
  let garantiaRaw = osAtual?.garantia_json;

  if (typeof garantiaRaw === 'string') {
    try { garantiaRaw = JSON.parse(garantiaRaw); } catch (e) { garantiaRaw = null; }
  }

  if (Array.isArray(garantiaRaw)) {
    listaRetornos = garantiaRaw;
  } else if (garantiaRaw && typeof garantiaRaw === 'object') {
    if (Array.isArray(garantiaRaw.listaRetornos)) {
      listaRetornos = garantiaRaw.listaRetornos;
    } else {
      listaRetornos = [garantiaRaw];
    }
  }

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