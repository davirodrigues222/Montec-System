import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { buscarOrdensServico, contaNoFaturamento, filtrarOrdensPorCompetenciaMensal } from '../services/api';
import { type Fornecedor, listarFornecedores, parseMoedaBR } from '../services/cadastros';
import {
  CATEGORIAS_DESPESA,
  type DadosDespesa,
  type Despesa,
  DespesasAusenteError,
  atualizarDespesa,
  criarDespesa,
  excluirDespesa,
  hojeISO,
  listarDespesas,
  marcarDespesaPaga,
  situacaoDespesa,
  somarDespesas,
} from '../services/despesas';
import {
  AcoesLinha,
  Badge,
  Campo,
  CardFormulario,
  Carregando,
  FiltroSegmentado,
  ListaCadastro,
  Modal,
  ModalDetalhes,
  PaginaCadastro,
  TabelaCadastro,
  Toggle,
  inputCls,
  rolarParaFormulario,
  useFeedback,
} from '../components/cadastros/ui';
import type { OrdemServico } from '../types';
import { lucroOS, somar } from '../utils/financeiroOS';
import { formatarValor } from '../utils/formatadores';

// ==========================================
// Despesas da loja e resultado do mês: lucro das OS − despesas = o que sobrou para a loja.
// ==========================================

const mesDe = (data: string) => data.slice(0, 7);
const somarMes = (mes: string, n: number) => {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const nomeMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  const t = new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const dataBR = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');

/** Vencimento sugerido ao lançar: hoje, ou o dia 1 se o mês na tela não for o atual. */
const vencimentoPadrao = (mes: string) => (mesDe(hojeISO()) === mes ? hojeISO() : `${mes}-01`);

const formVazio = (mes: string) => ({
  descricao: '',
  categoria: '',
  valor: '',
  data: vencimentoPadrao(mes),
  pago: false,
  dataPagamento: '',
  formaPagamento: '',
  idFornecedor: '',
  observacoes: '',
  repetir: '1',
});
type FormDespesa = ReturnType<typeof formVazio>;
type Erros = Partial<Record<keyof FormDespesa, string>>;
type Filtro = 'TODAS' | 'PENDENTES' | 'PAGAS';

const BadgeSituacao: React.FC<{ d: Despesa }> = ({ d }) => {
  const s = situacaoDespesa(d);
  return s === 'PAGA' ? (
    <Badge cor="verde">Paga{d.data_pagamento ? ` em ${dataBR(d.data_pagamento).slice(0, 5)}` : ''}</Badge>
  ) : s === 'VENCIDA' ? (
    <Badge cor="vermelho">Vencida</Badge>
  ) : (
    <Badge cor="azul">A pagar</Badge>
  );
};

export const Despesas: React.FC = () => {
  const [mes, setMes] = useState(() => mesDe(hojeISO()));
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [ordens, setOrdens] = useState<OrdemServico[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ausente, setAusente] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [form, setForm] = useState<FormDespesa>(() => formVazio(mesDe(hojeISO())));
  const [erros, setErros] = useState<Erros>({});
  const [editando, setEditando] = useState<Despesa | null>(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('TODAS');
  const [detalhe, setDetalhe] = useState<Despesa | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Despesa | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [marcando, setMarcando] = useState<string | null>(null);
  const feedback = useFeedback();

  const carregar = async () => {
    try {
      const [lista, os, forn] = await Promise.all([
        listarDespesas(),
        buscarOrdensServico().catch(() => [] as OrdemServico[]),
        listarFornecedores().catch(() => [] as Fornecedor[]),
      ]);
      setDespesas(lista);
      setOrdens(os);
      setFornecedores(forn);
      setAusente(false);
    } catch (e: any) {
      if (e instanceof DespesasAusenteError) setAusente(true);
      else feedback.erro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const mudarMes = (n: number) => {
    const novo = somarMes(mes, n);
    setMes(novo);
    if (!editando) setForm((f) => ({ ...f, data: vencimentoPadrao(novo) }));
  };

  const atualizar = <K extends keyof FormDespesa>(campo: K, valor: FormDespesa[K]) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    if (erros[campo]) setErros((e) => ({ ...e, [campo]: undefined }));
  };

  const limpar = () => {
    setForm(formVazio(mes));
    setErros({});
    setEditando(null);
  };

  const iniciarEdicao = (d: Despesa) => {
    setForm({
      descricao: d.descricao,
      categoria: d.categoria,
      valor: formatarValor(d.valor),
      data: d.data,
      pago: d.pago,
      dataPagamento: d.data_pagamento || '',
      formaPagamento: d.forma_pagamento || '',
      idFornecedor: d.id_fornecedor || '',
      observacoes: d.observacoes || '',
      repetir: '1',
    });
    setErros({});
    setEditando(d);
    setDetalhe(null);
    rolarParaFormulario();
  };

  const validar = (): Erros => {
    const e: Erros = {};
    if (form.descricao.trim().length < 2) e.descricao = 'Informe a descrição.';
    const valor = parseMoedaBR(form.valor);
    if (valor === null || valor <= 0) e.valor = 'Informe um valor maior que zero.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.data)) e.data = 'Informe o vencimento.';
    if (form.pago && form.dataPagamento && !/^\d{4}-\d{2}-\d{2}$/.test(form.dataPagamento)) e.dataPagamento = 'Data inválida.';
    return e;
  };

  const salvar = async () => {
    const e = validar();
    setErros(e);
    if (Object.keys(e).length > 0) return;

    const dados: DadosDespesa = {
      descricao: form.descricao,
      categoria: form.categoria || 'Outros',
      valor: parseMoedaBR(form.valor)!,
      data: form.data,
      pago: form.pago,
      data_pagamento: form.pago ? form.dataPagamento || hojeISO() : null,
      forma_pagamento: form.formaPagamento,
      id_fornecedor: form.idFornecedor || null,
      observacoes: form.observacoes,
    };
    const repetir = Number(form.repetir) || 1;
    setSalvando(true);
    try {
      if (editando) await atualizarDespesa(editando.id, dados);
      else await criarDespesa(dados, repetir);
      feedback.sucesso(
        editando ? 'Despesa atualizada.' : repetir > 1 ? `Despesa lançada em ${repetir} meses, a partir de ${dataBR(form.data)}.` : 'Despesa lançada.'
      );
      if (!editando && mesDe(form.data) !== mes) setMes(mesDe(form.data));
      setForm(formVazio(editando ? mes : mesDe(form.data)));
      setEditando(null);
      setErros({});
      await carregar();
    } catch (err: any) {
      feedback.erro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  const alternarPaga = async (d: Despesa) => {
    setMarcando(d.id);
    try {
      await marcarDespesaPaga(d.id, !d.pago);
      setDespesas((lista) => lista.map((x) => (x.id === d.id ? { ...x, pago: !d.pago, data_pagamento: !d.pago ? hojeISO() : null } : x)));
    } catch (err: any) {
      feedback.erro(err.message);
    } finally {
      setMarcando(null);
    }
  };

  const confirmarExclusao = async (eProximas: boolean) => {
    if (!paraExcluir) return;
    setExcluindo(true);
    try {
      const n = await excluirDespesa(paraExcluir, eProximas);
      if (editando?.id === paraExcluir.id) limpar();
      feedback.sucesso(n > 1 ? `${n} despesas excluídas.` : 'Despesa excluída.');
      setParaExcluir(null);
      await carregar();
    } catch (err: any) {
      feedback.erro(err.message);
      setParaExcluir(null);
    } finally {
      setExcluindo(false);
    }
  };

  // ---------- Números do mês ----------
  const doMes = useMemo(() => despesas.filter((d) => mesDe(d.data) === mes), [despesas, mes]);
  const totalMes = somarDespesas(doMes);
  const pendentes = doMes.filter((d) => !d.pago);
  const vencidas = pendentes.filter((d) => situacaoDespesa(d) === 'VENCIDA');
  const lucroDasOS = useMemo(
    () => somar(filtrarOrdensPorCompetenciaMensal(ordens, mes).filter(contaNoFaturamento), lucroOS),
    [ordens, mes]
  );
  const resultado = lucroDasOS - totalMes;

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, number>();
    doMes.forEach((d) => mapa.set(d.categoria, (mapa.get(d.categoria) || 0) + d.valor));
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
  }, [doMes]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return doMes
      .filter((d) => (filtro === 'PENDENTES' ? !d.pago : filtro === 'PAGAS' ? d.pago : true))
      .filter((d) => !q || [d.descricao, d.categoria, d.observacoes, d.forma_pagamento].some((v) => (v || '').toLowerCase().includes(q)));
  }, [doMes, busca, filtro]);

  const nomeFornecedor = (id: string | null) => (id ? fornecedores.find((f) => f.id_fornecedor === id)?.nome || '' : '');

  const exportarCSV = () => {
    if (doMes.length === 0) {
      alert('Não há despesas neste mês para exportar.');
      return;
    }
    const cel = (v: unknown) => {
      const t = String(v ?? '');
      return `"${(/^[=+\-@\t\r]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`;
    };
    const linhas = [
      'Descricao,Categoria,Vencimento,Valor,Situacao,Data pagamento,Forma pagamento,Fornecedor,Observacoes',
      ...doMes.map((d) =>
        [
          cel(d.descricao),
          cel(d.categoria),
          dataBR(d.data),
          d.valor.toFixed(2),
          { PAGA: 'Paga', VENCIDA: 'Vencida', A_PAGAR: 'A pagar' }[situacaoDespesa(d)],
          dataBR(d.data_pagamento),
          cel(d.forma_pagamento),
          cel(nomeFornecedor(d.id_fornecedor)),
          cel(d.observacoes),
        ].join(',')
      ),
    ];
    const url = URL.createObjectURL(new Blob([linhas.join('\n')], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `despesas_${mes}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!carregando && ausente) {
    return (
      <PaginaCadastro titulo="Despesas da loja" descricao="Aluguel, energia, salários e outras contas, para ver o resultado real do mês.">
        <div className="bg-[#0c101a] border border-blue-500/30 rounded-2xl p-6">
          <p className="text-sm font-bold text-blue-400">As despesas ainda não foram ativadas no banco de dados</p>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            Execute a migração{' '}
            <code className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-200 text-[11px]">supabase/migrations/20261108120000_despesas.sql</code> no SQL
            Editor do Supabase e recarregue esta página.
          </p>
        </div>
      </PaginaCadastro>
    );
  }

  return (
    <PaginaCadastro
      titulo="Despesas da loja"
      descricao="Aluguel, energia, salários e outras contas. Lucro das OS − despesas = resultado da loja no mês."
      acoes={
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#0c101a] border border-zinc-800 rounded-xl">
            <button type="button" onClick={() => mudarMes(-1)} aria-label="Mês anterior" className="p-2.5 text-zinc-400 hover:text-white transition">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-1 min-w-[9.5rem] text-center text-xs font-bold text-white">{nomeMes(mes)}</span>
            <button type="button" onClick={() => mudarMes(1)} aria-label="Próximo mês" className="p-2.5 text-zinc-400 hover:text-white transition">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={exportarCSV}
            title="Exportar despesas do mês (CSV)"
            aria-label="Exportar despesas do mês"
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
          {/* ---------- Resultado do mês ---------- */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { rotulo: 'Lucro das OS', valor: lucroDasOS, cor: 'text-white', dica: 'Líquido recebido − peças, fretes e garantias' },
              { rotulo: 'Despesas da loja', valor: totalMes, cor: 'text-rose-400', dica: `${doMes.length} lançamento(s) no mês`, sinal: '−' },
              {
                rotulo: 'Resultado da loja',
                valor: resultado,
                cor: resultado >= 0 ? 'text-emerald-400' : 'text-rose-400',
                dica: resultado >= 0 ? 'O que sobrou no mês' : 'As despesas passaram o lucro',
                sinal: '=',
              },
              {
                rotulo: 'A pagar',
                valor: somarDespesas(pendentes),
                cor: vencidas.length ? 'text-rose-400' : 'text-blue-300',
                dica: vencidas.length ? `${vencidas.length} vencida(s)` : `${pendentes.length} conta(s) em aberto`,
              },
            ].map((c) => (
              <div key={c.rotulo} className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-4 min-w-0">
                <span className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider truncate">
                  {c.sinal && <span className="text-zinc-500 mr-1">{c.sinal}</span>}
                  {c.rotulo}
                </span>
                <span className={`block text-lg sm:text-2xl font-extrabold mt-1 tabular-nums truncate ${c.cor}`}>R$ {formatarValor(c.valor)}</span>
                <span className="block text-[10px] text-zinc-500 mt-0.5 truncate">{c.dica}</span>
              </div>
            ))}
          </div>

          {porCategoria.length > 0 && (
            <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">Para onde foi o dinheiro</h3>
              {porCategoria.map(([cat, valor]) => {
                const pct = totalMes > 0 ? Math.round((valor / totalMes) * 100) : 0;
                return (
                  <div key={cat}>
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium text-zinc-300 truncate">{cat}</span>
                      <span className="shrink-0 ml-3">
                        <strong className="text-white">R$ {formatarValor(valor)}</strong> <span className="text-zinc-400 font-semibold">{pct}%</span>
                      </span>
                    </div>
                    <div className="w-full bg-zinc-800/80 rounded-full h-2 overflow-hidden">
                      <div className="bg-blue-600 h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <CardFormulario
        titulo={editando ? 'Editar despesa' : 'Lançar despesa'}
        subtitulo={editando ? `Alterando "${editando.descricao}".` : 'Contas fixas (aluguel, internet) podem ser repetidas nos próximos meses.'}
        editando={!!editando}
        salvando={salvando}
        rotuloSalvar={editando ? 'Salvar alterações' : '+ Lançar despesa'}
        onSubmit={salvar}
        onLimpar={limpar}
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <Campo label="Descrição" obrigatorio erro={erros.descricao} className="md:col-span-5">
            <input value={form.descricao} onChange={(e) => atualizar('descricao', e.target.value)} placeholder="Ex: Aluguel da loja" className={inputCls(erros.descricao)} />
          </Campo>
          <Campo label="Categoria" className="md:col-span-4">
            <select value={form.categoria} onChange={(e) => atualizar('categoria', e.target.value)} className={inputCls()}>
              <option value="">Selecione...</option>
              {CATEGORIAS_DESPESA.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              {form.categoria && !CATEGORIAS_DESPESA.includes(form.categoria) && <option value={form.categoria}>{form.categoria}</option>}
            </select>
          </Campo>
          <Campo label="Valor (R$)" obrigatorio erro={erros.valor} className="md:col-span-3">
            <input inputMode="decimal" value={form.valor} onChange={(e) => atualizar('valor', e.target.value)} placeholder="0,00" className={inputCls(erros.valor)} />
          </Campo>

          <Campo label="Vencimento" obrigatorio erro={erros.data} dica="Define o mês da despesa." className="md:col-span-3">
            <input type="date" value={form.data} onChange={(e) => atualizar('data', e.target.value)} className={`${inputCls(erros.data)} [color-scheme:dark]`} />
          </Campo>
          {!editando && (
            <Campo label="Repetir" className="md:col-span-3">
              <select value={form.repetir} onChange={(e) => atualizar('repetir', e.target.value)} className={inputCls()}>
                <option value="1">Só este mês</option>
                {[2, 3, 6, 12, 24].map((n) => (
                  <option key={n} value={n}>
                    Todo mês por {n} meses
                  </option>
                ))}
              </select>
            </Campo>
          )}
          <Campo label="Fornecedor / favorecido" className={editando ? 'md:col-span-5' : 'md:col-span-3'}>
            <select value={form.idFornecedor} onChange={(e) => atualizar('idFornecedor', e.target.value)} className={inputCls()}>
              <option value="">Nenhum</option>
              {fornecedores.map((f) => (
                <option key={f.id_fornecedor} value={f.id_fornecedor}>
                  {f.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Forma de pagamento" className={editando ? 'md:col-span-4' : 'md:col-span-3'}>
            <input
              value={form.formaPagamento}
              onChange={(e) => atualizar('formaPagamento', e.target.value)}
              list="formas-despesa"
              placeholder="PIX, boleto, débito..."
              className={inputCls()}
            />
            <datalist id="formas-despesa">
              {['PIX', 'Boleto', 'Débito automático', 'Cartão de crédito', 'Dinheiro', 'Transferência'].map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </Campo>

          <div className="md:col-span-6">
            <Toggle
              checked={form.pago}
              onChange={(v) => atualizar('pago', v)}
              label="Já foi paga"
              descricao={form.pago ? 'Informe a data do pagamento ao lado (vazio = hoje).' : 'Fica como "a pagar" até ser marcada como paga.'}
            />
          </div>
          {form.pago && (
            <Campo label="Pago em" erro={erros.dataPagamento} className="md:col-span-3">
              <input
                type="date"
                value={form.dataPagamento}
                onChange={(e) => atualizar('dataPagamento', e.target.value)}
                className={`${inputCls(erros.dataPagamento)} [color-scheme:dark]`}
              />
            </Campo>
          )}
          <Campo label="Observações" className={form.pago ? 'md:col-span-3' : 'md:col-span-6'}>
            <input value={form.observacoes} onChange={(e) => atualizar('observacoes', e.target.value)} placeholder="Opcional" className={inputCls()} />
          </Campo>
        </div>
      </CardFormulario>

      {!carregando && (
        <ListaCadastro
          titulo={`Despesas de ${nomeMes(mes).toLowerCase()}`}
          total={filtradas.length}
          busca={busca}
          onBusca={setBusca}
          placeholderBusca="Buscar despesa..."
          filtros={
            <FiltroSegmentado
              valor={filtro}
              onChange={setFiltro}
              opcoes={[
                { valor: 'TODAS', label: 'Todas' },
                { valor: 'PENDENTES', label: `A pagar${pendentes.length ? ` (${pendentes.length})` : ''}` },
                { valor: 'PAGAS', label: 'Pagas' },
              ]}
            />
          }
        >
          <TabelaCadastro
            colunas={['Despesa', 'Vencimento', 'Valor', 'Situação', 'Ações']}
            vazio={filtradas.length === 0}
            mensagemVazio={doMes.length === 0 ? 'Nenhuma despesa lançada neste mês.' : 'Nenhuma despesa encontrada com esses filtros.'}
          >
            {filtradas.map((d) => (
              <tr key={d.id} className={`hover:bg-zinc-800/20 transition ${editando?.id === d.id ? 'bg-blue-500/5' : ''}`}>
                <td className="px-4 sm:px-5 py-3 min-w-[180px]">
                  <p className="font-bold text-white">{d.descricao}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {[d.categoria, nomeFornecedor(d.id_fornecedor), d.recorrencia ? 'Repete todo mês' : null].filter(Boolean).join(' · ')}
                  </p>
                </td>
                <td className="px-4 sm:px-5 py-3 text-zinc-300 whitespace-nowrap">{dataBR(d.data)}</td>
                <td className="px-4 sm:px-5 py-3 text-white font-semibold whitespace-nowrap tabular-nums">R$ {formatarValor(d.valor)}</td>
                <td className="px-4 sm:px-5 py-2">
                  <div className="flex items-center gap-2">
                    <BadgeSituacao d={d} />
                    <button
                      type="button"
                      onClick={() => alternarPaga(d)}
                      disabled={marcando === d.id}
                      className="text-[11px] font-bold text-blue-400 hover:text-blue-300 disabled:opacity-50 whitespace-nowrap"
                    >
                      {d.pago ? 'Desfazer' : 'Marcar paga'}
                    </button>
                  </div>
                </td>
                <td className="px-4 sm:px-5 py-2">
                  <AcoesLinha onVer={() => setDetalhe(d)} onEditar={() => iniciarEdicao(d)} onExcluir={() => setParaExcluir(d)} />
                </td>
              </tr>
            ))}
          </TabelaCadastro>
        </ListaCadastro>
      )}

      {detalhe && (
        <ModalDetalhes
          titulo={detalhe.descricao}
          subtitulo={<BadgeSituacao d={detalhe} />}
          itens={[
            ['Categoria', detalhe.categoria],
            ['Valor', `R$ ${formatarValor(detalhe.valor)}`],
            ['Vencimento', dataBR(detalhe.data)],
            ['Pago em', dataBR(detalhe.data_pagamento)],
            ['Forma de pagamento', detalhe.forma_pagamento || ''],
            ['Fornecedor / favorecido', nomeFornecedor(detalhe.id_fornecedor)],
            ['Repetição', detalhe.recorrencia ? 'Faz parte de uma despesa mensal' : 'Só este mês'],
            ['Lançada por', detalhe.criado_por || ''],
            ['Observações', detalhe.observacoes || ''],
          ]}
          onFechar={() => setDetalhe(null)}
          onEditar={() => iniciarEdicao(detalhe)}
        />
      )}

      {paraExcluir && (
        <Modal onFechar={() => setParaExcluir(null)}>
          <div className="p-5 space-y-2">
            <h3 className="text-base font-bold text-white">Excluir despesa</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Excluir <strong className="text-zinc-200">{paraExcluir.descricao}</strong> de {dataBR(paraExcluir.data)} (R$ {formatarValor(paraExcluir.valor)})?
              {paraExcluir.recorrencia && ' Ela se repete todo mês: você pode excluir só esta ou esta e as dos meses seguintes.'}
            </p>
          </div>
          <div className="p-4 border-t border-zinc-800/60 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setParaExcluir(null)} className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white transition">
              Cancelar
            </button>
            {paraExcluir.recorrencia && (
              <button
                type="button"
                onClick={() => confirmarExclusao(true)}
                disabled={excluindo}
                className="px-4 py-2 border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-60 font-bold rounded-xl text-xs transition"
              >
                Esta e as próximas
              </button>
            )}
            <button
              type="button"
              onClick={() => confirmarExclusao(false)}
              disabled={excluindo}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white font-bold rounded-xl text-xs transition"
            >
              {excluindo ? 'Excluindo...' : paraExcluir.recorrencia ? 'Só esta' : 'Excluir despesa'}
            </button>
          </div>
        </Modal>
      )}
    </PaginaCadastro>
  );
};
