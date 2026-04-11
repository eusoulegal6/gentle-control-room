

# App Update Notification System

## Summary
Add a version-check system so the desktop app auto-detects new versions, plus let admins manually broadcast update alerts with changelog and download links from the dashboard.

## Database Change
- Create an `app_releases` table to track published versions:
  - `id` (uuid, PK)
  - `version` (text, unique, not null) — e.g. "0.2.0"
  - `download_url` (text, not null)
  - `release_notes` (text)
  - `published_at` (timestamptz, default now())
  - `created_by` (uuid, nullable)
- RLS: admins can SELECT/INSERT/UPDATE; anon can SELECT (desktop clients need to read the latest version).

## Edge Function: `app-releases`
- **GET** (no auth required): Returns the latest release (`version`, `download_url`, `release_notes`, `published_at`). The desktop app polls this.
- **POST** (admin auth required): Publishes a new release record. Accepts `version`, `download_url`, `release_notes`.
- **POST with `notify: true`**: After inserting the release, bulk-inserts an alert to all active desktop users with the release notes and download link as the alert message.

## Desktop App Changes

### Auto-detect (`desktop/…/wwwroot/app.js`)
- On login and every polling cycle, call `GET /app-releases` to fetch the latest version.
- Compare against `config.appVersion`. If server version is newer, show a persistent banner at the top of the UI: "Update available: v0.2.0 — [Download] [Dismiss]".
- The download link opens the URL from the release record.

### React Desktop page (`src/pages/Desktop.tsx`)
- Same logic for the hosted web view: fetch latest release, compare with a build-time version constant, show banner if outdated.

## Admin Dashboard Changes

### DesktopApp.tsx — Version management
- Below the existing download card, add a "Publish New Version" section:
  - Fields: Version number, Download URL, Release notes (textarea).
  - Checkbox: "Notify all desktop users" (sends an update alert to everyone).
  - Submit button calls `POST /app-releases`.
- Display the current published version pulled from `GET /app-releases`.

### Update the download card dynamically
- Fetch the latest release on mount. Use its `download_url` and `version` instead of the hardcoded `DOWNLOAD_URL` constant, so the card always points to the latest installer.

## Technical Details

```text
Admin publishes release
  → POST /app-releases (insert row + optional bulk alert)
  → Desktop apps detect on next poll cycle
  → Banner: "Update v0.2.0 available" + Download button

Version comparison: simple semver string compare (split on dots, compare numerically).
```

- No changes to the .NET host code — the banner lives in the WebView HTML/JS layer.
- The `app_releases` table doubles as the source of truth for the download URL on the admin dashboard, replacing the hardcoded constant.

