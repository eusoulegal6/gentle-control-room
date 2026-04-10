

## Plan: Simplify Desktop Page Layout + Fix Build Errors

### 1. Simplify the top card (lines 506-534 of `src/pages/Desktop.tsx`)

Replace the current hero-style top card with a compact action bar containing only the two buttons:

```
┌─────────────────────────────────────────────────┐
│  [Run In Background]              [Sign out]    │
└─────────────────────────────────────────────────┘
```

Remove: "BACKGROUND CLIENT" label, "Running and ready" title, description paragraph, all badges (realtime/tray/version).

### 2. Keep remaining sections unchanged

- "Signed in as" card stays as-is
- "Latest alerts" card stays as-is
- No Sync button reintroduced

### 3. Fix build errors in Edge Functions

**`supabase/functions/_shared/password.ts`** (line 51): Cast `salt` to `Uint8Array` to satisfy the `BufferSource` type:
```typescript
{ name: "PBKDF2", salt: salt as Uint8Array, iterations, hash: "SHA-256" }
```

**All four edge function catch blocks** (`admin-alerts`, `admin-users`, `desktop-alerts`, `desktop-auth`): Change `catch (err)` to `catch (err: unknown)` and use `(err instanceof Error ? err.message : "Internal server error")`.

### Files to modify

- `src/pages/Desktop.tsx` — simplify top card layout
- `supabase/functions/_shared/password.ts` — fix BufferSource type error
- `supabase/functions/admin-alerts/index.ts` — fix unknown error type
- `supabase/functions/admin-users/index.ts` — fix unknown error type
- `supabase/functions/desktop-alerts/index.ts` — fix unknown error type
- `supabase/functions/desktop-auth/index.ts` — fix unknown error type

