import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Check, CircleX, LoaderCircle, MapPin, MessageCircle, ShieldCheck, Wrench } from 'lucide-react';
import { type Acompanhamento, aprovarOrcamentoPeloLink, consultarAcompanhamento } from '../services/acompanhamento';
import { linkWhatsapp } from '../services/api';
import { formatarDataHora, formatarDataOS, formatarMoeda } from '../utils/formatadores';
import { GARANTIA_LEGAL_DIAS } from '../utils/conformidade';
import { NomeBancadaOS, SimboloBancadaOS } from '../components/Marca';
import type { StatusOS } from '../types';

// ==========================================
// Página pública do link de acompanhamento (/acompanhar/<código>), aberta pelo cliente sem login.
// Mostra o andamento da OS e deixa o cliente aprovar o orçamento. Os dados vêm só das funções
// públicas do banco (migração 20261102090000), que já filtram o que o cliente pode ver.
// ==========================================

const ETAPAS: { rotulo: string; status: StatusOS[] }[] = [
  { rotulo: 'Recebido', status: ['AGUARDANDO_AVALIACAO'] },
  { rotulo: 'Em análise', status: ['EM_ANALISE'] },
  { rotulo: 'Em reparo', status: ['AGUARDANDO_PECA', 'EM_MANUTENCAO'] },
  { rotulo: 'Pronto para retirada', status: ['PRONTO'] },
  { rotulo: 'Entregue', status: ['ENTREGUE'] },
];

/** Frase do momento atual, do ponto de vista do cliente. */
const DESCRICAO_STATUS: Partial<Record<StatusOS, string>> = {
  AGUARDANDO_AVALIACAO: 'Recebemos seu aparelho. Ele está na fila para avaliação.',
  EM_ANALISE: 'Nosso técnico está avaliando o aparelho.',
  AGUARDANDO_PECA: 'Estamos aguardando a chegada da peça para fazer o reparo.',
  EM_MANUTENCAO: 'Seu aparelho está sendo reparado.',
  PRONTO: 'Seu aparelho está pronto! Pode vir buscar.',
  ENTREGUE: 'Aparelho entregue. Obrigado pela confiança!',
  CANCELADO: 'Esta ordem de serviço foi cancelada. Em caso de dúvida, fale com a loja.',
};

const Cartao: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <section className={`bg-[#0b0f16] border border-zinc-800 rounded-2xl p-5 ${className}`}>{children}</section>
);

const Linha: React.FC<{ rotulo: string; valor: React.ReactNode }> = ({ rotulo, valor }) => (
  <div className="flex justify-between gap-4 py-2 border-b border-zinc-800/60 last:border-0">
    <span className="text-zinc-500 shrink-0">{rotulo}</span>
    <span className="text-zinc-200 text-right break-words min-w-0">{valor}</span>
  </div>
);

export const AcompanhamentoPublico: React.FC<{ codigo: string }> = ({ codigo }) => {
  const [dados, setDados] = useState<Acompanhamento | null>(null);
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'inexistente' | 'erro'>('carregando');
  const [erro, setErro] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [aprovando, setAprovando] = useState(false);

  const buscar = useCallback(async () => {
    try {
      const resposta = await consultarAcompanhamento(codigo);
      setDados(resposta);
      setEstado(resposta ? 'pronto' : 'inexistente');
    } catch (e: any) {
      setErro(e.message);
      setEstado('erro');
    }
  }, [codigo]);

  useEffect(() => {
    document.title = 'Acompanhe seu aparelho';
    buscar();
  }, [buscar]);

  const tentarDeNovo = () => {
    setEstado('carregando');
    buscar();
  };

  const aprovar = async () => {
    setAprovando(true);
    setErro('');
    try {
      const resposta = await aprovarOrcamentoPeloLink(codigo);
      if (resposta) setDados(resposta);
      setConfirmando(false);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setAprovando(false);
    }
  };

  if (estado !== 'pronto' || !dados) {
    return (
      <div className="min-h-dvh bg-[#070a12] text-zinc-100 flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-3">
          {estado === 'carregando' ? (
            <LoaderCircle className="w-8 h-8 text-blue-400 animate-spin mx-auto" />
          ) : (
            <>
              <CircleX className="w-10 h-10 text-zinc-500 mx-auto" />
              <h1 className="text-lg font-bold text-white">
                {estado === 'erro' ? 'Não foi possível carregar' : 'Link inválido ou vencido'}
              </h1>
              <p className="text-sm text-zinc-400">
                {estado === 'erro'
                  ? erro
                  : 'Este link de acompanhamento não existe mais. Peça um link novo para a loja que está com o seu aparelho.'}
              </p>
              {estado === 'erro' && (
                <button type="button" onClick={tentarDeNovo} className="text-sm font-bold text-blue-400 hover:underline">
                  Tentar de novo
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  const { loja, os } = dados;
  const cancelada = os.status === 'CANCELADO';
  const etapaAtual = ETAPAS.findIndex((e) => e.status.includes(os.status));
  const aguardandoPeca = os.status === 'AGUARDANDO_PECA';
  const diasGarantia = os.possui_garantia ? Math.max(GARANTIA_LEGAL_DIAS, os.garantia_dias || 0) : GARANTIA_LEGAL_DIAS;
  const whatsappLoja = linkWhatsapp(loja.telefone, `Olá! Tenho uma dúvida sobre a ordem de serviço ${os.numero}.`);

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
            <p className="text-xs text-zinc-500">Acompanhamento do seu aparelho</p>
          </div>
        </header>

        {/* Situação */}
        <Cartao>
          <p className="text-zinc-400">{os.cliente ? `Olá, ${os.cliente}!` : 'Olá!'}</p>
          <h1 className="mt-1 text-xl font-extrabold text-white">{os.aparelho || 'Seu aparelho'}</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Ordem de serviço {os.numero}</p>
          <p className={`mt-4 font-semibold ${cancelada ? 'text-rose-400' : os.status === 'PRONTO' ? 'text-emerald-400' : 'text-blue-300'}`}>
            {DESCRICAO_STATUS[os.status] || 'Seu aparelho está com a gente.'}
          </p>

          {!cancelada && etapaAtual >= 0 && (
            <ol className="mt-5 space-y-0">
              {ETAPAS.map((etapa, i) => {
                const feita = i < etapaAtual || os.status === 'ENTREGUE';
                const atual = i === etapaAtual && os.status !== 'ENTREGUE';
                return (
                  <li key={etapa.rotulo} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 ${
                          feita
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : atual
                              ? 'border-blue-400 bg-blue-500/20'
                              : 'border-zinc-700'
                        }`}
                      >
                        {feita ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : atual && <span className="w-2 h-2 rounded-full bg-blue-400" />}
                      </span>
                      {i < ETAPAS.length - 1 && <span className={`w-0.5 flex-1 min-h-5 ${feita ? 'bg-emerald-500/60' : 'bg-zinc-800'}`} />}
                    </div>
                    <p className={`pb-4 -mt-0.5 ${atual ? 'font-bold text-white' : feita ? 'text-zinc-300' : 'text-zinc-600'}`}>
                      {etapa.rotulo}
                      {atual && i === 2 && aguardandoPeca && <span className="block text-xs font-normal text-zinc-400">Aguardando peça</span>}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </Cartao>

        {/* Orçamento */}
        {os.valor > 0 && !cancelada && (
          <Cartao>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-bold text-white">Orçamento</h2>
              <p className="text-xl font-extrabold text-white">{formatarMoeda(os.valor)}</p>
            </div>
            {os.servico && <p className="mt-1 text-zinc-400">{os.servico}</p>}

            {os.aprovado_em ? (
              <p className="mt-4 flex items-center gap-2 text-emerald-400 font-semibold">
                <Check className="w-4 h-4" /> Aprovado em {formatarDataHora(os.aprovado_em)}
              </p>
            ) : os.pode_aprovar ? (
              <div className="mt-4 space-y-3">
                {!confirmando ? (
                  <button
                    type="button"
                    onClick={() => setConfirmando(true)}
                    className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition"
                  >
                    Aprovar orçamento
                  </button>
                ) : (
                  <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
                    <p className="text-zinc-300">
                      Ao confirmar, você autoriza <strong className="text-white">{loja.nome}</strong> a fazer o serviço no seu{' '}
                      {os.aparelho || 'aparelho'} pelo valor de <strong className="text-white">{formatarMoeda(os.valor)}</strong>.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={aprovar}
                        disabled={aprovando}
                        className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold transition"
                      >
                        {aprovando ? 'Aprovando…' : 'Confirmar aprovação'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmando(false)}
                        disabled={aprovando}
                        className="px-4 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 font-bold transition"
                      >
                        Voltar
                      </button>
                    </div>
                  </div>
                )}
                <p className="text-xs text-zinc-500">Não concorda com o valor ou tem dúvidas? Fale com a loja antes de aprovar.</p>
              </div>
            ) : (
              ['AGUARDANDO_AVALIACAO', 'EM_ANALISE'].includes(os.status) && (
                <p className="mt-3 text-xs text-zinc-500">A loja vai confirmar o orçamento com você.</p>
              )
            )}
            {erro && <p className="mt-3 text-xs text-rose-400">{erro}</p>}
          </Cartao>
        )}

        {/* Detalhes */}
        <Cartao>
          <h2 className="font-bold text-white mb-2 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-blue-400" /> Detalhes
          </h2>
          {os.defeito && <Linha rotulo="Defeito informado" valor={os.defeito} />}
          {os.data_abertura && <Linha rotulo="Entrada" valor={formatarDataOS(os.data_abertura)} />}
          {os.data_prevista && !['ENTREGUE', 'CANCELADO', 'PRONTO'].includes(os.status) && (
            <Linha
              rotulo="Previsão"
              valor={
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5 text-zinc-500" /> {formatarDataOS(os.data_prevista)}
                </span>
              }
            />
          )}
          {os.status === 'ENTREGUE' && os.data_conclusao && <Linha rotulo="Entregue em" valor={formatarDataOS(os.data_conclusao)} />}
        </Cartao>

        {/* Garantia */}
        {os.status === 'ENTREGUE' && (
          <Cartao>
            <h2 className="font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Garantia de {diasGarantia} dias
            </h2>
            <p className="mt-1 text-zinc-400">
              Contados da data de entrega. Guarde o comprovante e, se algo der errado, fale com a loja.
            </p>
          </Cartao>
        )}

        {/* Contato */}
        {(whatsappLoja || loja.endereco || loja.horario) && (
          <Cartao className="space-y-3">
            {whatsappLoja && (
              <a
                href={whatsappLoja}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition"
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
            Acompanhamento por <NomeBancadaOS />
          </span>
        </footer>
      </div>
    </div>
  );
};
