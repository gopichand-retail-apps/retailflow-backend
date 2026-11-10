# RetailFlow Threat Model

## Scope and Assumptions

RetailFlow is a local-only point-of-sale learning prototype with synthetic
identities and records. It binds to loopback addresses. Cash and sandbox tenders
are simulations; no card, bank, or customer payment credentials are collected.
This document is an implementation review, not a penetration test or security
certification. Revisit it before adding external integrations or deployment.

## Assets and Trust Boundaries

| Asset                                    | Security property                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| Sale totals, refunds, and tender records | Integrity; server calculation and atomic writes                               |
| Product stock and inventory movements    | Integrity; no negative stock and auditable changes                            |
| Demo sessions and role assignments       | Confidentiality and authorization; opaque session token, hashed token at rest |
| Synthetic catalog and store records      | Store-scoped access and integrity                                             |
| Request logs and audit events            | Correlation without credentials or raw request payloads                       |
| Browser pending queue                    | Local availability only; schema-validated and never authoritative             |

Trust boundaries are the browser-to-API HTTP boundary, API-to-PGlite persistence
boundary, and application-to-log output boundary. No third-party service or
PortfolioOps collector is connected. The browser is attacker-controlled; all
prices, roles, and stock changes are revalidated on the server.

## Abuse Cases and Controls

| Abuse case / entry point                                                    | Existing control and evidence                                                                                                                                                                        | Residual risk                                                                                                                    |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Change client-supplied price, discount, role, or stock through API requests | Zod request validation, database-owned role and product price, server-side price calculation, role middleware, stock constraints and transactional writes                                            | The demo identity picker is not production authentication; broader two-user and cross-store authorization coverage is incomplete |
| Read or modify another store's sale or product                              | Routes and service queries carry the authenticated user's `storeId`; API denies unauthenticated access                                                                                               | Only synthetic local data is supported; an exhaustive two-store BOLA/IDOR integration matrix is not present                      |
| Replay a checkout or race returns to duplicate stock/refund changes         | Unique idempotency keys, transactional sale/return writes, sale-row lock, serialized PGlite transaction queue; unit/integration regression tests cover duplicate/concurrent returns                  | Idempotency retention and multi-process database behavior are not production-tested                                              |
| Forge a browser origin or exploit cookie-authenticated writes               | Explicit CORS origins, production rejects loopback aliases, mutating browser requests validate `Origin`, cookie is HttpOnly and SameSite=Lax; Secure is set in production mode                       | No independent CSRF token; deployed proxy/TLS/Cookie behavior has not been verified                                              |
| Inject SQL or oversized/untrusted payloads                                  | Parameterized SQL, Zod schemas, strict JSON parsing, 32 KB body limit                                                                                                                                | Query-cost, concurrency, and general API rate limits are not configured                                                          |
| Expose credentials or personal payloads through logs/errors                 | Pino redacts cookie and authorization headers; `src/app.test.ts` verifies cookie/authorization redaction; request/trace IDs are correlated in generic error envelopes; logging avoids request bodies | Centralized log retention/access controls are not configured                                                                     |
| Exploit a vulnerable dependency                                             | `npm audit` runs in CI and currently reports zero vulnerabilities for both repos                                                                                                                     | Audit does not cover SAST, secret history, container/IaC, license provenance, or manual penetration testing                      |

## Verification Status

The backend tests exercise role denial, request validation, CORS behavior,
idempotency, transactional checkout/returns, and concurrent return conflicts.
The frontend suite covers checkout, error states, the offline draft queue, and
component flows; Playwright covers a simulated cash checkout. These checks do
not replace the blueprint's full endpoint matrix (anonymous, owner, other user,
other store, malformed/oversized input, replay, concurrency, dependency failure,
rate limit, unexpected exception, and log redaction).

## Required Before External Deployment

- Add a real identity provider, account-level abuse controls, session revocation,
  and a complete cross-user/cross-store authorization test matrix.
- Provision a supported PostgreSQL service with separate least-privilege app and
  migration roles, TLS, backups, restore tests, and documented retention.
- Configure production TLS, explicit origins, cookie policy, proxy trust, rate
  limits for relevant routes, and reviewed response/security headers.
- Add secret scanning, SAST, dependency provenance review, incident and migration
  runbooks, and a documented security review. Keep log-redaction regression tests
  passing as log fields or middleware change.
- Implement consent-aware browser telemetry and PortfolioOps only with schema
  validation, service authentication, redaction, rate limiting, and retention.
- Meet and enforce the APP-01 coverage target: current line/branch coverage is
  below 90%; coverage thresholds are not yet configured in CI.

Never expose the current local services publicly or describe this prototype as
PCI-compliant, legally tax-compliant, or production-ready.
