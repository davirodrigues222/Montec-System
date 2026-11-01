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
- **Edge Functions** (`cakto-webhook`: pagamentos da Cakto; `login-funcionario`: login próprio dos funcionários)
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

---

## 📁 Estrutura de Pastas

```text
BancadaOS/
├── supabase/
│   ├── migrations/             # Banco: tabelas, regras de acesso (RLS) e funções (rodar em ordem)
│   ├── functions/              # Edge Functions: cakto-webhook e login-funcionario
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
