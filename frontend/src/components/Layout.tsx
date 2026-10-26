import React, { useState, useEffect, useRef } from 'react';
import {
  carregarConfiguracoesLoja,
  obterConfiguracoesLojaSincrono,
  sincronizarSessaoConfiguracoesLoja,
  aplicarTemaVisualNoDOM,
} from '../services/api';
import type { SecaoCadastro, SecaoConfiguracao } from '../types';
import { SECOES_CONFIGURACAO } from '../pages/configuracoes/secoes';
import { useOperador } from '../contexts/OperadorContext';
import { type AbaSistema, PERMISSAO_POR_SECAO, podeAcessar, podeAcessarAba } from '../services/acesso';
import { CARGOS, EVENTO_LOJAS_ATUALIZADAS, type Loja, listarLojas } from '../services/cadastros';

interface Props {
  children: React.ReactNode;
  activeTab: AbaSistema;
  setActiveTab: (tab: AbaSistema) => void;
  session?: any;
  secaoCadastro?: SecaoCadastro;
  setSecaoCadastro?: (secao: SecaoCadastro) => void;
  secaoConfiguracao?: SecaoConfiguracao;
  setSecaoConfiguracao?: (secao: SecaoConfiguracao) => void;
}

interface ItemMenu {
  id: AbaSistema;
  label: string;
  icone: string[]; // caminhos "d" do ícone SVG
}

const ITENS_OPERACAO: ItemMenu[] = [
  { id: 'dashboard', label: 'Painel', icone: ['M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'] },
  { id: 'relatorios', label: 'Análises e relatórios', icone: ['M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'] },
  { id: 'historico', label: 'Ordens de serviço', icone: ['M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'] },
  { id: 'nova-os', label: 'Nova ordem', icone: ['M12 4v16m8-8H4'] },
  { id: 'garantia-retorno', label: 'Garantias e retornos', icone: ['M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'] },
];

const ITEM_CONFIGURACOES: ItemMenu = {
  id: 'configuracoes',
  label: 'Configurações',
  icone: [
    'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
    'M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  ],
};

/** Cadeado discreto nas telas que o perfil do funcionário não permite. */
const IconeCadeado = ({ className = '' }: { className?: string }) => (
  <svg className={`w-3.5 h-3.5 shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-label="Requer autorização">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

// Árvore do menu Cadastros: dois grupos para não virar uma lista longa e sem hierarquia
const GRUPOS_CADASTRO: { titulo: string; itens: { id: SecaoCadastro; label: string; novo?: boolean }[] }[] = [
  {
    titulo: 'Atendimento',
    itens: [
      { id: 'clientes', label: 'Clientes' },
      { id: 'servicos', label: 'Serviços' },
      { id: 'fornecedores', label: 'Fornecedores' },
    ],
  },
  {
    titulo: 'Empresa',
    itens: [
      { id: 'lojas', label: 'Lojas', novo: true },
      { id: 'funcionarios', label: 'Funcionários', novo: true },
      { id: 'formas-pagamento', label: 'Formas de pagamento', novo: true },
    ],
  },
];

export const Layout: React.FC<Props> = ({
  children,
  activeTab,
  setActiveTab,
  session,
  secaoCadastro,
  setSecaoCadastro,
  secaoConfiguracao,
  setSecaoConfiguracao,
}) => {
  // Controle de abertura do menu lateral no Mobile/Tablet
  const [menuAberto, setMenuAberto] = useState(false);

  // Submenu Cadastros: abre sozinho quando a tela ativa é um cadastro
  const [cadastrosExpandido, setCadastrosExpandido] = useState(activeTab === 'cadastros');
  useEffect(() => {
    if (activeTab === 'cadastros') setCadastrosExpandido(true);
  }, [activeTab]);

  const abrirSecaoCadastro = (secao: SecaoCadastro) => {
    setSecaoCadastro?.(secao);
    setActiveTab('cadastros');
    setMenuAberto(false);
  };

  // Submenu Configurações: mesma árvore de Cadastros, abre sozinho quando a tela ativa é uma configuração
  const [configuracoesExpandido, setConfiguracoesExpandido] = useState(activeTab === 'configuracoes');
  useEffect(() => {
    if (activeTab === 'configuracoes') setConfiguracoesExpandido(true);
  }, [activeTab]);

  const abrirSecaoConfiguracao = (secao: SecaoConfiguracao) => {
    setSecaoConfiguracao?.(secao);
    setActiveTab('configuracoes');
    setMenuAberto(false);
  };

  // Identidade da assistência técnica da conta (preenchida por carregarConfigs)
  const [nomeLoja, setNomeLoja] = useState<string>('Minha Assistência');
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
      // Configurações da loja no banco (todos os logins da loja); ao chegar, o evento atualiza o menu
      carregarConfiguracoesLoja().catch(() => {});
    }
    carregarConfigs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    window.addEventListener('storage_configs_updated', carregarConfigs);
    return () => window.removeEventListener('storage_configs_updated', carregarConfigs);
  }, [session]);

  const mudarAba = (aba: typeof activeTab) => {
    setActiveTab(aba);
    setMenuAberto(false);
  };

  // Menu mostra todas as telas; as que o perfil não permite ganham um cadeado e pedem autorização ao abrir
  const { operador, trocarFuncionario, sairDaConta } = useOperador();
  const podeAba = (aba: AbaSistema) => podeAcessarAba(operador, aba);
  const podeSecao = (secao: SecaoCadastro) => podeAcessar(operador, PERMISSAO_POR_SECAO[secao]);

  const renderItemMenu = (item: ItemMenu) => {
    const ativo = activeTab === item.id;
    const bloqueado = !podeAba(item.id);
    return (
      <button
        key={item.id}
        onClick={() => mudarAba(item.id)}
        aria-current={ativo ? 'page' : undefined}
        title={bloqueado ? 'Requer autorização de um administrador' : undefined}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${
          ativo ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'text-zinc-300 hover:text-white hover:bg-zinc-800/50'
        }`}
      >
        <div className="flex items-center space-x-3.5">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            {item.icone.map((d) => (
              <path key={d} strokeLinecap="round" strokeLinejoin="round" d={d} />
            ))}
          </svg>
          <span>{item.label}</span>
        </div>
        {bloqueado ? (
          <IconeCadeado className={ativo ? 'text-white' : 'text-zinc-500'} />
        ) : (
          ativo && <span className="w-2 h-2 rounded-full bg-white" />
        )}
      </button>
    );
  };

  // Loja exibida no cabeçalho: a primeira loja ativa do funcionário; sem vínculo, a loja principal
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [menuPerfilAberto, setMenuPerfilAberto] = useState(false);
  const menuPerfilRef = useRef<HTMLDivElement>(null);
  // Fecha o menu do perfil ao clicar fora dele (em qualquer lugar da página) ou com Esc
  useEffect(() => {
    if (!menuPerfilAberto) return;
    const aoClicar = (e: MouseEvent) => {
      if (!menuPerfilRef.current?.contains(e.target as Node)) setMenuPerfilAberto(false);
    };
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && setMenuPerfilAberto(false);
    document.addEventListener('mousedown', aoClicar);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', aoClicar);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [menuPerfilAberto]);
  useEffect(() => {
    const carregarLojas = () => listarLojas().then(setLojas).catch(() => setLojas([]));
    carregarLojas();
    window.addEventListener(EVENTO_LOJAS_ATUALIZADAS, carregarLojas);
    return () => window.removeEventListener(EVENTO_LOJAS_ATUALIZADAS, carregarLojas);
  }, [session?.user?.id]);

  const lojasAtivas = lojas.filter((l) => l.ativo);
  const lojasDoOperador = lojasAtivas.filter((l) => operador?.lojas.includes(l.id_loja));
  const lojaAtual = lojasDoOperador[0] || lojasAtivas.find((l) => l.principal) || lojasAtivas[0] || null;
  const nomeLojaCabecalho = lojaAtual?.nome || nomeLoja;
  const detalheLojaCabecalho = lojaAtual
    ? [lojaAtual.cidade, lojaAtual.uf].filter(Boolean).join(' - ') || (lojaAtual.principal ? 'Loja principal' : 'Loja')
    : subtitulo;
  const outrasLojas = Math.max(0, lojasDoOperador.length - 1);

  const userName = operador?.nome || session?.user?.user_metadata?.nome_responsavel || 'Usuário';
  const userCargo = operador?.proprietario ? 'Proprietário da conta' : operador ? CARGOS[operador.cargo]?.label : '';
  const userInitials = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n: string) => n[0].toUpperCase())
    .join('') || '?';

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
              <div className="space-y-1.5">{ITENS_OPERACAO.map(renderItemMenu)}</div>
            </div>

            <div>
              <span className="block px-3 text-xs font-bold text-zinc-400 tracking-wider uppercase mb-2.5">
                ADMINISTRAÇÃO
              </span>
              <div className="space-y-1.5">
                {/* Cadastros: item pai expansível (não navega, só abre/fecha a árvore) */}
                <button
                  onClick={() => setCadastrosExpandido((v) => !v)}
                  aria-expanded={cadastrosExpandido}
                  aria-controls="submenu-cadastros"
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    activeTab === 'cadastros'
                      ? 'text-white bg-zinc-800/50'
                      : 'text-zinc-300 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center space-x-3.5">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                    </svg>
                    <span>Cadastros</span>
                  </div>
                  <svg
                    className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${cadastrosExpandido ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {cadastrosExpandido && (
                  <div id="submenu-cadastros" className="ml-6 pl-3 border-l border-zinc-800/80 space-y-3 py-1">
                    {GRUPOS_CADASTRO.map((grupo) => (
                      <div key={grupo.titulo} className="space-y-0.5">
                        <span className="block px-3 pt-1 pb-1 text-[10px] font-bold text-zinc-500 tracking-wider uppercase">
                          {grupo.titulo}
                        </span>
                        {grupo.itens.map((item) => {
                          const ativo = activeTab === 'cadastros' && secaoCadastro === item.id;
                          const bloqueado = !podeSecao(item.id);
                          return (
                            <button
                              key={item.id}
                              onClick={() => abrirSecaoCadastro(item.id)}
                              aria-current={ativo ? 'page' : undefined}
                              title={bloqueado ? 'Requer autorização de um administrador' : undefined}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-semibold transition-all ${
                                ativo
                                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                              }`}
                            >
                              <span>{item.label}</span>
                              {bloqueado ? (
                                <IconeCadeado className={ativo ? 'text-white' : 'text-zinc-500'} />
                              ) : (
                                item.novo &&
                                !ativo && (
                                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                    Novo
                                  </span>
                                )
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}

                {/* Configurações: item pai expansível com as seções como subitens */}
                <button
                  onClick={() => setConfiguracoesExpandido((v) => !v)}
                  aria-expanded={configuracoesExpandido}
                  aria-controls="submenu-configuracoes"
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    activeTab === 'configuracoes'
                      ? 'text-white bg-zinc-800/50'
                      : 'text-zinc-300 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <div className="flex items-center space-x-3.5">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      {ITEM_CONFIGURACOES.icone.map((d) => (
                        <path key={d} strokeLinecap="round" strokeLinejoin="round" d={d} />
                      ))}
                    </svg>
                    <span>{ITEM_CONFIGURACOES.label}</span>
                  </div>
                  <svg
                    className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${configuracoesExpandido ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {configuracoesExpandido && (
                  <div id="submenu-configuracoes" className="ml-6 pl-3 border-l border-zinc-800/80 space-y-0.5 py-1">
                    {SECOES_CONFIGURACAO.filter((item) => item.id !== 'leis').map((item) => {
                      const ativo = activeTab === 'configuracoes' && secaoConfiguracao === item.id;
                      const bloqueado = !podeAba('configuracoes');
                      return (
                        <button
                          key={item.id}
                          onClick={() => abrirSecaoConfiguracao(item.id)}
                          aria-current={ativo ? 'page' : undefined}
                          title={bloqueado ? 'Requer autorização de um administrador' : item.descricao}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-[13px] font-semibold text-left transition-all ${
                            ativo
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                          }`}
                        >
                          <span>{item.rotulo}</span>
                          {bloqueado && <IconeCadeado className={ativo ? 'text-white' : 'text-zinc-500'} />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Atalho: Leis e termos de uso (seção de Configurações aberta a todos os funcionários) */}
                <button
                  onClick={() => abrirSecaoConfiguracao('leis')}
                  aria-current={activeTab === 'configuracoes' && secaoConfiguracao === 'leis' ? 'page' : undefined}
                  title="Leis do CDC, Código Civil e LGPD para o balcão e termos de uso"
                  className={`w-full flex items-center space-x-3.5 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    activeTab === 'configuracoes' && secaoConfiguracao === 'leis'
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                      : 'text-zinc-300 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                  </svg>
                  <span>Leis e termos de uso</span>
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
                <p className="text-[11px] text-zinc-400 truncate">{userCargo}</p>
              </div>
            </div>
            <button
              onClick={trocarFuncionario}
              title="Trocar funcionário (bloquear tela)"
              aria-label="Trocar funcionário"
              className="p-2 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-xl transition shrink-0 ml-auto"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </button>
            <button
              onClick={sairDaConta}
              title="Sair da conta (desconectar do sistema)"
              aria-label="Sair da conta"
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
              {activeTab === 'cadastros' && secaoCadastro && (
                <>
                  <span className="text-zinc-600">/</span>
                  <span className="font-bold text-blue-400 text-xs sm:text-sm truncate">
                    {GRUPOS_CADASTRO.flatMap((g) => g.itens).find((i) => i.id === secaoCadastro)?.label}
                  </span>
                </>
              )}
              {activeTab === 'configuracoes' && secaoConfiguracao && (
                <>
                  <span className="text-zinc-600">/</span>
                  <span className="font-bold text-blue-400 text-xs sm:text-sm truncate">
                    {SECOES_CONFIGURACAO.find((s) => s.id === secaoConfiguracao)?.rotulo}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Topo Direito: loja cadastrada + perfil do funcionário identificado */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Loja */}
            <div
              className="flex items-center space-x-2 sm:space-x-3 bg-[#0d121c] border border-zinc-800/80 rounded-xl px-2 sm:px-3.5 py-1.5 shadow-sm max-w-[150px] sm:max-w-[220px]"
              title={lojaAtual ? `Loja: ${lojaAtual.nome}` : nomeLojaCabecalho}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={nomeLojaCabecalho}
                  className="w-7 h-7 sm:w-8 sm:h-8 object-contain rounded-lg bg-zinc-950 p-0.5 sm:p-1 border border-zinc-800 shrink-0"
                />
              ) : (
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-400 font-extrabold text-xs shrink-0">
                  {nomeLojaCabecalho.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="text-left pr-1 min-w-0 hidden sm:block">
                <div className="flex items-center space-x-1.5">
                  <h4 className="text-xs font-bold text-white truncate leading-tight">{nomeLojaCabecalho}</h4>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 animate-pulse" title="Loja conectada" />
                </div>
                <p className="text-[10px] text-zinc-400 truncate mt-0.5 font-medium">
                  {detalheLojaCabecalho}
                  {outrasLojas > 0 && <span className="text-blue-400"> +{outrasLojas}</span>}
                </p>
              </div>
            </div>

            {/* Perfil do funcionário */}
            <div className="relative" ref={menuPerfilRef}>
              <button
                type="button"
                onClick={() => setMenuPerfilAberto((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuPerfilAberto}
                className="flex items-center space-x-2 sm:space-x-3 bg-[#0d121c] border border-zinc-800/80 hover:border-zinc-700 rounded-xl px-2 sm:px-3 py-1.5 shadow-sm max-w-[150px] sm:max-w-[220px] transition"
              >
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-800 border border-slate-700/60 flex items-center justify-center text-[11px] font-extrabold text-white shrink-0">
                  {userInitials}
                </div>
                <div className="text-left min-w-0 hidden sm:block">
                  <h4 className="text-xs font-bold text-white truncate leading-tight">{userName}</h4>
                  <p className="text-[10px] text-zinc-400 truncate mt-0.5 font-medium">{userCargo}</p>
                </div>
                <svg className="w-3.5 h-3.5 text-zinc-500 shrink-0 hidden sm:block" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {menuPerfilAberto && (
                <>
                  <div role="menu" className="absolute right-0 mt-2 w-60 z-50 bg-[#0c101a] border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-zinc-800/60">
                      <p className="text-xs font-bold text-white truncate">{userName}</p>
                      <p className="text-[11px] text-zinc-400 truncate">{userCargo}</p>
                      {lojaAtual && <p className="text-[11px] text-zinc-500 truncate mt-1">Loja: {lojaAtual.nome}</p>}
                    </div>
                    {/* Sai só do funcionário: a conta continua conectada e volta a tela de código e senha.
                        Desconectar a conta fica apenas no botão do rodapé da barra lateral. */}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuPerfilAberto(false);
                        trocarFuncionario();
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition"
                    >
                      Sair do funcionário
                      <span className="block text-[10px] font-medium text-zinc-500 mt-0.5">
                        Pede o código e a senha de novo
                      </span>
                    </button>
                  </div>
                </>
              )}
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