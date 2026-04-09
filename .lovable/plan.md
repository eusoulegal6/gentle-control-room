

# Fix: PATCH Requests Blocked by Missing CORS `Access-Control-Allow-Methods`

## Root Cause

The `desktop-alerts` edge function defines CORS headers without `Access-Control-Allow-Methods`:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
```

The browser sends a preflight `OPTIONS` request before every `PATCH`. The preflight returns 200, but the response lacks `Access-Control-Allow-Methods: PATCH`, so the browser blocks the actual PATCH call. This means:

- **mark-as-delivered** silently fails on every poll cycle (every 15s)
- **mark-as-read** silently fails when clicked
- Alerts are stuck in PENDING forever

## Fix

### 1. `supabase/functions/desktop-alerts/index.ts`

Add `Access-Control-Allow-Methods` to the CORS headers:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};
```

### 2. `supabase/functions/desktop-auth/index.ts`

Same fix for consistency (only uses POST today, but future-proofs it):

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};
```

### 3. Deploy and verify

After deploying both functions, the PATCH calls should appear in the edge logs and alerts will correctly transition from PENDING → DELIVERED → READ.

## Files Changed

1. `supabase/functions/desktop-alerts/index.ts` — add `Access-Control-Allow-Methods`
2. `supabase/functions/desktop-auth/index.ts` — add `Access-Control-Allow-Methods`

