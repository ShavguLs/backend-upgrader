# Errors

The backend uses NestJS HTTP exceptions and validation errors.

## Common Shape

Errors usually follow this shape:

```json
{
  "message": "Skin not found",
  "error": "Not Found",
  "statusCode": 404
}
```

Validation errors may return `message` as an array:

```json
{
  "message": [
    "skinId must not be less than 1",
    "skinId must be an integer number"
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

## Common Status Codes

| Status | Meaning |
| --- | --- |
| `400` | Invalid request, validation failure, or business rule failure. |
| `401` | Protected endpoint called without an authenticated session. |
| `404` | Resource not found or local-only route disabled. |
| `500` | Unexpected server error. |

## Authentication Errors

Protected endpoints use `AuthenticatedGuard`. Send the `connect.sid` cookie received after login.

If local dev login is disabled, `POST /auth/dev-login` intentionally returns `404`.

## Decimal Values

Money values are backed by Prisma decimals. JSON responses commonly serialize them as strings, for example:

```json
{
  "balance": "10000.00",
  "priceRub": "1500.00"
}
```
