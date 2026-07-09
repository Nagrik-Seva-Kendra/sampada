# Deed Data Migration Guide

## Overview

Your application has 7,282 historical deed records stored as JSON files. This guide covers migrating all of them into PostgreSQL.

## Data Structure

### Current State
- **Location:** `apps/api/uploads/sample-deeds/`
- **Format:** Individual JSON files + JSONL backup
- **Total Records:** 7,282 deeds
- **Deed Types:** sale-deed, agreement, will-deed, power-of-attorney, release-deed, amendment-deed, lease-deed

### Sample Record Structure
```json
{
  "id": "legacy-1",
  "type": "sale-deed",
  "title": "भवन/मकान री सेल",
  "content": "विक्रय पत्र\n    यह कि,विक्रय पत्र में वर्णित...",
  "status": "active",
  "createdById": "legacy",
  "createdByName": "sample",
  "createdByRole": "ADMIN",
  "createdAt": "2019-03-10T08:11:22.000Z",
  "legacyId": 1
}
```

## Prisma Schema

```prisma
model Deed {
  id         String     @id @default(cuid())
  propertyId String?    // Link to property (optional)
  property   Property?  @relation(fields: [propertyId], references: [id])
  buyerId    String?    // Link to buyer (optional)
  buyer      Buyer?     @relation(fields: [buyerId], references: [id])
  sellerId   String?    // Link to seller (optional)
  seller     Seller?    @relation(fields: [sellerId], references: [id])
  partnerId  String?    // Link to partner/organization
  partner    Partner?   @relation(fields: [partnerId], references: [id])
  status     DeedStatus @default(DRAFT)  // DRAFT, ACTIVE, INACTIVE, COMPLETED
  slot       String?    // Flexible field for deed metadata
  mapUrl     String?    // URL to property map
  year       Int        // Deed year (extracted from createdAt)
  createdAt  DateTime   @default(now())
  updatedAt  DateTime   @updatedAt
}

enum DeedStatus {
  DRAFT
  ACTIVE
  INACTIVE
  COMPLETED
}
```

## Migration Strategy

### What Gets Migrated
✅ **Always migrate:**
- Deed ID (preserved for reference)
- Deed type (sale-deed, agreement, etc.)
- Deed status (active → ACTIVE, inactive → DRAFT)
- Creation date (year extracted)
- Deed content (metadata stored in `slot` field)
- Creator info (createdByName, createdByRole)
- Legacy ID (for traceability)

❌ **NOT migrated (due to lack of structured data):**
- Property details (stored as unstructured text in deed content)
- Buyer/Seller details (names embedded in deed text)
- Partner association (no clear mapping)
- Property links (deed content doesn't have structured location/property IDs)

### Metadata Storage

Since deed content is unstructured Hindi/English legal text, we store metadata in the `slot` field:

```json
{
  "legacyId": 1,
  "deedType": "sale-deed",
  "title": "भवन/मकान री सेल",
  "createdByName": "sample",
  "createdByRole": "ADMIN"
}
```

## Running the Migration

### 1. Local Database
```bash
cd apps/api

# Run the migration script
pnpm node scripts/migrate-real-data.mjs
```

**Expected output:**
```
🚀 Starting data migration...

📖 Reading users from apps/api/uploads/users/users.jsonl
✓ Found 2 users
✓ Migrated: muskanmishra94139@gmail.com (PARTNER)
  └─ Created partner record

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

### 2. Verify Migration
```bash
# Open Prisma Studio
pnpm prisma studio

# Check deed count in browser at http://localhost:5555
# Click on "Deed" model → should show 7,282 records
```

### 3. Query Deeds
```bash
# List deeds by status
curl http://localhost:3001/api/v1/deeds?status=ACTIVE

# Get single deed
curl http://localhost:3001/api/v1/deeds/legacy-1

# Search by deed type
curl http://localhost:3001/api/v1/deeds?type=sale-deed
```

### 4. Production Migration (Neon)
```bash
# Same command with Neon URL
DATABASE_URL="postgresql://[user]:[password]@[neon-host]/sampada_prod" \
  pnpm node scripts/migrate-real-data.mjs
```

## Future Enhancements

### Structured Deed Data
When you start creating new deeds in the app:

1. **Extract property info:**
   - Parse deed content to identify property location
   - Link to Property table

2. **Extract party info:**
   - Parse buyer/seller names from deed content
   - Create Buyer/Seller records
   - Link to Deed

3. **Add mapping features:**
   - Extract map URL/coordinates
   - Store in `mapUrl` field

### Example: Enhanced Deed Creation
```typescript
// When creating a new deed:
const deed = await prisma.deed.create({
  data: {
    propertyId: property.id,        // ✅ Structured
    buyerId: buyer.id,              // ✅ Structured  
    sellerId: seller.id,            // ✅ Structured
    partnerId: partner.id,          // ✅ Structured
    status: "ACTIVE",               // ✅ Enum
    year: new Date().getFullYear(),
    mapUrl: "https://maps.example.com/...",
    slot: null,  // No longer needed for new deeds
  }
});
```

## Data Integrity

### Idempotency
The migration script is safe to run multiple times:
- ✅ Won't duplicate existing deeds (checked by ID)
- ✅ Only creates users/deeds that don't exist
- ✅ Safe to resume if interrupted

### Rollback
If needed to rollback:
```bash
# Delete all migrated deeds (keeping app-created ones)
sqlite3 sampada_dev.db "DELETE FROM \"Deed\" WHERE id LIKE 'legacy-%';"

# Rerun migration
pnpm node scripts/migrate-real-data.mjs
```

## Troubleshooting

### "Deeds file not found"
```bash
# Verify file exists
ls -lh apps/api/uploads/sample-deeds/sample-deeds.jsonl.bak

# File should be ~1.5MB with 7,282 lines
wc -l apps/api/uploads/sample-deeds/sample-deeds.jsonl.bak
```

### Migration hangs on large deed count
- Normal for 7,282 records (takes 1-2 minutes)
- Progress shown every 1,000 records
- Safe to interrupt with Ctrl+C (will resume from next record)

### Deed queries return empty
```bash
# Check deed count in database
pnpm prisma studio

# or via SQL:
DATABASE_URL="..." psql -c "SELECT COUNT(*) FROM \"Deed\";"
```

### Status mapping issues
- Legacy "active" → **ACTIVE**
- Legacy "inactive" → **DRAFT**
- Legacy "completed" → **COMPLETED**
- Anything else → **DRAFT** (default)

## Summary

| Item | Count | Status |
|------|-------|--------|
| **Real Users** | 2 | ✅ Migrated |
| **Deed Records** | 7,282 | ✅ Migrated |
| **Deed Types** | 7 | ✅ Preserved |
| **Contact Messages** | 3 | ⏳ Optional |
| **Guideline PDFs** | 4+ | 🗑️ Not needed |

**Next steps:**
1. Run local migration
2. Verify Prisma Studio shows deeds
3. Set up Neon and run prod migration
4. Deploy API to Render
5. Test deed endpoints
