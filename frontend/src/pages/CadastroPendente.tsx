import React from 'react';
import type { SecaoCadastro } from '../types';

// Submódulos novos cujas tabelas ainda não existem no Supabase.
// A tela só descreve o módulo: nenhum formulário é exibido para não gravar em tabelas inexistentes.
const MODULOS: Partial<Record<SecaoCadastro, { titulo: string; descricao: string; recursos: string[] }>> = {
  lojas: {
    titulo: 'Lojas',
    descricao: 'Cadastre e gerencie as unidades da sua rede. Cada ordem de serviço poderá ser vinculada à loja que a abriu.',
    recursos: [
      'Dados da unidade: nome, CNPJ, telefone, e-mail e endereço',
      'Loja principal da conta e lojas ativas/inativas',
      'Filtro por loja no Painel, Relatórios e Histórico',
    ],
  },
  funcionarios: {
    titulo: 'Funcionários',
    descricao: 'Cadastre colaboradores com código de acesso único e senha para identificar quem opera o sistema em cada loja.',
    recursos: [
      'Código de acesso único por conta e senha protegida com bcrypt',
      'Cargo (Administrador, Gerente, Técnico, Atendente) e permissões',
      'Vínculo com uma ou mais lojas e bloqueio após tentativas inválidas',
    ],
  },
  'formas-pagamento': {
    titulo: 'Formas de pagamento',
    descricao: 'Parametrize as formas de pagamento aceitas, com taxas, parcelamento e prazo de recebimento.',
    recursos: [
      'Tipo (Dinheiro, PIX, Débito, Crédito, Boleto, Transferência)',
      'Taxa percentual e fixa, com tabela de taxa por número de parcelas',
      'Parcelas máximas, parcelas sem juros e prazo de recebimento (D+N)',
    ],
  },
};

export const CadastroPendente: React.FC<{ secao: SecaoCadastro }> = ({ secao }) => {
  const modulo = MODULOS[secao];
  if (!modulo) return null;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto font-sans pb-16">
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">{modulo.titulo}</h2>
        <p className="text-xs sm:text-sm text-zinc-400 mt-1">{modulo.descricao}</p>
      </div>

      <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/25 bg-amber-500/10">
          <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div>
            <p className="text-xs font-bold text-amber-400">Módulo em preparação</p>
            <p className="text-xs text-zinc-400 mt-1">
              Este cadastro depende de novas tabelas no banco de dados. Assim que a estrutura for criada no Supabase,
              o formulário e a lista serão habilitados aqui.
            </p>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-bold text-zinc-400 tracking-wider uppercase mb-3">O que este módulo terá</p>
          <ul className="space-y-2">
            {modulo.recursos.map((r) => (
              <li key={r} className="flex items-start gap-2.5 text-xs text-zinc-300">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
