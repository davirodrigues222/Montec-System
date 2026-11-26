import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Link2,
  Lock,
  MessageCircle,
  MoreHorizontal,
  MoreVertical,
  Pencil,
  Phone,
  Plus,
  Printer,
  RotateCcw,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import type { OrdemServico, StatusOS } from '../types';
import { MODELOS_WHATSAPP, enviarMensagemWhatsapp, podeEnviarMensagem } from '../utils/whatsapp';
import { itensVisiveisChecklist, rotuloItemChecklist } from '../utils/checklist';
import { formatarDataOS, formatarValor } from '../utils/formatadores';
import { lerDadosLegaisOS } from '../utils/conformidade';
import { diaLocalDaData } from '../services/api';
import { gerarLinkAcompanhamento } from '../services/acompanhamento';
import { listarFotosOS } from '../services/fotosOS';
import { LinkAcompanhamentoOS } from './LinkAcompanhamentoOS';
import { PedidoAvaliacaoOS } from './PedidoAvaliacaoOS';
import { GaleriaFotosOS } from './FotosOS';

export type AbaEdicaoOS = 'geral' | 'financeiro' | 'checklist';
type ChaveMensagem = (typeof MODELOS_WHATSAPP)[number]['chave'];

interface Props {
  os: OrdemServico;
  /** Mostra custos das peças (permissão financeira). */
  veCustos: boolean;
  /** A OS tem documento para imprimir (com garantia). */
  podeImprimir: boolean;
  /** Muda quando as fotos são alteradas no Editar OS (a galeria recarrega). */
  versaoFotos: number;
  onFechar: () => void;
  onEditar: (aba?: AbaEdicaoOS) => void;
  onImprimir: () => void;
  onExcluir: () => void;
  /** Grava o novo status (pede as confirmações necessárias). */
  onAlterarStatus: (novo: StatusOS) => Promise<void>;
  /** Grava a previsão de entrega (AAAA-MM-DD, vazio apaga). */
  onDefinirPrevisao: (data: string) => Promise<void>;
  onAvaliacaoRegistrada: (idOs: string, quando: string) => void;
}

// ================= ETAPAS E STATUS =================

const ROTULO_STATUS: Record<StatusOS, string> = {
  RASCUNHO: 'Rascunho',
  AGUARDANDO_AVALIACAO: 'Aguardando avaliação',
  EM_ANALISE: 'Em análise',
  AGUARDANDO_PECA: 'Aguardando peça',
  EM_MANUTENCAO: 'Em manutenção',
  PRONTO: 'Pronto para retirada',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
};

// Mesmas cores do StatusBadge (azul em andamento, verde pronto, vermelho só no cancelado)
const COR_STATUS: Record<StatusOS, string> = {
  RASCUNHO: 'bg-white/5 text-zinc-300 border-white/20 border-dashed',
  AGUARDANDO_AVALIACAO: 'bg-white/10 text-white border-white/25',
  EM_ANALISE: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
  AGUARDANDO_PECA: 'bg-blue-500/5 text-blue-300 border-blue-400/40 border-dashed',
  EM_MANUTENCAO: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
  PRONTO: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  ENTREGUE: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  CANCELADO: 'bg-rose-500/10 text-rose-400 border-rose-500/25',
};

const STATUS_ESCOLHA: StatusOS[] = [
  'AGUARDANDO_AVALIACAO',
  'EM_ANALISE',
  'AGUARDANDO_PECA',
  'EM_MANUTENCAO',
  'PRONTO',
  'ENTREGUE',
  'CANCELADO',
];

const ETAPAS = ['Entrada', 'Orçamento', 'Em manutenção', 'Pronto p/ retirada', 'Entregue'];

/** Etapa atual (0 a 4). Entregue = todas concluídas. */
const etapaDoStatus = (s: StatusOS): number =>
  ({ RASCUNHO: 0, AGUARDANDO_AVALIACAO: 1, EM_ANALISE: 1, AGUARDANDO_PECA: 2, EM_MANUTENCAO: 2, PRONTO: 3, ENTREGUE: 5 } as Record<string, number>)[s] ?? 0;

/** Botão principal: leva a OS para a próxima etapa. */
const PROXIMO_PASSO: Partial<Record<StatusOS, { status: StatusOS; rotulo: string }>> = {
  AGUARDANDO_AVALIACAO: { status: 'EM_ANALISE', rotulo: 'Iniciar análise' },
  EM_ANALISE: { status: 'EM_MANUTENCAO', rotulo: 'Iniciar manutenção' },
  AGUARDANDO_PECA: { status: 'EM_MANUTENCAO', rotulo: 'Peça chegou' },
  EM_MANUTENCAO: { status: 'PRONTO', rotulo: 'Marcar como pronto' },
  PRONTO: { status: 'ENTREGUE', rotulo: 'Marcar como entregue' },
};

/** Mensagem de WhatsApp sugerida em cada status (e se é para a etapa atual ou a próxima). */
const MENSAGEM_SUGERIDA: Partial<Record<StatusOS, { chave: ChaveMensagem; proxima: boolean }>> = {
  AGUARDANDO_AVALIACAO: { chave: 'entrada', proxima: false },
  EM_ANALISE: { chave: 'orcamento', proxima: false },
  AGUARDANDO_PECA: { chave: 'pronto', proxima: true },
  EM_MANUTENCAO: { chave: 'pronto', proxima: true },
  PRONTO: { chave: 'pronto', proxima: false },
};

// ================= PEÇAS DE INTERFACE =================

/** true em telas largas (layout com coluna lateral). */
function useTelaLarga() {
  const consulta = '(min-width: 1024px)';
  const [larga, setLarga] = useState(() => typeof window !== 'undefined' && window.matchMedia(consulta).matches);
  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const aoMudar = () => setLarga(mq.matches);
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, []);
  return larga;
}

const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <section className={`p-5 bg-[#0c101a] border border-zinc-800/80 rounded-2xl ${className}`}>{children}</section>
);

const TituloCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 className="text-sm font-bold text-white">{children}</h4>
);

const Rotulo: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="block text-[11px] text-zinc-500 mb-1">{children}</span>
);

/** Botão pontilhado para completar um dado que falta ("+ Adicionar"). */
const BotaoCompletar: React.FC<{ onClick: () => void; children: React.ReactNode; largo?: boolean }> = ({ onClick, children, largo }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center justify-center gap-1 border border-dashed border-zinc-700 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition ${
      largo ? 'w-full h-11 text-xs' : 'h-7 px-2.5 text-[11px]'
    }`}
  >
    <Plus className={largo ? 'w-3.5 h-3.5' : 'w-3 h-3'} /> {children}
  </button>
);

/** Linha "rótulo ........ valor" dos cards de cliente, aparelho, valores e prazos. */
const Linha: React.FC<{ rotulo: string; children: React.ReactNode }> = ({ rotulo, children }) => (
  <div className="flex items-center justify-between gap-3 min-h-[28px]">
    <span className="text-[13px] text-zinc-400">{rotulo}</span>
    <div className="text-[13px] text-right text-zinc-100 font-semibold min-w-0 break-words">{children}</div>
  </div>
);

const Avatar: React.FC<{ nome?: string; pequeno?: boolean }> = ({ nome, pequeno }) => {
  const iniciais = (nome || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 rounded-full bg-blue-500/15 text-blue-300 font-bold ${
        pequeno ? 'w-7 h-7 text-[10px]' : 'w-10 h-10 text-sm'
      }`}
    >
      {iniciais || '?'}
    </span>
  );
};

const dataBR = (v?: string | null) => formatarDataOS(v) || '';

/** Data da garantia: conclusão + prazo em dias. */
const fimGarantia = (os: OrdemServico): string => {
  const dias = Number(os.prazoGarantiaDias || 0);
  const dia = diaLocalDaData(os.data_conclusao);
  if (!dias || !dia || os.possuiGarantia === false) return '';
  const d = new Date(`${dia}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString('pt-BR');
};

// ================= TELA =================

export const DetalhesOS: React.FC<Props> = ({
  os,
  veCustos,
  podeImprimir,
  versaoFotos,
  onFechar,
  onEditar,
  onImprimir,
  onExcluir,
  onAlterarStatus,
  onDefinirPrevisao,
  onAvaliacaoRegistrada,
}) => {
  const larga = useTelaLarga();
  const [aba, setAba] = useState<'resumo' | 'checklist' | 'historico'>('resumo');
  const [menuAberto, setMenuAberto] = useState(false);
  const [alterando, setAlterando] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [qtdFotos, setQtdFotos] = useState<number | null>(null);
  const [aviso, setAviso] = useState('');
  const [editandoPrevisao, setEditandoPrevisao] = useState(false);
  const [previsao, setPrevisao] = useState('');
  const mensagensRef = useRef<HTMLDivElement>(null);
  const corpoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ativo = true;
    setQtdFotos(null);
    listarFotosOS(os.id_os)
      .then((f) => ativo && setQtdFotos(f.length))
      .catch(() => ativo && setQtdFotos(null));
    return () => {
      ativo = false;
    };
  }, [os.id_os, versaoFotos]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(''), 3500);
    return () => clearTimeout(t);
  }, [aviso]);

  const status = os.status_os;
  const cancelada = status === 'CANCELADO';
  const etapa = etapaDoStatus(status);
  const proximo = PROXIMO_PASSO[status];
  const legal = lerDadosLegaisOS(os.checklistEntrada || {});
  const ck = os.checklistEntrada || {};
  const tecnico = ck.__tecnicoNome ? String(ck.__tecnicoNome) : '';
  const servicoNome = ck.__servicoNome ? String(ck.__servicoNome) : '';

  const orc = os.orcamentoCalculado;
  const total = Number(orc?.valorTotalOrcamento || 0);
  const desconto = Number(orc?.descontoGeralAplicado || 0);
  const liquido = Number(os.valorLiquido ?? total);
  const custoPeca = Number(orc?.custoPeca || 0);
  const frete = Number(orc?.freteReal || 0);
  const maquininhas = [...new Set((os.pagamentos || []).map((p) => p.maquininha).filter(Boolean))];
  const forma = os.formaPagamento || 'PIX';
  const formaTexto = forma === 'Cartão de crédito' && Number(os.parcelas || 1) > 1 ? `${forma} (${os.parcelas}x)` : forma;

  const itens = itensVisiveisChecklist(os.checklistEntrada);
  const defeitos = itens.filter(([, s]) => s === 'DEFEITO');
  const comObs = itens.filter(([, s]) => s !== 'DEFEITO' && s !== 'OK');
  const qtdOk = itens.filter(([, s]) => s === 'OK').length;

  const temWhatsapp = !!os.cliente?.whatsapp;
  const mensagensLiberadas = temWhatsapp && podeEnviarMensagem(os);
  const sugerida = MENSAGEM_SUGERIDA[status];
  const rotuloMensagem = (chave: ChaveMensagem) => MODELOS_WHATSAPP.find((m) => m.chave === chave)?.rotulo || chave;
  const telefone = (os.cliente?.whatsapp || '').replace(/\D/g, '');

  const ultimoRetorno = os.garantia?.listaRetornos?.at(-1);
  const dataUltimoRetorno = ultimoRetorno?.dataRetorno || ultimoRetorno?.dataAcionamento;

  const subtitulo = [os.cliente?.nome, servicoNome || os.diagnostico].filter(Boolean).join(' · ');
  const previsaoAtual = diaLocalDaData(os.data_prevista_entrega || ck.__dataPrevistaEntrega);
  const garantiaAte = status === 'ENTREGUE' ? fimGarantia(os) : '';

  const alterarStatus = async (novo: StatusOS) => {
    if (novo === status || alterando) return;
    setMenuAberto(false);
    setAlterando(true);
    try {
      await onAlterarStatus(novo);
    } finally {
      setAlterando(false);
    }
  };

  const salvarPrevisao = async (valor: string) => {
    setAlterando(true);
    try {
      await onDefinirPrevisao(valor);
      setEditandoPrevisao(false);
    } finally {
      setAlterando(false);
    }
  };

  const copiarLink = async () => {
    try {
      const link = await gerarLinkAcompanhamento(os.id_os);
      try {
        await navigator.clipboard.writeText(link);
        setAviso('Link do cliente copiado.');
      } catch {
        setAviso('Não deu para copiar aqui. Use "Copiar link" no card Acompanhamento online.');
      }
    } catch (e: any) {
      setAviso(e.message || 'Não foi possível gerar o link.');
    }
  };

  const enviarSugerida = () => {
    if (!mensagensLiberadas) {
      setAviso(!temWhatsapp ? 'Cadastre o WhatsApp do cliente (Editar) para enviar mensagens.' : 'OS entregue: as mensagens só podem ser enviadas antes da entrega.');
      return;
    }
    if (sugerida) enviarMensagemWhatsapp(os, sugerida.chave);
    else mensagensRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ---------- Partes ----------

  const seletorStatus = (
    <label
      className={`relative inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2 rounded-full border text-xs font-semibold whitespace-nowrap ${COR_STATUS[status] || COR_STATUS.RASCUNHO} ${
        alterando ? 'opacity-60' : 'hover:brightness-125 cursor-pointer'
      } transition`}
      title="Alterar status"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {ROTULO_STATUS[status] || status}
      <ChevronDown className="w-3.5 h-3.5 opacity-80" />
      <select
        value={status}
        disabled={alterando}
        onChange={(e) => alterarStatus(e.target.value as StatusOS)}
        aria-label="Alterar status da OS"
        className="absolute inset-0 w-full opacity-0 cursor-pointer disabled:cursor-wait"
      >
        {status === 'RASCUNHO' && <option value="RASCUNHO">Rascunho</option>}
        {STATUS_ESCOLHA.map((s) => (
          <option key={s} value={s} className="bg-zinc-900 text-white">
            {ROTULO_STATUS[s]}
          </option>
        ))}
      </select>
    </label>
  );

  const menuMais = (icone: React.ReactNode, classe: string) => (
    <div className="relative">
      <button type="button" onClick={() => setMenuAberto((v) => !v)} aria-label="Mais ações" className={classe}>
        {icone}
      </button>
      {menuAberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuAberto(false)} />
          <div className="absolute right-0 top-full mt-2 z-20 w-56 p-1.5 bg-[#0d131f] border border-zinc-800 rounded-xl shadow-2xl text-sm">
            {!larga && podeImprimir && (
              <button type="button" onClick={() => { setMenuAberto(false); onImprimir(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-200 hover:bg-zinc-800">
                <Printer className="w-4 h-4" /> Imprimir / PDF
              </button>
            )}
            {!cancelada && status !== 'ENTREGUE' && (
              <button type="button" onClick={() => alterarStatus('CANCELADO')} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-zinc-200 hover:bg-zinc-800">
                <X className="w-4 h-4" /> Cancelar OS
              </button>
            )}
            <button type="button" onClick={() => { setMenuAberto(false); onExcluir(); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-rose-400 hover:bg-rose-500/10">
              <Trash2 className="w-4 h-4" /> Excluir OS
            </button>
          </div>
        </>
      )}
    </div>
  );

  const botaoProximo = (classeExtra = '') =>
    proximo ? (
      <button
        type="button"
        onClick={() => alterarStatus(proximo.status)}
        disabled={alterando}
        className={`inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 font-bold rounded-xl transition ${classeExtra}`}
      >
        <Check className="w-4 h-4" /> {alterando ? 'Salvando…' : proximo.rotulo}
      </button>
    ) : null;

  const cabecalhoLargo = (
    <div className="px-8 pt-6 pb-5">
      <button type="button" onClick={onFechar} className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition">
        <ChevronLeft className="w-3.5 h-3.5" /> Ordens de serviço <span className="text-zinc-600 mx-1">/</span>
        <span className="font-mono font-bold text-zinc-200">{os.numero_os}</span>
      </button>
      <div className="mt-4 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 rounded-md bg-blue-500/10 border border-blue-500/25 font-mono text-xs font-bold text-blue-400">#{os.numero_os}</span>
            {seletorStatus}
          </div>
          <h2 className="mt-2 text-3xl font-black text-white tracking-tight truncate">{os.aparelho?.modelo || 'Aparelho'}</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {[subtitulo, os.data_abertura ? `aberta em ${dataBR(os.data_abertura)}` : ''].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => onEditar()} className="inline-flex items-center gap-2 h-11 px-4 bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-sm font-semibold text-zinc-100 transition">
            <Pencil className="w-4 h-4" /> Editar
          </button>
          {podeImprimir && (
            <button type="button" onClick={onImprimir} className="inline-flex items-center gap-2 h-11 px-4 bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-sm font-semibold text-zinc-100 transition">
              <Printer className="w-4 h-4" /> Imprimir / PDF
            </button>
          )}
          {menuMais(<MoreHorizontal className="w-4 h-4" />, 'inline-flex items-center justify-center w-11 h-11 bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-zinc-200 transition')}
          {botaoProximo('h-11 px-5 text-sm')}
          <button type="button" onClick={onFechar} aria-label="Fechar" title="Fechar (Esc)" className="ml-1 w-9 h-9 inline-flex items-center justify-center rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );

  const etapasLargas = cancelada ? null : (
    <Card className="!py-4">
      <ol className="grid grid-cols-5">
        {ETAPAS.map((nome, i) => {
          const feita = i < etapa;
          const atual = i === etapa;
          const detalhe =
            i === 0
              ? dataBR(os.data_abertura) || '—'
              : i === 1
                ? atual
                  ? ROTULO_STATUS[status]
                  : legal.orcamentoAprovadoEm
                    ? `R$ ${formatarValor(total)} · aprovado`
                    : `R$ ${formatarValor(total)}`
                : i === 2
                  ? atual
                    ? status === 'AGUARDANDO_PECA' ? 'Aguardando peça' : 'Etapa atual'
                    : '—'
                  : i === 3
                    ? ck.__dataPronto ? dataBR(ck.__dataPronto) : atual ? 'Etapa atual' : '—'
                    : feita
                      ? dataBR(os.data_conclusao) || 'Concluída'
                      : 'Garantia começa aqui';
          return (
            <li key={nome} className="min-w-0">
              <div className="flex items-center">
                <span
                  className={`w-6 h-6 shrink-0 rounded-full inline-flex items-center justify-center ${
                    feita ? 'bg-blue-600' : atual ? 'border-2 border-blue-400' : 'border-2 border-zinc-700'
                  }`}
                >
                  {feita ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : atual ? <span className="w-2 h-2 rounded-full bg-blue-400" /> : null}
                </span>
                {i < ETAPAS.length - 1 && <span className={`h-0.5 flex-1 mx-2 rounded ${i < etapa ? 'bg-blue-500' : 'bg-zinc-800'}`} />}
              </div>
              <p className={`mt-2 text-xs font-bold ${atual ? 'text-blue-400' : feita ? 'text-zinc-100' : 'text-zinc-400'}`}>{atual && i === 2 ? ROTULO_STATUS[status] : nome}</p>
              <p className="text-[11px] text-zinc-500 truncate pr-2">{detalhe}</p>
            </li>
          );
        })}
      </ol>
    </Card>
  );

  const cabecalhoCompacto = (
    <>
      <div className="sticky top-0 z-10 flex items-center justify-between h-14 px-2 bg-[#080c14] border-b border-zinc-800/80">
        <button type="button" onClick={onFechar} aria-label="Voltar" className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-zinc-200 hover:bg-zinc-800">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="font-mono text-sm font-bold text-zinc-100">{os.numero_os}</span>
        {menuMais(<MoreVertical className="w-5 h-5" />, 'w-10 h-10 inline-flex items-center justify-center rounded-lg text-zinc-200 hover:bg-zinc-800')}
      </div>
      <div className="px-4 pt-4 space-y-3">
        {seletorStatus}
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">{os.aparelho?.modelo || 'Aparelho'}</h2>
          {subtitulo && <p className="mt-0.5 text-sm text-zinc-400">{subtitulo}</p>}
        </div>
        {!cancelada && (
          <div>
            <div className="grid grid-cols-5 gap-1.5">
              {ETAPAS.map((nome, i) => (
                <span key={nome} className={`h-1 rounded-full ${i < etapa ? 'bg-blue-500' : i === etapa ? 'bg-blue-400' : 'bg-zinc-800'}`} />
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-zinc-500">
              <span>{etapa >= ETAPAS.length ? 'Concluída' : `Etapa ${etapa + 1} de ${ETAPAS.length}`}</span>
              {etapa + 1 < ETAPAS.length && <span>Próxima: {ETAPAS[etapa + 1]}</span>}
            </div>
          </div>
        )}
        <div className="grid grid-cols-4 gap-2">
          {[
            { rotulo: 'WhatsApp', icone: <MessageCircle className="w-5 h-5" />, acao: () => mensagensRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), destaque: true },
            { rotulo: 'Link', icone: <Link2 className="w-5 h-5" />, acao: copiarLink, oculto: status === 'RASCUNHO' },
            { rotulo: 'PDF', icone: <Download className="w-5 h-5" />, acao: onImprimir, oculto: !podeImprimir },
            { rotulo: 'Editar', icone: <Pencil className="w-5 h-5" />, acao: () => onEditar() },
          ]
            .filter((b) => !b.oculto)
            .map((b) => (
              <button
                key={b.rotulo}
                type="button"
                onClick={b.acao}
                className={`flex flex-col items-center justify-center gap-1.5 h-16 rounded-xl border text-xs font-semibold transition ${
                  b.destaque ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/15' : 'bg-[#0c101a] border-zinc-800/80 text-zinc-100 hover:bg-zinc-800'
                }`}
              >
                {b.icone}
                {b.rotulo}
              </button>
            ))}
        </div>
      </div>
    </>
  );

  const abas = (
    <div className={larga ? 'flex gap-1 border-b border-zinc-800' : 'grid grid-cols-3 gap-1 p-1 bg-[#0c101a] border border-zinc-800/80 rounded-xl'}>
      {([
        ['resumo', 'Resumo'],
        ['checklist', 'Checklist e fotos'],
        ['historico', 'Histórico'],
      ] as const).map(([chave, rotulo]) => {
        const ativa = aba === chave;
        const contador =
          chave === 'checklist' && defeitos.length > 0 ? (
            <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 text-[10px] font-bold">
              {larga ? `${defeitos.length} ${defeitos.length === 1 ? 'defeito' : 'defeitos'}` : defeitos.length}
            </span>
          ) : null;
        return (
          <button
            key={chave}
            type="button"
            onClick={() => setAba(chave)}
            className={
              larga
                ? `inline-flex items-center px-3.5 py-3 -mb-px text-sm font-semibold border-b-2 transition ${ativa ? 'border-blue-500 text-white' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`
                : `inline-flex items-center justify-center h-10 rounded-lg text-[13px] font-semibold transition ${ativa ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`
            }
          >
            {!larga && chave === 'checklist' ? 'Checklist' : rotulo}
            {contador}
          </button>
        );
      })}
    </div>
  );

  const cardValor = (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-xs text-zinc-400">Valor total cobrado</span>
          <p className="mt-1 text-3xl font-black text-white tracking-tight">R$ {formatarValor(total)}</p>
        </div>
        {!larga && <span className="mt-6 px-2.5 py-1 rounded-lg bg-zinc-800 text-[11px] font-bold text-zinc-100">{formaTexto}</span>}
      </div>
      <div className="mt-4 pt-3 border-t border-zinc-800/80 space-y-1.5">
        {larga && <Linha rotulo="Forma de pagamento">{formaTexto}</Linha>}
        {maquininhas.length > 0 && <Linha rotulo="Maquininha">{maquininhas.join(', ')}</Linha>}
        {desconto > 0 && <Linha rotulo="Desconto">− R$ {formatarValor(desconto)}</Linha>}
        {veCustos && (
          <Linha rotulo="Custo das peças">
            {custoPeca > 0 ? `R$ ${formatarValor(custoPeca)}` : <BotaoCompletar onClick={() => onEditar('financeiro')}>Informar</BotaoCompletar>}
          </Linha>
        )}
        {veCustos && frete > 0 && <Linha rotulo="Frete">R$ {formatarValor(frete)}</Linha>}
        <Linha rotulo="Valor líquido (caixa)">
          <span className="text-blue-400">R$ {formatarValor(liquido)}</span>
        </Linha>
      </div>
    </Card>
  );

  const cardRetorno = os.garantia ? (
    <div className="p-4 bg-rose-500/10 border border-rose-500/25 rounded-2xl space-y-1">
      <p className="flex items-center gap-2 text-sm font-bold text-rose-400">
        <RotateCcw className="w-4 h-4 shrink-0" /> Retorno em garantia acionado
      </p>
      <p className="text-xs text-zinc-300">
        <strong>Data:</strong> {dataUltimoRetorno ? new Date(dataUltimoRetorno).toLocaleDateString('pt-BR') : 'Não informada'}
        {' · '}
        <strong>Motivo:</strong> {ultimoRetorno?.defeitoConstatadoGarantia || ultimoRetorno?.motivoRetorno || 'Não especificado'}
      </p>
      {Number(os.garantia.custoPecaGarantia || 0) > 0 && (
        <p className="text-xs text-rose-300 font-semibold">
          Custo extra da peça: R$ {formatarValor(Number(os.garantia.custoPecaGarantia))} (abatido do lucro)
        </p>
      )}
    </div>
  ) : null;

  const cardCancelada = cancelada ? (
    <div className="p-4 bg-rose-500/10 border border-rose-500/25 rounded-2xl text-sm text-rose-400 font-semibold">
      Esta OS foi cancelada. Para retomar, escolha outro status no seletor acima.
    </div>
  ) : null;

  const campoTexto = (rotulo: string, valor: string | undefined, vazio: React.ReactNode) => (
    <div>
      <Rotulo>{rotulo}</Rotulo>
      {valor ? <p className="text-sm text-zinc-100 whitespace-pre-line">{valor}</p> : vazio}
    </div>
  );

  const cardProblema = (
    <Card>
      <TituloCard>Problema e serviço</TituloCard>
      <div className={`mt-4 grid gap-x-8 gap-y-4 ${larga ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {campoTexto('Defeito relatado pelo cliente', os.defeitoRelatado, <p className="text-sm text-zinc-500">Não informado</p>)}
        {campoTexto('Diagnóstico técnico', os.diagnostico, <BotaoCompletar onClick={() => onEditar('geral')}>Adicionar diagnóstico</BotaoCompletar>)}
        <div>
          <Rotulo>Técnico responsável</Rotulo>
          {tecnico ? (
            <span className="inline-flex items-center gap-2 text-sm text-zinc-100">
              <Avatar nome={tecnico} pequeno /> {tecnico}
            </span>
          ) : (
            <BotaoCompletar onClick={() => onEditar('geral')}>Definir técnico</BotaoCompletar>
          )}
        </div>
        {campoTexto(
          'Serviço realizado',
          os.servicoRealizado,
          <BotaoCompletar onClick={() => onEditar('geral')} largo={!larga}>Descrever ao concluir o reparo</BotaoCompletar>,
        )}
        {os.pecasUtilizadas && campoTexto('Peças utilizadas', os.pecasUtilizadas, null)}
      </div>
      {os.observacoes && (
        <div className="mt-4 pt-4 border-t border-zinc-800/80 flex items-start gap-3">
          <span className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-lg bg-zinc-800 text-zinc-400">
            <Lock className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0">
            <Rotulo>Observações internas · só a equipe vê</Rotulo>
            <p className="text-sm text-zinc-100 whitespace-pre-line">{os.observacoes}</p>
          </div>
        </div>
      )}
    </Card>
  );

  const cardCliente = (
    <Card>
      <div className="flex items-center gap-3">
        <Avatar nome={os.cliente?.nome} />
        <div className="min-w-0 flex-1">
          <span className="text-[11px] text-zinc-500">Cliente</span>
          <p className="text-base font-bold text-white truncate">{os.cliente?.nome || 'Sem nome'}</p>
        </div>
        {telefone && (
          <a href={`tel:${telefone}`} aria-label="Ligar para o cliente" title="Ligar" className="w-11 h-11 inline-flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50 text-zinc-200 hover:bg-zinc-800 transition">
            <Phone className="w-4 h-4" />
          </a>
        )}
      </div>
      <div className="mt-4 space-y-1.5">
        <Linha rotulo="WhatsApp">{os.cliente?.whatsapp || <BotaoCompletar onClick={() => onEditar('geral')}>Adicionar</BotaoCompletar>}</Linha>
        <Linha rotulo="CPF/CNPJ">{os.cliente?.cpfCnpj || <BotaoCompletar onClick={() => onEditar('geral')}>Adicionar</BotaoCompletar>}</Linha>
      </div>
    </Card>
  );

  const senha = os.aparelho?.senhaDesbloqueio;
  const cardAparelho = (
    <Card>
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 shrink-0 inline-flex items-center justify-center rounded-xl bg-zinc-800 text-zinc-300">
          <Smartphone className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <span className="text-[11px] text-zinc-500">Aparelho</span>
          <p className="text-base font-bold text-white truncate">{os.aparelho?.modelo || 'Não informado'}</p>
        </div>
      </div>
      <div className="mt-4 space-y-1.5">
        <Linha rotulo="IMEI / Nº de série">{os.aparelho?.imei1 || <BotaoCompletar onClick={() => onEditar('geral')}>Adicionar</BotaoCompletar>}</Linha>
        <Linha rotulo="Senha / padrão">
          {senha ? (
            <span className="inline-flex items-center gap-2">
              <span className="font-mono">{mostrarSenha ? senha : '••••••'}</span>
              <button type="button" onClick={() => setMostrarSenha((v) => !v)} aria-label={mostrarSenha ? 'Esconder senha' : 'Mostrar senha'} className="text-zinc-400 hover:text-white">
                {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </span>
          ) : status === 'ENTREGUE' || cancelada ? (
            <span className="text-zinc-500 font-normal">{cancelada ? 'Apagada no cancelamento' : 'Apagada na entrega'}</span>
          ) : (
            <BotaoCompletar onClick={() => onEditar('geral')}>Adicionar</BotaoCompletar>
          )}
        </Linha>
      </div>
    </Card>
  );

  const cardChecklist = (
    <Card className="!p-4">
      <button type="button" onClick={() => setAba('checklist')} className="w-full flex items-center gap-4 text-left group">
        <span className="w-14 h-14 lg:w-16 lg:h-16 shrink-0 inline-flex items-center justify-center rounded-xl bg-zinc-800/50 border border-zinc-800 text-zinc-400">
          <Camera className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">Checklist de entrada</p>
          {itens.length === 0 ? (
            <p className="mt-1 text-xs text-zinc-500">Sem checklist registrado{qtdFotos ? ` · ${qtdFotos} ${qtdFotos === 1 ? 'foto' : 'fotos'}` : ''}</p>
          ) : (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              {defeitos.map(([item]) => (
                <span key={item} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 font-semibold">
                  <X className="w-3 h-3" /> {rotuloItemChecklist(item)}
                </span>
              ))}
              {comObs.length > 0 && <span className="text-blue-300">{comObs.length} com observação ·</span>}
              <span className="text-zinc-400">
                {qtdOk} {qtdOk === 1 ? 'item OK' : 'itens OK'}
                {qtdFotos ? ` · ${qtdFotos} ${qtdFotos === 1 ? 'foto' : 'fotos'}` : ''}
              </span>
            </div>
          )}
        </div>
        {larga ? (
          <span className="px-3.5 h-9 inline-flex items-center rounded-lg border border-zinc-800 bg-zinc-900/50 text-xs font-semibold text-zinc-100 group-hover:bg-zinc-800 transition">Ver checklist completo</span>
        ) : (
          <ChevronRight className="w-5 h-5 text-zinc-500" />
        )}
      </button>
    </Card>
  );

  const cardMensagens = (
    <div ref={mensagensRef} className="p-5 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl scroll-mt-16">
      <TituloCard>Avisar o cliente</TituloCard>
      <p className="mt-1 text-xs text-zinc-400">
        {!podeEnviarMensagem(os)
          ? 'OS entregue: as mensagens só podem ser enviadas antes da entrega.'
          : temWhatsapp
            ? `Abre o WhatsApp de ${os.cliente?.nome?.split(' ')[0] || 'cliente'} com o texto pronto. Você revisa e envia.`
            : 'Cadastre o WhatsApp do cliente para usar as mensagens.'}
      </p>
      {!temWhatsapp && podeEnviarMensagem(os) && (
        <div className="mt-3">
          <BotaoCompletar onClick={() => onEditar('geral')}>Adicionar WhatsApp</BotaoCompletar>
        </div>
      )}
      {mensagensLiberadas && (
        <>
          {sugerida && (
            <>
              <p className="mt-4 text-[11px] font-bold text-emerald-400">{sugerida.proxima ? 'Sugerida para a próxima etapa' : 'Sugerida para esta etapa'}</p>
              <button
                type="button"
                onClick={() => enviarMensagemWhatsapp(os, sugerida.chave)}
                className="mt-2 w-full h-11 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-sm font-bold rounded-xl transition"
              >
                <MessageCircle className="w-4 h-4" /> {rotuloMensagem(sugerida.chave)}
              </button>
            </>
          )}
          <p className="mt-4 text-[11px] text-zinc-500">{sugerida ? 'Outras mensagens' : 'Mensagens prontas'}</p>
          <div className={`mt-2 ${larga ? 'flex flex-wrap gap-2' : 'grid gap-2'}`}>
            {MODELOS_WHATSAPP.filter((m) => m.chave !== sugerida?.chave).map((m) => (
              <button
                key={m.chave}
                type="button"
                onClick={() => enviarMensagemWhatsapp(os, m.chave)}
                className={`px-3 border border-emerald-500/25 hover:bg-emerald-500/10 text-emerald-300 rounded-lg font-semibold transition ${
                  larga ? 'h-9 text-xs' : 'h-11 text-sm text-left'
                }`}
              >
                {m.rotulo}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const cardPrazos = (
    <Card>
      <TituloCard>Prazos</TituloCard>
      <div className="mt-3 space-y-1.5">
        <Linha rotulo="Abertura">{dataBR(os.data_abertura) || '—'}</Linha>
        {status !== 'ENTREGUE' && !cancelada && (
          <Linha rotulo="Previsão de entrega">
            {editandoPrevisao ? (
              <span className="inline-flex items-center gap-1.5">
                <input
                  type="date"
                  value={previsao}
                  autoFocus
                  onChange={(e) => setPrevisao(e.target.value)}
                  className="h-8 px-2 bg-[#080c14] border border-zinc-700 rounded-lg text-xs text-white outline-none focus:border-blue-500 [color-scheme:dark]"
                />
                <button type="button" disabled={alterando} onClick={() => salvarPrevisao(previsao)} aria-label="Salvar previsão" className="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50">
                  <Check className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => setEditandoPrevisao(false)} aria-label="Cancelar" className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800">
                  <X className="w-4 h-4" />
                </button>
              </span>
            ) : previsaoAtual ? (
              <button type="button" onClick={() => { setPrevisao(previsaoAtual); setEditandoPrevisao(true); }} className="inline-flex items-center gap-1.5 hover:text-blue-400 transition" title="Alterar previsão">
                {dataBR(previsaoAtual)} <Pencil className="w-3 h-3 text-zinc-500" />
              </button>
            ) : (
              <BotaoCompletar onClick={() => { setPrevisao(''); setEditandoPrevisao(true); }}>Definir</BotaoCompletar>
            )}
          </Linha>
        )}
        <Linha rotulo="Conclusão">{os.data_conclusao ? dataBR(os.data_conclusao) : <span className="text-zinc-400 font-normal">{cancelada ? '—' : 'Em andamento'}</span>}</Linha>
        {garantiaAte && <Linha rotulo="Garantia até"><span className="text-emerald-400">{garantiaAte}</span></Linha>}
      </div>
    </Card>
  );

  const avaliacao = <PedidoAvaliacaoOS os={os} onRegistrado={onAvaliacaoRegistrada} />;
  const linkCliente = <LinkAcompanhamentoOS key={os.id_os} os={os} />;

  const abaChecklist = (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <TituloCard>Fotos do aparelho</TituloCard>
          <button type="button" onClick={() => onEditar('checklist')} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-xs font-semibold text-zinc-100 transition">
            <Pencil className="w-3.5 h-3.5" /> Editar checklist e fotos
          </button>
        </div>
        <div className="mt-3">
          <GaleriaFotosOS key={`${os.id_os}-${versaoFotos}`} idOs={os.id_os} />
        </div>
      </Card>
      <Card>
        <TituloCard>Checklist de entrada</TituloCard>
        {itens.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Sem checklist registrado.</p>
        ) : (
          <div className={`mt-3 grid gap-2 ${larga ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {[...defeitos, ...comObs, ...itens.filter(([, s]) => s === 'OK')].map(([item, s]) => (
              <div key={item} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl">
                <span className="text-sm text-zinc-200">{rotuloItemChecklist(item)}</span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                    s === 'OK' ? 'bg-emerald-500/10 text-emerald-400' : s === 'DEFEITO' ? 'bg-rose-500/10 text-rose-400' : 'bg-blue-500/10 text-blue-400'
                  }`}
                >
                  {s === 'DEFEITO' ? 'Defeito' : s === 'OK' ? 'OK' : s}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );

  const historico = [...(os.historico || [])].sort((a, b) => String(b.data).localeCompare(String(a.data)));
  const abaHistorico = (
    <Card>
      <TituloCard>Linha do tempo</TituloCard>
      {historico.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">Nenhuma ocorrência registrada.</p>
      ) : (
        <ol className="mt-4 relative border-l border-zinc-800 ml-1.5 space-y-5">
          {historico.map((item) => (
            <li key={item.id} className="pl-5 relative">
              <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500" />
              <p className="text-sm text-zinc-100">{item.descricao}</p>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                {new Date(item.data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {item.autor || 'Sistema'}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );

  const avisoFlutuante = aviso ? (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-24 lg:bottom-8 z-[60] px-4 py-2.5 rounded-xl bg-[#0d131f] border border-zinc-700 text-sm text-zinc-100 shadow-2xl">
      {aviso}
    </div>
  ) : null;

  // ---------- Montagem ----------

  if (larga) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 print:hidden" onClick={onFechar}>
        <div
          ref={corpoRef}
          onClick={(e) => e.stopPropagation()}
          className="bg-[#080c14] border border-zinc-800 rounded-2xl w-full max-w-6xl max-h-[94vh] overflow-y-auto shadow-2xl"
        >
          {cabecalhoLargo}
          <div className="px-8 pb-8 space-y-6">
            {etapasLargas}
            {cardCancelada}
            <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
              <div className="space-y-4 min-w-0">
                {abas}
                {aba === 'resumo' && (
                  <>
                    {cardRetorno}
                    {cardProblema}
                    <div className="grid grid-cols-2 gap-4">
                      {cardCliente}
                      {cardAparelho}
                    </div>
                    {cardChecklist}
                  </>
                )}
                {aba === 'checklist' && abaChecklist}
                {aba === 'historico' && abaHistorico}
              </div>
              <aside className="space-y-4">
                {avaliacao}
                {cardValor}
                {cardMensagens}
                {linkCliente}
                {cardPrazos}
              </aside>
            </div>
          </div>
        </div>
        {avisoFlutuante}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#080c14] flex flex-col print:hidden">
      <div ref={corpoRef} className="flex-1 overflow-y-auto">
        {cabecalhoCompacto}
        <div className="px-4 pt-4 pb-6 space-y-4">
          {abas}
          {cardCancelada}
          {aba === 'resumo' && (
            <>
              {avaliacao}
              {cardRetorno}
              {cardValor}
              {cardProblema}
              {cardChecklist}
              {cardCliente}
              {cardAparelho}
              {cardMensagens}
              {linkCliente}
              {cardPrazos}
            </>
          )}
          {aba === 'checklist' && abaChecklist}
          {aba === 'historico' && abaHistorico}
        </div>
      </div>
      {(proximo || mensagensLiberadas) && (
        <div className="shrink-0 flex gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[#080c14] border-t border-zinc-800/80">
          {mensagensLiberadas && (
            <button
              type="button"
              onClick={enviarSugerida}
              aria-label={sugerida ? `WhatsApp: ${rotuloMensagem(sugerida.chave)}` : 'Abrir mensagens do WhatsApp'}
              className="w-14 h-12 shrink-0 inline-flex items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400"
            >
              <MessageCircle className="w-5 h-5" />
            </button>
          )}
          {botaoProximo('flex-1 h-12 text-sm')}
        </div>
      )}
      {avisoFlutuante}
    </div>
  );
};
