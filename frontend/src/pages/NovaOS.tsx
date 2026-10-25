import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  buscarClientes,
  buscarFornecedores,
  buscarModelosAparelhos,
  buscarServicosCadastrados,
  criarOrdemServico,
  calcularDataPrevistaEntrega,
  extrairDiasGarantia,
  obterConfiguracoesLojaSincrono,
  obterPrazoGarantiaConfiguradoLoja,
  obterTaxaMaquininha,
  parcelasMaximasMaquininha,
  type Maquininha,
} from '../services/api';
import { CertidaoGarantia } from '../components/CertidaoGarantia';
import { CampoModeloAparelho } from '../components/CampoModeloAparelho';
import { CamposLegaisOS } from '../components/CamposLegaisOS';
import {
  type DadosLegaisOS,
  GARANTIA_LEGAL_DIAS,
  dadosLegaisParaChecklist,
  faltaAutorizacaoPeca,
} from '../utils/conformidade';
import type { AbaSistema } from '../services/acesso';
import type { OrdemServico } from '../types';
import { OPCOES_CHECKLIST, criarChecklistPadrao, itensChecklistAtivos } from '../utils/checklist';
import { formatarValor } from '../utils/formatadores';
import { enviarMensagemWhatsapp } from '../utils/whatsapp';

type EtapaMobile = 1 | 2 | 3 | 4;
const ETAPAS_MOBILE: { n: EtapaMobile; titulo: string; proxima: string }[] = [
  { n: 1, titulo: 'Cliente e garantia', proxima: 'Continuar para aparelho' },
  { n: 2, titulo: 'Aparelho, defeito e prazos', proxima: 'Continuar para valores' },
  { n: 3, titulo: 'Orçamento e pagamento', proxima: 'Continuar para checklist' },
  { n: 4, titulo: 'Checklist e confirmação', proxima: '' },
];

interface Props {
  onNavigate?: (tab: AbaSistema) => void;
}

// ================= REGRAS DE TAXAS DE MAQUINETA =================
const FORMAS_SEM_TAXA = ['Dinheiro', 'PIX'];

const ehCartao = (forma: string) => forma === 'Cartão de crédito' || forma === 'Cartão de débito';

// Taxas da maquininha escolhida (Configurações › Taxas); sem maquininha, usa a padrão
const obterTaxaPadrao = (forma: string, p: number = 1, maquininhaId?: string): number =>
  FORMAS_SEM_TAXA.includes(forma) ? 0 : obterTaxaMaquininha(forma, p, maquininhaId);

/** Ao trocar a forma, as parcelas ou a maquininha: aplica a taxa dela e força 1x fora do crédito. */
const aplicarRegraTaxa = (
  forma: string,
  parcelas: number,
  maquininhaId: string,
  setTaxa: (v: number) => void,
  setParcelas: (v: number) => void,
) => {
  if (FORMAS_SEM_TAXA.includes(forma) || forma === 'Cartão de débito') {
    setTaxa(obterTaxaPadrao(forma, 1, maquininhaId));
    setParcelas(1);
  } else if (forma === 'Cartão de crédito') {
    const maximo = parcelasMaximasMaquininha(maquininhaId);
    if (parcelas > maximo) {
      setParcelas(maximo); // o efeito roda de novo com a parcela ajustada e aplica a taxa dela
      return;
    }
    setTaxa(obterTaxaPadrao(forma, parcelas, maquininhaId));
  }
};

/** Opções de parcelas da maquininha (1x até o parcelamento máximo dela), com a taxa de cada uma. */
const opcoesParcelas = (maquininhas: Maquininha[], maquininhaId: string) => {
  const m = maquininhas.find((x) => x.id === maquininhaId) || maquininhas[0];
  return (m?.taxas.credito || [0]).map((taxa, i) => ({
    parcelas: i + 1,
    rotulo: `${i + 1}x${i === 0 ? ' (à vista)' : ''} · taxa ${taxa.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`,
  }));
};

/** Escolha da maquininha que passou o cartão. Com uma só, mostra qual é usada. */
const SeletorMaquininha: React.FC<{ valor: string; onChange: (id: string) => void; maquininhas: Maquininha[] }> = ({
  valor,
  onChange,
  maquininhas,
}) => (
  <div>
    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">MAQUININHA</label>
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      disabled={maquininhas.length <= 1}
      className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition cursor-pointer disabled:cursor-default disabled:text-zinc-300"
    >
      {maquininhas.map((m) => (
        <option key={m.id} value={m.id}>
          {m.nome}
          {m.operadora ? ` (${m.operadora})` : ''}
        </option>
      ))}
    </select>
  </div>
);

const nomeMaquininha = (maquininhas: Maquininha[], id: string) => maquininhas.find((m) => m.id === id)?.nome || '';

// Data local (toISOString usava o horário universal: depois das 21h já marcava o dia seguinte)
const dataHojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Data prevista sugerida pelo prazo de entrega em dias úteis (Configurações › Operacional); 0 = não sugere
const dataPrevistaSugerida = () => {
  const dias = obterConfiguracoesLojaSincrono().prazoEntregaDiasUteis;
  return dias > 0 ? calcularDataPrevistaEntrega(dias) : '';
};

const checklistInicial = () => criarChecklistPadrao(obterConfiguracoesLojaSincrono().checklistItensAtivos);

export const NovaOS: React.FC<Props> = ({ onNavigate }) => {
  const [listaClientes, setListaClientes] = useState<any[]>([]);
  const [listaFornecedores, setListaFornecedores] = useState<any[]>([]);
  const [listaServicos, setListaServicos] = useState<any[]>([]);
  // Modelos já atendidos pela loja: aparecem primeiro nas sugestões do campo de aparelho
  const [modelosDaLoja, setModelosDaLoja] = useState<string[]>([]);

  // Topo: Cobertura
  const [possuiGarantia, setPossuiGarantia] = useState<boolean>(true);
  const [prazoGarantiaDias, setPrazoGarantiaDias] = useState<number>(() => obterPrazoGarantiaConfiguradoLoja());
  // Peça empregada, valor das peças e aprovação do orçamento (CDC, arts. 21, 39, VI, 40 e 70)
  const [dadosLegais, setDadosLegais] = useState<DadosLegaisOS>({});

  // Card 01: Cliente
  const [idClienteSelecionado, setIdClienteSelecionado] = useState('');
  const [nomeCliente, setNomeCliente] = useState('');
  const [whatsappCliente, setWhatsappCliente] = useState('');
  const [cpfCnpjCliente, setCpfCnpjCliente] = useState('');

  // Card 02: Aparelho e datas
  const [modeloAparelho, setModeloAparelho] = useState('');
  const [imeiAparelho, setImeiAparelho] = useState('');
  const [senhaAparelho, setSenhaAparelho] = useState('');
  const [dataAbertura, setDataAbertura] = useState(dataHojeISO);
  const [dataPrevista, setDataPrevista] = useState(dataPrevistaSugerida);

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
  const [taxaMaquinetaPercentual1, setTaxaMaquinetaPercentual1] = useState<number | ''>(() => obterTaxaPadrao('Cartão de crédito', 1));

  // Maquininhas da loja e a escolhida em cada forma de pagamento (começa pela padrão)
  const [{ maquininhas, maquininhaPadraoId }] = useState(() => {
    const cfg = obterConfiguracoesLojaSincrono();
    return { maquininhas: cfg.maquininhas, maquininhaPadraoId: cfg.maquininhaPadraoId };
  });
  const [maquininha1, setMaquininha1] = useState(maquininhaPadraoId);
  const [maquininha2, setMaquininha2] = useState(maquininhaPadraoId);

  // Forma 2 (quando dividirPagamento === true)
  const [formaPagamento2, setFormaPagamento2] = useState('Dinheiro');
  const [valorPg2, setValorPg2] = useState<number | ''>('');
  const [parcelas2, setParcelas2] = useState(1);
  const [taxaMaquinetaPercentual2, setTaxaMaquinetaPercentual2] = useState<number | ''>(0);

  // Checklist de Entrada
  const [mostrarChecklist, setMostrarChecklist] = useState(false);
  const [checklist, setChecklist] = useState<Record<string, string>>(checklistInicial);
  // Itens exibidos: os ativos nas Configurações
  const [itensChecklist] = useState(() => itensChecklistAtivos(obterConfiguracoesLojaSincrono().checklistItensAtivos));
  // Chave PIX da loja, exibida quando uma das formas de pagamento for PIX
  const [pixLoja] = useState(() => {
    const cfg = obterConfiguracoesLojaSincrono();
    return { chave: cfg.chavePix.trim(), favorecido: cfg.favorecidoPix.trim() };
  });

  const [carregando, setCarregando] = useState(false);
  const [osCriadaSucesso, setOsCriadaSucesso] = useState<{ idOs: string; numeroOs: string; dadosCompletos: OrdemServico } | null>(null);
  const [osParaImprimir, setOsParaImprimir] = useState<OrdemServico | null>(null);

  // Celular: preenchimento em etapas (no desktop todos os cards ficam visíveis)
  const [etapa, setEtapa] = useState<EtapaMobile>(1);
  const topoEtapasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // As funções de busca já tratam erros e devolvem lista vazia
    Promise.all([buscarClientes(), buscarFornecedores(), buscarServicosCadastrados(), buscarModelosAparelhos()]).then(
      ([clientes, fornecedores, servicos, modelos]) => {
        setListaClientes(clientes);
        setListaFornecedores(fornecedores);
        setListaServicos(servicos);
        setModelosDaLoja(modelos);
      },
    );
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
      // Não sobrescreve o relato do cliente; só preenche se ainda estiver vazio
      setDefeitoRelatado((atual) => (atual.trim() ? atual : serv.nome));
      if (serv.preco_sugerido || serv.preco) {
        setValorServico(Number(serv.preco_sugerido || serv.preco));
      }
      const diasServico = extrairDiasGarantia(serv.garantia_padrao ?? serv.garantiaPadrao ?? serv.prazo_garantia);
      if (diasServico !== null) {
        if (diasServico === 0) {
          setPossuiGarantia(false);
        } else {
          setPossuiGarantia(true);
          setPrazoGarantiaDias(Math.max(GARANTIA_LEGAL_DIAS, diasServico));
        }
      }
    }
  };

  // Ajuste automático de taxa e parcelas conforme a forma de pagamento
  useEffect(() => {
    aplicarRegraTaxa(formaPagamento1, parcelas1, maquininha1, setTaxaMaquinetaPercentual1, setParcelas1);
  }, [formaPagamento1, parcelas1, maquininha1]);

  useEffect(() => {
    aplicarRegraTaxa(formaPagamento2, parcelas2, maquininha2, setTaxaMaquinetaPercentual2, setParcelas2);
  }, [formaPagamento2, parcelas2, maquininha2]);

  // Maquininha registrada em cada pagamento com cartão (fica no JSON de pagamentos da OS)
  const dadosMaquininha = (forma: string, id: string) =>
    ehCartao(forma) ? { maquininhaId: id, maquininha: nomeMaquininha(maquininhas, id) } : {};

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
  const numTaxa1 = FORMAS_SEM_TAXA.includes(formaPagamento1) ? 0 : (Number(taxaMaquinetaPercentual1) || 0);
  const valorTaxa1 = (numValorPg1 * numTaxa1) / 100;
  const liquidoPg1 = Math.max(0, numValorPg1 - valorTaxa1);

  // Taxa individual Forma 2 (nunca cobra sobre Dinheiro ou PIX)
  const numTaxa2 = FORMAS_SEM_TAXA.includes(formaPagamento2) ? 0 : (Number(taxaMaquinetaPercentual2) || 0);
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
          ...dadosMaquininha(formaPagamento1, maquininha1),
        },
      ];

      return {
        formaPagamentoTexto: descForma,
        parcelasFinal: formaPagamento1 === 'Cartão de crédito' ? parcelas1 : 1,
        pagamentosArray: pgs,
      };
    }

    // Texto curto (coluna forma_pagamento tem limite de 50 caracteres); valores de cada forma ficam em pagamentosArray
    const desc1 = formaPagamento1 === 'Cartão de crédito' && parcelas1 > 1 ? `${formaPagamento1} (${parcelas1}x)` : formaPagamento1;

    const desc2 = formaPagamento2 === 'Cartão de crédito' && parcelas2 > 1 ? `${formaPagamento2} (${parcelas2}x)` : formaPagamento2;

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
        ...dadosMaquininha(formaPagamento1, maquininha1),
      },
      {
        id: 'pg_2',
        forma: formaPagamento2,
        valor: numValorPg2,
        parcelas: formaPagamento2 === 'Cartão de crédito' ? parcelas2 : 1,
        taxaPercentual: numTaxa2,
        valorTaxa: valorTaxa2,
        valorLiquido: liquidoPg2,
        ...dadosMaquininha(formaPagamento2, maquininha2),
      },
    ];

    return {
      formaPagamentoTexto: `${desc1} + ${desc2}`,
      parcelasFinal,
      pagamentosArray: pgs,
    };
  };

  // Serviço do catálogo escolhido (salvo no JSON checklist_entrada, sem coluna nova no banco)
  const servicoSelecionado = listaServicos.find(
    (s) => servicoPadraoId && (s.id_servico === servicoPadraoId || s.id === servicoPadraoId),
  );
  const dadosServicoCatalogo = servicoSelecionado
    ? { __servicoId: servicoPadraoId, __servicoNome: servicoSelecionado.nome }
    : {};

  // Payload único para "Criar ordem" e "Salvar rascunho".
  // Os textos padrão só entram no rascunho: na criação os campos obrigatórios já foram validados.
  const montarPayload = () => {
    const { formaPagamentoTexto, parcelasFinal, pagamentosArray } = gerarDadosPagamento();
    // Garantia da loja nunca abaixo da legal; "só garantia legal" grava 0 e vale os 90 dias do CDC
    const prazoFinal = possuiGarantia
      ? Math.max(GARANTIA_LEGAL_DIAS, Number(prazoGarantiaDias) || obterPrazoGarantiaConfiguradoLoja())
      : 0;
    const defeito = defeitoRelatado.trim();

    return {
      cliente: {
        idCliente: idClienteSelecionado || undefined,
        nome: nomeCliente.trim() || 'Cliente a Definir',
        whatsapp: whatsappCliente.trim(),
        cpfCnpj: cpfCnpjCliente.trim(),
      },
      aparelho: {
        modelo: modeloAparelho.trim() || 'Aparelho em Avaliação',
        imei1: imeiAparelho.trim(),
        senhaDesbloqueio: senhaAparelho.trim(),
      },
      defeitoRelatado: defeito || 'Defeito a diagnosticar',
      diagnostico: diagnostico.trim(),
      servicoRealizado: servicoSelecionado?.nome || defeito || 'Aguardando diagnóstico',
      observacoes: (diagnostico || observacoes).trim(),
      dataAbertura,
      dataPrevistaEntrega: dataPrevista || undefined,
      formaPagamento: formaPagamentoTexto,
      parcelas: parcelasFinal,
      valorLiquido: liquidoRecebido,
      possuiGarantia,
      prazoGarantiaDias: prazoFinal,
      checklistEntrada: {
        ...checklist,
        ...dadosServicoCatalogo,
        __pagamentos: pagamentosArray,
        __possuiGarantia: possuiGarantia,
        __prazoGarantiaDias: prazoFinal,
        ...dadosLegaisParaChecklist(dadosLegais),
      },
      pagamentos: pagamentosArray,
      orcamentoCalculado: {
        subtotalServicos: numPrecoServico,
        descontoGeralAplicado: descontoCalculado,
        tipoDesconto,
        descontoInput: numDescontoInput,
        valorTotalOrcamento: valorCobrado,
        custoPeca: numCustoPeca,
        freteReal: numFreteReal,
        fornecedorPeca,
        lucroTotalEstimadoInterno: lucroEstimado,
        totalTaxaMaquineta,
        pagamentos: pagamentosArray,
      },
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

    if (faltaAutorizacaoPeca(dadosLegais)) {
      alert('Peça não original ou usada só pode ser empregada com autorização do cliente (CDC, arts. 21 e 70). Marque a autorização ou troque o tipo de peça.');
      return;
    }

    if ((dadosLegais.valorPecas || 0) > valorCobrado) {
      alert('O valor das peças não pode ser maior que o valor cobrado.');
      return;
    }

    // Validação de pagamentos combinados
    if (dividirPagamento) {
      if (numValorPg1 <= 0 || numValorPg2 <= 0) {
        alert('Ao dividir o pagamento, informe valores maiores que zero para as duas formas.');
        return;
      }
      if (Math.abs(saldoRestante) >= 0.01) {
        alert(`A soma das formas de pagamento (R$ ${formatarValor(somaPagamentos)}) deve ser exatamente igual ao total cobrado (R$ ${formatarValor(valorCobrado)}).\n\nAjuste a diferença de R$ ${formatarValor(Math.abs(saldoRestante))} antes de prosseguir.`);
        return;
      }
    }

    setCarregando(true);
    try {
      const payload = montarPayload();
      const resultado = await criarOrdemServico(payload);

      // Dados para o comprovante impresso (mesmo formato de OrdemServico usado no Histórico)
      setOsCriadaSucesso({
        idOs: resultado.idOs,
        numeroOs: resultado.numeroOs,
        dadosCompletos: {
          ...payload,
          id_os: resultado.idOs,
          numero_os: resultado.numeroOs,
          status_os: 'AGUARDANDO_AVALIACAO',
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
    if (!nomeCliente.trim() && !modeloAparelho.trim()) {
      alert('Para salvar como rascunho, preencha ao menos o Nome do Cliente ou o Modelo do Aparelho.');
      return;
    }

    setCarregando(true);
    try {
      const resultado = await criarOrdemServico({ ...montarPayload(), status_os: 'RASCUNHO' });

      alert(`✅ Rascunho da OS ${resultado.numeroOs} salvo com sucesso!\n\nEle está disponível na aba "Rascunhos / Em Definição" no histórico de ordens.`);
      handleLimparFormulario();
      onNavigate?.('historico');
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
    setDataAbertura(dataHojeISO());
    setDataPrevista(dataPrevistaSugerida());
    setPossuiGarantia(true);
    setDadosLegais({});
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
    setMaquininha1(maquininhaPadraoId);
    setMaquininha2(maquininhaPadraoId);
    setTaxaMaquinetaPercentual1(obterTaxaPadrao('Cartão de crédito', 1, maquininhaPadraoId));
    setValorPg1('');

    setFormaPagamento2('Dinheiro');
    setParcelas2(1);
    setTaxaMaquinetaPercentual2(0);
    setValorPg2('');

    setChecklist(checklistInicial());
    setOsCriadaSucesso(null);
    setEtapa(1);
  };

  // ================= ETAPAS (SOMENTE CELULAR) =================
  /** Mensagem do que falta para sair da etapa, ou null se ela está completa. */
  const pendenciaEtapa = (n: EtapaMobile): string | null => {
    if (n === 1 && !nomeCliente.trim()) return 'Informe o Nome do Cliente (*) para continuar.';
    if (n === 2 && (!modeloAparelho.trim() || !defeitoRelatado.trim())) return 'Informe o Modelo do Aparelho (*) e o Defeito Relatado (*) para continuar.';
    if (n === 3 && numPrecoServico <= 0) return 'Informe o Valor do Serviço (*) para continuar.';
    return null;
  };

  const irParaEtapa = (destino: EtapaMobile) => {
    // Voltar é livre; avançar exige as etapas intermediárias completas
    for (let n = etapa; n < destino; n++) {
      const pendencia = pendenciaEtapa(n as EtapaMobile);
      if (pendencia) {
        alert(pendencia);
        setEtapa(n as EtapaMobile);
        return;
      }
    }
    setEtapa(destino);
    // O conteúdo rola dentro do <main> do Layout, não da janela
    requestAnimationFrame(() => {
      topoEtapasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  /** Esconde o card no celular quando ele não é da etapa atual; no desktop sempre aparece. */
  const classeEtapa = (n: EtapaMobile) => (etapa === n ? '' : 'hidden md:block');

  const enviarFormulario = (e: React.FormEvent) => {
    // Enter num campo do celular avança a etapa em vez de tentar criar a OS
    const ehCelular = !window.matchMedia('(min-width: 768px)').matches;
    if (ehCelular && etapa < 4) {
      e.preventDefault();
      irParaEtapa((etapa + 1) as EtapaMobile);
      return;
    }
    handleSubmit(e);
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

      <form onSubmit={enviarFormulario} className="space-y-6">
        {/* ================= PROGRESSO DAS ETAPAS (SOMENTE CELULAR) ================= */}
        <div ref={topoEtapasRef} className="md:hidden scroll-mt-4 bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-bold text-white truncate">{ETAPAS_MOBILE[etapa - 1].titulo}</p>
            <span className="text-[11px] font-semibold text-zinc-400 whitespace-nowrap">Etapa {etapa} de 4</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {ETAPAS_MOBILE.map(({ n, titulo }) => (
              <button
                key={n}
                type="button"
                onClick={() => irParaEtapa(n)}
                aria-label={`Etapa ${n}: ${titulo}`}
                aria-current={etapa === n ? 'step' : undefined}
                className="py-1.5"
              >
                <span className={`block h-1.5 rounded-full transition-colors ${n <= etapa ? 'bg-blue-500' : 'bg-zinc-800'}`} />
              </button>
            ))}
          </div>
        </div>

        {/* ================= BARRA DE COBERTURA (GARANTIA) ================= */}
        <div className={classeEtapa(1)}>
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold text-white tracking-wide uppercase">Cobertura de garantia:</span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
              possuiGarantia
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700'
            }`}>
              {possuiGarantia ? `Garantia da loja (${prazoGarantiaDias} dias)` : `Garantia legal (${GARANTIA_LEGAL_DIAS} dias)`}
            </span>

            {/* Seletor/Input de Prazo Individual da OS (translúcido e desabilitado se Sem Garantia) */}
            <div className={`flex items-center space-x-2 transition-all duration-200 ${
              possuiGarantia ? 'opacity-100' : 'opacity-30 pointer-events-none select-none'
            }`}>
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                Prazo (dias):
              </label>
              <input
                type="number"
                min={GARANTIA_LEGAL_DIAS}
                disabled={!possuiGarantia}
                value={possuiGarantia ? prazoGarantiaDias : GARANTIA_LEGAL_DIAS}
                onChange={(e) => setPrazoGarantiaDias(Number(e.target.value) || 0)}
                // Nunca abaixo dos 90 dias da garantia legal (CDC, art. 26, II)
                onBlur={() => setPrazoGarantiaDias((p) => Math.max(GARANTIA_LEGAL_DIAS, Number(p) || 0))}
                className={`w-20 px-2.5 py-1 bg-[#080c14] border border-zinc-800 rounded-xl text-xs text-white font-bold text-center outline-none focus:border-blue-500 ${
                  possuiGarantia ? '' : 'cursor-not-allowed text-zinc-500'
                }`}
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                setPossuiGarantia(true);
                if (!prazoGarantiaDias || prazoGarantiaDias <= 0) {
                  setPrazoGarantiaDias(obterPrazoGarantiaConfiguradoLoja());
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                possuiGarantia ? 'bg-blue-600 text-white font-bold' : 'bg-zinc-900 text-zinc-400 hover:text-white'
              }`}
            >
              Garantia da loja
            </button>
            <button
              type="button"
              onClick={() => setPossuiGarantia(false)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                !possuiGarantia ? 'bg-zinc-700 text-white font-bold' : 'bg-zinc-900 text-zinc-400 hover:text-white'
              }`}
            >
              Só garantia legal
            </button>
          </div>
        </div>
        </div>

        {/* ================= CARD 01: DADOS DO CLIENTE ================= */}
        <div className={`bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-6 space-y-4 shadow-sm ${classeEtapa(1)}`}>
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
        <div className={`bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-6 space-y-4 shadow-sm ${classeEtapa(2)}`}>
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
              <CampoModeloAparelho
                valor={modeloAparelho}
                onChange={setModeloAparelho}
                modelosDaLoja={modelosDaLoja}
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 pt-2">
            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                SERVIÇO A REALIZAR (CATÁLOGO)
              </label>
              <select
                value={servicoPadraoId}
                onChange={handleSelecionarServico}
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition cursor-pointer"
              >
                <option value="">
                  {listaServicos.length > 0 ? 'Selecione um serviço cadastrado...' : 'Nenhum serviço cadastrado'}
                </option>
                {listaServicos.map((s) => (
                  <option key={s.id_servico || s.id} value={s.id_servico || s.id}>
                    {s.nome} — R$ {Number(s.preco_sugerido || s.preco || 0).toFixed(2)}
                  </option>
                ))}
              </select>
              {servicoSelecionado && (
                <p className="text-[11px] text-blue-400 mt-1.5">
                  Valor e garantia do serviço aplicados em "Custos, Desconto e Pagamento".
                </p>
              )}
            </div>

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
        <div className={`bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-6 space-y-5 shadow-sm ${classeEtapa(3)}`}>
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

          {/* Linha: Custos de Peça, Frete, Fornecedor, Desconto e Preço Base */}
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

          <CamposLegaisOS valor={dadosLegais} onChange={setDadosLegais} valorTotal={valorCobrado} />

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
            {!dividirPagamento && ehCartao(formaPagamento1) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="sm:col-span-2">
                  <SeletorMaquininha valor={maquininha1} onChange={setMaquininha1} maquininhas={maquininhas} />
                </div>
              </div>
            )}

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

                {/* Parcelas: 100% visível quando Cartão de crédito; translúcido, inselecionável e desabilitado nas demais */}
                <div className={`transition-all duration-200 ${
                  formaPagamento1 === 'Cartão de crédito'
                    ? 'opacity-100'
                    : 'opacity-30 pointer-events-none select-none'
                }`}>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                    QUANTIDADE DE PARCELAS {formaPagamento1 !== 'Cartão de crédito' && <span className="text-[10px] text-zinc-500 font-normal lowercase">(à vista)</span>}
                  </label>
                  <select
                    disabled={formaPagamento1 !== 'Cartão de crédito'}
                    value={formaPagamento1 === 'Cartão de crédito' ? parcelas1 : 1}
                    onChange={(e) => setParcelas1(Number(e.target.value))}
                    className={`w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition ${
                      formaPagamento1 === 'Cartão de crédito' ? 'cursor-pointer' : 'cursor-not-allowed text-zinc-500'
                    }`}
                  >
                    {opcoesParcelas(maquininhas, maquininha1).map((o) => (
                      <option key={o.parcelas} value={o.parcelas}>
                        {o.rotulo}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Taxa da Maquineta: 100% visível para Cartão; translúcido, inselecionável e desabilitado para Dinheiro e PIX */}
                <div className={`transition-all duration-200 ${
                  formaPagamento1 === 'Cartão de crédito' || formaPagamento1 === 'Cartão de débito'
                    ? 'opacity-100'
                    : 'opacity-30 pointer-events-none select-none'
                }`}>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                    TAXA DA MAQUINETA (%) {formaPagamento1 !== 'Cartão de crédito' && formaPagamento1 !== 'Cartão de débito' && <span className="text-[10px] text-zinc-500 font-normal lowercase">(isento)</span>}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={formaPagamento1 !== 'Cartão de crédito' && formaPagamento1 !== 'Cartão de débito'}
                    value={formaPagamento1 === 'Cartão de crédito' || formaPagamento1 === 'Cartão de débito' ? taxaMaquinetaPercentual1 : 0}
                    onChange={(e) => setTaxaMaquinetaPercentual1(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0.00"
                    className={`w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition ${
                      formaPagamento1 === 'Cartão de crédito' || formaPagamento1 === 'Cartão de débito' ? '' : 'cursor-not-allowed text-zinc-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                    LÍQUIDO RECEBIDO (APÓS TAXA)
                  </label>
                  <div className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs font-bold text-emerald-400">
                    R$ {formatarValor(liquidoRecebido)}
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
                      Total devido: <strong className="font-bold text-white">R$ {formatarValor(valorCobrado)}</strong> |
                      Distribuído: <strong className="font-bold text-white">R$ {formatarValor(somaPagamentos)}</strong>
                    </span>
                  </div>
                  <div>
                    {Math.abs(saldoRestante) < 0.01 && numValorPg1 > 0 && numValorPg2 > 0 ? (
                      <span className="font-bold text-emerald-400">✓ 100% distribuído corretamente</span>
                    ) : saldoRestante > 0 ? (
                      <span className="font-bold text-amber-400">Falta distribuir: R$ {formatarValor(saldoRestante)}</span>
                    ) : (
                      <span className="font-bold text-rose-400">Excedeu o total em: R$ {formatarValor(Math.abs(saldoRestante))}</span>
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
                        Líquido: <strong className="text-emerald-400">R$ {formatarValor(liquidoPg1)}</strong>
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

                      {/* Parcelas: translúcido e inselecionável quando não for cartão de crédito */}
                      <div className={`transition-all duration-200 ${
                        formaPagamento1 === 'Cartão de crédito'
                          ? 'opacity-100'
                          : 'opacity-30 pointer-events-none select-none'
                      }`}>
                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                          PARCELAS {formaPagamento1 !== 'Cartão de crédito' && <span className="text-[10px] text-zinc-500 font-normal lowercase">(à vista)</span>}
                        </label>
                        <select
                          disabled={formaPagamento1 !== 'Cartão de crédito'}
                          value={formaPagamento1 === 'Cartão de crédito' ? parcelas1 : 1}
                          onChange={(e) => setParcelas1(Number(e.target.value))}
                          className={`w-full px-3 py-2 bg-[#0c101a] border border-zinc-800 rounded-xl text-xs text-white outline-none focus:border-blue-500 ${
                            formaPagamento1 === 'Cartão de crédito' ? 'cursor-pointer' : 'cursor-not-allowed text-zinc-500'
                          }`}
                        >
                          {opcoesParcelas(maquininhas, maquininha1).map((o) => (
                            <option key={o.parcelas} value={o.parcelas}>
                              {o.rotulo}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Taxa Maquineta: translúcida e inselecionável quando não for cartão */}
                      <div className={`transition-all duration-200 ${
                        formaPagamento1 === 'Cartão de crédito' || formaPagamento1 === 'Cartão de débito'
                          ? 'opacity-100'
                          : 'opacity-30 pointer-events-none select-none'
                      }`}>
                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                          TAXA MAQUINETA (%) {formaPagamento1 !== 'Cartão de crédito' && formaPagamento1 !== 'Cartão de débito' && <span className="text-[10px] text-zinc-500 font-normal lowercase">(isento)</span>}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          disabled={formaPagamento1 !== 'Cartão de crédito' && formaPagamento1 !== 'Cartão de débito'}
                          value={formaPagamento1 === 'Cartão de crédito' || formaPagamento1 === 'Cartão de débito' ? taxaMaquinetaPercentual1 : 0}
                          onChange={(e) => setTaxaMaquinetaPercentual1(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="0.00"
                          className={`w-full px-3 py-2 bg-[#0c101a] border border-zinc-800 rounded-xl text-xs text-white outline-none focus:border-blue-500 ${
                            formaPagamento1 === 'Cartão de crédito' || formaPagamento1 === 'Cartão de débito' ? '' : 'cursor-not-allowed text-zinc-500'
                          }`}
                        />
                      </div>

                      {/* Maquininha usada no cartão (taxas de Configurações › Taxas) */}
                      {ehCartao(formaPagamento1) && (
                        <div className="sm:col-span-2">
                          <SeletorMaquininha valor={maquininha1} onChange={setMaquininha1} maquininhas={maquininhas} />
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
                        Líquido: <strong className="text-emerald-400">R$ {formatarValor(liquidoPg2)}</strong>
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

                      {/* Parcelas: translúcido e inselecionável quando não for cartão de crédito */}
                      <div className={`transition-all duration-200 ${
                        formaPagamento2 === 'Cartão de crédito'
                          ? 'opacity-100'
                          : 'opacity-30 pointer-events-none select-none'
                      }`}>
                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                          PARCELAS {formaPagamento2 !== 'Cartão de crédito' && <span className="text-[10px] text-zinc-500 font-normal lowercase">(à vista)</span>}
                        </label>
                        <select
                          disabled={formaPagamento2 !== 'Cartão de crédito'}
                          value={formaPagamento2 === 'Cartão de crédito' ? parcelas2 : 1}
                          onChange={(e) => setParcelas2(Number(e.target.value))}
                          className={`w-full px-3 py-2 bg-[#0c101a] border border-zinc-800 rounded-xl text-xs text-white outline-none focus:border-blue-500 ${
                            formaPagamento2 === 'Cartão de crédito' ? 'cursor-pointer' : 'cursor-not-allowed text-zinc-500'
                          }`}
                        >
                          {opcoesParcelas(maquininhas, maquininha2).map((o) => (
                            <option key={o.parcelas} value={o.parcelas}>
                              {o.rotulo}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Taxa Maquineta: translúcida e inselecionável quando não for cartão */}
                      <div className={`transition-all duration-200 ${
                        formaPagamento2 === 'Cartão de crédito' || formaPagamento2 === 'Cartão de débito'
                          ? 'opacity-100'
                          : 'opacity-30 pointer-events-none select-none'
                      }`}>
                        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                          TAXA MAQUINETA (%) {formaPagamento2 !== 'Cartão de crédito' && formaPagamento2 !== 'Cartão de débito' && <span className="text-[10px] text-zinc-500 font-normal lowercase">(isento)</span>}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          disabled={formaPagamento2 !== 'Cartão de crédito' && formaPagamento2 !== 'Cartão de débito'}
                          value={formaPagamento2 === 'Cartão de crédito' || formaPagamento2 === 'Cartão de débito' ? taxaMaquinetaPercentual2 : 0}
                          onChange={(e) => setTaxaMaquinetaPercentual2(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="0.00"
                          className={`w-full px-3 py-2 bg-[#0c101a] border border-zinc-800 rounded-xl text-xs text-white outline-none focus:border-blue-500 ${
                            formaPagamento2 === 'Cartão de crédito' || formaPagamento2 === 'Cartão de débito' ? '' : 'cursor-not-allowed text-zinc-500'
                          }`}
                        />
                      </div>

                      {/* Maquininha usada no cartão (taxas de Configurações › Taxas) */}
                      {ehCartao(formaPagamento2) && (
                        <div className="sm:col-span-2">
                          <SeletorMaquininha valor={maquininha2} onChange={setMaquininha2} maquininhas={maquininhas} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Chave PIX da loja para o cliente pagar (Configurações › Taxas) */}
            {pixLoja.chave && (formaPagamento1 === 'PIX' || (dividirPagamento && formaPagamento2 === 'PIX')) && (
              <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-xs">
                <div className="min-w-0">
                  <span className="block text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Chave PIX da loja</span>
                  <span className="font-mono font-bold text-white break-all">{pixLoja.chave}</span>
                  {pixLoja.favorecido && <span className="text-zinc-400"> · {pixLoja.favorecido}</span>}
                </div>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(pixLoja.chave)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition shrink-0"
                >
                  Copiar chave
                </button>
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
                  R$ {formatarValor(numPrecoServico)}
                </p>
              </div>

              <div>
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  DESCONTO CONCEDIDO
                </span>
                <p className="text-base font-bold text-rose-400">
                  - R$ {formatarValor(descontoCalculado)}
                </p>
              </div>

              <div>
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  VALOR COBRADO
                </span>
                <p className="text-base font-bold text-white">
                  R$ {formatarValor(valorCobrado)}
                </p>
              </div>

              <div>
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  TAXA DA MAQUINETA
                </span>
                <p className="text-base font-bold text-rose-400">
                  - R$ {formatarValor(totalTaxaMaquineta)}
                </p>
              </div>

              <div className="col-span-2 sm:col-span-1">
                <span className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                  LUCRO ESTIMADO
                </span>
                <p className={`text-base font-black ${lucroEstimado >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  R$ {formatarValor(lucroEstimado)}
                </p>
              </div>
            </div>

            <p className="text-[10px] text-zinc-400 text-center mt-3 pt-3 border-t border-zinc-800/60 font-medium">
              Lucro estimado = valor líquido recebido − custo da peça − frete. O desconto ao cliente e a taxa da maquineta são registrados separadamente.
            </p>
          </div>
        </div>

        {/* ================= RESUMO PARA CONFERÊNCIA (CELULAR, ETAPA 4) ================= */}
        {etapa === 4 && (
          <div className="md:hidden bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-4 space-y-2.5">
            <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Confira antes de finalizar</p>
            {[
              { rotulo: 'Cliente', valor: nomeCliente.trim() || '—', voltarPara: 1 as EtapaMobile },
              { rotulo: 'Aparelho', valor: modeloAparelho.trim() || '—', voltarPara: 2 as EtapaMobile },
              { rotulo: 'Total cobrado', valor: `R$ ${formatarValor(valorCobrado)}`, voltarPara: 3 as EtapaMobile },
            ].map((linha) => (
              <button
                key={linha.rotulo}
                type="button"
                onClick={() => irParaEtapa(linha.voltarPara)}
                className="w-full flex items-center justify-between gap-3 text-left text-xs"
              >
                <span className="text-zinc-500 shrink-0">{linha.rotulo}</span>
                <span className="font-semibold text-white truncate">{linha.valor}</span>
              </button>
            ))}
          </div>
        )}

        {/* ================= SEÇÃO EXPANSÍVEL: CHECKLIST DE ENTRADA ================= */}
        <div className={`bg-[#0c101a] border border-zinc-800/80 rounded-2xl overflow-hidden shadow-sm ${classeEtapa(4)}`}>
          <button
            type="button"
            onClick={() => setMostrarChecklist(!mostrarChecklist)}
            className="w-full p-4 flex items-center justify-between text-xs font-bold text-zinc-300 hover:text-white transition"
          >
            <div className="flex items-center space-x-2">
              <span className="w-5 h-5 rounded-md bg-blue-600/20 text-blue-400 flex items-center justify-center text-[11px]">✓</span>
              <span>Checklist de entrada do dispositivo ({Object.values(checklist).filter((v) => v === 'OK').length}/{itensChecklist.length} OK)</span>
            </div>
            <span className="text-zinc-400 font-mono text-sm">{mostrarChecklist ? '▲' : '▼'}</span>
          </button>

          {/* Na etapa 4 do celular o checklist já abre expandido */}
          {(mostrarChecklist || etapa === 4) && (
            <div className={`p-5 border-t border-zinc-800/60 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs ${mostrarChecklist ? '' : 'md:hidden'}`}>
              {itensChecklist.map(({ chave, rotulo }) => (
                <div key={chave}>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">{rotulo}</label>
                  <select
                    value={checklist[chave] || 'OK'}
                    onChange={(e) => setChecklist({ ...checklist, [chave]: e.target.value })}
                    className="w-full px-3 py-1.5 bg-[#080c14] border border-zinc-800 rounded-xl text-white outline-none focus:border-blue-500"
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

        {/* ================= NAVEGAÇÃO DAS ETAPAS (SOMENTE CELULAR) ================= */}
        <div className="md:hidden sticky bottom-0 z-20 -mx-3 px-3 pt-3 pb-3 bg-[#080c14]/95 backdrop-blur border-t border-zinc-800/80 space-y-2">
          <div className="flex items-center gap-2">
            {etapa > 1 && (
              <button
                type="button"
                onClick={() => irParaEtapa((etapa - 1) as EtapaMobile)}
                disabled={carregando}
                className="shrink-0 px-4 py-3 rounded-xl border border-zinc-800 bg-[#0c101a] text-xs font-semibold text-zinc-300 hover:text-white transition"
              >
                ‹ Voltar
              </button>
            )}
            {etapa < 4 ? (
              <button
                type="button"
                onClick={() => irParaEtapa((etapa + 1) as EtapaMobile)}
                className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold transition shadow-lg shadow-blue-600/25 truncate"
              >
                {ETAPAS_MOBILE[etapa - 1].proxima} ›
              </button>
            ) : (
              <button
                type="submit"
                disabled={carregando}
                className="flex-1 min-w-0 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition shadow-lg shadow-blue-600/25"
              >
                {carregando ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Registrando ordem...</span>
                  </>
                ) : (
                  <span>Finalizar e gerar OS</span>
                )}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleSalvarRascunho}
            disabled={carregando}
            className="w-full py-2 text-xs font-semibold text-amber-300/90 hover:text-amber-200 disabled:opacity-50 transition"
          >
            📝 Salvar como rascunho
          </button>
        </div>

        {/* ================= BOTÕES DE AÇÃO INFERIORES ================= */}
        <div className="hidden md:flex md:flex-row md:items-center md:justify-end gap-3 pt-2">
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

              {/* Mensagem "OS aberta / entrada do aparelho" (texto em Configurações › Mensagens de WhatsApp) */}
              <button
                type="button"
                onClick={() => enviarMensagemWhatsapp(osCriadaSucesso.dadosCompletos, 'entrada')}
                disabled={!osCriadaSucesso.dadosCompletos.cliente?.whatsapp}
                title={osCriadaSucesso.dadosCompletos.cliente?.whatsapp ? undefined : 'Cliente sem WhatsApp informado'}
                className="w-full py-2.5 bg-[#0e1320] hover:bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 font-bold rounded-xl text-xs transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Avisar cliente no WhatsApp
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