import React, { useState } from 'react';
import { fazerLogin, cadastrarUsuario, recuperarSenha } from '../services/api';

interface Props {
  onLoginSuccess?: () => void;
  /** Abre direto no formulário de criar conta (botões "Criar conta" da página inicial). */
  modoInicial?: 'login' | 'cadastro';
  /** Volta para a página inicial pública. */
  onVoltar?: () => void;
}

export const Auth: React.FC<Props> = ({ onLoginSuccess, modoInicial = 'login', onVoltar }) => {
  const [modo, setModo] = useState<'login' | 'cadastro'>(modoInicial);
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  // Estados de Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginSenha, setLoginSenha] = useState('');

  // Estados de Cadastro
  const [nomeResponsavel, setNomeResponsavel] = useState('');
  const [nomeAssistencia, setNomeAssistencia] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [cadEmail, setCadEmail] = useState('');
  const [cadSenha, setCadSenha] = useState('');
  const [cadConfirmarSenha, setCadConfirmarSenha] = useState('');
  const [concordouTermos, setConcordouTermos] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensagem(null);

    if (!loginEmail || !loginSenha) {
      setMensagem({ tipo: 'erro', texto: 'Informe seu e-mail e senha para continuar.' });
      return;
    }

    setLoading(true);
    try {
      // fazerLogin já sincroniza as configurações da conta e avisa as telas (storage_configs_updated)
      const data = await fazerLogin(loginEmail, loginSenha);
      if (data.user) onLoginSuccess?.();
    } catch (err: any) {
      console.error('Erro de autenticação:', err);
      let erroTexto = 'E-mail ou senha inválidos.';
      if (err.message && err.message.toLowerCase().includes('email not confirmed')) {
        erroTexto = 'Por favor, confirme seu e-mail antes de acessar.';
      }
      setMensagem({ tipo: 'erro', texto: erroTexto });
    } finally {
      setLoading(false);
    }
  };

  const handleCadastro = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensagem(null);

    if (!cadEmail || !cadSenha || !nomeResponsavel || !nomeAssistencia || !whatsapp) {
      setMensagem({ tipo: 'erro', texto: 'Preencha todos os campos obrigatórios (*).' });
      return;
    }

    if (cadSenha !== cadConfirmarSenha) {
      setMensagem({ tipo: 'erro', texto: 'As senhas digitadas não coincidem.' });
      return;
    }

    if (cadSenha.length < 6) {
      setMensagem({ tipo: 'erro', texto: 'A senha deve conter no mínimo 6 caracteres.' });
      return;
    }

    if (!concordouTermos) {
      setMensagem({ tipo: 'erro', texto: 'Você deve concordar com os Termos de Uso.' });
      return;
    }

    setLoading(true);
    try {
      await cadastrarUsuario({
        email: cadEmail,
        password: cadSenha,
        nomeResponsavel,
        nomeAssistencia,
        whatsapp,
        cpfCnpj,
      });

      setMensagem({
        tipo: 'sucesso',
        texto: 'Conta criada com sucesso! Verifique seu e-mail para confirmação se necessário.',
      });

      setTimeout(() => {
        setModo('login');
        setLoginEmail(cadEmail);
      }, 2000);
    } catch (err: any) {
      console.error('Erro de cadastro:', err);
      let erroTexto = err.message || 'Falha ao registrar conta.';
      if (erroTexto.toLowerCase().includes('already registered')) {
        erroTexto = 'Este e-mail já está cadastrado no sistema.';
      }
      setMensagem({ tipo: 'erro', texto: erroTexto });
    } finally {
      setLoading(false);
    }
  };

  const handleRecuperar = async () => {
    if (!loginEmail) {
      setMensagem({
        tipo: 'erro',
        texto: 'Digite seu e-mail no campo acima para receber o link de redefinição de senha.',
      });
      return;
    }

    setLoading(true);
    try {
      await recuperarSenha(loginEmail);
      setMensagem({
        tipo: 'sucesso',
        texto: 'Link de recuperação enviado para o seu e-mail com sucesso.',
      });
    } catch (err: any) {
      setMensagem({ tipo: 'erro', texto: err.message || 'Falha ao solicitar recuperação.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#080c14] text-zinc-100 font-sans selection:bg-blue-600 selection:text-white">
      {/* ================= PAINEL INSTITUCIONAL (EMBAIXO NO MOBILE / ESQUERDA NO DESKTOP) ================= */}
      <div className="relative flex-1 flex flex-col justify-between p-8 lg:p-16 border-t lg:border-t-0 lg:border-r border-zinc-800/60 overflow-hidden bg-[#070b12] order-2 lg:order-1">
        {/* Grade Blueprint de fundo */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(255, 255, 255, 0.08) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255, 255, 255, 0.08) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />

        <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        {/* Topo: Logo Oficial Montec System */}
        <div className="relative z-10 flex items-center space-x-3.5">
          <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-lg shadow-blue-500/25 shrink-0 border border-blue-500/30 bg-[#0d131f] flex items-center justify-center">
            <img
              src="/logo-montec.png"
              alt="Montec System"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight text-white leading-none">
              Montec System
            </h1>
            <p className="text-xs text-blue-400 mt-1 font-semibold">Software de Gestão Técnica</p>
          </div>
        </div>

        
        <div className="relative z-10 max-w-xl my-10 lg:my-auto">
          {modo === 'login' ? (
            <div className="space-y-6">
              <span className="inline-block text-xs font-bold tracking-widest text-blue-400 uppercase">
                OPERAÇÃO SOB CONTROLE
              </span>
              <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.15]">
                Do balcão à bancada: o controle total da sua assistência técnica.
              </h2>
              <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
                Ordens de serviço, clientes, garantias e resultado financeiro em uma ferramenta feita sob medida para o seu laboratório.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <span className="inline-block text-xs font-bold tracking-widest text-blue-400 uppercase">
                COMECE AGORA
              </span>
              <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.15]">
                Organize sua assistência desde a primeira ordem.
              </h2>
              <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
                Crie sua conta, cadastre os dados da loja e tenha uma visão clara dos serviços, custos e resultados.
              </p>

              <div className="grid grid-cols-3 gap-3 pt-4">
                <div className="bg-[#0e1422]/90 border border-zinc-800/80 rounded-xl p-3.5 text-center">
                  <p className="text-xs font-semibold text-zinc-300">Ordens e clientes</p>
                </div>
                <div className="bg-[#0e1422]/90 border border-zinc-800/80 rounded-xl p-3.5 text-center">
                  <p className="text-xs font-semibold text-zinc-300">Controle financeiro</p>
                </div>
                <div className="bg-[#0e1422]/90 border border-zinc-800/80 rounded-xl p-3.5 text-center">
                  <p className="text-xs font-semibold text-zinc-300">Garantias</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé do Painel Esquerdo */}
        <div className="relative z-10 pt-4">
          <p className="text-xs text-zinc-400 font-medium">
            Montec System · Gestão Especializada para Assistências
          </p>
        </div>
      </div>

      {/* ================= PAINEL DE FORMULÁRIO (PRIMEIRO NO MOBILE / DIREITA NO DESKTOP) ================= */}
      <div className="w-full lg:w-[480px] xl:w-[540px] flex flex-col justify-between p-6 sm:p-8 lg:p-14 bg-[#0a0e17] overflow-y-auto order-1 lg:order-2">
        <div className="my-auto max-w-md w-full mx-auto">
          {onVoltar && (
            <button
              type="button"
              onClick={onVoltar}
              className="mb-6 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white transition"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Voltar para a página inicial
            </button>
          )}

          {/* Topo Mobile: Logo Oficial Montec System */}
          <div className="flex lg:hidden items-center space-x-3.5 mb-8">
            <div className="relative w-11 h-11 rounded-xl overflow-hidden shadow-lg shadow-blue-500/25 shrink-0 border border-blue-500/30 bg-[#0d131f] flex items-center justify-center">
              <img
                src="/logo-montec.png"
                alt="Montec System"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-white leading-none">
                Montec System
              </h1>
              <p className="text-xs text-blue-400 mt-1 font-semibold">Software de Gestão Técnica</p>
            </div>
          </div>

          {mensagem && (
            <div
              className={`mb-6 p-4 rounded-xl text-xs sm:text-sm font-medium border flex items-start space-x-3 ${
                mensagem.tipo === 'sucesso'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}
            >
              <span className="text-base leading-none">
                {mensagem.tipo === 'sucesso' ? '✓' : '⚠'}
              </span>
              <div className="flex-1">{mensagem.texto}</div>
            </div>
          )}

          {modo === 'login' ? (
            <div>
              <div className="mb-8">
                <span className="text-xs font-bold tracking-widest text-blue-400 uppercase">
                  ÁREA RESTRITA
                </span>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-white mt-1.5 tracking-tight">
                  Acesse o sistema
                </h3>
                <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                  Use suas credenciais de operador.
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                    E-MAIL
                  </label>
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="gestor@suaassistencia.com.br"
                    className="w-full px-4 py-3 bg-[#0d131f] border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                      SENHA
                    </label>
                    <button
                      type="button"
                      onClick={handleRecuperar}
                      className="text-xs font-medium text-blue-400 hover:text-blue-300 transition"
                    >
                      Recuperar
                    </button>
                  </div>
                  <input
                    type="password"
                    required
                    value={loginSenha}
                    onChange={(e) => setLoginSenha(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-4 py-3 bg-[#0d131f] border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-600/30 transition duration-200 mt-2"
                >
                  {loading ? 'Entrando...' : 'Entrar'}
                </button>
              </form>

              <div className="mt-8 text-center">
                <p className="text-xs text-zinc-400">
                  Ainda não tem conta na assistência?{' '}
                  <button
                    onClick={() => {
                      setModo('cadastro');
                      setMensagem(null);
                    }}
                    className="font-bold text-blue-400 hover:text-blue-300 transition ml-1"
                  >
                    Criar conta
                  </button>
                </p>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-6">
                <span className="text-xs font-bold tracking-widest text-blue-400 uppercase">
                  NOVA CONTA
                </span>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-white mt-1.5 tracking-tight">
                  Cadastre sua loja
                </h3>
                <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                  Configure seu ambiente de trabalho.
                </p>
              </div>

              <form onSubmit={handleCadastro} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                      RESPONSÁVEL *
                    </label>
                    <input
                      type="text"
                      required
                      value={nomeResponsavel}
                      onChange={(e) => setNomeResponsavel(e.target.value)}
                      placeholder="Nome completo"
                      className="w-full px-3.5 py-2.5 bg-[#0d131f] border border-zinc-800 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-blue-500 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                      NOME DA ASSISTÊNCIA *
                    </label>
                    <input
                      type="text"
                      required
                      value={nomeAssistencia}
                      onChange={(e) => setNomeAssistencia(e.target.value)}
                      placeholder="Ex: Montec Smart"
                      className="w-full px-3.5 py-2.5 bg-[#0d131f] border border-zinc-800 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-blue-500 transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                      WHATSAPP *
                    </label>
                    <input
                      type="text"
                      required
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="w-full px-3.5 py-2.5 bg-[#0d131f] border border-zinc-800 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-blue-500 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                      CNPJ OU CPF
                    </label>
                    <input
                      type="text"
                      value={cpfCnpj}
                      onChange={(e) => setCpfCnpj(e.target.value)}
                      placeholder="Opcional"
                      className="w-full px-3.5 py-2.5 bg-[#0d131f] border border-zinc-800 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-blue-500 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                    E-MAIL DE ACESSO *
                  </label>
                  <input
                    type="email"
                    required
                    value={cadEmail}
                    onChange={(e) => setCadEmail(e.target.value)}
                    placeholder="seuemail@provedor.com"
                    className="w-full px-3.5 py-2.5 bg-[#0d131f] border border-zinc-800 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-blue-500 transition"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                      SENHA *
                    </label>
                    <input
                      type="password"
                      required
                      value={cadSenha}
                      onChange={(e) => setCadSenha(e.target.value)}
                      placeholder="Mínimo 6 dígitos"
                      className="w-full px-3.5 py-2.5 bg-[#0d131f] border border-zinc-800 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-blue-500 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                      CONFIRMAR SENHA *
                    </label>
                    <input
                      type="password"
                      required
                      value={cadConfirmarSenha}
                      onChange={(e) => setCadConfirmarSenha(e.target.value)}
                      placeholder="Repita a senha"
                      className="w-full px-3.5 py-2.5 bg-[#0d131f] border border-zinc-800 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-blue-500 transition"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <label className="flex items-start space-x-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={concordouTermos}
                      onChange={(e) => setConcordouTermos(e.target.checked)}
                      className="mt-1 rounded bg-[#0d131f] border-zinc-700 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-zinc-400">
                      Concordo com os Termos de Uso e Política de Privacidade do sistema.
                    </span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-600/30 transition duration-200 mt-2"
                >
                  {loading ? 'Cadastrando...' : 'Finalizar Cadastro'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-xs text-zinc-400">
                  Já possui uma conta?{' '}
                  <button
                    onClick={() => {
                      setModo('login');
                      setMensagem(null);
                    }}
                    className="font-bold text-blue-400 hover:text-blue-300 transition ml-1"
                  >
                    Voltar para o login
                  </button>
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="pt-6 text-center">
          <p className="text-[11px] text-zinc-400">
            Montec System · Versão 2.4.0
          </p>
        </div>
      </div>
    </div>
  );
};