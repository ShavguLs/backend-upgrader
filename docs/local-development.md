# Local Development

Run backend commands from `backend/`.

## Useful Commands

```bash
npm install
npm run start:dev
npm run build
npm test
npm run test:e2e
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

## Environment

The backend reads `process.env` directly. NPM scripts do not automatically load `.env`.

Important variables:

| Name | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string for Prisma and sessions. |
| `SESSION_SECRET` | Yes | Required by `src/main.ts`. |
| `FRONTEND_URL` | No | CORS origin. Defaults to `http://localhost:3000`. |
| `STEAM_RETURN_URL` | Steam auth | Steam OpenID callback URL. |
| `STEAM_REALM` | Steam auth | Steam OpenID realm. |
| `STEAM_API_KEY` | Steam auth | Steam API key. |
| `ENABLE_DEV_LOGIN` | No | Set to `true` to enable `POST /auth/dev-login`. |
| `PLISIO_SECRET_KEY` | Deposits | Required to create and verify Plisio invoices/callbacks. |
| `PUBLIC_BACKEND_URL` | No | Used for Plisio callback URLs. Defaults to `http://localhost:3000`. |
| `MIN_DEPOSIT_RUB` | No | Minimum deposit amount. Defaults to `100`. |
| `SKIN_SELLBACK_PERCENT` | No | Sellback percent from `0` to `100`. Defaults to `90`. |

## Local Auth Flow Without Steam

Set:

```text
ENABLE_DEV_LOGIN=true
```

Then call:

```http
POST /auth/dev-login
```

Use the returned `connect.sid` cookie for protected requests.

The dev user uses Steam id `local-test-user` and receives a wallet balance of `10000.00 RUB`.

## Seed Data

Run:

```bash
npm run prisma:seed
```

The seed creates or updates the local test user wallet and seed skins for local inventory testing.

## Port Note

The backend defaults to `PORT=3000`. The frontend dev server may also use `3000`, so move one service to another port during local full-stack development.
