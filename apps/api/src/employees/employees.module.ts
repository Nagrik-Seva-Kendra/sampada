import { Module } from "@nestjs/common";
import { EmployeesController } from "./employees.controller.js";
import { UsersModule } from "../users/users.module.js";
import { OtpModule } from "../otp/otp.module.js";

@Module({
  imports: [UsersModule, OtpModule],
  controllers: [EmployeesController],
})
export class EmployeesModule {}
