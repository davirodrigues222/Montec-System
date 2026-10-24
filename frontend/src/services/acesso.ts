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
// continua sendo a da conta. Não é uma barreira de segurança contra alguém com conhecimento técnico.
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

/**
 * Autorização pontual de um administrador (ID e senha reais de um funcionário com cargo Administrador)
 * para liberar uma tela ou ação ao funcionário atual. Usa a mesma verificação do login de funcionário:
 * a senha é conferida no banco e erros contam para o bloqueio de 5 tentativas. Não troca o operador
 * nem mexe na sessão da conta.
 */
export async function autorizarComoAdministrador(codigo: string, senha: string): Promise<Operador> {
  const admin = await verificarAcessoFuncionario(codigo, senha);
  if (!admin || admin.cargo !== 'ADMIN') throw new Error(MENSAGEM_AUTORIZACAO_NEGADA);
  return admin;
}

/**
 * Acesso de recuperação: o proprietário confirma a SENHA DA CONTA (Supabase Auth) e entra com acesso total.
 * Evita que a conta fique trancada se nenhum funcionário lembrar a senha.
 */
export async function entrarComoProprietario(email: string, senhaConta: string, nome: string): Promise<Operador> {
  const { error } = await supabase.auth.signInWithPassword({ email, password: senhaConta });
  if (error) throw new Error('Senha da conta incorreta.');
  return {
    idFuncionario: null,
    nome: nome || 'Proprietário',
    cargo: 'ADMIN',
    permissoes: normalizarPermissoes('ADMIN', {}),
    lojas: [],
    proprietario: true,
  };
}
