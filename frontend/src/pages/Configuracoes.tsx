import React, { useEffect, useRef, useState } from 'react';
import {
  aplicarTemaVisualNoDOM,
  carregarConfiguracoesLoja,
  obterConfiguracoesLojaSincrono,
  obterMetaFinanceiraConta,
  obterUsuarioAtivoSincrono,
  parsearValorMonetarioBR,
  salvarConfiguracoesLoja,
  salvarMetaFinanceiraConta,
  type ConfiguracoesLojaIsolada,
  type TemaVisual,
} from '../services/api';
import { useFeedback } from '../components/cadastros/ui';
import { formatarValor } from '../utils/formatadores';
import type { SecaoCadastro, SecaoConfiguracao } from '../types';
import { SECOES_CONFIGURACAO } from './configuracoes/secoes';
import { AbaDadosLoja } from './configuracoes/AbaDadosLoja';
import { AbaFinanceiro } from './configuracoes/AbaFinanceiro';
import { AbaOperacional } from './configuracoes/AbaOperacional';
import { AbaWhatsapp } from './configuracoes/AbaWhatsapp';
import { AbaEquipe } from './configuracoes/AbaEquipe';
import { AbaAparenciaConta } from './configuracoes/AbaAparenciaConta';
import { AbaLeisTermos } from './configuracoes/AbaLeisTermos';
import { AbaAssinatura } from './configuracoes/AbaAssinatura';
import { useOperador } from '../contexts/OperadorContext';

interface Props {
  /** Seção escolhida nos subitens de Configurações do menu lateral. */
  secao: SecaoConfiguracao;
  /** Abre um submódulo de Cadastros (usado pela seção Equipe). */
  onAbrirCadastro?: (secao: SecaoCadastro) => void;
}

export const Configuracoes: React.FC<Props> = ({ secao, onAbrirCadastro }) => {
  const [config, setConfig] = useState<ConfiguracoesLojaIsolada>(() => {
    const inicial = obterConfiguracoesLojaSincrono();
    aplicarTemaVisualNoDOM(inicial.temaVisual);
    return inicial;
  });
  const aba = secao;
  const { pode } = useOperador();
  const [salvando, setSalvando] = useState(false);
  const feedback = useFeedback();

  // Meta mensal: editada como texto em R$ e gravada pela mesma função usada em Relatórios
  const metaSalva = useRef(formatarValor(obterMetaFinanceiraConta()));
  const [metaInput, setMetaInput] = useState(() => formatarValor(obterMetaFinanceiraConta()));
  const [erroMeta, setErroMeta] = useState<string | null>(null);

  // Alterações ainda não salvas: atualizações vindas de outras telas não podem apagá-las
  const [alterado, setAlterado] = useState(false);
  const alteradoRef = useRef(false);
  const marcarAlterado = (valor: boolean) => {
    alteradoRef.current = valor;
    setAlterado(valor);
  };

  const alterar = (parcial: Partial<ConfiguracoesLojaIsolada>) => {
    setConfig((atual) => ({ ...atual, ...parcial }));
    marcarAlterado(true);
  };

  useEffect(() => {
    let ativo = true;
    const sincronizar = (cfg: ConfiguracoesLojaIsolada) => {
      if (!ativo) return;
      // Tema e logotipo são salvos na hora; o resto só é recarregado se não houver edição pendente
      setConfig((atual) => (alteradoRef.current ? { ...atual, temaVisual: cfg.temaVisual, logoUrl: cfg.logoUrl } : cfg));
      aplicarTemaVisualNoDOM(cfg.temaVisual);
    };
    carregarConfiguracoesLoja()
      .then(sincronizar)
      .catch(() => sincronizar(obterConfiguracoesLojaSincrono()));

    const aoAtualizar = () => sincronizar(obterConfiguracoesLojaSincrono());
    window.addEventListener('storage_configs_updated', aoAtualizar);
    return () => {
      ativo = false;
      window.removeEventListener('storage_configs_updated', aoAtualizar);
    };
  }, []);

  const handleSalvar = async () => {
    // Os erros indicam a seção em vez de trocar de seção: cada seção pode exigir autorização própria
    if (!config.nomeLoja.trim()) {
      feedback.erro('Informe o nome fantasia em Configurações › Impressão.');
      return;
    }
    const metaAlterada = metaInput.trim() !== metaSalva.current;
    const validacaoMeta = metaAlterada ? parsearValorMonetarioBR(metaInput) : null;
    if (validacaoMeta && !validacaoMeta.valido) {
      const erro = validacaoMeta.erro || 'Valor de meta inválido.';
      setErroMeta(erro);
      if (aba !== 'financeiro') feedback.erro(`Meta mensal em Configurações › Taxas: ${erro}`);
      return;
    }

    setSalvando(true);
    setErroMeta(null);
    try {
      // Tema e logotipo já foram salvos na hora; a meta é gravada à parte (com o histórico do mês)
      const { metaFaturamentoMensal: _meta, historicoMetasMensais: _historico, temaVisual: _tema, logoUrl: _logo, ...resto } = config;
      let salvo = await salvarConfiguracoesLoja(resto);
      if (validacaoMeta?.valido) {
        salvo = (await salvarMetaFinanceiraConta(validacaoMeta.valor)).config;
      }
      setConfig(salvo);
      metaSalva.current = formatarValor(obterMetaFinanceiraConta());
      setMetaInput(metaSalva.current);
      marcarAlterado(false);
      feedback.sucesso('Configurações salvas e aplicadas no sistema.');
    } catch (err: any) {
      feedback.erro(err?.message || 'Não foi possível salvar as configurações.');
    } finally {
      setSalvando(false);
    }
  };

  const descartar = () => {
    setConfig(obterConfiguracoesLojaSincrono());
    metaSalva.current = formatarValor(obterMetaFinanceiraConta());
    setMetaInput(metaSalva.current);
    setErroMeta(null);
    marcarAlterado(false);
  };

  const handleSelecionarTema = async (tema: TemaVisual) => {
    setConfig((atual) => ({ ...atual, temaVisual: tema }));
    aplicarTemaVisualNoDOM(tema);
    try {
      await salvarConfiguracoesLoja({ temaVisual: tema });
      feedback.sucesso('Tema aplicado e salvo na sua conta.');
    } catch (err: any) {
      feedback.erro(err?.message || 'Não foi possível salvar o tema.');
    }
  };

  const salvarLogo = async (logoUrl: string, mensagem: string) => {
    setConfig((atual) => ({ ...atual, logoUrl }));
    try {
      await salvarConfiguracoesLoja({ logoUrl });
      feedback.sucesso(mensagem);
    } catch (err: any) {
      feedback.erro(err?.message || 'Não foi possível salvar o logotipo.');
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      feedback.erro('O arquivo selecionado ultrapassa o limite de 2 MB.');
      return;
    }
    // Reduz o logo para no máximo 400 px antes de salvar: fica com poucos KB e não estoura
    // o armazenamento do navegador (um logo de 2 MB ocupava quase todo o espaço disponível)
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, 400 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * escala));
      canvas.height = Math.max(1, Math.round(img.height * escala));
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      // PNG preserva transparência; JPG vira JPEG comprimido
      const dados = file.type === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85);
      salvarLogo(dados, 'Logotipo atualizado na sua conta.');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      feedback.erro('Não foi possível ler a imagem. Use um arquivo PNG ou JPG.');
    };
    img.src = url;
  };

  const secaoAtual = SECOES_CONFIGURACAO.find((s) => s.id === aba) || SECOES_CONFIGURACAO[0];

  // Abas que editam a configuração (as demais têm ações próprias)
  const abaComFormulario = aba !== 'equipe' && aba !== 'conta' && aba !== 'assinatura' && aba !== 'leis';

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto font-sans pb-24">
      {/* Cabeçalho da seção (as seções ficam como subitens de Configurações no menu lateral) */}
      <div>
        <span className="text-[10px] sm:text-[11px] font-bold tracking-widest text-blue-400 uppercase">Configurações</span>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-0.5">{secaoAtual.rotulo}</h2>
        <p className="text-xs text-zinc-400 mt-1">
          {secaoAtual.descricao}
          {aba !== 'assinatura' && ' Tudo é salvo só nesta conta.'}
        </p>
      </div>

      <feedback.Feedback />

      {aba === 'loja' && <AbaDadosLoja config={config} alterar={alterar} />}
      {aba === 'financeiro' && (
        <AbaFinanceiro
          config={config}
          alterar={alterar}
          metaInput={metaInput}
          setMetaInput={(v) => {
            setMetaInput(v);
            setErroMeta(null);
            marcarAlterado(true);
          }}
          erroMeta={erroMeta}
        />
      )}
      {aba === 'operacional' && <AbaOperacional config={config} alterar={alterar} />}
      {aba === 'whatsapp' && <AbaWhatsapp config={config} alterar={alterar} />}
      {aba === 'equipe' && <AbaEquipe onAbrirCadastro={onAbrirCadastro} />}
      {aba === 'assinatura' && <AbaAssinatura />}
      {aba === 'leis' && <AbaLeisTermos config={config} alterar={alterar} podeEditar={pode('tela_configuracoes')} />}
      {aba === 'conta' && (
        <AbaAparenciaConta
          config={config}
          emailConta={obterUsuarioAtivoSincrono()?.email || ''}
          onSelecionarTema={handleSelecionarTema}
          onLogoUpload={handleLogoUpload}
          onRemoverLogo={() => salvarLogo('', 'Logotipo removido da sua conta.')}
        />
      )}

      {/* Barra de salvamento: aparece nas abas de formulário ou sempre que houver alteração pendente */}
      {(abaComFormulario || alterado) && (
        <div className="sticky bottom-0 z-20 -mx-1 px-1">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-[#0c101a]/95 backdrop-blur border border-zinc-800/80 rounded-2xl shadow-lg">
            <span className={`text-xs font-semibold ${alterado ? 'text-amber-400' : 'text-zinc-500'}`}>
              {alterado ? 'Há alterações não salvas.' : 'Nenhuma alteração pendente.'}
            </span>
            <div className="flex gap-2">
              {alterado && (
                <button
                  type="button"
                  onClick={descartar}
                  disabled={salvando}
                  className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold transition"
                >
                  Descartar
                </button>
              )}
              <button
                type="button"
                onClick={handleSalvar}
                disabled={salvando || !alterado}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition shadow-md shadow-blue-600/20"
              >
                {salvando ? 'Salvando...' : 'Salvar configurações'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
