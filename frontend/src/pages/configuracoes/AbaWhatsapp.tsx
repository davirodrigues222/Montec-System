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

const MODELOS: { chave: keyof MensagensWhatsapp; titulo: string; quando: string }[] = [
  { chave: 'entrada', titulo: 'OS aberta / entrada do aparelho', quando: 'Ao receber o aparelho.' },
  { chave: 'orcamento', titulo: 'Orçamento pronto para aprovação', quando: 'Depois do diagnóstico.' },
  { chave: 'pronto', titulo: 'Aparelho pronto para retirada', quando: 'Quando a OS fica pronta.' },
  { chave: 'entrega', titulo: 'Comprovante de entrega e garantia', quando: 'Na entrega ao cliente.' },
];

const VARIAVEIS = ['{cliente}', '{aparelho}', '{numero_os}', '{valor}', '{loja}', '{prazo_garantia}'];

export const AbaWhatsapp: React.FC<PropsAba> = ({ config, alterar }) => {
  // A pré-visualização usa a OS mais recente da loja (dados reais); sem ordens, mostra as variáveis
  const [osExemplo, setOsExemplo] = useState<OrdemServico | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

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

  const copiar = async (chave: string, texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(chave);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      alert('Não foi possível copiar. Selecione o texto e copie manualmente.');
    }
  };

  const testar = (texto: string) => {
    const link = linkWhatsapp(config.telefone, texto);
    if (!link) {
      alert('Cadastre o WhatsApp comercial da loja em Configurações › Dados da loja & impressão para testar o envio no seu próprio número.');
      return;
    }
    window.open(link, '_blank', 'noopener');
  };

  return (
    <div className="space-y-6">
      <div className={cardCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">Mensagens automáticas de WhatsApp</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Em Ordens de serviço › Detalhes, cada modelo vira um botão que abre o WhatsApp do cliente com o texto pronto.
            </p>
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
            ? `Pré-visualização com a OS #${osExemplo.numero_os}, a mais recente da loja.`
            : 'Ainda não há ordens de serviço: a pré-visualização mostra as variáveis sem substituir.'}
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
                <p className="text-[11px] text-zinc-500">{m.quando}</p>
              </div>
              <textarea
                rows={4}
                value={texto}
                onChange={(e) => alterar({ mensagensWhatsapp: { ...config.mensagensWhatsapp, [m.chave]: e.target.value } })}
                className="w-full p-3 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-zinc-200 leading-relaxed outline-none focus:border-blue-500"
              />
              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-zinc-300 whitespace-pre-wrap">
                {previa}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => copiar(m.chave, previa)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-[11px] font-semibold transition"
                >
                  {copiado === m.chave ? '✓ Copiado' : 'Copiar mensagem'}
                </button>
                <button
                  type="button"
                  onClick={() => testar(previa)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold transition"
                >
                  Testar no WhatsApp da loja
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
