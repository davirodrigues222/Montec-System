import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  buscarOrdensServico,
  buscarServicosCadastrados,
  registrarGarantiaOS,
  validarElegibilidadeGarantiaOS,
  type ResultadoElegibilidadeGarantia,
} from '../services/api';
import type { OrdemServico } from '../types';
import { AvisoErroCarregamento } from '../components/AvisoErroCarregamento';
import { formatarDataOS } from '../utils/formatadores';

export const GarantiaRetorno: React.FC = () => {
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [servicosCadastrados, setServicosCadastrados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [termoBusca, setTermoBusca] = useState('');
  const [osSelecionada, setOsSelecionada] = useState<OrdemServico | null>(null);

  // Campos do Formulário de Garantia
  const [defeitoApresentado, setDefeitoApresentado] = useState('');
  const [pecaSubstituida, setPecaSubstituida] = useState('');
  const [custoPeca, setCustoPeca] = useState<number | ''>('');
  const [fretePeca, setFretePeca] = useState<number | ''>('');
  const [salvando, setSalvando] = useState(false);
  const salvandoRef = useRef(false); // trava imediata contra duplo clique

  // Regra de Elegibilidade da Garantia (Sem limite fixo de 90 dias, respeita prazo individual e flag Sem Garantia)
  const checarElegibilidade = (os: OrdemServico, listaServicos = servicosCadastrados): ResultadoElegibilidadeGarantia => {
    return validarElegibilidadeGarantiaOS(os, { servicosCadastrados: listaServicos });
  };

  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);

  const carregarOrdens = async (forcar = false) => {
    setLoading(true);
    setErroCarregamento(null);
    try {
      const [listaOrdens, listaServicos] = await Promise.all([
        buscarOrdensServico(forcar),
        buscarServicosCadastrados(),
      ]);

      setOrdens(listaOrdens);
      setServicosCadastrados(listaServicos);

      // Mantém a OS já selecionada (se continuar elegível); senão, seleciona a primeira elegível
      const elegivel = (os: OrdemServico) => checarElegibilidade(os, listaServicos).elegivel;
      const osAtualizada = osSelecionada && listaOrdens.find((o) => o.id_os === osSelecionada.id_os);
      setOsSelecionada(
        osAtualizada && elegivel(osAtualizada) ? osAtualizada : listaOrdens.find(elegivel) || null
      );
    } catch (err: any) {
      console.error('Erro ao carregar ordens para garantia:', err);
      setErroCarregamento(err?.message || 'Verifique a conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarOrdens();
  }, []);

  // Filtragem da Lista de Ordens
  const ordensFiltradas = useMemo(() => {
    return ordens.filter((os) => {
      const termo = termoBusca.toLowerCase().trim();
      const numOs = (os.numero_os || '').toLowerCase();
      const cli = (os.cliente?.nome || '').toLowerCase();
      const apr = (os.aparelho?.modelo || '').toLowerCase();

      return !termo || numOs.includes(termo) || cli.includes(termo) || apr.includes(termo);
    });
  }, [ordens, termoBusca]);

  // Elegibilidade da OS atualmente selecionada
  const validacaoSelecionada = useMemo(() => {
    if (!osSelecionada) return null;
    return checarElegibilidade(osSelecionada);
  }, [osSelecionada, servicosCadastrados]);

  // Clique em uma OS da listagem lateral
  const handleSelecionarOS = (os: OrdemServico) => {
    const validacao = checarElegibilidade(os);
    if (!validacao.elegivel) {
      alert(validacao.motivo || 'Esta Ordem de Serviço não é elegível para retorno em garantia.');
      return;
    }
    setOsSelecionada(os);
  };

  // Submissão do Retorno de Garantia
  const handleRegistrarRetorno = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!osSelecionada) return;

    // Validação rigorosa antes de confirmar o retorno
    const validacao = checarElegibilidade(osSelecionada);
    if (!validacao.elegivel) {
      alert(validacao.motivo || 'Esta Ordem de Serviço não é elegível para retorno em garantia.');
      return;
    }

    if (!defeitoApresentado.trim()) {
      alert('Por favor, informe o defeito apresentado no retorno.');
      return;
    }

    if (salvandoRef.current) return;
    salvandoRef.current = true;
    setSalvando(true);
    try {
      const numCustoPeca = Number(custoPeca) || 0;
      const numFretePeca = Number(fretePeca) || 0;
      const prejuizoTotal = numCustoPeca + numFretePeca;

      await registrarGarantiaOS(
        osSelecionada.id_os,
        {
          houveGarantia: true,
          dataRetorno: new Date().toISOString(),
          defeitoConstatadoGarantia: defeitoApresentado.trim(),
          pecaSubstituidaGarantia: pecaSubstituida.trim(),
          custoPecaGarantia: numCustoPeca,
          freteGarantia: numFretePeca,
          prejuizoTotalGarantia: prejuizoTotal,
          prazoGarantiaDias: validacao.prazoDias,
          diasDecorridos: validacao.diasDecorridos,
        },
        `Retorno em Garantia: ${defeitoApresentado} (Peça: ${pecaSubstituida || 'N/A'} | Custo: R$ ${numCustoPeca.toFixed(2)} | Frete: R$ ${numFretePeca.toFixed(2)})`
      );

      alert('Retorno de garantia registrado com sucesso! O valor foi debitado no cálculo do lucro real.');
      setDefeitoApresentado('');
      setPecaSubstituida('');
      setCustoPeca('');
      setFretePeca('');
      await carregarOrdens();
    } catch (err: any) {
      console.error('Erro ao registrar garantia:', err);
      alert(err.message || 'Falha ao registrar garantia.');
    } finally {
      setSalvando(false);
      salvandoRef.current = false;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-24 space-y-4">
        <div className="w-9 h-9 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-xs text-zinc-400 font-semibold tracking-wider uppercase">
          Carregando controle de garantias...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto font-sans pb-12">
      {/* ================= CABEÇALHO (FIGMA) ================= */}
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Garantias e retornos
        </h2>
        <p className="text-xs text-zinc-400 mt-1">
          Registre retornos dentro do prazo de garantia configurado em cada OS e acompanhe o impacto financeiro.
        </p>
      </div>

      {erroCarregamento && (
        <AvisoErroCarregamento mensagem={erroCarregamento} onTentarNovamente={() => carregarOrdens(true)} />
      )}

      {/* ================= GRADE PRINCIPAL (2 COLUNAS DO FIGMA) ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUNA ESQUERDA (Lg: 4/12): SELECIONAR ORDEM CONCLUÍDA */}
        <div className="lg:col-span-4 bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-5 space-y-4 shadow-sm">
          <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
            SELECIONAR ORDEM DE SERVIÇO
          </span>

          {/* Campo de Busca com Lupa */}
          <div className="relative">
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
              placeholder="Buscar ordem ou cliente..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white placeholder-zinc-400 outline-none focus:border-blue-500 transition"
            />
          </div>

          {/* Lista de Ordens */}
          <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1">
            {ordensFiltradas.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-8">Nenhuma ordem encontrada.</p>
            ) : (
              ordensFiltradas.map((os) => {
                const validacao = checarElegibilidade(os);
                const isSelected = osSelecionada?.id_os === os.id_os;

                let labelStatusGarantia = 'Inelegível';
                if (validacao.elegivel) {
                  labelStatusGarantia = `Elegível (${validacao.diasRestantes}d restantes)`;
                } else if (validacao.codigo === 'SEM_GARANTIA') {
                  labelStatusGarantia = 'Sem garantia';
                } else if (validacao.codigo === 'PRAZO_EXPIRADO') {
                  labelStatusGarantia = `Expirada (${validacao.prazoDias}d)`;
                }

                return (
                  <div
                    key={os.id_os}
                    onClick={() => handleSelecionarOS(os)}
                    title={validacao.elegivel ? `Garantia de ${validacao.prazoDias} dias vigente` : validacao.motivo}
                    className={`p-3.5 rounded-xl border transition-all ${
                      !validacao.elegivel
                        ? 'opacity-45 border-zinc-900 bg-[#080c14]/60 cursor-not-allowed'
                        : isSelected
                        ? 'border-blue-500 bg-blue-600/10 shadow-sm cursor-pointer'
                        : 'border-zinc-800/80 bg-[#080c14] hover:border-zinc-700 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono font-bold text-blue-400 text-xs">
                        {os.numero_os}
                      </span>
                      <span
                        className={`text-[11px] font-semibold ${
                          validacao.elegivel
                            ? 'text-emerald-400'
                            : validacao.codigo === 'SEM_GARANTIA'
                            ? 'text-rose-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {labelStatusGarantia}
                      </span>
                    </div>

                    <p className="font-bold text-xs text-white truncate">
                      {os.cliente?.nome || 'Cliente Balcão'}
                    </p>

                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[11px] text-zinc-400 truncate">
                        {os.aparelho?.modelo || 'Smartphone'}
                      </p>
                      <span className="text-[10px] text-zinc-500 font-medium">
                        {validacao.prazoDias > 0 ? `Prazo: ${validacao.prazoDias}d` : 'Sem cobertura'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLUNA DIREITA (Lg: 8/12): FORMULÁRIO DO FIGMA */}
        <div className="lg:col-span-8 bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-6 shadow-sm">
          {osSelecionada && validacaoSelecionada ? (
            <form onSubmit={handleRegistrarRetorno} className="space-y-5">
              {/* Linha Topo: Ordem Selecionada e Status */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-800/60">
                <div>
                  <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                    ORDEM SELECIONADA
                  </span>
                  <h3 className="text-base font-extrabold text-white font-mono mt-0.5">
                    {osSelecionada.numero_os}
                  </h3>
                </div>

                <div className="flex items-center space-x-2">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold border ${
                    validacaoSelecionada.elegivel
                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  }`}>
                    {validacaoSelecionada.elegivel
                      ? `Garantia: ${validacaoSelecionada.prazoDias} dias (Restam ${validacaoSelecionada.diasRestantes}d)`
                      : validacaoSelecionada.codigo === 'SEM_GARANTIA'
                      ? 'Sem Garantia'
                      : 'Garantia Expirada'}
                  </span>

                  <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {osSelecionada.status_os === 'ENTREGUE' ? 'Entregue' : osSelecionada.status_os}
                  </span>
                </div>
              </div>

              {/* Banner caso a OS selecionada seja inelegível */}
              {!validacaoSelecionada.elegivel && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 font-semibold">
                  ⚠️ {validacaoSelecionada.motivo}
                </div>
              )}

              {/* Card Resumo do Atendimento */}
              <div className="p-4 bg-[#080c14] border border-zinc-800/80 rounded-xl space-y-1">
                <p className="text-sm font-bold text-white">
                  {osSelecionada.cliente?.nome} · {osSelecionada.aparelho?.modelo}
                </p>
                <p className="text-xs text-zinc-400">
                  Serviço original: <span className="text-zinc-300 font-medium">{osSelecionada.servicoRealizado || osSelecionada.defeitoRelatado || 'Manutenção geral'}</span>
                </p>
                <p className="text-[11px] text-zinc-500">
                  Data de abertura: {formatarDataOS(osSelecionada.data_abertura) || '—'} ·{' '}
                  {validacaoSelecionada.prazoDias > 0
                    ? `${validacaoSelecionada.diasDecorridos} dia(s) decorrido(s) de ${validacaoSelecionada.prazoDias} dias`
                    : 'Sem cobertura de garantia'}
                </p>
              </div>

              {/* Campos do formulário (bloqueados/translúcidos se não for elegível) */}
              <div className={`space-y-5 transition-all duration-200 ${
                validacaoSelecionada.elegivel ? 'opacity-100' : 'opacity-30 pointer-events-none select-none'
              }`}>
                {/* Defeito Apresentado no Retorno */}
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                    DEFEITO APRESENTADO NO RETORNO *
                  </label>
                  <textarea
                    rows={4}
                    required
                    disabled={!validacaoSelecionada.elegivel}
                    value={defeitoApresentado}
                    onChange={(e) => setDefeitoApresentado(e.target.value)}
                    placeholder="Descreva o problema relatado nesta volta..."
                    className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white placeholder-zinc-400 outline-none focus:border-blue-500 transition"
                  />
                </div>

                {/* Peça Substituída na Garantia */}
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                    PEÇA SUBSTITUÍDA NA GARANTIA
                  </label>
                  <input
                    type="text"
                    disabled={!validacaoSelecionada.elegivel}
                    value={pecaSubstituida}
                    onChange={(e) => setPecaSubstituida(e.target.value)}
                    placeholder="Ex.: frontal OLED, bateria, conector"
                    className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white placeholder-zinc-400 outline-none focus:border-blue-500 transition"
                  />
                </div>

                {/* Custos (Custo da Peça + Frete da Peça) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                      CUSTO DA PEÇA
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!validacaoSelecionada.elegivel}
                      value={custoPeca}
                      onChange={(e) => setCustoPeca(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="R$ 0,00"
                      className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white font-medium outline-none focus:border-blue-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                      FRETE DA PEÇA
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!validacaoSelecionada.elegivel}
                      value={fretePeca}
                      onChange={(e) => setFretePeca(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="R$ 0,00"
                      className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white font-medium outline-none focus:border-blue-500 transition"
                    />
                  </div>
                </div>
              </div>

              {/* Botão Registrar Retorno */}
              <div className="flex justify-end pt-3">
                <button
                  type="submit"
                  disabled={salvando || !validacaoSelecionada.elegivel}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs transition shadow-md shadow-blue-600/20 flex items-center space-x-2"
                >
                  {salvando ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Registrando...</span>
                    </>
                  ) : (
                    <span>Registrar retorno</span>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="p-16 text-center space-y-2">
              <p className="text-sm font-bold text-zinc-300">Nenhuma ordem elegível selecionada</p>
              <p className="text-xs text-zinc-400">
                Selecione uma ordem com garantia vigente na lista ao lado para registrar o retorno em garantia.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};