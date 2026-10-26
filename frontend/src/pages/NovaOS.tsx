import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Banknote,
  BookOpen,
  CalendarClock,
  CalendarDays,
  Check,
  ClipboardCheck,
  CreditCard,
  FileText,
  Hash,
  Lock,
  Minus,
  MessageSquareText,
  Package,
  Phone,
  QrCode,
  Receipt,
  RotateCcw,
  Save,
  ShieldCheck,
  Smartphone,
  Tag,
  Truck,
  User,
  Users,
  Wallet,
  Wrench,
  X,
} from 'lucide-react';
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

// ================= PEÇAS VISUAIS DO FORMULÁRIO =================
const inputCls =
  'w-full h-10 px-3.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white placeholder-zinc-600 outline-none hover:border-zinc-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 transition [color-scheme:dark] disabled:cursor-not-allowed disabled:text-zinc-500';
/** Os campos essenciais da OS: um pouco maiores e com texto mais forte. */
const inputEssencialCls = `${inputCls} h-11 text-sm font-medium`;

const Rotulo: React.FC<{ children: React.ReactNode; obrigatorio?: boolean; opcional?: boolean; extra?: React.ReactNode }> = ({
  children,
  obrigatorio,
  opcional,
  extra,
}) => (
  <label className="flex items-baseline gap-1.5 mb-1.5 text-[11px] font-semibold text-zinc-400">
    <span>{children}</span>
    {obrigatorio && <span className="text-blue-400 font-bold">*</span>}
    {opcional && <span className="text-[10px] text-zinc-600 font-normal">(opcional)</span>}
    {extra}
  </label>
);

/** Ícone fixo à esquerda do campo; o campo filho precisa de pl-9. */
const ComIcone: React.FC<{ icone: React.ElementType; children: React.ReactNode; corIcone?: string }> = ({
  icone: Icone,
  children,
  corIcone = 'text-zinc-500',
}) => (
  <div className="relative">
    <Icone className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10 ${corIcone}`} />
    {children}
  </div>
);

/** Prefixo "R$" fixo à esquerda dos campos de dinheiro; o campo filho precisa de pl-9. */
const ComReais: React.FC<{ children: React.ReactNode; cor?: string }> = ({ children, cor = 'text-zinc-500' }) => (
  <div className="relative">
    <span className={`absolute left-3.5 top-1/2 -translate-y-1/2 text-[11px] font-bold pointer-events-none ${cor}`}>R$</span>
    {children}
  </div>
);

const SubBloco: React.FC<{
  titulo: string;
  descricao?: string;
  icone: React.ElementType;
  children: React.ReactNode;
  className?: string;
  acao?: React.ReactNode;
}> = ({ titulo, descricao, icone: Icone, children, className = '', acao }) => (
  <div className={`rounded-xl border border-zinc-800/80 p-4 space-y-3.5 ${className}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
        <span className="flex items-center gap-1.5 text-xs font-bold text-white">
          <Icone className="w-3.5 h-3.5 text-zinc-400" />
          {titulo}
        </span>
        {descricao && <span className="text-[11px] text-zinc-500">{descricao}</span>}
      </div>
      {acao}
    </div>
    {children}
  </div>
);

const CabecalhoCard: React.FC<{ numero: string; titulo: string; descricao: string; icone: React.ElementType }> = ({
  numero,
  titulo,
  descricao,
  icone: Icone,
}) => (
  <div className="flex items-start gap-3">
    <span className="w-9 h-9 shrink-0 rounded-xl bg-blue-600/10 border border-blue-500/25 text-blue-400 flex items-center justify-center">
      <Icone className="w-4 h-4" />
    </span>
    <div className="min-w-0">
      <h3 className="text-sm font-bold text-white">
        <span className="text-zinc-500 font-mono mr-1.5">{numero}</span>
        {titulo}
      </h3>
      <p className="text-[11px] text-zinc-500 mt-0.5">{descricao}</p>
    </div>
  </div>
);

const cardCls = 'bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-5 sm:p-6 space-y-5 shadow-sm';

const FORMAS_PAGAMENTO: { valor: string; rotulo: string; icone: React.ElementType; ativo: string }[] = [
  { valor: 'PIX', rotulo: 'PIX', icone: QrCode, ativo: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300' },
  { valor: 'Cartão de crédito', rotulo: 'Crédito', icone: CreditCard, ativo: 'border-blue-500/60 bg-blue-500/10 text-blue-300' },
  { valor: 'Cartão de débito', rotulo: 'Débito', icone: Wallet, ativo: 'border-cyan-500/60 bg-cyan-500/10 text-cyan-300' },
  { valor: 'Dinheiro', rotulo: 'Dinheiro', icone: Banknote, ativo: 'border-amber-500/60 bg-amber-500/10 text-amber-300' },
];

/** Forma de pagamento em botões de um toque (mesmos valores do antigo select). */
const BotoesFormaPagamento: React.FC<{ valor: string; onChange: (forma: string) => void; compacto?: boolean }> = ({ valor, onChange, compacto }) => (
  <div role="radiogroup" className={`grid grid-cols-2 ${compacto ? '' : 'sm:grid-cols-4'} gap-2`}>
    {FORMAS_PAGAMENTO.map(({ valor: forma, rotulo, icone: Icone, ativo }) => {
      const selecionado = valor === forma;
      return (
        <button
          key={forma}
          type="button"
          role="radio"
          aria-checked={selecionado}
          onClick={() => onChange(forma)}
          className={`flex items-center justify-center gap-2 rounded-xl border text-xs font-semibold transition ${compacto ? 'h-10' : 'h-12'} ${
            selecionado ? ativo : 'border-zinc-800 bg-[#080c14] text-zinc-400 hover:text-white hover:border-zinc-700'
          }`}
        >
          <Icone className="w-4 h-4" />
          {rotulo}
        </button>
      );
    })}
  </div>
);

// Botões do checklist: um toque por item, gravando os mesmos valores de OPCOES_CHECKLIST
const ESTILO_CHECKLIST: Record<string, { curto: string; icone: React.ElementType; ativo: string }> = {
  OK: { curto: 'OK', icone: Check, ativo: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/50' },
  DEFEITO: { curto: 'Defeito', icone: X, ativo: 'bg-rose-500/15 text-rose-300 border-rose-500/50' },
  'Com observação': { curto: 'Obs.', icone: MessageSquareText, ativo: 'bg-amber-500/15 text-amber-300 border-amber-500/50' },
  'NÃO TESTADO': { curto: 'N/T', icone: Minus, ativo: 'bg-zinc-700/50 text-zinc-200 border-zinc-600' },
};

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
    <Rotulo>Maquininha</Rotulo>
    <select
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      disabled={maquininhas.length <= 1}
      className={`${inputCls} cursor-pointer disabled:cursor-default disabled:text-zinc-300`}
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
  // Quando o celular chegou na etapa 4: toques logo em seguida são o mesmo toque do "Continuar"
  const chegouNaEtapa4Em = useRef(0);

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
    if (destino === 4 && etapa !== 4) chegouNaEtapa4Em.current = Date.now();
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
    // Celular: o envio do formulário (Enter no teclado, toque repassado pelo navegador) nunca cria a OS,
    // só avança a etapa. A OS é criada apenas pelo botão "Finalizar e gerar OS" (finalizarNoCelular).
    const ehCelular = !window.matchMedia('(min-width: 768px)').matches;
    if (ehCelular) {
      e.preventDefault();
      if (etapa < 4) irParaEtapa((etapa + 1) as EtapaMobile);
      return;
    }
    handleSubmit(e);
  };

  const finalizarNoCelular = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Ignora o toque que chega junto com a troca de etapa (o botão aparece embaixo do dedo)
    if (Date.now() - chegouNaEtapa4Em.current < 800) return;
    handleSubmit(e as unknown as React.FormEvent);
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

      <form onSubmit={enviarFormulario} className="space-y-5">
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

        {/* ================= SELO DE GARANTIA ================= */}
        <div className={classeEtapa(1)}>
          <div
            className={`rounded-2xl border p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 transition-colors ${
              possuiGarantia ? 'bg-emerald-500/[0.06] border-emerald-500/25' : 'bg-[#0c101a] border-zinc-800/80'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center border ${
                  possuiGarantia ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : 'bg-zinc-800/60 border-zinc-700 text-zinc-400'
                }`}
              >
                <ShieldCheck className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">
                  {possuiGarantia ? `Garantia da loja · ${prazoGarantiaDias} dias` : `Somente garantia legal · ${GARANTIA_LEGAL_DIAS} dias`}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {possuiGarantia ? 'Impressa na certidão de garantia da OS.' : 'Mínimo do CDC (art. 26, II), sem garantia extra da loja.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex p-1 rounded-xl bg-[#080c14] border border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setPossuiGarantia(true);
                    if (!prazoGarantiaDias || prazoGarantiaDias <= 0) {
                      setPrazoGarantiaDias(obterPrazoGarantiaConfiguradoLoja());
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    possuiGarantia ? 'bg-emerald-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Garantia da loja
                </button>
                <button
                  type="button"
                  onClick={() => setPossuiGarantia(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    !possuiGarantia ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Só garantia legal
                </button>
              </div>

              {/* Prazo: atalhos + valor livre (nunca abaixo dos 90 dias da garantia legal) */}
              {possuiGarantia && (
                <div className="flex items-center gap-1.5">
                  {[...new Set([obterPrazoGarantiaConfiguradoLoja(), 90, 180, 365])]
                    .filter((d) => d >= GARANTIA_LEGAL_DIAS)
                    .sort((a, b) => a - b)
                    .map((dias) => (
                      <button
                        key={dias}
                        type="button"
                        onClick={() => setPrazoGarantiaDias(dias)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${
                          prazoGarantiaDias === dias
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                            : 'bg-[#080c14] border-zinc-800 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {dias}d
                      </button>
                    ))}
                  <input
                    type="number"
                    min={GARANTIA_LEGAL_DIAS}
                    value={prazoGarantiaDias}
                    onChange={(e) => setPrazoGarantiaDias(Number(e.target.value) || 0)}
                    // Nunca abaixo dos 90 dias da garantia legal (CDC, art. 26, II)
                    onBlur={() => setPrazoGarantiaDias((p) => Math.max(GARANTIA_LEGAL_DIAS, Number(p) || 0))}
                    aria-label="Prazo de garantia em dias"
                    title="Prazo personalizado (dias)"
                    className="w-16 h-8 px-2 bg-[#080c14] border border-zinc-800 rounded-lg text-xs text-white font-bold text-center outline-none focus:border-emerald-500"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ================= CARD 01: DADOS DO CLIENTE ================= */}
        <div className={`${cardCls} ${classeEtapa(1)}`}>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <CabecalhoCard numero="01" titulo="Dados do cliente" descricao="Vincule um cadastro existente ou preencha avulso" icone={User} />
            {/* Atalho: cliente já cadastrado preenche nome, telefone e documento */}
            <div className="sm:w-72 shrink-0">
              <ComIcone icone={Users}>
                <select
                  value={idClienteSelecionado}
                  onChange={handleSelecionarCliente}
                  aria-label="Cliente cadastrado"
                  className={`${inputCls} pl-9 cursor-pointer ${idClienteSelecionado ? 'border-blue-500/40 text-blue-200' : ''}`}
                >
                  <option value="">Buscar cliente cadastrado...</option>
                  {listaClientes.map((c) => (
                    <option key={c.id_cliente || c.id} value={c.id_cliente || c.id}>
                      {c.nome} {c.whatsapp ? `(${c.whatsapp})` : ''}
                    </option>
                  ))}
                </select>
              </ComIcone>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <Rotulo obrigatorio>Nome completo</Rotulo>
              <ComIcone icone={User}>
                <input
                  type="text"
                  required
                  value={nomeCliente}
                  onChange={(e) => setNomeCliente(e.target.value)}
                  placeholder="Ex: João Silva"
                  className={`${inputEssencialCls} pl-9`}
                />
              </ComIcone>
            </div>

            <div>
              <Rotulo>WhatsApp / telefone</Rotulo>
              <ComIcone icone={Phone} corIcone="text-emerald-500/80">
                <input
                  type="tel"
                  value={whatsappCliente}
                  onChange={(e) => setWhatsappCliente(e.target.value)}
                  placeholder="(85) 99999-9999"
                  className={`${inputCls} h-11 pl-9`}
                />
              </ComIcone>
            </div>

            <div>
              <Rotulo opcional>CPF / CNPJ</Rotulo>
              <ComIcone icone={FileText}>
                <input
                  type="text"
                  value={cpfCnpjCliente}
                  onChange={(e) => setCpfCnpjCliente(e.target.value)}
                  placeholder="000.000.000-00"
                  className={`${inputCls} h-11 pl-9`}
                />
              </ComIcone>
            </div>
          </div>
        </div>

        {/* ================= CARD 02: APARELHO, DEFEITO E PRAZOS ================= */}
        <div className={`${cardCls} ${classeEtapa(2)}`}>
          <CabecalhoCard numero="02" titulo="Aparelho, defeito e prazos" descricao="Identificação do dispositivo e diagnóstico" icone={Smartphone} />

          {/* Linha 1: o aparelho */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <Rotulo obrigatorio>Modelo do aparelho</Rotulo>
              <ComIcone icone={Smartphone}>
                <CampoModeloAparelho
                  valor={modeloAparelho}
                  onChange={setModeloAparelho}
                  modelosDaLoja={modelosDaLoja}
                  placeholder="Ex: iPhone 13 128GB"
                  className={`${inputEssencialCls} pl-9`}
                />
              </ComIcone>
            </div>

            <div>
              <Rotulo opcional>IMEI / nº de série</Rotulo>
              <ComIcone icone={Hash}>
                <input
                  type="text"
                  value={imeiAparelho}
                  onChange={(e) => setImeiAparelho(e.target.value)}
                  placeholder="15 dígitos"
                  className={`${inputCls} h-11 pl-9 font-mono`}
                />
              </ComIcone>
            </div>
          </div>

          {/* Linha 2: acesso e prazos */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Rotulo>Senha de desbloqueio</Rotulo>
              <ComIcone icone={Lock} corIcone="text-amber-400/80">
                <input
                  type="text"
                  value={senhaAparelho}
                  onChange={(e) => setSenhaAparelho(e.target.value)}
                  placeholder="Senha ou padrão, para os testes"
                  className={`${inputCls} pl-9 bg-amber-500/[0.04] border-amber-500/20 focus:border-amber-500 focus:ring-amber-500/15`}
                />
              </ComIcone>
            </div>

            <div>
              <Rotulo>Data de abertura</Rotulo>
              <ComIcone icone={CalendarDays}>
                <input type="date" value={dataAbertura} onChange={(e) => setDataAbertura(e.target.value)} className={`${inputCls} pl-9`} />
              </ComIcone>
            </div>

            <div>
              <Rotulo>Previsão de entrega</Rotulo>
              <ComIcone icone={CalendarClock}>
                <input type="date" value={dataPrevista} onChange={(e) => setDataPrevista(e.target.value)} className={`${inputCls} pl-9`} />
              </ComIcone>
            </div>
          </div>

          {/* Linha 3: diagnóstico lado a lado */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Rotulo obrigatorio>Defeito relatado pelo cliente</Rotulo>
              <input
                type="text"
                required
                value={defeitoRelatado}
                onChange={(e) => setDefeitoRelatado(e.target.value)}
                placeholder="O que o cliente contou? Ex: não carrega e esquenta na tomada"
                className={inputEssencialCls}
              />
            </div>

            <div>
              <Rotulo opcional>Diagnóstico técnico inicial / laudo</Rotulo>
              <input
                type="text"
                value={diagnostico}
                onChange={(e) => setDiagnostico(e.target.value)}
                placeholder="O que você viu na bancada? Ex: conector oxidado, bateria em 68%"
                className={`${inputCls} h-11`}
              />
            </div>
          </div>
        </div>

        {/* ================= CARD 03: VALORES, CUSTOS E PAGAMENTO ================= */}
        <div className={`${cardCls} ${classeEtapa(3)}`}>
          <CabecalhoCard numero="03" titulo="Valores, custos e pagamento" descricao="Primeiro o que o cliente paga, depois o custo interno da loja" icone={Receipt} />

          {/* ---------- 3.1 Valor ao cliente ---------- */}
          <SubBloco titulo="Valor ao cliente" descricao="Serviço do catálogo, preço e desconto" icone={Tag} className="bg-blue-500/[0.03] border-blue-500/15">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Rotulo opcional>Serviço do catálogo</Rotulo>
                <ComIcone icone={BookOpen}>
                  <select value={servicoPadraoId} onChange={handleSelecionarServico} className={`${inputCls} h-11 pl-9 cursor-pointer`}>
                    <option value="">{listaServicos.length > 0 ? 'Selecione um serviço cadastrado...' : 'Nenhum serviço cadastrado'}</option>
                    {listaServicos.map((s) => (
                      <option key={s.id_servico || s.id} value={s.id_servico || s.id}>
                        {s.nome} — R$ {Number(s.preco_sugerido || s.preco || 0).toFixed(2)}
                      </option>
                    ))}
                  </select>
                </ComIcone>
                {servicoSelecionado && <p className="text-[11px] text-blue-400 mt-1.5">Valor e garantia do serviço aplicados.</p>}
              </div>

              <div>
                <Rotulo obrigatorio>Valor do serviço</Rotulo>
                <ComReais cor="text-emerald-500">
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={valorServico}
                    onChange={(e) => setValorServico(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0,00"
                    className={`${inputCls} h-11 pl-9 text-base font-bold text-emerald-400 focus:border-emerald-500 focus:ring-emerald-500/15`}
                  />
                </ComReais>
              </div>

              <div className="sm:col-span-2 lg:col-span-1">
                <Rotulo
                  opcional
                  extra={
                    descontoCalculado > 0 && (
                      <span className="ml-auto text-[10px] font-semibold text-rose-400">− R$ {formatarValor(descontoCalculado)}</span>
                    )
                  }
                >
                  Desconto ao cliente
                </Rotulo>
                <div className="flex gap-2">
                  <div className="inline-flex shrink-0 p-1 rounded-xl bg-[#080c14] border border-zinc-800">
                    {(['VALOR', 'PERCENTUAL'] as const).map((tipo) => (
                      <button
                        key={tipo}
                        type="button"
                        onClick={() => setTipoDesconto(tipo)}
                        aria-pressed={tipoDesconto === tipo}
                        className={`w-9 h-8 rounded-lg text-xs font-bold transition ${
                          tipoDesconto === tipo ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-white'
                        }`}
                      >
                        {tipo === 'VALOR' ? 'R$' : '%'}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={descontoCliente}
                    onChange={(e) => setDescontoCliente(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder={tipoDesconto === 'VALOR' ? '0,00' : '0'}
                    aria-label="Valor do desconto"
                    className={`${inputCls} h-11`}
                  />
                </div>
                {descontoCalculado > 0 && (
                  <p className="text-[11px] text-zinc-500 mt-1.5">
                    Cliente paga <strong className="text-white">R$ {formatarValor(valorCobrado)}</strong>
                  </p>
                )}
              </div>
            </div>
          </SubBloco>

          {/* ---------- 3.2 Controle interno de custos ---------- */}
          <SubBloco titulo="Controle interno de custos" descricao="Peça, frete e fornecedor (não aparece para o cliente)" icone={Package} className="bg-[#080c14]/60">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Rotulo>Custo da peça</Rotulo>
                <ComReais>
                  <input
                    type="number"
                    step="0.01"
                    value={custoPeca}
                    onChange={(e) => setCustoPeca(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0,00"
                    className={`${inputCls} pl-9`}
                  />
                </ComReais>
              </div>

              <div>
                <Rotulo>Frete real</Rotulo>
                <ComReais>
                  <input
                    type="number"
                    step="0.01"
                    value={freteReal}
                    onChange={(e) => setFreteReal(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0,00"
                    className={`${inputCls} pl-9`}
                  />
                </ComReais>
              </div>

              <div>
                <Rotulo opcional>Fornecedor da peça</Rotulo>
                <ComIcone icone={Truck}>
                  <select value={fornecedorPeca} onChange={(e) => setFornecedorPeca(e.target.value)} className={`${inputCls} pl-9 cursor-pointer`}>
                    <option value="">Selecione...</option>
                    {listaFornecedores.map((f) => (
                      <option key={f.id_fornecedor || f.id} value={f.nome}>
                        {f.nome}
                      </option>
                    ))}
                  </select>
                </ComIcone>
              </div>
            </div>
          </SubBloco>

          <CamposLegaisOS valor={dadosLegais} onChange={setDadosLegais} />

          {/* ---------- 3.3 Forma de pagamento e taxas ---------- */}
          <SubBloco
            titulo="Forma de pagamento"
            descricao={dividirPagamento ? 'Dividido em 2 formas' : 'Forma única'}
            icone={CreditCard}
            acao={
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
                className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition border ${
                  dividirPagamento
                    ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                    : 'bg-[#080c14] border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700'
                }`}
              >
                {dividirPagamento ? '✓ Dividindo em 2 formas' : '+ Dividir em 2 formas'}
              </button>
            }
          >

            {/* --- MODO 1: FORMA DE PAGAMENTO ÚNICA --- */}
            {!dividirPagamento && (
              <div className="space-y-3.5">
                <BotoesFormaPagamento valor={formaPagamento1} onChange={setFormaPagamento1} />

                {ehCartao(formaPagamento1) ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-3.5 rounded-xl bg-[#080c14]/70 border border-zinc-800/80">
                    <SeletorMaquininha valor={maquininha1} onChange={setMaquininha1} maquininhas={maquininhas} />

                    {formaPagamento1 === 'Cartão de crédito' ? (
                      <div>
                        <Rotulo>Parcelas</Rotulo>
                        <select value={parcelas1} onChange={(e) => setParcelas1(Number(e.target.value))} className={`${inputCls} cursor-pointer`}>
                          {opcoesParcelas(maquininhas, maquininha1).map((o) => (
                            <option key={o.parcelas} value={o.parcelas}>
                              {o.rotulo}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <Rotulo>Parcelas</Rotulo>
                        <div className={`${inputCls} flex items-center text-zinc-500`}>Débito · à vista</div>
                      </div>
                    )}

                    <div>
                      <Rotulo>Taxa da maquineta (%)</Rotulo>
                      <input
                        type="number"
                        step="0.01"
                        value={taxaMaquinetaPercentual1}
                        onChange={(e) => setTaxaMaquinetaPercentual1(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="0,00"
                        className={inputCls}
                      />
                    </div>

                    <div>
                      <Rotulo>Líquido recebido</Rotulo>
                      <div className={`${inputCls} flex items-center font-bold text-emerald-400`}>R$ {formatarValor(liquidoRecebido)}</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-500">
                    {formaPagamento1} não tem taxa de maquininha: a loja recebe <strong className="text-emerald-400">R$ {formatarValor(liquidoRecebido)}</strong>.
                  </p>
                )}
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
                  <span>
                    Total devido: <strong className="font-bold text-white">R$ {formatarValor(valorCobrado)}</strong> · Distribuído:{' '}
                    <strong className="font-bold text-white">R$ {formatarValor(somaPagamentos)}</strong>
                  </span>
                  {Math.abs(saldoRestante) < 0.01 && numValorPg1 > 0 && numValorPg2 > 0 ? (
                    <span className="font-bold text-emerald-400">✓ 100% distribuído</span>
                  ) : saldoRestante > 0 ? (
                    <span className="font-bold text-amber-400">Falta distribuir: R$ {formatarValor(saldoRestante)}</span>
                  ) : (
                    <span className="font-bold text-rose-400">Excedeu o total em: R$ {formatarValor(Math.abs(saldoRestante))}</span>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Bloco 1: 1ª Forma de Pagamento */}
                  <div className="bg-[#080c14] border border-zinc-800 rounded-xl p-4 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-400">1ª forma de pagamento</span>
                      <span className="text-[11px] text-zinc-400">
                        Líquido: <strong className="text-emerald-400">R$ {formatarValor(liquidoPg1)}</strong>
                      </span>
                    </div>

                    <BotoesFormaPagamento valor={formaPagamento1} onChange={setFormaPagamento1} compacto />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="sm:col-span-2">
                        <Rotulo obrigatorio>Valor destinado</Rotulo>
                        <ComReais>
                          <input
                            type="number"
                            step="0.01"
                            required
                            value={valorPg1}
                            onChange={(e) => setValorPg1(e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder="0,00"
                            className={`${inputCls} pl-9 font-bold`}
                          />
                        </ComReais>
                      </div>

                      {ehCartao(formaPagamento1) && (
                        <>
                          <div className="sm:col-span-2">
                            <SeletorMaquininha valor={maquininha1} onChange={setMaquininha1} maquininhas={maquininhas} />
                          </div>
                          <div>
                            <Rotulo>Parcelas</Rotulo>
                            <select
                              disabled={formaPagamento1 !== 'Cartão de crédito'}
                              value={formaPagamento1 === 'Cartão de crédito' ? parcelas1 : 1}
                              onChange={(e) => setParcelas1(Number(e.target.value))}
                              className={`${inputCls} cursor-pointer`}
                            >
                              {opcoesParcelas(maquininhas, maquininha1).map((o) => (
                                <option key={o.parcelas} value={o.parcelas}>
                                  {o.rotulo}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <Rotulo>Taxa da maquineta (%)</Rotulo>
                            <input
                              type="number"
                              step="0.01"
                              value={taxaMaquinetaPercentual1}
                              onChange={(e) => setTaxaMaquinetaPercentual1(e.target.value === '' ? '' : Number(e.target.value))}
                              placeholder="0,00"
                              className={inputCls}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Bloco 2: 2ª Forma de Pagamento */}
                  <div className="bg-[#080c14] border border-zinc-800 rounded-xl p-4 space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-purple-400">2ª forma de pagamento</span>
                      <span className="text-[11px] text-zinc-400">
                        Líquido: <strong className="text-emerald-400">R$ {formatarValor(liquidoPg2)}</strong>
                      </span>
                    </div>

                    <BotoesFormaPagamento valor={formaPagamento2} onChange={setFormaPagamento2} compacto />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="sm:col-span-2">
                        <Rotulo
                          obrigatorio
                          extra={
                            saldoRestante !== 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const restante = Math.max(0, Math.round((valorCobrado - numValorPg1) * 100) / 100);
                                  setValorPg2(restante);
                                }}
                                className="ml-auto text-[10px] text-blue-400 hover:text-blue-300 font-bold underline"
                              >
                                Usar restante (R$ {saldoRestante.toFixed(2)})
                              </button>
                            )
                          }
                        >
                          Valor destinado
                        </Rotulo>
                        <ComReais>
                          <input
                            type="number"
                            step="0.01"
                            required
                            value={valorPg2}
                            onChange={(e) => setValorPg2(e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder="0,00"
                            className={`${inputCls} pl-9 font-bold`}
                          />
                        </ComReais>
                      </div>

                      {ehCartao(formaPagamento2) && (
                        <>
                          <div className="sm:col-span-2">
                            <SeletorMaquininha valor={maquininha2} onChange={setMaquininha2} maquininhas={maquininhas} />
                          </div>
                          <div>
                            <Rotulo>Parcelas</Rotulo>
                            <select
                              disabled={formaPagamento2 !== 'Cartão de crédito'}
                              value={formaPagamento2 === 'Cartão de crédito' ? parcelas2 : 1}
                              onChange={(e) => setParcelas2(Number(e.target.value))}
                              className={`${inputCls} cursor-pointer`}
                            >
                              {opcoesParcelas(maquininhas, maquininha2).map((o) => (
                                <option key={o.parcelas} value={o.parcelas}>
                                  {o.rotulo}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <Rotulo>Taxa da maquineta (%)</Rotulo>
                            <input
                              type="number"
                              step="0.01"
                              value={taxaMaquinetaPercentual2}
                              onChange={(e) => setTaxaMaquinetaPercentual2(e.target.value === '' ? '' : Number(e.target.value))}
                              placeholder="0,00"
                              className={inputCls}
                            />
                          </div>
                        </>
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
          </SubBloco>

          {/* ================= TICKET DE RESUMO FINANCEIRO ================= */}
          <div className="rounded-xl border border-blue-500/20 bg-gradient-to-br from-[#0b1424] to-[#080c14] overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto]">
              <dl className="p-4 space-y-2 text-xs">
                {[
                  { rotulo: 'Preço do serviço', valor: `R$ ${formatarValor(numPrecoServico)}`, cor: 'text-zinc-200' },
                  { rotulo: 'Desconto concedido', valor: `− R$ ${formatarValor(descontoCalculado)}`, cor: 'text-rose-400' },
                  { rotulo: 'Taxa da maquineta', valor: `− R$ ${formatarValor(totalTaxaMaquineta)}`, cor: 'text-rose-400' },
                  { rotulo: 'Líquido recebido', valor: `R$ ${formatarValor(liquidoRecebido)}`, cor: 'text-zinc-200' },
                  { rotulo: 'Custos (peça + frete)', valor: `− R$ ${formatarValor(numCustoPeca + numFreteReal)}`, cor: 'text-amber-400' },
                ].map((linha) => (
                  <div key={linha.rotulo} className="flex items-center justify-between gap-3 border-b border-dashed border-zinc-800/80 pb-2 last:border-0 last:pb-0">
                    <dt className="text-zinc-500">{linha.rotulo}</dt>
                    <dd className={`font-semibold tabular-nums ${linha.cor}`}>{linha.valor}</dd>
                  </div>
                ))}
              </dl>

              <div className="grid grid-cols-2 lg:grid-cols-1 lg:w-64 border-t lg:border-t-0 lg:border-l border-zinc-800/80">
                <div className="p-4 bg-cyan-500/[0.05]">
                  <span className="block text-[10px] font-bold text-cyan-400/80 uppercase tracking-wider">Total ao cliente</span>
                  <p className="text-xl sm:text-2xl font-black text-cyan-300 tabular-nums mt-0.5">R$ {formatarValor(valorCobrado)}</p>
                </div>
                <div className={`p-4 border-l lg:border-l-0 lg:border-t border-zinc-800/80 ${lucroEstimado >= 0 ? 'bg-emerald-500/[0.05]' : 'bg-rose-500/[0.06]'}`}>
                  <span className={`block text-[10px] font-bold uppercase tracking-wider ${lucroEstimado >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
                    Lucro estimado
                  </span>
                  <p className={`text-xl sm:text-2xl font-black tabular-nums mt-0.5 ${lucroEstimado >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    R$ {formatarValor(lucroEstimado)}
                  </p>
                  {liquidoRecebido > 0 && (
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      {((lucroEstimado / liquidoRecebido) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% de margem
                    </p>
                  )}
                </div>
              </div>
            </div>
            <p className="px-4 py-2.5 text-[10px] text-zinc-500 border-t border-zinc-800/80">
              Lucro estimado = líquido recebido − custo da peça − frete. O desconto e a taxa da maquineta são registrados separadamente.
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

        {/* ================= CARD 04: CHECKLIST DE ENTRADA ================= */}
        <div className={`bg-[#0c101a] border border-zinc-800/80 rounded-2xl overflow-hidden shadow-sm ${classeEtapa(4)}`}>
          <div className="flex items-center gap-2 pr-3">
            <button
              type="button"
              onClick={() => setMostrarChecklist(!mostrarChecklist)}
              aria-expanded={mostrarChecklist}
              className="flex-1 min-w-0 p-4 flex items-center gap-3 text-left hover:bg-zinc-800/20 transition"
            >
              <span className="w-9 h-9 shrink-0 rounded-xl bg-blue-600/10 border border-blue-500/25 text-blue-400 flex items-center justify-center">
                <ClipboardCheck className="w-4 h-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-white truncate">
                  <span className="text-zinc-500 font-mono mr-1.5">04</span>
                  Checklist de entrada
                </span>
                <span className="block text-[11px] text-zinc-500">
                  {Object.values(checklist).filter((v) => v === 'OK').length} de {itensChecklist.length} itens OK · um toque por item
                </span>
              </span>
              <span className="ml-auto text-zinc-500 text-xs shrink-0">{mostrarChecklist ? '▲' : '▼'}</span>
            </button>
            {(mostrarChecklist || etapa === 4) && (
              <button
                type="button"
                onClick={() => setChecklist({ ...checklist, ...Object.fromEntries(itensChecklist.map((i) => [i.chave, 'OK'])) })}
                className={`shrink-0 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/20 transition ${
                  mostrarChecklist ? '' : 'md:hidden'
                }`}
              >
                Marcar todos OK
              </button>
            )}
          </div>

          {/* Na etapa 4 do celular o checklist já abre expandido */}
          {(mostrarChecklist || etapa === 4) && (
            <div className={`p-4 border-t border-zinc-800/60 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 ${mostrarChecklist ? '' : 'md:hidden'}`}>
              {itensChecklist.map(({ chave, rotulo }) => {
                const atual = checklist[chave] || 'OK';
                return (
                  <div key={chave} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#080c14] border border-zinc-800/80">
                    <span className="text-xs font-medium text-zinc-200 truncate">{rotulo}</span>
                    <div role="radiogroup" aria-label={rotulo} className="flex shrink-0 gap-1">
                      {OPCOES_CHECKLIST.map((opcao) => {
                        const estilo = ESTILO_CHECKLIST[opcao] || { curto: opcao, icone: Minus, ativo: 'bg-zinc-700/50 text-zinc-200 border-zinc-600' };
                        const Icone = estilo.icone;
                        const ativo = atual === opcao;
                        return (
                          <button
                            key={opcao}
                            type="button"
                            role="radio"
                            aria-checked={ativo}
                            title={opcao}
                            onClick={() => setChecklist({ ...checklist, [chave]: opcao })}
                            className={`h-8 px-2 inline-flex items-center gap-1 rounded-lg border text-[10px] font-bold transition ${
                              ativo ? estilo.ativo : 'border-transparent text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/60'
                            }`}
                          >
                            <Icone className="w-3.5 h-3.5" />
                            <span className={ativo ? '' : 'hidden sm:inline'}>{estilo.curto}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
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
            {/* Chaves diferentes: sem elas o React reaproveita o mesmo <button> e só troca o type para "submit"
                no meio do toque em "Continuar", e o navegador envia o formulário pulando o checklist */}
            {etapa < 4 ? (
              <button
                key="avancar"
                type="button"
                onClick={() => irParaEtapa((etapa + 1) as EtapaMobile)}
                className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold transition shadow-lg shadow-blue-600/25 truncate"
              >
                {ETAPAS_MOBILE[etapa - 1].proxima} ›
              </button>
            ) : (
              <button
                key="finalizar"
                type="button"
                onClick={finalizarNoCelular}
                disabled={carregando}
                className="flex-1 min-w-0 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 disabled:opacity-50 text-white text-xs font-bold transition shadow-lg shadow-sky-500/20"
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
            className="w-full py-2 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-amber-300/90 hover:text-amber-200 disabled:opacity-50 transition"
          >
            <Save className="w-3.5 h-3.5" />
            Salvar como rascunho
          </button>
        </div>

        {/* ================= BOTÕES DE AÇÃO INFERIORES (DESKTOP) ================= */}
        <div className="hidden md:flex items-center justify-between gap-3 p-4 rounded-2xl bg-[#0c101a] border border-zinc-800/80">
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Limpar todos os campos desta nova OS?')) handleLimparFormulario();
            }}
            disabled={carregando}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Limpar formulário
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSalvarRascunho}
              disabled={carregando}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 active:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold transition"
            >
              <Save className="w-3.5 h-3.5" />
              Salvar rascunho
            </button>

            <button
              type="submit"
              disabled={carregando}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-sky-500/20"
            >
              {carregando ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Registrando ordem...</span>
                </>
              ) : (
                <>
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Finalizar e gerar OS</span>
                </>
              )}
            </button>
          </div>
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