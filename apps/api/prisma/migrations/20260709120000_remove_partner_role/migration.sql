-- Postgres cannot drop a value from an existing enum type directly, so
-- recreate it: rename the old type, create the new one without PARTNER,
-- cast the User.role column across, then drop the old type.
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('PUBLIC', 'EMPLOYEE', 'ADMIN');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'PUBLIC';
DROP TYPE "Role_old";
