# Skins API

Skin catalog endpoints are public and only return active skins.

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
| `minPriceRub` | number | No | Minimum RUB price, inclusive. |
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
