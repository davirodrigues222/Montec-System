import { useState, useEffect, useRef } from 'react';
import { supabase } from './services/supabaseClient';
import { Auth } from './pages/Auth';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Relatorios } from './pages/Relatorios';
import { HistoricoServicos } from './pages/HistoricoServicos';
import { Configuracoes } from './pages/Configuracoes';
import { NovaOS } from './pages/NovaOS';
import { GarantiaRetorno } from './pages/Garantiaretorno';
import { ClientesCadastro } from './pages/cadastros/ClientesCadastro';
import { ServicosCadastro } from './pages/cadastros/ServicosCadastro';
import { FornecedoresCadastro } from './pages/cadastros/FornecedoresCadastro';
import { LojasCadastro } from './pages/cadastros/LojasCadastro';
import { FuncionariosCadastro } from './pages/cadastros/FuncionariosCadastro';
import { FormasPagamentoCadastro } from './pages/cadastros/FormasPagamentoCadastro';
import { AcessoFuncionario } from './pages/AcessoFuncionario';
import { LandingPage } from './pages/landing/LandingPage';
import { AutorizacaoAdministrativa } from './components/AutorizacaoAdministrativa';
import { SECOES_CONFIGURACAO, SECOES_CONFIGURACAO_LIVRES } from './pages/configuracoes/secoes';
import { OperadorContext } from './contexts/OperadorContext';
import {
  type AbaSistema,
  type Operador,
  aplicarTokenAutorizacao,
  aplicarTokenOperador,
  encerrarSessaoFuncionario,
  podeAcessar,
  podeAcessarAba,
  primeiraAbaPermitida,
  restaurarSessaoFuncionario,
} from './services/acesso';
import type { SecaoCadastro, SecaoConfiguracao } from './types';

// Marca que este navegador já entrou no sistema: na próxima visita vai direto ao login
const CHAVE_JA_ACESSOU = 'montec_ja_acessou';
const lerJaAcessou = () => {
  try {
    return localStorage.getItem(CHAVE_JA_ACESSOU) === '1';
  } catch {
    return false;
  }
};

type TelaPublica = 'inicio' | 'login' | 'cadastro';

// Endereço com "?inicio" (ex.: http://localhost:5173/?inicio) sempre abre a página inicial,
// mesmo para quem já está logado ou já entrou antes neste navegador
const pediuPaginaInicial = () => new URLSearchParams(window.location.search).has('inicio');
const limparParametroInicio = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('inicio');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
};

// Nome de cada tela, usado no pedido de autorização administrativa
const NOMES_TELAS: Record<string, string> = {
  dashboard: 'Painel',
  relatorios: 'Análises e relatórios',
  historico: 'Ordens de serviço',
  'nova-os': 'Nova ordem',
  'garantia-retorno': 'Garantias e retornos',
  configuracoes: 'Configurações',
  'cadastros:clientes': 'Cadastros › Clientes',
  'cadastros:servicos': 'Cadastros › Serviços',
  'cadastros:fornecedores': 'Cadastros › Fornecedores',
  'cadastros:lojas': 'Cadastros › Lojas',
  'cadastros:funcionarios': 'Cadastros › Funcionários',
  'cadastros:formas-pagamento': 'Cadastros › Formas de pagamento',
  ...Object.fromEntries(SECOES_CONFIGURACAO.map((s) => [`configuracoes:${s.id}`, `Configurações › ${s.rotulo}`])),
};

// Sessão de quem está operando (funcionário ou proprietário) na aba atual. O sessionStorage (apagado
// ao fechar a aba ou o app) guarda o token da sessão aberta no banco; no F5 a pessoa e as permissões
// são lidas de novo do banco (editar o navegador não dá acesso). Só é reaproveitada quando a página foi
// RECARREGADA: abrir o sistema de novo, voltar de outro site ou duplicar a aba pede código e senha.
// Só o token é guardado: o operador nunca fica no navegador (editá-lo não daria acesso a nada).
const CHAVE_OPERADOR_SESSAO = 'montec_operador_sessao';

interface SessaoOperador {
  userId: string;
  token: string;
  aba: AbaSistema;
  secao: SecaoCadastro;
  secaoConfiguracao?: SecaoConfiguracao;
}

const foiRecarregamento = () => {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return nav?.type === 'reload';
  } catch {
    return false;
  }
};

const lerSessaoOperador = (): SessaoOperador | null => {
  try {
    if (!foiRecarregamento()) {
      sessionStorage.removeItem(CHAVE_OPERADOR_SESSAO);
      return null;
    }
    const salvo = sessionStorage.getItem(CHAVE_OPERADOR_SESSAO);
    const sessao = salvo ? (JSON.parse(salvo) as SessaoOperador) : null;
    return sessao?.userId && typeof sessao.token === 'string' && sessao.token ? sessao : null;
  } catch {
    return null;
  }
};

// Lido uma única vez, quando a página carrega
const sessaoOperadorRestaurada = lerSessaoOperador();

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AbaSistema>(sessaoOperadorRestaurada?.aba ?? 'dashboard');
  const [secaoCadastro, setSecaoCadastro] = useState<SecaoCadastro>(sessaoOperadorRestaurada?.secao ?? 'clientes');
  // Seção aberta em Configurações (subitens do menu lateral). Todas usam a mesma permissão de tela.
  const [secaoConfiguracao, setSecaoConfiguracao] = useState<SecaoConfiguracao>(
    sessaoOperadorRestaurada?.secaoConfiguracao ?? 'loja'
  );

  // Funcionário que está operando o sistema e o token da sessão dele no banco
  const [operador, setOperador] = useState<Operador | null>(null);
  const [tokenOperador, setTokenOperador] = useState<string | null>(null);
  // Após F5: restaura o funcionário pelo banco antes de mostrar a tela de identificação
  const [restaurandoOperador, setRestaurandoOperador] = useState(!!sessaoOperadorRestaurada);
  const contaDoOperador = useRef<string | null>(null);
  const userId: string | undefined = session?.user?.id;

  useEffect(() => {
    if (loading) return; // sessão da conta ainda sendo lida
    if (userId) {
      try {
        localStorage.setItem(CHAVE_JA_ACESSOU, '1');
      } catch {
        /* armazenamento indisponível: só não lembra na próxima visita */
      }
    }
    if (userId && contaDoOperador.current === userId) return;
    contaDoOperador.current = userId ?? null;
    setOperador(null);
    setTokenOperador(null);

    // F5 na mesma conta: pede ao banco o funcionário da sessão (permissões atuais)
    const restaurar = sessaoOperadorRestaurada;
    if (!userId || !restaurar || restaurar.userId !== userId) {
      setRestaurandoOperador(false);
      return;
    }
    let ativo = true;
    const token = restaurar.token;
    restaurarSessaoFuncionario(token)
      .then((op) => {
        if (!ativo || !op) return;
        setOperador(op);
        setTokenOperador(token);
      })
      .finally(() => {
        if (ativo) setRestaurandoOperador(false);
      });
    return () => {
      ativo = false;
    };
  }, [loading, userId]);

  // Guarda o token e a tela atual para sobreviver ao F5; remove ao sair ou trocar de funcionário
  useEffect(() => {
    if (loading || restaurandoOperador) return;
    try {
      if (operador && userId && tokenOperador) {
        const sessao: SessaoOperador = {
          userId,
          token: tokenOperador,
          aba: activeTab,
          secao: secaoCadastro,
          secaoConfiguracao,
        };
        sessionStorage.setItem(CHAVE_OPERADOR_SESSAO, JSON.stringify(sessao));
      } else {
        sessionStorage.removeItem(CHAVE_OPERADOR_SESSAO);
      }
    } catch {
      /* armazenamento indisponível: o F5 volta a pedir a identificação */
    }
  }, [loading, restaurandoOperador, operador, tokenOperador, userId, activeTab, secaoCadastro, secaoConfiguracao]);

  /** Sai do funcionário atual: encerra a sessão dele no banco e volta para a identificação. */
  const sairDoFuncionario = () => {
    if (tokenOperador) encerrarSessaoFuncionario(tokenOperador).catch(() => {});
    setTokenOperador(null);
    setOperador(null);
  };

  // Fluxo público (sem login): página inicial -> entrar / criar conta
  const [telaPublica, setTelaPublica] = useState<TelaPublica>(() =>
    pediuPaginaInicial() || !lerJaAcessou() ? 'inicio' : 'login'
  );
  const [forcarInicio, setForcarInicio] = useState(pediuPaginaInicial);

  /** Sai da página inicial: logado vai para o sistema; deslogado vai para entrar/criar conta. */
  const sairDaPaginaInicial = (destino: 'login' | 'cadastro') => {
    limparParametroInicio();
    setForcarInicio(false);
    setTelaPublica(destino);
    window.scrollTo(0, 0);
  };

  // Tela liberada por um administrador para o funcionário atual. Vale só para a tela em que foi
  // autorizada: ao ir para outra tela, trocar de funcionário ou recarregar, volta a pedir autorização.
  const [liberacao, setLiberacao] = useState<{ chave: string; admin: string; token: string | null } | null>(null);

  // Os tokens do operador e da liberação vão em toda consulta ao banco: as regras do cadastro de
  // funcionários só aceitam alterações de um administrador identificado (migração 20261025150000)
  useEffect(() => aplicarTokenOperador(tokenOperador), [tokenOperador]);
  useEffect(() => aplicarTokenAutorizacao(liberacao?.token ?? null), [liberacao]);
  // Última tela que o funcionário pode usar (destino do botão "Voltar" da autorização)
  const ultimaTelaPermitida = useRef<{ aba: AbaSistema; secao: SecaoCadastro } | null>(null);

  const entrarComoOperador = (op: Operador, token: string | null = null) => {
    setLiberacao(null);
    ultimaTelaPermitida.current = null;
    setOperador(op);
    setTokenOperador(token);
    const inicial = primeiraAbaPermitida(op);
    if (inicial) {
      if (inicial.secao) setSecaoCadastro(inicial.secao);
      setActiveTab(inicial.aba);
    }
  };

  // Ao sair de uma tela que o perfil permite, guarda ela como destino do "Voltar" da autorização
  const lembrarTelaAtual = () => {
    if (podeAcessarAba(operador, activeTab, activeTab === 'cadastros' ? secaoCadastro : undefined)) {
      ultimaTelaPermitida.current = { aba: activeTab, secao: secaoCadastro };
    }
  };

  // Todas as telas são navegáveis; as que o perfil não permite pedem autorização na área principal.
  // Sair da tela desfaz a liberação dada pelo administrador.
  const navegar = (aba: AbaSistema) => {
    if (aba !== activeTab) {
      lembrarTelaAtual();
      setLiberacao(null);
    }
    setActiveTab(aba);
  };
  // Cada seção de Configurações é uma tela própria: liberar uma não libera as outras
  const mudarSecaoConfiguracao = (secao: SecaoConfiguracao) => {
    if (secao !== secaoConfiguracao) {
      lembrarTelaAtual();
      setLiberacao(null);
    }
    setSecaoConfiguracao(secao);
  };
  const mudarSecaoCadastro = (secao: SecaoCadastro) => {
    if (secao !== secaoCadastro) {
      lembrarTelaAtual();
      setLiberacao(null);
    }
    setSecaoCadastro(secao);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading || (session && restaurandoOperador)) {
    return (
      <div className="min-h-screen bg-[#080c14] flex flex-col items-center justify-center text-white space-y-4">
        <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-xs text-zinc-400 font-medium tracking-wider uppercase">
          Carregando sistema...
        </p>
      </div>
    );
  }

  if (forcarInicio || (!session && telaPublica === 'inicio')) {
    return <LandingPage onEntrar={() => sairDaPaginaInicial('login')} onCriarConta={() => sairDaPaginaInicial('cadastro')} />;
  }

  if (!session) {
    return (
      <Auth
        key={telaPublica}
        modoInicial={telaPublica === 'cadastro' ? 'cadastro' : 'login'}
        onVoltar={() => {
          setTelaPublica('inicio');
          window.scrollTo(0, 0);
        }}
        onLoginSuccess={() => setLoading(false)}
      />
    );
  }

  if (!operador) {
    return <AcessoFuncionario key={userId} session={session} onEntrar={entrarComoOperador} />;
  }

  const chaveTela =
    activeTab === 'cadastros'
      ? `cadastros:${secaoCadastro}`
      : activeTab === 'configuracoes'
      ? `configuracoes:${secaoConfiguracao}`
      : activeTab;
  const permitidaPeloPerfil =
    podeAcessarAba(operador, activeTab, activeTab === 'cadastros' ? secaoCadastro : undefined) ||
    // Leis e termos: consulta aberta a todo funcionário (editar os termos continua exigindo a permissão)
    (activeTab === 'configuracoes' && SECOES_CONFIGURACAO_LIVRES.includes(secaoConfiguracao));
  const liberadaPorAdmin = !permitidaPeloPerfil && liberacao?.chave === chaveTela;
  const telaLiberada = permitidaPeloPerfil || liberadaPorAdmin;

  const voltarDaAutorizacao = () => {
    const destino =
      ultimaTelaPermitida.current ||
      (() => {
        const inicial = primeiraAbaPermitida(operador);
        return inicial ? { aba: inicial.aba, secao: inicial.secao ?? secaoCadastro } : null;
      })();
    if (!destino) return;
    setSecaoCadastro(destino.secao);
    setActiveTab(destino.aba);
  };

  return (
    <OperadorContext.Provider
      value={{
        operador,
        pode: (chave) => podeAcessar(operador, chave),
        trocarFuncionario: () => {
          setLiberacao(null);
          sairDoFuncionario();
        },
      }}
    >
      <Layout
        activeTab={activeTab}
        setActiveTab={navegar}
        session={session}
        secaoCadastro={secaoCadastro}
        setSecaoCadastro={mudarSecaoCadastro}
        secaoConfiguracao={secaoConfiguracao}
        setSecaoConfiguracao={mudarSecaoConfiguracao}
      >
        {!telaLiberada ? (
          <AutorizacaoAdministrativa
            key={chaveTela}
            recurso={`a tela ${NOMES_TELAS[chaveTela] || 'selecionada'}`}
            onAutorizado={(admin) => setLiberacao({ chave: chaveTela, admin: admin.nome, token: admin.token })}
            onVoltar={voltarDaAutorizacao}
          />
        ) : (
          <>
            {liberadaPorAdmin && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs print:hidden">
                <span className="text-amber-300 font-semibold">
                  🔓 Acesso liberado por {liberacao?.admin} somente para esta tela.
                </span>
                <button
                  type="button"
                  onClick={() => setLiberacao(null)}
                  className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg font-semibold transition"
                >
                  Bloquear novamente
                </button>
              </div>
            )}
            {activeTab === 'dashboard' && <Dashboard onNavigate={navegar} session={session} />}
            {activeTab === 'relatorios' && <Relatorios />}
            {activeTab === 'historico' && <HistoricoServicos />}
            {activeTab === 'configuracoes' && (
              <Configuracoes
                secao={secaoConfiguracao}
                onAbrirCadastro={(secao) => {
                  mudarSecaoCadastro(secao);
                  navegar('cadastros');
                }}
              />
            )}
            {activeTab === 'nova-os' && <NovaOS onNavigate={navegar} />}
            {activeTab === 'garantia-retorno' && <GarantiaRetorno />}
            {activeTab === 'cadastros' && (
              <>
                {secaoCadastro === 'clientes' && <ClientesCadastro />}
                {secaoCadastro === 'lojas' && <LojasCadastro />}
                {secaoCadastro === 'funcionarios' && <FuncionariosCadastro />}
                {secaoCadastro === 'formas-pagamento' && <FormasPagamentoCadastro />}
                {secaoCadastro === 'servicos' && <ServicosCadastro />}
                {secaoCadastro === 'fornecedores' && <FornecedoresCadastro />}
              </>
            )}
          </>
        )}
      </Layout>
    </OperadorContext.Provider>
  );
}