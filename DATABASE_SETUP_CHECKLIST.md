# Database Setup & Migration Checklist

## Phase 1: Local Development Database ✅ READY

### 1.1 Set Up Local PostgreSQL
```powershell
# Run the setup script from project root:
.\scripts\setup-local-db.ps1
```

This will:
- Create database `sampada_dev`
- Create user `sampada:sampada`
- Configure permissions
- Test connection
- Create `apps/api/.env.local`

**Manual Alternative (if script fails):**
```sql
-- In PostgreSQL admin
CREATE DATABASE sampada_dev;
CREATE USER sampada WITH PASSWORD 'sampada';
GRANT ALL PRIVILEGES ON DATABASE sampada_dev TO sampada;
```

### 1.2 Complete .env.local Setup
Edit `apps/api/.env.local` and add these from your existing `.env.example`:
```
DATABASE_URL="postgresql://sampada:sampada@localhost:5432/sampada_dev?schema=public"
CORS_ORIGIN=http://localhost:5173
ADMIN_EMAIL=admin@nagrikseva.in
ADMIN_PASSWORD=your-test-password
JWT_SECRET=local-dev-secret
JWT_REFRESH_SECRET=local-dev-refresh-secret
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-pass
```

### 1.3 Initialize Prisma Schema
```bash
cd apps/api
pnpm install
pnpm prisma:generate
pnpm prisma:migrate dev --name init
```

**Expected output:**
```
✔ Your database is now in sync with your schema.

✔ Generated Prisma Client

Start using Prisma Client in your application:
  import { PrismaClient } from '@prisma/client'

  const prisma = new PrismaClient()
```

### 1.4 Migrate Real User & Deed Data (Locally)
```bash
cd apps/api
pnpm node scripts/migrate-real-data.mjs
```

**Expected output:**
```
🚀 Starting data migration...

📖 Reading users from apps/api/uploads/users/users.jsonl
✓ Found 2 users
✓ Migrated: muskanmishra94139@gmail.com (PARTNER)
  └─ Created partner record
✓ Migrated: (second user)...

📜 Migrating deed records...
  ... processed 1000 deeds
  ... processed 2000 deeds
  ... processed 7282 deeds
✅ Migration complete!

📋 Summary:
   - Users migrated with legacy password (rehash on first login)
   - 7282 deed records imported
   - Ready for testing
```

### 1.5 Verify Local Setup
```bash
# View database in Prisma Studio
cd apps/api
pnpm prisma studio
```
Visit http://localhost:5555 to inspect the data

---

## Phase 2: Production Database (Neon) ⏳ TODO

### 2.1 Create Neon Project
1. Go to https://console.neon.tech
2. Sign in or create account
3. Create new project:
   - **Name:** `sampada-prod`
   - **Database name:** `sampada_prod`
   - **Region:** Singapore (or closest to Gwalior)
   - Keep all other defaults

4. Save the connection string (copy from Neon console):
```
postgresql://[user]:[password]@[neon-host]/sampada_prod
```

### 2.2 Push Schema to Neon
```bash
cd apps/api

# Test connection first
DATABASE_URL="postgresql://[user]:[password]@[neon-host]/sampada_prod" \
  pnpm prisma db validate

# Deploy schema
DATABASE_URL="postgresql://[user]:[password]@[neon-host]/sampada_prod" \
  pnpm prisma db push
```

**Expected output:**
```
✔ Schema pushed to the database

Introspected 9 models and generated 1 migration file in prisma/migrations
```

### 2.3 Configure Render Environment
Update `render.yaml` to include Neon URL:

```yaml
envVars:
  - key: DATABASE_URL
    value: postgresql://[user]:[password]@[neon-host]/sampada_prod
  - key: NODE_VERSION
    value: 22.16.0
  - key: CORS_ORIGIN
    value: https://your-web-domain.vercel.app
  # ... other vars
```

### 2.4 Migrate Real Data to Neon Production
```bash
cd apps/api

DATABASE_URL="postgresql://[user]:[password]@[neon-host]/sampada_prod" \
  pnpm node scripts/migrate-real-data.mjs
```

### 2.5 Verify Production Setup
```bash
# Connect to Neon and verify data
DATABASE_URL="postgresql://[user]:[password]@[neon-host]/sampada_prod" \
  pnpm prisma studio
```

---

## Phase 3: Cloudflare R2 Setup ⏳ OPTIONAL (For Future File Uploads)

### 3.1 Create R2 Bucket (Optional, when needed)
1. Log in to Cloudflare Dashboard
2. Navigate to **Storage → R2**
3. Create bucket:
   - **Name:** `sampada-assets`
   - **Region:** Singapore (or optimal for your region)
4. Create API token:
   - **Name:** `sampada-r2-token`
   - **Permissions:** Edit (includes read + write)
   - **Apply to:** `sampada-assets` bucket only
   - Save credentials

### 3.2 Add Environment Variables to Render (Optional)
In `render.yaml`, add when R2 is ready:
```yaml
envVars:
  - key: CLOUDFLARE_R2_BUCKET
    value: sampada-assets
  - key: CLOUDFLARE_R2_ACCOUNT_ID
    value: your-account-id
  - key: CLOUDFLARE_R2_ACCESS_KEY_ID
    value: your-access-key
  - key: CLOUDFLARE_R2_SECRET_ACCESS_KEY
    value: your-secret-key
  - key: CLOUDFLARE_R2_PUBLIC_URL
    value: https://sampada-assets.xxx.r2.cloudflarestorage.com
```

**Note:** Not required for MVP. Guideline feature is not being used.

---

## Phase 4: Testing & Verification ⏳ TODO

### 4.1 Local Testing
- [ ] Start dev server: `cd apps/api && pnpm dev`
- [ ] API health check: `curl http://localhost:3001/api/v1/health`
- [ ] List users: `curl http://localhost:3001/api/v1/users` (with auth)
- [ ] Query deeds: `curl http://localhost:3001/api/v1/deeds` (should return 7,282 records)
- [ ] Verify Prisma Studio shows users + deeds

### 4.2 Production Readiness
- [ ] Test API against Neon in staging
- [ ] Verify environment variables in Render dashboard
- [ ] Check logs for any connection errors
- [ ] Monitor database metrics in Neon console
- [ ] Verify deed counts match local DB

### 4.3 Deployment
- [ ] Push code to main branch
- [ ] Render auto-deploys API
- [ ] Verify production API health
- [ ] Check database size/queries in Neon console

---

## 📊 Data Summary

**Current Real Data:**
- ✓ 2 real users (in `uploads/users/users.jsonl`)
- ✓ 7,282 deed records (in `uploads/sample-deeds/sample-deeds.jsonl.bak`)
- ✓ 3 contact messages (in `uploads/contact/messages.jsonl`) - not migrated yet
- ✓ 4+ Guideline PDFs (Gwalior 2026, ~4.1MB) - not required, can delete

**Migration Status:**
- ✅ Users → Migrated with script
- ✅ Deeds → Imported (7,282 records with deed type + status)
- ⏳ Contact Messages → Optional, can add later
- 🗑️ Guidelines → Removed (not needed)

---

## 🔗 Important URLs

- **Neon Console:** https://console.neon.tech
- **Cloudflare Dashboard:** https://dash.cloudflare.com
- **Render Dashboard:** https://dashboard.render.com
- **Vercel Dashboard:** https://vercel.com/dashboard (web only)

---

## 🆘 Troubleshooting

### PostgreSQL connection refused
```powershell
# Check PostgreSQL service is running
Get-Service postgresql-*

# Start if stopped
Start-Service postgresql-x64-16
```

### Neon connection timeout
- Check firewall allows PostgreSQL (port 5432)
- Verify IP is whitelisted in Neon console

### Prisma migration conflicts
```bash
cd apps/api
pnpm prisma migrate resolve --rolled-back

# Then retry
pnpm prisma migrate dev
```

### Environment variables not loading
- Ensure `.env.local` is in `apps/api/`
- Not in git (should be in .gitignore)
- Restart dev server after changes

---

## 📝 Notes

1. **Password Hashing:** Legacy passwords from users.jsonl are kept as-is. Users will need password reset on first login.
2. **Guideline Rates:** Currently hardcoded in migration script. Can be extended to parse PDF data.
3. **Legacy Data:** 7,282 sample deeds are for reference only. Full migration is a separate task.
4. **R2 Sync:** Manual sync for now. Automate later with scheduled jobs.

---

## Next: Start Here

1. Run: `.\scripts\setup-local-db.ps1`
2. Run: `cd apps/api && pnpm prisma:migrate dev`
3. Run: `pnpm node scripts/migrate-real-data.mjs`
4. Test: `pnpm prisma studio`
5. Then proceed to Phase 2 (Neon setup)
