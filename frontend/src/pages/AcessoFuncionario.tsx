import React, { useEffect, useState } from 'react';
import {
  CARGOS,
  PERMISSOES_PENDENTES,
  MENSAGEM_CODIGO_INVALIDO,
  REGEX_CODIGO_ACESSO,
  TabelaAusenteError,
  contarFuncionarios,
  salvarFuncionario,
  somenteDigitosCodigo,
  sugerirProximoCodigoAcesso,
} from '../services/cadastros';
import { type Operador, entrarComoProprietario, entrarFuncionario, primeiraAbaPermitida } from '../services/acesso';
import { fazerLogout, obterConfiguracoesLojaSincrono } from '../services/api';
import { Campo, inputCls } from '../components/cadastros/ui';
import { validarSenhaForte } from '../utils/formatadores';

type Modo = 'carregando' | 'entrar' | 'primeiro-admin' | 'solicitar' | 'proprietario' | 'erro';


interface Props {
  session: any;
  /** token: sessão do funcionário no banco (permite o F5 sem pedir a senha de novo). */
  onEntrar: (operador: Operador, token?: string | null) => void;
}

/**
 * Tela exibida depois do login da conta e sempre que o sistema é aberto de novo (o F5 não pede outra vez):
 * identifica qual funcionário vai usar o sistema e, com isso, quais telas ele pode ver.
 */
export const AcessoFuncionario: React.FC<Props> = ({ session, onEntrar }) => {
  const [modo, setModo] = useState<Modo>('carregando');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mostrarSenha, setMostrarSenha] = useState(false);

  const [codigo, setCodigo] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [nome, setNome] = useState('');
  const [senhaConta, setSenhaConta] = useState('');

  const loja = obterConfiguracoesLojaSincrono(session?.user);
  const emailConta: string = session?.user?.email || '';
  const nomeResponsavel: string = session?.user?.user_metadata?.nome_responsavel || '';

  const iniciar = async () => {
    setModo('carregando');
    setErro(null);
    try {
      const total = await contarFuncionarios();
      if (total === 0) setCodigo('1'); // primeiro administrador: código 1 sugerido
      setModo(total === 0 ? 'primeiro-admin' : 'entrar');
    } catch (e: any) {
      if (e instanceof TabelaAusenteError) {
        // Módulo de funcionários ainda não ativado no banco: segue como antes, com acesso do proprietário
        onEntrar({ idFuncionario: null, nome: nomeResponsavel || 'Proprietário', cargo: 'ADMIN', permissoes: CARGOS.ADMIN.permissoes, lojas: [], proprietario: true });
        return;
      }
      setErro(e.message);
      setModo('erro');
    }
  };

  useEffect(() => {
    iniciar();
  }, []);

  const trocarModo = (m: Modo) => {
    setModo(m);
    setErro(null);
    setSenha('');
    setConfirmar('');
    setSenhaConta('');
    setMostrarSenha(false);
    if (m === 'solicitar') {
      setCodigo('');
      sugerirProximoCodigoAcesso().then((c) => setCodigo((atual) => atual || c));
    }
  };

  /** Valida e entra; quem ainda não tem nenhuma tela liberada fica na tela de acesso com um aviso. */
  const concluirEntrada = (op: Operador, token: string | null) => {
    if (!primeiraAbaPermitida(op)) {
      setAviso(null);
      setErro(`Olá, ${op.nome.split(' ')[0]}! Seu cadastro ainda aguarda liberação. Peça a um administrador para liberar suas telas em Cadastros › Funcionários.`);
      setSenha('');
      return;
    }
    onEntrar(op, token);
  };

  const entrar = async () => {
    if (!codigo.trim() || !senha) {
      setErro('Informe seu código de acesso e sua senha.');
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const resultado = await entrarFuncionario(codigo, senha);
      if (!resultado) {
        setErro('Código de acesso ou senha inválidos. Após 5 tentativas o acesso é bloqueado por 15 minutos.');
        setSenha('');
        return;
      }
      concluirEntrada(resultado.operador, resultado.token);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const validarCadastro = (): string | null => {
    if (nome.trim().length < 2) return 'Informe seu nome completo.';
    if (!REGEX_CODIGO_ACESSO.test(codigo.trim())) return MENSAGEM_CODIGO_INVALIDO;
    const erroSenha = validarSenhaForte(senha);
    if (erroSenha) return erroSenha;
    if (senha !== confirmar) return 'As senhas não conferem.';
    return null;
  };

  /** primeiro-admin: cria o administrador e já entra | solicitar: cria sem telas liberadas e volta para o login */
  const cadastrar = async () => {
    const msg = validarCadastro();
    if (msg) {
      setErro(msg);
      return;
    }
    const primeiro = modo === 'primeiro-admin';
    setEnviando(true);
    setErro(null);
    try {
      await salvarFuncionario(
        {
          nome: nome.trim(),
          codigo_acesso: codigo.trim(),
          cpf: null,
          telefone: null,
          email: null,
          cargo: primeiro ? 'ADMIN' : 'ATENDENTE',
          permissoes: primeiro ? CARGOS.ADMIN.permissoes : PERMISSOES_PENDENTES,
          ativo: true,
        },
        [],
        senha
      );

      if (primeiro) {
        const resultado = await entrarFuncionario(codigo, senha);
        if (resultado) {
          onEntrar(resultado.operador, resultado.token);
          return;
        }
        setAviso('Administrador cadastrado. Entre com o código e a senha que você acabou de criar.');
      } else {
        setAviso(`Cadastro de ${nome.trim().split(' ')[0]} enviado. Um administrador precisa liberar suas telas em Cadastros › Funcionários antes do primeiro acesso.`);
      }
      setNome('');
      trocarModo('entrar');
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const entrarProprietario = async () => {
    if (!senhaConta) {
      setErro('Informe a senha da conta.');
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const resultado = await entrarComoProprietario(emailConta, senhaConta, nomeResponsavel);
      onEntrar(resultado.operador, resultado.token);
    } catch (e: any) {
      setErro(e.message);
      setSenhaConta('');
    } finally {
      setEnviando(false);
    }
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    if (modo === 'entrar') entrar();
    else if (modo === 'primeiro-admin' || modo === 'solicitar') cadastrar();
    else if (modo === 'proprietario') entrarProprietario();
  };

  const campoSenha = (valor: string, onChange: (v: string) => void, label: string, autoComplete: string, autoFocus = false) => (
    <Campo label={label} obrigatorio>
      <div className="relative">
        <input
          type={mostrarSenha ? 'text' : 'password'}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          className={`${inputCls()} pr-16 py-3`}
        />
        <button
          type="button"
          onClick={() => setMostrarSenha((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-bold text-zinc-400 hover:text-white"
        >
          {mostrarSenha ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
    </Campo>
  );

  const titulos: Record<Modo, { titulo: string; subtitulo: string }> = {
    carregando: { titulo: 'Identificação', subtitulo: 'Carregando...' },
    erro: { titulo: 'Identificação', subtitulo: 'Não foi possível carregar os funcionários.' },
    entrar: { titulo: 'Quem está usando o sistema?', subtitulo: 'Informe seu código de acesso e sua senha de funcionário.' },
    'primeiro-admin': {
      titulo: 'Cadastre o primeiro administrador',
      subtitulo: 'Esta conta ainda não tem funcionários. O administrador terá acesso total e poderá liberar as telas de cada funcionário.',
    },
    solicitar: {
      titulo: 'Novo funcionário',
      subtitulo: 'Crie seu acesso. Suas telas serão liberadas por um administrador.',
    },
    proprietario: {
      titulo: 'Acesso do proprietário',
      subtitulo: `Confirme a senha da conta ${emailConta} para entrar com acesso total.`,
    },
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#080c14] text-zinc-100 font-sans p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl overflow-hidden border border-blue-500/30 bg-[#0d131f] shrink-0 flex items-center justify-center">
            {loja.logoUrl ? (
              <img src={loja.logoUrl} alt={loja.nomeLoja} className="w-full h-full object-contain p-1" />
            ) : (
              <img src="/logo-montec.png" alt="Montec System" className="w-full h-full object-cover" onError={(e) => ((e.target as HTMLElement).style.display = 'none')} />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-extrabold text-white truncate">{loja.nomeLoja || 'Montec System'}</p>
            <p className="text-xs text-zinc-400 truncate">{emailConta}</p>
          </div>
        </div>

        <form onSubmit={enviar} noValidate className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-6 shadow-xl space-y-5">
          <div>
            <h1 className="text-lg font-extrabold text-white">{titulos[modo].titulo}</h1>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{titulos[modo].subtitulo}</p>
          </div>

          {aviso && <div className="px-3.5 py-3 rounded-xl border text-xs font-semibold bg-emerald-500/10 border-emerald-500/30 text-emerald-400">{aviso}</div>}
          {erro && (
            <div role="alert" className="px-3.5 py-3 rounded-xl border text-xs font-semibold bg-red-500/10 border-red-500/30 text-red-400">
              {erro}
            </div>
          )}

          {modo === 'carregando' && (
            <div className="flex justify-center py-6">
              <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
            </div>
          )}

          {modo === 'erro' && (
            <button type="button" onClick={iniciar} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm transition">
              Tentar novamente
            </button>
          )}

          {modo === 'entrar' && (
            <>
              <Campo label="Código de acesso" obrigatorio>
                <input
                  value={codigo}
                  onChange={(e) => setCodigo(somenteDigitosCodigo(e.target.value))}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="username"
                  autoFocus
                  placeholder="ex: 1024"
                  className={`${inputCls()} py-3 font-mono`}
                />
              </Campo>
              {campoSenha(senha, setSenha, 'Senha', 'current-password')}
            </>
          )}

          {(modo === 'primeiro-admin' || modo === 'solicitar') && (
            <>
              <Campo label="Nome completo" obrigatorio>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  autoFocus
                  placeholder="Seu nome"
                  className={`${inputCls()} py-3`}
                />
              </Campo>
              <Campo label="Código de acesso (ID)" obrigatorio dica="Somente números inteiros. Você vai usar este código para entrar.">
                <input
                  value={codigo}
                  onChange={(e) => setCodigo(somenteDigitosCodigo(e.target.value))}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="username"
                  placeholder="ex: 1024"
                  className={`${inputCls()} py-3 font-mono`}
                />
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                {campoSenha(senha, setSenha, 'Senha', 'new-password')}
                <Campo label="Confirmar" obrigatorio>
                  <input
                    type={mostrarSenha ? 'text' : 'password'}
                    value={confirmar}
                    onChange={(e) => setConfirmar(e.target.value)}
                    autoComplete="new-password"
                    className={`${inputCls()} py-3`}
                  />
                </Campo>
              </div>
            </>
          )}

          {modo === 'proprietario' && campoSenha(senhaConta, setSenhaConta, 'Senha da conta', 'current-password', true)}

          {modo !== 'carregando' && modo !== 'erro' && (
            <button
              type="submit"
              disabled={enviando}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition shadow-md shadow-blue-600/20"
            >
              {enviando
                ? 'Aguarde...'
                : modo === 'entrar'
                ? 'Entrar'
                : modo === 'primeiro-admin'
                ? 'Cadastrar administrador e entrar'
                : modo === 'solicitar'
                ? 'Enviar cadastro'
                : 'Entrar como proprietário'}
            </button>
          )}

          {modo === 'entrar' && (
            <div className="pt-1 border-t border-zinc-800/60 space-y-2 text-center">
              <button type="button" onClick={() => { setAviso(null); trocarModo('solicitar'); }} className="block w-full pt-3 text-xs font-bold text-blue-400 hover:text-blue-300">
                Ainda não tem cadastro? Cadastrar novo funcionário
              </button>
              <button type="button" onClick={() => { setAviso(null); trocarModo('proprietario'); }} className="text-[11px] text-zinc-500 hover:text-zinc-300">
                Esqueceu a senha? Entrar como proprietário da conta
              </button>
            </div>
          )}

          {(modo === 'solicitar' || modo === 'proprietario') && (
            <button type="button" onClick={() => trocarModo('entrar')} className="block w-full text-center text-xs font-semibold text-zinc-400 hover:text-white">
              ← Voltar para a identificação
            </button>
          )}
        </form>

        <button
          type="button"
          onClick={() => fazerLogout().catch(() => {})}
          className="block mx-auto text-[11px] text-zinc-500 hover:text-rose-400 transition"
        >
          Sair da conta {emailConta}
        </button>
      </div>
    </div>
  );
};
