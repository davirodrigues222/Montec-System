import React, { useEffect, useRef, useState } from 'react';
import { Bot, Check, LoaderCircle, RotateCcw, SendHorizontal, Sparkles, X } from 'lucide-react';
import { useOperador } from '../contexts/OperadorContext';
import {
  type AcaoPendente,
  type ConteudoGemini,
  type DestinoTela,
  type ParteGemini,
  contextoDoOperador,
  perguntarAoAssistente,
  rodarFerramenta,
} from '../services/assistente';

// Máximo de idas e vindas com ferramentas por pergunta (evita laço se o modelo insistir)
const MAX_RODADAS = 8;
// Mesmo limite da Edge Function: perto dele, pede para começar outra conversa
const MAX_MENSAGENS = 60;
const MAX_CARACTERES = 1000;

const SUGESTOES = [
  'Cadastra PIX sem taxa e crédito em até 12x com 3,5%',
  'Como abro uma ordem de serviço?',
  'Quero mudar a taxa do cartão de crédito',
  'Cadastra o serviço troca de tela por R$ 250',
];

type ItemChat =
  | { tipo: 'usuario' | 'assistente' | 'erro'; texto: string }
  | { tipo: 'acao'; acao: AcaoPendente; estado: 'pendente' | 'feita' | 'cancelada' | 'falhou'; detalhe?: string };

interface Props {
  aberto: boolean;
  onFechar: () => void;
  abrirTela: (destino: DestinoTela) => void;
  /** Tela aberta agora, só para o assistente saber onde o usuário está. */
  telaAtual: string;
}

/** Texto simples com **negrito** e listas (o que o Gemini costuma usar), sem HTML vindo de fora. */
const TextoAssistente: React.FC<{ texto: string }> = ({ texto }) => (
  <>
    {texto.split('\n').map((linha, i) => {
      const item = linha.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
      const conteudo = (item ? item[1] : linha).split(/\*\*(.+?)\*\*/g).map((parte, j) =>
        j % 2 === 1 ? <strong key={j} className="font-bold text-white">{parte}</strong> : parte
      );
      if (!linha.trim()) return <div key={i} className="h-2" />;
      return item ? (
        <div key={i} className="flex gap-2 pl-1">
          <span className="text-blue-400">•</span>
          <span>{conteudo}</span>
        </div>
      ) : (
        <p key={i}>{conteudo}</p>
      );
    })}
  </>
);

export const Assistente: React.FC<Props> = ({ aberto, onFechar, abrirTela, telaAtual }) => {
  const { operador } = useOperador();
  const [itens, setItens] = useState<ItemChat[]>([]);
  const [conversa, setConversa] = useState<ConteudoGemini[]>([]);
  const [entrada, setEntrada] = useState('');
  const [pensando, setPensando] = useState(false);
  const confirmacao = useRef<((ok: boolean) => void) | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const entradaRef = useRef<HTMLTextAreaElement>(null);
  // Nova conversa durante uma resposta: a resposta antiga é descartada
  const geracao = useRef(0);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [itens, pensando]);

  useEffect(() => {
    if (aberto) setTimeout(() => entradaRef.current?.focus(), 50);
  }, [aberto]);

  // Esc fecha o painel
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto, onFechar]);

  const adicionar = (item: ItemChat) => setItens((atuais) => [...atuais, item]);

  /** Mostra o cartão de confirmação e espera o usuário decidir. */
  const pedirConfirmacao = (acao: AcaoPendente) =>
    new Promise<boolean>((resolver) => {
      adicionar({ tipo: 'acao', acao, estado: 'pendente' });
      confirmacao.current = resolver;
    });

  const finalizarAcao = (acao: AcaoPendente, estado: 'feita' | 'cancelada' | 'falhou', detalhe?: string) =>
    setItens((atuais) => atuais.map((it) => (it.tipo === 'acao' && it.acao === acao ? { ...it, estado, detalhe } : it)));

  const responder = (ok: boolean) => {
    const resolver = confirmacao.current;
    confirmacao.current = null;
    resolver?.(ok);
  };

  const enviar = async (textoEnviado: string) => {
    const texto = textoEnviado.trim().slice(0, MAX_CARACTERES);
    if (!texto || pensando) return;
    setEntrada('');
    adicionar({ tipo: 'usuario', texto });
    setPensando(true);
    const minhaGeracao = geracao.current;
    const ainda = () => geracao.current === minhaGeracao;
    const ctx = { operador, abrirTela };
    const contexto = contextoDoOperador(operador, telaAtual);

    let historico: ConteudoGemini[] = [...conversa, { role: 'user', parts: [{ text: texto }] }];
    try {
      for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
        const resposta = await perguntarAoAssistente(historico, contexto);
        if (!ainda()) return;
        historico = [...historico, resposta];
        setConversa(historico);

        const fala = resposta.parts
          .filter((p) => p.text && !p.thought)
          .map((p) => p.text)
          .join('')
          .trim();
        if (fala) adicionar({ tipo: 'assistente', texto: fala });

        const chamadas = resposta.parts.filter((p) => p.functionCall);
        if (chamadas.length === 0) return;

        const resultados: ParteGemini[] = [];
        for (const { functionCall } of chamadas) {
          const { id, name, args } = functionCall!;
          const r = await rodarFerramenta(name, args, ctx);
          let resultado: Record<string, unknown>;
          if ('confirmar' in r) {
            setPensando(false);
            const ok = await pedirConfirmacao(r.confirmar);
            if (!ainda()) return;
            setPensando(true);
            if (!ok) {
              finalizarAcao(r.confirmar, 'cancelada');
              resultado = { cancelado: true, mensagem: 'O usuário cancelou. Nada foi gravado.' };
            } else {
              try {
                resultado = await r.confirmar.executar();
                finalizarAcao(r.confirmar, 'feita');
              } catch (e: any) {
                const erro = e?.message || 'Falha ao gravar.';
                finalizarAcao(r.confirmar, 'falhou', erro);
                resultado = { erro };
              }
            }
          } else {
            resultado = r.resultado;
          }
          resultados.push({ functionResponse: { ...(id ? { id } : {}), name, response: resultado } });
        }
        historico = [...historico, { role: 'user', parts: resultados }];
        setConversa(historico);
      }
      adicionar({ tipo: 'erro', texto: 'O assistente se enrolou nessa tarefa. Tente pedir de outro jeito, em partes menores.' });
    } catch (e: any) {
      if (ainda()) adicionar({ tipo: 'erro', texto: e?.message || 'Falha ao falar com o assistente.' });
    } finally {
      if (ainda()) setPensando(false);
    }
  };

  const novaConversa = () => {
    geracao.current++;
    responder(false);
    setItens([]);
    setConversa([]);
    setPensando(false);
    setEntrada('');
    entradaRef.current?.focus();
  };

  const aguardandoConfirmacao = itens.some((it) => it.tipo === 'acao' && it.estado === 'pendente');
  const conversaCheia = conversa.length >= MAX_MENSAGENS - 4;
  const bloqueado = pensando || aguardandoConfirmacao || conversaCheia;

  return (
    <div
      role="dialog"
      aria-label="Assistente"
      className={`${aberto ? 'flex' : 'hidden'} fixed z-50 inset-0 md:inset-auto md:top-4 md:bottom-4 md:right-4 md:w-[400px] flex-col bg-[#0b0f16] md:border md:border-zinc-800 md:rounded-2xl shadow-2xl shadow-black/50 overflow-hidden print:hidden pt-[env(safe-area-inset-top)] md:pt-0`}
    >
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
          <Sparkles className="w-[18px] h-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">Assistente</p>
          <p className="text-[11px] text-zinc-500 truncate">IA pode errar: confira antes de confirmar</p>
        </div>
        {itens.length > 0 && (
          <button
            type="button"
            onClick={novaConversa}
            title="Nova conversa"
            aria-label="Nova conversa"
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar assistente"
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Mensagens */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3 text-sm">
        {itens.length === 0 && (
          <div className="space-y-4">
            <div className="flex gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-blue-400 shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-zinc-300 leading-relaxed">
                Oi{operador?.nome ? `, ${operador.nome.split(' ')[0]}` : ''}! Tiro dúvidas sobre o sistema e faço configurações para você, como
                formas de pagamento e serviços. Antes de gravar qualquer coisa, eu mostro o resumo para você confirmar.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => enviar(s)}
                  className="text-left text-xs px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              As conversas são processadas pelo Google Gemini. Não escreva dados de clientes (nome, telefone, CPF) aqui.
            </p>
          </div>
        )}

        {itens.map((item, i) => {
          if (item.tipo === 'usuario') {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] bg-blue-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 whitespace-pre-wrap break-words">
                  {item.texto}
                </div>
              </div>
            );
          }
          if (item.tipo === 'assistente') {
            return (
              <div key={i} className="max-w-[90%] bg-zinc-900 border border-zinc-800 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-zinc-300 leading-relaxed space-y-1 break-words">
                <TextoAssistente texto={item.texto} />
              </div>
            );
          }
          if (item.tipo !== 'acao') {
            return (
              <div key={i} className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-rose-300 text-xs">
                {item.texto}
              </div>
            );
          }
          const { acao, estado, detalhe } = item;
          return (
            <div key={i} className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-3.5 space-y-2.5">
              <p className="text-xs font-bold text-blue-300">{acao.titulo}</p>
              <ul className="space-y-1 text-xs text-zinc-300">
                {acao.linhas.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              {estado === 'pendente' ? (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => responder(true)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition"
                  >
                    <Check className="w-4 h-4" /> Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => responder(false)}
                    className="flex-1 px-3 py-2 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs font-bold transition"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <p
                  className={`text-xs font-semibold ${
                    estado === 'feita' ? 'text-emerald-400' : estado === 'falhou' ? 'text-rose-400' : 'text-zinc-500'
                  }`}
                >
                  {estado === 'feita' ? '✓ Gravado' : estado === 'falhou' ? `Não gravou: ${detalhe}` : 'Cancelado'}
                </p>
              )}
            </div>
          );
        })}

        {pensando && (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <LoaderCircle className="w-4 h-4 animate-spin" /> Pensando…
          </div>
        )}
        {conversaCheia && !pensando && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 text-xs text-zinc-400">
            Esta conversa ficou longa.{' '}
            <button type="button" onClick={novaConversa} className="font-bold text-blue-400 hover:underline">
              Começar uma nova
            </button>
          </div>
        )}
        <div ref={fimRef} />
      </div>

      {/* Entrada */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar(entrada);
        }}
        className="flex items-end gap-2 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3 border-t border-zinc-800 shrink-0"
      >
        <textarea
          ref={entradaRef}
          value={entrada}
          onChange={(e) => setEntrada(e.target.value.slice(0, MAX_CARACTERES))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              enviar(entrada);
            }
          }}
          rows={1}
          placeholder={aguardandoConfirmacao ? 'Confirme ou cancele a ação acima' : 'Pergunte ou peça uma tarefa…'}
          disabled={aguardandoConfirmacao || conversaCheia}
          className="flex-1 resize-none max-h-32 min-h-[42px] bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-base md:text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-blue-500 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={bloqueado || !entrada.trim()}
          aria-label="Enviar"
          className="h-[42px] w-[42px] shrink-0 inline-flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-40 disabled:hover:bg-blue-600"
        >
          <SendHorizontal className="w-[18px] h-[18px]" />
        </button>
      </form>
    </div>
  );
};
