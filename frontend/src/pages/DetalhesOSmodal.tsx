import React from 'react';
import type { OrdemServico, StatusOS } from '../types';

interface Props {
  os: OrdemServico | null;
  onClose: () => void;
  onVerDetalhesCompletos: (os: OrdemServico) => void;
  onEditar: (os: OrdemServico) => void;
  onImprimir: (os: OrdemServico) => void;
  onExcluir: (os: OrdemServico) => void;
  formatarData: (data?: string) => string;
  renderStatusBadge: (status: StatusOS) => React.ReactNode;
}

export const DetalhesOSModal: React.FC<Props> = ({
  os,
  onClose,
  onVerDetalhesCompletos,
  onEditar,
  onImprimir,
  onExcluir,
  formatarData,
  renderStatusBadge,
}) => {
  if (!os) return null;

  const valorTotal = Number(
    os.orcamentoCalculado?.valorTotalOrcamento || (os as any).valor_total || 0
  );
  const isRascunho = os.status_os === 'RASCUNHO';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-[#0b0f19] border border-zinc-800 w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabeçalho do Modal */}
        <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <span className="font-mono font-extrabold text-blue-400 text-base sm:text-lg">
              {os.numero_os}
            </span>
            {renderStatusBadge(os.status_os)}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center transition"
            aria-label="Fechar modal"
          >
            ✕
          </button>
        </div>

        {/* Conteúdo com rolagem vertical limpa */}
        <div className="p-5 overflow-y-auto space-y-3.5 text-xs">
          {/* Card: Dados do Cliente */}
          <div className="bg-[#080c14] border border-zinc-800/80 rounded-xl p-3.5 space-y-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
              CLIENTE
            </span>
            <p className="text-sm font-bold text-white">
              {os.cliente?.nome || 'Cliente Balcão'}
            </p>
            <p className="text-zinc-400 font-mono">
              {os.cliente?.whatsapp || 'Sem telefone cadastrado'}
            </p>
          </div>

          {/* Card: Aparelho e Diagnóstico */}
          <div className="bg-[#080c14] border border-zinc-800/80 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                APARELHO & SERVIÇO
              </span>
              <span className="text-[11px] text-zinc-400">
                Entrada: {formatarData(os.data_abertura)}
              </span>
            </div>
            <div>
              <p className="text-xs font-bold text-white">
                {os.aparelho?.modelo || 'Smartphone'}
              </p>
              {os.aparelho?.imei1 && (
                <p className="text-[11px] text-zinc-400 font-mono mt-0.5">
                  IMEI: {os.aparelho.imei1}
                </p>
              )}
              {os.aparelho?.senhaDesbloqueio && (
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Senha: <span className="text-zinc-200 font-mono">{os.aparelho.senhaDesbloqueio}</span>
                </p>
              )}
            </div>
            <div className="pt-2 border-t border-zinc-800/60">
              <p className="text-zinc-400 text-[11px]">Defeito / Serviço realizado:</p>
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
          <div className="bg-[#080c14] border border-zinc-800/80 rounded-xl p-3.5 flex items-center justify-between">
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
                className="p-2.5 bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center"
                title="Editar OS"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            </>
          )}

          {/* Imprimir */}
          <button
            onClick={() => {
              onClose();
              onImprimir(os);
            }}
            className="p-2.5 bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center"
            title="Imprimir via / comprovante"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
          </button>

          {/* Excluir (Lixeira) */}
          <button
            onClick={() => {
              onClose();
              onExcluir(os);
            }}
            className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 rounded-xl text-xs font-bold transition flex items-center justify-center"
            title="Excluir OS"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};