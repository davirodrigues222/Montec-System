import React from 'react';
import { ETAPAS_OS } from './conteudo';

// Prévia ilustrativa de uma OS (dados de exemplo), desenhada com HTML/CSS em vez de imagem:
// fica nítida em qualquer tela e acompanha a identidade visual do sistema.
const ETAPA_ATUAL = 2; // "Em manutenção"

const CHECKLIST: [string, 'ok' | 'defeito'][] = [
  ['Tela', 'defeito'],
  ['Bateria', 'ok'],
  ['Câmeras', 'ok'],
  ['Carregamento', 'ok'],
];

export const MockupOS: React.FC = () => (
  <div className="relative" aria-label="Exemplo ilustrativo de uma ordem de serviço no Montec System" role="img">
    {/* Brilho de fundo */}
    <div className="absolute -inset-6 bg-gradient-to-tr from-blue-600/20 via-transparent to-emerald-500/10 blur-3xl rounded-[2rem] pointer-events-none" />

    <div className="relative bg-[#0c101a] border border-zinc-800/80 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
      {/* Barra de janela */}
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-zinc-800/60 bg-[#090d15]">
        <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
        <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
        <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
        <span className="ml-3 text-[10px] font-semibold text-zinc-500">Ordens de serviço</span>
      </div>

      <div className="p-5 space-y-4">
        {/* Cabeçalho da OS */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-blue-400 tracking-wider">OS-104287</p>
            <p className="text-sm font-extrabold text-white mt-0.5">iPhone 13 · Troca de tela</p>
            <p className="text-[11px] text-zinc-400 mt-0.5">Cliente: Ana Paula · Entrega prevista: sexta</p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/25 whitespace-nowrap">
            Em manutenção
          </span>
        </div>

        {/* Linha do tempo de status */}
        <ol className="flex items-center" aria-hidden="true">
          {ETAPAS_OS.map((etapa, i) => (
            <li key={etapa} className="flex-1 flex items-center last:flex-none">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  i < ETAPA_ATUAL ? 'bg-emerald-500' : i === ETAPA_ATUAL ? 'bg-blue-500 ring-4 ring-blue-500/20' : 'bg-zinc-700'
                }`}
              />
              {i < ETAPAS_OS.length - 1 && <span className={`h-0.5 flex-1 mx-1 rounded ${i < ETAPA_ATUAL ? 'bg-emerald-500/60' : 'bg-zinc-800'}`} />}
            </li>
          ))}
        </ol>
        <div className="flex justify-between text-[9px] font-semibold text-zinc-500 -mt-2">
          <span>Recebido</span>
          <span>Pronto</span>
          <span>Entregue</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Checklist */}
          <div className="p-3 bg-[#080c14] border border-zinc-800/80 rounded-xl space-y-1.5">
            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Checklist de entrada</p>
            {CHECKLIST.map(([item, estado]) => (
              <div key={item} className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-300">{item}</span>
                <span className={`font-bold ${estado === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {estado === 'ok' ? 'OK' : 'Defeito'}
                </span>
              </div>
            ))}
          </div>

          {/* Financeiro */}
          <div className="p-3 bg-[#080c14] border border-zinc-800/80 rounded-xl space-y-1.5 text-[11px]">
            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Financeiro</p>
            <div className="flex justify-between"><span className="text-zinc-400">Serviço</span><span className="text-zinc-200 font-semibold">R$ 480,00</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Desconto</span><span className="text-rose-400 font-semibold">− R$ 30,00</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Taxa 3x</span><span className="text-rose-400 font-semibold">− R$ 22,00</span></div>
            <div className="flex justify-between"><span className="text-zinc-400">Peça</span><span className="text-rose-400 font-semibold">− R$ 190,00</span></div>
            <div className="flex justify-between pt-1 border-t border-zinc-800/60"><span className="text-zinc-300 font-semibold">Lucro</span><span className="text-emerald-400 font-extrabold">R$ 238,00</span></div>
          </div>
        </div>

        {/* Garantia */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="text-[11px] font-bold text-emerald-400">Garantia de 90 dias</span>
          </div>
          <span className="text-[10px] font-semibold text-zinc-400">Certidão pronta para imprimir</span>
        </div>
      </div>
    </div>

    {/* Cartão flutuante: meta do mês */}
    <div className="hidden sm:block absolute -bottom-6 -left-6 w-48 bg-[#0c101a] border border-zinc-800/80 rounded-xl p-3.5 shadow-xl shadow-black/40">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-zinc-400">Meta do mês</p>
        <p className="text-[11px] font-extrabold text-white">72%</p>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full mt-2 overflow-hidden">
        <div className="h-full w-[72%] bg-blue-600 rounded-full" />
      </div>
      <p className="text-[10px] text-zinc-500 mt-1.5">Faltam R$ 2.240 para bater</p>
    </div>
  </div>
);
