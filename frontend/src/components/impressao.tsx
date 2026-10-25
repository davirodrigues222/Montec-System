import React from 'react';
import { createPortal } from 'react-dom';
import type { ConfiguracoesLojaIsolada, FormatoImpressao } from '../services/api';
import type { OrdemServico } from '../types';
import { formatarValor } from '../utils/formatadores';
import {
  GARANTIA_LEGAL_DIAS,
  TIPOS_PECA,
  VALIDADE_ORCAMENTO_DIAS,
  faltaAutorizacaoPeca,
  lerDadosLegaisOS,
} from '../utils/conformidade';

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

/** Data "AAAA-MM-DD" (ou ISO) no formato brasileiro, sem deslocamento de fuso. */
const dataBr = (valor?: string | null) =>
  valor ? new Date(`${String(valor).substring(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : null;

/**
 * Orçamento prévio (CDC, art. 40): mão de obra e peças discriminadas, condições de pagamento,
 * previsão de término e validade; e a aprovação do cliente (art. 39, VI) ou o aviso de que falta.
 */
export const BlocoOrcamentoImpressao: React.FC<{ os: OrdemServico }> = ({ os }) => {
  const legal = lerDadosLegaisOS(os.checklistEntrada);
  const total = Number(os.orcamentoCalculado?.valorTotalOrcamento || 0);
  const pecas = Math.min(total, legal.valorPecas || 0);
  const previsao = dataBr(os.data_prevista_entrega || os.checklistEntrada?.__dataPrevistaEntrega);
  const inicio = dataBr(os.data_abertura || os.dataAbertura);

  return (
    <div className="border border-slate-300 rounded p-2 space-y-0.5">
      <h3 className="font-bold uppercase text-slate-700 border-b border-slate-200 pb-0.5 mb-1">Orçamento</h3>
      {pecas > 0 ? (
        <>
          <p>
            <strong>Mão de obra:</strong> R$ {formatarValor(total - pecas)}
          </p>
          <p>
            <strong>Peças e materiais:</strong> R$ {formatarValor(pecas)}
          </p>
        </>
      ) : (
        <p>
          <strong>Mão de obra e peças:</strong> R$ {formatarValor(total)}
        </p>
      )}
      {legal.tipoPeca && (
        <p>
          <strong>Peça empregada:</strong> {TIPOS_PECA[legal.tipoPeca].rotulo}
          {TIPOS_PECA[legal.tipoPeca].exigeAutorizacao &&
            (legal.autorizacaoPeca ? ' (autorizada pelo cliente)' : ' (aguardando autorização do cliente)')}
        </p>
      )}
      <p>
        <strong>Pagamento:</strong> {os.formaPagamento || 'A combinar'}
        {(os.parcelas || 1) > 1 ? ` em ${os.parcelas}x` : ''}
      </p>
      <p>
        <strong>Início:</strong> {inicio || 'na aprovação'} · <strong>Previsão de término:</strong> {previsao || 'a combinar'}
      </p>
      <p>Este orçamento vale por {VALIDADE_ORCAMENTO_DIAS} dias a partir do recebimento (CDC, art. 40, § 1º).</p>
      <p className="font-semibold">
        {legal.orcamentoAprovadoEm
          ? `Aprovado pelo cliente em ${new Date(legal.orcamentoAprovadoEm).toLocaleDateString('pt-BR')}${
              legal.orcamentoAprovacaoForma ? ` (${legal.orcamentoAprovacaoForma})` : ''
            }.`
          : 'Aguardando aprovação: nenhum serviço será executado sem a autorização do cliente (CDC, art. 39, VI).'}
      </p>
      {faltaAutorizacaoPeca(legal) && (
        <p>Peças não originais novas só serão usadas com a autorização do cliente (CDC, arts. 21 e 70).</p>
      )}
    </div>
  );
};

/** Termo de garantia (CDC, art. 50): prazo, início, cobertura, onde e como usar e sem custo ao cliente. */
export const BlocoGarantiaLegalImpressao: React.FC<{ prazoDias: number; cfg: ConfiguracoesLojaIsolada }> = ({
  prazoDias,
  cfg,
}) => {
  const prazo = Math.max(GARANTIA_LEGAL_DIAS, prazoDias || 0);
  return (
    <div className="space-y-0.5">
      <p>
        Garantia de {prazo} dias, contados da entrega do aparelho (CDC, art. 26, II e § 1º)
        {prazo > GARANTIA_LEGAL_DIAS
          ? `, já incluída a garantia legal de ${GARANTIA_LEGAL_DIAS} dias.`
          : '. A garantia legal não pode ser excluída (CDC, art. 24).'}
      </p>
      <p>
        Cobre defeitos do serviço executado e das peças substituídas. Para usar, apresente este comprovante na loja
        {cfg.endereco ? ` (${cfg.endereco})` : ''}. O atendimento em garantia não tem custo: você pode escolher refazer o
        serviço, receber o valor pago de volta ou ter abatimento proporcional do preço (CDC, art. 20).
      </p>
    </div>
  );
};

/** Aviso ao titular dos dados (LGPD, art. 9º): finalidade, base legal, direitos e contato. */
export const AvisoPrivacidadeImpressao: React.FC<{ cfg: ConfiguracoesLojaIsolada }> = ({ cfg }) => {
  const contato = [cfg.telefone, cfg.emailAtendimento].filter(Boolean).join(' / ');
  return (
    <p className="text-slate-500">
      <strong>Seus dados (LGPD):</strong> nome, CPF, contato e dados do aparelho são usados só para executar este serviço,
      emitir a garantia e cumprir obrigações legais (Lei 13.709/2018, art. 7º, II e V). Você pode pedir acesso, correção
      ou eliminação dos seus dados a {cfg.nomeLoja}
      {contato ? ` (${contato})` : ''}. A senha do aparelho não é impressa e é apagada na entrega.
    </p>
  );
};
