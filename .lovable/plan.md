

# Alert Acknowledgment Feature

## Summary
Add a mandatory "Confirm" button to each alert on the desktop client. The button is disabled for 5 seconds after the alert appears, forcing the employee to wait before acknowledging. Once confirmed, a new `ACKNOWLEDGED` status is recorded with a timestamp, visible to the admin in the Alert History.

## Database Change
- Add `acknowledged_at` (nullable timestamp) column to the `alerts` table.
- Add `ACKNOWLEDGED` as a valid status value (the status column is a text field, so no enum migration needed).

## Edge Function Changes (`desktop-alerts`)
- Accept `{ status: "ACKNOWLEDGED" }` in the PATCH handler, setting `status = 'ACKNOWLEDGED'` and `acknowledged_at = now()`.
- Include `acknowledgedAt` in all serialized alert responses.

## Edge Function Changes (`admin-alerts`)
- Include `acknowledged_at` in the alert serialization so the admin dashboard receives it.

## Desktop Client (`src/pages/Desktop.tsx`)
- Add `ACKNOWLEDGED` to the `DesktopAlertStatus` type and badge variant map.
- Replace the current "Mark read" button with a "Confirm" button that:
  - Appears for alerts with status `DELIVERED` (not yet acknowledged).
  - Starts **disabled** with a 5-second countdown timer displayed on the button (e.g., "Confirm (5s)", "Confirm (4s)", ...).
  - Becomes enabled after 5 seconds, showing just "Confirm".
  - On click, PATCHes the alert to `ACKNOWLEDGED`.
- Track countdown per alert using a `useEffect` + `setTimeout` pattern keyed to the alert's `deliveredAt` timestamp.

## Desktop Client (`desktop/…/wwwroot/app.js`)
- Mirror the same logic: render a disabled confirm button with a 5-second countdown, then enable it. On click, PATCH to `ACKNOWLEDGED`.

## Admin Dashboard (`AlertHistory.tsx` + `AdminContext.tsx`)
- Add `ACKNOWLEDGED` to the status badge map (use a distinct color like green).
- Display `acknowledgedAt` timestamp in the alert history table as a new "Acknowledged" column.
- Update the `Alert` interface in `AdminContext.tsx` to include `acknowledgedAt`.

## Technical Details

```text
Alert lifecycle:  PENDING → DELIVERED → ACKNOWLEDGED
                                    (5s delay before confirm enabled)
```

- Migration: `ALTER TABLE alerts ADD COLUMN acknowledged_at timestamptz;`
- The 5-second delay is purely client-side (countdown from when the alert card renders or from `deliveredAt`, whichever is later).
- No changes to the native notification bridge — the confirm action happens in the WebView UI, not the Windows toast.

