import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { supabase } from '../services/supabaseClient';
import type { SecaoCadastro } from '../types';

export type RegistryType = 'client' | 'supplier' | 'service';
export type RegistryFilter = 'all' | RegistryType;

export interface RegistryItem {
  id: string;
  rawId: string;
  type: RegistryType;
  title: string;
  subtitle: string;
  contactOrValue: string;
  complementary: string;
  raw: any;
}

const registryMeta = {
  client: {
    label: 'Cliente',
    badgeClass: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
    typeIconColor: 'text-emerald-400',
    typeIconBg: 'bg-emerald-950/30 border-emerald-500/20',
  },
  supplier: {
    label: 'Fornecedor',
    badgeClass: 'border-orange-400/20 bg-orange-400/10 text-orange-300',
    typeIconColor: 'text-orange-400',
    typeIconBg: 'bg-orange-950/30 border-orange-400/20',
  },
  service: {
    label: 'Serviço',
    badgeClass: 'border-blue-500/20 bg-blue-500/10 text-blue-400',
    typeIconColor: 'text-blue-400',
    typeIconBg: 'bg-blue-950/30 border-blue-500/20',
  },
};

// Submódulo do menu lateral -> tipo de cadastro desta tela
const SECAO_PARA_TIPO: Partial<Record<SecaoCadastro, RegistryType>> = {
  clientes: 'client',
  fornecedores: 'supplier',
  servicos: 'service',
};

export function Cadastro({ secao }: { secao?: SecaoCadastro } = {}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clientes, setClientes] = useState<any[]>([]);
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [servicos, setServicos] = useState<any[]>([]);

  // Tipo de cadastro ativo (3 cards seletores)
  const [tipoCadastro, setTipoCadastro] = useState<RegistryType>('client');

  // Estados dos formulários específicos
  const [formCliente, setFormCliente] = useState({
    nome: '',
    telefone: '',
    email: '',
    cpfCnpj: '',
    observacoes: '',
  });

  const [formFornecedor, setFormFornecedor] = useState({
    nome: '',
    telefone: '',
    email: '',
    cnpj: '',
    categoria: '',
    observacoes: '',
  });

  const [formServico, setFormServico] = useState({
    titulo: '',
    valorBase: '',
    tempoEstimado: '',
    garantiaPadrao: 'Sem padrão',
    descricao: '',
  });

  // Filtros da tabela
  const [activeFilter, setActiveFilter] = useState<RegistryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modais
  const [viewItem, setViewItem] = useState<RegistryItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<RegistryItem | null>(null);

  // Ao escolher Clientes / Serviços / Fornecedores no menu, abre o formulário e a lista daquele tipo
  useEffect(() => {
    const tipo = secao ? SECAO_PARA_TIPO[secao] : undefined;
    if (tipo) {
      setTipoCadastro(tipo);
      setActiveFilter(tipo);
    }
  }, [secao]);

  // 1. CARREGAMENTO REAL DO SUPABASE
  const carregarDados = async () => {
    try {
      const [resCli, resForn, resServ] = await Promise.all([
        supabase.from('clientes').select('*').order('nome', { ascending: true }),
        supabase.from('cad_fornecedores').select('*').order('nome', { ascending: true }),
        supabase.from('cad_servicos').select('*').order('nome', { ascending: true }),
      ]);

      if (resCli.data) setClientes(resCli.data);
      if (resForn.data) setFornecedores(resForn.data);
      if (resServ.data) setServicos(resServ.data);
    } catch (err) {
      console.error('Erro ao carregar dados do Supabase:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  // 2. UNIFICAÇÃO DOS REGISTROS REAIS NA LISTAGEM
  const registryItems = useMemo<RegistryItem[]>(() => {
    const list: RegistryItem[] = [];

    clientes.forEach((c) => {
      const id = c.id_cliente || c.id || '';
      const dataStr = c.created_at
        ? `Desde ${new Date(c.created_at).toLocaleDateString('pt-BR')}`
        : 'Cliente cadastrado';
      list.push({
        id: `cli_${id}`,
        rawId: id,
        type: 'client',
        title: c.nome || 'Cliente sem nome',
        subtitle: dataStr,
        contactOrValue: c.whatsapp || c.telefone || 'Sem telefone',
        complementary: c.cpf_cnpj || c.cpf || c.email || 'Documento não informado',
        raw: c,
      });
    });

    fornecedores.forEach((f) => {
      const id = f.id_fornecedor || f.id || '';
      const dataStr = f.created_at
        ? `Desde ${new Date(f.created_at).toLocaleDateString('pt-BR')}`
        : 'Fornecedor cadastrado';
      list.push({
        id: `forn_${id}`,
        rawId: id,
        type: 'supplier',
        title: f.nome || 'Fornecedor sem nome',
        subtitle: dataStr,
        contactOrValue: f.contato || f.telefone || 'Sem contato',
        complementary: f.cnpj || 'Peças / Componentes',
        raw: f,
      });
    });

    servicos.forEach((s) => {
      const id = s.id_servico || s.id || '';
      const valorNum = Number(s.preco_sugerido || s.preco || 0);
      const valorFormatado = valorNum.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
      const dataStr = s.created_at
        ? `Desde ${new Date(s.created_at).toLocaleDateString('pt-BR')}`
        : 'Serviço padrão';
      list.push({
        id: `srv_${id}`,
        rawId: id,
        type: 'service',
        title: s.nome || 'Serviço sem nome',
        subtitle: dataStr,
        contactOrValue: valorFormatado,
        complementary:
          s.descricao ||
          s.garantia_padrao ||
          (s.tempo_estimado ? `Tempo: ${s.tempo_estimado}` : 'Serviço técnico'),
        raw: s,
      });
    });

    return list;
  }, [clientes, fornecedores, servicos]);

  // Contadores Reais
  const counts = useMemo(
    () => ({
      all: registryItems.length,
      client: clientes.length,
      supplier: fornecedores.length,
      service: servicos.length,
    }),
    [registryItems.length, clientes.length, fornecedores.length, servicos.length]
  );

  // Filtragem dinâmica por busca e abas
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return registryItems.filter((item) => {
      const matchesFilter = activeFilter === 'all' || item.type === activeFilter;
      if (!matchesFilter) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.contactOrValue.toLowerCase().includes(q) ||
        item.complementary.toLowerCase().includes(q)
      );
    });
  }, [registryItems, activeFilter, searchQuery]);

  // Limpar formulário atual
  const handleLimpar = () => {
    if (tipoCadastro === 'client') {
      setFormCliente({ nome: '', telefone: '', email: '', cpfCnpj: '', observacoes: '' });
    } else if (tipoCadastro === 'supplier') {
      setFormFornecedor({ nome: '', telefone: '', email: '', cnpj: '', categoria: '', observacoes: '' });
    } else {
      setFormServico({ titulo: '', valorBase: '', tempoEstimado: '', garantiaPadrao: 'Sem padrão', descricao: '' });
    }
  };

  // 3. PERSISTÊNCIA REAL NO SUPABASE
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;

      if (tipoCadastro === 'client') {
        if (!formCliente.nome.trim()) {
          alert('Por favor, digite o nome do cliente.');
          setSaving(false);
          return;
        }

        const newId = crypto.randomUUID ? crypto.randomUUID() : 'cli_' + Math.random().toString(36).substring(2);
        const payload: any = {
          id_cliente: newId,
          nome: formCliente.nome.trim(),
          whatsapp: formCliente.telefone.trim(),
          cpf_cnpj: formCliente.cpfCnpj.trim() || null,
        };
        if (userId) payload.user_id = userId;
        if (formCliente.email.trim()) payload.email = formCliente.email.trim();
        if (formCliente.observacoes.trim()) payload.observacoes = formCliente.observacoes.trim();

        let { error } = await supabase.from('clientes').insert([payload]);
        if (error && error.message?.includes('column')) {
          delete payload.email;
          delete payload.observacoes;
          const retry = await supabase.from('clientes').insert([payload]);
          error = retry.error;
        }
        if (error) throw error;

        setFormCliente({ nome: '', telefone: '', email: '', cpfCnpj: '', observacoes: '' });
      } else if (tipoCadastro === 'supplier') {
        if (!formFornecedor.nome.trim()) {
          alert('Por favor, digite o nome/razão social do fornecedor.');
          setSaving(false);
          return;
        }

        const newId = crypto.randomUUID ? crypto.randomUUID() : 'forn_' + Math.random().toString(36).substring(2);
        const payload: any = {
          id_fornecedor: newId,
          nome: formFornecedor.nome.trim(),
          contato: formFornecedor.telefone.trim(),
        };
        if (userId) payload.user_id = userId;
        if (formFornecedor.cnpj.trim()) payload.cnpj = formFornecedor.cnpj.trim();
        if (formFornecedor.categoria) payload.categoria = formFornecedor.categoria;
        if (formFornecedor.email.trim()) payload.email = formFornecedor.email.trim();
        if (formFornecedor.observacoes.trim()) payload.observacoes = formFornecedor.observacoes.trim();

        let { error } = await supabase.from('cad_fornecedores').insert([payload]);
        if (error && error.message?.includes('column')) {
          delete payload.cnpj;
          delete payload.categoria;
          delete payload.email;
          delete payload.observacoes;
          const retry = await supabase.from('cad_fornecedores').insert([payload]);
          error = retry.error;
        }
        if (error) throw error;

        setFormFornecedor({ nome: '', telefone: '', email: '', cnpj: '', categoria: '', observacoes: '' });
      } else if (tipoCadastro === 'service') {
        if (!formServico.titulo.trim()) {
          alert('Por favor, digite o título do serviço.');
          setSaving(false);
          return;
        }

        const valorNum = Number(formServico.valorBase.replace('R$', '').replace('.', '').replace(',', '.').trim()) || 0;
        const newId = crypto.randomUUID ? crypto.randomUUID() : 'srv_' + Math.random().toString(36).substring(2);
        const payload: any = {
          id_servico: newId,
          nome: formServico.titulo.trim(),
          preco_sugerido: valorNum,
        };
        if (userId) payload.user_id = userId;
        if (formServico.tempoEstimado.trim()) payload.tempo_estimado = formServico.tempoEstimado.trim();
        if (formServico.garantiaPadrao !== 'Sem padrão') payload.garantia_padrao = formServico.garantiaPadrao;
        if (formServico.descricao.trim()) payload.descricao = formServico.descricao.trim();

        let { error } = await supabase.from('cad_servicos').insert([payload]);
        if (error && error.message?.includes('column')) {
          delete payload.tempo_estimado;
          delete payload.garantia_padrao;
          delete payload.descricao;
          const retry = await supabase.from('cad_servicos').insert([payload]);
          error = retry.error;
        }
        if (error) throw error;

        setFormServico({ titulo: '', valorBase: '', tempoEstimado: '', garantiaPadrao: 'Sem padrão', descricao: '' });
      }

      await carregarDados();
    } catch (err: any) {
      alert(`Erro ao salvar no banco: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  // 4. EXCLUSÃO REAL NO SUPABASE
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setSaving(true);
    try {
      if (itemToDelete.type === 'client') {
        const { error } = await supabase.from('clientes').delete().eq('id_cliente', itemToDelete.rawId);
        if (error) throw error;
      } else if (itemToDelete.type === 'supplier') {
        const { error } = await supabase.from('cad_fornecedores').delete().eq('id_fornecedor', itemToDelete.rawId);
        if (error) throw error;
      } else if (itemToDelete.type === 'service') {
        const { error } = await supabase.from('cad_servicos').delete().eq('id_servico', itemToDelete.rawId);
        if (error) throw error;
      }

      setItemToDelete(null);
      await carregarDados();
    } catch (err: any) {
      alert(`Erro ao excluir cadastro: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-32 space-y-4">
        <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-xs text-zinc-400 font-semibold tracking-wider uppercase">
          Carregando dados da aplicação...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto font-sans pb-16 text-slate-100">
      {/* ================= CABEÇALHO DA PÁGINA ================= */}
      <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Central de cadastros
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Cadastre e consulte clientes, fornecedores e serviços em um único lugar.
        </p>
      </div>

      {/* ================= CARD DE NOVO CADASTRO (EXATO DOS PRINTS) ================= */}
      <div className="bg-[#111722] border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
        {/* Cabeçalho do Card */}
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-6 h-6 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">
              +
            </div>
            <h3 className="text-sm font-bold text-white tracking-wide">
              Novo cadastro
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1 pl-8.5">
            Escolha o tipo e preencha somente as informações necessárias.
          </p>
        </div>

        {/* ================= SELEÇÃO: TIPO DE CADASTRO (3 CARDS) ================= */}
        <div>
          <p className="text-[11px] font-bold text-slate-400 tracking-wider uppercase mb-3">
            TIPO DE CADASTRO
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Card 1: Cliente */}
            <button
              type="button"
              onClick={() => setTipoCadastro('client')}
              className={`p-4 rounded-xl border text-left transition-all flex items-center justify-between ${
                tipoCadastro === 'client'
                  ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/50'
                  : 'border-slate-800 bg-[#0d111a] hover:border-slate-700'
              }`}
            >
              <div className="flex items-center space-x-3.5">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    tipoCadastro === 'client'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-[#111722] border border-slate-800 text-emerald-400'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Cliente</p>
                  <p className="text-xs text-slate-400">Contato e documento</p>
                </div>
              </div>
              {tipoCadastro === 'client' && (
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>

            {/* Card 2: Fornecedor */}
            <button
              type="button"
              onClick={() => setTipoCadastro('supplier')}
              className={`p-4 rounded-xl border text-left transition-all flex items-center justify-between ${
                tipoCadastro === 'supplier'
                  ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/50'
                  : 'border-slate-800 bg-[#0d111a] hover:border-slate-700'
              }`}
            >
              <div className="flex items-center space-x-3.5">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    tipoCadastro === 'supplier'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-[#111722] border border-slate-800 text-orange-400'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Fornecedor</p>
                  <p className="text-xs text-slate-400">Compras e peças</p>
                </div>
              </div>
              {tipoCadastro === 'supplier' && (
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>

            {/* Card 3: Serviço */}
            <button
              type="button"
              onClick={() => setTipoCadastro('service')}
              className={`p-4 rounded-xl border text-left transition-all flex items-center justify-between ${
                tipoCadastro === 'service'
                  ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/50'
                  : 'border-slate-800 bg-[#0d111a] hover:border-slate-700'
              }`}
            >
              <div className="flex items-center space-x-3.5">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    tipoCadastro === 'service'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-[#111722] border border-slate-800 text-blue-400'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Serviço</p>
                  <p className="text-xs text-slate-400">Preço e execução</p>
                </div>
              </div>
              {tipoCadastro === 'service' && (
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* ================= FORMULÁRIOS ESPECÍFICOS ================= */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. FORMULÁRIO DO CLIENTE (PRINT 1) */}
          {tipoCadastro === 'client' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-6">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 block">
                    NOME COMPLETO *
                  </label>
                  <input
                    type="text"
                    required
                    value={formCliente.nome}
                    onChange={(e) => setFormCliente({ ...formCliente, nome: e.target.value })}
                    placeholder="Digite o nome"
                    className="w-full bg-[#0d111a] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 block">
                    TELEFONE / WHATSAPP *
                  </label>
                  <input
                    type="text"
                    required
                    value={formCliente.telefone}
                    onChange={(e) => setFormCliente({ ...formCliente, telefone: e.target.value })}
                    placeholder="(85) 99999-9999"
                    className="w-full bg-[#0d111a] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 block">
                    E-MAIL
                  </label>
                  <input
                    type="email"
                    value={formCliente.email}
                    onChange={(e) => setFormCliente({ ...formCliente, email: e.target.value })}
                    placeholder="contato@email.com"
                    className="w-full bg-[#0d111a] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-4">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 block">
                    CPF / CNPJ
                  </label>
                  <input
                    type="text"
                    value={formCliente.cpfCnpj}
                    onChange={(e) => setFormCliente({ ...formCliente, cpfCnpj: e.target.value })}
                    placeholder="Somente números"
                    className="w-full bg-[#0d111a] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div className="md:col-span-8">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 block">
                    OBSERVAÇÕES INTERNAS
                  </label>
                  <input
                    type="text"
                    value={formCliente.observacoes}
                    onChange={(e) => setFormCliente({ ...formCliente, observacoes: e.target.value })}
                    placeholder="Preferências, contato responsável ou informações úteis"
                    className="w-full bg-[#0d111a] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>
            </>
          )}

          {/* 2. FORMULÁRIO DO FORNECEDOR (PRINT 2) */}
          {tipoCadastro === 'supplier' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-6">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 block">
                    NOME / RAZÃO SOCIAL *
                  </label>
                  <input
                    type="text"
                    required
                    value={formFornecedor.nome}
                    onChange={(e) => setFormFornecedor({ ...formFornecedor, nome: e.target.value })}
                    placeholder="Digite o nome"
                    className="w-full bg-[#0d111a] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 block">
                    TELEFONE / WHATSAPP *
                  </label>
                  <input
                    type="text"
                    required
                    value={formFornecedor.telefone}
                    onChange={(e) => setFormFornecedor({ ...formFornecedor, telefone: e.target.value })}
                    placeholder="(85) 99999-9999"
                    className="w-full bg-[#0d111a] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 block">
                    E-MAIL
                  </label>
                  <input
                    type="email"
                    value={formFornecedor.email}
                    onChange={(e) => setFormFornecedor({ ...formFornecedor, email: e.target.value })}
                    placeholder="contato@email.com"
                    className="w-full bg-[#0d111a] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-4">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 block">
                    CNPJ
                  </label>
                  <input
                    type="text"
                    value={formFornecedor.cnpj}
                    onChange={(e) => setFormFornecedor({ ...formFornecedor, cnpj: e.target.value })}
                    placeholder="Somente números"
                    className="w-full bg-[#0d111a] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div className="md:col-span-8">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 block">
                    CATEGORIA DE FORNECIMENTO *
                  </label>
                  <select
                    value={formFornecedor.categoria}
                    onChange={(e) => setFormFornecedor({ ...formFornecedor, categoria: e.target.value })}
                    className="w-full bg-[#0d111a] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer"
                  >
                    <option value="">Selecione...</option>
                    <option value="Telas & Displays">Telas & Displays</option>
                    <option value="Baterias">Baterias</option>
                    <option value="Peças & Componentes">Peças & Componentes</option>
                    <option value="Acessórios & Películas">Acessórios & Películas</option>
                    <option value="Ferramentas & Insumos">Ferramentas & Insumos</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 block">
                  OBSERVAÇÕES INTERNAS
                </label>
                <input
                  type="text"
                  value={formFornecedor.observacoes}
                  onChange={(e) => setFormFornecedor({ ...formFornecedor, observacoes: e.target.value })}
                  placeholder="Preferências, contato responsável ou informações úteis"
                  className="w-full bg-[#0d111a] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </>
          )}

          {/* 3. FORMULÁRIO DO SERVIÇO (PRINT 3) */}
          {tipoCadastro === 'service' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-6">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 block">
                    TÍTULO DO SERVIÇO *
                  </label>
                  <input
                    type="text"
                    required
                    value={formServico.titulo}
                    onChange={(e) => setFormServico({ ...formServico, titulo: e.target.value })}
                    placeholder="Ex.: Troca de bateria"
                    className="w-full bg-[#0d111a] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 block">
                    VALOR BASE *
                  </label>
                  <input
                    type="text"
                    required
                    value={formServico.valorBase}
                    onChange={(e) => setFormServico({ ...formServico, valorBase: e.target.value })}
                    placeholder="R$ 0,00"
                    className="w-full bg-[#0d111a] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Pode ser alterado ao criar a OS.
                  </span>
                </div>
                <div className="md:col-span-3">
                  <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 block">
                    TEMPO ESTIMADO
                  </label>
                  <input
                    type="text"
                    value={formServico.tempoEstimado}
                    onChange={(e) => setFormServico({ ...formServico, tempoEstimado: e.target.value })}
                    placeholder="Ex.: 1 hora"
                    className="w-full bg-[#0d111a] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 block">
                  GARANTIA PADRÃO
                </label>
                <div className="md:w-1/3">
                  <select
                    value={formServico.garantiaPadrao}
                    onChange={(e) => setFormServico({ ...formServico, garantiaPadrao: e.target.value })}
                    className="w-full bg-[#0d111a] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer"
                  >
                    <option value="Sem padrão">Sem padrão</option>
                    <option value="30 dias">30 dias</option>
                    <option value="90 dias">90 dias (Recomendado)</option>
                    <option value="180 dias">180 dias</option>
                    <option value="1 ano">1 ano</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2 block">
                  DESCRIÇÃO E DETALHES
                </label>
                <textarea
                  rows={3}
                  value={formServico.descricao}
                  onChange={(e) => setFormServico({ ...formServico, descricao: e.target.value })}
                  placeholder="Descreva o que está incluído no serviço..."
                  className="w-full bg-[#0d111a] border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                />
              </div>
            </>
          )}

          {/* Rodapé do Formulário */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-800/80">
            <span className="text-xs text-slate-500">
              Campos marcados com * são obrigatórios.
            </span>
            <div className="flex items-center space-x-3 self-end sm:self-auto">
              <button
                type="button"
                onClick={handleLimpar}
                className="text-sm font-semibold text-slate-400 hover:text-white px-4 py-2.5 rounded-xl transition-colors"
              >
                Limpar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center space-x-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <span>+</span>
                    <span>
                      {tipoCadastro === 'client' && 'Cadastrar cliente'}
                      {tipoCadastro === 'supplier' && 'Cadastrar fornecedor'}
                      {tipoCadastro === 'service' && 'Cadastrar serviço'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* ================= BARRA DE FILTROS E BUSCA ================= */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Abas com Contadores REAIS do Banco */}
          <div className="flex flex-wrap items-center gap-1.5 border-b md:border-b-0 border-slate-800 pb-2 md:pb-0">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-colors ${
                activeFilter === 'all'
                  ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Todos</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300">
                {counts.all}
              </span>
            </button>
            <button
              onClick={() => setActiveFilter('client')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-colors ${
                activeFilter === 'client'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Clientes</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300">
                {counts.client}
              </span>
            </button>
            <button
              onClick={() => setActiveFilter('supplier')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-colors ${
                activeFilter === 'supplier'
                  ? 'bg-orange-400/10 text-orange-400 border border-orange-400/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Fornecedores</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300">
                {counts.supplier}
              </span>
            </button>
            <button
              onClick={() => setActiveFilter('service')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-colors ${
                activeFilter === 'service'
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>Serviços</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300">
                {counts.service}
              </span>
            </button>
          </div>

          {/* Campo de Busca */}
          <div className="relative w-full md:w-80">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome, contato ou dados..."
              className="w-full bg-[#0d111a] border border-slate-700 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* ================= TABELA UNIFICADA COM TODOS OS REGISTROS REAIS ================= */}
        <div className="bg-[#111722] border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/80 bg-[#0c101a] text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3.5 px-4 sm:px-6">Nome / Título</th>
                  <th className="py-3.5 px-4">Tipo</th>
                  <th className="py-3.5 px-4">Contato ou Valor</th>
                  <th className="py-3.5 px-4">Informação Complementar</th>
                  <th className="py-3.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-sm">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400 text-xs">
                      {searchQuery
                        ? 'Nenhum cadastro encontrado para os termos da busca.'
                        : 'Nenhum registro cadastrado nesta categoria ainda.'}
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const meta = registryMeta[item.type];
                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-800/30 transition-colors group"
                      >
                        {/* Nome / Título */}
                        <td className="py-3.5 px-4 sm:px-6">
                          <div className="flex items-center space-x-3">
                            <div
                              className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${meta.typeIconBg}`}
                            >
                              {item.type === 'client' && (
                                <svg className={`w-4 h-4 ${meta.typeIconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                </svg>
                              )}
                              {item.type === 'supplier' && (
                                <svg className={`w-4 h-4 ${meta.typeIconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                </svg>
                              )}
                              {item.type === 'service' && (
                                <svg className={`w-4 h-4 ${meta.typeIconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-white leading-snug">{item.title}</p>
                              <p className="text-[11px] text-slate-400">{item.subtitle}</p>
                            </div>
                          </div>
                        </td>

                        {/* Tipo Badge */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${meta.badgeClass}`}
                          >
                            {meta.label}
                          </span>
                        </td>

                        {/* Contato ou Valor */}
                        <td className="py-3.5 px-4 font-semibold text-slate-200">
                          {item.contactOrValue}
                        </td>

                        {/* Informação Complementar */}
                        <td className="py-3.5 px-4 text-xs text-slate-400">
                          {item.complementary}
                        </td>

                        {/* Ações */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            {/* Visualizar */}
                            <button
                              type="button"
                              onClick={() => setViewItem(item)}
                              title="Visualizar Detalhes"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>

                            {/* Excluir */}
                            <button
                              type="button"
                              onClick={() => setItemToDelete(item)}
                              title="Excluir Cadastro"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ================= MODAL DE DETALHES (GRADE 2x2 FIGMA) ================= */}
      {viewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#11151d] border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-bold text-white leading-tight">
                    {viewItem.title}
                  </h3>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                      registryMeta[viewItem.type].badgeClass
                    }`}
                  >
                    {registryMeta[viewItem.type].label}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{viewItem.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewItem(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Grade 2x2 do Figma com Dados Reais */}
            {viewItem.type === 'service' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0b0f16] border border-slate-800/80 rounded-xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    VALOR BASE
                  </p>
                  <p className="text-sm font-semibold text-emerald-400">
                    {viewItem.contactOrValue}
                  </p>
                </div>
                <div className="bg-[#0b0f16] border border-slate-800/80 rounded-xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    TEMPO ESTIMADO
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {viewItem.raw.tempo_estimado || '45 min'}
                  </p>
                </div>
                <div className="bg-[#0b0f16] border border-slate-800/80 rounded-xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    GARANTIA PADRÃO
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {viewItem.raw.garantia_padrao || '90 dias'}
                  </p>
                </div>
                <div className="bg-[#0b0f16] border border-slate-800/80 rounded-xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    DESCRIÇÃO
                  </p>
                  <p className="text-xs text-slate-300 line-clamp-2">
                    {viewItem.raw.descricao || 'Substituição e manutenção técnica padrão.'}
                  </p>
                </div>
              </div>
            ) : viewItem.type === 'client' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0b0f16] border border-slate-800/80 rounded-xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    WHATSAPP / TELEFONE
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {viewItem.contactOrValue}
                  </p>
                </div>
                <div className="bg-[#0b0f16] border border-slate-800/80 rounded-xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    CPF / CNPJ
                  </p>
                  <p className="text-sm font-semibold text-slate-300">
                    {viewItem.complementary}
                  </p>
                </div>
                <div className="bg-[#0b0f16] border border-slate-800/80 rounded-xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    STATUS DO CLIENTE
                  </p>
                  <p className="text-sm font-semibold text-emerald-400">Ativo</p>
                </div>
                <div className="bg-[#0b0f16] border border-slate-800/80 rounded-xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    IDENTIFICADOR
                  </p>
                  <p className="text-xs text-slate-400 font-mono truncate">
                    {viewItem.rawId}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0b0f16] border border-slate-800/80 rounded-xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    CONTATO / TELEFONE
                  </p>
                  <p className="text-sm font-semibold text-white">
                    {viewItem.contactOrValue}
                  </p>
                </div>
                <div className="bg-[#0b0f16] border border-slate-800/80 rounded-xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    CNPJ / DOCUMENTO
                  </p>
                  <p className="text-sm font-semibold text-slate-300">
                    {viewItem.raw.cnpj || 'Não informado'}
                  </p>
                </div>
                <div className="bg-[#0b0f16] border border-slate-800/80 rounded-xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    CATEGORIA
                  </p>
                  <p className="text-sm font-semibold text-orange-300">
                    Peças & Acessórios
                  </p>
                </div>
                <div className="bg-[#0b0f16] border border-slate-800/80 rounded-xl p-3.5 space-y-1">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    IDENTIFICADOR
                  </p>
                  <p className="text-xs text-slate-400 font-mono truncate">
                    {viewItem.rawId}
                  </p>
                </div>
              </div>
            )}

            {/* Rodapé do Modal */}
            <div className="flex items-center justify-end space-x-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setViewItem(null)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL DE CONFIRMAÇÃO DE EXCLUSÃO ================= */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#11151d] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex items-center space-x-3 text-red-400">
              <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Confirmar Exclusão</h3>
                <p className="text-xs text-slate-400">Esta ação não poderá ser desfeita.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-[#0b0f16] p-3.5 rounded-xl border border-slate-800">
              Deseja realmente excluir permanentemente o cadastro de{' '}
              <strong className="text-white font-semibold">"{itemToDelete.title}"</strong> ({registryMeta[itemToDelete.type].label}) do sistema?
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setItemToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white transition-colors disabled:opacity-50"
              >
                {saving ? 'Excluindo...' : 'Sim, excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const Cadastros = Cadastro;
export default Cadastro;