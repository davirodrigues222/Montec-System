import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, Copy, ListPlus, Info, Scale, Search, ShieldCheck, TriangleAlert } from 'lucide-react';
import { TERMOS_GARANTIA_PADRAO } from '../../services/api';
import { ATUALIZADO_EM, PoliticaPrivacidade, TermosDeUso } from '../../components/DocumentosLegais';
import { CATEGORIAS_LEI, LEIS_REPOSITORIO, type CategoriaLei, type LeiRepositorio } from './leisRepositorio';
import { cardCls, type PropsAba } from './tipos';

interface Props extends PropsAba {
  /** Sem permissão de Configurações, a consulta continua liberada, mas os termos impressos não são alterados. */
  podeEditar: boolean;
}

type SubAba = 'leis' | 'termos';

const normalizar = (texto: string) =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const copiarTexto = async (texto: string) => {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Navegadores sem a API de área de transferência (ou sem HTTPS)
    const area = document.createElement('textarea');
    area.value = texto;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
};

const CardLei: React.FC<{
  lei: LeiRepositorio;
  aberto: boolean;
  onAlternar: () => void;
  copiado: boolean;
  onCopiar: () => void;
  jaNosTermos: boolean;
  podeEditar: boolean;
  onAdicionar: () => void;
}> = ({ lei, aberto, onAlternar, copiado, onCopiar, jaNosTermos, podeEditar, onAdicionar }) => (
  <div className={`rounded-2xl border bg-[#0c101a] transition-colors ${aberto ? 'border-blue-500/30' : 'border-zinc-800/80'}`}>
    <button type="button" onClick={onAlternar} aria-expanded={aberto} className="w-full flex items-start gap-3 p-4 text-left">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {lei.referencias.map((ref) => (
            <span key={ref} className="px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[10px] font-bold text-blue-300">
              {ref}
            </span>
          ))}
        </div>
        <h3 className="text-sm font-bold text-white">{lei.titulo}</h3>
        {!aberto && <p className="text-xs text-zinc-400 line-clamp-2">{lei.resumo}</p>}
      </div>
      <ChevronDown className={`w-4 h-4 mt-1 shrink-0 text-zinc-500 transition-transform ${aberto ? 'rotate-180' : ''}`} />
    </button>

    {aberto && (
      <div className="px-4 pb-4 space-y-3.5">
        <div className="rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1">Como explicar ao cliente</p>
          <p className="text-xs text-zinc-200 leading-relaxed">{lei.resumo}</p>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Texto da lei</p>
          {lei.textoLei.map((trecho) => (
            <blockquote key={trecho.artigo} className="border-l-2 border-zinc-700 pl-3 text-xs text-zinc-400 leading-relaxed">
              <strong className="text-zinc-200">{trecho.artigo}.</strong> {trecho.texto}
            </blockquote>
          ))}
        </div>

        {lei.atencao && (
          <div className="flex gap-2.5 rounded-xl bg-amber-500/[0.07] border border-amber-500/20 p-3.5">
            <TriangleAlert className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <p className="text-xs text-amber-100/90 leading-relaxed">{lei.atencao}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={onCopiar}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition ${
              copiado
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white'
            }`}
          >
            {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copiado ? 'Copiado!' : 'Copiar resposta para WhatsApp'}
          </button>
          {podeEditar && (
            <button
              type="button"
              onClick={onAdicionar}
              disabled={jaNosTermos}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-zinc-700 bg-[#080c14] text-zinc-200 hover:text-white hover:border-zinc-600 disabled:opacity-60 disabled:cursor-default transition"
            >
              {jaNosTermos ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <ListPlus className="w-3.5 h-3.5" />}
              {jaNosTermos ? 'Já está nos termos da garantia' : 'Adicionar aos termos da garantia'}
            </button>
          )}
        </div>
      </div>
    )}
  </div>
);

/** Central de leis para o balcão, termos de uso do sistema e termos de garantia impressos na OS. */
export const AbaLeisTermos: React.FC<Props> = ({ config, alterar, podeEditar }) => {
  const [subAba, setSubAba] = useState<SubAba>('leis');
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<CategoriaLei | 'todas'>('todas');
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set());
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  const leisFiltradas = useMemo(() => {
    const termo = normalizar(busca.trim());
    return LEIS_REPOSITORIO.filter((lei) => {
      if (categoria !== 'todas' && lei.categoria !== categoria) return false;
      if (!termo) return true;
      const conteudo = [lei.titulo, lei.resumo, lei.palavrasChave, ...lei.referencias, ...lei.textoLei.map((t) => t.texto)].join(' ');
      return normalizar(conteudo).includes(termo);
    });
  }, [busca, categoria]);

  const alternar = (id: string) =>
    setAbertos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const copiar = async (lei: LeiRepositorio) => {
    if (await copiarTexto(lei.mensagemWhatsapp)) {
      setCopiadoId(lei.id);
      setTimeout(() => setCopiadoId((atual) => (atual === lei.id ? null : atual)), 2000);
    }
  };

  // Cada linha dos termos vira um parágrafo impresso; a cláusula entra numerada no fim
  const adicionarAosTermos = (lei: LeiRepositorio) => {
    const linhas = config.termosGarantiaTexto.split('\n').filter((l) => l.trim());
    alterar({ termosGarantiaTexto: [...linhas, `${linhas.length + 1}. ${lei.clausula}`].join('\n') });
  };

  return (
    <div className="space-y-5">
      {/* Sub-abas */}
      <div className="inline-flex p-1 rounded-xl bg-[#0c101a] border border-zinc-800/80">
        {(
          [
            ['leis', 'Leis para o balcão', Scale],
            ['termos', 'Termos de uso e garantia', ShieldCheck],
          ] as const
        ).map(([id, rotulo, Icone]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubAba(id)}
            aria-pressed={subAba === id}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
              subAba === id ? 'bg-blue-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Icone className="w-3.5 h-3.5" />
            {rotulo}
          </button>
        ))}
      </div>

      {subAba === 'leis' && (
        <>
          <div className="flex gap-2.5 rounded-xl bg-[#0c101a] border border-zinc-800/80 p-3.5">
            <Info className="w-4 h-4 shrink-0 text-blue-400 mt-0.5" />
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Consulta rápida para o atendimento, com o texto dos artigos do Código de Defesa do Consumidor, do Código Civil e da LGPD.
              É um material informativo e não substitui a orientação de um advogado em casos de disputa.
            </p>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Pesquisar: garantia, mau uso, abandono, orçamento, dados..."
                className="w-full h-11 pl-10 pr-4 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white placeholder-zinc-500 outline-none focus:border-blue-500 transition"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[{ id: 'todas' as const, rotulo: 'Todas' }, ...CATEGORIAS_LEI].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoria(c.id)}
                  aria-pressed={categoria === c.id}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition ${
                    categoria === c.id
                      ? 'bg-blue-600/15 border-blue-500/40 text-blue-300'
                      : 'bg-[#080c14] border-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  {c.rotulo}
                </button>
              ))}
            </div>
          </div>

          {!podeEditar && (
            <p className="text-[11px] text-zinc-500">
              Para incluir cláusulas nos termos de garantia impressos é preciso a permissão de Configurações.
            </p>
          )}

          {leisFiltradas.length === 0 ? (
            <div className="p-10 text-center rounded-2xl border border-zinc-800/80 bg-[#0c101a] text-xs text-zinc-500">
              Nenhuma lei encontrada para essa busca.
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
              {leisFiltradas.map((lei) => (
                <CardLei
                  key={lei.id}
                  lei={lei}
                  aberto={abertos.has(lei.id) || !!busca.trim()}
                  onAlternar={() => alternar(lei.id)}
                  copiado={copiadoId === lei.id}
                  onCopiar={() => copiar(lei)}
                  jaNosTermos={config.termosGarantiaTexto.includes(lei.clausula)}
                  podeEditar={podeEditar}
                  onAdicionar={() => adicionarAosTermos(lei)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {subAba === 'termos' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
          {/* Termos de garantia impressos na OS (o mesmo campo de Configurações › Operacional) */}
          <div className={`${cardCls} xl:col-span-2`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">Termos de garantia impressos na OS</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Saem na certidão de garantia e no comprovante de entrada. Cada linha vira um parágrafo.
                </p>
              </div>
              {podeEditar && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Restaurar os termos padrão baseados no Código de Defesa do Consumidor?')) {
                      alterar({ termosGarantiaTexto: TERMOS_GARANTIA_PADRAO });
                    }
                  }}
                  className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold transition"
                >
                  Restaurar termos padrão do CDC
                </button>
              )}
            </div>
            {podeEditar ? (
              <textarea
                rows={9}
                value={config.termosGarantiaTexto}
                onChange={(e) => alterar({ termosGarantiaTexto: e.target.value })}
                className="w-full p-4 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-zinc-200 leading-relaxed outline-none focus:border-blue-500"
              />
            ) : (
              <div className="p-4 bg-[#080c14] border border-zinc-800/80 rounded-xl space-y-1.5">
                {config.termosGarantiaTexto
                  .split('\n')
                  .filter((l) => l.trim())
                  .map((linha) => (
                    <p key={linha} className="text-xs text-zinc-300 leading-relaxed">
                      {linha}
                    </p>
                  ))}
              </div>
            )}
          </div>

          <div className={cardCls}>
            <h3 className="text-sm font-bold text-white">Termos de Uso do Montec System</h3>
            <div className="space-y-4">
              <TermosDeUso />
            </div>
            <p className="text-[11px] text-zinc-500">Atualizado em {ATUALIZADO_EM}.</p>
          </div>

          <div className={cardCls}>
            <h3 className="text-sm font-bold text-white">Política de Privacidade (LGPD)</h3>
            <div className="space-y-4">
              <PoliticaPrivacidade />
            </div>
            <p className="text-[11px] text-zinc-500">Atualizado em {ATUALIZADO_EM}.</p>
          </div>
        </div>
      )}
    </div>
  );
};
