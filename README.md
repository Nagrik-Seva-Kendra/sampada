# Nagrik Seva Kendra (modernized)

Monorepo for the rebuilt property guideline-rate & e-registry portal.
Migrates the legacy PHP/MariaDB app to a decoupled TypeScript stack.

## Structure
```
apps/
  api/         NestJS REST API                → deploy: Coolify (api.nsk.mpe-registry.com)
  web/         Vite + React SPA               → deploy: Coolify (app.nsk.mpe-registry.com)
packages/
  shared/      Zod schemas + shared types (the API contract)
infra/
  docker-compose.yml   Postgres (new) + MariaDB (legacy staging copy) — local dev only
```

## Stack
- **Frontend:** React 19, Vite, TanStack Query (server state), Zustand (UI state), ky
- **Backend:** NestJS 11, Zod validation, JWT admin auth, Helmet
- **Shared:** one set of Zod schemas validates both API DTOs and frontend forms

## Features
- **Home / About / Partner** — public, bilingual (EN/हिं), light + dark
- **Deeds & instruments** — public info pages per deed type, backed by admin/partner-drafted
  example deeds (`DeedTemplate`); an admin "All Deeds" management view
- **e-Registry** — informational process page
- **Auth** — admin, partner, and employee accounts all Postgres-backed (JWT), with
  self-signup → admin approval flow and email-OTP verification
- Users and deed templates are Postgres-backed via Prisma (see `DATABASE_SETUP.md`). Profile
  photos still live on local disk pending a Cloudflare R2 migration.

## Getting started
```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # set JWT_SECRET, DATABASE_URL
pnpm db:up                                # start local Postgres (see infra/README.md)
pnpm --filter @sampada/api prisma:migrate # create tables
pnpm dev                                  # runs api (:3001) + web (:5173) together
```
Open http://localhost:5173.

## Data
See `DATABASE_SETUP.md` for local/Neon setup and the real-data migration script.
`infra/legacy-db/` holds a **copy** of the legacy MariaDB dump for a disposable staging
container — see `infra/README.md`.
