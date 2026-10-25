import React, { useEffect, useState } from 'react';
import {
  CARGOS,
  PERMISSOES_DISPONIVEIS,
  TabelaAusenteError,
  listarFuncionarios,
  normalizarPermissoes,
  type Funcionario,
} from '../../services/cadastros';
import { AvisoTabelaAusente, Badge, Carregando } from '../../components/cadastros/ui';
import { type PropsAbaEquipe, cardCls } from './tipos';

const COR_CARGO = { ADMIN: 'roxo', GERENTE: 'azul', TECNICO: 'verde', ATENDENTE: 'ambar' } as const;

/**
 * Visão da equipe real (tabela funcionarios). O cadastro, as permissões e as senhas continuam em
 * Cadastros › Funcionários, onde a senha é guardada só como hash no banco.
 */
export const AbaEquipe: React.FC<PropsAbaEquipe> = ({ onAbrirCadastro }) => {
  const [equipe, setEquipe] = useState<Funcionario[]>([]);
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'sem-tabela' | 'erro'>('carregando');
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    listarFuncionarios()
      .then((lista) => {
        if (!ativo) return;
        setEquipe(lista);
        setEstado('ok');
      })
      .catch((e: any) => {
        if (!ativo) return;
        if (e instanceof TabelaAusenteError) setEstado('sem-tabela');
        else {
          setErro(e.message);
          setEstado('erro');
        }
      });
    return () => {
      ativo = false;
    };
  }, []);

  const administradores = equipe.filter((f) => f.cargo === 'ADMIN' && f.ativo).length;

  return (
    <div className="space-y-6">
      <div className={cardCls}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">Equipe e controle de acesso</h3>
            <p className="text-xs text-zinc-400 mt-0.5 max-w-3xl">
              Cada funcionário entra com o próprio ID e senha. Telas e ações fora do perfil dele continuam visíveis no menu com
              um cadeado e, ao abrir, pedem o ID e a senha de um Administrador na área principal.
            </p>
          </div>
          {onAbrirCadastro && (
            <button
              type="button"
              onClick={() => onAbrirCadastro('funcionarios')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition shrink-0"
            >
              Gerenciar funcionários
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 bg-[#080c14] border border-zinc-800/80 rounded-xl">
            <p className="font-bold text-zinc-200">Quem libera acesso</p>
            <p className="text-zinc-500 mt-1">
              Funcionários ativos com cargo Administrador. Hoje: <strong className="text-zinc-200">{estado === 'ok' ? administradores : '—'}</strong>.
            </p>
          </div>
          <div className="p-3.5 bg-[#080c14] border border-zinc-800/80 rounded-xl">
            <p className="font-bold text-zinc-200">Senha de liberação</p>
            <p className="text-zinc-500 mt-1">
              É a senha pessoal de cada administrador. Para trocá-la, edite o administrador em Cadastros › Funcionários.
            </p>
          </div>
          <div className="p-3.5 bg-[#080c14] border border-zinc-800/80 rounded-xl">
            <p className="font-bold text-zinc-200">O que exige autorização</p>
            <p className="text-zinc-500 mt-1">
              Tudo que estiver desmarcado nas permissões do funcionário, como relatórios, configurações ou excluir OS.
            </p>
          </div>
        </div>
      </div>

      {estado === 'carregando' && <Carregando />}
      {estado === 'sem-tabela' && <AvisoTabelaAusente modulo="Funcionários" />}
      {estado === 'erro' && <p className="text-xs text-red-400 font-semibold">{erro}</p>}

      {estado === 'ok' && (
        <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[720px]">
              <thead className="bg-[#090d15] text-[10px] text-zinc-400 uppercase tracking-wider border-b border-zinc-800/60">
                <tr>
                  <th className="py-3 px-4">Funcionário</th>
                  <th className="py-3 px-4">ID de acesso</th>
                  <th className="py-3 px-4">Cargo</th>
                  <th className="py-3 px-4">Acesso livre</th>
                  <th className="py-3 px-4">Exige autorização</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40">
                {equipe.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-zinc-500">
                      Nenhum funcionário cadastrado.
                    </td>
                  </tr>
                ) : (
                  equipe.map((f) => {
                    const permissoes = normalizarPermissoes(f.cargo, f.permissoes);
                    const livres = PERMISSOES_DISPONIVEIS.filter((p) => permissoes[p.chave]);
                    const restritas = PERMISSOES_DISPONIVEIS.filter((p) => !permissoes[p.chave]);
                    return (
                      <tr key={f.id_funcionario} className={f.ativo ? '' : 'opacity-50'}>
                        <td className="py-3 px-4">
                          <p className="font-bold text-white">{f.nome}</p>
                          {!f.ativo && <p className="text-[10px] text-zinc-500">Inativo</p>}
                        </td>
                        <td className="py-3 px-4 font-mono text-zinc-300">{f.codigo_acesso}</td>
                        <td className="py-3 px-4">
                          <Badge cor={COR_CARGO[f.cargo] || 'cinza'}>{CARGOS[f.cargo]?.label || f.cargo}</Badge>
                        </td>
                        <td className="py-3 px-4 text-zinc-400">{livres.length === PERMISSOES_DISPONIVEIS.length ? 'Tudo' : `${livres.length} item(ns)`}</td>
                        <td className="py-3 px-4 text-zinc-400">
                          {restritas.length === 0 ? '—' : restritas.map((p) => p.label).join(', ')}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
