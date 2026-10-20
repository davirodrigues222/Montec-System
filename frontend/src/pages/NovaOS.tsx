import React, { useState, useEffect, useMemo } from 'react';
import { criarOrdemServico } from '../services/api';
import { supabase } from '../services/supabaseClient';
import { CertidaoGarantia } from '../components/CertidaoGarantia';

interface Props {
  onNavigate?: (tab: 'dashboard' | 'relatorios' | 'historico' | 'configuracoes' | 'nova-os' | 'garantia-retorno' | 'cadastros') => void;
}

export const NovaOS: React.FC<Props> = ({ onNavigate }) => {
  const [listaClientes, setListaClientes] = useState<any[]>([]);
  const [listaFornecedores, setListaFornecedores] = useState<any[]>([]);
  const [listaServicos, setListaServicos] = useState<any[]>([]);

  // Topo: Cobertura
  const [possuiGarantia, setPossuiGarantia] = useState<boolean>(true);

  // Card 01: Cliente
  const [idClienteSelecionado, setIdClienteSelecionado] = useState('');
  const [nomeCliente, setNomeCliente] = useState('');
  const [whatsappCliente, setWhatsappCliente] = useState('');
  const [cpfCnpjCliente, setCpfCnpjCliente] = useState('');

  // Card 02: Aparelho e datas
  const [modeloAparelho, setModeloAparelho] = useState('');
  const [imeiAparelho, setImeiAparelho] = useState('');
  const [senhaAparelho, setSenhaAparelho] = useState('');
  const [dataAbertura, setDataAbertura] = useState(new Date().toISOString().substring(0, 10));
  const [dataPrevista, setDataPrevista] = useState('');

  // Card 03: Serviço, diagnóstico e custos
  const [servicoPadraoId, setServicoPadraoId] = useState('');
  const [defeitoRelatado, setDefeitoRelatado] = useState('');
  const [diagnostico, setDiagnostico] = useState('');
  const [observacoes, setObservacoes] = useState('');

  const [custoPeca, setCustoPeca] = useState<number | ''>('');
  const [freteReal, setFreteReal] = useState<number | ''>(0);
  const [fornecedorPeca, setFornecedorPeca] = useState('');
  const [tipoDesconto, setTipoDesconto] = useState<'VALOR' | 'PERCENTUAL'>('VALOR');
  const [descontoCliente, setDescontoCliente] = useState<number | ''>('');
  const [valorServico, setValorServico] = useState<number | ''>('');

  // ================= ESTADOS DE PAGAMENTO (ÚNICO OU DIVIDIDO) =================
  const [dividirPagamento, setDividirPagamento] = useState(false);

  // Forma 1
  const [formaPagamento1, setFormaPagamento1] = useState('Cartão de crédito');
  const [valorPg1, setValorPg1] = useState<number | ''>('');
  const [parcelas1, setParcelas1] = useState(1);
  const [taxaMaquinetaPercentual1, setTaxaMaquinetaPercentual1] = useState<number | ''>(3.19);

  // Forma 2 (quando dividirPagamento === true)
  const [formaPagamento2, setFormaPagamento2] = useState('Dinheiro');
  const [valorPg2, setValorPg2] = useState<number | ''>('');
  const [parcelas2, setParcelas2] = useState(1);
  const [taxaMaquinetaPercentual2, setTaxaMaquinetaPercentual2] = useState<number | ''>(0);

  // Checklist de Entrada
  const [mostrarChecklist, setMostrarChecklist] = useState(false);
  const [checklist, setChecklist] = useState<Record<string, string>>({
    ligando: 'OK',
    touchScreen: 'OK',
    display: 'OK',
    cameraTraseira: 'OK',
    cameraFrontal: 'OK',
    microfone: 'OK',
    altoFalante: 'OK',
    conectorCarga: 'OK',
    bateria: 'OK',
    wifi: 'OK',
    bluetooth: 'OK',
    botoesLaterais: 'OK',
  });

  const [carregando, setCarregando] = useState(false);
  const [osCriadaSucesso, setOsCriadaSucesso] = useState<{ idOs: string; numeroOs: string; dadosCompletos?: any } | null>(null);
  const [osParaImprimir, setOsParaImprimir] = useState<any>(null);

  useEffect(() => {
    const carregarDadosIniciais = async () => {
      try {
        const { data: dataCli } = await supabase.from('clientes').select('*').order('nome', { ascending: true });
        if (dataCli) setListaClientes(dataCli);

        const { data: dataForn } = await supabase.from('cad_fornecedores').select('*').order('nome', { ascending: true });
        if (dataForn) setListaFornecedores(dataForn);

        const { data: dataServ } = await supabase.from('cad_servicos').select('*').order('nome', { ascending: true });
        if (dataServ) setListaServicos(dataServ);
      } catch (err) {
        console.error('Erro ao carregar dados auxiliares:', err);
      }
    };
    carregarDadosIniciais();
  }, []);

  // Selecionar Cliente
  const handleSelecionarCliente = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setIdClienteSelecionado(id);
    const cli = listaClientes.find((c) => c.id_cliente === id || c.id === id);
    if (cli) {
      setNomeCliente(cli.nome || '');
      setWhatsappCliente(cli.whatsapp || cli.telefone || '');
      setCpfCnpjCliente(cli.cpf_cnpj || cli.cpf || '');
    } else {
      setNomeCliente('');
      setWhatsappCliente('');
      setCpfCnpjCliente('');
    }
  };

  // Selecionar Serviço Padrão
  const handleSelecionarServico = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setServicoPadraoId(id);
    const serv = listaServicos.find((s) => s.id_servico === id || s.id === id);
    if (serv) {
      setDefeitoRelatado(serv.nome);
      if (serv.preco_sugerido || serv.preco) {
        setValorServico(Number(serv.preco_sugerido || serv.preco));
      }
    }
  };

  // ================= REGRAS DE TAXAS DE MAQUINETA =================
  const obterTaxaPadrao = (forma: string, p: number = 1): number => {
    if (forma === 'Dinheiro' || forma === 'PIX') return 0;
    if (forma === 'Cartão de débito') return 1.49;
    if (forma === 'Cartão de crédito') {
      if (p === 1) return 3.19;
      if (p <= 3) return 4.89;
      if (p <= 6) return 6.49;
      return 8.99;
    }
    return 0;
  };

  // Ajuste automático de taxa e parcelas conforme forma 1
  useEffect(() => {
    if (formaPagamento1 === 'Dinheiro' || formaPagamento1 === 'PIX') {
      setTaxaMaquinetaPercentual1(0);
      setParcelas1(1);
    } else if (formaPagamento1 === 'Cartão de débito') {
      setTaxaMaquinetaPercentual1(1.49);
      setParcelas1(1);
    } else if (formaPagamento1 === 'Cartão de crédito') {
      setTaxaMaquinetaPercentual1(obterTaxaPadrao('Cartão de crédito', parcelas1));
    }
  }, [formaPagamento1, parcelas1]);

  // Ajuste automático de taxa e parcelas conforme forma 2
  useEffect(() => {
    if (formaPagamento2 === 'Dinheiro' || formaPagamento2 === 'PIX') {
      setTaxaMaquinetaPercentual2(0);
      setParcelas2(1);
    } else if (formaPagamento2 === 'Cartão de débito') {
      setTaxaMaquinetaPercentual2(1.49);
      setParcelas2(1);
    } else if (formaPagamento2 === 'Cartão de crédito') {
      setTaxaMaquinetaPercentual2(obterTaxaPadrao('Cartão de crédito', parcelas2));
    }
  }, [formaPagamento2, parcelas2]);

  // ================= CÁLCULOS FINANCEIROS DO CARD 03 =================
  const numPrecoServico = Number(valorServico) || 0;
  const numDescontoInput = Number(descontoCliente) || 0;

  const descontoCalculado = useMemo(() => {
    if (tipoDesconto === 'PERCENTUAL') {
      return (numPrecoServico * numDescontoInput) / 100;
    }
    return numDescontoInput;
  }, [numPrecoServico, numDescontoInput, tipoDesconto]);

  const valorCobrado = Math.max(0, numPrecoServico - descontoCalculado);

  // Valores distribuídos entre as formas
  const numValorPg1 = dividirPagamento ? (Number(valorPg1) || 0) : valorCobrado;
  const numValorPg2 = dividirPagamento ? (Number(valorPg2) || 0) : 0;
  const somaPagamentos = dividirPagamento ? (numValorPg1 + numValorPg2) : valorCobrado;
  const saldoRestante = Math.round((valorCobrado - somaPagamentos) * 100) / 100;

  // Taxa individual Forma 1 (nunca cobra sobre Dinheiro ou PIX)
  const numTaxa1 = (formaPagamento1 === 'Dinheiro' || formaPagamento1 === 'PIX')
    ? 0
    : (Number(taxaMaquinetaPercentual1) || 0);
  const valorTaxa1 = (numValorPg1 * numTaxa1) / 100;
  const liquidoPg1 = Math.max(0, numValorPg1 - valorTaxa1);

  // Taxa individual Forma 2 (nunca cobra sobre Dinheiro ou PIX)
  const numTaxa2 = (formaPagamento2 === 'Dinheiro' || formaPagamento2 === 'PIX')
    ? 0
    : (Number(taxaMaquinetaPercentual2) || 0);
  const valorTaxa2 = dividirPagamento ? ((numValorPg2 * numTaxa2) / 100) : 0;
  const liquidoPg2 = dividirPagamento ? Math.max(0, numValorPg2 - valorTaxa2) : 0;

  // Totais consolidados
  const totalTaxaMaquineta = valorTaxa1 + valorTaxa2;
  const liquidoRecebido = liquidoPg1 + liquidoPg2;

  const numCustoPeca = Number(custoPeca) || 0;
  const numFreteReal = Number(freteReal) || 0;
  const lucroEstimado = liquidoRecebido - (numCustoPeca + numFreteReal);

  // Estrutura de dados dos pagamentos para salvar no banco
  const gerarDadosPagamento = () => {
    if (!dividirPagamento) {
      const descForma = formaPagamento1 === 'Cartão de crédito' && parcelas1 > 1
        ? `${formaPagamento1} (${parcelas1}x)`
        : formaPagamento1;

      const pgs = [
        {
          id: 'pg_1',
          forma: formaPagamento1,
          valor: valorCobrado,
          parcelas: formaPagamento1 === 'Cartão de crédito' ? parcelas1 : 1,
          taxaPercentual: numTaxa1,
          valorTaxa: valorTaxa1,
          valorLiquido: liquidoPg1,
        },
      ];

      return {
        formaPagamentoTexto: descForma,
        parcelasFinal: formaPagamento1 === 'Cartão de crédito' ? parcelas1 : 1,
        pagamentosArray: pgs,
      };
    }

    const desc1 = formaPagamento1 === 'Cartão de crédito' && parcelas1 > 1
      ? `${formaPagamento1} (${parcelas1}x - R$ ${numValorPg1.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
      : `${formaPagamento1} (R$ ${numValorPg1.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;

    const desc2 = formaPagamento2 === 'Cartão de crédito' && parcelas2 > 1
      ? `${formaPagamento2} (${parcelas2}x - R$ ${numValorPg2.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
      : `${formaPagamento2} (R$ ${numValorPg2.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;

    const parcelasFinal = formaPagamento1 === 'Cartão de crédito'
      ? parcelas1
      : (formaPagamento2 === 'Cartão de crédito' ? parcelas2 : 1);

    const pgs = [
      {
        id: 'pg_1',
        forma: formaPagamento1,
        valor: numValorPg1,
        parcelas: formaPagamento1 === 'Cartão de crédito' ? parcelas1 : 1,
        taxaPercentual: numTaxa1,
        valorTaxa: valorTaxa1,
        valorLiquido: liquidoPg1,
      },
      {
        id: 'pg_2',
        forma: formaPagamento2,
        valor: numValorPg2,
        parcelas: formaPagamento2 === 'Cartão de crédito' ? parcelas2 : 1,
        taxaPercentual: numTaxa2,
        valorTaxa: valorTaxa2,
        valorLiquido: liquidoPg2,
      },
    ];

    return {
      formaPagamentoTexto: `${desc1} + ${desc2}`,
      parcelasFinal,
      pagamentosArray: pgs,
    };
  };

  // Submissão do Formulário
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nomeCliente.trim() || !modeloAparelho.trim() || !defeitoRelatado.trim()) {
      alert('Preencha os campos obrigatórios (*): Nome do Cliente, Modelo do Aparelho e Defeito Relatado.');
      return;
    }

    if (numPrecoServico <= 0) {
      alert('Informe o Valor do Serviço (*) antes de criar a ordem.');
      return;
    }

    // Validação de pagamentos combinados
    if (dividirPagamento) {
      if (numValorPg1 <= 0 || numValorPg2 <= 0) {
        alert('Ao dividir o pagamento, informe valores maiores que zero para as duas formas.');
        return;
      }
      if (Math.abs(saldoRestante) >= 0.01) {
        alert(`A soma das formas de pagamento (R$ ${somaPagamentos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) deve ser exatamente igual ao total cobrado (R$ ${valorCobrado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).\n\nAjuste a diferença de R$ ${Math.abs(saldoRestante).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} antes de prosseguir.`);
        return;
      }
    }

    setCarregando(true);
    try {
      const { formaPagamentoTexto, parcelasFinal, pagamentosArray } = gerarDadosPagamento();

      const payload = {
        cliente: {
          idCliente: idClienteSelecionado || undefined,
          nome: nomeCliente.trim(),
          whatsapp: whatsappCliente.trim(),
          cpfCnpj: cpfCnpjCliente.trim(),
        },
        aparelho: {
          modelo: modeloAparelho.trim(),
          imei1: imeiAparelho.trim(),
          senhaDesbloqueio: senhaAparelho.trim(),
        },
        defeitoRelatado: defeitoRelatado.trim(),
        diagnostico: diagnostico.trim(),
        servicoRealizado: defeitoRelatado.trim(),
        observacoes: (diagnostico || observacoes).trim(),
        dataAbertura: dataAbertura,
        dataPrevistaEntrega: dataPrevista || undefined,
        formaPagamento: formaPagamentoTexto,
        parcelas: parcelasFinal,
        valorLiquido: liquidoRecebido,
        possuiGarantia: possuiGarantia,
        checklistEntrada: {
          ...checklist,
          __pagamentos: pagamentosArray,
        },
        pagamentos: pagamentosArray,
        orcamentoCalculado: {
          subtotalServicos: numPrecoServico,
          descontoGeralAplicado: descontoCalculado,
          tipoDesconto: tipoDesconto,
          valorTotalOrcamento: valorCobrado,
          custoPeca: numCustoPeca,
          freteReal: numFreteReal,
          fornecedorPeca: fornecedorPeca,
          lucroTotalEstimadoInterno: lucroEstimado,
          totalTaxaMaquineta: totalTaxaMaquineta,
          pagamentos: pagamentosArray,
        },
      };

      const resultado = await criarOrdemServico(payload);

      setOsCriadaSucesso({
        idOs: resultado.idOs,
        numeroOs: resultado.numeroOs,
        dadosCompletos: {
          id_os: resultado.idOs,
          numero_os: resultado.numeroOs,
          ...payload,
          data_abertura: dataAbertura,
        },
      });
    } catch (err: any) {
      console.error('Erro ao criar OS:', err);
      alert(`Falha ao salvar Ordem de Serviço: ${err.message || 'Verifique sua conexão.'}`);
    } finally {
      setCarregando(false);
    }
  };

  // Salvar OS em modo Rascunho
  const handleSalvarRascunho = async () => {
    const nomeValido = nomeCliente.trim();
    const modeloValido = modeloAparelho.trim();

    if (!nomeValido && !modeloValido) {
      alert('Para salvar como rascunho, preencha ao menos o Nome do Cliente ou o Modelo do Aparelho.');
      return;
    }

    setCarregando(true);
    try {
      const { formaPagamentoTexto, parcelasFinal, pagamentosArray } = gerarDadosPagamento();

      const payload = {
        cliente: {
          idCliente: idClienteSelecionado || undefined,
          nome: nomeValido || 'Cliente a Definir',
          whatsapp: whatsappCliente.trim(),
          cpfCnpj: cpfCnpjCliente.trim(),
        },
        aparelho: {
          modelo: modeloValido || 'Aparelho em Avaliação',
          imei1: imeiAparelho.trim(),
          senhaDesbloqueio: senhaAparelho.trim(),
        },
        defeitoRelatado: defeitoRelatado.trim() || 'Defeito a diagnosticar',
        diagnostico: diagnostico.trim(),
        servicoRealizado: defeitoRelatado.trim() || 'Aguardando diagnóstico',
        observacoes: (diagnostico || observacoes).trim(),
        dataAbertura: dataAbertura,
        dataPrevistaEntrega: dataPrevista || undefined,
        formaPagamento: formaPagamentoTexto,
        parcelas: parcelasFinal,
        valorLiquido: liquidoRecebido,
        possuiGarantia: possuiGarantia,
        checklistEntrada: {
          ...checklist,
          __pagamentos: pagamentosArray,
        },
        pagamentos: pagamentosArray,
        orcamentoCalculado: {
          subtotalServicos: numPrecoServico,
          descontoGeralAplicado: descontoCalculado,
          tipoDesconto: tipoDesconto,
          valorTotalOrcamento: valorCobrado,
          custoPeca: numCustoPeca,
          freteReal: numFreteReal,
          fornecedorPeca: fornecedorPeca,
          lucroTotalEstimadoInterno: lucroEstimado,
          totalTaxaMaquineta: totalTaxaMaquineta,
          pagamentos: pagamentosArray,
        },
        status_os: 'RASCUNHO',
      };

      const resultado = await criarOrdemServico(payload as any);

      alert(`✅ Rascunho da OS ${resultado.numeroOs} salvo com sucesso!\n\nEle está disponível na aba "Rascunhos / Em Definição" no histórico de ordens.`);
      handleLimparFormulario();
      if (onNavigate) {
        onNavigate('historico');
      }
    } catch (err: any) {
      console.error('Erro ao salvar rascunho:', err);
      alert(`Falha ao salvar rascunho: ${err.message || 'Verifique sua conexão.'}`);
    } finally {
      setCarregando(false);
    }
  };

  const handleLimparFormulario = () => {
    setIdClienteSelecionado('');
    setNomeCliente('');
    setWhatsappCliente('');
    setCpfCnpjCliente('');
    setModeloAparelho('');
    setImeiAparelho('');
    setSenhaAparelho('');
    setServicoPadraoId('');
    setDefeitoRelatado('');
    setDiagnostico('');
    setObservacoes('');
    setDataAbertura(new Date().toISOString().substring(0, 10));
    setDataPrevista('');
    setPossuiGarantia(true);
    setCustoPeca('');
    setFreteReal(0);
    setFornecedorPeca('');
    setTipoDesconto('VALOR');
    setDescontoCliente('');
    setValorServico('');

    // Reset pagamentos
    setDividirPagamento(false);
    setFormaPagamento1('Cartão de crédito');
    setParcelas1(1);
    setTaxaMaquinetaPercentual1(3.19);
    setValorPg1('');

    setFormaPagamento2('Dinheiro');
    setParcelas2(1);
    setTaxaMaquinetaPercentual2(0);
    setValorPg2('');

    setChecklist({
      ligando: 'OK',
      touchScreen: 'OK',
      display: 'OK',
      cameraTraseira: 'OK',
      cameraFrontal: 'OK',
      microfone: 'OK',
      altoFalante: 'OK',
      conectorCarga: 'OK',
      bateria: 'OK',
      wifi: 'OK',
      bluetooth: 'OK',
      botoesLaterais: 'OK',
    });
    setOsCriadaSucesso(null);
  };

  const labelsChecklist: Record<string, string> = {
    ligando: 'Ligando',
    touchScreen: 'Touch screen',
    display: 'Display',
    cameraTraseira: 'Câmera traseira',
    cameraFrontal: 'Câmera frontal',
    microfone: 'Microfone',
    altoFalante: 'Alto-falante',
    conectorCarga: 'Conector de carga',
    bateria: 'Bateria',
    wifi: 'Wi-Fi',
    bluetooth: 'Bluetooth',
    botoesLaterais: 'Botões laterais',
  };

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto font-sans pb-12">
      {/* ================= CABEÇALHO (FIGMA) ================= */}
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Nova ordem de serviço
        </h2>
        <p className="text-xs text-zinc-400 mt-1">
          Abertura ágil com identificação do cliente, diagnóstico e fechamento financeiro com taxas automáticas.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ================= BARRA DE COBERTURA (GARANTIA) ================= */}
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center space-x-3">
            <span className="text-sm font-bold text-white tracking-wide uppercase">Cobertura de garantia:</span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
              possuiGarantia
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
            }`}>
              {possuiGarantia ? 'Garantia Padrão Ativa (90 dias)' : 'Sem Garantia'}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setPossuiGarantia(true)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                possuiGarantia ? 'bg-blue-600 text-white font-bold' : 'bg-zinc-900 text-zinc-400 hover:text-white'
              }`}
            >
              Com garantia
            </button>
            <button
              type="button"
              onClick={() => setPossuiGarantia(false)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                !possuiGarantia ? 'bg-zinc-700 text-white font-bold' : 'bg-zinc-900 text-zinc-400 hover:text-white'
              }`}
            >
              Sem garantia
            </button>
          </div>
        </div>

        {/* ================= CARD 01: DADOS DO CLIENTE ================= */}
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
            <div className="flex items-center space-x-2.5">
              <span className="w-6 h-6 rounded-lg bg-blue-600/15 border border-blue-500/30 text-blue-400 flex items-center justify-center text-xs font-bold">
                01
              </span>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Dados do cliente
              </h3>
            </div>
            <span className="text-[11px] text-zinc-400">Vincule um cadastro existente ou preencha avulso</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                CLIENTE CADASTRADO
              </label>
              <select
                value={idClienteSelecionado}
                onChange={handleSelecionarCliente}
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition cursor-pointer"
              >
                <option value="">Cliente avulso / novo</option>
                {listaClientes.map((c) => (
                  <option key={c.id_cliente || c.id} value={c.id_cliente || c.id}>
                    {c.nome} {c.whatsapp ? `(${c.whatsapp})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                NOME COMPLETO *
              </label>
              <input
                type="text"
                required
                value={nomeCliente}
                onChange={(e) => setNomeCliente(e.target.value)}
                placeholder="Ex: João Silva"
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                WHATSAPP / TELEFONE
              </label>
              <input
                type="text"
                value={whatsappCliente}
                onChange={(e) => setWhatsappCliente(e.target.value)}
                placeholder="(85) 99999-9999"
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                CPF / CNPJ
              </label>
              <input
                type="text"
                value={cpfCnpjCliente}
                onChange={(e) => setCpfCnpjCliente(e.target.value)}
                placeholder="000.000.000-00"
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>
        </div>

        {/* ================= CARD 02: APARELHO E DATAS ================= */}
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
            <div className="flex items-center space-x-2.5">
              <span className="w-6 h-6 rounded-lg bg-blue-600/15 border border-blue-500/30 text-blue-400 flex items-center justify-center text-xs font-bold">
                02
              </span>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Aparelho, Defeito e Prazos
              </h3>
            </div>
            <span className="text-[11px] text-zinc-400">Identificação do dispositivo e diagnóstico</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                MODELO DO APARELHO *
              </label>
              <input
                type="text"
                required
                value={modeloAparelho}
                onChange={(e) => setModeloAparelho(e.target.value)}
                placeholder="Ex: iPhone 13 128GB"
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                IMEI / Nº DE SÉRIE
              </label>
              <input
                type="text"
                value={imeiAparelho}
                onChange={(e) => setImeiAparelho(e.target.value)}
                placeholder="Opcional"
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                SENHA DE DESBLOQUEIO
              </label>
              <input
                type="text"
                value={senhaAparelho}
                onChange={(e) => setSenhaAparelho(e.target.value)}
                placeholder="Para testes"
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                DATA DE ABERTURA
              </label>
              <input
                type="date"
                value={dataAbertura}
                onChange={(e) => setDataAbertura(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                PREVISÃO DE ENTREGA
              </label>
              <input
                type="date"
                value={dataPrevista}
                onChange={(e) => setDataPrevista(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 pt-2">
            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                DEFEITO RELATADO PELO CLIENTE *
              </label>
              <input
                type="text"
                required
                value={defeitoRelatado}
                onChange={(e) => setDefeitoRelatado(e.target.value)}
                placeholder="Ex: Não carrega e esquenta na tomada"
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                DIAGNÓSTICO TÉCNICO INICIAL / LAUDO
              </label>
              <input
                type="text"
                value={diagnostico}
                onChange={(e) => setDiagnostico(e.target.value)}
                placeholder="Ex: Conector de carga oxidado e bateria em 68%"
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>
        </div>

        {/* ================= CARD 03: VALORES E PAGAMENTO (FIGMA MAKE REFINADO) ================= */}
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
            <div className="flex items-center space-x-2.5">
              <span className="w-6 h-6 rounded-lg bg-blue-600/15 border border-blue-500/30 text-blue-400 flex items-center justify-center text-xs font-bold">
                03
              </span>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Custos, Desconto e Pagamento
              </h3>
            </div>
            <span className="text-[11px] text-zinc-400">Cálculo transparente de despesas, taxas e lucro líquido</span>
          </div>

          {/* Linha 1: Serviço Padrão Rápido */}
          <div>
            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
              CARREGAR SERVIÇO PADRÃO DO CATÁLOGO (OPCIONAL)
            </label>
            <select
              value={servicoPadraoId}
              onChange={handleSelecionarServico}
              className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition cursor-pointer"
            >
              <option value="">Selecione para preencher valor automaticamente...</option>
              {listaServicos.map((s) => (
                <option key={s.id_servico || s.id} value={s.id_servico || s.id}>
                  {s.nome} — R$ {Number(s.preco_sugerido || s.preco || 0).toFixed(2)}
                </option>
              ))}
            </select>
          </div>

          {/* Linha 2: Custos de Peça, Frete, Fornecedor, Desconto e Preço Base */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                CUSTO DA PEÇA (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={custoPeca}
                onChange={(e) => setCustoPeca(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                FRETE REAL (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={freteReal}
                onChange={(e) => setFreteReal(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                FORNECEDOR
              </label>
              <select
                value={fornecedorPeca}
                onChange={(e) => setFornecedorPeca(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition cursor-pointer"
              >
                <option value="">Selecione...</option>
                {listaFornecedores.map((f) => (
                  <option key={f.id_fornecedor || f.id} value={f.nome}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                DESCONTO AO CLIENTE
              </label>
              <div className="flex">
                <select
                  value={tipoDesconto}
                  onChange={(e) => setTipoDesconto(e.target.value as any)}
                  className="px-2.5 py-2.5 bg-[#080c14] border border-r-0 border-zinc-800/80 rounded-l-xl text-xs text-zinc-300 outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="VALOR">R$</option>
                  <option value="PERCENTUAL">%</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  value={descontoCliente}
                  onChange={(e) => setDescontoCliente(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-r-xl text-xs text-white outline-none focus:border-blue-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                VALOR DO SERVIÇO *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={valorServico}
                onChange={(e) => setValorServico(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white font-bold outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          {/* ================= SEÇÃO DE PAGAMENTO E TAXAS DA MAQUINETA ================= */}
          <div className="pt-3 border-t border-zinc-800/60 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-white tracking-wide uppercase">
                  FORMA DE PAGAMENTO E TAXAS
                </span>
                <span className="text-[11px] text-zinc-400">
                  {dividirPagamento ? '· Pagamento dividido em 2 formas' : '· Pagamento em forma única'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  const novoDividir = !dividirPagamento;
                  setDividirPagamento(novoDividir);
                  if (novoDividir) {
                    if (valorCobrado > 0) {
                      const metade = Math.round((valorCobrado / 2) * 100) / 100;
                      setValorPg1(metade);
                      setValorPg2(Math.round((valorCobrado - metade) * 100) / 100);
                    } else {
                      setValorPg1('');
                      setValorPg2('');
                    }
                  }
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center space-x-1.5 self-start sm:self-auto ${
                  dividirPagamento
                    ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                    : 'bg-[#080c14] border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700'
                }`}
              >
                <span>{dividirPagamento ? '✓ Dividindo em 2 formas' : '+ Dividir em 2 formas de pagamento'}</span>
              </button>
            </div>

            {/* --- MODO 1: FORMA DE PAGAMENTO ÚNICA --- */}
            {!dividirPagamento && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                    FORMA DE PAGAMENTO *
                  </label>
                  <select
                    value={formaPagamento1}
                    onChange={(e) => setFormaPagamento1(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition cursor-pointer"
                  >
                    <option value="Cartão de crédito">Cartão de crédito</option>
                    <option value="Cartão de débito">Cartão de débito</option>
                    <option value="PIX">PIX</option>
                    <option value="Dinheiro">Dinheiro</option>
                  </select>
                </div>

                {/* Parcelas: Exibido SOMENTE quando Cartão de crédito */}
                {formaPagamento1 === 'Cartão de crédito' ? (
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                      QUANTIDADE DE PARCELAS
                    </label>
                    <select
                      value={parcelas1}
                      onChange={(e) => setParcelas1(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition cursor-pointer"
                    >
                      {[1, 2, 3, 4, 5, 6, 10, 12].map((p) => (
                        <option key={p} value={p}>
                          {p}x {p === 1 ? '(à vista)' : '(sem juros)'}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="hidden lg:block" />
                )}

                {/* Taxa da Maquineta: Exibida SOMENTE para Cartão de crédito ou débito. OCULTA para Dinheiro e PIX! */}
                {formaPagamento1 === 'Cartão de crédito' || formaPagamento1 === 'Cartão de débito' ? (
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                      TAXA DA MAQUINETA (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={taxaMaquinetaPercentual1}
                      onChange={(e) => setTaxaMaquinetaPercentual1(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="0.00"
                      className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition"
                    />
                  </div>
                ) : (
                  <div className="hidden lg:block" />
                )}

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                    LÍQUIDO RECEBIDO (APÓS TAXA)
                  </label>
                  <div className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs font-bold text-emerald-400">
                    R$ {liquidoRecebido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            )}

            {/* --- MODO 2: PAGAMENTO COMBINADO EM 2 FORMAS --- */}
            {dividirPagamento && (
              <div className="space-y-4">
                {/* Banner de Validação da Distribuição com Saldo Restante */}
                <div
                  className={`p-3.5 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                    Math.abs(saldoRestante) < 0.01 && numValorPg1 > 0 && numValorPg2 > 0
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : saldoRestante > 0
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold">
                      {Math.abs(saldoRestante) < 0.01 && numValorPg1 > 0 && numValorPg2 > 0 ? '✓' : '⚠️'}
                    </span>
                    <span>
                      Total devido: <strong className="font-bold text-white">R$ {valorCobrado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> |
                      Distribuído: <strong className="font-bold text-white">R$ {somaPagamentos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </span>
                  </div>
                  <div>
                    {Math.abs(saldoRestante) < 0.01 && numValorPg1 > 0 && numValorPg2 > 0 ? (
                      <span className="font-bold text-emerald-400">✓ 100% distribuído corretamente</span>
                    ) : saldoRestante > 0 ? (
                      <span className="font-bold text-amber-400">Falta distribuir: R$ {saldoRestante.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    ) : (
                      <span className="font-bold text-rose-400">Excedeu em: R$ {Math.abs(saldoRestante).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Bloco 1: 1ª Forma de Pagamento */}
                  <div className="bg-[#080c14] border border-zinc-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                      <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                        1ª Forma de Pagamento
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        Líquido: <strong className="text-emerald-400">R$ {liquidoPg1.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                          MODALIDADE *
                        </label>
                        <select
                          value={formaPagamento1}
                          onChange={(e) => setFormaPagamento1(e.target.value)}
                          className="w-full px-3 py-2 bg-[#0c101a] border border-zinc-800 rounded-xl text-xs text-white outline-none focus:border-blue-500 cursor-pointer"
                        >
                          <option value="Cartão de crédito">Cartão de crédito</option>
                          <option value="Cartão de débito">Cartão de débito</option>
                          <option value="PIX">PIX</option>
                          <option value="Dinheiro">Dinheiro</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                          VALOR DESTINADO (R$) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={valorPg1}
                          onChange={(e) => setValorPg1(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="0.00"
                          className="w-full px-3 py-2 bg-[#0c101a] border border-zinc-800 rounded-xl text-xs text-white font-bold outline-none focus:border-blue-500"
                        />
                      </div>

                      {/* Parcelas: SOMENTE para Cartão de crédito */}
                      {formaPagamento1 === 'Cartão de crédito' && (
                        <div>
                          <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                            PARCELAS
                          </label>
                          <select
                            value={parcelas1}
                            onChange={(e) => setParcelas1(Number(e.target.value))}
                            className="w-full px-3 py-2 bg-[#0c101a] border border-zinc-800 rounded-xl text-xs text-white outline-none focus:border-blue-500 cursor-pointer"
                          >
                            {[1, 2, 3, 4, 5, 6, 10, 12].map((p) => (
                              <option key={p} value={p}>
                                {p}x {p === 1 ? '(à vista)' : '(sem juros)'}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Taxa Maquineta: SOMENTE para Crédito ou Débito. Oculta para Dinheiro e PIX! */}
                      {(formaPagamento1 === 'Cartão de crédito' || formaPagamento1 === 'Cartão de débito') && (
                        <div>
                          <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                            TAXA MAQUINETA (%)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={taxaMaquinetaPercentual1}
                            onChange={(e) => setTaxaMaquinetaPercentual1(e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder="0.00"
                            className="w-full px-3 py-2 bg-[#0c101a] border border-zinc-800 rounded-xl text-xs text-white outline-none focus:border-blue-500"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bloco 2: 2ª Forma de Pagamento */}
                  <div className="bg-[#080c14] border border-zinc-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                      <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                        2ª Forma de Pagamento
                      </span>
                      {saldoRestante !== 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const restante = Math.max(0, Math.round((valorCobrado - numValorPg1) * 100) / 100);
                            setValorPg2(restante);
                          }}
                          className="text-[10px] text-blue-400 hover:text-blue-300 font-bold underline"
                        >
                          Usar restante (R$ {saldoRestante.toFixed(2)})
                        </button>
                      )}
                      <span className="text-[11px] text-zinc-400">
                        Líquido: <strong className="text-emerald-400">R$ {liquidoPg2.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                          MODALIDADE *
                        </label>
                        <select
                          value={formaPagamento2}
                          onChange={(e) => setFormaPagamento2(e.target.value)}
                          className="w-full px-3 py-2 bg-[#0c101a] border border-zinc-800 rounded-xl text-xs text-white outline-none focus:border-blue-500 cursor-pointer"
                        >
                          <option value="Dinheiro">Dinheiro</option>
                          <option value="PIX">PIX</option>
                          <option value="Cartão de débito">Cartão de débito</option>
                          <option value="Cartão de crédito">Cartão de crédito</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                          VALOR DESTINADO (R$) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={valorPg2}
                          onChange={(e) => setValorPg2(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="0.00"
                          className="w-full px-3 py-2 bg-[#0c101a] border border-zinc-800 rounded-xl text-xs text-white font-bold outline-none focus:border-blue-500"
                        />
                      </div>

                      {/* Parcelas: SOMENTE para Cartão de crédito */}
                      {formaPagamento2 === 'Cartão de crédito' && (
                        <div>
                          <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                            PARCELAS
                          </label>
                          <select
                            value={parcelas2}
                            onChange={(e) => setParcelas2(Number(e.target.value))}
                            className="w-full px-3 py-2 bg-[#0c101a] border border-zinc-800 rounded-xl text-xs text-white outline-none focus:border-blue-500 cursor-pointer"
                          >
                            {[1, 2, 3, 4, 5, 6, 10, 12].map((p) => (
                              <option key={p} value={p}>
                                {p}x {p === 1 ? '(à vista)' : '(sem juros)'}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Taxa Maquineta: SOMENTE para Crédito ou Débito. Oculta para Dinheiro e PIX! */}
                      {(formaPagamento2 === 'Cartão de crédito' || formaPagamento2 === 'Cartão de débito') && (
                        <div>
                          <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                            TAXA MAQUINETA (%)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={taxaMaquinetaPercentual2}
                            onChange={(e) => setTaxaMaquinetaPercentual2(e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder="0.00"
                            className="w-full px-3 py-2 bg-[#0c101a] border border-zinc-800 rounded-xl text-xs text-white outline-none focus:border-blue-500"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ================= QUADRO DE RESUMO FINANCEIRO (FIGMA) ================= */}
          <div className="bg-[#080c14] border border-zinc-800/80 rounded-xl p-4 mt-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 text-center">
              <div>
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  PREÇO DO SERVIÇO
                </span>
                <p className="text-base font-bold text-white">
                  R$ {numPrecoServico.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>

              <div>
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  DESCONTO CONCEDIDO
                </span>
                <p className="text-base font-bold text-rose-400">
                  - R$ {descontoCalculado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>

              <div>
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  VALOR COBRADO
                </span>
                <p className="text-base font-bold text-white">
                  R$ {valorCobrado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>

              <div>
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  TAXA DA MAQUINETA
                </span>
                <p className="text-base font-bold text-rose-400">
                  - R$ {totalTaxaMaquineta.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>

              <div className="col-span-2 sm:col-span-1">
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  LUCRO ESTIMADO
                </span>
                <p className={`text-base font-black ${lucroEstimado >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  R$ {lucroEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            <p className="text-[10px] text-zinc-400 text-center mt-3 pt-3 border-t border-zinc-800/60 font-medium">
              Lucro estimado = valor líquido recebido − custo da peça − frete. O desconto ao cliente e a taxa da maquineta são registrados separadamente.
            </p>
          </div>
        </div>

        {/* ================= SEÇÃO EXPANSÍVEL: CHECKLIST DE ENTRADA ================= */}
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl overflow-hidden shadow-sm">
          <button
            type="button"
            onClick={() => setMostrarChecklist(!mostrarChecklist)}
            className="w-full p-4 flex items-center justify-between text-xs font-bold text-zinc-300 hover:text-white transition"
          >
            <div className="flex items-center space-x-2">
              <span className="w-5 h-5 rounded-md bg-blue-600/20 text-blue-400 flex items-center justify-center text-[11px]">✓</span>
              <span>Checklist de entrada do dispositivo ({Object.values(checklist).filter(v => v === 'OK').length}/12 OK)</span>
            </div>
            <span className="text-zinc-400 font-mono text-sm">{mostrarChecklist ? '▲' : '▼'}</span>
          </button>

          {mostrarChecklist && (
            <div className="p-5 border-t border-zinc-800/60 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
              {Object.entries(labelsChecklist).map(([chave, rotulo]) => (
                <div key={chave}>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">{rotulo}</label>
                  <select
                    value={checklist[chave] || 'OK'}
                    onChange={(e) => setChecklist({ ...checklist, [chave]: e.target.value })}
                    className="w-full px-3 py-1.5 bg-[#080c14] border border-zinc-800 rounded-xl text-white outline-none focus:border-blue-500"
                  >
                    <option value="OK">OK</option>
                    <option value="DEFEITO">DEFEITO</option>
                    <option value="Com observação">Com observação</option>
                    <option value="NÃO TESTADO">NÃO TESTADO</option>
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ================= BOTÕES DE AÇÃO INFERIORES ================= */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleSalvarRascunho}
            disabled={carregando}
            className="w-full sm:w-auto justify-center px-5 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 active:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5"
          >
            <span>📝</span>
            <span>Salvar rascunho</span>
          </button>

          <button
            type="submit"
            disabled={carregando}
            className="w-full sm:w-auto justify-center px-6 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-blue-600/25 flex items-center space-x-2"
          >
            {carregando ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Registrando ordem...</span>
              </>
            ) : (
              <span>Criar ordem de serviço</span>
            )}
          </button>
        </div>
      </form>

      {/* ================= MODAL: SUCESSO PÓS-CRIAÇÃO ================= */}
      {osCriadaSucesso && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b0f19] border border-zinc-800 w-full max-w-md rounded-2xl p-6 shadow-2xl text-center space-y-5">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-2xl mx-auto shadow-lg shadow-emerald-500/10">
              ✓
            </div>

            <div>
              <h3 className="text-xl font-extrabold text-white">Ordem Criada com Sucesso!</h3>
              <p className="text-blue-400 font-mono font-bold text-base mt-1">
                {osCriadaSucesso.numeroOs}
              </p>
              <p className="text-xs text-zinc-400 mt-2">
                A ordem de serviço foi registrada e já está disponível na bancada.
              </p>
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                onClick={() => setOsParaImprimir(osCriadaSucesso.dadosCompletos)}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center space-x-2 shadow-md"
              >
                <span>Imprimir Comprovante / PDF</span>
              </button>

              <button
                onClick={handleLimparFormulario}
                className="w-full py-2.5 bg-[#0e1320] hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-semibold rounded-xl text-xs transition"
              >
                Cadastrar outra ordem
              </button>

              {onNavigate && (
                <button
                  onClick={() => onNavigate('historico')}
                  className="w-full py-2 text-zinc-400 hover:text-white text-xs transition"
                >
                  Ver todas as ordens de serviço &rarr;
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Impressão de Certidão de Garantia */}
      {osParaImprimir && (
        <CertidaoGarantia os={osParaImprimir} onClose={() => setOsParaImprimir(null)} />
      )}
    </div>
  );
};