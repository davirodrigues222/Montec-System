# ⚡ BancadaOS — Software de Gestão para Assistência Técnica

**BancadaOS** é uma plataforma web *Full-Stack* (SaaS) moderna e especializada no gerenciamento completo de assistências técnicas e laboratórios de manutenção de smartphones e eletrônicos (Apple, Samsung, Xiaomi, Motorola, etc.).

Desenvolvido para atender desde a recepção no balcão até a bancada do técnico, o sistema reúne controle de ordens de serviço (OS), checklist de entrada, gestão financeira com cálculo de lucro real (descontando peças, fretes e garantias), simulador de taxas de maquineta e emissão formal de comprovantes e certidões de garantia para impressão térmica ou A4.

---

## 🚀 Tecnologias Utilizadas

### Frontend
- **React 19** (Vite + TypeScript)
- **Tailwind CSS** (Design System escuro nativo no padrão Figma com temas *Escuro*, *Meia-noite* e *Claro*)
- **Lucide** (Iconografia vetorial moderna)
- **Supabase Client JS** (Integração direta com autenticação e banco)
- **CSS Print** (`print:hidden` e `print:block` para emissão limpa de documentos)

### Backend & Nuvem (sem servidor próprio)
- **Supabase (PostgreSQL)** (Banco relacional com JSONB e Row Level Security)
- **Supabase Auth** (Login, código de verificação por e-mail e sessões persistentes)
- **Row Level Security (RLS)** (Isolamento total de dados por loja, permissões por funcionário e assinatura exigida para gravar)
- **Edge Functions** (`cakto-webhook`: pagamentos da Cakto; `login-funcionario`: login próprio dos funcionários; `assistente`: assistente de IA com Google Gemini)
- **Vercel** (Hospedagem do frontend, com cabeçalhos de segurança em `frontend/vercel.json`)

---

## ✨ Principais Funcionalidades

### 1. Autenticação & Arquitetura Multi-Tenant (SaaS)
- **Acesso Restrito:** Fluxo completo de login, cadastro de novas oficinas e recuperação de senha.
- **Isolamento de Dados (RLS):** Cada assistência técnica possui ambiente exclusivo no banco de dados. Um lojista nunca visualiza ordens, clientes ou faturamento de outra loja.

### 2. Painel Operacional em Tempo Real (Dashboard)
- **Métricas da Bancada:** Contadores dinâmicos de aparelhos *Na bancada*, *Prontos para retirada*, *Aguardando peça* e *Faturamento do mês*.
- **Tabela de Acompanhamento:** Ordens em andamento com badges estilizados de status (*Em bancada*, *Em diagnóstico*, *Aguardando peça*, *Pronto*).
- **Hoje na Loja & Meta Mensal:** Monitoramento de entradas, finalizações, entregas e barra de progresso da meta de faturamento.

### 3. Análises Financeiras & Relatórios
- **Métricas Consolidadas:** Faturamento bruto, custos operacionais, lucro líquido real e ticket médio por atendimento.
- **Composição de Custos:** Distribuição percentual automatizada entre *Peças*, *Fretes* e *Garantias*.
- **Receita por Semana:** Visualizador da evolução semanal do faturamento no mês.
- **Exportação de Dados:** Exportação completa de relatórios financeiros em formato `.csv`.

### 4. Gestão Completa de Ordens de Serviço
- **Busca Rápida e Filtros:** Pesquisa em tempo real por cliente, modelo do aparelho, IMEI ou número da OS.
- **Visualização Detalhada em 3 Abas:** Consulta rápida de dados do cliente/aparelho, checklist de entrada e histórico/linha do tempo.
- **Edição em 3 Etapas:** Atualização ágil de dados gerais, recálculo financeiro e checklist.
- **Exclusão Segura:** Modal de confirmação para evitar perdas acidentais.

### 5. Abertura de Nova OS & Simulador de Custos
- **Cobertura Configurável:** Alternância instantânea entre serviços *Com garantia* ou *Sem garantia*.
- **Vínculo Rápido:** Seleção de clientes e serviços previamente cadastrados com autopreenchimento.
- **Simulador Financeiro Inteligente:** Cálculo automático de valor com desconto, retenção da taxa de maquineta e projeção do lucro líquido na hora.
- **Checklist Interativo:** Avaliação de 12 itens do aparelho no recebimento do dispositivo.
- **Modal de Conclusão:** Emissão e impressão imediata do comprovante logo após o cadastro.

### 6. Controle de Garantias & Retornos
- **Validação de Prazos:** Identificação automática de ordens elegíveis à garantia legal (até 90 dias após a conclusão).
- **Abatimento no Lucro:** Lançamento de custos adicionais com peças de reposição e fretes de garantia, recalculando o lucro líquido real do serviço.

### 7. Central de Cadastros
- Layout em 3 colunas para administração ágil de:
  - **Serviços:** Cadastro de serviços com preços sugeridos de mão de obra.
  - **Fornecedores:** Registro de parceiros de peças com dados de contato.
  - **Clientes:** Base de clientes com WhatsApp, CPF/CNPJ e histórico.

### 8. Configurações & Certidão de Garantia
- **Identidade da Loja:** Configuração de nome, especialidade, CNPJ/CPF, WhatsApp comercial e endereço.
- **Aparência:** Upload de logotipo personalizado e alternância entre temas visuais.
- **Termos Legais Customizáveis:** Editor de termos e condições de garantia que alimenta automaticamente a via impressa do cliente.
- **Comprovante de Entrada / Certidão de Garantia:** Layout profissional com assinaturas do cliente e técnico, adaptado para impressão ou salvamento em PDF.

### 9. Link de acompanhamento para o cliente
- **Andamento sem login:** cada OS tem um link (`/acompanhar/<código>`) em que o cliente vê o status, as datas, o orçamento e a garantia. Não aparecem telefone, CPF, IMEI, senha, custos nem observações internas.
- **Aprovação do orçamento:** o cliente aprova pelo link; a OS registra a data e a forma "Link de acompanhamento".
- **Envio:** em Ordens de serviço › Detalhes (bloco "Acompanhamento online") ou pela variável `{link_acompanhamento}` nas mensagens de WhatsApp. "Gerar link novo" invalida o anterior; o link vence 30 dias depois da entrega.
- **Banco:** migração `20261102090000_link_acompanhamento.sql`.

### 10. Fotos do aparelho
- **Na entrada:** a Nova OS tem o card "Fotos do aparelho" ("Tirar foto" abre a câmera no celular); as fotos sobem logo depois que a OS é criada.
- **Depois:** em Ordens de serviço › Detalhes › "Checklist e fotos" as fotos só são vistas e ampliadas; enviar mais e excluir fica no "Editar OS" (aba "Checklist e fotos"), gravando ao salvar (até 15 por OS).
- **Leves e privadas:** cada foto é reduzida no aparelho (lado maior de 1600 px, ~300 KB) e fica no bucket privado `fotos-os`; só a própria loja vê.
- **Banco:** migração `20261102120000_fotos_os.sql` (cria o bucket e as regras do Storage).

### 11. Estoque de peças
- **Cadastro:** em Cadastros › Estoque de peças, com nome, modelos compatíveis, código, categoria, fornecedor (do cadastro de Fornecedores), estoque mínimo, custo e quantidade inicial.
- **Entrada e ajuste:** "+ Entrada" lança uma compra (quantidade, custo unitário e fornecedor) e recalcula o custo médio ponderado; "Ajustar" grava a contagem real (perda, defeito, inventário). Cada movimento fica no histórico da peça, com data e quem fez.
- **Baixa automática na OS:** na Nova OS e no Editar OS (bloco "Peças do estoque"), as peças escolhidas saem do estoque ao salvar. Tirar uma peça ou diminuir a quantidade devolve a diferença, e excluir a OS devolve tudo. O custo delas (custo médio do dia da baixa) entra no custo da OS e sai do lucro. O campo de custo digitado passa a ser "Outras peças (fora do estoque)".
- **Estoque baixo:** a peça fica marcada quando chega no mínimo definido (mínimo 0 desliga o aviso), e o Painel mostra o alerta com as peças a repor. O saldo pode ficar negativo se a peça for usada antes de a entrada ser lançada; a tela avisa.
- **Permissões:** cadastro, entrada e ajuste exigem "Cadastros"; a baixa na OS exige "Nova ordem" ou "Ordens de serviço". Custos só aparecem para quem tem "Análises e relatórios".
- **Banco:** migração `20261108090000_estoque_pecas.sql`. A quantidade só muda pelas funções do banco, nunca direto na tabela.

### 12. Assistente de IA
- **Dúvidas sobre o sistema:** Botão **Assistente** no cabeçalho, com um chat que explica telas e fluxos e abre a tela certa.
- **Tarefas de configuração:** Cria e altera formas de pagamento (taxas, parcelamento, taxa por parcela), cria as formas padrão e cadastra ou altera serviços. Antes de gravar, mostra um resumo para o usuário confirmar.
- **Permissões respeitadas:** As ações rodam no navegador com o login e as permissões do funcionário identificado.
- **Privacidade:** Nenhum dado de cliente ou de OS é enviado ao Gemini (no plano gratuito o Google pode usar as conversas).
- **Configuração:** crie uma chave grátis em [Google AI Studio](https://aistudio.google.com/apikey) e publique a função:
  ```bash
  supabase secrets set GEMINI_API_KEY=sua_chave
  supabase functions deploy assistente
  ```
  Opcional: `GEMINI_MODELO` troca o modelo (padrão `gemini-3.6-flash`; reservas em `GEMINI_MODELOS_RESERVA`).

---

## 🗄️ Estrutura do Banco de Dados (Supabase / PostgreSQL)

O sistema opera com o **Row Level Security (RLS)** ativo em todas as tabelas, validando o `auth.uid()` em cada operação:

| Tabela | Descrição | Isolamento RLS |
| :--- | :--- | :--- |
| `ordens_servico` | Ordens de serviço, valores, status, custos e JSON de garantia/checklist | `user_id = auth.uid()` |
| `clientes` | Base de clientes vinculados à assistência | `user_id = auth.uid()` |
| `aparelhos_cliente` | Dispositivos dos clientes (modelo, IMEI, senha de desbloqueio) | `user_id = auth.uid()` |
| `cad_servicos` | Catálogo de serviços e preços sugeridos | `user_id = auth.uid()` |
| `cad_fornecedores` | Cadastro de fornecedores de componentes e peças | `user_id = auth.uid()` |
| `estoque_pecas` / `estoque_movimentos` / `os_pecas` | Estoque de peças, histórico de movimentos e peças usadas em cada OS | Leitura pelas views `*_lista` da loja; gravação só pelas funções do banco |

---

## 📁 Estrutura de Pastas

```text
BancadaOS/
├── supabase/
│   ├── migrations/             # Banco: tabelas, regras de acesso (RLS) e funções (rodar em ordem)
│   ├── functions/              # Edge Functions: cakto-webhook, login-funcionario e assistente
│   └── templates/              # Modelos dos e-mails de código de verificação
└── frontend/
    ├── public/
    │   └── marca-bancadaos.svg # Símbolo da marca (ícones do app: icone-*.png)
    ├── src/
    │   ├── components/
    │   │   ├── CertidaoGarantia.tsx  # Documento para impressão/PDF
    │   │   ├── Layout.tsx            # Sidebar BancadaOS e cabeçalho da oficina
    │   │   └── StatusBadge.tsx       # Badges de status da bancada
    │   ├── pages/
    │   │   ├── Auth.tsx              # Login, cadastro e códigos de verificação
    │   │   ├── Dashboard.tsx         # Painel operacional principal
    │   │   ├── Relatorios.tsx        # Análises financeiras e gráficos
    │   │   ├── HistoricoServicos.tsx # Listagem e modais de OS
    │   │   ├── NovaOS.tsx            # Abertura de ordens com simulador
    │   │   ├── Garantiaretorno.tsx   # Gestão de retornos e prejuízos
    │   │   ├── cadastros/            # Clientes, serviços, fornecedores, lojas, funcionários e pagamentos
    │   │   └── Configuracoes.tsx     # Dados da loja, logo e termos legais
    │   ├── services/
    │   │   ├── api.ts                # Camada de serviços e regras de negócio
    │   │   ├── paginacao.ts          # Busca paginada (o Supabase limita 1.000 linhas por consulta)
    │   │   └── supabaseClient.ts     # Instância do cliente Supabase
    │   ├── types/
    │   │   └── index.ts              # Tipagens TypeScript do sistema
    │   ├── App.tsx                   # Guarda de autenticação e controle de abas
    │   ├── index.css                 # Estilos globais e fontes
    │   └── main.tsx
    ├── index.html
    └── package.json
