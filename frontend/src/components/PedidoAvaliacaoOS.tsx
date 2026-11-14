import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { obterConfiguracoesLojaSincrono, registrarPedidoAvaliacao } from '../services/api';
import { abrirPedidoAvaliacao, avaliacaoSolicitadaEm, podePedirAvaliacao } from '../utils/whatsapp';
import { formatarDataHora } from '../utils/formatadores';
import type { OrdemServico } from '../types';

// ==========================================
// Pedido de avaliação no Google para a OS entregue (pós-venda).
// Abre o WhatsApp do cliente com a mensagem de Configurações › Avaliações no Google e marca na OS
// que o pedido foi feito ("Avaliação solicitada"), para a equipe não mandar duas vezes sem saber.
// ==========================================

/** Tag "Avaliação solicitada" para listas e detalhes. */
export const TagAvaliacaoSolicitada: React.FC<{ os: OrdemServico }> = ({ os }) => {
  const quando = avaliacaoSolicitadaEm(os);
  if (!quando) return null;
  return (
    <span
      title={`Pedido de avaliação no Google enviado em ${formatarDataHora(quando)}`}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap bg-amber-500/10 text-amber-300 border-amber-500/30"
    >
      <Star className="w-3 h-3" fill="currentColor" /> Avaliação solicitada
    </span>
  );
};

interface Props {
  os: OrdemServico;
  /** Chamado depois de gravar a marca na OS, com a data do pedido (para atualizar a tela). */
  onRegistrado: (idOs: string, quando: string) => void;
}

export const PedidoAvaliacaoOS: React.FC<Props> = ({ os, onRegistrado }) => {
  const [aviso, setAviso] = useState('');
  const [gravando, setGravando] = useState(false);

  if (!podePedirAvaliacao(os)) return null;

  const temLink = !!obterConfiguracoesLojaSincrono().linkAvaliacaoGoogle;
  const temWhatsapp = !!os.cliente?.whatsapp;
  const quando = avaliacaoSolicitadaEm(os);

  const pedir = async () => {
    setAviso('');
    // A conversa abre primeiro (no clique, para o navegador não bloquear); a marca é gravada depois
    if (!abrirPedidoAvaliacao(os)) return;
    setGravando(true);
    try {
      onRegistrado(os.id_os, await registrarPedidoAvaliacao(os.id_os));
    } catch (e: any) {
      setAviso(`O WhatsApp foi aberto, mas não deu para marcar a OS como "Avaliação solicitada": ${e.message}`);
    } finally {
      setGravando(false);
    }
  };

  return (
    <div className="p-3 bg-amber-500/5 border border-amber-500/25 rounded-xl space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-amber-300 uppercase text-[10px] font-bold inline-flex items-center gap-1.5">
          <Star className="w-3.5 h-3.5" fill="currentColor" /> Avaliação no Google
        </span>
        <TagAvaliacaoSolicitada os={os} />
      </div>
      <p className="text-[11px] text-zinc-500">
        {!temLink
          ? 'Cadastre o link de avaliação da loja em Configurações › Avaliações no Google para pedir avaliações.'
          : !temWhatsapp
            ? 'Cadastre o WhatsApp do cliente (Editar OS) para pedir a avaliação.'
            : quando
              ? `Pedido enviado em ${formatarDataHora(quando)}. Se o cliente ainda não avaliou, dá para lembrar de novo.`
              : 'Serviço entregue: peça ao cliente uma avaliação da loja no Google. O WhatsApp abre com a mensagem pronta.'}
      </p>
      {temLink && (
        <button
          type="button"
          onClick={pedir}
          disabled={!temWhatsapp || gravando}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed text-amber-200 border border-amber-500/35 rounded-lg text-[11px] font-bold transition"
        >
          <Star className="w-3.5 h-3.5" fill="currentColor" />
          {quando ? 'Pedir avaliação de novo' : 'Pedir avaliação no WhatsApp'}
        </button>
      )}
      {aviso && <p className="text-[11px] text-rose-400 font-semibold">{aviso}</p>}
    </div>
  );
};
