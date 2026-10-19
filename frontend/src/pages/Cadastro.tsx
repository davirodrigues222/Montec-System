import { useState, useMemo } from 'react';
import type { FormEvent } from 'react';

// ==========================================
// TIPAGEM DOS DADOS
// ==========================================

export type RegistryType = 'client' | 'supplier' | 'service';
export type RegistryFilter = 'all' | RegistryType;

export interface RegistryForm {
  name: string;
  phone: string;
  email: string;
  document: string;
  category: string;
  price: string;
  duration: string;
  warranty: string;
  description: string;
  notes: string;
}

export interface RegistryItem extends RegistryForm {
  id: number;
  type: RegistryType;
  createdAt: string;
}

// ==========================================
// CONFIGURAÇÕES E ESTILOS POR ENTIDADE
// ==========================================

const registryMeta: Record<
  RegistryType,
  {
    label: string;
    singular: string;
    icon: string;
    badge: string;
    iconStyle: string;
  }
> = {
  client: {
    label: 'Clientes',
    singular: 'Cliente',
    icon: 'user',
    badge: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
    iconStyle: 'bg-emerald-500/10 text-emerald-400',
  },
  supplier: {
    label: 'Fornecedores',
    singular: 'Fornecedor',
    icon: 'store',
    badge: 'border-orange-400/20 bg-orange-400/10 text-orange-300',
    iconStyle: 'bg-orange-400/10 text-orange-300',
  },
  service: {
    label: 'Serviços',
    singular: 'Serviço',
    icon: 'wrench',
    badge: 'border-blue-500/20 bg-blue-500/10 text-blue-400',
    iconStyle: 'bg-blue-500/10 text-blue-400',
  },
};

const emptyRegistryForm: RegistryForm = {
  name: '',
  phone: '',
  email: '',
  document: '',
  category: '',
  price: '',
  duration: '',
  warranty: '',
  description: '',
  notes: '',
};

const initialRegistryItems: RegistryItem[] = [
  {
    ...emptyRegistryForm,
    id: 1,
    type: 'client',
    name: 'Dhayana Estevam',
    phone: '85 99600-6804',
    email: 'dhayana@email.com',
    document: '055.492.183-10',
    notes: 'Prefere contato pelo WhatsApp.',
    createdAt: '17/10/2026',
  },
  {
    ...emptyRegistryForm,
    id: 2,
    type: 'client',
    name: 'Naty Carvalho',
    phone: '85 98771-4430',
    email: 'naty@email.com',
    document: '028.391.274-06',
    createdAt: '14/10/2026',
  },
  {
    ...emptyRegistryForm,
    id: 3,
    type: 'supplier',
    name: 'Chen 1 Hora Cell',
    phone: '85 98810-2204',
    email: 'vendas@chen1hora.com',
    document: '18.420.177/0001-40',
    category: 'Telas e componentes',
    notes: 'Contato comercial: Davi.',
    createdAt: '10/10/2026',
  },
  {
    ...emptyRegistryForm,
    id: 4,
    type: 'supplier',
    name: 'Royal Telas e Baterias',
    phone: '85 99220-8871',
    category: 'Telas, baterias e conectores',
    createdAt: '08/10/2026',
  },
  {
    ...emptyRegistryForm,
    id: 5,
    type: 'service',
    name: 'Troca de bateria',
    price: '100,00',
    duration: '1 hora',
    warranty: '90 dias',
    description: 'Substituição da bateria e teste completo de carga.',
    createdAt: '05/10/2026',
  },
  {
    ...emptyRegistryForm,
    id: 6,
    type: 'service',
    name: 'Limpeza de conector',
    price: '25,00',
    duration: '30 minutos',
    warranty: '30 dias',
    description: 'Limpeza técnica do conector de carga.',
    createdAt: '03/10/2026',
  },
  {
    ...emptyRegistryForm,
    id: 7,
    type: 'service',
    name: 'Software Android',
    price: '80,00',
    duration: '2 horas',
    warranty: '30 dias',
    description: 'Restauração e configuração do sistema.',
    createdAt: '01/10/2026',
  },
];

// Classes utilitárias padronizadas
const labelClass = 'block text-[11px] font-medium text-slate-400 mb-1.5';
const fieldClass =
  'h-10 w-full rounded-lg border border-slate-700 bg-[#0d111a] px-3.5 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500 transition-colors';

// ==========================================
// ÍCONES SVG NATIVOS
// ==========================================

function Icon({ name, className = 'size-4' }: { name: string; className?: string }) {
  switch (name) {
    case 'user':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    case 'store':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 3h18v4H3V3zm2 4v14h14V7m-9 0v14" />
        </svg>
      );
    case 'wrench':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
        </svg>
      );
    case 'search':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      );
    case 'plus':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      );
    case 'edit':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      );
    case 'trash':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      );
    case 'x':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
    case 'check':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    case 'eye':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      );
    default:
      return null;
  }
}

// ==========================================
// MODAL DE DETALHES (EXATAMENTE COMO NO FIGMA)
// ==========================================

function RegistryDetailsModal({
  item,
  onClose,
  onEdit,
}: {
  item: RegistryItem;
  onClose: () => void;
  onEdit: () => void;
}) {
  const meta = registryMeta[item.type];

  // Matriz de 4 quadrantes para o grid 2x2 do print
  const details =
    item.type === 'service'
      ? [
          ['VALOR BASE', item.price ? `R$ ${item.price}` : 'R$ 0,00'],
          ['TEMPO ESTIMADO', item.duration || 'Não informado'],
          ['GARANTIA PADRÃO', item.warranty || 'Não informada'],
          ['DESCRIÇÃO', item.description || 'Sem descrição cadastrada.'],
        ]
      : [
          ['TELEFONE / WHATSAPP', item.phone || 'Não informado'],
          ['E-MAIL', item.email || 'Não informado'],
          [item.type === 'client' ? 'CPF / CNPJ' : 'CNPJ', item.document || 'Não informado'],
          [
            item.type === 'supplier' ? 'CATEGORIA' : 'OBSERVAÇÕES',
            item.type === 'supplier'
              ? item.category || 'Não informada'
              : item.notes || 'Sem observações cadastradas.',
          ],
        ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-6 animate-fadeIn">
      <div className="w-full max-w-lg overflow-hidden rounded-t-2xl border border-slate-700 bg-[#11151d] shadow-2xl sm:rounded-2xl">
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between border-b border-slate-800/80 p-5">
          <div className="flex items-center gap-3">
            <span className={`grid size-11 place-items-center rounded-xl ${meta.iconStyle}`}>
              <Icon name={meta.icon} className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-semibold text-white tracking-tight">{item.name}</h2>
                <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${meta.badge}`}>
                  {meta.singular}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">Cadastrado em {item.createdAt}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            title="Fechar"
            type="button"
          >
            <Icon name="x" className="size-5" />
          </button>
        </div>

        {/* Grade de 4 Quadrantes (Grid 2x2) */}
        <div className="grid gap-px bg-slate-800/60 sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div className="min-h-24 bg-[#0b0f16] p-5 flex flex-col justify-start" key={label}>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {label}
              </span>
              <p className="mt-2 text-sm font-medium leading-relaxed text-slate-200">
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* Observações Adicionais caso existam */}
        {item.notes && item.type !== 'client' && (
          <div className="border-t border-slate-800/80 bg-[#0e1219] p-5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Observações internas
            </span>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{item.notes}</p>
          </div>
        )}

        {/* Rodapé com Ações */}
        <div className="flex justify-end gap-2.5 border-t border-slate-800/80 bg-[#0e1219] p-4 sm:px-6">
          <button
            className="rounded-lg border border-slate-700 bg-transparent px-5 py-2.5 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
            onClick={onClose}
            type="button"
          >
            Fechar
          </button>
          <button
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition-colors"
            onClick={onEdit}
            type="button"
          >
            <Icon name="edit" className="size-4" />
            Editar cadastro
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// COMPONENTE PRINCIPAL: CADASTRO
// ==========================================

export function Cadastro() {
  const [items, setItems] = useState<RegistryItem[]>(initialRegistryItems);
  const [type, setType] = useState<RegistryType>('client');
  const [filter, setFilter] = useState<RegistryFilter>('all');
  const [form, setForm] = useState<RegistryForm>(emptyRegistryForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [viewing, setViewing] = useState<RegistryItem | null>(null);
  const [deleting, setDeleting] = useState<RegistryItem | null>(null);
  const [feedback, setFeedback] = useState('');

  // Filtragem combinada por tipo e busca textual
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesType = filter === 'all' || item.type === filter;
      const term = query.toLowerCase().trim();
      if (!term) return matchesType;

      const searchable = `${item.name} ${item.phone} ${item.email} ${item.document} ${item.category} ${item.description} ${item.notes}`.toLowerCase();
      return matchesType && searchable.includes(term);
    });
  }, [items, filter, query]);

  function updateForm(field: keyof RegistryForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function resetForm(nextType: RegistryType = type) {
    setForm(emptyRegistryForm);
    setEditingId(null);
    setType(nextType);
  }

  function submitRegistry(event: FormEvent) {
    event.preventDefault();
    if (editingId) {
      setItems((current) =>
        current.map((item) =>
          item.id === editingId ? { ...item, ...form, type } : item
        )
      );
      setFeedback('Cadastro atualizado com sucesso.');
    } else {
      const novoItem: RegistryItem = {
        ...form,
        id: Date.now(),
        type,
        createdAt: new Date().toLocaleDateString('pt-BR'),
      };
      setItems((current) => [novoItem, ...current]);
      setFeedback(`${registryMeta[type].singular} cadastrado com sucesso.`);
    }

    resetForm(type);
    setTimeout(() => setFeedback(''), 4000);
  }

  function startEdit(item: RegistryItem) {
    const { id, type: itemType, createdAt, ...values } = item;
    void id;
    void createdAt;
    setType(itemType);
    setForm(values);
    setEditingId(item.id);
    setViewing(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function confirmDelete() {
    if (!deleting) return;
    setItems((current) => current.filter((item) => item.id !== deleting.id));
    setFeedback('Cadastro excluído permanentemente.');
    setDeleting(null);
    setTimeout(() => setFeedback(''), 4000);
  }

  const formTitle = editingId
    ? `Editar ${registryMeta[type].singular.toLowerCase()}`
    : 'Novo cadastro';

  const counts: Record<RegistryFilter, number> = {
    all: items.length,
    client: items.filter((i) => i.type === 'client').length,
    supplier: items.filter((i) => i.type === 'supplier').length,
    service: items.filter((i) => i.type === 'service').length,
  };

  return (
    <div className="min-h-screen bg-[#0b0f16] text-slate-100 p-4 sm:p-6 lg:p-8">
      {/* Título da Página */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white tracking-tight">Central de Cadastros</h1>
        <p className="mt-1 text-xs text-slate-400">
          Gerencie clientes, fornecedores e catálogo de serviços em um só lugar.
        </p>
      </div>

      {/* Alerta de Feedback */}
      {feedback && (
        <div className="mb-5 flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300 animate-fadeIn">
          <span className="flex items-center gap-2">
            <Icon name="check" className="size-4 text-emerald-400" />
            {feedback}
          </span>
          <button
            className="text-emerald-400 hover:text-emerald-200"
            onClick={() => setFeedback('')}
            type="button"
          >
            <Icon name="x" className="size-4" />
          </button>
        </div>
      )}

      {/* Formulário Unificado com Progressive Disclosure */}
      <form
        onSubmit={submitRegistry}
        className="overflow-hidden rounded-xl border border-slate-800 bg-[#111722] shadow-xl"
      >
        {/* Cabeçalho do Formulário */}
        <div className="flex flex-col gap-4 border-b border-slate-800/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 place-items-center rounded-lg bg-blue-500/10 text-blue-400">
                <Icon name={editingId ? 'edit' : 'plus'} className="size-3.5" />
              </span>
              <h2 className="text-sm font-semibold text-white tracking-tight">{formTitle}</h2>
            </div>
            <p className="mt-1 pl-9.5 text-[11px] text-slate-500">
              Escolha o tipo e preencha somente as informações necessárias.
            </p>
          </div>

          {editingId && (
            <button
              className="self-start rounded-lg border border-slate-700 bg-transparent px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
              onClick={() => resetForm()}
              type="button"
            >
              Cancelar edição
            </button>
          )}
        </div>

        <div className="p-5 sm:p-6">
          {/* Seletor de Tipo (Cliente / Fornecedor / Serviço) */}
          <fieldset>
            <legend className={labelClass}>Tipo de registro</legend>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {(['client', 'supplier', 'service'] as RegistryType[]).map((itemType) => {
                const meta = registryMeta[itemType];
                const selected = type === itemType;
                return (
                  <button
                    key={itemType}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setType(itemType);
                      setEditingId(null);
                      setForm(emptyRegistryForm);
                    }}
                    className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${
                      selected
                        ? 'border-blue-500 bg-blue-500/10 shadow-sm shadow-blue-500/10'
                        : 'border-slate-800 bg-[#0b0f16] hover:border-slate-700'
                    }`}
                  >
                    <span
                      className={`grid size-8 place-items-center rounded-md ${
                        selected ? 'bg-blue-600 text-white' : meta.iconStyle
                      }`}
                    >
                      <Icon name={meta.icon} className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className={`block text-xs font-semibold ${selected ? 'text-white' : 'text-slate-300'}`}>
                        {meta.singular}
                      </strong>
                      <small className="mt-0.5 block text-[10px] text-slate-500 truncate">
                        {itemType === 'client'
                          ? 'Contato e documento'
                          : itemType === 'supplier'
                          ? 'Compras e peças'
                          : 'Preço e execução'}
                      </small>
                    </span>
                    {selected && <Icon name="check" className="size-4 text-blue-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="my-6 h-px bg-slate-800/80" />

          {/* Grade de Campos Dinâmicos */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Campo Comum: Nome / Razão Social / Título */}
            <label className="sm:col-span-2">
              <span className={labelClass}>
                {type === 'client'
                  ? 'Nome completo'
                  : type === 'supplier'
                  ? 'Nome / Razão Social'
                  : 'Título do serviço'}{' '}
                *
              </span>
              <input
                className={fieldClass}
                required
                value={form.name}
                onChange={(e) => updateForm('name', e.target.value)}
                placeholder={
                  type === 'service'
                    ? 'Ex.: Troca de tela iPhone 13'
                    : 'Nome completo ou Razão Social'
                }
              />
            </label>

            {/* Campos Específicos para CLIENTE ou FORNECEDOR */}
            {type !== 'service' && (
              <>
                <label>
                  <span className={labelClass}>Telefone / WhatsApp *</span>
                  <input
                    className={fieldClass}
                    required
                    value={form.phone}
                    onChange={(e) => updateForm('phone', e.target.value)}
                    placeholder="(85) 99999-9999"
                  />
                </label>

                <label>
                  <span className={labelClass}>E-mail</span>
                  <input
                    type="email"
                    className={fieldClass}
                    value={form.email}
                    onChange={(e) => updateForm('email', e.target.value)}
                    placeholder="contato@email.com"
                  />
                </label>

                <label>
                  <span className={labelClass}>{type === 'client' ? 'CPF / CNPJ' : 'CNPJ'}</span>
                  <input
                    className={fieldClass}
                    value={form.document}
                    onChange={(e) => updateForm('document', e.target.value)}
                    placeholder="Somente números"
                  />
                </label>
              </>
            )}

            {/* Campos Específicos para FORNECEDOR */}
            {type === 'supplier' && (
              <label>
                <span className={labelClass}>Categoria de fornecimento *</span>
                <select
                  className={fieldClass}
                  required
                  value={form.category}
                  onChange={(e) => updateForm('category', e.target.value)}
                >
                  <option value="">Selecione...</option>
                  <option value="Telas e componentes">Telas e componentes</option>
                  <option value="Baterias">Baterias</option>
                  <option value="Ferramentas e insumos">Ferramentas e insumos</option>
                  <option value="Acessórios">Acessórios</option>
                  <option value="Outros">Outros</option>
                </select>
              </label>
            )}

            {/* Campos Específicos para SERVIÇO */}
            {type === 'service' && (
              <>
                <label>
                  <span className={labelClass}>Valor base (R$) *</span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                      R$
                    </span>
                    <input
                      className={`${fieldClass} pl-9`}
                      required
                      value={form.price}
                      onChange={(e) => updateForm('price', e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Pode ser alterado durante o lançamento da OS.
                  </p>
                </label>

                <label>
                  <span className={labelClass}>Tempo estimado</span>
                  <input
                    className={fieldClass}
                    value={form.duration}
                    onChange={(e) => updateForm('duration', e.target.value)}
                    placeholder="Ex.: 1 hora, 30 minutos"
                  />
                </label>

                <label>
                  <span className={labelClass}>Garantia padrão</span>
                  <select
                    className={fieldClass}
                    value={form.warranty}
                    onChange={(e) => updateForm('warranty', e.target.value)}
                  >
                    <option value="">Sem padrão definido</option>
                    <option value="30 dias">30 dias</option>
                    <option value="60 dias">60 dias</option>
                    <option value="90 dias">90 dias</option>
                    <option value="180 dias">180 dias</option>
                  </select>
                </label>

                <label className="sm:col-span-2 lg:col-span-4">
                  <span className={labelClass}>Descrição detalhada</span>
                  <textarea
                    rows={2}
                    className="w-full rounded-lg border border-slate-700 bg-[#0d111a] p-3 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500 transition-colors"
                    value={form.description}
                    onChange={(e) => updateForm('description', e.target.value)}
                    placeholder="Detalhes do que está incluso neste serviço técnico..."
                  />
                </label>
              </>
            )}

            {/* Observações Internas para Clientes e Fornecedores */}
            {type !== 'service' && (
              <label className={type === 'client' ? 'sm:col-span-2 lg:col-span-3' : 'sm:col-span-2 lg:col-span-4'}>
                <span className={labelClass}>Observações internas</span>
                <input
                  className={fieldClass}
                  value={form.notes}
                  onChange={(e) => updateForm('notes', e.target.value)}
                  placeholder="Informações para a equipe (não visíveis ao cliente)"
                />
              </label>
            )}
          </div>
        </div>

        {/* Rodapé com Botões de Ação */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-[#0e1219] px-5 py-4 sm:px-6">
          <p className="hidden text-[11px] text-slate-500 sm:block">
            * Campos marcados com asterisco são obrigatórios.
          </p>
          <div className="ml-auto flex gap-2.5">
            <button
              type="button"
              onClick={() => resetForm()}
              className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800 transition-colors"
            >
              Limpar
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition-colors"
            >
              <Icon name={editingId ? 'check' : 'plus'} className="size-3.5" />
              {editingId ? 'Salvar alterações' : `Cadastrar ${registryMeta[type].singular.toLowerCase()}`}
            </button>
          </div>
        </div>
      </form>

      {/* Central de Registros Cadastrados */}
      <section className="mt-8 overflow-hidden rounded-xl border border-slate-800 bg-[#111722] shadow-xl">
        {/* Barra Superior: Título + Busca */}
        <div className="flex flex-col gap-4 border-b border-slate-800/80 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white tracking-tight">Registros cadastrados</h2>
            <p className="mt-1 text-xs text-slate-400">
              {filteredItems.length}{' '}
              {filteredItems.length === 1 ? 'item exibido' : 'itens exibidos'}
            </p>
          </div>

          {/* Campo de Busca Rápida */}
          <div className="relative w-full sm:w-80">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
              <Icon name="search" className="size-4" />
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, contato ou documento..."
              className="h-9 w-full rounded-lg border border-slate-700 bg-[#0d111a] pl-9 pr-3 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500 transition-colors"
            />
          </div>
        </div>

        {/* Abas de Filtro com Contadores */}
        <div className="flex gap-1 overflow-x-auto border-b border-slate-800 px-4 pt-2">
          {(
            [
              ['all', 'Todos'],
              ['client', 'Clientes'],
              ['supplier', 'Fornecedores'],
              ['service', 'Serviços'],
            ] as [RegistryFilter, string][]
          ).map(([id, label]) => {
            const active = filter === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`shrink-0 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
                  active
                    ? 'border-blue-500 text-blue-400 font-semibold'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${
                    active ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {counts[id]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tabela para Telas Médias e Grandes */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0b1019] text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">Nome / Título</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Contato ou Valor</th>
                <th className="px-4 py-3">Informação complementar</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredItems.map((item) => {
                const meta = registryMeta[item.type];
                const primary =
                  item.type === 'service'
                    ? item.price
                      ? `R$ ${item.price}`
                      : 'R$ 0,00'
                    : item.phone || 'Sem telefone';
                const secondary =
                  item.type === 'service'
                    ? item.duration || 'Tempo não informado'
                    : item.type === 'supplier'
                    ? item.category || 'Sem categoria'
                    : item.email || 'Sem e-mail';

                return (
                  <tr key={item.id} className="text-xs hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${meta.iconStyle}`}>
                          <Icon name={meta.icon} className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-200 truncate">{item.name}</p>
                          <p className="mt-0.5 text-[10px] text-slate-500">Desde {item.createdAt}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${meta.badge}`}>
                        {meta.singular}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-300">{primary}</td>
                    <td className="px-4 py-3.5 text-slate-400">{secondary}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setViewing(item)}
                          title="Visualizar detalhes"
                          className="rounded-md p-1.5 text-slate-400 hover:bg-blue-500/10 hover:text-blue-400 transition-colors"
                        >
                          <Icon name="eye" className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          title="Editar cadastro"
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                        >
                          <Icon name="edit" className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(item)}
                          title="Excluir cadastro"
                          className="rounded-md p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                        >
                          <Icon name="trash" className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Lista em Cards para Telas Pequenas (Mobile) */}
        <div className="divide-y divide-slate-800 sm:hidden">
          {filteredItems.map((item) => {
            const meta = registryMeta[item.type];
            return (
              <div key={item.id} className="p-4 flex items-start gap-3">
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${meta.iconStyle}`}>
                  <Icon name={meta.icon} className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-200">{item.name}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`rounded-md border px-2 py-0.5 text-[9px] font-semibold ${meta.badge}`}>
                      {meta.singular}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {item.type === 'service'
                        ? `R$ ${item.price || '0,00'}`
                        : item.phone || 'Sem contato'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setViewing(item)}
                    className="p-1.5 text-slate-400 hover:text-blue-400"
                  >
                    <Icon name="eye" className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    className="p-1.5 text-slate-400 hover:text-white"
                  >
                    <Icon name="edit" className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(item)}
                    className="p-1.5 text-slate-400 hover:text-red-400"
                  >
                    <Icon name="trash" className="size-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Estado Vazio de Busca */}
        {filteredItems.length === 0 && (
          <div className="grid place-items-center px-5 py-12 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-slate-800/60 text-slate-500">
              <Icon name="search" className="size-5" />
            </span>
            <p className="mt-3 text-sm font-medium text-slate-300">Nenhum cadastro encontrado</p>
            <p className="mt-1 text-xs text-slate-500">
              Tente alterar os termos da busca ou selecione outro filtro de categoria.
            </p>
          </div>
        )}
      </section>

      {/* Modal de Detalhes da Imagem */}
      {viewing && (
        <RegistryDetailsModal
          item={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => startEdit(viewing)}
        />
      )}

      {/* Modal de Confirmação de Exclusão */}
      {deleting && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-5 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-[#11151d] p-5 shadow-2xl">
            <span className="grid size-10 place-items-center rounded-lg bg-red-500/10 text-red-400">
              <Icon name="trash" className="size-5" />
            </span>
            <h2 className="mt-4 text-sm font-semibold text-white">
              Excluir {registryMeta[deleting.type].singular.toLowerCase()}?
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              O cadastro de <strong className="font-medium text-white">{deleting.name}</strong> será removido permanentemente. Esta ação não poderá ser desfeita.
            </p>
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-red-600/20 hover:bg-red-500 transition-colors"
              >
                Excluir cadastro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Cadastro;