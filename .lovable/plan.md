

# Plan: Migrate Express Backend to Lovable Cloud Edge Functions

## Current Situation

Your project has a fully working Express/Prisma/SQLite backend (`server/`) that handles:
- **Admin auth** (register, login, refresh, logout, me)
- **Desktop user CRUD** (create, edit, delete, list)
- **Alert management** (create, list, status updates)
- **Desktop auth** (login, refresh, logout, me)
- **WebSocket realtime** for desktop alert delivery

The frontend (`AdminContext.tsx`) calls these Express APIs. Lovable's preview can't run an Express server, so the app currently shows nothing useful in the live preview.

Your Lovable Cloud database already has the right tables (`admin_profiles`, `desktop_users`, `desktop_sessions`, `alerts`) mirroring the Prisma schema.

## Migration Strategy

We'll replace the Express API with **Lovable Cloud edge functions** and **Supabase Auth** for admin login, while keeping the desktop user/session management as custom logic (since desktop users authenticate with username/password, not Supabase Auth).

### Step 1: Use Supabase Auth for Admin Login

Replace the custom admin JWT auth with Supabase Auth (email + password). The frontend will use `supabase.auth.signUp()` / `signInWithPassword()` instead of calling `/api/admin/auth/*`. The `admin_profiles` table already has RLS policies tied to `auth.uid()`.

### Step 2: Create Edge Functions for Desktop User Management

Create edge functions to replace Express routes:

- **`admin-users`** — CRUD for desktop users (list, create, update, delete). Validates the caller is an authenticated admin via Supabase JWT. Handles password hashing with bcrypt.
- **`admin-alerts`** — Create and list alerts. Validates admin auth, checks recipient status.
- **`desktop-auth`** — Login/refresh/logout for desktop users using username+password (custom JWT or session tokens stored in `desktop_sessions`).
- **`desktop-alerts`** — List alerts for a desktop user, mark as delivered/read.

### Step 3: Update Database Schema

Add missing columns/constraints via migrations:
- Ensure `desktop_sessions` and `alerts` tables support the needed insert/update operations (currently RLS blocks inserts/updates — we'll need policies or use the service role in edge functions).

### Step 4: Rewrite AdminContext to Use Supabase

Replace `AdminContext.tsx` to:
- Use `supabase.auth` for login/logout/session management
- Call edge functions via `supabase.functions.invoke()` for user CRUD and alerts
- Remove all direct `fetch()` calls to the Express API

### Step 5: Handle Desktop Realtime

Replace the WebSocket server with Supabase Realtime — enable realtime on the `alerts` table so the desktop app can subscribe to new alerts via Supabase channels.

## What Changes

| Component | Before | After |
|-----------|--------|-------|
| Admin auth | Custom JWT via Express | Supabase Auth (email/password) |
| API calls | `fetch()` to Express | `supabase.functions.invoke()` |
| Desktop user CRUD | Express routes | Edge function `admin-users` |
| Alert management | Express routes | Edge function `admin-alerts` |
| Desktop auth | Express routes + custom JWT | Edge function `desktop-auth` |
| Realtime alerts | WebSocket server | Supabase Realtime on `alerts` table |
| Database | SQLite via Prisma | Lovable Cloud (Postgres) |

## What Stays the Same

- The `.NET desktop app` code is untouched (it will just point to different API URLs)
- The frontend UI components (Dashboard, UserManagement, SendAlert, AlertHistory) stay the same
- The data model is unchanged

## Technical Details

- Edge functions will use the Supabase service role client (via `SUPABASE_SERVICE_ROLE_KEY` env var available automatically) to bypass RLS for admin operations
- Password hashing for desktop users will use bcrypt in edge functions
- Desktop auth will issue custom JWTs or use simple session tokens stored in `desktop_sessions`
- We'll add RLS policies or use service role where needed for insert/update operations

## Build Order

1. Set up Supabase Auth for admin login + update Login page
2. Create `admin-users` edge function + wire up UserManagement
3. Create `admin-alerts` edge function + wire up SendAlert and AlertHistory
4. Create `desktop-auth` edge function (for the Windows app)
5. Create `desktop-alerts` edge function (for the Windows app)
6. Enable Supabase Realtime on alerts table
7. Fix build errors (remove Express imports from frontend tsconfig)

