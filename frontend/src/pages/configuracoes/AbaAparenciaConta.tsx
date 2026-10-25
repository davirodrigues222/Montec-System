import React, { useState } from 'react';
import { alterarSenhaConta, gerarBackupConta, type ConfiguracoesLojaIsolada, type TemaVisual } from '../../services/api';
import { Campo, inputCls } from '../../components/cadastros/ui';
import { cardCls } from './tipos';
import { validarSenhaForte } from '../../utils/formatadores';

interface Props {
  config: ConfiguracoesLojaIsolada;
  emailConta: string;
  onSelecionarTema: (tema: TemaVisual) => void;
  onLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoverLogo: () => void;
}

const TEMAS: { id: TemaVisual; nome: string; detalhe: string; fundo: string; barra: string; ponto: string; traco: string; corNome: string; corDetalhe: string }[] = [
  { id: 'dark', nome: 'Escuro', detalhe: 'Grafite neutro', fundo: 'bg-[#09090b]', barra: 'bg-[#18181b] border-zinc-700', ponto: 'bg-zinc-400', traco: 'bg-zinc-600', corNome: 'text-zinc-100', corDetalhe: 'text-zinc-400' },
  { id: 'midnight', nome: 'Meia-noite', detalhe: 'Azul profundo', fundo: 'bg-[#070b14]', barra: 'bg-[#0e1424] border-blue-900/50', ponto: 'bg-blue-400', traco: 'bg-blue-900/80', corNome: 'text-blue-400', corDetalhe: 'text-slate-400' },
  { id: 'light', nome: 'Claro', detalhe: 'Fundo branco', fundo: 'bg-[#f1f5f9]', barra: 'bg-white border-slate-300', ponto: 'bg-blue-600', traco: 'bg-slate-300', corNome: 'text-slate-900', corDetalhe: 'text-slate-600' },
];

const baixarArquivo = (conteudo: string, nome: string, tipo: string) => {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/** Célula de CSV; textos que começam com = + - @ ganham apóstrofo para o Excel não executar como fórmula. */
const celulaCsv = (v: unknown) => {
  const texto = String(v ?? '');
  const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;
  return `"${seguro.replace(/"/g, '""')}"`;
};

export const AbaAparenciaConta: React.FC<Props> = ({ config, emailConta, onSelecionarTema, onLogoUpload, onRemoverLogo }) => {
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [msgSenha, setMsgSenha] = useState<{ ok: boolean; texto: string } | null>(null);
  const [exportando, setExportando] = useState<'json' | 'csv' | null>(null);

  const trocarSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    const erroSenha = validarSenhaForte(novaSenha);
    if (erroSenha) return setMsgSenha({ ok: false, texto: erroSenha });
    if (novaSenha !== confirmarSenha) return setMsgSenha({ ok: false, texto: 'As senhas não conferem.' });
    setSalvandoSenha(true);
    setMsgSenha(null);
    try {
      await alterarSenhaConta(novaSenha);
      setNovaSenha('');
      setConfirmarSenha('');
      setMsgSenha({ ok: true, texto: 'Senha da conta alterada.' });
    } catch (err: any) {
      setMsgSenha({ ok: false, texto: err.message });
    } finally {
      setSalvandoSenha(false);
    }
  };

  const exportar = async (formato: 'json' | 'csv') => {
    setExportando(formato);
    try {
      const backup = await gerarBackupConta();
      const data = backup.geradoEm.substring(0, 10);
      if (formato === 'json') {
        baixarArquivo(JSON.stringify(backup, null, 2), `backup_montec_${data}.json`, 'application/json');
      } else {
        const cabecalho = ['Numero OS', 'Abertura', 'Status', 'Cliente', 'WhatsApp', 'Aparelho', 'Defeito', 'Valor total', 'Valor liquido', 'Custo peca', 'Frete', 'Forma pagamento'];
        const linhas = backup.ordens_servico.map((os: any) =>
          [
            os.numero_os,
            os.data_abertura ? new Date(os.data_abertura).toLocaleDateString('pt-BR') : '',
            os.status_os,
            os.cliente?.nome,
            os.cliente?.whatsapp,
            os.aparelho?.modelo,
            os.defeitoRelatado,
            Number(os.orcamentoCalculado?.valorTotalOrcamento || 0).toFixed(2),
            Number(os.valorLiquido || 0).toFixed(2),
            Number(os.orcamentoCalculado?.custoPeca || 0).toFixed(2),
            Number(os.orcamentoCalculado?.freteReal || 0).toFixed(2),
            os.formaPagamento,
          ]
            .map(celulaCsv)
            .join(';')
        );
        // BOM para o Excel abrir acentos corretamente; ";" é o separador padrão no Excel em português
        baixarArquivo('﻿' + [cabecalho.map(celulaCsv).join(';'), ...linhas].join('\n'), `ordens_servico_${data}.csv`, 'text/csv;charset=utf-8');
      }
    } catch (err: any) {
      alert(err?.message || 'Não foi possível gerar o backup.');
    } finally {
      setExportando(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className={cardCls}>
        <div>
          <h3 className="text-sm font-bold text-white">Identidade visual</h3>
          <p className="text-xs text-zinc-400 mt-0.5">O logotipo aparece no cabeçalho do sistema e nos documentos impressos. Salva na hora.</p>
        </div>
        <div className="p-4 bg-[#080c14] border border-zinc-800/80 rounded-xl flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-[#0d131f] border border-blue-500/30 flex items-center justify-center overflow-hidden shrink-0">
            {config.logoUrl ? (
              <img src={config.logoUrl} alt="Logotipo" className="w-full h-full object-contain p-1" />
            ) : (
              <span className="text-lg font-black text-blue-400">{config.nomeLoja.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <label className="px-4 py-2 bg-[#0c101a] hover:bg-zinc-800 border border-zinc-700/80 text-white rounded-xl text-xs font-semibold cursor-pointer transition">
                {config.logoUrl ? 'Trocar logotipo' : 'Enviar logotipo'}
                <input type="file" accept="image/png, image/jpeg" onChange={onLogoUpload} className="hidden" />
              </label>
              {config.logoUrl && (
                <button
                  type="button"
                  onClick={onRemoverLogo}
                  className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 rounded-xl text-xs font-semibold transition"
                >
                  Remover logo
                </button>
              )}
            </div>
            <p className="text-[11px] text-zinc-400">PNG ou JPG, até 2 MB.</p>
          </div>
        </div>
      </div>

      <div className={cardCls}>
        <div>
          <h3 className="text-sm font-bold text-white">Tema da aplicação</h3>
          <p className="text-xs text-zinc-400 mt-0.5">Clique em um tema para aplicá-lo imediatamente e salvá-lo na sua conta.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {TEMAS.map((t) => {
            const ativo = config.temaVisual === t.id;
            return (
              <button
                key={t.id}
                type="button"
                data-theme-preview="true"
                onClick={() => onSelecionarTema(t.id)}
                aria-pressed={ativo}
                className={`p-4 rounded-xl border text-left transition flex flex-col justify-between h-32 ${t.fundo} ${
                  ativo ? 'border-blue-500 ring-2 ring-blue-500/40 shadow-md' : 'border-zinc-700/80 hover:border-blue-500/60'
                }`}
              >
                <div className={`w-full h-12 rounded-lg border flex items-center justify-between px-3 ${t.barra}`}>
                  <div className="flex items-center space-x-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${t.ponto}`} />
                    <span className={`w-8 h-2 rounded ${t.traco}`} />
                  </div>
                  {ativo && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white">Ativo</span>}
                </div>
                <div className="flex items-center justify-between w-full">
                  <span className={`text-xs font-bold ${t.corNome}`}>{t.nome}</span>
                  <span className={`text-[10px] ${t.corDetalhe}`}>{t.detalhe}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <form onSubmit={trocarSenha} className={cardCls} autoComplete="off">
          <div>
            <h3 className="text-sm font-bold text-white">Segurança da conta</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Conta conectada: <strong className="text-zinc-200">{emailConta || '—'}</strong>. Esta é a senha de login da conta,
              não a dos funcionários.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo label="Nova senha">
              <input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                autoComplete="new-password"
                className={inputCls()}
              />
            </Campo>
            <Campo label="Confirmar nova senha">
              <input
                type="password"
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
                autoComplete="new-password"
                className={inputCls()}
              />
            </Campo>
          </div>
          {msgSenha && (
            <p className={`text-xs font-semibold ${msgSenha.ok ? 'text-emerald-400' : 'text-red-400'}`}>
              {msgSenha.ok ? '✓ ' : ''}
              {msgSenha.texto}
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={salvandoSenha}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition"
            >
              {salvandoSenha ? 'Alterando...' : 'Alterar senha da conta'}
            </button>
          </div>
        </form>

        <div className={cardCls}>
          <div>
            <h3 className="text-sm font-bold text-white">Backup e exportação</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Baixa uma cópia dos dados reais da loja. A exportação só lê o banco, nada é alterado.
            </p>
          </div>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => exportar('json')}
              disabled={exportando !== null}
              className="w-full flex items-center justify-between gap-3 p-3.5 bg-[#080c14] hover:border-zinc-700 border border-zinc-800/80 rounded-xl text-left transition disabled:opacity-50"
            >
              <div>
                <p className="text-xs font-bold text-zinc-200">Backup completo (.json)</p>
                <p className="text-[11px] text-zinc-500">Configurações, ordens de serviço, clientes, fornecedores e serviços.</p>
              </div>
              <span className="text-xs font-bold text-blue-400 shrink-0">{exportando === 'json' ? 'Gerando...' : 'Baixar'}</span>
            </button>
            <button
              type="button"
              onClick={() => exportar('csv')}
              disabled={exportando !== null}
              className="w-full flex items-center justify-between gap-3 p-3.5 bg-[#080c14] hover:border-zinc-700 border border-zinc-800/80 rounded-xl text-left transition disabled:opacity-50"
            >
              <div>
                <p className="text-xs font-bold text-zinc-200">Ordens de serviço (.csv)</p>
                <p className="text-[11px] text-zinc-500">Planilha para abrir no Excel ou Google Planilhas.</p>
              </div>
              <span className="text-xs font-bold text-blue-400 shrink-0">{exportando === 'csv' ? 'Gerando...' : 'Baixar'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
