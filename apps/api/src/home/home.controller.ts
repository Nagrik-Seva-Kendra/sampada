import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtStaffGuard } from "../auth/jwt-staff.guard.js";
import { HomeService } from "./home.service.js";

@Controller()
@UseGuards(JwtStaffGuard)
export class HomeController {
  constructor(private readonly service: HomeService) {}

  @Get("home/summary")
  summary() {
    return this.service.summary();
  }

  @Get("search")
  search(@Query("q") q: string) {
    return this.service.search(q);
  }
}
