# APP-01 RETAILFLOW — Standalone Agent Instructions

**Standalone file:** Copy this entire document into the application's `AGENTS.md` (or agent instruction context). It embeds the shared standards, PortfolioOps logging-first plan and this app's own blueprint. Read the whole file before changes, then revisit relevant sections on each task.

# PORTFOLIO ENGINEERING MASTER AGENT INSTRUCTIONS
Version 4.2 | 2026-11-01 | Scope: all 10 portfolio applications and observability console

## 0. Authority and execution contract
This file is normative. Read it at the start of EVERY task and reread the relevant sections before UX, frontend, backend, database, security, test, observability, or deployment edits. Read the project-specific APP-XX.md alongside it. Never assume a screenshot or marketing reel is authoritative security advice. Follow the existing repository architecture unless an approved ADR changes it. Prefer small, reviewed increments. Never claim a check ran unless it ran; never claim code is secure merely because a checklist passed.

Required agent workflow: (1) identify affected application, user story and acceptance criteria; (2) inspect existing code, dependencies, contracts, threat model and applicable instructions; (3) propose smallest design and impact; (4) implement code + structured logs + tests + docs together; (5) run formatting, lint, typecheck, unit/integration/e2e/security/coverage/build gates as applicable; (6) document findings and unresolved issues; (7) provide concise changed-files summary, commands/results, risks and next action. Ask before destructive migrations, live payments, exposing services, deleting data or changing secrets. Do not silently disable checks or lower thresholds.

## 1. Portfolio architecture and delivery sequence
Use a modular monolith by default. Microservices are an optional later learning milestone when independently deployed scaling, ownership, or event boundaries justify them. Prefer bounded contexts and clean interfaces over premature service fragmentation. Share design tokens, logger schema, telemetry client, API error envelope, auth test helpers, ESLint/Prettier, CI templates, and documentation in a common packages directory; avoid coupling application databases. Each application must run locally with synthetic fixtures, seeded seeded local identities, health checks and README. The 10 apps have independent releases; a separate PortfolioOps observability console collects sanitized events/metrics.

Global phase 0: monorepo scaffolding and ADRs. Phase 1: shared logging + request IDs + visitor telemetry + PortfolioOps basic dashboard. Phase 2: auth, RBAC, database migrations and seed data. Phase 3: vertical MVP with real UI and API. Phase 4: integration and resilience. Phase 5: accessibility, security hardening, performance, SEO as applicable. Phase 6: deployment, monitoring, smoke checks, product workflow video and documentation. Each app blueprint has its own incremental milestones.

## Version 4.2 shared requirements
The canonical `~/Downloads/PORTFOLIO_COMPLETE_AGENT_PLAYBOOK.md` is version 4.4 and
supersedes older guidance embedded in this standalone snapshot. Architecture diagrams,
design patterns, and engineering roadmaps belong in developer-facing Markdown, never in
product UI. Each app must meet 90% minimum for lines, statements, functions, and branches;
below-gate baselines require an owner-approved, timeboxed exception and must not be
reported as passing. Do not blanket-exclude UI or business logic.

## 2. UX, visual language and accessibility
Use production-oriented product language in user-facing screens and records, not portfolio-showcase labels. State synthetic-data, local-access, simulation, and unsupported-capability boundaries plainly; never imply live financial processing or regulatory certification.
Design from actual user tasks, not from generic AI landing-page templates. Define persona, journey, information hierarchy, navigation, wireframes, design tokens, loading/empty/error/success states, responsive breakpoints and keyboard interactions BEFORE UI coding. Prefer distinct product-specific branding, purposeful type scales, measured spacing, readable color contrast, visual hierarchy, semantic HTML, clear feedback, predictable forms, realistic synthetic content, and honest testimonials only. Use WCAG 2.2 AA as target; test keyboard-only, focus, labels, screen reader names, reduced motion, touch targets and color contrast. Do not blindly ban gradients, Lucide icons, bento layouts, soft corners, purple, Inter, hover animation, emojis or three-column cards: these are design choices, not code smells. Avoid repetitive combinations that make every product indistinguishable. Never fake testimonials, reviews, usage metrics or product capabilities. Provide real screenshots, product workflow walkthroughs and functional examples. Add privacy notice and terms appropriate to actual collection and functionality; obtain legal review for production legal claims.

Design inspiration inventory: Godly (recent.design) for curated landing-page layouts; Realtime Colors (realtimecolors.com) for testing color/typography on a mock site; React Spring (react-spring.dev) for motion when justified; Watermelon UI (ui.watermelon.sh), 21st.dev for component inspiration subject to license, accessibility and dependency review; Fontshare for font discovery with license verification; Modulify, Motionin, Landdding, 60fps, Footer, Recent for patterns/reference, not copying; Thinking Orbs for visible agent progress; Paper Shaders for selective effects. Firmoo, Zenni, EyeBuyDirect, EFE Glasses are eyewear retailers, NOT coding libraries; use only as lawful UX reference for product filters, configurators, virtual try-on patterns and transparent pricing. OmniRoute and Archify require separate provenance/security review before any install; do not execute untrusted binaries. AI image/website references never authorize cloning copyrighted assets.

For frontend changes: inspect existing tokens/components, write component states, maintain responsive layouts, use semantic controls, preserve focus after dialogs, support reduced motion, add visual regression screenshots for important flows, test forms, empty/loading/error cases, and verify real-device widths. No pointless animation or heavyweight dependencies. Use real product operational routes instead of decorative mockups.

## 3. Frontend architecture and performance
TypeScript strict mode; avoid any, unchecked assertions and silent error swallowing. Organize by feature/domain: components, hooks, services, schemas, tests; separate UI from business rules and network adapters. React Query/TanStack Query for server state and cache invalidation where warranted; local state/context for UI state; Redux only for complex cross-feature state. Prefer typed API clients, runtime validation at trust boundaries, AbortSignal cancellation, explicit stale/cache policies, accessible form libraries, error boundaries, suspense or skeleton states as appropriate. Never expose private secrets in VITE_*, NEXT_PUBLIC_*, JS bundles, RN assets or source maps.

Measure LCP, INP, CLS, bundle size, API p95, memory and interaction delays before optimizing. Target LCP <=2.5s, INP <=200ms, CLS <=0.1 at p75 for eligible web views, with documented exceptions for kiosk/offline environments. Use route-level splitting, lazy loading, responsive images, modern compression, correct cache-control/ETag, conditional requests, cache busting, list virtualization, Intersection Observer, selective preload/prefetch/preconnect, gzip/Brotli, request de-duplication and dead-code elimination when measured benefit exceeds complexity. Avoid eager hydration, unnecessary global state, unstable keys, duplicate fetches, and inaccessible custom controls. Mobile: optimize scanning lifecycle, offline queue, retry semantics, low-memory behavior and app resume.

## 4. Backend and database
Node: TypeScript, Node LTS, Express/NestJS with controller -> application service -> domain -> repository separation, centralized error handler, request schema validation (Zod/Joi/class-validator), dependency injection where useful, timeouts, graceful shutdown and health/readiness. Sequelize: model definitions + migrations, constraints/indexes, transaction scopes, optimistic locking for conflicts, paranoid deletes only where appropriate, no sync({alter:true}) in production, avoid N+1 with deliberate eager loading, parameterize raw SQL, use connection pooling and bounded pagination. Prefer Prisma/TypeORM only by explicit ADR; do not mix ORMs casually.

Java: supported Java LTS + Spring Boot, layered controllers/services/repositories, constructor injection, Spring Security, Bean Validation, DTOs instead of exposing entities, @Transactional at business boundaries, JPA fetch planning, Flyway/Liquibase migrations, Actuator health/metrics and structured exception handling. Use virtual threads only when appropriate and measured. Never rely on @Transactional across external network calls. Keep domain logic framework-independent where practical.

Database: PostgreSQL default; schema migrations versioned and reversible where possible; PK/FK/check/unique constraints, indexes based on EXPLAIN, UTC timestamps, decimal money + currency, deterministic sort/pagination, audit history, soft-delete retention policy, backups/restore tests. RLS is mandatory only when chosen database/architecture supports and requires it; for Supabase audit policies on every private table, auth.uid ownership, CRUD, RPC/views/storage and service-role key exposure. Authorization always enforced on server, even with RLS. Multi-tenant access verified in integration tests. Avoid logging entire DB payloads.

API: versioned REST with OpenAPI; typed DTOs, stable error envelope {code,message,requestId,details?}, correct status codes, pagination, filtering, request IDs, idempotency keys for state-changing financial/order actions, optimistic concurrency, timeouts, retry with exponential backoff only on safe/idempotent operations. Use WebSockets for live inventory where justified, not as a default. Events via transactional outbox for cross-boundary workflows; use consumer idempotency, DLQ and replay strategies. Document sequence diagrams and failure paths.

## 5. Mandatory code quality standards
Line length <=120 characters in TS/JS/Java source (reasonable exclusions for URLs, generated code and schemas); Prettier + ESLint max-len and Java Checkstyle or equivalent. Cognitive complexity <=15 per function/method; SonarQube language-specific rules/configuration must be checked and customized if defaults differ. Nesting depth <=3 for loops/conditionals where feasible (explicit lint/Checkstyle/Sonar rule; refactor early returns, extracted functions, maps). Function length target <=50 logical lines; file length target <=400 lines except justified UI compositions/generated code. Max function params 4; prefer named objects beyond that. No unused variables/imports, duplicate code, unreachable code, dead branches, hard-coded credentials, unchecked promises, console.log in production, generic catch swallowing, magic business constants, unsafe casts, or commented-out dead code. Use descriptive names, single responsibility, pure domain functions, no hidden side effects, consistent error handling and dependency injection at boundaries. Circular dependencies forbidden. Architecture tests enforce module boundaries.

SonarQube quality profile: enable relevant reliability, security, maintainability rules; inspect actual rule availability by language/edition rather than claiming every rule exists. Custom quality gate for NEW code: 0 new blocker/critical issues; A reliability/security/maintainability where measurable; 100% security hotspots reviewed; <=3% duplication; >=90% for each coverage metric and >=95% for critical domain logic. Existing legacy code tracked separately with debt register; no hiding issues with blanket exclusions. Sonar may have default coverage thresholds lower than ours; ours is a deliberate custom policy. CI blocks merge if local gate or configured Sonar gate fails. Use ESLint complexity/max-depth/max-len, typescript-eslint, dependency-cruiser, Semgrep/CodeQL as available, SpotBugs/PMD/Checkstyle for Java. Distinguish rule count from severity and actual exploitability.

## 6. Testing standard
Jest + React Testing Library for React; Jest/Vitest by project ADR for Node; JUnit 5 +
Mockito + Spring Boot Test + Testcontainers for Java; Playwright/Cypress for web E2E;
Detox/Maestro for RN where feasible. Coverage must be >=90% for each of lines,
statements, functions, and branches; critical money, auth, authorization, inventory,
and state-machine modules require >=95%. Enforce thresholds in the runner and CI,
including JaCoCo for Java. Exclusions must be path-specific and justified; do not
exclude UI or business logic. A below-gate baseline requires an owner-approved,
timeboxed exception and remains an unmet gate. Coverage does NOT imply correctness.
Test success, invalid input, permission denial, timeout, retries, duplicate requests,
concurrency, database rollback, webhook replay, accessibility and recovery. Add API
contract tests, isolated-DB integration tests, seeded E2E walkthroughs, and negative
cross-user tests. Never use production personal data. Avoid flaky sleeps; control
clocks/network and assert observable behavior.

## 7. Security and threat-model contract
Start each app with trust boundaries, assets, roles, abuse cases and STRIDE/OWASP ASVS mapping. Check (1) secret scanning in working tree/Git history, client bundles, logs and env; revoke/rotate leaks (2) intentionally public vs privileged keys (3) authN/authZ and per-resource ownership, IDOR/BOLA across GET/POST/PUT/PATCH/DELETE, exports and nested resources (4) RLS/grants where relevant (5) data encryption in transit/at rest, key rotation and retention (6) HttpOnly Secure SameSite cookies, CSRF protections if cookie auth, short sessions, token revocation (7) Argon2id/bcrypt/scrypt through trusted auth provider; never plaintext/fast hashes (8) login/API rate limits and abuse controls (9) prepared SQL, input schema validation, context-aware output encoding and CSP (10) upload MIME/content checks, size limits, malware scanning when needed, isolated storage (11) least-privilege DB/service credentials and response field allowlists (12) HSTS, CSP, frame/referrer/content-type policies (13) HTTPS (14) dependency, container, IaC and secret scanning (15) CORS explicit allowed origins, not a substitute for auth (16) debug/error information disabled in production (17) least-privilege admin routes (18) safe logging and retention (19) backup/restore and incident runbooks (20) CI supply-chain integrity and pinned actions.

Security audit output for EACH finding: asset, entry point, evidence (never raw secrets), exploit preconditions, severity/likelihood/impact, code location, mitigation, regression test, verification, unresolved risks. Verify separate users cannot access one another's resources; use 403/404 without leaking private details. Never blindly rewrite architecture or pretend automated scanners are penetration tests. Payments/banking are SIMULATED or sandbox only; no live money movement or storage of card PAN/CVV.

## 8. Logging and observability — FIRST IMPLEMENTATION PHASE
Implement a shared @portfolio/telemetry package and per-language adapters before business features. JSON structured logs to stdout; OpenTelemetry traces/metrics when feasible; Pino for Node, SLF4J + Logback JSON encoder for Spring, client telemetry SDK for React/RN. Every request gets requestId + traceId propagated through HTTP and events. Levels TRACE (local only), DEBUG (local only), INFO (state/happy path), WARN (recoverable anomaly), ERROR (failed operation), FATAL (unrecoverable process). Do not confuse audit events, logs, metrics and analytics: separate pipelines with common IDs.

Canonical server log fields: timestamp ISO8601 UTC, level, service, environment, version, eventName, requestId, traceId, spanId, routeTemplate, httpMethod, httpStatus, durationMs, outcome, errorCode, userIdHash or anonymousSessionId, tenantIdHash where needed, entityType, entityIdHash, retryCount, metadata allowlist. NO passwords, access/refresh tokens, cookies, authorization headers, full card/bank data, raw sensitive payloads, personal addresses or unredacted stack traces in browser. Request/response payload logging OFF by default; when debugging use explicit allowlisted and redacted fields, with sampled short retention. Error logs include safe error code and server-only stack with restricted access. Frontend page_view events are opt-in/consent-aware as required, deduplicated per navigation; exclude bots/health checks from visitor estimates and label uniques as approximate.

PortfolioOps separate application: collector endpoint POST /v1/events with schema validation, rate limits, API keys per service, ingestion queue/DB, daily aggregates; UI pages Overview, Traffic, Services, Requests, Errors, Latency, Business Events, Traces, Alert Rules. Metrics: sessions, approximate unique visitors, page views, API calls, success/error rate, p50/p95/p99 latency, 4xx vs 5xx, feature usage, crash rate, queue depth, ingestion lag, uptime, deploy markers. Do not calculate exact people from raw IPs. No storing raw IP longer than necessary; anonymize/truncate and publish privacy notice. Implement retention (e.g. dev logs 7d, aggregate 90d configurable), sampling, cardinality controls, and access controls. Free-friendly MVP: service JSON stdout + lightweight collector + PostgreSQL; optional Grafana/Prometheus/Loki/OTel Collector later if hosting capacity permits.

Logging phase acceptance: structured request log on success and failure; correlation IDs cross service; client error boundary event; collector accepts valid and rejects malformed event; secret-redaction test; one dashboard shows traffic + errors + p95 latency by app; no production payload leaks; unit/integration tests and runbook. Example JSON: {"timestamp":"2026-10-30T12:00:00Z","level":"INFO","service":"retailflow-api","eventName":"sale.completed","requestId":"portfolio-request-123","httpStatus":200,"durationMs":84,"outcome":"success","metadata":{"itemCount":3}}.

## 9. SEO, launch, free hosting and compliance
For public indexable sites: Google Search Console verification, XML sitemap of canonical public URLs, robots.txt, canonical/metadata, Open Graph/Twitter previews, Bing Webmaster Tools, accessible titles, meaningful copy, page speed, structured data only when accurate. llms.txt is experimental/optional and not a ranking hack. Block private/admin/synthetic-data routes from indexing as appropriate. Use Cloudflare Pages for static frontend, Neon Postgres for limited synthetic seeded data, Clerk or self-hosted auth, Resend for transactional email, Cloudflare R2 for object storage when needed; verify live free-tier limits and privacy requirements before selecting. Backend hosting is a separate decision (Workers compatibility vs always-on Node/Java service). Never claim unlimited free hosting, zero costs, or guaranteed uptime. Secrets stored in provider secret manager. Use staging and prod environments, domain TLS, migrations, rollback plan, health probes, synthetic smoke tests, backup restore exercise, monitoring alerts and security contact. No analytics without appropriate disclosures/consent.

## 10. Agent prompt templates and checkpoints
UX task: "Read MASTER sections 0,2,3,5,6 and APP blueprint. Produce user journeys, information architecture, design tokens, accessibility matrix, wireframe states, and tests. Implement only after acceptance criteria are explicit. Verify responsive, keyboard and reduced-motion behavior."
Frontend task: "Read sections 0,2,3,5,6,8. Inspect component conventions and API schema; implement feature with loading/empty/error states, typed fetch, telemetry, tests, accessibility and performance measurements."
Backend task: "Read sections 0,4,5,6,7,8. Identify domain boundary and transactional consistency; implement DTO validation, authorization, safe persistence, logs, metrics, migrations, tests and OpenAPI changes."
Security task: "Read sections 0,4,5,6,7,8. Map trust boundaries and inspect actual code/config/Git history; prioritize evidenced risks; make minimal fixes; add negative tests; rescan; report manual verification required."
Observability task: "Read sections 0,6,7,8 and project blueprint. Add canonical logs, trace propagation, safe client events, collector ingestion and metrics dashboard before feature instrumentation."
Release task: "Read all applicable sections. Execute format/lint/typecheck/unit/integration/e2e/coverage/scan/build/smoke; verify privacy/terms and search metadata; report every gate and unresolved risk."

## 11. Definition of Done
Architecture and README deliverables for every app:
- Maintain a canonical `docs/architecture.md` in the app-specific source-of-truth repository. Include C4 context and container diagrams, data-flow diagrams with trust boundaries and persistence, ERD and data ownership, API and event contracts, and deployment boundaries.
- Document each primary user scenario with roles, preconditions, step-by-step explanatory text, sequence or workflow charts, success and failure paths, recovery behavior, authorization rules, and relevant logs or metrics.
- The README must explain the app purpose and users, end-to-end behavior, architecture at a high level, local setup and configuration, limitations, and how it integrates with related portfolio apps through versioned APIs or events rather than shared databases.
- When frontend and backend live in separate repositories, each README must describe its repository responsibility, startup/configuration, and integration contract, and link to the canonical architecture document. Keep these documents current with code and contract changes.

Story meets documented acceptance criteria; no hard-coded secrets; auth and ownership checks tested; migrations reviewed; all changed routes have error and happy-path structured logs; metrics do not leak PII; UX states and accessibility verified; relevant tests pass at coverage threshold; lint/typecheck/quality gate/security scan pass; performance budgets reviewed; README/OpenAPI/ADRs updated; synthetic seeded data and deployment verified. Failed checks explicitly block completion unless documented exception is approved. Never fabricate output, links, results or tests.

## 12. Cross-application conventions
Repository layout: apps/{retailflow,commercehub,stocksync,fincore,paybridge,fulfillops,retailpulse,shopsense-ai,wealthtrack,scango,portfolioops}; packages/{design-system,telemetry,api-contracts,eslint-config,tsconfig,testing}; docs/{architecture,adr,security,runbooks}. Each app owns its data and domain. Inter-app integrations use contracts/events with mock adapters; apps work independently. Start with RetailFlow + PortfolioOps shared telemetry, then StockSync and CommerceHub to complete end-to-end retail flow; proceed PayBridge, FulfillOps, RetailPulse, ScanGo, FinCore, WealthTrack, ShopSense AI. Keep all apps independently runnable and use seeded synthetic data.



## 13. Backend security hardening: mandatory additional controls

### 13.1 Threat model before endpoint implementation
- Maintain a data-flow diagram showing browsers, mobile clients, API gateways, auth providers,
  databases, queues, object storage, third-party services and PortfolioOps.
- Document every trust boundary, privileged identity, sensitive asset, authorization rule,
  and abuse case. Review again when a new integration or external input is introduced.
- Apply deny-by-default authorization, least privilege and separation of duties.
- Enforce authentication AND resource-level authorization on every applicable server action,
  including exports, batch jobs, admin actions, GraphQL resolvers, WebSocket subscriptions,
  background workers and object-storage downloads.
- Test BOLA/IDOR and broken function-level authorization with two independent test identities.
- For admin actions, use stronger authentication, role checks, audit events and step-up
  authentication when risk warrants it. Never trust a client-supplied role, tenant or price.

### 13.2 Credentials, identity and sessions
- Prefer mature identity providers or established framework libraries to custom auth.
- Use Argon2id for locally stored passwords where supported; otherwise use a well-configured
  supported password hashing algorithm with unique salts and documented upgrade strategy.
- Store refresh/session credentials securely, rotate when applicable, revoke on logout and
  credential reset, and test session fixation and expiration.
- Use Secure, HttpOnly, SameSite cookies when cookie sessions are selected; implement CSRF
  protection on state-changing requests. Apply explicit CORS allowlists, not wildcard
  credentialed origins. Never confuse CORS with access control.
- Rate limit by account and network signals with careful proxy configuration; use
  progressive abuse controls, generic login/reset responses and bounded lockouts.
- Prevent account enumeration, brute force, credential stuffing and reset-token reuse.
- Rotate exposed secrets immediately; removing a secret from Git does not revoke it.
  Use secret scanning on current files, history and built assets. Do not print secret values.

### 13.3 APIs, inputs and business logic
- Validate every untrusted boundary with runtime schemas, including body, params, query,
  headers, webhook payloads, events, imports and third-party API responses.
- Allowlist writable fields and enforce server-owned values for userId, tenantId, role,
  price, discounts, fees, stock adjustments and transaction status.
- Use prepared statements / ORM parameter binding; review unsafe raw SQL, dynamic sorting
  and identifiers. Avoid unsafe object merging and prototype pollution.
- Use context-appropriate output encoding, sanitized rich text where required, restrictive
  CSP and no unsafe HTML insertion.
- Limit body size, nesting, array size, query cost, pagination size and concurrency.
  Add timeouts, circuit breakers and bounded retries with jitter for remote calls.
- Prevent SSRF: allowlist outbound destinations, block private/link-local/metadata targets,
  validate redirects and DNS resolution, and restrict egress when feasible.
- Verify webhook signatures against the exact raw request body, check freshness, and
  deduplicate deliveries; use an idempotency store with bounded retention.
- For uploads: authenticate, authorize, limit size/type/count, inspect magic bytes,
  randomize storage names, isolate storage, scan when appropriate, and prevent public
  execution of uploaded content.
- Use cryptographically secure randomness for security tokens. Do not invent encryption.

### 13.4 Database, transactions and data protection
- Create separate least-privilege application, migration and read-only database roles.
- Do not run the app with superuser/service-role privileges. Restrict network access and
  require encrypted DB connections when traversing untrusted networks.
- Enforce database constraints and transactions for invariants; do not rely on UI checks.
- For money: use integer minor units or exact decimal types, never floating-point money;
  balance ledgers atomically and verify invariant preservation under concurrent requests.
- For inventory: prevent negative stock and double reservation using transactional
  locking/optimistic concurrency and retry-safe commands.
- For Supabase: public/anon keys may be client-side only with correct RLS; service-role
  keys are server-only. Review policies for SELECT, INSERT, UPDATE and DELETE separately.
- Encrypt sensitive data at rest when warranted; manage keys separately, rotate them,
  minimize collection, document retention/deletion and test restore.
- Use synthetic data for banking and payment product walkthroughs; no real card PAN/CVV or banking
  credentials, and no claims of PCI compliance from a portfolio prototype.

### 13.5 Infrastructure, supply chain and deployment
- Enable TLS, appropriate HSTS, CSP, Referrer-Policy, X-Content-Type-Options,
  frame protections, safe caching and restricted admin access.
- Disable stack traces and debug endpoints in production; use generic public errors
  correlated to private request IDs.
- Run dependency, SAST, secret, container and infrastructure scans; triage findings,
  pin CI actions, protect default branches, and review dependency provenance/licenses.
- Run services as non-root where possible, use minimal images, resource limits,
  health probes, environment separation, safe migrations and rollback procedures.
- Protect telemetry ingestion from spoofing, replay, event flooding and unbounded
  cardinality. Redact sensitive fields at source and again at collector.
- Log security events separately from application errors, restrict read access, define
  retention, and ensure a compromised app cannot rewrite centralized security logs.

### 13.6 Required security verification matrix
For every endpoint and state-changing operation, test: anonymous access; normal owner;
another user; another tenant; insufficient role; malformed input; oversized payload;
duplicate/replayed request; concurrency race; unavailable dependency; rate limit;
unexpected exception; and safe audit/log redaction. Record applicability and exclusions.
Use OWASP ASVS 5.0 as the verification checklist and OWASP API Security Top 10
as the abuse-case inventory. Security scanners and passing tests do not prove security.

## 14. Quality automation and exact rule ownership
These are project-selected policies, NOT claims about default SonarQube settings:
- max line width: 120; ESLint max-len, Prettier printWidth, Checkstyle LineLength.
- cognitive complexity: 15 per function; Sonar rule S3776 configured for each language.
- nested control flow: target <=3; ESLint max-depth / Java static analysis as applicable.
  A limit on nested loops is distinct from a limit on all nested control structures.
- coverage: >=90% for lines/branches/functions/statements in each testable app;
  >=95% for critical domain packages; new-code coverage >=90%.
- duplicated new code <=3%; no new blocker/critical vulnerabilities or unreviewed
  security hotspots; no high-confidence leaked secrets.
- no unsafe TypeScript `any` without documented exception, floating promises,
  broad eslint-disable, unused exports, cyclic domain imports or accidental N+1.
- prefer immutable DTOs, named constants, early returns, bounded function size,
  descriptive naming, pure business functions, and explicit error semantics.
- ensure no merge with failing lint, typecheck, unit/integration tests, coverage,
  SAST, secret scan, migration validation or configured Sonar quality gate.
- SonarQube does NOT automatically run Jest tests: CI runs tests and imports LCOV/
  JaCoCo coverage reports. Free/community edition capabilities vary; verify
  edition, language support and CI integration rather than assuming every rule exists.
- Never game coverage with empty assertions, test-only branches or excessive exclusions.
- CI should report skipped checks distinctly from passed checks.

## 15. External resource policy and screenshot reconciliation
The screenshots repeat a core set of security controls: secrets, authorization,
database isolation, password storage, input handling, injection prevention, headers,
HTTPS, rate limits, dependency scanning, safe logging and deployment verification.
Deduplicate them into sections 7 and 13. UI reels describe inspiration, not universal
design rules: evaluate usability, accessibility, performance, license and project fit.
- Archify: investigate as a diagram/architecture aid; do not treat an unknown
  installation as trusted.
- OmniRoute (https://github.com/diegosouzapw/OmniRoute): optional local AI model
  gateway for ShopSense AI development only after license, provenance, auth,
  rate limit, data-flow and secret-storage review. Not required by any app.
- Godly/recent.design, Realtime Colors, React Spring, Watermelon UI, 21st.dev,
  Fontshare and design galleries: optional inspiration or dependencies after review.
- Firmoo: eyewear e-commerce retailer, not a developer tool; useful only as a
  comparative UX example for catalog, product filters, pricing and try-on.
- Cloudflare Pages, Neon, Clerk, Resend, R2: deployment options, not guaranteed
  permanently free; recheck limits, availability and data policies before use.
- SEO: sitemap, canonical URLs, metadata, Open Graph, Search Console and Bing
  Webmaster Tools for public pages; llms.txt is optional, not an SEO guarantee.
- Do not clone copyrighted UI/assets, claim a security audit was executed without
  evidence, or install unknown binaries merely because they appear in a reel.

## 16. Mandatory agent response template after EVERY change
1. Task and affected domain/architecture boundary.
2. Files inspected and changed; migrations/API contracts/events modified.
3. Threats considered and authorization rules enforced.
4. Logs/events/metrics added; redaction verification.
5. UX/accessibility/performance impacts, if applicable.
6. Exact commands run and pass/fail/skipped status (never invent results).
7. Coverage by scope, Sonar/quality-gate status, remaining vulnerabilities.
8. Manual checks and risks; next smallest implementable step.


# PortfolioOps — First Sprint Implementation Plan

## Sprint objective
Before business features, create one shared log/telemetry contract and a separate read-only console that shows traffic, successes, failures, p95 latency and service status for every portfolio application.

## Recommended minimal components
- `packages/telemetry`: TypeScript types, browser SDK, Pino Node adapter; Spring Boot SLF4J JSON adapter in a shared Java library or starter.
- `apps/portfolioops/collector`: Node/NestJS HTTP ingestion, schema validation, service-specific tokens, rate limits, idempotent event ingestion, batching, safe redaction and retention.
- `apps/portfolioops/web`: React dashboard with Overview, Service Detail, Traffic, Error Explorer and API Latency.
- `apps/portfolioops/db`: Postgres event table + daily/hourly aggregates; partition and retention as volume grows.
- Future: OpenTelemetry Collector, Prometheus, Grafana/Loki when free-hosting resources permit.

## Initial event contracts
Server request completion: timestamp, level, service, env, version, eventName, requestId, traceId, method, routeTemplate, status, durationMs, outcome, errorCode?, safeMetadata.
Browser: page.viewed, session.started, ui.error, interaction.completed; consent-aware, no raw URL query tokens, no user PII.
Business: `<app>.<domain>.<past-tense-action>` with only safe aggregate attributes and requestId.

## Build order
1. Establish JSON schema, allowed fields, forbidden fields, redaction tests.
2. Add middleware to one Node local API and one React portfolio client.
3. Build collector /v1/events with auth, validation, rate limit, idempotency and storage.
4. Build summary SQL: requests by app/day, errors by route, approximate sessions, p95 latency.
5. Build console with accessible filters and time windows; test empty/error states.
6. Add Spring Boot logging adapter, trace header propagation and exception handler.
7. Integrate RetailFlow first, then every other app.
8. Add CI checks, retention job, health check, smoke test, alerts and deployment runbook.

## Acceptance tests
Valid event accepted; malformed/oversized event rejected; secret-containing metadata redacted; duplicate event idempotent; inaccessible cross-service data blocked; request and client events correlated; no analytics collected contrary to consent; p95 calculations checked; dashboard displays realistic seeded data; outage of collector never blocks checkout or transfers.


# APP-01: RetailFlow — Agent Blueprint

**Purpose:** Enterprise point-of-sale. Portfolio application using synthetic identities and records; external financial actions remain simulated.

## 1. Agent boot sequence
Read `MASTER_AGENT_INSTRUCTIONS.md` in full and this blueprint at EVERY task start. Identify task as UX, frontend, backend, data, security, testing, logging or deployment; reread corresponding master sections. Do not bypass CI gates. Default to the stated architecture unless an ADR documents a change.

## 2. Outcome, audience and MVP
**What the app does:** Enterprise point-of-sale.
**Personas/roles:** Cashier, supervisor, store administrator.
**MVP and stretch features:** Cart, barcode scanning, tax, discounts, tenders, split payments, returns, receipts, offline transaction queue, shift close.
**Definition of user value:** User completes the primary workflow end-to-end with realistic seeded data, clear status, failure recovery and accessible controls.

## 3. Technology and architecture
**Recommended stack:** React Native + React + Node.js/Express + PostgreSQL + Redis.
**Style:** Offline-first RN SQLite queue, server authoritative checkout; idempotent sale sync; adapter for scanner SDK.
**Bounded contexts/data model:** CartItem, Product, PriceRule, TaxRule, Sale, Tender, Refund, Shift, Store.
**Critical workflow:** scan -> price -> tax/discount -> reserve inventory -> tender simulation -> receipt -> sync.
**API layers:** HTTP controller -> validated DTO -> authenticated/authorized application service -> domain logic -> transaction-aware repository -> PostgreSQL; publish domain events via outbox where needed. Use versioned REST, OpenAPI, DTOs and explicit error codes. Separate simulated external integrations behind interfaces. Start modular monolith; extract microservices only after documented need.

## 4. UX and screen map
Build role-specific sign-in, overview dashboard, primary list/search/filter screen, detail/editor, step-by-step primary workflow, success/receipt or confirmation, error/retry, audit/history, settings, and admin screen where appropriate. For RetailFlow, visualize cart, barcode scanning, tax, discounts, tenders, split payments, returns, receipts, offline transaction queue, shift close. Define empty/loading/error/success/permission-denied states, mobile/responsive behavior, keyboard navigation, focus, form validation and complete end-to-end workflow. Design a distinct visual identity, not generic cards/gradients. Use Godly and Realtime Colors as research aids, Fontshare licensed typography, 21st.dev/Watermelon UI for reviewed components, React Spring only for purposeful motion. No unlicensed asset copying. WCAG 2.2 AA target.

## 5. Phase-by-phase implementation plan
1. **Foundation:** README, ADR, monorepo app shell, CI, formatter, lint, TypeScript strict, env example, docker compose, test harness, synthetic seed fixtures.
2. **LOGS FIRST:** integrate shared telemetry; request IDs, JSON success/error logs, client page views and error boundary, health endpoint, PortfolioOps ingestion and dashboard slice for this service. Verify redaction and trace propagation.
3. **Domain and DB:** define ERD for CartItem, Product, PriceRule, TaxRule, Sale, Tender, Refund, Shift, Store; constraints, indexes, migrations, seed scripts, repository tests and rollback plan.
4. **Auth and security:** roles (Cashier, supervisor, store administrator), per-record authorization, session protection, API schema validation, rate limits, negative cross-user tests, dependency and secret scans.
5. **Vertical MVP:** implement scan -> price -> tax/discount -> reserve inventory -> tender simulation -> receipt -> sync; build accessible UI + backend + persistence + telemetry + tests as one vertical slice.
6. **Extended features:** progressively implement Cart, barcode scanning, tax, discounts, tenders, split payments, returns, receipts, offline transaction queue, shift close; add conflict/error/offline behavior as applicable.
7. **Quality and release:** Jest/RTL + integration + Playwright/appropriate mobile tests; >=90% overall and >=95% critical-domain coverage; Sonar/CI; OWASP audit; Core Web Vitals or mobile responsiveness; staging smoke tests and portfolio recording.

## 6. Logs, analytics and alerts
Emit structured events for app.opened, page.viewed, api.request.completed, api.request.failed, auth.denied, retailflow.workflow.started, retailflow.workflow.completed, retailflow.workflow.failed. Do NOT log raw request/response bodies, credentials, customer financial information or identifying values. Track: POS throughput, checkout latency, scan failures, offline sync backlog. Include requestId, traceId, route template, status, duration, safe errorCode, and pseudonymous user/session ID. PortfolioOps shows service health, traffic, success/error rate, p95 latency and business-event counts; threshold alerts for repeated errors and elevated latency. Test PII redaction and ingestion failure resilience.

## 7. Tests and CI quality gate
For each workflow: unit test domain invariants; integration test DB transaction and ownership; UI test keyboard, loading/error/success; API contract test; E2E happy path and denied/error path. Mock third-party payments, shipping, AI or identity services in CI. Enforce <=120-character lines, cognitive complexity <=15, nesting <=3, no unused imports, typecheck, coverage >=90% overall and >=95% critical domain, duplication <=3% new code, 100% security hotspots reviewed, zero new critical/blocker issues. Keep rules/config explicit; never silently skip failing tests.

## 8. Threat model and special risks
Apply MASTER section 7. For RetailFlow, focus on privilege escalation across roles (Cashier, supervisor, store administrator), IDOR on CartItem, Product, PriceRule, TaxRule, Sale, Tender, Refund, Shift, Store, replay/duplicate workflow calls, injection, session theft, data leaks, insecure logs, and concurrency anomalies. Ensure server-side permissions on every read/write. For payment/banking simulations never store card details or move real funds. Add abuse and recovery tests.

## 9. Deliverables and acceptance
Deliver runnable app, ERD, C4 context/container diagrams, key sequence diagram, OpenAPI, architecture decisions, structured-log event catalog, threat model, CI configuration, tests/coverage report, deployment guide, sample seeded local identities and 3-minute product workflow walkthrough. Completion requires an end-to-end scan -> price -> tax/discount -> reserve inventory -> tender simulation -> receipt -> sync workflow with safe failure behavior, logs visible in PortfolioOps, passing quality gates and honest documentation of limits.



## Authoritative references for the agent
- OWASP ASVS 5.0: https://github.com/OWASP/ASVS
- OWASP Cheat Sheets: https://cheatsheetseries.owasp.org/
- OWASP API Security: https://owasp.org/API-Security/
- SonarQube quality gates: https://docs.sonarsource.com/sonarqube-server/quality-standards-administration/managing-quality-gates/introduction-to-quality-gates/
- SonarQube Community Build: https://docs.sonarsource.com/sonarqube-community-build/
- React: https://react.dev/
- Spring Security: https://docs.spring.io/spring-security/reference/
- Sequelize: https://sequelize.org/docs/v6/
- OpenTelemetry: https://opentelemetry.io/docs/
- GitHub OmniRoute: https://github.com/diegosouzapw/OmniRoute
