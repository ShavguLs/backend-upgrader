# CS2 Gambler Backend

NestJS backend for the CS2 Gambler skin upgrader app. It provides Steam session authentication, wallet deposits, public skin catalog data, virtual inventory actions, Waxpeer-backed withdrawals, and the server-side upgrader game logic.

## Stack

- NestJS 11
- TypeScript
- PostgreSQL
- Prisma 5.22
- Passport Steam OpenID with PostgreSQL-backed Express sessions
- Plisio deposit invoices
- Waxpeer skin pricing and withdrawal integration

## Features

- Steam login, logout, current-user, and trade URL endpoints
- Local development login route when explicitly enabled
- PostgreSQL session storage through `connect-pg-simple`
- Wallet balance and Plisio crypto deposit flow
- Public skin catalog with Waxpeer sync support
- User inventory buy, bulk buy, sell, and withdrawal actions
- Upgrader game with server-side chance calculation, hidden house edge, audit rows, and recent drops feed
- Health check endpoint with database connectivity status
- Free/demo mode wallet grant support

## Prerequisites

- Node.js compatible with NestJS 11
- npm
- PostgreSQL database
- Steam API key for normal Steam auth startup
- Optional Plisio and Waxpeer credentials for deposit, skin sync, and withdrawal flows

This repository has separate `backend/` and `frontend/` projects. Run backend commands from `backend/`.

## Environment

Copy the example file and fill in values for your local setup:

```bash
cp .env.example .env
```

The backend reads `process.env` directly. The npm scripts do not automatically load `.env`, so use your shell, process manager, IDE run configuration, or another env-loading workflow when starting Nest.

Key variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Backend HTTP port. |
| `DATABASE_URL` | none | PostgreSQL connection string for Prisma and sessions. |
| `SESSION_SECRET` | none | Required at startup for Express sessions. |
| `FRONTEND_URL` | `http://localhost:3001` | CORS origin and post-login redirect. |
| `STEAM_API_KEY` | none | Required by the Steam auth provider. |
| `STEAM_REALM` | none | Steam OpenID realm, usually `http://localhost:3000/` locally. |
| `STEAM_RETURN_URL` | none | Steam callback URL, usually `http://localhost:3000/auth/steam/return` locally. |
| `ENABLE_DEV_LOGIN` | `false` | Enables `POST /auth/dev-login` for local protected-flow testing. |
| `PLISIO_SECRET_KEY` | none | Required to create Plisio deposit invoices and verify callbacks. |
| `PUBLIC_BACKEND_URL` | `http://localhost:3000` | Public origin used in Plisio callback URLs. |
| `SKIN_PROVIDER` | example uses `WAXPEER` | Set to `waxpeer`/`WAXPEER` to run Waxpeer catalog sync on bootstrap. |
| `WAXPEER_API_KEY` | none | Enables Waxpeer trade URL verification, withdrawal provider calls, and withdrawal polling. |
| `ALLOW_UNVERIFIED_TRADE_URL` | `false` | Allows local trade URL saves without Waxpeer verification when set to `true`. |
| `FREE_MODE` | `true` in example | Grants demo balance once and disables deposits when enabled. |
| `UPGRADER_HOUSE_EDGE_PERCENT` | `10` | Hidden house edge applied to upgrader rolls. |

See `.env.example` and [Local Development](./docs/local-development.md) for the full environment list.

Keep backend `FREE_MODE` aligned with frontend `NEXT_PUBLIC_FREE_MODE`. If they disagree, the UI can hide actions that the API still allows, or show actions that the API rejects.

## Local Development

Install dependencies:

```bash
npm install
```

Generate the Prisma client:

```bash
npm run prisma:generate
```

Apply database migrations:

```bash
npm run prisma:migrate
```

Optionally seed local test data:

```bash
npm run prisma:seed
```

Start the backend dev server:

```bash
npm run start:dev
```

The backend defaults to [http://localhost:3000](http://localhost:3000). The paired frontend dev server defaults to [http://localhost:3001](http://localhost:3001).

For local protected-flow testing without Steam, set `ENABLE_DEV_LOGIN=true`, start the backend with that env value, then call:

```http
POST /auth/dev-login
```

Use the returned `connect.sid` cookie for protected requests.

## Scripts

| Command | Description |
| --- | --- |
| `npm run start:dev` | Starts Nest in watch mode. |
| `npm run start` | Starts Nest normally. |
| `npm run start:prod` | Runs the compiled app from `dist/main`. |
| `npm run build` | Builds the backend with `nest build`. |
| `npm test` | Runs unit tests under `src/**/*.spec.ts`. |
| `npm run test:e2e` | Runs e2e tests under `test/`. |
| `npm run test:cov` | Runs Jest with coverage. |
| `npm run lint` | Runs ESLint with `--fix`; this may edit files. |
| `npm run format` | Formats `src/**/*.ts` and `test/**/*.ts`. |
| `npm run prisma:generate` | Generates the Prisma client. |
| `npm run prisma:migrate` | Applies development migrations. |
| `npm run prisma:migrate:deploy` | Applies migrations in deployment environments. |
| `npm run prisma:seed` | Seeds the local test user, wallet, and skins. |
| `npm run prisma:studio` | Opens Prisma Studio. |

## Project Structure

```text
backend/
├── prisma/
│   ├── schema.prisma        # Database models and session table mapping
│   ├── migrations/          # Prisma migrations
│   └── seed.ts              # Local seed data
├── src/
│   ├── auth/                # Steam auth, sessions, current user, trade URLs
│   ├── health/              # Health and database connectivity check
│   ├── inventory/           # Public skins plus user inventory actions
│   ├── prisma/              # Prisma service/module
│   ├── skins/               # Skin provider sync, normalization, FX rates
│   ├── upgrader/            # Upgrade options, attempts, history, drops
│   ├── wallet/              # Wallet balance, deposits, Plisio callbacks
│   ├── app.module.ts        # Root Nest module
│   └── main.ts              # App bootstrap, CORS, sessions, Passport, pipes
├── test/                    # E2E tests
├── docs/                    # API and local development docs
└── package.json             # Scripts and dependencies
```

## API Overview

Local base URL:

```text
http://localhost:3000
```

Primary route groups:

- `GET /health`
- `/auth/*` for Steam login, current user, trade URL, dev login, and logout
- `/wallet/*` for wallet state, deposits, and Plisio callbacks
- `/skins` and `/skins/:id` for the public skin catalog
- `/inventory/*` for authenticated buy, sell, and withdrawal actions
- `/upgrader/*` for target options, attempts, history, and public drops

Detailed API documentation lives in [docs/README.md](./docs/README.md).

## Database And Prisma

Prisma uses PostgreSQL through `DATABASE_URL`. The schema includes users, wallets, deposits, skins, inventory items, withdrawal requests, inventory transactions, upgrade attempts, and the `session` table used by `connect-pg-simple`.

Common Prisma flow:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

The seed script upserts `local-test-user`, a `10000.00` RUB wallet, and local seed skins for inventory testing.

## External Services

- Steam: `SteamStrategy` requires `STEAM_RETURN_URL`, `STEAM_REALM`, and `STEAM_API_KEY` during provider construction.
- Plisio: invoice creation requires `PLISIO_SECRET_KEY`; callbacks are verified in service code.
- Waxpeer: skin sync runs on bootstrap only when `SKIN_PROVIDER` resolves to `waxpeer`; withdrawals and trade URL verification require `WAXPEER_API_KEY` unless local unverified trade URLs are explicitly allowed.

Real Waxpeer withdrawals spend real Waxpeer balance. Leave `WAXPEER_API_KEY` unset in local development unless you intend to use the provider.

## Testing

Run unit tests:

```bash
npm test
```

Run one unit spec:

```bash
npm test -- auth.service.spec.ts
```

Run e2e tests:

```bash
npm run test:e2e
```

Backend unit tests usually mock database-facing services. E2E tests import the real `AppModule`, so they can require valid env values and a reachable database.

## Health Check

Verify that the API is running:

```http
GET /health
```

The health endpoint checks the database with `SELECT 1`. It returns top-level `status: "ok"` even when the database status is reported as `"disconnected"`.

## Production Notes

- Set `NODE_ENV=production` so session cookies are marked secure and the PostgreSQL session store uses SSL options.
- Set `SESSION_SECRET`, `DATABASE_URL`, `FRONTEND_URL`, Steam callback values, and any payment/provider credentials in the runtime environment.
- Make sure backend `FRONTEND_URL`, frontend `NEXT_PUBLIC_API_BASE_URL`, Steam callback URLs, CORS, and cookie settings all match deployed origins.
- Run `npm run build` before deployment.
- Run `npm run prisma:migrate:deploy` against the production database before starting the app.
