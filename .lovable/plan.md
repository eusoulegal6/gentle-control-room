

## Plan: Sidebar + Content Split Layout (Option D)

Restructure the signed-in desktop page into a two-column layout: a narrow left sidebar with user info and actions, and the alerts list filling the right side — all inside one card.

### Layout

```text
┌────────────────┬──────────────────────────────────┐
│ 👤 me1         │ Latest alerts                    │
│    me           │                                  │
│                │ 🔔 New Alert  DELIVERED  [Read]  │
│ [Run In Bg]    │    hi · 4/10/2026, 11:22 AM     │
│ [Sign out]     │                                  │
└────────────────┴──────────────────────────────────┘
```

### Changes (single file: `src/pages/Desktop.tsx`)

1. **Replace the three stacked cards** (action bar, user info, alerts) with a single `Card` containing a two-column flex layout.

2. **Left column** (~180px, border-right divider):
   - User avatar icon + display name + username at the top
   - Two buttons stacked vertically at the bottom ("Run In Background", "Sign out")
   - Compact padding throughout

3. **Right column** (flex-1):
   - "Latest alerts" heading + description
   - Alert list with existing scroll area and compact row styling
   - All current alert rendering logic preserved as-is

4. **Keep**: all existing logic (mark-as-read, realtime subscription, native notifications, window sizing hook ref on the outer container), compact typography, and visual style.

5. **No new files** — purely a layout refactor within the returned JSX of the signed-in state (lines 505-579).

