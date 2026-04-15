# Emergency Staff Alert

Frontend:
- `npm run dev` starts the Vite dashboard on port `8080`.

Backend:
- Copy `.env.example` to `.env`.
- `npm run db:generate`
- `npm run db:init`
- `npm run db:seed`
- `npm run server:dev`

Production build:
- `npm run build:full`

Backend API domains:
- Admin authentication and session refresh.
- Desktop user CRUD with password hashing.
- Alert creation, retrieval, delivery acknowledgement, and read acknowledgement.

Windows desktop packaging:
- Desktop host project: `desktop/GentleControlRoom.Desktop`
- Installer script: `installer/GentleControlRoom.iss`
- Build/package guide: `docs/windows-desktop-installer.md`
