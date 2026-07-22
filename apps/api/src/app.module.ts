import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ClsModule } from "nestjs-cls";
import { HealthController } from "./health/health.controller.js";
import { StatsController } from "./stats/stats.controller.js";
import { AuthModule } from "./auth/auth.module.js";
import { DeedsModule } from "./deeds/deeds.module.js";
import { EmployeesModule } from "./employees/employees.module.js";
import { OtpModule } from "./otp/otp.module.js";
import { GuidelineModule } from "./guideline/guideline.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Request-scoped store holding the tenant context (populated by the JWT
    // guards / public interceptor). mount:true wraps every request.
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    PrismaModule,
    AuthModule,
    DeedsModule,
    EmployeesModule,
    OtpModule,
    GuidelineModule,
  ],
  controllers: [HealthController, StatsController],
})
export class AppModule {}
