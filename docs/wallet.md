# Wallet API

Wallet endpoints manage user balance and crypto deposit invoices.

## `GET /wallet`

Returns the current user's wallet and 10 most recent deposits.

If the wallet does not exist yet, it is created with `0 RUB`.

### Auth

Required.

### Response

```json
{
  "wallet": {
    "id": 1,
    "userId": 1,
    "balance": "10000.00",
    "currency": "RUB",
    "createdAt": "2026-05-16T12:00:00.000Z",
    "updatedAt": "2026-05-16T12:00:00.000Z"
  },
  "deposits": [
    {
      "id": 1,
      "userId": 1,
      "orderNumber": "DEP_1_1778932800000_123",
      "amountRub": "500.00",
      "sourceCurrency": "RUB",
      "status": "created",
      "plisioTxnId": "...",
      "invoiceUrl": "https://...",
      "creditedAt": null,
      "createdAt": "2026-05-16T12:00:00.000Z",
      "updatedAt": "2026-05-16T12:00:00.000Z"
    }
  ]
}
```

## `POST /wallet/deposits`

Creates a deposit record and a Plisio invoice.

### Auth

Required.

### Request Body

```json
{
  "amountRub": 500,
  "currency": "BTC"
}
```

### Fields

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `amountRub` | number | Yes | Deposit amount in RUB. Must be at least `MIN_DEPOSIT_RUB`, default `100`. |
| `currency` | string | No | Requested crypto currency for Plisio invoice. |

### Response

Returns the created deposit after Plisio invoice fields are saved.

```json
{
  "id": 1,
  "userId": 1,
  "orderNumber": "DEP_1_1778932800000_123",
  "amountRub": "500.00",
  "sourceCurrency": "RUB",
  "status": "created",
  "plisioTxnId": "...",
  "invoiceUrl": "https://...",
  "creditedAt": null,
  "createdAt": "2026-05-16T12:00:00.000Z",
  "updatedAt": "2026-05-16T12:00:00.000Z"
}
```

### Errors

| Status | Reason |
| --- | --- |
| `400` | Invalid body or amount below minimum deposit. |
| `401` | Not authenticated. |

## `POST /wallet/plisio/callback`

Receives Plisio payment callbacks.

### Auth

Not required. The request is verified by Plisio callback hash in service code.

### Request Body

Plisio callback payload. Important fields used by the backend:

| Name | Description |
| --- | --- |
| `verify_hash` | Plisio callback signature. |
| `order_number` | Must match an existing deposit order number. |
| `status` | If `completed`, the wallet is credited. |
| `source_amount` | Required for completed deposits and must match deposit amount in RUB. |

### Response

```json
{
  "success": true
}
```

Duplicate completed callbacks for an already credited deposit return:

```json
{
  "success": true,
  "message": "Already credited"
}
```

### Behavior

- Invalid hashes are rejected.
- Missing `order_number` is rejected.
- Unknown deposits are rejected.
- Completed callbacks require `source_amount` to match the stored deposit amount.
- Completed deposits are credited once, using a transaction.
- Non-completed statuses update the deposit status and raw callback payload without crediting the wallet.

### Errors

| Status | Reason |
| --- | --- |
| `400` | Invalid hash, missing order number, missing amount, invalid amount, or amount mismatch. |
| `404` | Deposit not found. |
