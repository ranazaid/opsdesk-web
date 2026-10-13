# OpsDesk

[![CI](https://github.com/ranazaid/opsdesk-web/actions/workflows/ci.yml/badge.svg)](https://github.com/ranazaid/opsdesk-web/actions/workflows/ci.yml)
[![Security](https://github.com/ranazaid/opsdesk-web/actions/workflows/security.yml/badge.svg)](https://github.com/ranazaid/opsdesk-web/actions/workflows/security.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Drizzle-4169E1?logo=postgresql&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**OpsDesk is a multi-tenant client-support portal for digital agencies.** Each agency is an organization with owners,
admins, agents and viewers. Their clients' requests become tickets with status, priority, assignees, threaded
replies, internal notes and a full audit log. Agents can have Claude summarise a long thread or draft a reply,
streamed into the UI as it is written. Agencies pay through Stripe subscriptions (Free, Pro, Business), and seat
limits and the AI quota are enforced on the server. The same backend serves a JWT-authenticated REST API for the
companion React Native app ([`ranazaid/opsdesk-mobile`](https://github.com/ranazaid/opsdesk-mobile)). The whole stack
is instrumented for Datadog and scanned by Snyk in CI.

> **Portfolio reference implementation:** patterns from production work I've shipped (auth, RBAC, Stripe billing,
> LLM features, Datadog monitoring), rebuilt from scratch with demo data.

![Ticket detail with the AI assist panel](docs/screenshots/ticket-detail-ai.png)

## Contents

- [Features](#features)
- [Run locally](#run-locally)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Roles and permissions (RBAC)](#roles-and-permissions-rbac)
- [Billing flow](#billing-flow)
- [AI assist](#ai-assist)
- [REST API (mobile app)](#rest-api-mobile-app)
- [Observability](#observability)
- [Security](#security)
- [Testing and CI](#testing-and-ci)
- [Project structure](#project-structure)
- [Screenshots](#screenshots)
- [Limitations](#limitations)

## Features

- **Multi-tenant by design.** Every tenant-owned row carries `org_id` and every service query is scoped to the
  caller's organization. A ticket id from another tenant returns 404, so it can't be used to confirm the ticket exists.
- **Role-based access control.** One permission matrix (owner, admin, agent, viewer) is enforced by a
  `requirePermission()` guard in server actions, route handlers and the service layer. Roles are re-read from the
  database on every request, so a role change or removal applies immediately.
- **Ticketing.** Tickets have per-organization numbering, filters (status, priority, assignee, full-text search),
  pagination, customer replies vs. internal notes, and a field-level audit trail written in the same transaction as
  each change.
- **AI assist.** Thread summaries and reply drafts are streamed token by token, using the Anthropic TypeScript SDK
  (`claude-sonnet-5-5`) behind a small provider interface. When no API key is set, a deterministic mock provider
  takes over, so the app and tests run offline.
- **Stripe billing.** Checkout Sessions, the Customer Portal and a signature-verified webhook with idempotent event
  processing. Plan entitlements (seats, monthly AI assists) are enforced server-side.
- **REST API.** `/api/v1/*` uses short-lived JWT bearer tokens for the React Native companion app. The web app uses an
  httpOnly session cookie.
- **Observability.** Datadog APM (`dd-trace`), JSON logs from `pino` correlated to traces through
  `dd.trace_id`/`dd.span_id`, and DogStatsD business metrics. An exported dashboard and monitors are committed in
  [`observability/`](observability).
- **Security automation.** Snyk Open Source and Snyk Code run in GitHub Actions, alongside a `.snyk` policy,
  Dependabot, security headers, zod validation everywhere and rate limits on the auth and AI endpoints.

## Run locally

Requires Node.js 22+. You don't need Docker or a database server: when `DATABASE_URL` is unset, OpsDesk uses
[PGlite](https://pglite.dev), which is real PostgreSQL compiled to WebAssembly and stored in `./.pglite`.

```bash
npm install
npm run db:seed     # applies the SQL migrations and loads demo data
npm run dev         # http://localhost:3000
```

Sign in with any seeded account. They all use the password `opsdesk-demo`, and the login page lists them as
one-click buttons:

| Role   | Email                   | Try this                                            |
| ------ | ----------------------- | --------------------------------------------------- |
| Owner  | `olivia@northwind.test` | Everything, including billing and promoting owners  |
| Admin  | `adam@northwind.test`   | Team management; billing is read-only              |
| Agent  | `aisha@northwind.test`  | Work tickets, write internal notes, use AI assist   |
| Agent  | `marco@northwind.test`  | Same as Aisha                                       |
| Viewer | `victor@northwind.test` | Read-only: controls are disabled and APIs return 403 |

A second tenant, `gina@globex.test` (Globex Studio, Free plan), shows tenant isolation in practice.

<details>
<summary>Optional: real PostgreSQL, Claude and Stripe</summary>

```bash
cp .env.example .env.local           # every variable is documented there

# PostgreSQL instead of PGlite
docker compose up -d
export DATABASE_URL=postgres://opsdesk:opsdesk@localhost:5432/opsdesk
npm run db:migrate && npm run db:seed

# Real Claude responses: set ANTHROPIC_API_KEY in .env.local

# Stripe test mode: set STRIPE_SECRET_KEY, STRIPE_PRICE_PRO and STRIPE_PRICE_BUSINESS, then
stripe listen --forward-to localhost:3000/api/stripe/webhook   # copy the whsec_... into STRIPE_WEBHOOK_SECRET
```

</details>

## Architecture

```mermaid
flowchart LR
    subgraph clients["Clients"]
        web["Web app<br/>React Server Components"]
        mobile["React Native app<br/>opsdesk-mobile"]
    end

    subgraph next["Next.js 16 · Node.js runtime"]
        actions["Pages & Server Actions"]
        v1["REST API<br/>/api/v1/*"]
        aiRoute["AI stream<br/>/api/tickets/:id/ai"]
        hook["Stripe webhook<br/>/api/stripe/webhook"]
        services["Service layer<br/>requirePermission() + org_id scoping<br/>zod validation · rate limits · entitlements"]
        actions --> services
        v1 --> services
        aiRoute --> services
        hook --> services
    end

    web -- "httpOnly session cookie" --> actions
    web -- "fetch + ReadableStream" --> aiRoute
    mobile -- "JWT bearer" --> v1
    services --> db[("PostgreSQL<br/>Drizzle ORM<br/>(PGlite locally)")]
    services -- "AiProvider interface" --> llm["Anthropic API<br/>claude-sonnet-5-5"]
    actions -- "Checkout / Portal" --> stripe["Stripe"]
    stripe -- "signed events" --> hook
    next -. "APM traces · JSON logs · DogStatsD" .-> dd["Datadog"]
```

**Key decisions**

- **A thin service layer is the security boundary.** Pages, server actions and route handlers stay thin. Each service
  function (`src/server/**/service.ts`) takes `(db, actor, input)`, checks the permission, and scopes every query by
  `actor.orgId`. The web UI and the mobile API therefore share one enforcement path, and tests call the services
  directly.
- **One driver-agnostic Drizzle handle.** It runs on `node-postgres` in production and on PGlite in development and
  tests, from the same committed SQL migrations (`drizzle/`).
- **Cache Components.** Authenticated content streams behind `<Suspense>` boundaries while the app shell is
  prerendered.
- **Pre-flight checks before streaming.** The permission, rate limit, plan quota and ticket access are all checked
  before the AI response starts, so failures still return proper HTTP status codes.

## Tech stack

| Area           | Choice                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------- |
| Framework      | Next.js 16 (App Router, Server Actions, Route Handlers, Cache Components), React 19          |
| Language       | TypeScript (`strict`, `noUncheckedIndexedAccess`)                                            |
| UI             | Tailwind CSS 4, lucide-react                                                                 |
| Database       | PostgreSQL via Drizzle ORM + drizzle-kit migrations; `@electric-sql/pglite` for local/tests |
| Auth           | `jose` (HS256 JWTs, separate web/API audiences), `bcryptjs`                                  |
| Validation     | zod 4                                                                                       |
| Billing        | Stripe (Checkout, Customer Portal, webhooks)                                                 |
| AI             | `@anthropic-ai/sdk`, `claude-sonnet-5-5`, streaming; deterministic mock provider offline     |
| Observability  | `dd-trace` APM, `pino` JSON logs with trace correlation, DogStatsD custom metrics            |
| Security       | Snyk (Open Source + Code), Dependabot, `.snyk` policy, `npm audit` in CI                      |
| Testing        | Vitest against in-memory PGlite                                                              |
| CI             | GitHub Actions: lint, typecheck, test, build; separate security workflow                     |

## Roles and permissions (RBAC)

The matrix lives in [`src/lib/permissions.ts`](src/lib/permissions.ts). It is the single source of truth, and the
team page renders it live. The UI reads it only to hide controls a role can't use. Enforcement happens in
`requirePermission()` ([`src/server/rbac.ts`](src/server/rbac.ts)).

| Permission           | Owner | Admin | Agent | Viewer |
| -------------------- | :---: | :---: | :---: | :----: |
| `ticket:read`        |  ✅   |  ✅   |  ✅   |   ✅   |
| `ticket:create`      |  ✅   |  ✅   |  ✅   |        |
| `ticket:update`      |  ✅   |  ✅   |  ✅   |        |
| `ticket:assign`      |  ✅   |  ✅   |  ✅   |        |
| `comment:create`     |  ✅   |  ✅   |  ✅   |        |
| `comment:internal`   |  ✅   |  ✅   |  ✅   |        |
| `ai:use`             |  ✅   |  ✅   |  ✅   |        |
| `audit:read`         |  ✅   |  ✅   |  ✅   |   ✅   |
| `member:read`        |  ✅   |  ✅   |  ✅   |   ✅   |
| `member:invite`      |  ✅   |  ✅   |       |        |
| `member:update_role` |  ✅   |  ✅   |       |        |
| `member:remove`      |  ✅   |  ✅   |       |        |
| `billing:read`       |  ✅   |  ✅   |       |        |
| `billing:manage`     |  ✅   |       |       |        |

On top of the matrix:

- Only owners can grant or revoke the owner role.
- Admins can manage members below owner.
- An organization always keeps at least one owner.
- Viewers can't be assigned tickets.
- When a member is removed, their open tickets go back to the queue.

## Billing flow

```mermaid
sequenceDiagram
    autonumber
    actor Owner
    participant App as OpsDesk (server action)
    participant Stripe
    participant Hook as /api/stripe/webhook
    participant DB as PostgreSQL

    Owner->>App: Upgrade to Pro
    App->>App: requirePermission(billing:manage)
    App->>Stripe: customers.create (idempotency key) + checkout.sessions.create
    Note right of App: client_reference_id and subscription metadata carry orgId
    App-->>Owner: 303 redirect to Stripe Checkout
    Owner->>Stripe: Pays
    Stripe->>Hook: checkout.session.completed / customer.subscription.updated
    Hook->>Hook: stripe.webhooks.constructEvent(rawBody, signature, secret)
    Hook->>DB: BEGIN; INSERT stripe_events(id) ON CONFLICT DO NOTHING
    alt first delivery
        Hook->>DB: map price → plan, update organization, audit log; COMMIT
    else redelivery
        Hook->>DB: no-op; acknowledged as duplicate
    end
    Hook-->>Stripe: 200
    Note over App,DB: Seat and AI-quota checks read the plan stored on the organization
```

- **Raw body verification.** The webhook reads `request.text()` and never re-serialises JSON, so the signature
  covers the exact bytes Stripe sent.
- **Idempotency.** The event id is stored in `stripe_events` in the same transaction as its side effects. A failure
  rolls back both, so Stripe's retry is processed cleanly, and a redelivery is a no-op.
- **Entitlements.** These live in [`src/lib/plans.ts`](src/lib/plans.ts) and are enforced by
  [`src/server/billing/entitlements.ts`](src/server/billing/entitlements.ts) at the point of use:

  | Plan     | Seats | AI assists per month |
  | -------- | ----: | -------------------: |
  | Free     |     3 |                   25 |
  | Pro      |    10 |                  500 |
  | Business |    50 |                5,000 |

  `past_due` keeps paid entitlements as a grace period. `canceled` or a deleted subscription drops the
  organization to Free.
- **Plan changes for existing subscribers** go through the Stripe Customer Portal.

## AI assist

- **Provider seam.** [`AiProvider`](src/server/ai/types.ts) has two implementations:
  - [`AnthropicAiProvider`](src/server/ai/anthropic-provider.ts) streams from the official SDK. It uses
    `claude-sonnet-5-5` at low effort (summaries don't need deep reasoning) and enables the server-side refusal
    fallback.
  - [`MockAiProvider`](src/server/ai/mock-provider.ts) is deterministic and used when `ANTHROPIC_API_KEY` is unset.
- **Streaming end to end.** The service yields text chunks, the route handler wraps them in a `ReadableStream`, and
  the client reads them with `response.body.pipeThrough(new TextDecoderStream())`. Users can stop a generation part
  way through.
- **Guardrails.**
  - `ai:use` permission.
  - Per-user burst limit (10 per minute).
  - The plan's monthly quota.
  - Tenant-scoped ticket loading.
  - The ticket thread is fenced as untrusted data in the prompt, to defend against prompt injection.
  - Internal notes inform drafts but are never quoted to customers.
- **Accounting.** Every completed generation records provider, model, tokens and latency in `ai_usage`, which feeds
  quotas and cost tracking. It also writes an audit entry and emits Datadog metrics.

## REST API (mobile app)

The React Native companion app, **[opsdesk-mobile](https://github.com/ranazaid/opsdesk-mobile)**, consumes these
endpoints. Route-level tests for the mobile-only endpoints are in [`tests/mobile-api.test.ts`](tests/mobile-api.test.ts).

All endpoints except login require `Authorization: Bearer <accessToken>`. Errors share one shape:
`{ "error": { "code", "message", "details?" } }`. Validation failures return 422, plan limits 402, and rate limits
429 with a `Retry-After` header.

| Method  | Path                              | Purpose                                                       |
| ------- | --------------------------------- | ------------------------------------------------------------- |
| `POST`  | `/api/v1/auth/login`              | Email + password (+ optional `orgId`) → 12 h access token      |
| `GET`   | `/api/v1/me`                      | Current user, organization, role and permissions             |
| `GET`   | `/api/v1/tickets`                 | List tickets (`status`, `priority`, `assignee`, `q`, paging)  |
| `POST`  | `/api/v1/tickets`                 | Create a ticket                                               |
| `GET`   | `/api/v1/tickets/:id`             | Ticket detail                                                 |
| `PATCH` | `/api/v1/tickets/:id`             | Update status / priority / assignee / subject                 |
| `GET`   | `/api/v1/tickets/:id/comments`    | Thread (including internal notes)                             |
| `POST`  | `/api/v1/tickets/:id/comments`    | Reply or internal note                                        |
| `POST`  | `/api/v1/ai/summary`              | `{ ticketId, task: "summary" \| "reply", stream? }`           |
| `GET`   | `/api/v1/members`                 | Organization members (assignee picker), requires `member:read` |
| `POST`  | `/api/v1/devices/push-token`      | Register an Expo push token `{ token, platform }` (upsert)      |

```bash
TOKEN=$(curl -s localhost:3000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"aisha@northwind.test","password":"opsdesk-demo"}' | jq -r .accessToken)
curl -s "localhost:3000/api/v1/tickets?status=active&priority=urgent" -H "authorization: Bearer $TOKEN" | jq
```

## Observability

| Signal  | Implementation                                                                                                                                                                          |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Traces  | `dd-trace` is initialised from [`src/instrumentation.ts`](src/instrumentation.ts), only when `DD_ENV`, `DD_API_KEY` or `DD_AGENT_HOST` is set. `npm run start:datadog` preloads it with `NODE_OPTIONS` so the `next` integration is patched as well. |
| Logs    | [`pino`](src/server/observability/logger.ts) writes JSON with `service`/`env`/`version`, and adds `dd.trace_id` and `dd.span_id` whenever a span is active, so Datadog links each log line to its trace. Credentials are redacted. Unhandled request errors are logged via `onRequestError`. |
| Metrics | DogStatsD via [`metrics.ts`](src/server/observability/metrics.ts): `opsdesk.api.requests` and `opsdesk.api.latency_ms` (by route and status class), `opsdesk.tickets.created`, `opsdesk.ai.requests`, `opsdesk.ai.latency_ms`, `opsdesk.ai.tokens`, `opsdesk.stripe.webhook.received`/`failed`, `opsdesk.auth.login`. |
| As code | [`observability/datadog-dashboard.json`](observability/datadog-dashboard.json) (API health, AI, billing, error log stream) and [`observability/monitors/`](observability/monitors): API 5xx error rate, API p95 latency, Stripe webhook failures and AI p95 latency. |

You can import the JSON through the Datadog UI or API, for example
`POST /api/v1/dashboard` and `POST /api/v1/monitor`.

## Security

- **Sessions.**
  - Web sessions are HS256 JWTs in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production).
  - API tokens use a different audience, so a cookie token can't be replayed as a bearer token, or vice versa.
  - Logins with an unknown email still run bcrypt, so response timing doesn't reveal which emails are registered.
- **Authorization.**
  - Every mutation goes through `requirePermission()` and org-scoped queries.
  - Cross-tenant ids return 404.
  - Assignees are validated as members of the same organization.
- **CSRF.**
  - Server Actions use Next.js's built-in origin checks.
  - The cookie is `SameSite=Lax`.
  - The REST API is bearer-only, so it never relies on ambient cookies.
- **Input validation.** Request bodies, query strings and form data go through zod schemas
  ([`src/lib/validators`](src/lib/validators)).
- **Rate limiting.**
  - Login: per IP and email.
  - AI: per user.
  - The implementation is in memory behind a small interface; swap in Redis for multiple instances.
- **Webhooks.** Stripe signatures are verified on the raw body, and processing is idempotent.
- **LLM safety.**
  - The prompt treats ticket content as untrusted data.
  - Internal notes are never revealed in drafts.
  - Refusals are handled.
- **Headers.** HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and `Permissions-Policy`; the
  `x-powered-by` header is disabled.
- **Supply chain.**
  - [`security.yml`](.github/workflows/security.yml) runs `snyk test` and `snyk code test` with `SNYK_TOKEN` from
    repository secrets, and uploads SARIF to GitHub code scanning. It uses `continue-on-error` so CI stays green
    until the secret is configured.
  - The [`.snyk`](.snyk) policy requires every ignore to carry a reason and an expiry.
  - Dependabot groups npm and Actions updates.
  - CI fails on high-severity production advisories (`npm audit --omit=dev`).
- **Secrets.** Nothing secret is committed. [`.env.example`](.env.example) documents every variable, and
  `.gitignore` excludes all other `.env*` files.

## Testing and CI

```bash
npm run lint        # ESLint (next/core-web-vitals + typescript)
npm run typecheck   # next typegen && tsc --noEmit
npm test            # Vitest
npm run build       # production build
```

Database tests run against an in-memory PGlite instance with the real migrations and seed. They need no Docker and
no mocks of the ORM.

| Suite                                                       | What it proves                                                                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [`rbac.test.ts`](tests/rbac.test.ts)                        | The matrix per role, hierarchy, `requirePermission()` 401/403, role-assignment rules                              |
| [`tenant-isolation.test.ts`](tests/tenant-isolation.test.ts) | Lists, search, detail, comments, audit and stats are org-scoped; cross-tenant reads and writes return 404 and leave rows untouched |
| [`stripe-webhook.test.ts`](tests/stripe-webhook.test.ts)    | Bad, tampered or missing signatures are rejected; duplicate events aren't re-applied; `subscription.updated` changes seat limits immediately; downgrade and grace-period paths |
| [`ai.test.ts`](tests/ai.test.ts)                            | The mock provider is deterministic and streams in chunks; abort works; the Anthropic stream is handled; quota, permission and rate limits apply; usage and metrics are recorded |
| [`validators.test.ts`](tests/validators.test.ts)            | zod normalisation, coercion of form and query values, error shapes                                               |
| `auth`, `tickets`, `team`, `rate-limit`, `observability`    | JWT audiences and expiry, numbering and audit diffs, last-owner protection, seat limits, Retry-After, `dd.*` log context |

[`ci.yml`](.github/workflows/ci.yml) runs install → lint → typecheck → test → build → production audit on every push
and PR.

## Project structure

```text
src/
  app/
    (app)/            authenticated pages: dashboard, tickets, team, billing (+ server actions)
    api/v1/           REST API for the mobile app (JWT bearer)
    api/tickets/      streaming AI endpoint for the web app
    api/stripe/       webhook
    login/
  components/         UI primitives, shell, ticket, team, billing and AI panel components
  lib/                shared, dependency-free code: domain types, permission matrix, plans, zod validators
  server/
    auth/             passwords, JWTs, cookie sessions, bearer auth, actor resolution
    ai/               provider interface, Anthropic + mock providers, prompts, service
    billing/          Stripe client, checkout/portal, webhook handler, entitlements
    db/               Drizzle schema, client (pg / PGlite), seed
    observability/    tracer, pino logger, metrics
    tickets/ team/    domain services
  instrumentation.ts  Datadog APM bootstrap + onRequestError
drizzle/              committed SQL migrations
observability/        Datadog dashboard + monitors (JSON)
tests/                Vitest suites
```

## Screenshots

| Dashboard                                         | Tickets                                     |
| ------------------------------------------------- | ------------------------------------------- |
| ![Dashboard](docs/screenshots/dashboard.png)      | ![Tickets](docs/screenshots/tickets.png)    |
| **Billing**                                       | **Team & roles**                            |
| ![Billing](docs/screenshots/billing.png)          | ![Team & roles](docs/screenshots/team.png)  |

The screenshots come from `npm run dev` with the seeded PGlite database and the offline AI provider.

## Limitations

These are deliberate scope cuts for a reference implementation:

- **Rate limits are in memory.** They are per instance; production would use Redis.
- **No invitation emails.** New members get a one-time temporary password shown to the admin.
- **No refresh tokens.** API tokens last 12 hours.
- **One organization per session.** Login picks the user's first organization, or the API accepts `orgId`.
- **No customer-facing portal.** Customer messages are seeded; there are no inbound email or a customer login.
- **Mock AI by default.** Without an API key, the AI panel uses the deterministic mock. Set `ANTHROPIC_API_KEY` for
  real Claude output.

## License

[MIT](LICENSE) © 2026 Zaid Mubbashar
