import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { supabase } from '../services/supabaseClient';

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

interface FormState {
  id?: string;
  name: string;
  phone: string;
  document: string;
  price: string;
  estimatedTime: string;
  warranty: string;
  description: string;
}

const emptyFormState: FormState = {
  name: '',
  phone: '',
  document: '',
  price: '',
  estimatedTime: '45 min',
  warranty: '90 dias',
  description: '',
};

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

export function Cadastro() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clientes, setClientes] = useState<any[]>([]);
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [servicos, setServicos] = useState<any[]>([]);

  // Workspace Form State
  const [activeType, setActiveType] = useState<RegistryType>('client');
  const [form, setForm] = useState<FormState>(emptyFormState);
  const [isEditing, setIsEditing] = useState(false);

  // Filter & Search
  const [activeFilter, setActiveFilter] = useState<RegistryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [viewItem, setViewItem] = useState<RegistryItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<RegistryItem | null>(null);

  // 1. CARREGAMENTO DOS DADOS REAIS DO SUPABASE
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

  // 2. UNIFICAÇÃO DOS REGISTROS REAIS NA TABELA DO FIGMA
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

  // Contadores
  const counts = useMemo(
    () => ({
      all: registryItems.length,
      client: clientes.length,
      supplier: fornecedores.length,
      service: servicos.length,
    }),
    [registryItems.length, clientes.length, fornecedores.length, servicos.length]
  );

  // Filtragem dinâmica
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

  // Iniciar Edição
  const handleStartEdit = (item: RegistryItem) => {
    setActiveType(item.type);
    setIsEditing(true);

    if (item.type === 'client') {
      setForm({
        ...emptyFormState,
        id: item.rawId,
        name: item.raw.nome || '',
        phone: item.raw.whatsapp || item.raw.telefone || '',
        document: item.raw.cpf_cnpj || item.raw.cpf || '',
      });
    } else if (item.type === 'supplier') {
      setForm({
        ...emptyFormState,
        id: item.rawId,
        name: item.raw.nome || '',
        phone: item.raw.contato || item.raw.telefone || '',
        document: item.raw.cnpj || '',
      });
    } else if (item.type === 'service') {
      setForm({
        ...emptyFormState,
        id: item.rawId,
        name: item.raw.nome || '',
        price: String(item.raw.preco_sugerido ?? item.raw.preco ?? ''),
        estimatedTime: item.raw.tempo_estimado || '45 min',
        warranty: item.raw.garantia_padrao || '90 dias',
        description: item.raw.descricao || '',
      });
    }

    if (viewItem) setViewItem(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setForm(emptyFormState);
    setIsEditing(false);
  };

  // 3. PERSISTÊNCIA REAL NO SUPABASE
  const handleSubmitForm = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert('Por favor, informe o nome do cadastro.');
      return;
    }

    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;

      if (activeType === 'client') {
        const payload: any = {
          nome: form.name.trim(),
          whatsapp: form.phone.trim(),
          cpf_cnpj: form.document.trim() || null,
        };

        if (form.id) {
          const { error } = await supabase
            .from('clientes')
            .update(payload)
            .eq('id_cliente', form.id);
          if (error) throw error;
        } else {
          const newId = crypto.randomUUID ? crypto.randomUUID() : 'cli_' + Math.random().toString(36).substring(2);
          payload.id_cliente = newId;
          if (userId) payload.user_id = userId;
          const { error } = await supabase.from('clientes').insert([payload]);
          if (error) throw error;
        }
      } else if (activeType === 'supplier') {
        const payload: any = {
          nome: form.name.trim(),
          contato: form.phone.trim(),
        };

        if (form.id) {
          const { error } = await supabase
            .from('cad_fornecedores')
            .update(payload)
            .eq('id_fornecedor', form.id);
          if (error) throw error;
        } else {
          const newId = crypto.randomUUID ? crypto.randomUUID() : 'forn_' + Math.random().toString(36).substring(2);
          payload.id_fornecedor = newId;
          if (userId) payload.user_id = userId;
          const { error } = await supabase.from('cad_fornecedores').insert([payload]);
          if (error) throw error;
        }
      } else if (activeType === 'service') {
        const precoNum = Number(form.price.replace(',', '.')) || 0;
        const payload: any = {
          nome: form.name.trim(),
          preco_sugerido: precoNum,
        };

        if (form.estimatedTime) payload.tempo_estimado = form.estimatedTime.trim();
        if (form.warranty) payload.garantia_padrao = form.warranty.trim();
        if (form.description) payload.descricao = form.description.trim();

        if (form.id) {
          let { error } = await supabase
            .from('cad_servicos')
            .update(payload)
            .eq('id_servico', form.id);
          if (error && error.message?.includes('column')) {
            delete payload.tempo_estimado;
            delete payload.garantia_padrao;
            delete payload.descricao;
            const retry = await supabase
              .from('cad_servicos')
              .update(payload)
              .eq('id_servico', form.id);
            if (retry.error) throw retry.error;
          } else if (error) {
            throw error;
          }
        } else {
          const newId = crypto.randomUUID ? crypto.randomUUID() : 'srv_' + Math.random().toString(36).substring(2);
          payload.id_servico = newId;
          if (userId) payload.user_id = userId;

          let { error } = await supabase.from('cad_servicos').insert([payload]);
          if (error && error.message?.includes('column')) {
            delete payload.tempo_estimado;
            delete payload.garantia_padrao;
            delete payload.descricao;
            const retry = await supabase.from('cad_servicos').insert([payload]);
            if (retry.error) throw retry.error;
          } else if (error) {
            throw error;
          }
        }
      }

      setForm(emptyFormState);
      setIsEditing(false);
      await carregarDados();
    } catch (err: any) {
      alert(`Erro ao salvar no Supabase: ${err.message || err}`);
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
        const { error } = await supabase
          .from('clientes')
          .delete()
          .eq('id_cliente', itemToDelete.rawId);
        if (error) throw error;
      } else if (itemToDelete.type === 'supplier') {
        const { error } = await supabase
          .from('cad_fornecedores')
          .delete()
          .eq('id_fornecedor', itemToDelete.rawId);
        if (error) throw error;
      } else if (itemToDelete.type === 'service') {
        const { error } = await supabase
          .from('cad_servicos')
          .delete()
          .eq('id_servico', itemToDelete.rawId);
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
      {/* ================= CABEÇALHO ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Central de Cadastros
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Área unificada para gerenciar clientes, fornecedores e catálogo de serviços.
          </p>
        </div>
        <div className="flex items-center space-x-2 text-xs text-slate-400 bg-[#111722] border border-slate-800 px-3 py-2 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Banco Supabase Conectado</span>
        </div>
      </div>

      {/* ================= WORKSPACE DE CADASTRO DINÂMICO ================= */}
      <div className="bg-[#111722] border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide uppercase">
              {isEditing ? 'Editar Registro' : 'Novo Cadastro'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Selecione a categoria para alternar os campos do formulário.
            </p>
          </div>

          {/* Toggle de Tipo */}
          <div className="inline-flex rounded-xl bg-[#0b0f16] p-1 border border-slate-800">
            {(['client', 'supplier', 'service'] as RegistryType[]).map((type) => {
              const meta = registryMeta[type];
              const active = activeType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setActiveType(type);
                    if (!isEditing) setForm(emptyFormState);
                  }}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    active
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Formulário Dinâmico */}
        <form onSubmit={handleSubmitForm} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Campo 1: Nome */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {activeType === 'client' && 'Nome do Cliente *'}
                {activeType === 'supplier' && 'Nome da Empresa / Fornecedor *'}
                {activeType === 'service' && 'Nome do Serviço *'}
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={
                  activeType === 'client'
                    ? 'Ex: João da Silva'
                    : activeType === 'supplier'
                    ? 'Ex: Distribuidora Central Peças'
                    : 'Ex: Troca de Tela iPhone 13'
                }
                className="w-full bg-[#0d111a] border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Campos Específicos para CLIENTE / FORNECEDOR */}
            {activeType !== 'service' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    WhatsApp / Telefone *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="(85) 99999-9999"
                    className="w-full bg-[#0d111a] border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    {activeType === 'client' ? 'CPF / CNPJ' : 'CNPJ'}
                  </label>
                  <input
                    type="text"
                    value={form.document}
                    onChange={(e) => setForm({ ...form, document: e.target.value })}
                    placeholder="000.000.000-00"
                    className="w-full bg-[#0d111a] border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </>
            )}

            {/* Campos Específicos para SERVIÇO */}
            {activeType === 'service' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Preço Sugerido (R$) *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    placeholder="Ex: 150.00"
                    className="w-full bg-[#0d111a] border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Tempo Estimado
                  </label>
                  <input
                    type="text"
                    value={form.estimatedTime}
                    onChange={(e) => setForm({ ...form, estimatedTime: e.target.value })}
                    placeholder="Ex: 45 min"
                    className="w-full bg-[#0d111a] border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Garantia Padrão
                  </label>
                  <input
                    type="text"
                    value={form.warranty}
                    onChange={(e) => setForm({ ...form, warranty: e.target.value })}
                    placeholder="Ex: 90 dias"
                    className="w-full bg-[#0d111a] border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="md:col-span-2 lg:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Descrição do Serviço
                  </label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Observações sobre a aplicação ou procedimento"
                    className="w-full bg-[#0d111a] border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex items-center justify-end space-x-3 pt-2">
            {isEditing && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-4 py-2.5 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Cancelar Edição
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition-colors shadow-sm disabled:opacity-50 flex items-center space-x-2"
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Salvando no banco...</span>
                </>
              ) : (
                <span>{isEditing ? 'Salvar Alterações' : 'Salvar Cadastro'}</span>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* ================= BARRA DE FILTROS E BUSCA ================= */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Abas com Contadores Reais */}
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

        {/* ================= TABELA UNIFICADA DO FIGMA ================= */}
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

                            {/* Editar */}
                            <button
                              type="button"
                              onClick={() => handleStartEdit(item)}
                              title="Editar Cadastro"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-400 hover:bg-slate-800 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
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

            {/* Grade 2x2 do Figma */}
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
                    {viewItem.raw.descricao || 'Substituição e manutenção com peças padrão.'}
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

            {/* Footer Buttons */}
            <div className="flex items-center justify-end space-x-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setViewItem(null)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => handleStartEdit(viewItem)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition-colors"
              >
                Editar cadastro
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
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white transition-colors disabled:opacity-50 flex items-center space-x-2"
              >
                {saving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    <span>Excluindo...</span>
                  </>
                ) : (
                  <span>Sim, excluir</span>
                )}
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