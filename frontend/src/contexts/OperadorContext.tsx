import { createContext, useContext } from 'react';
import type { ChavePermissao } from '../services/cadastros';
import type { Operador } from '../services/acesso';

interface OperadorContexto {
  operador: Operador | null;
  pode: (chave: ChavePermissao) => boolean;
  /** Volta para a tela de identificação (outro funcionário vai usar o sistema). */
  trocarFuncionario: () => void;
  /** Desconecta a conta do sistema e volta para o login com e-mail e senha da conta. */
  sairDaConta: () => void;
}

export const OperadorContext = createContext<OperadorContexto>({
  operador: null,
  pode: () => false,
  trocarFuncionario: () => {},
  sairDaConta: () => {},
});

export const useOperador = () => useContext(OperadorContext);
