import React, { useState } from 'react';
import { type Operador, autorizarComoAdministrador } from '../services/acesso';

interface Props {
  /** O que está bloqueado, ex.: "a tela Análises e relatórios". */
  recurso: string;
  /** Chamado com o administrador que autorizou. */
  onAutorizado: (admin: Operador) => void | Promise<void>;
  onVoltar: () => void;
  textoBotao?: string;
  /** 'tela': card na área principal; 'compacta': dentro de um modal. */
  variante?: 'tela' | 'compacta';
}

const IconeEscudo = ({ className }: { className: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
    />
  </svg>
);

/**
 * Pede o ID e a senha de um administrador para liberar ao funcionário atual uma tela ou ação
 * que o perfil dele não permite. Não troca o funcionário nem a sessão da conta.
 */
export const AutorizacaoAdministrativa: React.FC<Props> = ({
  recurso,
  onAutorizado,
  onVoltar,
  textoBotao = 'Liberar acesso',
  variante = 'tela',
}) => {
  const [codigo, setCodigo] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigo.trim() || !senha) {
      setErro('Informe o ID e a senha do administrador.');
      return;
    }
    setVerificando(true);
    setErro(null);
    try {
      const admin = await autorizarComoAdministrador(codigo, senha);
      setSenha('');
      await onAutorizado(admin);
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível verificar a autorização.');
      setSenha('');
    } finally {
      setVerificando(false);
    }
  };

  const campos = (
    <form onSubmit={confirmar} className="space-y-3 text-left" autoComplete="off">
      <div>
        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">ID administrativo</label>
        <input
          value={codigo}
          onChange={(e) => {
            setCodigo(e.target.value);
            setErro(null);
          }}
          name="id-administrativo"
          autoComplete="off"
          autoFocus
          placeholder="Código de acesso do administrador"
          className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white placeholder-zinc-500 outline-none focus:border-blue-500 transition"
        />
      </div>
      <div>
        <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Senha administrativa</label>
        <input
          type="password"
          value={senha}
          onChange={(e) => {
            setSenha(e.target.value);
            setErro(null);
          }}
          name="senha-administrativa"
          autoComplete="off"
          placeholder="Senha do administrador"
          className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white placeholder-zinc-500 outline-none focus:border-blue-500 transition"
        />
      </div>

      {erro && (
        <p role="alert" className="text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          {erro}
        </p>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onVoltar}
          disabled={verificando}
          className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold transition"
        >
          Voltar
        </button>
        <button
          type="submit"
          disabled={verificando}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2"
        >
          {verificando && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
          {verificando ? 'Verificando...' : textoBotao}
        </button>
      </div>
    </form>
  );

  if (variante === 'compacta') {
    return (
      <div className="space-y-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
        <div className="flex items-start gap-2.5">
          <IconeEscudo className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-300">
            Seu perfil não permite {recurso}. Um <strong className="text-white">administrador</strong> precisa autorizar
            com o ID e a senha dele.
          </p>
        </div>
        {campos}
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-6 sm:mt-14 bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-6 sm:p-7 shadow-sm">
      <div className="text-center space-y-3 mb-6">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-400 flex items-center justify-center">
          <IconeEscudo className="w-7 h-7" />
        </div>
        <h2 className="text-base sm:text-lg font-extrabold text-white leading-snug">
          Acesso restrito — autorização administrativa necessária
        </h2>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Seu perfil não tem acesso a {recurso}. Para liberar, um usuário com perfil de{' '}
          <strong className="text-zinc-200">Administrador</strong> deve informar o ID e a senha dele abaixo.
        </p>
      </div>
      {campos}
    </div>
  );
};
