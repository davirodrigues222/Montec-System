import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Check, CircleCheck, CircleX, Gift, LoaderCircle, MapPin, MessageCircle, ShieldCheck, Smartphone } from 'lucide-react';
import { type OrcamentoPublicoDados, consultarOrcamentoPublico, responderOrcamentoPublico } from '../services/orcamentos';
import { linkWhatsapp } from '../services/api';
import { formatarDataHora, formatarDataOS, formatarMoeda } from '../utils/formatadores';
import { dataBR } from '../utils/meses';
import { NomeBancadaOS, SimboloBancadaOS } from '../components/Marca';

// ==========================================
// Página pública do orçamento (/orcamento/<código>), aberta pelo cliente sem login a partir do
// WhatsApp. Mostra o orçamento e deixa o cliente autorizar ou não o serviço. Os dados vêm só das
// funções públicas do banco (migração 20261114090000), que já filtram o que o cliente pode ver.
// ==========================================

const Cartao: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <section className={`bg-[#0b0f16] border border-zinc-800 rounded-2xl p-5 ${className}`}>{children}</section>
);

export const OrcamentoPublico: React.FC<{ codigo: string }> = ({ codigo }) => {
  const [dados, setDados] = useState<OrcamentoPublicoDados | null>(null);
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'inexistente' | 'erro'>('carregando');
  const [erro, setErro] = useState('');
  // Passo de confirmação antes de gravar a resposta (evita toque sem querer)
  const [confirmando, setConfirmando] = useState<'aprovar' | 'recusar' | null>(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const buscar = useCallback(async () => {
    try {
      const resposta = await consultarOrcamentoPublico(codigo);
      setDados(resposta);
      setEstado(resposta ? 'pronto' : 'inexistente');
    } catch (e: any) {
      setErro(e.message);
      setEstado('erro');
    }
  }, [codigo]);

  useEffect(() => {
    document.title = 'Seu orçamento';
    buscar();
  }, [buscar]);

  const responder = async (aprovar: boolean) => {
    setEnviando(true);
    setErro('');
    try {
      const resposta = await responderOrcamentoPublico(codigo, aprovar, aprovar ? undefined : motivo);
      if (resposta) setDados(resposta);
      setConfirmando(null);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  if (estado !== 'pronto' || !dados) {
    return (
      <div className="min-h-dvh bg-[#070a12] text-zinc-100 flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-3">
          {estado === 'carregando' ? (
            <LoaderCircle className="w-8 h-8 text-blue-400 animate-spin mx-auto" aria-label="Carregando" />
          ) : (
            <>
              <CircleX className="w-10 h-10 text-zinc-500 mx-auto" />
              <h1 className="text-lg font-bold text-white">{estado === 'erro' ? 'Não foi possível carregar' : 'Orçamento não encontrado'}</h1>
              <p className="text-sm text-zinc-400">
                {estado === 'erro' ? erro : 'Este link de orçamento não existe mais. Peça um orçamento novo para a loja.'}
              </p>
              {estado === 'erro' && (
                <button
                  type="button"
                  onClick={() => {
                    setEstado('carregando');
                    buscar();
                  }}
                  className="text-sm font-bold text-blue-400 hover:underline"
                >
                  Tentar de novo
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  const { loja, orcamento: o } = dados;
  const pendente = o.status === 'PENDENTE' && !o.vencido;
  const whatsappLoja = linkWhatsapp(loja.telefone, `Olá! Tenho uma dúvida sobre o orçamento de ${o.titulo.toLowerCase()} do ${o.aparelho}.`);

  return (
    <div className="min-h-dvh bg-[#070a12] text-zinc-100 font-sans">
      <div className="max-w-md mx-auto px-4 py-6 space-y-4 text-sm">
        {/* Loja */}
        <header className="flex items-center gap-3">
          {loja.logo ? (
            <img src={loja.logo} alt={loja.nome} className="w-12 h-12 object-contain rounded-xl bg-zinc-950 border border-zinc-800 p-1" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-400 font-extrabold text-lg">
              {loja.nome.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-base font-bold text-white truncate">{loja.nome}</p>
            <p className="text-xs text-zinc-500">Orçamento enviado em {formatarDataOS(o.criado_em)}</p>
          </div>
        </header>

        {/* Orçamento */}
        <Cartao>
          <p className="text-zinc-400">{o.cliente ? `Olá, ${o.cliente}! Segue o seu orçamento:` : 'Segue o seu orçamento:'}</p>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-blue-400">Orçamento</p>
          <h1 className="text-xl font-extrabold text-white">{o.titulo}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-zinc-300">
            <Smartphone className="w-4 h-4 text-zinc-500" /> {o.aparelho}
          </p>
          <p className="mt-4 text-3xl font-black text-white tabular-nums">{formatarMoeda(o.valor)}</p>

          <div className="mt-4 space-y-2.5">
            {o.garantia && (
              <p className="flex items-start gap-2 text-zinc-300">
                <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" /> Garantia de {o.garantia}
              </p>
            )}
            {o.brinde && (
              <p className="flex items-start gap-2 text-zinc-300">
                <Gift className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" /> {o.brinde}
              </p>
            )}
            {o.validade && (
              <p className={`flex items-start gap-2 ${o.vencido ? 'text-rose-400' : 'text-zinc-400'}`}>
                <CalendarClock className="w-4 h-4 shrink-0 mt-0.5" />
                {o.vencido ? `Orçamento vencido em ${dataBR(o.validade)}` : `Válido até ${dataBR(o.validade)}`}
              </p>
            )}
          </div>
          {o.observacoes && <p className="mt-4 text-zinc-400 whitespace-pre-line">{o.observacoes}</p>}
        </Cartao>

        {o.condicoes.length > 0 && (
          <Cartao>
            <h2 className="font-bold text-white mb-2">Formas de pagamento</h2>
            <ul className="space-y-2">
              {o.condicoes.map((c) => (
                <li key={c} className="flex items-start gap-2 text-zinc-300">
                  <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" strokeWidth={3} /> {c}
                </li>
              ))}
            </ul>
          </Cartao>
        )}

        {/* Resposta */}
        <Cartao>
          {o.status === 'APROVADO' ? (
            <div className="text-center space-y-2">
              <CircleCheck className="w-10 h-10 text-emerald-400 mx-auto" />
              <p className="text-base font-bold text-white">Serviço autorizado</p>
              <p className="text-zinc-400">
                {o.respondido_em ? `Em ${formatarDataHora(o.respondido_em)}. ` : ''}A loja já foi avisada. Traga o aparelho ou combine a entrega pelo WhatsApp.
              </p>
            </div>
          ) : o.status === 'RECUSADO' ? (
            <div className="text-center space-y-2">
              <CircleX className="w-10 h-10 text-zinc-500 mx-auto" />
              <p className="text-base font-bold text-white">Serviço não autorizado</p>
              <p className="text-zinc-400">Tudo bem! Se mudar de ideia ou quiser outra proposta, fale com a loja.</p>
            </div>
          ) : o.vencido ? (
            <p className="text-center text-zinc-400">Este orçamento venceu. Fale com a loja para receber um valor atualizado.</p>
          ) : confirmando === 'aprovar' ? (
            <div className="space-y-3">
              <p className="text-zinc-300">
                Ao confirmar, você autoriza <strong className="text-white">{loja.nome}</strong> a fazer o serviço de{' '}
                <strong className="text-white">{o.titulo.toLowerCase()}</strong> no seu {o.aparelho} pelo valor de{' '}
                <strong className="text-white">{formatarMoeda(o.valor)}</strong>.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => responder(true)}
                  disabled={enviando}
                  className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold transition"
                >
                  {enviando ? 'Enviando…' : 'Confirmar autorização'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmando(null)}
                  disabled={enviando}
                  className="px-4 py-3 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 font-bold transition"
                >
                  Voltar
                </button>
              </div>
            </div>
          ) : confirmando === 'recusar' ? (
            <div className="space-y-3">
              <label htmlFor="motivo" className="block text-zinc-300">
                Quer contar o motivo? <span className="text-zinc-500">(opcional)</span>
              </label>
              <textarea
                id="motivo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value.slice(0, 300))}
                rows={3}
                placeholder="Ex.: achei caro, vou consertar depois…"
                className="w-full px-3.5 py-2.5 bg-[#080c14] border border-zinc-800 rounded-xl text-white outline-none focus:border-blue-500 placeholder:text-zinc-600"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => responder(false)}
                  disabled={enviando}
                  className="flex-1 py-3 rounded-xl bg-zinc-200 hover:bg-white disabled:opacity-60 text-zinc-900 font-bold transition"
                >
                  {enviando ? 'Enviando…' : 'Confirmar: não autorizo'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmando(null)}
                  disabled={enviando}
                  className="px-4 py-3 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 font-bold transition"
                >
                  Voltar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <h2 className="font-bold text-white text-center">Você autoriza o serviço?</h2>
              <button
                type="button"
                onClick={() => setConfirmando('aprovar')}
                className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition inline-flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" strokeWidth={3} /> Sim, autorizo o serviço
              </button>
              <button
                type="button"
                onClick={() => setConfirmando('recusar')}
                className="w-full py-3 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 font-bold transition"
              >
                Não autorizo
              </button>
            </div>
          )}
          {erro && <p className="mt-3 text-xs text-rose-400 text-center">{erro}</p>}
          {pendente && !confirmando && (
            <p className="mt-3 text-xs text-zinc-500 text-center">Tem dúvidas sobre o valor? Fale com a loja antes de responder.</p>
          )}
        </Cartao>

        {/* Contato */}
        {(whatsappLoja || loja.endereco || loja.horario) && (
          <Cartao className="space-y-3">
            {whatsappLoja && (
              <a
                href={whatsappLoja}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0c101a] border border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-400 font-bold transition"
              >
                <MessageCircle className="w-4 h-4" /> Falar com a loja no WhatsApp
              </a>
            )}
            {loja.endereco && (
              <p className="flex gap-2 text-zinc-400">
                <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-zinc-500" /> {loja.endereco}
              </p>
            )}
            {loja.horario && <p className="text-xs text-zinc-500">Horário: {loja.horario}</p>}
          </Cartao>
        )}

        <footer className="pt-2 pb-4 flex items-center justify-center gap-2 text-xs text-zinc-600">
          <span className="w-5 h-5 inline-block">
            <SimboloBancadaOS className="w-full h-full" />
          </span>
          <span>
            Orçamento por <NomeBancadaOS />
          </span>
        </footer>
      </div>
    </div>
  );
};
