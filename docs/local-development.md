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
| `FRONTEND_URL` | No | CORS origin and post-login redirect. Defaults to `http://localhost:3001`. |
| `STEAM_RETURN_URL` | App startup | Steam OpenID callback URL; required by `SteamStrategy`. |
| `STEAM_REALM` | App startup | Steam OpenID realm; required by `SteamStrategy`. |
| `STEAM_API_KEY` | App startup | Steam API key; required by `SteamStrategy`. |
| `ENABLE_DEV_LOGIN` | No | Set to `true` to enable `POST /auth/dev-login`. |
| `PLISIO_SECRET_KEY` | Deposits | Required to create Plisio invoices and verify callbacks. |
| `PUBLIC_BACKEND_URL` | No | Used for Plisio callback URLs. Defaults to `http://localhost:3000`. |
| `MIN_DEPOSIT_RUB` | No | Minimum deposit amount. Defaults to `100`. |
| `SKIN_SELLBACK_PERCENT` | No | Sellback percent from `0` to `100`. Defaults to `90`. |
| `SKIN_PROVIDER` | No | Set to `WAXPEER`/`waxpeer` to run skin sync on bootstrap; any other value skips sync. |
| `SKIN_PRICE_MARKUP_PERCENT` | No | Markup applied to synced provider prices. Must be `>= 0`. |
| `SKIN_MIN_PRICE_RUB` | No | Server-side minimum RUB price for the public catalog, buying, upgrader, and Waxpeer sync. Must be `>= 0`. Defaults to `10`. |
| `SKIN_SYNC_INTERVAL_SECONDS` | No | Waxpeer sync interval. Defaults to `300`. |
| `SKIN_STALE_AFTER_MINUTES` | No | Marks old provider rows inactive after this age. Defaults to `30`. |
| `WAXPEER_API_BASE_URL` | No | Waxpeer API origin. Defaults to `https://api.waxpeer.com`. |
| `WAXPEER_PRICES_PATH` | No | Waxpeer prices path. Defaults to `/v1/prices`. |
| `FX_RATE_API_URL` | No | Live USD FX API. Defaults to `https://open.er-api.com/v6/latest/USD`. |
| `USD_RUB_RATE` | Skin sync fallback | Fallback USD to RUB rate if the live FX API fails. |
| `FX_RATE_CACHE_SECONDS` | No | FX cache TTL. Defaults to `3600`. |

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

The backend defaults to `PORT=3000`; the frontend dev server is configured for `3001`.

## Skin Catalog Sync

`SkinsModule` starts Waxpeer sync during application bootstrap only when `SKIN_PROVIDER` lowercases to `waxpeer`. The sync fetches USD prices, converts through `FxRateService`, applies `SKIN_PRICE_MARKUP_PERCENT`, upserts `Skin` rows, and marks stale provider rows inactive. Provider items whose converted RUB price falls below `SKIN_MIN_PRICE_RUB` (default `10`) are skipped, and already-stored active provider rows below the minimum are marked inactive at the end of each sync.

For purely local catalog testing without Waxpeer, leave `SKIN_PROVIDER` unset or non-`waxpeer` and run `npm run prisma:seed`.
