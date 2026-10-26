import { supabase } from './supabaseClient';
import { MENSAGEM_SEM_PERMISSAO, ehRecusaDePermissao, exigirLinhaAfetada } from './errosBanco';
import { contaDoUsuario } from './contaLogin';

// ==========================================
// Acesso ao banco dos submódulos de Cadastro: Clientes, Lojas, Funcionários e Formas de Pagamento.
// Lojas, Funcionários e Formas de Pagamento dependem da migração
// supabase/migrations/20261024120000_cadastros_lojas_funcionarios_pagamentos.sql
// ==========================================

/** Erro lançado quando a tabela ainda não existe no Supabase (migração não executada). */
export class TabelaAusenteError extends Error {
  tabela: string;
  constructor(tabela: string) {
    super(`A tabela "${tabela}" ainda não existe no banco de dados.`);
    this.name = 'TabelaAusenteError';
    this.tabela = tabela;
  }
}

function tratarErro(error: any, tabela: string): never {
  // PGRST205: tabela fora do schema cache do PostgREST | 42P01: relation does not exist
  if (error?.code === 'PGRST205' || error?.code === '42P01') {
    throw new TabelaAusenteError(tabela);
  }
  if (error?.code === '23505') {
    throw new Error('Já existe um registro com esses dados (valor duplicado).');
  }
  if (ehRecusaDePermissao(error)) throw new Error(MENSAGEM_SEM_PERMISSAO);
  throw new Error(error?.message || 'Falha ao acessar o banco de dados.');
}

const gerarId = () =>
  crypto.randomUUID ? crypto.randomUUID() : 'id_' + Math.random().toString(36).substring(2, 11);

/**
 * Grava tolerando colunas opcionais que ainda não existem no banco: se o Supabase recusar uma coluna,
 * remove SÓ aquela coluna e tenta de novo. Retorna as colunas que ficaram de fora (para avisar o usuário).
 */
async function gravarComColunasOpcionais(
  payload: Record<string, any>,
  opcionais: string[],
  executar: (p: Record<string, any>) => PromiseLike<{ error: any }>,
  tabela: string
): Promise<string[]> {
  const p = { ...payload };
  const ignoradas: string[] = [];
  for (let tentativa = 0; tentativa <= opcionais.length; tentativa++) {
    const { error } = await executar(p);
    if (!error) return ignoradas;

    // Ex.: "Could not find the 'observacoes' column of 'clientes' in the schema cache"
    const coluna = (error.message || '').match(/'([a-z_]+)' column/i)?.[1];
    if (error.code === 'PGRST204' && coluna && opcionais.includes(coluna) && coluna in p) {
      // Coluna vazia não precisa de aviso: não havia nada a perder
      if (p[coluna] !== null && p[coluna] !== '') ignoradas.push(coluna);
      delete p[coluna];
      continue;
    }
    tratarErro(error, tabela);
  }
  return ignoradas;
}

/** Texto de aviso para colunas que não puderam ser salvas por falta da migração opcional. */
export const avisoColunasIgnoradas = (colunas: string[]) =>
  colunas.length
    ? ` Atenção: ${colunas.join(', ')} não foi salvo porque o campo ainda não existe no banco (execute a migração de colunas opcionais).`
    : '';

/** Converte "R$ 1.234,56", "1234,56" ou "1234.56" em número. Retorna null se inválido. */
export function parseMoedaBR(entrada: string): number | null {
  let s = String(entrada || '').replace(/R\$/gi, '').replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "1.500" = mil e quinhentos
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100) / 100;
}

/** Conta quantas OS usam cada valor de uma coluna de ordens_servico (para a coluna "Uso" das listagens). */
async function contarOrdensPor(coluna: 'id_cliente' | 'fornecedor_peca'): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('ordens_servico').select(coluna);
  if (error) return {};
  const mapa: Record<string, number> = {};
  (data || []).forEach((o: any) => {
    const chave = coluna === 'fornecedor_peca' ? String(o[coluna] || '').trim().toLowerCase() : o[coluna];
    if (chave) mapa[chave] = (mapa[chave] || 0) + 1;
  });
  return mapa;
}

// ==========================================
// CLIENTES (tabela existente)
// ==========================================

export interface Cliente {
  id_cliente: string;
  nome: string;
  whatsapp: string;
  cpf_cnpj: string | null;
  email?: string | null;
  observacoes?: string | null; // coluna opcional (migração de colunas opcionais)
}

export async function listarClientes(): Promise<Cliente[]> {
  const { data, error } = await supabase.from('clientes').select('*').order('nome', { ascending: true });
  if (error) tratarErro(error, 'clientes');
  return data || [];
}

/**
 * Cria ou atualiza um cliente. Retorna as colunas opcionais que não puderam ser salvas.
 * (Antes, uma falha em "observacoes" fazia o e-mail ser descartado junto.)
 */
export async function salvarCliente(dados: Omit<Cliente, 'id_cliente'>, idCliente?: string): Promise<string[]> {
  const payload = {
    nome: dados.nome.trim(),
    whatsapp: dados.whatsapp.trim(),
    cpf_cnpj: dados.cpf_cnpj?.trim() || null,
    email: dados.email?.trim() || null,
    observacoes: dados.observacoes?.trim() || null,
  };
  const novoId = gerarId();
  const userId = idCliente ? undefined : contaDoUsuario((await supabase.auth.getUser()).data?.user) || undefined;

  return gravarComColunasOpcionais(
    payload,
    ['email', 'observacoes'],
    (p) =>
      idCliente
        ? supabase.from('clientes').update(p).eq('id_cliente', idCliente)
        : supabase.from('clientes').insert([{ id_cliente: novoId, ...p, ...(userId ? { user_id: userId } : {}) }]),
    'clientes'
  );
}

/** Exclui o cliente. Bloqueia se houver ordens de serviço vinculadas (para não deixar OS órfãs). */
export async function excluirCliente(idCliente: string): Promise<void> {
  const { count, error: errCount } = await supabase
    .from('ordens_servico')
    .select('id_os', { count: 'exact', head: true })
    .eq('id_cliente', idCliente);
  if (errCount) tratarErro(errCount, 'ordens_servico');
  if ((count || 0) > 0) {
    throw new Error(
      `Este cliente possui ${count} ordem(ns) de serviço vinculada(s) e não pode ser excluído.`
    );
  }

  const { data, error } = await supabase.from('clientes').delete().eq('id_cliente', idCliente).select('id_cliente');
  if (error) tratarErro(error, 'clientes');
  exigirLinhaAfetada(data); // sem permissão o banco não exclui e não dá erro
}

/** Quantidade de OS por cliente, para exibir na listagem. */
export const contarOrdensPorCliente = () => contarOrdensPor('id_cliente');

/**
 * Acesso e portabilidade (LGPD, art. 18, II e V): cadastro do cliente e resumo das ordens de serviço
 * dele, para entregar ao titular. A senha do aparelho e os dados internos da loja não entram.
 */
export async function exportarDadosCliente(idCliente: string): Promise<Record<string, any>> {
  const [{ data: cliente, error: errCliente }, { data: ordens, error: errOrdens }] = await Promise.all([
    supabase.from('clientes').select('*').eq('id_cliente', idCliente).single(),
    supabase
      .from('ordens_servico')
      .select('numero_os, status_os, data_abertura, data_conclusao, defeito_relatado, valor_total, forma_pagamento, aparelhos_cliente(modelo, imei_1)')
      .eq('id_cliente', idCliente)
      .order('data_abertura', { ascending: true }),
  ]);
  if (errCliente) tratarErro(errCliente, 'clientes');
  if (errOrdens) tratarErro(errOrdens, 'ordens_servico');
  return {
    geradoEm: new Date().toISOString(),
    baseLegal: 'Lei 13.709/2018 (LGPD), art. 18, II e V',
    cliente: cliente && {
      nome: cliente.nome,
      whatsapp: cliente.whatsapp,
      cpfCnpj: cliente.cpf_cnpj,
      email: cliente.email ?? null,
      observacoes: cliente.observacoes ?? null,
    },
    ordensDeServico: (ordens || []).map((o: any) => ({
      numero: o.numero_os,
      status: o.status_os,
      abertura: o.data_abertura,
      entrega: o.data_conclusao,
      defeitoRelatado: o.defeito_relatado,
      valorTotal: o.valor_total,
      formaPagamento: o.forma_pagamento,
      aparelho: o.aparelhos_cliente ? { modelo: o.aparelhos_cliente.modelo, imei: o.aparelhos_cliente.imei_1 } : null,
    })),
  };
}

/**
 * Eliminação a pedido do titular (LGPD, art. 18, VI): apaga nome, contato, CPF/CNPJ e observações.
 * As ordens de serviço continuam (obrigações fiscais e prazo de reclamação do CDC, LGPD art. 16, I),
 * mas deixam de identificar a pessoa.
 */
export async function anonimizarCliente(idCliente: string): Promise<void> {
  // email e observacoes são colunas opcionais: se não existirem no banco, não há o que apagar nelas
  await gravarComColunasOpcionais(
    { nome: 'Cliente anonimizado (LGPD)', whatsapp: '', cpf_cnpj: null, email: null, observacoes: null },
    ['email', 'observacoes'],
    (p) => supabase.from('clientes').update(p).eq('id_cliente', idCliente),
    'clientes'
  );
}

// ==========================================
// SERVIÇOS (tabela existente cad_servicos)
// garantia_padrao é texto ("90 dias", "1 ano", "Sem garantia") e é lido por extrairDiasGarantia (api.ts)
// ==========================================

export interface Servico {
  id_servico: string;
  nome: string;
  preco_sugerido: number;
  tempo_estimado: string | null;
  garantia_padrao: string | null; // null = usa o prazo padrão da loja
  descricao: string | null;
}

export async function listarServicos(): Promise<Servico[]> {
  const { data, error } = await supabase.from('cad_servicos').select('*').order('nome', { ascending: true });
  if (error) tratarErro(error, 'cad_servicos');
  return (data || []).map((s: any) => ({ ...s, preco_sugerido: Number(s.preco_sugerido || 0) }));
}

export async function salvarServico(dados: Omit<Servico, 'id_servico'>, idServico?: string): Promise<string[]> {
  const payload = {
    nome: dados.nome.trim(),
    preco_sugerido: dados.preco_sugerido,
    tempo_estimado: dados.tempo_estimado?.trim() || null,
    garantia_padrao: dados.garantia_padrao || null,
    descricao: dados.descricao?.trim() || null,
  };
  const novoId = gerarId();
  const userId = idServico ? undefined : contaDoUsuario((await supabase.auth.getUser()).data?.user) || undefined;

  return gravarComColunasOpcionais(
    payload,
    ['tempo_estimado', 'garantia_padrao', 'descricao'],
    (p) =>
      idServico
        ? supabase.from('cad_servicos').update(p).eq('id_servico', idServico)
        : supabase.from('cad_servicos').insert([{ id_servico: novoId, ...p, ...(userId ? { user_id: userId } : {}) }]),
    'cad_servicos'
  );
}

/** As OS guardam o prazo de garantia e o nome do serviço nelas mesmas, então excluir não afeta OS já abertas. */
export async function excluirServico(idServico: string): Promise<void> {
  const { data, error } = await supabase.from('cad_servicos').delete().eq('id_servico', idServico).select('id_servico');
  if (error) tratarErro(error, 'cad_servicos');
  exigirLinhaAfetada(data); // sem permissão o banco não exclui e não dá erro
}

// ==========================================
// FORNECEDORES (tabela existente cad_fornecedores)
// "contato" guarda o telefone/WhatsApp. email e observacoes são colunas opcionais.
// ==========================================

export const CATEGORIAS_FORNECEDOR = [
  'Telas & Displays',
  'Baterias',
  'Peças & Componentes',
  'Acessórios & Películas',
  'Ferramentas & Insumos',
];

export interface Fornecedor {
  id_fornecedor: string;
  nome: string;
  contato: string | null;
  cnpj: string | null;
  categoria: string | null;
  email?: string | null;
  observacoes?: string | null;
}

export async function listarFornecedores(): Promise<Fornecedor[]> {
  const { data, error } = await supabase.from('cad_fornecedores').select('*').order('nome', { ascending: true });
  if (error) tratarErro(error, 'cad_fornecedores');
  return data || [];
}

export async function salvarFornecedor(dados: Omit<Fornecedor, 'id_fornecedor'>, idFornecedor?: string): Promise<string[]> {
  const payload = {
    nome: dados.nome.trim(),
    contato: dados.contato?.trim() || '',
    cnpj: dados.cnpj?.trim() || null,
    categoria: dados.categoria || null,
    email: dados.email?.trim() || null,
    observacoes: dados.observacoes?.trim() || null,
  };
  const novoId = gerarId();
  const userId = idFornecedor ? undefined : contaDoUsuario((await supabase.auth.getUser()).data?.user) || undefined;

  return gravarComColunasOpcionais(
    payload,
    ['cnpj', 'categoria', 'email', 'observacoes'],
    (p) =>
      idFornecedor
        ? supabase.from('cad_fornecedores').update(p).eq('id_fornecedor', idFornecedor)
        : supabase.from('cad_fornecedores').insert([{ id_fornecedor: novoId, ...p, ...(userId ? { user_id: userId } : {}) }]),
    'cad_fornecedores'
  );
}

/** As OS guardam o nome do fornecedor como texto, então excluir não altera OS já registradas. */
export async function excluirFornecedor(idFornecedor: string): Promise<void> {
  const { data, error } = await supabase.from('cad_fornecedores').delete().eq('id_fornecedor', idFornecedor).select('id_fornecedor');
  if (error) tratarErro(error, 'cad_fornecedores');
  exigirLinhaAfetada(data); // sem permissão o banco não exclui e não dá erro
}

/** Quantidade de OS por fornecedor (as OS guardam o nome em fornecedor_peca; chave em minúsculas). */
export const contarOrdensPorFornecedor = () => contarOrdensPor('fornecedor_peca');

// ==========================================
// LOJAS
// ==========================================

export interface Loja {
  id_loja: string;
  nome: string;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  principal: boolean;
  ativo: boolean;
  created_at?: string;
}

export type LojaInput = Omit<Loja, 'id_loja' | 'created_at'>;

/** Endereço em uma linha para documentos impressos: "Rua X, 100 - Centro, Fortaleza - CE" */
export function enderecoCompletoLoja(l: Pick<Loja, 'logradouro' | 'numero' | 'bairro' | 'cidade' | 'uf'>): string {
  const rua = [l.logradouro, l.numero].filter(Boolean).join(', ');
  const cidade = [l.cidade, l.uf].filter(Boolean).join(' - ');
  return [[rua, l.bairro].filter(Boolean).join(' - '), cidade].filter(Boolean).join(', ');
}

/** Avisa cabeçalho e demais telas que a lista de lojas mudou. */
export const EVENTO_LOJAS_ATUALIZADAS = 'lojas_atualizadas';

export async function listarLojas(): Promise<Loja[]> {
  const { data, error } = await supabase
    .from('lojas')
    .select('*')
    .order('principal', { ascending: false })
    .order('nome', { ascending: true });
  if (error) tratarErro(error, 'lojas');
  return data || [];
}

export async function salvarLoja(dados: LojaInput, idLoja?: string): Promise<void> {
  // Só pode existir uma loja principal: desmarca a atual antes (índice único parcial no banco)
  if (dados.principal) {
    let q = supabase.from('lojas').update({ principal: false }).eq('principal', true);
    if (idLoja) q = q.neq('id_loja', idLoja);
    const { error } = await q;
    if (error) tratarErro(error, 'lojas');
  }

  const { error } = idLoja
    ? await supabase.from('lojas').update(dados).eq('id_loja', idLoja)
    : await supabase.from('lojas').insert([dados]);
  if (error) tratarErro(error, 'lojas');
}

export async function excluirLoja(idLoja: string): Promise<void> {
  const { data, error } = await supabase.from('lojas').delete().eq('id_loja', idLoja).select('id_loja');
  if (error) tratarErro(error, 'lojas');
  exigirLinhaAfetada(data); // sem permissão o banco não exclui e não dá erro
}

// ==========================================
// FUNCIONÁRIOS
// A coluna senha_hash não é legível pelo navegador: sempre selecionar colunas explícitas (nunca '*').
// ==========================================

export type CargoFuncionario = 'ADMIN' | 'GERENTE' | 'TECNICO' | 'ATENDENTE';

// Cada permissão de "tela" corresponde a um item do menu lateral (ver services/acesso.ts)
export const PERMISSOES_DISPONIVEIS = [
  { chave: 'tela_painel', label: 'Painel', grupo: 'Telas' },
  { chave: 'tela_nova_os', label: 'Nova ordem', grupo: 'Telas' },
  { chave: 'tela_ordens', label: 'Ordens de serviço', grupo: 'Telas' },
  { chave: 'tela_garantias', label: 'Garantias e retornos', grupo: 'Telas' },
  { chave: 'tela_relatorios', label: 'Análises e relatórios', grupo: 'Telas' },
  { chave: 'tela_cadastros', label: 'Cadastros: clientes, serviços e fornecedores', grupo: 'Telas' },
  { chave: 'tela_empresa', label: 'Cadastros: lojas, funcionários e formas de pagamento', grupo: 'Telas' },
  { chave: 'tela_configuracoes', label: 'Configurações', grupo: 'Telas' },
  { chave: 'excluir_os', label: 'Excluir ordens de serviço', grupo: 'Ações' },
] as const;

export type ChavePermissao = (typeof PERMISSOES_DISPONIVEIS)[number]['chave'];
export type Permissoes = Partial<Record<ChavePermissao, boolean>>;

const todas = (valor: boolean): Permissoes =>
  Object.fromEntries(PERMISSOES_DISPONIVEIS.map((p) => [p.chave, valor])) as Permissoes;

/** Funcionário cadastrado pela tela de acesso: entra sem nenhuma tela até um administrador liberar. */
export const PERMISSOES_PENDENTES: Permissoes = todas(false);

export const CARGOS: Record<CargoFuncionario, { label: string; descricao: string; permissoes: Permissoes }> = {
  ADMIN: {
    label: 'Administrador',
    descricao: 'Acesso total, sempre (não pode ser restringido)',
    permissoes: todas(true),
  },
  GERENTE: {
    label: 'Gerente',
    descricao: 'Opera a loja e acompanha o financeiro',
    permissoes: { ...todas(true), tela_configuracoes: false },
  },
  TECNICO: {
    label: 'Técnico',
    descricao: 'Diagnóstico e execução dos reparos',
    permissoes: { ...todas(false), tela_painel: true, tela_nova_os: true, tela_ordens: true, tela_garantias: true },
  },
  ATENDENTE: {
    label: 'Atendente',
    descricao: 'Recepção, abertura de OS e entregas',
    permissoes: { ...todas(false), tela_painel: true, tela_nova_os: true, tela_ordens: true, tela_garantias: true, tela_cadastros: true },
  },
};

// Chaves da primeira versão do cadastro -> telas equivalentes
const PERMISSOES_LEGADAS: Record<string, ChavePermissao[]> = {
  abrir_os: ['tela_painel', 'tela_nova_os', 'tela_ordens', 'tela_garantias'],
  ver_financeiro: ['tela_relatorios'],
  gerenciar_cadastros: ['tela_cadastros'],
  gerenciar_configuracoes: ['tela_configuracoes', 'tela_empresa'],
};

/**
 * Permissões efetivas de um funcionário:
 * - ADMIN tem tudo, sempre (evita que a conta fique sem ninguém capaz de liberar telas);
 * - permissões salvas no formato antigo são convertidas para as telas equivalentes;
 * - sem nenhuma permissão salva, usa o padrão do cargo.
 */
export function normalizarPermissoes(cargo: CargoFuncionario, salvas: Record<string, any> | null | undefined): Permissoes {
  if (cargo === 'ADMIN') return todas(true);
  const p = salvas || {};
  const conhecidas = PERMISSOES_DISPONIVEIS.map((x) => x.chave as string);
  const temNovas = Object.keys(p).some((k) => conhecidas.includes(k));
  const temLegadas = Object.keys(p).some((k) => k in PERMISSOES_LEGADAS);
  if (!temNovas && !temLegadas) return { ...(CARGOS[cargo]?.permissoes || PERMISSOES_PENDENTES) };

  const resultado: Permissoes = todas(false);
  for (const [k, v] of Object.entries(p)) {
    if (conhecidas.includes(k)) resultado[k as ChavePermissao] = !!v;
    else if (v && PERMISSOES_LEGADAS[k]) PERMISSOES_LEGADAS[k].forEach((t) => (resultado[t] = true));
  }
  return resultado;
}

/** Funcionário que ainda não tem nenhuma tela liberada. */
export const aguardandoLiberacao = (cargo: CargoFuncionario, permissoes: Record<string, any>) => {
  const efetivas = normalizarPermissoes(cargo, permissoes);
  return !PERMISSOES_DISPONIVEIS.some((p) => p.grupo === 'Telas' && efetivas[p.chave]);
};

export interface Funcionario {
  id_funcionario: string;
  codigo_acesso: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  cargo: CargoFuncionario;
  permissoes: Permissoes;
  ativo: boolean;
  bloqueado_ate: string | null;
  ultimo_acesso: string | null;
  created_at?: string;
  lojas: string[]; // id_loja vinculados
}

export type FuncionarioInput = Omit<
  Funcionario,
  'id_funcionario' | 'bloqueado_ate' | 'ultimo_acesso' | 'created_at' | 'lojas'
>;

const COLUNAS_FUNCIONARIO =
  'id_funcionario, codigo_acesso, nome, cpf, telefone, email, cargo, permissoes, ativo, bloqueado_ate, ultimo_acesso, created_at';

/** Código de acesso: somente número inteiro (dígitos 0-9, sem vírgula, ponto ou sinal). */
export const REGEX_CODIGO_ACESSO = /^\d{1,15}$/;
export const MENSAGEM_CODIGO_INVALIDO = 'O código de acesso deve ser um número inteiro (somente dígitos, sem vírgula ou ponto).';

/** Para usar no onChange dos campos de código: descarta tudo que não for dígito (inclusive , e .). */
export const somenteDigitosCodigo = (v: string) => v.replace(/\D/g, '').slice(0, 15);

/** Próximo código numérico livre (maior código numérico existente + 1, começando em 1). */
export function proximoCodigoAcesso(codigosExistentes: string[]): string {
  const numericos = codigosExistentes.filter((c) => REGEX_CODIGO_ACESSO.test(c)).map((c) => BigInt(c));
  const maior = numericos.reduce((m, n) => (n > m ? n : m), 0n);
  return String(maior + 1n);
}

/** Busca os códigos já usados na conta e sugere o próximo número livre. */
export async function sugerirProximoCodigoAcesso(): Promise<string> {
  const { data, error } = await supabase.from('funcionarios').select('codigo_acesso');
  if (error) return '1';
  return proximoCodigoAcesso((data || []).map((f: any) => String(f.codigo_acesso)));
}

export async function listarFuncionarios(): Promise<Funcionario[]> {
  const [{ data, error }, { data: vinculos, error: errVinc }] = await Promise.all([
    supabase.from('funcionarios').select(COLUNAS_FUNCIONARIO).order('nome', { ascending: true }),
    supabase.from('funcionario_lojas').select('id_funcionario, id_loja'),
  ]);
  if (error) tratarErro(error, 'funcionarios');
  if (errVinc) tratarErro(errVinc, 'funcionario_lojas');

  return (data || []).map((f: any) => ({
    ...f,
    permissoes: f.permissoes || {},
    lojas: (vinculos || []).filter((v: any) => v.id_funcionario === f.id_funcionario).map((v: any) => v.id_loja),
  }));
}

/**
 * Cria ou atualiza um funcionário, sincroniza as lojas vinculadas e (se informada) define a senha.
 * A senha é enviada à função definir_senha_funcionario, que grava apenas o hash bcrypt.
 */
export async function salvarFuncionario(
  dados: FuncionarioInput,
  lojas: string[],
  senha?: string,
  idFuncionario?: string
): Promise<void> {
  const payload = {
    codigo_acesso: dados.codigo_acesso.trim(),
    nome: dados.nome.trim(),
    cpf: dados.cpf || null,
    telefone: dados.telefone || null,
    email: dados.email || null,
    cargo: dados.cargo,
    permissoes: dados.permissoes,
    ativo: dados.ativo,
  };

  let id = idFuncionario;
  if (id) {
    // Alteração recusada pelas regras do banco não dá erro: só não altera nenhuma linha
    const { data, error } = await supabase.from('funcionarios').update(payload).eq('id_funcionario', id).select('id_funcionario');
    if (error) tratarErroFuncionario(error);
    if (!data?.length) throw new Error(MENSAGEM_SO_ADMIN);
  } else {
    const { data, error } = await supabase.from('funcionarios').insert([payload]).select('id_funcionario').single();
    if (error) tratarErroFuncionario(error);
    id = data!.id_funcionario;
  }

  // Lojas: substitui os vínculos atuais pelos selecionados
  const { error: errDel } = await supabase.from('funcionario_lojas').delete().eq('id_funcionario', id!);
  if (errDel) tratarErro(errDel, 'funcionario_lojas');
  if (lojas.length > 0) {
    const { error: errIns } = await supabase
      .from('funcionario_lojas')
      .insert(lojas.map((id_loja) => ({ id_funcionario: id!, id_loja })));
    if (errIns) tratarErro(errIns, 'funcionario_lojas');
  }

  if (senha) {
    const { error: errSenha } = await supabase.rpc('definir_senha_funcionario', {
      p_id_funcionario: id!,
      p_senha: senha,
    });
    if (errSenha) {
      throw new Error(
        idFuncionario
          ? errSenha.message || 'Dados salvos, mas não foi possível redefinir a senha.'
          : `Funcionário cadastrado, mas a senha não foi definida: ${errSenha.message}. Edite o funcionário para definir a senha.`
      );
    }
  }
}

/** Recusa das regras do banco (migração 20261025150000): falta um administrador identificado. */
export const MENSAGEM_SO_ADMIN =
  'Somente um administrador pode cadastrar, alterar ou excluir funcionários. Peça a autorização de um administrador.';

function tratarErroFuncionario(error: any): never {
  if (error?.code === '42501') throw new Error(MENSAGEM_SO_ADMIN);
  if (error?.code === '23505') {
    throw new Error('Este código de acesso já está em uso por outro funcionário.');
  }
  if (error?.code === '23514' && /codigo_acesso/.test(error.message || '')) {
    // A tela já validou o formato: se o banco recusou, ele ainda está com a regra antiga (3 a 30 caracteres)
    throw new Error(
      'O banco de dados recusou este código porque ainda usa a regra antiga (mínimo de 3 caracteres). ' +
        'Execute a migração 20261024170000_codigo_acesso_numerico.sql no SQL Editor do Supabase e tente de novo.'
    );
  }
  tratarErro(error, 'funcionarios');
}

/** Quantidade de funcionários da conta (0 = primeiro acesso: pedir cadastro do administrador). */
export async function contarFuncionarios(): Promise<number> {
  const { count, error } = await supabase.from('funcionarios').select('id_funcionario', { count: 'exact', head: true });
  if (error) tratarErro(error, 'funcionarios');
  return count || 0;
}

export async function excluirFuncionario(idFuncionario: string): Promise<void> {
  const { data, error } = await supabase.from('funcionarios').delete().eq('id_funcionario', idFuncionario).select('id_funcionario');
  if (error) tratarErroFuncionario(error);
  if (!data?.length) throw new Error(MENSAGEM_SO_ADMIN);
}

// ==========================================
// FORMAS DE PAGAMENTO
// ==========================================

export type TipoFormaPagamento =
  | 'DINHEIRO'
  | 'PIX'
  | 'CARTAO_DEBITO'
  | 'CARTAO_CREDITO'
  | 'BOLETO'
  | 'TRANSFERENCIA'
  | 'OUTRO';

export const TIPOS_FORMA_PAGAMENTO: Record<TipoFormaPagamento, { label: string; aceitaParcelamento: boolean }> = {
  DINHEIRO: { label: 'Dinheiro', aceitaParcelamento: false },
  PIX: { label: 'PIX', aceitaParcelamento: false },
  CARTAO_DEBITO: { label: 'Cartão de débito', aceitaParcelamento: false },
  CARTAO_CREDITO: { label: 'Cartão de crédito', aceitaParcelamento: true },
  BOLETO: { label: 'Boleto', aceitaParcelamento: true },
  TRANSFERENCIA: { label: 'Transferência / TED', aceitaParcelamento: false },
  OUTRO: { label: 'Outro', aceitaParcelamento: true },
};

export interface TaxaParcela {
  parcelas: number;
  taxa_percentual: number;
}

export interface FormaPagamento {
  id_forma_pagamento: string;
  id_loja: string | null;
  nome: string;
  tipo: TipoFormaPagamento;
  taxa_percentual: number;
  taxa_fixa: number;
  permite_parcelamento: boolean;
  parcelas_max: number;
  parcelas_sem_juros: number;
  repassar_juros_cliente: boolean;
  prazo_recebimento_dias: number;
  ativo: boolean;
  ordem: number;
  created_at?: string;
  taxas: TaxaParcela[];
}

export type FormaPagamentoInput = Omit<FormaPagamento, 'id_forma_pagamento' | 'created_at' | 'taxas'>;

export async function listarFormasPagamento(): Promise<FormaPagamento[]> {
  const { data, error } = await supabase
    .from('formas_pagamento')
    .select('*, formas_pagamento_taxas(parcelas, taxa_percentual)')
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true });
  if (error) tratarErro(error, 'formas_pagamento');

  return (data || []).map((f: any) => {
    const { formas_pagamento_taxas, ...resto } = f;
    return {
      ...resto,
      taxa_percentual: Number(f.taxa_percentual || 0),
      taxa_fixa: Number(f.taxa_fixa || 0),
      taxas: (formas_pagamento_taxas || [])
        .map((t: any) => ({ parcelas: Number(t.parcelas), taxa_percentual: Number(t.taxa_percentual) }))
        .sort((a: TaxaParcela, b: TaxaParcela) => a.parcelas - b.parcelas),
    };
  });
}

/** Cria ou atualiza a forma de pagamento e substitui a tabela de taxas por parcela. */
export async function salvarFormaPagamento(
  dados: FormaPagamentoInput,
  taxas: TaxaParcela[],
  idForma?: string
): Promise<void> {
  let id = idForma;
  if (id) {
    const { error } = await supabase.from('formas_pagamento').update(dados).eq('id_forma_pagamento', id);
    if (error) tratarErro(error, 'formas_pagamento');
  } else {
    const { data, error } = await supabase
      .from('formas_pagamento')
      .insert([dados])
      .select('id_forma_pagamento')
      .single();
    if (error) tratarErro(error, 'formas_pagamento');
    id = data!.id_forma_pagamento;
  }

  const taxasValidas = dados.permite_parcelamento
    ? taxas.filter((t) => t.parcelas >= 1 && t.parcelas <= dados.parcelas_max)
    : [];

  // Grava as taxas novas antes de remover as que saíram: se a conexão cair no meio,
  // a tabela fica com as taxas antigas em vez de vazia
  if (taxasValidas.length > 0) {
    const { error: errIns } = await supabase
      .from('formas_pagamento_taxas')
      .upsert(
        taxasValidas.map((t) => ({ id_forma_pagamento: id!, ...t })),
        { onConflict: 'id_forma_pagamento,parcelas' }
      );
    if (errIns) tratarErro(errIns, 'formas_pagamento_taxas');
  }

  let remover = supabase.from('formas_pagamento_taxas').delete().eq('id_forma_pagamento', id!);
  if (taxasValidas.length > 0) remover = remover.not('parcelas', 'in', `(${taxasValidas.map((t) => t.parcelas).join(',')})`);
  const { error: errDel } = await remover;
  if (errDel) tratarErro(errDel, 'formas_pagamento_taxas');
}

export async function alternarAtivoFormaPagamento(idForma: string, ativo: boolean): Promise<void> {
  const { error } = await supabase.from('formas_pagamento').update({ ativo }).eq('id_forma_pagamento', idForma);
  if (error) tratarErro(error, 'formas_pagamento');
}

export async function excluirFormaPagamento(idForma: string): Promise<void> {
  const { data, error } = await supabase.from('formas_pagamento').delete().eq('id_forma_pagamento', idForma).select('id_forma_pagamento');
  if (error) tratarErro(error, 'formas_pagamento');
  exigirLinhaAfetada(data); // sem permissão o banco não exclui e não dá erro
}

/** Taxa efetiva para N parcelas: usa a tabela por parcela quando existir, senão a taxa base. */
export function obterTaxaParcela(forma: Pick<FormaPagamento, 'taxa_percentual' | 'taxas'>, parcelas: number): number {
  const especifica = forma.taxas.find((t) => t.parcelas === parcelas);
  return especifica ? especifica.taxa_percentual : forma.taxa_percentual;
}

/**
 * Formas nativas criadas automaticamente em toda conta (mesmas taxas padrão da maquininha).
 * No cartão, a Nova OS usa as taxas da maquininha escolhida; as daqui ficam como referência.
 */
export const FORMAS_PAGAMENTO_PADRAO: { dados: FormaPagamentoInput; taxas: TaxaParcela[] }[] = [
  {
    dados: { id_loja: null, nome: 'Dinheiro', tipo: 'DINHEIRO', taxa_percentual: 0, taxa_fixa: 0, permite_parcelamento: false, parcelas_max: 1, parcelas_sem_juros: 1, repassar_juros_cliente: false, prazo_recebimento_dias: 0, ativo: true, ordem: 1 },
    taxas: [],
  },
  {
    dados: { id_loja: null, nome: 'PIX', tipo: 'PIX', taxa_percentual: 0, taxa_fixa: 0, permite_parcelamento: false, parcelas_max: 1, parcelas_sem_juros: 1, repassar_juros_cliente: false, prazo_recebimento_dias: 0, ativo: true, ordem: 2 },
    taxas: [],
  },
  {
    dados: { id_loja: null, nome: 'Cartão de débito', tipo: 'CARTAO_DEBITO', taxa_percentual: 1.49, taxa_fixa: 0, permite_parcelamento: false, parcelas_max: 1, parcelas_sem_juros: 1, repassar_juros_cliente: false, prazo_recebimento_dias: 1, ativo: true, ordem: 3 },
    taxas: [],
  },
  {
    dados: { id_loja: null, nome: 'Cartão de crédito', tipo: 'CARTAO_CREDITO', taxa_percentual: 3.19, taxa_fixa: 0, permite_parcelamento: true, parcelas_max: 12, parcelas_sem_juros: 3, repassar_juros_cliente: true, prazo_recebimento_dias: 30, ativo: true, ordem: 4 },
    taxas: Array.from({ length: 12 }, (_, i) => {
      const p = i + 1;
      return { parcelas: p, taxa_percentual: p === 1 ? 3.19 : p <= 3 ? 4.89 : p <= 6 ? 6.49 : 8.99 };
    }),
  },
];

/** Formas nativas (PIX, dinheiro, débito e crédito) que a conta ainda não tem, pelo tipo (renomear não duplica). */
export const formasPadraoFaltantes = (existentes: Pick<FormaPagamento, 'tipo'>[]) => {
  const tipos = new Set(existentes.map((f) => f.tipo));
  return FORMAS_PAGAMENTO_PADRAO.filter((p) => !tipos.has(p.dados.tipo));
};

/** Cria só as formas nativas que faltam: repetir depois de uma falha no meio não duplica nada. */
export async function criarFormasPagamentoPadrao(existentes: Pick<FormaPagamento, 'tipo'>[] = []): Promise<void> {
  for (const { dados, taxas } of formasPadraoFaltantes(existentes)) {
    await salvarFormaPagamento(dados, taxas);
  }
}
