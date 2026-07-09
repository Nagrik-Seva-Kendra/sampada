#!/usr/bin/env node
// Migrate real data: users + deed templates from legacy on-disk storage into
// PostgreSQL. Deed templates are read from the live records/ directory (the
// source SampleDeedsService actually reads/writes), not the stale .bak
// snapshot. User passwords are kept as-is (rehash required on next login).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
import { PrismaClient } from "@prisma/client";

const here = path.dirname(fileURLToPath(import.meta.url));
const usersFile = path.resolve(here, "..", "uploads", "users", "users.jsonl");
const templatesDir = path.resolve(here, "..", "uploads", "sample-deeds", "records");
const prisma = new PrismaClient();

async function readJsonLines(filePath) {
  const rows = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      console.error(`Failed to parse line: ${line.slice(0, 80)}`);
    }
  }
  return rows;
}

async function migrateUsers() {
  if (!fs.existsSync(usersFile)) {
    console.error(`Users file not found: ${usersFile}`);
    process.exit(1);
  }

  console.log("📖 Reading users from", usersFile);
  const legacyUsers = await readJsonLines(usersFile);
  console.log(`✓ Found ${legacyUsers.length} users`);

  // Legacy roles map 1:1 onto the new Role enum — no remapping needed.
  const validRoles = new Set(["PUBLIC", "PARTNER", "EMPLOYEE", "ADMIN"]);

  const validStatuses = new Set(["PENDING", "ACTIVE", "INACTIVE"]);

  for (const user of legacyUsers) {
    try {
      const role = validRoles.has(user.role) ? user.role : "PUBLIC";
      const status = validStatuses.has(user.status) ? user.status : "ACTIVE";
      const data = {
        email: user.email,
        username: user.username || null,
        fname: user.fname || "User",
        lname: user.lname || "",
        mobile: user.phone || null,
        passwordHash: user.passwordHash || "migrate:required",
        passwordEnc: user.passwordEnc || null,
        employeeCode: user.employeeCode || null,
        photoFileName: user.photoFileName || null,
        role,
        status,
      };

      const existing = await prisma.user.findUnique({ where: { email: user.email } });
      if (existing) {
        await prisma.user.update({ where: { id: existing.id }, data });
        console.log(`↻ Backfilled: ${user.email} (${role})`);
        continue;
      }

      await prisma.user.create({ data });
      console.log(`✓ Migrated: ${user.email} (${role})`);
    } catch (error) {
      console.error(`✗ Failed to migrate user ${user.email}:`, error.message);
    }
  }
}

async function migrateDeedTemplates() {
  if (!fs.existsSync(templatesDir)) {
    console.log("⊘ Deed template records directory not found, skipping");
    return 0;
  }

  console.log("\n📜 Migrating deed templates from", templatesDir);
  const files = fs.readdirSync(templatesDir).filter((f) => f.endsWith(".json"));
  console.log(`✓ Found ${files.length} template files`);

  let count = 0;
  let skipped = 0;
  const errors = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(templatesDir, file), "utf8");
      const item = JSON.parse(raw);

      const existing = await prisma.deedTemplate.findUnique({
        where: { id: item.id },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }

      await prisma.deedTemplate.create({
        data: {
          id: item.id,
          type: item.type,
          title: item.title,
          content: item.content ?? "",
          status: item.status === "inactive" ? "inactive" : "active",
          createdById: item.createdById || "legacy",
          createdByName: item.createdByName || "Unknown",
          createdByRole: item.createdByRole ?? null,
          createdAt: new Date(item.createdAt),
        },
      });

      count++;
      if (count % 1000 === 0) console.log(`  ... imported ${count}`);
    } catch (error) {
      errors.push({ file, error: error.message });
    }
  }

  if (skipped > 0) console.log(`⊘ Skipped ${skipped} already-imported templates`);
  if (errors.length > 0) {
    console.warn(`⚠️  ${errors.length} templates had errors (sample):`);
    errors.slice(0, 5).forEach((e) => console.warn(`   ${e.file}: ${e.error}`));
  }

  return count;
}

async function main() {
  try {
    console.log("🚀 Starting data migration...\n");
    await migrateUsers();
    const templateCount = await migrateDeedTemplates();

    console.log("\n✅ Migration complete!");
    console.log("\n📋 Summary:");
    console.log("   - Users migrated with legacy password hash (rehash on first login)");
    console.log(`   - ${templateCount} deed templates imported (full content preserved)`);
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
