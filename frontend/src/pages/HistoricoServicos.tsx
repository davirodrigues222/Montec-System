import React, { useState, useEffect, useMemo } from "react";
import {
  buscarOrdensServico,
  excluirOrdemServico,
  editarOrdemServico,
  buscarFornecedores,
  obterConfiguracoesLojaSincrono,
} from "../services/api";
import { MODELOS_WHATSAPP, enviarMensagemWhatsapp, podeEnviarMensagem } from "../utils/whatsapp";
import { StatusBadge } from "../components/StatusBadge";
import { AutorizacaoAdministrativa } from "../components/AutorizacaoAdministrativa";
import {
  CabecalhoLojaImpressao,
  DocumentoParaImpressao,
  RodapeLojaImpressao,
  TermosImpressos,
  ViasImpressao,
  classeFormato,
} from "../components/impressao";
import { useOperador } from "../contexts/OperadorContext";
import type { OrdemServico, StatusOS } from "../types";
import { ITENS_CHECKLIST, OPCOES_CHECKLIST, itensVisiveisChecklist, rotuloItemChecklist } from "../utils/checklist";
import { formatarValor } from "../utils/formatadores";

// ================= FILTROS DA LISTAGEM =================
type FiltroData = "TODAS" | "DIA" | "MES" | "ANO";
type Ordenacao = "RECENTES" | "ANTIGAS";

const OPCOES_STATUS: { valor: StatusOS | "TODOS"; rotulo: string }[] = [
  { valor: "TODOS", rotulo: "Todos os status" },
  { valor: "RASCUNHO", rotulo: "Rascunho" },
  { valor: "AGUARDANDO_AVALIACAO", rotulo: "Aguardando avaliação" },
  { valor: "EM_ANALISE", rotulo: "Em análise" },
  { valor: "AGUARDANDO_PECA", rotulo: "Aguardando peça" },
  { valor: "EM_MANUTENCAO", rotulo: "Em manutenção" },
  { valor: "PRONTO", rotulo: "Pronto para retirada" },
  { valor: "ENTREGUE", rotulo: "Entregue / concluído" },
  { valor: "CANCELADO", rotulo: "Cancelado" },
];

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Data de abertura da OS como AAAA-MM-DD (mesma regra de Relatórios). */
const diaDaOS = (os: OrdemServico): string => {
  if (!os.data_abertura) return "";
  const iso = String(os.data_abertura).match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(os.data_abertura);
  return isNaN(d.getTime())
    ? ""
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const dataCurta = (os: OrdemServico) => {
  const dia = diaDaOS(os);
  return dia ? new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR") : "—";
};

const campoFiltroCls =
  "bg-[#080c14] border border-zinc-800/80 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-blue-500 transition [color-scheme:dark]";

// Classe das abas dos modais de detalhes e edição
const classeAba = (ativa: boolean) =>
  `px-4 py-2.5 font-bold transition border-b-2 ${
    ativa ? "border-blue-500 text-blue-400 bg-zinc-900/50" : "border-transparent text-zinc-400"
  }`;

export const HistoricoServicos: React.FC = () => {
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [fornecedoresCadastrados, setFornecedoresCadastrados] = useState<any[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [termoBusca, setTermoBusca] = useState("");
  // Filtros da listagem: por padrão mostram todas as ordens, das mais recentes para as mais antigas
  const [filtroData, setFiltroData] = useState<FiltroData>("TODAS");
  const [diaFiltro, setDiaFiltro] = useState(hojeISO);
  const [mesFiltro, setMesFiltro] = useState(() => hojeISO().substring(0, 7));
  const [anoFiltro, setAnoFiltro] = useState(() => hojeISO().substring(0, 4));
  const [statusFiltro, setStatusFiltro] = useState<StatusOS | "TODOS">("TODOS");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("RECENTES");


  const [osSelecionada, setOsSelecionada] = useState<OrdemServico | null>(null);
  const [osParaEditar, setOsParaEditar] = useState<OrdemServico | null>(null);
  const [osParaExcluir, setOsParaExcluir] = useState<OrdemServico | null>(null);
  const { pode } = useOperador();
  const [osParaImprimir, setOsParaImprimir] = useState<OrdemServico | null>(
    null,
  );

  const [excluindo, setExcluindo] = useState(false);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [abaModal, setAbaModal] = useState<
    "detalhes" | "checklist" | "historico"
  >("detalhes");
  const [abaEdicao, setAbaEdicao] = useState<
    "geral" | "financeiro" | "checklist"
  >("geral");

  // Estados do Formulário de Edição
  const [editNome, setEditNome] = useState("");
  const [editWhatsapp, setEditWhatsapp] = useState("");
  const [editCpfCnpj, setEditCpfCnpj] = useState("");
  const [editModelo, setEditModelo] = useState("");
  const [editImei, setEditImei] = useState("");
  const [editSenha, setEditSenha] = useState("");
  const [editStatus, setEditStatus] = useState<StatusOS>(
    "AGUARDANDO_AVALIACAO",
  );
  const [editDefeito, setEditDefeito] = useState("");
  const [editDiagnostico, setEditDiagnostico] = useState("");
  const [editServico, setEditServico] = useState("");
  const [editPecas, setEditPecas] = useState("");
  const [editObservacoes, setEditObservacoes] = useState("");
  const [editCustoPeca, setEditCustoPeca] = useState<number | "">("");
  const [editFrete, setEditFrete] = useState<number | "">("");
  const [editFornecedor, setEditFornecedor] = useState("");
  
  // Estados para desconto e valor líquido editável
  const [editTipoDesconto, setEditTipoDesconto] = useState<'VALOR' | 'PERCENTUAL'>('VALOR');
  const [editDesconto, setEditDesconto] = useState<number | "">("");
  const [editValorTotal, setEditValorTotal] = useState<number | "">("");
  const [editValorLiquido, setEditValorLiquido] = useState<number | string>("");

  const [editFormaPagamento, setEditFormaPagamento] = useState("PIX");
  const [editParcelas, setEditParcelas] = useState<number>(1);

  const [editDataAbertura, setEditDataAbertura] = useState("");
  const [editDataConclusao, setEditDataConclusao] = useState("");
  const [editChecklist, setEditChecklist] = useState<Record<string, string>>(
    {},
  );

  const carregarHistorico = async (): Promise<OrdemServico[]> => {
    setLoading(true);
    try {
      const data = await buscarOrdensServico();
      const lista = Array.isArray(data) ? data : [];
      setOrdens(lista);

      const resFornecedores = await buscarFornecedores();
      if (Array.isArray(resFornecedores)) {
        setFornecedoresCadastrados(resFornecedores);
      }
      return lista;
    } catch (err) {
      console.error("Erro ao buscar histórico ou fornecedores:", err);
      setOrdens([]);
      return [];
    } finally {
      setLoading(false);
    }
  };

  // Taxa efetiva da maquineta já registrada nos pagamentos da OS (0 para Dinheiro/PIX)
  const obterTaxaEfetivaPagamentos = (os: any): number => {
    const pgs: any[] = os?.pagamentos || os?.orcamentoCalculado?.pagamentos || [];
    const totalPago = pgs.reduce((acc, pg) => acc + Number(pg?.valor || 0), 0);
    const totalTaxa = pgs.reduce((acc, pg) => acc + Number(pg?.valorTaxa || 0), 0);
    return totalPago > 0 ? Math.min(1, Math.max(0, totalTaxa / totalPago)) : 0;
  };

  // Cálculo do desconto a partir do valor bruto, do tipo (VALOR/PERCENTUAL) e do desconto digitado
  const calcularDescontoEdicao = (
    valorBruto: number,
    tipo: 'VALOR' | 'PERCENTUAL',
    desconto: number,
  ) => {
    const valorDesconto = Math.max(0, tipo === 'PERCENTUAL' ? (valorBruto * desconto) / 100 : desconto);
    const valorComDesconto = Math.max(0, valorBruto - valorDesconto);
    return { valorDesconto, valorComDesconto };
  };

  // Atualiza o Valor Líquido Final na tela sempre que bruto, tipo ou desconto mudarem
  const recalcularValorLiquido = (
    bruto: number | "",
    tipo: 'VALOR' | 'PERCENTUAL',
    desconto: number | "",
  ) => {
    const { valorComDesconto } = calcularDescontoEdicao(
      bruto === "" ? 0 : Number(bruto),
      tipo,
      desconto === "" ? 0 : Number(desconto),
    );
    const taxa = obterTaxaEfetivaPagamentos(osParaEditar);
    setEditValorLiquido((valorComDesconto * (1 - taxa)).toFixed(2));
  };

  useEffect(() => {
    carregarHistorico();
  }, []);

  const handleImprimir = (os: OrdemServico) => {
    if (os.possuiGarantia === false || Number(os.possuiGarantia) === 0) {
      alert("Este serviço foi cadastrado sem cobertura de garantia.");
      return;
    }
    setOsParaImprimir(os);
    setTimeout(() => {
      window.print();
      setOsParaImprimir(null);
    }, 300);
  };

  const abrirEdicao = (os: OrdemServico) => {
    setOsParaEditar(os);
    setEditNome(os.cliente?.nome || "");
    setEditWhatsapp(os.cliente?.whatsapp || "");
    setEditCpfCnpj(os.cliente?.cpfCnpj || "");
    setEditModelo(os.aparelho?.modelo || "");
    setEditImei(os.aparelho?.imei1 || "");
    setEditSenha(os.aparelho?.senhaDesbloqueio || "");
    setEditStatus(os.status_os);
    setEditDefeito(os.defeitoRelatado || "");
    setEditDiagnostico(os.diagnostico || "");
    setEditServico(os.servicoRealizado || "");
    setEditPecas(os.pecasUtilizadas || "");
    setEditObservacoes(os.observacoes || "");

    const custo = os.orcamentoCalculado?.custoPeca;
    setEditCustoPeca(custo !== undefined && custo !== null ? custo : "");

    const frete = os.orcamentoCalculado?.freteReal;
    setEditFrete(frete !== undefined && frete !== null ? frete : "");

    setEditFornecedor(os.orcamentoCalculado?.fornecedorPeca || "");

    const tipoDesc: 'VALOR' | 'PERCENTUAL' =
      os.orcamentoCalculado?.tipoDesconto === 'PERCENTUAL' ? 'PERCENTUAL' : 'VALOR';
    setEditTipoDesconto(tipoDesc);

    // PERCENTUAL: mostra o % digitado; VALOR: mostra o desconto em R$
    const desc =
      tipoDesc === 'PERCENTUAL'
        ? os.orcamentoCalculado?.descontoInput
        : os.orcamentoCalculado?.descontoGeralAplicado;
    setEditDesconto(desc !== undefined && desc !== null && Number(desc) !== 0 ? Number(desc) : "");

    // Valor bruto (antes do desconto)
    const total = os.orcamentoCalculado?.subtotalServicos ?? os.orcamentoCalculado?.valorTotalOrcamento;
    setEditValorTotal(total !== undefined && total !== null ? Number(total) : "");

    setEditFormaPagamento(os.formaPagamento || "PIX");
    setEditParcelas(os.parcelas || 1);
    
    const valorFinalAtual = os.orcamentoCalculado?.valorTotalOrcamento;
    setEditValorLiquido(
      os.valorLiquido !== undefined && os.valorLiquido !== null
        ? os.valorLiquido
        : (valorFinalAtual !== undefined && valorFinalAtual !== null ? valorFinalAtual : "")
    );

    setEditDataAbertura(
      os.data_abertura
        ? new Date(os.data_abertura).toISOString().substring(0, 10)
        : "",
    );
    setEditDataConclusao(
      os.data_conclusao
        ? new Date(os.data_conclusao).toISOString().substring(0, 10)
        : "",
    );

    setEditChecklist(os.checklistEntrada || {});
    setAbaEdicao("geral");
  };

  const handleSalvarEdicao = async () => {
    if (!osParaEditar) return;
    setSalvandoEdicao(true);
    try {
      const logs: string[] = [];

      const numValorTotal = editValorTotal === "" ? 0 : Number(editValorTotal);
      const numCustoPeca = editCustoPeca === "" ? 0 : Number(editCustoPeca);
      const numFrete = editFrete === "" ? 0 : Number(editFrete);
      const numDesconto = editDesconto === "" ? 0 : Number(editDesconto);

      const { valorDesconto: valorDescontoCalculado, valorComDesconto } = calcularDescontoEdicao(
        numValorTotal,
        editTipoDesconto,
        numDesconto,
      );

      // Tratamento robusto do valor líquido (aceitando ponto e vírgula)
      const liquidoDigitado = Number(String(editValorLiquido).replace(",", "."));
      const numValorLiquidoFinal =
        editValorLiquido !== "" && editValorLiquido !== undefined && Number.isFinite(liquidoDigitado)
          ? Math.max(0, liquidoDigitado)
          : valorComDesconto * (1 - obterTaxaEfetivaPagamentos(osParaEditar));

      if (editStatus !== osParaEditar.status_os) {
        logs.push(`Status alterado para ${editStatus.replace("_", " ")}`);
      }

      const custoGarantiaExistente = Number(
        osParaEditar.orcamentoCalculado?.custoPecaGarantia ||
        osParaEditar.garantia?.custoPecaGarantia ||
        osParaEditar.garantia?.custoTotalGarantia ||
        0
      );

      const lucroCalculado =
        numValorLiquidoFinal - (numCustoPeca + numFrete + custoGarantiaExistente);

      await editarOrdemServico(osParaEditar.id_os, {
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
        statusOs: editStatus,
        defeitoRelatado: editDefeito,
        diagnostico: editDiagnostico,
        servicoRealizado: editServico,
        pecasUtilizadas: editPecas,
        observacoes: editObservacoes,
        formaPagamento: editFormaPagamento,
        parcelas: editParcelas,
        valor_liquido: numValorLiquidoFinal,
        dataAbertura: editDataAbertura || undefined,
        data_conclusao: editDataConclusao || undefined,
        checklistEntrada: editChecklist,
        orcamentoCalculado: {
          subtotalServicos: numValorTotal,
          tipoDesconto: editTipoDesconto,
          descontoInput: numDesconto,
          descontoGeralAplicado: valorDescontoCalculado,
          valorTotalOrcamento: valorComDesconto,
          lucroTotalEstimadoInterno: lucroCalculado,
          custoPeca: numCustoPeca,
          freteReal: numFrete,
          fornecedorPeca: editFornecedor,
          custoPecaGarantia: custoGarantiaExistente,
        },
        modificacoesLog: logs,
      });

      const idEditado = osParaEditar.id_os;
      setOsParaEditar(null);
      const listaAtualizada = await carregarHistorico();

      // Reflete os novos valores no modal de detalhes, se ele estiver aberto nesta OS
      setOsSelecionada((atual) =>
        atual && atual.id_os === idEditado
          ? listaAtualizada.find((o) => o.id_os === idEditado) ?? atual
          : atual,
      );
    } catch (err: any) {
      alert(err.message || "Erro ao atualizar a Ordem de Serviço.");
    } finally {
      setSalvandoEdicao(false);
    }
  };

  const handleConfirmarExclusao = async () => {
    if (!osParaExcluir) return;
    setExcluindo(true);
    try {
      await excluirOrdemServico(osParaExcluir.id_os);
      setOrdens((prev) =>
        prev.filter((os) => os.id_os !== osParaExcluir.id_os),
      );
      setOsParaExcluir(null);
    } catch (err: any) {
      alert(err.message || "Erro ao excluir Ordem de Serviço.");
    } finally {
      setExcluindo(false);
    }
  };

  // Último retorno em garantia da OS aberta nos detalhes (a tela Garantias grava dataRetorno e defeitoConstatadoGarantia)
  const ultimoRetorno = osSelecionada?.garantia?.listaRetornos?.at(-1);
  const dataUltimoRetorno = ultimoRetorno?.dataRetorno || ultimoRetorno?.dataAcionamento;

  // Anos com ordens cadastradas (para o filtro por ano), do mais recente para o mais antigo
  const anosDisponiveis = useMemo(() => {
    const anos = new Set(ordens.map((os) => diaDaOS(os).substring(0, 4)).filter(Boolean));
    anos.add(hojeISO().substring(0, 4));
    return [...anos].sort((a, b) => b.localeCompare(a));
  }, [ordens]);

  const ordensFiltradas = useMemo(() => {
    const termo = termoBusca.trim().toLowerCase();
    const lista = ordens.filter((os) => {
      if (!os) return false;
      if (statusFiltro !== "TODOS" && os.status_os !== statusFiltro) return false;

      const dia = diaDaOS(os);
      if (filtroData === "DIA" && dia !== diaFiltro) return false;
      if (filtroData === "MES" && dia.substring(0, 7) !== mesFiltro) return false;
      if (filtroData === "ANO" && dia.substring(0, 4) !== anoFiltro) return false;

      if (!termo) return true;
      return [os.numero_os, os.cliente?.nome, os.cliente?.whatsapp, os.aparelho?.modelo, os.aparelho?.imei1]
        .some((campo) => String(campo || "").toLowerCase().includes(termo));
    });

    const sentido = ordenacao === "RECENTES" ? -1 : 1;
    return lista.sort((a, b) => {
      const ta = a.data_abertura ? new Date(a.data_abertura).getTime() : 0;
      const tb = b.data_abertura ? new Date(b.data_abertura).getTime() : 0;
      return (ta - tb) * sentido || String(a.numero_os).localeCompare(String(b.numero_os)) * sentido;
    });
  }, [ordens, termoBusca, statusFiltro, filtroData, diaFiltro, mesFiltro, anoFiltro, ordenacao]);

  const filtrosAtivos = termoBusca.trim() !== "" || statusFiltro !== "TODOS" || filtroData !== "TODAS";
  const limparFiltros = () => {
    setTermoBusca("");
    setStatusFiltro("TODOS");
    setFiltroData("TODAS");
  };

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto">
      {/* ================= CABEÇALHO ================= */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Ordens de serviço</h2>
          <p className="text-xs text-zinc-400 mt-1">Histórico completo de atendimentos da loja.</p>
        </div>
        <button
          onClick={carregarHistorico}
          title="Atualizar lista"
          className="self-start sm:self-auto px-3.5 py-2 bg-[#0c101a] hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-200 transition flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Atualizar
        </button>
      </div>

      {/* ================= FILTROS ================= */}
      <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-4 space-y-3 print:hidden">
        <div className="relative">
          <svg className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar por cliente, telefone, aparelho, IMEI ou número da OS"
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white placeholder-zinc-500 outline-none focus:border-blue-500 transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filtroData}
            onChange={(e) => setFiltroData(e.target.value as FiltroData)}
            aria-label="Filtrar por data de abertura"
            className={campoFiltroCls}
          >
            <option value="TODAS">Todas as datas</option>
            <option value="DIA">Por dia</option>
            <option value="MES">Por mês</option>
            <option value="ANO">Por ano</option>
          </select>

          {filtroData === "DIA" && (
            <input type="date" value={diaFiltro} onChange={(e) => setDiaFiltro(e.target.value)} aria-label="Dia" className={campoFiltroCls} />
          )}
          {filtroData === "MES" && (
            <input type="month" value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)} aria-label="Mês" className={campoFiltroCls} />
          )}
          {filtroData === "ANO" && (
            <select value={anoFiltro} onChange={(e) => setAnoFiltro(e.target.value)} aria-label="Ano" className={campoFiltroCls}>
              {anosDisponiveis.map((ano) => (
                <option key={ano} value={ano}>
                  {ano}
                </option>
              ))}
            </select>
          )}

          <select
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value as StatusOS | "TODOS")}
            aria-label="Filtrar por status"
            className={campoFiltroCls}
          >
            {OPCOES_STATUS.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>

          <select
            value={ordenacao}
            onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
            aria-label="Ordenação"
            className={campoFiltroCls}
          >
            <option value="RECENTES">Mais recentes primeiro</option>
            <option value="ANTIGAS">Mais antigas primeiro</option>
          </select>

          <div className="flex items-center gap-3 sm:ml-auto text-xs">
            <span className="text-zinc-500">
              {ordensFiltradas.length === ordens.length
                ? `${ordens.length} ${ordens.length === 1 ? "ordem" : "ordens"}`
                : `${ordensFiltradas.length} de ${ordens.length} ordens`}
            </span>
            {filtrosAtivos && (
              <button type="button" onClick={limparFiltros} className="font-semibold text-blue-400 hover:text-blue-300 transition">
                Limpar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ================= LISTAGEM ================= */}
      {loading ? (
        <div className="flex justify-center p-12 print:hidden">
          <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : ordensFiltradas.length === 0 ? (
        <div className="p-14 text-center space-y-1.5 bg-[#0c101a] border border-zinc-800/80 rounded-2xl print:hidden">
          <h3 className="text-sm font-bold text-zinc-300">Nenhuma ordem encontrada</h3>
          <p className="text-xs text-zinc-500">
            {ordens.length === 0 ? "Ainda não há ordens de serviço cadastradas." : "Nenhuma ordem corresponde aos filtros escolhidos."}
          </p>
          {filtrosAtivos && (
            <button type="button" onClick={limparFiltros} className="pt-2 text-xs font-semibold text-blue-400 hover:text-blue-300">
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl overflow-hidden print:hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[860px]">
              <thead className="text-[10px] text-zinc-500 uppercase tracking-wider border-b border-zinc-800/80">
                <tr>
                  <th className="py-3 px-5 font-semibold">Ordem</th>
                  <th className="py-3 px-5 font-semibold">Cliente</th>
                  <th className="py-3 px-5 font-semibold">Aparelho</th>
                  <th className="py-3 px-5 font-semibold">Status</th>
                  <th className="py-3 px-5 font-semibold text-right">Valor</th>
                  <th className="py-3 px-5 font-semibold text-right w-28">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {ordensFiltradas.map((os) => {
                  const valorCobrado = Number(os.orcamentoCalculado?.valorTotalOrcamento || 0);
                  const valorLiquido = Number(os.valorLiquido ?? valorCobrado);
                  const abrirDetalhes = () => {
                    setOsSelecionada(os);
                    setAbaModal("detalhes");
                  };
                  return (
                    <tr key={os.id_os} onClick={abrirDetalhes} className="group cursor-pointer hover:bg-zinc-800/25 transition">
                      <td className="py-3.5 px-5">
                        <p className="font-mono font-bold text-blue-400">{os.numero_os}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">{dataCurta(os)}</p>
                      </td>
                      <td className="py-3.5 px-5">
                        <p className="font-semibold text-white">{os.cliente?.nome || "Cliente balcão"}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">{os.cliente?.whatsapp || "Sem telefone"}</p>
                      </td>
                      <td className="py-3.5 px-5">
                        <p className="font-medium text-zinc-200">{os.aparelho?.modelo}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5 truncate max-w-[220px]">
                          {os.servicoRealizado || os.defeitoRelatado || "—"}
                        </p>
                      </td>
                      <td className="py-3.5 px-5">
                        <StatusBadge status={os.status_os} />
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <p className="font-bold text-white">R$ {formatarValor(valorCobrado)}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          {os.formaPagamento || "—"}
                          {Math.abs(valorLiquido - valorCobrado) >= 0.01 && ` · líq. R$ ${formatarValor(valorLiquido)}`}
                        </p>
                      </td>
                      <td className="py-3.5 px-5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={abrirDetalhes}
                            title="Ver detalhes"
                            aria-label={`Ver detalhes da ${os.numero_os}`}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 transition"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          {/* Sempre visível: sem a permissão, a exclusão pede autorização de um administrador */}
                          <button
                            type="button"
                            onClick={() => setOsParaExcluir(os)}
                            title={pode("excluir_os") ? "Excluir ordem de serviço" : "Excluir (requer autorização de um administrador)"}
                            aria-label={`Excluir ${os.numero_os}`}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                          >
                            {pode("excluir_os") ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL DETALHES COMPLETO DA OS */}
      {osSelecionada && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
            <div className="relative p-4 pr-14 bg-zinc-950 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
              {/* Fechar: fixo no canto superior direito do modal */}
              <button
                onClick={() => setOsSelecionada(null)}
                className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 text-base font-bold transition"
                title="Fechar"
                aria-label="Fechar"
              >
                ✕
              </button>

              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <span>Ordem de Serviço</span>
                  <span className="font-mono text-blue-400">
                    #{osSelecionada.numero_os}
                  </span>
                  <StatusBadge status={osSelecionada.status_os} />
                </h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  {osSelecionada.cliente?.nome} —{" "}
                  {osSelecionada.aparelho?.modelo}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => abrirEdicao(osSelecionada)}
                  className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-semibold transition flex items-center space-x-1"
                >
                  <span>✏️</span>
                  <span>Editar OS</span>
                </button>

                {osSelecionada.possuiGarantia !== false &&
                  Number(osSelecionada.possuiGarantia) !== 0 && (
                    <button
                      onClick={() => handleImprimir(osSelecionada)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition flex items-center space-x-1 shadow-md"
                    >
                      <span>🖨️</span>
                      <span>Imprimir / Salvar PDF</span>
                    </button>
                  )}
              </div>
            </div>

            <div className="flex border-b border-zinc-800 bg-zinc-950/50 text-xs">
              <button
                onClick={() => setAbaModal("detalhes")}
                className={classeAba(abaModal === "detalhes")}
              >
                Informações & Orçamento
              </button>
              <button
                onClick={() => setAbaModal("checklist")}
                className={classeAba(abaModal === "checklist")}
              >
                Checklist de Entrada
              </button>
              <button
                onClick={() => setAbaModal("historico")}
                className={classeAba(abaModal === "historico")}
              >
                Linha do Tempo & Logs
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {abaModal === "detalhes" && (
                <div className="space-y-4 text-xs">
                  {/* Mensagens automáticas: abre o WhatsApp do cliente com o texto pronto */}
                  <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl space-y-2">
                    <div>
                      <span className="text-emerald-400 block uppercase text-[10px] font-bold">
                        Avisar o cliente pelo WhatsApp
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {!podeEnviarMensagem(osSelecionada)
                          ? "OS entregue: as mensagens só podem ser enviadas antes da entrega."
                          : osSelecionada.cliente?.whatsapp
                          ? `Abre a conversa com ${osSelecionada.cliente.whatsapp} com o texto pronto. Você revisa e toca em Enviar.`
                          : "Cadastre o WhatsApp do cliente (Editar OS) para usar as mensagens."}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {MODELOS_WHATSAPP.map((m) => (
                        <button
                          key={m.chave}
                          type="button"
                          onClick={() => enviarMensagemWhatsapp(osSelecionada, m.chave)}
                          disabled={!osSelecionada.cliente?.whatsapp || !podeEnviarMensagem(osSelecionada)}
                          title={
                            !podeEnviarMensagem(osSelecionada)
                              ? "OS já entregue"
                              : osSelecionada.cliente?.whatsapp
                              ? undefined
                              : "Cliente sem WhatsApp cadastrado"
                          }
                          className="px-3 py-1.5 bg-emerald-600/15 hover:bg-emerald-600/25 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-300 border border-emerald-500/30 rounded-lg text-[11px] font-semibold transition"
                        >
                          {m.rotulo}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Badge de Alerta de Garantia / Retorno nos Detalhes da OS */}
                  {osSelecionada.garantia && (
                    <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 space-y-1">
                      <div className="flex items-center space-x-2 font-bold text-xs uppercase">
                        <span>🔄</span>
                        <span>Serviço com Retorno em Garantia Acionado</span>
                      </div>
                      <p className="text-[11px] text-zinc-300">
                        <strong>Data do Acionamento:</strong>{" "}
                        {dataUltimoRetorno
                          ? new Date(dataUltimoRetorno).toLocaleDateString("pt-BR")
                          : "Não informada"}
                      </p>
                      <p className="text-[11px] text-zinc-300">
                        <strong>Motivo / Ocorrência:</strong>{" "}
                        {ultimoRetorno?.defeitoConstatadoGarantia ||
                          ultimoRetorno?.motivoRetorno ||
                          "Não especificado"}
                      </p>
                      {Number(
                        osSelecionada.garantia.custoPecaGarantia || 0,
                      ) > 0 && (
                        <p className="text-[11px] text-rose-300 font-semibold">
                          <strong>Custo Extra da Peça (Garantia):</strong> R${" "}
                          {Number(
                            osSelecionada.garantia.custoPecaGarantia,
                          ).toFixed(2)}{" "}
                          (Abatido do Lucro Líquido)
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3 p-3 bg-zinc-950 border border-zinc-800 rounded-xl">
                    <div>
                      <span className="text-zinc-500 block uppercase text-[10px] font-bold">
                        Data de Abertura
                      </span>
                      <p className="font-semibold text-zinc-200">
                        {osSelecionada.data_abertura
                          ? new Date(
                              osSelecionada.data_abertura,
                            ).toLocaleDateString("pt-BR")
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <span className="text-zinc-500 block uppercase text-[10px] font-bold">
                        Forma de Pagamento
                      </span>
                      <p className="font-semibold text-amber-400">
                        {osSelecionada.formaPagamento || "PIX"}{" "}
                        {osSelecionada.formaPagamento ===
                        "Cartão de Crédito"
                          ? `(${osSelecionada.parcelas || 1}x)`
                          : ""}
                      </p>
                    </div>
                    <div>
                      <span className="text-zinc-500 block uppercase text-[10px] font-bold">
                        Data de Conclusão
                      </span>
                      <p className="font-semibold text-zinc-200">
                        {osSelecionada.data_conclusao
                          ? new Date(
                              osSelecionada.data_conclusao,
                            ).toLocaleDateString("pt-BR")
                          : "Em andamento"}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-zinc-950 border border-zinc-800 rounded-xl">
                    <div className="space-y-1">
                      <span className="text-blue-400 block uppercase text-[10px] font-bold">
                        👤 Informações do Cliente
                      </span>
                      <p className="font-bold text-white text-sm">
                        {osSelecionada.cliente?.nome}
                      </p>
                      <p className="text-zinc-400">
                        <strong>WhatsApp:</strong>{" "}
                        {osSelecionada.cliente?.whatsapp || "Não informado"}
                      </p>
                      <p className="text-zinc-400">
                        <strong>CPF/CNPJ:</strong>{" "}
                        {osSelecionada.cliente?.cpfCnpj || "Não informado"}
                      </p>
                    </div>

                    <div className="space-y-1 border-t md:border-t-0 md:border-l border-zinc-800 pt-3 md:pt-0 md:pl-4">
                      <span className="text-blue-400 block uppercase text-[10px] font-bold">
                        📱 Informações do Aparelho
                      </span>
                      <p className="font-bold text-white text-sm">
                        {osSelecionada.aparelho?.modelo}
                      </p>
                      <p className="text-zinc-400">
                        <strong>IMEI / N° Série:</strong>{" "}
                        {osSelecionada.aparelho?.imei1 || "Não informado"}
                      </p>
                      <p className="text-zinc-400">
                        <strong>Senha:</strong>{" "}
                        {osSelecionada.aparelho?.senhaDesbloqueio ||
                          "Não informada"}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
                    <div>
                      <span className="text-zinc-500 block uppercase text-[10px] font-bold">
                        Defeito Relatado pelo Cliente
                      </span>
                      <p className="text-zinc-200 mt-1 bg-zinc-900 p-2.5 rounded-lg border border-zinc-800">
                        {osSelecionada.defeitoRelatado}
                      </p>
                    </div>
                    {osSelecionada.diagnostico && (
                      <div>
                        <span className="text-zinc-500 block uppercase text-[10px] font-bold">
                          Diagnóstico Técnico
                        </span>
                        <p className="text-zinc-200 mt-1 bg-zinc-900 p-2.5 rounded-lg border border-zinc-800">
                          {osSelecionada.diagnostico}
                        </p>
                      </div>
                    )}
                    {osSelecionada.servicoRealizado && (
                      <div>
                        <span className="text-zinc-500 block uppercase text-[10px] font-bold">
                          Serviço Realizado
                        </span>
                        <p className="text-zinc-200 mt-1 bg-zinc-900 p-2.5 rounded-lg border border-zinc-800">
                          {osSelecionada.servicoRealizado}
                        </p>
                      </div>
                    )}
                    {osSelecionada.pecasUtilizadas && (
                      <div>
                        <span className="text-zinc-500 block uppercase text-[10px] font-bold">
                          Peças Utilizadas
                        </span>
                        <p className="text-zinc-200 mt-1 bg-zinc-900 p-2.5 rounded-lg border border-zinc-800">
                          {osSelecionada.pecasUtilizadas}
                        </p>
                      </div>
                    )}
                    {osSelecionada.observacoes && (
                      <div>
                        <span className="text-zinc-500 block uppercase text-[10px] font-bold">
                          Observações Internas
                        </span>
                        <p className="text-zinc-200 mt-1 bg-zinc-900 p-2.5 rounded-lg border border-zinc-800">
                          {osSelecionada.observacoes}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl">
                      <span className="text-zinc-400 uppercase text-[10px] font-bold block">
                        Valor Cobrado Total
                      </span>
                      <p className="text-xl font-black text-white mt-1">
                        R${" "}
                        {(
                          osSelecionada.orcamentoCalculado
                            ?.valorTotalOrcamento || 0
                        ).toFixed(2)}
                      </p>
                    </div>
                    <div className="p-4 bg-zinc-950 border border-purple-500/30 rounded-xl">
                      <span className="text-purple-400 uppercase text-[10px] font-bold block">
                        Valor Líquido (Caixa)
                      </span>
                      <p className="text-xl font-black text-purple-400 mt-1">
                        R${" "}
                        {Number(
                          osSelecionada.valorLiquido ||
                            osSelecionada.orcamentoCalculado
                              ?.valorTotalOrcamento ||
                            0,
                        ).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {abaModal === "checklist" && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {itensVisiveisChecklist(osSelecionada.checklistEntrada).length > 0 ? (
                    itensVisiveisChecklist(osSelecionada.checklistEntrada).map(
                      ([item, status]) => (
                        <div
                          key={item}
                          className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg flex justify-between items-center"
                        >
                          <span className="capitalize font-medium text-zinc-300">
                            {rotuloItemChecklist(item)}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              status === "OK"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : status === "DEFEITO"
                                  ? "bg-rose-500/20 text-rose-400"
                                  : "bg-amber-500/20 text-amber-400"
                            }`}
                          >
                            {status}
                          </span>
                        </div>
                      ),
                    )
                  ) : (
                    <p className="text-zinc-500 col-span-2 text-center py-4">
                      Sem checklist registrado.
                    </p>
                  )}
                </div>
              )}

              {abaModal === "historico" && (
                <div className="space-y-3 text-xs">
                  <h4 className="font-bold text-white uppercase text-[10px]">
                    Linha do Tempo de Ocorrências e Edições
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {osSelecionada.historico &&
                    osSelecionada.historico.length > 0 ? (
                      osSelecionada.historico.map((item: any) => (
                        <div
                          key={item.id}
                          className="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg"
                        >
                          <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                            <span>
                              {new Date(item.data).toLocaleString("pt-BR")}
                            </span>
                            <span className="text-blue-400 font-bold">
                              {item.autor || "Sistema"}
                            </span>
                          </div>
                          <p className="text-zinc-300">{item.descricao}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-zinc-500 text-center py-4">
                        Nenhuma ocorrência salva.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDIÇÃO */}
      {osParaEditar && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col">
            <div className="p-4 bg-zinc-950 border-b border-zinc-800 flex justify-between items-center">
              <h3 className="text-sm font-bold text-white">
                Editar Ordem de Serviço{" "}
                <span className="text-blue-400 font-mono">
                  #{osParaEditar.numero_os}
                </span>
              </h3>
              <button
                onClick={() => setOsParaEditar(null)}
                className="text-zinc-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex border-b border-zinc-800 bg-zinc-950/50 text-xs">
              <button
                onClick={() => setAbaEdicao("geral")}
                className={classeAba(abaEdicao === "geral")}
              >
                1. Dados Gerais & Aparelho
              </button>
              <button
                onClick={() => setAbaEdicao("financeiro")}
                className={classeAba(abaEdicao === "financeiro")}
              >
                2. Orçamento, Custos & Pagamento
              </button>
              <button
                onClick={() => setAbaEdicao("checklist")}
                className={classeAba(abaEdicao === "checklist")}
              >
                3. Checklist de Entrada
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
              {abaEdicao === "geral" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-zinc-400 block mb-1">
                        Nome do Cliente
                      </label>
                      <input
                        type="text"
                        value={editNome}
                        onChange={(e) => setEditNome(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">
                        WhatsApp
                      </label>
                      <input
                        type="text"
                        value={editWhatsapp}
                        onChange={(e) => setEditWhatsapp(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">
                        CPF / CNPJ
                      </label>
                      <input
                        type="text"
                        value={editCpfCnpj}
                        onChange={(e) => setEditCpfCnpj(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-zinc-400 block mb-1">
                        Modelo Aparelho
                      </label>
                      <input
                        type="text"
                        value={editModelo}
                        onChange={(e) => setEditModelo(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">
                        IMEI / N° Série
                      </label>
                      <input
                        type="text"
                        value={editImei}
                        onChange={(e) => setEditImei(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">
                        Senha de Desbloqueio
                      </label>
                      <input
                        type="text"
                        value={editSenha}
                        onChange={(e) => setEditSenha(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-zinc-400 block mb-1 font-bold text-blue-400">
                        Data de Abertura da OS
                      </label>
                      <input
                        type="date"
                        value={editDataAbertura}
                        onChange={(e) => setEditDataAbertura(e.target.value)}
                        className="w-full bg-zinc-950 border border-blue-500/50 rounded-lg p-2.5 text-white font-bold outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1 font-bold text-zinc-300">
                        Status da OS
                      </label>
                      <select
                        value={editStatus}
                        onChange={(e) =>
                          setEditStatus(e.target.value as StatusOS)
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white outline-none focus:border-blue-500 font-bold"
                      >
                        <option value="AGUARDANDO_AVALIACAO">
                          Aguardando Avaliação
                        </option>
                        <option value="EM_ANALISE">Em Análise</option>
                        <option value="AGUARDANDO_PECA">Aguardando Peça</option>
                        <option value="EM_MANUTENCAO">Em Manutenção</option>
                        <option value="PRONTO">Pronto / Retirada</option>
                        <option value="ENTREGUE">Entregue / Concluído</option>
                        <option value="CANCELADO">Cancelado</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-zinc-400 block mb-1">
                        Defeito Relatado
                      </label>
                      <textarea
                        rows={2}
                        value={editDefeito}
                        onChange={(e) => setEditDefeito(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">
                        Diagnóstico Técnico
                      </label>
                      <textarea
                        rows={2}
                        value={editDiagnostico}
                        onChange={(e) => setEditDiagnostico(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-zinc-400 block mb-1">
                        Serviço Realizado
                      </label>
                      <input
                        type="text"
                        value={editServico}
                        onChange={(e) => setEditServico(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">
                        Peças Utilizadas
                      </label>
                      <input
                        type="text"
                        value={editPecas}
                        onChange={(e) => setEditPecas(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">
                        Observações Internas
                      </label>
                      <input
                        type="text"
                        value={editObservacoes}
                        onChange={(e) => setEditObservacoes(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {abaEdicao === "financeiro" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <label className="text-zinc-400 block mb-1 font-bold text-amber-400">
                        Forma de Pagto
                      </label>
                      <select
                        value={editFormaPagamento}
                        onChange={(e) => {
                          setEditFormaPagamento(e.target.value);
                          if (e.target.value !== "Cartão de Crédito") {
                            setEditParcelas(1);
                          }
                        }}
                        className="w-full bg-zinc-950 border border-amber-500/50 rounded-lg p-2.5 text-amber-400 font-bold outline-none"
                      >
                        <option value="PIX">PIX</option>
                        <option value="Dinheiro">Dinheiro</option>
                        <option value="Cartão de Débito">
                          Cartão de Débito
                        </option>
                        <option value="Cartão de Crédito">
                          Cartão de Crédito
                        </option>
                      </select>
                    </div>

                    {/* Parcelas: 100% visível em Cartão de Crédito; translúcido, inselecionável e desabilitado nas demais */}
                    <div className={`transition-all duration-200 ${
                      editFormaPagamento === "Cartão de Crédito"
                        ? "opacity-100"
                        : "opacity-30 pointer-events-none select-none"
                    }`}>
                      <label className="text-zinc-400 block mb-1 font-bold text-blue-400">
                        Parcelas {editFormaPagamento !== "Cartão de Crédito" && <span className="text-[10px] text-zinc-500 font-normal lowercase">(à vista)</span>}
                      </label>
                      <select
                        disabled={editFormaPagamento !== "Cartão de Crédito"}
                        value={editFormaPagamento === "Cartão de Crédito" ? editParcelas : 1}
                        onChange={(e) => {
                          setEditParcelas(Number(e.target.value));
                        }}
                        className={`w-full bg-zinc-950 border border-blue-500/50 rounded-lg p-2.5 text-blue-400 font-bold outline-none ${
                          editFormaPagamento === "Cartão de Crédito" ? "cursor-pointer" : "cursor-not-allowed text-zinc-500"
                        }`}
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(
                          (num) => (
                            <option key={num} value={num}>
                              {num}x{" "}
                              {num <= 3 ? "(Sem Juros)" : "(Juros Clientes)"}
                            </option>
                          ),
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="text-zinc-400 block mb-1 font-bold text-emerald-400">
                        Valor Bruto / Orçado (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={editValorTotal}
                        onChange={(e) => {
                          const novoBruto = e.target.value === "" ? "" : Number(e.target.value);
                          setEditValorTotal(novoBruto);
                          recalcularValorLiquido(novoBruto, editTipoDesconto, editDesconto);
                        }}
                        className="w-full bg-zinc-950 border border-emerald-500/50 rounded-lg p-2.5 text-emerald-400 font-bold outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-zinc-400 block mb-1 font-bold text-purple-400">
                        Valor Líquido Final (R$)
                      </label>
                      <input
                        type="text"
                        placeholder="0.00"
                        value={editValorLiquido}
                        onChange={(e) => setEditValorLiquido(e.target.value)}
                        className="w-full bg-zinc-950 border border-purple-500/50 rounded-lg p-2.5 text-purple-400 font-bold outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-2 border-t border-zinc-800/80">
                    <div>
                      <label className="text-zinc-400 block mb-1">
                        Custo Peça (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={editCustoPeca}
                        onChange={(e) =>
                          setEditCustoPeca(
                            e.target.value === "" ? "" : Number(e.target.value),
                          )
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">
                        Frete Real (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={editFrete}
                        onChange={(e) =>
                          setEditFrete(
                            e.target.value === "" ? "" : Number(e.target.value),
                          )
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">
                        Tipo Desc.
                      </label>
                      <select
                        value={editTipoDesconto}
                        onChange={(e) => {
                          const novoTipo = e.target.value as 'VALOR' | 'PERCENTUAL';
                          setEditTipoDesconto(novoTipo);
                          recalcularValorLiquido(editValorTotal, novoTipo, editDesconto);
                        }}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white outline-none font-bold"
                      >
                        <option value="VALOR">Valor (R$)</option>
                        <option value="PERCENTUAL">Percentual (%)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">
                        Desconto ({editTipoDesconto === 'PERCENTUAL' ? '%' : 'R$'})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        min={0}
                        value={editDesconto}
                        onChange={(e) => {
                          const novoDesconto = e.target.value === "" ? "" : Number(e.target.value);
                          setEditDesconto(novoDesconto);
                          recalcularValorLiquido(editValorTotal, editTipoDesconto, novoDesconto);
                        }}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">
                        Fornecedor da Peça
                      </label>
                      <select
                        value={editFornecedor}
                        onChange={(e) => setEditFornecedor(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-white outline-none focus:border-blue-500 font-bold"
                      >
                        <option value="">Selecione o fornecedor...</option>
                        {fornecedoresCadastrados.map((f: any) => (
                          <option key={f.id || f.nome} value={f.nome}>
                            {f.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Resumo financeiro em tempo real (antes de salvar) */}
                  {(() => {
                    const bruto = editValorTotal === "" ? 0 : Number(editValorTotal);
                    const { valorDesconto, valorComDesconto } = calcularDescontoEdicao(
                      bruto,
                      editTipoDesconto,
                      editDesconto === "" ? 0 : Number(editDesconto),
                    );
                    const liquidoDigitado = Number(String(editValorLiquido).replace(",", "."));
                    const liquido = editValorLiquido !== "" && Number.isFinite(liquidoDigitado)
                      ? Math.max(0, liquidoDigitado)
                      : valorComDesconto;
                    const custoGarantia = Number(
                      osParaEditar.orcamentoCalculado?.custoPecaGarantia ||
                        osParaEditar.garantia?.custoPecaGarantia ||
                        0,
                    );
                    const lucro =
                      liquido -
                      ((editCustoPeca === "" ? 0 : Number(editCustoPeca)) +
                        (editFrete === "" ? 0 : Number(editFrete)) +
                        custoGarantia);
                    const fmt = (v: number) =>
                      v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                    return (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-zinc-800/80">
                        <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl">
                          <span className="text-zinc-400 uppercase text-[10px] font-bold block">Valor Bruto</span>
                          <p className="text-sm font-black text-white mt-1">R$ {fmt(bruto)}</p>
                        </div>
                        <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl">
                          <span className="text-zinc-400 uppercase text-[10px] font-bold block">
                            Desconto Aplicado{editTipoDesconto === 'PERCENTUAL' && editDesconto !== "" ? ` (${editDesconto}%)` : ""}
                          </span>
                          <p className="text-sm font-black text-red-400 mt-1">- R$ {fmt(valorDesconto)}</p>
                        </div>
                        <div className="p-3 bg-zinc-950 border border-emerald-500/30 rounded-xl">
                          <span className="text-emerald-400 uppercase text-[10px] font-bold block">Valor Final Cobrado</span>
                          <p className="text-sm font-black text-emerald-400 mt-1">R$ {fmt(valorComDesconto)}</p>
                        </div>
                        <div className="p-3 bg-zinc-950 border border-purple-500/30 rounded-xl">
                          <span className="text-purple-400 uppercase text-[10px] font-bold block">Lucro Líquido Estimado</span>
                          <p className={`text-sm font-black mt-1 ${lucro >= 0 ? "text-purple-400" : "text-red-400"}`}>
                            R$ {fmt(lucro)}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {abaEdicao === "checklist" && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {((ativos) =>
                    // Itens ativos nas Configurações e os que já estavam gravados nesta OS
                    ITENS_CHECKLIST.filter((i) => ativos.includes(i.chave) || i.chave in editChecklist))(
                    obterConfiguracoesLojaSincrono().checklistItensAtivos,
                  ).map(({ chave: item, rotulo }) => (
                    <div
                      key={item}
                      className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-1.5"
                    >
                      <span className="font-medium text-zinc-300 block text-[11px]">
                        {rotulo}
                      </span>
                      <select
                        value={editChecklist[item] || "OK"}
                        onChange={(e) =>
                          setEditChecklist({
                            ...editChecklist,
                            [item]: e.target.value,
                          })
                        }
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-1.5 text-white text-xs outline-none font-bold"
                      >
                        {OPCOES_CHECKLIST.map((opcao) => (
                          <option key={opcao} value={opcao}>{opcao}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 bg-zinc-950 border-t border-zinc-800 flex justify-end space-x-2">
              <button
                onClick={() => setOsParaEditar(null)}
                className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-xl text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvarEdicao}
                disabled={salvandoEdicao}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition"
              >
                {salvandoEdicao ? "Salvando..." : "💾 Salvar Alterações"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EXCLUSÃO */}
      {osParaExcluir && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl">
            <div className="flex items-center space-x-3 text-red-400">
              <span className="text-2xl">⚠️</span>
              <h3 className="text-lg font-bold text-white">
                Excluir Ordem de Serviço?
              </h3>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Você está prestes a apagar permanentemente a Ordem de Serviço{" "}
              <strong className="text-blue-400 font-mono">
                #{osParaExcluir.numero_os}
              </strong>{" "}
              do cliente{" "}
              <strong className="text-white">
                {osParaExcluir.cliente?.nome}
              </strong>
              . Esta ação não poderá ser desfeita.
            </p>

            {pode("excluir_os") ? (
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  onClick={() => setOsParaExcluir(null)}
                  disabled={excluindo}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmarExclusao}
                  disabled={excluindo}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition"
                >
                  {excluindo ? "Excluindo..." : "Sim, Excluir"}
                </button>
              </div>
            ) : (
              <AutorizacaoAdministrativa
                variante="compacta"
                recurso="excluir ordens de serviço"
                textoBotao={excluindo ? "Excluindo..." : "Autorizar e excluir"}
                onAutorizado={handleConfirmarExclusao}
                onVoltar={() => setOsParaExcluir(null)}
              />
            )}
          </div>
        </div>
      )}

      {/* TEMPLATE DE IMPRESSÃO: identidade, termos, contatos e formato do papel vêm das Configurações */}
      {osParaImprimir && (() => {
        const cfg = obterConfiguracoesLojaSincrono();
        const formato = cfg.formatoImpressao;
        const termica = formato === "TERMICA_80";
        const os = osParaImprimir;
        const prazoGarantia = Number(os.prazoGarantiaDias) || cfg.prazoGarantiaDias;
        return (
          <DocumentoParaImpressao formato={formato}>
            <ViasImpressao formato={formato}>
              {(via) => (
                <div className={`${classeFormato(formato)} mx-auto space-y-3 text-slate-800`}>
                  <div className={`flex ${termica ? "flex-col gap-2" : "justify-between items-start"} border-b-2 border-slate-900 pb-3`}>
                    <CabecalhoLojaImpressao cfg={cfg} formato={formato} />
                    <div className={termica ? "text-center" : "text-right shrink-0"}>
                      {via && <p className="text-[9px] font-bold uppercase text-slate-500">{via}</p>}
                      <p className="text-[9px] uppercase font-bold text-slate-500">Ordem de Serviço</p>
                      <p className={`${termica ? "text-xs" : "text-base"} font-black font-mono text-blue-900`}>#{os.numero_os}</p>
                      <p className="text-slate-600">
                        <strong>Abertura:</strong>{" "}
                        {os.data_abertura ? new Date(os.data_abertura).toLocaleDateString("pt-BR") : "-"}
                      </p>
                    </div>
                  </div>

                  <div className={`grid ${termica ? "grid-cols-1" : "grid-cols-2"} gap-3`}>
                    <div className="border border-slate-300 rounded p-2">
                      <h3 className="font-bold uppercase text-slate-700 border-b border-slate-200 pb-0.5 mb-1">Dados do cliente</h3>
                      <p><strong>Nome:</strong> {os.cliente?.nome}</p>
                      <p><strong>WhatsApp:</strong> {os.cliente?.whatsapp || "Não informado"}</p>
                      <p><strong>CPF/CNPJ:</strong> {os.cliente?.cpfCnpj || "Não informado"}</p>
                    </div>
                    <div className="border border-slate-300 rounded p-2">
                      <h3 className="font-bold uppercase text-slate-700 border-b border-slate-200 pb-0.5 mb-1">Dados do aparelho</h3>
                      <p><strong>Modelo:</strong> {os.aparelho?.modelo}</p>
                      <p><strong>IMEI / S/N:</strong> {os.aparelho?.imei1 || "Não informado"}</p>
                      <p><strong>Senha:</strong> {os.aparelho?.senhaDesbloqueio || "Não informada"}</p>
                    </div>
                  </div>

                  <div className="border border-slate-300 rounded p-2">
                    <h3 className="font-bold uppercase text-slate-700 border-b border-slate-200 pb-0.5 mb-1">Relato e diagnóstico técnico</h3>
                    <p><strong>Defeito relatado:</strong> {os.defeitoRelatado || "Sem descrição"}</p>
                    {os.diagnostico && <p><strong>Diagnóstico técnico:</strong> {os.diagnostico}</p>}
                    {os.servicoRealizado && <p><strong>Serviço realizado:</strong> {os.servicoRealizado}</p>}
                    {os.pecasUtilizadas && <p><strong>Peças utilizadas:</strong> {os.pecasUtilizadas}</p>}
                  </div>

                  <div className={`border border-slate-300 rounded p-2 flex ${termica ? "flex-col gap-1" : "justify-between items-center"} bg-slate-100 font-bold`}>
                    <span>
                      Forma de pagamento: {os.formaPagamento || "PIX"} ({os.parcelas || 1}x)
                    </span>
                    <span className="text-blue-900">
                      Valor total: R$ {(os.orcamentoCalculado?.valorTotalOrcamento || 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="border border-slate-400 rounded p-2 text-slate-700 space-y-1">
                    <h3 className="font-bold uppercase text-slate-900 border-b border-slate-300 pb-0.5">
                      Garantia de {prazoGarantia} dias — termos e condições
                    </h3>
                    <TermosImpressos texto={cfg.termosGarantiaTexto} />
                  </div>

                  <div className={`grid ${termica ? "grid-cols-1 gap-6" : "grid-cols-2 gap-8"} pt-6 text-center`}>
                    <div>
                      <div className="border-b border-slate-400 pb-6 mb-1"></div>
                      <p className="font-bold text-slate-700">{cfg.nomeLoja}</p>
                      <p className="text-slate-500">Assinatura do técnico / responsável</p>
                    </div>
                    <div>
                      <div className="border-b border-slate-400 pb-6 mb-1"></div>
                      <p className="font-bold text-slate-700">{os.cliente?.nome}</p>
                      <p className="text-slate-500">Assinatura do cliente</p>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-2">
                    <RodapeLojaImpressao cfg={cfg} />
                  </div>
                </div>
              )}
            </ViasImpressao>
          </DocumentoParaImpressao>
        );
      })()}
    </div>
  );
};