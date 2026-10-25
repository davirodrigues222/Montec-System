import { createContext, useContext } from 'react';
import type { ChavePermissao } from '../services/cadastros';
import type { Operador } from '../services/acesso';

interface OperadorContexto {
  operador: Operador | null;
  pode: (chave: ChavePermissao) => boolean;
  /** Volta para a tela de identificação (outro funcionário vai usar o sistema). */
  trocarFuncionario: () => void;
}

export const OperadorContext = createContext<OperadorContexto>({
  operador: null,
  pode: () => false,
  trocarFuncionario: () => {},
});

export const useOperador = () => useContext(OperadorContext);
