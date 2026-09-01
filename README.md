# SaaS Auto Catálogo — Backend API

Core da plataforma SaaS multi-tenant: ingestão de inventário automotivo, diffs de estoque, feeds XML Meta DAA, autenticação JWT, dashboard workspace-scoped e billing Stripe.

**Wiki:** [backend-api](https://github.com/saas-auto-catalogo/.github/blob/main/docs/wiki/backend-api.md) · [Roadmap](https://github.com/saas-auto-catalogo/.github/blob/main/docs/wiki/roadmap.md)

---

## Stack

- **Runtime:** Node.js 22 LTS / TypeScript 5.7+ (NodeNext)
- **HTTP:** Fastify 5 — compressão GZIP, CORS com credentials, cookies httpOnly
- **ORM:** Prisma 6 + PostgreSQL (multi-tenant shared schema)
- **Filas:** BullMQ 6 + Redis
- **Auth:** JWT access token + refresh token em cookie httpOnly
- **Integrações:** Meta Graph API v21, Stripe, Resend (email)

---

## Módulos

```
src/modules/
├── auth/           # Login, register, refresh, logout, forgot/reset, /me
├── feeds/          # CRUD feeds + sync manual (BullMQ SYNC_FEED)
├── dashboard/      # Stats, vehicles, meta-catalogs, issues, activity, audit-logs
├── billing/        # Plano, limites, Stripe Customer Portal
├── meta-feed/      # XML público Meta DAA
├── meta-connector/ # OAuth Meta
├── xml-ingestion/  # Parser SAX streaming
├── stock-diff/     # Motor de diffs (CREATE, UPDATE, SOLD)
└── normalization/  # Auto-matching de marcas, anos, preços
```

---

## Rotas principais

| Área | Exemplos |
|------|----------|
| Público | `GET /health`, `GET /api/v1/feeds/:token/meta-vehicles.xml` |
| Auth | `POST /auth/login`, `/register`, `/refresh`, `/logout`, `GET /auth/me` |
| Dashboard | `GET /workspaces/:id/dashboard/stats`, `/issues`, `/activity` |
| Estoque | `GET /workspaces/:id/vehicles`, `/vehicles/:vehicleId` |
| Feeds | `GET/POST/PUT/DELETE /workspaces/:id/feeds`, `POST .../sync` |
| Auditoria | `GET /workspaces/:id/audit-logs` (MANAGER+) |
| Billing | `GET /workspaces/:id/billing`, `POST /billing/portal` |
| Meta | `GET /integrations/meta/auth-url`, `POST /integrations/meta/callback` |

Lista completa e RBAC na [wiki](https://github.com/saas-auto-catalogo/.github/blob/main/docs/wiki/backend-api.md).

---

## Execução local

### Pré-requisitos

- Node.js >= 22
- PostgreSQL 15+
- Redis 7+

### Setup

```bash
npm install
cp .env.example .env   # ajustar DATABASE_URL, REDIS_URL, JWT_SECRET, FRONTEND_URL

npm run prisma:validate
npm run prisma:generate
npx prisma migrate dev
npm run prisma:seed
npm start              # http://localhost:3333
```

Worker de sync (terminal separado):

```bash
npm run worker:sync-feed
```

### Variáveis importantes

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | PostgreSQL |
| `REDIS_URL` | Redis para BullMQ e cache |
| `JWT_SECRET` | Assinatura dos access tokens |
| `FRONTEND_URL` | Origem CORS (ex.: `http://localhost:3000`) |
| `PORT` | Padrão `3333` no código |

---

## Testes

<<<<<<< Updated upstream
| Comando | Escopo |
|---------|--------|
| `npm run test:auth` | Register + cookie refresh |
| `npm run test:rbac` | Permissões por role |
| `npm run test:feeds` | CRUD e sync |
| `npm run test:dashboard` | Stats, vehicles, audit-logs, issues, activity |
| `npm run test:subscription` | Stripe lifecycle e billing |
| `npm run test:parser` | SAX streaming com fixtures reais |
| `npm run test:meta-feed` | XML Meta DAA, ETag, cache |
| `npm run test:all` | Suite agregada |

---

## Credenciais de desenvolvimento

Após o seed:

- **Email:** `carlos.silva@autoelitemotors.com.br`
- **Senha:** `Teste123!`
=======
| Comando | Escopo do Teste |
|---|---|
| `npm run test:infra` | Smoke test de filas BullMQ, cache Redis e rate limiting |
| `npm run test:parser` | Teste do SAX Streaming Parser com 6 fixtures reais XML (AutoCerto, Altimus, Sisvag, BomControle, Webmotors) |
| `npm run test:normalization` | Teste de Auto-Matching e normalização com feeds reais JSON (4Boss, JRCA) e XML |
| `npm run test:diff` | Teste dos 4 cenários do motor de Diffs (Inserção, Inalterado, Preço/Km e Vendidos) |
| `npm run test:meta-feed` | Teste da geração de XML Atom Meta DAA, ETag (304 Not Modified) e latência em cache |
| `npm run test:meta-connector` | Teste de autenticação OAuth 2.0 (Anti-CSRF), Graph API e diagnósticos |
| `npm run test:auth` | Register + cookie refresh |
| `npm run test:rbac` | Matriz de permissões e isolamento multi-tenant |
| `npm run test:feeds` | CRUD e sync de feeds |
| `npm run test:dashboard` | Stats, vehicles, audit-logs, issues, activity |
| `npm run test:ci` | **Subset do CI** — auth, rbac, dashboard, feeds, db, email |
| `npm run test:all` | Suite agregada completa |

### CI (GitHub Actions)

O workflow `.github/workflows/ci.yml` roda em PRs e pushes em `main`:

- **Job `unit`:** prisma validate, typecheck, test:qa, parser, normalization, diff, meta-feed, meta-connector, vehicles
- **Job `integration`:** Postgres + Redis, migrate deploy, seed, `npm run test:ci`

Reproduzir integração localmente:

```bash
docker compose up -d
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/auto_catalogo_db?schema=public
export REDIS_URL=redis://localhost:6379
npx prisma migrate deploy && npm run prisma:seed
npm run test:ci
```
>>>>>>> Stashed changes
