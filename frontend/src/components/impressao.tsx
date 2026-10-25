import React from 'react';
import { createPortal } from 'react-dom';
import type { ConfiguracoesLojaIsolada, FormatoImpressao } from '../services/api';

// Peças comuns do comprovante de entrada (Histórico) e da certidão de garantia (Nova OS).
// Tudo vem das Configurações da conta: identidade, termos, horário, contatos, PIX e formato do papel.

/**
 * Envia o documento direto para o <body>. Na impressão o CSS global (index.css) esconde o resto
 * da aplicação, então sai só o documento, no formato configurado.
 */
export const DocumentoParaImpressao: React.FC<{ formato: FormatoImpressao; children: React.ReactNode }> = ({
  formato,
  children,
}) =>
  createPortal(
    <div className="area-impressao hidden print:block bg-white text-slate-900">
      <style>
        {formato === 'TERMICA_80'
          ? '@page { size: 80mm auto; margin: 3mm; }'
          : '@page { size: A4; margin: 10mm; }'}
      </style>
      {children}
    </div>,
    document.body
  );

/** Largura e tamanho de fonte de cada formato de papel. */
export const classeFormato = (formato: FormatoImpressao) =>
  formato === 'TERMICA_80'
    ? 'w-[74mm] text-[9px] leading-snug'
    : formato === 'A4_DUAS_VIAS'
    ? 'w-full text-[9.5px] leading-snug'
    : 'w-full text-[11px] leading-relaxed';

/** Uma via (A4 e térmica) ou duas vias na mesma folha com linha de recorte (A4 duas vias). */
export const ViasImpressao: React.FC<{ formato: FormatoImpressao; children: (via: string | null) => React.ReactNode }> = ({
  formato,
  children,
}) => {
  if (formato !== 'A4_DUAS_VIAS') return <>{children(null)}</>;
  return (
    <>
      {children('Via da loja')}
      <div className="my-3 border-t-2 border-dashed border-slate-400 text-center text-[9px] text-slate-500">
        <span className="relative -top-2 bg-white px-2">✂ recorte aqui</span>
      </div>
      {children('Via do cliente')}
    </>
  );
};

export const CabecalhoLojaImpressao: React.FC<{ cfg: ConfiguracoesLojaIsolada; formato: FormatoImpressao }> = ({ cfg, formato }) => {
  const termica = formato === 'TERMICA_80';
  const documentos = [cfg.cnpj && `CNPJ/CPF: ${cfg.cnpj}`, cfg.inscricaoEstadual && `IE/IM: ${cfg.inscricaoEstadual}`]
    .filter(Boolean)
    .join(' | ');
  return (
    <div className={`flex items-center gap-3 ${termica ? 'flex-col text-center' : ''}`}>
      {cfg.logoUrl && (
        <img src={cfg.logoUrl} alt="" className={`${termica ? 'w-12 h-12' : 'w-14 h-14'} object-contain shrink-0`} />
      )}
      <div className="min-w-0">
        <h1 className={`${termica ? 'text-sm' : 'text-xl'} font-black uppercase tracking-tight text-slate-900`}>{cfg.nomeLoja}</h1>
        {cfg.subtitulo && <p className="font-semibold text-slate-600">{cfg.subtitulo}</p>}
        {documentos && <p className="text-slate-500">{documentos}</p>}
        {(cfg.telefone || cfg.endereco) && (
          <p className="text-slate-500">{[cfg.telefone && `Tel: ${cfg.telefone}`, cfg.endereco].filter(Boolean).join(' | ')}</p>
        )}
      </div>
    </div>
  );
};

/** Termos de garantia configurados pela loja (cada linha vira um parágrafo). */
export const TermosImpressos: React.FC<{ texto: string }> = ({ texto }) => (
  <div className="space-y-1">
    {texto
      .split('\n')
      .map((linha) => linha.trim())
      .filter(Boolean)
      .map((linha, i) => (
        <p key={i}>{linha}</p>
      ))}
  </div>
);

/** Horário, prazo de retirada, contatos e PIX, conforme as opções de impressão da conta. */
export const RodapeLojaImpressao: React.FC<{ cfg: ConfiguracoesLojaIsolada }> = ({ cfg }) => {
  const contatos = cfg.exibirContatosImpressao
    ? [
        cfg.telefone && `WhatsApp: ${cfg.telefone}`,
        cfg.instagram && `Instagram: ${cfg.instagram.startsWith('@') ? cfg.instagram : `@${cfg.instagram}`}`,
        cfg.emailAtendimento && `E-mail: ${cfg.emailAtendimento}`,
      ].filter(Boolean)
    : [];
  const mostrarPix = cfg.exibirPixImpressao && cfg.chavePix.trim();

  return (
    <div className="space-y-0.5 text-center text-slate-600">
      {cfg.horarioFuncionamento && (
        <p>
          <strong>Horário de atendimento:</strong> {cfg.horarioFuncionamento}
        </p>
      )}
      <p>
        Aparelhos não retirados em até {cfg.prazoAbandonoDias} dias após o aviso de conclusão poderão ser considerados
        abandonados.
      </p>
      {contatos.length > 0 && <p>{contatos.join(' | ')}</p>}
      {mostrarPix && (
        <p>
          <strong>PIX:</strong> {cfg.chavePix}
          {cfg.favorecidoPix && ` (${cfg.favorecidoPix})`}
        </p>
      )}
    </div>
  );
};
