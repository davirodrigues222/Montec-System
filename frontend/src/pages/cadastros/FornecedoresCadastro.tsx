import React, { useEffect, useMemo, useState } from 'react';
import {
  CATEGORIAS_FORNECEDOR,
  type Fornecedor,
  avisoColunasIgnoradas,
  contarOrdensPorFornecedor,
  excluirFornecedor,
  listarFornecedores,
  salvarFornecedor,
} from '../../services/cadastros';
import {
  AcoesLinha,
  Badge,
  Campo,
  CardFormulario,
  Carregando,
  ListaCadastro,
  ModalConfirmacao,
  ModalDetalhes,
  PaginaCadastro,
  TabelaCadastro,
  inputCls,
  rolarParaFormulario,
  useFeedback,
} from '../../components/cadastros/ui';
import {
  mascaraCpfCnpj,
  mascaraTelefone,
  somenteDigitos,
  validarCpfCnpj,
  validarEmail,
  validarTelefone,
} from '../../utils/formatadores';

const OUTRA = '__outra__';
const FORM_VAZIO = { nome: '', contato: '', email: '', cnpj: '', categoria: '', categoriaOutra: '', observacoes: '' };
type FormFornecedor = typeof FORM_VAZIO;
type Erros = Partial<Record<keyof FormFornecedor, string>>;

const linkWhatsApp = (tel: string) => {
  const d = somenteDigitos(tel);
  return d.length >= 10 ? `https://wa.me/55${d}` : null;
};

export const FornecedoresCadastro: React.FC = () => {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [usoEmOs, setUsoEmOs] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const [form, setForm] = useState<FormFornecedor>(FORM_VAZIO);
  const [erros, setErros] = useState<Erros>({});
  const [editando, setEditando] = useState<Fornecedor | null>(null);

  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [detalhe, setDetalhe] = useState<Fornecedor | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Fornecedor | null>(null);
  const feedback = useFeedback();

  const carregar = async () => {
    try {
      const [lista, uso] = await Promise.all([listarFornecedores(), contarOrdensPorFornecedor()]);
      setFornecedores(lista);
      setUsoEmOs(uso);
    } catch (e: any) {
      feedback.erro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const qtdOs = (f: Fornecedor) => usoEmOs[(f.nome || '').trim().toLowerCase()] || 0;

  // Categorias existentes nos cadastros (inclui as personalizadas) para o filtro
  const categorias = useMemo(() => {
    const todas = new Set(CATEGORIAS_FORNECEDOR);
    fornecedores.forEach((f) => f.categoria && todas.add(f.categoria));
    return [...todas].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [fornecedores]);

  const atualizar = (campo: keyof FormFornecedor, valor: string) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    if (erros[campo]) setErros((e) => ({ ...e, [campo]: undefined }));
  };

  const limpar = () => {
    setForm(FORM_VAZIO);
    setErros({});
    setEditando(null);
  };

  const iniciarEdicao = (f: Fornecedor) => {
    const padrao = !f.categoria || CATEGORIAS_FORNECEDOR.includes(f.categoria);
    setForm({
      nome: f.nome,
      contato: mascaraTelefone(f.contato || ''),
      email: f.email || '',
      cnpj: mascaraCpfCnpj(f.cnpj || ''),
      categoria: padrao ? f.categoria || '' : OUTRA,
      categoriaOutra: padrao ? '' : f.categoria || '',
      observacoes: f.observacoes || '',
    });
    setErros({});
    setEditando(f);
    setDetalhe(null);
    rolarParaFormulario();
  };

  const validar = (): Erros => {
    const e: Erros = {};
    const nome = form.nome.trim();
    if (nome.length < 2) e.nome = 'Informe o nome do fornecedor.';
    else if (fornecedores.some((f) => f.id_fornecedor !== editando?.id_fornecedor && f.nome.trim().toLowerCase() === nome.toLowerCase())) {
      e.nome = 'Já existe um fornecedor com este nome.';
    }
    if (form.contato.trim() && !validarTelefone(form.contato)) e.contato = 'Telefone inválido.';
    if (form.email.trim() && !validarEmail(form.email)) e.email = 'E-mail inválido.';
    if (form.cnpj.trim() && !validarCpfCnpj(form.cnpj)) e.cnpj = 'CPF ou CNPJ inválido.';
    if (form.categoria === OUTRA && form.categoriaOutra.trim().length < 2) e.categoriaOutra = 'Informe a categoria.';
    return e;
  };

  const salvar = async () => {
    const e = validar();
    setErros(e);
    if (Object.keys(e).length > 0) return;

    setSalvando(true);
    try {
      const ignoradas = await salvarFornecedor(
        {
          nome: form.nome,
          contato: form.contato,
          cnpj: somenteDigitos(form.cnpj) ? form.cnpj : null,
          categoria: form.categoria === OUTRA ? form.categoriaOutra.trim() : form.categoria || null,
          email: form.email,
          observacoes: form.observacoes,
        },
        editando?.id_fornecedor
      );
      const msg = (editando ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.') + avisoColunasIgnoradas(ignoradas);
      if (ignoradas.length) feedback.erro(msg);
      else feedback.sucesso(msg);
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
      await excluirFornecedor(paraExcluir.id_fornecedor);
      if (editando?.id_fornecedor === paraExcluir.id_fornecedor) limpar();
      feedback.sucesso('Fornecedor excluído.');
      setParaExcluir(null);
      await carregar();
    } catch (err: any) {
      feedback.erro(err.message);
      setParaExcluir(null);
    } finally {
      setExcluindo(false);
    }
  };

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDig = somenteDigitos(busca);
    return fornecedores.filter((f) => {
      if (filtroCategoria && f.categoria !== filtroCategoria) return false;
      if (!q) return true;
      return (
        [f.nome, f.email, f.categoria].some((v) => (v || '').toLowerCase().includes(q)) ||
        (!!qDig && [f.contato, f.cnpj].some((v) => somenteDigitos(v || '').includes(qDig)))
      );
    });
  }, [fornecedores, busca, filtroCategoria]);

  // Renomear um fornecedor já usado em OS: as OS antigas continuam com o nome anterior
  const renomeandoUsado = !!editando && qtdOs(editando) > 0 && form.nome.trim().toLowerCase() !== editando.nome.trim().toLowerCase();

  return (
    <PaginaCadastro titulo="Fornecedores" descricao="Fornecedores de peças e insumos. Usados para registrar a origem das peças em cada OS.">
      <feedback.Feedback />

      <CardFormulario
        titulo={editando ? 'Editar fornecedor' : 'Novo fornecedor'}
        subtitulo={editando ? `Alterando ${editando.nome}.` : 'Contato, documento e categoria de fornecimento.'}
        editando={!!editando}
        salvando={salvando}
        rotuloSalvar={editando ? 'Salvar alterações' : '+ Cadastrar fornecedor'}
        onSubmit={salvar}
        onLimpar={limpar}
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <Campo
            label="Nome / Razão social"
            obrigatorio
            erro={erros.nome}
            dica={renomeandoUsado ? `${qtdOs(editando!)} OS antigas continuarão exibindo o nome "${editando!.nome}".` : undefined}
            className="md:col-span-5"
          >
            <input value={form.nome} onChange={(e) => atualizar('nome', e.target.value)} placeholder="Ex: Distribuidora Cell Peças" className={inputCls(erros.nome)} />
          </Campo>
          <Campo label="Telefone / WhatsApp" erro={erros.contato} className="md:col-span-3">
            <input
              value={form.contato}
              onChange={(e) => atualizar('contato', mascaraTelefone(e.target.value))}
              inputMode="tel"
              placeholder="(85) 99999-9999"
              className={inputCls(erros.contato)}
            />
          </Campo>
          <Campo label="CNPJ / CPF" erro={erros.cnpj} className="md:col-span-4">
            <input
              value={form.cnpj}
              onChange={(e) => atualizar('cnpj', mascaraCpfCnpj(e.target.value))}
              inputMode="numeric"
              placeholder="00.000.000/0000-00"
              className={inputCls(erros.cnpj)}
            />
          </Campo>

          <Campo label="Categoria" className={form.categoria === OUTRA ? 'md:col-span-3' : 'md:col-span-4'}>
            <select value={form.categoria} onChange={(e) => atualizar('categoria', e.target.value)} className={inputCls()}>
              <option value="">Selecione...</option>
              {CATEGORIAS_FORNECEDOR.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value={OUTRA}>Outra...</option>
            </select>
          </Campo>
          {form.categoria === OUTRA && (
            <Campo label="Qual categoria?" obrigatorio erro={erros.categoriaOutra} className="md:col-span-3">
              <input value={form.categoriaOutra} onChange={(e) => atualizar('categoriaOutra', e.target.value)} placeholder="Ex: Placas" className={inputCls(erros.categoriaOutra)} />
            </Campo>
          )}
          <Campo label="E-mail" erro={erros.email} className={form.categoria === OUTRA ? 'md:col-span-6' : 'md:col-span-8'}>
            <input type="email" value={form.email} onChange={(e) => atualizar('email', e.target.value)} placeholder="vendas@fornecedor.com" className={inputCls(erros.email)} />
          </Campo>
          <Campo label="Observações" className="md:col-span-12">
            <input
              value={form.observacoes}
              onChange={(e) => atualizar('observacoes', e.target.value)}
              placeholder="Prazo de entrega, condições de pagamento, vendedor responsável..."
              className={inputCls()}
            />
          </Campo>
        </div>
      </CardFormulario>

      {carregando ? (
        <Carregando />
      ) : (
        <ListaCadastro
          titulo="Fornecedores cadastrados"
          total={filtrados.length}
          busca={busca}
          onBusca={setBusca}
          placeholderBusca="Buscar por nome, telefone, CNPJ..."
          filtros={
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              aria-label="Filtrar por categoria"
              className="px-3 py-2 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500"
            >
              <option value="">Todas as categorias</option>
              {categorias.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          }
        >
          <TabelaCadastro
            colunas={['Fornecedor', 'Categoria', 'Contato', 'Documento', 'Uso em OS', 'Ações']}
            vazio={filtrados.length === 0}
            mensagemVazio={fornecedores.length === 0 ? 'Nenhum fornecedor cadastrado ainda.' : 'Nenhum fornecedor encontrado com esses filtros.'}
          >
            {filtrados.map((f) => {
              const wa = linkWhatsApp(f.contato || '');
              const usos = qtdOs(f);
              return (
                <tr key={f.id_fornecedor} className={`hover:bg-zinc-800/20 transition ${editando?.id_fornecedor === f.id_fornecedor ? 'bg-blue-500/5' : ''}`}>
                  <td className="px-4 sm:px-5 py-3">
                    <p className="font-bold text-white">{f.nome}</p>
                    {f.email && <p className="text-[11px] text-zinc-500 mt-0.5">{f.email}</p>}
                  </td>
                  <td className="px-4 sm:px-5 py-3">
                    {f.categoria ? <Badge cor="ambar">{f.categoria}</Badge> : <span className="text-zinc-500">—</span>}
                  </td>
                  <td className="px-4 sm:px-5 py-3 whitespace-nowrap">
                    {f.contato ? (
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-300">{mascaraTelefone(f.contato)}</span>
                        {wa && (
                          <a href={wa} target="_blank" rel="noopener noreferrer" title="Abrir no WhatsApp" className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300">
                            WhatsApp
                          </a>
                        )}
                      </div>
                    ) : (
                      <span className="text-zinc-500">Sem contato</span>
                    )}
                  </td>
                  <td className="px-4 sm:px-5 py-3 text-zinc-300 whitespace-nowrap">
                    {f.cnpj ? mascaraCpfCnpj(f.cnpj) : <span className="text-zinc-500">Não informado</span>}
                  </td>
                  <td className="px-4 sm:px-5 py-3">
                    {usos > 0 ? <Badge cor="azul">{usos} OS</Badge> : <Badge cor="cinza">Nenhuma</Badge>}
                  </td>
                  <td className="px-4 sm:px-5 py-2">
                    <AcoesLinha onVer={() => setDetalhe(f)} onEditar={() => iniciarEdicao(f)} onExcluir={() => setParaExcluir(f)} />
                  </td>
                </tr>
              );
            })}
          </TabelaCadastro>
        </ListaCadastro>
      )}

      {detalhe && (
        <ModalDetalhes
          titulo={detalhe.nome}
          subtitulo={<Badge cor="ambar">{detalhe.categoria || 'Fornecedor'}</Badge>}
          itens={[
            ['Telefone / WhatsApp', detalhe.contato ? mascaraTelefone(detalhe.contato) : ''],
            ['E-mail', detalhe.email || ''],
            ['CNPJ / CPF', detalhe.cnpj ? mascaraCpfCnpj(detalhe.cnpj) : ''],
            ['Uso em OS', `${qtdOs(detalhe)} ordem(ns) de serviço`],
            ['Observações', detalhe.observacoes || ''],
          ]}
          onFechar={() => setDetalhe(null)}
          onEditar={() => iniciarEdicao(detalhe)}
        />
      )}

      {paraExcluir && (
        <ModalConfirmacao
          titulo="Excluir fornecedor"
          mensagem={
            <>
              Excluir <strong className="text-zinc-200">{paraExcluir.nome}</strong>?
              {qtdOs(paraExcluir) > 0
                ? ` Ele aparece em ${qtdOs(paraExcluir)} OS; elas continuarão exibindo o nome, mas ele deixará de aparecer para novas OS.`
                : ' Esta ação não pode ser desfeita.'}
            </>
          }
          rotuloConfirmar="Excluir fornecedor"
          carregando={excluindo}
          onConfirmar={confirmarExclusao}
          onCancelar={() => setParaExcluir(null)}
        />
      )}
    </PaginaCadastro>
  );
};
