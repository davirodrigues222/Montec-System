// =====================================================================
// Edge Function "login-funcionario" (segurança nível 3, fase 2)
//
// Cria ou atualiza o LOGIN PRÓPRIO de um funcionário no Supabase Auth. Roda no servidor do
// Supabase com a chave secreta (service role), que nunca vai para o navegador.
//
// Quem chama: o sistema, logado na conta da loja (dono ou funcionário com login próprio) ou na
// tela de identificação de um aparelho sem ninguém logado (enviando a conta que o aparelho lembra),
// sempre com o código e a senha do funcionário. A função:
//   1. descobre a conta da loja;
//   2. confere código + senha no banco (conferir_funcionario_servidor, com bloqueio por tentativas);
//   3. cria o usuário do funcionário (ou atualiza a senha dele) e o vínculo em membros_conta;
//   4. devolve o e-mail interno do login, para o sistema entrar com ele.
//
// O e-mail é interno (não recebe mensagens): f<código>.<conta>@funcionarios.montec.app
// O mesmo cálculo está em frontend/src/services/loginFuncionario.ts.
// =====================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const resposta = (status: number, corpo: Record<string, unknown>) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export const emailDoFuncionario = (contaId: string, codigo: string) =>
  `f${codigo.trim().toLowerCase()}.${contaId.replace(/-/g, '')}@funcionarios.montec.app`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return resposta(405, { erro: 'Método não permitido.' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let corpo: { codigo?: string; senha?: string; contaId?: string };
  try {
    corpo = await req.json();
  } catch {
    return resposta(400, { erro: 'Requisição inválida.' });
  }

  // 1. Conta da loja
  //    - logado (dono ou funcionário com login próprio): a conta de quem chamou;
  //    - aparelho sem ninguém logado (tela de identificação): a conta que o aparelho lembra.
  //    Nos dois casos quem decide é o código + senha, conferidos no banco com bloqueio por tentativas.
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: autenticado } = await admin.auth.getUser(jwt);
  const chamador = autenticado?.user;
  let contaId: string;
  if (chamador) {
    const { data: membroChamador } = await admin.from('membros_conta').select('conta_id').eq('user_id', chamador.id).maybeSingle();
    contaId = membroChamador?.conta_id ?? chamador.id;
  } else {
    contaId = String(corpo.contaId || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contaId)) {
      return resposta(401, { erro: 'Sessão inválida. Entre na conta novamente.' });
    }
  }
  const codigo = String(corpo.codigo || '').trim();
  const senha = String(corpo.senha || '');
  if (!/^[A-Za-z0-9._-]{1,30}$/.test(codigo) || senha.length < 8 || senha.length > 72) {
    return resposta(400, { erro: 'Código de acesso ou senha inválidos.' });
  }

  // 2. Código + senha conferidos no banco (bloqueia após 5 tentativas)
  const { data: idFuncionario, error: erroConferir } = await admin.rpc('conferir_funcionario_servidor', {
    p_conta: contaId,
    p_codigo: codigo,
    p_senha: senha,
  });
  if (erroConferir) return resposta(500, { erro: 'Não foi possível verificar o funcionário.' });
  if (!idFuncionario) return resposta(403, { erro: 'Código de acesso ou senha inválidos.' });

  // 3. Cria ou atualiza o login do funcionário
  const email = emailDoFuncionario(contaId, codigo);
  const metadados = { conta_id: contaId, id_funcionario: idFuncionario, funcionario: true };
  const { data: vinculo } = await admin.from('membros_conta').select('user_id').eq('id_funcionario', idFuncionario).maybeSingle();

  if (vinculo?.user_id) {
    const { error } = await admin.auth.admin.updateUserById(vinculo.user_id, {
      email,
      password: senha,
      email_confirm: true,
      app_metadata: metadados,
    });
    if (error) return resposta(500, { erro: 'Não foi possível atualizar o login do funcionário.' });
  } else {
    const { data: criado, error } = await admin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      app_metadata: metadados,
    });
    if (error || !criado?.user) return resposta(500, { erro: 'Não foi possível criar o login do funcionário.' });
    const { error: erroVinculo } = await admin
      .from('membros_conta')
      .insert({ user_id: criado.user.id, conta_id: contaId, id_funcionario: idFuncionario });
    if (erroVinculo) {
      await admin.auth.admin.deleteUser(criado.user.id); // não deixa login sem vínculo
      return resposta(500, { erro: 'Não foi possível vincular o login à loja.' });
    }
  }

  return resposta(200, { email, contaId });
});
