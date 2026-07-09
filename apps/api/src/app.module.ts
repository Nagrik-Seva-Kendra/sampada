import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthController } from "./health/health.controller.js";
import { AuthModule } from "./auth/auth.module.js";
import { DeedsModule } from "./deeds/deeds.module.js";
import { PartnersModule } from "./partners/partners.module.js";
import { EmployeesModule } from "./employees/employees.module.js";
import { OtpModule } from "./otp/otp.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    DeedsModule,
    PartnersModule,
    EmployeesModule,
    OtpModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
