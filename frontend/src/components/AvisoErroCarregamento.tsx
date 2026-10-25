import React from 'react';

/**
 * Aviso de falha ao carregar dados (ex.: sem internet). Evita que a tela mostre "nenhuma ordem"
 * como se os dados tivessem sumido.
 */
export const AvisoErroCarregamento: React.FC<{ mensagem: string; onTentarNovamente: () => void }> = ({
  mensagem,
  onTentarNovamente,
}) => (
  <div
    role="alert"
    className="flex flex-wrap items-center justify-between gap-3 p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl print:hidden"
  >
    <div className="min-w-0">
      <p className="text-sm font-bold text-rose-300">Não foi possível carregar os dados</p>
      <p className="text-xs text-zinc-400 mt-0.5">{mensagem}</p>
    </div>
    <button
      type="button"
      onClick={onTentarNovamente}
      className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition shrink-0"
    >
      Tentar novamente
    </button>
  </div>
);
