import React, { useEffect, useMemo, useState } from 'react';
import {
  EVENTO_LOJAS_ATUALIZADAS,
  type Loja,
  type LojaInput,
  TabelaAusenteError,
  enderecoCompletoLoja,
  excluirLoja,
  listarLojas,
  salvarLoja,
} from '../../services/cadastros';
import { obterConfiguracoesLojaSincrono, salvarConfiguracoesLoja } from '../../services/api';
import {
  AcoesLinha,
  AvisoTabelaAusente,
  Badge,
  Campo,
  CardFormulario,
  Carregando,
  FiltroSegmentado,
  ListaCadastro,
  ModalConfirmacao,
  ModalDetalhes,
  PaginaCadastro,
  Secao,
  TabelaCadastro,
  Toggle,
  inputCls,
  rolarParaFormulario,
  useFeedback,
} from '../../components/cadastros/ui';
import {
  buscarEnderecoPorCep,
  formatarDataHora,
  mascaraCep,
  mascaraCnpj,
  mascaraTelefone,
  somenteDigitos,
  validarCnpj,
  validarEmail,
  validarTelefone,
} from '../../utils/formatadores';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const FORM_VAZIO = {
  nome: '', cnpj: '', telefone: '', email: '',
  cep: '', logradouro: '', numero: '', bairro: '', cidade: '', uf: '',
  principal: false, ativo: true,
};
type FormLoja = typeof FORM_VAZIO;
type Erros = Partial<Record<keyof FormLoja, string>>;

function validar(f: FormLoja): Erros {
  const e: Erros = {};
  if (f.nome.trim().length < 2) e.nome = 'Informe o nome da loja.';
  if (f.cnpj.trim() && !validarCnpj(f.cnpj)) e.cnpj = 'CNPJ inválido.';
  if (f.telefone.trim() && !validarTelefone(f.telefone)) e.telefone = 'Telefone inválido.';
  if (f.email.trim() && !validarEmail(f.email)) e.email = 'E-mail inválido.';
  if (f.cep.trim() && somenteDigitos(f.cep).length !== 8) e.cep = 'CEP deve ter 8 dígitos.';
  if (f.principal && !f.ativo) e.ativo = 'A loja principal precisa estar ativa.';
  return e;
}

const enderecoResumido = (l: Pick<Loja, 'logradouro' | 'numero' | 'bairro' | 'cidade' | 'uf'>) =>
  [
    [l.logradouro, l.numero].filter(Boolean).join(', '),
    l.bairro,
    [l.cidade, l.uf].filter(Boolean).join(' - '),
  ]
    .filter(Boolean)
    .join(' · ');

export const LojasCadastro: React.FC = () => {
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [tabelaAusente, setTabelaAusente] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);

  const [form, setForm] = useState<FormLoja>(FORM_VAZIO);
  const [erros, setErros] = useState<Erros>({});
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todas' | 'ativas' | 'inativas'>('todas');
  const [detalhe, setDetalhe] = useState<Loja | null>(null);
  const [paraExcluir, setParaExcluir] = useState<Loja | null>(null);
  const feedback = useFeedback();

  const carregar = async () => {
    try {
      setLojas(await listarLojas());
      setTabelaAusente(false);
    } catch (e: any) {
      if (e instanceof TabelaAusenteError) setTabelaAusente(true);
      else feedback.erro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const atualizar = <K extends keyof FormLoja>(campo: K, valor: FormLoja[K]) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    if (erros[campo]) setErros((e) => ({ ...e, [campo]: undefined }));
  };

  const preencherPorCep = async () => {
    if (somenteDigitos(form.cep).length !== 8) return;
    setBuscandoCep(true);
    const end = await buscarEnderecoPorCep(form.cep);
    setBuscandoCep(false);
    if (end) {
      setForm((f) => ({
        ...f,
        logradouro: end.logradouro || f.logradouro,
        bairro: end.bairro || f.bairro,
        cidade: end.cidade || f.cidade,
        uf: end.uf || f.uf,
      }));
    } else {
      setErros((e) => ({ ...e, cep: 'CEP não encontrado. Preencha o endereço manualmente.' }));
    }
  };

  const limpar = () => {
    setForm({ ...FORM_VAZIO, principal: lojas.length === 0 });
    setErros({});
    setEditandoId(null);
  };

  // Primeira loja da conta: já nasce como principal e vem preenchida com os dados que estavam
  // em Configurações › Dados da loja (aba removida), para não precisar redigitar
  useEffect(() => {
    if (editandoId || carregando || lojas.length > 0) return;
    const cfg = obterConfiguracoesLojaSincrono();
    setForm((f) => ({
      ...f,
      principal: true,
      nome: f.nome || cfg.nomeLoja || '',
      cnpj: f.cnpj || (somenteDigitos(cfg.cnpj || '').length === 14 ? mascaraCnpj(cfg.cnpj) : ''),
      telefone: f.telefone || (cfg.telefone ? mascaraTelefone(cfg.telefone) : ''),
    }));
  }, [carregando, lojas.length, editandoId]);

  const iniciarEdicao = (l: Loja) => {
    setForm({
      nome: l.nome,
      cnpj: mascaraCnpj(l.cnpj || ''),
      telefone: mascaraTelefone(l.telefone || ''),
      email: l.email || '',
      cep: mascaraCep(l.cep || ''),
      logradouro: l.logradouro || '',
      numero: l.numero || '',
      bairro: l.bairro || '',
      cidade: l.cidade || '',
      uf: l.uf || '',
      principal: l.principal,
      ativo: l.ativo,
    });
    setErros({});
    setEditandoId(l.id_loja);
    setDetalhe(null);
    rolarParaFormulario();
  };

  const salvar = async () => {
    const e = validar(form);
    setErros(e);
    if (Object.keys(e).length > 0) return;

    const opc = (v: string) => (v.trim() ? v.trim() : null);
    const dados: LojaInput = {
      nome: form.nome.trim(),
      cnpj: somenteDigitos(form.cnpj) ? form.cnpj : null,
      telefone: opc(form.telefone),
      email: opc(form.email),
      cep: opc(form.cep),
      logradouro: opc(form.logradouro),
      numero: opc(form.numero),
      bairro: opc(form.bairro),
      cidade: opc(form.cidade),
      uf: form.uf || null,
      principal: form.principal,
      ativo: form.ativo,
    };

    setSalvando(true);
    try {
      await salvarLoja(dados, editandoId || undefined);

      // A loja principal é a identidade impressa nos documentos (comprovante de entrada e certidão de garantia)
      let avisoImpressao = '';
      if (dados.principal) {
        try {
          await salvarConfiguracoesLoja({
            nomeLoja: dados.nome,
            cnpj: dados.cnpj || '',
            telefone: dados.telefone || '',
            endereco: enderecoCompletoLoja(dados),
          });
          avisoImpressao = ' Os documentos impressos passam a usar estes dados.';
        } catch {
          avisoImpressao = ' Atenção: não foi possível atualizar os dados dos documentos impressos.';
        }
      }
      window.dispatchEvent(new Event(EVENTO_LOJAS_ATUALIZADAS));
      feedback.sucesso((editandoId ? 'Loja atualizada.' : 'Loja cadastrada.') + avisoImpressao);
      setEditandoId(null);
      setErros({});
      setForm(FORM_VAZIO);
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
      await excluirLoja(paraExcluir.id_loja);
      window.dispatchEvent(new Event(EVENTO_LOJAS_ATUALIZADAS));
      if (editandoId === paraExcluir.id_loja) limpar();
      feedback.sucesso('Loja excluída.');
      setParaExcluir(null);
      await carregar();
    } catch (err: any) {
      feedback.erro(err.message);
      setParaExcluir(null);
    } finally {
      setExcluindo(false);
    }
  };

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lojas.filter((l) => {
      if (filtro === 'ativas' && !l.ativo) return false;
      if (filtro === 'inativas' && l.ativo) return false;
      if (!q) return true;
      return [l.nome, l.cidade, l.bairro, l.cnpj, l.telefone].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [lojas, busca, filtro]);

  // Loja principal não pode ser excluída enquanto houver outras: defina outra como principal antes
  const bloqueioExclusao = (l: Loja) => l.principal && lojas.length > 1;

  if (tabelaAusente) {
    return (
      <PaginaCadastro titulo="Lojas" descricao="Cadastre e gerencie as unidades da sua rede.">
        <AvisoTabelaAusente modulo="Lojas" />
      </PaginaCadastro>
    );
  }

  return (
    <PaginaCadastro titulo="Lojas" descricao="Cadastre e gerencie as unidades da sua rede. A loja principal é usada como padrão.">
      <feedback.Feedback />

      <CardFormulario
        titulo={editandoId ? 'Editar loja' : 'Nova loja'}
        subtitulo={editandoId ? `Alterando os dados de ${form.nome || 'loja'}.` : 'Identificação, contato e endereço da unidade.'}
        editando={!!editandoId}
        salvando={salvando}
        rotuloSalvar={editandoId ? 'Salvar alterações' : '+ Cadastrar loja'}
        onSubmit={salvar}
        onLimpar={limpar}
      >
        <Secao titulo="Identificação">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <Campo label="Nome da loja" obrigatorio erro={erros.nome} className="md:col-span-5">
              <input value={form.nome} onChange={(e) => atualizar('nome', e.target.value)} name="nome-loja" autoComplete="organization" placeholder="Ex: Montec Centro" className={inputCls(erros.nome)} />
            </Campo>
            <Campo label="CNPJ" erro={erros.cnpj} className="md:col-span-3">
              <input value={form.cnpj} onChange={(e) => atualizar('cnpj', mascaraCnpj(e.target.value))} name="cnpj" autoComplete="off" inputMode="numeric" placeholder="00.000.000/0000-00" className={inputCls(erros.cnpj)} />
            </Campo>
            <Campo label="Telefone" erro={erros.telefone} className="md:col-span-2">
              <input value={form.telefone} onChange={(e) => atualizar('telefone', mascaraTelefone(e.target.value))} name="telefone-loja" autoComplete="work tel" inputMode="tel" placeholder="(85) 3333-3333" className={inputCls(erros.telefone)} />
            </Campo>
            <Campo label="E-mail" erro={erros.email} className="md:col-span-2">
              <input type="email" value={form.email} onChange={(e) => atualizar('email', e.target.value)} name="email-loja" autoComplete="work email" placeholder="loja@email.com" className={inputCls(erros.email)} />
            </Campo>
          </div>
        </Secao>

        <Secao titulo="Endereço">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <Campo label="CEP" erro={erros.cep} dica={buscandoCep ? 'Buscando endereço...' : 'Preenche o endereço automaticamente.'} className="md:col-span-2">
              <input
                value={form.cep}
                onChange={(e) => atualizar('cep', mascaraCep(e.target.value))}
                onBlur={preencherPorCep}
                autoComplete="postal-code"
                inputMode="numeric"
                placeholder="00000-000"
                className={inputCls(erros.cep)}
              />
            </Campo>
            <Campo label="Logradouro" className="md:col-span-5">
              <input value={form.logradouro} onChange={(e) => atualizar('logradouro', e.target.value)} autoComplete="address-line1" placeholder="Rua, avenida..." className={inputCls()} />
            </Campo>
            <Campo label="Número" className="md:col-span-1">
              <input value={form.numero} onChange={(e) => atualizar('numero', e.target.value)} autoComplete="address-line2" placeholder="Nº" className={inputCls()} />
            </Campo>
            <Campo label="Bairro" className="md:col-span-4">
              <input value={form.bairro} onChange={(e) => atualizar('bairro', e.target.value)} autoComplete="address-level3" className={inputCls()} />
            </Campo>
            <Campo label="Cidade" className="md:col-span-5">
              <input value={form.cidade} onChange={(e) => atualizar('cidade', e.target.value)} autoComplete="address-level2" className={inputCls()} />
            </Campo>
            <Campo label="UF" className="md:col-span-2">
              <select value={form.uf} onChange={(e) => atualizar('uf', e.target.value)} autoComplete="address-level1" className={inputCls()}>
                <option value="">—</option>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </Campo>
          </div>
        </Secao>

        <Secao titulo="Status">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Toggle
              checked={form.principal}
              onChange={(v) => atualizar('principal', v)}
              label="Loja principal"
              descricao="Unidade padrão da conta. Só pode existir uma; marcar esta desmarca a atual."
            />
            <div>
              <Toggle
                checked={form.ativo}
                onChange={(v) => atualizar('ativo', v)}
                label="Loja ativa"
                descricao="Lojas inativas não aparecem para seleção nas operações."
              />
              {erros.ativo && <p className="text-[11px] text-red-400 font-semibold mt-1">{erros.ativo}</p>}
            </div>
          </div>
        </Secao>
      </CardFormulario>

      {carregando ? (
        <Carregando />
      ) : (
        <ListaCadastro
          titulo="Lojas cadastradas"
          total={filtradas.length}
          busca={busca}
          onBusca={setBusca}
          placeholderBusca="Buscar por nome, cidade, CNPJ..."
          filtros={
            <FiltroSegmentado
              valor={filtro}
              onChange={setFiltro}
              opcoes={[
                { valor: 'todas', label: 'Todas' },
                { valor: 'ativas', label: 'Ativas' },
                { valor: 'inativas', label: 'Inativas' },
              ]}
            />
          }
        >
          <TabelaCadastro
            colunas={['Loja', 'Endereço', 'Contato', 'Status', 'Ações']}
            vazio={filtradas.length === 0}
            mensagemVazio={lojas.length === 0 ? 'Nenhuma loja cadastrada. Cadastre a sua primeira unidade acima.' : 'Nenhuma loja encontrada com esses filtros.'}
          >
            {filtradas.map((l) => (
              <tr key={l.id_loja} className={`hover:bg-zinc-800/20 transition ${editandoId === l.id_loja ? 'bg-blue-500/5' : ''}`}>
                <td className="px-4 sm:px-5 py-3">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-white">{l.nome}</p>
                    {l.principal && <Badge cor="azul">Principal</Badge>}
                  </div>
                  {l.cnpj && <p className="text-[11px] text-zinc-500 mt-0.5">{mascaraCnpj(l.cnpj)}</p>}
                </td>
                <td className="px-4 sm:px-5 py-3 text-zinc-300 max-w-xs">
                  {enderecoResumido(l) || <span className="text-zinc-500">Não informado</span>}
                </td>
                <td className="px-4 sm:px-5 py-3 text-zinc-300 whitespace-nowrap">
                  {l.telefone ? mascaraTelefone(l.telefone) : <span className="text-zinc-500">—</span>}
                </td>
                <td className="px-4 sm:px-5 py-3">
                  {l.ativo ? <Badge cor="verde">Ativa</Badge> : <Badge cor="cinza">Inativa</Badge>}
                </td>
                <td className="px-4 sm:px-5 py-2">
                  <AcoesLinha onVer={() => setDetalhe(l)} onEditar={() => iniciarEdicao(l)} onExcluir={() => setParaExcluir(l)} />
                </td>
              </tr>
            ))}
          </TabelaCadastro>
        </ListaCadastro>
      )}

      {detalhe && (
        <ModalDetalhes
          titulo={detalhe.nome}
          subtitulo={
            <div className="flex gap-1.5">
              {detalhe.principal && <Badge cor="azul">Principal</Badge>}
              {detalhe.ativo ? <Badge cor="verde">Ativa</Badge> : <Badge cor="cinza">Inativa</Badge>}
            </div>
          }
          itens={[
            ['CNPJ', detalhe.cnpj ? mascaraCnpj(detalhe.cnpj) : ''],
            ['Telefone', detalhe.telefone ? mascaraTelefone(detalhe.telefone) : ''],
            ['E-mail', detalhe.email || ''],
            ['CEP', detalhe.cep ? mascaraCep(detalhe.cep) : ''],
            ['Endereço', enderecoResumido(detalhe)],
            ['Cadastrada em', formatarDataHora(detalhe.created_at)],
          ]}
          onFechar={() => setDetalhe(null)}
          onEditar={() => iniciarEdicao(detalhe)}
        />
      )}

      {paraExcluir && (
        <ModalConfirmacao
          titulo="Excluir loja"
          mensagem={
            bloqueioExclusao(paraExcluir) ? (
              <>
                <strong className="text-zinc-200">{paraExcluir.nome}</strong> é a loja principal. Defina outra loja como
                principal antes de excluí-la.
              </>
            ) : (
              <>
                Excluir <strong className="text-zinc-200">{paraExcluir.nome}</strong> também remove os vínculos de
                funcionários com ela e as formas de pagamento exclusivas desta loja. Esta ação não pode ser desfeita.
              </>
            )
          }
          rotuloConfirmar={bloqueioExclusao(paraExcluir) ? 'Entendi' : 'Excluir loja'}
          carregando={excluindo}
          onConfirmar={bloqueioExclusao(paraExcluir) ? () => setParaExcluir(null) : confirmarExclusao}
          onCancelar={() => setParaExcluir(null)}
        />
      )}
    </PaginaCadastro>
  );
};
