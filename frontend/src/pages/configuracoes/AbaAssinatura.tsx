import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { CardsPlanos } from '../../components/CardsPlanos';
import { useAssinatura } from '../../contexts/AssinaturaContext';
import {
  PLANOS,
  diasRestantes,
  ehCortesia,
  formatarDataAssinatura,
  formatarPrecoPlano,
  type SituacaoAssinatura,
} from '../../services/assinatura';
import { cardCls } from './tipos';

const BADGES: Record<SituacaoAssinatura['status'], { rotulo: string; cls: string }> = {
  ativa: { rotulo: 'Ativa', cls: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' },
  trial: { rotulo: 'Período de avaliação', cls: 'bg-blue-500/15 border-blue-500/30 text-blue-300' },
  vencida: { rotulo: 'Vencida', cls: 'bg-rose-500/15 border-rose-500/30 text-rose-300' },
  cancelada: { rotulo: 'Cancelada', cls: 'bg-amber-500/15 border-amber-500/30 text-amber-300' },
};

/** Texto da validade: "Renova em", "Teste até", "Acesso até" ou "Venceu em". */
const rotuloValidade = (s: SituacaoAssinatura) => {
  if (!s.acessoLiberado) return 'Venceu em';
  if (s.status === 'trial') return 'Teste até';
  if (s.status === 'cancelada') return 'Acesso até';
  return 'Próxima renovação';
};

/** Cartão com a situação atual da assinatura e o botão de reconsultar o pagamento. */
export const StatusAssinaturaCard: React.FC<{ situacao: SituacaoAssinatura; onAtualizar: () => Promise<unknown> }> = ({
  situacao,
  onAtualizar,
}) => {
  const [atualizando, setAtualizando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const badge = BADGES[situacao.status];
  const dias = diasRestantes(situacao.dataExpiracao);
  const plano = situacao.plano ? PLANOS[situacao.plano] : null;
  const cortesia = ehCortesia(situacao);

  const atualizar = async () => {
    setAtualizando(true);
    setAviso(null);
    try {
      await onAtualizar();
      setAviso(`Status consultado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`);
    } finally {
      setAtualizando(false);
    }
  };

  const itens = [
    {
      rotulo: 'Plano atual',
      valor: plano
        ? `${plano.id === 'anual' ? 'Anual' : 'Mensal'} (${formatarPrecoPlano(plano.preco)})`
        : cortesia
        ? 'Cortesia (sem cobrança)'
        : 'Nenhum plano',
      cls: 'text-white',
    },
    {
      rotulo: cortesia ? 'Validade' : rotuloValidade(situacao),
      valor: cortesia ? 'Sem vencimento' : formatarDataAssinatura(situacao.dataExpiracao),
      cls: 'text-white',
    },
    {
      rotulo: 'Dias restantes',
      valor: cortesia ? 'Ilimitado' : situacao.acessoLiberado ? `${dias} ${dias === 1 ? 'dia' : 'dias'}` : 'Acesso expirado',
      cls: !cortesia && dias <= 5 ? 'text-amber-300' : 'text-white',
    },
  ];

  return (
    <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-4 sm:p-6 space-y-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Assinatura da conta</p>
        <span className={`shrink-0 px-2.5 py-1 rounded-lg border text-[11px] sm:text-xs font-bold ${badge.cls}`}>{badge.rotulo}</span>
      </div>

      {/* Celular: lista compacta (rótulo à esquerda, valor à direita); a partir de sm: 3 colunas */}
      <dl className="rounded-xl bg-[#080c14] border border-zinc-800/80 divide-y divide-zinc-800/80 sm:grid sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
        {itens.map((item) => (
          <div key={item.rotulo} className="flex items-center justify-between gap-3 px-3.5 py-3 sm:block sm:py-3.5">
            <dt className="text-xs text-zinc-500 font-semibold">{item.rotulo}</dt>
            <dd className={`text-sm font-bold text-right sm:text-left sm:mt-1 ${item.cls}`}>{item.valor}</dd>
          </div>
        ))}
      </dl>

      <button
        type="button"
        onClick={atualizar}
        disabled={atualizando}
        className="w-full sm:w-auto min-h-12 inline-flex items-center justify-center gap-2 px-5 bg-blue-600/10 hover:bg-blue-600/20 active:bg-blue-600/25 disabled:opacity-60 border border-blue-500/40 text-blue-200 rounded-xl transition"
      >
        <RefreshCw className={`w-4 h-4 shrink-0 ${atualizando ? 'animate-spin' : ''}`} />
        {/* Texto num <span>: a regra global "button { font: inherit }" anularia o tamanho e o peso no botão */}
        <span className="text-sm font-bold">{atualizando ? 'Consultando...' : 'Verificar status do pagamento'}</span>
      </button>

      <p className="text-xs leading-relaxed text-zinc-400 break-words">
        Pagou no PIX ou no cartão? A liberação é automática em poucos instantes — toque no botão acima para atualizar.
        {situacao.emailConta && (
          <>
            {' '}Pague sempre com o e-mail da conta{' '}
            <span className="font-semibold text-zinc-200 break-all">{situacao.emailConta}</span>: é por ele que o pagamento é
            reconhecido.
          </>
        )}
        {aviso && <span className="block mt-1 text-zinc-500">{aviso}</span>}
      </p>
    </div>
  );
};

export const AbaAssinatura: React.FC = () => {
  const { situacao, carregando, atualizar } = useAssinatura();
  const [erro, setErro] = useState<string | null>(null);

  if (carregando) {
    return <div className={`${cardCls} text-xs text-zinc-400`}>Carregando assinatura...</div>;
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {situacao.disponivel ? (
        <StatusAssinaturaCard situacao={situacao} onAtualizar={atualizar} />
      ) : (
        <div className={`${cardCls} text-xs text-zinc-400`}>
          A assinatura ainda não está disponível para esta conta. O sistema continua liberado normalmente.
        </div>
      )}

      {erro && (
        <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-300 font-semibold">{erro}</div>
      )}

      <CardsPlanos situacao={situacao} onErro={setErro} />
    </div>
  );
};
