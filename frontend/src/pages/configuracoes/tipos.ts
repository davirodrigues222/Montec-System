import type { ConfiguracoesLojaIsolada } from '../../services/api';
import type { SecaoCadastro } from '../../types';

/** Props comuns das abas: a configuração em edição e como alterá-la (salva pelo botão "Salvar configurações"). */
export interface PropsAba {
  config: ConfiguracoesLojaIsolada;
  alterar: (parcial: Partial<ConfiguracoesLojaIsolada>) => void;
}

export interface PropsAbaEquipe {
  onAbrirCadastro?: (secao: SecaoCadastro) => void;
}

/** Card padrão das seções da tela de Configurações. */
export const cardCls = 'bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-5 sm:p-6 space-y-5 shadow-sm';
