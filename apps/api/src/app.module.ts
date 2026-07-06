import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health/health.controller.js";
import { AuthModule } from "./auth/auth.module.js";
import { GuidelineDocsModule } from "./guideline-docs/guideline-docs.module.js";
import { ContactModule } from "./contact/contact.module.js";
import { DeedsModule } from "./deeds/deeds.module.js";
import { PartnersModule } from "./partners/partners.module.js";
import { EmployeesModule } from "./employees/employees.module.js";
import { CompanyDocsModule } from "./company-docs/company-docs.module.js";
import { OtpModule } from "./otp/otp.module.js";

// NOTE: PrismaModule is intentionally NOT imported yet — the current features
// (guideline PDF store, contact inbox, admin auth) are DB-free, so the API runs
// without Postgres. Wire PrismaModule back in when the DB-backed features land.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    GuidelineDocsModule,
    ContactModule,
    DeedsModule,
    PartnersModule,
    EmployeesModule,
    CompanyDocsModule,
    OtpModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
