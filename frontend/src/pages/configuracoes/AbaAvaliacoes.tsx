import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Star } from 'lucide-react';
import {
  MENSAGEM_AVALIACAO_PADRAO,
  buscarOrdensServico,
  linkAvaliacaoEhGoogle,
  linkWhatsapp,
  normalizarLinkAvaliacao,
  preencherModeloMensagem,
  variaveisMensagemOS,
} from '../../services/api';
import type { OrdemServico } from '../../types';
import { abrirEmNovaAba } from '../../utils/whatsapp';
import { type PropsAba, cardCls } from './tipos';

// ==========================================
// Configurações › Avaliações no Google: link do Google Meu Negócio e o modelo do pedido de avaliação.
// O pedido é enviado pelo botão "Pedir avaliação no Google" nos detalhes da OS entregue.
// ==========================================

const VARIAVEIS: { chave: string; descricao: string }[] = [
  { chave: '{cliente}', descricao: 'Nome do cliente' },
  { chave: '{aparelho}', descricao: 'Modelo do aparelho' },
  { chave: '{loja}', descricao: 'Nome da loja' },
  { chave: '{numero_os}', descricao: 'Número da OS' },
  { chave: '{link_avaliacao}', descricao: 'Seu link do Google' },
];

const COMO_PEGAR_LINK = [
  'Entre no Google com a conta da sua empresa e pesquise o nome da loja (ou abra o app Google Meu Negócio).',
  'No painel da empresa, toque em "Pedir avaliações" (ou "Receber mais avaliações").',
  'Copie o link que aparece (começa com https://g.page/r/...) e cole abaixo.',
];

const LINK_EXEMPLO = 'https://g.page/r/sua-loja/review';

export const AbaAvaliacoes: React.FC<PropsAba> = ({ config, alterar }) => {
  const campoMensagem = useRef<HTMLTextAreaElement>(null);
  // Prévia com uma OS entregue de verdade (ou a mais recente); sem ordens, mostra as variáveis
  const [osExemplo, setOsExemplo] = useState<OrdemServico | null>(null);

  useEffect(() => {
    let ativo = true;
    buscarOrdensServico()
      .then((ordens) => {
        if (!ativo) return;
        setOsExemplo(ordens.find((o) => o.status_os === 'ENTREGUE') || ordens.find((o) => o.status_os !== 'RASCUNHO') || null);
      })
      .catch(() => ativo && setOsExemplo(null));
    return () => {
      ativo = false;
    };
  }, []);

  const link = config.linkAvaliacaoGoogle.trim();
  const linkValido = normalizarLinkAvaliacao(link);
  const situacaoLink: 'vazio' | 'invalido' | 'fora_google' | 'ok' = !link
    ? 'vazio'
    : !linkValido
      ? 'invalido'
      : linkAvaliacaoEhGoogle(linkValido)
        ? 'ok'
        : 'fora_google';

  const mensagem = config.mensagemAvaliacao;
  const semVariavelLink = !mensagem.includes('{link_avaliacao}');
  const cfgPrevia = { ...config, linkAvaliacaoGoogle: linkValido || LINK_EXEMPLO };
  const previaBase = semVariavelLink ? `${mensagem.trim()}\n\n{link_avaliacao}` : mensagem;
  const previa = osExemplo
    ? preencherModeloMensagem(previaBase, variaveisMensagemOS(osExemplo, cfgPrevia))
    : preencherModeloMensagem(previaBase, { link_avaliacao: cfgPrevia.linkAvaliacaoGoogle });

  /** Insere a variável onde está o cursor (ou no fim) e devolve o foco ao texto. */
  const inserirVariavel = (variavel: string) => {
    const campo = campoMensagem.current;
    const inicio = campo?.selectionStart ?? mensagem.length;
    const fim = campo?.selectionEnd ?? mensagem.length;
    const antes = mensagem.slice(0, inicio);
    const espaco = antes && !/\s$/.test(antes) ? ' ' : '';
    const novo = `${antes}${espaco}${variavel}${mensagem.slice(fim)}`;
    alterar({ mensagemAvaliacao: novo });
    const cursor = inicio + espaco.length + variavel.length;
    requestAnimationFrame(() => {
      campo?.focus();
      campo?.setSelectionRange(cursor, cursor);
    });
  };

  const testar = () => {
    const destino = linkWhatsapp(config.telefone, previa);
    if (!destino) {
      alert('Cadastre o WhatsApp comercial da loja em Configurações › Impressão para testar o envio no seu próprio número.');
      return;
    }
    abrirEmNovaAba(destino);
  };

  return (
    <div className="space-y-6">
      {/* ================= LINK DO GOOGLE ================= */}
      <div className={cardCls}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center shrink-0">
            <Star className="w-5 h-5 text-amber-400" fill="currentColor" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Link de avaliação do Google Meu Negócio</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Com o link cadastrado, a OS entregue ganha o botão <strong className="text-zinc-200">Pedir avaliação no Google</strong>.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="link-avaliacao" className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
            Seu link de avaliação
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="link-avaliacao"
              type="url"
              inputMode="url"
              value={config.linkAvaliacaoGoogle}
              onChange={(e) => alterar({ linkAvaliacaoGoogle: e.target.value.trim() })}
              placeholder={LINK_EXEMPLO}
              autoComplete="off"
              spellCheck={false}
              className={`flex-1 min-w-0 px-3.5 py-2.5 bg-[#080c14] border rounded-xl text-xs text-white outline-none transition placeholder:text-zinc-600 ${
                situacaoLink === 'invalido' ? 'border-red-500/70 focus:border-red-500' : 'border-zinc-800/80 focus:border-blue-500'
              }`}
            />
            <button
              type="button"
              onClick={() => linkValido && abrirEmNovaAba(linkValido)}
              disabled={!linkValido}
              title="Abre o link para você conferir se cai na página de avaliação da loja"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-zinc-200 rounded-xl text-xs font-semibold transition"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Abrir link
            </button>
          </div>
          {situacaoLink === 'invalido' && (
            <p className="text-[11px] text-red-400 font-semibold mt-1">Cole o endereço completo, começando com https://</p>
          )}
          {situacaoLink === 'fora_google' && (
            <p className="text-[11px] text-amber-400 font-semibold mt-1">
              Este link não parece ser do Google. Confira com "Abrir link" se ele leva à página de avaliação da loja.
            </p>
          )}
          {situacaoLink === 'ok' && <p className="text-[11px] text-emerald-400 font-semibold mt-1">✓ Link do Google cadastrado.</p>}
          {situacaoLink === 'vazio' && (
            <p className="text-[11px] text-zinc-500 mt-1">Sem o link, o botão de pedir avaliação não aparece nas ordens.</p>
          )}
        </div>

        <details className="group rounded-xl border border-zinc-800/80 bg-[#080c14] px-4 py-3">
          <summary className="cursor-pointer text-xs font-semibold text-blue-400 select-none">Onde encontro esse link?</summary>
          <ol className="mt-2 space-y-1.5 text-xs text-zinc-400 list-decimal list-inside">
            {COMO_PEGAR_LINK.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        </details>
      </div>

      {/* ================= MODELO DA MENSAGEM ================= */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">Mensagem do pedido de avaliação</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Enviada pelo WhatsApp depois que a OS é marcada como Entregue. Toque numa variável para inserir no texto.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Restaurar a mensagem padrão do pedido de avaliação?')) alterar({ mensagemAvaliacao: MENSAGEM_AVALIACAO_PADRAO });
            }}
            className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold transition"
          >
            Restaurar mensagem padrão
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {VARIAVEIS.map((v) => (
            <button
              key={v.chave}
              type="button"
              onClick={() => inserirVariavel(v.chave)}
              title={v.descricao}
              className="px-2.5 py-1 rounded-lg bg-zinc-800/80 hover:bg-blue-600/20 hover:text-blue-300 border border-zinc-700/60 text-[11px] font-mono text-zinc-200 transition"
            >
              + {v.chave}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <textarea
              ref={campoMensagem}
              rows={6}
              value={mensagem}
              onChange={(e) => alterar({ mensagemAvaliacao: e.target.value.slice(0, 1000) })}
              aria-label="Mensagem do pedido de avaliação"
              className="w-full p-3 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-zinc-200 leading-relaxed outline-none focus:border-blue-500 resize-y"
            />
            {semVariavelLink && (
              <p className="text-[11px] text-amber-400 font-semibold">
                A mensagem não tem {'{link_avaliacao}'}: o link será colocado no fim automaticamente.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-xs text-zinc-300 whitespace-pre-wrap break-words">
              <span className="block text-[10px] font-bold text-emerald-400 uppercase mb-1">Exemplo de como o cliente recebe</span>
              {previa}
            </div>
            <p className="text-[11px] text-zinc-500">
              {osExemplo
                ? `Exemplo com a OS ${osExemplo.numero_os}. Cada cliente recebe com os dados da própria OS.`
                : 'Ainda não há ordens de serviço: o exemplo mostra as variáveis sem substituir.'}
              {!linkValido && ' O link mostrado é só ilustrativo.'}
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={testar}
                title="Abre o WhatsApp no número da própria loja para você ver como a mensagem chega"
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-[11px] font-semibold transition"
              >
                Enviar teste para o WhatsApp da loja
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
