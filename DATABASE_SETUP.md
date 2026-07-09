# Database Setup Guide

## 1. Local Development Database

### Prerequisites
- PostgreSQL 16+ installed locally
- Node.js + pnpm

### Setup Steps

#### Windows (PowerShell)
```powershell
# Create local database
$env:PGUSER = "postgres"
$env:PGPASSWORD = "postgres"

# Create database and user
psql -h localhost -c "CREATE DATABASE sampada_dev;"
psql -h localhost -d sampada_dev -c "CREATE USER sampada WITH PASSWORD 'sampada';"
psql -h localhost -d sampada_dev -c "GRANT ALL PRIVILEGES ON DATABASE sampada_dev TO sampada;"
```

#### .env.local (for local development)
```
DATABASE_URL="postgresql://sampada:sampada@localhost:5432/sampada_dev?schema=public"
```

### Initialize Schema
```bash
cd apps/api
pnpm prisma:migrate dev --name init
```

---

## 2. Production Database (Neon)

### Neon PostgreSQL Setup

1. **Create Neon Project:**
   - Go to https://console.neon.tech
   - Create new project (name: "sampada-prod")
   - Save the connection string:
     ```
     postgresql://[user]:[password]@[host]/[dbname]
     ```

2. **Environment Variable:**
   In Render environment settings, add:
   ```
   DATABASE_URL=postgresql://[user]:[password]@[host]/sampada_prod
   ```

3. **Initial Schema Migration:**
   ```bash
   # Run migrations on Neon production
   DATABASE_URL="your-neon-url" pnpm prisma:migrate deploy
   ```

---

## 3. Data Migration

### Phase 1: Migrate Real Users & Deeds

**Files to migrate:**
- `apps/api/uploads/users/users.jsonl` (2 real users)
- `apps/api/uploads/sample-deeds/sample-deeds.jsonl.bak` (7,282 deed records)

**Migration Script:** `apps/api/scripts/migrate-real-data.mjs`

**What gets migrated:**
- **Users:** Email, name, password hash (legacy format), role mapped (EMPLOYEE → PARTNER)
- **Deeds:** All 7,282 records imported with:
  - Deed ID, type, status (active/inactive → ACTIVE/DRAFT)
  - Year extracted from createdAt date
  - Deed metadata stored in `slot` field (legacyId, title, createdByName, deedType)
  - Legacy timestamps preserved

**Run locally:**
```bash
cd apps/api
pnpm node scripts/migrate-real-data.mjs
```

**Expected result:** 
- 2 users in `User` table + 2 `Partner` records
- 7,282 deeds in `Deed` table
- All timestamps and IDs preserved for reference

---

## 4. Cloudflare R2 Setup (Optional)

### Create R2 Bucket for Future File Storage
1. Go to Cloudflare Dashboard → R2 Storage
2. Create bucket: `sampada-assets`
3. Generate API token:
   - Permissions: Read + Write on `sampada-assets`
   - Save credentials

### Environment Variables
```
CLOUDFLARE_R2_BUCKET=sampada-assets
CLOUDFLARE_R2_ACCOUNT_ID=xxx
CLOUDFLARE_R2_ACCESS_KEY=xxx
CLOUDFLARE_R2_SECRET_KEY=xxx
CLOUDFLARE_R2_PUBLIC_URL=https://sampada-assets.your-account.r2.cloudflarestorage.com
```

**Note:** Currently only used for future file uploads. Guideline PDFs are not required.

---

## 5. Verification Checklist

- [ ] Local PostgreSQL running
- [ ] `.env.local` configured with `DATABASE_URL`
- [ ] `prisma:migrate dev` successful
- [ ] Neon project created
- [ ] `render.yaml` env var pointing to Neon
- [ ] Users migrated to local DB
- [ ] Users migrated to Neon prod DB
- [ ] Guideline rates uploaded
- [ ] PDFs synced to Cloudflare R2
- [ ] API tested against both DBs

---

## Quick Commands

```bash
# Generate Prisma client
pnpm prisma:generate

# Run migrations (local)
pnpm prisma:migrate dev

# Push schema (prod/no migrations)
DATABASE_URL="..." pnpm prisma db push

# Open Prisma Studio (local)
pnpm prisma studio

# Seed test data
pnpm prisma db seed
```

---

## Next: Detailed Implementation

See `MIGRATION_TASKS.md` for step-by-step implementation tasks.
