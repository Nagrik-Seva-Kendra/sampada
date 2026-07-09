# Database Setup Guide

Schema: two Prisma models, `User` (partners/employees; role-gated, admin stays
on env credentials) and `DeedTemplate` (draft/example deeds shown on a
deed-type's public info page). See `apps/api/prisma/schema.prisma` for the
authoritative field list.

## 1. Local Development Database

### Prerequisites
- PostgreSQL 16+ installed locally (or `pnpm db:up` — see `infra/README.md`)
- Node.js + pnpm

### Setup Steps
```bash
createdb sampada_dev
```

### .env (apps/api/.env, copied from .env.example)
```
DATABASE_URL="postgresql://sampada:sampada@localhost:5432/sampada_dev?schema=public"
DIRECT_URL="postgresql://sampada:sampada@localhost:5432/sampada_dev?schema=public"
```
`DIRECT_URL` matters once you point at Neon (below) — locally, with no
connection pooler, it's just the same value as `DATABASE_URL`.

### Initialize Schema
```bash
cd apps/api
pnpm prisma:generate
pnpm prisma:migrate dev   # applies the committed migrations
```

---

## 2. Production Database (Neon)

1. **Create a Neon project** at https://console.neon.tech.
2. Neon gives you two connection strings — a pooled one (PgBouncer) and a
   direct one. Grab both.
3. **In Render** (`sampada-api` service → Environment):
   ```
   DATABASE_URL=<neon pooled connection string>
   DIRECT_URL=<neon direct connection string>
   ```
4. Render's build command already runs `prisma migrate deploy` before
   bundling (see `render.yaml`), so pushing to `main` keeps Neon's schema in
   sync automatically. No manual `db push`/`migrate deploy` step needed
   unless you're testing ahead of a deploy.

---

## 3. Real Data Migration

The legacy on-disk JSONL/JSON data (`apps/api/uploads/users/users.jsonl` and
`apps/api/uploads/sample-deeds/records/*.json`) migrates into Postgres via:

```bash
cd apps/api
node scripts/migrate-real-data.mjs          # against whatever DATABASE_URL is set
```

It's idempotent — safe to re-run; existing users are backfilled, existing
deed templates (matched by id) are skipped. Run it once against local
Postgres to verify, then again with `DATABASE_URL` pointed at Neon for
production.

---

## Quick Commands

```bash
pnpm prisma:generate              # regenerate the Prisma client
pnpm prisma:migrate dev           # create + apply a migration (local)
pnpm exec prisma migrate deploy   # apply committed migrations (prod/CI)
pnpm exec prisma studio           # browse the DB at localhost:5555
```
