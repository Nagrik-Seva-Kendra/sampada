import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("stats")
export class StatsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public: total deeds drafted so far (DeedTemplate rows). Powers the
   * homepage "documents completed" figure so it grows automatically as staff
   * create deeds — no manual edit needed.
   */
  @Get("deeds-count")
  async deedsCount(): Promise<{ count: number }> {
    const count = await this.prisma.deedTemplate.count();
    return { count };
  }
}
