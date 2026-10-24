import React from 'react';
import type { OrdemServico } from '../types';
import { obterConfiguracoesLojaSincrono } from '../services/api';
import { itensVisiveisChecklist, rotuloItemChecklist } from '../utils/checklist';

interface Props {
  os: OrdemServico;
  onClose: () => void;
}

export const CertidaoGarantia: React.FC<Props> = ({ os, onClose }) => {
  // Identidade da conta ativa (a loja principal grava nome, CNPJ, telefone e endereço nestas configurações)
  const { nomeLoja } = obterConfiguracoesLojaSincrono();

  const handlePrint = () => {
    window.print();
  };

  const valorTotal = os.orcamentoCalculado?.valorTotalOrcamento || 0;
  const itensChecklist = itensVisiveisChecklist(os.checklistEntrada);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto print:static print:bg-white print:p-0 print:block">
      <div className="bg-white text-zinc-900 w-full max-w-3xl rounded-xl shadow-2xl p-8 print:shadow-none print:w-full print:max-w-none print:p-0">
        
        {/* Ações Visíveis na Tela */}
        <div className="flex justify-between items-center pb-6 mb-6 border-b border-zinc-200 print:hidden">
          <h2 className="text-lg font-bold text-zinc-800">Comprovante de Entrada / Certidão de Garantia</h2>
          <div className="space-x-3">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
            >
              Imprimir / Salvar PDF
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-zinc-200 hover:bg-zinc-300 text-zinc-800 rounded-lg text-sm font-medium transition"
            >
              Fechar
            </button>
          </div>
        </div>

        {/* --- CONTEÚDO PARA IMPRESSÃO --- */}
        <div className="space-y-6 text-sm leading-relaxed">
          {/* Cabeçalho */}
          <div className="flex justify-between items-start border-b border-zinc-300 pb-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 uppercase">{nomeLoja}</h1>
              <p className="text-xs text-zinc-600">Assistência Técnica & Manutenção Especializada</p>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-blue-700">OS #{os.numero_os}</div>
              <p className="text-xs text-zinc-500">
                Data: {os.data_abertura ? new Date(os.data_abertura).toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>

          {/* Dados do Cliente e Aparelho */}
          <div className="grid grid-cols-2 gap-4 bg-zinc-50 p-4 rounded-lg border border-zinc-200">
            <div>
              <h3 className="font-semibold text-xs text-zinc-500 uppercase tracking-wider mb-2">Dados do Cliente</h3>
              <p><strong>Nome:</strong> {os.cliente?.nome}</p>
              <p><strong>CPF/CNPJ:</strong> {os.cliente?.cpfCnpj || 'Não informado'}</p>
              <p><strong>WhatsApp:</strong> {os.cliente?.whatsapp || 'Não informado'}</p>
              <p><strong>E-mail:</strong> {os.cliente?.email || 'Não informado'}</p>
            </div>
            <div>
              <h3 className="font-semibold text-xs text-zinc-500 uppercase tracking-wider mb-2">Dados do Aparelho</h3>
              <p><strong>Modelo:</strong> {os.aparelho?.modelo}</p>
              <p><strong>IMEI / Nº Série:</strong> {os.aparelho?.imei1 || 'Não informado'}</p>
              <p><strong>Senha:</strong> {os.aparelho?.senhaDesbloqueio || 'Sem senha'}</p>
            </div>
          </div>

          {/* Checklist de Entrada */}
          {itensChecklist.length > 0 && (
            <div>
              <h3 className="font-bold text-zinc-800 mb-2">Checklist de Entrada do Dispositivo</h3>
              <div className="grid grid-cols-4 gap-2 text-xs">
                {itensChecklist.map(([item, status]) => (
                  <div key={item} className="p-2 border rounded bg-zinc-50 flex justify-between items-center">
                    <span>{rotuloItemChecklist(item)}:</span>
                    <span className={`font-semibold ${status === 'OK' ? 'text-emerald-700' : status === 'DEFEITO' ? 'text-rose-700' : 'text-amber-700'}`}>
                      {status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Discriminativo dos Serviços e Peças */}
          <div className="border-t border-zinc-200 pt-4">
            <h3 className="font-bold text-zinc-800 mb-2">Discriminativo dos Serviços e Peças</h3>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b text-xs text-zinc-500 uppercase tracking-wider">
                  <th className="py-2">Descrição</th>
                  <th className="py-2 text-right">Valor Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                <tr>
                  <td className="py-3 font-medium text-zinc-800">
                    {os.defeitoRelatado || 'Manutenção geral do aparelho'}
                  </td>
                  <td className="py-3 text-right font-extrabold text-base text-zinc-900">
                    R$ {valorTotal.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Termos de Garantia */}
          <div className="border-t border-zinc-200 pt-4 text-xs text-zinc-600 space-y-2">
            <h4 className="font-bold text-zinc-800 uppercase">Termos e Condições de Garantia</h4>
            <p>1. A garantia cobre exclusivamente os componentes substituídos e serviços executados pelo período de 90 (noventa) dias a contar da data de entrega.</p>
            <p>2. A garantia será nula em caso de danos físicos, contato com líquidos, queda, violação do selo de segurança ou intervenção por terceiros não autorizados.</p>
          </div>

          {/* Assinaturas */}
          <div className="grid grid-cols-2 gap-12 pt-12 text-center text-xs">
            <div className="border-t border-zinc-400 pt-2">
              Assinatura do Técnico Responsável
            </div>
            <div className="border-t border-zinc-400 pt-2">
              Assinatura do Cliente
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};