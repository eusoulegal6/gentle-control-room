# Gentle Control Room — Windows Desktop App API Reference

## Base URL

All endpoints are Supabase Edge Functions:

```
https://<project-id>.supabase.co/functions/v1/
```

Use `VITE_SUPABASE_URL` from the project environment as your base.

---

## Authentication Flow

Desktop users authenticate via **custom JWT tokens** (NOT Supabase Auth).

### 1. Login

```
POST /functions/v1/desktop-login
Content-Type: application/json

{
  "username": "john.doe",
  "password": "SecurePass123!"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbG...",
  "refreshToken": "a1b2c3d4...",
  "user": {
    "id": "uuid-here",
    "username": "john.doe",
    "displayName": "John Doe",
    "status": "ACTIVE",
    "mustResetPassword": false
  }
}
```

**Error (401):** `{ "error": "Invalid credentials" }`
**Error (403):** `{ "error": "Account is disabled" }`
**Error (429):** `{ "error": "Too many login attempts..." }`

### 2. Refresh Token

```
POST /functions/v1/desktop-refresh
Content-Type: application/json

{
  "refreshToken": "a1b2c3d4..."
}
```

**Response (200):** Same shape as login. Old refresh token is invalidated (rotation).

### 3. Logout

```
POST /functions/v1/desktop-logout
Content-Type: application/json

{
  "refreshToken": "a1b2c3d4..."
}
```

**Response:** `204 No Content`

### 4. Get Current User

```
GET /functions/v1/desktop-me
Authorization: Bearer <accessToken>
```

**Response (200):**
```json
{
  "user": {
    "id": "uuid-here",
    "username": "john.doe",
    "displayName": "John Doe",
    "status": "ACTIVE"
  }
}
```

---

## Alerts

### List My Alerts

```
GET /functions/v1/desktop-alerts?status=PENDING&limit=50
Authorization: Bearer <accessToken>
```

Query params:
- `status`: `ALL` | `PENDING` | `DELIVERED` | `READ` (default: `ALL`)
- `limit`: 1-200 (default: 50)

**Response (200):**
```json
{
  "alerts": [
    {
      "id": "uuid-here",
      "recipientId": "uuid-here",
      "title": "New Alert",
      "message": "Please complete your report by 5 PM.",
      "status": "PENDING",
      "createdAt": "2026-04-09T12:00:00.000Z",
      "deliveredAt": null,
      "readAt": null
    }
  ]
}
```

### Mark Alert Delivered

```
POST /functions/v1/desktop-alerts/<alertId>/delivered
Authorization: Bearer <accessToken>
```

**Response (200):** Updated alert object.

### Mark Alert Read

```
POST /functions/v1/desktop-alerts/<alertId>/read
Authorization: Bearer <accessToken>
```

**Response (200):** Updated alert object.

---

## Realtime Alert Subscription

The desktop app should subscribe to Supabase Realtime for live alerts.

### .NET Example (using supabase-csharp or raw WebSocket)

Subscribe to `INSERT` events on the `alerts` table filtered by `recipient_id`:

```
Channel: realtime:public:alerts
Filter: recipient_id=eq.<desktopUserId>
Event: INSERT
```

When a new alert arrives, the payload will contain:
```json
{
  "id": "uuid",
  "recipient_id": "uuid",
  "title": "New Alert",
  "message": "...",
  "status": "PENDING",
  "created_at": "2026-04-09T12:00:00.000Z",
  "delivered_at": null,
  "read_at": null
}
```

After receiving, call `POST /desktop-alerts/<id>/delivered` to acknowledge.

### Polling Fallback

If Realtime is unavailable, poll `GET /desktop-alerts?status=PENDING` every 10-30 seconds.

---

## Status Values

| Entity | Values |
|--------|--------|
| `desktop_users.status` | `ACTIVE`, `DISABLED` |
| `alerts.status` | `PENDING` → `DELIVERED` → `READ` |

---

## Test Steps

1. **Create first admin**: Sign up in the web app → auto-creates admin_profiles row
2. **Create desktop user**: Dashboard → User Management → Add User → copy temporary password
3. **Desktop login**: `POST /desktop-login` with username + password → get tokens
4. **Send alert**: Dashboard → Send Alert → select user → type message → Send
5. **Realtime receive**: Desktop app subscribed to Realtime receives the alert instantly
6. **Mark delivered**: `POST /desktop-alerts/<id>/delivered`
7. **Mark read**: `POST /desktop-alerts/<id>/read`
8. **Verify in admin**: Dashboard → Alert History → status should update to DELIVERED/READ