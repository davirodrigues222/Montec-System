import React from 'react';
import { BatteryCharging, Cable, Cpu, Headphones, Laptop, Microchip, Smartphone, Tablet, Watch, Wrench } from 'lucide-react';

// Peças e aparelhos da bancada flutuando devagar, bem apagados, atrás do conteúdo.
// Posições em % do espaço; duração e atraso diferentes para não andarem juntos.
const ITENS = [
  { Icone: Smartphone, x: 8, y: 18, tamanho: 34, duracao: 11, atraso: 0 },
  { Icone: Wrench, x: 82, y: 14, tamanho: 30, duracao: 13, atraso: -4 },
  { Icone: Cpu, x: 18, y: 72, tamanho: 30, duracao: 12, atraso: -7 },
  { Icone: BatteryCharging, x: 88, y: 66, tamanho: 28, duracao: 10, atraso: -2 },
  { Icone: Tablet, x: 64, y: 82, tamanho: 32, duracao: 14, atraso: -9 },
  { Icone: Headphones, x: 36, y: 10, tamanho: 26, duracao: 12, atraso: -5 },
  { Icone: Microchip, x: 48, y: 58, tamanho: 22, duracao: 9, atraso: -3 },
  { Icone: Laptop, x: 4, y: 46, tamanho: 30, duracao: 15, atraso: -11 },
  { Icone: Watch, x: 92, y: 40, tamanho: 24, duracao: 11, atraso: -6 },
  { Icone: Cable, x: 30, y: 88, tamanho: 26, duracao: 13, atraso: -8 },
];

/**
 * Fundo animado do estado vazio (ex.: nenhuma ordem em andamento). Decorativo: não recebe cliques.
 * O container precisa de "relative isolate" para o fundo ficar atrás do conteúdo.
 */
export const FundoBancada: React.FC = () => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
    {/* Brilho suave no centro, atrás da mensagem */}
    <div className="absolute left-1/2 top-1/2 w-72 h-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/10 blur-3xl fundo-bancada-pulso" />
    {ITENS.map(({ Icone, x, y, tamanho, duracao, atraso }, i) => (
      <Icone
        key={i}
        className="absolute text-blue-400 opacity-[0.12] fundo-bancada-item"
        style={{
          left: `${x}%`,
          top: `${y}%`,
          width: tamanho,
          height: tamanho,
          animationDuration: `${duracao}s`,
          animationDelay: `${atraso}s`,
        }}
        strokeWidth={1.5}
      />
    ))}
  </div>
);
