# RetailFlow Backend

Express and TypeScript API for the local POS simulator. It uses embedded
PostgreSQL through PGlite and stores its local database under `.local/postgres`.

## Run

```sh
npm install
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

See [`docs/architecture.md`](docs/architecture.md) for the canonical system,
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
[portfolio data-mode guide](../DATA_MODE_AND_ARCHITECTURE.md) for deployment
boundaries.