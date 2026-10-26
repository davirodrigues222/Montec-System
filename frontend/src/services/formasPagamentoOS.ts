// ==========================================
// Formas de pagamento usadas nas ordens de serviço (Nova OS e edição no Histórico).
// Fonte: Cadastros › Formas de pagamento (tabela formas_pagamento, isolada por conta via RLS).
// Cartão usa as taxas da maquininha (Configurações › Taxas); PIX e dinheiro não têm taxa;
// as demais formas usam a taxa e o parcelamento do próprio cadastro.
// ==========================================
import { obterTaxaMaquininha, parcelasMaximasMaquininha } from './api';
import { type FormaPagamento, type TipoFormaPagamento, listarFormasPagamento, obterTaxaParcela } from './cadastros';

/** Disparado ao salvar, ativar/desativar ou excluir uma forma: telas abertas recarregam a lista. */
export const EVENTO_FORMAS_PAGAMENTO = 'formas_pagamento_atualizadas';
export const avisarFormasPagamentoAlteradas = () => window.dispatchEvent(new Event(EVENTO_FORMAS_PAGAMENTO));

/** Texto gravado na OS para as formas nativas (relatórios e taxas da maquininha dependem dele). */
export const VALOR_FORMA_NATIVA: Partial<Record<TipoFormaPagamento, string>> = {
  PIX: 'PIX',
  DINHEIRO: 'Dinheiro',
  CARTAO_DEBITO: 'Cartão de débito',
  CARTAO_CREDITO: 'Cartão de crédito',
};

export const TIPOS_NATIVOS = Object.keys(VALOR_FORMA_NATIVA) as TipoFormaPagamento[];

export interface OpcaoPagamentoOS {
  /** Texto gravado na OS. */
  valor: string;
  /** Nome exibido no botão / select. */
  rotulo: string;
  tipo: TipoFormaPagamento;
  /** Cadastro da forma quando ela usa taxa própria (boleto, crediário, link...). */
  cadastro?: FormaPagamento;
}

/** Usadas quando a conta não tem formas cadastradas ou o módulo não está ativo no banco. */
export const OPCOES_PAGAMENTO_NATIVAS: OpcaoPagamentoOS[] = [
  { valor: 'PIX', rotulo: 'PIX', tipo: 'PIX' },
  { valor: 'Cartão de crédito', rotulo: 'Crédito', tipo: 'CARTAO_CREDITO' },
  { valor: 'Cartão de débito', rotulo: 'Débito', tipo: 'CARTAO_DEBITO' },
  { valor: 'Dinheiro', rotulo: 'Dinheiro', tipo: 'DINHEIRO' },
];

/** Formas ativas do cadastro disponíveis para o operador, na ordem do cadastro. */
export function opcoesPagamentoDoCadastro(formas: FormaPagamento[], lojasOperador: string[] = []): OpcaoPagamentoOS[] {
  const vistos = new Set<string>();
  const opcoes: OpcaoPagamentoOS[] = [];
  for (const f of formas) {
    if (!f.ativo) continue;
    // Forma de uma loja específica só aparece para quem trabalha nela (sem lojas vinculadas, vê todas)
    if (f.id_loja && lojasOperador.length > 0 && !lojasOperador.includes(f.id_loja)) continue;
    const nativa = VALOR_FORMA_NATIVA[f.tipo];
    // A coluna forma_pagamento da OS tem 50 caracteres, com espaço para o " (12x)" do parcelamento
    const valor = nativa || f.nome.trim().slice(0, 40);
    // Duas formas de crédito (ex.: "Crédito Stone" e "Crédito Cielo") viram uma só: a maquininha diferencia
    if (!valor || vistos.has(valor)) continue;
    vistos.add(valor);
    opcoes.push({ valor, rotulo: f.nome.trim(), tipo: f.tipo, cadastro: nativa ? undefined : f });
  }
  return opcoes;
}

/** Opções da conta; sem cadastro (ou sem conexão), as 4 nativas. */
export async function carregarOpcoesPagamento(lojasOperador: string[] = []): Promise<OpcaoPagamentoOS[]> {
  try {
    const opcoes = opcoesPagamentoDoCadastro(await listarFormasPagamento(), lojasOperador);
    return opcoes.length > 0 ? opcoes : OPCOES_PAGAMENTO_NATIVAS;
  } catch {
    return OPCOES_PAGAMENTO_NATIVAS;
  }
}

/** "Boleto (3x)" → "Boleto". */
export const formaSemParcelas = (texto: string) => String(texto || '').replace(/\s*\(\d+x\)\s*$/i, '').trim();

/** Máximo de parcelas da forma: crédito pela maquininha; formas do cadastro pelo cadastro; as demais 1. */
export function parcelasMaximas(opcao: OpcaoPagamentoOS | undefined, maquininhaId?: string): number {
  if (!opcao) return 1;
  if (opcao.valor === 'Cartão de crédito') return parcelasMaximasMaquininha(maquininhaId);
  if (opcao.cadastro?.permite_parcelamento) return opcao.cadastro.parcelas_max;
  return 1;
}

/** Taxa (%) e taxa fixa (R$) da forma para N parcelas, com os parâmetros reais da loja. */
export function taxaDaForma(
  opcao: OpcaoPagamentoOS | undefined,
  parcelas = 1,
  maquininhaId?: string
): { percentual: number; fixa: number } {
  if (!opcao) return { percentual: 0, fixa: 0 };
  if (opcao.cadastro) return { percentual: obterTaxaParcela(opcao.cadastro, parcelas), fixa: opcao.cadastro.taxa_fixa || 0 };
  return { percentual: obterTaxaMaquininha(opcao.valor, parcelas, maquininhaId), fixa: 0 };
}

/** Líquido recebido de um valor, descontando a taxa percentual e a fixa (nunca negativo). */
export const liquidoComTaxa = (valor: number, taxa: { percentual: number; fixa: number }) =>
  valor > 0 ? Math.max(0, valor - (valor * taxa.percentual) / 100 - taxa.fixa) : 0;
