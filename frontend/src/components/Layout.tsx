import React, { useState, useEffect } from 'react';
import {
  fazerLogout,
  obterConfiguracoesLojaSincrono,
  sincronizarSessaoConfiguracoesLoja,
  aplicarTemaVisualNoDOM,
} from '../services/api';

interface Props {
  children: React.ReactNode;
  activeTab: 'dashboard' | 'relatorios' | 'historico' | 'configuracoes' | 'nova-os' | 'garantia-retorno' | 'cadastros';
  setActiveTab: (tab: 'dashboard' | 'relatorios' | 'historico' | 'configuracoes' | 'nova-os' | 'garantia-retorno' | 'cadastros') => void;
  session?: any;
}

export const Layout: React.FC<Props> = ({ children, activeTab, setActiveTab, session }) => {
  // Controle de abertura do menu lateral no Mobile/Tablet
  const [menuAberto, setMenuAberto] = useState(false);

  // Dados da Assistência Técnica do Cliente (ex: Sampaio Cell)
  const [nomeLoja, setNomeLoja] = useState<string>('Sampaio Cell');
  const [subtitulo, setSubtitulo] = useState<string>('Assistência Técnica');
  const [logoUrl, setLogoUrl] = useState<string>('');

  const userId: string | undefined = session?.user?.id;

  // Lê apenas a configuração da conta ativa (cofre `sig_apple_configs_user_<id>`).
  // Nunca dispara o evento storage_configs_updated, para não entrar em loop com o listener abaixo.
  const carregarConfigs = () => {
    const cfg = obterConfiguracoesLojaSincrono(session?.user);
    setNomeLoja(cfg.nomeLoja || session?.user?.user_metadata?.nome_assistencia || 'Minha Assistência');
    setSubtitulo(cfg.subtitulo || 'Assistência Técnica');
    // Conta sem logo (ou troca de conta): limpa a imagem da sessão anterior
    setLogoUrl(cfg.logoUrl || '');
    aplicarTemaVisualNoDOM(cfg.temaVisual);
  };

  // Ao trocar de conta: zera a identidade visual anterior e sincroniza a configuração da nova conta
  useEffect(() => {
    setLogoUrl('');
    if (userId) {
      sincronizarSessaoConfiguracoesLoja(session.user);
    }
    carregarConfigs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    window.addEventListener('storage_configs_updated', carregarConfigs);
    return () => window.removeEventListener('storage_configs_updated', carregarConfigs);
  }, [session]);

  const handleLogout = async () => {
    try {
      await fazerLogout();
    } catch (err) {
      console.error('Erro ao sair:', err);
    }
  };

  const mudarAba = (aba: typeof activeTab) => {
    setActiveTab(aba);
    setMenuAberto(false);
  };

  const userName = session?.user?.user_metadata?.nome_responsavel || 'Davi Sampaio';
  const userInitials = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n: string) => n[0].toUpperCase())
    .join('') || 'DS';

  const titulosAbas: Record<string, string> = {
    dashboard: 'Painel',
    relatorios: 'Análises e relatórios',
    historico: 'Ordens de serviço',
    'nova-os': 'Nova ordem',
    'garantia-retorno': 'Garantias e retornos',
    cadastros: 'Cadastros',
    configuracoes: 'Configurações',
  };

  return (
    <div className="min-h-screen flex bg-[#070a12] text-zinc-100 font-sans print:bg-white print:text-black overflow-x-hidden">
      {/* ================= BACKDROP OVERLAY PARA MOBILE ================= */}
      {menuAberto && (
        <div
          onClick={() => setMenuAberto(false)}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
          aria-hidden="true"
        />
      )}

      {/* ================= BARRA LATERAL (MONTEC SYSTEM) ================= */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-72 sm:w-80 border-r border-zinc-800/60 bg-[#090d15] flex flex-col justify-between print:hidden transition-transform duration-300 ease-in-out shrink-0 ${
          menuAberto ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="overflow-y-auto flex-1">
          {/* Topo da Sidebar: Plataforma Montec System com a Logo Oficial */}
          <div className="p-5 sm:p-6 border-b border-zinc-800/40 flex items-center justify-between">
            <div className="flex items-center space-x-3.5 min-w-0">
              {/* Logo Oficial Montec System */}
              <div className="relative w-11 h-11 sm:w-12 sm:h-12 rounded-xl overflow-hidden shadow-lg shadow-blue-500/25 shrink-0 border border-blue-500/30 bg-[#0d131f]">
                <img
                  src="/logo-montec.png"
                  alt="Montec System"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                  className="w-full h-full object-cover"
                />
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-[#090d15]" />
              </div>

              <div className="flex-1 min-w-0">
                <h1 className="font-extrabold text-base sm:text-lg truncate tracking-tight text-white leading-tight">
                  Montec System
                </h1>
                <p className="text-xs text-blue-400 truncate mt-0.5 font-semibold">
                  Software de Gestão
                </p>
              </div>
            </div>

            {/* Botão Fechar Menu no Mobile */}
            <button
              onClick={() => setMenuAberto(false)}
              className="lg:hidden p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition"
              aria-label="Fechar menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navegação */}
          <nav className="p-4 space-y-6">
            <div>
              <span className="block px-3 text-xs font-bold text-zinc-400 tracking-wider uppercase mb-2.5">
                OPERAÇÃO
              </span>
              <div className="space-y-1.5">
                <button
                  onClick={() => mudarAba('dashboard')}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    activeTab === 'dashboard'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'text-zinc-300 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center space-x-3.5">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    <span>Painel</span>
                  </div>
                  {activeTab === 'dashboard' && (
                    <span className="w-2 h-2 rounded-full bg-white" />
                  )}
                </button>

                <button
                  onClick={() => mudarAba('relatorios')}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    activeTab === 'relatorios'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'text-zinc-300 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center space-x-3.5">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span>Análises e relatórios</span>
                  </div>
                  {activeTab === 'relatorios' && (
                    <span className="w-2 h-2 rounded-full bg-white" />
                  )}
                </button>

                <button
                  onClick={() => mudarAba('historico')}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    activeTab === 'historico'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'text-zinc-300 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center space-x-3.5">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Ordens de serviço</span>
                  </div>
                  {activeTab === 'historico' && (
                    <span className="w-2 h-2 rounded-full bg-white" />
                  )}
                </button>

                <button
                  onClick={() => mudarAba('nova-os')}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    activeTab === 'nova-os'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'text-zinc-300 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center space-x-3.5">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Nova ordem</span>
                  </div>
                  {activeTab === 'nova-os' && (
                    <span className="w-2 h-2 rounded-full bg-white" />
                  )}
                </button>

                <button
                  onClick={() => mudarAba('garantia-retorno')}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    activeTab === 'garantia-retorno'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'text-zinc-300 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center space-x-3.5">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span>Garantias e retornos</span>
                  </div>
                  {activeTab === 'garantia-retorno' && (
                    <span className="w-2 h-2 rounded-full bg-white" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <span className="block px-3 text-xs font-bold text-zinc-400 tracking-wider uppercase mb-2.5">
                ADMINISTRAÇÃO
              </span>
              <div className="space-y-1.5">
                <button
                  onClick={() => mudarAba('cadastros')}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    activeTab === 'cadastros'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'text-zinc-300 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center space-x-3.5">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                    </svg>
                    <span>Cadastros</span>
                  </div>
                  {activeTab === 'cadastros' && (
                    <span className="w-2 h-2 rounded-full bg-white" />
                  )}
                </button>

                <button
                  onClick={() => mudarAba('configuracoes')}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    activeTab === 'configuracoes'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'text-zinc-300 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center space-x-3.5">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>Configurações</span>
                  </div>
                  {activeTab === 'configuracoes' && (
                    <span className="w-2 h-2 rounded-full bg-white" />
                  )}
                </button>
              </div>
            </div>
          </nav>
        </div>

        {/* Rodapé: Operador Logado */}
        <div className="p-4 border-t border-zinc-800/60 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 overflow-hidden min-w-0">
              <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700/60 flex items-center justify-center text-xs font-extrabold text-white shrink-0 shadow-sm">
                {userInitials}
              </div>
              <div className="truncate min-w-0">
                <p className="text-xs font-bold text-white truncate">{userName}</p>
                <p className="text-[11px] text-zinc-400 truncate">Administrador</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              title="Desconectar do sistema"
              className="p-2 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition shrink-0 ml-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* ================= ÁREA DE CONTEÚDO ================= */}
      <div className="flex-1 flex flex-col min-w-0 w-full overflow-hidden max-w-full">
        {/* Cabeçalho Superior Adaptativo */}
        <header className="h-16 border-b border-zinc-800/60 bg-[#090d15]/90 backdrop-blur-md flex items-center justify-between px-3.5 sm:px-6 lg:px-8 print:hidden shrink-0 z-30 w-full max-w-full">
          <div className="flex items-center space-x-3 min-w-0">
            {/* Botão Hambúrguer no Mobile/Tablet */}
            <button
              onClick={() => setMenuAberto(true)}
              aria-label="Abrir menu lateral"
              className="lg:hidden p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 transition shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Breadcrumb Montec System */}
            <div className="flex items-center space-x-1.5 sm:space-x-2 text-xs text-zinc-400 font-medium truncate">
              <span className="font-bold text-zinc-300 hidden md:inline">Montec System</span>
              <span className="text-zinc-600 hidden md:inline">/</span>
              <span className="font-bold text-white text-xs sm:text-sm truncate">
                {titulosAbas[activeTab] || 'Painel'}
              </span>
            </div>
          </div>

          {/* Topo Direito: Identidade da Assistência Técnica do Cliente */}
          <div className="flex items-center space-x-2 sm:space-x-3 bg-[#0d121c] border border-zinc-800/80 rounded-xl px-2.5 sm:px-3.5 py-1.5 shadow-sm max-w-[170px] sm:max-w-xs shrink-0">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={nomeLoja}
                className="w-7 h-7 sm:w-8 sm:h-8 object-contain rounded-lg bg-zinc-950 p-0.5 sm:p-1 border border-zinc-800 shrink-0"
              />
            ) : (
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-400 font-extrabold text-xs shrink-0">
                {nomeLoja.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="text-left pr-1 min-w-0">
              <div className="flex items-center space-x-1.5">
                <h4 className="text-[11px] sm:text-xs font-bold text-white truncate leading-tight">
                  {nomeLoja}
                </h4>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse" title="Assistência Conectada" />
              </div>
              <p className="text-[9px] sm:text-[10px] text-zinc-400 truncate mt-0.5 font-medium hidden sm:block">
                {subtitulo}
              </p>
            </div>
          </div>
        </header>

        {/* Área Principal com Rolagem Independente */}
        <main className="flex-1 p-3 sm:p-6 lg:p-8 overflow-y-auto overflow-x-hidden print:p-0 min-w-0 w-full max-w-full">
          {children}
        </main>
      </div>
    </div>
  );
};