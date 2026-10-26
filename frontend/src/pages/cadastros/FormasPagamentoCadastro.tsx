import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TIPOS_NATIVOS, avisarFormasPagamentoAlteradas } from '../../services/formasPagamentoOS';
import {
  type FormaPagamento,
  type FormaPagamentoInput,
  type Loja,
  TIPOS_FORMA_PAGAMENTO,
  TabelaAusenteError,
  type TipoFormaPagamento,
  alternarAtivoFormaPagamento,
  criarFormasPagamentoPadrao,
  excluirFormaPagamento,
  formasPadraoFaltantes,
  listarFormasPagamento,
  listarLojas,
  obterTaxaParcela,
  salvarFormaPagamento,
} from '../../services/cadastros';
import {
  AcoesLinha,
  AvisoTabelaAusente,
  Badge,
  Campo,
  CardFormulario,
  Carregando,
  FiltroSegmentado,
  ListaCadastro,
  ModalConfirmacao,
  ModalDetalhes,
  PaginaCadastro,
  Secao,
  TabelaCadastro,
  Toggle,
  inputCls,
  rolarParaFormulario,
  useFeedback,
} from '../../components/cadastros/ui';
import { formatarDataHora, formatarMoeda, formatarPercentual } from '../../utils/formatadores';

const MAX_PARCELAS = 24;

const formBase = () => ({
  /** Modelo escolhido ao cadastrar uma forma nova (não é gravado: vira tipo + valores iniciais). */
  modalidade: 'crediario' as IdModalidade,
  nome: '',
  tipo: 'OUTRO' as TipoFormaPagamento,
  id_loja: '',
  taxa_percentual: '0',
  taxa_fixa: '0',
  prazo_recebimento_dias: '0',
  permite_parcelamento: false,
  parcelas_max: 1,
  parcelas_sem_juros: 1,
  repassar_juros_cliente: false,
  ativo: true,
  ordem: '0',
  // Taxa por número de parcelas, como texto para permitir edição livre (vírgula ou ponto)
  taxas: {} as Record<number, string>,
});
type FormForma = ReturnType<typeof formBase>;

// Modalidades complementares às 4 nativas (PIX, dinheiro, débito e crédito, criadas automaticamente).
// O banco guarda o tipo (boleto, transferência ou outro); o nome identifica a modalidade na OS e nos relatórios.
type IdModalidade = 'crediario' | 'boleto' | 'link' | 'transferencia' | 'troca' | 'faturado' | 'carteira' | 'outro';
const MODALIDADES: { id: IdModalidade; rotulo: string; tipo: TipoFormaPagamento; nome: string; dica: string; padrao: Partial<FormForma> }[] = [
  {
    id: 'crediario',
    rotulo: 'A prazo / crediário próprio (carnê, promissória)',
    tipo: 'OUTRO',
    nome: 'Crediário próprio',
    dica: 'Venda parcelada pela própria loja. Defina o máximo de parcelas e, se houver, a taxa de juros.',
    padrao: { permite_parcelamento: true, parcelas_max: 12, parcelas_sem_juros: 1, prazo_recebimento_dias: '30' },
  },
  {
    id: 'boleto',
    rotulo: 'Boleto bancário',
    tipo: 'BOLETO',
    nome: 'Boleto bancário',
    dica: 'Informe a tarifa por boleto (taxa fixa em R$) ou a taxa % do banco. Costuma compensar em D+1 ou D+2.',
    padrao: { prazo_recebimento_dias: '1' },
  },
  {
    id: 'link',
    rotulo: 'Link de pagamento online (InfinitePay, Mercado Pago, Asaas...)',
    tipo: 'OUTRO',
    nome: 'Link de pagamento',
    dica: 'Use o nome da plataforma (ex.: "Link InfinitePay") e as taxas do seu contrato, por parcela.',
    padrao: { permite_parcelamento: true, parcelas_max: 12, parcelas_sem_juros: 1 },
  },
  {
    id: 'transferencia',
    rotulo: 'Transferência bancária / TED / DOC',
    tipo: 'TRANSFERENCIA',
    nome: 'Transferência bancária',
    dica: 'Normalmente sem taxa, com recebimento em D+0 ou D+1.',
    padrao: { prazo_recebimento_dias: '0' },
  },
  {
    id: 'troca',
    rotulo: 'Aparelho na troca (trade-in / abatimento)',
    tipo: 'OUTRO',
    nome: 'Aparelho na troca',
    dica: 'Quando o cliente entrega um aparelho usado como parte do pagamento. Sem taxa.',
    padrao: {},
  },
  {
    id: 'faturado',
    rotulo: 'Faturado para empresa (B2B / convênio)',
    tipo: 'OUTRO',
    nome: 'Faturado para empresa',
    dica: 'Serviço cobrado depois da empresa ou convênio. Ajuste o prazo de recebimento (15 ou 30 dias).',
    padrao: { prazo_recebimento_dias: '30' },
  },
  {
    id: 'carteira',
    rotulo: 'Carteira digital / QR Code da operadora (PicPay, Mercado Pago...)',
    tipo: 'OUTRO',
    nome: 'Carteira digital',
    dica: 'Use o nome da carteira (ex.: "PicPay") e a taxa cobrada por ela.',
    padrao: {},
  },
  {
    id: 'outro',
    rotulo: 'Outro (personalizado)',
    tipo: 'OUTRO',
    nome: '',
    dica: 'Digite o nome exato da modalidade.',
    padrao: {},
  },
];
const modalidade = (id: IdModalidade) => MODALIDADES.find((m) => m.id === id) || MODALIDADES[0];

/** Formulário de uma forma nova já com o tipo e os valores iniciais da modalidade. */
const formDaModalidade = (id: IdModalidade): FormForma => {
  const m = modalidade(id);
  return { ...formBase(), ...m.padrao, modalidade: id, tipo: m.tipo, nome: m.nome };
};
const formVazio = () => formDaModalidade('crediario');

/** PIX, dinheiro, débito e crédito: criadas sozinhas em toda conta; podem ser editadas e desativadas. */
const ehNativa = (f: Pick<FormaPagamento, 'tipo'>) => TIPOS_NATIVOS.includes(f.tipo);
const PRAZOS_RAPIDOS = [0, 1, 14, 30];
type Erros = Partial<Record<keyof FormForma | 'taxasTabela', string>>;

const num = (v: string) => Number(String(v).replace(',', '.'));
const rotuloPrazo = (d: number) => (d === 0 ? 'Na hora (D+0)' : `D+${d}`);

// Na Nova OS: cartão usa as taxas da maquininha (Configurações › Taxas); PIX e dinheiro não têm taxa;
// as demais formas usam a taxa e o parcelamento definidos aqui
const TIPOS_CARTAO: TipoFormaPagamento[] = ['CARTAO_CREDITO', 'CARTAO_DEBITO'];
const TIPOS_SEM_TAXA: TipoFormaPagamento[] = ['PIX', 'DINHEIRO'];
const usaTaxaPropria = (tipo: TipoFormaPagamento) => !TIPOS_CARTAO.includes(tipo) && !TIPOS_SEM_TAXA.includes(tipo);

export const FormasPagamentoCadastro: React.FC = () => {
  const [formas, setFormas] = useState<FormaPagamento[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [tabelaAusente, setTabelaAusente] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [criandoPadrao, setCriandoPadrao] = useState(false);

  const [form, setForm] = useState<FormForma>(formVazio);
  const [erros, setErros] = useState<Erros>({});
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [valorSimulacao, setValorSimulacao] = useState('100');

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todas' | 'ativas' | 'inativas'>('todas');
  const [detalhe, setDetalhe] = useState<FormaPagamento | null>(null);
  const [paraExcluir, setParaExcluir] = useState<FormaPagamento | null>(null);
  const feedback = useFeedback();

  // A conta nunca fica sem as 4 formas nativas: as que faltarem são criadas na primeira carga da tela
  const nativasVerificadas = useRef(false);

  const carregar = async () => {
    try {
      let [listaF, listaL] = await Promise.all([listarFormasPagamento(), listarLojas()]);
      if (!nativasVerificadas.current) {
        nativasVerificadas.current = true;
        if (formasPadraoFaltantes(listaF).length > 0) {
          await criarFormasPagamentoPadrao(listaF);
          listaF = await listarFormasPagamento();
          avisarFormasPagamentoAlteradas();
        }
      }
      setFormas(listaF);
      setLojas(listaL);
      setTabelaAusente(false);
    } catch (e: any) {
      if (e instanceof TabelaAusenteError) setTabelaAusente(true);
      else feedback.erro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const aceitaParcelamento = TIPOS_FORMA_PAGAMENTO[form.tipo].aceitaParcelamento;
  const parcelasAtivas = form.permite_parcelamento ? form.parcelas_max : 1;

  const atualizar = <K extends keyof FormForma>(campo: K, valor: FormForma[K]) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    if (erros[campo]) setErros((e) => ({ ...e, [campo]: undefined }));
  };

  // Troca de modalidade numa forma nova: aplica o tipo e os valores iniciais dela.
  // O nome só é trocado se ainda for o sugerido pela modalidade anterior (o que o usuário digitou fica).
  const trocarModalidade = (id: IdModalidade) => {
    setForm((f) => {
      const nomeSugerido = modalidade(f.modalidade).nome;
      const novo = formDaModalidade(id);
      return {
        ...novo,
        nome: f.nome.trim() && f.nome !== nomeSugerido ? f.nome : novo.nome,
        id_loja: f.id_loja,
        ordem: f.ordem,
        ativo: f.ativo,
      };
    });
    setErros({});
  };

  const alternarParcelamento = (v: boolean) => {
    setForm((f) => ({
      ...f,
      permite_parcelamento: v,
      parcelas_max: v ? Math.max(f.parcelas_max, 12) : 1,
      parcelas_sem_juros: v ? Math.max(1, Math.min(f.parcelas_sem_juros, 12)) : 1,
      repassar_juros_cliente: v ? f.repassar_juros_cliente : false,
    }));
  };

  const preencherTaxasComBase = () => {
    const taxas: Record<number, string> = {};
    for (let p = 1; p <= parcelasAtivas; p++) taxas[p] = form.taxa_percentual;
    atualizar('taxas', taxas);
  };

  const limpar = () => {
    setForm(formVazio());
    setErros({});
    setEditandoId(null);
  };

  const iniciarEdicao = (f: FormaPagamento) => {
    const taxas: Record<number, string> = {};
    f.taxas.forEach((t) => (taxas[t.parcelas] = String(t.taxa_percentual)));
    setForm({
      modalidade: 'outro' as IdModalidade,
      nome: f.nome,
      tipo: f.tipo,
      id_loja: f.id_loja || '',
      taxa_percentual: String(f.taxa_percentual),
      taxa_fixa: String(f.taxa_fixa),
      prazo_recebimento_dias: String(f.prazo_recebimento_dias),
      permite_parcelamento: f.permite_parcelamento,
      parcelas_max: f.parcelas_max,
      parcelas_sem_juros: f.parcelas_sem_juros,
      repassar_juros_cliente: f.repassar_juros_cliente,
      ativo: f.ativo,
      ordem: String(f.ordem),
      taxas,
    });
    setErros({});
    setEditandoId(f.id_forma_pagamento);
    setDetalhe(null);
    rolarParaFormulario();
  };

  const validar = (): Erros => {
    const e: Erros = {};
    if (form.nome.trim().length < 2) e.nome = 'Informe o nome da forma de pagamento.';
    else if (
      formas.some(
        (f) =>
          f.id_forma_pagamento !== editandoId &&
          f.nome.trim().toLowerCase() === form.nome.trim().toLowerCase() &&
          (f.id_loja || '') === form.id_loja
      )
    ) {
      e.nome = 'Já existe uma forma de pagamento com este nome para esta loja.';
    }
    const taxa = num(form.taxa_percentual);
    if (!Number.isFinite(taxa) || taxa < 0 || taxa > 100) e.taxa_percentual = 'Taxa entre 0% e 100%.';
    const fixa = num(form.taxa_fixa);
    if (!Number.isFinite(fixa) || fixa < 0) e.taxa_fixa = 'Valor inválido.';
    const prazo = num(form.prazo_recebimento_dias);
    if (!Number.isInteger(prazo) || prazo < 0 || prazo > 365) e.prazo_recebimento_dias = 'Dias inteiros entre 0 e 365.';
    const ordem = num(form.ordem);
    if (String(form.ordem).trim() !== '' && (!Number.isFinite(ordem) || ordem < 0)) e.ordem = 'Use 0 ou um número maior.';
    if (form.parcelas_sem_juros > form.parcelas_max) e.parcelas_sem_juros = 'Não pode passar do máximo de parcelas.';
    if (form.permite_parcelamento) {
      for (let p = 1; p <= form.parcelas_max; p++) {
        const v = form.taxas[p];
        if (v !== undefined && v !== '' && (!Number.isFinite(num(v)) || num(v) < 0 || num(v) > 100)) {
          e.taxasTabela = `Taxa inválida em ${p}x (use valores entre 0 e 100).`;
          break;
        }
      }
    }
    return e;
  };

  const salvar = async () => {
    const e = validar();
    setErros(e);
    if (Object.keys(e).length > 0) return;

    const dados: FormaPagamentoInput = {
      nome: form.nome.trim(),
      tipo: form.tipo,
      id_loja: form.id_loja || null,
      taxa_percentual: num(form.taxa_percentual),
      taxa_fixa: num(form.taxa_fixa),
      prazo_recebimento_dias: num(form.prazo_recebimento_dias),
      permite_parcelamento: form.permite_parcelamento,
      parcelas_max: form.permite_parcelamento ? form.parcelas_max : 1,
      parcelas_sem_juros: form.permite_parcelamento ? form.parcelas_sem_juros : 1,
      repassar_juros_cliente: form.permite_parcelamento && form.repassar_juros_cliente,
      ativo: form.ativo,
      ordem: Number.isFinite(num(form.ordem)) ? Math.trunc(num(form.ordem)) : 0,
    };
    // Grava toda parcela preenchida, mesmo igual à taxa padrão: assim ela não muda sozinha quando a
    // taxa padrão for alterada depois. Parcelas em branco seguem a taxa padrão.
    const taxas = Object.entries(form.taxas)
      .map(([p, v]) => ({ parcelas: Number(p), taxa_percentual: num(v) }))
      .filter((t) => String(form.taxas[t.parcelas]).trim() !== '' && Number.isFinite(t.taxa_percentual))
      .filter((t) => t.parcelas <= dados.parcelas_max);

    setSalvando(true);
    try {
      await salvarFormaPagamento(dados, taxas, editandoId || undefined);
      avisarFormasPagamentoAlteradas();
      feedback.sucesso(editandoId ? 'Forma de pagamento atualizada.' : 'Forma de pagamento cadastrada.');
      limpar();
      await carregar();
    } catch (err: any) {
      feedback.erro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  const alternarAtivo = async (f: FormaPagamento) => {
    try {
      await alternarAtivoFormaPagamento(f.id_forma_pagamento, !f.ativo);
      avisarFormasPagamentoAlteradas();
      setFormas((lista) => lista.map((x) => (x.id_forma_pagamento === f.id_forma_pagamento ? { ...x, ativo: !x.ativo } : x)));
    } catch (err: any) {
      feedback.erro(err.message);
    }
  };

  const criarPadrao = async () => {
    setCriandoPadrao(true);
    try {
      await criarFormasPagamentoPadrao(formas);
      avisarFormasPagamentoAlteradas();
      feedback.sucesso('Formas de pagamento padrão criadas. As taxas de cartão ficam em Configurações › Taxas.');
      await carregar();
    } catch (err: any) {
      feedback.erro(err.message);
      await carregar(); // mostra as que chegaram a ser criadas; o botão continua para completar as restantes
    } finally {
      setCriandoPadrao(false);
    }
  };

  /** A única forma nativa de cada tipo só pode ser desativada (excluída, seria recriada na próxima carga). */
  const exclusaoBloqueada = (f: FormaPagamento) => ehNativa(f) && formas.filter((x) => x.tipo === f.tipo).length <= 1;

  const confirmarExclusao = async () => {
    if (!paraExcluir) return;
    setExcluindo(true);
    try {
      await excluirFormaPagamento(paraExcluir.id_forma_pagamento);
      avisarFormasPagamentoAlteradas();
      if (editandoId === paraExcluir.id_forma_pagamento) limpar();
      feedback.sucesso('Forma de pagamento excluída.');
      setParaExcluir(null);
      await carregar();
    } catch (err: any) {
      feedback.erro(err.message);
      setParaExcluir(null);
    } finally {
      setExcluindo(false);
    }
  };

  // Simulação do valor líquido recebido para cada número de parcelas, com a configuração atual do formulário
  const simulacao = useMemo(() => {
    const valor = num(valorSimulacao);
    if (!Number.isFinite(valor) || valor <= 0) return [];
    const base = num(form.taxa_percentual) || 0;
    const fixa = num(form.taxa_fixa) || 0;
    return Array.from({ length: parcelasAtivas }, (_, i) => {
      const p = i + 1;
      const tx = form.taxas[p] !== undefined && form.taxas[p] !== '' ? num(form.taxas[p]) : base;
      // Taxa digitada errado não vira 0%: a parcela aparece como inválida
      const valida = Number.isFinite(tx) && tx >= 0 && tx <= 100;
      const desconto = valida ? (valor * tx) / 100 + fixa : 0;
      return { parcelas: p, taxa: tx, valida, recebe: Math.max(0, valor - desconto), semJuros: p <= form.parcelas_sem_juros };
    });
  }, [valorSimulacao, form.taxa_percentual, form.taxa_fixa, form.taxas, form.parcelas_sem_juros, parcelasAtivas]);

  const nomeLoja = (id: string | null) => (id ? lojas.find((l) => l.id_loja === id)?.nome || 'Loja removida' : 'Todas as lojas');

  const resumoTaxa = (f: FormaPagamento) => {
    if (TIPOS_CARTAO.includes(f.tipo)) return 'Pela maquininha';
    if (TIPOS_SEM_TAXA.includes(f.tipo)) return 'Sem taxa';
    if (!f.permite_parcelamento || f.parcelas_max === 1) return formatarPercentual(f.taxa_percentual);
    const valores = Array.from({ length: f.parcelas_max }, (_, i) => obterTaxaParcela(f, i + 1));
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    return min === max ? formatarPercentual(min) : `${formatarPercentual(min)} a ${formatarPercentual(max)}`;
  };

  const resumoParcelamento = (f: FormaPagamento) => {
    if (TIPOS_CARTAO.includes(f.tipo)) return f.tipo === 'CARTAO_CREDITO' ? 'Pela maquininha' : 'À vista';
    if (!f.permite_parcelamento) return 'À vista';
    return `Até ${f.parcelas_max}x · ${f.parcelas_sem_juros > 1 ? `${f.parcelas_sem_juros}x s/ juros` : 'com juros'}`;
  };

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return formas.filter((f) => {
      if (filtro === 'ativas' && !f.ativo) return false;
      if (filtro === 'inativas' && f.ativo) return false;
      if (!q) return true;
      return [f.nome, TIPOS_FORMA_PAGAMENTO[f.tipo]?.label].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [formas, busca, filtro]);

  const faltamPadrao = formasPadraoFaltantes(formas).length;
  const taxaPropria = usaTaxaPropria(form.tipo);

  if (tabelaAusente) {
    return (
      <PaginaCadastro titulo="Formas de pagamento" descricao="Taxas, parcelamento e prazos de recebimento.">
        <AvisoTabelaAusente modulo="Formas de pagamento" />
      </PaginaCadastro>
    );
  }

  return (
    <PaginaCadastro
      titulo="Formas de pagamento"
      descricao="Parametrize as formas aceitas: taxas da maquininha, parcelamento e prazo de recebimento."
      acoes={
        !carregando && faltamPadrao > 0 ? (
          <button
            type="button"
            onClick={criarPadrao}
            disabled={criandoPadrao}
            title={`Cria as ${faltamPadrao} formas nativas que ainda não existem nesta conta`}
            className="px-4 py-2.5 bg-[#0c101a] hover:bg-zinc-800 border border-zinc-700/80 text-white rounded-xl text-xs font-semibold transition disabled:opacity-60"
          >
            {criandoPadrao ? 'Criando...' : 'Criar formas nativas'}
          </button>
        ) : undefined
      }
    >
      <feedback.Feedback />

      {/* Como a Nova OS usa este cadastro */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px] leading-relaxed">
        <div className="p-3 rounded-xl bg-[#0c101a] border border-zinc-800/80">
          <p className="font-bold text-zinc-200">Botões da Nova OS</p>
          <p className="text-zinc-500 mt-0.5">As formas ativas aparecem na Nova OS, na ordem definida aqui. Inativas ficam ocultas.</p>
        </div>
        <div className="p-3 rounded-xl bg-[#0c101a] border border-zinc-800/80">
          <p className="font-bold text-zinc-200">Cartão de crédito e débito</p>
          <p className="text-zinc-500 mt-0.5">
            Taxas e parcelas vêm da maquininha escolhida na OS (Configurações › Taxas). Duas formas de crédito viram um botão só.
          </p>
        </div>
        <div className="p-3 rounded-xl bg-[#0c101a] border border-zinc-800/80">
          <p className="font-bold text-zinc-200">Boleto, transferência e outras</p>
          <p className="text-zinc-500 mt-0.5">Usam a taxa, a taxa fixa e o parcelamento definidos aqui. PIX e dinheiro não têm taxa.</p>
        </div>
      </div>

      <CardFormulario
        titulo={editandoId ? 'Editar forma de pagamento' : 'Nova forma de pagamento'}
        subtitulo={editandoId ? `Alterando ${form.nome || 'forma de pagamento'}.` : 'Tipo, taxas, parcelamento e recebimento.'}
        editando={!!editandoId}
        salvando={salvando}
        rotuloSalvar={editandoId ? 'Salvar alterações' : '+ Cadastrar forma'}
        onSubmit={salvar}
        onLimpar={limpar}
      >
        <Secao titulo="Identificação">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {editandoId ? (
              // Na edição o tipo fica fixo: as OS já gravadas e os relatórios dependem dele
              <Campo label="Tipo" className="md:col-span-3">
                <div className={`${inputCls()} flex items-center gap-2`}>
                  <span className="truncate">{TIPOS_FORMA_PAGAMENTO[form.tipo].label}</span>
                  {ehNativa(form) && <Badge cor="azul">Nativa</Badge>}
                </div>
              </Campo>
            ) : (
              // As 4 nativas já existem na conta: aqui só as modalidades complementares
              <Campo label="Modalidade" obrigatorio dica={modalidade(form.modalidade).dica} className="md:col-span-3">
                <select value={form.modalidade} onChange={(e) => trocarModalidade(e.target.value as IdModalidade)} className={inputCls()}>
                  {MODALIDADES.map((m) => (
                    <option key={m.id} value={m.id}>{m.rotulo}</option>
                  ))}
                </select>
              </Campo>
            )}
            <Campo
              label="Nome de exibição"
              obrigatorio
              erro={erros.nome}
              dica={!editandoId && form.modalidade === 'outro' ? 'Nome exato da modalidade, como aparece na Nova OS.' : 'Como aparece na Nova OS e nos relatórios.'}
              className="md:col-span-4"
            >
              <input
                value={form.nome}
                onChange={(e) => atualizar('nome', e.target.value)}
                maxLength={40}
                placeholder={!editandoId && form.modalidade === 'outro' ? 'Ex: Vale-compra da loja' : 'Ex: Link InfinitePay'}
                className={inputCls(erros.nome)}
              />
            </Campo>
            <Campo label="Disponível em" className="md:col-span-3">
              <select value={form.id_loja} onChange={(e) => atualizar('id_loja', e.target.value)} className={inputCls()}>
                <option value="">Todas as lojas</option>
                {lojas.map((l) => (
                  <option key={l.id_loja} value={l.id_loja}>{l.nome}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Ordem" erro={erros.ordem} dica="Menor aparece primeiro na Nova OS." className="md:col-span-2">
              <input type="number" min={0} value={form.ordem} onChange={(e) => atualizar('ordem', e.target.value)} className={inputCls(erros.ordem)} />
            </Campo>
          </div>
        </Secao>

        <Secao titulo="Taxas e recebimento">
          {!taxaPropria && (
            <div className="p-3.5 rounded-xl bg-blue-500/[0.06] border border-blue-500/20 text-xs text-zinc-300">
              {TIPOS_CARTAO.includes(form.tipo)
                ? 'As taxas e o parcelamento do cartão usados na Nova OS vêm da maquininha (Configurações › Taxas). Aqui fica só o prazo de recebimento.'
                : `${TIPOS_FORMA_PAGAMENTO[form.tipo].label} não tem taxa: a loja recebe o valor integral.`}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {taxaPropria && (
              <>
                <Campo label="Taxa percentual (%)" erro={erros.taxa_percentual} dica={form.permite_parcelamento ? 'Taxa à vista / padrão das parcelas.' : 'Cobrada sobre cada venda.'}>
                  <input inputMode="decimal" value={form.taxa_percentual} onChange={(e) => atualizar('taxa_percentual', e.target.value)} className={inputCls(erros.taxa_percentual)} />
                </Campo>
                <Campo label="Taxa fixa por transação (R$)" erro={erros.taxa_fixa}>
                  <input inputMode="decimal" value={form.taxa_fixa} onChange={(e) => atualizar('taxa_fixa', e.target.value)} className={inputCls(erros.taxa_fixa)} />
                </Campo>
              </>
            )}
            <Campo label="Prazo de recebimento (dias)" erro={erros.prazo_recebimento_dias} dica={rotuloPrazo(num(form.prazo_recebimento_dias) || 0)}>
              <input type="number" min={0} max={365} value={form.prazo_recebimento_dias} onChange={(e) => atualizar('prazo_recebimento_dias', e.target.value)} className={inputCls(erros.prazo_recebimento_dias)} />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {PRAZOS_RAPIDOS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => atualizar('prazo_recebimento_dias', String(d))}
                    className={`px-2 py-1 rounded-lg border text-[10px] font-bold transition ${
                      num(form.prazo_recebimento_dias) === d
                        ? 'bg-blue-600/15 border-blue-500/40 text-blue-300'
                        : 'bg-[#080c14] border-zinc-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    D+{d}
                  </button>
                ))}
              </div>
            </Campo>
          </div>
        </Secao>

        {taxaPropria && (
        <Secao titulo="Parcelamento">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Toggle
              checked={form.permite_parcelamento}
              onChange={alternarParcelamento}
              disabled={!aceitaParcelamento}
              label="Permitir parcelamento"
              descricao={aceitaParcelamento ? 'Habilita a venda em mais de uma parcela.' : `${TIPOS_FORMA_PAGAMENTO[form.tipo].label} não aceita parcelamento.`}
            />
            <Toggle
              checked={form.repassar_juros_cliente}
              onChange={(v) => atualizar('repassar_juros_cliente', v)}
              disabled={!form.permite_parcelamento}
              label="Repassar juros ao cliente"
              descricao="Acima das parcelas sem juros, o acréscimo é cobrado do cliente."
            />
          </div>

          {form.permite_parcelamento && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Campo label="Máximo de parcelas">
                  <select
                    value={form.parcelas_max}
                    onChange={(e) => {
                      const max = Number(e.target.value);
                      setForm((f) => ({ ...f, parcelas_max: max, parcelas_sem_juros: Math.min(f.parcelas_sem_juros, max) }));
                    }}
                    className={inputCls()}
                  >
                    {Array.from({ length: MAX_PARCELAS - 1 }, (_, i) => i + 2).map((n) => (
                      <option key={n} value={n}>{n}x</option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Parcelas sem juros (para o cliente)" erro={erros.parcelas_sem_juros}>
                  <select value={form.parcelas_sem_juros} onChange={(e) => atualizar('parcelas_sem_juros', Number(e.target.value))} className={inputCls(erros.parcelas_sem_juros)}>
                    {Array.from({ length: form.parcelas_max }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{n === 1 ? 'Somente à vista' : `Até ${n}x`}</option>
                    ))}
                  </select>
                </Campo>
              </div>

              <div className="p-4 bg-[#080c14] border border-zinc-800/80 rounded-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-zinc-200">Taxa por número de parcelas (%)</p>
                    <p className="text-[11px] text-zinc-500">Em branco = usa a taxa percentual padrão ({formatarPercentual(num(form.taxa_percentual) || 0)}).</p>
                  </div>
                  <button type="button" onClick={preencherTaxasComBase} className="text-[11px] font-bold text-blue-400 hover:text-blue-300">
                    Preencher com a taxa padrão
                  </button>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                  {Array.from({ length: form.parcelas_max }, (_, i) => i + 1).map((p) => (
                    <label key={p} className="block">
                      <span className="block text-[10px] font-bold text-zinc-500 mb-1">
                        {p}x {p <= form.parcelas_sem_juros && <span className="text-emerald-400">· s/ juros</span>}
                      </span>
                      <input
                        inputMode="decimal"
                        value={form.taxas[p] ?? ''}
                        onChange={(e) => {
                          atualizar('taxas', { ...form.taxas, [p]: e.target.value });
                          if (erros.taxasTabela) setErros((er) => ({ ...er, taxasTabela: undefined }));
                        }}
                        placeholder={form.taxa_percentual}
                        className="w-full px-2.5 py-1.5 bg-[#0c101a] border border-zinc-800 rounded-lg text-xs text-white outline-none focus:border-blue-500"
                      />
                    </label>
                  ))}
                </div>
                {erros.taxasTabela && <p className="text-[11px] text-red-400 font-semibold">{erros.taxasTabela}</p>}
              </div>
            </>
          )}
        </Secao>
        )}

        {taxaPropria && (
        <Secao titulo="Simulação de recebimento">
          <div className="p-4 bg-[#080c14] border border-zinc-800/80 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span>Em uma venda de</span>
              <div className="flex items-center bg-[#0c101a] border border-zinc-800 rounded-lg px-2 focus-within:border-blue-500">
                <span className="text-zinc-500 text-[11px] font-bold">R$</span>
                <input
                  inputMode="decimal"
                  value={valorSimulacao}
                  onChange={(e) => setValorSimulacao(e.target.value)}
                  className="w-20 bg-transparent px-1.5 py-1 text-xs text-white font-bold outline-none"
                />
              </div>
              <span>
                você recebe ({rotuloPrazo(num(form.prazo_recebimento_dias) || 0)}):
              </span>
            </div>
            {simulacao.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {simulacao.map((s) => (
                  <div key={s.parcelas} className="p-2.5 bg-[#0c101a] border border-zinc-800 rounded-lg">
                    <p className="text-[10px] font-bold text-zinc-500">
                      {s.parcelas === 1 ? 'À vista' : `${s.parcelas}x`} · {s.valida ? formatarPercentual(s.taxa) : 'taxa inválida'}
                    </p>
                    <p className={`text-sm font-extrabold mt-0.5 ${s.valida ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {s.valida ? formatarMoeda(s.recebe) : '—'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Secao>
        )}

        <div className="md:w-1/2">
          <Toggle checked={form.ativo} onChange={(v) => atualizar('ativo', v)} label="Forma ativa" descricao="Formas inativas não aparecem na Nova OS." />
        </div>
      </CardFormulario>

      {carregando ? (
        <Carregando />
      ) : (
        <ListaCadastro
          titulo="Formas cadastradas"
          total={filtradas.length}
          busca={busca}
          onBusca={setBusca}
          placeholderBusca="Buscar por nome ou tipo..."
          filtros={
            <FiltroSegmentado
              valor={filtro}
              onChange={setFiltro}
              opcoes={[
                { valor: 'todas', label: 'Todas' },
                { valor: 'ativas', label: 'Ativas' },
                { valor: 'inativas', label: 'Inativas' },
              ]}
            />
          }
        >
          {/* Celular: cards sem rolagem lateral */}
          {filtradas.length > 0 && (
            <ul className="md:hidden divide-y divide-zinc-800/50">
              {filtradas.map((f) => (
                <li key={f.id_forma_pagamento} className={`px-4 py-3 space-y-1.5 ${editandoId === f.id_forma_pagamento ? 'bg-blue-500/5' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-white text-sm truncate">
                        {f.nome} {ehNativa(f) && <Badge cor="azul">Nativa do sistema</Badge>}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {TIPOS_FORMA_PAGAMENTO[f.tipo]?.label} · {nomeLoja(f.id_loja)}
                      </p>
                    </div>
                    <button type="button" onClick={() => alternarAtivo(f)} className="shrink-0" title={f.ativo ? 'Toque para desativar' : 'Toque para ativar'}>
                      {f.ativo ? <Badge cor="verde">Ativa</Badge> : <Badge cor="cinza">Inativa</Badge>}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-zinc-400 truncate">
                      {resumoTaxa(f)}
                      {usaTaxaPropria(f.tipo) && f.taxa_fixa > 0 && ` + ${formatarMoeda(f.taxa_fixa)}`} · {resumoParcelamento(f)} · {rotuloPrazo(f.prazo_recebimento_dias)}
                    </p>
                    <div className="shrink-0">
                      <AcoesLinha onVer={() => setDetalhe(f)} onEditar={() => iniciarEdicao(f)} onExcluir={() => setParaExcluir(f)} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className={filtradas.length > 0 ? 'hidden md:block' : ''}>
          <TabelaCadastro
            colunas={['Forma', 'Taxa', 'Parcelamento', 'Recebimento', 'Loja', 'Status', 'Ações']}
            vazio={filtradas.length === 0}
            mensagemVazio={
              formas.length === 0
                ? 'Não foi possível criar as formas nativas (PIX, dinheiro, débito e crédito). Use "Criar formas nativas" para tentar de novo.'
                : 'Nenhuma forma encontrada com esses filtros.'
            }
          >
            {filtradas.map((f) => (
              <tr key={f.id_forma_pagamento} className={`hover:bg-zinc-800/20 transition ${editandoId === f.id_forma_pagamento ? 'bg-blue-500/5' : ''}`}>
                <td className="px-4 sm:px-5 py-3">
                  <p className="font-bold text-white flex flex-wrap items-center gap-1.5">
                    {f.nome} {ehNativa(f) && <Badge cor="azul">Nativa do sistema</Badge>}
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{TIPOS_FORMA_PAGAMENTO[f.tipo]?.label}</p>
                </td>
                <td className="px-4 sm:px-5 py-3 text-zinc-300 whitespace-nowrap">
                  {resumoTaxa(f)}
                  {usaTaxaPropria(f.tipo) && f.taxa_fixa > 0 && <span className="text-zinc-500"> + {formatarMoeda(f.taxa_fixa)}</span>}
                </td>
                <td className="px-4 sm:px-5 py-3 text-zinc-300 whitespace-nowrap">{resumoParcelamento(f)}</td>
                <td className="px-4 sm:px-5 py-3 text-zinc-300 whitespace-nowrap">{rotuloPrazo(f.prazo_recebimento_dias)}</td>
                <td className="px-4 sm:px-5 py-3 text-zinc-300">{nomeLoja(f.id_loja)}</td>
                <td className="px-4 sm:px-5 py-3">
                  <button type="button" onClick={() => alternarAtivo(f)} title={f.ativo ? 'Clique para desativar' : 'Clique para ativar'}>
                    {f.ativo ? <Badge cor="verde">Ativa</Badge> : <Badge cor="cinza">Inativa</Badge>}
                  </button>
                </td>
                <td className="px-4 sm:px-5 py-2">
                  <AcoesLinha onVer={() => setDetalhe(f)} onEditar={() => iniciarEdicao(f)} onExcluir={() => setParaExcluir(f)} />
                </td>
              </tr>
            ))}
          </TabelaCadastro>
          </div>
        </ListaCadastro>
      )}

      {detalhe && (
        <ModalDetalhes
          titulo={detalhe.nome}
          subtitulo={
            <div className="flex gap-1.5">
              <Badge cor="azul">{TIPOS_FORMA_PAGAMENTO[detalhe.tipo]?.label}</Badge>
              {detalhe.ativo ? <Badge cor="verde">Ativa</Badge> : <Badge cor="cinza">Inativa</Badge>}
            </div>
          }
          itens={[
            ...((usaTaxaPropria(detalhe.tipo)
              ? [
                  ['Taxa percentual', formatarPercentual(detalhe.taxa_percentual)],
                  ['Taxa fixa', formatarMoeda(detalhe.taxa_fixa)],
                  ['Parcelamento', detalhe.permite_parcelamento ? `Até ${detalhe.parcelas_max}x (${detalhe.parcelas_sem_juros}x sem juros)` : 'Somente à vista'],
                  ['Juros repassados ao cliente', detalhe.repassar_juros_cliente ? 'Sim' : 'Não'],
                ]
              : [
                  ['Taxa', resumoTaxa(detalhe)],
                  ['Parcelamento', resumoParcelamento(detalhe)],
                ]) as [string, string][]),
            ['Recebimento', rotuloPrazo(detalhe.prazo_recebimento_dias)],
            ['Loja', nomeLoja(detalhe.id_loja)],
            ['Cadastrada em', formatarDataHora(detalhe.created_at)],
          ]}
          extra={
            usaTaxaPropria(detalhe.tipo) && detalhe.permite_parcelamento && (
              <div>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Taxa por parcela</p>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {Array.from({ length: detalhe.parcelas_max }, (_, i) => i + 1).map((p) => (
                    <div key={p} className="px-2 py-1.5 bg-[#080c14] border border-zinc-800/80 rounded-lg text-center">
                      <p className="text-[10px] font-bold text-zinc-500">{p}x</p>
                      <p className="text-xs font-bold text-zinc-200">{formatarPercentual(obterTaxaParcela(detalhe, p))}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          }
          onFechar={() => setDetalhe(null)}
          onEditar={() => iniciarEdicao(detalhe)}
        />
      )}

      {paraExcluir && (
        <ModalConfirmacao
          titulo="Excluir forma de pagamento"
          mensagem={
            exclusaoBloqueada(paraExcluir) ? (
              <>
                <strong className="text-zinc-200">{paraExcluir.nome}</strong> é uma forma nativa do sistema e não pode ser
                excluída. Para tirá-la da Nova OS, desative a forma.
              </>
            ) : (
              <>
                Excluir <strong className="text-zinc-200">{paraExcluir.nome}</strong>? As ordens de serviço já registradas
                não são alteradas. Para apenas ocultá-la da Nova OS, desative em vez de excluir.
              </>
            )
          }
          rotuloConfirmar={exclusaoBloqueada(paraExcluir) ? 'Desativar forma' : 'Excluir forma'}
          carregando={excluindo}
          onConfirmar={
            exclusaoBloqueada(paraExcluir)
              ? async () => {
                  const alvo = paraExcluir;
                  setParaExcluir(null);
                  if (alvo.ativo) await alternarAtivo(alvo);
                }
              : confirmarExclusao
          }
          onCancelar={() => setParaExcluir(null)}
        />
      )}
    </PaginaCadastro>
  );
};
