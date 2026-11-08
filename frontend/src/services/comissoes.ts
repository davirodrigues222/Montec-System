import { supabase } from './supabaseClient';
import { MENSAGEM_SEM_PERMISSAO, ehRecusaDePermissao } from './errosBanco';
import { diaLocalDaData } from './api';
import type { OrdemServico } from '../types';
import { lucroOS, valorBrutoOS } from '../utils/financeiroOS';

// ==========================================
// Comissão por técnico (migração 20261108150000_comissoes.sql).
// O técnico de cada OS fica no JSON da OS: checklist_entrada.__tecnicoId / __tecnicoNome.
// Regra: percentual do serviço do catálogo (se houver) > percentual do técnico > sem comissão.
// Entram as OS ENTREGUES no mês (pela data de entrega).
// ==========================================

export type BaseComissao = 'VALOR' | 'LUCRO';

export interface ConfigComissao {
  base: BaseComissao;
  porTecnico: Record<string, number>;
  porServico: Record<string, number>;
}

export const CONFIG_COMISSAO_PADRAO: ConfigComissao = { base: 'LUCRO', porTecnico: {}, porServico: {} };

export const ROTULO_BASE: Record<BaseComissao, string> = {
  VALOR: 'Valor cobrado da OS',
  LUCRO: 'Lucro da OS (líquido − peças, frete e garantia)',
};

export class ComissoesAusenteError extends Error {
  constructor() {
    super('As comissões ainda não foram ativadas no banco (falta executar a migração das comissões).');
    this.name = 'ComissoesAusenteError';
  }
}

function tratarErro(error: any, padrao: string): never {
  if (['PGRST205', '42P01'].includes(error?.code)) throw new ComissoesAusenteError();
  if (ehRecusaDePermissao(error)) throw new Error(MENSAGEM_SEM_PERMISSAO);
  if (error?.code === '23514') throw new Error('Os percentuais precisam ficar entre 0 e 100.');
  throw new Error(error?.message || padrao);
}

/** Só percentuais maiores que zero (0 ou vazio = sem regra) */
const limparPercentuais = (p: Record<string, any> | null | undefined): Record<string, number> =>
  Object.fromEntries(
    Object.entries(p || {})
      .map(([k, v]) => [k, Math.round(Number(v) * 100) / 100] as const)
      .filter(([, v]) => Number.isFinite(v) && v > 0 && v <= 100)
  );

export async function carregarConfigComissao(): Promise<ConfigComissao> {
  const { data, error } = await supabase.from('comissao_config').select('base, por_tecnico, por_servico').maybeSingle();
  if (error) tratarErro(error, 'Não foi possível carregar as regras de comissão.');
  if (!data) return CONFIG_COMISSAO_PADRAO;
  return {
    base: data.base === 'VALOR' ? 'VALOR' : 'LUCRO',
    porTecnico: limparPercentuais(data.por_tecnico),
    porServico: limparPercentuais(data.por_servico),
  };
}

export async function salvarConfigComissao(cfg: ConfigComissao): Promise<void> {
  const { error } = await supabase.from('comissao_config').upsert(
    {
      base: cfg.base,
      por_tecnico: limparPercentuais(cfg.porTecnico),
      por_servico: limparPercentuais(cfg.porServico),
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) tratarErro(error, 'Não foi possível salvar as regras de comissão.');
}

export interface Tecnico {
  id_funcionario: string;
  nome: string;
  cargo: string;
  ativo: boolean;
}

/** Funcionários da loja (para escolher o técnico da OS). Lista vazia se a loja não usa funcionários. */
export async function listarTecnicos(): Promise<Tecnico[]> {
  const { data, error } = await supabase.from('funcionarios').select('id_funcionario, nome, cargo, ativo').order('nome', { ascending: true });
  if (error) return [];
  return data || [];
}

/** Técnicos que aparecem para escolher: ativos, primeiro os de cargo Técnico */
export const tecnicosParaEscolha = (lista: Tecnico[], atualId?: string) =>
  lista
    .filter((t) => t.ativo || t.id_funcionario === atualId)
    .sort((a, b) => Number(b.cargo === 'TECNICO') - Number(a.cargo === 'TECNICO') || a.nome.localeCompare(b.nome, 'pt-BR'));

export const tecnicoDaOS = (os: Pick<OrdemServico, 'checklistEntrada'>): { id: string; nome: string } | null => {
  const id = os.checklistEntrada?.__tecnicoId;
  return id ? { id: String(id), nome: String(os.checklistEntrada?.__tecnicoNome || 'Técnico') } : null;
};

/** Campos do técnico para o JSON da OS (vazio = sem técnico) */
export const tecnicoParaChecklist = (tecnico: Tecnico | null | undefined) => ({
  __tecnicoId: tecnico?.id_funcionario || null,
  __tecnicoNome: tecnico?.nome || null,
});

export interface LinhaComissao {
  os: OrdemServico;
  base: number;
  percentual: number;
  origem: 'SERVICO' | 'TECNICO' | null;
  valor: number;
}

export interface ComissaoTecnico {
  id: string;
  nome: string;
  linhas: LinhaComissao[];
  totalBase: number;
  total: number;
}

const arred = (v: number) => Math.round(v * 100) / 100;

/** OS entregue no mês (data de entrega; sem ela, a de abertura) */
export const entregueNoMes = (os: OrdemServico, mes: string) =>
  os.status_os === 'ENTREGUE' && diaLocalDaData(os.data_conclusao || os.data_abertura).slice(0, 7) === mes;

export function calcularComissoes(
  ordens: OrdemServico[],
  cfg: ConfigComissao,
  mes: string
): { porTecnico: ComissaoTecnico[]; semTecnico: OrdemServico[] } {
  const grupos = new Map<string, ComissaoTecnico>();
  const semTecnico: OrdemServico[] = [];

  ordens
    .filter((os) => entregueNoMes(os, mes))
    .forEach((os) => {
      const tecnico = tecnicoDaOS(os);
      if (!tecnico) {
        semTecnico.push(os);
        return;
      }
      const idServico = os.checklistEntrada?.__servicoId ? String(os.checklistEntrada.__servicoId) : '';
      const pctServico = idServico ? cfg.porServico[idServico] : undefined;
      const pctTecnico = cfg.porTecnico[tecnico.id];
      const percentual = pctServico ?? pctTecnico ?? 0;
      const origem = pctServico !== undefined ? 'SERVICO' : pctTecnico !== undefined ? 'TECNICO' : null;
      // Lucro negativo (garantia, peça cara) não gera comissão negativa
      const base = arred(Math.max(0, cfg.base === 'VALOR' ? valorBrutoOS(os) : lucroOS(os)));
      const valor = arred((base * percentual) / 100);

      const g = grupos.get(tecnico.id) || { id: tecnico.id, nome: tecnico.nome, linhas: [], totalBase: 0, total: 0 };
      g.linhas.push({ os, base, percentual, origem, valor });
      g.totalBase = arred(g.totalBase + base);
      g.total = arred(g.total + valor);
      grupos.set(tecnico.id, g);
    });

  return {
    porTecnico: [...grupos.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR')),
    semTecnico,
  };
}

/** Descrição da despesa de comissão (a mesma a cada lançamento, para não lançar duas vezes) */
export const descricaoDespesaComissao = (nome: string, rotuloMes: string) => `Comissão ${nome} (${rotuloMes})`.slice(0, 120);
