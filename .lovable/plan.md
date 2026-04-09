

# Plan: Connect Desktop App to Lovable Cloud Edge Functions

## Current State

The `Desktop.tsx` page (rendered inside the .NET WebView2 app) still calls the **old Express API** at paths like `/api/desktop/auth/login`, `/api/desktop/alerts`, etc. and uses WebSocket (`/ws/desktop-alerts`) for realtime. These endpoints no longer exist — they've been replaced by edge functions (`desktop-auth`, `desktop-alerts`).

## What Needs to Change

### 1. Update `Desktop.tsx` API calls to use Edge Functions

Replace all `fetch()` calls from the old Express routes to the new edge function URLs:

| Old Express route | New Edge Function call |
|---|---|
| `POST /api/desktop/auth/login` | `POST /functions/v1/desktop-auth/login` |
| `POST /api/desktop/auth/refresh` | `POST /functions/v1/desktop-auth/refresh` |
| `POST /api/desktop/auth/logout` | `POST /functions/v1/desktop-auth/logout` |
| `GET /api/desktop/alerts` | `GET /functions/v1/desktop-alerts?userId=xxx` |
| `POST /api/desktop/alerts/:id/delivered` | `PATCH /functions/v1/desktop-alerts/:id` with `{status:"DELIVERED"}` |
| `POST /api/desktop/alerts/:id/read` | `PATCH /functions/v1/desktop-alerts/:id` with `{status:"READ"}` |

The base URL will be constructed from `VITE_SUPABASE_URL` (for web preview) or from `window.__desktopConfig.apiBaseUrl` (for the desktop app — which will need updating in `appsettings.json` later).

All requests must include the `apikey` header with the Supabase anon key.

### 2. Update `src/lib/api.ts` — `getApiBaseUrl()`

Add a helper that returns the edge functions base URL. For the web preview, this is `https://<project-ref>.supabase.co/functions/v1`. For the desktop app, it comes from `__desktopConfig`.

### 3. Replace WebSocket Realtime with Supabase Realtime

Remove the WebSocket connection logic in `Desktop.tsx` and replace it with a Supabase Realtime subscription on the `alerts` table filtered by `recipient_id`. This requires:
- Enabling realtime on the `alerts` table (already done)
- Using the Supabase JS client with the anon key to subscribe
- No auth session needed for realtime — the edge functions use the service role, and we can subscribe using the anon key with a channel filter

### 4. Update `appsettings.json` for Desktop App

Document that the desktop app's `appsettings.json` needs to point `Api.BaseUrl` to the Supabase project URL (e.g., `https://ipwmfdsnzjhzeofwwptk.supabase.co/functions/v1`) instead of `http://127.0.0.1:3001`. This is a manual change the user makes when building the .NET app.

## Technical Details

- `Desktop.tsx` will construct URLs like: `${supabaseUrl}/functions/v1/desktop-auth/login`
- Every request includes `apikey: <anon-key>` header (required by Supabase edge functions)
- The desktop auth flow remains custom (username/password with session tokens in `desktop_sessions`) — it does **not** use Supabase Auth
- Realtime subscription uses `supabase.channel('desktop-alerts').on('postgres_changes', ...)` filtered by `recipient_id = <logged-in-user-id>`

## Files Changed

1. **`src/lib/api.ts`** — Add `getEdgeFunctionsBaseUrl()` and `getSupabaseAnonKey()` helpers
2. **`src/pages/Desktop.tsx`** — Rewrite API calls to use edge function URLs, replace WebSocket with Supabase Realtime
3. **`desktop/GentleControlRoom.Desktop/appsettings.json`** — Update example config (documentation)

## Build Order

1. Update `src/lib/api.ts` with edge function URL helpers
2. Rewrite `Desktop.tsx` API layer to call edge functions
3. Replace WebSocket logic with Supabase Realtime subscription
4. Test the flow in the web preview (login as desktop user, receive alerts)

