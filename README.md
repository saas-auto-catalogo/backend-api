# ⚙️ SaaS Auto Catálogo — Backend API

Core da plataforma SaaS multi-tenant responsável pela ingestão de inventário automotivo em lote/streaming, cálculo de diffs de estoque em tempo real e distribuição de feeds XML de alta performance para o **Meta Automotive Inventory Ads (DAA)**.

---

## 🛠️ Stack Tecnológica

- **Runtime & Linguagem**: Node.js 22 LTS / TypeScript 5.7+
- **ORM & Banco de Dados**: Prisma ORM v6 + PostgreSQL Multi-tenant (Shared Database / Shared Schema)
- **Filas & Mensageria**: BullMQ v6 + Redis
- **Cache & Rate Limiting**: IORedis (Sliding Window Log & Concorrência por Host DMS)
- **Integrações de Catálogo**: Meta Graph API (Business SDK) & Feeds XML DAA

---

## 🏛️ Arquitetura de Dados & Multi-Tenancy

O sistema adota o padrão **Shared Database com Segregação Lógica estrita por `workspace_id`**:
- Todas as entidades de estoque, feeds e logs possuem a chave estrangeira `workspace_id`.
- Índices compostos de alta performance para garantir consultas `< 60ms` e unicidade de veículos por loja (`uq_workspace_vehicle_external_id`).
- Extensão do Prisma Client (`createTenantPrisma(workspaceId)`) para injeção automática e segura de escopo de tenant em queries e mutations.

```
backend-api/
├── prisma/
│   ├── schema.prisma              # Modelos, enums, relacionamentos e índices compostos
│   ├── seed.ts                    # Script de seeds de desenvolvimento com dados realistas
│   └── migrations/                # Histórico de migrações DDL em PostgreSQL
├── src/
│   ├── infra/
│   │   ├── redis/                 # Conexão singleton e pool IORedis
│   │   ├── queues/                # Filas BullMQ (xml-ingestion, meta-sync, ai-blog)
│   │   ├── cache/                 # FeedCacheService (TTL 15m e invalidação sob demanda)
│   │   ├── security/              # RateLimiterService (Sliding Window & Slot de Host DMS)
│   │   └── index.ts               # Barrel export do módulo de infraestrutura
│   ├── lib/
│   │   ├── prisma.ts              # Instância singleton do PrismaClient
│   │   └── tenant-prisma.ts       # Extensão Multi-Tenant com escopo automático
│   └── types/
│       └── database.ts            # Tipagens canônicas JSON (imagens, opcionais, filtros)
├── .env.example                   # Modelo de variáveis de ambiente
├── package.json                   # Dependências e scripts de execução
└── tsconfig.json                  # Configurações do compilador TypeScript
```

---

## 🚀 Como Executar Localmente

### 1. Pré-requisitos
- Node.js `>= 22.0.0`
- PostgreSQL 15+ ou instância gerenciada
- Redis 7+

### 2. Configuração de Variáveis de Ambiente
Copie o arquivo de exemplo e ajuste as credenciais do seu banco e Redis:
```bash
cp .env.example .env
```

### 3. Instalação de Dependências
```bash
npm install
```

### 4. Prisma ORM: Gerar Tipos e Carga de Seeds
```bash
# Validar e formatar o schema
npm run prisma:format
npm run prisma:validate

# Gerar o Prisma Client
npm run prisma:generate

# Executar a carga de seeds de desenvolvimento (Revenda Auto Elite + 5 veículos)
npm run prisma:seed
```

---

## 📋 Scripts Disponíveis no `package.json`

| Comando | Descrição |
|---|---|
| `npm run build` | Compila o projeto TypeScript para a pasta `dist/` |
| `npm run typecheck` | Executa verificação estrita de tipagem sem emitir código |
| `npm run prisma:generate` | Atualiza e gera os tipos do `@prisma/client` |
| `npm run prisma:format` | Formata o arquivo `prisma/schema.prisma` |
| `npm run prisma:validate` | Valida sintaxe e integridade relacional do schema |
| `npm run prisma:migrate` | Cria e aplica migrações em ambiente de desenvolvimento |
| `npm run prisma:deploy` | Aplica migrações pendentes em ambiente de produção |
| `npm run prisma:seed` | Executa o script de seeds (`prisma/seed.ts`) |
| `npm run prisma:studio` | Abre a interface web do Prisma Studio no navegador |
| `npm run test:infra` | Executa o smoke test das filas BullMQ, cache Redis e rate limiting |

---

## 🔒 Segurança, Filas e RNFs

1. **Tokens de Feeds Públicos**: Criptografia HMAC-SHA256 com salt individual por tenant e suporte a rotação com janela de tolerância de 48 horas.
2. **Filas Assíncronas (BullMQ)**:
   - `xml-ingestion-queue`: Streaming de arquivos de 50MB+ com consumo de Heap `< 256MB`.
   - `meta-sync-queue`: Sincronização periódica e disparo de diagnósticos.
   - `ai-blog-queue`: Processamento de artigos de SEO.
3. **Cache de Feeds XML**: TTL de 15 minutos (900 segundos) e invalidação sob demanda em tempo real por `workspaceId` após alteração de estoque.
4. **Rate Limiting Distribuído**: Sliding Window de 120 req/min para rotas públicas e limite de 3 conexões concorrentes por host de DMS parceiro.