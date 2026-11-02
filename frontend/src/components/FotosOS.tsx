import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ImagePlus, LoaderCircle, X } from 'lucide-react';
import { type AlteracoesFotos, type FotoOS, MAX_FOTOS_OS, listarFotosOS } from '../services/fotosOS';

// Fotos do aparelho na OS: seletor da Nova OS (as fotos sobem depois que a OS é criada), galeria só de
// visualização nos detalhes da OS e editor no "Editar OS" (grava ao salvar). Ver services/fotosOS.ts.

const botaoCls =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed';

/**
 * "Tirar foto" abre direto a câmera (só no celular; no computador o atributo capture é ignorado) e
 * "Escolher fotos" abre a galeria ou os arquivos.
 */
const BotoesAdicionarFoto: React.FC<{ restantes: number; desabilitado?: boolean; aoEscolher: (arquivos: File[]) => void }> = ({
  restantes,
  desabilitado,
  aoEscolher,
}) => {
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const escolher = (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(e.target.files || []).filter((a) => a.type.startsWith('image/'));
    e.target.value = ''; // permite escolher a mesma foto de novo
    if (arquivos.length > restantes) alert(`Limite de ${MAX_FOTOS_OS} fotos por OS: só as ${restantes} primeiras foram adicionadas.`);
    if (arquivos.length) aoEscolher(arquivos.slice(0, restantes));
  };
  const bloqueado = desabilitado || restantes <= 0;

  return (
    <div className="flex flex-wrap gap-2">
      <input ref={camera} type="file" accept="image/*" capture="environment" onChange={escolher} className="hidden" />
      <input ref={galeria} type="file" accept="image/*" multiple onChange={escolher} className="hidden" />
      <button
        type="button"
        onClick={() => camera.current?.click()}
        disabled={bloqueado}
        className={`${botaoCls} md:hidden bg-blue-600 hover:bg-blue-500 border-blue-500 text-white`}
      >
        <Camera className="w-4 h-4" /> Tirar foto
      </button>
      <button
        type="button"
        onClick={() => galeria.current?.click()}
        disabled={bloqueado}
        className={`${botaoCls} bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-200`}
      >
        <ImagePlus className="w-4 h-4" /> Escolher fotos
      </button>
    </div>
  );
};

/** Foto ampliada; fecha pelo botão, tocando fora ou com Esc. */
const VisualizadorFoto: React.FC<{ url: string; aoFechar: () => void }> = ({ url, aoFechar }) => {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aoFechar]);

  return (
    <div className="fixed inset-0 z-[70] bg-black/90 flex flex-col p-4" onClick={aoFechar}>
      <div className="flex justify-end gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={aoFechar} aria-label="Fechar" className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center pt-3">
        <img src={url} alt="Foto do aparelho" className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
      </div>
    </div>
  );
};

const Miniatura: React.FC<{ url: string; aoAbrir: () => void; aoRemover?: () => void }> = ({ url, aoAbrir, aoRemover }) => (
  <div className="relative aspect-square">
    <button
      type="button"
      onClick={aoAbrir}
      className="w-full h-full rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 hover:border-blue-500 transition"
    >
      <img src={url} alt="Foto do aparelho" loading="lazy" className="w-full h-full object-cover" />
    </button>
    {aoRemover && (
      <button
        type="button"
        onClick={aoRemover}
        aria-label="Remover foto"
        className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-rose-600 flex items-center justify-center"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    )}
  </div>
);

/**
 * Nova OS: as fotos ficam no aparelho até a OS ser criada (antes disso ela ainda não existe no
 * banco); a tela de sucesso envia em seguida.
 */
export const SeletorFotosNovaOS: React.FC<{ fotos: File[]; aoMudar: (fotos: File[]) => void }> = ({ fotos, aoMudar }) => {
  const previas = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos]);
  useEffect(() => () => previas.forEach((u) => URL.revokeObjectURL(u)), [previas]);
  const [aberta, setAberta] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      <BotoesAdicionarFoto restantes={MAX_FOTOS_OS - fotos.length} aoEscolher={(novas) => aoMudar([...fotos, ...novas])} />
      {fotos.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5">
          {previas.map((url, i) => (
            <Miniatura key={url} url={url} aoAbrir={() => setAberta(i)} aoRemover={() => aoMudar(fotos.filter((_, j) => j !== i))} />
          ))}
        </div>
      )}
      <p className="text-[11px] text-zinc-500">
        {fotos.length > 0
          ? `${fotos.length} de ${MAX_FOTOS_OS} fotos. Elas são enviadas quando a OS for criada.`
          : 'Fotografe riscos, trincas e o estado geral do aparelho na entrada. Protege a loja em caso de reclamação.'}
      </p>
      {aberta !== null && previas[aberta] && <VisualizadorFoto url={previas[aberta]} aoFechar={() => setAberta(null)} />}
    </div>
  );
};

/** Fotos já gravadas da OS (null enquanto carrega). */
function useFotosDaOS(idOs: string) {
  const [fotos, setFotos] = useState<FotoOS[] | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let ativo = true;
    listarFotosOS(idOs)
      .then((lista) => ativo && setFotos(lista))
      .catch((e) => {
        if (!ativo) return;
        setErro(e.message);
        setFotos([]);
      });
    return () => {
      ativo = false;
    };
  }, [idOs]);
  return { fotos, erro };
}

const Carregando = () => (
  <p className="text-xs text-zinc-500 flex items-center gap-2">
    <LoaderCircle className="w-4 h-4 animate-spin" /> Carregando fotos…
  </p>
);

/**
 * Detalhes da OS: só visualizar as fotos (enviar e excluir ficam no "Editar OS").
 * Use com key: ao trocar de OS ou depois de salvar uma edição, a lista recarrega.
 */
export const GaleriaFotosOS: React.FC<{ idOs: string }> = ({ idOs }) => {
  const { fotos, erro } = useFotosDaOS(idOs);
  const [aberta, setAberta] = useState<FotoOS | null>(null);

  return (
    <div className="space-y-3">
      <h4 className="font-bold text-white uppercase text-[10px]">Fotos do aparelho {fotos?.length ? `(${fotos.length})` : ''}</h4>
      {fotos === null ? (
        <Carregando />
      ) : fotos.length === 0 ? (
        <p className="text-xs text-zinc-500">Nenhuma foto nesta OS. Para adicionar, use "Editar OS".</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
          {fotos.map((f) => (
            <Miniatura key={f.caminho} url={f.url} aoAbrir={() => setAberta(f)} />
          ))}
        </div>
      )}
      {erro && <p className="text-xs text-rose-400">{erro}</p>}
      {aberta && <VisualizadorFoto url={aberta.url} aoFechar={() => setAberta(null)} />}
    </div>
  );
};

/** "Editar OS": fotos gravadas (com ✕ para remover) e novas fotos, tudo pendente até salvar. Use com key={idOs}. */
export const EditorFotosOS: React.FC<{ idOs: string; alteracoes: AlteracoesFotos; aoMudar: (a: AlteracoesFotos) => void }> = ({
  idOs,
  alteracoes,
  aoMudar,
}) => {
  const { fotos, erro } = useFotosDaOS(idOs);
  const previas = useMemo(() => alteracoes.novas.map((f) => URL.createObjectURL(f)), [alteracoes.novas]);
  useEffect(() => () => previas.forEach((u) => URL.revokeObjectURL(u)), [previas]);
  const [aberta, setAberta] = useState<string | null>(null);

  const mantidas = (fotos || []).filter((f) => !alteracoes.removidas.includes(f.caminho));
  const total = mantidas.length + alteracoes.novas.length;
  const pendentes = alteracoes.novas.length + alteracoes.removidas.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold text-white uppercase text-[10px]">Fotos do aparelho ({total} de {MAX_FOTOS_OS})</h4>
        <BotoesAdicionarFoto
          restantes={MAX_FOTOS_OS - total}
          desabilitado={fotos === null}
          aoEscolher={(novas) => aoMudar({ ...alteracoes, novas: [...alteracoes.novas, ...novas] })}
        />
      </div>

      {fotos === null ? (
        <Carregando />
      ) : total === 0 ? (
        <p className="text-xs text-zinc-500">Nenhuma foto nesta OS.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
          {mantidas.map((f) => (
            <Miniatura
              key={f.caminho}
              url={f.url}
              aoAbrir={() => setAberta(f.url)}
              aoRemover={() => aoMudar({ ...alteracoes, removidas: [...alteracoes.removidas, f.caminho] })}
            />
          ))}
          {previas.map((url, i) => (
            <Miniatura
              key={url}
              url={url}
              aoAbrir={() => setAberta(url)}
              aoRemover={() => aoMudar({ ...alteracoes, novas: alteracoes.novas.filter((_, j) => j !== i) })}
            />
          ))}
        </div>
      )}

      {pendentes > 0 && (
        <p className="text-[11px] text-blue-300">
          {[
            alteracoes.novas.length && `${alteracoes.novas.length} nova(s)`,
            alteracoes.removidas.length && `${alteracoes.removidas.length} removida(s)`,
          ]
            .filter(Boolean)
            .join(' · ')}{' '}
          — grava ao clicar em "Salvar alterações".
        </p>
      )}
      {erro && <p className="text-xs text-rose-400">{erro}</p>}
      {aberta && <VisualizadorFoto url={aberta} aoFechar={() => setAberta(null)} />}
    </div>
  );
};
