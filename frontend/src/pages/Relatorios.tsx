import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  buscarOrdensServico,
  calcularResumoMetaFinanceira,
  obterMetaFinanceiraConta,
  parsearValorMonetarioBR,
  salvarMetaFinanceiraConta,
  modalidadeDaForma,
  ROTULOS_MODALIDADE,
  type ModalidadePagamento,
  contaNoFaturamento,
  diaLocalDaData,
} from '../services/api';
import { AvisoErroCarregamento } from '../components/AvisoErroCarregamento';
import { baixarCsv } from '../utils/csv';
import type { OrdemServico } from '../types';
import { formaSemParcelas } from '../services/formasPagamentoOS';
// Mesmas fórmulas do Painel: a soma das linhas da auditoria sempre bate com os cards
import { custoFreteOS, custoGarantiaOS, custoPecaOS, custosOS, somar, valorBrutoOS, valorLiquidoOS, valorTaxasOS } from '../utils/financeiroOS';
import { formatarDataOS, formatarValor } from '../utils/formatadores';
import { StatusBadge } from '../components/StatusBadge';
import { type Despesa, listarDespesasSeDisponivel, somarDespesas } from '../services/despesas';

type FiltroPeriodo = 'HOJE' | 'ATUAL' | 'ANTERIOR' | 'ANO_ATUAL' | 'TODOS' | 'PERSONALIZADO';

const chaveDia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const somarDias = (chave: string, dias: number) => {
  const d = new Date(`${chave}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return chaveDia(d);
};

const modalidadeOS = (os: OrdemServico): ModalidadePagamento =>
  (os.modalidadePagamento as ModalidadePagamento) || modalidadeDaForma(os.formaPagamento || '', Number(os.parcelas || 1));
/**
 * Nome da forma nos relatórios: as nativas pela modalidade (PIX, Débito, Crédito à vista/parcelado...);
 * as complementares do cadastro (boleto, crediário, link...) pelo próprio nome, sem o "(3x)".
 */
const rotuloFormaOS = (os: OrdemServico): string => {
  const modalidade = modalidadeOS(os);
  if (modalidade !== 'OUTRO') return ROTULOS_MODALIDADE[modalidade];
  return formaSemParcelas(os.formaPagamento || '') || ROTULOS_MODALIDADE.OUTRO;
};

/** Quantas linhas a listagem de auditoria mostra antes de "Mostrar mais". */
const LINHAS_POR_PAGINA = 50;

type Detalhamento = 'NENHUM' | 'PAGAMENTO' | 'ORDENS' | 'FLUXO';
const ROTULOS_DETALHAMENTO: Record<Detalhamento, string> = {
  NENHUM: 'Ocultar detalhamento',
  PAGAMENTO: 'Por forma de pagamento',
  ORDENS: 'Ordens do período',
  FLUXO: 'Taxas e descontos (fluxo de caixa)',
};

// Menu "Listagens": categorias com submenu, no estilo dos menus de sistemas de gestão
const GRUPOS_LISTAGEM: { id: string; rotulo: string; icone: string; itens: Exclude<Detalhamento, 'NENHUM'>[] }[] = [
  {
    id: 'financeiro',
    rotulo: 'Financeiro',
    icone: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    itens: ['FLUXO', 'PAGAMENTO'],
  },
  {
    id: 'ordens',
    rotulo: 'Ordens de serviço',
    icone: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    itens: ['ORDENS'],
  },
];

/** Botão "Meta Financeira" do cabeçalho: abre um painel suspenso com o resumo da meta do mês. */
const PopoverMeta: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fecharFora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    // Esc no campo de valor só cancela a edição; fora dele fecha o painel
    const fecharEsc = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target instanceof HTMLInputElement) && setAberto(false);
    document.addEventListener('mousedown', fecharFora);
    document.addEventListener('keydown', fecharEsc);
    return () => {
      document.removeEventListener('mousedown', fecharFora);
      document.removeEventListener('keydown', fecharEsc);
    };
  }, [aberto]);

  return (
    // No celular o painel se ancora na linha de controles (pai relative) e ocupa a largura dela; sem top, fica logo abaixo do botão
    <div ref={ref} className="sm:relative shrink-0">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        className={`flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl border text-xs font-semibold shadow-sm transition ${
          aberto ? 'bg-blue-600/15 border-blue-500/40 text-blue-300' : 'bg-[#0c101a] border-zinc-800 text-white hover:border-zinc-700'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1" />
        </svg>
        Meta Financeira
        <svg className={`w-3.5 h-3.5 transition-transform ${aberto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="Meta Financeira"
          className="absolute inset-x-0 sm:left-auto sm:right-0 sm:top-full mt-2 sm:w-[22rem] max-w-[calc(100vw-2rem)] z-30 p-4 bg-[#0c101a] border border-zinc-700/80 rounded-xl shadow-2xl shadow-black/50"
        >
          {children}
        </div>
      )}
    </div>
  );
};

const MenuListagens: React.FC<{ atual: Detalhamento; onEscolher: (d: Detalhamento) => void }> = ({ atual, onEscolher }) => {
  const [aberto, setAberto] = useState(false);
  const [grupoAberto, setGrupoAberto] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fecharFora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    const fecharEsc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fecharFora);
    document.addEventListener('keydown', fecharEsc);
    return () => {
      document.removeEventListener('mousedown', fecharFora);
      document.removeEventListener('keydown', fecharEsc);
    };
  }, [aberto]);

  const escolher = (d: Detalhamento) => {
    onEscolher(d);
    setAberto(false);
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setAberto((v) => !v);
          setGrupoAberto(null);
        }}
        aria-haspopup="menu"
        aria-expanded={aberto}
        className={`flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl border text-xs font-semibold shadow-sm transition ${
          aberto || atual !== 'NENHUM'
            ? 'bg-blue-600/15 border-blue-500/40 text-blue-300'
            : 'bg-[#0c101a] border-zinc-800 text-white hover:border-zinc-700'
        }`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
        </svg>
        Listagens
        <svg className={`w-3.5 h-3.5 transition-transform ${aberto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {aberto && (
        <div role="menu" className="absolute left-0 origin-top-left sm:left-auto sm:right-0 sm:origin-top-right top-full mt-2 w-64 max-w-[calc(100vw-2rem)] z-30 py-1.5 bg-[#0c101a] border border-zinc-700/80 rounded-xl shadow-2xl shadow-black/50">
          {GRUPOS_LISTAGEM.map((grupo, i) => {
            const expandido = grupoAberto === grupo.id;
            return (
              <div key={grupo.id}>
                <button
                  type="button"
                  onClick={() => setGrupoAberto(expandido ? null : grupo.id)}
                  aria-expanded={expandido}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-[13px] transition ${
                    expandido ? 'bg-blue-600/15 text-white' : 'text-zinc-300 hover:bg-zinc-800/50'
                  }`}
                >
                  <svg className="w-4 h-4 shrink-0 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d={grupo.icone} />
                  </svg>
                  <span className="flex-1 truncate">
                    <span className="text-zinc-500 font-mono mr-1.5">{i}</span>
                    {grupo.rotulo}
                  </span>
                  <svg className={`w-3 h-3 shrink-0 text-zinc-400 transition-transform ${expandido ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5l8 7-8 7z" />
                  </svg>
                </button>

                {/* Submenu embaixo do grupo, dentro do próprio menu: nunca sai da tela */}
                {expandido && (
                  <div
                    role="menu"
                    className="py-1 bg-[#080c14] border-y border-zinc-800/80"
                  >
                    {grupo.itens.map((item) => (
                      <button
                        key={item}
                        type="button"
                        role="menuitem"
                        onClick={() => escolher(item)}
                        className={`w-full flex items-center gap-2 pl-10 pr-3.5 py-2.5 text-left text-[13px] transition ${
                          atual === item ? 'text-blue-300 font-semibold' : 'text-zinc-300 hover:bg-zinc-800/50'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${atual === item ? 'bg-blue-400' : 'bg-zinc-600'}`} />
                        <span className="truncate">{ROTULOS_DETALHAMENTO[item]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/**
 * Ordens do período escolhido no filtro. Com deslocamento = -1 devolve o período anterior equivalente
 * (ontem, mês anterior, ano anterior ou intervalo de mesmo tamanho imediatamente antes do personalizado).
 * Retorna null quando não existe período anterior para comparar ("Todo o histórico" ou intervalo incompleto).
 */
function filtrarOrdensPorPeriodo<T extends { data_abertura?: string }>(
  ordens: T[],
  filtro: FiltroPeriodo,
  inicioPersonalizado: string,
  fimPersonalizado: string,
  deslocamento: 0 | -1 = 0,
): T[] | null {
  if (filtro === 'TODOS') return deslocamento === 0 ? ordens : null;

  const hoje = new Date();
  // Mês/ano de referência (ATUAL = mês corrente; ANTERIOR = mês passado), já com o deslocamento aplicado
  const refMes = new Date(hoje.getFullYear(), hoje.getMonth() + (filtro === 'ANTERIOR' ? -1 : 0) + deslocamento, 1);
  const anoRef = hoje.getFullYear() + deslocamento;
  const diaRef = somarDias(chaveDia(hoje), deslocamento);

  let inicio = inicioPersonalizado;
  let fim = fimPersonalizado;
  if (filtro === 'PERSONALIZADO' && deslocamento === -1) {
    if (!inicio || !fim || fim < inicio) return null;
    const dias = Math.round((new Date(`${fim}T12:00:00`).getTime() - new Date(`${inicio}T12:00:00`).getTime()) / 86400000) + 1;
    fim = somarDias(inicio, -1);
    inicio = somarDias(fim, -(dias - 1));
  }

  return ordens.filter((os) => {
    if (!os.data_abertura) return false;
    const dataOs = new Date(os.data_abertura);
    // Data no horário local (OS registradas à noite não caem no dia seguinte)
    const dataOsStr = diaLocalDaData(os.data_abertura);

    switch (filtro) {
      case 'HOJE':
        return dataOsStr === diaRef;
      case 'ATUAL':
      case 'ANTERIOR':
        return dataOs.getMonth() === refMes.getMonth() && dataOs.getFullYear() === refMes.getFullYear();
      case 'ANO_ATUAL':
        return dataOs.getFullYear() === anoRef;
      case 'PERSONALIZADO':
        return (!inicio || dataOsStr >= inicio) && (!fim || dataOsStr <= fim);
    }
  });
}

const ROTULO_PERIODO_ANTERIOR: Record<FiltroPeriodo, string> = {
  HOJE: 'ontem',
  ATUAL: 'mês anterior',
  ANTERIOR: 'mês anterior',
  ANO_ATUAL: 'ano anterior',
  PERSONALIZADO: 'período anterior',
  TODOS: '',
};

/** Nome do período escolhido no cabeçalho, mostrado na janela da listagem. */
const ROTULO_PERIODO: Record<Exclude<FiltroPeriodo, 'PERSONALIZADO'>, string> = {
  HOJE: 'Hoje',
  ATUAL: 'Mês atual',
  ANTERIOR: 'Mês anterior',
  ANO_ATUAL: 'Este ano',
  TODOS: 'Todo o histórico',
};

/** Dica do campo de busca de cada listagem. */
const PLACEHOLDER_BUSCA: Record<Exclude<Detalhamento, 'NENHUM'>, string> = {
  ORDENS: 'Buscar OS, cliente, aparelho, serviço...',
  PAGAMENTO: 'Buscar forma de pagamento...',
  FLUXO: 'Buscar indicador...',
};

export const Relatorios: React.FC<{ onAbrirDespesas?: () => void }> = ({ onAbrirDespesas }) => {
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  // Despesas da loja (aluguel, salários...): o vencimento ao meio-dia local entra no mesmo filtro de período
  const [despesas, setDespesas] = useState<(Despesa & { data_abertura: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [metaFinanceira, setMetaFinanceira] = useState<number>(() => obterMetaFinanceiraConta());
  const [metaInput, setMetaInput] = useState<string>(() => formatarValor(obterMetaFinanceiraConta()));
  const [editandoMeta, setEditandoMeta] = useState(false);
  const [salvandoMeta, setSalvandoMeta] = useState(false);
  const [erroMeta, setErroMeta] = useState<string | null>(null);
  const [metaSalvaFeedback, setMetaSalvaFeedback] = useState(false);
  const [mesSelecionado, setMesSelecionado] = useState<FiltroPeriodo>('ATUAL');
  const [dataInicioPersonalizada, setDataInicioPersonalizada] = useState<string>(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [dataFimPersonalizada, setDataFimPersonalizada] = useState<string>(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  });

  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);

  const carregarRelatorios = async (forcar = false) => {
    setLoading(true);
    setErroCarregamento(null);
    try {
      const [data, listaDespesas] = await Promise.all([buscarOrdensServico(forcar), listarDespesasSeDisponivel()]);
      setOrdens(data);
      setDespesas(listaDespesas.map((d) => ({ ...d, data_abertura: `${d.data}T12:00:00` })));
    } catch (err: any) {
      console.error('Erro ao buscar relatórios:', err);
      setErroCarregamento(err?.message || 'Verifique a conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // Rascunhos e canceladas não são receita: ficam fora de todos os totais e da auditoria
  const ordensFaturaveis = useMemo(() => ordens.filter(contaNoFaturamento), [ordens]);
  const foraDoFaturamento = ordens.length - ordensFaturaveis.length;

  useEffect(() => {
    carregarRelatorios();
  }, []);

  // Mantém a meta sincronizada com a conta ativa (troca de conta ou alteração em outra tela)
  useEffect(() => {
    const atualizarMeta = () => setMetaFinanceira(obterMetaFinanceiraConta());
    window.addEventListener('storage_configs_updated', atualizarMeta);
    return () => window.removeEventListener('storage_configs_updated', atualizarMeta);
  }, []);

  // Meta mensal: considera apenas as OS abertas no mês atual (reinicia quando o mês vira)
  const resumoMeta = useMemo(
    () => calcularResumoMetaFinanceira(ordens, { metaOverride: metaFinanceira }),
    [ordens, metaFinanceira]
  );
  const valorAlcancadoMeta = resumoMeta.valorAlcancado;
  const percentualMetaReal = resumoMeta.percentualAtingido;
  const larguraBarraMeta = resumoMeta.percentualBarraVisual;
  const valorRestanteMeta = Math.max(0, metaFinanceira - valorAlcancadoMeta);

  const iniciarEdicaoMeta = () => {
    setMetaInput(formatarValor(metaFinanceira));
    setErroMeta(null);
    setEditandoMeta(true);
  };

  const handleSalvarMeta = async () => {
    // Rejeita vazio, negativo, zero ou formato inválido antes de gravar
    const validacao = parsearValorMonetarioBR(metaInput);
    if (!validacao.valido) {
      setErroMeta(validacao.erro || 'Valor de meta inválido.');
      return;
    }

    setSalvandoMeta(true);
    setErroMeta(null);
    try {
      const { valorSalvo } = await salvarMetaFinanceiraConta(validacao.valor);
      setMetaFinanceira(valorSalvo);
      setMetaInput(formatarValor(valorSalvo));
      setEditandoMeta(false);
      // Avisa o Dashboard para atualizar o card "Meta de faturamento"
      window.dispatchEvent(new Event('storage_configs_updated'));
      setMetaSalvaFeedback(true);
      setTimeout(() => setMetaSalvaFeedback(false), 3000);
    } catch (err: any) {
      console.error('Erro ao salvar meta financeira:', err);
      setErroMeta(err?.message || 'Não foi possível salvar a meta.');
    } finally {
      setSalvandoMeta(false);
    }
  };

  // Filtro de Ordens por Dia / Mês / Ano / Intervalo Personalizado
  const ordensFiltradas = useMemo(
    () => filtrarOrdensPorPeriodo(ordensFaturaveis, mesSelecionado, dataInicioPersonalizada, dataFimPersonalizada) ?? [],
    [ordensFaturaveis, mesSelecionado, dataInicioPersonalizada, dataFimPersonalizada]
  );

  // CÁLCULOS FINANCEIROS BLINDADOS
  // 1. Faturamento Bruto
  const faturamentoBruto = useMemo(
    () => ordensFiltradas.reduce((acc, os) => acc + valorBrutoOS(os), 0),
    [ordensFiltradas]
  );

  // Variação real do faturamento bruto em relação ao período anterior equivalente (nada inventado)
  const variacaoFaturamento = useMemo(() => {
    const ordensAnteriores = filtrarOrdensPorPeriodo(
      ordensFaturaveis,
      mesSelecionado,
      dataInicioPersonalizada,
      dataFimPersonalizada,
      -1
    );
    if (!ordensAnteriores) {
      return { texto: 'Todo o histórico', badge: '—', cor: 'neutra' as const };
    }
    const anterior = ordensAnteriores.reduce((acc, os) => acc + valorBrutoOS(os), 0);
    const rotulo = ROTULO_PERIODO_ANTERIOR[mesSelecionado];
    if (faturamentoBruto === 0 && anterior === 0) {
      return { texto: 'Sem movimentação no período', badge: '0,0%', cor: 'neutra' as const };
    }
    if (anterior === 0) {
      return { texto: `Sem faturamento no ${rotulo}`, badge: 'Novo', cor: 'neutra' as const };
    }
    const pct = ((faturamentoBruto - anterior) / anterior) * 100;
    const pctTexto = `${pct > 0 ? '+' : ''}${pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    const cor = pct > 0 ? ('alta' as const) : pct < 0 ? ('queda' as const) : ('neutra' as const);
    return { texto: `${pctTexto} vs. ${rotulo}`, badge: pctTexto, cor };
  }, [ordensFaturaveis, mesSelecionado, dataInicioPersonalizada, dataFimPersonalizada, faturamentoBruto]);

  // No mês corrente a comparação só aparece a partir do dia 16: antes disso o mês ainda está no começo
  // e a queda contra o mês anterior inteiro (ex.: -100%) não diz nada
  const exibirVariacao = mesSelecionado !== 'ATUAL' || new Date().getDate() >= 16;

  const corTextoVariacao = { alta: 'text-emerald-400', queda: 'text-rose-400', neutra: 'text-zinc-400' }[variacaoFaturamento.cor];
  const corBadgeVariacao = {
    alta: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    queda: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    neutra: 'text-zinc-400 bg-zinc-800/60 border-zinc-700/60',
  }[variacaoFaturamento.cor];

  // Faturamento Líquido (se houver desconto aplicado na OS)
  const faturamentoLiquido = useMemo(() => somar(ordensFiltradas, valorLiquidoOS), [ordensFiltradas]);

  // 2. Custos Operacionais detalhados
  const custoPecas = useMemo(() => somar(ordensFiltradas, custoPecaOS), [ordensFiltradas]);
  const custoFretes = useMemo(() => somar(ordensFiltradas, custoFreteOS), [ordensFiltradas]);
  const custoGarantias = useMemo(() => somar(ordensFiltradas, custoGarantiaOS), [ordensFiltradas]);
  const totalTaxas = useMemo(() => somar(ordensFiltradas, valorTaxasOS), [ordensFiltradas]);

  // Bruto, taxas e líquido por forma de pagamento, das que mais faturaram para as que menos
  const porModalidade = useMemo(() => {
    const grupos = new Map<string, { quantidade: number; bruto: number; taxas: number; liquido: number }>();
    ordensFiltradas.forEach((os) => {
      const chave = rotuloFormaOS(os);
      const g = grupos.get(chave) || { quantidade: 0, bruto: 0, taxas: 0, liquido: 0 };
      g.quantidade += 1;
      g.bruto += valorBrutoOS(os);
      g.taxas += valorTaxasOS(os);
      g.liquido += valorLiquidoOS(os);
      grupos.set(chave, g);
    });
    return [...grupos.entries()].sort((a, b) => b[1].bruto - a[1].bruto);
  }, [ordensFiltradas]);

  // Auditoria: ordens que compõem os totais do período, da mais recente para a mais antiga
  const [detalhamento, setDetalhamento] = useState<Detalhamento>('NENHUM');
  const [buscaListagem, setBuscaListagem] = useState('');
  const [linhasVisiveis, setLinhasVisiveis] = useState(LINHAS_POR_PAGINA);
  const ordensAuditoria = useMemo(() => {
    const termo = buscaListagem.trim().toLowerCase();
    return [...ordensFiltradas]
      .filter(
        (os) =>
          !termo ||
          [os.numero_os, os.cliente?.nome, os.aparelho?.modelo, os.servicoRealizado, os.defeitoRelatado, rotuloFormaOS(os)]
            .some((campo) => String(campo || '').toLowerCase().includes(termo))
      )
      .sort(
        (a, b) =>
          (b.data_abertura ? new Date(b.data_abertura).getTime() : 0) -
          (a.data_abertura ? new Date(a.data_abertura).getTime() : 0)
      );
  }, [ordensFiltradas, buscaListagem]);

  useEffect(() => {
    setLinhasVisiveis(LINHAS_POR_PAGINA);
  }, [buscaListagem]);

  /** Fecha a janela da listagem e limpa a busca. */
  const fecharListagem = () => {
    setDetalhamento('NENHUM');
    setBuscaListagem('');
  };

  // Esc fecha a janela da listagem
  useEffect(() => {
    if (detalhamento === 'NENHUM') return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fecharListagem();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [detalhamento]);

  // Formas de pagamento que batem com a busca da listagem
  const modalidadesVisiveis = useMemo(() => {
    const termo = buscaListagem.trim().toLowerCase();
    return termo ? porModalidade.filter(([modalidade]) => modalidade.toLowerCase().includes(termo)) : porModalidade;
  }, [porModalidade, buscaListagem]);

  const rotuloPeriodo =
    mesSelecionado === 'PERSONALIZADO'
      ? `De ${dataInicioPersonalizada ? new Date(`${dataInicioPersonalizada}T12:00:00`).toLocaleDateString('pt-BR') : '…'} até ${
          dataFimPersonalizada ? new Date(`${dataFimPersonalizada}T12:00:00`).toLocaleDateString('pt-BR') : '…'
        }`
      : ROTULO_PERIODO[mesSelecionado];

  const custosTotais = custoPecas + custoFretes + custoGarantias;

  // 3. Lucro Líquido Real e Margem
  const lucroLiquido = faturamentoLiquido - custosTotais;
  const margemLucro = faturamentoLiquido > 0 ? ((lucroLiquido / faturamentoLiquido) * 100).toFixed(1) : '0.0';

  // Despesas da loja no período e o resultado da loja (lucro das OS − despesas)
  const despesasPeriodo = useMemo(
    () => filtrarOrdensPorPeriodo(despesas, mesSelecionado, dataInicioPersonalizada, dataFimPersonalizada) ?? [],
    [despesas, mesSelecionado, dataInicioPersonalizada, dataFimPersonalizada]
  );
  const totalDespesas = somarDespesas(despesasPeriodo);
  const despesasAPagar = somarDespesas(despesasPeriodo.filter((d) => !d.pago));
  const resultadoLoja = lucroLiquido - totalDespesas;

  // 4. Ticket Médio e Quantidade de Atendimentos
  const totalAtendimentos = ordensFiltradas.length;
  const ticketMedio = totalAtendimentos > 0 ? faturamentoLiquido / totalAtendimentos : 0;

  // Percentuais de Composição dos Custos
  const percentPecas = custosTotais > 0 ? Math.round((custoPecas / custosTotais) * 100) : 0;
  const percentFretes = custosTotais > 0 ? Math.round((custoFretes / custosTotais) * 100) : 0;
  const percentGarantias = custosTotais > 0 ? Math.round((custoGarantias / custosTotais) * 100) : 0;

  // CÁLCULO DE RECEITA POR SEMANA (Dividido em 5 semanas do mês)
  const dadosSemanas = useMemo(() => {
    const semanas = [0, 0, 0, 0, 0];
    ordensFiltradas.forEach((os) => {
      if (!os.data_abertura) return;
      const dia = Number(diaLocalDaData(os.data_abertura).slice(8, 10));
      if (!dia) return;
      const valor = valorBrutoOS(os);

      if (dia <= 7) semanas[0] += valor;
      else if (dia <= 14) semanas[1] += valor;
      else if (dia <= 21) semanas[2] += valor;
      else if (dia <= 28) semanas[3] += valor;
      else semanas[4] += valor;
    });
    return semanas;
  }, [ordensFiltradas]);

  const maxSemana = Math.max(...dadosSemanas);

  // Rótulos do eixo X: com um único mês no filtro mostra o mês real; nos demais, as faixas de dias
  const mesDoGrafico =
    mesSelecionado === 'ATUAL' || mesSelecionado === 'HOJE'
      ? new Date()
      : mesSelecionado === 'ANTERIOR'
      ? new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
      : null;
  const abreviacaoMes = mesDoGrafico
    ? mesDoGrafico.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
    : '';
  const rotulosSemanas = mesDoGrafico
    ? ['01', '08', '15', '22', '29'].map((dia) => `${dia} ${abreviacaoMes}`)
    : ['Dias 1-7', '8-14', '15-21', '22-28', '29-31'];
  const subtituloGrafico = mesDoGrafico
    ? `Faturamento bruto em ${mesDoGrafico.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`
    : 'Faturamento bruto do período, agrupado pelo dia do mês';

  // Exportar dados para CSV
  const exportarRelatorioCSV = () => {
    if (ordensFiltradas.length === 0) {
      alert('Não há ordens para exportar no período selecionado.');
      return;
    }

    // Mesmas funções dos cards: o CSV soma exatamente os totais da tela
    baixarCsv(
      `relatorio_financeiro_${diaLocalDaData(new Date().toISOString())}.csv`,
      ['Numero OS', 'Cliente', 'Aparelho', 'Servico', 'Data Abertura', 'Status', 'Forma Pagamento', 'Valor Bruto',
        'Taxas Maquininha', 'Valor Liquido', 'Custo Peca', 'Frete', 'Garantia', 'Lucro Liquido'],
      ordensFiltradas.map((os) => [
        String(os.numero_os || ''),
        os.cliente?.nome,
        os.aparelho?.modelo,
        os.servicoRealizado || os.defeitoRelatado,
        formatarDataOS(os.data_abertura),
        os.status_os || '',
        rotuloFormaOS(os),
        valorBrutoOS(os),
        valorTaxasOS(os),
        valorLiquidoOS(os),
        custoPecaOS(os),
        custoFreteOS(os),
        custoGarantiaOS(os),
        valorLiquidoOS(os) - custosOS(os),
      ]),
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-24 space-y-4">
        <div className="w-9 h-9 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-xs text-zinc-400 font-semibold tracking-wider uppercase">
          Carregando inteligência financeira...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-8 max-w-[1600px] mx-auto font-sans pb-10 w-full min-w-0">
      {/* ================= CABEÇALHO DA PÁGINA (FIGMA) ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <span className="text-[10px] sm:text-[11px] font-bold tracking-widest text-blue-400 uppercase">
            INTELIGÊNCIA FINANCEIRA
          </span>
          <h2 className="text-xl sm:text-3xl font-extrabold text-white mt-0.5 tracking-tight truncate">
            Análises e relatórios
          </h2>
          <p className="text-[11px] sm:text-xs text-zinc-400 mt-0.5 truncate">
            Resultados calculados a partir das ordens concluídas
          </p>
        </div>

        {/* Controles: Listagens, Meta Financeira, Seletor de Período, Intervalo Personalizado e Botão de Exportação */}
        <div className="relative flex flex-wrap items-center gap-2 shrink-0">
          <MenuListagens
            atual={detalhamento}
            onEscolher={(d) => {
              setBuscaListagem('');
              setDetalhamento(d);
            }}
          />
          <PopoverMeta>
            <h3 className="text-sm font-bold text-white">Meta Financeira — {resumoMeta.rotuloCompetencia}</h3>
            <p className="text-[11px] text-zinc-400 mt-0.5">Meta mensal exibida no Painel. O progresso reinicia a cada novo mês.</p>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="p-3 bg-[#080c14] border border-zinc-800/80 rounded-xl min-w-0">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Meta definida</span>
                <p className="text-sm font-extrabold text-white mt-1 truncate">R$ {formatarValor(metaFinanceira)}</p>
              </div>
              <div className="p-3 bg-[#080c14] border border-zinc-800/80 rounded-xl min-w-0">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Valor alcançado</span>
                <p className="text-sm font-extrabold text-emerald-400 mt-1 truncate">R$ {formatarValor(valorAlcancadoMeta)}</p>
              </div>
              <div className="p-3 bg-[#080c14] border border-zinc-800/80 rounded-xl min-w-0">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Progresso</span>
                <p className="text-sm font-extrabold text-blue-400 mt-1 truncate">
                  {percentualMetaReal.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%
                </p>
              </div>
              <div className="p-3 bg-[#080c14] border border-zinc-800/80 rounded-xl min-w-0">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Valor restante</span>
                <p className="text-sm font-extrabold text-blue-400 mt-1 truncate">R$ {formatarValor(valorRestanteMeta)}</p>
              </div>
            </div>

            <div className="w-full bg-zinc-800/80 rounded-full h-2 mt-4 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${percentualMetaReal >= 100 ? 'bg-emerald-600' : 'bg-blue-600'}`}
                style={{ width: `${larguraBarraMeta}%` }}
              />
            </div>

            {erroMeta && <p className="text-xs font-bold text-red-400 mt-3">{erroMeta}</p>}
            {metaSalvaFeedback && <p className="text-xs font-bold text-emerald-400 mt-3">✓ Meta salva e aplicada no Painel!</p>}

            {editandoMeta ? (
              <div className="flex items-center gap-2 mt-4">
                <div className="flex-1 min-w-0 flex items-center bg-[#080c14] border border-zinc-800 rounded-xl px-3 py-2 focus-within:border-blue-500">
                  <span className="text-xs font-bold text-zinc-400 mr-1.5">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={metaInput}
                    onChange={(e) => {
                      setMetaInput(e.target.value);
                      setErroMeta(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault(); // salva a meta em vez de pular para o próximo campo
                        handleSalvarMeta();
                      }
                      if (e.key === 'Escape') setEditandoMeta(false);
                    }}
                    placeholder="8.000,00"
                    autoFocus
                    className="w-full min-w-0 bg-transparent text-xs text-white font-bold outline-none"
                  />
                </div>
                <button
                  onClick={handleSalvarMeta}
                  disabled={salvandoMeta}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold rounded-xl text-xs transition shadow-md shadow-blue-600/20 shrink-0"
                >
                  {salvandoMeta ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  onClick={() => {
                    setEditandoMeta(false);
                    setErroMeta(null);
                  }}
                  className="px-2 py-2 text-xs font-semibold text-zinc-400 hover:text-white transition shrink-0"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={iniciarEdicaoMeta}
                className="w-full mt-4 px-4 py-2 bg-[#080c14] hover:bg-zinc-800 border border-zinc-700/80 text-white rounded-xl text-xs font-semibold transition shadow-sm"
              >
                Editar meta
              </button>
            )}
          </PopoverMeta>
          <select
            value={mesSelecionado}
            onChange={(e) => setMesSelecionado(e.target.value as FiltroPeriodo)}
            className="bg-[#0c101a] border border-zinc-800 text-white rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 text-xs font-semibold outline-none cursor-pointer focus:border-blue-500 transition shadow-sm"
          >
            <option value="HOJE">Hoje (Do dia)</option>
            <option value="ATUAL">Mês atual</option>
            <option value="ANTERIOR">Mês anterior</option>
            <option value="ANO_ATUAL">Este ano (Do ano)</option>
            <option value="TODOS">Todo o histórico</option>
            <option value="PERSONALIZADO">Personalizado (Calendário)</option>
          </select>

          {mesSelecionado === 'PERSONALIZADO' && (
            <div className="flex flex-wrap items-center gap-2 bg-[#0c101a] border border-zinc-800 rounded-xl px-3 py-1.5 shadow-sm">
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] font-bold text-zinc-400 uppercase">De:</span>
                <input
                  type="date"
                  value={dataInicioPersonalizada}
                  onChange={(e) => setDataInicioPersonalizada(e.target.value)}
                  className="bg-[#080c14] border border-zinc-800 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-blue-500 cursor-pointer [color-scheme:dark]"
                />
              </div>
              <div className="flex items-center space-x-1.5">
                <span className="text-[10px] font-bold text-zinc-400 uppercase">Até:</span>
                <input
                  type="date"
                  value={dataFimPersonalizada}
                  onChange={(e) => setDataFimPersonalizada(e.target.value)}
                  className="bg-[#080c14] border border-zinc-800 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-blue-500 cursor-pointer [color-scheme:dark]"
                />
              </div>
            </div>
          )}

          <button
            onClick={exportarRelatorioCSV}
            title="Exportar relatório CSV"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#0c101a] border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white flex items-center justify-center transition shadow-sm shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>
        </div>
      </div>

      {erroCarregamento && (
        <AvisoErroCarregamento mensagem={erroCarregamento} onTentarNovamente={() => carregarRelatorios(true)} />
      )}

      {/* ================= 4 CARDS FINANCEIROS: 2x2 NO MOBILE, 4 COLUNAS NO DESKTOP ================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Card 1: Faturamento Bruto */}
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-xl sm:rounded-2xl p-3 sm:p-5 relative overflow-hidden shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-zinc-400 uppercase tracking-wider truncate">
              FATURAMENTO
            </span>
            <div className="p-1 sm:p-2 rounded-md sm:rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          </div>
          <h3 className="text-base sm:text-2xl lg:text-3xl font-extrabold text-white mt-1 sm:mt-3 tracking-tight truncate">
            R$ {formatarValor(faturamentoBruto)}
          </h3>
          {exibirVariacao && (
          <p className={`text-[10px] sm:text-[11px] mt-1 sm:mt-2 font-semibold flex items-center truncate ${corTextoVariacao}`}>
            <span className="truncate" title={variacaoFaturamento.texto}>{variacaoFaturamento.texto}</span>
          </p>
          )}
        </div>

        {/* Card 2: Custos Operacionais */}
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-xl sm:rounded-2xl p-3 sm:p-5 relative overflow-hidden shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-zinc-400 uppercase tracking-wider truncate">
              CUSTOS
            </span>
            <div className="p-1 sm:p-2 rounded-md sm:rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </div>
          </div>
          <h3 className="text-base sm:text-2xl lg:text-3xl font-extrabold text-white mt-1 sm:mt-3 tracking-tight truncate">
            R$ {formatarValor(custosTotais)}
          </h3>
          <p className="text-[10px] sm:text-[11px] text-zinc-400 mt-1 sm:mt-2 font-medium truncate">
            Peças, fretes e garantias
          </p>
        </div>

        {/* Card 3: Lucro Líquido */}
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-xl sm:rounded-2xl p-3 sm:p-5 relative overflow-hidden shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-zinc-400 uppercase tracking-wider truncate">
              LUCRO LÍQUIDO
            </span>
            <div className="p-1 sm:p-2 rounded-md sm:rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <h3 className="text-base sm:text-2xl lg:text-3xl font-extrabold text-white mt-1 sm:mt-3 tracking-tight truncate">
            R$ {formatarValor(lucroLiquido)}
          </h3>
          <p className="text-[10px] sm:text-[11px] text-zinc-400 mt-1 sm:mt-2 font-medium truncate">
            {margemLucro}% de margem
          </p>
        </div>

        {/* Card 4: Ticket Médio */}
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-xl sm:rounded-2xl p-3 sm:p-5 relative overflow-hidden shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-bold text-zinc-400 uppercase tracking-wider truncate">
              TICKET MÉDIO
            </span>
            <div className="p-1 sm:p-2 rounded-md sm:rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <h3 className="text-base sm:text-2xl lg:text-3xl font-extrabold text-white mt-1 sm:mt-3 tracking-tight truncate">
            R$ {formatarValor(ticketMedio)}
          </h3>
          <p className="text-[10px] sm:text-[11px] text-zinc-400 mt-1 sm:mt-2 font-medium truncate">
            {totalAtendimentos} {totalAtendimentos === 1 ? 'atendimento' : 'atendimentos'}
          </p>
        </div>
      </div>

      {/* ================= RESULTADO DA LOJA: LUCRO DAS OS − DESPESAS ================= */}
      <div className="bg-[#0c101a] border border-zinc-800/80 rounded-xl sm:rounded-2xl p-3 sm:p-5 shadow-sm flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6 min-w-0">
        <div className="grid grid-cols-3 gap-2 sm:gap-4 flex-1 min-w-0">
          {[
            { rotulo: 'Lucro das OS', valor: lucroLiquido, cor: 'text-white', sinal: '' },
            { rotulo: 'Despesas da loja', valor: totalDespesas, cor: 'text-rose-400', sinal: '−' },
            { rotulo: 'Resultado da loja', valor: resultadoLoja, cor: resultadoLoja >= 0 ? 'text-emerald-400' : 'text-rose-400', sinal: '=' },
          ].map((c) => (
            <div key={c.rotulo} className="min-w-0">
              <span className="block text-[10px] sm:text-[11px] font-bold text-zinc-400 uppercase tracking-wider truncate">
                {c.sinal && <span className="text-zinc-500 mr-1">{c.sinal}</span>}
                {c.rotulo}
              </span>
              <p className={`text-sm sm:text-xl font-extrabold mt-1 tabular-nums truncate ${c.cor}`}>R$ {formatarValor(c.valor)}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0">
          <p className="text-[10px] sm:text-[11px] text-zinc-500">
            {despesasPeriodo.length === 0
              ? 'Nenhuma despesa lançada no período'
              : despesasAPagar > 0
              ? `R$ ${formatarValor(despesasAPagar)} ainda a pagar`
              : 'Todas as despesas pagas'}
          </p>
          {onAbrirDespesas && (
            <button
              type="button"
              onClick={onAbrirDespesas}
              className="px-3 py-1.5 rounded-xl bg-[#080c14] hover:bg-zinc-800/80 border border-zinc-800 text-xs font-semibold text-blue-400 hover:text-blue-300 transition shrink-0"
            >
              {despesasPeriodo.length === 0 ? 'Lançar despesas' : 'Ver despesas'} &rsaquo;
            </button>
          )}
        </div>
      </div>

      {/* ================= LISTAGEM EM JANELA (MODAL) ================= */}
      {/* Aberta pelo botão "Listagens" do cabeçalho; vai para o <body> para cobrir a tela toda */}
      {detalhamento !== 'NENHUM' &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) fecharListagem(); // clique fora da janela
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={ROTULOS_DETALHAMENTO[detalhamento]}
              className="w-full max-w-6xl max-h-[90vh] flex flex-col bg-[#0c101a] border border-zinc-700/80 rounded-2xl shadow-2xl shadow-black/60 min-w-0"
            >
              {/* Cabeçalho fixo: título, busca e fechar */}
              <div className="shrink-0 flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-5 py-4 border-b border-zinc-800/80">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm sm:text-base font-bold text-white truncate">{ROTULOS_DETALHAMENTO[detalhamento]}</h3>
                  <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                    {rotuloPeriodo}
                    {foraDoFaturamento > 0 && ' · Rascunhos e ordens canceladas não entram nos totais.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="search"
                    value={buscaListagem}
                    onChange={(e) => setBuscaListagem(e.target.value)}
                    placeholder={PLACEHOLDER_BUSCA[detalhamento]}
                    autoFocus
                    className="w-full sm:w-72 px-3.5 py-2 rounded-xl bg-[#080c14] border border-zinc-800 text-xs text-white placeholder-zinc-500 outline-none focus:border-blue-500/60"
                  />
                  <button
                    type="button"
                    onClick={fecharListagem}
                    aria-label="Fechar listagem (Esc)"
                    title="Fechar (Esc)"
                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Conteúdo com rolagem própria: o painel ao fundo não se move */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">

            {/* ---------- Por forma de pagamento ---------- */}
            {detalhamento === 'PAGAMENTO' &&
              (modalidadesVisiveis.length === 0 ? (
                <p className="p-8 text-center text-xs text-zinc-500">
                  {buscaListagem.trim() ? 'Nenhuma forma de pagamento corresponde à busca.' : 'Nenhuma ordem no período selecionado.'}
                </p>
              ) : (
                <div className="overflow-x-auto p-4 sm:px-5 pt-3">
                  <table className="w-full text-left text-xs min-w-[560px]">
                    <thead className="text-[10px] text-zinc-500 uppercase tracking-wider border-b border-zinc-800/80">
                      <tr>
                        <th className="py-2 px-3 font-semibold">Forma de pagamento</th>
                        <th className="py-2 px-3 font-semibold text-right">Ordens</th>
                        <th className="py-2 px-3 font-semibold text-right">Bruto</th>
                        <th className="py-2 px-3 font-semibold text-right">Taxas</th>
                        <th className="py-2 px-3 font-semibold text-right">Taxa média</th>
                        <th className="py-2 px-3 font-semibold text-right">Líquido</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40">
                      {modalidadesVisiveis.map(([modalidade, g]) => (
                        <tr key={modalidade}>
                          <td className="py-2 px-3 text-zinc-200 font-medium">{modalidade}</td>
                          <td className="py-2 px-3 text-right text-zinc-400">{g.quantidade}</td>
                          <td className="py-2 px-3 text-right text-white font-semibold">R$ {formatarValor(g.bruto)}</td>
                          <td className="py-2 px-3 text-right text-rose-400">{g.taxas > 0 ? `− R$ ${formatarValor(g.taxas)}` : '—'}</td>
                          <td className="py-2 px-3 text-right text-zinc-400">
                            {g.bruto > 0 ? `${((g.taxas / g.bruto) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : '—'}
                          </td>
                          <td className="py-2 px-3 text-right text-blue-400 font-semibold">R$ {formatarValor(g.liquido)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

            {/* ---------- Ordens do período ---------- */}
            {detalhamento === 'ORDENS' && (
              <>
                {ordensAuditoria.length === 0 ? (
                  <p className="p-8 text-center text-xs text-zinc-500">
                    {buscaListagem.trim() ? 'Nenhuma ordem corresponde à busca.' : 'Nenhuma ordem no período selecionado.'}
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto mt-3">
                      <table className="w-full text-left text-xs min-w-[960px]">
                        <thead className="text-[10px] text-zinc-500 uppercase tracking-wider border-y border-zinc-800/80">
                          <tr>
                            <th className="py-2.5 px-4 font-semibold">Ordem</th>
                            <th className="py-2.5 px-4 font-semibold">Cliente</th>
                            <th className="py-2.5 px-4 font-semibold">Aparelho / serviço</th>
                            <th className="py-2.5 px-4 font-semibold">Pagamento</th>
                            <th className="py-2.5 px-4 font-semibold text-right">Bruto</th>
                            <th className="py-2.5 px-4 font-semibold text-right">Taxas</th>
                            <th className="py-2.5 px-4 font-semibold text-right">Custos</th>
                            <th className="py-2.5 px-4 font-semibold text-right">Lucro</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/40">
                          {ordensAuditoria.slice(0, linhasVisiveis).map((os) => {
                            const lucroOS = valorLiquidoOS(os) - custosOS(os);
                            return (
                              <tr key={os.id_os} className="hover:bg-zinc-800/20">
                                <td className="py-2.5 px-4">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-blue-400 whitespace-nowrap">{os.numero_os}</span>
                                    {/* Status ajuda a auditar: rascunhos e canceladas também entram no período */}
                                    {(os.status_os === 'RASCUNHO' || os.status_os === 'CANCELADO') && <StatusBadge status={os.status_os} />}
                                  </div>
                                  <p className="text-[11px] text-zinc-500 mt-0.5">
                                    {formatarDataOS(os.data_abertura) || '—'}
                                  </p>
                                </td>
                                <td className="py-2.5 px-4 text-zinc-200 font-medium truncate max-w-[180px]">{os.cliente?.nome || 'Cliente balcão'}</td>
                                <td className="py-2.5 px-4 max-w-[220px]">
                                  <p className="text-zinc-200 truncate">{os.aparelho?.modelo || '—'}</p>
                                  <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{os.servicoRealizado || os.defeitoRelatado || '—'}</p>
                                </td>
                                <td className="py-2.5 px-4 text-zinc-400 whitespace-nowrap">{rotuloFormaOS(os)}</td>
                                <td className="py-2.5 px-4 text-right text-white font-semibold">R$ {formatarValor(valorBrutoOS(os))}</td>
                                <td className="py-2.5 px-4 text-right text-rose-400/90">
                                  {valorTaxasOS(os) > 0 ? `- R$ ${formatarValor(valorTaxasOS(os))}` : '—'}
                                </td>
                                <td className="py-2.5 px-4 text-right text-zinc-200">
                                  {custosOS(os) > 0 ? `- R$ ${formatarValor(custosOS(os))}` : '—'}
                                </td>
                                <td className={`py-2.5 px-4 text-right font-semibold ${lucroOS >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  R$ {formatarValor(lucroOS)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="border-t border-zinc-700/80 bg-[#090d15] font-bold">
                          {(() => {
                            // Com busca, soma só as ordens encontradas; sem busca, são os mesmos totais dos cards
                            const filtrando = buscaListagem.trim() !== '';
                            const bruto = filtrando ? somar(ordensAuditoria, valorBrutoOS) : faturamentoBruto;
                            const taxas = filtrando ? somar(ordensAuditoria, valorTaxasOS) : totalTaxas;
                            const custos = filtrando ? somar(ordensAuditoria, custosOS) : custosTotais;
                            const lucro = filtrando ? somar(ordensAuditoria, valorLiquidoOS) - custos : lucroLiquido;
                            return (
                              <tr>
                                <td className="py-3 px-4 text-zinc-300" colSpan={4}>
                                  {filtrando ? 'Total da busca' : 'Total do período'} ({ordensAuditoria.length}{' '}
                                  {ordensAuditoria.length === 1 ? 'ordem' : 'ordens'})
                                </td>
                                <td className="py-3 px-4 text-right text-white">R$ {formatarValor(bruto)}</td>
                                <td className="py-3 px-4 text-right text-rose-400">- R$ {formatarValor(taxas)}</td>
                                <td className="py-3 px-4 text-right text-zinc-200">- R$ {formatarValor(custos)}</td>
                                <td className={`py-3 px-4 text-right ${lucro >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  R$ {formatarValor(lucro)}
                                </td>
                              </tr>
                            );
                          })()}
                        </tfoot>
                      </table>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-zinc-800/60 text-[11px] text-zinc-500">
                      <span>Bruto = cobrado do cliente · Taxas = retido pela maquininha · Lucro = bruto − taxas − custos (peças, fretes e garantias).</span>
                      {linhasVisiveis < ordensAuditoria.length && (
                        <button
                          type="button"
                          onClick={() => setLinhasVisiveis((n) => n + LINHAS_POR_PAGINA)}
                          className="font-semibold text-blue-400 hover:text-blue-300"
                        >
                          Mostrar mais ({ordensAuditoria.length - linhasVisiveis} restantes)
                        </button>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            {/* ---------- Taxas e descontos (fluxo de caixa) ---------- */}
            {detalhamento === 'FLUXO' && (
              <div className="p-4 sm:px-5 pt-3 space-y-3">
                <p className="text-xs text-zinc-400">
                  O que o cliente pagou, quanto a maquininha reteve, o que entrou na conta, o que sobrou depois dos custos das OS e,
                  descontadas as despesas da loja, o resultado do período.
                </p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                  {[
                    { rotulo: 'Faturamento bruto', valor: faturamentoBruto, sinal: '', cor: 'text-white', dica: 'Cobrado dos clientes' },
                    { rotulo: 'Taxas de maquininha', valor: totalTaxas, sinal: '−', cor: 'text-rose-400', dica: 'Retido pelas operadoras' },
                    { rotulo: 'Líquido recebido', valor: faturamentoLiquido, sinal: '=', cor: 'text-blue-400', dica: 'O que entrou na conta' },
                    { rotulo: 'Custos', valor: custosTotais, sinal: '−', cor: 'text-zinc-200', dica: 'Peças, fretes e garantias' },
                    { rotulo: 'Lucro das OS', valor: lucroLiquido, sinal: '=', cor: lucroLiquido >= 0 ? 'text-emerald-400' : 'text-rose-400', dica: 'O que sobrou das ordens' },
                    { rotulo: 'Despesas da loja', valor: totalDespesas, sinal: '−', cor: 'text-rose-400', dica: 'Aluguel, salários, contas...' },
                    { rotulo: 'Resultado da loja', valor: resultadoLoja, sinal: '=', cor: resultadoLoja >= 0 ? 'text-emerald-400' : 'text-rose-400', dica: 'O que sobrou no período' },
                  ]
                    .filter((etapa) => etapa.rotulo.toLowerCase().includes(buscaListagem.trim().toLowerCase()))
                    .map((etapa) => (
                    <div key={etapa.rotulo} className="p-3 sm:p-4 bg-[#080c14] border border-zinc-800/80 rounded-xl min-w-0">
                      <span className="text-[10px] sm:text-[11px] font-bold text-zinc-400 uppercase tracking-wider block truncate">
                        {etapa.sinal && <span className="text-zinc-500 mr-1">{etapa.sinal}</span>}
                        {etapa.rotulo}
                      </span>
                      <p className={`text-sm sm:text-lg font-extrabold mt-1 truncate ${etapa.cor}`}>R$ {formatarValor(etapa.valor)}</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{etapa.dica}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ================= BLOCO DE GRÁFICOS E COMPOSIÇÃO ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-stretch min-w-0 w-full">
        {/* Card Esquerdo: Receita por Semana com Gráfico de Curva e Barras */}
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-4 sm:p-6 flex flex-col justify-between shadow-sm min-w-0">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Receita por semana</h3>
                <p className="text-xs text-zinc-400 mt-0.5">{subtituloGrafico}</p>
              </div>
              {exibirVariacao && (
              <span
                title={variacaoFaturamento.texto}
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border shrink-0 ${corBadgeVariacao}`}
              >
                {variacaoFaturamento.badge}
              </span>
              )}
            </div>

            {/* Visualizador de Barras e Curva com Linha Suave */}
            <div className="mt-8 pt-4">
              <div className="h-44 flex items-end justify-between gap-3 px-2">
                {dadosSemanas.map((valor, idx) => {
                  // Semana sem faturamento = barra zerada (sem altura artificial)
                  const alturaPercent = valor > 0 && maxSemana > 0 ? Math.max(8, Math.round((valor / maxSemana) * 100)) : 0;
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group">
                      {/* Tooltip com valor real */}
                      <span className="text-[10px] text-zinc-400 font-semibold mb-1 opacity-0 group-hover:opacity-100 transition">
                        R$ {valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                      </span>
                      {/* Barra Gradiente Azul */}
                      <div className="w-full bg-zinc-800/40 rounded-xl overflow-hidden h-full flex items-end">
                        <div
                          className="w-full bg-gradient-to-t from-blue-700 to-blue-500 rounded-xl transition-all duration-700 group-hover:brightness-125"
                          style={{ height: `${alturaPercent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Rótulos do eixo X: início de cada faixa de 7 dias */}
              <div className="flex justify-between gap-3 text-[11px] text-zinc-400 mt-4 px-2 font-medium">
                {rotulosSemanas.map((rotulo) => (
                  <span key={rotulo} className="flex-1 text-center">
                    {rotulo}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Card Direito: Composição dos Custos */}
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-4 sm:p-6 flex flex-col justify-between shadow-sm min-w-0">
          <div>
            <div className="pb-5 border-b border-zinc-800/60 mb-6">
              <h3 className="text-sm font-bold text-white">Composição dos custos</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Total de R$ {formatarValor(custosTotais)} no período
              </p>
            </div>

            <div className="space-y-6">
              {/* Item 1: Peças e Componentes (Azul) */}
              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-medium text-zinc-300">Peças e componentes</span>
                  <div className="space-x-2">
                    <span className="font-bold text-white">
                      R$ {formatarValor(custoPecas)}
                    </span>
                    <span className="text-zinc-400 font-semibold">{percentPecas}%</span>
                  </div>
                </div>
                <div className="w-full bg-zinc-800/80 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${percentPecas}%` }}
                  />
                </div>
              </div>

              {/* Item 2: Fretes (Azul claro) */}
              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-medium text-zinc-300">Fretes</span>
                  <div className="space-x-2">
                    <span className="font-bold text-white">
                      R$ {formatarValor(custoFretes)}
                    </span>
                    <span className="text-zinc-400 font-semibold">{percentFretes}%</span>
                  </div>
                </div>
                <div className="w-full bg-zinc-800/80 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-blue-400 h-full rounded-full transition-all duration-500"
                    style={{ width: `${percentFretes}%` }}
                  />
                </div>
              </div>

              {/* Item 3: Garantias e Retornos (Branco) */}
              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-medium text-zinc-300">Garantias e retornos</span>
                  <div className="space-x-2">
                    <span className="font-bold text-white">
                      R$ {formatarValor(custoGarantias)}
                    </span>
                    <span className="text-zinc-400 font-semibold">{percentGarantias}%</span>
                  </div>
                </div>
                <div className="w-full bg-zinc-800/80 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-zinc-300 h-full rounded-full transition-all duration-500"
                    style={{ width: `${percentGarantias}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};