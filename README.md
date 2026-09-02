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
├── feeds/          # CRUD feeds, validate-url, sync manual (BullMQ SYNC_FEED)
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
| Auth | `POST /auth/login`, `/register`, `/refresh`, `/logout`, `GET /auth/me`, `PATCH /auth/me/onboarding` |
| Dashboard | `GET /workspaces/:id/dashboard/stats`, `/issues`, `/activity` |
| Estoque | `GET /workspaces/:id/vehicles`, `/vehicles/:vehicleId` |
| Feeds | `GET/POST/PUT/DELETE /workspaces/:id/feeds`, `POST .../feeds/validate-url`, `POST .../sync` |
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

| Comando | Escopo |
|---------|--------|
| `npm run test:qa` | Suite QA (parser, validadores, benchmarks) |
| `npm run test:parser` | SAX streaming com fixtures reais |
| `npm run test:normalization` | Auto-matching e normalização |
| `npm run test:diff` | Motor de diffs de estoque |
| `npm run test:meta-feed` | XML Meta DAA, ETag, cache |
| `npm run test:meta-connector` | OAuth Meta, anti-CSRF |
| `npm run test:vehicles` | Validador de veículos (fixtures JSON) |
| `npm run test:auth` | Register + cookie refresh |
| `npm run test:rbac` | Permissões por role |
| `npm run test:feeds` | CRUD, validate-url e sync |
| `npm run test:validate-url` | Validação de URL de feed (XML/JSON/timeout) |
| `npm run test:dashboard` | Stats, vehicles, audit-logs, issues, activity |
| `npm run test:db` | Validação de schema, migrations e seed |
| `npm run test:email` | Templates e envio sandbox |
| `npm run test:subscription` | Stripe lifecycle e billing |
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

---

## Credenciais de desenvolvimento

Após o seed:

- **Email:** `carlos.silva@autoelitemotors.com.br`
- **Senha:** `Teste123!`
