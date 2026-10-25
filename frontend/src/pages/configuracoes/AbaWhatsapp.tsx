import React, { useEffect, useState } from 'react';
import {
  MENSAGENS_WHATSAPP_PADRAO,
  buscarOrdensServico,
  linkWhatsapp,
  preencherModeloMensagem,
  variaveisMensagemOS,
  type MensagensWhatsapp,
} from '../../services/api';
import type { OrdemServico } from '../../types';
import { type PropsAba, cardCls } from './tipos';

const MODELOS: { chave: keyof MensagensWhatsapp; titulo: string; onde: string }[] = [
  {
    chave: 'entrada',
    titulo: 'OS aberta / entrada do aparelho',
    onde: 'Botão "Avisar cliente no WhatsApp" logo após criar a OS, e nos detalhes da OS.',
  },
  { chave: 'orcamento', titulo: 'Orçamento pronto para aprovação', onde: 'Botão "Orçamento pronto" nos detalhes da OS.' },
  { chave: 'pronto', titulo: 'Aparelho pronto para retirada', onde: 'Botão "Pronto para retirada" nos detalhes da OS.' },
  { chave: 'entrega', titulo: 'Comprovante de entrega e garantia', onde: 'Botão "Entrega e garantia" nos detalhes da OS.' },
];

const PASSOS = [
  'Aqui você só edita os textos. Nada é enviado a partir desta tela.',
  'Para enviar, abra a OS do cliente: logo depois de criar a ordem (botão "Avisar cliente no WhatsApp") ou em Ordens de serviço › Detalhes.',
  'O WhatsApp abre na conversa do cliente com o texto já preenchido com os dados daquela OS.',
  'Você revisa e toca em Enviar no WhatsApp. O cliente precisa ter o WhatsApp cadastrado na OS.',
  'Depois que a OS é marcada como Entregue / Concluído, os botões ficam bloqueados. Envie a mensagem de entrega antes de mudar o status.',
];

const VARIAVEIS = ['{cliente}', '{aparelho}', '{numero_os}', '{valor}', '{loja}', '{prazo_garantia}'];

export const AbaWhatsapp: React.FC<PropsAba> = ({ config, alterar }) => {
  // A pré-visualização usa a OS mais recente da loja (dados reais); sem ordens, mostra as variáveis
  const [osExemplo, setOsExemplo] = useState<OrdemServico | null>(null);

  useEffect(() => {
    let ativo = true;
    buscarOrdensServico().then((ordens) => {
      if (ativo) setOsExemplo(ordens.find((o) => o.status_os !== 'RASCUNHO') || null);
    });
    return () => {
      ativo = false;
    };
  }, []);

  const preVisualizar = (modelo: string) =>
    osExemplo ? preencherModeloMensagem(modelo, variaveisMensagemOS(osExemplo, config)) : modelo;

  const testar = (texto: string) => {
    const link = linkWhatsapp(config.telefone, texto);
    if (!link) {
      alert('Cadastre o WhatsApp comercial da loja em Configurações › Impressão para testar o envio no seu próprio número.');
      return;
    }
    window.open(link, '_blank', 'noopener');
  };

  return (
    <div className="space-y-6">
      <div className={cardCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">Como funciona</h3>
            <ol className="mt-2 space-y-1.5 text-xs text-zinc-400 list-decimal list-inside">
              {PASSOS.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
          </div>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Restaurar os quatro modelos de mensagem padrão?')) {
                alterar({ mensagensWhatsapp: { ...MENSAGENS_WHATSAPP_PADRAO } });
              }
            }}
            className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold transition"
          >
            Restaurar modelos padrão
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-zinc-500 font-semibold">Variáveis:</span>
          {VARIAVEIS.map((v) => (
            <code key={v} className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-200">
              {v}
            </code>
          ))}
        </div>
        <p className="text-[11px] text-zinc-500">
          {osExemplo
            ? `Os exemplos abaixo usam a OS ${osExemplo.numero_os}, a mais recente da loja. Cada cliente recebe com os dados da própria OS.`
            : 'Ainda não há ordens de serviço: os exemplos mostram as variáveis sem substituir.'}
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {MODELOS.map((m) => {
          const texto = config.mensagensWhatsapp[m.chave];
          const previa = preVisualizar(texto);
          return (
            <div key={m.chave} className={cardCls}>
              <div>
                <h4 className="text-xs font-bold text-white">{m.titulo}</h4>
                <p className="text-[11px] text-zinc-500">Onde enviar: {m.onde}</p>
              </div>
              <textarea
                rows={4}
                value={texto}
                onChange={(e) => alterar({ mensagensWhatsapp: { ...config.mensagensWhatsapp, [m.chave]: e.target.value } })}
                className="w-full p-3 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-zinc-200 leading-relaxed outline-none focus:border-blue-500"
              />
              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-zinc-300 whitespace-pre-wrap">
                <span className="block text-[10px] font-bold text-emerald-400 uppercase mb-1">Exemplo de como o cliente recebe</span>
                {previa}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => testar(previa)}
                  title="Abre o WhatsApp no número da própria loja para você ver como a mensagem chega"
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-[11px] font-semibold transition"
                >
                  Enviar teste para o WhatsApp da loja
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
