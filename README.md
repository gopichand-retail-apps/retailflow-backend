# RetailFlow Backend

![CI](https://github.com/gopichand-retail-apps/retailflow-backend/actions/workflows/ci.yml/badge.svg)

[Architecture guide](docs/architecture.md) — source map, workflows, contracts, data, security, and checks.

## Repository layout and deployment boundary

This independent repository owns RetailFlow's Express / TypeScript API and authoritative PGlite state. The UI is the separate [retailflow-frontend](https://github.com/gopichand-retail-apps/retailflow-frontend) repository. Keep the current directory names, Git histories, origins, and independent builds.

The Vercel configuration belongs to the frontend only. This API has no verified Vercel deployment adapter. The local file database is not shared durable storage for stateless function instances. Do not deploy the local simulator as a public API or point it at real records.

Use Node **24.15.0**, npm, and the committed package-lock.json. From the full Retail Apps workspace, `./scripts/Start-Apps.ps1 -App RetailFlow` uses the correct built/native entry after setup. From this repository alone, install with npm.cmd ci, build with npm.cmd run build, then run npm.cmd start.

Health: http://127.0.0.1:5002/health. Direct startup stores data under `.local/postgres`; the workspace launcher can select a separate app-owned path. The [API contract](openapi.json) and [canonical architecture](docs/architecture.md) describe the existing routes and trust boundaries. The architecture guide is inside this repository.

Known release gaps: Demo-role login is disabled by NODE_ENV=production. Production identity, store isolation, recovery, and hosting remain open. The baseline has formatting and Windows path-test failures.

Express and TypeScript API for the local POS simulator. It uses embedded
PostgreSQL through PGlite and stores its local database under `.local/postgres`.

## Run

```sh
npm ci
npm run dev
```

The API binds to `127.0.0.1:5002`. Configure values with `.env`; see
`.env.example`. The Vite client origin defaults to `http://127.0.0.1:5001`.

## Routes

- `GET /health`
- `GET /api/v1/auth/demo-roles` (development only)
- `POST /api/v1/auth/demo-login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout`
- `GET /api/v1/overview`, `GET /api/v1/products?q=...`
- `POST /api/v1/products/:productId/adjustments`
- `GET /api/v1/sales`, `POST /api/v1/sales/quote`, `GET /api/v1/sales/:saleId`, `POST /api/v1/sales`
- `POST /api/v1/sales/:saleId/returns`
- `GET /api/v1/settings`, `PATCH /api/v1/settings`

The legacy `/api` mount exists only in non-production environments for local compatibility.

The OpenAPI 3.1 contract is in [`openapi.json`](openapi.json). It documents the
cookie session, role requirements, request validation, idempotency headers,
responses, and error envelope for the current routes.

See [repository architecture](docs/architecture.md) for the canonical system,
data-flow, schema, and workflow diagrams, and
[`docs/security/threat-model.md`](docs/security/threat-model.md) for the local
prototype's trust boundaries and unresolved risks.

All state-changing sales and return requests require an `Idempotency-Key` header.
The server validates input, enforces store roles, calculates prices, and writes
inventory, sale, tender, return, and audit records in transactions.

## Checks

```sh
npm run format:check
npm run lint
npm run typecheck
npm run validate:openapi
npm test -- --coverage
npm run build
npm audit
```

Sales use integer USD minor units and simulated tenders only. The sample tax rate
is a configurable arithmetic example, not a tax calculation or legal guidance.
This local demo has no real identity provider, processor, card capture, customer
records, or production deployment configuration.

The frontend's `VITE_IS_MOCK` switch selects the mock or live API origin; role
choices, synthetic sessions, and business data remain API-backed in either
mode. This backend's demo-role discovery and role login are disabled when
`NODE_ENV=production`. The current local API and PGlite data are synthetic and
do not provide a real identity provider or production database. See the
[portfolio data-mode guide](docs/architecture.md#10-build-checks-and-deployment) for deployment
boundaries.
