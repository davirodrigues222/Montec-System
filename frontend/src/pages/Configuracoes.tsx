import React, { useState, useEffect } from 'react';
import {
  obterConfiguracoesLojaSincrono,
  carregarConfiguracoesLoja,
  salvarConfiguracoesLoja,
  aplicarTemaVisualNoDOM,
  TERMOS_GARANTIA_PADRAO,
  type ConfiguracoesLojaIsolada,
  type TemaVisual,
} from '../services/api';

type ConfiguracoesLoja = ConfiguracoesLojaIsolada;

export const Configuracoes: React.FC = () => {
  const [config, setConfig] = useState<ConfiguracoesLoja>(() => {
    const inicial = obterConfiguracoesLojaSincrono();
    aplicarTemaVisualNoDOM(inicial.temaVisual);
    return inicial;
  });
  const [activeTab, setActiveTab] = useState<'aparencia' | 'termos'>('aparencia');
  const [salvandoFeedback, setSalvandoFeedback] = useState(false);
  const [mensagemFeedback, setMensagemFeedback] = useState(
    'Configurações salvas e vinculadas exclusivamente à sua conta!'
  );

  useEffect(() => {
    let ativo = true;
    // Carrega e valida as configurações exclusivas da conta autenticada atual
    carregarConfiguracoesLoja()
      .then((cfgIsolada) => {
        if (ativo) {
          setConfig(cfgIsolada);
          aplicarTemaVisualNoDOM(cfgIsolada.temaVisual);
        }
      })
      .catch(() => {
        if (ativo) {
          const fallback = obterConfiguracoesLojaSincrono();
          setConfig(fallback);
          aplicarTemaVisualNoDOM(fallback.temaVisual);
        }
      });

    const handleStorageUpdate = () => {
      if (ativo) {
        const atual = obterConfiguracoesLojaSincrono();
        setConfig(atual);
        aplicarTemaVisualNoDOM(atual.temaVisual);
      }
    };

    window.addEventListener('storage_configs_updated', handleStorageUpdate);
    return () => {
      ativo = false;
      window.removeEventListener('storage_configs_updated', handleStorageUpdate);
    };
  }, []);

  const exibirFeedback = (msg: string) => {
    setMensagemFeedback(msg);
    setSalvandoFeedback(true);
    setTimeout(() => setSalvandoFeedback(false), 3000);
  };

  const handleSalvar = async () => {
    try {
      aplicarTemaVisualNoDOM(config.temaVisual);
      const salvo = await salvarConfiguracoesLoja(config);
      setConfig(salvo);
      exibirFeedback('Configurações salvas e vinculadas exclusivamente à sua conta!');
    } catch (err: any) {
      alert(err.message || 'Não foi possível salvar as configurações da loja.');
    }
  };

  /**
   * Aplica imediatamente o tema selecionado em toda a aplicação e persiste na conta autenticada.
   */
  const handleSelecionarTema = async (novoTema: TemaVisual) => {
    const atualizado: ConfiguracoesLoja = { ...config, temaVisual: novoTema };
    setConfig(atualizado);
    aplicarTemaVisualNoDOM(novoTema);

    try {
      const salvo = await salvarConfiguracoesLoja(atualizado);
      setConfig(salvo);
      exibirFeedback('Tema aplicado e salvo na sua conta!');
    } catch (err: any) {
      console.error('Erro ao persistir tema da conta:', err);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('O arquivo selecionado ultrapassa o limite de 2 MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const novaLogo = reader.result as string;
        const atualizado = { ...config, logoUrl: novaLogo };
        setConfig(atualizado);
        try {
          await salvarConfiguracoesLoja(atualizado);
          exibirFeedback('Logotipo atualizado na sua conta!');
        } catch (err: any) {
          console.error('Erro ao salvar logo da conta:', err);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoverLogo = async () => {
    const atualizado = { ...config, logoUrl: '' };
    setConfig(atualizado);
    try {
      await salvarConfiguracoesLoja(atualizado);
      exibirFeedback('Logotipo removido da sua conta!');
    } catch (err: any) {
      console.error('Erro ao remover logo:', err);
    }
  };

  const handleRestaurarTermosPadrao = () => {
    if (window.confirm('Deseja restaurar os termos e condições padrão de assistência técnica?')) {
      setConfig((prev) => ({ ...prev, termosGarantiaTexto: TERMOS_GARANTIA_PADRAO }));
    }
  };

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto font-sans pb-12">
      {/* ================= CABEÇALHO (FIGMA) ================= */}
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Configurações
        </h2>
        <p className="text-xs text-zinc-400 mt-1">
          Logotipo, preferências visuais e regras de garantia da sua conta. Os dados de cada loja ficam em Cadastros › Lojas.
        </p>
      </div>

      {/* ================= BARRA DE ABAS (FIGMA) ================= */}
      <div className="flex items-center space-x-2 border-b border-zinc-800/80 pb-4">
        {/* Dados da loja (nome, CNPJ, telefone, endereço) agora ficam em Cadastros › Lojas */}
        {/* Aba Aparência */}
        <button
          type="button"
          onClick={() => setActiveTab('aparencia')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === 'aparencia'
              ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/20'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4 5 5 0 015-5h4a5 5 0 015 5 4 4 0 01-4 4H7zM16 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <span>Aparência</span>
        </button>

        {/* Aba Garantia e termos */}
        <button
          type="button"
          onClick={() => setActiveTab('termos')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === 'termos'
              ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/20'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span>Garantia e termos</span>
        </button>
      </div>

      {/* ================= ABA 1: APARÊNCIA ================= */}
      {activeTab === 'aparencia' && (
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-6 space-y-6 shadow-sm">
          {/* Card 1: Identidade Visual */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-bold text-white">Identidade visual</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Aparece no sistema e nos documentos impressos desta conta.</p>
            </div>

            <div className="p-4 bg-[#080c14] border border-zinc-800/80 rounded-xl flex items-center space-x-4">
              <div className="w-14 h-14 rounded-xl bg-[#0d131f] border border-blue-500/30 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                {config.logoUrl ? (
                  <img src={config.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <rect x="5" y="2" width="14" height="20" rx="3" ry="3" />
                    <line x1="12" y1="18" x2="12" y2="18.01" />
                  </svg>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center space-x-2">
                  <label className="px-4 py-2 bg-[#0c101a] hover:bg-zinc-800 border border-zinc-700/80 text-white rounded-xl text-xs font-semibold cursor-pointer inline-block transition shadow-sm">
                    Trocar logotipo
                    <input type="file" accept="image/png, image/jpeg" onChange={handleLogoUpload} className="hidden" />
                  </label>
                  {config.logoUrl && (
                    <button
                      type="button"
                      onClick={handleRemoverLogo}
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

          {/* Card 2: Tema da Aplicação */}
          <div className="space-y-3 pt-2">
            <div>
              <h3 className="text-sm font-bold text-white">Tema da aplicação</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Clique em um tema para aplicá-lo imediatamente em todo o sistema e salvá-lo na sua conta.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Opção 1: Tema Escuro */}
              <button
                type="button"
                data-theme-preview="true"
                onClick={() => handleSelecionarTema('dark')}
                className={`p-4 rounded-xl border text-left cursor-pointer transition flex flex-col justify-between h-32 ${
                  config.temaVisual === 'dark'
                    ? 'border-blue-500 bg-[#09090b] ring-2 ring-blue-500/40 shadow-md'
                    : 'border-zinc-700/80 bg-[#09090b] hover:border-blue-500/60'
                }`}
              >
                <div className="w-full h-12 rounded-lg bg-[#18181b] border border-zinc-700 flex items-center justify-between px-3">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-400" />
                    <span className="w-8 h-2 rounded bg-zinc-600" />
                  </div>
                  {config.temaVisual === 'dark' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                      Ativo
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-zinc-100">Escuro</span>
                  <span className="text-[10px] text-zinc-400">Grafite neutro</span>
                </div>
              </button>

              {/* Opção 2: Tema Meia-noite */}
              <button
                type="button"
                data-theme-preview="true"
                onClick={() => handleSelecionarTema('midnight')}
                className={`p-4 rounded-xl border text-left cursor-pointer transition flex flex-col justify-between h-32 ${
                  config.temaVisual === 'midnight'
                    ? 'border-blue-500 bg-[#070b14] ring-2 ring-blue-500/40 shadow-md'
                    : 'border-zinc-700/80 bg-[#070b14] hover:border-blue-500/60'
                }`}
              >
                <div className="w-full h-12 rounded-lg bg-[#0e1424] border border-blue-900/50 flex items-center justify-between px-3">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                    <span className="w-8 h-2 rounded bg-blue-900/80" />
                  </div>
                  {config.temaVisual === 'midnight' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                      Ativo
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-blue-400">Meia-noite</span>
                  <span className="text-[10px] text-slate-400">Azul profundo</span>
                </div>
              </button>

              {/* Opção 3: Tema Claro */}
              <button
                type="button"
                data-theme-preview="true"
                onClick={() => handleSelecionarTema('light')}
                className={`p-4 rounded-xl border text-left cursor-pointer transition flex flex-col justify-between h-32 ${
                  config.temaVisual === 'light'
                    ? 'border-blue-500 bg-[#f1f5f9] ring-2 ring-blue-500/40 shadow-md'
                    : 'border-slate-300 bg-[#f1f5f9] hover:border-blue-500/60'
                }`}
              >
                <div className="w-full h-12 rounded-lg bg-white border border-slate-300 flex items-center justify-between px-3 shadow-xs">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                    <span className="w-8 h-2 rounded bg-slate-300" />
                  </div>
                  {config.temaVisual === 'light' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                      Ativo
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold text-slate-900">Claro</span>
                  <span className="text-[10px] text-slate-600">Fundo branco</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= ABA 3: GARANTIA E TERMOS ================= */}
      {activeTab === 'termos' && (
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-6 space-y-6 shadow-sm">
          <div className="border-b border-zinc-800/60 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Parâmetros de Garantia e Termos Legais</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Defina os prazos operacionais e o texto de termos impresso no comprovante entregue ao cliente.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRestaurarTermosPadrao}
              className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold transition"
            >
              Restaurar termos padrão
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 bg-[#080c14] border border-zinc-800/80 rounded-xl space-y-1.5">
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                PRAZO PADRÃO DE GARANTIA (DIAS)
              </label>
              <input
                type="number"
                value={config.prazoGarantiaDias}
                onChange={(e) => setConfig({ ...config, prazoGarantiaDias: Number(e.target.value) || 90 })}
                className="w-full px-3.5 py-2 bg-[#0c101a] border border-zinc-800 rounded-xl text-white font-bold outline-none focus:border-blue-500"
              />
              <span className="text-[11px] text-zinc-400 block">
                Padrão legal do Art. 26 do Código de Defesa do Consumidor (90 dias).
              </span>
            </div>

            <div className="p-4 bg-[#080c14] border border-zinc-800/80 rounded-xl space-y-1.5">
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                LIMITE PARA RETIRADA / ABANDONO (DIAS)
              </label>
              <input
                type="number"
                value={config.prazoAbandonoDias}
                onChange={(e) => setConfig({ ...config, prazoAbandonoDias: Number(e.target.value) || 90 })}
                className="w-full px-3.5 py-2 bg-[#0c101a] border border-zinc-800 rounded-xl text-white font-bold outline-none focus:border-blue-500"
              />
              <span className="text-[11px] text-zinc-400 block">
                Prazo após conclusão do serviço para descarte ou cobrança de armazenamento.
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
              TERMOS E CONDIÇÕES DE GARANTIA (IMPRESSOS NO COMPROVANTE)
            </label>
            <textarea
              rows={8}
              value={config.termosGarantiaTexto}
              onChange={(e) => setConfig({ ...config, termosGarantiaTexto: e.target.value })}
              className="w-full p-4 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-zinc-200 leading-relaxed outline-none focus:border-blue-500 font-mono"
            />
            <p className="text-[11px] text-zinc-400">
              Este texto é impresso automaticamente no rodapé da Certidão de Garantia e Comprovante de Entrada.
            </p>
          </div>
        </div>
      )}

      {/* ================= BARRA INFERIOR: SALVAR CONFIGURAÇÕES ================= */}
      <div className="flex items-center justify-between pt-2">
        <div>
          {salvandoFeedback && (
            <span className="text-xs font-bold text-emerald-400 flex items-center space-x-1.5">
              <span>✓</span>
              <span>{mensagemFeedback}</span>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleSalvar}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold rounded-xl text-xs transition shadow-md shadow-blue-600/20"
        >
          Salvar configurações
        </button>
      </div>
    </div>
  );
};