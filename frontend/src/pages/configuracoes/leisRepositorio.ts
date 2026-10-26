// ==========================================
// Repositório de leis para o balcão da assistência técnica.
// Textos dos artigos: Código de Defesa do Consumidor (Lei 8.078/1990), Código Civil (Lei 10.406/2002)
// e LGPD (Lei 13.709/2018). Conferir no Planalto antes de mudar algum trecho.
// Conteúdo informativo: não substitui a orientação de um advogado.
// ==========================================

export type CategoriaLei = 'garantia' | 'mau-uso' | 'orcamento' | 'pecas' | 'abandono' | 'dados';

export const CATEGORIAS_LEI: { id: CategoriaLei; rotulo: string }[] = [
  { id: 'garantia', rotulo: 'Garantia e prazos' },
  { id: 'mau-uso', rotulo: 'Mau uso' },
  { id: 'orcamento', rotulo: 'Orçamento' },
  { id: 'pecas', rotulo: 'Peças' },
  { id: 'abandono', rotulo: 'Abandono' },
  { id: 'dados', rotulo: 'Dados e LGPD' },
];

export interface LeiRepositorio {
  id: string;
  categoria: CategoriaLei;
  /** Selos curtos, ex.: "CDC · Art. 26, II". */
  referencias: string[];
  titulo: string;
  /** Trechos literais da lei. */
  textoLei: { artigo: string; texto: string }[];
  /** Como explicar ao cliente, em linguagem simples. */
  resumo: string;
  /** Ponto de atenção para a loja (limites da regra). */
  atencao?: string;
  /** Mensagem pronta para colar no WhatsApp. */
  mensagemWhatsapp: string;
  /** Cláusula para os termos de garantia impressos na OS. */
  clausula: string;
  /** Palavras extras para a busca. */
  palavrasChave: string;
}

export const LEIS_REPOSITORIO: LeiRepositorio[] = [
  {
    id: 'garantia-legal',
    categoria: 'garantia',
    referencias: ['CDC · Art. 24', 'CDC · Art. 26, II e § 1º'],
    titulo: 'Garantia legal de 90 dias no conserto',
    textoLei: [
      {
        artigo: 'Art. 24',
        texto: 'A garantia legal de adequação do produto ou serviço independe de termo expresso, vedada a exoneração contratual do fornecedor.',
      },
      {
        artigo: 'Art. 26',
        texto:
          'O direito de reclamar pelos vícios aparentes ou de fácil constatação caduca em: I - trinta dias, tratando-se de fornecimento de serviço e de produtos não duráveis; II - noventa dias, tratando-se de fornecimento de serviço e de produtos duráveis.',
      },
      {
        artigo: 'Art. 26, § 1º',
        texto: 'Inicia-se a contagem do prazo decadencial a partir da entrega efetiva do produto ou do término da execução dos serviços.',
      },
    ],
    resumo:
      'Todo conserto de celular tem 90 dias de garantia por lei, mesmo que nada esteja escrito. O prazo começa no dia em que o cliente retira o aparelho, e a loja não pode reduzir nem excluir essa garantia.',
    mensagemWhatsapp:
      'Olá! Seu reparo tem garantia legal de 90 dias, prevista no Código de Defesa do Consumidor (arts. 24 e 26, II). O prazo conta a partir da data em que você retirou o aparelho e cobre o serviço executado e as peças trocadas. Qualquer dúvida, estamos à disposição!',
    clausula:
      'A garantia legal do serviço é de 90 dias, contados da entrega do aparelho ao cliente, e independe de termo escrito (CDC, arts. 24 e 26, II e § 1º).',
    palavrasChave: 'garantia prazo 90 dias noventa legal entrega retirada',
  },
  {
    id: 'garantia-contratual',
    categoria: 'garantia',
    referencias: ['CDC · Art. 50'],
    titulo: 'Garantia da loja (contratual) e termo de garantia',
    textoLei: [
      {
        artigo: 'Art. 50',
        texto: 'A garantia contratual é complementar à legal e será conferida mediante termo escrito.',
      },
      {
        artigo: 'Art. 50, parágrafo único',
        texto:
          'O termo de garantia ou equivalente deve ser padronizado e esclarecer, de maneira adequada em que consiste a mesma garantia, bem como a forma, o prazo e o lugar em que pode ser exercitada e os ônus a cargo do consumidor, devendo ser-lhe entregue, devidamente preenchido pelo fornecedor, no ato do fornecimento, acompanhado de manual de instrução, de instalação e uso do produto em linguagem didática, com ilustrações.',
      },
    ],
    resumo:
      'Quando a loja oferece mais garantia (por exemplo, 180 dias), isso é um bônus por escrito que se soma à garantia legal, sem substituí-la. O termo precisa dizer o que cobre, por quanto tempo e como acionar.',
    atencao: 'A garantia da loja nunca pode ser usada para diminuir os 90 dias legais.',
    mensagemWhatsapp:
      'Olá! Além da garantia legal de 90 dias, a nossa loja oferece garantia própria, descrita no termo que acompanha a sua ordem de serviço (CDC, art. 50). Nele estão o prazo, o que está coberto e como acionar. Se precisar, é só nos chamar por aqui!',
    clausula:
      'A garantia oferecida pela loja é complementar à garantia legal e não a substitui (CDC, art. 50). Para acioná-la, apresente esta ordem de serviço na loja dentro do prazo indicado.',
    palavrasChave: 'garantia loja contratual termo escrito complementar 180 dias',
  },
  {
    id: 'vicio-servico-prazo',
    categoria: 'garantia',
    referencias: ['CDC · Art. 20', 'CDC · Art. 18, § 1º'],
    titulo: 'Retorno em garantia: reexecução do serviço e prazo de 30 dias',
    textoLei: [
      {
        artigo: 'Art. 20',
        texto:
          'O fornecedor de serviços responde pelos vícios de qualidade que os tornem impróprios ao consumo ou lhes diminuam o valor, assim como por aqueles decorrentes da disparidade com as indicações constantes da oferta ou mensagem publicitária, podendo o consumidor exigir, alternativamente e à sua escolha: I - a reexecução dos serviços, sem custo adicional e quando cabível; II - a restituição imediata da quantia paga, monetariamente atualizada, sem prejuízo de eventuais perdas e danos; III - o abatimento proporcional do preço.',
      },
      {
        artigo: 'Art. 18, § 1º',
        texto:
          'Não sendo o vício sanado no prazo máximo de trinta dias, pode o consumidor exigir, alternativamente e à sua escolha: I - a substituição do produto por outro da mesma espécie, em perfeitas condições de uso; II - a restituição imediata da quantia paga, monetariamente atualizada, sem prejuízo de eventuais perdas e danos; III - o abatimento proporcional do preço.',
      },
    ],
    resumo:
      'Se o conserto apresentar problema dentro da garantia, o cliente pode pedir que o serviço seja refeito sem custo. Para a peça trocada com defeito, a loja tem até 30 dias para resolver antes de o cliente poder exigir troca, devolução do dinheiro ou desconto.',
    atencao:
      'O prazo de 30 dias está no art. 18, que trata de defeito no produto (como a peça instalada). Para o serviço em si, o art. 20 não prevê esse prazo: o cliente pode escolher logo entre refazer, devolver o valor ou abater o preço. Resolver rápido é a melhor defesa.',
    mensagemWhatsapp:
      'Olá! Como seu aparelho está dentro da garantia, vamos analisar e refazer o serviço sem nenhum custo, como prevê o Código de Defesa do Consumidor (art. 20). Assim que o reparo estiver pronto, avisamos você por aqui.',
    clausula:
      'Constatado defeito coberto pela garantia, o serviço será refeito sem custo adicional (CDC, art. 20). Peças substituídas com defeito serão reparadas ou trocadas no prazo de até 30 dias (CDC, art. 18, § 1º).',
    palavrasChave: 'retorno garantia 30 dias trinta refazer reexecução devolução dinheiro abatimento defeito voltou',
  },
  {
    id: 'mau-uso',
    categoria: 'mau-uso',
    referencias: ['CDC · Art. 14, § 3º, II', 'CDC · Art. 12, § 3º, III'],
    titulo: 'Perda da garantia por mau uso ou intervenção de terceiros',
    textoLei: [
      {
        artigo: 'Art. 14, § 3º',
        texto:
          'O fornecedor de serviços só não será responsabilizado quando provar: I - que, tendo prestado o serviço, o defeito inexiste; II - a culpa exclusiva do consumidor ou de terceiro.',
      },
      {
        artigo: 'Art. 12, § 3º',
        texto:
          'O fabricante, o construtor, o produtor ou importador só não será responsabilizado quando provar: I - que não colocou o produto no mercado; II - que, embora haja colocado o produto no mercado, o defeito inexiste; III - a culpa exclusiva do consumidor ou de terceiro.',
      },
    ],
    resumo:
      'A garantia não cobre danos causados depois da entrega por queda, tela trincada, pressão, contato com líquido, selo rompido ou aparelho aberto por outra pessoa. Nesses casos o problema não veio do nosso serviço.',
    atencao:
      'A lei diz "quando provar": quem precisa mostrar o mau uso é a loja. Guarde fotos do aparelho na entrada e na saída, o checklist assinado e o selo de garantia intacto.',
    mensagemWhatsapp:
      'Olá! Analisamos o aparelho e identificamos sinais de dano posterior ao reparo (como queda, pressão, contato com líquido ou abertura por terceiros). Nesses casos a garantia não se aplica, conforme o Código de Defesa do Consumidor (art. 14, § 3º, II). Podemos enviar um orçamento para o novo reparo, se você quiser.',
    clausula:
      'A garantia não cobre danos causados após a entrega por quedas, trincos, pressão, contato com líquidos, rompimento do selo de garantia ou reparo feito por terceiros (CDC, art. 14, § 3º, II).',
    palavrasChave: 'mau uso queda trincado trinco tela quebrada líquido água oxidação selo lacre terceiro aberto perda garantia',
  },
  {
    id: 'orcamento-previo',
    categoria: 'orcamento',
    referencias: ['CDC · Art. 40', 'CDC · Art. 39, VI'],
    titulo: 'Orçamento prévio, validade de 10 dias e aprovação do cliente',
    textoLei: [
      {
        artigo: 'Art. 40',
        texto:
          'O fornecedor de serviço será obrigado a entregar ao consumidor orçamento prévio discriminando o valor da mão-de-obra, dos materiais e equipamentos a serem empregados, as condições de pagamento, bem como as datas de início e término dos serviços.',
      },
      {
        artigo: 'Art. 40, § 1º',
        texto: 'Salvo estipulação em contrário, o valor orçado terá validade pelo prazo de dez dias, contado de seu recebimento pelo consumidor.',
      },
      {
        artigo: 'Art. 40, § 2º',
        texto: 'Uma vez aprovado pelo consumidor, o orçamento obriga os contraentes e somente pode ser alterado mediante livre negociação das partes.',
      },
      {
        artigo: 'Art. 40, § 3º',
        texto: 'O consumidor não responde por quaisquer ônus ou acréscimos decorrentes da contratação de serviços de terceiros não previstos no orçamento prévio.',
      },
      {
        artigo: 'Art. 39, VI',
        texto:
          'É vedado ao fornecedor de produtos ou serviços, dentre outras práticas abusivas: executar serviços sem a prévia elaboração de orçamento e autorização expressa do consumidor, ressalvadas as decorrentes de práticas anteriores entre as partes.',
      },
    ],
    resumo:
      'Antes de consertar, a loja entrega o orçamento com valor, forma de pagamento e prazo, e só começa depois que o cliente aprovar. O orçamento vale 10 dias, salvo outro prazo combinado, e o valor aprovado não muda sem acordo.',
    mensagemWhatsapp:
      'Olá! Segue o orçamento do seu aparelho, com valor, forma de pagamento e prazo. Ele é válido por 10 dias (CDC, art. 40, § 1º), e só iniciamos o serviço após a sua aprovação (art. 39, VI). Pode responder por aqui para aprovar!',
    clausula:
      'O serviço só é executado após a aprovação do orçamento pelo cliente (CDC, art. 39, VI). Salvo outro prazo indicado, o orçamento é válido por 10 dias do recebimento (CDC, art. 40, § 1º).',
    palavrasChave: 'orçamento aprovação autorização validade 10 dias dez prévio valor mão de obra',
  },
  {
    id: 'pecas-reposicao',
    categoria: 'pecas',
    referencias: ['CDC · Art. 21', 'CDC · Art. 70'],
    titulo: 'Peças originais, compatíveis e usadas',
    textoLei: [
      {
        artigo: 'Art. 21',
        texto:
          'No fornecimento de serviços que tenham por objetivo a reparação de qualquer produto considerar-se-á implícita a obrigação do fornecedor de empregar componentes de reposição originais adequados e novos, ou que mantenham as especificações técnicas do fabricante, salvo, quanto a estes últimos, autorização em contrário do consumidor.',
      },
      {
        artigo: 'Art. 70',
        texto: 'Empregar na reparação de produtos, peça ou componentes de reposição usados, sem autorização do consumidor: Pena Detenção de três meses a um ano e multa.',
      },
    ],
    resumo:
      'A regra é usar peça nova e original, ou nova com a especificação do fabricante. Peça compatível de outra especificação, usada ou recondicionada só com autorização do cliente. Usar peça usada sem autorização é crime.',
    mensagemWhatsapp:
      'Olá! Para o seu reparo temos opções de peça original e de peça compatível. Pelo Código de Defesa do Consumidor (arts. 21 e 70), só usamos peça não original ou usada com a sua autorização. Qual opção você prefere?',
    clausula:
      'Peças usadas, recondicionadas ou não originais só são empregadas com autorização expressa do cliente (CDC, arts. 21 e 70).',
    palavrasChave: 'peça original compatível paralela usada recondicionada reposição autorização',
  },
  {
    id: 'abandono',
    categoria: 'abandono',
    referencias: ['Código Civil · Art. 1.275, III', 'Código Civil · Art. 644'],
    titulo: 'Aparelho não retirado (abandono) e direito de retenção',
    textoLei: [
      {
        artigo: 'Art. 1.275',
        texto: 'Além das causas consideradas neste Código, perde-se a propriedade: I - por alienação; II - pela renúncia; III - por abandono; IV - por perecimento da coisa; V - por desapropriação.',
      },
      {
        artigo: 'Art. 644',
        texto:
          'O depositário poderá reter o depósito até que se lhe pague a retribuição devida, o líquido valor das despesas, ou dos prejuízos a que se refere o artigo anterior, provando imediatamente esses prejuízos ou essas despesas.',
      },
    ],
    resumo:
      'A loja pode segurar o aparelho até o cliente pagar o serviço e as despesas. Se o cliente some e não retira o aparelho mesmo depois de avisado, o Código Civil prevê a perda da propriedade por abandono.',
    atencao:
      'Nenhuma lei fixa um prazo (como 90 dias) para considerar o aparelho abandonado. O prazo e o destino do aparelho precisam estar escritos na OS e aceitos pelo cliente. Notifique por escrito (WhatsApp, e-mail ou carta), guarde as provas e, antes de vender ou descartar, procure orientação jurídica.',
    mensagemWhatsapp:
      'Olá! Seu aparelho está pronto para retirada na nossa loja. Conforme os termos da sua ordem de serviço, aparelhos não retirados após 90 dias da comunicação de conclusão poderão ser considerados abandonados (Código Civil, art. 1.275, III). Por favor, entre em contato para combinarmos a retirada.',
    clausula:
      'Aparelhos não retirados em até 90 dias após a comunicação de conclusão ou de reprovação do orçamento, feita por escrito ao cliente, poderão ser considerados abandonados (Código Civil, art. 1.275, III), podendo a loja reter o aparelho até o pagamento dos valores devidos (Código Civil, art. 644).',
    palavrasChave: 'abandono abandonado não retirado esquecido retirada retenção depósito 90 dias venda descarte',
  },
  {
    id: 'lgpd-senha',
    categoria: 'dados',
    referencias: ['LGPD · Art. 6º, III', 'LGPD · Art. 46'],
    titulo: 'Senha do aparelho e sigilo dos dados do cliente',
    textoLei: [
      {
        artigo: 'Art. 6º, III',
        texto:
          'necessidade: limitação do tratamento ao mínimo necessário para a realização de suas finalidades, com abrangência dos dados pertinentes, proporcionais e não excessivos em relação às finalidades do tratamento de dados.',
      },
      {
        artigo: 'Art. 46',
        texto:
          'Os agentes de tratamento devem adotar medidas de segurança, técnicas e administrativas aptas a proteger os dados pessoais de acessos não autorizados e de situações acidentais ou ilícitas de destruição, perda, alteração, comunicação ou qualquer forma de tratamento inadequado ou ilícito.',
      },
    ],
    resumo:
      'A senha do aparelho é usada só para testar o conserto. Ela não é impressa nos documentos e o sistema a apaga quando a OS é entregue ou cancelada. Fotos, mensagens e arquivos do cliente não são acessados nem copiados.',
    mensagemWhatsapp:
      'Olá! A senha do seu aparelho é usada apenas para os testes do reparo, não aparece em nenhum documento impresso e é apagada do nosso sistema quando o aparelho é entregue, como determina a Lei Geral de Proteção de Dados (LGPD, arts. 6º e 46). Seus arquivos pessoais não são acessados.',
    clausula:
      'A senha de desbloqueio informada é usada somente para os testes do reparo, não é impressa e é apagada ao fim do atendimento. Os arquivos pessoais do aparelho não são acessados (LGPD, arts. 6º, III, e 46).',
    palavrasChave: 'senha desbloqueio padrão sigilo privacidade dados pessoais lgpd fotos arquivos',
  },
  {
    id: 'backup',
    categoria: 'dados',
    referencias: ['CDC · Art. 6º, III', 'CDC · Art. 51, I'],
    titulo: 'Backup e risco de perda de dados no reparo',
    textoLei: [
      {
        artigo: 'Art. 6º, III',
        texto:
          'São direitos básicos do consumidor: a informação adequada e clara sobre os diferentes produtos e serviços, com especificação correta de quantidade, características, composição, qualidade, tributos incidentes e preço, bem como sobre os riscos que apresentem.',
      },
      {
        artigo: 'Art. 51, I',
        texto:
          'São nulas de pleno direito, entre outras, as cláusulas contratuais relativas ao fornecimento de produtos e serviços que: I - impossibilitem, exonerem ou atenuem a responsabilidade do fornecedor por vícios de qualquer natureza dos produtos e serviços ou impliquem renúncia ou disposição de direitos. Nas relações de consumo entre o fornecedor e o consumidor pessoa jurídica, a indenização poderá ser limitada, em situações justificáveis.',
      },
    ],
    resumo:
      'Reparos de placa e de software podem apagar dados. A loja deve avisar esse risco antes do serviço e recomendar que o cliente faça backup. Quando for preciso apagar os dados, o cliente é avisado antes.',
    atencao:
      'Avisar o risco e recomendar o backup protege a loja, mas uma cláusula de "isenção total" por perda de dados pode ser anulada (art. 51, I). Registre o aviso na OS e peça a confirmação do cliente.',
    mensagemWhatsapp:
      'Olá! Antes do reparo, recomendamos fazer o backup das suas fotos, contatos e arquivos. Alguns serviços, principalmente de placa e de software, podem apagar os dados do aparelho. Se for necessário apagar, vamos avisar você antes de executar (CDC, art. 6º, III).',
    clausula:
      'Recomendamos que o cliente faça backup dos dados antes do reparo: serviços de placa e de software podem apagar informações do aparelho. Se o serviço exigir apagar dados, o cliente será avisado antes da execução (CDC, art. 6º, III).',
    palavrasChave: 'backup dados perda fotos arquivos apagar formatar software placa risco',
  },
];
