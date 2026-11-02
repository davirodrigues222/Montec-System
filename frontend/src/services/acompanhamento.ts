import { supabase } from './supabaseClient';
import { MENSAGEM_SEM_PERMISSAO, ehRecusaDePermissao } from './errosBanco';
import type { StatusOS } from '../types';

// ==========================================
// Link de acompanhamento da OS para o cliente (migração 20261102090000_link_acompanhamento.sql).
// O cliente abre /acompanhar/<código> sem login, vê o andamento e pode aprovar o orçamento.
// O código fica no banco; a página pública só recebe o que as funções do banco liberam.
// ==========================================

export const CAMINHO_ACOMPANHAMENTO = '/acompanhar/';

const urlDoCodigo = (codigo: string) => `${window.location.origin}${CAMINHO_ACOMPANHAMENTO}${codigo}`;

/** Código da página pública na URL atual, ou null se não for a página de acompanhamento. */
export function codigoNaUrl(): string | null {
  const m = window.location.pathname.match(/^\/acompanhar\/([A-Za-z0-9_-]{24})\/?$/);
  return m ? m[1] : null;
}

function tratarErro(error: any): never {
  // PGRST202: função ainda não existe no banco (migração não executada)
  if (error?.code === 'PGRST202' || error?.code === '42883') {
    throw new Error('O link de acompanhamento ainda não foi ativado no banco (falta executar a migração).');
  }
  if (ehRecusaDePermissao(error)) throw new Error(MENSAGEM_SEM_PERMISSAO);
  throw new Error(error?.message || 'Falha ao gerar o link de acompanhamento.');
}

/** Link da OS para mandar ao cliente (cria na primeira vez; depois devolve sempre o mesmo). */
export async function gerarLinkAcompanhamento(idOs: string): Promise<string> {
  const { data, error } = await supabase.rpc('link_acompanhamento_os', { p_id_os: idOs });
  if (error) tratarErro(error);
  return urlDoCodigo(String(data));
}

/** Invalida o link atual da OS (ex.: mandado para a pessoa errada). O próximo gerado é outro. */
export async function revogarLinkAcompanhamento(idOs: string): Promise<void> {
  const { error } = await supabase.rpc('revogar_link_acompanhamento', { p_id_os: idOs });
  if (error) tratarErro(error);
}

// ------------------------------------------
// Página pública
// ------------------------------------------

export interface Acompanhamento {
  loja: { nome: string; telefone: string; endereco: string; horario: string; logo: string };
  os: {
    numero: string;
    status: StatusOS;
    cliente: string;
    aparelho: string;
    defeito: string;
    servico: string;
    valor: number;
    data_abertura: string | null;
    data_prevista: string | null;
    data_conclusao: string | null;
    possui_garantia: boolean;
    garantia_dias: number | null;
    aprovado_em: string | null;
    pode_aprovar: boolean;
  };
}

/** Dados da OS para a página pública; null se o link não existe, foi revogado ou venceu. */
export async function consultarAcompanhamento(codigo: string): Promise<Acompanhamento | null> {
  const { data, error } = await supabase.rpc('consultar_acompanhamento', { p_token: codigo });
  if (error) throw new Error('Não foi possível carregar o acompanhamento. Verifique a internet e tente de novo.');
  return (data as Acompanhamento) || null;
}

export async function aprovarOrcamentoPeloLink(codigo: string): Promise<Acompanhamento | null> {
  const { data, error } = await supabase.rpc('aprovar_orcamento_acompanhamento', { p_token: codigo });
  if (error) throw new Error(error.message || 'Não foi possível aprovar o orçamento. Tente de novo.');
  return (data as Acompanhamento) || null;
}
