import React, { useEffect, useMemo, useState } from 'react';
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

const formVazio = () => ({
  nome: '',
  tipo: 'CARTAO_CREDITO' as TipoFormaPagamento,
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
type FormForma = ReturnType<typeof formVazio>;
type Erros = Partial<Record<keyof FormForma | 'taxasTabela', string>>;

const num = (v: string) => Number(String(v).replace(',', '.'));
const rotuloPrazo = (d: number) => (d === 0 ? 'Na hora (D+0)' : `D+${d}`);

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

  const carregar = async () => {
    try {
      const [listaF, listaL] = await Promise.all([listarFormasPagamento(), listarLojas()]);
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

  // Regras por tipo: Dinheiro/PIX/Débito/Transferência nunca parcelam; Dinheiro e PIX sem taxa e recebimento imediato
  const trocarTipo = (tipo: TipoFormaPagamento) => {
    setForm((f) => {
      const novo = { ...f, tipo, nome: f.nome || TIPOS_FORMA_PAGAMENTO[tipo].label };
      if (!TIPOS_FORMA_PAGAMENTO[tipo].aceitaParcelamento) {
        Object.assign(novo, { permite_parcelamento: false, parcelas_max: 1, parcelas_sem_juros: 1, repassar_juros_cliente: false });
      }
      if (tipo === 'DINHEIRO' || tipo === 'PIX') {
        Object.assign(novo, { taxa_percentual: '0', taxa_fixa: '0', prazo_recebimento_dias: '0' });
      }
      return novo;
    });
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
    // Só grava as parcelas com taxa diferente da base (as demais usam a taxa base)
    const taxas = Object.entries(form.taxas)
      .map(([p, v]) => ({ parcelas: Number(p), taxa_percentual: num(v) }))
      .filter((t) => String(form.taxas[t.parcelas]).trim() !== '' && Number.isFinite(t.taxa_percentual))
      .filter((t) => t.parcelas <= dados.parcelas_max && t.taxa_percentual !== dados.taxa_percentual);

    setSalvando(true);
    try {
      await salvarFormaPagamento(dados, taxas, editandoId || undefined);
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
      setFormas((lista) => lista.map((x) => (x.id_forma_pagamento === f.id_forma_pagamento ? { ...x, ativo: !x.ativo } : x)));
    } catch (err: any) {
      feedback.erro(err.message);
    }
  };

  const criarPadrao = async () => {
    setCriandoPadrao(true);
    try {
      await criarFormasPagamentoPadrao();
      feedback.sucesso('Formas de pagamento padrão criadas. Ajuste as taxas conforme sua maquininha.');
      await carregar();
    } catch (err: any) {
      feedback.erro(err.message);
    } finally {
      setCriandoPadrao(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!paraExcluir) return;
    setExcluindo(true);
    try {
      await excluirFormaPagamento(paraExcluir.id_forma_pagamento);
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
      const tx = form.taxas[p] !== undefined && form.taxas[p] !== '' ? num(form.taxas[p]) || 0 : base;
      const desconto = (valor * tx) / 100 + fixa;
      return { parcelas: p, taxa: tx, recebe: Math.max(0, valor - desconto), semJuros: p <= form.parcelas_sem_juros };
    });
  }, [valorSimulacao, form.taxa_percentual, form.taxa_fixa, form.taxas, form.parcelas_sem_juros, parcelasAtivas]);

  const nomeLoja = (id: string | null) => (id ? lojas.find((l) => l.id_loja === id)?.nome || 'Loja removida' : 'Todas as lojas');

  const resumoTaxa = (f: FormaPagamento) => {
    if (!f.permite_parcelamento || f.parcelas_max === 1) return formatarPercentual(f.taxa_percentual);
    const valores = Array.from({ length: f.parcelas_max }, (_, i) => obterTaxaParcela(f, i + 1));
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    return min === max ? formatarPercentual(min) : `${formatarPercentual(min)} a ${formatarPercentual(max)}`;
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
        !carregando && formas.length === 0 ? (
          <button
            type="button"
            onClick={criarPadrao}
            disabled={criandoPadrao}
            className="px-4 py-2.5 bg-[#0c101a] hover:bg-zinc-800 border border-zinc-700/80 text-white rounded-xl text-xs font-semibold transition disabled:opacity-60"
          >
            {criandoPadrao ? 'Criando...' : 'Criar formas padrão'}
          </button>
        ) : undefined
      }
    >
      <feedback.Feedback />

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
            <Campo label="Tipo" obrigatorio className="md:col-span-3">
              <select value={form.tipo} onChange={(e) => trocarTipo(e.target.value as TipoFormaPagamento)} className={inputCls()}>
                {(Object.keys(TIPOS_FORMA_PAGAMENTO) as TipoFormaPagamento[]).map((t) => (
                  <option key={t} value={t}>{TIPOS_FORMA_PAGAMENTO[t].label}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Nome de exibição" obrigatorio erro={erros.nome} dica="Como aparece na Nova OS. Ex: Crédito Stone" className="md:col-span-4">
              <input value={form.nome} onChange={(e) => atualizar('nome', e.target.value)} placeholder="Ex: Cartão de crédito" className={inputCls(erros.nome)} />
            </Campo>
            <Campo label="Disponível em" className="md:col-span-3">
              <select value={form.id_loja} onChange={(e) => atualizar('id_loja', e.target.value)} className={inputCls()}>
                <option value="">Todas as lojas</option>
                {lojas.map((l) => (
                  <option key={l.id_loja} value={l.id_loja}>{l.nome}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Ordem" dica="Menor aparece primeiro." className="md:col-span-2">
              <input type="number" min={0} value={form.ordem} onChange={(e) => atualizar('ordem', e.target.value)} className={inputCls()} />
            </Campo>
          </div>
        </Secao>

        <Secao titulo="Taxas e recebimento">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Campo label="Taxa percentual (%)" erro={erros.taxa_percentual} dica={form.permite_parcelamento ? 'Taxa à vista / padrão das parcelas.' : 'Cobrada sobre cada venda.'}>
              <input inputMode="decimal" value={form.taxa_percentual} onChange={(e) => atualizar('taxa_percentual', e.target.value)} className={inputCls(erros.taxa_percentual)} />
            </Campo>
            <Campo label="Taxa fixa por transação (R$)" erro={erros.taxa_fixa}>
              <input inputMode="decimal" value={form.taxa_fixa} onChange={(e) => atualizar('taxa_fixa', e.target.value)} className={inputCls(erros.taxa_fixa)} />
            </Campo>
            <Campo label="Prazo de recebimento (dias)" erro={erros.prazo_recebimento_dias} dica={rotuloPrazo(num(form.prazo_recebimento_dias) || 0)}>
              <input type="number" min={0} max={365} value={form.prazo_recebimento_dias} onChange={(e) => atualizar('prazo_recebimento_dias', e.target.value)} className={inputCls(erros.prazo_recebimento_dias)} />
            </Campo>
          </div>
        </Secao>

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
                      {s.parcelas === 1 ? 'À vista' : `${s.parcelas}x`} · {formatarPercentual(s.taxa)}
                    </p>
                    <p className="text-sm font-extrabold text-emerald-400 mt-0.5">{formatarMoeda(s.recebe)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Secao>

        <div className="md:w-1/2">
          <Toggle checked={form.ativo} onChange={(v) => atualizar('ativo', v)} label="Forma ativa" descricao="Formas inativas não aparecem para seleção nas vendas." />
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
          <TabelaCadastro
            colunas={['Forma', 'Taxa', 'Parcelamento', 'Recebimento', 'Loja', 'Status', 'Ações']}
            vazio={filtradas.length === 0}
            mensagemVazio={
              formas.length === 0
                ? 'Nenhuma forma cadastrada. Use "Criar formas padrão" para começar com Dinheiro, PIX, Débito e Crédito.'
                : 'Nenhuma forma encontrada com esses filtros.'
            }
          >
            {filtradas.map((f) => (
              <tr key={f.id_forma_pagamento} className={`hover:bg-zinc-800/20 transition ${editandoId === f.id_forma_pagamento ? 'bg-blue-500/5' : ''}`}>
                <td className="px-4 sm:px-5 py-3">
                  <p className="font-bold text-white">{f.nome}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{TIPOS_FORMA_PAGAMENTO[f.tipo]?.label}</p>
                </td>
                <td className="px-4 sm:px-5 py-3 text-zinc-300 whitespace-nowrap">
                  {resumoTaxa(f)}
                  {f.taxa_fixa > 0 && <span className="text-zinc-500"> + {formatarMoeda(f.taxa_fixa)}</span>}
                </td>
                <td className="px-4 sm:px-5 py-3 text-zinc-300 whitespace-nowrap">
                  {f.permite_parcelamento ? (
                    <>
                      Até {f.parcelas_max}x
                      <span className="text-zinc-500"> · {f.parcelas_sem_juros > 1 ? `${f.parcelas_sem_juros}x s/ juros` : 'com juros'}</span>
                    </>
                  ) : (
                    <span className="text-zinc-500">À vista</span>
                  )}
                </td>
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
            ['Taxa percentual', formatarPercentual(detalhe.taxa_percentual)],
            ['Taxa fixa', formatarMoeda(detalhe.taxa_fixa)],
            ['Recebimento', rotuloPrazo(detalhe.prazo_recebimento_dias)],
            ['Loja', nomeLoja(detalhe.id_loja)],
            ['Parcelamento', detalhe.permite_parcelamento ? `Até ${detalhe.parcelas_max}x (${detalhe.parcelas_sem_juros}x sem juros)` : 'Somente à vista'],
            ['Juros repassados ao cliente', detalhe.repassar_juros_cliente ? 'Sim' : 'Não'],
            ['Cadastrada em', formatarDataHora(detalhe.created_at)],
          ]}
          extra={
            detalhe.permite_parcelamento && (
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
            <>
              Excluir <strong className="text-zinc-200">{paraExcluir.nome}</strong>? As ordens de serviço já registradas
              não são alteradas. Para apenas ocultá-la das vendas, desative em vez de excluir.
            </>
          }
          rotuloConfirmar="Excluir forma"
          carregando={excluindo}
          onConfirmar={confirmarExclusao}
          onCancelar={() => setParaExcluir(null)}
        />
      )}
    </PaginaCadastro>
  );
};
