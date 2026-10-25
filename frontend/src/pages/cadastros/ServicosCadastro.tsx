import React, { useEffect, useMemo, useState } from 'react';
import {
  type Servico,
  avisoColunasIgnoradas,
  excluirServico,
  listarServicos,
  parseMoedaBR,
  salvarServico,
} from '../../services/cadastros';
import { extrairDiasGarantia, obterPrazoGarantiaConfiguradoLoja } from '../../services/api';
import { GARANTIA_LEGAL_DIAS } from '../../utils/conformidade';
import {
  AcoesLinha,
  Badge,
  Campo,
  CardFormulario,
  Carregando,
  FiltroSegmentado,
  ListaCadastro,
  ModalConfirmacao,
  ModalDetalhes,
  PaginaCadastro,
  TabelaCadastro,
  inputCls,
  rolarParaFormulario,
  useFeedback,
} from '../../components/cadastros/ui';
import { formatarMoeda } from '../../utils/formatadores';

// Valores gravados em garantia_padrao (texto lido por extrairDiasGarantia). '' = usa o prazo padrão da loja.
// "Sem garantia" significa só a garantia legal: ela não pode ser excluída nem reduzida (CDC, arts. 24 e 26, II).
const OPCOES_GARANTIA = ['', 'Sem garantia', '90 dias', '120 dias', '180 dias', '1 ano'];
const ROTULO_SO_LEGAL = `Só garantia legal (${GARANTIA_LEGAL_DIAS} dias)`;
const PERSONALIZADO = '__personalizado__';
const SUGESTOES_TEMPO = ['30 minutos', '1 hora', '2 horas', '4 horas', '1 dia', '2 dias', '3 a 5 dias'];

const FORM_VAZIO = { nome: '', preco: '', tempo_estimado: '', garantia: '', garantiaDias: '', descricao: '' };
type FormServico = typeof FORM_VAZIO;
type Erros = Partial<Record<keyof FormServico, string>>;

const formatarPrecoInput = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const ServicosCadastro: React.FC = () => {
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const [form, setForm] = useState<FormServico>(FORM_VAZIO);
  const [erros, setErros] = useState<Erros>({});
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'com-garantia' | 'sem-garantia'>('todos');
  const [detalhe, setDetalhe] = useState<Servico | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Servico | null>(null);
  const feedback = useFeedback();

  const prazoLoja = obterPrazoGarantiaConfiguradoLoja();

  const carregar = async () => {
    try {
      setServicos(await listarServicos());
    } catch (e: any) {
      feedback.erro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  /** Dias efetivos de garantia: null no cadastro = prazo padrão da loja. */
  const diasGarantia = (g: string | null) => (g ? extrairDiasGarantia(g) ?? prazoLoja : prazoLoja);

  // Prazos abaixo de 90 dias (cadastros antigos) valem como a garantia legal
  const soGarantiaLegal = (g: string) => {
    const dias = extrairDiasGarantia(g);
    return dias !== null && dias < GARANTIA_LEGAL_DIAS;
  };

  const rotuloGarantia = (g: string | null) => {
    if (!g) return `Padrão da loja (${prazoLoja} dias)`;
    return soGarantiaLegal(g) ? ROTULO_SO_LEGAL : g;
  };

  const badgeGarantia = (g: string | null) => {
    if (!g) return <Badge cor="azul">Padrão ({prazoLoja} dias)</Badge>;
    if (soGarantiaLegal(g)) return <Badge cor="cinza">{ROTULO_SO_LEGAL}</Badge>;
    return <Badge cor="verde">{g}</Badge>;
  };

  const atualizar = (campo: keyof FormServico, valor: string) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    if (erros[campo]) setErros((e) => ({ ...e, [campo]: undefined }));
  };

  const limpar = () => {
    setForm(FORM_VAZIO);
    setErros({});
    setEditandoId(null);
  };

  const iniciarEdicao = (s: Servico) => {
    // Converte o texto salvo para a opção do select. Valores fora da lista (ex.: "45 dias") viram "Personalizado".
    const g = s.garantia_padrao || '';
    let garantia = '';
    let garantiaDias = '';
    if (OPCOES_GARANTIA.includes(g)) {
      garantia = g;
    } else {
      const dias = extrairDiasGarantia(g);
      if (dias === 0) garantia = 'Sem garantia';
      else if (dias !== null) {
        garantia = PERSONALIZADO;
        garantiaDias = String(dias);
      } // null (texto não reconhecido) => padrão da loja
    }
    setForm({
      nome: s.nome,
      preco: formatarPrecoInput(s.preco_sugerido),
      tempo_estimado: s.tempo_estimado || '',
      garantia,
      garantiaDias,
      descricao: s.descricao || '',
    });
    setErros({});
    setEditandoId(s.id_servico);
    setDetalhe(null);
    rolarParaFormulario();
  };

  const validar = (): Erros => {
    const e: Erros = {};
    const nome = form.nome.trim();
    if (nome.length < 2) e.nome = 'Informe o nome do serviço.';
    else if (servicos.some((s) => s.id_servico !== editandoId && s.nome.trim().toLowerCase() === nome.toLowerCase())) {
      // A Nova OS identifica o serviço pelo nome: nomes repetidos confundiriam a garantia aplicada
      e.nome = 'Já existe um serviço com este nome.';
    }
    const preco = parseMoedaBR(form.preco);
    if (preco === null) e.preco = 'Informe um valor válido. Ex: 150,00';
    if (form.garantia === PERSONALIZADO) {
      const dias = Number(form.garantiaDias);
      if (!Number.isInteger(dias) || dias < GARANTIA_LEGAL_DIAS || dias > 3650) {
        e.garantiaDias = `Informe de ${GARANTIA_LEGAL_DIAS} a 3650 dias (mínimo da garantia legal).`;
      }
    }
    return e;
  };

  const salvar = async () => {
    const e = validar();
    setErros(e);
    if (Object.keys(e).length > 0) return;

    const garantia = form.garantia === PERSONALIZADO ? `${Number(form.garantiaDias)} dias` : form.garantia || null;

    setSalvando(true);
    try {
      const ignoradas = await salvarServico(
        {
          nome: form.nome,
          preco_sugerido: parseMoedaBR(form.preco) ?? 0,
          tempo_estimado: form.tempo_estimado,
          garantia_padrao: garantia,
          descricao: form.descricao,
        },
        editandoId || undefined
      );
      const msg = (editandoId ? 'Serviço atualizado.' : 'Serviço cadastrado.') + avisoColunasIgnoradas(ignoradas);
      if (ignoradas.length) feedback.erro(msg);
      else feedback.sucesso(msg);
      limpar();
      await carregar();
    } catch (err: any) {
      feedback.erro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!paraExcluir) return;
    setExcluindo(true);
    try {
      await excluirServico(paraExcluir.id_servico);
      if (editandoId === paraExcluir.id_servico) limpar();
      feedback.sucesso('Serviço excluído.');
      setParaExcluir(null);
      await carregar();
    } catch (err: any) {
      feedback.erro(err.message);
      setParaExcluir(null);
    } finally {
      setExcluindo(false);
    }
  };

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return servicos.filter((s) => {
      const dias = diasGarantia(s.garantia_padrao);
      if (filtro === 'com-garantia' && dias < GARANTIA_LEGAL_DIAS) return false;
      if (filtro === 'sem-garantia' && dias >= GARANTIA_LEGAL_DIAS) return false;
      if (!q) return true;
      return [s.nome, s.descricao, s.tempo_estimado].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [servicos, busca, filtro]);

  const precoPreview = parseMoedaBR(form.preco);

  return (
    <PaginaCadastro titulo="Serviços" descricao="Catálogo de serviços com preço sugerido, tempo de execução e garantia. Usado na abertura de OS.">
      <feedback.Feedback />

      <CardFormulario
        titulo={editandoId ? 'Editar serviço' : 'Novo serviço'}
        subtitulo={editandoId ? `Alterando ${form.nome || 'serviço'}.` : 'Preço, execução e garantia aplicados automaticamente na Nova OS.'}
        editando={!!editandoId}
        salvando={salvando}
        rotuloSalvar={editandoId ? 'Salvar alterações' : '+ Cadastrar serviço'}
        onSubmit={salvar}
        onLimpar={limpar}
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <Campo label="Nome do serviço" obrigatorio erro={erros.nome} dica="Aparece na seleção de serviços da Nova OS." className="md:col-span-6">
            <input value={form.nome} onChange={(e) => atualizar('nome', e.target.value)} placeholder="Ex: Troca de tela iPhone 11" className={inputCls(erros.nome)} />
          </Campo>
          <Campo
            label="Preço sugerido"
            obrigatorio
            erro={erros.preco}
            dica={precoPreview !== null && form.preco ? formatarMoeda(precoPreview) : 'Use 0 para valor definido no orçamento.'}
            className="md:col-span-3"
          >
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-500">R$</span>
              <input
                value={form.preco}
                onChange={(e) => atualizar('preco', e.target.value.replace(/[^\d.,]/g, ''))}
                onBlur={() => {
                  const v = parseMoedaBR(form.preco);
                  if (v !== null) atualizar('preco', formatarPrecoInput(v));
                }}
                inputMode="decimal"
                placeholder="0,00"
                className={`${inputCls(erros.preco)} pl-9`}
              />
            </div>
          </Campo>
          <Campo label="Tempo estimado" dica="Prazo médio de execução." className="md:col-span-3">
            <input
              list="sugestoes-tempo"
              value={form.tempo_estimado}
              onChange={(e) => atualizar('tempo_estimado', e.target.value)}
              placeholder="Ex: 2 horas"
              className={inputCls()}
            />
            <datalist id="sugestoes-tempo">
              {SUGESTOES_TEMPO.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Campo>

          <Campo
            label="Garantia do serviço"
            dica={
              form.garantia === 'Sem garantia'
                ? `A OS sai só com a garantia legal de ${GARANTIA_LEGAL_DIAS} dias, que não pode ser excluída (CDC, art. 24).`
                : 'Aplicada automaticamente ao escolher o serviço na Nova OS.'
            }
            className={form.garantia === PERSONALIZADO ? 'md:col-span-4' : 'md:col-span-6'}
          >
            <select value={form.garantia} onChange={(e) => atualizar('garantia', e.target.value)} className={inputCls()}>
              {OPCOES_GARANTIA.map((g) => (
                <option key={g} value={g}>
                  {g === ''
                    ? `Padrão da loja (${prazoLoja} dias)`
                    : g === 'Sem garantia'
                    ? ROTULO_SO_LEGAL
                    : g === '90 dias'
                    ? '90 dias (CDC)'
                    : g}
                </option>
              ))}
              <option value={PERSONALIZADO}>Personalizado...</option>
            </select>
          </Campo>
          {form.garantia === PERSONALIZADO && (
            <Campo label="Dias de garantia" obrigatorio erro={erros.garantiaDias} className="md:col-span-2">
              <input
                type="number"
                min={GARANTIA_LEGAL_DIAS}
                value={form.garantiaDias}
                onChange={(e) => atualizar('garantiaDias', e.target.value)}
                placeholder="45"
                className={inputCls(erros.garantiaDias)}
              />
            </Campo>
          )}
          <Campo label="Descrição" className="md:col-span-6">
            <input
              value={form.descricao}
              onChange={(e) => atualizar('descricao', e.target.value)}
              placeholder="O que está incluso, observações técnicas..."
              className={inputCls()}
            />
          </Campo>
        </div>
      </CardFormulario>

      {carregando ? (
        <Carregando />
      ) : (
        <ListaCadastro
          titulo="Serviços cadastrados"
          total={filtrados.length}
          busca={busca}
          onBusca={setBusca}
          placeholderBusca="Buscar por nome ou descrição..."
          filtros={
            <FiltroSegmentado
              valor={filtro}
              onChange={setFiltro}
              opcoes={[
                { valor: 'todos', label: 'Todos' },
                { valor: 'com-garantia', label: 'Garantia da loja' },
                { valor: 'sem-garantia', label: 'Só garantia legal' },
              ]}
            />
          }
        >
          <TabelaCadastro
            colunas={['Serviço', 'Preço sugerido', 'Tempo estimado', 'Garantia', 'Ações']}
            vazio={filtrados.length === 0}
            mensagemVazio={servicos.length === 0 ? 'Nenhum serviço cadastrado ainda.' : 'Nenhum serviço encontrado com esses filtros.'}
          >
            {filtrados.map((s) => (
              <tr key={s.id_servico} className={`hover:bg-zinc-800/20 transition ${editandoId === s.id_servico ? 'bg-blue-500/5' : ''}`}>
                <td className="px-4 sm:px-5 py-3 max-w-sm">
                  <p className="font-bold text-white">{s.nome}</p>
                  {s.descricao && <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{s.descricao}</p>}
                </td>
                <td className="px-4 sm:px-5 py-3 font-bold text-emerald-400 whitespace-nowrap">
                  {s.preco_sugerido > 0 ? formatarMoeda(s.preco_sugerido) : <span className="text-zinc-500 font-normal">No orçamento</span>}
                </td>
                <td className="px-4 sm:px-5 py-3 text-zinc-300 whitespace-nowrap">
                  {s.tempo_estimado || <span className="text-zinc-500">—</span>}
                </td>
                <td className="px-4 sm:px-5 py-3">{badgeGarantia(s.garantia_padrao)}</td>
                <td className="px-4 sm:px-5 py-2">
                  <AcoesLinha onVer={() => setDetalhe(s)} onEditar={() => iniciarEdicao(s)} onExcluir={() => setParaExcluir(s)} />
                </td>
              </tr>
            ))}
          </TabelaCadastro>
        </ListaCadastro>
      )}

      {detalhe && (
        <ModalDetalhes
          titulo={detalhe.nome}
          subtitulo={<Badge cor="azul">Serviço</Badge>}
          itens={[
            ['Preço sugerido', detalhe.preco_sugerido > 0 ? formatarMoeda(detalhe.preco_sugerido) : 'Definido no orçamento'],
            ['Tempo estimado', detalhe.tempo_estimado || ''],
            ['Garantia', rotuloGarantia(detalhe.garantia_padrao)],
            ['Descrição', detalhe.descricao || ''],
          ]}
          onFechar={() => setDetalhe(null)}
          onEditar={() => iniciarEdicao(detalhe)}
        />
      )}

      {paraExcluir && (
        <ModalConfirmacao
          titulo="Excluir serviço"
          mensagem={
            <>
              Excluir <strong className="text-zinc-200">{paraExcluir.nome}</strong> do catálogo? As ordens de serviço já
              abertas com ele não são alteradas (preço e garantia ficam gravados nelas).
            </>
          }
          rotuloConfirmar="Excluir serviço"
          carregando={excluindo}
          onConfirmar={confirmarExclusao}
          onCancelar={() => setParaExcluir(null)}
        />
      )}
    </PaginaCadastro>
  );
};
