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

  return (
    <div className={cardCls}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Assinatura da conta</p>
          <span className={`inline-block mt-2 px-2.5 py-1 rounded-lg border text-xs font-bold ${badge.cls}`}>{badge.rotulo}</span>
        </div>
        <button
          type="button"
          onClick={atualizar}
          disabled={atualizando}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-60 border border-zinc-700 text-zinc-200 rounded-xl text-xs font-bold transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${atualizando ? 'animate-spin' : ''}`} />
          {atualizando ? 'Consultando...' : 'Verificar / Atualizar status do pagamento'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-[#080c14] border border-zinc-800/80">
          <p className="text-[11px] text-zinc-500 font-semibold">Plano atual</p>
          <p className="text-sm font-bold text-white mt-1">
            {plano
              ? `${plano.id === 'anual' ? 'Anual' : 'Mensal'} (${formatarPrecoPlano(plano.preco)})`
              : cortesia
              ? 'Cortesia (sem cobrança)'
              : 'Nenhum plano assinado'}
          </p>
        </div>
        <div className="p-3.5 rounded-xl bg-[#080c14] border border-zinc-800/80">
          <p className="text-[11px] text-zinc-500 font-semibold">{cortesia ? 'Validade' : rotuloValidade(situacao)}</p>
          <p className="text-sm font-bold text-white mt-1">
            {cortesia ? 'Sem vencimento' : formatarDataAssinatura(situacao.dataExpiracao)}
          </p>
        </div>
        <div className="p-3.5 rounded-xl bg-[#080c14] border border-zinc-800/80">
          <p className="text-[11px] text-zinc-500 font-semibold">Dias restantes</p>
          <p className={`text-sm font-bold mt-1 ${!cortesia && dias <= 5 ? 'text-amber-300' : 'text-white'}`}>
            {cortesia ? 'Ilimitado' : situacao.acessoLiberado ? `${dias} ${dias === 1 ? 'dia' : 'dias'}` : 'Acesso expirado'}
          </p>
        </div>
      </div>

      <p className="text-[11px] text-zinc-500">
        Pagou no PIX ou no cartão? A liberação é automática em poucos instantes — use o botão acima para atualizar.
        Pague sempre com o e-mail da conta{situacao.emailConta ? ` (${situacao.emailConta})` : ''}: é por ele que o pagamento é reconhecido.
        {aviso && <span className="text-zinc-400"> {aviso}</span>}
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
    <div className="space-y-6">
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

      <div className="pt-2">
        <CardsPlanos situacao={situacao} onErro={setErro} />
      </div>
    </div>
  );
};
