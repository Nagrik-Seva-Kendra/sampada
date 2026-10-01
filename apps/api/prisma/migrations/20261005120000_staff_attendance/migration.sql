-- Staff attendance, leave and salary (additive).
CREATE TABLE "AttendanceConfig" ("organizationId" TEXT NOT NULL, "config" JSONB NOT NULL, "updatedById" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AttendanceConfig_pkey" PRIMARY KEY ("organizationId"));

CREATE TABLE "Holiday" ("id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "date" TEXT NOT NULL, "name" TEXT NOT NULL, CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "Holiday_organizationId_date_key" ON "Holiday"("organizationId", "date");

CREATE TABLE "AttendanceRecord" ("id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "userId" TEXT NOT NULL, "day" TEXT NOT NULL, "kind" TEXT NOT NULL, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lat" DOUBLE PRECISION NOT NULL, "lng" DOUBLE PRECISION NOT NULL, "accuracyM" DOUBLE PRECISION, "distanceM" INTEGER, "inside" BOOLEAN NOT NULL, "reason" TEXT, "source" TEXT NOT NULL DEFAULT 'web', CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id"));
CREATE INDEX "AttendanceRecord_organizationId_day_idx" ON "AttendanceRecord"("organizationId", "day");
CREATE INDEX "AttendanceRecord_userId_day_idx" ON "AttendanceRecord"("userId", "day");

CREATE TABLE "LeaveRequest" ("id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "number" INTEGER NOT NULL, "userId" TEXT NOT NULL, "fromDate" TEXT NOT NULL, "toDate" TEXT NOT NULL, "halfDay" BOOLEAN NOT NULL DEFAULT false, "type" TEXT NOT NULL, "reason" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "decidedById" TEXT, "decidedAt" TIMESTAMP(3), "source" TEXT NOT NULL DEFAULT 'web', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "LeaveRequest_organizationId_number_key" ON "LeaveRequest"("organizationId", "number");
CREATE INDEX "LeaveRequest_organizationId_status_idx" ON "LeaveRequest"("organizationId", "status");
CREATE INDEX "LeaveRequest_userId_fromDate_idx" ON "LeaveRequest"("userId", "fromDate");

CREATE TABLE "SalaryRate" ("id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "userId" TEXT NOT NULL, "monthly" INTEGER NOT NULL, "effectiveFrom" TEXT NOT NULL, "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SalaryRate_pkey" PRIMARY KEY ("id"));
CREATE INDEX "SalaryRate_organizationId_userId_effectiveFrom_idx" ON "SalaryRate"("organizationId", "userId", "effectiveFrom");

CREATE TABLE "SalarySheet" ("id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "month" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'DRAFT', "lines" JSONB NOT NULL, "adjustments" JSONB NOT NULL DEFAULT '{}', "sentTo" JSONB NOT NULL DEFAULT '[]', "finalizedAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SalarySheet_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "SalarySheet_organizationId_month_key" ON "SalarySheet"("organizationId", "month");
