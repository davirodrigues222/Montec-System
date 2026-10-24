import React, { useState, useEffect } from 'react';
import {
  type ConfiguracoesLojaIsolada,
  type TemaVisual,
  TERMOS_GARANTIA_PADRAO,
  aplicarTemaVisualNoDOM,
  carregarConfiguracoesLoja,
  obterConfiguracoesLojaSincrono,
  salvarConfiguracoesLoja,
} from '../services/api';

export const Configuracoes: React.FC = () => {
  // Leitura inicial síncrona do cofre da conta ativa (nunca herda logo de outra conta)
  const [config, setConfig] = useState<ConfiguracoesLojaIsolada>(() => obterConfiguracoesLojaSincrono());
  const [activeTab, setActiveTab] = useState<'dados' | 'aparencia' | 'termos'>('aparencia');
  const [salvandoFeedback, setSalvandoFeedback] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);

  useEffect(() => {
    // Revalida com a sessão autenticada do Supabase (supabase.auth.getUser)
    carregarConfiguracoesLoja()
      .then((cfg) => setConfig(cfg))
      .catch((e) => console.error('Erro ao carregar configurações da conta:', e));
  }, []);

  const persistir = async (parcial: Partial<ConfiguracoesLojaIsolada>) => {
    setErroSalvar(null);
    try {
      const salvo = await salvarConfiguracoesLoja(parcial);
      setConfig(salvo);
      return true;
    } catch (e: any) {
      console.error('Erro ao salvar configurações:', e);
      setErroSalvar(e?.message || 'Não foi possível salvar as configurações.');
      return false;
    }
  };

  const handleSalvar = async () => {
    if (await persistir(config)) {
      setSalvandoFeedback(true);
      setTimeout(() => setSalvandoFeedback(false), 3000);
    }
  };

  const handleSelecionarTema = (tema: TemaVisual) => {
    // Aplica na hora no <html> e grava a preferência na conta ativa
    aplicarTemaVisualNoDOM(tema);
    setConfig((prev) => ({ ...prev, temaVisual: tema }));
    persistir({ temaVisual: tema });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('O arquivo selecionado ultrapassa o limite de 2 MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const novaLogo = reader.result as string;
        setConfig((prev) => ({ ...prev, logoUrl: novaLogo }));
        // Salva imediatamente na conta ativa; o evento storage_configs_updated atualiza o topo na hora
        persistir({ logoUrl: novaLogo });
      };
      reader.readAsDataURL(file);
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
          Identidade da loja, preferências visuais e regras operacionais.
        </p>
      </div>

      {/* ================= BARRA DE ABAS ================= */}
      <div className="flex items-center space-x-2 border-b border-zinc-800/80 pb-4">
        <button
          onClick={() => setActiveTab('dados')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition ${
            activeTab === 'dados'
              ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-600/20'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <span>Dados da loja</span>
        </button>

        <button
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

        <button
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

      {/* ================= ABA 1: DADOS DA LOJA ================= */}
      {activeTab === 'dados' && (
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-6 space-y-6 shadow-sm">
          <div className="border-b border-zinc-800/60 pb-3">
            <h3 className="text-sm font-bold text-white">Informações do Estabelecimento</h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Estes dados serão exibidos nos cabeçalhos de ordens de serviço, relatórios e recibos de garantia.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                NOME DA LOJA
              </label>
              <input
                type="text"
                value={config.nomeLoja}
                onChange={(e) => setConfig({ ...config, nomeLoja: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-white outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                SUBTÍTULO / ESPECIALIDADE
              </label>
              <input
                type="text"
                value={config.subtitulo}
                onChange={(e) => setConfig({ ...config, subtitulo: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-white outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                TELEFONE / WHATSAPP COMERCIAL
              </label>
              <input
                type="text"
                value={config.telefone}
                onChange={(e) => setConfig({ ...config, telefone: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-white outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                CNPJ OU CPF
              </label>
              <input
                type="text"
                value={config.cnpj}
                onChange={(e) => setConfig({ ...config, cnpj: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-white outline-none focus:border-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                ENDEREÇO COMPLETO
              </label>
              <input
                type="text"
                value={config.endereco}
                onChange={(e) => setConfig({ ...config, endereco: e.target.value })}
                placeholder="Rua, Número, Bairro, Cidade - UF"
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800/80 rounded-xl text-white outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* ================= ABA 2: APARÊNCIA ================= */}
      {activeTab === 'aparencia' && (
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-6 space-y-6 shadow-sm">
          {/* Card 1: Identidade Visual */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-bold text-white">Identidade visual</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Aparece no sistema e nos documentos impressos.</p>
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

              <div>
                <label className="px-4 py-2 bg-[#0c101a] hover:bg-zinc-800 border border-zinc-700/80 text-white rounded-xl text-xs font-semibold cursor-pointer inline-block transition shadow-sm">
                  Trocar logotipo
                  <input type="file" accept="image/png, image/jpeg" onChange={handleLogoUpload} className="hidden" />
                </label>
                <p className="text-[11px] text-zinc-400 mt-1">PNG ou JPG, até 2 MB.</p>
              </div>
            </div>
          </div>

          {/* Card 2: Tema da Aplicação */}
          <div className="space-y-3 pt-2">
            <div>
              <h3 className="text-sm font-bold text-white">Tema da aplicação</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div
                data-theme-preview
                onClick={() => handleSelecionarTema('dark')}
                className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between h-32 ${
                  config.temaVisual === 'dark'
                    ? 'border-blue-500 bg-[#07090e] ring-2 ring-blue-500/30'
                    : 'border-zinc-800/80 bg-[#07090e] hover:border-zinc-700'
                }`}
              >
                <div className="w-full h-12 rounded-lg bg-zinc-900 border border-zinc-800 opacity-60" />
                <span className="text-xs font-semibold text-zinc-200">Escuro</span>
              </div>

              <div
                data-theme-preview
                onClick={() => handleSelecionarTema('midnight')}
                className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between h-32 ${
                  config.temaVisual === 'midnight'
                    ? 'border-blue-500 bg-[#070b14] ring-2 ring-blue-500/30'
                    : 'border-zinc-800/80 bg-[#070b14] hover:border-zinc-700'
                }`}
              >
                <div className="w-full h-12 rounded-lg bg-[#0e1424] border border-blue-900/40 opacity-70" />
                <span className="text-xs font-semibold text-blue-400">Meia-noite</span>
              </div>

              <div
                data-theme-preview
                onClick={() => handleSelecionarTema('light')}
                className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between h-32 ${
                  config.temaVisual === 'light'
                    ? 'border-blue-500 bg-[#f4f5f8] ring-2 ring-blue-500/30'
                    : 'border-zinc-800/80 bg-[#f4f5f8] hover:border-zinc-700'
                }`}
              >
                <div className="w-full h-12 rounded-lg bg-white border border-gray-300 opacity-80" />
                <span className="text-xs font-semibold text-gray-800">Claro</span>
              </div>
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

      {/* ================= BARRA INFERIOR ================= */}
      <div className="flex items-center justify-between pt-2">
        <div>
          {salvandoFeedback && (
            <span className="text-xs font-bold text-emerald-400 flex items-center space-x-1.5">
              <span>✓</span>
              <span>Configurações salvas e aplicadas em todo o sistema!</span>
            </span>
          )}
          {erroSalvar && <span className="text-xs font-bold text-red-400">{erroSalvar}</span>}
        </div>

        <button
          onClick={handleSalvar}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold rounded-xl text-xs transition shadow-md shadow-blue-600/20"
        >
          Salvar configurações
        </button>
      </div>
    </div>
  );
};