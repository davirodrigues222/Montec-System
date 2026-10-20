import React from 'react';
import type { OrdemServico } from '../types';

interface Props {
  os: OrdemServico;
  onClose: () => void;
  onEditar: (os: OrdemServico) => void;
  onVerDetalhesCompletos: (os: OrdemServico) => void;
  onImprimir: (os: OrdemServico) => void;
  onExcluir: (id: string, numero: string) => void;
}

export const DetalhesOSModal: React.FC<Props> = ({
  os,
  onClose,
  onEditar,
  onVerDetalhesCompletos,
  onImprimir,
  onExcluir,
}) => {
  const isRascunho = os.status_os === 'RASCUNHO';
  const valorTotal = Number(os.orcamentoCalculado?.valorTotalOrcamento || (os as any).valor_total || 0);
  const pagamentosLista: any[] = (os as any).pagamentos || (os.checklistEntrada as any)?.__pagamentos || [];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0b0f19] border border-zinc-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Topo do Modal */}
        <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <span className="text-base font-extrabold text-blue-400 font-mono">
              {os.numero_os}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border ${
                isRascunho
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
              }`}
            >
              {isRascunho ? 'RASCUNHO / EM DEFINIÇÃO' : os.status_os}
            </span>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        {/* Conteúdo Central */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Card: Cliente e Dispositivo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#080c14] border border-zinc-800/80 rounded-xl p-3.5">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                CLIENTE
              </span>
              <p className="text-sm font-bold text-white truncate">
                {os.cliente?.nome || 'Cliente a Definir'}
              </p>
              {os.cliente?.whatsapp && (
                <p className="text-zinc-400 text-[11px] mt-0.5">
                  {os.cliente.whatsapp}
                </p>
              )}
            </div>

            <div className="bg-[#080c14] border border-zinc-800/80 rounded-xl p-3.5">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                DISPOSITIVO
              </span>
              <p className="text-sm font-bold text-white truncate">
                {os.aparelho?.modelo || 'Aparelho a Avaliar'}
              </p>
              {os.aparelho?.imei1 && (
                <p className="text-zinc-400 text-[11px] font-mono mt-0.5">
                  IMEI: {os.aparelho.imei1}
                </p>
              )}
            </div>
          </div>

          {/* Card: Defeito e Diagnóstico */}
          <div className="bg-[#080c14] border border-zinc-800/80 rounded-xl p-3.5 space-y-2">
            <div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                DEFEITO RELATADO / SERVIÇO
              </span>
              <p className="text-zinc-200 font-semibold mt-0.5">
                {os.servicoRealizado || os.defeitoRelatado || 'Definição pendente'}
              </p>
              {os.diagnostico && (
                <p className="text-zinc-400 text-[11px] mt-1.5 italic">
                  Diagnóstico: {os.diagnostico}
                </p>
              )}
            </div>
          </div>

          {/* Card: Valor e Pagamento */}
          <div className="bg-[#080c14] border border-zinc-800/80 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  VALOR COBRADO
                </span>
                <p className="text-base font-extrabold text-white mt-0.5">
                  {valorTotal > 0
                    ? `R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : 'A definir'}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  PAGAMENTO
                </span>
                <p className="text-xs text-zinc-300 font-medium mt-0.5">
                  {(os as any).formaPagamento || (os as any).forma_pagamento || 'A combinar'}
                </p>
              </div>
            </div>

            {/* Detalhes se houver pagamento combinado (2 formas) */}
            {pagamentosLista.length > 1 && (
              <div className="pt-2 border-t border-zinc-800/60 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                {pagamentosLista.map((pg: any, idx: number) => (
                  <div key={idx} className="bg-[#0c101a] p-2.5 rounded-lg border border-zinc-800">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-blue-400">
                        {pg.forma} {pg.forma === 'Cartão de crédito' && pg.parcelas > 1 ? `(${pg.parcelas}x)` : ''}
                      </span>
                      <span className="text-white font-bold">
                        R$ {Number(pg.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    {pg.taxaPercentual > 0 && (
                      <p className="text-[10px] text-zinc-400 mt-1">
                        Taxa maquineta ({pg.taxaPercentual}%): - R$ {Number(pg.valorTaxa || 0).toFixed(2)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Rodapé: Ações Rápidas da OS */}
        <div className="p-4 border-t border-zinc-800/80 bg-[#090d15] flex items-center justify-between gap-2 shrink-0">
          {isRascunho ? (
            <button
              onClick={() => {
                onClose();
                onEditar(os);
              }}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shadow-md shadow-blue-600/20"
            >
              <span>✏️</span>
              <span>Completar OS</span>
            </button>
          ) : (
            <>
              {/* Olhinho: Ver Detalhes Completos */}
              <button
                onClick={() => {
                  onClose();
                  onVerDetalhesCompletos(os);
                }}
                className="flex-1 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5"
                title="Abrir tela de detalhes completos"
              >
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span>Ver detalhes</span>
              </button>

              {/* Editar (Lápis) */}
              <button
                onClick={() => {
                  onClose();
                  onEditar(os);
                }}
                className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl text-xs font-bold transition"
                title="Editar Informações da OS"
              >
                ✏️
              </button>

              {/* Imprimir Comprovante */}
              <button
                onClick={() => {
                  onClose();
                  onImprimir(os);
                }}
                className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl text-xs font-bold transition"
                title="Imprimir Certidão / Comprovante"
              >
                🖨️
              </button>

              {/* Excluir (Lixeira) */}
              <button
                onClick={() => {
                  onClose();
                  onExcluir(os.id_os, os.numero_os);
                }}
                className="p-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl text-xs font-bold transition"
                title="Excluir Ordem de Serviço"
              >
                🗑️
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};