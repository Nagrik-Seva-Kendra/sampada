import { Controller, Get } from "@nestjs/common";
import { buildInfo } from "../common/build-info.js";

@Controller("health")
export class HealthController {
  @Get()
  check() {
    return { status: "ok", service: "sampada-api", time: new Date().toISOString(), ...buildInfo() };
  }
}
