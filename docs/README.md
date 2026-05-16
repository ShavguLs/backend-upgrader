# Backend API Docs

This folder documents the backend HTTP API and local development behavior.

## Base URL

Local backend default:

```text
http://localhost:3000
```

If the frontend dev server also uses port `3000`, run one service on a different port.

## Authentication

Protected endpoints use the Express session created by Passport. Clients must send the session cookie returned by the backend.

For local testing without Steam, set `ENABLE_DEV_LOGIN=true` and call `POST /auth/dev-login`.

## Docs

- [Auth API](./auth.md)
- [Health API](./health.md)
- [Skins API](./skins.md)
- [Inventory API](./inventory.md)
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
| `POST` | `/auth/dev-login` | No | Local-only test login when enabled |
| `POST` | `/auth/logout` | Session | Destroy current session |
| `GET` | `/skins` | No | List public skin catalog |
| `GET` | `/skins/:id` | No | Get one public skin |
| `GET` | `/inventory` | Yes | List current user's owned inventory |
| `POST` | `/inventory/buy` | Yes | Buy a skin |
| `POST` | `/inventory/sell` | Yes | Sell an owned inventory item |
| `GET` | `/wallet` | Yes | Get wallet and recent deposits |
| `POST` | `/wallet/deposits` | Yes | Create Plisio deposit invoice |
| `POST` | `/wallet/plisio/callback` | No | Plisio payment callback |
