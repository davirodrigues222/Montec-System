import React, { useState } from 'react';
import { LogOut, RefreshCw } from 'lucide-react';
import { CardsPlanos } from './CardsPlanos';
import { useAssinatura } from '../contexts/AssinaturaContext';
import { ASSINATURA_OBRIGATORIA, formatarDataAssinatura, type SituacaoAssinatura } from '../services/assinatura';

/**
 * Mostra o sistema ou, com a chave de bloqueio ligada (VITE_ASSINATURA_OBRIGATORIA=true) e a
 * assinatura vencida, a tela de renovação. Se a assinatura não pôde ser lida (migração ainda não
 * executada, banco fora do ar), o sistema segue liberado.
 */
export const PortaoAssinatura: React.FC<{ onSair: () => void; children: React.ReactNode }> = ({ onSair, children }) => {
  const { situacao, carregando, atualizar } = useAssinatura();
  if (!ASSINATURA_OBRIGATORIA) return <>{children}</>;
  if (carregando) {
    return (
      <div className="min-h-screen bg-[#080c14] flex flex-col items-center justify-center text-white space-y-4">
        <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-xs text-zinc-400 font-medium tracking-wider uppercase">Verificando assinatura...</p>
      </div>
    );
  }
  if (situacao.disponivel && !situacao.acessoLiberado) {
    return <PaywallAssinatura situacao={situacao} onVerificarPagamento={atualizar} onSair={onSair} />;
  }
  return <>{children}</>;
};

interface Props {
  situacao: SituacaoAssinatura;
  /** Consulta o banco de novo; se o pagamento já foi reconhecido, o sistema libera sozinho. */
  onVerificarPagamento: () => Promise<SituacaoAssinatura>;
  onSair: () => void;
}

/** Tela de renovação obrigatória: aparece no lugar do sistema quando a assinatura (ou o teste) venceu. */
export const PaywallAssinatura: React.FC<Props> = ({ situacao, onVerificarPagamento, onSair }) => {
  const [verificando, setVerificando] = useState(false);
  const [mensagem, setMensagem] = useState<{ erro: boolean; texto: string } | null>(null);

  const verificar = async () => {
    setVerificando(true);
    setMensagem(null);
    try {
      const nova = await onVerificarPagamento();
      if (!nova.acessoLiberado) {
        setMensagem({
          erro: true,
          texto:
            'Ainda não recebemos a confirmação do pagamento. No PIX ela costuma chegar em poucos instantes; no cartão, em alguns minutos. Tente de novo em seguida.',
        });
      }
    } finally {
      setVerificando(false);
    }
  };

  const eraTeste = situacao.status === 'trial' || (!situacao.plano && situacao.status === 'vencida');

  return (
    <div className="min-h-screen bg-[#080c14] text-white font-sans px-4 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:py-12">
      <div className="max-w-4xl mx-auto space-y-5 sm:space-y-8">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl overflow-hidden shadow-lg shadow-blue-500/25 shrink-0 border border-blue-500/30 bg-[#0d131f]">
            <img src="/logo-montec.png" alt="Montec System" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="font-extrabold text-lg tracking-tight leading-tight">Montec System</h1>
            <p className="text-xs text-blue-400 font-semibold mt-0.5">Software de Gestão</p>
          </div>
        </div>

        <div className="space-y-2">
          <span className="inline-block px-2.5 py-1 rounded-lg border bg-amber-500/15 border-amber-500/30 text-amber-300 text-[11px] font-bold uppercase tracking-wider">
            {eraTeste ? 'Período de avaliação encerrado' : 'Assinatura vencida'}
          </span>
          <h2 className="text-[22px] sm:text-3xl font-extrabold tracking-tight leading-tight">Seu período de acesso expirou</h2>
          <p className="text-sm leading-relaxed text-zinc-400 max-w-2xl">
            {situacao.dataExpiracao ? `O acesso terminou em ${formatarDataAssinatura(situacao.dataExpiracao)}. ` : ''}
            Seus dados continuam guardados com segurança. Escolha um plano para voltar a usar o sistema — a liberação é
            automática assim que o pagamento é confirmado.
          </p>
          {situacao.emailConta && (
            <p className="text-xs leading-relaxed text-zinc-400 break-words">
              Pague com o e-mail da conta: <span className="text-zinc-200 font-semibold break-all">{situacao.emailConta}</span>{' '}
              (o checkout já vem preenchido).
            </p>
          )}
        </div>

        <CardsPlanos situacao={situacao} onErro={(texto) => setMensagem({ erro: true, texto })} />

        {mensagem && (
          <div
            className={`px-4 py-3 rounded-xl border text-xs font-semibold ${
              mensagem.erro ? 'bg-amber-500/10 border-amber-500/25 text-amber-300' : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
            }`}
          >
            {mensagem.texto}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={verificar}
            disabled={verificando}
            className="min-h-12 inline-flex items-center justify-center gap-2 px-5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-60 text-white rounded-xl transition shadow-md shadow-emerald-600/20"
          >
            <RefreshCw className={`w-4 h-4 shrink-0 ${verificando ? 'animate-spin' : ''}`} />
            {/* Texto num <span>: a regra global "button { font: inherit }" anularia o tamanho e o peso no botão */}
            <span className="text-sm font-bold">{verificando ? 'Verificando pagamento...' : 'Já paguei, liberar meu acesso'}</span>
          </button>
          <button
            type="button"
            onClick={onSair}
            className="min-h-12 inline-flex items-center justify-center gap-2 px-5 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700 text-zinc-300 rounded-xl transition"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className="text-sm font-bold">Sair da conta</span>
          </button>
        </div>
      </div>
    </div>
  );
};
