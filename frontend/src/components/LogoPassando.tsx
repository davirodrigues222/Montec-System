import React from 'react';
import { FundoBancada } from './FundoBancada';
import { NomeBancadaOS, SimboloBancadaOS } from './Marca';

/**
 * Preenche o espaço que sobra num card com poucas linhas (Painel › Ordens em andamento): a logo entra
 * rápido pela esquerda, para no centro e sai pela direita, em ciclo. Animações em index.css
 * (logo-passando); quem pede menos movimento vê a logo parada.
 */
export const LogoPassando: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div aria-hidden="true" className={`logo-passando-area relative isolate overflow-hidden flex items-center justify-center ${className}`}>
    <FundoBancada />
    <div className="logo-passando flex items-center gap-3">
      <span className="logo-passando-rastro absolute right-full top-1/2 -translate-y-1/2 mr-2 h-1 w-40 rounded-full bg-linear-to-r from-transparent to-blue-500/70" />
      <span className="w-14 h-14 rounded-2xl bg-[#080c14] border border-blue-500/40 shadow-lg shadow-blue-500/10 flex items-center justify-center">
        <SimboloBancadaOS className="w-full h-full p-2" />
      </span>
      <span className="text-xl font-black tracking-tight text-white">
        <NomeBancadaOS />
      </span>
    </div>
  </div>
);
