import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, MessageCircle, Pencil, Plus, RotateCcw, Send, Trash2, X } from 'lucide-react';
import {
  CONDICOES_PADRAO,
  type DadosOrcamento,
  MAX_OPCOES_ORCAMENTO,
  type Orcamento,
  OrcamentosAusenteError,
  QUALIDADES_SUGERIDAS,
  ROTULO_STATUS_ORCAMENTO,
  type StatusOrcamento,
  definirStatusOrcamento,
  excluirOrcamento,
  linkDoOrcamento,
  listarOrcamentos,
  mensagemOrcamento,
  rotuloOpcao,
  salvarOrcamento,
} from '../services/orcamentos';
import { type Cliente, type Servico, listarClientes, listarServicos, parseMoedaBR } from '../services/cadastros';
import { buscarModelosAparelhos, linkWhatsapp } from '../services/api';
import { abrirEmNovaAba } from '../utils/whatsapp';
import { hojeISO } from '../services/despesas';
import { Badge, Campo, Carregando, FiltroSegmentado, ModalConfirmacao, PaginaCadastro, inputCls, useFeedback } from '../components/cadastros/ui';
import { CampoModeloAparelho } from '../components/CampoModeloAparelho';
import { formatarDataHora, formatarMoeda, formatarValor, mascaraTelefone, somenteDigitos } from '../utils/formatadores';
import { dataBR } from '../utils/meses';

// ==========================================
// Orçamento rápido pelo WhatsApp: a loja monta o orçamento, manda para o WhatsApp do cliente com um
// link e acompanha aqui quem autorizou ou não o serviço. Não cria OS.
// ==========================================

type Filtro = 'TODOS' | StatusOrcamento;

const VALIDADES = [
  { dias: 3, rotulo: '3 dias' },
  { dias: 7, rotulo: '7 dias' },
  { dias: 15, rotulo: '15 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 0, rotulo: 'Sem validade' },
];

/** Ao editar: mantém a data de validade que o orçamento já tem. */
const VALIDADE_MANTER = -1;

/** Uma opção de preço no formulário; `chave` identifica a linha na tela (não vai para o banco). */
interface OpcaoForm {
  chave: string;
  qualidade: string;
  valor: string;
  descricao: string;
}

type ErrosOpcao = { qualidade?: string; valor?: string };

interface Form {
  clienteNome: string;
  clienteWhatsapp: string;
  idCliente: string;
  titulo: string;
  aparelho: string;
  opcoes: OpcaoForm[];
  garantia: string;
  brinde: string;
  condicoes: string;
  observacoes: string;
  validadeDias: number;
}

let sequenciaOpcao = 0;
const novaOpcao = (dados: Partial<Omit<OpcaoForm, 'chave'>> = {}): OpcaoForm => ({
  chave: `opcao-${++sequenciaOpcao}`,
  qualidade: '',
  valor: '',
  descricao: '',
  ...dados,
});

const opcoesDoOrcamento = (o: Orcamento) =>
  o.opcoes.map((p) => novaOpcao({ qualidade: p.qualidade || '', valor: formatarValor(p.valor), descricao: p.descricao || '' }));

/** Campos que mudam a cada cliente; garantia, brinde, condições e validade ficam para o próximo. */
const clienteVazio = () => ({
  clienteNome: '',
  clienteWhatsapp: '',
  idCliente: '',
  titulo: '',
  aparelho: '',
  opcoes: [novaOpcao()],
  observacoes: '',
});

const formInicial = (): Form => ({
  ...clienteVazio(),
  garantia: '3 meses',
  brinde: '',
  condicoes: CONDICOES_PADRAO.join('\n'),
  validadeDias: 7,
});

/** Valor que aparece na lista: a opção autorizada, as opções ou o valor único. */
const resumoValor = (o: Orcamento) => {
  if (o.opcao_aprovada) {
    const q = o.opcao_aprovada.qualidade;
    return `${q ? `${q} · ` : ''}${formatarMoeda(o.opcao_aprovada.valor)}`;
  }
  if (o.opcoes.length > 1) return o.opcoes.map((p, i) => `${rotuloOpcao(p, i)} ${formatarMoeda(p.valor)}`).join(' / ');
  return formatarMoeda(o.opcoes[0]?.valor ?? o.valor);
};

/** Valor do seletor de resposta. Com várias opções, "Autorizado" vem com a opção escolhida (APROVADO:<índice>). */
const valorStatus = (o: Orcamento) => {
  if (o.status !== 'APROVADO' || o.opcoes.length <= 1) return o.status;
  const i = o.opcoes.findIndex((p) => p.id && p.id === o.opcao_aprovada?.id);
  return i >= 0 ? `APROVADO:${i}` : 'APROVADO';
};

const somarDiasISO = (dias: number) => {
  const [a, m, d] = hojeISO().split('-').map(Number);
  const alvo = new Date(a, m - 1, d + dias);
  return `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(alvo.getDate()).padStart(2, '0')}`;
};

const COR_STATUS: Record<StatusOrcamento, 'azul' | 'verde' | 'cinza'> = { PENDENTE: 'azul', APROVADO: 'verde', RECUSADO: 'cinza' };

/** Texto do WhatsApp com *negrito*, como aparece na conversa. */
const TextoWhatsapp: React.FC<{ texto: string }> = ({ texto }) => (
  <>
    {texto.split(/(\*[^*\n]+\*)/).map((parte, i) =>
      /^\*[^*\n]+\*$/.test(parte) ? <strong key={i}>{parte.slice(1, -1)}</strong> : <React.Fragment key={i}>{parte}</React.Fragment>
    )}
  </>
);

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    window.prompt('Copie o texto abaixo:', texto);
    return false;
  }
}

export const Orcamentos: React.FC = () => {
  const [lista, setLista] = useState<Orcamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ausente, setAusente] = useState<string | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [modelos, setModelos] = useState<string[]>([]);
  const [form, setForm] = useState<Form>(formInicial);
  const [erros, setErros] = useState<Partial<Record<keyof Form, string>>>({});
  const [errosOpcoes, setErrosOpcoes] = useState<Record<string, ErrosOpcao>>({});
  // Orçamento aguardando resposta que está sendo alterado no formulário (null = novo orçamento)
  const [editando, setEditando] = useState<Orcamento | null>(null);
  // Opção recém-adicionada: recebe o foco quando aparece na tela
  const focarOpcao = useRef<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>('TODOS');
  const [busca, setBusca] = useState('');
  const [paraExcluir, setParaExcluir] = useState<Orcamento | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const feedback = useFeedback();
  // O formulário ainda não foi mexido: pode receber garantia/brinde/condições do último orçamento
  const formIntocado = useRef(true);
  const enviandoRef = useRef(false);

  const carregar = useCallback(async () => {
    try {
      const dados = await listarOrcamentos();
      setLista(dados);
      setAusente(null);
      const ultimo = dados[0];
      if (ultimo && formIntocado.current) {
        formIntocado.current = false;
        setForm((f) => ({
          ...f,
          garantia: ultimo.garantia || '',
          brinde: ultimo.brinde || '',
          condicoes: ultimo.condicoes.length ? ultimo.condicoes.join('\n') : f.condicoes,
        }));
      }
    } catch (e: any) {
      if (e instanceof OrcamentosAusenteError) setAusente(e.migracao);
      else feedback.erro(e.message);
    } finally {
      setCarregando(false);
    }
    // feedback muda a cada render; só a primeira referência importa aqui
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    carregar();
    listarClientes().then(setClientes).catch(() => setClientes([]));
    listarServicos().then(setServicos).catch(() => setServicos([]));
    buscarModelosAparelhos().then(setModelos).catch(() => setModelos([]));
    // O cliente responde pelo link a qualquer hora: atualiza ao voltar para a aba e a cada minuto
    const aoVoltar = () => document.visibilityState === 'visible' && carregar();
    document.addEventListener('visibilitychange', aoVoltar);
    const intervalo = window.setInterval(() => document.visibilityState === 'visible' && carregar(), 60_000);
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar);
      window.clearInterval(intervalo);
    };
  }, [carregar]);

  const mudar = <K extends keyof Form>(campo: K, valor: Form[K]) => {
    formIntocado.current = false;
    setForm((f) => ({ ...f, [campo]: valor }));
    setErros((e) => ({ ...e, [campo]: undefined }));
  };

  // Cliente cadastrado escolhido pelo nome: preenche o WhatsApp
  const mudarCliente = (nome: string) => {
    const cadastrado = clientes.find((c) => c.nome.trim().toLowerCase() === nome.trim().toLowerCase());
    formIntocado.current = false;
    setForm((f) => ({
      ...f,
      clienteNome: nome,
      idCliente: cadastrado?.id_cliente || '',
      clienteWhatsapp: cadastrado?.whatsapp ? mascaraTelefone(cadastrado.whatsapp) : f.idCliente ? '' : f.clienteWhatsapp,
    }));
    setErros((e) => ({ ...e, clienteNome: undefined, clienteWhatsapp: cadastrado?.whatsapp ? undefined : e.clienteWhatsapp }));
  };

  // Serviço do catálogo escolhido: sugere o preço (se ainda vazio) e a garantia do serviço
  const mudarServico = (titulo: string) => {
    const servico = servicos.find((s) => s.nome.trim().toLowerCase() === titulo.trim().toLowerCase());
    formIntocado.current = false;
    setForm((f) => ({
      ...f,
      titulo,
      // O preço sugerido vai para a primeira opção, se ela ainda estiver sem valor
      opcoes:
        servico && servico.preco_sugerido > 0 && !f.opcoes[0].valor.trim()
          ? [{ ...f.opcoes[0], valor: formatarValor(servico.preco_sugerido) }, ...f.opcoes.slice(1)]
          : f.opcoes,
      garantia:
        servico?.garantia_padrao && servico.garantia_padrao !== 'Sem garantia' ? servico.garantia_padrao : f.garantia,
    }));
    setErros((e) => ({ ...e, titulo: undefined }));
  };

  // ---- Opções de preço ----
  const mudarOpcao = (chave: string, campo: keyof Omit<OpcaoForm, 'chave'>, valor: string) => {
    formIntocado.current = false;
    setForm((f) => ({ ...f, opcoes: f.opcoes.map((p) => (p.chave === chave ? { ...p, [campo]: valor } : p)) }));
    setErrosOpcoes((e) => (e[chave] ? { ...e, [chave]: { ...e[chave], [campo]: undefined } } : e));
  };

  const adicionarOpcao = () => {
    if (form.opcoes.length >= MAX_OPCOES_ORCAMENTO) return;
    const nova = novaOpcao();
    focarOpcao.current = nova.chave;
    formIntocado.current = false;
    setForm((f) => ({ ...f, opcoes: [...f.opcoes, nova] }));
  };

  const removerOpcao = (chave: string) => {
    setForm((f) => ({ ...f, opcoes: f.opcoes.length > 1 ? f.opcoes.filter((p) => p.chave !== chave) : f.opcoes }));
    setErrosOpcoes(({ [chave]: _removido, ...resto }) => resto);
  };

  const variasOpcoes = form.opcoes.length > 1;
  const validadeAtual = form.validadeDias === VALIDADE_MANTER ? editando?.validade ?? null : form.validadeDias > 0 ? somarDiasISO(form.validadeDias) : null;
  const dados: DadosOrcamento = {
    cliente_nome: form.clienteNome,
    cliente_whatsapp: somenteDigitos(form.clienteWhatsapp),
    id_cliente: form.idCliente || null,
    titulo: form.titulo,
    aparelho: form.aparelho,
    opcoes: form.opcoes.map((p) => ({ qualidade: p.qualidade, valor: parseMoedaBR(p.valor) ?? 0, descricao: p.descricao })),
    garantia: form.garantia,
    brinde: form.brinde,
    condicoes: form.condicoes.split('\n'),
    observacoes: form.observacoes,
    validade: validadeAtual,
  };
  const previa = mensagemOrcamento(
    { ...dados, titulo: dados.titulo || 'SERVIÇO', aparelho: dados.aparelho },
    editando ? linkDoOrcamento(editando.token) : `${window.location.origin}/orcamento/…`
  );

  const validar = () => {
    const e: Partial<Record<keyof Form, string>> = {};
    if (!form.clienteNome.trim()) e.clienteNome = 'Informe o nome do cliente.';
    if (!linkWhatsapp(form.clienteWhatsapp, 'x')) e.clienteWhatsapp = 'Informe o WhatsApp com DDD.';
    if (form.titulo.trim().length < 2) e.titulo = 'Informe o serviço (ex.: Troca de tela).';
    if (!form.aparelho.trim()) e.aparelho = 'Informe o modelo do aparelho.';
    if (form.condicoes.split('\n').filter((c) => c.trim()).length > 10) e.condicoes = 'Use no máximo 10 linhas.';

    const eo: Record<string, ErrosOpcao> = {};
    const qualidadesVistas = new Set<string>();
    for (const p of form.opcoes) {
      const erro: ErrosOpcao = {};
      const valor = parseMoedaBR(p.valor);
      if (!valor || valor <= 0) erro.valor = 'Informe o valor (ex.: 270,00).';
      const qualidade = p.qualidade.trim().toLowerCase();
      if (variasOpcoes && !qualidade) erro.qualidade = 'Informe a qualidade para o cliente saber a diferença.';
      else if (qualidade && qualidadesVistas.has(qualidade)) erro.qualidade = 'Já existe uma opção com esta qualidade.';
      if (qualidade) qualidadesVistas.add(qualidade);
      if (erro.valor || erro.qualidade) eo[p.chave] = erro;
    }

    setErros(e);
    setErrosOpcoes(eo);
    return Object.keys(e).length === 0 && Object.keys(eo).length === 0;
  };

  /** Volta para "Novo orçamento" mantendo garantia, brinde e formas de pagamento. */
  const limparFormulario = () => {
    setEditando(null);
    setForm((f) => ({ ...f, ...clienteVazio(), validadeDias: f.validadeDias === VALIDADE_MANTER ? 7 : f.validadeDias }));
    setErros({});
    setErrosOpcoes({});
  };

  const irParaFormulario = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.querySelector<HTMLElement>('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** Abre a conversa do cliente. A janela é aberta antes de salvar (no clique) para o navegador não bloquear. */
  const abrirWhatsapp = (janela: Window | null, telefone: string, texto: string) => {
    const destino = linkWhatsapp(telefone, texto);
    if (!destino) return false;
    if (janela) {
      janela.opener = null;
      janela.location.href = destino;
      return true;
    }
    return abrirEmNovaAba(destino);
  };

  /** Salva (cria ou altera) e, se `abrirConversa`, abre o WhatsApp do cliente com a mensagem. */
  const enviar = async (abrirConversa = true) => {
    if (enviandoRef.current || !validar()) return;
    enviandoRef.current = true;
    setEnviando(true);
    const janela = abrirConversa ? window.open('', '_blank') : null;
    const emEdicao = editando;
    try {
      const salvo = await salvarOrcamento(dados, emEdicao?.id);
      if (!abrirConversa) {
        feedback.sucesso('Alterações salvas. O link que o cliente recebeu já mostra a versão nova.');
      } else if (!abrirWhatsapp(janela, salvo.cliente_whatsapp, mensagemOrcamento(salvo, linkDoOrcamento(salvo.token)))) {
        feedback.erro('Orçamento salvo, mas o navegador bloqueou o WhatsApp. Use "Reenviar" na lista abaixo.');
      } else {
        feedback.sucesso(`Orçamento de ${salvo.cliente_nome} salvo. Confira a mensagem no WhatsApp e toque em Enviar.`);
      }
      setLista((l) => (emEdicao ? l.map((x) => (x.id === salvo.id ? salvo : x)) : [salvo, ...l]));
      limparFormulario();
    } catch (e: any) {
      janela?.close();
      if (e instanceof OrcamentosAusenteError) setAusente(e.migracao);
      feedback.erro(e.message);
      // O cliente pode ter respondido enquanto a loja editava: atualiza a lista
      if (emEdicao) carregar();
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  };

  const reenviar = (o: Orcamento) => {
    if (!abrirWhatsapp(null, o.cliente_whatsapp, mensagemOrcamento(o, linkDoOrcamento(o.token)))) {
      feedback.erro('Não foi possível abrir o WhatsApp. Permita pop-ups para este site ou confira o número.');
    }
  };

  const usarComoModelo = (o: Orcamento) => {
    formIntocado.current = false;
    setEditando(null);
    setForm({
      ...formInicial(),
      titulo: o.titulo,
      aparelho: o.aparelho,
      opcoes: opcoesDoOrcamento(o),
      garantia: o.garantia || '',
      brinde: o.brinde || '',
      condicoes: o.condicoes.join('\n'),
      observacoes: o.observacoes || '',
    });
    setErros({});
    setErrosOpcoes({});
    irParaFormulario();
  };

  /** Carrega no formulário um orçamento que ainda aguarda resposta, para corrigir valores ou opções. */
  const editar = (o: Orcamento) => {
    formIntocado.current = false;
    setEditando(o);
    setForm({
      clienteNome: o.cliente_nome,
      clienteWhatsapp: mascaraTelefone(o.cliente_whatsapp.replace(/^55(?=\d{10,11}$)/, '')),
      idCliente: o.id_cliente || '',
      titulo: o.titulo,
      aparelho: o.aparelho,
      opcoes: opcoesDoOrcamento(o),
      garantia: o.garantia || '',
      brinde: o.brinde || '',
      condicoes: o.condicoes.join('\n'),
      observacoes: o.observacoes || '',
      validadeDias: o.validade ? VALIDADE_MANTER : 0,
    });
    setErros({});
    setErrosOpcoes({});
    irParaFormulario();
  };

  const mudarStatus = async (o: Orcamento, valor: string) => {
    if (valor === valorStatus(o)) return;
    const [codigo, indice] = valor.split(':');
    const status = codigo as StatusOrcamento;
    // Opção autorizada: a escolhida no seletor ou, se só há uma, ela mesma
    const opcao = status !== 'APROVADO' ? null : indice !== undefined ? o.opcoes[Number(indice)] : o.opcoes.length === 1 ? o.opcoes[0] : null;
    try {
      const opcaoAprovada = await definirStatusOrcamento(o.id, status, opcao);
      setLista((l) =>
        l.map((x) =>
          x.id === o.id
            ? {
                ...x,
                status,
                opcao_aprovada: opcaoAprovada,
                motivo_recusa: status === 'RECUSADO' ? x.motivo_recusa : null,
                respondido_por: status === 'PENDENTE' ? null : 'LOJA',
                respondido_em: status === 'PENDENTE' ? null : new Date().toISOString(),
              }
            : x
        )
      );
      // Respondido não pode mais ser editado
      if (editando?.id === o.id && status !== 'PENDENTE') limparFormulario();
    } catch (e: any) {
      feedback.erro(e.message);
    }
  };

  const confirmarExclusao = async () => {
    if (!paraExcluir) return;
    setExcluindo(true);
    try {
      await excluirOrcamento(paraExcluir.id);
      setLista((l) => l.filter((x) => x.id !== paraExcluir.id));
      if (editando?.id === paraExcluir.id) limparFormulario();
      setParaExcluir(null);
      feedback.sucesso('Orçamento excluído. O link dele parou de funcionar.');
    } catch (e: any) {
      feedback.erro(e.message);
    } finally {
      setExcluindo(false);
    }
  };

  const contagem = useMemo(
    () => ({
      PENDENTE: lista.filter((o) => o.status === 'PENDENTE').length,
      APROVADO: lista.filter((o) => o.status === 'APROVADO').length,
      RECUSADO: lista.filter((o) => o.status === 'RECUSADO').length,
    }),
    [lista]
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = somenteDigitos(busca);
    return lista.filter(
      (o) =>
        (filtro === 'TODOS' || o.status === filtro) &&
        (!termo ||
          `${o.cliente_nome} ${o.titulo} ${o.aparelho}`.toLowerCase().includes(termo) ||
          (digitos.length >= 3 && o.cliente_whatsapp.includes(digitos)))
    );
  }, [lista, filtro, busca]);

  if (carregando) return <Carregando />;

  if (ausente) {
    return (
      <PaginaCadastro titulo="Orçamentos" descricao="Mande o orçamento pelo WhatsApp e o cliente autoriza pelo link.">
        <div className="bg-[#0c101a] border border-blue-500/30 rounded-2xl p-6">
          <p className="text-sm font-bold text-blue-400">Os orçamentos ainda não foram ativados no banco de dados</p>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
            Execute a migração{' '}
            <code className="px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-200 text-[11px]">supabase/migrations/{ausente}</code>{' '}
            no SQL Editor do Supabase e recarregue esta página.
          </p>
        </div>
      </PaginaCadastro>
    );
  }

  return (
    <PaginaCadastro titulo="Orçamentos" descricao="Monte o orçamento, mande pelo WhatsApp do cliente e veja aqui quem autorizou o serviço.">
      <feedback.Feedback />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
        {/* ================= FORMULÁRIO ================= */}
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
          className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl p-5 sm:p-6 space-y-5"
        >
          {editando ? (
            <div className="flex items-start justify-between gap-3 rounded-xl bg-blue-500/10 border border-blue-500/25 px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-white">Editando o orçamento de {editando.cliente_nome}</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  O cliente ainda não respondeu. O link que ele recebeu passa a mostrar a versão nova.
                </p>
              </div>
              <button
                type="button"
                onClick={limparFormulario}
                className="shrink-0 text-xs font-semibold text-blue-400 hover:underline"
              >
                Cancelar edição
              </button>
            </div>
          ) : (
            <div>
              <h3 className="text-sm font-bold text-white">Novo orçamento</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Garantia, brinde e formas de pagamento ficam salvos para o próximo.</p>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <Campo label="Cliente" obrigatorio erro={erros.clienteNome} dica={form.idCliente ? 'Cliente cadastrado' : undefined}>
              <input
                list="orcamento-clientes"
                value={form.clienteNome}
                onChange={(e) => mudarCliente(e.target.value)}
                placeholder="Nome do cliente"
                autoComplete="off"
                className={inputCls(erros.clienteNome)}
              />
              <datalist id="orcamento-clientes">
                {clientes.slice(0, 500).map((c) => (
                  <option key={c.id_cliente} value={c.nome} />
                ))}
              </datalist>
            </Campo>
            <Campo label="WhatsApp" obrigatorio erro={erros.clienteWhatsapp}>
              <input
                type="tel"
                inputMode="tel"
                value={form.clienteWhatsapp}
                onChange={(e) => mudar('clienteWhatsapp', mascaraTelefone(e.target.value))}
                placeholder="(00) 00000-0000"
                className={inputCls(erros.clienteWhatsapp)}
              />
            </Campo>

            <Campo label="Serviço" obrigatorio erro={erros.titulo} dica="Vira o título: ORÇAMENTO – TROCA DE TELA">
              <input
                list="orcamento-servicos"
                value={form.titulo}
                onChange={(e) => mudarServico(e.target.value)}
                placeholder="Ex.: Troca de tela"
                maxLength={80}
                autoComplete="off"
                className={inputCls(erros.titulo)}
              />
              <datalist id="orcamento-servicos">
                {servicos.map((s) => (
                  <option key={s.id_servico} value={s.nome} />
                ))}
              </datalist>
            </Campo>
            <Campo label="Modelo do aparelho" obrigatorio erro={erros.aparelho}>
              <CampoModeloAparelho
                valor={form.aparelho}
                onChange={(v) => mudar('aparelho', v)}
                modelosDaLoja={modelos}
                placeholder="Ex.: Samsung A17"
                className={inputCls(erros.aparelho)}
              />
            </Campo>

          </div>

          {/* ---------- Opções de preço ---------- */}
          <div className="space-y-2.5">
            <div>
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                Opções de preço<span className="text-blue-400"> *</span>
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Para passar mais de um preço (ex.: tela original e primeira linha), adicione uma opção. O cliente escolhe pelo link.
              </p>
            </div>

            {form.opcoes.map((p, i) => {
              const eo = errosOpcoes[p.chave] || {};
              return (
                <div key={p.chave} className="rounded-xl border border-zinc-800/80 bg-[#080c14] p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-2 mb-2.5 min-h-7">
                    <span className="text-xs font-bold text-zinc-300">{variasOpcoes ? `Opção ${i + 1}` : 'Preço'}</span>
                    {i > 0 && (
                      <button
                        type="button"
                        onClick={() => removerOpcao(p.chave)}
                        title="Remover opção"
                        aria-label={`Remover opção ${i + 1}`}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800/50 transition"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid sm:grid-cols-[minmax(0,1fr)_150px] gap-3">
                    <Campo
                      label="Qualidade / tipo da peça"
                      obrigatorio={variasOpcoes}
                      erro={eo.qualidade}
                      dica={variasOpcoes ? undefined : 'Opcional com uma opção só.'}
                    >
                      <input
                        ref={(el) => {
                          if (el && focarOpcao.current === p.chave) {
                            focarOpcao.current = null;
                            el.focus();
                          }
                        }}
                        list="orcamento-qualidades"
                        value={p.qualidade}
                        onChange={(e) => mudarOpcao(p.chave, 'qualidade', e.target.value)}
                        placeholder="Ex.: Original, Primeira linha, Incell"
                        maxLength={40}
                        autoComplete="off"
                        className={inputCls(eo.qualidade)}
                      />
                    </Campo>
                    <Campo label="Valor (R$)" obrigatorio erro={eo.valor}>
                      <input
                        inputMode="decimal"
                        value={p.valor}
                        onChange={(e) => mudarOpcao(p.chave, 'valor', e.target.value)}
                        placeholder="270,00"
                        className={`${inputCls(eo.valor)} tabular-nums`}
                      />
                    </Campo>
                    <Campo label="Descrição" className="sm:col-span-2" dica="Opcional. Ex.: garantia de 6 meses, mesma qualidade de imagem da original.">
                      <input
                        value={p.descricao}
                        onChange={(e) => mudarOpcao(p.chave, 'descricao', e.target.value)}
                        maxLength={200}
                        className={inputCls()}
                      />
                    </Campo>
                  </div>
                </div>
              );
            })}
            <datalist id="orcamento-qualidades">
              {QUALIDADES_SUGERIDAS.map((q) => (
                <option key={q} value={q} />
              ))}
            </datalist>

            {form.opcoes.length < MAX_OPCOES_ORCAMENTO ? (
              <button
                type="button"
                onClick={adicionarOpcao}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-zinc-700 text-xs font-bold text-blue-400 hover:bg-blue-500/10 transition"
              >
                <Plus className="w-4 h-4" /> Adicionar opção
              </button>
            ) : (
              <p className="text-[11px] text-zinc-500 text-center">Limite de {MAX_OPCOES_ORCAMENTO} opções por orçamento.</p>
            )}
          </div>

          <div className="grid sm:grid-cols-[180px_minmax(0,1fr)] gap-4">
            <Campo label="Garantia" dica="Ex.: 3 meses, 90 dias">
              <input
                value={form.garantia}
                onChange={(e) => mudar('garantia', e.target.value)}
                placeholder="3 meses"
                maxLength={60}
                className={inputCls()}
              />
            </Campo>
            <Campo label="Brinde ou destaque" dica="Opcional. Aparece com 🎁 na mensagem.">
              <input
                value={form.brinde}
                onChange={(e) => mudar('brinde', e.target.value)}
                placeholder="Ex.: Na troca de tela você ganha uma película de brinde já aplicada"
                maxLength={200}
                className={inputCls()}
              />
            </Campo>
          </div>

          <Campo label="Formas de pagamento" erro={erros.condicoes} dica="Uma por linha. Cada linha aparece com ✔️.">
            <textarea
              value={form.condicoes}
              onChange={(e) => mudar('condicoes', e.target.value)}
              rows={4}
              className={`${inputCls(erros.condicoes)} resize-y`}
            />
          </Campo>

          <div className="grid sm:grid-cols-[minmax(0,1fr)_180px] gap-4">
            <Campo label="Observação" dica="Opcional. Ex.: prazo de 1 hora, peça a pronta entrega.">
              <input
                value={form.observacoes}
                onChange={(e) => mudar('observacoes', e.target.value)}
                maxLength={500}
                className={inputCls()}
              />
            </Campo>
            <Campo label="Validade">
              <select
                value={form.validadeDias}
                onChange={(e) => mudar('validadeDias', Number(e.target.value))}
                className={inputCls()}
              >
                {editando?.validade && <option value={VALIDADE_MANTER}>Manter (até {dataBR(editando.validade)})</option>}
                {VALIDADES.map((v) => (
                  <option key={v.dias} value={v.dias}>
                    {v.rotulo}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-zinc-800/60">
            <button
              type="button"
              onClick={limparFormulario}
              className="px-4 py-2.5 text-xs font-semibold text-zinc-400 hover:text-white transition self-start sm:self-auto"
            >
              {editando ? 'Cancelar edição' : 'Limpar'}
            </button>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              {editando && (
                <button
                  type="button"
                  onClick={() => enviar(false)}
                  disabled={enviando}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 border border-zinc-700 hover:bg-zinc-800 disabled:opacity-60 text-zinc-200 font-bold rounded-xl text-sm transition"
                >
                  <Check className="w-4 h-4" />
                  Só salvar
                </button>
              )}
              <button
                type="submit"
                disabled={enviando}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition shadow-md shadow-emerald-600/20"
              >
                <Send className="w-4 h-4" />
                {enviando ? 'Salvando…' : editando ? 'Salvar e reenviar no WhatsApp' : 'Enviar no WhatsApp'}
              </button>
            </div>
          </div>
        </form>

        {/* ================= PRÉVIA ================= */}
        <aside className="lg:sticky lg:top-4 space-y-2">
          <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Como o cliente vai receber</p>
          <div className="rounded-2xl border border-zinc-800/80 bg-[#0b141a] p-4" data-theme-preview="true">
            <div className="ml-auto max-w-[95%] rounded-xl rounded-tr-sm bg-[#005c4b] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#e9edef] whitespace-pre-wrap break-words shadow">
              <TextoWhatsapp texto={previa} />
            </div>
          </div>
          <p className="text-[11px] text-zinc-500">
            O link abre uma página com o orçamento e os botões <strong className="text-zinc-300">Sim, autorizo</strong> e{' '}
            <strong className="text-zinc-300">Não autorizo</strong>. A resposta aparece na lista abaixo.
          </p>
        </aside>
      </div>

      {/* ================= ENVIADOS ================= */}
      <div className="bg-[#0c101a] border border-zinc-800/80 rounded-2xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-zinc-800/60 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-bold text-white">Orçamentos enviados</h3>
            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-zinc-800/80 text-zinc-300">{lista.length}</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="overflow-x-auto no-scrollbar">
              <FiltroSegmentado<Filtro>
                valor={filtro}
                onChange={setFiltro}
                opcoes={[
                  { valor: 'TODOS', label: 'Todos' },
                  { valor: 'PENDENTE', label: `Aguardando (${contagem.PENDENTE})` },
                  { valor: 'APROVADO', label: `Autorizados (${contagem.APROVADO})` },
                  { valor: 'RECUSADO', label: `Não autorizados (${contagem.RECUSADO})` },
                ]}
              />
            </div>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente, aparelho ou serviço"
              aria-label="Buscar orçamentos"
              className="sm:w-64 px-3 py-2 bg-[#080c14] border border-zinc-800/80 rounded-xl text-xs text-white outline-none focus:border-blue-500 transition placeholder:text-zinc-500"
            />
          </div>
        </div>

        {filtrados.length === 0 ? (
          <p className="p-12 text-center text-xs text-zinc-400">
            {lista.length === 0 ? 'Nenhum orçamento enviado ainda. Monte o primeiro acima.' : 'Nenhum orçamento neste filtro.'}
          </p>
        ) : (
          <ul className="divide-y divide-zinc-800/40">
            {filtrados.map((o) => (
              <li key={o.id} className="p-4 sm:px-5 flex flex-col md:flex-row md:items-center gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-white truncate">{o.cliente_nome}</p>
                    <Badge cor={COR_STATUS[o.status]}>
                      {o.status === 'APROVADO' && <Check className="w-3 h-3 mr-1" strokeWidth={3} />}
                      {ROTULO_STATUS_ORCAMENTO[o.status]}
                    </Badge>
                    {o.status === 'PENDENTE' && o.validade && o.validade < hojeISO() && <Badge cor="vermelho">Vencido</Badge>}
                  </div>
                  <p className="text-xs text-zinc-300">
                    {o.titulo} · {o.aparelho} · <span className="font-bold text-white tabular-nums">{resumoValor(o)}</span>
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {mascaraTelefone(o.cliente_whatsapp.replace(/^55(?=\d{10,11}$)/, ''))} · enviado em {formatarDataHora(o.criado_em)}
                    {o.criado_por ? ` por ${o.criado_por}` : ''}
                    {o.validade ? ` · válido até ${dataBR(o.validade)}` : ''}
                  </p>
                  {o.respondido_em && (
                    <p className="text-[11px] text-zinc-400">
                      {o.status === 'APROVADO' ? 'Autorizado' : 'Não autorizado'} {o.respondido_por === 'LOJA' ? '(marcado pela loja)' : 'pelo cliente'} em{' '}
                      {formatarDataHora(o.respondido_em)}
                      {o.motivo_recusa ? ` — “${o.motivo_recusa}”` : ''}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 md:justify-end shrink-0">
                  <select
                    value={valorStatus(o)}
                    onChange={(e) => mudarStatus(o, e.target.value)}
                    aria-label={`Resposta do orçamento de ${o.cliente_nome}`}
                    title="Registrar a resposta que o cliente deu por outro meio"
                    className="max-w-[220px] px-2.5 py-2 bg-[#080c14] border border-zinc-800/80 rounded-lg text-[11px] text-zinc-200 outline-none focus:border-blue-500"
                  >
                    <option value="PENDENTE">{ROTULO_STATUS_ORCAMENTO.PENDENTE}</option>
                    {o.opcoes.length > 1 ? (
                      <>
                        {/* Autorizado sem opção registrada (antes das opções existirem) */}
                        {valorStatus(o) === 'APROVADO' && <option value="APROVADO">{ROTULO_STATUS_ORCAMENTO.APROVADO}</option>}
                        {o.opcoes.map((p, i) => (
                          <option key={p.id || i} value={`APROVADO:${i}`}>
                            {ROTULO_STATUS_ORCAMENTO.APROVADO} · {rotuloOpcao(p, i)}
                          </option>
                        ))}
                      </>
                    ) : (
                      <option value="APROVADO">{ROTULO_STATUS_ORCAMENTO.APROVADO}</option>
                    )}
                    <option value="RECUSADO">{ROTULO_STATUS_ORCAMENTO.RECUSADO}</option>
                  </select>
                  {o.status === 'PENDENTE' && (
                    <button
                      type="button"
                      onClick={() => editar(o)}
                      title="Editar valores e opções"
                      aria-label={`Editar orçamento de ${o.cliente_nome}`}
                      className={`p-2 rounded-lg transition ${
                        editando?.id === o.id ? 'text-blue-400 bg-blue-500/10' : 'text-zinc-400 hover:text-blue-400 hover:bg-zinc-800/50'
                      }`}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => reenviar(o)}
                    title="Reenviar no WhatsApp"
                    aria-label={`Reenviar orçamento de ${o.cliente_nome} no WhatsApp`}
                    className="p-2 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => (await copiar(linkDoOrcamento(o.token))) && feedback.sucesso('Link do orçamento copiado.')}
                    title="Copiar link"
                    aria-label={`Copiar link do orçamento de ${o.cliente_nome}`}
                    className="p-2 rounded-lg text-zinc-400 hover:text-blue-400 hover:bg-zinc-800/50 transition"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => usarComoModelo(o)}
                    title="Usar como modelo para outro cliente"
                    aria-label={`Usar orçamento de ${o.cliente_nome} como modelo`}
                    className="p-2 rounded-lg text-zinc-400 hover:text-blue-400 hover:bg-zinc-800/50 transition"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setParaExcluir(o)}
                    title="Excluir"
                    aria-label={`Excluir orçamento de ${o.cliente_nome}`}
                    className="p-2 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800/50 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {paraExcluir && (
        <ModalConfirmacao
          titulo="Excluir orçamento?"
          mensagem={
            <>
              O orçamento de <strong className="text-zinc-200">{paraExcluir.cliente_nome}</strong> ({paraExcluir.titulo}, {resumoValor(paraExcluir)})
              será apagado e o link enviado ao cliente para de funcionar.
            </>
          }
          rotuloConfirmar="Excluir"
          carregando={excluindo}
          onConfirmar={confirmarExclusao}
          onCancelar={() => setParaExcluir(null)}
        />
      )}
    </PaginaCadastro>
  );
};
