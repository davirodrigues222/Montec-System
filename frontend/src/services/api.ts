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
// 2. ORÇAMENTO E AUXILIARES
// ==========================================

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
  formaPagamento?: string;
  parcelas?: number;
  valorLiquido?: number | null;
  status_os?: string;
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

  const dadosParaSalvar: any = {
    id_os: idOsGerado,
    numero_os: numeroOsGerado,
    id_cliente: idClienteFinal,
    id_aparelho: idAparelhoFinal,
    defeito_relatado: payload.defeitoRelatado || '',
    diagnostico_tecnico: payload.diagnostico || '',
    observacoes_internas: payload.observacoes || '',
    status_os: payload.status_os || 'AGUARDANDO_AVALIACAO',
    checklist_entrada: payload.checklistEntrada || {},
    valor_total: payload.orcamentoCalculado?.valorTotalOrcamento || 0,
    lucro_estimado_total: payload.orcamentoCalculado?.lucroTotalEstimadoInterno || 0,
    custo_peca: payload.orcamentoCalculado?.custoPeca || 0,
    frete_real: payload.orcamentoCalculado?.freteReal || 0,
    forma_pagamento: payload.formaPagamento || 'Dinheiro',
    parcelas: payload.parcelas || 1,
    valor_liquido: payload.valorLiquido || payload.orcamentoCalculado?.valorTotalOrcamento || 0,
    possui_garantia: payload.possuiGarantia ?? true,
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
  // 1. Busca a OS atual para sabermos o id_cliente e o id_aparelho associados
  const { data: osAtual, error: errBusca } = await supabase
    .from('ordens_servico')
    .select('id_cliente, id_aparelho')
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

  if (payload.checklistEntrada !== undefined) {
    dadosAtualizados.checklist_entrada = payload.checklistEntrada;
  }

  const dataAberturaInput = payload.dataAbertura !== undefined ? payload.dataAbertura : payload.data_abertura;
  if (dataAberturaInput) {
    dadosAtualizados.data_abertura = formatarDataParaBanco(dataAberturaInput);
  }

  if (payload.orcamentoCalculado?.valorTotalOrcamento !== undefined) {
    dadosAtualizados.valor_total = payload.orcamentoCalculado.valorTotalOrcamento;
    dadosAtualizados.valor_liquido = payload.orcamentoCalculado.valorTotalOrcamento;
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
  if (payload.valor_liquido !== undefined) {
    dadosAtualizados.valor_liquido = payload.valor_liquido;
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
    const { data, error } = await supabase
      .from('ordens_servico')
      .select(`
        *,
        clientes:id_cliente (nome, whatsapp),
        aparelhos_cliente:id_aparelho (modelo, imei_1)
      `)
      .order('data_abertura', { ascending: false });

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
      const valorLiq = Number(item.valor_liquido || valorBruto);
      const pecaBase = Number(item.custo_peca || 0);
      const freteBase = Number(item.frete_real || 0);

      const lucroLiquidoReal = valorLiq - (pecaBase + freteBase + custoTotalGarantiaOS);

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
        possuiGarantia: item.possui_garantia ?? true,
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
        },
        checklistEntrada: item.checklist_entrada || {},
        garantia: listaRetornos.length > 0 || custoTotalGarantiaOS > 0 ? {
          listaRetornos,
          custoTotalGarantia: custoTotalGarantiaOS,
          custoPecaGarantia: custoTotalGarantiaOS,
          totalVoltas: listaRetornos.length || 1
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
  const { data: osAtual, error: errBusca } = await supabase
    .from('ordens_servico')
    .select('garantia_json')
    .eq('id_os', id_os)
    .single();

  if (errBusca) throw new Error('Falha ao localizar OS para registrar garantia.');

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

  listaRetornos.push(garantia);

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