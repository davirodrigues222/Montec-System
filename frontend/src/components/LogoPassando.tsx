import React, { useEffect, useState } from 'react';
import { obterConfiguracoesLojaSincrono } from '../services/api';
import { FundoBancada } from './FundoBancada';
import { NomeBancadaOS, SimboloBancadaOS } from './Marca';

/** Logo da animação e nome da loja nas configurações, atualizados quando elas mudam. */
function useLogoDaLoja() {
  const ler = () => {
    const cfg = obterConfiguracoesLojaSincrono();
    return { logo: cfg.logoAnimacaoUrl || '', nome: cfg.nomeLoja || '' };
  };
  const [dados, setDados] = useState(ler);
  useEffect(() => {
    const aoAtualizar = () => setDados(ler());
    window.addEventListener('storage_configs_updated', aoAtualizar);
    return () => window.removeEventListener('storage_configs_updated', aoAtualizar);
  }, []);
  return dados;
}

interface Props {
  className?: string;
  /** Prévia nas Configurações: logo e nome informados em vez dos salvos ('' = logo do BancadaOS). */
  previa?: { logo: string; nome: string };
}

/**
 * Preenche o espaço que sobra num card com poucas linhas (Painel › Ordens em andamento): a logo entra
 * rápido pela esquerda, para no centro e sai pela direita, em ciclo. Usa a logo da loja enviada em
 * Configurações › Aparência (PNG) ou, sem ela, a do BancadaOS. Animações em index.css (logo-passando);
 * quem pede menos movimento vê a logo parada.
 */
export const LogoPassando: React.FC<Props> = ({ className = '', previa }) => {
  const salvos = useLogoDaLoja();
  const { logo, nome } = previa ?? salvos;
  // Logo quase quadrada (só o símbolo) ganha o nome da loja ao lado; logo larga já traz o nome
  const [proporcao, setProporcao] = useState(1);

  return (
    <div aria-hidden="true" className={`logo-passando-area relative isolate overflow-hidden flex items-center justify-center ${className}`}>
      <FundoBancada />
      <div className="logo-passando flex items-center gap-3">
        <span className="logo-passando-rastro absolute right-full top-1/2 -translate-y-1/2 mr-2 h-1 w-40 rounded-full bg-linear-to-r from-transparent to-blue-500/70" />
        {logo ? (
          <>
            <img
              src={logo}
              alt=""
              onLoad={(e) => setProporcao(e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight))}
              className="h-16 w-auto max-w-[260px] object-contain drop-shadow-[0_8px_24px_rgba(59,130,246,0.25)]"
            />
            {proporcao < 1.6 && nome && <span className="text-xl font-black tracking-tight text-white max-w-[240px] truncate">{nome}</span>}
          </>
        ) : (
          <>
            <span className="w-14 h-14 rounded-2xl bg-[#080c14] border border-blue-500/40 shadow-lg shadow-blue-500/10 flex items-center justify-center">
              <SimboloBancadaOS className="w-full h-full p-2" />
            </span>
            <span className="text-xl font-black tracking-tight text-white">
              <NomeBancadaOS />
            </span>
          </>
        )}
      </div>
    </div>
  );
};
