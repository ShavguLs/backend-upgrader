# Inventory API

Inventory endpoints require an authenticated session.

## `GET /inventory`

Lists the current user's owned inventory items.

### Auth

Required.

### Response

```json
[
  {
    "id": 1,
    "userId": 1,
    "skinId": 1,
    "purchasePriceRub": "1500.00",
    "sellPriceRub": "1350.00",
    "status": "owned",
    "source": "purchase",
    "metadata": {
      "skinMarketHashName": "AK-47 | Redline (Field-Tested)",
      "skinPriceRub": "1500.00"
    },
    "createdAt": "2026-05-16T12:00:00.000Z",
    "updatedAt": "2026-05-16T12:00:00.000Z",
    "skin": {
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
  }
]
```

## `POST /inventory/buy`

Buys an active skin using the current user's wallet balance.

### Auth

Required.

### Request Body

```json
{
  "skinId": 1
}
```

### Fields

| Name | Type | Required | Validation |
| --- | --- | --- | --- |
| `skinId` | integer | Yes | Minimum `1`. |

### Response

```json
{
  "item": {
    "id": 1,
    "userId": 1,
    "skinId": 1,
    "purchasePriceRub": "1500.00",
    "sellPriceRub": "1350.00",
    "status": "owned",
    "source": "purchase",
    "metadata": {
      "skinMarketHashName": "AK-47 | Redline (Field-Tested)",
      "skinPriceRub": "1500.00"
    },
    "skin": {
      "id": 1,
      "marketHashName": "AK-47 | Redline (Field-Tested)",
      "priceRub": "1500.00",
      "isActive": true
    }
  },
  "wallet": {
    "id": 1,
    "userId": 1,
    "balance": "8500.00",
    "currency": "RUB"
  }
}
```

### Errors

| Status | Reason |
| --- | --- |
| `400` | Invalid body, inactive skin, or insufficient wallet balance. |
| `401` | Not authenticated. |
| `404` | Skin not found. |

## `POST /inventory/sell`

Sells an owned inventory item and credits the current user's wallet with the item's sell price.

The sell price is calculated when the item is bought using `SKIN_SELLBACK_PERCENT`.

### Auth

Required.

### Request Body

```json
{
  "inventoryItemId": 1
}
```

### Fields

| Name | Type | Required | Validation |
| --- | --- | --- | --- |
| `inventoryItemId` | integer | Yes | Minimum `1`. |

### Response

```json
{
  "item": {
    "id": 1,
    "status": "sold",
    "sellPriceRub": "1350.00",
    "skin": {
      "id": 1,
      "marketHashName": "AK-47 | Redline (Field-Tested)"
    }
  },
  "wallet": {
    "id": 1,
    "userId": 1,
    "balance": "9850.00",
    "currency": "RUB"
  }
}
```

### Errors

| Status | Reason |
| --- | --- |
| `400` | Invalid body or item is not owned by current user. |
| `401` | Not authenticated. |
| `404` | Item disappears after sale update. |

## `POST /inventory/withdraw`

Starts a real Waxpeer withdrawal for an owned virtual inventory item. The
backend looks up an exact-name listing on Waxpeer, buys the cheapest listing at
or below the item's purchase cap, and instructs Waxpeer to send the item to the
user's saved Steam trade URL.

### Requirements

- The current user must have a verified Steam trade URL saved via
  `PUT /auth/me/trade-url`.
- The inventory item must be owned by the current user and have status
  `owned`.
- The skin must come from the `waxpeer` provider and have a market hash name.

### Auth

Required.

### Request Body

```json
{
  "inventoryItemId": 1
}
```

### Success Response

```json
{
  "item": {
    "id": 1,
    "status": "withdraw_pending"
  },
  "withdrawal": {
    "id": 12,
    "status": "provider_purchase_pending",
    "provider": "waxpeer"
  }
}
```

### Statuses

`InventoryItem.status` may transition to:

- `owned` → `withdraw_pending` when withdrawal starts.
- `withdraw_pending` → `withdrawn` when Waxpeer reports the trade as completed.
- `withdraw_pending` → `owned` if the withdrawal is rolled back (no listing, listing exceeds cap, provider failure, or Waxpeer reports declined/refunded).

`WithdrawalRequest.status` may be one of:

- `created` (transient).
- `provider_purchase_pending` after the Waxpeer buy request is sent and while we
  wait for Steam trade acceptance.
- `trade_sent` once Waxpeer reports the trade has been sent.
- `completed` once Waxpeer reports delivery.
- `failed` if the listing is missing, listing price exceeds the cap, or
  Waxpeer reports declined/refunded.
- `needs_review` if the request stays unresolved past
  `WAXPEER_WITHDRAW_TIMEOUT_MINUTES`. The item stays locked until Waxpeer
  reports failure or an admin verifies non-delivery.

### Errors

| Status | Reason |
| --- | --- |
| `400` | Missing trade URL, missing/foreign item, item not owned, skin not from Waxpeer, no eligible Waxpeer listing, listing exceeds the item's purchase cap, or Waxpeer rejected the buy. |
| `401` | Not authenticated. |
| `502` | Withdrawal provider is unconfigured or unreachable. |
