import React from 'react';
import type { StatusOS } from '../types';

interface Props {
  status: StatusOS;
  onChangeStatus?: (novoStatus: StatusOS) => void;
}

const statusMap: Record<string, { label: string; color: string }> = {
  RASCUNHO: { label: 'Rascunho', color: 'bg-amber-500/10 text-amber-300 border-amber-500/30 border-dashed' },
  AGUARDANDO_AVALIACAO: { label: 'Aguardando Avaliação', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  EM_ANALISE: { label: 'Em Análise', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  AGUARDANDO_PECA: { label: 'Aguardando Peça', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  EM_MANUTENCAO: { label: 'Em Manutenção', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  PRONTO: { label: 'Pronto para Retirada', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  ENTREGUE: { label: 'Entregue / Concluído', color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20' },
  CANCELADO: { label: 'Cancelado', color: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
};

export const StatusBadge: React.FC<Props> = ({ status, onChangeStatus }) => {
  const config = statusMap[status] || { label: status, color: 'bg-zinc-800 text-zinc-300 border-zinc-700' };

  if (!onChangeStatus) {
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border whitespace-nowrap ${config.color}`}>
        {config.label}
      </span>
    );
  }

  return (
    <select
      value={status}
      onChange={(e) => onChangeStatus(e.target.value as StatusOS)}
      className={`px-2.5 py-1 rounded-full text-xs font-medium border ${config.color} bg-zinc-900 outline-none cursor-pointer hover:brightness-125 transition`}
    >
      <option value="AGUARDANDO_AVALIACAO" className="bg-zinc-900 text-amber-400">Aguardando Avaliação</option>
      <option value="EM_ANALISE" className="bg-zinc-900 text-blue-400">Em Análise</option>
      <option value="AGUARDANDO_PECA" className="bg-zinc-900 text-purple-400">Aguardando Peça</option>
      <option value="EM_MANUTENCAO" className="bg-zinc-900 text-orange-400">Em Manutenção</option>
      <option value="PRONTO" className="bg-zinc-900 text-emerald-400">Pronto para Retirada</option>
      <option value="ENTREGUE" className="bg-zinc-900 text-zinc-400">Entregue / Concluído</option>
      <option value="CANCELADO" className="bg-zinc-900 text-rose-400">Cancelado</option>
    </select>
  );
};