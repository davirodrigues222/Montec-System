export type StatusOS =
  | 'RASCUNHO'
  | 'AGUARDANDO_AVALIACAO'
  | 'EM_ANALISE'
  | 'AGUARDANDO_PECA'
  | 'EM_MANUTENCAO'
  | 'PRONTO'
  | 'ENTREGUE'
  | 'CANCELADO';

export interface ServicoCadastrado {
  id_servico: string;
  nome: string;
  preco_sugerido: number;
}

export interface FornecedorCadastrado {
  id_fornecedor: string;
  nome: string;
  contato?: string;
}

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

export interface OrcamentoCalculado {
  subtotalServicos: number;
  descontoGeralAplicado: number;
  valorTotalOrcamento: number;
  lucroTotalEstimadoInterno: number;
  custoPeca?: number;
  freteReal?: number;
  fornecedorPeca?: string;
  tipoDesconto?: 'VALOR' | 'PERCENTUAL';
}

export interface HistoricoItem {
  id: string;
  data: string;
  descricao: string;
  autor?: string;
}

export interface RegistroGarantia {
  houveGarantia?: boolean;
  custoPecaGarantia?: number;
  prejuizoTotalGarantia?: number;
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
  checklistEntrada?: Record<string, string>;
  data_abertura?: string;
  data_prevista_entrega?: string;
  data_conclusao?: string;
  cliente: Cliente;
  aparelho: Aparelho;
  orcamentoCalculado: OrcamentoCalculado;
  garantia?: RegistroGarantia;
  historico?: HistoricoItem[];
}

// Adicione ao final de frontend/src/types/index.ts:

export interface UsuarioAutenticado {
  id: string;
  email: string;
  nomeResponsavel?: string;
  nomeAssistencia?: string;
  whatsapp?: string;
  cpfCnpj?: string;
}