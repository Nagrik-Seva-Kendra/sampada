# Infra — local databases

Two databases run via Docker for local dev & testing:

| Service | Purpose | Port | Credentials |
|---|---|---|---|
| `postgres` | **New app DB** (Prisma-managed, starts empty) | 5432 | sampada / sampada |
| `legacy-mariadb` | **Staging copy** of the legacy DB (read-only reference) | 3307 | root / root |

## Staging copy of the legacy database
A copy of the original dump lives at `infra/legacy-db/codelogi_sampada.sql`
(git-ignored — it's ~289 MB). It was **copied**, not moved — the original in
`c:/Users/anujs/Downloads/etc/public_html/` is untouched.

On the **first** `docker compose up`, MariaDB auto-imports every `.sql` in
`infra/legacy-db/` into the `codelogi_sampada` database. Import of a 289 MB dump
takes a few minutes; the container is ready once healthy.

## Usage
```bash
pnpm db:up      # start both databases
pnpm db:down    # stop them
```

Connect the API's `.env`:
```
DATABASE_URL="postgresql://sampada:sampada@localhost:5432/sampada?schema=public"
LEGACY_DATABASE_URL="mysql://root:root@localhost:3307/codelogi_sampada"
```

> ⚠️ We are **not** migrating data yet. This staging MariaDB is only a safe,
> disposable copy to explore/test against. The real MariaDB→PostgreSQL migration
> is a later, separate phase.
