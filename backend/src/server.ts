import express, { type Request, type Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

declare const process: any;

const app = express();
app.use(cors());
app.use(express.json());

// Configuração só por variáveis de ambiente (backend/.env, fora do git)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  throw new Error("Defina SUPABASE_URL e SUPABASE_ANON_KEY no arquivo backend/.env");
}

// Cliente sem login: usado apenas nas rotas de autenticação
const supabaseAnon = createClient(supabaseUrl, supabaseKey);

/**
 * Rotas de dados exigem login: o cabeçalho "Authorization: Bearer <token do Supabase>" é validado
 * e as consultas rodam com o acesso do próprio usuário (as regras do banco valem também aqui).
 */
app.use("/v1", async (req: Request, res: Response, next: () => void) => {
  if (req.path.startsWith("/auth/")) return next();
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ sucesso: false, erro: "Login necessário." });
  const { data, error } = await supabaseAnon.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ sucesso: false, erro: "Sessão inválida ou expirada." });
  res.locals.supabase = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  next();
});

/** Cliente do Supabase da requisição (com o login de quem chamou). */
const sb = (res: Response) => res.locals.supabase as any;

app.get("/v1/cadastros/servicos", async (_req: Request, res: Response) => {
  try {
    const { data, error } = await sb(res).from("cad_servicos").select("*").order("nome", { ascending: true });
    if (error) throw error;
    return res.json({ sucesso: true, data });
  } catch (err: any) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.post("/v1/cadastros/servicos", async (req: Request, res: Response) => {
  try {
    const { nome, precoSugerido } = req.body;
    const { data, error } = await sb(res).from("cad_servicos").insert([
      { nome, preco_sugerido: Number(precoSugerido) || 0 }
    ]).select();
    if (error) throw error;
    return res.status(201).json({ sucesso: true, data: data[0] });
  } catch (err: any) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.get("/v1/cadastros/fornecedores", async (_req: Request, res: Response) => {
  try {
    const { data, error } = await sb(res).from("cad_fornecedores").select("*").order("nome", { ascending: true });
    if (error) throw error;
    return res.json({ sucesso: true, data });
  } catch (err: any) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.post("/v1/cadastros/fornecedores", async (req: Request, res: Response) => {
  try {
    const { nome, contato } = req.body;
    const { data, error } = await sb(res).from("cad_fornecedores").insert([
      { nome, contato: contato || "" }
    ]).select();
    if (error) throw error;
    return res.status(201).json({ sucesso: true, data: data[0] });
  } catch (err: any) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.post("/v1/orcamentos/calcular", async (req: Request, res: Response) => {
  try {
    const { itens, descontoGeral } = req.body;
    let subtotalServicos = 0;
    let totalCustoPecas = 0;
    let totalFrete = 0;
    const itensCalculados = [];

    if (Array.isArray(itens)) {
      for (const item of itens) {
        const { custoPeca = 0, freteReal = 0, precoFixo = 100 } = item;
        const subtotalItem = Number(precoFixo) || (Number(custoPeca) * 2 + Number(freteReal));

        totalCustoPecas += Number(custoPeca);
        totalFrete += Number(freteReal);
        subtotalServicos += subtotalItem;

        itensCalculados.push({
          subtotalItem,
          lucroEstimadoItem: subtotalItem - (Number(custoPeca) + Number(freteReal)),
        });
      }
    }

    const valorDescontoInformado = Number(descontoGeral?.valor) || 0;
    const tipoDesconto = descontoGeral?.tipo === 'PERCENTUAL' ? 'PERCENTUAL' : 'VALOR';

    let valorDescontoCalculado = 0;
    if (tipoDesconto === 'PERCENTUAL') {
      valorDescontoCalculado = (subtotalServicos * valorDescontoInformado) / 100;
    } else {
      valorDescontoCalculado = valorDescontoInformado;
    }

    const valorTotalOrcamento = Math.max(0, subtotalServicos - valorDescontoCalculado);
    const lucroTotalEstimado = valorTotalOrcamento - (totalCustoPecas + totalFrete);

    return res.json({
      sucesso: true,
      data: {
        itensCalculados,
        resumoFinanceiro: {
          subtotalServicos,
          tipoDesconto,
          descontoGeralAplicado: valorDescontoCalculado,
          valorTotalOrcamento,
          lucroTotalEstimadoInterno: lucroTotalEstimado,
        },
      },
    });
  } catch (err: any) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.post("/v1/ordens-servico/:id/garantia", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const dadosGarantia = req.body;

    const pecaGarantia = Number(dadosGarantia?.custoPecaGarantia || dadosGarantia?.custo_peca_garantia || 0);
    const freteGarantia = Number(dadosGarantia?.freteGarantia || dadosGarantia?.frete_garantia || 0);
    const totalRetorno = pecaGarantia + freteGarantia;

    // 1. Busca a OS atual
    const { data: osAtual, error: errBusca } = await sb(res)
      .from("ordens_servico")
      .select("garantia_json, custo_peca_garantia")
      .eq("id_os", id)
      .single();

    if (errBusca) throw errBusca;

    let listaGarantias: any[] = [];
    let garantiaRaw = osAtual?.garantia_json;

    if (typeof garantiaRaw === 'string') {
      try { garantiaRaw = JSON.parse(garantiaRaw); } catch (e) { garantiaRaw = null; }
    }

    if (Array.isArray(garantiaRaw)) {
      listaGarantias = garantiaRaw;
    } else if (garantiaRaw && typeof garantiaRaw === 'object' && garantiaRaw.listaRetornos) {
      listaGarantias = garantiaRaw.listaRetornos;
    } else if (garantiaRaw) {
      listaGarantias = [garantiaRaw];
    }

    listaGarantias.push(dadosGarantia);

    // Soma o acumulado de todas as garantias desta OS
    let custoTotalGarantiaOS = 0;
    listaGarantias.forEach((g: any) => {
      const p = Number(g?.custoPecaGarantia ?? g?.custo_peca_garantia ?? 0);
      const f = Number(g?.freteGarantia ?? g?.frete_garantia ?? 0);
      custoTotalGarantiaOS += (p + f);
    });

    const objetoGarantiaSalvar = {
      listaRetornos: listaGarantias,
      custoTotalGarantia: custoTotalGarantiaOS,
      custoPecaGarantia: custoTotalGarantiaOS,
    };

    // 2. Grava na base de dados atualizando o JSON e a coluna numérica direta (se existir)
    const dadosUpdate: any = {
      garantia_json: objetoGarantiaSalvar,
      custo_peca_garantia: custoTotalGarantiaOS // Grava direto na coluna física para segurança total
    };

    const { data, error: errUpdate } = await sb(res)
      .from("ordens_servico")
      .update(dadosUpdate)
      .eq("id_os", id)
      .select();

    if (errUpdate) throw errUpdate;

    return res.json({ sucesso: true, mensagem: "Garantia registrada com sucesso!", data: data[0] });
  } catch (err: any) {
    console.error("Erro ao salvar garantia:", err.message);
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.put("/v1/ordens-servico/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      cliente,
      aparelho,
      status_os,
      defeitoRelatado,
      diagnostico,
      servicoRealizado,
      pecasUtilizadas,
      observacoes,
      forma_pagamento,
      parcelas,
      valor_liquido,
      dataAbertura,
      data_conclusao,
      checklistEntrada,
      orcamentoCalculado,
    } = req.body;

    const numPeca = Number(orcamentoCalculado?.custoPeca) || 0;
    const numFrete = Number(orcamentoCalculado?.freteReal) || 0;
    const custoGarantiaPreservado = Number(orcamentoCalculado?.custoPecaGarantia || 0);
    const desconto = Number(orcamentoCalculado?.descontoGeralAplicado) || 0;
    const valorTotal = Number(orcamentoCalculado?.valorTotalOrcamento) || 0;
    const subtotal = Number(orcamentoCalculado?.subtotalServicos) || valorTotal;
    const numValorLiquido = valor_liquido !== undefined && valor_liquido !== null ? Number(valor_liquido) : valorTotal;
    
    // Lucro real desconta peças, frete e também a garantia existente para não zerar ao editar
    const lucroReal = numValorLiquido - (numPeca + numFrete + custoGarantiaPreservado);

    const dadosAtualizados: any = {
      cliente_nome: cliente?.nome,
      cliente_whatsapp: cliente?.whatsapp,
      cliente_cpf_cnpj: cliente?.cpfCnpj,
      aparelho_modelo: aparelho?.modelo,
      status_os: status_os,
      defeito_relatado: defeitoRelatado,
      diagnostico_tecnico: diagnostico,
      servico_realizado: servicoRealizado,
      pecas_utilizadas: pecasUtilizadas,
      observacoes_internas: observacoes,
      forma_pagamento: forma_pagamento,
      parcelas: Number(parcelas) || 1,
      valor_liquido: numValorLiquido,
      subtotal_servicos: subtotal,
      desconto_valor: desconto,
      valor_total: valorTotal,
      lucro_estimado_total: lucroReal,
      custo_peca: numPeca,
      frete_real: numFrete,
      fornecedor_peca: orcamentoCalculado?.fornecedorPeca || null,
      checklist_entrada: checklistEntrada || null,
    };

    if (dataAbertura) dadosAtualizados.data_abertura = dataAbertura;
    if (data_conclusao) dadosAtualizados.data_conclusao = data_conclusao;

    const { data, error } = await sb(res)
      .from("ordens_servico")
      .update(dadosAtualizados)
      .eq("id_os", id)
      .select();

    if (error) throw error;

    return res.json({ sucesso: true, data: data[0] });
  } catch (err: any) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.get("/v1/ordens-servico", async (_req: Request, res: Response) => {
  try {
    const { data, error } = await sb(res)
      .from("ordens_servico")
      .select("*")
      .order("data_abertura", { ascending: false });

    if (error) throw error;

    const ordensFormatadas = data.map((row: any) => {
      let garantiaRaw = row.garantia_json;
      if (typeof garantiaRaw === 'string') {
        try { garantiaRaw = JSON.parse(garantiaRaw); } catch (e) { garantiaRaw = null; }
      }

      let garantiaList: any[] = [];
      if (Array.isArray(garantiaRaw)) {
        garantiaList = garantiaRaw;
      } else if (garantiaRaw && typeof garantiaRaw === 'object') {
        if (Array.isArray(garantiaRaw.listaRetornos)) {
          garantiaList = garantiaRaw.listaRetornos;
        } else {
          garantiaList = [garantiaRaw];
        }
      }

      // SOMA ROBUSTA DE QUALQUER CAMPO DE CUSTO NO JSON OU COLUNA
      let totalGarantiaOS = Number(row.custo_peca_garantia || 0);

      garantiaList.forEach((g: any) => {
        const peca = Number(
          g?.custoPecaGarantia ?? 
          g?.custo_peca_garantia ?? 
          g?.custoPeca ?? 
          g?.custo ?? 
          g?.valor ?? 
          0
        );
        const frete = Number(
          g?.freteGarantia ?? 
          g?.frete_garantia ?? 
          g?.freteReal ?? 
          g?.frete ?? 
          0
        );
        totalGarantiaOS += (peca + frete);
      });

      const valorBruto = Number(row.valor_total || 0);
      const valorLiq = Number(row.valor_liquido || valorBruto);
      const pecaBase = Number(row.custo_peca || 0);
      const freteBase = Number(row.frete_real || 0);

      // LUCRO REAL LÍQUIDO = VALOR LÍQUIDO - (PEÇA + FRETE + GARANTIA)
      const lucroLiquidoReal = valorLiq - (pecaBase + freteBase + totalGarantiaOS);

      return {
        id_os: row.id_os,
        numero_os: row.numero_os,
        status_os: row.status_os || "AGUARDANDO_AVALIACAO",
        defeitoRelatado: row.defeito_relatado || "",
        diagnostico: row.diagnostico_tecnico || "",
        servicoRealizado: row.servico_realizado || "",
        pecasUtilizadas: row.pecas_utilizadas || "",
        observacoes: row.observacoes_internas || "",
        data_abertura: row.data_abertura,
        data_conclusao: row.data_conclusao,
        formaPagamento: row.forma_pagamento || "PIX",
        parcelas: Number(row.parcelas || 1),
        valorLiquido: valorLiq,
        checklistEntrada: row.checklist_entrada || {},
        garantia: garantiaList.length > 0 || totalGarantiaOS > 0 ? {
          listaRetornos: garantiaList,
          custoTotalGarantia: totalGarantiaOS,
          custoPecaGarantia: totalGarantiaOS,
          totalVoltas: garantiaList.length || 1
        } : null,
        possuiGarantiaRegistrada: garantiaList.length > 0 || totalGarantiaOS > 0,
        cliente: {
          nome: row.cliente_nome || "Cliente",
          whatsapp: row.cliente_whatsapp || "",
          cpfCnpj: row.cliente_cpf_cnpj || "",
        },
        aparelho: {
          modelo: row.aparelho_modelo || "Não especificado",
          imei1: "",
          senhaDesbloqueio: "",
        },
        orcamentoCalculado: {
          subtotalServicos: Number(row.subtotal_servicos || valorBruto),
          tipoDesconto: row.tipo_desconto || 'VALOR',
          descontoGeralAplicado: Number(row.desconto_valor || 0),
          valorTotalOrcamento: valorBruto,
          lucroTotalEstimadoInterno: lucroLiquidoReal,
          custoPeca: pecaBase,
          freteReal: freteBase,
          fornecedorPeca: row.fornecedor_peca || "",
          custoPecaGarantia: totalGarantiaOS,
        },
      };
    });

    return res.json({ sucesso: true, data: ordensFormatadas });
  } catch (err: any) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

app.delete("/v1/ordens-servico/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await sb(res).from("ordens_servico").delete().eq("id_os", id);
    if (error) throw error;
    return res.json({ sucesso: true, mensagem: "Ordem de Serviço excluída com sucesso!" });
  } catch (err: any) {
    return res.status(500).json({ sucesso: false, erro: err.message });
  }
});

// Cole aqui as rotas de auth:
app.post("/v1/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return res.json({ sucesso: true, data });
  } catch (err: any) {
    return res.status(401).json({ sucesso: false, erro: err.message });
  }
});

app.post("/v1/auth/registro", async (req: Request, res: Response) => {
  try {
    const { email, password, nomeResponsavel, nomeAssistencia, whatsapp, cpfCnpj } = req.body;
    const { data, error } = await supabaseAnon.auth.signUp({
      email,
      password,
      options: {
        data: {
          nome_responsavel: nomeResponsavel,
          nome_assistencia: nomeAssistencia,
          whatsapp,
          cpf_cnpj: cpfCnpj || null,
        },
      },
    });
    if (error) throw error;
    return res.status(201).json({ sucesso: true, data });
  } catch (err: any) {
    return res.status(400).json({ sucesso: false, erro: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend conectado ao Supabase rodando na porta ${PORT}`);
});