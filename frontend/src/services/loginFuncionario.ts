// ==========================================
// Login próprio do funcionário (segurança nível 3)
// Cada funcionário entra com um usuário do Supabase só dele, ligado à loja (membros_conta).
// O login do dono da conta não fica mais no aparelho depois que um funcionário se identifica:
// assim ninguém consegue, pelo console do navegador, trocar a senha da conta ou passar por cima
// das permissões. Banco: migrações 20261026120000 e 20261026150000; servidor: Edge Function
// "login-funcionario".
// ==========================================
import { supabase } from './supabaseClient';
import { type Operador, montarOperador } from './acesso';

/** Mesmo cálculo da Edge Function login-funcionario (e-mail interno, não recebe mensagens). */
export const emailDoFuncionario = (contaId: string, codigo: string) =>
  `f${codigo.trim().toLowerCase()}.${contaId.replace(/-/g, '')}@funcionarios.montec.app`;

import { ehLoginDeFuncionario } from './contaLogin';

export { contaDoUsuario, ehLoginDeFuncionario } from './contaLogin';

// ---------------------------------------------------------------------------------------------
// Aparelho: lembra a loja para a tela de identificação funcionar sem nenhum login salvo.
// Não guarda senha nem token: só o id da conta, o e-mail do dono (para "Entrar como proprietário")
// e o nome da loja exibido na tela.
// ---------------------------------------------------------------------------------------------
const CHAVE_APARELHO = 'montec_conta_aparelho';

export interface ContaAparelho {
  contaId: string;
  emailDono: string;
  nomeLoja: string;
}

export function lerContaAparelho(): ContaAparelho | null {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_APARELHO) || 'null');
    return salvo?.contaId ? salvo : null;
  } catch {
    return null;
  }
}

export function lembrarContaAparelho(dados: Partial<ContaAparelho> & { contaId: string }) {
  try {
    const atual = lerContaAparelho();
    const mesmaConta = atual?.contaId === dados.contaId;
    localStorage.setItem(
      CHAVE_APARELHO,
      JSON.stringify({
        contaId: dados.contaId,
        emailDono: dados.emailDono || (mesmaConta ? atual?.emailDono : '') || '',
        nomeLoja: dados.nomeLoja || (mesmaConta ? atual?.nomeLoja : '') || '',
      })
    );
  } catch {
    /* armazenamento indisponível: a identificação volta a pedir o login do dono */
  }
}

export function esquecerContaAparelho() {
  try {
    localStorage.removeItem(CHAVE_APARELHO);
  } catch {
    /* nada a limpar */
  }
}

// ---------------------------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------------------------

/** A Edge Function ainda não foi publicada (ou o aparelho está sem internet). */
export class LoginProprioIndisponivel extends Error {}

/**
 * Cria ou atualiza o login do funcionário no servidor (confere código + senha no banco, com bloqueio
 * por tentativas) e devolve o e-mail interno. Também usado ao definir a senha no cadastro, para o
 * login novo valer na hora.
 */
export async function sincronizarLoginFuncionario(contaId: string, codigo: string, senha: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('login-funcionario', {
    body: { codigo: codigo.trim(), senha, contaId },
  });
  if (error) {
    const status = (error as any)?.context?.status as number | undefined;
    let mensagem = '';
    try {
      mensagem = (await (error as any)?.context?.json?.())?.erro || '';
    } catch {
      /* resposta sem corpo */
    }
    if (status === 403 || status === 400) throw new Error(mensagem || 'Código de acesso ou senha inválidos.');
    if (status === 401) throw new Error(mensagem || 'Sessão inválida. Entre na conta novamente.');
    throw new LoginProprioIndisponivel(mensagem || 'Login próprio indisponível no momento.');
  }
  if (!data?.email) throw new LoginProprioIndisponivel('Resposta inválida do servidor.');
  return data.email as string;
}

/**
 * Identifica o funcionário com o login próprio dele: o aparelho passa a ficar logado COMO o
 * funcionário (o login do dono, se estava salvo, é substituído).
 */
export async function entrarComLoginProprio(contaId: string, codigo: string, senha: string): Promise<void> {
  const email = await sincronizarLoginFuncionario(contaId, codigo, senha);
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error('Não foi possível entrar com o login do funcionário. Tente novamente.');
}

/** Funcionário do login atual (null se o login não for de funcionário, ou ele estiver inativo). */
export async function operadorDoLoginAtual(): Promise<Operador | null> {
  const { data, error } = await supabase.rpc('funcionario_do_login');
  if (error) return null;
  const linha = Array.isArray(data) ? data[0] : data;
  return linha?.id_funcionario ? montarOperador(linha) : null;
}

/**
 * Ao abrir a página: o login salvo pelo Supabase neste navegador é de um funcionário?
 * (lido direto do armazenamento, antes da sessão carregar, para não piscar a tela de identificação no F5)
 */
export function sessaoSalvaEhDeFuncionario(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i);
      if (chave?.startsWith('sb-') && chave.endsWith('-auth-token')) {
        const salvo = JSON.parse(localStorage.getItem(chave) || 'null');
        return ehLoginDeFuncionario(salvo?.user || salvo?.currentSession?.user);
      }
    }
  } catch {
    /* sem armazenamento: carrega normalmente */
  }
  return false;
}

/** Sai do login do funcionário neste aparelho (volta para a tela de identificação da loja). */
export async function sairDoLoginFuncionario(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' });
}
