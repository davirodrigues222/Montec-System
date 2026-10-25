// ==========================================
// Regras legais aplicadas às ordens de serviço
// Código de Defesa do Consumidor (Lei 8.078/1990) e LGPD (Lei 13.709/2018).
// Os dados ficam no JSON checklist_entrada da OS, em chaves com prefixo "__" (sem colunas novas).
// ==========================================

/** Garantia legal do serviço em aparelho (produto durável): 90 dias (CDC, art. 26, II). Não pode ser excluída (art. 24). */
export const GARANTIA_LEGAL_DIAS = 90;

/** Validade do orçamento quando nada for combinado: 10 dias do recebimento (CDC, art. 40, § 1º). */
export const VALIDADE_ORCAMENTO_DIAS = 10;

/** Peça empregada no reparo: original nova é a regra; as demais exigem autorização do cliente (CDC, arts. 21 e 70). */
export type TipoPeca = 'ORIGINAL' | 'COMPATIVEL' | 'USADA';

export const TIPOS_PECA: Record<TipoPeca, { rotulo: string; exigeAutorizacao: boolean }> = {
  ORIGINAL: { rotulo: 'Original nova', exigeAutorizacao: false },
  COMPATIVEL: { rotulo: 'Compatível nova (especificação do fabricante)', exigeAutorizacao: true },
  USADA: { rotulo: 'Usada ou recondicionada', exigeAutorizacao: true },
};

/** Como o cliente aprovou o orçamento (CDC, art. 39, VI: serviço só com autorização expressa). */
export const FORMAS_APROVACAO = ['Presencial (assinatura)', 'WhatsApp', 'Telefone', 'E-mail'];

/** A partir destes status o serviço está sendo executado: exige orçamento aprovado. */
export const STATUS_EXIGEM_APROVACAO = ['AGUARDANDO_PECA', 'EM_MANUTENCAO', 'PRONTO', 'ENTREGUE'];

/** Ao entregar ou cancelar, a senha do aparelho deixa de ser necessária e é apagada (LGPD, arts. 6º, III, e 16). */
export const STATUS_APAGAM_SENHA = ['ENTREGUE', 'CANCELADO'];

export interface DadosLegaisOS {
  tipoPeca?: TipoPeca;
  autorizacaoPeca?: boolean;
  /** Parte do valor cobrado que corresponde a peças (o restante é mão de obra). */
  valorPecas?: number;
  orcamentoAprovadoEm?: string;
  orcamentoAprovacaoForma?: string;
}

export function lerDadosLegaisOS(checklist: Record<string, any> | null | undefined): DadosLegaisOS {
  const c = checklist || {};
  const tipo = c.__tipoPeca as TipoPeca;
  return {
    tipoPeca: tipo in TIPOS_PECA ? tipo : undefined,
    autorizacaoPeca: c.__autorizacaoPeca === true,
    valorPecas: Number(c.__valorPecas) > 0 ? Number(c.__valorPecas) : undefined,
    orcamentoAprovadoEm: c.__orcamentoAprovadoEm || undefined,
    orcamentoAprovacaoForma: c.__orcamentoAprovacaoForma || undefined,
  };
}

/** Chaves do checklist_entrada com os dados legais da OS. */
export function dadosLegaisParaChecklist(d: DadosLegaisOS): Record<string, any> {
  return {
    __tipoPeca: d.tipoPeca || null,
    __autorizacaoPeca: !!d.autorizacaoPeca,
    __valorPecas: Number(d.valorPecas) > 0 ? Number(d.valorPecas) : 0,
    __orcamentoAprovadoEm: d.orcamentoAprovadoEm || null,
    __orcamentoAprovacaoForma: d.orcamentoAprovacaoForma || null,
  };
}

/** Peça que exige autorização do cliente e ainda não a tem. */
export const faltaAutorizacaoPeca = (d: DadosLegaisOS) =>
  !!d.tipoPeca && TIPOS_PECA[d.tipoPeca].exigeAutorizacao && !d.autorizacaoPeca;
