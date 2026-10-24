export type StatusOS =
  | 'RASCUNHO'
  | 'AGUARDANDO_AVALIACAO'
  | 'EM_ANALISE'
  | 'AGUARDANDO_PECA'
  | 'EM_MANUTENCAO'
  | 'PRONTO'
  | 'ENTREGUE'
  | 'CANCELADO';

export interface Cliente {
  idCliente?: string;
  nome: string;
  cpfCnpj?: string;
  whatsapp?: string;
  email?: string;
}

export interface Aparelho {
  modelo: string;
  imei1?: string;
  senhaDesbloqueio?: string;
}

/** Forma de pagamento registrada na OS (pagamento único ou dividido em duas formas). */
export interface PagamentoOS {
  id: string;
  forma: string;
  valor: number;
  parcelas: number;
  taxaPercentual: number;
  valorTaxa: number;
  valorLiquido: number;
}

export interface OrcamentoCalculado {
  subtotalServicos: number;
  descontoGeralAplicado: number;
  valorTotalOrcamento: number;
  lucroTotalEstimadoInterno: number;
  custoPeca?: number;
  freteReal?: number;
  fornecedorPeca?: string;
  tipoDesconto?: 'VALOR' | 'PERCENTUAL';
  descontoInput?: number; // valor digitado (R$ ou %), conforme tipoDesconto
  custoPecaGarantia?: number;
  pagamentos?: PagamentoOS[];
  prazoGarantiaDias?: number;
}

export interface HistoricoItem {
  id: string;
  data: string;
  descricao: string;
  autor?: string;
}

/** Um retorno em garantia registrado na tela Garantias e retornos. */
export interface RetornoGarantia {
  dataRetorno?: string;
  defeitoConstatadoGarantia?: string;
  pecaSubstituidaGarantia?: string;
  custoPecaGarantia?: number;
  freteGarantia?: number;
  prejuizoTotalGarantia?: number;
  [key: string]: any;
}

/** Resumo dos retornos em garantia de uma OS, montado em buscarOrdensServico. */
export interface RegistroGarantia {
  listaRetornos?: RetornoGarantia[];
  custoTotalGarantia?: number;
  custoPecaGarantia?: number;
  totalVoltas?: number;
  prazoGarantiaDias?: number;
  [key: string]: any;
}

export interface OrdemServico {
  id_os: string;
  numero_os: string;
  status_os: StatusOS;
  defeitoRelatado: string;
  diagnostico?: string;
  servicoRealizado?: string;
  pecasUtilizadas?: string;
  observacoes?: string;
  possuiGarantia: boolean; // Flag estrita para controlar elegibilidade de garantia
  prazoGarantiaDias?: number;
  /** Itens do checklist ("OK", "DEFEITO"...) e metadados internos com prefixo "__". */
  checklistEntrada?: Record<string, any>;
  data_abertura?: string;
  dataAbertura?: string;
  data_prevista_entrega?: string;
  data_conclusao?: string;
  cliente: Cliente;
  aparelho: Aparelho;
  orcamentoCalculado: OrcamentoCalculado;
  formaPagamento?: string;
  parcelas?: number;
  valorLiquido?: number;
  pagamentos?: PagamentoOS[];
  garantia?: RegistroGarantia | null;
  historico?: HistoricoItem[];

  // Colunas originais da tabela ordens_servico (repassadas por buscarOrdensServico)
  valor_total?: number;
  valor_liquido?: number;
  custo_peca?: number;
  frete_real?: number;
  custo_peca_garantia?: number;
  forma_pagamento?: string;
}

// Submódulos do menu "Cadastros" (navegação em árvore na barra lateral)
export type SecaoCadastro =
  | 'clientes'
  | 'servicos'
  | 'fornecedores'
  | 'lojas'
  | 'funcionarios'
  | 'formas-pagamento';

// Submódulos do menu "Configurações" (navegação em árvore na barra lateral)
export type SecaoConfiguracao = 'loja' | 'financeiro' | 'operacional' | 'whatsapp' | 'equipe' | 'conta';
