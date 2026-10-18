import React, { useState, useEffect, useMemo } from 'react';
import {
  buscarOrdensServico,
  excluirOrdemServico,
  editarOrdemServico,
} from '../services/api';
import { CertidaoGarantia } from '../components/CertidaoGarantia';
import type { OrdemServico, StatusOS } from '../types';

export const HistoricoServicos: React.FC = () => {
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [loading, setLoading] = useState(true);
  const [termoBusca, setTermoBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('TODOS');

  // Alternador de Abas da Tabela: 'ativas' (ordens normais) vs 'rascunhos' (ordens em rascunho)
  const [abaTabela, setAbaTabela] = useState<'ativas' | 'rascunhos'>('ativas');

  // Modais
  const [osDetalhes, setOsDetalhes] = useState<OrdemServico | null>(null);
  const [abaDetalhes, setAbaDetalhes] = useState<'info' | 'checklist' | 'timeline'>('info');

  const [osEditando, setOsEditando] = useState<OrdemServico | null>(null);
  const [abaEdicao, setAbaEdicao] = useState<'geral' | 'custos' | 'checklist'>('geral');
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const [osParaExcluir, setOsParaExcluir] = useState<OrdemServico | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const [osImprimir, setOsImprimir] = useState<OrdemServico | null>(null);

  // Modal Mobile: Visualizador de Mais Informações da OS (sem scroll horizontal na lista)
  const [osMobileCard, setOsMobileCard] = useState<OrdemServico | null>(null);

  // Estados do Formulário de Edição
  const [editNome, setEditNome] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [editCpfCnpj, setEditCpfCnpj] = useState('');
  const [editModelo, setEditModelo] = useState('');
  const [editImei, setEditImei] = useState('');
  const [editSenha, setEditSenha] = useState('');
  const [editDataAbertura, setEditDataAbertura] = useState('');
  const [editStatus, setEditStatus] = useState<StatusOS>('AGUARDANDO_AVALIACAO');
  const [editDefeito, setEditDefeito] = useState('');
  const [editDiagnostico, setEditDiagnostico] = useState('');

  // Custos e Pagamento Edição
  const [editFormaPgto, setEditFormaPgto] = useState('Cartão de crédito');
  const [editParcelas, setEditParcelas] = useState(1);
  const [editValorCobrado, setEditValorCobrado] = useState<number | ''>('');
  const [editValorLiquido, setEditValorLiquido] = useState<number | ''>('');
  const [editCustoPeca, setEditCustoPeca] = useState<number | ''>('');
  const [editFrete, setEditFrete] = useState<number | ''>('');
  const [editTipoDesconto, setEditTipoDesconto] = useState<'VALOR' | 'PERCENTUAL'>('VALOR');
  const [editDesconto, setEditDesconto] = useState<number | ''>('');

  // Checklist de Entrada Edição
  const [editChecklist, setEditChecklist] = useState<Record<string, string>>({
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

  const carregarOrdens = async () => {
    setLoading(true);
    try {
      const data = await buscarOrdensServico();
      setOrdens(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Erro ao carregar Ordens de Serviço:', err);
      setOrdens([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarOrdens();
  }, []);

  // Contagens para os botões de abas
  const totalRascunhos = useMemo(
    () => ordens.filter((os) => os.status_os === 'RASCUNHO').length,
    [ordens]
  );

  const totalAtivas = useMemo(
    () => ordens.filter((os) => os.status_os !== 'RASCUNHO').length,
    [ordens]
  );

  // Abrir Modal de Edição
  const abrirEdicao = (os: OrdemServico) => {
    setOsEditando(os);
    setAbaEdicao('geral');
    setEditNome(os.cliente?.nome || '');
    setEditWhatsapp(os.cliente?.whatsapp || '');
    setEditCpfCnpj(os.cliente?.cpfCnpj || '');
    setEditModelo(os.aparelho?.modelo || '');
    setEditImei(os.aparelho?.imei1 || '');
    setEditSenha(os.aparelho?.senhaDesbloqueio || '');
    setEditDataAbertura(
      os.data_abertura ? os.data_abertura.split('T')[0] : new Date().toISOString().split('T')[0]
    );

    // Se for rascunho sendo completado, sugere mudar para 'AGUARDANDO_AVALIACAO' se desejar
    setEditStatus(os.status_os || 'AGUARDANDO_AVALIACAO');
    setEditDefeito(os.defeitoRelatado || '');
    setEditDiagnostico(os.diagnostico || '');

    const valorCobrado = Number(os.orcamentoCalculado?.valorTotalOrcamento || (os as any).valor_total || 0);
    const valorLiq = (os as any).valorLiquido !== undefined ? Number((os as any).valorLiquido) : valorCobrado;
    const peca = Number(os.orcamentoCalculado?.custoPeca || (os as any).custo_peca || 0);
    const frete = Number(os.orcamentoCalculado?.freteReal || (os as any).frete_real || 0);
    const desc = Number(os.orcamentoCalculado?.descontoGeralAplicado || (os as any).desconto_valor || 0);

    setEditFormaPgto((os as any).formaPagamento || (os as any).forma_pagamento || 'Cartão de crédito');
    setEditParcelas(Number((os as any).parcelas) || 1);
    setEditValorCobrado(valorCobrado);
    setEditValorLiquido(valorLiq);
    setEditCustoPeca(peca);
    setEditFrete(frete);
    setEditDesconto(desc);
    setEditTipoDesconto((os.orcamentoCalculado as any)?.tipoDesconto || (os as any).tipo_desconto || 'VALOR');

    if (os.checklistEntrada && Object.keys(os.checklistEntrada).length > 0) {
      setEditChecklist(os.checklistEntrada);
    } else {
      setEditChecklist({
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
    }
  };

  // Salvar Edição
  const handleSalvarEdicao = async () => {
    if (!osEditando) return;
    setSalvandoEdicao(true);
    try {
      const numValorCobrado = Number(editValorCobrado) || 0;
      const numValorLiq = editValorLiquido !== '' ? Number(editValorLiquido) : numValorCobrado;
      const numCustoPeca = Number(editCustoPeca) || 0;
      const numFrete = Number(editFrete) || 0;
      const numDesconto = Number(editDesconto) || 0;

      const lucroEstimado = numValorLiq - (numCustoPeca + numFrete);

      const payload = {
        cliente: {
          nome: editNome,
          whatsapp: editWhatsapp,
          cpfCnpj: editCpfCnpj,
        },
        aparelho: {
          modelo: editModelo,
          imei1: editImei,
          senhaDesbloqueio: editSenha,
        },
        status_os: editStatus,
        defeitoRelatado: editDefeito,
        diagnostico: editDiagnostico,
        dataAbertura: editDataAbertura,
        forma_pagamento: editFormaPgto,
        parcelas: editParcelas,
        valor_liquido: numValorLiq,
        checklistEntrada: editChecklist,
        orcamentoCalculado: {
          valorTotalOrcamento: numValorCobrado,
          subtotalServicos: numValorCobrado + numDesconto,
          descontoGeralAplicado: numDesconto,
          tipoDesconto: editTipoDesconto,
          custoPeca: numCustoPeca,
          freteReal: numFrete,
          lucroTotalEstimadoInterno: lucroEstimado,
        },
      };

      await editarOrdemServico(osEditando.id_os, payload);
      setOsEditando(null);
      if (osDetalhes && osDetalhes.id_os === osEditando.id_os) {
        setOsDetalhes(null);
      }
      await carregarOrdens();
    } catch (err: any) {
      alert(`Erro ao salvar alterações: ${err.message}`);
    } finally {
      setSalvandoEdicao(false);
    }
  };

  // Excluir Ordem de Serviço
  const handleConfirmarExclusao = async () => {
    if (!osParaExcluir) return;
    setExcluindo(true);
    try {
      await excluirOrdemServico(osParaExcluir.id_os);
      setOsParaExcluir(null);
      if (osDetalhes && osDetalhes.id_os === osParaExcluir.id_os) {
        setOsDetalhes(null);
      }
      await carregarOrdens();
    } catch (err: any) {
      alert(`Erro ao excluir ordem: ${err.message}`);
    } finally {
      setExcluindo(false);
    }
  };

  // Filtragem de Ordens separando Rascunhos das Ordens Ativas
  const ordensFiltradas = useMemo(() => {
    return ordens.filter((os) => {
      // 1. Filtro pela Aba (Ativas vs Rascunhos)
      if (abaTabela === 'rascunhos') {
        if (os.status_os !== 'RASCUNHO') return false;
      } else {
        // Aba de Ativas não mostra Rascunhos
        if (os.status_os === 'RASCUNHO') return false;
        // Filtro específico do dropdown de status nas ativas
        if (filtroStatus !== 'TODOS' && os.status_os !== filtroStatus) return false;
      }

      // 2. Filtro por Busca de Texto
      const termo = termoBusca.toLowerCase().trim();
      if (!termo) return true;

      const numOs = (os.numero_os || '').toLowerCase();
      const cli = (os.cliente?.nome || '').toLowerCase();
      const apr = (os.aparelho?.modelo || '').toLowerCase();
      const imei = (os.aparelho?.imei1 || '').toLowerCase();

      return numOs.includes(termo) || cli.includes(termo) || apr.includes(termo) || imei.includes(termo);
    });
  }, [ordens, abaTabela, filtroStatus, termoBusca]);

  // Exportar Relatório CSV
  const exportarCSV = () => {
    if (ordensFiltradas.length === 0) {
      alert('Nenhum registro para exportar.');
      return;
    }

    const cabecalho = 'ORDEM,CLIENTE,WHATSAPP,APARELHO,SERVICO,DATA,STATUS,VALOR\n';
    const linhas = ordensFiltradas
      .map((os) => {
        const num = os.numero_os;
        const cli = `"${(os.cliente?.nome || '').replace(/"/g, '""')}"`;
        const tel = `"${os.cliente?.whatsapp || ''}"`;
        const apr = `"${(os.aparelho?.modelo || '').replace(/"/g, '""')}"`;
        const srv = `"${(os.servicoRealizado || os.defeitoRelatado || '').replace(/"/g, '""')}"`;
        const data = os.data_abertura ? new Date(os.data_abertura).toLocaleDateString('pt-BR') : '';
        const st = os.status_os;
        const val = (os.orcamentoCalculado?.valorTotalOrcamento || (os as any).valor_total || 0).toFixed(2);
        return `${num},${cli},${tel},${apr},${srv},${data},${st},${val}`;
      })
      .join('\n');

    const blob = new Blob([cabecalho + linhas], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ordens_de_servico_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatarDataTabela = (dataIso?: string) => {
    if (!dataIso) return '--';
    const d = new Date(dataIso);
    const dia = d.getDate();
    const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const mes = meses[d.getMonth()];
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${dia} ${mes}, ${hora}`;
  };

  const renderStatusBadge = (status: StatusOS) => {
    switch (status) {
      case 'RASCUNHO':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-dashed border-amber-500/40">
            Rascunho
          </span>
        );
      case 'EM_MANUTENCAO':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/25">
            Em bancada
          </span>
        );
      case 'AGUARDANDO_PECA':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25">
            Aguardando peça
          </span>
        );
      case 'PRONTO':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
            Pronto
          </span>
        );
      case 'EM_ANALISE':
      case 'AGUARDANDO_AVALIACAO':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-cyan-500/15 text-cyan-400 border border-cyan-500/25">
            Em diagnóstico
          </span>
        );
      case 'ENTREGUE':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-teal-500/15 text-teal-400 border border-teal-500/25">
            Entregue
          </span>
        );
      case 'CANCELADO':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/25">
            Cancelado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-zinc-800 text-zinc-300">
            {status}
          </span>
        );
    }
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-24 space-y-4">
        <div className="w-9 h-9 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-xs text-zinc-400 font-semibold tracking-wider uppercase">
          Carregando ordens de serviço...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto font-sans pb-10">
      {/* ================= CABEÇALHO DA PÁGINA (FIGMA) ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Ordens de serviço
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Consulte atendimentos, pagamentos, rascunhos e histórico dos aparelhos.
          </p>
        </div>

        {/* Botão Exportar */}
        <div>
          <button
            onClick={exportarCSV}
            className="px-4 py-2.5 bg-[#0c101a] hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-200 transition flex items-center space-x-2 shadow-sm"
          >
            <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Exportar</span>
          </button>
        </div>
      </div>

      {/* ================= ABAS SUPERIORES: ORDENS ATIVAS vs RASCUNHOS ================= */}
      <div className="flex items-center space-x-2 sm:space-x-3 border-b border-zinc-800/80 pb-3 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setAbaTabela('ativas')}
          className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
            abaTabela === 'ativas'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'
          }`}
        >
          <span>Ordens em Andamento</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] ${
            abaTabela === 'ativas' ? 'bg-white/20 text-white' : 'bg-zinc-800 text-zinc-400'
          }`}>
            {totalAtivas}
          </span>
        </button>

        <button
          onClick={() => setAbaTabela('rascunhos')}
          className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
            abaTabela === 'rascunhos'
              ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'
          }`}
        >
          <span className="flex items-center space-x-1.5 whitespace-nowrap">
            <span>📝</span>
            <span>Rascunhos <span className="hidden sm:inline">/ Em Definição</span></span>
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
            abaTabela === 'rascunhos' ? 'bg-black/25 text-black' : 'bg-amber-500/20 text-amber-400'
          }`}>
            {totalRascunhos}
          </span>
        </button>
      </div>

      {/* Banner Informativo quando na aba de Rascunhos */}
      {abaTabela === 'rascunhos' && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center space-x-3">
            <span className="text-lg">📌</span>
            <div>
              <p className="font-bold text-white">Rascunhos aguardando definição</p>
              <p className="text-zinc-400 text-[11px] mt-0.5">
                Ordens com frete, custo de peças, diagnóstico ou valor final ainda pendentes. Clique em <strong>Completar OS</strong> para finalizar e liberar para a bancada.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ================= BARRA DE FILTROS E BUSCA ================= */}
      <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        {/* Campo de Busca */}
        <div className="relative w-full sm:max-w-md">
          <svg
            className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
            placeholder={
              abaTabela === 'rascunhos'
                ? 'Buscar rascunho por cliente, modelo ou OS...'
                : 'Cliente, modelo, IMEI ou OS'
            }
            className="w-full pl-10 pr-4 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white placeholder-zinc-400 focus:outline-none focus:border-blue-500 transition"
          />
        </div>

        {/* Filtro de Status (Apenas na aba de ativas) e Contador */}
        <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
          {abaTabela === 'ativas' && (
            <div className="relative">
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="bg-[#080c14] border border-zinc-800/80 text-zinc-200 rounded-xl px-4 py-2.5 text-xs font-semibold outline-none cursor-pointer focus:border-blue-500 transition pr-8"
              >
                <option value="TODOS">Todos os status</option>
                <option value="AGUARDANDO_AVALIACAO">Aguardando Avaliação</option>
                <option value="EM_ANALISE">Em Diagnóstico</option>
                <option value="EM_MANUTENCAO">Em Bancada</option>
                <option value="AGUARDANDO_PECA">Aguardando Peça</option>
                <option value="PRONTO">Pronto para Retirada</option>
                <option value="ENTREGUE">Entregue</option>
                <option value="CANCELADO">Cancelado</option>
              </select>
              <svg
                className="w-3.5 h-3.5 text-zinc-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          )}

          <div className="px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs font-bold text-zinc-400">
            {ordensFiltradas.length} {ordensFiltradas.length === 1 ? 'registro' : 'registros'}
          </div>
        </div>
      </div>

      {/* ================= TABELA DE ORDENS / RASCUNHOS ================= */}
      <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl overflow-hidden shadow-sm">
        {ordensFiltradas.length === 0 ? (
          <div className="p-20 text-center space-y-2">
            <p className="text-sm font-bold text-zinc-300">
              {abaTabela === 'rascunhos'
                ? 'Nenhum rascunho pendente no momento'
                : 'Nenhuma ordem de serviço encontrada'}
            </p>
            <p className="text-xs text-zinc-400">
              {abaTabela === 'rascunhos'
                ? 'Todos os atendimentos foram concluídos ou estão ativos na bancada.'
                : 'Ajuste os filtros de busca ou crie uma nova ordem de serviço.'}
            </p>
          </div>
        ) : (
          <>
            {/* ================= MODO MOBILE (LISTA LIMPA SEM ROLAGEM LATERAL) ================= */}
            <div className="md:hidden divide-y divide-zinc-800/60">
              {ordensFiltradas.map((os) => {
                return (
                  <div
                    key={os.id_os}
                    className="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-zinc-800/20 transition"
                  >
                    {/* Lado Esquerdo: Apenas Código da OS, Nome do Cliente e Telefone */}
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-blue-400 font-mono text-sm block">
                        {os.numero_os}
                      </span>
                      <h4 className="font-bold text-white text-xs mt-0.5 truncate">
                        {os.cliente?.nome || 'Cliente Balcão'}
                      </h4>
                      <p className="text-[11px] text-zinc-400 truncate mt-0.5 font-mono">
                        {os.cliente?.whatsapp || 'Sem telefone'}
                      </p>
                    </div>

                    {/* Lado Direito: Botão Mais Informações */}
                    <button
                      type="button"
                      onClick={() => setOsMobileCard(os)}
                      className="px-3.5 py-2 bg-[#0e1422] hover:bg-blue-600 border border-zinc-800 hover:border-blue-500 text-zinc-200 hover:text-white rounded-xl text-xs font-bold transition shrink-0 flex items-center space-x-1 shadow-sm active:scale-95"
                    >
                      <span>Mais informações</span>
                      <span className="text-zinc-500 hover:text-white text-sm leading-none">›</span>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* ================= MODO DESKTOP (TABELA COMPLETA COM TODAS AS COLUNAS) ================= */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[720px]">
                <thead className="bg-[#090d15] text-[10px] text-zinc-400 uppercase tracking-wider border-b border-zinc-800/60 font-bold">
                  <tr>
                    <th className="py-3.5 px-5">ORDEM</th>
                    <th className="py-3.5 px-5">CLIENTE</th>
                    <th className="py-3.5 px-5">APARELHO / SERVIÇO</th>
                    <th className="py-3.5 px-5">ENTRADA</th>
                    <th className="py-3.5 px-5 text-center">STATUS</th>
                    <th className="py-3.5 px-5 text-right">VALOR</th>
                    <th className="py-3.5 px-5 text-center">AÇÕES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {ordensFiltradas.map((os) => {
                    const valor = Number(
                      os.orcamentoCalculado?.valorTotalOrcamento || (os as any).valor_total || 0
                    );
                    const isRascunho = os.status_os === 'RASCUNHO';

                    return (
                      <tr key={os.id_os} className="hover:bg-zinc-800/20 transition">
                        <td className="py-4 px-5 font-bold text-blue-400 font-mono">
                          {os.numero_os}
                        </td>

                        <td className="py-4 px-5">
                          <p className="font-bold text-white text-xs">{os.cliente?.nome || 'Cliente Balcão'}</p>
                          <p className="text-[11px] text-zinc-400 mt-0.5">{os.cliente?.whatsapp || 'Sem telefone'}</p>
                        </td>

                        <td className="py-4 px-5">
                          <p className="font-semibold text-zinc-200 text-xs">
                            {os.aparelho?.modelo || 'Smartphone'}
                          </p>
                          <p className="text-[11px] text-zinc-400 mt-0.5 truncate max-w-[220px]">
                            {os.servicoRealizado || os.defeitoRelatado || 'Definição pendente'}
                          </p>
                        </td>

                        <td className="py-4 px-5 text-zinc-400 font-medium">
                          {formatarDataTabela(os.data_abertura)}
                        </td>

                        <td className="py-4 px-5 text-center">
                          {renderStatusBadge(os.status_os)}
                        </td>

                        <td className="py-4 px-5 text-right font-extrabold text-white">
                          {valor > 0
                            ? `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : <span className="text-zinc-500 font-normal italic">A definir</span>}
                        </td>

                        <td className="py-4 px-5">
                          <div className="flex items-center justify-center space-x-2">
                            {/* Botão Especial: Completar Rascunho */}
                            {isRascunho ? (
                              <button
                                onClick={() => abrirEdicao(os)}
                                title="Completar informações e enviar para bancada"
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1.5 shadow-sm"
                              >
                                <span>✏️</span>
                                <span>Completar OS</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setOsDetalhes(os);
                                  setAbaDetalhes('info');
                                }}
                                title="Visualizar detalhes da OS"
                                className="p-1.5 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </button>
                            )}

                            {/* Excluir (Lixeira) */}
                            <button
                              onClick={() => setOsParaExcluir(os)}
                              title="Excluir ordem de serviço"
                              className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ================= MODAL: VISUALIZAR DETALHES ================= */}
      {osDetalhes && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0b0f19] border border-zinc-800 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col my-8">
            <div className="p-4 sm:p-6 border-b border-zinc-800/80">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
                  <span className="font-mono font-extrabold text-blue-400 text-base sm:text-lg shrink-0">
                    {osDetalhes.numero_os}
                  </span>
                  {renderStatusBadge(osDetalhes.status_os)}
                </div>

                {/* Botões de Ação no Topo Direito (Desktop) e Fechar */}
                <div className="flex items-center space-x-2 shrink-0">
                  <div className="hidden sm:flex items-center space-x-2">
                    <button
                      onClick={() => {
                        abrirEdicao(osDetalhes);
                        setOsDetalhes(null);
                      }}
                      className="px-3.5 py-1.5 rounded-xl border border-amber-600/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-xs font-semibold flex items-center space-x-1.5 transition"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      <span>{osDetalhes.status_os === 'RASCUNHO' ? 'Completar' : 'Editar OS'}</span>
                    </button>

                    {osDetalhes.status_os !== 'RASCUNHO' && (
                      <button
                        onClick={() => setOsImprimir(osDetalhes)}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center space-x-1.5 transition shadow-sm"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        <span>Imprimir / PDF</span>
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => setOsDetalhes(null)}
                    className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center shrink-0"
                    aria-label="Fechar modal"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <p className="text-xs text-zinc-400 mt-1 font-medium truncate">
                {osDetalhes.cliente?.nome} · {osDetalhes.aparelho?.modelo}
              </p>

              {/* Botões de Ação Slim no Mobile (Organizados e Alinhados em 1 linha) */}
              <div className="flex sm:hidden items-center space-x-2 mt-3 pt-3 border-t border-zinc-800/40">
                <button
                  onClick={() => {
                    abrirEdicao(osDetalhes);
                    setOsDetalhes(null);
                  }}
                  className="flex-1 py-2 rounded-xl border border-amber-600/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-xs font-semibold flex items-center justify-center space-x-1.5 transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  <span className="whitespace-nowrap">{osDetalhes.status_os === 'RASCUNHO' ? 'Completar' : 'Editar'}</span>
                </button>

                {osDetalhes.status_os !== 'RASCUNHO' && (
                  <button
                    onClick={() => setOsImprimir(osDetalhes)}
                    className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center space-x-1.5 transition shadow-sm"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span className="whitespace-nowrap">Imprimir</span>
                  </button>
                )}
              </div>
            </div>

            {/* Abas com Rolagem Fluida e Textos sem Quebra */}
            <div className="flex border-b border-zinc-800/80 px-4 sm:px-6 space-x-4 sm:space-x-8 text-xs font-bold overflow-x-auto no-scrollbar">
              <button
                onClick={() => setAbaDetalhes('info')}
                className={`py-3 transition-all border-b-2 whitespace-nowrap shrink-0 ${
                  abaDetalhes === 'info'
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Informações e orçamento
              </button>
              <button
                onClick={() => setAbaDetalhes('checklist')}
                className={`py-3 transition-all border-b-2 whitespace-nowrap shrink-0 ${
                  abaDetalhes === 'checklist'
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Checklist de entrada
              </button>
              <button
                onClick={() => setAbaDetalhes('timeline')}
                className={`py-3 transition-all border-b-2 whitespace-nowrap shrink-0 ${
                  abaDetalhes === 'timeline'
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Linha do tempo
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[70vh] space-y-5 text-xs">
              {abaDetalhes === 'info' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-[#0e1320] border border-zinc-800/80 p-4 rounded-xl">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                        DATA DE ABERTURA
                      </p>
                      <h4 className="text-sm font-bold text-white mt-1">
                        {osDetalhes.data_abertura ? new Date(osDetalhes.data_abertura).toLocaleDateString('pt-BR') : 'Não informada'}
                      </h4>
                    </div>

                    <div className="bg-[#0e1320] border border-zinc-800/80 p-4 rounded-xl">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                        FORMA DE PAGAMENTO
                      </p>
                      <h4 className="text-sm font-bold text-white mt-1">
                        {(osDetalhes as any).formaPagamento || (osDetalhes as any).forma_pagamento || 'A definir'} · {(osDetalhes as any).parcelas || 1}x
                      </h4>
                    </div>

                    <div className="bg-[#0e1320] border border-zinc-800/80 p-4 rounded-xl">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                        STATUS OPERACIONAL
                      </p>
                      <h4 className="text-sm font-bold text-white mt-1">
                        {osDetalhes.status_os === 'RASCUNHO' ? 'Em Definição (Rascunho)' : osDetalhes.status_os}
                      </h4>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-[#0e1320] border border-zinc-800/80 p-4 rounded-xl">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">INFORMAÇÕES DO CLIENTE</span>
                      <p className="text-sm font-bold text-white">{osDetalhes.cliente?.nome}</p>
                      <p className="text-zinc-400 mt-1">WhatsApp: <span className="text-zinc-200">{osDetalhes.cliente?.whatsapp || 'Não informado'}</span></p>
                      <p className="text-zinc-400">CPF/CNPJ: <span className="text-zinc-200">{osDetalhes.cliente?.cpfCnpj || 'Não informado'}</span></p>
                    </div>

                    <div className="bg-[#0e1320] border border-zinc-800/80 p-4 rounded-xl">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">INFORMAÇÕES DO APARELHO</span>
                      <p className="text-sm font-bold text-white">{osDetalhes.aparelho?.modelo}</p>
                      <p className="text-zinc-400 mt-1">IMEI / Série: <span className="text-zinc-200">{osDetalhes.aparelho?.imei1 || 'Não informado'}</span></p>
                      <p className="text-zinc-400">Senha: <span className="text-zinc-200">{osDetalhes.aparelho?.senhaDesbloqueio || 'Não informada'}</span></p>
                    </div>
                  </div>

                  <div className="bg-[#0e1320] border border-zinc-800/80 p-5 rounded-xl space-y-4">
                    <div>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                        DEFEITO RELATADO
                      </p>
                      <p className="text-zinc-200 leading-relaxed font-medium">
                        {osDetalhes.defeitoRelatado || 'Defeito a diagnosticar.'}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-zinc-800/60">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                        DIAGNÓSTICO TÉCNICO
                      </p>
                      <p className="text-zinc-200 leading-relaxed font-medium">
                        {osDetalhes.diagnostico || 'Aguardando diagnóstico técnico da bancada.'}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-zinc-800/60">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                        OBSERVAÇÕES INTERNAS
                      </p>
                      <p className="text-zinc-400 leading-relaxed">
                        {osDetalhes.observacoes || 'Sem observações adicionais.'}
                      </p>
                    </div>
                  </div>
                </>
              )}

              {abaDetalhes === 'checklist' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Object.entries(labelsChecklist).map(([chave, rotulo]) => {
                    const status = osDetalhes.checklistEntrada?.[chave] || 'NÃO TESTADO';
                    const isOk = status === 'OK';
                    const isDefeito = status === 'DEFEITO';
                    return (
                      <div key={chave} className="bg-[#0e1320] border border-zinc-800/80 p-3.5 rounded-xl flex items-center justify-between">
                        <span className="font-medium text-zinc-300">{rotulo}</span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            isOk
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : isDefeito
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {abaDetalhes === 'timeline' && (
                <div className="space-y-4 p-2">
                  <div className="flex items-start space-x-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                    <div>
                      <p className="font-bold text-white">Registro Criado</p>
                      <p className="text-[11px] text-zinc-400">
                        {osDetalhes.data_abertura ? new Date(osDetalhes.data_abertura).toLocaleString('pt-BR') : 'Data não registrada'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                    <div>
                      <p className="font-bold text-white">Status Atual</p>
                      <p className="text-[11px] text-zinc-400">Classificado como {osDetalhes.status_os}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-zinc-800/80 flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">
                Acesso e controle protegido
              </span>
              <button
                onClick={() => setOsDetalhes(null)}
                className="px-5 py-2 bg-[#0e1320] hover:bg-zinc-800 border border-zinc-800 text-zinc-300 rounded-xl text-xs font-semibold transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: EDITAR / COMPLETAR ORDEM ================= */}
      {osEditando && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0b0f19] border border-zinc-800 w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col my-8">
            <div className="p-6 border-b border-zinc-800/80 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                  <span>{osEditando.status_os === 'RASCUNHO' ? 'Completar ordem' : 'Editar ordem'}</span>
                  <span className="text-blue-400 font-mono">{osEditando.numero_os}</span>
                  {osEditando.status_os === 'RASCUNHO' && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                      RASCUNHO
                    </span>
                  )}
                </h3>
                <p className="text-xs text-zinc-400 mt-1 font-medium">
                  {editNome || 'Cliente'} · {editModelo || 'Aparelho'}
                </p>
              </div>
              <button
                onClick={() => setOsEditando(null)}
                className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div className="flex border-b border-zinc-800/80 px-4 sm:px-6 space-x-4 sm:space-x-8 text-xs font-bold overflow-x-auto no-scrollbar">
              <button
                onClick={() => setAbaEdicao('geral')}
                className={`py-3.5 transition-all border-b-2 ${
                  abaEdicao === 'geral'
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                01 Dados gerais e aparelho
              </button>
              <button
                onClick={() => setAbaEdicao('custos')}
                className={`py-3.5 transition-all border-b-2 ${
                  abaEdicao === 'custos'
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                02 Custos e pagamento
              </button>
              <button
                onClick={() => setAbaEdicao('checklist')}
                className={`py-3.5 transition-all border-b-2 ${
                  abaEdicao === 'checklist'
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                03 Checklist de entrada
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[70vh] space-y-4 text-xs">
              {/* ETAPA 1 */}
              {abaEdicao === 'geral' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                        NOME DO CLIENTE
                      </label>
                      <input
                        type="text"
                        value={editNome}
                        onChange={(e) => setEditNome(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800 rounded-xl text-white outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                        WHATSAPP
                      </label>
                      <input
                        type="text"
                        value={editWhatsapp}
                        onChange={(e) => setEditWhatsapp(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800 rounded-xl text-white outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                        CPF / CNPJ
                      </label>
                      <input
                        type="text"
                        value={editCpfCnpj}
                        onChange={(e) => setEditCpfCnpj(e.target.value)}
                        placeholder="Não informado"
                        className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800 rounded-xl text-white outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                        MODELO DO APARELHO
                      </label>
                      <input
                        type="text"
                        value={editModelo}
                        onChange={(e) => setEditModelo(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800 rounded-xl text-white outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                        IMEI / NÚMERO DE SÉRIE
                      </label>
                      <input
                        type="text"
                        value={editImei}
                        onChange={(e) => setEditImei(e.target.value)}
                        placeholder="Não informado"
                        className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800 rounded-xl text-white outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                        SENHA DE DESBLOQUEIO
                      </label>
                      <input
                        type="text"
                        value={editSenha}
                        onChange={(e) => setEditSenha(e.target.value)}
                        placeholder="Não informada"
                        className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800 rounded-xl text-white outline-none focus:border-blue-500"
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
                        value={editDataAbertura}
                        onChange={(e) => setEditDataAbertura(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800 rounded-xl text-white outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                        STATUS DA OS {osEditando.status_os === 'RASCUNHO' && <span className="text-amber-400 font-normal">(Mude para ativar)</span>}
                      </label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as StatusOS)}
                        className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800 rounded-xl text-white outline-none focus:border-blue-500 font-bold"
                      >
                        <option value="RASCUNHO" className="text-amber-400 font-bold">📝 Rascunho (Em definição)</option>
                        <option value="AGUARDANDO_AVALIACAO">Aguardando Avaliação</option>
                        <option value="EM_ANALISE">Em Diagnóstico</option>
                        <option value="EM_MANUTENCAO">Em Bancada</option>
                        <option value="AGUARDANDO_PECA">Aguardando Peça</option>
                        <option value="PRONTO">Pronto para Retirada</option>
                        <option value="ENTREGUE">Entregue</option>
                        <option value="CANCELADO">Cancelado</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                        DEFEITO RELATADO
                      </label>
                      <textarea
                        rows={3}
                        value={editDefeito}
                        onChange={(e) => setEditDefeito(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800 rounded-xl text-white outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                        DESCRIÇÃO TÉCNICA DO SERVIÇO
                      </label>
                      <textarea
                        rows={3}
                        value={editDiagnostico}
                        onChange={(e) => setEditDiagnostico(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800 rounded-xl text-white outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ETAPA 2 */}
              {abaEdicao === 'custos' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                        FORMA DE PAGAMENTO
                      </label>
                      <select
                        value={editFormaPgto}
                        onChange={(e) => setEditFormaPgto(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800 rounded-xl text-white outline-none focus:border-blue-500"
                      >
                        <option value="Cartão de crédito">Cartão de crédito</option>
                        <option value="Cartão de débito">Cartão de débito</option>
                        <option value="PIX">PIX</option>
                        <option value="Dinheiro">Dinheiro</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                        PARCELAS
                      </label>
                      <select
                        value={editParcelas}
                        onChange={(e) => setEditParcelas(Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800 rounded-xl text-white outline-none focus:border-blue-500"
                      >
                        {[1, 2, 3, 4, 5, 6, 10, 12].map((p) => (
                          <option key={p} value={p}>
                            {p}x {p === 1 ? '(à vista)' : '(sem juros)'}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                        VALOR COBRADO
                      </label>
                      <input
                        type="number"
                        value={editValorCobrado}
                        onChange={(e) => setEditValorCobrado(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800 rounded-xl text-white font-bold outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                        VALOR LÍQUIDO
                      </label>
                      <input
                        type="number"
                        value={editValorLiquido}
                        onChange={(e) => setEditValorLiquido(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800 rounded-xl text-purple-400 font-bold outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                        CUSTO DA PEÇA
                      </label>
                      <input
                        type="number"
                        value={editCustoPeca}
                        onChange={(e) => setEditCustoPeca(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800 rounded-xl text-white outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                        FRETE REAL
                      </label>
                      <input
                        type="number"
                        value={editFrete}
                        onChange={(e) => setEditFrete(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800 rounded-xl text-white outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                        TIPO DE DESCONTO
                      </label>
                      <select
                        value={editTipoDesconto}
                        onChange={(e) => setEditTipoDesconto(e.target.value as any)}
                        className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800 rounded-xl text-white outline-none focus:border-blue-500"
                      >
                        <option value="VALOR">Valor (R$)</option>
                        <option value="PERCENTUAL">Porcentagem (%)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                        DESCONTO
                      </label>
                      <input
                        type="number"
                        value={editDesconto}
                        onChange={(e) => setEditDesconto(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800 rounded-xl text-white outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs">
                    Ao alterar pagamento, parcelas ou desconto, confira o valor líquido repassado pela maquineta antes de salvar.
                  </div>
                </div>
              )}

              {/* ETAPA 3 */}
              {abaEdicao === 'checklist' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  {Object.entries(labelsChecklist).map(([chave, rotulo]) => (
                    <div key={chave}>
                      <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                        {rotulo}
                      </label>
                      <select
                        value={editChecklist[chave] || 'OK'}
                        onChange={(e) =>
                          setEditChecklist({ ...editChecklist, [chave]: e.target.value })
                        }
                        className="w-full px-3.5 py-2 bg-[#080c14] border border-zinc-800 rounded-xl text-white text-xs outline-none focus:border-blue-500"
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

            <div className="p-4 border-t border-zinc-800/80 flex items-center justify-between">
              <button
                onClick={() => setOsEditando(null)}
                className="text-xs font-semibold text-zinc-400 hover:text-white transition"
              >
                Cancelar
              </button>

              <button
                onClick={handleSalvarEdicao}
                disabled={salvandoEdicao}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition shadow-md shadow-blue-600/25 flex items-center space-x-1.5"
              >
                {salvandoEdicao ? (
                  <span>Salvando...</span>
                ) : (
                  <>
                    <span>✓</span>
                    <span>
                      {osEditando.status_os === 'RASCUNHO' && editStatus !== 'RASCUNHO'
                        ? 'Salvar e Enviar para Bancada'
                        : 'Salvar alterações'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: EXCLUSÃO ================= */}
      {osParaExcluir && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b0f19] border border-zinc-800 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">Excluir Ordem de Serviço?</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Tem certeza que deseja excluir a ordem{' '}
              <strong className="text-white font-mono">{osParaExcluir.numero_os}</strong>? Esta ação é irreversível.
            </p>
            <div className="flex items-center justify-end space-x-3 pt-3">
              <button
                onClick={() => setOsParaExcluir(null)}
                className="px-4 py-2 bg-[#080c14] border border-zinc-800 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarExclusao}
                disabled={excluindo}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition"
              >
                {excluindo ? 'Excluindo...' : 'Confirmar Exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL MOBILE: MAIS INFORMAÇÕES DA OS ================= */}
      {osMobileCard && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-[#0b0f19] border border-zinc-800 w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Cabeçalho do Modal Mobile */}
            <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <span className="font-mono font-extrabold text-blue-400 text-base">
                  {osMobileCard.numero_os}
                </span>
                {renderStatusBadge(osMobileCard.status_os)}
              </div>
              <button
                onClick={() => setOsMobileCard(null)}
                className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Conteúdo com rolagem vertical limpa */}
            <div className="p-5 overflow-y-auto space-y-3.5 text-xs">
              {/* Card Cliente */}
              <div className="bg-[#080c14] border border-zinc-800/80 rounded-xl p-3.5 space-y-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  CLIENTE
                </span>
                <p className="text-sm font-bold text-white">
                  {osMobileCard.cliente?.nome || 'Cliente Balcão'}
                </p>
                <p className="text-zinc-400 font-mono">
                  {osMobileCard.cliente?.whatsapp || 'Sem telefone cadastrado'}
                </p>
              </div>

              {/* Card Aparelho e Serviço */}
              <div className="bg-[#080c14] border border-zinc-800/80 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                    APARELHO & SERVIÇO
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    Entrada: {formatarDataTabela(osMobileCard.data_abertura)}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-bold text-white">
                    {osMobileCard.aparelho?.modelo || 'Smartphone'}
                  </p>
                  {osMobileCard.aparelho?.imei1 && (
                    <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                      IMEI: {osMobileCard.aparelho.imei1}
                    </p>
                  )}
                  {osMobileCard.aparelho?.senhaDesbloqueio && (
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Senha: <span className="text-zinc-200 font-mono">{osMobileCard.aparelho.senhaDesbloqueio}</span>
                    </p>
                  )}
                </div>
                <div className="pt-2 border-t border-zinc-800/60">
                  <p className="text-zinc-400 text-[11px]">Defeito / Serviço realizado:</p>
                  <p className="text-zinc-200 font-semibold mt-0.5">
                    {osMobileCard.servicoRealizado || osMobileCard.defeitoRelatado || 'Definição pendente'}
                  </p>
                  {osMobileCard.diagnostico && (
                    <p className="text-zinc-400 text-[11px] mt-1.5 italic">
                      Diagnóstico: {osMobileCard.diagnostico}
                    </p>
                  )}
                </div>
              </div>

              {/* Card Valor e Pagamento */}
              <div className="bg-[#080c14] border border-zinc-800/80 rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                    VALOR COBRADO
                  </span>
                  <p className="text-base font-extrabold text-white mt-0.5">
                    {Number(osMobileCard.orcamentoCalculado?.valorTotalOrcamento || (osMobileCard as any).valor_total || 0) > 0
                      ? `R$ ${Number(osMobileCard.orcamentoCalculado?.valorTotalOrcamento || (osMobileCard as any).valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : 'A definir'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                    PAGAMENTO
                  </span>
                  <p className="text-xs text-zinc-300 font-medium mt-0.5">
                    {(osMobileCard as any).formaPagamento || (osMobileCard as any).forma_pagamento || 'A combinar'}
                  </p>
                </div>
              </div>
            </div>

            {/* Rodapé com Ações Rápidas: Olhinho, Editar, Imprimir, Excluir */}
            <div className="p-4 border-t border-zinc-800/80 bg-[#090d15] flex items-center justify-between gap-2 shrink-0">
              {osMobileCard.status_os === 'RASCUNHO' ? (
                <button
                  onClick={() => {
                    const os = osMobileCard;
                    setOsMobileCard(null);
                    abrirEdicao(os);
                  }}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-md shadow-blue-600/20"
                >
                  <span>✏️</span>
                  <span>Completar OS</span>
                </button>
              ) : (
                <>
                  {/* Olhinho: Ver Detalhes Completos */}
                  <button
                    onClick={() => {
                      const os = osMobileCard;
                      setOsMobileCard(null);
                      setOsDetalhes(os);
                      setAbaDetalhes('info');
                    }}
                    className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5"
                  >
                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <span>Ver detalhes</span>
                  </button>

                  {/* Editar */}
                  <button
                    onClick={() => {
                      const os = osMobileCard;
                      setOsMobileCard(null);
                      abrirEdicao(os);
                    }}
                    className="p-2.5 bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center"
                    title="Editar OS"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </>
              )}

              {/* Imprimir */}
              <button
                onClick={() => {
                  const os = osMobileCard;
                  setOsMobileCard(null);
                  setOsImprimir(os);
                }}
                className="p-2.5 bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center"
                title="Imprimir via / comprovante"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
              </button>

              {/* Excluir (Lixeira) */}
              <button
                onClick={() => {
                  const os = osMobileCard;
                  setOsMobileCard(null);
                  setOsParaExcluir(os);
                }}
                className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 rounded-xl text-xs font-bold transition flex items-center justify-center"
                title="Excluir OS"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= COMPONENTE DE IMPRESSÃO / PDF ================= */}
      {osImprimir && (
        <CertidaoGarantia os={osImprimir} onClose={() => setOsImprimir(null)} />
      )}
    </div>
  );
};