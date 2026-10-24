import React, { useState, useEffect } from "react";
import {
  buscarOrdensServico,
  excluirOrdemServico,
  editarOrdemServico,
  buscarFornecedores,
  obterConfiguracoesLojaSincrono,
} from "../services/api";
import { StatusBadge } from "../components/StatusBadge";
import { useOperador } from "../contexts/OperadorContext";
import type { OrdemServico, StatusOS } from "../types";
import { ITENS_CHECKLIST, OPCOES_CHECKLIST, itensVisiveisChecklist, rotuloItemChecklist } from "../utils/checklist";

// Classe das abas dos modais de detalhes e edição
const classeAba = (ativa: boolean) =>
  `px-4 py-2.5 font-bold transition border-b-2 ${
    ativa ? "border-blue-500 text-blue-400 bg-zinc-900/50" : "border-transparent text-zinc-400"
  }`;

// Dados da conta ativa impressos no cabeçalho da OS (a loja principal grava nome, CNPJ, telefone e endereço)
const lerDadosLoja = () => {
  const cfg = obterConfiguracoesLojaSincrono();
  return {
    nomeLoja: cfg.nomeLoja || "Davi.tec",
    subtitulo: cfg.subtitulo || "Assistência Técnica & Microeletrônica Especializada",
    telefone: cfg.telefone,
    cnpjCpf: cfg.cnpj,
    endereco: cfg.endereco,
  };
};

export const HistoricoServicos: React.FC = () => {
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [fornecedoresCadastrados, setFornecedoresCadastrados] = useState<any[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [termoBusca, setTermoBusca] = useState("");

  const [dadosLoja] = useState(lerDadosLoja);

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

  const ordensFiltradas = ordens.filter((os) => {
    if (!os) return false;
    const termo = termoBusca.toLowerCase();
    const numeroOs = os.numero_os ? os.numero_os.toLowerCase() : "";
    const nomeCliente = os.cliente?.nome ? os.cliente.nome.toLowerCase() : "";
    const modeloAparelho = os.aparelho?.modelo
      ? os.aparelho.modelo.toLowerCase()
      : "";

    return (
      numeroOs.includes(termo) ||
      nomeCliente.includes(termo) ||
      modeloAparelho.includes(termo)
    );
  });

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold text-white">
            Histórico Geral de Serviços
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Consulta detalhada, relatórios de consertos e gerenciamento de
            registros.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <input
            type="text"
            placeholder="Buscar cliente, modelo, IMEI ou OS..."
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-white outline-none focus:border-blue-500 w-72"
          />
          <button
            onClick={carregarHistorico}
            className="p-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 rounded-xl text-xs transition"
            title="Atualizar lista"
          >
            🔄
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12 print:hidden">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : ordensFiltradas.length === 0 ? (
        <div className="p-16 text-center space-y-2 bg-zinc-900/50 border border-zinc-800 rounded-2xl print:hidden">
          <h3 className="text-sm font-bold text-zinc-300">
            Nenhuma Ordem Encontrada
          </h3>
          <p className="text-xs text-zinc-500">
            Não existem ordens de serviço salvas para o filtro pesquisado.
          </p>
        </div>
      ) : (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden print:hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-zinc-950/80 text-zinc-400 uppercase border-b border-zinc-800 font-semibold">
                <tr>
                  <th className="p-4">Nº OS</th>
                  <th className="p-4">Data Abertura</th>
                  <th className="p-4">Cliente / Contato</th>
                  <th className="p-4">Aparelho / Modelo</th>
                  <th className="p-4">Pagamento</th>
                  <th className="p-4 text-right">Valor Cobrado</th>
                  <th className="p-4 text-right">Valor Líquido</th>
                  <th className="p-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {ordensFiltradas.map((os) => (
                  <tr
                    key={os.id_os}
                    className="hover:bg-zinc-800/30 transition"
                  >
                    <td className="p-4 font-mono font-bold text-blue-400">
                      {os.numero_os}
                    </td>
                    <td className="p-4 text-zinc-400">
                      {os.data_abertura
                        ? new Date(os.data_abertura).toLocaleDateString("pt-BR")
                        : "-"}
                    </td>
                    <td className="p-4 font-bold text-white">
                      {os.cliente?.nome}
                      <span className="block text-[10px] text-zinc-500 font-normal">
                        {os.cliente?.whatsapp || "-"}
                      </span>
                    </td>
                    <td className="p-4 font-medium text-zinc-200">
                      {os.aparelho?.modelo}
                    </td>
                    <td className="p-4 text-amber-400 font-semibold">
                      {os.formaPagamento || "PIX"}{" "}
                      {os.formaPagamento === "Cartão de Crédito"
                        ? `(${os.parcelas || 1}x)`
                        : ""}
                    </td>
                    <td className="p-4 text-right font-bold text-white">
                      R${" "}
                      {(
                        os.orcamentoCalculado?.valorTotalOrcamento || 0
                      ).toFixed(2)}
                    </td>
                    <td className="p-4 text-right font-bold text-purple-400">
                      R${" "}
                      {(os.valorLiquido !== undefined &&
                      os.valorLiquido !== null
                        ? os.valorLiquido
                        : os.orcamentoCalculado?.valorTotalOrcamento || 0
                      ).toFixed(2)}
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => {
                            setOsSelecionada(os);
                            setAbaModal("detalhes");
                          }}
                          className="px-3 py-1.5 bg-blue-600/25 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-semibold transition"
                        >
                          👁️ Detalhes
                        </button>

                        {pode("excluir_os") && (
                          <button
                            onClick={() => setOsParaExcluir(os)}
                            className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-lg text-xs font-semibold transition"
                            title="Excluir Ordem de Serviço"
                          >
                            🗑️ Excluir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL DETALHES COMPLETO DA OS */}
      {osSelecionada && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
            <div className="p-4 bg-zinc-950 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
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

                <button
                  onClick={() => setOsSelecionada(null)}
                  className="text-zinc-400 hover:text-white text-base font-bold pl-2"
                  title="Fechar"
                >
                  ✕
                </button>
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
                  {ITENS_CHECKLIST.map(({ chave: item, rotulo }) => (
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
          </div>
        </div>
      )}

      {/* TEMPLATE DE IMPRESSÃO */}
      {osParaImprimir && (
        <div className="hidden print:block text-slate-900 font-sans p-6 bg-white leading-relaxed text-left max-w-[210mm] mx-auto text-[11px]">
          <div className="border-b-2 border-slate-900 pb-4 mb-4 flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">
                {dadosLoja.nomeLoja}
              </h1>
              <p className="text-xs text-slate-600 font-semibold">
                {dadosLoja.subtitulo}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                CNPJ: {dadosLoja.cnpjCpf || "Não configurado"} | Tel:{" "}
                {dadosLoja.telefone || "Não configurado"} | End:{" "}
                {dadosLoja.endereco || "Não configurado"}
              </p>
            </div>
            <div className="text-right border-l-2 border-slate-300 pl-4">
              <div className="bg-slate-100 px-4 py-2 rounded-lg border border-slate-300">
                <span className="text-[10px] uppercase font-bold text-slate-500 block">
                  Ordem de Serviço
                </span>
                <span className="text-lg font-black font-mono text-blue-900">
                  #{osParaImprimir.numero_os}
                </span>
              </div>
              <div className="text-[10px] text-slate-600 mt-2 space-y-0.5">
                <p>
                  <strong>Abertura:</strong>{" "}
                  {osParaImprimir.data_abertura
                    ? new Date(osParaImprimir.data_abertura).toLocaleDateString(
                        "pt-BR",
                      )
                    : "-"}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="border border-slate-300 rounded-lg p-3 bg-slate-50/50">
              <h3 className="font-bold uppercase text-slate-700 border-b border-slate-200 pb-1 mb-2 text-xs">
                👤 Dados do Cliente
              </h3>
              <p>
                <strong>Nome:</strong> {osParaImprimir.cliente?.nome}
              </p>
              <p>
                <strong>WhatsApp:</strong>{" "}
                {osParaImprimir.cliente?.whatsapp || "Não informado"}
              </p>
              <p>
                <strong>CPF/CNPJ:</strong>{" "}
                {osParaImprimir.cliente?.cpfCnpj || "Não informado"}
              </p>
            </div>
            <div className="border border-slate-300 rounded-lg p-3 bg-slate-50/50">
              <h3 className="font-bold uppercase text-slate-700 border-b border-slate-200 pb-1 mb-2 text-xs">
                📱 Dados do Aparelho
              </h3>
              <p>
                <strong>Modelo:</strong> {osParaImprimir.aparelho?.modelo}
              </p>
              <p>
                <strong>IMEI / S/N:</strong>{" "}
                {osParaImprimir.aparelho?.imei1 || "Não informado"}
              </p>
              <p>
                <strong>Senha:</strong>{" "}
                {osParaImprimir.aparelho?.senhaDesbloqueio || "Não informada"}
              </p>
            </div>
          </div>

          <div className="border border-slate-300 rounded-lg p-3 mb-4 bg-slate-50/50">
            <h3 className="font-bold uppercase text-slate-700 border-b border-slate-200 pb-1 mb-1.5 text-xs">
              📋 Relato & Diagnóstico Técnico
            </h3>
            <p className="mb-1">
              <strong>Defeito Relatado:</strong>{" "}
              {osParaImprimir.defeitoRelatado || "Sem descrição"}
            </p>
            {osParaImprimir.diagnostico && (
              <p className="mb-1">
                <strong>Diagnóstico Técnico:</strong>{" "}
                {osParaImprimir.diagnostico}
              </p>
            )}
            {osParaImprimir.servicoRealizado && (
              <p className="mb-1">
                <strong>Serviço Realizado:</strong>{" "}
                {osParaImprimir.servicoRealizado}
              </p>
            )}
            {osParaImprimir.pecasUtilizadas && (
              <p>
                <strong>Peças Utilizadas:</strong>{" "}
                {osParaImprimir.pecasUtilizadas}
              </p>
            )}
          </div>

          <div className="border border-slate-300 rounded-lg p-3 mb-4 flex justify-between items-center bg-slate-100 font-bold">
            <div>
              <span>
                Forma de Pagamento:{" "}
                {osParaImprimir.formaPagamento || "PIX"} (
                {osParaImprimir.parcelas || 1}x)
              </span>
            </div>
            <div className="text-sm text-blue-900">
              Valor Total: R${" "}
              {(
                osParaImprimir.orcamentoCalculado?.valorTotalOrcamento || 0
              ).toFixed(2)}
            </div>
          </div>

          <div className="border border-slate-400 rounded-lg p-3 mb-6 bg-white text-[9px] text-slate-700 leading-tight space-y-1.5">
            <h3 className="font-bold uppercase text-slate-900 border-b border-slate-300 pb-1 text-[10px]">
              ⚖️ Termos de Garantia, Riscos e Condições de Serviço
            </h3>
            <p>
              <strong>1. Prazo e Cobertura de Garantia:</strong> A garantia
              legal é de 90 dias (conforme CDC) cobrindo exclusivamente a peça
              substituída e/ou o serviço executado.
            </p>
            <p>
              <strong>2. Exclusão:</strong> Perde validade por mau uso, quedas,
              umidade, violação de selos ou reparo por terceiros.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 pt-6 mt-6 border-t border-slate-300 text-center">
            <div>
              <div className="border-b border-slate-400 pb-8 mb-1"></div>
              <p className="font-bold text-slate-700">{dadosLoja.nomeLoja}</p>
              <p className="text-[10px] text-slate-500">
                Assinatura do Técnico / Responsável
              </p>
            </div>
            <div>
              <div className="border-b border-slate-400 pb-8 mb-1"></div>
              <p className="font-bold text-slate-700">
                {osParaImprimir.cliente?.nome}
              </p>
              <p className="text-[10px] text-slate-500">
                Assinatura do Cliente
              </p>
            </div>
          </div>

          <div className="text-center text-[9px] text-slate-400 mt-8 pt-2 border-t border-slate-200">
            Documento gerado por Davi.tec — Gestão Técnica Especializada
          </div>
        </div>
      )}
    </div>
  );
};