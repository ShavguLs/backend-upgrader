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

## Chance Tiers and Per-Target Chance

The frontend offers fixed requested chance tiers `10%`, `25%`, `50%`, and
`75%`. The user-selected tier is a **lower-bound search anchor**, not
the final locked attempt chance. The backend recalculates the actual
displayed chance for each candidate target — and again for the chosen
target on attempt — from the source and target values:

```text
displayedChancePercent = sourceValueRub / targetReceivedValueRub * 100
```

The ideal target received value for the requested tier is:

```text
idealReceivedValueRub = sourceValueRub / (requestedChancePercent / 100)
```

The actual chance for an accepted target must fall in the broad range
anchored by the requested tier on the low end and the configured maximum
on the high end:

```text
minAllowedChance = requestedChancePercent
maxAllowedChance = UPGRADER_MAX_DISPLAYED_CHANCE_PERCENT
```

For a selected tier of `10%` with the default maximum of `75%`, that
range is `[10%, 75%]` — every active target whose actual chance falls
in that band is eligible, so users can pick safer (higher-chance, more
modest target) or riskier (lower-chance, juicier target) options within
the same selection. Picking `75%` collapses the range to roughly `75%`
only, because the requested tier already equals the max.

Because price and chance move in opposite directions, `listOptions`
converts the chance range into received-value bounds:

```text
lowerReceivedValueRub = sourceValueRub / (maxAllowedChance / 100)
upperReceivedValueRub = sourceValueRub / (minAllowedChance / 100)
```

…then into raw `Skin.priceRub` bounds to keep the existing
`[isActive, priceRub]` index efficient:

```text
rawLowerPriceRub = lowerReceivedValueRub / (SKIN_SELLBACK_PERCENT / 100)
rawUpperPriceRub = upperReceivedValueRub / (SKIN_SELLBACK_PERCENT / 100)
```

`SKIN_MIN_PRICE_RUB` raises the lower price bound if the raw bound for a
very cheap source item would otherwise fall below it.

## Hidden House Edge

The backend applies a hidden house edge to the **actual** displayed
chance for the chosen target — not to the requested tier. With
`UPGRADER_HOUSE_EDGE_PERCENT=10`, an actual displayed chance of 55.5556%
is rolled at 50.0000%. This keeps the configured house edge constant
across the broad chance range — a target whose actual chance happens to
be 60% gets the same proportional house edge as one at 20%.

The actual displayed chance is what is returned to the client and stored
on `UpgradeAttempt.displayedChancePercent`. The requested tier the user
selected is preserved on `UpgradeAttempt.metadata.requestedChancePercent`
for audit clarity. The effective chance is stored on the
`UpgradeAttempt` record and in the audit `InventoryTransaction.metadata`
for debugging.

The roll is generated server-side from Node `crypto.randomInt` and the
client cannot influence it.

## Environment

| Name | Default | Notes |
| --- | --- | --- |
| `UPGRADER_HOUSE_EDGE_PERCENT` | `10` | Must be `>= 0` and `< 100`. |
| `UPGRADER_MIN_DISPLAYED_CHANCE_PERCENT` | `1` | Must be `> 0`. |
| `UPGRADER_MAX_DISPLAYED_CHANCE_PERCENT` | `75` | Must be `<= 95`. Also the upper anchor for the broad chance range when listing target options or validating an attempt. |

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

Lists active target skins whose actual chance falls in the broad range
from the requested tier up to the configured maximum displayed chance.

### Auth

Required.

### Query

| Name | Type | Required | Validation |
| --- | --- | --- | --- |
| `inventoryItemId` | integer | Yes | Minimum `1`; must reference an `owned` item belonging to the user. |
| `chance` | integer | Yes | One of `10`, `25`, `50`, `75`. Used as the lower-bound anchor of the chance range. |

### Response

```json
{
  "sourceValueRub": "900.00",
  "requestedChancePercent": "10.0000",
  "displayedChancePercent": "10.0000",
  "targetValueRub": "9000.00",
  "items": [
    {
      "id": 20,
      "marketHashName": "AWP | Asiimov (Field-Tested)",
      "priceRub": "10000.00",
      "receivedValueRub": "9000.00",
      "displayedChancePercent": "10.0000",
      "isActive": true
    },
    {
      "id": 21,
      "marketHashName": "M4A4 | Asiimov (Field-Tested)",
      "priceRub": "6666.67",
      "receivedValueRub": "6000.00",
      "displayedChancePercent": "15.0000",
      "isActive": true
    },
    {
      "id": 22,
      "marketHashName": "AK-47 | Redline (Field-Tested)",
      "priceRub": "4000.00",
      "receivedValueRub": "3600.00",
      "displayedChancePercent": "25.0000",
      "isActive": true
    }
  ]
}
```

`requestedChancePercent` echoes the tier the client requested.
Response-level `displayedChancePercent` mirrors it for backwards
compatibility — the **per-item** `displayedChancePercent` is the actual
chance for that specific target, computed from
`sourceValueRub / receivedValueRub * 100`. `targetValueRub` is the ideal
received value for the selected tier; `receivedValueRub` on each item is
`priceRub * SKIN_SELLBACK_PERCENT / 100`, rounded to 2 decimal places.

`items` returns at most 60 active skins with raw `priceRub` in
`[max(rawLowerPriceRub, SKIN_MIN_PRICE_RUB), rawUpperPriceRub]`, after a
defensive filter that drops any candidate whose actual chance is below
the requested tier, above `UPGRADER_MAX_DISPLAYED_CHANCE_PERCENT`, or
outside the configured global min/max. Items are sorted by actual chance
ascending (closest-to-requested tier first), then by `priceRub`
descending, then by `id` ascending.

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
| `chance` | integer | Yes | One of `10`, `25`, `50`, `75`. Used as the lower-bound anchor — the backend recalculates the actual displayed chance from the source and target and rejects the attempt if the actual chance falls below the requested tier or above the configured maximum. |

### Response

```json
{
  "result": "win",
  "displayedChancePercent": "49.0196",
  "targetReceivedValueRub": "1836.00",
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

`displayedChancePercent` is the actual chance recalculated from the
source and target (not the requested tier the client posted). On a
roll, the wheel/result animation should be driven by this value. The
requested tier is preserved on `UpgradeAttempt.metadata.requestedChancePercent`.

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
| `400` | Invalid body, inventory item not found or not owned, target skin not found, inactive, or below `SKIN_MIN_PRICE_RUB`, target price too low for the selected chance (actual chance above `UPGRADER_MAX_DISPLAYED_CHANCE_PERCENT`), target price too high for the selected chance (actual chance below the requested tier), actual chance outside the configured global min/max, or item not available for upgrade (double-spend protection). |
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

## `GET /upgrader/top-drop`

Returns the single highest-value winning upgrade attempt for the
authenticated user. Top drop is a historical achievement: the won item
remains eligible even if it was later sold, withdrawn, or transitioned to
any other status.

### Auth

Required.

### Query

None.

### Response

```json
{
  "topDrop": {
    "id": 99,
    "createdAt": "2026-05-17T10:00:00.000Z",
    "priceRub": "1800.00",
    "wonItem": {
      "id": 500,
      "status": "sold",
      "skin": {
        "id": 20,
        "marketHashName": "AWP | Asiimov (Field-Tested)",
        "name": "AWP | Asiimov",
        "weapon": "AWP",
        "category": "Sniper Rifle",
        "rarity": "Covert",
        "exterior": "Field-Tested",
        "imageUrl": null,
        "priceRub": "2000.00",
        "provider": "waxpeer",
        "providerItemId": "awp-asiimov-ft",
        "lastSyncedAt": null,
        "isActive": true,
        "createdAt": "2026-05-01T00:00:00.000Z",
        "updatedAt": "2026-05-17T09:00:00.000Z"
      }
    }
  }
}
```

When the user has no qualifying winning attempt:

```json
{
  "topDrop": null
}
```

`topDrop.id` is the `UpgradeAttempt.id`. `topDrop.priceRub` is the
recorded `UpgradeAttempt.targetPriceRub` at win time, formatted to two
decimal places — current `Skin.priceRub` is intentionally not used so
later catalog price changes cannot alter historical ranking.
`topDrop.wonItem.status` reflects the current inventory status of the won
item (e.g. `owned`, `sold`, `withdraw_pending`, `withdrawn`).

Ranking is by `targetPriceRub` descending, with `createdAt` descending
then `id` descending as deterministic tie-breakers.

### Hidden Fields

The following audit fields are intentionally excluded:

- `effectiveChancePercent`
- `houseEdgePercent`
- `rollPercent`
- Raw `metadata`
- `userId`, source item, and target skin id (the won item's skin already
  carries the public skin fields)

### Errors

| Status | Reason |
| --- | --- |
| `401` | Not authenticated. |
