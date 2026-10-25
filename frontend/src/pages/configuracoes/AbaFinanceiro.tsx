import React from 'react';
import { TAXAS_MAQUININHA_PADRAO, type TaxasMaquininha } from '../../services/api';
import { Campo, inputCls } from '../../components/cadastros/ui';
import { type PropsAba, cardCls } from './tipos';

const LINHAS_TAXAS: { chave: keyof TaxasMaquininha; rotulo: string }[] = [
  { chave: 'debito', rotulo: 'Cartão de débito' },
  { chave: 'credito1x', rotulo: 'Crédito à vista (1x)' },
  { chave: 'credito2a3', rotulo: 'Crédito parcelado 2x a 3x' },
  { chave: 'credito4a6', rotulo: 'Crédito parcelado 4x a 6x' },
  { chave: 'credito7a12', rotulo: 'Crédito parcelado 7x a 12x' },
];

interface Props extends PropsAba {
  metaInput: string;
  setMetaInput: (v: string) => void;
  erroMeta: string | null;
}

export const AbaFinanceiro: React.FC<Props> = ({ config, alterar, metaInput, setMetaInput, erroMeta }) => {
  const alterarTaxa = (chave: keyof TaxasMaquininha, valor: string) => {
    const numero = Number(valor.replace(',', '.'));
    alterar({
      taxasMaquininha: {
        ...config.taxasMaquininha,
        [chave]: valor === '' ? 0 : Number.isFinite(numero) ? Math.min(100, Math.max(0, numero)) : config.taxasMaquininha[chave],
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className={cardCls}>
        <div>
          <h3 className="text-sm font-bold text-white">Meta e recebimento</h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            A meta mensal aparece no Painel e em Análises e relatórios. A chave PIX aparece na Nova OS quando o pagamento for PIX.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Campo label="Meta mensal de faturamento (R$)" erro={erroMeta} dica="Vale para o mês atual.">
            <input
              value={metaInput}
              onChange={(e) => setMetaInput(e.target.value)}
              inputMode="decimal"
              placeholder="8.000,00"
              className={inputCls(erroMeta)}
            />
          </Campo>
          <Campo label="Chave PIX da loja">
            <input
              value={config.chavePix}
              onChange={(e) => alterar({ chavePix: e.target.value })}
              placeholder="CNPJ, e-mail, telefone ou chave aleatória"
              autoComplete="off"
              className={inputCls()}
            />
          </Campo>
          <Campo label="Nome do favorecido">
            <input
              value={config.favorecidoPix}
              onChange={(e) => alterar({ favorecidoPix: e.target.value })}
              placeholder="Como aparece no app do banco"
              autoComplete="off"
              className={inputCls()}
            />
          </Campo>
        </div>
      </div>

      <div className={cardCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">Taxas da maquininha (%)</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Use as taxas do contrato da sua maquininha (InfinitePay, Ton, Mercado Pago, Stone, PagBank...). A Nova OS aplica
              estes valores automaticamente no líquido recebido e no lucro da ordem.
            </p>
          </div>
          <button
            type="button"
            onClick={() => alterar({ taxasMaquininha: { ...TAXAS_MAQUININHA_PADRAO } })}
            className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold transition"
          >
            Restaurar taxas padrão
          </button>
        </div>

        <div className="divide-y divide-zinc-800/60 border border-zinc-800/80 rounded-xl overflow-hidden">
          {LINHAS_TAXAS.map((linha) => (
            <div key={linha.chave} className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[#080c14]">
              <span className="text-xs font-semibold text-zinc-200">{linha.rotulo}</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={config.taxasMaquininha[linha.chave]}
                  onChange={(e) => alterarTaxa(linha.chave, e.target.value)}
                  aria-label={`Taxa ${linha.rotulo}`}
                  className="w-24 px-3 py-1.5 bg-[#0c101a] border border-zinc-800 rounded-lg text-xs text-white font-bold text-right outline-none focus:border-blue-500"
                />
                <span className="text-xs text-zinc-500">%</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-zinc-500">Dinheiro e PIX nunca têm taxa. A taxa ainda pode ser ajustada em cada OS.</p>
      </div>
    </div>
  );
};
