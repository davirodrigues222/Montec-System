import React, { useEffect, useMemo, useState } from 'react';
import {
  CARGOS,
  type CargoFuncionario,
  type Funcionario,
  type Loja,
  PERMISSOES_DISPONIVEIS,
  type Permissoes,
  MENSAGEM_CODIGO_INVALIDO,
  REGEX_CODIGO_ACESSO,
  TabelaAusenteError,
  aguardandoLiberacao,
  excluirFuncionario,
  normalizarPermissoes,
  proximoCodigoAcesso,
  somenteDigitosCodigo,
  listarFuncionarios,
  listarLojas,
  salvarFuncionario,
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
import {
  formatarDataHora,
  mascaraCpf,
  mascaraTelefone,
  somenteDigitos,
  validarCpf,
  validarEmail,
  validarTelefone,
} from '../../utils/formatadores';

const SENHA_MINIMA = 6;

const formVazio = () => ({
  nome: '',
  codigo_acesso: '',
  cpf: '',
  telefone: '',
  email: '',
  cargo: 'ATENDENTE' as CargoFuncionario,
  permissoes: { ...CARGOS.ATENDENTE.permissoes } as Permissoes,
  lojas: [] as string[],
  ativo: true,
  senha: '',
  confirmarSenha: '',
});
type FormFuncionario = ReturnType<typeof formVazio>;
type Erros = Partial<Record<keyof FormFuncionario, string>>;

const COR_CARGO: Record<CargoFuncionario, 'roxo' | 'azul' | 'ambar' | 'verde'> = {
  ADMIN: 'roxo',
  GERENTE: 'azul',
  TECNICO: 'ambar',
  ATENDENTE: 'verde',
};

const estaBloqueado = (f: Funcionario) => !!f.bloqueado_ate && new Date(f.bloqueado_ate) > new Date();

export const FuncionariosCadastro: React.FC = () => {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [tabelaAusente, setTabelaAusente] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const [form, setForm] = useState<FormFuncionario>(formVazio);
  const [erros, setErros] = useState<Erros>({});
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [redefinirSenha, setRedefinirSenha] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'ativos' | 'inativos'>('todos');
  const [detalhe, setDetalhe] = useState<Funcionario | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Funcionario | null>(null);
  const feedback = useFeedback();

  const carregar = async () => {
    try {
      const [listaF, listaL] = await Promise.all([listarFuncionarios(), listarLojas()]);
      setFuncionarios(listaF);
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

  const nomeLoja = (id: string) => lojas.find((l) => l.id_loja === id)?.nome || 'Loja removida';
  const precisaSenha = !editandoId || redefinirSenha;

  const atualizar = <K extends keyof FormFuncionario>(campo: K, valor: FormFuncionario[K]) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    if (erros[campo]) setErros((e) => ({ ...e, [campo]: undefined }));
  };

  // Trocar o cargo aplica as permissões padrão dele (podem ser ajustadas depois)
  const trocarCargo = (cargo: CargoFuncionario) => {
    setForm((f) => ({ ...f, cargo, permissoes: { ...CARGOS[cargo].permissoes } }));
  };

  const alternarLoja = (id: string) => {
    setForm((f) => ({ ...f, lojas: f.lojas.includes(id) ? f.lojas.filter((l) => l !== id) : [...f.lojas, id] }));
  };

  const validar = (): Erros => {
    const e: Erros = {};
    if (form.nome.trim().length < 2) e.nome = 'Informe o nome do funcionário.';
    if (!REGEX_CODIGO_ACESSO.test(form.codigo_acesso.trim())) {
      e.codigo_acesso = MENSAGEM_CODIGO_INVALIDO;
    } else {
      const duplicado = funcionarios.some(
        (f) => f.id_funcionario !== editandoId && f.codigo_acesso === form.codigo_acesso.trim()
      );
      if (duplicado) e.codigo_acesso = 'Este código já está em uso por outro funcionário.';
    }
    if (form.cpf.trim() && !validarCpf(form.cpf)) e.cpf = 'CPF inválido.';
    if (form.telefone.trim() && !validarTelefone(form.telefone)) e.telefone = 'Telefone inválido.';
    if (form.email.trim() && !validarEmail(form.email)) e.email = 'E-mail inválido.';
    if (precisaSenha) {
      if (form.senha.length < SENHA_MINIMA) e.senha = `A senha deve ter pelo menos ${SENHA_MINIMA} caracteres.`;
      else if (form.senha !== form.confirmarSenha) e.confirmarSenha = 'As senhas não conferem.';
    }
    return e;
  };

  const limpar = () => {
    setForm(formVazio());
    setErros({});
    setEditandoId(null);
    setRedefinirSenha(false);
    setMostrarSenha(false);
  };

  const iniciarEdicao = (f: Funcionario) => {
    setForm({
      nome: f.nome,
      codigo_acesso: f.codigo_acesso,
      cpf: mascaraCpf(f.cpf || ''),
      telefone: mascaraTelefone(f.telefone || ''),
      email: f.email || '',
      cargo: f.cargo,
      permissoes: normalizarPermissoes(f.cargo, f.permissoes),
      lojas: [...f.lojas],
      ativo: f.ativo,
      senha: '',
      confirmarSenha: '',
    });
    setErros({});
    setEditandoId(f.id_funcionario);
    setRedefinirSenha(false);
    setDetalhe(null);
    rolarParaFormulario();
  };

  const salvar = async () => {
    const e = validar();
    setErros(e);
    if (Object.keys(e).length > 0) return;

    setSalvando(true);
    try {
      await salvarFuncionario(
        {
          nome: form.nome,
          codigo_acesso: form.codigo_acesso,
          cpf: somenteDigitos(form.cpf) ? form.cpf : null,
          telefone: form.telefone.trim() || null,
          email: form.email.trim() || null,
          cargo: form.cargo,
          permissoes: form.permissoes,
          ativo: form.ativo,
        },
        form.lojas,
        precisaSenha ? form.senha : undefined,
        editandoId || undefined
      );
      feedback.sucesso(editandoId ? 'Funcionário atualizado.' : 'Funcionário cadastrado com acesso liberado.');
      limpar();
      await carregar();
    } catch (err: any) {
      feedback.erro(err.message);
      await carregar();
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!paraExcluir) return;
    setExcluindo(true);
    try {
      await excluirFuncionario(paraExcluir.id_funcionario);
      if (editandoId === paraExcluir.id_funcionario) limpar();
      feedback.sucesso('Funcionário excluído.');
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
    return funcionarios.filter((f) => {
      if (filtro === 'ativos' && !f.ativo) return false;
      if (filtro === 'inativos' && f.ativo) return false;
      if (!q) return true;
      return [f.nome, f.codigo_acesso, f.email, CARGOS[f.cargo]?.label].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [funcionarios, busca, filtro]);

  if (tabelaAusente) {
    return (
      <PaginaCadastro titulo="Funcionários" descricao="Colaboradores com acesso individual ao sistema.">
        <AvisoTabelaAusente modulo="Funcionários" />
      </PaginaCadastro>
    );
  }

  const statusBadge = (f: Funcionario) =>
    estaBloqueado(f) ? (
      <Badge cor="vermelho">Bloqueado</Badge>
    ) : !f.ativo ? (
      <Badge cor="cinza">Inativo</Badge>
    ) : aguardandoLiberacao(f.cargo, f.permissoes) ? (
      <Badge cor="ambar">Aguardando liberação</Badge>
    ) : (
      <Badge cor="verde">Ativo</Badge>
    );

  return (
    <PaginaCadastro titulo="Funcionários" descricao="Colaboradores com código de acesso e senha individuais, cargo e lojas em que atuam.">
      <feedback.Feedback />

      <CardFormulario
        titulo={editandoId ? 'Editar funcionário' : 'Novo funcionário'}
        subtitulo={editandoId ? `Alterando os dados de ${form.nome || 'funcionário'}.` : 'Dados pessoais, acesso e permissões.'}
        editando={!!editandoId}
        salvando={salvando}
        rotuloSalvar={editandoId ? 'Salvar alterações' : '+ Cadastrar funcionário'}
        onSubmit={salvar}
        onLimpar={limpar}
      >
        <Secao titulo="Dados pessoais">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <Campo label="Nome completo" obrigatorio erro={erros.nome} className="md:col-span-5">
              <input
                value={form.nome}
                onChange={(e) => atualizar('nome', e.target.value)}
                placeholder="Nome do colaborador"
                className={inputCls(erros.nome)}
              />
            </Campo>
            <Campo label="CPF" erro={erros.cpf} className="md:col-span-3">
              <input value={form.cpf} onChange={(e) => atualizar('cpf', mascaraCpf(e.target.value))} inputMode="numeric" placeholder="000.000.000-00" className={inputCls(erros.cpf)} />
            </Campo>
            <Campo label="Telefone" erro={erros.telefone} className="md:col-span-2">
              <input value={form.telefone} onChange={(e) => atualizar('telefone', mascaraTelefone(e.target.value))} inputMode="tel" placeholder="(85) 99999-9999" className={inputCls(erros.telefone)} />
            </Campo>
            <Campo label="E-mail" erro={erros.email} className="md:col-span-2">
              <input type="email" value={form.email} onChange={(e) => atualizar('email', e.target.value)} placeholder="nome@email.com" className={inputCls(erros.email)} />
            </Campo>
          </div>
        </Secao>

        <Secao titulo="Acesso ao sistema">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <Campo
              label="Código de acesso (ID)"
              obrigatorio
              erro={erros.codigo_acesso}
              dica="Somente números inteiros. Único na conta, usado junto com a senha para entrar."
              className="md:col-span-4"
            >
              <div className="relative">
                <input
                  value={form.codigo_acesso}
                  onChange={(e) => atualizar('codigo_acesso', somenteDigitosCodigo(e.target.value))}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="ex: 1024"
                  autoComplete="off"
                  className={`${inputCls(erros.codigo_acesso)} pr-28 font-mono`}
                />
                <button
                  type="button"
                  onClick={() =>
                    atualizar(
                      'codigo_acesso',
                      proximoCodigoAcesso(funcionarios.filter((f) => f.id_funcionario !== editandoId).map((f) => f.codigo_acesso))
                    )
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-bold text-blue-400 hover:text-blue-300"
                >
                  Próximo livre
                </button>
              </div>
            </Campo>

            {editandoId && !redefinirSenha ? (
              <div className="md:col-span-8 flex items-end">
                <button
                  type="button"
                  onClick={() => setRedefinirSenha(true)}
                  className="px-4 py-2.5 bg-[#080c14] hover:bg-zinc-800 border border-zinc-700/80 text-white rounded-xl text-xs font-semibold transition"
                >
                  Redefinir senha
                </button>
                <p className="text-[11px] text-zinc-500 ml-3 mb-2.5">A senha atual é mantida se você não redefinir.</p>
              </div>
            ) : (
              <>
                <Campo
                  label={editandoId ? 'Nova senha' : 'Senha'}
                  obrigatorio
                  erro={erros.senha}
                  dica={`Mínimo de ${SENHA_MINIMA} caracteres.`}
                  className="md:col-span-4"
                >
                  <div className="relative">
                    <input
                      type={mostrarSenha ? 'text' : 'password'}
                      value={form.senha}
                      onChange={(e) => atualizar('senha', e.target.value)}
                      autoComplete="new-password"
                      className={`${inputCls(erros.senha)} pr-16`}
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarSenha((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-bold text-zinc-400 hover:text-white"
                    >
                      {mostrarSenha ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                </Campo>
                <Campo label="Confirmar senha" obrigatorio erro={erros.confirmarSenha} className="md:col-span-4">
                  <input
                    type={mostrarSenha ? 'text' : 'password'}
                    value={form.confirmarSenha}
                    onChange={(e) => atualizar('confirmarSenha', e.target.value)}
                    autoComplete="new-password"
                    className={inputCls(erros.confirmarSenha)}
                  />
                </Campo>
              </>
            )}
          </div>
          <div className="md:w-1/2">
            <Toggle
              checked={form.ativo}
              onChange={(v) => atualizar('ativo', v)}
              label="Acesso ativo"
              descricao="Funcionários inativos não conseguem entrar no sistema."
            />
          </div>
        </Secao>

        <Secao titulo="Cargo e permissões">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {(Object.keys(CARGOS) as CargoFuncionario[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => trocarCargo(c)}
                className={`p-3 rounded-xl border text-left transition ${
                  form.cargo === c ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30' : 'border-zinc-800/80 bg-[#080c14] hover:border-zinc-700'
                }`}
              >
                <p className="text-xs font-bold text-white">{CARGOS[c].label}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">{CARGOS[c].descricao}</p>
              </button>
            ))}
          </div>
          {(['Telas', 'Ações'] as const).map((grupo) => (
            <div key={grupo} className="space-y-2">
              <p className="text-[11px] text-zinc-400">
                {grupo === 'Telas' ? 'Telas que este funcionário pode acessar:' : 'Ações permitidas:'}
                {form.cargo === 'ADMIN' && <span className="text-blue-400"> (administrador tem acesso total)</span>}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {PERMISSOES_DISPONIVEIS.filter((p) => p.grupo === grupo).map((p) => (
                  <label
                    key={p.chave}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg bg-[#080c14] border border-zinc-800/80 transition ${
                      form.cargo === 'ADMIN' ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-zinc-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={form.cargo === 'ADMIN'}
                      checked={form.cargo === 'ADMIN' || !!form.permissoes[p.chave]}
                      onChange={(e) => atualizar('permissoes', { ...form.permissoes, [p.chave]: e.target.checked })}
                      className="w-4 h-4 accent-blue-600"
                    />
                    <span className="text-xs text-zinc-300">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </Secao>

        <Secao titulo="Lojas em que atua">
          {lojas.length === 0 ? (
            <p className="text-xs text-zinc-500">Nenhuma loja cadastrada. Cadastre em Cadastros › Lojas para vincular funcionários.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {lojas.map((l) => {
                const marcada = form.lojas.includes(l.id_loja);
                return (
                  <button
                    key={l.id_loja}
                    type="button"
                    onClick={() => alternarLoja(l.id_loja)}
                    aria-pressed={marcada}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                      marcada ? 'bg-blue-600 border-blue-600 text-white' : 'bg-[#080c14] border-zinc-800/80 text-zinc-400 hover:text-white'
                    } ${!l.ativo ? 'opacity-60' : ''}`}
                  >
                    {marcada ? '✓ ' : ''}
                    {l.nome}
                    {!l.ativo ? ' (inativa)' : ''}
                  </button>
                );
              })}
            </div>
          )}
        </Secao>
      </CardFormulario>

      {carregando ? (
        <Carregando />
      ) : (
        <ListaCadastro
          titulo="Funcionários cadastrados"
          total={filtrados.length}
          busca={busca}
          onBusca={setBusca}
          placeholderBusca="Buscar por nome, código ou cargo..."
          filtros={
            <FiltroSegmentado
              valor={filtro}
              onChange={setFiltro}
              opcoes={[
                { valor: 'todos', label: 'Todos' },
                { valor: 'ativos', label: 'Ativos' },
                { valor: 'inativos', label: 'Inativos' },
              ]}
            />
          }
        >
          <TabelaCadastro
            colunas={['Funcionário', 'Cargo', 'Lojas', 'Último acesso', 'Status', 'Ações']}
            vazio={filtrados.length === 0}
            mensagemVazio={funcionarios.length === 0 ? 'Nenhum funcionário cadastrado ainda.' : 'Nenhum funcionário encontrado com esses filtros.'}
          >
            {filtrados.map((f) => (
              <tr key={f.id_funcionario} className={`hover:bg-zinc-800/20 transition ${editandoId === f.id_funcionario ? 'bg-blue-500/5' : ''}`}>
                <td className="px-4 sm:px-5 py-3">
                  <p className="font-bold text-white">{f.nome}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5 font-mono">
                    {f.codigo_acesso}
                    {!REGEX_CODIGO_ACESSO.test(f.codigo_acesso) && (
                      <span className="ml-2 font-sans">
                        <Badge cor="ambar">Edite: código precisa ser numérico</Badge>
                      </span>
                    )}
                  </p>
                </td>
                <td className="px-4 sm:px-5 py-3">
                  <Badge cor={COR_CARGO[f.cargo] || 'cinza'}>{CARGOS[f.cargo]?.label || f.cargo}</Badge>
                </td>
                <td className="px-4 sm:px-5 py-3 text-zinc-300">
                  {f.lojas.length === 0 ? <span className="text-zinc-500">Nenhuma</span> : f.lojas.map(nomeLoja).join(', ')}
                </td>
                <td className="px-4 sm:px-5 py-3 text-zinc-400 whitespace-nowrap">
                  {f.ultimo_acesso ? formatarDataHora(f.ultimo_acesso) : 'Nunca acessou'}
                </td>
                <td className="px-4 sm:px-5 py-3">{statusBadge(f)}</td>
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
              <Badge cor={COR_CARGO[detalhe.cargo] || 'cinza'}>{CARGOS[detalhe.cargo]?.label}</Badge>
              {statusBadge(detalhe)}
            </div>
          }
          itens={[
            ['Código de acesso', <span className="font-mono">{detalhe.codigo_acesso}</span>],
            ['CPF', detalhe.cpf ? mascaraCpf(detalhe.cpf) : ''],
            ['Telefone', detalhe.telefone ? mascaraTelefone(detalhe.telefone) : ''],
            ['E-mail', detalhe.email || ''],
            ['Lojas', detalhe.lojas.map(nomeLoja).join(', ')],
            ['Último acesso', detalhe.ultimo_acesso ? formatarDataHora(detalhe.ultimo_acesso) : 'Nunca acessou'],
            ...(estaBloqueado(detalhe) ? [['Bloqueado até', formatarDataHora(detalhe.bloqueado_ate)] as [string, string]] : []),
          ]}
          extra={
            <div>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Permissões</p>
              <div className="flex flex-wrap gap-1.5">
                {PERMISSOES_DISPONIVEIS.map((p) => {
                  const ok = normalizarPermissoes(detalhe.cargo, detalhe.permissoes)[p.chave];
                  return (
                    <Badge key={p.chave} cor={ok ? 'verde' : 'cinza'}>
                      {ok ? '✓' : '✕'} {p.label}
                    </Badge>
                  );
                })}
              </div>
            </div>
          }
          onFechar={() => setDetalhe(null)}
          onEditar={() => iniciarEdicao(detalhe)}
        />
      )}

      {paraExcluir && (
        <ModalConfirmacao
          titulo="Excluir funcionário"
          mensagem={
            <>
              Excluir <strong className="text-zinc-200">{paraExcluir.nome}</strong> remove o acesso dele ao sistema
              permanentemente. Para apenas suspender o acesso, edite e desative o funcionário.
            </>
          }
          rotuloConfirmar="Excluir funcionário"
          carregando={excluindo}
          onConfirmar={confirmarExclusao}
          onCancelar={() => setParaExcluir(null)}
        />
      )}
    </PaginaCadastro>
  );
};
