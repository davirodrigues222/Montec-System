// =====================================================================
// Edge Function "cakto-webhook": libera e renova a assinatura quando a Cakto confirma o pagamento
//
// A Cakto envia um POST para esta função a cada evento dos produtos configurados no webhook:
//   { "secret": "...", "event": "purchase_approved", "data": { id, amount, customer, offer, ... } }
//
// 1. Confere que o aviso veio da Cakto: assinatura HMAC do cabeçalho X-Cakto-Signature (quando
//    vier) ou o campo "secret" do corpo, comparados com CAKTO_WEBHOOK_SECRET.
// 2. Acha a conta da loja pelo e-mail do comprador (o checkout já vai preenchido com o e-mail da
//    conta — frontend/src/services/assinatura.ts).
// 3. Pagamento (purchase_approved, subscription_renewed, subscription_late_recovered): descobre o
//    plano pela oferta/valor e soma 30 (mensal) ou 365 (anual) dias à validade.
//    Cancelamento (subscription_canceled): mantém o acesso até o fim do período já pago.
//    Reembolso / chargeback (refund, chargeback): corta o acesso na hora.
//
// O mesmo pedido nunca soma dias duas vezes (a Cakto pode reenviar o aviso): veja cakto_eventos
// na migração 20261027090000_assinaturas_saas.sql.
//
// Publicar:  supabase functions deploy cakto-webhook --no-verify-jwt
// Segredo:   supabase secrets set CAKTO_WEBHOOK_SECRET=<secret do webhook na Cakto>
// URL na Cakto (Integrações > Webhooks): https://<projeto>.supabase.co/functions/v1/cakto-webhook
// =====================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';

const EVENTOS_PAGAMENTO = new Set(['purchase_approved', 'subscription_renewed', 'subscription_late_recovered']);
const EVENTOS_CANCELAMENTO = new Set(['subscription_canceled']);
const EVENTOS_ESTORNO = new Set(['refund', 'chargeback']);

// Valores oficiais dos planos (os mesmos de frontend/src/services/assinatura.ts)
const VALOR_MENSAL = 29.99;
const VALOR_ANUAL = 342.0;

// Diferença máxima aceita entre o envio da Cakto e o recebimento (assinatura HMAC)
const TOLERANCIA_SEGUNDOS = 5 * 60;

const resposta = (status: number, corpo: Record<string, unknown>) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

const codificador = new TextEncoder();

/** Comparação em tempo constante (não revela, pelo tempo de resposta, quantos caracteres batem). */
const iguais = (a: string, b: string) => {
  const x = codificador.encode(a);
  const y = codificador.encode(b);
  let diferenca = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diferenca |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diferenca === 0;
};

const hmacHex = async (segredo: string, mensagem: string) => {
  const chave = await crypto.subtle.importKey('raw', codificador.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const assinatura = new Uint8Array(await crypto.subtle.sign('HMAC', chave, codificador.encode(mensagem)));
  return Array.from(assinatura, (b) => b.toString(16).padStart(2, '0')).join('');
};

/** O aviso veio mesmo da Cakto? Usa a assinatura do cabeçalho quando existe; senão, o secret do corpo. */
const avisoAutentico = async (req: Request, corpoCru: string, secretDoCorpo: unknown, segredo: string) => {
  const assinatura = req.headers.get('X-Cakto-Signature');
  const timestamp = req.headers.get('X-Cakto-Timestamp');
  if (assinatura && timestamp) {
    const enviadoEm = Number(timestamp);
    if (!Number.isFinite(enviadoEm) || Math.abs(Date.now() / 1000 - enviadoEm) > TOLERANCIA_SEGUNDOS) return false;
    const esperado = `v1=${await hmacHex(segredo, `${timestamp}.${corpoCru}`)}`;
    return iguais(assinatura, esperado);
  }
  return typeof secretDoCorpo === 'string' && iguais(secretDoCorpo, segredo);
};

const paraNumero = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Plano pelo nome da oferta/produto ("anual"/"mensal") ou, se não disser, pelo valor. */
const descobrirPlano = (pedido: any): { plano: 'mensal' | 'anual'; valor: number } | null => {
  const nomes = `${pedido?.offer?.name ?? ''} ${pedido?.product?.name ?? ''}`.toLowerCase();
  if (nomes.includes('anual')) return { plano: 'anual', valor: VALOR_ANUAL };
  if (nomes.includes('mensal')) return { plano: 'mensal', valor: VALOR_MENSAL };
  // Cupom/juros mudam o valor cobrado: compara pelo preço da oferta e, por último, pelo valor pago
  for (const v of [pedido?.offer?.price, pedido?.baseAmount, pedido?.amount].map(paraNumero)) {
    if (v === null) continue;
    if (Math.abs(v - VALOR_ANUAL) < 0.5) return { plano: 'anual', valor: VALOR_ANUAL };
    if (Math.abs(v - VALOR_MENSAL) < 0.5) return { plano: 'mensal', valor: VALOR_MENSAL };
  }
  return null;
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return resposta(405, { erro: 'Método não permitido.' });

  const segredo = Deno.env.get('CAKTO_WEBHOOK_SECRET');
  if (!segredo) {
    console.error('CAKTO_WEBHOOK_SECRET não configurado.');
    return resposta(500, { erro: 'Webhook não configurado.' });
  }

  // O corpo cru é usado byte a byte na assinatura HMAC (não pode ser reserializado antes)
  const corpoCru = await req.text();
  let aviso: { secret?: unknown; event?: unknown; data?: unknown };
  try {
    aviso = JSON.parse(corpoCru);
  } catch {
    return resposta(400, { erro: 'JSON inválido.' });
  }

  if (!(await avisoAutentico(req, corpoCru, aviso.secret, segredo))) {
    return resposta(401, { erro: 'Assinatura do webhook inválida.' });
  }

  const evento = String(aviso.event || '');
  const ehPagamento = EVENTOS_PAGAMENTO.has(evento);
  const ehCancelamento = EVENTOS_CANCELAMENTO.has(evento);
  const ehEstorno = EVENTOS_ESTORNO.has(evento);
  // Outros eventos (pix gerado, checkout abandonado...) não mudam a assinatura
  if (!ehPagamento && !ehCancelamento && !ehEstorno) return resposta(200, { ok: true, ignorado: evento });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Webhook V2 pode mandar uma lista de pedidos
  const pedidos: any[] = Array.isArray(aviso.data) ? aviso.data : [aviso.data];
  const resultados: Record<string, string>[] = [];

  for (const pedido of pedidos) {
    const orderId = String(pedido?.id || '');
    const email = String(pedido?.customer?.email || '').trim().toLowerCase();
    if (!orderId || !email) {
      resultados.push({ pedido: orderId, resultado: 'sem_id_ou_email' });
      continue;
    }

    const { data: contaId, error: erroConta } = await admin.rpc('conta_por_email', { p_email: email });
    if (erroConta) {
      console.error('Erro ao buscar a conta:', erroConta.message);
      return resposta(500, { erro: 'Erro ao buscar a conta.' });
    }
    if (!contaId) {
      // Pagou com um e-mail que não é de nenhuma conta: fica registrado no log para liberar à mão
      console.warn(`Pedido ${orderId} (${evento}): nenhuma conta com o e-mail ${email}.`);
      resultados.push({ pedido: orderId, resultado: 'conta_nao_encontrada' });
      continue;
    }

    if (ehPagamento) {
      const plano = descobrirPlano(pedido);
      if (!plano) {
        console.warn(`Pedido ${orderId}: não foi possível identificar o plano (oferta "${pedido?.offer?.name}").`);
        resultados.push({ pedido: orderId, resultado: 'plano_desconhecido' });
        continue;
      }
      const { data: resultado, error } = await admin.rpc('registrar_pagamento_assinatura', {
        p_conta: contaId,
        p_email: email,
        p_plano: plano.plano,
        p_valor: plano.valor,
        p_order_id: orderId,
        p_evento: evento,
        p_payload: pedido,
      });
      if (error) {
        console.error('Erro ao registrar o pagamento:', error.message);
        return resposta(500, { erro: 'Erro ao registrar o pagamento.' });
      }
      resultados.push({ pedido: orderId, resultado: String(resultado) });
    } else {
      const { data: resultado, error } = await admin.rpc('encerrar_assinatura', {
        p_conta: contaId,
        p_order_id: orderId,
        p_evento: evento,
        p_imediato: ehEstorno,
        p_payload: pedido,
      });
      if (error) {
        console.error('Erro ao encerrar a assinatura:', error.message);
        return resposta(500, { erro: 'Erro ao encerrar a assinatura.' });
      }
      resultados.push({ pedido: orderId, resultado: String(resultado) });
    }
  }

  return resposta(200, { ok: true, evento, resultados });
});
