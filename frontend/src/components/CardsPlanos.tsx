import React from 'react';
import { Check, Sparkles } from 'lucide-react';
import {
  LISTA_PLANOS,
  abrirCheckout,
  formatarPrecoPlano,
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

/** Os 2 planos lado a lado, com o botão que abre o checkout da Cakto já preenchido. */
export const CardsPlanos: React.FC<Props> = ({ situacao, onErro }) => {
  const assinar = (id: IdPlano) => {
    if (!abrirCheckout(id, situacao)) {
      onErro?.('O link de pagamento deste plano ainda não foi configurado. Fale com o suporte do Montec System.');
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
      {LISTA_PLANOS.map((plano) => {
        const destaque = !!plano.destaque;
        const planoAtual = situacao.status === 'ativa' && situacao.acessoLiberado && situacao.plano === plano.id;
        return (
          <div
            key={plano.id}
            className={`relative flex flex-col rounded-2xl p-5 sm:p-6 border shadow-sm ${
              destaque
                ? 'bg-gradient-to-b from-blue-600/15 to-[#0c101a] border-blue-500/60 shadow-blue-600/10'
                : 'bg-[#0c101a] border-zinc-800/80'
            }`}
          >
            {plano.destaque && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-600 text-white text-[10px] font-extrabold tracking-wider shadow-md shadow-blue-600/30">
                <Sparkles className="w-3 h-3" />
                {plano.destaque}
              </span>
            )}

            <div className="flex items-start justify-between gap-2 mt-1">
              <h3 className="text-sm font-extrabold text-white">{plano.nome}</h3>
              {planoAtual && (
                <span className="shrink-0 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold uppercase">
                  Seu plano
                </span>
              )}
            </div>

            <div className="mt-3">
              <span className="text-3xl font-extrabold text-white tracking-tight">{formatarPrecoPlano(plano.preco)}</span>
              <span className="text-sm text-zinc-400 font-semibold"> {plano.ciclo}</span>
              {plano.equivalenteMensal && (
                <p className="text-xs text-blue-300 font-semibold mt-1">
                  equivale a {formatarPrecoPlano(plano.equivalenteMensal)}/mês
                </p>
              )}
              <p className="text-[11px] text-zinc-500 mt-1">{plano.diasAcesso} dias de acesso a cada pagamento</p>
            </div>

            <ul className="mt-4 space-y-2 flex-1">
              {plano.beneficios.map((b) => (
                <li key={b} className="flex items-start gap-2 text-xs text-zinc-300">
                  <Check className={`w-4 h-4 shrink-0 ${destaque ? 'text-blue-400' : 'text-emerald-400'}`} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => assinar(plano.id)}
              className={`mt-5 w-full px-4 py-3 rounded-xl text-xs font-bold transition ${
                destaque
                  ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700'
              }`}
            >
              {textoBotao(plano, situacao)}
            </button>
          </div>
        );
      })}
    </div>
  );
};
