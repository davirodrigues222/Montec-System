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

/** O modelo de mensagem da loja já leva o link de acompanhamento (para avisar na tela). */
export const mensagemLevaLink = (chave: keyof MensagensWhatsapp) =>
  usaLink(obterConfiguracoesLojaSincrono().mensagensWhatsapp[chave] || '');

/**
 * Abre a conversa do cliente da OS com o modelo escolhido já preenchido. Se o modelo usa
 * {link_acompanhamento}, gera o link antes (a janela abre no clique, para o navegador não bloquear).
 * Retorna false se a OS já foi entregue, se o número for inválido ou se o envio for cancelado.
 */
export async function enviarMensagemWhatsapp(os: OrdemServico, chave: keyof MensagensWhatsapp): Promise<boolean> {
  if (!podeEnviarMensagem(os)) {
    alert('Esta OS já foi entregue. As mensagens de WhatsApp só podem ser enviadas antes da entrega.');
    return false;
  }
  const cfg = obterConfiguracoesLojaSincrono();
  const modelo = cfg.mensagensWhatsapp[chave];
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
  } else if (!window.open(destino, '_blank', 'noopener')) {
    alert('O navegador bloqueou a abertura do WhatsApp. Permita pop-ups para este site e tente de novo.');
    return false;
  }
  return true;
}
