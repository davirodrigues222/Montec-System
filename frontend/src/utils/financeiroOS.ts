// ==========================================
// Valores financeiros de uma OS: a mesma fórmula no Painel e em Análises e relatórios,
// para os números das duas telas sempre baterem. Valor inválido conta como 0 (nunca NaN).
// ==========================================
import { calcularValorTaxas } from '../services/api';
import type { OrdemServico } from '../types';

const numero = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Valor cobrado do cliente (já com desconto). Mesma regra da meta (calcularFaturamentoBrutoOrdens). */
export const valorBrutoOS = (os: OrdemServico) => numero(os.orcamentoCalculado?.valorTotalOrcamento ?? os.valor_total);

/** O que entrou na conta, já sem as taxas da maquininha. */
export const valorLiquidoOS = (os: OrdemServico) =>
  os.valorLiquido !== undefined && os.valorLiquido !== null ? numero(os.valorLiquido) : valorBrutoOS(os);

export const custoPecaOS = (os: OrdemServico) => numero(os.orcamentoCalculado?.custoPeca || os.custo_peca);
export const custoFreteOS = (os: OrdemServico) => numero(os.orcamentoCalculado?.freteReal || os.frete_real);
export const custoGarantiaOS = (os: OrdemServico) =>
  numero(
    os.orcamentoCalculado?.custoPecaGarantia ||
      os.garantia?.custoPecaGarantia ||
      os.garantia?.custoTotalGarantia ||
      os.custo_peca_garantia
  );

/** Peça + frete + retornos em garantia. */
export const custosOS = (os: OrdemServico) => custoPecaOS(os) + custoFreteOS(os) + custoGarantiaOS(os);

/** Taxa retida pela maquininha: coluna valor_taxas (ou bruto − líquido nas ordens antigas). */
export const valorTaxasOS = (os: OrdemServico) => numero(os.valorTaxas ?? calcularValorTaxas(valorBrutoOS(os), valorLiquidoOS(os)));

/** Lucro real da OS: líquido recebido − custos. */
export const lucroOS = (os: OrdemServico) => valorLiquidoOS(os) - custosOS(os);

export const somar = (ordens: OrdemServico[], fn: (os: OrdemServico) => number) => ordens.reduce((acc, os) => acc + fn(os), 0);
