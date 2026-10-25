import React, { useState } from 'react';
import {
  OPERADORAS_MAQUININHA,
  PARCELAS_LIMITE,
  TAXAS_MAQUININHA_PADRAO,
  criarMaquininha,
  normalizarTaxasMaquininha,
  redimensionarTaxasCredito,
  type Maquininha,
} from '../../services/api';
import { Campo, inputCls } from '../../components/cadastros/ui';
import { type PropsAba, cardCls } from './tipos';

/** Converte o texto digitado em taxa (%) entre 0 e 100; vazio = 0; inválido = mantém a anterior. */
const lerTaxa = (valor: string, anterior: number) => {
  if (valor === '') return 0;
  const n = Number(valor.replace(',', '.'));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : anterior;
};

const inputTaxaCls =
  'w-full px-2.5 py-1.5 bg-[#0c101a] border border-zinc-800 rounded-lg text-xs text-white font-bold text-right outline-none focus:border-blue-500';

interface Props extends PropsAba {
  metaInput: string;
  setMetaInput: (v: string) => void;
  erroMeta: string | null;
}

export const AbaFinanceiro: React.FC<Props> = ({ config, alterar, metaInput, setMetaInput, erroMeta }) => {
  // Normaliza as taxas de cada maquininha: uma configuração no formato antigo (por faixa) não quebra a tela
  const maquininhas = (config.maquininhas || []).map((m) => ({ ...m, taxas: normalizarTaxasMaquininha(m.taxas) }));
  const { maquininhaPadraoId } = config;

  // Maquininha em edição: começa pela padrão; se for removida, volta para a padrão
  const [selecionadaId, setSelecionadaId] = useState(maquininhaPadraoId);
  const selecionada = maquininhas.find((m) => m.id === selecionadaId) || maquininhas.find((m) => m.id === maquininhaPadraoId) || maquininhas[0];

  const alterarMaquininha = (parcial: Partial<Maquininha>) =>
    alterar({ maquininhas: maquininhas.map((m) => (m.id === selecionada.id ? { ...m, ...parcial } : m)) });

  const { debito, credito } = selecionada.taxas;
  const parcelasMaximas = credito.length;

  const alterarDebito = (valor: string) =>
    alterarMaquininha({ taxas: { ...selecionada.taxas, debito: lerTaxa(valor, debito) } });

  const alterarParcela = (indice: number, valor: string) =>
    alterarMaquininha({
      taxas: { ...selecionada.taxas, credito: credito.map((t, i) => (i === indice ? lerTaxa(valor, t) : t)) },
    });

  const alterarParcelasMaximas = (valor: string) => {
    const n = Math.floor(Number(valor));
    if (!Number.isFinite(n) || n < 1 || n === parcelasMaximas) return;
    alterarMaquininha({ taxas: { ...selecionada.taxas, credito: redimensionarTaxasCredito(credito, n) } });
  };

  // Preenchimento rápido: mesma taxa num intervalo de parcelas (ex.: 13x a 18x = 12,5%)
  const [faixa, setFaixa] = useState({ de: '2', ate: '', taxa: '' });
  const aplicarFaixa = () => {
    const de = Math.max(1, Math.floor(Number(faixa.de)) || 1);
    const ate = Math.min(parcelasMaximas, Math.floor(Number(faixa.ate)) || parcelasMaximas);
    if (faixa.taxa.trim() === '' || de > ate) return;
    const taxa = lerTaxa(faixa.taxa, 0);
    alterarMaquininha({
      taxas: { ...selecionada.taxas, credito: credito.map((t, i) => (i + 1 >= de && i + 1 <= ate ? taxa : t)) },
    });
  };

  const adicionar = () => {
    const nova = criarMaquininha(`Maquininha ${maquininhas.length + 1}`);
    alterar({ maquininhas: [...maquininhas, nova] });
    setSelecionadaId(nova.id);
  };

  const remover = () => {
    if (maquininhas.length <= 1) return;
    if (!window.confirm(`Remover a maquininha "${selecionada.nome}"? Ordens já criadas não são alteradas.`)) return;
    const restantes = maquininhas.filter((m) => m.id !== selecionada.id);
    const novaPadrao = selecionada.id === maquininhaPadraoId ? restantes[0].id : maquininhaPadraoId;
    alterar({ maquininhas: restantes, maquininhaPadraoId: novaPadrao });
    setSelecionadaId(novaPadrao);
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
            <h3 className="text-sm font-bold text-white">Maquininhas de cartão</h3>
            <p className="text-xs text-zinc-400 mt-0.5 max-w-3xl">
              Cadastre cada maquininha da loja e as taxas do contrato dela. Na Nova OS você escolhe qual maquininha passou o
              cartão, e o líquido recebido e o lucro usam as taxas daquela maquininha.
            </p>
          </div>
          <button
            type="button"
            onClick={adicionar}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition shrink-0"
          >
            + Adicionar maquininha
          </button>
        </div>

        {/* 1. Escolha da maquininha */}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Maquininhas">
          {maquininhas.map((m) => {
            const ativa = m.id === selecionada.id;
            return (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={ativa}
                onClick={() => setSelecionadaId(m.id)}
                className={`px-4 py-2.5 rounded-xl border text-left transition min-w-[150px] ${
                  ativa ? 'border-blue-500 bg-blue-600/10 ring-1 ring-blue-500/30' : 'border-zinc-800/80 bg-[#080c14] hover:border-zinc-700'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${ativa ? 'text-blue-300' : 'text-zinc-200'}`}>{m.nome}</span>
                  {m.id === maquininhaPadraoId && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                      Padrão
                    </span>
                  )}
                </span>
                <span className="block text-[11px] text-zinc-500 mt-0.5">{m.operadora || 'Operadora não informada'}</span>
              </button>
            );
          })}
        </div>

        {/* 2. Dados e taxas da maquininha escolhida */}
        <div className="border border-zinc-800/80 rounded-xl p-4 space-y-4 bg-[#080c14]/50">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <Campo label="Nome da maquininha" className="md:col-span-5">
              <input
                value={selecionada.nome}
                onChange={(e) => alterarMaquininha({ nome: e.target.value })}
                placeholder="Ex: Stone do balcão"
                className={inputCls()}
              />
            </Campo>
            <Campo label="Operadora" className="md:col-span-3">
              <select
                value={selecionada.operadora}
                onChange={(e) => alterarMaquininha({ operadora: e.target.value })}
                className={inputCls()}
              >
                <option value="">Selecione...</option>
                {OPERADORAS_MAQUININHA.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="md:col-span-4 flex flex-wrap gap-2 md:justify-end">
              {selecionada.id !== maquininhaPadraoId && (
                <button
                  type="button"
                  onClick={() => alterar({ maquininhaPadraoId: selecionada.id })}
                  className="px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-semibold transition"
                >
                  Definir como padrão
                </button>
              )}
              {maquininhas.length > 1 && (
                <button
                  type="button"
                  onClick={remover}
                  className="px-3 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 rounded-xl text-xs font-semibold transition"
                >
                  Remover
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-bold text-zinc-500 tracking-wider uppercase">Taxas de {selecionada.nome} (%)</p>
            <button
              type="button"
              onClick={() =>
                alterarMaquininha({ taxas: { debito: TAXAS_MAQUININHA_PADRAO.debito, credito: [...TAXAS_MAQUININHA_PADRAO.credito] } })
              }
              className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold transition"
            >
              Restaurar taxas iniciais (12x)
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo label="Cartão de débito (%)">
              <input
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={debito}
                onChange={(e) => alterarDebito(e.target.value)}
                className={inputCls()}
              />
            </Campo>
            <Campo label="Parcelamento máximo no crédito" dica={`De 1x até ${PARCELAS_LIMITE}x. Define as parcelas oferecidas na Nova OS.`}>
              <div className="flex items-center gap-2">
                {/* Aplica ao sair do campo ou com Enter: digitar "48" não corta a tabela no "4" intermediário */}
                <input
                  key={`${selecionada.id}-${parcelasMaximas}`}
                  type="number"
                  min={1}
                  max={PARCELAS_LIMITE}
                  defaultValue={parcelasMaximas}
                  onBlur={(e) => alterarParcelasMaximas(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  className={inputCls()}
                />
                <span className="text-xs text-zinc-400 shrink-0">vezes</span>
              </div>
            </Campo>
          </div>

          {/* Preenchimento rápido por intervalo */}
          <div className="flex flex-wrap items-end gap-2 p-3 rounded-xl border border-dashed border-zinc-800 bg-[#080c14]">
            <span className="text-[11px] font-semibold text-zinc-400 w-full sm:w-auto sm:mr-1 sm:mb-2">Preencher várias de uma vez:</span>
            <label className="text-[11px] text-zinc-500">
              De
              <input
                type="number"
                min={1}
                max={parcelasMaximas}
                value={faixa.de}
                onChange={(e) => setFaixa((v) => ({ ...v, de: e.target.value }))}
                className="block w-16 mt-1 px-2 py-1.5 bg-[#0c101a] border border-zinc-800 rounded-lg text-xs text-white text-right outline-none focus:border-blue-500"
              />
            </label>
            <label className="text-[11px] text-zinc-500">
              até
              <input
                type="number"
                min={1}
                max={parcelasMaximas}
                value={faixa.ate}
                placeholder={String(parcelasMaximas)}
                onChange={(e) => setFaixa((v) => ({ ...v, ate: e.target.value }))}
                className="block w-16 mt-1 px-2 py-1.5 bg-[#0c101a] border border-zinc-800 rounded-lg text-xs text-white text-right outline-none focus:border-blue-500"
              />
            </label>
            <label className="text-[11px] text-zinc-500">
              taxa (%)
              <input
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={faixa.taxa}
                onChange={(e) => setFaixa((v) => ({ ...v, taxa: e.target.value }))}
                className="block w-20 mt-1 px-2 py-1.5 bg-[#0c101a] border border-zinc-800 rounded-lg text-xs text-white text-right outline-none focus:border-blue-500"
              />
            </label>
            <button
              type="button"
              onClick={aplicarFaixa}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold transition"
            >
              Aplicar
            </button>
          </div>

          {/* Uma taxa para cada número de parcelas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {credito.map((taxa, i) => (
              <label
                key={i}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-zinc-800/80 bg-[#080c14]"
              >
                <span className="text-[11px] font-bold text-zinc-400 w-8 shrink-0">{i + 1}x</span>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={taxa}
                  onChange={(e) => alterarParcela(i, e.target.value)}
                  aria-label={`Taxa do crédito em ${i + 1}x em ${selecionada.nome}`}
                  className={inputTaxaCls}
                />
                <span className="text-[11px] text-zinc-500">%</span>
              </label>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-zinc-500">
          Dinheiro e PIX nunca têm taxa. As taxas iniciais são só um ponto de partida: confira no app ou no contrato de cada
          maquininha. A taxa ainda pode ser ajustada em cada OS.
        </p>
      </div>
    </div>
  );
};
