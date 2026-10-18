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

  const [formaPagamento, setFormaPagamento] = useState('Cartão de crédito');
  const [parcelas, setParcelas] = useState(1);
  const [taxaMaquinetaPercentual, setTaxaMaquinetaPercentual] = useState<number | ''>(3.19);

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

  // CÁLCULOS FINANCEIROS DO CARD 03
  const numPrecoServico = Number(valorServico) || 0;
  const numDescontoInput = Number(descontoCliente) || 0;

  const descontoCalculado = useMemo(() => {
    if (tipoDesconto === 'PERCENTUAL') {
      return (numPrecoServico * numDescontoInput) / 100;
    }
    return numDescontoInput;
  }, [numPrecoServico, numDescontoInput, tipoDesconto]);

  const valorCobrado = Math.max(0, numPrecoServico - descontoCalculado);

  const numTaxaPercentual = formaPagamento === 'Dinheiro' || formaPagamento === 'PIX'
    ? 0
    : Number(taxaMaquinetaPercentual) || 0;

  const valorTaxaMaquineta = (valorCobrado * numTaxaPercentual) / 100;
  const liquidoRecebido = Math.max(0, valorCobrado - valorTaxaMaquineta);

  const numCustoPeca = Number(custoPeca) || 0;
  const numFreteReal = Number(freteReal) || 0;
  const lucroEstimado = liquidoRecebido - (numCustoPeca + numFreteReal);

  // Ajuste automático de taxa conforme forma de pagamento
  useEffect(() => {
    if (formaPagamento === 'Dinheiro' || formaPagamento === 'PIX') {
      setTaxaMaquinetaPercentual(0);
    } else if (formaPagamento === 'Cartão de débito') {
      setTaxaMaquinetaPercentual(1.49);
    } else if (formaPagamento === 'Cartão de crédito') {
      if (parcelas === 1) setTaxaMaquinetaPercentual(3.19);
      else if (parcelas <= 3) setTaxaMaquinetaPercentual(4.89);
      else if (parcelas <= 6) setTaxaMaquinetaPercentual(6.49);
      else setTaxaMaquinetaPercentual(8.99);
    }
  }, [formaPagamento, parcelas]);

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

    setCarregando(true);
    try {
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
        formaPagamento: formaPagamento,
        parcelas: parcelas,
        valorLiquido: liquidoRecebido,
        possuiGarantia: possuiGarantia,
        checklistEntrada: checklist,
        orcamentoCalculado: {
          subtotalServicos: numPrecoServico,
          descontoGeralAplicado: descontoCalculado,
          tipoDesconto: tipoDesconto,
          valorTotalOrcamento: valorCobrado,
          custoPeca: numCustoPeca,
          freteReal: numFreteReal,
          fornecedorPeca: fornecedorPeca,
          lucroTotalEstimadoInterno: lucroEstimado,
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

  // Salvar OS em modo Rascunho (campos flexíveis, sem travar em frete, preço ou diagnóstico pendente)
  const handleSalvarRascunho = async () => {
    const nomeValido = nomeCliente.trim();
    const modeloValido = modeloAparelho.trim();

    // Requer apenas ao menos 1 identificador mínimo para não salvar um registro 100% fantasma
    if (!nomeValido && !modeloValido) {
      alert('Para salvar como rascunho, preencha ao menos o Nome do Cliente ou o Modelo do Aparelho.');
      return;
    }

    setCarregando(true);
    try {
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
        formaPagamento: formaPagamento,
        parcelas: parcelas,
        valorLiquido: liquidoRecebido,
        possuiGarantia: possuiGarantia,
        checklistEntrada: checklist,
        orcamentoCalculado: {
          subtotalServicos: numPrecoServico,
          descontoGeralAplicado: descontoCalculado,
          tipoDesconto: tipoDesconto,
          valorTotalOrcamento: valorCobrado,
          custoPeca: numCustoPeca,
          freteReal: numFreteReal,
          fornecedorPeca: fornecedorPeca,
          lucroTotalEstimadoInterno: lucroEstimado,
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
    setCustoPeca('');
    setFreteReal(0);
    setFornecedorPeca('');
    setDescontoCliente('');
    setValorServico('');
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
          Registre o atendimento e gere a via de entrada para o cliente.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ================= CARD TOPO: COBERTURA DESTE ATENDIMENTO ================= */}
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Cobertura deste atendimento</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Define os termos e o controle de retorno da ordem.</p>
            </div>
          </div>

          <div className="flex items-center bg-[#080c14] border border-zinc-800 rounded-xl p-1 shrink-0">
            <button
              type="button"
              onClick={() => setPossuiGarantia(true)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                possuiGarantia
                  ? 'bg-emerald-500 text-black shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Com garantia
            </button>
            <button
              type="button"
              onClick={() => setPossuiGarantia(false)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                !possuiGarantia
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Sem garantia
            </button>
          </div>
        </div>

        {/* ================= LINHA: CARD 01 (CLIENTE) + CARD 02 (APARELHO E DATAS) ================= */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* CARD 01: CLIENTE */}
          <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-6 space-y-4 shadow-sm flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center space-x-2.5 pb-2 border-b border-zinc-800/60">
                <span className="w-6 h-6 rounded-lg bg-blue-600/20 text-blue-400 text-xs font-extrabold flex items-center justify-center">
                  01
                </span>
                <h3 className="text-sm font-bold text-white">Cliente</h3>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                  SELECIONAR CLIENTE CADASTRADO
                </label>
                <select
                  value={idClienteSelecionado}
                  onChange={handleSelecionarCliente}
                  className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition cursor-pointer"
                >
                  <option value="">Buscar na base de clientes...</option>
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
                  placeholder="Nome do cliente"
                  className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white placeholder-zinc-400 outline-none focus:border-blue-500 transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                    WHATSAPP *
                  </label>
                  <input
                    type="text"
                    required
                    value={whatsappCliente}
                    onChange={(e) => setWhatsappCliente(e.target.value)}
                    placeholder="(85) 99999-9999"
                    className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white placeholder-zinc-400 outline-none focus:border-blue-500 transition"
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
                    placeholder="Opcional"
                    className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white placeholder-zinc-400 outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* CARD 02: APARELHO E DATAS */}
          <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-6 space-y-4 shadow-sm flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center space-x-2.5 pb-2 border-b border-zinc-800/60">
                <span className="w-6 h-6 rounded-lg bg-blue-600/20 text-blue-400 text-xs font-extrabold flex items-center justify-center">
                  02
                </span>
                <h3 className="text-sm font-bold text-white">Aparelho e datas</h3>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                  MODELO DO APARELHO *
                </label>
                <input
                  type="text"
                  required
                  value={modeloAparelho}
                  onChange={(e) => setModeloAparelho(e.target.value)}
                  placeholder="Ex.: iPhone 13, Samsung S22"
                  className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white placeholder-zinc-400 outline-none focus:border-blue-500 transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                    IMEI / NÚMERO DE SÉRIE
                  </label>
                  <input
                    type="text"
                    value={imeiAparelho}
                    onChange={(e) => setImeiAparelho(e.target.value)}
                    placeholder="Opcional"
                    className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white placeholder-zinc-400 outline-none focus:border-blue-500 transition"
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
                    placeholder="PIN ou padrão"
                    className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white placeholder-zinc-400 outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                    DATA DE ABERTURA
                  </label>
                  <input
                    type="date"
                    required
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
            </div>
          </div>
        </div>

        {/* ================= CARD 03: SERVIÇO, DIAGNÓSTICO E CUSTOS (FIGMA) ================= */}
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-6 space-y-5 shadow-sm">
          <div className="flex items-center space-x-2.5 pb-2 border-b border-zinc-800/60">
            <span className="w-6 h-6 rounded-lg bg-blue-600/20 text-blue-400 text-xs font-extrabold flex items-center justify-center">
              03
            </span>
            <h3 className="text-sm font-bold text-white">Serviço, diagnóstico e custos</h3>
          </div>

          {/* Linha 1: Serviço Padrão + Defeito Relatado */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                SERVIÇO
              </label>
              <select
                value={servicoPadraoId}
                onChange={handleSelecionarServico}
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition cursor-pointer"
              >
                <option value="">Selecione da base de serviços...</option>
                {listaServicos.map((s) => (
                  <option key={s.id_servico || s.id} value={s.id_servico || s.id}>
                    {s.nome} {s.preco_sugerido ? `- R$ ${Number(s.preco_sugerido).toFixed(2)}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                DEFEITO RELATADO *
              </label>
              <input
                type="text"
                required
                value={defeitoRelatado}
                onChange={(e) => setDefeitoRelatado(e.target.value)}
                placeholder="Ex.: troca de tela frontal, aparelho não liga..."
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white placeholder-zinc-400 outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          {/* Linha 2: Descrição Técnica do Serviço (Unificação de Diagnóstico + Observações) */}
          <div>
            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
              DESCRIÇÃO TÉCNICA DO SERVIÇO
            </label>
            <input
              type="text"
              value={diagnostico}
              onChange={(e) => setDiagnostico(e.target.value)}
              placeholder="Ex.: display quebrado, sem imagem, detalhes e observações do reparo"
              className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white placeholder-zinc-400 outline-none focus:border-blue-500 transition"
            />
          </div>

          {/* Linha 3: Custo Peça, Frete, Fornecedor, Desconto e Valor do Serviço */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                CUSTO DA PEÇA
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
                FRETE REAL
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
                TIPO DE DESCONTO
              </label>
              <select
                value={tipoDesconto}
                onChange={(e) => setTipoDesconto(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition cursor-pointer"
              >
                <option value="VALOR">Valor (R$)</option>
                <option value="PERCENTUAL">Porcentagem (%)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                DESCONTO AO CLIENTE
              </label>
              <input
                type="number"
                step="0.01"
                value={descontoCliente}
                onChange={(e) => setDescontoCliente(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition"
              />
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

          {/* Linha 4: Forma Pagamento, Parcelas, Taxa Maquineta, Líquido Recebido */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                FORMA DE PAGAMENTO *
              </label>
              <select
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition cursor-pointer"
              >
                <option value="Cartão de crédito">Cartão de crédito</option>
                <option value="Cartão de débito">Cartão de débito</option>
                <option value="PIX">PIX</option>
                <option value="Dinheiro">Dinheiro</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                QUANTIDADE DE PARCELAS
              </label>
              <select
                value={parcelas}
                onChange={(e) => setParcelas(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition cursor-pointer"
              >
                {[1, 2, 3, 4, 5, 6, 10, 12].map((p) => (
                  <option key={p} value={p}>
                    {p}x {p === 1 ? '(sem juros)' : '(sem juros)'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                TAXA DA MAQUINETA (%)
              </label>
              <input
                type="number"
                step="0.01"
                value={taxaMaquinetaPercentual}
                onChange={(e) => setTaxaMaquinetaPercentual(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                LÍQUIDO RECEBIDO (APÓS TAXA)
              </label>
              <div className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs font-bold text-emerald-400">
                R$ {liquidoRecebido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
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
                  - R$ {valorTaxaMaquineta.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>

              <div className="col-span-2 sm:col-span-1">
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  LUCRO ESTIMADO
                </span>
                <p className="text-base font-black text-emerald-400">
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

        {/* ================= BOTÕES DE AÇÃO INFERIORES (FIGMA) ================= */}
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