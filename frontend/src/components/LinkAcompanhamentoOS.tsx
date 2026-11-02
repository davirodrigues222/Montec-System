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
 * Link de acompanhamento da OS (Ordens de serviço › Detalhes): o cliente vê o andamento e aprova o
 * orçamento sem login. O link também vai nas mensagens de WhatsApp que usam {link_acompanhamento}.
 * Use com key={os.id_os}: ao trocar de OS o estado (link mostrado) recomeça.
 */
export const LinkAcompanhamentoOS: React.FC<{ os: OrdemServico }> = ({ os }) => {
  const [link, setLink] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');

  if (os.status_os === 'RASCUNHO') return null;

  const executar = async (acao: () => Promise<string>, mensagem = '') => {
    setCarregando(true);
    setErro('');
    setAviso('');
    try {
      setLink(await acao());
      setAviso(mensagem);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  const gerar = () => executar(() => gerarLinkAcompanhamento(os.id_os));

  const gerarNovo = () => {
    if (!window.confirm('Gerar um link novo? O link enviado antes para o cliente deixa de funcionar.')) return;
    executar(async () => {
      await revogarLinkAcompanhamento(os.id_os);
      return gerarLinkAcompanhamento(os.id_os);
    }, 'Link novo gerado. O anterior não funciona mais.');
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setAviso('Link copiado.');
    } catch {
      setAviso('Não foi possível copiar: selecione o link e copie manualmente.');
    }
  };

  const botaoCls =
    'inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/15 hover:bg-blue-600/25 disabled:opacity-40 text-blue-300 border border-blue-500/30 rounded-lg text-[11px] font-semibold transition';

  return (
    <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl space-y-2">
      <div>
        <span className="text-blue-400 block uppercase text-[10px] font-bold">Acompanhamento online</span>
        <span className="text-[11px] text-zinc-500">
          O cliente acompanha o andamento e aprova o orçamento por um link, sem precisar de login.
        </span>
      </div>

      {link ? (
        <>
          <input
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
            className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-[11px] text-zinc-200 outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copiar} className={botaoCls}>
              <Copy className="w-3.5 h-3.5" /> Copiar
            </button>
            <a href={link} target="_blank" rel="noopener noreferrer" className={botaoCls}>
              <ExternalLink className="w-3.5 h-3.5" /> Ver como o cliente vê
            </a>
            <button type="button" onClick={gerarNovo} disabled={carregando} className={botaoCls}>
              <RefreshCw className="w-3.5 h-3.5" /> Gerar link novo
            </button>
          </div>
        </>
      ) : (
        <button type="button" onClick={gerar} disabled={carregando} className={botaoCls}>
          <Link2 className="w-3.5 h-3.5" /> {carregando ? 'Gerando…' : 'Mostrar link do cliente'}
        </button>
      )}

      {aviso && <p className="text-[11px] text-emerald-400">{aviso}</p>}
      {erro && <p className="text-[11px] text-rose-400">{erro}</p>}
    </div>
  );
};
