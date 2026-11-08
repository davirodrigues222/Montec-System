import React, { useEffect, useMemo, useState } from 'react';
import { type Fornecedor, listarFornecedores } from '../../services/cadastros';
import {
  CATEGORIAS_PECA,
  EstoqueAusenteError,
  type MovimentoEstoque,
  type PecaEstoque,
  ROTULO_MOVIMENTO,
  excluirPecaEstoque,
  listarMovimentosPeca,
  listarPecasEstoque,
  movimentarEstoque,
  salvarPecaEstoque,
  situacaoEstoque,
} from '../../services/estoque';
import {
  AcoesLinha,
  Badge,
  Campo,
  CardFormulario,
  Carregando,
  FiltroSegmentado,
  ListaCadastro,
  Modal,
  ModalConfirmacao,
  ModalDetalhes,
  PaginaCadastro,
  TabelaCadastro,
  inputCls,
  rolarParaFormulario,
  useFeedback,
} from '../../components/cadastros/ui';
import { useOperador } from '../../contexts/OperadorContext';
import { formatarValor } from '../../utils/formatadores';

const FORM_VAZIO = {
  nome: '',
  codigo: '',
  categoria: '',
  compatibilidade: '',
  idFornecedor: '',
  estoqueMinimo: '1',
  custo: '',
  quantidadeInicial: '',
  observacoes: '',
};
type FormPeca = typeof FORM_VAZIO;
type Erros = Partial<Record<keyof FormPeca, string>>;
type Filtro = 'TODAS' | 'BAIXO' | 'SEM';

/** "12,50" ou "12.50" -> 12.5; vazio -> null; inválido -> NaN */
const lerValor = (s: string) => {
  const t = s.trim().replace(',', '.');
  return t === '' ? null : Number(t);
};
const lerInteiro = (s: string) => (s.trim() === '' ? null : Number(s));
const inteiroValido = (n: number | null, min = 0) => n !== null && Number.isInteger(n) && n >= min && n <= 100000;

const BadgeQuantidade: React.FC<{ peca: PecaEstoque }> = ({ peca }) => {
  const s = situacaoEstoque(peca);
  const cor = s === 'SEM_ESTOQUE' ? 'vermelho' : s === 'BAIXO' ? 'azulForte' : 'verde';
  return (
    <Badge cor={cor}>
      {peca.quantidade} un.{s === 'SEM_ESTOQUE' ? ' · sem estoque' : s === 'BAIXO' ? ' · baixo' : ''}
    </Badge>
  );
};

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

export const EstoqueCadastro: React.FC = () => {
  const { pode } = useOperador();
  const veCustos = pode('tela_relatorios');

  const [pecas, setPecas] = useState<PecaEstoque[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ausente, setAusente] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const [form, setForm] = useState<FormPeca>(FORM_VAZIO);
  const [erros, setErros] = useState<Erros>({});
  const [editando, setEditando] = useState<PecaEstoque | null>(null);

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('TODAS');
  const [detalhe, setDetalhe] = useState<PecaEstoque | null>(null);
  const [movimentos, setMovimentos] = useState<MovimentoEstoque[] | null>(null);
  const [paraExcluir, setParaExcluir] = useState<PecaEstoque | null>(null);
  const [movimentando, setMovimentando] = useState<{ peca: PecaEstoque; tipo: 'ENTRADA' | 'AJUSTE' } | null>(null);
  const feedback = useFeedback();

  const carregar = async () => {
    try {
      const [lista, forn] = await Promise.all([listarPecasEstoque(), listarFornecedores().catch(() => [])]);
      setPecas(lista);
      setFornecedores(forn);
      setAusente(false);
    } catch (e: any) {
      if (e instanceof EstoqueAusenteError) setAusente(true);
      else feedback.erro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  // Histórico da peça aberta nos detalhes
  useEffect(() => {
    if (!detalhe) return;
    let ativo = true;
    setMovimentos(null);
    listarMovimentosPeca(detalhe.id_peca)
      .then((m) => ativo && setMovimentos(m))
      .catch(() => ativo && setMovimentos([]));
    return () => {
      ativo = false;
    };
  }, [detalhe]);

  const atualizar = (campo: keyof FormPeca, valor: string) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    if (erros[campo]) setErros((e) => ({ ...e, [campo]: undefined }));
  };

  const limpar = () => {
    setForm(FORM_VAZIO);
    setErros({});
    setEditando(null);
  };

  const iniciarEdicao = (p: PecaEstoque) => {
    setForm({
      nome: p.nome,
      codigo: p.codigo || '',
      categoria: p.categoria || '',
      compatibilidade: p.compatibilidade || '',
      idFornecedor: p.id_fornecedor || '',
      estoqueMinimo: String(p.estoque_minimo),
      custo: p.custo_medio !== null ? String(p.custo_medio) : '',
      quantidadeInicial: '',
      observacoes: p.observacoes || '',
    });
    setErros({});
    setEditando(p);
    setDetalhe(null);
    rolarParaFormulario();
  };

  const validar = (): Erros => {
    const e: Erros = {};
    const nome = form.nome.trim();
    if (nome.length < 2) e.nome = 'Informe o nome da peça.';
    else if (pecas.some((p) => p.id_peca !== editando?.id_peca && p.nome.trim().toLowerCase() === nome.toLowerCase())) {
      e.nome = 'Já existe uma peça com este nome.';
    }
    if (!inteiroValido(lerInteiro(form.estoqueMinimo))) e.estoqueMinimo = 'Use um número inteiro (0 desliga o aviso).';
    const custo = lerValor(form.custo);
    if (custo !== null && !(custo >= 0)) e.custo = 'Custo inválido.';
    if (!editando) {
      const qtd = lerInteiro(form.quantidadeInicial);
      if (qtd !== null && !inteiroValido(qtd)) e.quantidadeInicial = 'Use um número inteiro.';
    }
    return e;
  };

  const salvar = async () => {
    const e = validar();
    setErros(e);
    if (Object.keys(e).length > 0) return;

    setSalvando(true);
    try {
      const custo = lerValor(form.custo);
      await salvarPecaEstoque(
        {
          nome: form.nome.trim(),
          codigo: form.codigo,
          categoria: form.categoria,
          compatibilidade: form.compatibilidade,
          idFornecedor: form.idFornecedor,
          estoqueMinimo: Number(form.estoqueMinimo),
          // Quem não vê custos só informa o custo no cadastro (na edição não altera)
          custo: editando && !veCustos ? undefined : custo ?? (editando ? undefined : 0),
          quantidadeInicial: lerInteiro(form.quantidadeInicial) ?? 0,
          observacoes: form.observacoes,
        },
        editando?.id_peca
      );
      feedback.sucesso(editando ? 'Peça atualizada.' : 'Peça cadastrada no estoque.');
      limpar();
      await carregar();
    } catch (err: any) {
      feedback.erro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!paraExcluir) return;
    setExcluindo(true);
    try {
      await excluirPecaEstoque(paraExcluir.id_peca);
      if (editando?.id_peca === paraExcluir.id_peca) limpar();
      feedback.sucesso('Peça excluída do estoque.');
      setParaExcluir(null);
      await carregar();
    } catch (err: any) {
      feedback.erro(err.message);
      setParaExcluir(null);
    } finally {
      setExcluindo(false);
    }
  };

  const contagem = useMemo(() => {
    let baixo = 0;
    let sem = 0;
    let valor = 0;
    pecas.forEach((p) => {
      const s = situacaoEstoque(p);
      if (s === 'SEM_ESTOQUE') sem++;
      else if (s === 'BAIXO') baixo++;
      if (p.quantidade > 0 && p.custo_medio !== null) valor += p.quantidade * p.custo_medio;
    });
    return { baixo, sem, valor };
  }, [pecas]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pecas.filter((p) => {
      const s = situacaoEstoque(p);
      if (filtro === 'BAIXO' && s === 'OK') return false;
      if (filtro === 'SEM' && s !== 'SEM_ESTOQUE') return false;
      if (!q) return true;
      return [p.nome, p.codigo, p.categoria, p.compatibilidade, p.fornecedor_nome].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [pecas, busca, filtro]);

  if (!carregando && ausente) {
    return (
      <PaginaCadastro titulo="Estoque de peças" descricao="Peças com quantidade, custo e baixa automática nas ordens de serviço.">
        <div className="bg-[#0c101a] border border-blue-500/30 rounded-2xl p-6">
          <p className="text-sm font-bold text-blue-400">O estoque ainda não foi ativado no banco de dados</p>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            Execute a migração{' '}
            <code className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-200 text-[11px]">supabase/migrations/20261108090000_estoque_pecas.sql</code> no
            SQL Editor do Supabase e recarregue esta página.
          </p>
        </div>
      </PaginaCadastro>
    );
  }

  return (
    <PaginaCadastro titulo="Estoque de peças" descricao="Peças com quantidade, custo e baixa automática quando usadas numa ordem de serviço.">
      <feedback.Feedback />

      {/* Resumo */}
      {!carregando && pecas.length > 0 && (
        <div className={`grid grid-cols-2 ${veCustos ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-3`}>
          {[
            { rotulo: 'Peças cadastradas', valor: String(pecas.length), cor: 'text-white', acao: () => setFiltro('TODAS') },
            { rotulo: 'Estoque baixo', valor: String(contagem.baixo), cor: contagem.baixo ? 'text-blue-300' : 'text-white', acao: () => setFiltro('BAIXO') },
            { rotulo: 'Sem estoque', valor: String(contagem.sem), cor: contagem.sem ? 'text-red-400' : 'text-white', acao: () => setFiltro('SEM') },
            ...(veCustos ? [{ rotulo: 'Valor em estoque (custo)', valor: `R$ ${formatarValor(contagem.valor)}`, cor: 'text-white', acao: undefined }] : []),
          ].map((c) => (
            <button
              key={c.rotulo}
              type="button"
              onClick={c.acao}
              disabled={!c.acao}
              className="text-left bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-4 hover:border-zinc-700 disabled:hover:border-zinc-800/80 transition"
            >
              <span className="block text-[11px] font-medium text-zinc-400">{c.rotulo}</span>
              <span className={`block text-xl font-extrabold mt-1 tabular-nums truncate ${c.cor}`}>{c.valor}</span>
            </button>
          ))}
        </div>
      )}

      <CardFormulario
        titulo={editando ? 'Editar peça' : 'Nova peça'}
        subtitulo={
          editando
            ? `Alterando ${editando.nome}. A quantidade muda pelos botões "Entrada" e "Ajustar" da lista.`
            : 'Nome, modelo compatível, fornecedor, custo e quantidade inicial.'
        }
        editando={!!editando}
        salvando={salvando}
        rotuloSalvar={editando ? 'Salvar alterações' : '+ Cadastrar peça'}
        onSubmit={salvar}
        onLimpar={limpar}
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <Campo label="Nome da peça" obrigatorio erro={erros.nome} className="md:col-span-5">
            <input value={form.nome} onChange={(e) => atualizar('nome', e.target.value)} placeholder="Ex: Tela iPhone 11 incell" className={inputCls(erros.nome)} />
          </Campo>
          <Campo label="Modelos compatíveis" className="md:col-span-4">
            <input
              value={form.compatibilidade}
              onChange={(e) => atualizar('compatibilidade', e.target.value)}
              placeholder="Ex: iPhone 11, iPhone XR"
              className={inputCls()}
            />
          </Campo>
          <Campo label="Código / SKU" className="md:col-span-3">
            <input value={form.codigo} onChange={(e) => atualizar('codigo', e.target.value)} placeholder="Opcional" className={inputCls()} />
          </Campo>

          <Campo label="Categoria" className="md:col-span-4">
            <input
              value={form.categoria}
              onChange={(e) => atualizar('categoria', e.target.value)}
              list="categorias-peca"
              placeholder="Ex: Telas & Displays"
              className={inputCls()}
            />
            <datalist id="categorias-peca">
              {CATEGORIAS_PECA.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Campo>
          <Campo label="Fornecedor" dica={fornecedores.length === 0 ? 'Cadastre fornecedores em Cadastros › Fornecedores.' : undefined} className="md:col-span-4">
            <select value={form.idFornecedor} onChange={(e) => atualizar('idFornecedor', e.target.value)} className={inputCls()}>
              <option value="">Nenhum</option>
              {fornecedores.map((f) => (
                <option key={f.id_fornecedor} value={f.id_fornecedor}>
                  {f.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Estoque mínimo" erro={erros.estoqueMinimo} dica="Avisa quando chegar nesta quantidade." className="md:col-span-4">
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={form.estoqueMinimo}
              onChange={(e) => atualizar('estoqueMinimo', e.target.value)}
              className={inputCls(erros.estoqueMinimo)}
            />
          </Campo>

          {(!editando || veCustos) && (
            <Campo
              label={editando ? 'Custo médio (R$)' : 'Custo unitário (R$)'}
              erro={erros.custo}
              dica={editando ? 'Recalculado a cada entrada com custo. Altere só para corrigir.' : undefined}
              className="md:col-span-4"
            >
              <input
                inputMode="decimal"
                value={form.custo}
                onChange={(e) => atualizar('custo', e.target.value)}
                placeholder="0,00"
                className={inputCls(erros.custo)}
              />
            </Campo>
          )}
          {!editando && (
            <Campo label="Quantidade em estoque hoje" erro={erros.quantidadeInicial} className="md:col-span-4">
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={form.quantidadeInicial}
                onChange={(e) => atualizar('quantidadeInicial', e.target.value)}
                placeholder="0"
                className={inputCls(erros.quantidadeInicial)}
              />
            </Campo>
          )}
          <Campo label="Observações" className={!editando ? 'md:col-span-4' : veCustos ? 'md:col-span-8' : 'md:col-span-12'}>
            <input
              value={form.observacoes}
              onChange={(e) => atualizar('observacoes', e.target.value)}
              placeholder="Prateleira, qualidade da peça..."
              className={inputCls()}
            />
          </Campo>
        </div>
      </CardFormulario>

      {carregando ? (
        <Carregando />
      ) : (
        <ListaCadastro
          titulo="Peças no estoque"
          total={filtradas.length}
          busca={busca}
          onBusca={setBusca}
          placeholderBusca="Buscar por nome, código, modelo..."
          filtros={
            <FiltroSegmentado
              valor={filtro}
              onChange={setFiltro}
              opcoes={[
                { valor: 'TODAS', label: 'Todas' },
                { valor: 'BAIXO', label: `Baixo${contagem.baixo + contagem.sem ? ` (${contagem.baixo + contagem.sem})` : ''}` },
                { valor: 'SEM', label: 'Sem estoque' },
              ]}
            />
          }
        >
          <TabelaCadastro
            colunas={['Peça', 'Fornecedor', 'Quantidade', ...(veCustos ? ['Custo médio'] : []), 'Movimentar', 'Ações']}
            vazio={filtradas.length === 0}
            mensagemVazio={pecas.length === 0 ? 'Nenhuma peça cadastrada ainda.' : 'Nenhuma peça encontrada com esses filtros.'}
          >
            {filtradas.map((p) => (
              <tr key={p.id_peca} className={`hover:bg-zinc-800/20 transition ${editando?.id_peca === p.id_peca ? 'bg-blue-500/5' : ''}`}>
                <td className="px-4 sm:px-5 py-3 min-w-[180px]">
                  <p className="font-bold text-white">{p.nome}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {[p.compatibilidade, p.codigo, p.categoria].filter(Boolean).join(' · ') || '—'}
                  </p>
                </td>
                <td className="px-4 sm:px-5 py-3 text-zinc-300 whitespace-nowrap">{p.fornecedor_nome || <span className="text-zinc-500">—</span>}</td>
                <td className="px-4 sm:px-5 py-3">
                  <BadgeQuantidade peca={p} />
                  {p.estoque_minimo > 0 && <p className="text-[10px] text-zinc-500 mt-1">mín. {p.estoque_minimo}</p>}
                </td>
                {veCustos && (
                  <td className="px-4 sm:px-5 py-3 text-zinc-300 whitespace-nowrap tabular-nums">
                    {p.custo_medio !== null ? `R$ ${formatarValor(p.custo_medio)}` : '—'}
                  </td>
                )}
                <td className="px-4 sm:px-5 py-2">
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMovimentando({ peca: p, tipo: 'ENTRADA' })}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[11px] font-bold hover:bg-emerald-500/20 transition whitespace-nowrap"
                    >
                      + Entrada
                    </button>
                    <button
                      type="button"
                      onClick={() => setMovimentando({ peca: p, tipo: 'AJUSTE' })}
                      className="px-2.5 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 text-[11px] font-bold hover:bg-zinc-800 transition whitespace-nowrap"
                    >
                      Ajustar
                    </button>
                  </div>
                </td>
                <td className="px-4 sm:px-5 py-2">
                  <AcoesLinha onVer={() => setDetalhe(p)} onEditar={() => iniciarEdicao(p)} onExcluir={() => setParaExcluir(p)} />
                </td>
              </tr>
            ))}
          </TabelaCadastro>
        </ListaCadastro>
      )}

      {detalhe && (
        <ModalDetalhes
          titulo={detalhe.nome}
          subtitulo={<BadgeQuantidade peca={detalhe} />}
          itens={[
            ['Modelos compatíveis', detalhe.compatibilidade || ''],
            ['Código / SKU', detalhe.codigo || ''],
            ['Categoria', detalhe.categoria || ''],
            ['Fornecedor', detalhe.fornecedor_nome || ''],
            ['Estoque mínimo', detalhe.estoque_minimo > 0 ? `${detalhe.estoque_minimo} un.` : 'Sem aviso'],
            ...(veCustos ? ([['Custo médio', detalhe.custo_medio !== null ? `R$ ${formatarValor(detalhe.custo_medio)}` : '']] as [string, string][]) : []),
            ['Observações', detalhe.observacoes || ''],
          ]}
          extra={
            <div>
              <p className="text-[11px] font-bold text-zinc-500 tracking-wider uppercase mb-2">Movimentações recentes</p>
              {movimentos === null ? (
                <p className="text-xs text-zinc-500">Carregando...</p>
              ) : movimentos.length === 0 ? (
                <p className="text-xs text-zinc-500">Nenhuma movimentação registrada.</p>
              ) : (
                <ul className="divide-y divide-zinc-800/60 border border-zinc-800/80 rounded-xl overflow-hidden">
                  {movimentos.map((m) => (
                    <li key={m.id} className="flex items-start justify-between gap-3 px-3 py-2.5 bg-[#080c14]/60">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-200">
                          {ROTULO_MOVIMENTO[m.tipo]}
                          {m.numero_os ? ` · OS ${m.numero_os}` : ''}
                        </p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          {[
                            dataHora(m.criado_em),
                            m.autor,
                            m.fornecedor_nome,
                            veCustos && m.custo_unitario !== null && m.tipo === 'ENTRADA' ? `R$ ${formatarValor(m.custo_unitario)} cada` : null,
                            m.observacao,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-xs font-bold tabular-nums ${m.quantidade >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {m.quantidade > 0 ? `+${m.quantidade}` : m.quantidade}
                        </p>
                        <p className="text-[10px] text-zinc-500 tabular-nums">saldo {m.saldo}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          }
          onFechar={() => setDetalhe(null)}
          onEditar={() => iniciarEdicao(detalhe)}
        />
      )}

      {movimentando && (
        <ModalMovimento
          peca={movimentando.peca}
          tipoInicial={movimentando.tipo}
          fornecedores={fornecedores}
          onFechar={() => setMovimentando(null)}
          onConcluido={async (msg) => {
            setMovimentando(null);
            feedback.sucesso(msg);
            await carregar();
          }}
        />
      )}

      {paraExcluir && (
        <ModalConfirmacao
          titulo="Excluir peça"
          mensagem={
            <>
              Excluir <strong className="text-zinc-200">{paraExcluir.nome}</strong> do estoque? O histórico de movimentações da peça também é apagado. As OS
              que usaram a peça continuam mostrando o nome e o custo.
            </>
          }
          rotuloConfirmar="Excluir peça"
          carregando={excluindo}
          onConfirmar={confirmarExclusao}
          onCancelar={() => setParaExcluir(null)}
        />
      )}
    </PaginaCadastro>
  );
};

// ---------- Entrada (compra) ou ajuste (contagem) ----------
const ModalMovimento: React.FC<{
  peca: PecaEstoque;
  tipoInicial: 'ENTRADA' | 'AJUSTE';
  fornecedores: Fornecedor[];
  onFechar: () => void;
  onConcluido: (mensagem: string) => void | Promise<void>;
}> = ({ peca, tipoInicial, fornecedores, onFechar, onConcluido }) => {
  const [tipo, setTipo] = useState(tipoInicial);
  const [quantidade, setQuantidade] = useState('');
  const [custo, setCusto] = useState('');
  const [idFornecedor, setIdFornecedor] = useState(peca.id_fornecedor || '');
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const qtd = lerInteiro(quantidade);
  const previsto = qtd === null || !Number.isInteger(qtd) ? null : tipo === 'ENTRADA' ? peca.quantidade + qtd : qtd;

  const confirmar = async () => {
    if (!inteiroValido(qtd, tipo === 'ENTRADA' ? 1 : 0)) {
      setErro(tipo === 'ENTRADA' ? 'Informe quantas unidades chegaram.' : 'Informe a quantidade contada (zero ou mais).');
      return;
    }
    const custoNum = lerValor(custo);
    if (tipo === 'ENTRADA' && custoNum !== null && !(custoNum >= 0)) {
      setErro('Custo inválido.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const saldo = await movimentarEstoque(peca.id_peca, tipo, qtd!, {
        custoUnitario: tipo === 'ENTRADA' ? custoNum : null,
        idFornecedor: tipo === 'ENTRADA' ? idFornecedor : undefined,
        observacao,
      });
      await onConcluido(`${tipo === 'ENTRADA' ? 'Entrada registrada' : 'Estoque ajustado'}: ${peca.nome} agora tem ${saldo} un.`);
    } catch (e: any) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <Modal onFechar={onFechar}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!salvando) confirmar();
        }}
      >
        <div className="p-5 border-b border-zinc-800/60 space-y-3">
          <div>
            <h3 className="text-base font-bold text-white">{peca.nome}</h3>
            <p className="text-xs text-zinc-400 mt-0.5">Hoje: {peca.quantidade} un. em estoque</p>
          </div>
          <FiltroSegmentado
            valor={tipo}
            onChange={(v) => {
              setTipo(v);
              setErro('');
            }}
            opcoes={[
              { valor: 'ENTRADA', label: 'Entrada (compra)' },
              { valor: 'AJUSTE', label: 'Ajuste (contagem)' },
            ]}
          />
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo
            label={tipo === 'ENTRADA' ? 'Quantidade que chegou' : 'Quantidade contada'}
            obrigatorio
            dica={previsto !== null ? `Fica com ${previsto} un.` : undefined}
            className={tipo === 'AJUSTE' ? 'sm:col-span-2' : ''}
          >
            <input
              type="number"
              min={tipo === 'ENTRADA' ? 1 : 0}
              inputMode="numeric"
              autoFocus
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              className={inputCls()}
            />
          </Campo>
          {tipo === 'ENTRADA' && (
            <>
              <Campo label="Custo unitário (R$)" dica="Atualiza o custo médio da peça.">
                <input inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} placeholder="0,00" className={inputCls()} />
              </Campo>
              <Campo label="Fornecedor" className="sm:col-span-2">
                <select value={idFornecedor} onChange={(e) => setIdFornecedor(e.target.value)} className={inputCls()}>
                  <option value="">Não informado</option>
                  {fornecedores.map((f) => (
                    <option key={f.id_fornecedor} value={f.id_fornecedor}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            </>
          )}
          <Campo label="Observação" className="sm:col-span-2">
            <input
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder={tipo === 'ENTRADA' ? 'Nota fiscal, pedido...' : 'Motivo: perda, defeito, contagem...'}
              className={inputCls()}
            />
          </Campo>
          {erro && <p className="sm:col-span-2 text-[11px] text-red-400 font-semibold">{erro}</p>}
        </div>
        <div className="p-4 border-t border-zinc-800/60 flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white transition">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold rounded-xl text-xs transition"
          >
            {salvando ? 'Salvando...' : tipo === 'ENTRADA' ? 'Registrar entrada' : 'Salvar contagem'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
