import type { SecaoConfiguracao } from '../../types';

/** Subitens de Configurações no menu lateral (mesma ordem da tela). */
export const SECOES_CONFIGURACAO: { id: SecaoConfiguracao; rotulo: string; descricao: string }[] = [
  {
    id: 'loja',
    rotulo: 'Impressão',
    descricao: 'Identidade impressa nos documentos, horário de atendimento e formato do papel.',
  },
  {
    id: 'financeiro',
    rotulo: 'Taxas',
    descricao: 'Meta mensal, chave PIX e taxas da maquininha usadas na Nova OS.',
  },
  {
    id: 'operacional',
    rotulo: 'Operacional',
    descricao: 'Prazos, prefixo da OS, termos de garantia e itens do checklist de entrada.',
  },
  {
    id: 'whatsapp',
    rotulo: 'Mensagens de WhatsApp',
    descricao: 'Modelos de mensagem enviados ao cliente a partir das Ordens de serviço.',
  },
  {
    id: 'equipe',
    rotulo: 'Equipe',
    descricao: 'Quem pode liberar telas restritas e o que cada funcionário acessa.',
  },
  {
    id: 'conta',
    rotulo: 'Conta',
    descricao: 'Logotipo, tema, senha da conta e exportação dos dados da loja.',
  },
  {
    id: 'leis',
    rotulo: 'Leis e termos de uso',
    descricao: 'Leis do CDC, Código Civil e LGPD para o balcão, termos de garantia impressos e termos de uso do sistema.',
  },
];

/** Seções abertas a qualquer funcionário (só consulta), sem a permissão de Configurações. */
export const SECOES_CONFIGURACAO_LIVRES: SecaoConfiguracao[] = ['leis'];
