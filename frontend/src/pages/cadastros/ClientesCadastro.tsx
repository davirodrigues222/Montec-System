import React, { useEffect, useMemo, useState } from 'react';
import {
  type Cliente,
  avisoColunasIgnoradas,
  contarOrdensPorCliente,
  excluirCliente,
  listarClientes,
  salvarCliente,
} from '../../services/cadastros';
import {
  AcoesLinha,
  Badge,
  Campo,
  CardFormulario,
  Carregando,
  FiltroSegmentado,
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

const FORM_VAZIO = { nome: '', whatsapp: '', email: '', cpf_cnpj: '', observacoes: '' };
type FormCliente = typeof FORM_VAZIO;
type Erros = Partial<Record<keyof FormCliente, string>>;

function validar(f: FormCliente): Erros {
  const e: Erros = {};
  if (f.nome.trim().length < 2) e.nome = 'Informe o nome completo do cliente.';
  if (!validarTelefone(f.whatsapp)) e.whatsapp = 'Informe um telefone válido com DDD.';
  if (f.email.trim() && !validarEmail(f.email)) e.email = 'E-mail inválido.';
  if (f.cpf_cnpj.trim() && !validarCpfCnpj(f.cpf_cnpj)) e.cpf_cnpj = 'CPF ou CNPJ inválido.';
  return e;
}

export const ClientesCadastro: React.FC = () => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [ordensPorCliente, setOrdensPorCliente] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const [form, setForm] = useState<FormCliente>(FORM_VAZIO);
  const [erros, setErros] = useState<Erros>({});
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'com-os' | 'sem-os'>('todos');
  const [detalhe, setDetalhe] = useState<Cliente | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Cliente | null>(null);
  const feedback = useFeedback();

  const carregar = async () => {
    try {
      const [lista, contagem] = await Promise.all([listarClientes(), contarOrdensPorCliente()]);
      setClientes(lista);
      setOrdensPorCliente(contagem);
    } catch (e: any) {
      feedback.erro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const atualizar = (campo: keyof FormCliente, valor: string) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    if (erros[campo]) setErros((e) => ({ ...e, [campo]: undefined }));
  };

  const limpar = () => {
    setForm(FORM_VAZIO);
    setErros({});
    setEditandoId(null);
  };

  const iniciarEdicao = (c: Cliente) => {
    setForm({
      nome: c.nome || '',
      whatsapp: mascaraTelefone(c.whatsapp || ''),
      email: c.email || '',
      cpf_cnpj: mascaraCpfCnpj(c.cpf_cnpj || ''),
      observacoes: c.observacoes || '',
    });
    setErros({});
    setEditandoId(c.id_cliente);
    setDetalhe(null);
    rolarParaFormulario();
  };

  const salvar = async () => {
    const e = validar(form);
    setErros(e);
    if (Object.keys(e).length > 0) return;

    setSalvando(true);
    try {
      const ignoradas = await salvarCliente(
        {
          nome: form.nome,
          whatsapp: form.whatsapp,
          email: form.email,
          cpf_cnpj: somenteDigitos(form.cpf_cnpj) ? form.cpf_cnpj : null,
          observacoes: form.observacoes,
        },
        editandoId || undefined
      );
      const msg = (editandoId ? 'Cliente atualizado.' : 'Cliente cadastrado.') + avisoColunasIgnoradas(ignoradas);
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
      await excluirCliente(paraExcluir.id_cliente);
      if (editandoId === paraExcluir.id_cliente) limpar();
      feedback.sucesso('Cliente excluído.');
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
    return clientes.filter((c) => {
      const qtdOs = ordensPorCliente[c.id_cliente] || 0;
      if (filtro === 'com-os' && qtdOs === 0) return false;
      if (filtro === 'sem-os' && qtdOs > 0) return false;
      if (!q) return true;
      return (
        (c.nome || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (!!qDig && (somenteDigitos(c.whatsapp || '').includes(qDig) || somenteDigitos(c.cpf_cnpj || '').includes(qDig)))
      );
    });
  }, [clientes, ordensPorCliente, busca, filtro]);

  return (
    <PaginaCadastro titulo="Clientes" descricao="Cadastre, consulte e mantenha atualizados os dados dos seus clientes.">
      <feedback.Feedback />

      <CardFormulario
        titulo={editandoId ? 'Editar cliente' : 'Novo cliente'}
        subtitulo={editandoId ? `Alterando os dados de ${form.nome || 'cliente'}.` : 'Dados de contato e documento.'}
        editando={!!editandoId}
        salvando={salvando}
        rotuloSalvar={editandoId ? 'Salvar alterações' : '+ Cadastrar cliente'}
        onSubmit={salvar}
        onLimpar={limpar}
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <Campo label="Nome completo" obrigatorio erro={erros.nome} className="md:col-span-6">
            <input value={form.nome} onChange={(e) => atualizar('nome', e.target.value)} placeholder="Digite o nome" className={inputCls(erros.nome)} />
          </Campo>
          <Campo label="Telefone / WhatsApp" obrigatorio erro={erros.whatsapp} className="md:col-span-3">
            <input
              value={form.whatsapp}
              onChange={(e) => atualizar('whatsapp', mascaraTelefone(e.target.value))}
              inputMode="tel"
              placeholder="(85) 99999-9999"
              className={inputCls(erros.whatsapp)}
            />
          </Campo>
          <Campo label="E-mail" erro={erros.email} className="md:col-span-3">
            <input
              type="email"
              value={form.email}
              onChange={(e) => atualizar('email', e.target.value)}
              placeholder="contato@email.com"
              className={inputCls(erros.email)}
            />
          </Campo>
          <Campo label="CPF / CNPJ" erro={erros.cpf_cnpj} className="md:col-span-4">
            <input
              value={form.cpf_cnpj}
              onChange={(e) => atualizar('cpf_cnpj', mascaraCpfCnpj(e.target.value))}
              inputMode="numeric"
              placeholder="000.000.000-00"
              className={inputCls(erros.cpf_cnpj)}
            />
          </Campo>
          <Campo label="Observações internas" className="md:col-span-8">
            <input
              value={form.observacoes}
              onChange={(e) => atualizar('observacoes', e.target.value)}
              placeholder="Preferências, contato responsável ou informações úteis"
              className={inputCls()}
            />
          </Campo>
        </div>
      </CardFormulario>

      {carregando ? (
        <Carregando />
      ) : (
        <ListaCadastro
          titulo="Clientes cadastrados"
          total={filtrados.length}
          busca={busca}
          onBusca={setBusca}
          placeholderBusca="Buscar por nome, telefone, documento..."
          filtros={
            <FiltroSegmentado
              valor={filtro}
              onChange={setFiltro}
              opcoes={[
                { valor: 'todos', label: 'Todos' },
                { valor: 'com-os', label: 'Com OS' },
                { valor: 'sem-os', label: 'Sem OS' },
              ]}
            />
          }
        >
          <TabelaCadastro
            colunas={['Cliente', 'Contato', 'Documento', 'Ordens', 'Ações']}
            vazio={filtrados.length === 0}
            mensagemVazio={busca || filtro !== 'todos' ? 'Nenhum cliente encontrado com esses filtros.' : 'Nenhum cliente cadastrado ainda.'}
          >
            {filtrados.map((c) => {
              const qtdOs = ordensPorCliente[c.id_cliente] || 0;
              return (
                <tr key={c.id_cliente} className={`hover:bg-zinc-800/20 transition ${editandoId === c.id_cliente ? 'bg-blue-500/5' : ''}`}>
                  <td className="px-4 sm:px-5 py-3">
                    <p className="font-bold text-white">{c.nome}</p>
                    {c.email && <p className="text-[11px] text-zinc-500 mt-0.5">{c.email}</p>}
                  </td>
                  <td className="px-4 sm:px-5 py-3 text-zinc-300 whitespace-nowrap">
                    {c.whatsapp ? mascaraTelefone(c.whatsapp) : <span className="text-zinc-500">Sem telefone</span>}
                  </td>
                  <td className="px-4 sm:px-5 py-3 text-zinc-300 whitespace-nowrap">
                    {c.cpf_cnpj ? mascaraCpfCnpj(c.cpf_cnpj) : <span className="text-zinc-500">Não informado</span>}
                  </td>
                  <td className="px-4 sm:px-5 py-3">
                    {qtdOs > 0 ? <Badge cor="azul">{qtdOs} OS</Badge> : <Badge cor="cinza">Nenhuma</Badge>}
                  </td>
                  <td className="px-4 sm:px-5 py-2">
                    <AcoesLinha onVer={() => setDetalhe(c)} onEditar={() => iniciarEdicao(c)} onExcluir={() => setParaExcluir(c)} />
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
          subtitulo={<Badge cor="verde">Cliente</Badge>}
          itens={[
            ['Telefone / WhatsApp', detalhe.whatsapp ? mascaraTelefone(detalhe.whatsapp) : ''],
            ['E-mail', detalhe.email || ''],
            ['CPF / CNPJ', detalhe.cpf_cnpj ? mascaraCpfCnpj(detalhe.cpf_cnpj) : ''],
            ['Ordens de serviço', String(ordensPorCliente[detalhe.id_cliente] || 0)],
            ['Observações', detalhe.observacoes || ''],
          ]}
          onFechar={() => setDetalhe(null)}
          onEditar={() => iniciarEdicao(detalhe)}
        />
      )}

      {paraExcluir && (
        <ModalConfirmacao
          titulo="Excluir cliente"
          mensagem={
            (ordensPorCliente[paraExcluir.id_cliente] || 0) > 0 ? (
              <>
                <strong className="text-zinc-200">{paraExcluir.nome}</strong> possui ordens de serviço vinculadas e não
                poderá ser excluído enquanto elas existirem.
              </>
            ) : (
              <>
                Tem certeza que deseja excluir <strong className="text-zinc-200">{paraExcluir.nome}</strong>? Esta ação não
                pode ser desfeita.
              </>
            )
          }
          rotuloConfirmar="Excluir cliente"
          carregando={excluindo}
          onConfirmar={confirmarExclusao}
          onCancelar={() => setParaExcluir(null)}
        />
      )}
    </PaginaCadastro>
  );
};
