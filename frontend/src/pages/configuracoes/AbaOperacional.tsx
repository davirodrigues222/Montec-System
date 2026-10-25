import React from 'react';
import { TERMOS_GARANTIA_PADRAO, calcularDataPrevistaEntrega, normalizarPrefixoOS } from '../../services/api';
import { Campo, Secao, inputCls } from '../../components/cadastros/ui';
import { ITENS_CHECKLIST } from '../../utils/checklist';
import { GARANTIA_LEGAL_DIAS } from '../../utils/conformidade';
import { type PropsAba, cardCls } from './tipos';

const numeroInteiro = (valor: string, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(Number(valor) || 0)));

export const AbaOperacional: React.FC<PropsAba> = ({ config, alterar }) => {
  const ativos = config.checklistItensAtivos;
  const alternarItem = (chave: string) =>
    alterar({ checklistItensAtivos: ativos.includes(chave) ? ativos.filter((c) => c !== chave) : [...ativos, chave] });

  const previsaoExemplo =
    config.prazoEntregaDiasUteis > 0
      ? new Date(`${calcularDataPrevistaEntrega(config.prazoEntregaDiasUteis)}T12:00:00`).toLocaleDateString('pt-BR')
      : null;

  return (
    <div className="space-y-6">
      <div className={cardCls}>
        <div>
          <h3 className="text-sm font-bold text-white">Prazos e regras da OS</h3>
          <p className="text-xs text-zinc-400 mt-0.5">Usados automaticamente na abertura de novas ordens e na validação de retornos.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Campo label="Prazo padrão de garantia (dias)" dica="Mínimo de 90 dias: garantia legal (CDC, art. 26, II).">
            <input
              type="number"
              min={GARANTIA_LEGAL_DIAS}
              value={config.prazoGarantiaDias}
              onChange={(e) => alterar({ prazoGarantiaDias: numeroInteiro(e.target.value, 1, 3650) })}
              onBlur={() => alterar({ prazoGarantiaDias: Math.max(GARANTIA_LEGAL_DIAS, config.prazoGarantiaDias) })}
              className={inputCls()}
            />
          </Campo>
          <Campo label="Limite para retirada (dias)" dica="Impresso no rodapé dos documentos.">
            <input
              type="number"
              min={1}
              value={config.prazoAbandonoDias}
              onChange={(e) => alterar({ prazoAbandonoDias: numeroInteiro(e.target.value, 1, 3650) })}
              className={inputCls()}
            />
          </Campo>
          <Campo
            label="Previsão de entrega (dias úteis)"
            dica={previsaoExemplo ? `Uma OS aberta hoje sugere ${previsaoExemplo}.` : '0 = não sugere data prevista.'}
          >
            <input
              type="number"
              min={0}
              value={config.prazoEntregaDiasUteis}
              onChange={(e) => alterar({ prazoEntregaDiasUteis: numeroInteiro(e.target.value, 0, 120) })}
              className={inputCls()}
            />
          </Campo>
          <Campo label="Prefixo do número da OS" dica={`Próximas ordens: ${normalizarPrefixoOS(config.prefixoOS)}123456`}>
            <input
              value={config.prefixoOS}
              onChange={(e) => alterar({ prefixoOS: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 6) })}
              placeholder="OS-"
              className={inputCls()}
            />
          </Campo>
        </div>
      </div>

      <div className={cardCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">Termos e condições de garantia</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Impressos na certidão de garantia e no comprovante de entrada. Cada linha vira um parágrafo.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Restaurar os termos padrão baseados no Código de Defesa do Consumidor?')) {
                alterar({ termosGarantiaTexto: TERMOS_GARANTIA_PADRAO });
              }
            }}
            className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold transition"
          >
            Restaurar termos padrão do CDC
          </button>
        </div>
        <textarea
          rows={9}
          value={config.termosGarantiaTexto}
          onChange={(e) => alterar({ termosGarantiaTexto: e.target.value })}
          className="w-full p-4 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-zinc-200 leading-relaxed outline-none focus:border-blue-500"
        />
      </div>

      <div className={cardCls}>
        <div>
          <h3 className="text-sm font-bold text-white">Checklist de entrada</h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Escolha os itens conferidos na Nova OS. Ordens antigas continuam mostrando os itens que foram gravados nelas.
          </p>
        </div>
        <Secao titulo={`${ativos.length} de ${ITENS_CHECKLIST.length} itens ativos`}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {ITENS_CHECKLIST.map((item) => {
              const ativo = ativos.includes(item.chave);
              return (
                <button
                  key={item.chave}
                  type="button"
                  role="checkbox"
                  aria-checked={ativo}
                  onClick={() => alternarItem(item.chave)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold text-left transition ${
                    ativo
                      ? 'border-blue-500/50 bg-blue-600/10 text-blue-300'
                      : 'border-zinc-800/80 bg-[#080c14] text-zinc-500 hover:border-zinc-700'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 ${
                      ativo ? 'bg-blue-600 border-blue-500 text-white' : 'border-zinc-600'
                    }`}
                  >
                    {ativo && '✓'}
                  </span>
                  {item.rotulo}
                </button>
              );
            })}
          </div>
        </Secao>
        {ativos.length === 0 && (
          <p className="text-[11px] text-amber-400">Nenhum item ativo: a Nova OS vai mostrar todos os itens.</p>
        )}
      </div>
    </div>
  );
};
