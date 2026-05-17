# Upgrader API

The Upgrader endpoints let an authenticated user risk a single owned
inventory item to win a higher-priced skin. The source item is consumed on
both win and loss; on win, a new owned `InventoryItem` for the target skin
is added to the user's inventory.

## Source Value

The upgrade input value is the source item's `sellPriceRub`, not its
`purchasePriceRub` or the current catalog price.

## Chance Tiers

The frontend offers fixed displayed chance tiers `10%`, `25%`, `50%`, and
`75%`. The user-selected tier is the source of truth for the displayed
chance — the backend does **not** derive the chance from the chosen target
skin's price. The ideal target price for a tier is calculated as:

```text
idealTargetPriceRub = sourceValueRub / (displayedChancePercent / 100)
```

The target skin's `priceRub` must fall in the one-sided window:

```text
idealTargetPriceRub <= targetSkin.priceRub <= idealTargetPriceRub * (1 + UPGRADER_TARGET_PRICE_TOLERANCE_PERCENT / 100)
```

The window is one-sided upward on purpose: a cheaper-than-ideal target
would silently raise the true chance above the displayed tier and shrink
the house edge.

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
  "targetPriceRub": "1800.00",
  "items": [
    {
      "id": 20,
      "marketHashName": "AWP | Asiimov (Field-Tested)",
      "priceRub": "1800.00",
      "isActive": true
    }
  ]
}
```

`items` returns at most 24 active skins with `priceRub` in
`[idealTargetPriceRub, idealTargetPriceRub * (1 + UPGRADER_TARGET_PRICE_TOLERANCE_PERCENT / 100)]`,
sorted by distance to the ideal target price.

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
| `400` | Invalid body, inventory item not found or not owned, target skin not found or inactive, target skin price below the ideal for the selected chance, target skin price above the upper tolerance bound, displayed chance outside configured min/max, or item not available for upgrade (double-spend protection). |
| `401` | Not authenticated. |
