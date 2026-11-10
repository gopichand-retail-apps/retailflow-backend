# ADR 0001: Local Web Client and PGlite Persistence

## Status

Accepted for the local portfolio prototype. Revisit before external deployment.

## Context

APP-01 describes an offline-first POS and recommends React Native, PostgreSQL,
and Redis for a production-shaped deployment. This workspace is a local
portfolio slice with no Docker or external database service. It needs to run
independently with synthetic data while preserving a server-authoritative API
and transactional sales behavior.

## Decision

- Use a React web client with Vite for the current cashier and manager workflows.
- Use Express and a versioned REST API as the authority for price, role, stock,
  sale, return, and audit state.
- Use PGlite for local PostgreSQL-compatible persistence and migrations.
- Keep offline drafts in a schema-validated browser queue and replay them with
  their original idempotency keys after connectivity returns.
- Do not add Redis, an external identity provider, payment processor, or
  PortfolioOps dependency to this local slice.

## Consequences

This keeps both repositories runnable without external services and allows
transactional database tests. It does not establish production database
operations, cross-process concurrency, mobile scanner lifecycle, multi-instance
rate limiting, backup/restore, or deployment security. Before public deployment,
select PostgreSQL, document migrations and rollback, add production identity and
TLS, and record a new ADR. Add a React Native client only when mobile scanning
and offline lifecycle requirements are implemented and tested.
