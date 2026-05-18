# Skins API

Skin catalog endpoints are public, only return active skins, and are implemented by `InventoryController`.

Catalog data can come from `npm run prisma:seed` or from the Waxpeer bootstrap sync when `SKIN_PROVIDER=WAXPEER`/`waxpeer`.

## Server Minimum Price

Public skin endpoints only expose active skins priced at or above `SKIN_MIN_PRICE_RUB`. The default is `10 RUB`. Set the env var to a different non-negative value to override; values below `0` are rejected at startup.

- `GET /skins` always applies `priceRub >= SKIN_MIN_PRICE_RUB`. If the caller passes `minPriceRub`, the effective minimum is the higher of `minPriceRub` and `SKIN_MIN_PRICE_RUB` — `minPriceRub` can raise the floor but never lower it.
- `GET /skins/:id` returns `404` for under-minimum skins, even when they are still flagged active in the database.
- Buying an under-minimum skin id is rejected with `400`.
- Upgrader options and attempts also reject under-minimum target skins (see `upgrader.md`).
- Waxpeer sync skips provider items whose converted RUB price is below the minimum and marks already-stored active provider rows below the minimum inactive.

## `GET /skins`

Lists skins with filtering and pagination.

### Auth

Not required.

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `search` | string | No | Searches `name` and `marketHashName`. |
| `weapon` | string | No | Exact weapon filter. |
| `rarity` | string | No | Exact rarity filter. |
| `exterior` | string | No | Exact exterior filter. |
| `minPriceRub` | number | No | Minimum RUB price, inclusive. Cannot lower the server minimum (`SKIN_MIN_PRICE_RUB`, default `10`). |
| `maxPriceRub` | number | No | Maximum RUB price, inclusive. |
| `page` | integer | No | Page number. Minimum `1`. Default `1`. |
| `limit` | integer | No | Items per page. Minimum `1`, maximum `100`, default `24`. |

### Example Request

```http
GET /skins?search=ak&minPriceRub=100&page=1&limit=24
```

### Response

```json
{
  "items": [
    {
      "id": 1,
      "marketHashName": "AK-47 | Redline (Field-Tested)",
      "name": "Redline",
      "weapon": "AK-47",
      "category": "Rifle",
      "rarity": "Classified",
      "exterior": "Field-Tested",
      "imageUrl": "https://...",
      "priceRub": "1500.00",
      "provider": "seed",
      "providerItemId": "ak-redline-ft",
      "lastSyncedAt": "2026-05-16T12:00:00.000Z",
      "isActive": true,
      "createdAt": "2026-05-16T12:00:00.000Z",
      "updatedAt": "2026-05-16T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 24,
    "total": 1,
    "totalPages": 1
  }
}
```

## `GET /skins/:id`

Returns one active skin by numeric id.

### Auth

Not required.

### Path Parameters

| Name | Type | Description |
| --- | --- | --- |
| `id` | integer | Skin id. |

### Response

```json
{
  "id": 1,
  "marketHashName": "AK-47 | Redline (Field-Tested)",
  "name": "Redline",
  "weapon": "AK-47",
  "category": "Rifle",
  "rarity": "Classified",
  "exterior": "Field-Tested",
  "imageUrl": "https://...",
  "priceRub": "1500.00",
  "provider": "seed",
  "providerItemId": "ak-redline-ft",
  "lastSyncedAt": "2026-05-16T12:00:00.000Z",
  "isActive": true,
  "createdAt": "2026-05-16T12:00:00.000Z",
  "updatedAt": "2026-05-16T12:00:00.000Z"
}
```

### Errors

| Status | Reason |
| --- | --- |
| `400` | `id` is not a valid integer. |
| `404` | Skin does not exist or is inactive. |
