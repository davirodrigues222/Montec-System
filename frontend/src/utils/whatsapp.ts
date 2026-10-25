import {
  linkWhatsapp,
  obterConfiguracoesLojaSincrono,
  preencherModeloMensagem,
  variaveisMensagemOS,
  type MensagensWhatsapp,
} from '../services/api';
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

/**
 * Abre a conversa do cliente da OS com o modelo escolhido já preenchido.
 * Retorna false se a OS já foi entregue ou se o número for inválido.
 */
export function enviarMensagemWhatsapp(os: OrdemServico, chave: keyof MensagensWhatsapp): boolean {
  if (!podeEnviarMensagem(os)) {
    alert('Esta OS já foi entregue. As mensagens de WhatsApp só podem ser enviadas antes da entrega.');
    return false;
  }
  const cfg = obterConfiguracoesLojaSincrono();
  const mensagem = preencherModeloMensagem(cfg.mensagensWhatsapp[chave], variaveisMensagemOS(os, cfg));
  const link = linkWhatsapp(os.cliente?.whatsapp || '', mensagem);
  if (!link) {
    alert('O WhatsApp do cliente não está cadastrado ou é inválido. Informe o número com DDD na OS.');
    return false;
  }
  window.open(link, '_blank', 'noopener');
  return true;
}
