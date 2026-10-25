// Textos da página inicial. Ficam separados do layout para facilitar revisão.
// Regra: só listar o que o sistema realmente faz hoje (nada de números, depoimentos ou recursos inventados).

/** Caminhos SVG (24x24, traço) usados nos ícones da página. */
export const ICONES = {
  ordem: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  escudo: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  cartao: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
  grafico: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  loja: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  equipe: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  check: 'M5 13l4 4L19 7',
  x: 'M6 18L18 6M6 6l12 12',
  seta: 'M13 7l5 5m0 0l-5 5m5-5H6',
  celular: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
  nuvem: 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z',
  cadeado: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
};

/** Garantias rápidas logo abaixo dos botões do hero. */
export const DESTAQUES_HERO = [
  { icone: ICONES.nuvem, texto: 'Direto no navegador, sem instalar' },
  { icone: ICONES.celular, texto: 'Computador, tablet ou celular' },
  { icone: ICONES.cadeado, texto: 'Acesso individual por funcionário' },
];

/** Dor do dia a dia -> como o sistema resolve. */
export const DORES_E_SOLUCOES = [
  {
    dor: 'O cliente liga e ninguém sabe em que pé está o aparelho.',
    solucao: 'Cada OS tem um status claro — da entrada à entrega — visível para toda a equipe.',
  },
  {
    dor: 'O aparelho volta reclamando e não há prova do estado em que entrou.',
    solucao: 'Checklist de entrada (tela, bateria, câmeras, botões…) registrado na abertura da OS.',
  },
  {
    dor: 'Garantia vira discussão: ninguém lembra o prazo nem o que foi coberto.',
    solucao: 'Prazo de garantia por serviço e certidão impressa com os termos da sua loja.',
  },
  {
    dor: 'No fim do mês, o caixa não fecha com o que foi cobrado.',
    solucao: 'Desconto, taxa da maquininha, custo de peça e frete entram no cálculo do lucro real de cada OS.',
  },
];

/** Recursos em grade (o primeiro ocupa o destaque maior). */
export const RECURSOS = [
  {
    icone: ICONES.ordem,
    titulo: 'Ordem de serviço completa',
    texto: 'Cliente, aparelho, IMEI, senha de teste, defeito relatado, diagnóstico, checklist e prazo de entrega. Salve como rascunho e conclua depois.',
    itens: ['Serviços do catálogo com preço e garantia', 'Histórico e edição de cada OS', 'Comprovante de entrada para impressão'],
  },
  {
    icone: ICONES.escudo,
    titulo: 'Garantias sob controle',
    texto: 'Prazo por serviço, certidão de garantia impressa e registro de retornos com o custo de cada um.',
  },
  {
    icone: ICONES.cartao,
    titulo: 'Pagamento sem surpresa',
    texto: 'Desconto em R$ ou %, pagamento em até duas formas e taxa da maquininha por número de parcelas.',
  },
  {
    icone: ICONES.grafico,
    titulo: 'Metas e relatórios',
    texto: 'Meta de faturamento do mês, lucro líquido, ticket médio e relatórios por dia, mês, ano ou período — com exportação em CSV.',
  },
  {
    icone: ICONES.loja,
    titulo: 'Uma ou várias lojas',
    texto: 'Cadastre suas unidades e vincule cada funcionário às lojas em que trabalha.',
  },
  {
    icone: ICONES.equipe,
    titulo: 'Equipe com acesso individual',
    texto: 'Cada funcionário entra com código e senha e vê só as telas que o administrador liberar.',
  },
];

/** Etapas da OS exibidas na linha do tempo (iguais aos status do sistema). */
export const ETAPAS_OS = ['Recebido', 'Em análise', 'Em manutenção', 'Pronto', 'Entregue'];

/** Primeiros passos reais depois de criar a conta. */
export const PASSOS = [
  { titulo: 'Crie sua conta', texto: 'Nome da assistência, e-mail e senha. Leva menos de um minuto.' },
  { titulo: 'Cadastre o administrador', texto: 'No primeiro acesso, você cria o seu código e senha de administrador.' },
  { titulo: 'Configure a loja', texto: 'Dados da loja, serviços que você oferece e formas de pagamento com as taxas da sua maquininha.' },
  { titulo: 'Abra a primeira OS', texto: 'Registre o aparelho, o checklist e o orçamento. Pronto: sua bancada está organizada.' },
];

export const PERGUNTAS = [
  {
    pergunta: 'Preciso instalar alguma coisa?',
    resposta: 'Não. O Montec System funciona direto no navegador do computador, do tablet ou do celular.',
  },
  {
    pergunta: 'Funciona para mais de uma loja?',
    resposta: 'Sim. Você cadastra quantas unidades tiver, define a loja principal e vincula cada funcionário às lojas em que ele atua.',
  },
  {
    pergunta: 'Cada funcionário vê tudo do sistema?',
    resposta:
      'Não. Ao abrir o sistema, cada funcionário se identifica com código e senha próprios, e só aparecem para ele as telas que o administrador liberou — por exemplo, o técnico vê as ordens de serviço, mas não os relatórios financeiros.',
  },
  {
    pergunta: 'Consigo imprimir comprovante e certidão de garantia?',
    resposta: 'Sim. A OS gera o comprovante de entrada e a certidão de garantia com os dados e os termos da sua loja.',
  },
  {
    pergunta: 'O sistema calcula as taxas da maquininha?',
    resposta:
      'Sim. Você cadastra as formas de pagamento com a taxa de cada número de parcelas, e o sistema mostra quanto você realmente recebe e o lucro de cada OS.',
  },
];
