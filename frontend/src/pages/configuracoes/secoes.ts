import type { SecaoConfiguracao } from '../../types';

/** Subitens de Configurações no menu lateral (mesma ordem da tela). */
export const SECOES_CONFIGURACAO: { id: SecaoConfiguracao; rotulo: string; descricao: string }[] = [
  {
    id: 'loja',
    rotulo: 'Dados da loja & impressão',
    descricao: 'Identidade impressa nos documentos, horário de atendimento e formato do papel.',
  },
  {
    id: 'financeiro',
    rotulo: 'Financeiro & taxas',
    descricao: 'Meta mensal, chave PIX e taxas da maquininha usadas na Nova OS.',
  },
  {
    id: 'operacional',
    rotulo: 'Operacional & garantia',
    descricao: 'Prazos, prefixo da OS, termos de garantia e itens do checklist de entrada.',
  },
  {
    id: 'whatsapp',
    rotulo: 'Mensagens de WhatsApp',
    descricao: 'Modelos de mensagem enviados ao cliente a partir das Ordens de serviço.',
  },
  {
    id: 'equipe',
    rotulo: 'Equipe & acesso',
    descricao: 'Quem pode liberar telas restritas e o que cada funcionário acessa.',
  },
  {
    id: 'conta',
    rotulo: 'Aparência, conta & backup',
    descricao: 'Logotipo, tema, senha da conta e exportação dos dados da loja.',
  },
];
