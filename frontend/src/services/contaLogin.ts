// Qual loja é a do usuário logado (sem dependências: usado por api.ts, cadastros.ts e loginFuncionario.ts)

/** Sessão de um funcionário com login próprio (o app_metadata só o servidor consegue gravar). */
export const ehLoginDeFuncionario = (user: any) => !!user?.app_metadata?.funcionario && !!user?.app_metadata?.conta_id;

/** Conta da loja do usuário logado: a do vínculo para funcionários, o próprio id para o dono. */
export const contaDoUsuario = (user: any): string | null =>
  (ehLoginDeFuncionario(user) ? user.app_metadata.conta_id : user?.id) || null;
