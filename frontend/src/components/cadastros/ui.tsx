import React, { useEffect, useState, type FormEvent, type ReactNode } from 'react';

// ==========================================
// Kit visual dos submódulos de Cadastro.
// Padrão de cada tela: cabeçalho -> card de formulário (novo/edição) -> listagem com busca e ações.
// Usa as mesmas cores do restante do sistema para que os temas (claro/escuro) se apliquem automaticamente.
// ==========================================

export const inputCls = (erro?: string | null) =>
  `w-full px-3.5 py-2.5 bg-[#080c14] border rounded-xl text-xs text-white outline-none transition placeholder:text-zinc-500 ${
    erro ? 'border-red-500/70 focus:border-red-500' : 'border-zinc-800/80 focus:border-blue-500'
  }`;

export const PaginaCadastro: React.FC<{ titulo: string; descricao: string; acoes?: ReactNode; children: ReactNode }> = ({
  titulo,
  descricao,
  acoes,
  children,
}) => (
  <div className="space-y-6 max-w-[1600px] mx-auto font-sans pb-16">
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">{titulo}</h2>
        <p className="text-xs sm:text-sm text-zinc-400 mt-1">{descricao}</p>
      </div>
      {acoes && <div className="flex flex-wrap gap-2 shrink-0">{acoes}</div>}
    </div>
    {children}
  </div>
);

export const CardFormulario: React.FC<{
  titulo: string;
  subtitulo: string;
  editando: boolean;
  salvando: boolean;
  rotuloSalvar: string;
  onSubmit: () => void;
  onLimpar: () => void;
  children: ReactNode;
}> = ({ titulo, subtitulo, editando, salvando, rotuloSalvar, onSubmit, onLimpar, children }) => (
  <form
    id="form-cadastro"
    noValidate
    onSubmit={(e: FormEvent) => {
      e.preventDefault();
      onSubmit();
    }}
    className={`bg-[#0c101a] border rounded-2xl p-5 sm:p-6 shadow-sm space-y-5 scroll-mt-24 ${
      editando ? 'border-blue-500/50 ring-1 ring-blue-500/20' : 'border-zinc-800/80'
    }`}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center space-x-2.5">
        <div
          className={`w-7 h-7 rounded-lg border flex items-center justify-center text-xs font-bold shrink-0 ${
            editando ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
          }`}
        >
          {editando ? '✎' : '+'}
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">{titulo}</h3>
          <p className="text-xs text-zinc-400 mt-0.5">{subtitulo}</p>
        </div>
      </div>
      {editando && (
        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/25 shrink-0">
          Editando
        </span>
      )}
    </div>

    {children}

    <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-zinc-800/60">
      <p className="text-[11px] text-zinc-500">Campos marcados com * são obrigatórios.</p>
      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={onLimpar}
          className="px-4 py-2.5 text-xs font-semibold text-zinc-400 hover:text-white transition"
        >
          {editando ? 'Cancelar edição' : 'Limpar'}
        </button>
        <button
          type="submit"
          disabled={salvando}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold rounded-xl text-xs transition shadow-md shadow-blue-600/20"
        >
          {salvando ? 'Salvando...' : rotuloSalvar}
        </button>
      </div>
    </div>
  </form>
);

export const Campo: React.FC<{
  label: string;
  obrigatorio?: boolean;
  erro?: string | null;
  dica?: string;
  className?: string;
  children: ReactNode;
}> = ({ label, obrigatorio, erro, dica, className = '', children }) => (
  <div className={className}>
    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
      {label}
      {obrigatorio && <span className="text-blue-400"> *</span>}
    </label>
    {children}
    {erro ? (
      <p className="text-[11px] text-red-400 font-semibold mt-1">{erro}</p>
    ) : (
      dica && <p className="text-[11px] text-zinc-500 mt-1">{dica}</p>
    )}
  </div>
);

export const Secao: React.FC<{ titulo: string; children: ReactNode }> = ({ titulo, children }) => (
  <div className="space-y-3">
    <p className="text-[11px] font-bold text-zinc-500 tracking-wider uppercase">{titulo}</p>
    {children}
  </div>
);

export const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  descricao?: string;
  disabled?: boolean;
}> = ({ checked, onChange, label, descricao, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl border text-left transition ${
      disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-zinc-700'
    } bg-[#080c14] border-zinc-800/80`}
  >
    <div className="min-w-0">
      <p className="text-xs font-semibold text-zinc-200">{label}</p>
      {descricao && <p className="text-[11px] text-zinc-500 mt-0.5">{descricao}</p>}
    </div>
    <span
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition ${checked ? 'bg-blue-600' : 'bg-zinc-600'}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`}
      />
    </span>
  </button>
);

const CORES_BADGE = {
  verde: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  azul: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
  ambar: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
  vermelho: 'bg-red-500/10 text-red-400 border-red-500/25',
  roxo: 'bg-purple-500/10 text-purple-400 border-purple-500/25',
  cinza: 'bg-zinc-800/50 text-zinc-400 border-zinc-700',
};

export const Badge: React.FC<{ cor: keyof typeof CORES_BADGE; children: ReactNode }> = ({ cor, children }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${CORES_BADGE[cor]}`}>
    {children}
  </span>
);

export const ListaCadastro: React.FC<{
  titulo: string;
  total: number;
  busca: string;
  onBusca: (v: string) => void;
  placeholderBusca: string;
  filtros?: ReactNode;
  children: ReactNode;
}> = ({ titulo, total, busca, onBusca, placeholderBusca, filtros, children }) => (
  <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl shadow-sm overflow-hidden">
    <div className="p-4 sm:p-5 border-b border-zinc-800/60 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <h3 className="text-sm font-bold text-white">{titulo}</h3>
        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-zinc-800/80 text-zinc-300">{total}</span>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        {filtros}
        <div className="relative sm:w-72">
          <svg className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="search"
            value={busca}
            onChange={(e) => onBusca(e.target.value)}
            placeholder={placeholderBusca}
            className="w-full pl-9 pr-3 py-2 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition placeholder:text-zinc-500"
          />
        </div>
      </div>
    </div>
    {children}
  </div>
);

export function FiltroSegmentado<T extends string>({
  valor,
  opcoes,
  onChange,
}: {
  valor: T;
  opcoes: { valor: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex bg-[#080c14] border border-zinc-800/80 rounded-xl p-0.5">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onChange(o.valor)}
          className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition ${
            valor === o.valor ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const TabelaCadastro: React.FC<{ colunas: string[]; vazio: boolean; mensagemVazio: string; children: ReactNode }> = ({
  colunas,
  vazio,
  mensagemVazio,
  children,
}) =>
  vazio ? (
    <div className="p-12 text-center">
      <p className="text-xs text-zinc-400">{mensagemVazio}</p>
    </div>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800/60">
            {colunas.map((c, i) => (
              <th
                key={c}
                className={`px-4 sm:px-5 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap ${
                  i === colunas.length - 1 ? 'text-right' : 'text-left'
                }`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/40">{children}</tbody>
      </table>
    </div>
  );

const ICONES = {
  ver: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
  editar: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  excluir: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
};

export const AcoesLinha: React.FC<{ onVer: () => void; onEditar: () => void; onExcluir: () => void }> = ({
  onVer,
  onEditar,
  onExcluir,
}) => (
  <div className="flex items-center justify-end gap-1">
    {(
      [
        ['ver', 'Ver detalhes', onVer, 'hover:text-blue-400'],
        ['editar', 'Editar', onEditar, 'hover:text-amber-400'],
        ['excluir', 'Excluir', onExcluir, 'hover:text-red-400'],
      ] as const
    ).map(([icone, titulo, acao, cor]) => (
      <button
        key={icone}
        type="button"
        title={titulo}
        aria-label={titulo}
        onClick={acao}
        className={`p-2 rounded-lg text-zinc-500 hover:bg-zinc-800/50 transition ${cor}`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d={ICONES[icone]} />
        </svg>
      </button>
    ))}
  </div>
);

export const Modal: React.FC<{ onFechar: () => void; children: ReactNode; largura?: string }> = ({
  onFechar,
  children,
  largura = 'max-w-lg',
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onFechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${largura} bg-[#0c101a] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden`}
      >
        {children}
      </div>
    </div>
  );
};

export const ModalDetalhes: React.FC<{
  titulo: string;
  subtitulo?: ReactNode;
  itens: [string, ReactNode][];
  extra?: ReactNode;
  onFechar: () => void;
  onEditar: () => void;
}> = ({ titulo, subtitulo, itens, extra, onFechar, onEditar }) => (
  <Modal onFechar={onFechar} largura="max-w-2xl">
    <div className="p-5 border-b border-zinc-800/60">
      <h3 className="text-base font-bold text-white">{titulo}</h3>
      {subtitulo && <div className="mt-1.5">{subtitulo}</div>}
    </div>
    <div className="p-5 max-h-[60vh] overflow-y-auto space-y-4">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {itens.map(([label, valor]) => (
          <div key={label} className="p-3 bg-[#080c14] border border-zinc-800/80 rounded-xl min-w-0">
            <dt className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{label}</dt>
            <dd className="text-xs font-semibold text-zinc-200 mt-1 break-words">{valor || '—'}</dd>
          </div>
        ))}
      </dl>
      {extra}
    </div>
    <div className="p-4 border-t border-zinc-800/60 flex justify-end gap-2">
      <button type="button" onClick={onFechar} className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white transition">
        Fechar
      </button>
      <button
        type="button"
        onClick={onEditar}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition"
      >
        Editar
      </button>
    </div>
  </Modal>
);

export const ModalConfirmacao: React.FC<{
  titulo: string;
  mensagem: ReactNode;
  rotuloConfirmar: string;
  carregando: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}> = ({ titulo, mensagem, rotuloConfirmar, carregando, onConfirmar, onCancelar }) => (
  <Modal onFechar={onCancelar}>
    <div className="p-5 space-y-2">
      <h3 className="text-base font-bold text-white">{titulo}</h3>
      <div className="text-xs text-zinc-400 leading-relaxed">{mensagem}</div>
    </div>
    <div className="p-4 border-t border-zinc-800/60 flex justify-end gap-2">
      <button type="button" onClick={onCancelar} className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white transition">
        Cancelar
      </button>
      <button
        type="button"
        onClick={onConfirmar}
        disabled={carregando}
        className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white font-bold rounded-xl text-xs transition"
      >
        {carregando ? 'Excluindo...' : rotuloConfirmar}
      </button>
    </div>
  </Modal>
);

export const AvisoTabelaAusente: React.FC<{ modulo: string }> = ({ modulo }) => (
  <div className="bg-[#0c101a] border border-amber-500/30 rounded-2xl p-6 flex items-start gap-3">
    <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
    <div>
      <p className="text-sm font-bold text-amber-400">O módulo {modulo} ainda não foi ativado no banco de dados</p>
      <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
        As tabelas deste cadastro ainda não existem no Supabase. Execute a migração{' '}
        <code className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-200 text-[11px]">
          supabase/migrations/20261024120000_cadastros_lojas_funcionarios_pagamentos.sql
        </code>{' '}
        no SQL Editor do Supabase e recarregue esta página.
      </p>
    </div>
  </div>
);

export const Carregando: React.FC = () => (
  <div className="flex flex-col items-center justify-center p-16 space-y-3">
    <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
    <p className="text-[11px] text-zinc-400 font-semibold tracking-wider uppercase">Carregando...</p>
  </div>
);

/** Mensagem de sucesso/erro que some sozinha após alguns segundos. */
export function useFeedback() {
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.tipo === 'ok' ? 3500 : 7000);
    return () => clearTimeout(t);
  }, [msg]);

  const Feedback = () =>
    msg ? (
      <div
        role="status"
        className={`px-4 py-3 rounded-xl border text-xs font-semibold ${
          msg.tipo === 'ok'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}
      >
        {msg.tipo === 'ok' ? '✓ ' : ''}
        {msg.texto}
      </div>
    ) : null;

  return {
    sucesso: (texto: string) => setMsg({ tipo: 'ok', texto }),
    erro: (texto: string) => setMsg({ tipo: 'erro', texto }),
    Feedback,
  };
}

/** Rola até o formulário ao entrar em modo de edição. */
export const rolarParaFormulario = () =>
  document.getElementById('form-cadastro')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
