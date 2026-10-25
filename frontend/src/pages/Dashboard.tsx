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

  const entreguesTotal = useMemo(
    () => listaOrdens.filter((os) => os.status_os === 'ENTREGUE').length,
    [listaOrdens]
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

      {/* ================= BLOCO PRINCIPAL (TABELA + COLUNA LATERAL) ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start min-w-0 w-full">
        {/* Coluna Esquerda: Tabela de Ordens em Andamento */}
        <div className="lg:col-span-2 bg-[#0c101a] border border-zinc-800/80 rounded-2xl overflow-hidden shadow-sm min-w-0 w-full">
          <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Ordens em andamento</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Serviços que exigem acompanhamento</p>
            </div>
            {onNavigate && (
              <button
                onClick={() => onNavigate('historico')}
                className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition flex items-center space-x-1"
              >
                <span>Ver histórico</span>
                <span>&rsaquo;</span>
              </button>
            )}
          </div>

          {ordensEmAndamento.length === 0 ? (
            <div className="p-16 text-center space-y-2">
              <p className="text-sm font-bold text-zinc-300">Nenhuma ordem em andamento no momento</p>
              <p className="text-xs text-zinc-400">
                Todas as ordens de serviço foram finalizadas ou entregues.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[580px]">
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
                      {/* Nº da OS */}
                      <td className="py-3.5 px-5 font-bold text-blue-400 font-mono">
                        {os.numero_os}
                      </td>

                      {/* Cliente */}
                      <td className="py-3.5 px-5">
                        <p className="font-bold text-white text-xs">{os.cliente?.nome || 'Cliente Balcão'}</p>
                        <p className="text-[11px] text-zinc-400 mt-0.5">{os.cliente?.whatsapp || 'Sem telefone'}</p>
                      </td>

                      {/* Aparelho / Serviço */}
                      <td className="py-3.5 px-5">
                        <p className="font-semibold text-zinc-200 text-xs">
                          {os.aparelho?.modelo || 'Smartphone'}
                        </p>
                        <p className="text-[11px] text-zinc-400 mt-0.5 truncate max-w-[220px]">
                          {os.servicoRealizado || os.defeitoRelatado || 'Manutenção geral'}
                        </p>
                      </td>

                      {/* Entrada */}
                      <td className="py-3.5 px-5 text-zinc-400 font-medium">
                        {formatarDataEntrada(os.data_abertura)}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-5 text-center">
                        {renderStatusBadge(os.status_os)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Coluna Direita: Cards "Hoje na Loja" e "Meta de Faturamento" */}
        <div className="space-y-6">
          {/* Card: Hoje na loja */}
          <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800/60 mb-4">
              <h3 className="text-sm font-bold text-white">Hoje na loja</h3>
              {horaAtual && <span className="text-xs text-zinc-400">até {horaAtual}</span>}
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-zinc-300 font-medium">Entradas</span>
                </div>
                <span className="font-bold text-white text-sm">{entradasHoje}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-zinc-300 font-medium">Finalizados</span>
                </div>
                <span className="font-bold text-white text-sm">{finalizadosHoje}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  <span className="text-zinc-300 font-medium">Entregues</span>
                </div>
                <span className="font-bold text-white text-sm">{entreguesTotal}</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-zinc-300 font-medium">Orçamentos pendentes</span>
                </div>
                <span className="font-bold text-white text-sm">{orcamentosPendentes}</span>
              </div>
            </div>
          </div>

          {/* Card lateral: meta de faturamento (acesso financeiro) ou conclusão das ordens do mês */}
          {veFinanceiro ? (
            <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-white">Meta de faturamento</p>
                  <p className="text-[11px] text-zinc-400">{resumoMeta.rotuloCompetencia}</p>
                </div>
                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate('relatorios')}
                    className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition"
                  >
                    {resumoMeta.metaConfigurada ? 'Editar meta' : 'Definir meta'} &rsaquo;
                  </button>
                )}
              </div>
  
              <div className="flex items-baseline justify-between pt-1">
                <div>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                    ALCANÇADO NO MÊS
                  </span>
                  <h4 className="text-2xl font-extrabold text-white mt-0.5">
                    R$ {formatarValor(resumoMeta.valorAlcancado)}
                  </h4>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                    META DEFINIDA
                  </span>
                  <span className="text-xs font-bold text-zinc-300 mt-0.5 block">
                    {resumoMeta.metaConfigurada
                      ? `R$ ${formatarValor(resumoMeta.metaDefinida)}`
                      : 'Não definida'}
                  </span>
                </div>
              </div>
  
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
                <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-800/60">
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
                <div className="pt-1 border-t border-zinc-800/60 flex items-center justify-between text-xs">
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
          ) : (
            /* Card operacional: andamento das ordens do mês, sem nenhum valor financeiro */
            <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-5 shadow-sm space-y-3">
              <div>
                <p className="text-xs font-bold text-white">Conclusão das ordens do mês</p>
                <p className="text-[11px] text-zinc-400 first-letter:uppercase">{rotuloMes}</p>
              </div>

              <div className="flex items-baseline justify-between pt-1">
                <div>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                    PRONTAS OU ENTREGUES
                  </span>
                  <h4 className="text-2xl font-extrabold text-white mt-0.5">{concluidasNoMes}</h4>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                    ABERTAS NO MÊS
                  </span>
                  <span className="text-xs font-bold text-zinc-300 mt-0.5 block">{ordensValidasDoMes.length}</span>
                </div>
              </div>

              <div className="w-full bg-zinc-800/80 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    ordensValidasDoMes.length > 0 && percentualConclusao === 100 ? 'bg-emerald-500' : 'bg-blue-600'
                  }`}
                  style={{ width: `${percentualConclusao}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-800/60">
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
          )}
        </div>
      </div>
    </div>
  );
};