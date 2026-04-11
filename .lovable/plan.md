

# Restrict "Publish New Version" Panel to Developers

## Approach
Add a `role` distinction to `admin_profiles`. Currently all admins have `role = 'admin'`. We'll support an additional value `'developer'`. Only admins with `role = 'developer'` will see the "Publish New Version" panel — all other admins see the download card and setup guide as usual.

This is lightweight: one column already exists (`role` on `admin_profiles`, defaulting to `'admin'`), so we just need to allow a second value and gate the UI.

## Changes

### 1. Database
- No schema change needed — `admin_profiles.role` is already a `text` column defaulting to `'admin'`. We simply store `'developer'` for privileged admins.
- To promote an admin, run: `UPDATE admin_profiles SET role = 'developer' WHERE email = '...'` (or build a UI later).

### 2. Admin Context (`src/context/AdminContext.tsx`)
- Fetch the current admin's `role` from `admin_profiles` after login.
- Expose `adminRole` (string) on the context so components can check it.

### 3. Desktop App page (`src/components/dashboard/DesktopApp.tsx`)
- Read `adminRole` from context.
- Conditionally render the "Publish New Version" card only when `adminRole === 'developer'`.

### 4. Edge Function (`app-releases` POST)
- Add a server-side check: verify the calling admin's profile has `role = 'developer'` before allowing a publish. Return 403 otherwise.

## What regular admins see
The download card, setup guide, and tip — exactly as before, minus the publish form.

## What developers see
Everything above, plus the "Publish New Version" panel at the bottom.

