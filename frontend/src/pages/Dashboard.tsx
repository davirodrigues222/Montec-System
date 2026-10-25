import React, { useState, useEffect, useMemo } from 'react';
import {
  buscarOrdensServico,
  obterConfiguracoesLojaSincrono,
  carregarConfiguracoesLoja,
  filtrarOrdensPorCompetenciaMensal,
  calcularResumoMetaFinanceira,
  contaNoFaturamento,
  diaLocalDaData,
} from '../services/api';
import { AvisoErroCarregamento } from '../components/AvisoErroCarregamento';
import type { OrdemServico, StatusOS } from '../types';
import type { AbaSistema } from '../services/acesso';
import { formatarValor } from '../utils/formatadores';
import { useOperador } from '../contexts/OperadorContext';

interface Props {
  onNavigate?: (tab: AbaSistema) => void;
  session?: any;
}

export const Dashboard: React.FC<Props> = ({ onNavigate, session }) => {
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [loading, setLoading] = useState(true);
  // Horário em que o painel foi aberto (exibido em "Hoje na loja")
  const [horaAtual] = useState(() =>
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
  const [versaoConfig, setVersaoConfig] = useState(0);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);

  // forcar = botão "Atualizar dados" (ignora o cache curto das ordens)
  const carregarOrdens = async (forcar = false) => {
    setLoading(true);
    setErroCarregamento(null);
    try {
      const data = await buscarOrdensServico(forcar);
      setOrdens(data);
    } catch (err: any) {
      console.error('Erro ao carregar Dashboard:', err);
      setErroCarregamento(err?.message || 'Verifique a conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarOrdens();
    carregarConfiguracoesLoja()
      .then(() => setVersaoConfig((v) => v + 1))
      .catch(() => {});

    const handleStorageUpdate = () => {
      setVersaoConfig((v) => v + 1);
    };
    window.addEventListener('storage_configs_updated', handleStorageUpdate);
    return () => window.removeEventListener('storage_configs_updated', handleStorageUpdate);
  }, []);

  const listaOrdens = ordens;

  // Nome do Responsável para a Saudação
  const primeiroNome = useMemo(() => {
    const cfg = obterConfiguracoesLojaSincrono(session?.user);
    const nomeCompleto =
      session?.user?.user_metadata?.nome_responsavel ||
      cfg.nomeLoja ||
      'Administrador';
    return (nomeCompleto || 'Administrador').split(' ')[0];
  }, [session, versaoConfig]);

  // Saudação Dinâmica com base na hora atual
  const saudacao = useMemo(() => {
    const hora = new Date().getHours();
    if (hora >= 5 && hora < 12) return 'Bom dia';
    if (hora >= 12 && hora < 18) return 'Boa tarde';
    return 'Boa noite';
  }, []);

  // Data por extenso formatada (ex: "18 de outubro de 2026")
  const dataHojeExtenso = useMemo(() => {
    return new Date().toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, []);

  // CÁLCULOS DOS 4 CARDS SUPERIORES
  // 1. Na bancada (Aguardando Avaliação, Em Análise, Em Manutenção)
  const ordensNaBancada = useMemo(
    () =>
      listaOrdens.filter((os) =>
        ['AGUARDANDO_AVALIACAO', 'EM_ANALISE', 'EM_MANUTENCAO'].includes(os.status_os)
      ),
    [listaOrdens]
  );

  const aguardamDiagnostico = useMemo(
    () =>
      listaOrdens.filter((os) =>
        ['AGUARDANDO_AVALIACAO', 'EM_ANALISE'].includes(os.status_os)
      ).length,
    [listaOrdens]
  );

  // 2. Prontos para retirada
  const ordensProntas = useMemo(
    () => listaOrdens.filter((os) => os.status_os === 'PRONTO'),
    [listaOrdens]
  );

  const valorTotalProntos = useMemo(
    () =>
      ordensProntas.reduce(
        (acc, os) =>
          acc + Number(os.orcamentoCalculado?.valorTotalOrcamento || os.valor_total || 0),
        0
      ),
    [ordensProntas]
  );

  // 3. Aguardando Peça
  const ordensAguardandoPeca = useMemo(
    () => listaOrdens.filter((os) => os.status_os === 'AGUARDANDO_PECA'),
    [listaOrdens]
  );

  // Fornecedores distintos informados nas ordens que aguardam peça
  const fornecedoresAguardados = useMemo(
    () =>
      new Set(
        ordensAguardandoPeca
          .map((os) => (os.orcamentoCalculado?.fornecedorPeca || '').trim().toLowerCase())
          .filter(Boolean)
      ).size,
    [ordensAguardandoPeca]
  );

  // 4. Faturamento do Mês Atual e Lucro Líquido Real do Mês (coerente com Relatórios e com a Meta Mensal)
  const ordensDoMesAtual = useMemo(
    // Financeiro do mês: rascunhos e canceladas não entram (mesma regra de Relatórios e da meta)
    () => filtrarOrdensPorCompetenciaMensal(listaOrdens).filter(contaNoFaturamento),
    [listaOrdens]
  );

  const resumoMeta = useMemo(
    () => calcularResumoMetaFinanceira(listaOrdens, { user: session?.user }),
    [listaOrdens, session, versaoConfig]
  );

  const faturamentoMes = resumoMeta.valorAlcancado;

  const custosTotais = useMemo(
    () =>
      ordensDoMesAtual.reduce((acc, os) => {
        const peca = Number(os?.orcamentoCalculado?.custoPeca || os?.custo_peca || 0);
        const frete = Number(os?.orcamentoCalculado?.freteReal || os?.frete_real || 0);
        const garantia = Number(
          os?.orcamentoCalculado?.custoPecaGarantia ||
            os?.garantia?.custoPecaGarantia ||
            os?.custo_peca_garantia ||
            0
        );
        return acc + peca + frete + garantia;
      }, 0),
    [ordensDoMesAtual]
  );

  // Lucro real: o que entrou de fato (líquido, já sem as taxas da maquininha) menos os custos.
  // Mesma regra de Análises e relatórios.
  const liquidoMes = useMemo(
    () => ordensDoMesAtual.reduce((acc, os) => acc + Number(os.valorLiquido ?? os.orcamentoCalculado?.valorTotalOrcamento ?? 0), 0),
    [ordensDoMesAtual]
  );
  const lucroLiquidoReal = liquidoMes - custosTotais;

  // Faturamento, lucro, valores em R$ e meta só aparecem para quem tem acesso a Análises e relatórios.
  // Os demais veem indicadores operacionais (quantidade e andamento das ordens), sem valores.
  const { pode } = useOperador();
  const veFinanceiro = pode('tela_relatorios');

  // Indicadores operacionais do mês (ordens abertas no mês, sem rascunhos e cancelamentos)
  const ordensValidasDoMes = useMemo(
    () => ordensDoMesAtual.filter((os) => os.status_os !== 'RASCUNHO' && os.status_os !== 'CANCELADO'),
    [ordensDoMesAtual]
  );
  const concluidasNoMes = ordensValidasDoMes.filter((os) => os.status_os === 'PRONTO' || os.status_os === 'ENTREGUE').length;
  const entreguesNoMes = ordensValidasDoMes.filter((os) => os.status_os === 'ENTREGUE').length;
  const percentualConclusao =
    ordensValidasDoMes.length > 0 ? Math.round((concluidasNoMes / ordensValidasDoMes.length) * 100) : 0;
  const rotuloMes = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  // CÁLCULOS DO BLOCO "HOJE NA LOJA"
  const hojeStr = useMemo(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  }, []);

  // Datas comparadas no horário local (antes, OS abertas depois das 21h caíam no dia seguinte)
  const entradasHoje = useMemo(
    () => listaOrdens.filter((os) => diaLocalDaData(os.data_abertura) === hojeStr).length,
    [listaOrdens, hojeStr]
  );

  // Ficaram prontas ou foram entregues hoje (antes contava todas as prontas, de qualquer data)
  const finalizadosHoje = useMemo(
    () =>
      listaOrdens.filter(
        (os) =>
          diaLocalDaData(os.checklistEntrada?.__dataPronto) === hojeStr ||
          diaLocalDaData(os.data_conclusao) === hojeStr
      ).length,
    [listaOrdens, hojeStr]
  );

  // Entregues hoje (antes contava todas as entregues desde sempre, dentro do card "Hoje na loja")
  const entreguesHoje = useMemo(
    () =>
      listaOrdens.filter((os) => os.status_os === 'ENTREGUE' && diaLocalDaData(os.data_conclusao) === hojeStr).length,
    [listaOrdens, hojeStr]
  );

  const orcamentosPendentes = useMemo(
    () =>
      listaOrdens.filter(
        (os) =>
          !os.orcamentoCalculado?.valorTotalOrcamento ||
          os.status_os === 'AGUARDANDO_AVALIACAO'
      ).length,
    [listaOrdens]
  );

  // Formatação de data da tabela (ex: "17 out, 09:42")
  const formatarDataEntrada = (dataIso?: string) => {
    if (!dataIso) return '--';
    const d = new Date(dataIso);
    const dia = d.getDate();
    const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const mes = meses[d.getMonth()];
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${dia} ${mes}, ${hora}`;
  };

  // Helper de Status com o Estilo Exato do Figma
  const renderStatusBadge = (status: StatusOS) => {
    switch (status) {
      case 'RASCUNHO':
        return (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30 border-dashed">
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
          <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-zinc-700/30 text-zinc-300 border border-zinc-700/40">
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

  // 6 Ordens mais recentes para a tabela do Dashboard
  const ordensEmAndamento = useMemo(() => {
    return listaOrdens
      .filter((os) => os.status_os !== 'ENTREGUE' && os.status_os !== 'CANCELADO' && os.status_os !== 'RASCUNHO')
      .slice(0, 6);
  }, [listaOrdens]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-24 space-y-4">
        <div className="w-9 h-9 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-xs text-zinc-400 font-semibold tracking-wider uppercase">
          Carregando painel operacional...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-8 max-w-[1600px] mx-auto font-sans pb-10 w-full min-w-0">
      {/* ================= CABEÇALHO DO PAINEL ================= */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[10px] sm:text-[11px] font-bold tracking-widest text-blue-400 uppercase">
            RESUMO OPERACIONAL
          </span>
          <h2 className="text-xl sm:text-3xl font-extrabold text-white mt-0.5 tracking-tight truncate">
            {saudacao}, {primeiroNome}
          </h2>
          <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5 truncate">
            Movimento em {dataHojeExtenso}
          </p>
        </div>

        <button
          onClick={() => carregarOrdens(true)}
          title="Atualizar dados"
          className="px-3 py-2 sm:px-4 sm:py-2 bg-[#0e1422] hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-200 transition flex items-center space-x-1.5 shrink-0 shadow-sm"
        >
          <svg
            className="w-3.5 h-3.5 text-zinc-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="hidden sm:inline">Atualizar dados</span>
          <span className="sm:hidden text-[11px]">Atualizar</span>
        </button>
      </div>

      {erroCarregamento && (
        <AvisoErroCarregamento mensagem={erroCarregamento} onTentarNovamente={() => carregarOrdens(true)} />
      )}

      {/* ================= 4 CARDS SUPERIORES: 2x2 NO MOBILE, 4 COLUNAS NO DESKTOP ================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Card 1: Na Bancada */}
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-xl sm:rounded-2xl p-3 sm:p-5 relative overflow-hidden shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-medium text-zinc-400 truncate">Na bancada</span>
            <div className="p-1 sm:p-2 rounded-md sm:rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
              </svg>
            </div>
          </div>
          <h3 className="text-xl sm:text-3xl font-extrabold text-white mt-1.5 sm:mt-3 tracking-tight">
            {String(ordensNaBancada.length).padStart(2, '0')}
          </h3>
          <p className="text-[10px] sm:text-[11px] text-zinc-400 mt-1 sm:mt-2 font-medium truncate">
            {aguardamDiagnostico} aguardam diagnóstico
          </p>
        </div>

        {/* Card 2: Prontos para Retirada */}
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-xl sm:rounded-2xl p-3 sm:p-5 relative overflow-hidden shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-medium text-zinc-400 truncate">Prontos</span>
            <div className="p-1 sm:p-2 rounded-md sm:rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <h3 className="text-xl sm:text-3xl font-extrabold text-white mt-1.5 sm:mt-3 tracking-tight">
            {String(ordensProntas.length).padStart(2, '0')}
          </h3>
          <p className="text-[10px] sm:text-[11px] text-zinc-400 mt-1 sm:mt-2 font-medium truncate">
            {veFinanceiro
              ? `R$ ${valorTotalProntos.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} em serviços`
              : 'Aguardando retirada'}
          </p>
        </div>

        {/* Card 3: Aguardando Peça */}
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-xl sm:rounded-2xl p-3 sm:p-5 relative overflow-hidden shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-medium text-zinc-400 truncate">Aguard. peça</span>
            <div className="p-1 sm:p-2 rounded-md sm:rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
          </div>
          <h3 className="text-xl sm:text-3xl font-extrabold text-white mt-1.5 sm:mt-3 tracking-tight">
            {String(ordensAguardandoPeca.length).padStart(2, '0')}
          </h3>
          <p className="text-[10px] sm:text-[11px] text-zinc-400 mt-1 sm:mt-2 font-medium truncate">
            {ordensAguardandoPeca.length === 0
              ? 'Nenhum atraso'
              : fornecedoresAguardados > 0
              ? `${fornecedoresAguardados} ${fornecedoresAguardados === 1 ? 'fornecedor' : 'fornecedores'}`
              : 'Fornecedor não informado'}
          </p>
        </div>

        {/* Card 4: Faturamento do mês (acesso financeiro) ou Ordens do mês (demais funcionários) */}
        {veFinanceiro ? (
          <div className="bg-[#0c101a] border border-zinc-800/80 rounded-xl sm:rounded-2xl p-3 sm:p-5 relative overflow-hidden shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-medium text-zinc-400 truncate">Faturamento (mês)</span>
              <div className="p-1 sm:p-2 rounded-md sm:rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
              </div>
            </div>
            <h3 className="text-base sm:text-3xl font-extrabold text-white mt-1.5 sm:mt-3 tracking-tight truncate">
              R$ {formatarValor(faturamentoMes)}
            </h3>
            <p className="text-[10px] sm:text-[11px] text-zinc-400 mt-1 sm:mt-2 font-medium truncate">
              Lucro R$ {formatarValor(lucroLiquidoReal)}
            </p>
          </div>
        ) : (
          <div className="bg-[#0c101a] border border-zinc-800/80 rounded-xl sm:rounded-2xl p-3 sm:p-5 relative overflow-hidden shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] sm:text-xs font-medium text-zinc-400 truncate">Ordens (mês)</span>
              <div className="p-1 sm:p-2 rounded-md sm:rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0">
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>
            <h3 className="text-xl sm:text-3xl font-extrabold text-white mt-1.5 sm:mt-3 tracking-tight">
              {String(ordensValidasDoMes.length).padStart(2, '0')}
            </h3>
            <p className="text-[10px] sm:text-[11px] text-zinc-400 mt-1 sm:mt-2 font-medium truncate">
              {entreguesNoMes} {entreguesNoMes === 1 ? 'entregue' : 'entregues'} no mês
            </p>
          </div>
        )}
      </div>

      {/* ================= BLOCO PRINCIPAL (3 CARDS ALINHADOS E COM ALTURA UNIFORME) ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-stretch min-w-0 w-full">
        {/* Card 1 (Esquerda - 7 colunas): Tabela de Ordens em Andamento */}
        <div className="lg:col-span-7 flex flex-col bg-[#0c101a] border border-zinc-800/80 rounded-2xl overflow-hidden shadow-sm min-w-0 w-full h-full">
          <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between gap-3">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-bold text-white truncate">Ordens em andamento</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                    {ordensEmAndamento.length}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5 truncate">Serviços que exigem acompanhamento</p>
              </div>
            </div>
            {onNavigate && (
              <button
                onClick={() => onNavigate('historico')}
                className="px-3 py-1.5 rounded-xl bg-[#080c14] hover:bg-zinc-800/80 border border-zinc-800 text-xs font-semibold text-blue-400 hover:text-blue-300 transition flex items-center space-x-1 shrink-0"
              >
                <span>Ver histórico</span>
                <span>&rsaquo;</span>
              </button>
            )}
          </div>

          {ordensEmAndamento.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 sm:p-14 text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3 shadow-inner">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-bold text-zinc-200">Nenhuma ordem em andamento no momento</p>
              <p className="text-xs text-zinc-400 mt-1 max-w-sm">
                Todas as ordens de serviço foram finalizadas ou entregues.
              </p>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('nova-os')}
                  className="mt-4 px-4 py-2 rounded-xl bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 text-blue-400 text-xs font-bold transition"
                >
                  + Abrir nova ordem
                </button>
              )}
            </div>
          ) : (
            <>
            {/* Celular: cards compactos, sem rolagem lateral */}
            <ul className="md:hidden divide-y divide-zinc-800/40 overflow-x-hidden flex-1">
              {ordensEmAndamento.map((os) => (
                <li key={os.id_os} className="px-4 py-3 min-w-0">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="font-mono font-bold text-blue-400 text-xs whitespace-nowrap">#{os.numero_os}</span>
                    <div className="min-w-0 overflow-hidden">{renderStatusBadge(os.status_os)}</div>
                  </div>
                  <p className="mt-1 text-sm truncate">
                    <span className="font-bold text-white">{os.cliente?.nome || 'Cliente Balcão'}</span>
                    <span className="text-zinc-400"> • {os.aparelho?.modelo || 'Smartphone'}</span>
                  </p>
                  <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                    <span className="truncate">{os.servicoRealizado || os.defeitoRelatado || 'Manutenção geral'}</span>
                    <span className="whitespace-nowrap shrink-0">{formatarDataEntrada(os.data_abertura)}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden md:block overflow-x-auto flex-1">
              <table className="w-full text-left text-xs min-w-[560px]">
                <thead className="bg-[#090d15] text-[10px] text-zinc-400 uppercase tracking-wider border-b border-zinc-800/60">
                  <tr>
                    <th className="py-3 px-5 font-bold">ORDEM</th>
                    <th className="py-3 px-5 font-bold">CLIENTE</th>
                    <th className="py-3 px-5 font-bold">APARELHO / SERVIÇO</th>
                    <th className="py-3 px-5 font-bold">ENTRADA</th>
                    <th className="py-3 px-5 font-bold text-center">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/40">
                  {ordensEmAndamento.map((os) => (
                    <tr key={os.id_os} className="hover:bg-zinc-800/20 transition">
                      <td className="py-3.5 px-5 font-bold text-blue-400 font-mono">
                        {os.numero_os}
                      </td>
                      <td className="py-3.5 px-5">
                        <p className="font-bold text-white text-xs">{os.cliente?.nome || 'Cliente Balcão'}</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">{os.cliente?.whatsapp || 'Sem telefone'}</p>
                      </td>
                      <td className="py-3.5 px-5">
                        <p className="font-semibold text-zinc-200 text-xs">
                          {os.aparelho?.modelo || 'Smartphone'}
                        </p>
                        <p className="text-[11px] text-zinc-400 mt-0.5 truncate max-w-[200px]">
                          {os.servicoRealizado || os.defeitoRelatado || 'Manutenção geral'}
                        </p>
                      </td>
                      <td className="py-3.5 px-5 text-zinc-400 font-medium">
                        {formatarDataEntrada(os.data_abertura)}
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        {renderStatusBadge(os.status_os)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>

        {/* Coluna Direita (5 colunas): Cards "Hoje na Loja" e "Meta de Faturamento" distribuídos com mesma proporção */}
        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 sm:gap-6 min-w-0 h-full">
          {/* Card 2: Hoje na loja */}
          <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between">
            <div className="px-5 py-4 border-b border-zinc-800/80 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white leading-tight">Hoje na loja</h3>
                  <p className="text-[11px] text-zinc-400">Resumo diário em tempo real</p>
                </div>
              </div>
              {horaAtual && (
                <span className="px-2.5 py-1 rounded-lg bg-[#080c14] border border-zinc-800 text-[11px] text-zinc-400 font-medium">
                  até {horaAtual}
                </span>
              )}
            </div>

            <div className="p-4 sm:p-5 grid grid-cols-2 gap-3 flex-1 items-stretch">
              {(
                [
                  ['Entradas', entradasHoje, 'bg-blue-500', 'border-blue-500/20 text-blue-400'],
                  ['Finalizados', finalizadosHoje, 'bg-emerald-500', 'border-emerald-500/20 text-emerald-400'],
                  ['Entregues', entreguesHoje, 'bg-purple-500', 'border-purple-500/20 text-purple-400'],
                  ['Orçamentos pend.', orcamentosPendentes, 'bg-amber-500', 'border-amber-500/20 text-amber-400'],
                ] as const
              ).map(([rotulo, valor, corPonto, corDestaque]) => (
                <div
                  key={rotulo}
                  className="rounded-xl bg-[#080c14] border border-zinc-800/80 px-3.5 py-3 flex flex-col justify-between min-w-0 hover:border-zinc-700/80 transition"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[11px] text-zinc-400 font-medium truncate">{rotulo}</span>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${corPonto}`} />
                  </div>
                  <div className="flex items-baseline justify-between mt-2">
                    <p className="text-2xl font-extrabold text-white tracking-tight">
                      {String(valor).padStart(2, '0')}
                    </p>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-zinc-900/60 ${corDestaque}`}>
                      hoje
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 3: Meta de faturamento (acesso financeiro) ou Conclusão das ordens do mês */}
          {veFinanceiro ? (
            <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between">
              <div className="px-5 py-4 border-b border-zinc-800/80 flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white leading-tight truncate">Meta de faturamento</p>
                    <p className="text-[11px] text-zinc-400 truncate first-letter:uppercase">{resumoMeta.rotuloCompetencia}</p>
                  </div>
                </div>
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate('relatorios')}
                    className="px-3 py-1.5 rounded-xl bg-[#080c14] hover:bg-zinc-800/80 border border-zinc-800 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition shrink-0"
                  >
                    {resumoMeta.metaConfigurada ? 'Editar meta' : 'Definir meta'} &rsaquo;
                  </button>
                )}
              </div>

              <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-[#080c14] border border-zinc-800/80">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      ALCANÇADO NO MÊS
                    </span>
                    <h4 className="text-lg sm:text-xl font-extrabold text-white mt-1 truncate">
                      R$ {formatarValor(resumoMeta.valorAlcancado)}
                    </h4>
                  </div>
                  <div className="p-3 rounded-xl bg-[#080c14] border border-zinc-800/80 text-right">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      META DEFINIDA
                    </span>
                    <p className="text-lg sm:text-xl font-extrabold text-zinc-200 mt-1 truncate">
                      {resumoMeta.metaConfigurada
                        ? `R$ ${formatarValor(resumoMeta.metaDefinida)}`
                        : 'Não definida'}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {/* Barra de Progresso */}
                  <div className="w-full bg-zinc-800/80 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        resumoMeta.metaBatida ? 'bg-emerald-500' : 'bg-blue-600'
                      }`}
                      style={{ width: `${resumoMeta.percentualBarraVisual}%` }}
                    />
                  </div>

                  {resumoMeta.metaConfigurada ? (
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className={`font-bold ${resumoMeta.metaBatida ? 'text-emerald-400' : 'text-zinc-200'}`}>
                        {resumoMeta.percentualAtingido}% da meta mensal
                      </span>
                      <span className="text-zinc-400 font-medium">
                        {resumoMeta.valorExcedente > 0
                          ? `+ R$ ${formatarValor(resumoMeta.valorExcedente)} acima`
                          : resumoMeta.valorRestante > 0
                          ? `Faltam R$ ${formatarValor(resumoMeta.valorRestante)}`
                          : 'Meta concluída!'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-zinc-400">Nenhuma meta configurada para este mês.</span>
                      {onNavigate && (
                        <button
                          type="button"
                          onClick={() => onNavigate('relatorios')}
                          className="font-bold text-blue-400 hover:underline"
                        >
                          Configurar agora
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Card operacional: andamento das ordens do mês, sem nenhum valor financeiro */
            <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between">
              <div className="px-5 py-4 border-b border-zinc-800/80 flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-tight">Conclusão das ordens do mês</p>
                  <p className="text-[11px] text-zinc-400 first-letter:uppercase">{rotuloMes}</p>
                </div>
              </div>

              <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-[#080c14] border border-zinc-800/80">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      PRONTAS OU ENTREGUES
                    </span>
                    <h4 className="text-xl font-extrabold text-white mt-1">
                      {String(concluidasNoMes).padStart(2, '0')}
                    </h4>
                  </div>
                  <div className="p-3 rounded-xl bg-[#080c14] border border-zinc-800/80 text-right">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      ABERTAS NO MÊS
                    </span>
                    <p className="text-xl font-extrabold text-zinc-200 mt-1">
                      {String(ordensValidasDoMes.length).padStart(2, '0')}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="w-full bg-zinc-800/80 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        ordensValidasDoMes.length > 0 && percentualConclusao === 100 ? 'bg-emerald-500' : 'bg-blue-600'
                      }`}
                      style={{ width: `${percentualConclusao}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    {ordensValidasDoMes.length > 0 ? (
                      <>
                        <span className="font-bold text-zinc-200">{percentualConclusao}% concluídas</span>
                        <span className="text-zinc-400 font-medium">
                          {ordensValidasDoMes.length - concluidasNoMes} em andamento
                        </span>
                      </>
                    ) : (
                      <span className="text-zinc-400">Nenhuma ordem aberta neste mês.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};