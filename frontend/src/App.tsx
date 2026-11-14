import { useState, useEffect, useRef, lazy, Suspense, type ReactNode } from 'react';
import { supabase } from './services/supabaseClient';
import { Auth } from './pages/Auth';
import { Layout } from './components/Layout';
import { AcessoFuncionario } from './pages/AcessoFuncionario';
import { AutorizacaoAdministrativa } from './components/AutorizacaoAdministrativa';
import { Carregando } from './components/cadastros/ui';

// Cada tela é baixada só quando é aberta: o primeiro carregamento (e a página inicial) fica bem menor
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Relatorios = lazy(() => import('./pages/Relatorios').then((m) => ({ default: m.Relatorios })));
const Despesas = lazy(() => import('./pages/Despesas').then((m) => ({ default: m.Despesas })));
const Comissoes = lazy(() => import('./pages/Comissoes').then((m) => ({ default: m.Comissoes })));
const HistoricoServicos = lazy(() => import('./pages/HistoricoServicos').then((m) => ({ default: m.HistoricoServicos })));
const Configuracoes = lazy(() => import('./pages/Configuracoes').then((m) => ({ default: m.Configuracoes })));
const NovaOS = lazy(() => import('./pages/NovaOS').then((m) => ({ default: m.NovaOS })));
const Orcamentos = lazy(() => import('./pages/Orcamentos').then((m) => ({ default: m.Orcamentos })));
const GarantiaRetorno = lazy(() => import('./pages/Garantiaretorno').then((m) => ({ default: m.GarantiaRetorno })));
const ClientesCadastro = lazy(() => import('./pages/cadastros/ClientesCadastro').then((m) => ({ default: m.ClientesCadastro })));
const ServicosCadastro = lazy(() => import('./pages/cadastros/ServicosCadastro').then((m) => ({ default: m.ServicosCadastro })));
const FornecedoresCadastro = lazy(() =>
  import('./pages/cadastros/FornecedoresCadastro').then((m) => ({ default: m.FornecedoresCadastro }))
);
const EstoqueCadastro = lazy(() => import('./pages/cadastros/EstoqueCadastro').then((m) => ({ default: m.EstoqueCadastro })));
const LojasCadastro = lazy(() => import('./pages/cadastros/LojasCadastro').then((m) => ({ default: m.LojasCadastro })));
const FuncionariosCadastro = lazy(() =>
  import('./pages/cadastros/FuncionariosCadastro').then((m) => ({ default: m.FuncionariosCadastro }))
);
const FormasPagamentoCadastro = lazy(() =>
  import('./pages/cadastros/FormasPagamentoCadastro').then((m) => ({ default: m.FormasPagamentoCadastro }))
);
const LandingPage = lazy(() => import('./pages/landing/LandingPage').then((m) => ({ default: m.LandingPage })));
import { SECOES_CONFIGURACAO, SECOES_CONFIGURACAO_LIVRES } from './pages/configuracoes/secoes';
import { OperadorContext } from './contexts/OperadorContext';
import { AssinaturaProvider } from './contexts/AssinaturaContext';
import { PortaoAssinatura } from './components/PaywallAssinatura';
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
import { fazerLogout, invalidarCacheOrdens, obterConfiguracoesLojaSincrono } from './services/api';
import {
  contaDoUsuario,
  ehLoginDeFuncionario,
  esquecerContaAparelho,
  lembrarContaAparelho,
  lerContaAparelho,
  operadorDoLoginAtual,
  sairDoLoginFuncionario,
  sessaoSalvaEhDeFuncionario,
} from './services/loginFuncionario';
import type { SecaoCadastro, SecaoConfiguracao } from './types';
import { LockOpen } from 'lucide-react';

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
  despesas: 'Despesas',
  comissoes: 'Comissões',
  historico: 'Ordens de serviço',
  'nova-os': 'Nova ordem',
  orcamentos: 'Orçamentos',
  'garantia-retorno': 'Garantias e retornos',
  configuracoes: 'Configurações',
  'cadastros:clientes': 'Cadastros › Clientes',
  'cadastros:servicos': 'Cadastros › Serviços',
  'cadastros:fornecedores': 'Cadastros › Fornecedores',
  'cadastros:estoque': 'Cadastros › Estoque de peças',
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

// "Trocar funcionário" nesta aba: a identificação aparece em vez da entrada direta do dono
// (guardado na aba para o F5 na tela de identificação não entrar como dono)
const CHAVE_PEDIR_IDENTIFICACAO = 'montec_pedir_identificacao';

const lerPedirIdentificacao = () => {
  try {
    return sessionStorage.getItem(CHAVE_PEDIR_IDENTIFICACAO) === '1';
  } catch {
    return false;
  }
};

const gravarPedirIdentificacao = (pedir: boolean) => {
  try {
    if (pedir) sessionStorage.setItem(CHAVE_PEDIR_IDENTIFICACAO, '1');
    else sessionStorage.removeItem(CHAVE_PEDIR_IDENTIFICACAO);
  } catch {
    /* armazenamento indisponível: o F5 na identificação entra como dono */
  }
};

type TipoOperacao = 'sozinho' | 'funcionarios' | 'multiplas_lojas';

const OPCOES_OPERACAO: { id: TipoOperacao; titulo: string; descricao: string; icone: ReactNode }[] = [
  {
    id: 'sozinho',
    titulo: 'Trabalho Sozinho',
    descricao: 'Atendo, conserto e cobro — tudo eu',
    icone: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
  {
    id: 'funcionarios',
    titulo: 'Tenho Funcionários',
    descricao: 'Técnicos e/ou atendente',
    icone: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  {
    id: 'multiplas_lojas',
    titulo: 'Mais de Uma Loja',
    descricao: 'Rede com múltiplos pontos',
    icone: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
      </svg>
    ),
  },
];

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mostrarSelecaoOperacao, setMostrarSelecaoOperacao] = useState(false);
  const [activeTab, setActiveTab] = useState<AbaSistema>(sessaoOperadorRestaurada?.aba ?? 'dashboard');
  const [secaoCadastro, setSecaoCadastro] = useState<SecaoCadastro>(sessaoOperadorRestaurada?.secao ?? 'clientes');
  // Seção aberta em Configurações (subitens do menu lateral). Todas usam a mesma permissão de tela.
  const [secaoConfiguracao, setSecaoConfiguracao] = useState<SecaoConfiguracao>(
    sessaoOperadorRestaurada?.secaoConfiguracao ?? 'loja'
  );

  // Funcionário que está operando o sistema e o token da sessão dele no banco
  const [operador, setOperador] = useState<Operador | null>(null);
  const [tokenOperador, setTokenOperador] = useState<string | null>(null);
  const [pedirIdentificacao, setPedirIdentificacao] = useState(lerPedirIdentificacao);
  const mudarPedirIdentificacao = (pedir: boolean) => {
    gravarPedirIdentificacao(pedir);
    setPedirIdentificacao(pedir);
  };
  // Após F5: restaura o funcionário pelo banco antes de mostrar a tela de identificação
  // (sessão do dono com token, ou login próprio do funcionário)
  const [restaurandoOperador, setRestaurandoOperador] = useState(() => !!sessaoOperadorRestaurada || sessaoSalvaEhDeFuncionario());
  const contaDoOperador = useRef<string | null>(null);
  const jaCarregouSessao = useRef(false);
  const userId: string | undefined = session?.user?.id;

  // Loja que este aparelho lembra: a identificação do funcionário funciona sem o login do dono salvo
  const [contaAparelho, setContaAparelho] = useState(lerContaAparelho);
  // Aparelho que lembra a loja, mas a pessoa pediu a tela de e-mail e senha da conta
  const [usarLoginDono, setUsarLoginDono] = useState(false);

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
    const primeiraCarga = !jaCarregouSessao.current;
    jaCarregouSessao.current = true;
    // Outro login nesta aba (sair da conta, entrar com o e-mail do dono): volta a entrar direto
    if (!primeiraCarga) mudarPedirIdentificacao(false);
    contaDoOperador.current = userId ?? null;
    setOperador(null);
    setTokenOperador(null);
    // Logout ou troca de conta: a liberação dada por um administrador da conta anterior não vale mais
    // (o token dela ia junto nas consultas da próxima conta até alguém se identificar)
    setLiberacao(null);
    ultimaTelaPermitida.current = null;

    // Login do dono: o aparelho passa a lembrar a loja (identificação sem o login do dono salvo)
    if (session?.user && !ehLoginDeFuncionario(session.user)) {
      lembrarContaAparelho({
        contaId: session.user.id,
        emailDono: session.user.email || '',
        nomeLoja: obterConfiguracoesLojaSincrono(session.user).nomeLoja,
      });
      setContaAparelho(lerContaAparelho());
      setUsarLoginDono(false);
    }

    // Login próprio do funcionário
    if (session?.user && ehLoginDeFuncionario(session.user)) {
      // Fora do F5 é a tela de identificação que acabou de entrar: ela mesma conclui a entrada
      if (!primeiraCarga) {
        setRestaurandoOperador(false);
        return;
      }
      let ativo = true;
      operadorDoLoginAtual()
        .then(async (op) => {
          if (!ativo) return;
          if (op && primeiraAbaPermitida(op)) {
            setOperador(op);
            lembrarContaAparelho({ contaId: contaDoUsuario(session.user) || '' }, true);
          } else {
            await sairDoLoginFuncionario(); // inativo ou sem telas liberadas: volta para a identificação
          }
        })
        .finally(() => {
          if (ativo) setRestaurandoOperador(false);
        });
      return () => {
        ativo = false;
      };
    }

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
    invalidarCacheOrdens();
    // Login próprio: sai do login do funcionário (o aparelho volta para a identificação da loja)
    if (ehLoginDeFuncionario(session?.user)) {
      setOperador(null);
      sairDoLoginFuncionario().catch(() => {});
      return;
    }
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
    // "Entrar" e "Criar conta" da página inicial sempre abrem o login / cadastro com e-mail da conta
    setUsarLoginDono(true);
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
    invalidarCacheOrdens(); // o que cada funcionário pode ler (custos) muda com quem entra
    mudarPedirIdentificacao(false);
    setLiberacao(null);
    ultimaTelaPermitida.current = null;
    setOperador(op);
    setTokenOperador(token);
    // Funcionário identificado: o aparelho passa a lembrar a loja (identificação sem o login do dono)
    const contaId = contaDoUsuario(session?.user) || contaAparelho?.contaId;
    if (!op.proprietario && contaId) {
      const dono = session?.user && !ehLoginDeFuncionario(session.user) ? session.user : null;
      lembrarContaAparelho(
        dono
          ? { contaId, emailDono: dono.email || '', nomeLoja: obterConfiguracoesLojaSincrono(dono).nomeLoja }
          : { contaId },
        true
      );
      setContaAparelho(lerContaAparelho());
    }
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
      if (session) {
        try {
          if (sessionStorage.getItem('bancadaos_novo_cadastro') === '1') {
            sessionStorage.removeItem('bancadaos_novo_cadastro');
            setMostrarSelecaoOperacao(true);
          }
        } catch (_) {}
      }
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

  if (session && mostrarSelecaoOperacao) {
    const salvarOperacao = async (tipo: TipoOperacao) => {
      try { localStorage.setItem(`bancadaos_tipo_operacao_${session.user.id}`, tipo); } catch (_) {}
      try { await supabase.auth.updateUser({ data: { tipo_operacao: tipo } }); } catch (_) {}
      setMostrarSelecaoOperacao(false);
    };
    return (
      <div className="min-h-screen bg-[#080c14] flex items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md">
          <div className="mb-10">
            <span className="text-xs font-bold tracking-widest text-blue-400 uppercase">
              PERFIL DA SUA LOJA
            </span>
            <h2 className="text-3xl font-extrabold text-white mt-2 tracking-tight">
              Como você trabalha?
            </h2>
            <p className="text-zinc-400 text-sm mt-1.5">
              Isso nos ajuda a preparar o sistema para o seu perfil de operação.
            </p>
          </div>

          <div className="space-y-3">
            {OPCOES_OPERACAO.map((opcao) => (
              <button
                key={opcao.id}
                type="button"
                onClick={() => salvarOperacao(opcao.id)}
                className="w-full flex items-center gap-4 p-4 bg-[#0d131f] border border-zinc-800 hover:border-blue-500/60 hover:bg-blue-500/5 rounded-xl transition group text-left"
              >
                <div className="shrink-0 w-12 h-12 rounded-xl bg-zinc-800/60 group-hover:bg-blue-500/10 border border-zinc-700/60 group-hover:border-blue-500/30 flex items-center justify-center text-zinc-400 group-hover:text-blue-400 transition">
                  {opcao.icone}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white group-hover:text-blue-100 transition">
                    {opcao.titulo}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">{opcao.descricao}</p>
                </div>
                <svg
                  className="w-4 h-4 text-zinc-600 group-hover:text-blue-400 shrink-0 transition"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>

          <p className="mt-8 text-center text-xs text-zinc-500">
            Você pode alterar isso depois nas configurações.
          </p>
        </div>
      </div>
    );
  }

  // Aparelho que lembra a loja e está sem ninguém logado: vai direto para a identificação do funcionário
  const identificacaoSemLogin = !session && !!contaAparelho && !usarLoginDono;

  if (forcarInicio || (!session && !identificacaoSemLogin && telaPublica === 'inicio')) {
    return (
      <Suspense fallback={<div className="min-h-dvh bg-[#080c14]" />}>
        <LandingPage onEntrar={() => sairDaPaginaInicial('login')} onCriarConta={() => sairDaPaginaInicial('cadastro')} />
      </Suspense>
    );
  }

  if (!session && !identificacaoSemLogin) {
    return (
      <Auth
        key={telaPublica}
        modoInicial={telaPublica === 'cadastro' ? 'cadastro' : 'login'}
        onVoltar={() => {
          // "Voltar para a página inicial" sempre leva à página de boas-vindas (o "Entrar" de lá volta
          // para a identificação do funcionário quando o aparelho lembra a loja)
          setUsarLoginDono(true);
          setTelaPublica('inicio');
          window.scrollTo(0, 0);
        }}
        onLoginSuccess={() => setLoading(false)}
      />
    );
  }

  const sairDaConta = () => {
    // Sair da conta abre o login com e-mail e senha da conta, mesmo que o aparelho lembre a loja
    // (a identificação do funcionário é só para o cadeado "Trocar funcionário")
    setLiberacao(null);
    setUsarLoginDono(true);
    setTelaPublica('login');
    fazerLogout().catch((err) => console.error('Erro ao sair:', err));
  };

  // Assinatura da loja logada: com a chave de bloqueio ligada e o acesso vencido, mostra a renovação.
  // Aparelho sem ninguém logado (identificação do funcionário) só verifica depois que alguém entra.
  const comAssinatura = (conteudo: ReactNode) => (
    <AssinaturaProvider contaId={session ? contaDoUsuario(session.user) : null}>
      <PortaoAssinatura onSair={sairDaConta}>{conteudo}</PortaoAssinatura>
    </AssinaturaProvider>
  );

  if (!operador) {
    return comAssinatura(
      <AcessoFuncionario
        // Mesma loja = mesma tela: trocar o login do dono pelo do funcionário no meio da entrada não a recria
        key={contaDoUsuario(session?.user) || contaAparelho?.contaId || 'aparelho'}
        session={session}
        contaAparelho={contaAparelho}
        onEntrar={entrarComoOperador}
        entrarDireto={!pedirIdentificacao}
        onUsarLoginDono={() => setUsarLoginDono(true)}
        onEsquecerAparelho={() => {
          esquecerContaAparelho();
          setContaAparelho(null);
          setTelaPublica('login');
        }}
      />
    );
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

  return comAssinatura(
    <OperadorContext.Provider
      value={{
        operador,
        pode: (chave) => podeAcessar(operador, chave),
        trocarFuncionario: () => {
          mudarPedirIdentificacao(true);
          setLiberacao(null);
          sairDoFuncionario();
        },
        sairDaConta,
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
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-blue-500/10 border border-blue-500/25 rounded-xl text-xs print:hidden">
                <span className="text-blue-300 font-semibold">
                  <LockOpen className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" />
                  Acesso liberado por {liberacao?.admin} somente para esta tela.
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
            <Suspense fallback={<Carregando />}>
            {activeTab === 'dashboard' && <Dashboard
                onNavigate={navegar}
                session={session}
                onAbrirEstoque={() => {
                  mudarSecaoCadastro('estoque');
                  navegar('cadastros');
                }}
              />}
            {activeTab === 'relatorios' && <Relatorios onAbrirDespesas={() => navegar('despesas')} />}
            {activeTab === 'despesas' && <Despesas />}
            {activeTab === 'comissoes' && <Comissoes />}
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
            {activeTab === 'orcamentos' && <Orcamentos />}
            {activeTab === 'garantia-retorno' && <GarantiaRetorno />}
            {activeTab === 'cadastros' && (
              <>
                {secaoCadastro === 'clientes' && <ClientesCadastro />}
                {secaoCadastro === 'lojas' && <LojasCadastro />}
                {secaoCadastro === 'funcionarios' && <FuncionariosCadastro />}
                {secaoCadastro === 'formas-pagamento' && <FormasPagamentoCadastro />}
                {secaoCadastro === 'servicos' && <ServicosCadastro />}
                {secaoCadastro === 'fornecedores' && <FornecedoresCadastro />}
                {secaoCadastro === 'estoque' && <EstoqueCadastro />}
              </>
            )}
            </Suspense>
          </>
        )}
      </Layout>
    </OperadorContext.Provider>
  );
}