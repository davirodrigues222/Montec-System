// =====================================================================
// Edge Function "assistente"
//
// Assistente de IA do sistema (Google Gemini). Tira dúvidas sobre o BancadaOS e faz tarefas de
// configuração (formas de pagamento, serviços) pedindo ao sistema para executar "ferramentas".
//
// Esta função só conversa com o Gemini: guarda a chave (segredo GEMINI_API_KEY, nunca vai para o
// navegador), o manual do sistema e a lista de ferramentas. Quem executa as ferramentas é o próprio
// sistema no navegador (frontend/src/services/assistente.ts), com o login e as permissões de quem está
// usando, e sempre pedindo confirmação antes de gravar. Por isso esta função não acessa o banco.
//
// Fluxo: o sistema manda a conversa → o Gemini responde com texto ou pede ferramentas → o sistema
// executa e manda os resultados de volta nesta mesma função, até o Gemini responder com texto.
//
// Segredos: GEMINI_API_KEY (obrigatório), GEMINI_MODELO (opcional, padrão gemini-3.6-flash) e
// GEMINI_MODELOS_RESERVA (opcional, usados quando o principal está sobrecarregado).
// Atenção: no plano gratuito do Gemini, o Google pode usar as conversas para melhorar os produtos
// dele. Por isso as ferramentas não enviam dados de clientes nem de ordens de serviço.
// =====================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Só o sistema chama esta função pelo navegador. Para o domínio próprio (ou outro endereço), cadastre
// a lista no segredo ORIGENS_PERMITIDAS, separada por vírgulas.
const ORIGENS_PADRAO = ['https://bancadaos-system.vercel.app', 'http://localhost:5173'];
const ORIGENS = (Deno.env.get('ORIGENS_PERMITIDAS') || ORIGENS_PADRAO.join(','))
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

const cabecalhosCors = (req: Request) => {
  const origem = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGENS.includes(origem) ? origem : ORIGENS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
};

// gemini-3.6-flash como principal: o 3.8-flash (mais novo) vive congestionado no plano gratuito
const MODELO = Deno.env.get('GEMINI_MODELO') || 'gemini-3.6-flash';
// Reservas quando o modelo principal está sobrecarregado (503), lento demais ou sem cota (429). No
// plano gratuito a cota é por modelo, então outro modelo costuma responder. GEMINI_MODELOS_RESERVA troca a lista.
const MODELOS = [
  MODELO,
  ...(Deno.env.get('GEMINI_MODELOS_RESERVA') || 'gemini-3.8-flash,gemini-3.5-flash-lite').split(','),
]
  .map((m) => m.trim())
  .filter((m, i, lista) => m && lista.indexOf(m) === i);
// Erros temporários do Gemini: vale tentar de novo ou passar para o próximo modelo
const ERROS_TEMPORARIOS = [429, 500, 503, 504];
// Tempo máximo de cada chamada ao Gemini e de todas as tentativas juntas (o chat espera até 65 s)
const LIMITE_CHAMADA_MS = 15_000;
const LIMITE_TOTAL_MS = 50_000;
// Limites da conversa enviada (protege a cota gratuita do Gemini contra conversas enormes)
const MAX_MENSAGENS = 60;
const MAX_TAMANHO = 80_000; // caracteres do corpo da requisição

// ---------------------------------------------------------------------------------------------
// Manual do sistema (o que o assistente sabe). Mantenha alinhado com as telas do frontend.
// ---------------------------------------------------------------------------------------------
const MANUAL = `Você é o assistente do BancadaOS, sistema de gestão para assistências técnicas de celulares e eletrônicos.
Responda sempre em português do Brasil, de forma curta e direta, como um colega de balcão que conhece bem o sistema.
Use só as informações deste manual e das ferramentas. Se não souber, diga que não sabe e sugira onde o usuário pode olhar; nunca invente telas, botões ou valores.
Ao explicar um caminho no sistema, use o formato "Menu › Tela" (ex.: Cadastros › Formas de pagamento). Se fizer sentido, ofereça abrir a tela com a ferramenta abrir_tela.

# Telas do sistema (menu lateral; no celular há também a barra inferior com Painel, Financeiro, Nova OS, Ordens e Ajustes; Garantias fica no menu lateral)
- Painel: aparelhos na bancada, prontos para retirada, aguardando peça, faturamento do mês, "Hoje na loja" e a meta mensal.
- Análises e relatórios (Financeiro no celular): faturamento bruto, custos (peças, fretes, garantias), lucro líquido real, ticket médio, receita por semana e exportação em CSV.
- Ordens de serviço: busca por cliente, modelo, IMEI ou número da OS; ver detalhes (dados, checklist e linha do tempo), editar, mudar status, enviar mensagem de WhatsApp ao cliente, imprimir comprovante e excluir.
- Nova ordem: abre uma OS. No celular são 4 etapas: 1) Cliente e garantia, 2) Aparelho, defeito e prazos, 3) Orçamento e pagamento, 4) Checklist e confirmação. No computador tudo fica na mesma tela. O simulador calcula desconto, taxa da maquininha e lucro na hora. Ao concluir, dá para imprimir o comprovante.
- Orçamentos: monta um orçamento rápido (serviço, aparelho, valor, garantia, brinde e formas de pagamento) e manda pelo WhatsApp do cliente com um link; pelo link o cliente autoriza ou não o serviço, e a resposta aparece na lista da tela. Não cria OS.
- Garantias e retornos: registra o retorno de um aparelho dentro do prazo de garantia da OS e lança os custos extras (peça de reposição, frete), que são descontados do lucro.
- Cadastros › Atendimento: Clientes, Serviços (preço sugerido, tempo estimado, garantia padrão) e Fornecedores.
- Cadastros › Empresa: Lojas, Funcionários (cargo, permissões, código de acesso) e Formas de pagamento.
- Configurações: Impressão (identidade nos documentos, horário, formato do papel), Taxas (meta mensal, chave PIX e taxas das maquininhas usadas na Nova OS), Operacional (prazos, prefixo da OS, termos de garantia, itens do checklist), Mensagens de WhatsApp (modelos), Equipe (quem libera telas restritas e o que cada funcionário acessa), Conta (logotipo, tema, senha, exportação dos dados), Plano & Assinatura, Leis e termos de uso (CDC, Código Civil, LGPD).

# Status da OS
Aguardando avaliação, Em análise, Aguardando peça, Em manutenção, Pronto para retirada, Entregue / concluído, Cancelado.
Para Aguardando peça, Em manutenção, Pronto e Entregue o orçamento precisa estar aprovado pelo cliente. Ao marcar Entregue ou Cancelado, a senha do aparelho é apagada (LGPD).

# Garantia
A garantia legal é de 90 dias (CDC) e não pode ser reduzida nem excluída: "Sem garantia" no cadastro de serviço significa só a garantia legal. O prazo padrão da loja fica em Configurações › Operacional e cada serviço pode ter o seu.

# Formas de pagamento
- Ficam em Cadastros › Formas de pagamento. As ativas aparecem na Nova OS, na ordem definida (menor primeiro); as inativas ficam ocultas.
- Tipos: Dinheiro, PIX, Cartão de débito, Cartão de crédito, Boleto, Transferência / TED, Outro. Só crédito, boleto e outro aceitam parcelamento (até 24x).
- Cada forma tem: taxa padrão (%), taxa fixa (R$ por venda), prazo de recebimento (dias), parcelas máximas, parcelas sem juros, se repassa os juros ao cliente, e uma tabela opcional de taxa por parcela (parcela sem taxa própria usa a taxa padrão).
- Toda conta tem as formas nativas Dinheiro, PIX, Cartão de débito e Cartão de crédito.
- Importante: no cartão, a Nova OS usa as taxas da maquininha escolhida (Configurações › Taxas); as taxas de cartão da forma de pagamento ficam como referência. Se o usuário quer mudar o que é descontado no cartão da Nova OS, explique isso.

# Funcionários e permissões
Funcionários são opcionais: o dono entra com o e-mail da conta e tem acesso total. Cada funcionário tem cargo (Administrador, Gerente, Técnico, Atendente) e permissões por tela; telas sem permissão aparecem com cadeado e pedem autorização de um administrador.

# Como agir
- Antes de alterar algo que já existe, consulte com a ferramenta de listagem para pegar o id e os valores atuais. Nunca invente ids.
- Para criar ou alterar, chame a ferramenta direto com os dados: o sistema mostra um resumo e pede a confirmação do usuário antes de gravar. Não peça "posso continuar?" no texto antes de chamar.
- Se faltar um dado essencial (ex.: o tipo da forma de pagamento), pergunte. Valores que o usuário não citar podem ficar com o padrão da ferramenta.
- Se a ferramenta devolver erro ou o usuário cancelar, explique em uma frase e não tente de novo sem o usuário pedir.
- Você não tem acesso a clientes, ordens de serviço nem valores financeiros. Se pedirem, explique como fazer pela tela.`;

// ---------------------------------------------------------------------------------------------
// Ferramentas (executadas pelo navegador: frontend/src/services/assistente.ts, mesmos nomes)
// ---------------------------------------------------------------------------------------------
const TIPOS_FORMA = ['DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'BOLETO', 'TRANSFERENCIA', 'OUTRO'];
const TELAS = [
  'painel', 'nova-os', 'orcamentos', 'ordens', 'garantias', 'relatorios',
  'clientes', 'servicos', 'fornecedores', 'lojas', 'funcionarios', 'formas-pagamento',
  'config-impressao', 'config-taxas', 'config-operacional', 'config-whatsapp', 'config-equipe',
  'config-conta', 'config-assinatura', 'config-leis',
];

const FERRAMENTAS = [
  {
    name: 'abrir_tela',
    description: 'Abre uma tela do sistema para o usuário.',
    parameters: {
      type: 'object',
      properties: { tela: { type: 'string', enum: TELAS } },
      required: ['tela'],
    },
  },
  {
    name: 'listar_formas_pagamento',
    description: 'Lista as formas de pagamento cadastradas, com id, taxas e parcelamento.',
  },
  {
    name: 'salvar_forma_pagamento',
    description:
      'Cria uma forma de pagamento (sem id_forma_pagamento) ou altera uma existente (com id_forma_pagamento; só os campos enviados mudam). ' +
      'Uma forma nova vale para todas as lojas. Para desativar, envie ativo=false. O usuário confirma antes de gravar.',
    parameters: {
      type: 'object',
      properties: {
        id_forma_pagamento: { type: 'string', description: 'Id de uma forma existente (de listar_formas_pagamento). Omita para criar.' },
        nome: { type: 'string' },
        tipo: { type: 'string', enum: TIPOS_FORMA },
        taxa_percentual: { type: 'number', description: 'Taxa padrão em %, de 0 a 100. Padrão 0.' },
        taxa_fixa: { type: 'number', description: 'Valor fixo em R$ por venda. Padrão 0.' },
        prazo_recebimento_dias: { type: 'integer', description: 'Dias até o dinheiro cair, de 0 a 365. Padrão 0.' },
        permite_parcelamento: { type: 'boolean', description: 'Só CARTAO_CREDITO, BOLETO e OUTRO.' },
        parcelas_max: { type: 'integer', description: 'De 1 a 24.' },
        parcelas_sem_juros: { type: 'integer', description: 'Até parcelas_max.' },
        repassar_juros_cliente: { type: 'boolean' },
        ativo: { type: 'boolean' },
        ordem: { type: 'integer', description: 'Posição na Nova OS (menor aparece primeiro).' },
        taxas_por_parcela: {
          type: 'array',
          description: 'Taxa específica por número de parcelas. Substitui a tabela inteira; parcela fora da lista usa a taxa padrão.',
          items: {
            type: 'object',
            properties: { parcelas: { type: 'integer' }, taxa_percentual: { type: 'number' } },
            required: ['parcelas', 'taxa_percentual'],
          },
        },
      },
    },
  },
  {
    name: 'criar_formas_pagamento_padrao',
    description: 'Cria as formas nativas que estiverem faltando (Dinheiro, PIX, Cartão de débito e Cartão de crédito com taxas padrão).',
  },
  {
    name: 'listar_servicos',
    description: 'Lista os serviços cadastrados, com id, preço sugerido, tempo estimado e garantia.',
  },
  {
    name: 'salvar_servico',
    description:
      'Cria um serviço (sem id_servico) ou altera um existente (com id_servico; só os campos enviados mudam). O usuário confirma antes de gravar.',
    parameters: {
      type: 'object',
      properties: {
        id_servico: { type: 'string', description: 'Id de um serviço existente (de listar_servicos). Omita para criar.' },
        nome: { type: 'string' },
        preco_sugerido: { type: 'number', description: 'Em reais.' },
        tempo_estimado: { type: 'string', description: 'Ex.: "1 hora", "2 dias".' },
        garantia_padrao: {
          type: 'string',
          description: 'Vazio = prazo padrão da loja; "Sem garantia" = só a garantia legal de 90 dias; ou um prazo como "90 dias", "180 dias", "1 ano".',
        },
        descricao: { type: 'string' },
      },
    },
  },
];

/** Contexto de quem está usando, enviado pelo sistema (só texto curto, nada de dados de clientes). */
const textoCurto = (v: unknown, max = 80) => String(v ?? '').replace(/[\r\n]+/g, ' ').slice(0, max);

const instrucaoDoSistema = (contexto: Record<string, unknown> | undefined) => {
  const permissoes = Array.isArray(contexto?.permissoes) ? contexto!.permissoes.slice(0, 40).map((p) => textoCurto(p, 40)) : [];
  return `${MANUAL}

# Quem está usando agora
- Nome: ${textoCurto(contexto?.nome) || 'não informado'}
- Cargo: ${textoCurto(contexto?.cargo) || 'não informado'}${contexto?.proprietario ? ' (dono da conta, acesso total)' : ''}
- Telas liberadas: ${permissoes.join(', ') || 'não informado'}
- Tela aberta agora: ${textoCurto(contexto?.tela) || 'não informada'}
- Hoje: ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
};

/** Confere o formato da conversa antes de gastar a cota do Gemini. */
const conversaValida = (contents: unknown): contents is { role: string; parts: unknown[] }[] =>
  Array.isArray(contents) &&
  contents.length > 0 &&
  contents.length <= MAX_MENSAGENS &&
  contents.every(
    (c) => c && (c.role === 'user' || c.role === 'model') && Array.isArray(c.parts) && c.parts.length > 0 && c.parts.length <= 20
  );

Deno.serve(async (req) => {
  const cors = cabecalhosCors(req);
  const resposta = (status: number, corpo: Record<string, unknown>) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resposta(405, { erro: 'Método não permitido.' });

  const chave = Deno.env.get('GEMINI_API_KEY');
  if (!chave) return resposta(503, { erro: 'O assistente ainda não foi configurado (falta a chave do Gemini).' });

  // Só quem está logado no sistema usa o assistente
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: autenticado } = await admin.auth.getUser(jwt);
  if (!autenticado?.user) return resposta(401, { erro: 'Sessão inválida. Entre na conta novamente.' });

  const bruto = await req.text();
  if (bruto.length > MAX_TAMANHO) return resposta(413, { erro: 'A conversa ficou muito longa. Comece uma nova conversa.' });
  let corpo: { contents?: unknown; contexto?: Record<string, unknown> };
  try {
    corpo = JSON.parse(bruto);
  } catch {
    return resposta(400, { erro: 'Requisição inválida.' });
  }
  if (!conversaValida(corpo.contents)) return resposta(400, { erro: 'Conversa inválida. Comece uma nova conversa.' });

  const requisicao = JSON.stringify({
    systemInstruction: { parts: [{ text: instrucaoDoSistema(corpo.contexto) }] },
    contents: corpo.contents,
    tools: [{ functionDeclarations: FERRAMENTAS }],
    // Raciocínio curto: as perguntas são simples e o raciocínio longo deixa a resposta lenta
    generationConfig: { thinkingConfig: { thinkingLevel: 'low' } },
  });
  const inicio = Date.now();
  const chamarModelo = (modelo: string) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
      body: requisicao,
      signal: AbortSignal.timeout(Math.min(LIMITE_CHAMADA_MS, LIMITE_TOTAL_MS - (Date.now() - inicio))),
    }).catch(() => null); // sem conexão ou passou do tempo

  // Tenta os modelos em ordem enquanto o erro for temporário. Erro rápido (ex.: 503 na hora) no principal
  // ganha uma nova tentativa após 1,5 s; chamada que estourou o tempo passa direto para o próximo modelo.
  let respostaGemini: Response | null = null;
  const statusTemporarios: number[] = [];
  let repetiuPrincipal = false;
  for (let i = 0; i < MODELOS.length; i++) {
    if (LIMITE_TOTAL_MS - (Date.now() - inicio) < 5_000) break; // não começa uma tentativa que não daria tempo de terminar
    respostaGemini = await chamarModelo(MODELOS[i]);
    if (respostaGemini && !ERROS_TEMPORARIOS.includes(respostaGemini.status)) break;
    const status = respostaGemini?.status ?? 0;
    statusTemporarios.push(status);
    console.error('Gemini', MODELOS[i], status, respostaGemini ? (await respostaGemini.text()).slice(0, 300) : 'sem resposta (tempo esgotado ou sem conexão)');
    if (respostaGemini && i === 0 && !repetiuPrincipal) {
      repetiuPrincipal = true;
      await new Promise((r) => setTimeout(r, 1500));
      i--;
    }
    respostaGemini = null;
  }

  if (!respostaGemini) {
    if (statusTemporarios.length > 0 && statusTemporarios.every((s) => s === 429)) {
      return resposta(429, { erro: 'O assistente recebeu muitas perguntas seguidas. Espere um minuto e tente de novo.' });
    }
    return resposta(503, { erro: 'O assistente está sobrecarregado agora (servidores do Google). Tente de novo em alguns instantes.' });
  }
  if (!respostaGemini.ok) {
    console.error('Gemini', respostaGemini.status, await respostaGemini.text());
    return resposta(502, { erro: 'O assistente está indisponível no momento. Tente de novo mais tarde.' });
  }

  const dados = await respostaGemini.json();
  const conteudo = dados?.candidates?.[0]?.content;
  if (!conteudo?.parts?.length) {
    return resposta(200, {
      conteudo: { role: 'model', parts: [{ text: 'Não consegui responder a isso. Pode reformular a pergunta?' }] },
    });
  }
  // Devolve o conteúdo do modelo inteiro (com as assinaturas de raciocínio, se vierem): o sistema
  // reenvia igual no histórico, como o Gemini exige nas chamadas de ferramenta
  return resposta(200, { conteudo: { role: 'model', parts: conteudo.parts } });
});
