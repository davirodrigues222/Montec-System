import React from 'react';
import { ChartColumn, House, Plus, Settings, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { AbaSistema } from '../services/acesso';

interface Props {
  activeTab: AbaSistema;
  onNavegar: (aba: AbaSistema) => void;
}

const ITENS: { aba: AbaSistema; rotulo: string; Icone: LucideIcon }[] = [
  { aba: 'dashboard', rotulo: 'Painel', Icone: House },
  { aba: 'relatorios', rotulo: 'Financeiro', Icone: ChartColumn },
  { aba: 'garantia-retorno', rotulo: 'Garantias', Icone: ShieldCheck },
  { aba: 'configuracoes', rotulo: 'Ajustes', Icone: Settings },
];

/**
 * Barra de navegação inferior, só no celular (abaixo de md). O botão central abre a Nova OS.
 * O conteúdo (main do Layout) tem espaço embaixo do mesmo tamanho, para a barra não cobrir o fim das páginas.
 */
export const BarraNavegacaoInferior: React.FC<Props> = ({ activeTab, onNavegar }) => {
  const item = ({ aba, rotulo, Icone }: (typeof ITENS)[number]) => {
    const ativo = activeTab === aba;
    return (
      <button
        key={aba}
        type="button"
        onClick={() => onNavegar(aba)}
        aria-current={ativo ? 'page' : undefined}
        className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-1 transition ${
          ativo ? 'text-blue-400' : 'text-zinc-400 active:text-white'
        }`}
      >
        <span className={`flex items-center justify-center w-11 h-7 rounded-full transition ${ativo ? 'bg-blue-500/15' : ''}`}>
          <Icone className="w-[22px] h-[22px]" strokeWidth={ativo ? 2.4 : 2} />
        </span>
        <span className="text-[10px] leading-none font-semibold tracking-tight whitespace-nowrap">{rotulo}</span>
      </button>
    );
  };

  const novaOsAtiva = activeTab === 'nova-os';

  return (
    <nav
      aria-label="Navegação principal"
      className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-zinc-800/80 bg-[#090d15]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] print:hidden"
    >
      <div className="flex items-stretch h-16 px-1">
        {ITENS.slice(0, 2).map(item)}

        {/* Botão central destacado: Nova ordem de serviço */}
        <div className="w-16 shrink-0 flex items-start justify-center">
          <button
            type="button"
            onClick={() => onNavegar('nova-os')}
            aria-label="Nova ordem de serviço"
            aria-current={novaOsAtiva ? 'page' : undefined}
            className={`-mt-5 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-600/40 transition active:scale-95 ${
              novaOsAtiva ? 'bg-blue-500 ring-2 ring-blue-300/60' : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            <Plus className="w-7 h-7" strokeWidth={2.5} />
          </button>
        </div>

        {ITENS.slice(2).map(item)}
      </div>
    </nav>
  );
};
