# Upgrader API

The Upgrader endpoints let an authenticated user risk a single owned
inventory item to win a higher-priced skin. The source item is consumed on
both win and loss; on win, a new owned `InventoryItem` for the target skin
is added to the user's inventory.

## Source Value

The upgrade input value is the source item's `sellPriceRub`, not its
`purchasePriceRub` or the current catalog price.

## Target Received Value

The user-visible target value is the post-win inventory `sellPriceRub`,
not the raw catalog `Skin.priceRub`. When the upgrade is won, the new
`InventoryItem.sellPriceRub` is set to:

```text
targetReceivedValueRub = targetSkin.priceRub * SKIN_SELLBACK_PERCENT / 100
```

This keeps upgraded skins consistent with bought skins: both have a
sellback margin applied when entering inventory. The raw catalog price
remains visible as `Skin.priceRub` but the upgrader's chance math, target
window, and user-facing value are all expressed in received-value space.

## Chance Tiers

The frontend offers fixed displayed chance tiers `10%`, `25%`, `50%`, and
`75%`. The user-selected tier is the source of truth for the displayed
chance — the backend does **not** derive the chance from the chosen target
skin's price. The ideal target received value for a tier is calculated as:

```text
idealReceivedValueRub = sourceValueRub / (displayedChancePercent / 100)
```

The target skin's received value must fall in the one-sided window:

```text
idealReceivedValueRub <= targetReceivedValueRub <= idealReceivedValueRub * (1 + UPGRADER_TARGET_PRICE_TOLERANCE_PERCENT / 100)
```

The window is one-sided upward on purpose: a cheaper-than-ideal target
would silently raise the true chance above the displayed tier and shrink
the house edge.

Internally `listOptions` converts the received-value bounds back into raw
`Skin.priceRub` bounds before querying, keeping the existing
`[isActive, priceRub]` index efficient:

```text
rawLowerPriceRub = idealReceivedValueRub / (SKIN_SELLBACK_PERCENT / 100)
rawUpperPriceRub = upperReceivedValueRub / (SKIN_SELLBACK_PERCENT / 100)
```

## Hidden House Edge

The backend applies a hidden house edge to derive the effective roll
chance. With `UPGRADER_HOUSE_EDGE_PERCENT=10`, a displayed 50% chance is
rolled at 45%. The displayed chance is the only chance returned to the
client. The effective chance is stored on the `UpgradeAttempt` record and
in the audit `InventoryTransaction.metadata` for debugging.

The roll is generated server-side from Node `crypto.randomInt` and the
client cannot influence it.

## Environment

| Name | Default | Notes |
| --- | --- | --- |
| `UPGRADER_HOUSE_EDGE_PERCENT` | `10` | Must be `>= 0` and `< 100`. |
| `UPGRADER_MIN_DISPLAYED_CHANCE_PERCENT` | `1` | Must be `> 0`. |
| `UPGRADER_MAX_DISPLAYED_CHANCE_PERCENT` | `75` | Must be `<= 95`. |
| `UPGRADER_TARGET_PRICE_TOLERANCE_PERCENT` | `15` | Must be `>= 0`. Width of the price window when listing target options. |

`UPGRADER_MIN_DISPLAYED_CHANCE_PERCENT` must be less than
`UPGRADER_MAX_DISPLAYED_CHANCE_PERCENT`.

## `GET /upgrader/drops`

Lists the most recent winning upgrade attempts across all users, for the
public live drops feed. Only attempts with `result = "win"` and a non-null
`wonInventoryItemId` are returned; attempts whose won inventory skin has
been removed are filtered out.

### Auth

Not required (public).

### Query

| Name | Type | Required | Validation |
| --- | --- | --- | --- |
| `limit` | integer | No | Default `16`. Minimum `1`, maximum `50`. |

### Response

```json
{
  "items": [
    {
      "id": 99,
      "createdAt": "2026-05-17T10:00:00.000Z",
      "priceRub": "1800.00",
      "skin": {
        "id": 20,
        "marketHashName": "AWP | Asiimov (Field-Tested)",
        "name": "AWP | Asiimov",
        "priceRub": "2000.00",
        "imageUrl": null,
        "isActive": true
      }
    }
  ]
}
```

Items are sorted by `createdAt` descending. `priceRub` is the raw catalog
target price recorded on the attempt (`UpgradeAttempt.targetPriceRub`),
not the user-received sellback value. `skin` carries the standard public
skin fields of the won inventory item.

### Errors

| Status | Reason |
| --- | --- |
| `400` | Invalid query (e.g. `limit` out of range). |

## `GET /upgrader/options`

Lists active target skins around the target price for a chance tier.

### Auth

Required.

### Query

| Name | Type | Required | Validation |
| --- | --- | --- | --- |
| `inventoryItemId` | integer | Yes | Minimum `1`; must reference an `owned` item belonging to the user. |
| `chance` | integer | Yes | One of `10`, `25`, `50`, `75`. |

### Response

```json
{
  "sourceValueRub": "900.00",
  "displayedChancePercent": "50.0000",
  "targetValueRub": "1800.00",
  "items": [
    {
      "id": 20,
      "marketHashName": "AWP | Asiimov (Field-Tested)",
      "priceRub": "2000.00",
      "receivedValueRub": "1800.00",
      "isActive": true
    }
  ]
}
```

`targetValueRub` is the ideal received value for the selected chance tier
(equal to each candidate's post-win `sellPriceRub` when the candidate's
received value matches the tier exactly). `receivedValueRub` on each item
is `priceRub * SKIN_SELLBACK_PERCENT / 100`, rounded to 2 decimal places.

`items` returns at most 24 active skins with raw `priceRub` in
`[max(rawLowerPriceRub, SKIN_MIN_PRICE_RUB), rawUpperPriceRub]`, sorted by
distance from `idealReceivedValueRub` (in received-value space). The
server minimum price (`SKIN_MIN_PRICE_RUB`, default `10`) raises the lower
bound when the raw bound for a very cheap source item would otherwise
fall below it.

### Errors

| Status | Reason |
| --- | --- |
| `400` | Invalid query, or inventory item not found, foreign, or not `owned`. |
| `401` | Not authenticated. |

## `POST /upgrader/attempt`

Performs the upgrade attempt. Atomically claims the source item with
`updateMany({ status: 'owned' })` to protect against double-spend.

### Auth

Required.

### Request Body

```json
{
  "inventoryItemId": 10,
  "targetSkinId": 20,
  "chance": 50
}
```

### Fields

| Name | Type | Required | Validation |
| --- | --- | --- | --- |
| `inventoryItemId` | integer | Yes | Minimum `1`. |
| `targetSkinId` | integer | Yes | Minimum `1`. |
| `chance` | integer | Yes | One of `10`, `25`, `50`, `75`. Used directly as the displayed chance. |

### Response

```json
{
  "result": "win",
  "displayedChancePercent": "50.0000",
  "targetReceivedValueRub": "1800.00",
  "sourceItem": {
    "id": 10,
    "status": "upgraded_used"
  },
  "wonItem": {
    "id": 500,
    "status": "owned",
    "source": "upgrade"
  },
  "targetSkin": {
    "id": 20,
    "marketHashName": "AWP | Asiimov (Field-Tested)"
  },
  "attempt": {
    "id": 99,
    "result": "win",
    "createdAt": "2026-05-17T10:00:00.000Z"
  }
}
```

`targetReceivedValueRub` is the value the user actually receives in their
inventory on a win — equal to the new `wonItem.sellPriceRub`. The raw
catalog price remains available as `targetSkin.priceRub`.

On loss, `wonItem` is `null` and `result` is `"loss"`.

### Inventory Statuses

`InventoryItem.status` may transition:

- `owned` → `upgraded_used` when the source item is consumed by a winning
  upgrade.
- `owned` → `upgraded_lost` when the source item is consumed by a losing
  upgrade.
- A new `owned` item with `source: "upgrade"` is created on win.

### Audit Trail

Each attempt writes an `UpgradeAttempt` row (including the hidden
`effectiveChancePercent`, `houseEdgePercent`, and `rollPercent`) and one or
more `InventoryTransaction` rows:

- `upgrade_loss` on loss (source item, amount = `sourceValueRub`).
- `upgrade_win_source` on win (source item, amount = `sourceValueRub`).
- `upgrade_win_target` on win (new target item, amount = `targetSkin.priceRub`).

### Errors

| Status | Reason |
| --- | --- |
| `400` | Invalid body, inventory item not found or not owned, target skin not found, inactive, or below `SKIN_MIN_PRICE_RUB`, target received value below the ideal for the selected chance, target received value above the upper tolerance bound, displayed chance outside configured min/max, or item not available for upgrade (double-spend protection). |
| `401` | Not authenticated. |

## `GET /upgrader/history`

Lists the authenticated user's upgrade attempts, newest first, in pages.

### Auth

Required.

### Query

| Name | Type | Required | Validation |
| --- | --- | --- | --- |
| `page` | integer | No | Default `1`. Minimum `1`. |
| `limit` | integer | No | Default `20`. Minimum `1`, maximum `100`. |

### Response

```json
{
  "items": [
    {
      "id": 99,
      "result": "win",
      "displayedChancePercent": "50.0000",
      "sourceValueRub": "900.00",
      "targetPriceRub": "1800.00",
      "createdAt": "2026-05-17T10:00:00.000Z",
      "sourceItem": {
        "id": 10,
        "status": "upgraded_used",
        "skin": { "id": 1, "name": "AK-47 | Redline" }
      },
      "targetSkin": { "id": 20, "name": "AWP | Asiimov" },
      "wonItem": {
        "id": 500,
        "status": "owned",
        "skin": { "id": 20, "name": "AWP | Asiimov" }
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 145,
    "totalPages": 8
  }
}
```

On loss, `wonItem` is `null`.

### Hidden Fields

The following audit fields are intentionally excluded from this endpoint:

- `effectiveChancePercent`
- `houseEdgePercent`
- `rollPercent`
- Raw `metadata`

Only attempts where `userId` equals the authenticated user are returned.

### Errors

| Status | Reason |
| --- | --- |
| `400` | Invalid query (e.g. `page` or `limit` out of range). |
| `401` | Not authenticated. |
