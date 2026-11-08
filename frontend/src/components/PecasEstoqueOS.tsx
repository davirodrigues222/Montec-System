import React, { useMemo, useState } from 'react';
import { AlertTriangle, Minus, Package, Plus, X } from 'lucide-react';
import { type PecaDaOS, type PecaEstoque, custoTotalPecas } from '../services/estoque';
import { formatarValor } from '../utils/formatadores';

// ==========================================
// Peças do estoque usadas na OS (Nova OS e Editar OS). A baixa só acontece ao salvar a OS.
// ==========================================

interface Props {
  /** Catálogo do estoque */
  pecas: PecaEstoque[];
  /** Peças escolhidas para a OS */
  itens: PecaDaOS[];
  onChange: (itens: PecaDaOS[]) => void;
  veCustos: boolean;
  /** Editar OS: peças já baixadas nesta OS (contam como disponíveis para ela) */
  jaBaixadas?: PecaDaOS[];
  /** Estoque ainda não ativado ou falha ao carregar */
  aviso?: string | null;
}

const selectCls =
  'w-full h-10 px-3 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none hover:border-zinc-700 focus:border-blue-500 transition cursor-pointer [color-scheme:dark]';

export const PecasEstoqueOS: React.FC<Props> = ({ pecas, itens, onChange, veCustos, jaBaixadas = [], aviso }) => {
  const [busca, setBusca] = useState('');

  const qtdJaBaixada = (id: string | null) => jaBaixadas.find((p) => p.id_peca === id)?.quantidade || 0;
  const disponivel = (id: string | null) => {
    const peca = pecas.find((p) => p.id_peca === id);
    return peca ? peca.quantidade + qtdJaBaixada(id) : 0;
  };

  const opcoes = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pecas.filter(
      (p) =>
        !itens.some((i) => i.id_peca === p.id_peca) &&
        (!q || [p.nome, p.codigo, p.compatibilidade, p.categoria].some((v) => (v || '').toLowerCase().includes(q)))
    );
  }, [pecas, itens, busca]);

  const adicionar = (id: string) => {
    const peca = pecas.find((p) => p.id_peca === id);
    if (!peca) return;
    onChange([...itens, { id_peca: peca.id_peca, nome_peca: peca.nome, quantidade: 1, custo_unitario: peca.custo_medio }]);
    setBusca('');
  };

  const mudarQuantidade = (id: string | null, qtd: number) =>
    onChange(itens.map((i) => (i.id_peca === id ? { ...i, quantidade: Math.max(1, Math.min(999, qtd)) } : i)));

  const remover = (id: string | null) => onChange(itens.filter((i) => i.id_peca !== id));

  const total = custoTotalPecas(itens);

  if (aviso) {
    return <p className="text-[11px] text-zinc-500">{aviso}</p>;
  }

  return (
    <div className="space-y-3">
      {pecas.length === 0 ? (
        <p className="text-[11px] text-zinc-500">
          Nenhuma peça cadastrada no estoque. Cadastre em <strong className="text-zinc-300">Cadastros › Estoque de peças</strong> para dar baixa automática.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2">
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Filtrar por nome, código, modelo..."
            aria-label="Filtrar peças do estoque"
            className="w-full h-10 px-3 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white placeholder-zinc-600 outline-none hover:border-zinc-700 focus:border-blue-500 transition"
          />
          <select value="" onChange={(e) => e.target.value && adicionar(e.target.value)} aria-label="Adicionar peça do estoque" className={selectCls}>
            <option value="">{opcoes.length ? `+ Adicionar peça (${opcoes.length})` : 'Nenhuma peça encontrada'}</option>
            {opcoes.map((p) => {
              const qtd = p.quantidade + qtdJaBaixada(p.id_peca);
              return (
                <option key={p.id_peca} value={p.id_peca}>
                  {p.nome}
                  {p.compatibilidade ? ` · ${p.compatibilidade}` : ''} — {qtd <= 0 ? 'sem estoque' : `${qtd} em estoque`}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {itens.length > 0 && (
        <ul className="divide-y divide-zinc-800/60 border border-zinc-800/80 rounded-xl overflow-hidden">
          {itens.map((item) => {
            const vinculada = !!item.id_peca && pecas.some((p) => p.id_peca === item.id_peca);
            const disp = disponivel(item.id_peca);
            const falta = vinculada && item.quantidade > disp;
            return (
              <li key={item.id_peca || item.nome_peca} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 bg-[#080c14]/60">
                <Package className="w-4 h-4 text-zinc-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-zinc-200 truncate">{item.nome_peca}</p>
                  <p className={`text-[10px] mt-0.5 ${falta ? 'text-rose-400 font-semibold' : 'text-zinc-500'}`}>
                    {!vinculada
                      ? 'Peça excluída do estoque (fica registrada na OS)'
                      : falta
                      ? `Só ${Math.max(disp, 0)} em estoque: o saldo ficará negativo`
                      : `${disp} disponível(is)`}
                    {veCustos && item.custo_unitario !== null && ` · R$ ${formatarValor(item.custo_unitario)} cada`}
                  </p>
                </div>
                {vinculada ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => mudarQuantidade(item.id_peca, item.quantidade - 1)}
                      disabled={item.quantidade <= 1}
                      aria-label="Diminuir quantidade"
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-800 text-zinc-300 hover:bg-zinc-800 disabled:opacity-40 transition"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={item.quantidade}
                      onChange={(e) => mudarQuantidade(item.id_peca, Number(e.target.value) || 1)}
                      aria-label={`Quantidade de ${item.nome_peca}`}
                      className="w-12 h-8 text-center bg-[#080c14] border border-zinc-800 rounded-lg text-xs text-white outline-none focus:border-blue-500 [color-scheme:dark]"
                    />
                    <button
                      type="button"
                      onClick={() => mudarQuantidade(item.id_peca, item.quantidade + 1)}
                      aria-label="Aumentar quantidade"
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remover(item.id_peca)}
                      aria-label={`Retirar ${item.nome_peca}`}
                      title="Retirar da OS (volta ao estoque ao salvar)"
                      className="w-8 h-8 ml-1 flex items-center justify-center rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs font-semibold text-zinc-400 tabular-nums">{item.quantidade}x</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {itens.some((i) => !!i.id_peca && pecas.some((p) => p.id_peca === i.id_peca) && i.quantidade > disponivel(i.id_peca)) && (
        <p className="flex items-start gap-1.5 text-[11px] text-rose-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Lance a entrada da peça no estoque para corrigir o saldo depois.
        </p>
      )}

      {veCustos && itens.length > 0 && total !== null && (
        <p className="text-[11px] text-zinc-400">
          Custo das peças do estoque: <strong className="text-zinc-200">R$ {formatarValor(total)}</strong> (somado ao custo da OS ao salvar)
        </p>
      )}
    </div>
  );
};
