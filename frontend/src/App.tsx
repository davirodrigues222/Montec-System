import { useState, useEffect } from 'react';
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
import { OperadorContext } from './contexts/OperadorContext';
import { type AbaSistema, type Operador, podeAcessar, podeAcessarAba, primeiraAbaPermitida } from './services/acesso';
import type { SecaoCadastro } from './types';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AbaSistema>('dashboard');
  const [secaoCadastro, setSecaoCadastro] = useState<SecaoCadastro>('clientes');

  // Funcionário que está operando o sistema. Fica só em memória: toda abertura do sistema
  // (inclusive com a sessão da conta já salva, ou após F5) pede código e senha de novo.
  const [operador, setOperador] = useState<Operador | null>(null);
  const userId: string | undefined = session?.user?.id;
  useEffect(() => {
    setOperador(null); // troca de conta ou logout: exige nova identificação
    if (userId) {
      try {
        localStorage.setItem(CHAVE_JA_ACESSOU, '1');
      } catch {
        /* armazenamento indisponível: só não lembra na próxima visita */
      }
    }
  }, [userId]);

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

  const entrarComoOperador = (op: Operador) => {
    setOperador(op);
    const inicial = primeiraAbaPermitida(op);
    if (inicial) {
      if (inicial.secao) setSecaoCadastro(inicial.secao);
      setActiveTab(inicial.aba);
    }
  };

  // Navegação protegida: ignora pedidos para telas não liberadas (menu, atalhos do Painel, Nova OS...)
  const navegar = (aba: AbaSistema) => {
    if (podeAcessarAba(operador, aba)) setActiveTab(aba);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080c14] flex flex-col items-center justify-center text-white space-y-4">
        <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-xs text-zinc-400 font-medium tracking-wider uppercase">
          Carregando Sampaio Cell...
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
        modoInicial={telaPublica}
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

  const telaLiberada = podeAcessarAba(operador, activeTab, activeTab === 'cadastros' ? secaoCadastro : undefined);

  return (
    <OperadorContext.Provider
      value={{
        operador,
        pode: (chave) => podeAcessar(operador, chave),
        trocarFuncionario: () => setOperador(null),
      }}
    >
      <Layout
        activeTab={activeTab}
        setActiveTab={navegar}
        session={session}
        secaoCadastro={secaoCadastro}
        setSecaoCadastro={setSecaoCadastro}
      >
        {!telaLiberada ? (
          <div className="max-w-lg mx-auto mt-16 bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-6 text-center">
            <p className="text-sm font-bold text-white">Tela não liberada</p>
            <p className="text-xs text-zinc-400 mt-1">
              Seu perfil não tem acesso a esta tela. Peça a um administrador para liberá-la em Cadastros › Funcionários.
            </p>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && <Dashboard onNavigate={navegar} session={session} />}
            {activeTab === 'relatorios' && <Relatorios />}
            {activeTab === 'historico' && <HistoricoServicos />}
            {activeTab === 'configuracoes' && <Configuracoes />}
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