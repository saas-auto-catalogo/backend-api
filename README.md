# âš™ï¸ SaaS Auto CatÃ¡logo â€” Backend API

Core da plataforma SaaS multi-tenant responsÃ¡vel pela ingestÃ£o de inventÃ¡rio automotivo, diffs de estoque em tempo real e geraÃ§Ã£o de catÃ¡logos otimizados para o Meta Ads.

## ðŸ› ï¸ Stack TecnolÃ³gica
- **Linguagem**: TypeScript (Node.js 22 LTS)
- **Framework**: Fastify / NestJS
- **ORM & Banco**: Prisma ORM + PostgreSQL multi-tenant
- **Filas & Cache**: Redis + BullMQ
- **IntegraÃ§Ãµes**: Meta Graph API (Business SDK), Feeds XML (Fast-XML-Parser / SAX)

## ðŸš€ Estrutura de MÃ³dulos
- \src/modules/tenancy\: Isolamento de workspaces, memberships e RBAC (\SUPER_ADMIN\, \OWNER\, \MANAGER\).
- \src/modules/xml-ingestion\: Stream parser resiliente e mapeador dinÃ¢mico de schemas (AutoCerto, Altimus, Sisvag, BomControle).
- \src/modules/stock-diff\: Motor de cÃ¡lculo de alteraÃ§Ãµes de estoque e detecÃ§Ã£o de veÃ­culos vendidos/novos.
- \src/modules/meta-catalog\: Exportador de feed XML em conformidade com Meta Automotive Inventory Ads (DAA).
- \src/modules/backoffice\: Endpoints para gestÃ£o operacional, impersonation e telemetria global.