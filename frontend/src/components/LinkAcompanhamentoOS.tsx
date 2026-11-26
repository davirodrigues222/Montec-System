import React, { useState } from 'react';
import { Copy, ExternalLink, Link2, RefreshCw } from 'lucide-react';
import { gerarLinkAcompanhamento, revogarLinkAcompanhamento } from '../services/acompanhamento';
import type { OrdemServico } from '../types';

/**
 * Botão "Copiar link de acompanhamento" (tela de sucesso da Nova OS). Gera o link e copia; se o
 * navegador não deixar copiar depois da espera (ex.: Safari), mostra o link para copiar à mão.
 */
export const BotaoCopiarLinkAcompanhamento: React.FC<{ idOs: string; className: string }> = ({ idOs, className }) => {
  const [link, setLink] = useState('');
  const [estado, setEstado] = useState<'parado' | 'gerando' | 'copiado' | 'copie' | 'erro'>('parado');
  const [erro, setErro] = useState('');

  const copiar = async () => {
    setEstado('gerando');
    try {
      const gerado = link || (await gerarLinkAcompanhamento(idOs));
      setLink(gerado);
      try {
        await navigator.clipboard.writeText(gerado);
        setEstado('copiado');
      } catch {
        setEstado('copie');
      }
    } catch (e: any) {
      setErro(e.message);
      setEstado('erro');
    }
  };

  return (
    <div className="space-y-1.5">
      <button type="button" onClick={copiar} disabled={estado === 'gerando'} className={className}>
        <Link2 className="w-4 h-4" />
        {estado === 'gerando' ? 'Gerando link…' : estado === 'copiado' ? 'Link copiado!' : 'Copiar link de acompanhamento'}
      </button>
      {estado === 'copiado' && <p className="text-[11px] text-emerald-400">Cole na conversa com o cliente.</p>}
      {estado === 'copie' && (
        <input
          readOnly
          autoFocus
          value={link}
          onFocus={(e) => e.target.select()}
          className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-[11px] text-zinc-200 outline-none"
        />
      )}
      {estado === 'erro' && <p className="text-[11px] text-rose-400">{erro}</p>}
    </div>
  );
};


/**
 * Card "Acompanhamento online" dos detalhes da OS: o cliente vê o andamento e aprova o orçamento sem
 * login. O link também vai nas mensagens de WhatsApp que usam {link_acompanhamento}.
 * Use com key={os.id_os}: ao trocar de OS o estado (link gerado) recomeça.
 */
export const LinkAcompanhamentoOS: React.FC<{ os: OrdemServico }> = ({ os }) => {
  const [link, setLink] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');

  if (os.status_os === 'RASCUNHO') return null;

  const obterLink = async () => {
    if (link) return link;
    const gerado = await gerarLinkAcompanhamento(os.id_os);
    setLink(gerado);
    return gerado;
  };

  const executar = async (acao: () => Promise<void>) => {
    setCarregando(true);
    setErro('');
    setAviso('');
    try {
      await acao();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  const copiar = () =>
    executar(async () => {
      const atual = await obterLink();
      try {
        await navigator.clipboard.writeText(atual);
        setAviso('Link copiado. Cole na conversa com o cliente.');
      } catch {
        setAviso('Não foi possível copiar: selecione o link abaixo e copie.');
      }
    });

  // A aba abre no clique (o navegador bloqueia janelas abertas depois de uma espera) e recebe o link depois
  const abrir = () => {
    const janela = window.open('', '_blank');
    executar(async () => {
      try {
        const atual = await obterLink();
        if (janela) janela.location.href = atual;
        else window.open(atual, '_blank', 'noopener');
      } catch (e) {
        janela?.close();
        throw e;
      }
    });
  };

  const gerarNovo = () => {
    if (!window.confirm('Gerar um link novo? O link enviado antes para o cliente deixa de funcionar.')) return;
    executar(async () => {
      await revogarLinkAcompanhamento(os.id_os);
      setLink(await gerarLinkAcompanhamento(os.id_os));
      setAviso('Link novo gerado. O anterior não funciona mais.');
    });
  };

  const botaoCls =
    'inline-flex items-center justify-center gap-1.5 h-9 px-3 bg-zinc-900/50 hover:bg-zinc-800 disabled:opacity-40 text-zinc-100 border border-zinc-800 rounded-lg text-xs font-semibold transition';

  return (
    <div className="p-5 bg-[#0c101a] border border-zinc-800/80 rounded-2xl space-y-3">
      <div>
        <h4 className="text-sm font-bold text-white">Acompanhamento online</h4>
        <p className="text-xs text-zinc-400 mt-1">O cliente vê o andamento e aprova o orçamento sem login.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={copiar} disabled={carregando} className={botaoCls}>
          <Copy className="w-3.5 h-3.5" /> Copiar link
        </button>
        <button type="button" onClick={abrir} disabled={carregando} className={botaoCls}>
          <ExternalLink className="w-3.5 h-3.5" /> Abrir
        </button>
      </div>
      {link && (
        <input
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          className="w-full px-3 py-2 bg-[#080c14] border border-zinc-800 rounded-lg text-[11px] text-zinc-300 outline-none"
        />
      )}
      {aviso && <p className="text-[11px] text-emerald-400">{aviso}</p>}
      {erro && <p className="text-[11px] text-rose-400">{erro}</p>}
      <button
        type="button"
        onClick={gerarNovo}
        disabled={carregando}
        className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 disabled:opacity-40 transition"
      >
        <RefreshCw className="w-3 h-3" /> Gerar link novo (o anterior para de funcionar)
      </button>
    </div>
  );
};
