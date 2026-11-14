import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { buscarOrdensServico, buscarServicosCadastrados, diaLocalDaData } from '../services/api';
import {
  type ComissaoTecnico,
  ComissoesAusenteError,
  type ConfigComissao,
  CONFIG_COMISSAO_PADRAO,
  ROTULO_BASE,
  type Tecnico,
  calcularComissoes,
  carregarConfigComissao,
  descricaoDespesaComissao,
  listarTecnicos,
  salvarConfigComissao,
} from '../services/comissoes';
import { type Despesa, criarDespesa, hojeISO, listarDespesasSeDisponivel } from '../services/despesas';
import { Badge, Carregando, FiltroSegmentado, PaginaCadastro, useFeedback } from '../components/cadastros/ui';
import type { OrdemServico } from '../types';
import { formatarValor } from '../utils/formatadores';
import { dataBR, mesDe, nomeMes, somarMes, ultimoDiaDoMes } from '../utils/meses';
import { baixarCsv } from '../utils/csv';

// ==========================================
// Comissão por técnico: regras (percentual por técnico ou por serviço) e relatório do mês.
// ==========================================

const campoPctCls =
  'w-20 px-2.5 py-1.5 bg-[#080c14] border border-zinc-800/80 rounded-lg text-xs text-white text-right outline-none focus:border-blue-500 tabular-nums';

/** Texto digitado -> percentual (vazio = sem regra) */
const lerPct = (s: string): number | null => {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

type MapaTexto = Record<string, string>;
const paraTexto = (m: Record<string, number>): MapaTexto => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, String(v).replace('.', ',')]));

export const Comissoes: React.FC = () => {
  const [mes, setMes] = useState(() => mesDe(hojeISO()));
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [servicos, setServicos] = useState<any[]>([]);
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [cfg, setCfg] = useState<ConfigComissao>(CONFIG_COMISSAO_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [ausente, setAusente] = useState(false);

  // Formulário das regras (texto, para aceitar vírgula e campo vazio)
  const [base, setBase] = useState(CONFIG_COMISSAO_PADRAO.base);
  const [pctTecnico, setPctTecnico] = useState<MapaTexto>({});
  const [pctServico, setPctServico] = useState<MapaTexto>({});
  const [salvandoRegras, setSalvandoRegras] = useState(false);
  const [regrasAbertas, setRegrasAbertas] = useState(false);

  const [aberto, setAberto] = useState<string | null>(null);
  const [lancando, setLancando] = useState<string | null>(null);
  const feedback = useFeedback();

  const aplicarConfig = (c: ConfigComissao) => {
    setCfg(c);
    setBase(c.base);
    setPctTecnico(paraTexto(c.porTecnico));
    setPctServico(paraTexto(c.porServico));
  };

  const carregar = async () => {
    try {
      const [c, os, tec, serv, desp] = await Promise.all([
        carregarConfigComissao(),
        buscarOrdensServico().catch(() => [] as OrdemServico[]),
        listarTecnicos(),
        buscarServicosCadastrados().catch(() => []),
        listarDespesasSeDisponivel(),
      ]);
      aplicarConfig(c);
      setOrdens(os);
      setTecnicos(tec);
      setServicos(serv);
      setDespesas(desp);
      setAusente(false);
      // Primeira vez (sem nenhuma regra): já mostra onde configurar
      if (!Object.keys(c.porTecnico).length && !Object.keys(c.porServico).length) setRegrasAbertas(true);
    } catch (e: any) {
      if (e instanceof ComissoesAusenteError) setAusente(true);
      else feedback.erro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const salvarRegras = async () => {
    const converter = (m: MapaTexto, rotulo: string) => {
      const saida: Record<string, number> = {};
      for (const [id, texto] of Object.entries(m)) {
        const v = lerPct(texto);
        if (v === null) continue;
        if (!(v >= 0 && v <= 100)) throw new Error(`Percentual inválido em ${rotulo}: use um número de 0 a 100.`);
        if (v > 0) saida[id] = v;
      }
      return saida;
    };
    setSalvandoRegras(true);
    try {
      const novo: ConfigComissao = { base, porTecnico: converter(pctTecnico, 'técnicos'), porServico: converter(pctServico, 'serviços') };
      await salvarConfigComissao(novo);
      aplicarConfig(novo);
      feedback.sucesso('Regras de comissão salvas.');
    } catch (e: any) {
      feedback.erro(e.message);
    } finally {
      setSalvandoRegras(false);
    }
  };

  const nomeAtual = (id: string, padrao: string) => tecnicos.find((t) => t.id_funcionario === id)?.nome || padrao;
  const { porTecnico, semTecnico } = useMemo(() => calcularComissoes(ordens, cfg, mes), [ordens, cfg, mes]);
  const totalMes = porTecnico.reduce((t, g) => t + g.total, 0);
  const totalOS = porTecnico.reduce((t, g) => t + g.linhas.length, 0);

  // Despesas de comissão já lançadas no mês (mesma descrição)
  const jaLancada = (g: ComissaoTecnico) => {
    const descricao = descricaoDespesaComissao(nomeAtual(g.id, g.nome), nomeMes(mes)).toLowerCase();
    return despesas.some((d) => mesDe(d.data) === mes && d.descricao.trim().toLowerCase() === descricao);
  };

  const lancarDespesa = async (g: ComissaoTecnico) => {
    if (g.total <= 0) return;
    setLancando(g.id);
    try {
      await criarDespesa({
        descricao: descricaoDespesaComissao(nomeAtual(g.id, g.nome), nomeMes(mes)),
        categoria: 'Comissões',
        valor: g.total,
        data: ultimoDiaDoMes(mes),
        pago: false,
        data_pagamento: null,
        forma_pagamento: null,
        id_fornecedor: null,
        observacoes: `${g.linhas.length} OS entregue(s) · base: ${ROTULO_BASE[cfg.base].split(' (')[0].toLowerCase()}`,
      });
      setDespesas(await listarDespesasSeDisponivel());
      feedback.sucesso(`Comissão de ${nomeAtual(g.id, g.nome)} lançada em Despesas (a pagar, vence ${dataBR(ultimoDiaDoMes(mes))}).`);
    } catch (e: any) {
      feedback.erro(e.message);
    } finally {
      setLancando(null);
    }
  };

  const exportarCSV = () => {
    const linhas = porTecnico.flatMap((g) => g.linhas.map((l) => ({ g, l })));
    if (!linhas.length) {
      alert('Não há comissões neste mês para exportar.');
      return;
    }
    baixarCsv(
      `comissoes_${mes}.csv`,
      ['Tecnico', 'OS', 'Entrega', 'Servico', 'Base', 'Percentual', 'Comissao'],
      linhas.map(({ g, l }) => [
        nomeAtual(g.id, g.nome),
        String(l.os.numero_os ?? ''),
        dataBR(diaLocalDaData(l.os.data_conclusao || l.os.data_abertura)),
        l.os.checklistEntrada?.__servicoNome || l.os.servicoRealizado || '',
        l.base,
        l.percentual,
        l.valor,
      ]),
    );
  };

  if (!carregando && ausente) {
    return (
      <PaginaCadastro titulo="Comissões" descricao="Comissão por técnico, calculada sobre as OS entregues no mês.">
        <div className="bg-[#0c101a] border border-blue-500/30 rounded-2xl p-6">
          <p className="text-sm font-bold text-blue-400">As comissões ainda não foram ativadas no banco de dados</p>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            Execute a migração{' '}
            <code className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-200 text-[11px]">supabase/migrations/20261108150000_comissoes.sql</code> no
            SQL Editor do Supabase e recarregue esta página.
          </p>
        </div>
      </PaginaCadastro>
    );
  }

  const tecnicosAtivos = tecnicos.filter((t) => t.ativo || pctTecnico[t.id_funcionario]);

  return (
    <PaginaCadastro
      titulo="Comissões"
      descricao="Comissão por técnico sobre as OS entregues no mês. O percentual do serviço vale mais que o do técnico."
      acoes={
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#0c101a] border border-zinc-800 rounded-xl">
            <button type="button" onClick={() => setMes(somarMes(mes, -1))} aria-label="Mês anterior" className="p-2.5 text-zinc-400 hover:text-white transition">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-1 min-w-[9.5rem] text-center text-xs font-bold text-white">{nomeMes(mes)}</span>
            <button type="button" onClick={() => setMes(somarMes(mes, 1))} aria-label="Próximo mês" className="p-2.5 text-zinc-400 hover:text-white transition">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={exportarCSV}
            title="Exportar comissões do mês (CSV)"
            aria-label="Exportar comissões do mês"
            className="w-10 h-10 rounded-xl bg-[#0c101a] border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white flex items-center justify-center transition"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      }
    >
      <feedback.Feedback />

      {carregando ? (
        <Carregando />
      ) : (
        <>
          {/* ---------- Resumo ---------- */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { rotulo: 'Comissões do mês', valor: `R$ ${formatarValor(totalMes)}`, cor: 'text-emerald-400' },
              { rotulo: 'OS com técnico', valor: String(totalOS), cor: 'text-white' },
              { rotulo: 'OS sem técnico', valor: String(semTecnico.length), cor: semTecnico.length ? 'text-rose-400' : 'text-white' },
            ].map((c) => (
              <div key={c.rotulo} className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-4 min-w-0">
                <span className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider truncate">{c.rotulo}</span>
                <span className={`block text-lg sm:text-2xl font-extrabold mt-1 tabular-nums truncate ${c.cor}`}>{c.valor}</span>
              </div>
            ))}
          </div>

          {/* ---------- Relatório por técnico ---------- */}
          <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-zinc-800/60">
              <h3 className="text-sm font-bold text-white">Comissão por técnico — {nomeMes(mes).toLowerCase()}</h3>
              <p className="text-[11px] text-zinc-500 mt-0.5">Base: {ROTULO_BASE[cfg.base].toLowerCase()}. Só entram OS com status Entregue no mês.</p>
            </div>
            {porTecnico.length === 0 ? (
              <p className="p-10 text-center text-xs text-zinc-400">
                {tecnicos.length === 0
                  ? 'Cadastre os técnicos em Cadastros › Funcionários e escolha o técnico responsável em cada OS.'
                  : 'Nenhuma OS entregue com técnico responsável neste mês.'}
              </p>
            ) : (
              <ul className="divide-y divide-zinc-800/60">
                {porTecnico.map((g) => {
                  const expandido = aberto === g.id;
                  const lancada = jaLancada(g);
                  return (
                    <li key={g.id}>
                      <div className="flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3">
                        <button
                          type="button"
                          onClick={() => setAberto(expandido ? null : g.id)}
                          aria-expanded={expandido}
                          className="flex items-center gap-2 min-w-0 flex-1 text-left"
                        >
                          <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${expandido ? '' : '-rotate-90'}`} />
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate">{nomeAtual(g.id, g.nome)}</p>
                            <p className="text-[11px] text-zinc-500">
                              {g.linhas.length} OS · base R$ {formatarValor(g.totalBase)}
                              {g.linhas.some((l) => l.percentual === 0) && ' · há OS sem percentual definido'}
                            </p>
                          </div>
                        </button>
                        <span className="text-base font-extrabold text-emerald-400 tabular-nums">R$ {formatarValor(g.total)}</span>
                        {lancada ? (
                          <Badge cor="verde">Lançada em Despesas</Badge>
                        ) : (
                          <button
                            type="button"
                            onClick={() => lancarDespesa(g)}
                            disabled={g.total <= 0 || lancando === g.id}
                            title="Cria uma despesa a pagar na categoria Comissões, vencendo no último dia do mês"
                            className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 text-[11px] font-bold hover:bg-zinc-800 disabled:opacity-40 transition whitespace-nowrap"
                          >
                            {lancando === g.id ? 'Lançando...' : 'Lançar como despesa'}
                          </button>
                        )}
                      </div>
                      {expandido && (
                        <div className="overflow-x-auto bg-[#080c14]/60 border-t border-zinc-800/60">
                          <table className="w-full text-xs min-w-[560px]">
                            <thead className="text-[10px] text-zinc-500 uppercase tracking-wider">
                              <tr>
                                <th className="py-2 px-4 text-left font-semibold">OS</th>
                                <th className="py-2 px-4 text-left font-semibold">Entrega</th>
                                <th className="py-2 px-4 text-left font-semibold">Serviço</th>
                                <th className="py-2 px-4 text-right font-semibold">Base</th>
                                <th className="py-2 px-4 text-right font-semibold">%</th>
                                <th className="py-2 px-4 text-right font-semibold">Comissão</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/40">
                              {g.linhas.map((l) => (
                                <tr key={l.os.id_os}>
                                  <td className="py-2 px-4 text-zinc-200 font-semibold">#{l.os.numero_os}</td>
                                  <td className="py-2 px-4 text-zinc-400">{dataBR(diaLocalDaData(l.os.data_conclusao || l.os.data_abertura))}</td>
                                  <td className="py-2 px-4 text-zinc-300 max-w-[260px] truncate">{l.os.checklistEntrada?.__servicoNome || l.os.servicoRealizado || '—'}</td>
                                  <td className="py-2 px-4 text-right text-zinc-300 tabular-nums">R$ {formatarValor(l.base)}</td>
                                  <td className="py-2 px-4 text-right text-zinc-400 tabular-nums" title={l.origem === 'SERVICO' ? 'Percentual do serviço' : l.origem === 'TECNICO' ? 'Percentual do técnico' : 'Sem percentual'}>
                                    {l.percentual.toLocaleString('pt-BR')}%{l.origem === 'SERVICO' ? ' (serviço)' : ''}
                                  </td>
                                  <td className="py-2 px-4 text-right text-emerald-400 font-semibold tabular-nums">R$ {formatarValor(l.valor)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {semTecnico.length > 0 && (
              <p className="px-4 sm:px-5 py-3 border-t border-zinc-800/60 text-[11px] text-zinc-400">
                <strong className="text-rose-400">{semTecnico.length} OS entregue(s) sem técnico</strong> não entram na comissão:{' '}
                {semTecnico
                  .slice(0, 8)
                  .map((o) => `#${o.numero_os}`)
                  .join(', ')}
                {semTecnico.length > 8 ? '...' : ''}. Escolha o técnico em Ordens de serviço › Editar OS.
              </p>
            )}
          </div>

          {/* ---------- Regras ---------- */}
          <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setRegrasAbertas((v) => !v)}
              aria-expanded={regrasAbertas}
              className="w-full flex items-center justify-between gap-3 p-4 sm:p-5 text-left"
            >
              <div>
                <h3 className="text-sm font-bold text-white">Regras de comissão</h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">Percentual por técnico e, se quiser, por serviço do catálogo.</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${regrasAbertas ? 'rotate-180' : ''}`} />
            </button>

            {regrasAbertas && (
              <div className="px-4 sm:px-5 pb-5 space-y-5 border-t border-zinc-800/60 pt-4">
                <div className="space-y-2">
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Calcular sobre</p>
                  <FiltroSegmentado
                    valor={base}
                    onChange={setBase}
                    opcoes={[
                      { valor: 'LUCRO', label: 'Lucro da OS' },
                      { valor: 'VALOR', label: 'Valor cobrado' },
                    ]}
                  />
                  <p className="text-[11px] text-zinc-500">{ROTULO_BASE[base]}. OS com lucro negativo não geram comissão.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div>
                    <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Por técnico</p>
                    {tecnicosAtivos.length === 0 ? (
                      <p className="text-xs text-zinc-500">Nenhum funcionário cadastrado (Cadastros › Funcionários).</p>
                    ) : (
                      <ul className="divide-y divide-zinc-800/60 border border-zinc-800/80 rounded-xl">
                        {tecnicosAtivos.map((t) => (
                          <li key={t.id_funcionario} className="flex items-center justify-between gap-3 px-3 py-2">
                            <span className="text-xs text-zinc-200 truncate">
                              {t.nome}
                              {!t.ativo && <span className="text-zinc-500"> (inativo)</span>}
                            </span>
                            <span className="flex items-center gap-1.5 shrink-0">
                              <input
                                inputMode="decimal"
                                value={pctTecnico[t.id_funcionario] ?? ''}
                                onChange={(e) => setPctTecnico((m) => ({ ...m, [t.id_funcionario]: e.target.value }))}
                                placeholder="0"
                                aria-label={`Comissão de ${t.nome} (%)`}
                                className={campoPctCls}
                              />
                              <span className="text-xs text-zinc-500">%</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Por serviço (opcional, vale mais)</p>
                    {servicos.length === 0 ? (
                      <p className="text-xs text-zinc-500">Nenhum serviço no catálogo (Cadastros › Serviços).</p>
                    ) : (
                      <ul className="divide-y divide-zinc-800/60 border border-zinc-800/80 rounded-xl max-h-80 overflow-y-auto">
                        {servicos.map((s) => {
                          const id = String(s.id_servico || s.id);
                          return (
                            <li key={id} className="flex items-center justify-between gap-3 px-3 py-2">
                              <span className="text-xs text-zinc-200 truncate">{s.nome}</span>
                              <span className="flex items-center gap-1.5 shrink-0">
                                <input
                                  inputMode="decimal"
                                  value={pctServico[id] ?? ''}
                                  onChange={(e) => setPctServico((m) => ({ ...m, [id]: e.target.value }))}
                                  placeholder="—"
                                  aria-label={`Comissão do serviço ${s.nome} (%)`}
                                  className={campoPctCls}
                                />
                                <span className="text-xs text-zinc-500">%</span>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <p className="text-[11px] text-zinc-500 mt-1.5">Vazio: usa o percentual do técnico.</p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={salvarRegras}
                    disabled={salvandoRegras}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold rounded-xl text-xs transition"
                  >
                    {salvandoRegras ? 'Salvando...' : 'Salvar regras'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </PaginaCadastro>
  );
};
