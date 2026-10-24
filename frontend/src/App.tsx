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
import { Cadastro } from './pages/Cadastro';
import { CadastroPendente } from './pages/CadastroPendente';
import type { SecaoCadastro } from './types';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'relatorios' | 'historico' | 'configuracoes' | 'nova-os' | 'garantia-retorno' | 'cadastros'
  >('dashboard');
  const [secaoCadastro, setSecaoCadastro] = useState<SecaoCadastro>('clientes');

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

  if (!session) {
    return <Auth onLoginSuccess={() => setLoading(false)} />;
  }

  return (
    <Layout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      session={session}
      secaoCadastro={secaoCadastro}
      setSecaoCadastro={setSecaoCadastro}
    >
      {activeTab === 'dashboard' && <Dashboard onNavigate={setActiveTab} session={session} />}
      {activeTab === 'relatorios' && <Relatorios />}
      {activeTab === 'historico' && <HistoricoServicos />}
      {activeTab === 'configuracoes' && <Configuracoes />}
      {activeTab === 'nova-os' && <NovaOS onNavigate={setActiveTab} />}
      {activeTab === 'garantia-retorno' && <GarantiaRetorno />}
      {activeTab === 'cadastros' &&
        (['clientes', 'servicos', 'fornecedores'].includes(secaoCadastro) ? (
          <Cadastro secao={secaoCadastro} />
        ) : (
          <CadastroPendente secao={secaoCadastro} />
        ))}
    </Layout>
  );
}