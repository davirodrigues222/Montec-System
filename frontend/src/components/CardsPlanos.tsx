import React, { useState } from 'react';
import { Check, CircleCheck, ExternalLink, Sparkles } from 'lucide-react';
import { JanelaCheckout } from './JanelaCheckout';
import {
  LISTA_PLANOS,
  PLANOS,
  abrirCheckout,
  formatarDataAssinatura,
  formatarPrecoPlano,
  montarLinkCheckout,
  type IdPlano,
  type Plano,
  type SituacaoAssinatura,
} from '../services/assinatura';

interface Props {
  situacao: SituacaoAssinatura;
  /** Link do plano não configurado (sem VITE_CAKTO_LINK_* nem link no código). */
  onErro?: (mensagem: string) => void;
}

const textoBotao = (plano: Plano, situacao: SituacaoAssinatura) => {
  const ativo = situacao.status === 'ativa' && situacao.acessoLiberado;
  if (ativo && situacao.plano === plano.id) return `Renovar ${plano.id === 'anual' ? 'Plano Anual' : 'Plano Mensal'}`;
  if (ativo && situacao.plano === 'mensal' && plano.id === 'anual') return 'Fazer upgrade para o Anual';
  return `Assinar ${plano.id === 'anual' ? 'Plano Anual' : 'Plano Mensal'} (${formatarPrecoPlano(plano.preco)})`;
};

const ERRO_LINK = 'O link de pagamento deste plano ainda não foi configurado. Fale com o suporte do Montec System.';

/**
 * Os 2 planos lado a lado. "Assinar" abre o checkout da Cakto (já preenchido) numa janela dentro do
 * sistema; o link abaixo do botão abre o mesmo checkout no site da Cakto, numa nova aba.
 */
export const CardsPlanos: React.FC<Props> = ({ situacao, onErro }) => {
  const [checkout, setCheckout] = useState<{ plano: IdPlano; link: string } | null>(null);
  const [confirmado, setConfirmado] = useState<string | null>(null);

  const assinar = (id: IdPlano) => {
    const link = montarLinkCheckout(id, situacao);
    if (!link) return onErro?.(ERRO_LINK);
    setConfirmado(null);
    setCheckout({ plano: id, link });
  };

  const pagarNoSiteDaCakto = (id: IdPlano) => {
    if (!abrirCheckout(id, situacao)) onErro?.(ERRO_LINK);
  };

  return (
    <>
    {checkout && (
      <JanelaCheckout
        plano={checkout.plano}
        link={checkout.link}
        onFechar={() => setCheckout(null)}
        onConfirmado={(nova) => {
          setCheckout(null);
          setConfirmado(
            `Pagamento confirmado! ${nova.plano ? PLANOS[nova.plano].nome : 'Plano'} ativo até ${formatarDataAssinatura(nova.dataExpiracao)}.`
          );
        }}
      />
    )}
    {confirmado && (
      <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-sm text-emerald-300 font-semibold">
        <CircleCheck className="w-5 h-5 shrink-0" />
        <span>{confirmado}</span>
      </div>
    )}
    {/* pt-3: espaço para o selo de destaque, que fica metade para fora do card */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-5 pt-3">
      {LISTA_PLANOS.map((plano) => {
        const destaque = !!plano.destaque;
        const planoAtual = situacao.status === 'ativa' && situacao.acessoLiberado && situacao.plano === plano.id;
        return (
          <div
            key={plano.id}
            className={`relative flex flex-col min-w-0 rounded-2xl p-4 sm:p-6 border shadow-sm ${
              destaque
                ? 'bg-gradient-to-b from-blue-600/15 to-[#0c101a] border-blue-500/60 shadow-blue-600/10'
                : 'bg-[#0c101a] border-zinc-800/80'
            }`}
          >
            {plano.destaque && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 max-w-[calc(100%-1.5rem)] inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-600 text-white text-[9px] sm:text-[10px] font-extrabold tracking-wider shadow-md shadow-blue-600/30 whitespace-nowrap">
                <Sparkles className="w-3 h-3 shrink-0" />
                <span className="truncate">{plano.destaque}</span>
              </span>
            )}

            <div className="flex items-start justify-between gap-2 mt-1">
              <h3 className="text-[15px] sm:text-sm font-extrabold text-white leading-snug">{plano.nome}</h3>
              {planoAtual && (
                <span className="shrink-0 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold uppercase">
                  Seu plano
                </span>
              )}
            </div>

            <div className="mt-2 sm:mt-3">
              <p className="flex flex-wrap items-baseline gap-x-1">
                <span className="text-[28px] sm:text-3xl font-extrabold text-white tracking-tight leading-none">
                  {formatarPrecoPlano(plano.preco)}
                </span>
                <span className="text-sm text-zinc-400 font-semibold">{plano.ciclo}</span>
              </p>
              <p className="text-xs mt-1.5">
                {plano.equivalenteMensal && (
                  <span className="text-blue-300 font-semibold">equivale a {formatarPrecoPlano(plano.equivalenteMensal)}/mês · </span>
                )}
                <span className="text-zinc-500">{plano.diasAcesso} dias de acesso por pagamento</span>
              </p>
            </div>

            <ul className="mt-3 sm:mt-4 space-y-1.5 sm:space-y-2 flex-1">
              {plano.beneficios.map((b) => (
                <li key={b} className="flex items-start gap-2 text-[13px] sm:text-xs leading-snug text-zinc-300">
                  <Check className={`w-4 h-4 shrink-0 mt-px ${destaque ? 'text-blue-400' : 'text-emerald-400'}`} />
                  <span className="min-w-0">{b}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => assinar(plano.id)}
              className={`mt-4 sm:mt-5 w-full min-h-12 px-4 py-3 rounded-xl transition ${
                destaque
                  ? 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-lg shadow-blue-600/25'
                  : 'bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-white border border-zinc-700'
              }`}
            >
              {/* Texto num <span>: a regra global "button { font: inherit }" anularia o tamanho e o peso no botão */}
              <span className="text-sm font-bold">{textoBotao(plano, situacao)}</span>
            </button>
            {/* Alternativa: o mesmo checkout no site da Cakto, numa nova aba */}
            <button
              type="button"
              onClick={() => pagarNoSiteDaCakto(plano.id)}
              className="mt-1.5 w-full min-h-10 inline-flex items-center justify-center gap-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 transition"
            >
              <span className="text-xs font-semibold">ou pagar no site da Cakto</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>
        );
      })}
    </div>
    </>
  );
};
