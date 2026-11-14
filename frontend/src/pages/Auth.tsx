import React, { useEffect, useState } from 'react';
import {
  fazerLogin,
  cadastrarUsuario,
  confirmarCadastroComCodigo,
  enviarCodigoRecuperacao,
  redefinirSenhaComCodigo,
  reenviarCodigoCadastro,
} from '../services/api';
import { validarSenhaForte } from '../utils/formatadores';
import { type DocumentoLegal, DocumentosLegais } from '../components/DocumentosLegais';
import { NomeBancadaOS, SimboloBancadaOS } from '../components/Marca';

interface Props {
  onLoginSuccess?: () => void;
  /** Abre direto no formulário de criar conta (botões "Criar conta" da página inicial). */
  modoInicial?: 'login' | 'cadastro';
  /** Volta para a página inicial pública. */
  onVoltar?: () => void;
}

/**
 * login | cadastro | verificar: código do e-mail que confirma o cadastro
 * recuperar: pede o código de troca de senha | redefinir: código + nova senha
 * operacao: seleção do perfil operacional logo após a conta ser criada
 */
type ModoAuth = 'login' | 'cadastro' | 'verificar' | 'recuperar' | 'redefinir' | 'operacao';

// Espera entre dois envios de código (o Supabase também limita: 1 e-mail por minuto)
const ESPERA_REENVIO_S = 60;

const inputCls =
  'w-full px-4 py-3 bg-[#0d131f] border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition';
const labelCls = 'block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2';
const botaoPrincipalCls =
  'w-full py-3.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-600/30 transition duration-200 mt-2';

export const Auth: React.FC<Props> = ({ onLoginSuccess, modoInicial = 'login', onVoltar }) => {
  const [modo, setModo] = useState<ModoAuth>(modoInicial);
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
  const [documentoAberto, setDocumentoAberto] = useState<DocumentoLegal | null>(null);

  // Código de verificação (cadastro e recuperação de senha)
  const [emailCodigo, setEmailCodigo] = useState('');
  const [codigo, setCodigo] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarNovaSenha, setConfirmarNovaSenha] = useState('');
  const [reenviarEm, setReenviarEm] = useState(0);

  useEffect(() => {
    if (reenviarEm <= 0) return;
    const id = window.setTimeout(() => setReenviarEm((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [reenviarEm]);

  const trocarModo = (m: ModoAuth) => {
    setModo(m);
    setMensagem(null);
  };

  /** Abre a tela do código já com o aviso de envio. */
  const irParaCodigo = (m: 'verificar' | 'redefinir', email: string, texto: string) => {
    setEmailCodigo(email.trim());
    setCodigo('');
    setNovaSenha('');
    setConfirmarNovaSenha('');
    setReenviarEm(ESPERA_REENVIO_S);
    setModo(m);
    setMensagem({ tipo: 'sucesso', texto });
  };

  const codigoValido = () => {
    if (!/^\d{6,10}$/.test(codigo.trim())) {
      setMensagem({ tipo: 'erro', texto: 'Digite o código de 6 dígitos que chegou no seu e-mail.' });
      return false;
    }
    return true;
  };

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
      if (err.message && err.message.toLowerCase().includes('email not confirmed')) {
        // Cadastro ainda sem confirmação: manda um código novo e já abre a tela para digitá-lo
        await reenviarCodigoCadastro(loginEmail).catch(() => undefined);
        irParaCodigo(
          'verificar',
          loginEmail,
          `Seu e-mail ainda não foi confirmado. Enviamos um código de verificação para ${loginEmail.trim()}.`
        );
        return;
      }
      setMensagem({ tipo: 'erro', texto: 'E-mail ou senha inválidos.' });
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

    const erroSenha = validarSenhaForte(cadSenha);
    if (erroSenha) {
      setMensagem({ tipo: 'erro', texto: erroSenha });
      return;
    }

    if (!concordouTermos) {
      setMensagem({ tipo: 'erro', texto: 'Você deve concordar com os Termos de Uso.' });
      return;
    }

    setLoading(true);
    try {
      const data = await cadastrarUsuario({
        email: cadEmail.trim(),
        password: cadSenha,
        nomeResponsavel,
        nomeAssistencia,
        whatsapp,
        cpfCnpj,
      });

      // Confirmação de e-mail desligada no Supabase: a conta já entra logada
      if (data?.session) {
        try { sessionStorage.setItem('bancadaos_novo_cadastro', '1'); } catch (_) {}
        onLoginSuccess?.();
        return;
      }
      setLoginEmail(cadEmail.trim());
      irParaCodigo('verificar', cadEmail, `Conta criada! Enviamos um código de verificação para ${cadEmail.trim()}.`);
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

  /** Cadastro: confere o código e entra na conta. */
  const handleVerificar = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensagem(null);
    if (!codigoValido()) return;
    setLoading(true);
    try {
      await confirmarCadastroComCodigo(emailCodigo, codigo);
      try { sessionStorage.setItem('bancadaos_novo_cadastro', '1'); } catch (_) {}
      onLoginSuccess?.();
    } catch (err: any) {
      setMensagem({ tipo: 'erro', texto: err.message });
      setCodigo('');
    } finally {
      setLoading(false);
    }
  };


  /** Esqueci minha senha: envia o código para o e-mail. */
  const handleRecuperar = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensagem(null);
    if (!/^\S+@\S+\.\S+$/.test(loginEmail.trim())) {
      setMensagem({ tipo: 'erro', texto: 'Informe o e-mail da sua conta.' });
      return;
    }
    setLoading(true);
    try {
      await enviarCodigoRecuperacao(loginEmail);
      irParaCodigo(
        'redefinir',
        loginEmail,
        `Se houver uma conta com ${loginEmail.trim()}, enviamos um código para redefinir a senha. Confira também o spam.`
      );
    } catch (err: any) {
      setMensagem({ tipo: 'erro', texto: err.message });
    } finally {
      setLoading(false);
    }
  };

  /** Recuperação: confere o código, grava a nova senha e entra na conta. */
  const handleRedefinir = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensagem(null);
    if (!codigoValido()) return;
    const erroSenha = validarSenhaForte(novaSenha);
    if (erroSenha) {
      setMensagem({ tipo: 'erro', texto: erroSenha });
      return;
    }
    if (novaSenha !== confirmarNovaSenha) {
      setMensagem({ tipo: 'erro', texto: 'As senhas digitadas não coincidem.' });
      return;
    }
    setLoading(true);
    try {
      await redefinirSenhaComCodigo(emailCodigo, codigo, novaSenha);
      onLoginSuccess?.();
    } catch (err: any) {
      setMensagem({ tipo: 'erro', texto: err.message });
      setCodigo('');
    } finally {
      setLoading(false);
    }
  };

  const handleReenviar = async () => {
    if (reenviarEm > 0 || loading) return;
    setMensagem(null);
    setLoading(true);
    try {
      if (modo === 'verificar') await reenviarCodigoCadastro(emailCodigo);
      else await enviarCodigoRecuperacao(emailCodigo);
      setReenviarEm(ESPERA_REENVIO_S);
      setMensagem({ tipo: 'sucesso', texto: `Enviamos um novo código para ${emailCodigo}.` });
    } catch (err: any) {
      setMensagem({ tipo: 'erro', texto: err.message });
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

        {/* Topo: Logo Oficial BancadaOS */}
        <div className="relative z-10 flex items-center space-x-3.5">
          <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-lg shadow-blue-500/25 shrink-0 border border-blue-500/30 bg-[#0d131f] flex items-center justify-center">
            <SimboloBancadaOS />
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight text-white leading-none">
              <NomeBancadaOS />
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
            BancadaOS · Gestão Especializada para Assistências
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

          {/* Topo Mobile: Logo Oficial BancadaOS */}
          <div className="flex lg:hidden items-center space-x-3.5 mb-8">
            <div className="relative w-11 h-11 rounded-xl overflow-hidden shadow-lg shadow-blue-500/25 shrink-0 border border-blue-500/30 bg-[#0d131f] flex items-center justify-center">
              <SimboloBancadaOS />
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight text-white leading-none">
                <NomeBancadaOS />
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
                      onClick={() => trocarModo('recuperar')}
                      className="text-xs font-medium text-blue-400 hover:text-blue-300 transition"
                    >
                      Esqueci minha senha
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
          ) : modo === 'cadastro' ? (
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
                      placeholder="Ex: Smart Cell Assistência"
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
                      placeholder="8+ caracteres, letras e números"
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
                      Concordo com os{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setDocumentoAberto('termos');
                        }}
                        className="text-blue-400 underline hover:text-blue-300"
                      >
                        Termos de Uso
                      </button>{' '}
                      e a{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setDocumentoAberto('privacidade');
                        }}
                        className="text-blue-400 underline hover:text-blue-300"
                      >
                        Política de Privacidade
                      </button>{' '}
                      do sistema.
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
          ) : modo === 'recuperar' ? (
            <div>
              <div className="mb-8">
                <span className="text-xs font-bold tracking-widest text-blue-400 uppercase">RECUPERAR ACESSO</span>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-white mt-1.5 tracking-tight">Esqueceu a senha?</h3>
                <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                  Informe o e-mail da conta. Vamos enviar um código para você criar uma senha nova.
                </p>
              </div>

              <form onSubmit={handleRecuperar} className="space-y-5">
                <div>
                  <label className={labelCls}>E-MAIL DA CONTA</label>
                  <input
                    type="email"
                    autoComplete="email"
                    autoFocus
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="gestor@suaassistencia.com.br"
                    className={inputCls}
                  />
                </div>
                <button type="submit" disabled={loading} className={botaoPrincipalCls}>
                  {loading ? 'Enviando...' : 'Enviar código'}
                </button>
              </form>

              <button
                type="button"
                onClick={() => trocarModo('login')}
                className="mt-8 block mx-auto text-xs font-bold text-blue-400 hover:text-blue-300 transition"
              >
                Voltar para o login
              </button>
            </div>
          ) : (
            // verificar (cadastro) | redefinir (nova senha): código de 6 dígitos enviado por e-mail
            <div>
              <div className="mb-8">
                <span className="text-xs font-bold tracking-widest text-blue-400 uppercase">
                  {modo === 'verificar' ? 'CONFIRMAR E-MAIL' : 'NOVA SENHA'}
                </span>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-white mt-1.5 tracking-tight">
                  {modo === 'verificar' ? 'Digite o código' : 'Crie uma senha nova'}
                </h3>
                <p className="text-zinc-400 text-xs sm:text-sm mt-1">
                  Enviamos um código de 6 dígitos para <span className="font-semibold text-zinc-200">{emailCodigo}</span>.
                  Ele vale por pouco tempo. Não encontrou? Confira a <span className="font-semibold text-zinc-200">caixa de spam</span>.
                </p>
              </div>

              <form onSubmit={modo === 'verificar' ? handleVerificar : handleRedefinir} className="space-y-5" noValidate>
                <div>
                  <label className={labelCls}>CÓDIGO DE VERIFICAÇÃO</label>
                  <input
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    placeholder="000000"
                    aria-label="Código de verificação"
                    className={`${inputCls} text-center font-mono text-2xl tracking-[0.5em] placeholder-zinc-600`}
                  />
                </div>

                {modo === 'redefinir' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className={labelCls}>NOVA SENHA</label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={novaSenha}
                        onChange={(e) => setNovaSenha(e.target.value)}
                        placeholder="8+ caracteres, letras e números"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>CONFIRMAR SENHA</label>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={confirmarNovaSenha}
                        onChange={(e) => setConfirmarNovaSenha(e.target.value)}
                        placeholder="Repita a senha"
                        className={inputCls}
                      />
                    </div>
                  </div>
                )}

                <button type="submit" disabled={loading} className={botaoPrincipalCls}>
                  {loading ? 'Verificando...' : modo === 'verificar' ? 'Confirmar e entrar' : 'Salvar nova senha e entrar'}
                </button>
              </form>

              <div className="mt-6 space-y-3 text-center">
                <p className="text-xs text-zinc-400">
                  Não recebeu? Confira o spam ou{' '}
                  <button
                    type="button"
                    onClick={handleReenviar}
                    disabled={reenviarEm > 0 || loading}
                    className="font-bold text-blue-400 hover:text-blue-300 disabled:text-zinc-500 disabled:cursor-not-allowed transition"
                  >
                    {reenviarEm > 0 ? `reenvie em ${reenviarEm}s` : 'reenviar código'}
                  </button>
                </p>
                <button
                  type="button"
                  onClick={() => trocarModo(modo === 'verificar' ? 'cadastro' : 'recuperar')}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition"
                >
                  Usar outro e-mail
                </button>
                <button
                  type="button"
                  onClick={() => trocarModo('login')}
                  className="block mx-auto text-xs font-bold text-blue-400 hover:text-blue-300 transition"
                >
                  Voltar para o login
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="pt-6 text-center">
          <p className="text-[11px] text-zinc-400">
            BancadaOS · Versão 2.4.0
          </p>
        </div>
      </div>
      {documentoAberto && <DocumentosLegais inicial={documentoAberto} onFechar={() => setDocumentoAberto(null)} />}
    </div>
  );
};
