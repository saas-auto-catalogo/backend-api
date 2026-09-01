# ⚙️ SaaS Auto Catálogo — Backend API

Core da plataforma SaaS multi-tenant responsável pela ingestão de inventário automotivo em lote/streaming, cálculo de diffs de estoque em tempo real e distribuição de feeds XML de alta performance para o **Meta Automotive Inventory Ads (DAA)**.

---

## 🛠️ Stack Tecnológica

- **Runtime & Linguagem**: Node.js 22 LTS / TypeScript 5.7+ (NodeNext)
- **Servidor HTTP**: Fastify v5 com compressão GZIP/Deflate em tempo real (`@fastify/compress`) e CORS
- **ORM & Banco de Dados**: Prisma ORM v6 + PostgreSQL Multi-tenant (Shared Database / Shared Schema)
- **Filas & Mensageria**: BullMQ v6 + Redis
- **Cache & Rate Limiting**: IORedis (Sliding Window Log & Concorrência por Host DMS)
- **Streaming Parser**: SAX Stream, iconv-lite, unzipper e Circuit Breaker
- **Integrações de Catálogo**: Meta Graph API v21.0 & Feeds XML Atom/Google Base DAA

---

## 🏛️ Estrutura Arquitetural do Projeto

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
│   ├── modules/
│   │   ├── xml-ingestion/         # Streaming Parser SAX, Circuit Breaker e Retry com Jitter
│   │   ├── normalization/         # Auto-Matching Engine, normalizadores de marcas, anos e preços
│   │   ├── stock-diff/            # Motor de Diffs (CREATE, UPDATE, SOLD, UNCHANGED) e SyncService
│   │   ├── meta-feed/             # Gerador XML Atom Meta DAA e Controller de Feed Público
│   │   └── meta-connector/        # OAuth 2.0 (Login for Business) e Cliente Graph API v21.0
│   ├── types/
│   │   └── database.ts            # Tipagens canônicas JSON (imagens, opcionais, filtros)
│   └── server.ts                  # Servidor HTTP Fastify com rotas de API
├── .env.example                   # Modelo de variáveis de ambiente
├── package.json                   # Dependências e scripts de execução
└── tsconfig.json                  # Configurações do compilador TypeScript
```

---

## 🌐 Rotas HTTP Principais

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/health` | Health check de integridade do serviço |
| `GET` | `/api/v1/feeds/:token/meta-vehicles.xml` | Feed XML público Meta DAA com GZIP, ETag e Cache Redis (15m) |
| `GET` | `/api/v1/integrations/meta/auth-url` | Gera URL de autorização OAuth do Facebook Login for Business |
| `POST` | `/api/v1/integrations/meta/callback` | Troca de tokens temporários por tokens de longa duração (60 dias) |
| `GET` | `/api/v1/workspaces/:wsId/meta-catalogs/:catId/diagnostics` | Consulta de rejeições e conformidade na Meta Graph API |

---

## 🚀 Como Executar Localmente

### 1. Pré-requisitos
- Node.js `>= 22.0.0`
- PostgreSQL 15+
- Redis 7+

### 2. Configuração de Variáveis de Ambiente
```bash
cp .env.example .env
```

### 3. Instalação de Dependências
```bash
npm install
```

### 4. Prisma ORM: Migrations, Tipos e Carga de Seeds

#### Ambiente de Desenvolvimento Local
```bash
# Validar schema e gerar o Prisma Client
npm run prisma:validate
npm run prisma:generate

# Aplicar migrações em modo de desenvolvimento
npx prisma migrate dev

# Executar seeds de desenvolvimento (Super Admin + 2 Workspaces com 20 veículos)
npm run prisma:seed
```

#### Ambiente de Produção (Railway, Render, AWS, etc.)
```bash
# Aplicar todas as migrações pendentes sem prompt interativo
npx prisma migrate deploy

# (Opcional) Executar carga inicial de dados/seeds se banco virgem
npx prisma db seed
```

### 5. Iniciar o Servidor Fastify
```bash
npm start
```

---

## 🧪 Bateria de Testes Automatizados

| Comando | Escopo do Teste |
|---|---|
| `npm run test:infra` | Smoke test de filas BullMQ, cache Redis e rate limiting |
| `npm run test:parser` | Teste do SAX Streaming Parser com 6 fixtures reais XML (AutoCerto, Altimus, Sisvag, BomControle, Webmotors) |
| `npm run test:normalization` | Teste de Auto-Matching e normalização com feeds reais JSON (4Boss, JRCA) e XML |
| `npm run test:diff` | Teste dos 4 cenários do motor de Diffs (Inserção, Inalterado, Preço/Km e Vendidos) |
| `npm run test:meta-feed` | Teste da geração de XML Atom Meta DAA, ETag (304 Not Modified) e latência em cache |
| `npm run test:meta-connector` | Teste de autenticação OAuth 2.0 (Anti-CSRF), Graph API e diagnósticos |