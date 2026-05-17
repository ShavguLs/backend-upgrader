# Backend API Docs

This folder documents the backend HTTP API and local development behavior.

## Base URL

Local backend default:

```text
http://localhost:3000
```

The paired frontend dev server is configured for `http://localhost:3001`.

## Authentication

Protected endpoints use the Express session created by Passport. Clients must send the session cookie returned by the backend.

For local testing without Steam, set `ENABLE_DEV_LOGIN=true` and call `POST /auth/dev-login`.

Steam strategy construction requires `STEAM_RETURN_URL`, `STEAM_REALM`, and `STEAM_API_KEY` even before a login request is made.

## Docs

- [Auth API](./auth.md)
- [Health API](./health.md)
- [Skins API](./skins.md)
- [Inventory API](./inventory.md)
- [Upgrader API](./upgrader.md)
- [Wallet API](./wallet.md)
- [Errors](./errors.md)
- [Local Development](./local-development.md)

## Endpoint Summary

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/health` | No | Backend and database health check |
| `GET` | `/auth/steam` | No | Start Steam login |
| `GET` | `/auth/steam/return` | No | Steam login callback |
| `GET` | `/auth/me` | Yes | Return current user |
| `PUT` | `/auth/me/trade-url` | Yes | Save and verify the user's Steam trade URL |
| `POST` | `/auth/dev-login` | No | Local-only test login when enabled |
| `POST` | `/auth/logout` | Session | Destroy current session |
| `GET` | `/skins` | No | List public skin catalog |
| `GET` | `/skins/:id` | No | Get one public skin |
| `GET` | `/inventory` | Yes | List current user's owned inventory |
| `POST` | `/inventory/buy` | Yes | Buy a skin |
| `POST` | `/inventory/sell` | Yes | Sell an owned inventory item |
| `POST` | `/inventory/withdraw` | Yes | Withdraw an owned item as a real Waxpeer skin |
| `GET` | `/upgrader/options` | Yes | List target skins for a chance tier and source item |
| `POST` | `/upgrader/attempt` | Yes | Risk an inventory item to win a higher-priced skin |
| `GET` | `/wallet` | Yes | Get wallet and recent deposits |
| `POST` | `/wallet/deposits` | Yes | Create Plisio deposit invoice |
| `POST` | `/wallet/plisio/callback` | No | Plisio payment callback |
