import React from 'react';
import type { OrdemServico } from '../types';
import { obterConfiguracoesLojaSincrono } from '../services/api';
import { itensVisiveisChecklist, rotuloItemChecklist } from '../utils/checklist';
import { formatarValor } from '../utils/formatadores';
import {
  CabecalhoLojaImpressao,
  DocumentoParaImpressao,
  RodapeLojaImpressao,
  TermosImpressos,
  ViasImpressao,
  classeFormato,
} from './impressao';

interface Props {
  os: OrdemServico;
  onClose: () => void;
}

const NOMES_FORMATO = {
  A4: 'Folha A4',
  A4_DUAS_VIAS: 'Folha A4 com 2 vias',
  TERMICA_80: 'Bobina térmica 80 mm',
};

/** Comprovante de entrada / certidão de garantia da OS recém-criada, no formato configurado pela loja. */
export const CertidaoGarantia: React.FC<Props> = ({ os, onClose }) => {
  // Identidade, termos, contatos e formato de papel da conta ativa (Configurações)
  const cfg = obterConfiguracoesLojaSincrono();
  const formato = cfg.formatoImpressao;
  const termica = formato === 'TERMICA_80';

  const valorTotal = os.orcamentoCalculado?.valorTotalOrcamento || 0;
  const itensChecklist = itensVisiveisChecklist(os.checklistEntrada);
  const prazoGarantia = os.possuiGarantia === false ? 0 : Number(os.prazoGarantiaDias) || cfg.prazoGarantiaDias;
  const dataAbertura = os.data_abertura ? new Date(`${os.data_abertura.substring(0, 10)}T12:00:00`) : new Date();

  const documento = (via: string | null) => (
    <div className={`${classeFormato(formato)} mx-auto space-y-3 text-slate-800`}>
      {/* Cabeçalho */}
      <div className={`flex ${termica ? 'flex-col gap-2' : 'justify-between items-start'} border-b border-slate-300 pb-3`}>
        <CabecalhoLojaImpressao cfg={cfg} formato={formato} />
        <div className={termica ? 'text-center' : 'text-right shrink-0'}>
          {via && <p className="text-[9px] font-bold uppercase text-slate-500">{via}</p>}
          <p className={`${termica ? 'text-xs' : 'text-base'} font-black text-blue-800`}>OS #{os.numero_os}</p>
          <p className="text-slate-500">Data: {dataAbertura.toLocaleDateString('pt-BR')}</p>
        </div>
      </div>

      {/* Cliente e aparelho */}
      <div className={`grid ${termica ? 'grid-cols-1' : 'grid-cols-2'} gap-3 rounded border border-slate-200 p-2.5`}>
        <div>
          <h3 className="font-bold uppercase text-slate-500 mb-1">Dados do cliente</h3>
          <p><strong>Nome:</strong> {os.cliente?.nome}</p>
          <p><strong>CPF/CNPJ:</strong> {os.cliente?.cpfCnpj || 'Não informado'}</p>
          <p><strong>WhatsApp:</strong> {os.cliente?.whatsapp || 'Não informado'}</p>
        </div>
        <div>
          <h3 className="font-bold uppercase text-slate-500 mb-1">Dados do aparelho</h3>
          <p><strong>Modelo:</strong> {os.aparelho?.modelo}</p>
          <p><strong>IMEI / Nº série:</strong> {os.aparelho?.imei1 || 'Não informado'}</p>
          <p><strong>Senha:</strong> {os.aparelho?.senhaDesbloqueio || 'Sem senha'}</p>
        </div>
      </div>

      {/* Checklist de entrada */}
      {itensChecklist.length > 0 && (
        <div>
          <h3 className="font-bold text-slate-800 mb-1">Checklist de entrada</h3>
          <div className={`grid ${termica ? 'grid-cols-2' : 'grid-cols-4'} gap-1`}>
            {itensChecklist.map(([item, status]) => (
              <div key={item} className="flex justify-between gap-1 border border-slate-200 rounded px-1.5 py-0.5">
                <span className="truncate">{rotuloItemChecklist(item)}</span>
                <span
                  className={`font-semibold ${
                    status === 'OK' ? 'text-emerald-700' : status === 'DEFEITO' ? 'text-rose-700' : 'text-amber-700'
                  }`}
                >
                  {status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Serviço e valor */}
      <div className="flex justify-between items-center gap-2 border-y border-slate-200 py-2">
        <span className="font-medium">{os.servicoRealizado || os.defeitoRelatado || 'Manutenção geral do aparelho'}</span>
        <span className={`${termica ? 'text-xs' : 'text-sm'} font-black text-slate-900 shrink-0`}>R$ {formatarValor(valorTotal)}</span>
      </div>

      {/* Garantia e termos configurados */}
      <div className="space-y-1 text-slate-600">
        <h4 className="font-bold uppercase text-slate-800">
          {prazoGarantia > 0 ? `Garantia de ${prazoGarantia} dias — termos e condições` : 'Serviço sem garantia — condições'}
        </h4>
        <TermosImpressos texto={cfg.termosGarantiaTexto} />
      </div>

      {/* Assinaturas */}
      <div className={`grid ${termica ? 'grid-cols-1 gap-6' : 'grid-cols-2 gap-10'} pt-6 text-center`}>
        <div className="border-t border-slate-400 pt-1">Assinatura do técnico responsável</div>
        <div className="border-t border-slate-400 pt-1">Assinatura do cliente</div>
      </div>

      <div className="border-t border-slate-200 pt-2">
        <RodapeLojaImpressao cfg={cfg} />
      </div>
    </div>
  );

  return (
    <>
      {/* Pré-visualização na tela */}
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white text-zinc-900 w-full max-w-3xl rounded-xl shadow-2xl p-5 sm:p-8 my-auto">
          <div className="flex flex-wrap justify-between items-center gap-3 pb-4 mb-5 border-b border-zinc-200">
            <div>
              <h2 className="text-lg font-bold text-zinc-800">Comprovante de entrada / Certidão de garantia</h2>
              <p className="text-xs text-zinc-500">Formato: {NOMES_FORMATO[formato]} (altere em Configurações › Impressão)</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
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
          <div className="bg-white">{documento(null)}</div>
        </div>
      </div>

      {/* Cópia enviada à impressora (só ela sai no papel) */}
      <DocumentoParaImpressao formato={formato}>
        <ViasImpressao formato={formato}>{documento}</ViasImpressao>
      </DocumentoParaImpressao>
    </>
  );
};
