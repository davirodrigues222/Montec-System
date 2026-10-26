import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { buscarSituacaoAssinatura, SITUACAO_INDISPONIVEL, type SituacaoAssinatura } from '../services/assinatura';

interface AssinaturaContexto {
  situacao: SituacaoAssinatura;
  /** Primeira leitura da conta ainda em andamento. */
  carregando: boolean;
  /** Consulta o banco de novo (ex.: depois de pagar na Cakto). Devolve a situação atualizada. */
  atualizar: () => Promise<SituacaoAssinatura>;
}

const AssinaturaContext = createContext<AssinaturaContexto>({
  situacao: SITUACAO_INDISPONIVEL,
  carregando: false,
  atualizar: async () => SITUACAO_INDISPONIVEL,
});

/** Lê a assinatura da conta logada (de novo a cada troca de conta). Sem conta, fica "indisponível". */
export const AssinaturaProvider: React.FC<{ contaId: string | null; children: React.ReactNode }> = ({ contaId, children }) => {
  const [situacao, setSituacao] = useState<SituacaoAssinatura>(SITUACAO_INDISPONIVEL);
  const [carregando, setCarregando] = useState(!!contaId);

  const atualizar = useCallback(async () => {
    if (!contaId) return SITUACAO_INDISPONIVEL;
    const nova = await buscarSituacaoAssinatura();
    setSituacao(nova);
    return nova;
  }, [contaId]);

  useEffect(() => {
    let ativo = true;
    setSituacao(SITUACAO_INDISPONIVEL);
    if (!contaId) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    buscarSituacaoAssinatura().then((nova) => {
      if (!ativo) return;
      setSituacao(nova);
      setCarregando(false);
    });
    return () => {
      ativo = false;
    };
  }, [contaId]);

  return <AssinaturaContext.Provider value={{ situacao, carregando, atualizar }}>{children}</AssinaturaContext.Provider>;
};

export const useAssinatura = () => useContext(AssinaturaContext);
