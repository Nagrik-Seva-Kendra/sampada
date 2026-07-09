/*
  Warnings:

  - You are about to drop the `AuditLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Buyer` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Deed` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Partner` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Seller` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Buyer" DROP CONSTRAINT "Buyer_partnerId_fkey";

-- DropForeignKey
ALTER TABLE "Deed" DROP CONSTRAINT "Deed_buyerId_fkey";

-- DropForeignKey
ALTER TABLE "Deed" DROP CONSTRAINT "Deed_partnerId_fkey";

-- DropForeignKey
ALTER TABLE "Deed" DROP CONSTRAINT "Deed_sellerId_fkey";

-- DropForeignKey
ALTER TABLE "Partner" DROP CONSTRAINT "Partner_userId_fkey";

-- DropForeignKey
ALTER TABLE "Seller" DROP CONSTRAINT "Seller_partnerId_fkey";

-- DropTable
DROP TABLE "AuditLog";

-- DropTable
DROP TABLE "Buyer";

-- DropTable
DROP TABLE "Deed";

-- DropTable
DROP TABLE "Partner";

-- DropTable
DROP TABLE "Seller";

-- DropEnum
DROP TYPE "DeedStatus";

-- DropEnum
DROP TYPE "PartyCategory";
