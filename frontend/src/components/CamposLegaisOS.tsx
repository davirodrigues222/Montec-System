import React from 'react';
import {
  type DadosLegaisOS,
  type TipoPeca,
  FORMAS_APROVACAO,
  TIPOS_PECA,
  VALIDADE_ORCAMENTO_DIAS,
  faltaAutorizacaoPeca,
} from '../utils/conformidade';

interface Props {
  valor: DadosLegaisOS;
  onChange: (valor: DadosLegaisOS) => void;
}

const labelCls = 'block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5';
const campoCls =
  'w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition';

/**
 * Exigências do CDC na OS: peça empregada e autorização do cliente (arts. 21 e 70)
 * e aprovação expressa do orçamento antes do serviço (art. 39, VI).
 */
export const CamposLegaisOS: React.FC<Props> = ({ valor, onChange }) => {
  const alterar = (parcial: Partial<DadosLegaisOS>) => onChange({ ...valor, ...parcial });
  const exigeAutorizacao = !!valor.tipoPeca && TIPOS_PECA[valor.tipoPeca].exigeAutorizacao;

  return (
    <div className="space-y-3.5 rounded-xl border border-zinc-800/80 bg-[#080c14]/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-bold text-white tracking-wide uppercase">Orçamento e peças</span>
        <span className="text-[11px] text-zinc-500">Exigências do Código de Defesa do Consumidor</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div>
          <label className={labelCls}>Tipo de peça</label>
          <select
            value={valor.tipoPeca || ''}
            onChange={(e) =>
              alterar({ tipoPeca: (e.target.value || undefined) as TipoPeca | undefined, autorizacaoPeca: false })
            }
            className={`${campoCls} cursor-pointer`}
          >
            <option value="">Sem troca de peça</option>
            {(Object.keys(TIPOS_PECA) as TipoPeca[]).map((t) => (
              <option key={t} value={t}>
                {TIPOS_PECA[t].rotulo}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Aprovação do orçamento</label>
          <select
            value={valor.orcamentoAprovadoEm ? valor.orcamentoAprovacaoForma || FORMAS_APROVACAO[0] : ''}
            onChange={(e) =>
              alterar(
                e.target.value
                  ? {
                      orcamentoAprovadoEm: valor.orcamentoAprovadoEm || new Date().toISOString(),
                      orcamentoAprovacaoForma: e.target.value,
                    }
                  : { orcamentoAprovadoEm: undefined, orcamentoAprovacaoForma: undefined }
              )
            }
            className={`${campoCls} cursor-pointer`}
          >
            <option value="">Aguardando aprovação</option>
            {FORMAS_APROVACAO.map((f) => (
              <option key={f} value={f}>
                Aprovado: {f}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-zinc-500">
            Serviço só com aprovação do cliente. Orçamento vale {VALIDADE_ORCAMENTO_DIAS} dias.
          </p>
        </div>
      </div>

      {exigeAutorizacao && (
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={!!valor.autorizacaoPeca}
            onChange={(e) => alterar({ autorizacaoPeca: e.target.checked })}
            className="mt-0.5 rounded bg-[#0d131f] border-zinc-700 text-blue-600 focus:ring-blue-500"
          />
          <span className={`text-xs ${faltaAutorizacaoPeca(valor) ? 'text-amber-300' : 'text-zinc-300'}`}>
            O cliente autorizou o uso de peça {valor.tipoPeca === 'USADA' ? 'usada ou recondicionada' : 'não original'} neste
            reparo (CDC, arts. 21 e 70).
          </span>
        </label>
      )}
    </div>
  );
};
