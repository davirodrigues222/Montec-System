import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Lock, X } from 'lucide-react';
import { useAssinatura } from '../contexts/AssinaturaContext';
import { PLANOS, formatarPrecoPlano, type IdPlano, type SituacaoAssinatura } from '../services/assinatura';

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
 * "Aguardando pagamento": o checkout da Cakto abre numa nova aba (a Cakto não permite ser exibida
 * dentro de outro site) e o Montec System fica esperando. A situação da assinatura é consultada a
 * cada poucos segundos e, quando o webhook libera o acesso, a janela fecha sozinha.
 */
export const JanelaCheckout: React.FC<Props> = ({ plano, link, onFechar, onConfirmado }) => {
  const { situacao, atualizar } = useAssinatura();
  const situacaoInicial = useRef(situacao);
  const fecharRef = useRef(onFechar);
  const confirmadoRef = useRef(onConfirmado);
  useEffect(() => {
    fecharRef.current = onFechar;
    confirmadoRef.current = onConfirmado;
  });

  // Verificação automática do pagamento (também ao voltar para a aba do sistema)
  useEffect(() => {
    let ativo = true;
    const verificar = async () => {
      const agora = await atualizar();
      if (ativo && pagamentoConfirmado(situacaoInicial.current, agora)) {
        ativo = false;
        confirmadoRef.current(agora);
      }
    };
    const id = window.setInterval(verificar, INTERVALO_VERIFICACAO_MS);
    const aoVoltar = () => document.visibilityState === 'visible' && verificar();
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      ativo = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', aoVoltar);
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

  const dados = PLANOS[plano];

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Pagamento do ${dados.nome}`}
        className="relative w-full sm:max-w-md bg-[#0c101a] border border-zinc-800/80 rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4"
      >
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="absolute top-3 right-3 inline-flex items-center justify-center w-10 h-10 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 pr-10">
          <div className="relative w-11 h-11 shrink-0 flex items-center justify-center rounded-xl bg-blue-600/15 border border-blue-500/30">
            <div className="absolute inset-0 rounded-xl border-2 border-blue-500/0 border-t-blue-400 animate-spin" />
            <Lock className="w-4 h-4 text-blue-300" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-extrabold text-white leading-tight">Aguardando pagamento</p>
            <p className="text-xs text-zinc-400 mt-0.5 truncate">
              {dados.nome} · {formatarPrecoPlano(dados.preco)}
              {dados.ciclo}
            </p>
          </div>
        </div>

        <ol className="space-y-2 text-sm text-zinc-300 leading-snug">
          <li className="flex gap-2.5">
            <span className="shrink-0 w-5 h-5 rounded-full bg-zinc-800 text-[11px] font-bold flex items-center justify-center">1</span>
            <span>Conclua o pagamento na página da Cakto que abriu (PIX ou cartão).</span>
          </li>
          <li className="flex gap-2.5">
            <span className="shrink-0 w-5 h-5 rounded-full bg-zinc-800 text-[11px] font-bold flex items-center justify-center">2</span>
            <span>Volte para esta tela: o acesso é liberado sozinho assim que o pagamento for confirmado.</span>
          </li>
        </ol>

        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
          <span className="relative flex w-2 h-2 shrink-0">
            <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-400" />
          </span>
          <p className="text-xs text-emerald-300/90">Verificando o pagamento automaticamente...</p>
        </div>

        {/* A página da Cakto não abriu (bloqueador de pop-up) ou foi fechada: abre de novo */}
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full min-h-12 inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-bold transition shadow-lg shadow-blue-600/25"
        >
          <ExternalLink className="w-4 h-4 shrink-0" />
          Abrir a página de pagamento
        </a>
      </div>
    </div>,
    document.body
  );
};
