import React from 'react';

// Identidade visual do BancadaOS: o símbolo (public/marca-bancadaos.svg) e o nome com o "OS" em azul.

/** Símbolo do "B" sobre a bancada. Vai dentro de um quadro (fundo escuro e borda azul) de cada tela. */
export const SimboloBancadaOS: React.FC<{ className?: string }> = ({ className = 'w-full h-full p-1.5' }) => (
  <img src="/marca-bancadaos.svg" alt="BancadaOS" className={`object-contain ${className}`} />
);

/** Nome da marca: "Bancada" na cor do texto e "OS" em azul. */
export const NomeBancadaOS: React.FC = () => (
  <>
    Bancada<span className="text-blue-400">OS</span>
  </>
);
