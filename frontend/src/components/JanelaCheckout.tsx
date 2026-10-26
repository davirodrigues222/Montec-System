import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Lock, X } from 'lucide-react';
import { useAssinatura } from '../contexts/AssinaturaContext';
import { PLANOS, type IdPlano, type SituacaoAssinatura } from '../services/assinatura';

interface Props {
  plano: IdPlano;
  /** Link do checkout da Cakto já preenchido com os dados da conta. */
  link: string;
  onFechar: () => void;
  /** Pagamento reconhecido pelo webhook (a janela fecha sozinha). */
  onConfirmado: (situacao: SituacaoAssinatura) => void;
}

// De quanto em quanto tempo o sistema pergunta ao banco se o pagamento já foi confirmado
const INTERVALO_VERIFICACAO_MS = 5000;

/** O pagamento entrou? Assinatura ativa e com validade nova (ou plano novo) desde que a janela abriu. */
const pagamentoConfirmado = (antes: SituacaoAssinatura, agora: SituacaoAssinatura) =>
  agora.status === 'ativa' &&
  agora.acessoLiberado &&
  !!agora.plano &&
  (agora.dataExpiracao !== antes.dataExpiracao || agora.plano !== antes.plano);

/**
 * Checkout da Cakto dentro do Montec System (o cliente não sai do sistema). Enquanto a janela está
 * aberta, a situação da assinatura é consultada a cada poucos segundos e, quando o webhook libera o
 * acesso, a janela fecha sozinha. "Abrir em nova aba" fica de reserva para quando o pagamento não
 * funcionar embutido (ex.: confirmação extra do banco no cartão).
 */
export const JanelaCheckout: React.FC<Props> = ({ plano, link, onFechar, onConfirmado }) => {
  const { situacao, atualizar } = useAssinatura();
  const situacaoInicial = useRef(situacao);
  const [carregado, setCarregado] = useState(false);
  const fecharRef = useRef(onFechar);
  const confirmadoRef = useRef(onConfirmado);
  useEffect(() => {
    fecharRef.current = onFechar;
    confirmadoRef.current = onConfirmado;
  });

  // Verificação automática do pagamento
  useEffect(() => {
    let ativo = true;
    const id = window.setInterval(async () => {
      const agora = await atualizar();
      if (ativo && pagamentoConfirmado(situacaoInicial.current, agora)) {
        window.clearInterval(id);
        confirmadoRef.current(agora);
      }
    }, INTERVALO_VERIFICACAO_MS);
    return () => {
      ativo = false;
      window.clearInterval(id);
    };
  }, [atualizar]);

  // Esc fecha; a página por trás não rola enquanto a janela está aberta
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && fecharRef.current();
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener('keydown', aoTeclar);
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-stretch sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Pagamento do ${PLANOS[plano].nome}`}
        className="flex flex-col w-full h-[100dvh] sm:h-[90vh] sm:max-w-3xl bg-[#0c101a] sm:border border-zinc-800/80 sm:rounded-2xl overflow-hidden shadow-2xl"
      >
        {/* Cabeçalho: plano, reserva em nova aba e fechar */}
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-zinc-800/80 pt-[max(0.625rem,env(safe-area-inset-top))]">
          <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white truncate">{PLANOS[plano].nome}</p>
            <p className="text-[11px] text-zinc-500 truncate">Pagamento seguro pela Cakto</p>
          </div>
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1.5 min-h-10 px-3 rounded-lg text-xs font-bold text-blue-300 hover:bg-blue-500/10 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden min-[380px]:inline">Abrir em nova aba</span>
          </a>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar pagamento"
            className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Checkout da Cakto */}
        <div className="relative flex-1 bg-white">
          {!carregado && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0c101a]">
              <div className="w-9 h-9 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-xs text-zinc-400 font-medium">Carregando pagamento...</p>
            </div>
          )}
          <iframe
            src={link}
            title="Checkout Cakto"
            onLoad={() => setCarregado(true)}
            allow="payment *; clipboard-write"
            className="absolute inset-0 w-full h-full border-0"
          />
        </div>

        {/* Rodapé: o sistema confere o pagamento sozinho */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-zinc-800/80 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <span className="relative flex w-2 h-2 shrink-0">
            <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-400" />
          </span>
          <p className="text-[11px] sm:text-xs text-zinc-400 leading-snug">
            Assim que o pagamento for confirmado, seu acesso é liberado e esta janela fecha sozinha.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
};
