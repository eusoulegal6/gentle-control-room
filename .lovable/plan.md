

## Problem Analysis

The native Windows notification bridge code exists in `Desktop.tsx` but has two failure paths:

1. **Realtime subscription is dead**: The Supabase Realtime channel subscribes to the `alerts` table using the `anon` key, but the table's RLS policy blocks anonymous reads. The subscription silently receives zero events, so `handleIncomingRealtimeAlert` (which calls `notifyNativeHost`) never fires.

2. **Polling notification logic is too narrow**: In `fetchAlerts()` (lines 271-281), native notifications are only sent when `pendingAlerts.length > 0`. If an alert is already marked `DELIVERED` by the edge function (or another mechanism) before the poll runs, the notification block is skipped entirely. This means alerts can appear in the UI list without ever triggering a native Windows popup.

## Plan

### 1. Fix polling to notify for ALL unseen alerts, not just pending ones

In `fetchAlerts()`, after fetching the latest alerts, compare the full list against `notifiedAlertIdsRef` and call `notifyNativeHost` for any alert not yet notified — regardless of its current status. Move the notification logic outside the `if (pendingAlerts.length > 0)` guard.

**File**: `src/pages/Desktop.tsx` (lines ~260-283)

```typescript
// After setting alerts, notify for any unseen alerts
const knownIds = new Set(notifiedAlertIdsRef.current);
const unseenAlerts = latestPayload.alerts.filter(
  (alert) => !knownIds.has(alert.id)
);
for (const alert of unseenAlerts) {
  notifyNativeHost(alert);
  knownIds.add(alert.id);
}
syncNotifiedAlertIds(knownIds);

setAlerts(sortAlertsByNewest(latestPayload.alerts));
```

### 2. Make `notifyNativeHost` work even without full desktop config

Currently the guard `if (!desktopConfig?.enableNativeNotifications) return;` silently blocks notifications if `__desktopConfig` isn't injected or the flag is missing. Change to also check for the webview bridge directly — if the bridge exists, always attempt to post the message.

**File**: `src/pages/Desktop.tsx` (line 206)

```typescript
const notifyNativeHost = (alert: DesktopAlert) => {
  // Skip only if config explicitly disables notifications
  if (desktopConfig && desktopConfig.enableNativeNotifications === false) return;
  // Skip if no bridge available
  if (!window.chrome?.webview?.postMessage) return;
  postDesktopHostMessage({ ... });
};
```

### 3. No backend or .NET changes needed

The edge functions, RLS, and .NET host code are all correct. The issue is purely in the React frontend's notification dispatch logic.

### Technical details

- **Files modified**: `src/pages/Desktop.tsx` only
- **Risk**: Low — only changes when `notifyNativeHost` is called, does not affect alert list rendering or delivery status updates
- **Duplicate prevention**: The existing `notifiedAlertIdsRef` + localStorage mechanism already prevents duplicate notifications across renders and sessions

