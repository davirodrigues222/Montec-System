import {
  linkWhatsapp,
  obterConfiguracoesLojaSincrono,
  preencherModeloMensagem,
  variaveisMensagemOS,
  type MensagensWhatsapp,
} from '../services/api';
import { gerarLinkAcompanhamento } from '../services/acompanhamento';
import type { OrdemServico } from '../types';

// Envio das mensagens automáticas ao cliente de uma OS.
// Os textos são editados em Configurações › Mensagens de WhatsApp; o envio acontece a partir da OS
// (tela de sucesso da Nova OS e Ordens de serviço › Detalhes). O WhatsApp abre com o texto pronto
// na conversa do cliente e a mensagem só é enviada quando o atendente toca em "Enviar".

export const MODELOS_WHATSAPP: { chave: keyof MensagensWhatsapp; rotulo: string }[] = [
  { chave: 'entrada', rotulo: 'Entrada do aparelho' },
  { chave: 'orcamento', rotulo: 'Orçamento pronto' },
  { chave: 'pronto', rotulo: 'Pronto para retirada' },
  { chave: 'entrega', rotulo: 'Entrega e garantia' },
];

/** Mensagens só podem ser enviadas enquanto a OS não foi entregue (status "Entregue / Concluído"). */
export const podeEnviarMensagem = (os: OrdemServico) => os.status_os !== 'ENTREGUE';

const usaLink = (texto: string) => texto.includes('{link_acompanhamento}');

/**
 * Abre a conversa do cliente da OS com o modelo escolhido já preenchido. Se o modelo usa
 * {link_acompanhamento}, gera o link antes (a janela abre no clique, para o navegador não bloquear).
 * Com garantirLink, um modelo sem a variável recebe o link no fim (tela de sucesso da Nova OS).
 * Retorna false se a OS já foi entregue, se o número for inválido ou se o envio for cancelado.
 */
export async function enviarMensagemWhatsapp(
  os: OrdemServico,
  chave: keyof MensagensWhatsapp,
  { garantirLink = false } = {}
): Promise<boolean> {
  if (!podeEnviarMensagem(os)) {
    alert('Esta OS já foi entregue. As mensagens de WhatsApp só podem ser enviadas antes da entrega.');
    return false;
  }
  const cfg = obterConfiguracoesLojaSincrono();
  const salvo = cfg.mensagensWhatsapp[chave];
  const modelo = garantirLink && !usaLink(salvo) ? `${salvo.trim()}\n\nAcompanhe sua ordem de serviço: {link_acompanhamento}` : salvo;
  if (!linkWhatsapp(os.cliente?.whatsapp || '', modelo)) {
    alert('O WhatsApp do cliente não está cadastrado ou é inválido. Informe o número com DDD na OS.');
    return false;
  }

  if (!usaLink(modelo)) {
    window.open(linkWhatsapp(os.cliente?.whatsapp || '', preencherModeloMensagem(modelo, variaveisMensagemOS(os, cfg)))!, '_blank', 'noopener');
    return true;
  }

  const janela = window.open('', '_blank');
  let link = '';
  try {
    link = await gerarLinkAcompanhamento(os.id_os);
  } catch (e: any) {
    if (!window.confirm(`Não foi possível gerar o link de acompanhamento: ${e.message}\n\nEnviar a mensagem sem o link?`)) {
      janela?.close();
      return false;
    }
  }
  // Sem link: tira a variável e a pontuação que sobrar no fim ("...por este link:")
  const texto = preencherModeloMensagem(link ? modelo : modelo.replace(/[\s:]*\{link_acompanhamento\}/g, '.').replace(/\.\.+/g, '.'), variaveisMensagemOS(os, cfg, link));
  const destino = linkWhatsapp(os.cliente?.whatsapp || '', texto)!;
  if (janela) {
    janela.opener = null;
    janela.location.href = destino;
  } else if (!abrirEmNovaAba(destino)) {
    alert('O navegador bloqueou a abertura do WhatsApp. Permita pop-ups para este site e tente de novo.');
    return false;
  }
  return true;
}

// ------------------------------------------
// Pedido de avaliação no Google (pós-venda)
// Diferente das mensagens acima, só vale DEPOIS da entrega. Modelo e link ficam em
// Configurações › Avaliações no Google.
// ------------------------------------------

/** O botão "Pedir avaliação" aparece para a OS entregue. */
export const podePedirAvaliacao = (os: OrdemServico) => os.status_os === 'ENTREGUE';

/** Data em que o pedido de avaliação foi enviado (ISO), ou null. */
export const avaliacaoSolicitadaEm = (os: Pick<OrdemServico, 'checklistEntrada'>): string | null =>
  os.checklistEntrada?.__avaliacaoSolicitadaEm || null;

/**
 * Abre a conversa do cliente com o pedido de avaliação preenchido com os dados da OS.
 * Retorna false (com aviso) se faltar o link do Google, a OS não estiver entregue ou o número for inválido.
 */
export function abrirPedidoAvaliacao(os: OrdemServico): boolean {
  const cfg = obterConfiguracoesLojaSincrono();
  if (!cfg.linkAvaliacaoGoogle) {
    alert('Cadastre o link de avaliação do Google em Configurações › Avaliações no Google.');
    return false;
  }
  if (!podePedirAvaliacao(os)) {
    alert('O pedido de avaliação é enviado depois que a OS é marcada como Entregue / Concluído.');
    return false;
  }
  // Sem a variável no modelo, o link vai no fim (sem ele o pedido não serve para nada)
  const modelo = cfg.mensagemAvaliacao.includes('{link_avaliacao}')
    ? cfg.mensagemAvaliacao
    : `${cfg.mensagemAvaliacao.trim()}\n\n{link_avaliacao}`;
  const destino = linkWhatsapp(os.cliente?.whatsapp || '', preencherModeloMensagem(modelo, variaveisMensagemOS(os, cfg)));
  if (!destino) {
    alert('O WhatsApp do cliente não está cadastrado ou é inválido. Informe o número com DDD na OS.');
    return false;
  }
  if (!abrirEmNovaAba(destino)) {
    alert('O navegador bloqueou a abertura do WhatsApp. Permita pop-ups para este site e tente de novo.');
    return false;
  }
  return true;
}

/**
 * Abre um link em nova aba sem dar à página aberta acesso a esta (opener = null).
 * Com o recurso 'noopener' o window.open devolve sempre null, mesmo abrindo: não daria para saber
 * se o navegador bloqueou. Retorna false só quando a aba não abriu.
 */
export function abrirEmNovaAba(url: string): boolean {
  const janela = window.open(url, '_blank');
  if (!janela) return false;
  janela.opener = null;
  return true;
}
