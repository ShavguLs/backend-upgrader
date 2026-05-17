# Auth API

Authentication is session-based. The backend stores sessions in PostgreSQL and sends a `connect.sid` cookie to the client.

Protected requests must include the session cookie.

## `GET /auth/steam`

Starts the Steam OpenID login flow.

### Auth

Not required.

### Response

Redirects to Steam through Passport's Steam strategy.

## `GET /auth/steam/return`

Steam OpenID callback URL.

### Auth

Not required directly. Steam must complete the login flow successfully.

### Response

Redirects to `FRONTEND_URL` (or `http://localhost:3001`) and establishes the session.

## `GET /auth/me`

Returns the current logged-in user.

### Auth

Required.

### Response

```json
{
  "id": 1,
  "steamId": "76561198000000000",
  "displayName": "Player",
  "avatar": "https://...",
  "profileUrl": "https://steamcommunity.com/id/..."
}
```

## `POST /auth/dev-login`

Creates or updates a local test user and logs it into the current session.

### Auth

Not required.

### Environment

Requires:

```text
ENABLE_DEV_LOGIN=true
```

If disabled, this endpoint returns `404 Not Found`.

### Response

```json
{
  "user": {
    "id": 1,
    "steamId": "local-test-user",
    "displayName": "Local Test User",
    "profileUrl": "http://localhost/local-test-user",
    "avatar": "http://localhost/local-test-user-avatar.png"
  }
}
```

The local test user's wallet is set to `10000.00 RUB`.

## `POST /auth/logout`

Logs out the current session, destroys the session record, and clears `connect.sid`.

### Auth

Uses the current session if one exists.

### Response

```json
{
  "message": "Logged out successfully"
}
```
