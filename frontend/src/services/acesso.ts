import { supabase } from './supabaseClient';
import { type CargoFuncionario, type ChavePermissao, type Permissoes, CARGOS, normalizarPermissoes } from './cadastros';
import type { SecaoCadastro } from '../types';

// ==========================================
// Acesso por funcionário (operador) dentro da conta já autenticada.
// Depois do login da conta, o sistema SEMPRE pede código + senha do funcionário.
// O operador vale para a aba atual: o F5 mantém a identificação; fechar a aba, voltar de outro
// site ou sair da conta pede código e senha de novo (ver CHAVE_OPERADOR_SESSAO em App.tsx).
//
// Importante: isto controla o que cada funcionário vê no sistema, mas a sessão do Supabase
// continua sendo a da conta. No banco, só o cadastro de funcionários e as senhas exigem um
// administrador identificado (migração 20261025150000); a leitura dos dados não é bloqueada.
// ==========================================

export type AbaSistema =
  | 'dashboard'
  | 'relatorios'
  | 'historico'
  | 'configuracoes'
  | 'nova-os'
  | 'garantia-retorno'
  | 'cadastros';

export interface Operador {
  idFuncionario: string | null; // null = proprietário da conta
  nome: string;
  cargo: CargoFuncionario;
  permissoes: Permissoes;
  lojas: string[];
  proprietario: boolean;
}

/** Permissão necessária para cada tela do menu. */
export const PERMISSAO_POR_ABA: Record<Exclude<AbaSistema, 'cadastros'>, ChavePermissao> = {
  dashboard: 'tela_painel',
  'nova-os': 'tela_nova_os',
  historico: 'tela_ordens',
  'garantia-retorno': 'tela_garantias',
  relatorios: 'tela_relatorios',
  configuracoes: 'tela_configuracoes',
};

export const PERMISSAO_POR_SECAO: Record<SecaoCadastro, ChavePermissao> = {
  clientes: 'tela_cadastros',
  servicos: 'tela_cadastros',
  fornecedores: 'tela_cadastros',
  lojas: 'tela_empresa',
  funcionarios: 'tela_empresa',
  'formas-pagamento': 'tela_empresa',
};

/** Ordem de preferência ao escolher a tela inicial do operador. */
const ORDEM_ABAS: Exclude<AbaSistema, 'cadastros'>[] = [
  'dashboard',
  'nova-os',
  'historico',
  'garantia-retorno',
  'relatorios',
  'configuracoes',
];
const ORDEM_SECOES: SecaoCadastro[] = ['clientes', 'servicos', 'fornecedores', 'lojas', 'funcionarios', 'formas-pagamento'];

export const podeAcessar = (op: Operador | null, chave: ChavePermissao) => !!op && !!op.permissoes[chave];

export function podeAcessarAba(op: Operador | null, aba: AbaSistema, secao?: SecaoCadastro): boolean {
  if (aba === 'cadastros') {
    return secao ? podeAcessar(op, PERMISSAO_POR_SECAO[secao]) : secoesPermitidas(op).length > 0;
  }
  return podeAcessar(op, PERMISSAO_POR_ABA[aba]);
}

export const secoesPermitidas = (op: Operador | null) => ORDEM_SECOES.filter((s) => podeAcessar(op, PERMISSAO_POR_SECAO[s]));

/** Primeira tela liberada para o operador, ou null se ele ainda não tem nenhuma. */
export function primeiraAbaPermitida(op: Operador | null): { aba: AbaSistema; secao?: SecaoCadastro } | null {
  const aba = ORDEM_ABAS.find((a) => podeAcessarAba(op, a));
  if (aba) return { aba };
  const secao = secoesPermitidas(op)[0];
  return secao ? { aba: 'cadastros', secao } : null;
}

/**
 * Confere código + senha do funcionário na função do banco (o hash nunca chega ao navegador).
 * Retorna null se código/senha forem inválidos ou o funcionário estiver inativo.
 * Lança erro com a mensagem do banco quando o acesso estiver bloqueado por tentativas.
 */
export async function verificarAcessoFuncionario(codigo: string, senha: string): Promise<Operador | null> {
  const { data, error } = await supabase.rpc('verificar_acesso_funcionario', {
    p_codigo: codigo.trim(),
    p_senha: senha,
  });
  if (error) throw new Error(error.message || 'Não foi possível verificar o acesso.');

  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha?.id_funcionario) return null;

  const cargo = (linha.cargo as CargoFuncionario) in CARGOS ? (linha.cargo as CargoFuncionario) : 'ATENDENTE';
  return {
    idFuncionario: linha.id_funcionario,
    nome: linha.nome,
    cargo,
    permissoes: normalizarPermissoes(cargo, linha.permissoes),
    lojas: linha.lojas || [],
    proprietario: false,
  };
}

export const MENSAGEM_AUTORIZACAO_NEGADA = 'Credenciais inválidas ou usuário sem permissão administrativa.';

// Cabeçalhos enviados em toda consulta ao banco (migração 20261025150000): identificam quem está
// operando e a liberação dada por um administrador. As regras do cadastro de funcionários conferem
// esses tokens no banco, então editar o navegador não dá acesso de administrador.
const cabecalhosBanco = () => (supabase as unknown as { rest: { headers: Headers } }).rest.headers;

function definirCabecalho(nome: string, valor: string | null) {
  if (valor) cabecalhosBanco().set(nome, valor);
  else cabecalhosBanco().delete(nome);
}

/** Token da sessão do operador atual (null ao sair do funcionário ou da conta). */
export const aplicarTokenOperador = (token: string | null) => definirCabecalho('x-operador-token', token);

let tokenAutorizacao: string | null = null;

/** Liberação de administrador em uso (null encerra a anterior no banco). */
export function aplicarTokenAutorizacao(token: string | null) {
  if (tokenAutorizacao && tokenAutorizacao !== token) {
    supabase.rpc('encerrar_autorizacao_admin', { p_token: tokenAutorizacao }).then(undefined, () => {});
  }
  tokenAutorizacao = token;
  definirCabecalho('x-autorizacao-token', token);
}

/** Há uma liberação de administrador ativa nesta aba. */
export const temAutorizacaoAdmin = () => !!tokenAutorizacao;

/** Erro de função inexistente no banco (migração ainda não executada): o app usa a alternativa antiga. */
const funcaoAusente = (error: any, nome: string) =>
  !!error && (error.code === 'PGRST202' || error.code === '42883' || String(error.message || '').includes(nome));

const montarOperador = (linha: any): Operador => {
  const cargo = (linha.cargo as CargoFuncionario) in CARGOS ? (linha.cargo as CargoFuncionario) : 'ATENDENTE';
  return {
    idFuncionario: linha.id_funcionario,
    nome: linha.nome,
    cargo,
    permissoes: normalizarPermissoes(cargo, linha.permissoes),
    lojas: linha.lojas || [],
    proprietario: false,
  };
};

/**
 * Entrada do funcionário com sessão no banco (migração 20261025120000): devolve o operador e um token.
 * O navegador guarda só o token; no F5 o funcionário e as permissões são lidos de novo do banco.
 * Sem a migração, entra como antes e sem token (o F5 volta a pedir código e senha).
 */
export async function entrarFuncionario(codigo: string, senha: string): Promise<{ operador: Operador; token: string | null } | null> {
  const { data, error } = await supabase.rpc('entrar_funcionario', { p_codigo: codigo.trim(), p_senha: senha });
  if (error) {
    if (!funcaoAusente(error, 'entrar_funcionario')) throw new Error(error.message || 'Não foi possível verificar o acesso.');
    const operador = await verificarAcessoFuncionario(codigo, senha);
    return operador ? { operador, token: null } : null;
  }
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha?.id_funcionario) return null;
  return { operador: montarOperador(linha), token: linha.token || null };
}

/** Recupera o funcionário de uma sessão (F5). Token inválido, vencido ou funcionário inativo: null. */
export async function restaurarSessaoFuncionario(token: string): Promise<Operador | null> {
  const { data, error } = await supabase.rpc('restaurar_sessao_operador', { p_token: token });
  if (error) return null;
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha) return null;
  // Sessão de proprietário (migração 20261025140000): acesso total
  if (linha.proprietario) return operadorProprietario(linha.nome);
  return linha.id_funcionario ? montarOperador(linha) : null;
}

const operadorProprietario = (nome: string): Operador => ({
  idFuncionario: null,
  nome: nome || 'Proprietário',
  cargo: 'ADMIN',
  permissoes: normalizarPermissoes('ADMIN', {}),
  lojas: [],
  proprietario: true,
});

/** Encerra a sessão do funcionário no banco (sair do funcionário / trocar de funcionário). */
export async function encerrarSessaoFuncionario(token: string): Promise<void> {
  await supabase.rpc('encerrar_sessao_operador', { p_token: token });
}

/**
 * Confere a senha atual de um funcionário (redefinição de senha) sem registrar "último acesso"
 * e sem mexer no contador do login dele. Sem a migração, usa a verificação do login.
 */
export async function conferirSenhaFuncionario(idFuncionario: string, codigo: string, senha: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('conferir_senha_funcionario', { p_id_funcionario: idFuncionario, p_senha: senha });
  if (error) {
    if (!funcaoAusente(error, 'conferir_senha_funcionario')) throw new Error(error.message || 'Não foi possível verificar a senha.');
    const op = await verificarAcessoFuncionario(codigo, senha);
    return !!op && op.idFuncionario === idFuncionario;
  }
  return data === true;
}

/**
 * Autorização pontual de um administrador (ID e senha reais de um funcionário com cargo Administrador)
 * para liberar uma tela ou ação ao funcionário atual. Usa a mesma verificação do login de funcionário:
 * a senha é conferida no banco e erros contam para o bloqueio de 5 tentativas. Não troca o operador
 * nem mexe na sessão da conta.
 */
export async function autorizarComoAdministrador(
  codigo: string,
  senha: string
): Promise<{ nome: string; idFuncionario: string; token: string | null }> {
  // Função própria (migração 20261025120000): senhas erradas aqui não travam o login do administrador.
  // Desde a migração 20261025150000 devolve também o token da liberação (30 minutos).
  const { data, error } = await supabase.rpc('autorizar_administrador', { p_codigo: codigo.trim(), p_senha: senha });
  if (!error) {
    const linha = Array.isArray(data) ? data[0] : data;
    if (!linha?.id_funcionario) throw new Error(MENSAGEM_AUTORIZACAO_NEGADA);
    return { nome: linha.nome, idFuncionario: linha.id_funcionario, token: linha.token || null };
  }
  if (!funcaoAusente(error, 'autorizar_administrador')) throw new Error(error.message || 'Não foi possível verificar a autorização.');

  // Sem a migração: verificação do login (como antes)
  const admin = await verificarAcessoFuncionario(codigo, senha);
  if (!admin || admin.cargo !== 'ADMIN' || !admin.idFuncionario) throw new Error(MENSAGEM_AUTORIZACAO_NEGADA);
  return { nome: admin.nome, idFuncionario: admin.idFuncionario, token: null };
}

/**
 * Acesso de recuperação: o proprietário confirma a SENHA DA CONTA (Supabase Auth) e entra com acesso total.
 * Evita que a conta fique trancada se nenhum funcionário lembrar a senha.
 */
export async function entrarComoProprietario(
  email: string,
  senhaConta: string,
  nome: string
): Promise<{ operador: Operador; token: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password: senhaConta });
  if (error) throw new Error('Senha da conta incorreta.');

  // Sessão no banco para o F5 não pedir a senha de novo (migração 20261025140000).
  // Sem a migração, entra do mesmo jeito, sem token.
  const { data, error: erroSessao } = await supabase.rpc('entrar_proprietario', { p_senha: senhaConta });
  const linha = !erroSessao ? (Array.isArray(data) ? data[0] : data) : null;
  return { operador: operadorProprietario(nome), token: linha?.token || null };
}
