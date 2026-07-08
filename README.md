# Nagrik Seva Kendra (modernized)

Monorepo for the rebuilt property guideline-rate & e-registry portal.
Migrates the legacy PHP/MariaDB app to a decoupled TypeScript stack.

## Structure
```
apps/
  api/         NestJS REST API                → deploy: Render (Neon Postgres + Cloudflare R2)
  web/         Vite + React SPA               → deploy: Vercel
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
- **Home / About / Contact / Partner** — public, bilingual (EN/हिं), light + dark
- **Guideline Rates** — admin uploads district-wise PDFs per year (2015→latest); everyone views/downloads
- **e-Registry** — informational process page
- **Admin auth** — login → JWT (no expiry; stays logged in until logout); gates uploads & contact inbox
- Current features are **DB-free** (PDFs + contact messages stored on disk), so the app runs
  without Postgres/Docker. The DB phase adds a users table, legacy migration, and R2 storage.

## Getting started
```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # set ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET
pnpm dev                                  # runs api (:3001) + web (:5173) together
```
Open http://localhost:5173.

## ⚠️ Data
No real data is migrated yet. `infra/legacy-db/` holds a **copy** of the legacy dump for a
disposable staging MariaDB. The original download is untouched.
