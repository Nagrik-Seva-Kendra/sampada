import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { SampleDeedsService } from "./sample-deeds.service.js";

/**
 * The party-facing "open this deed" link: no auth, keyed by the deed's own
 * id (a random UUID, unguessable, the same trust model as a Google Docs
 * share link). Deliberately a separate controller from SampleDeedsController
 * (which sits behind JwtStaffGuard for every route) rather than a
 * special-cased exception inside it, so this is the one controller in the
 * app where "no auth" is the default and obviously so, not buried among
 * guarded routes. Always resolves to whatever staff most recently saved --
 * there is no separate "published" copy, so a correction is visible the
 * moment it's saved.
 */
@Controller("public/deeds")
  export class PublicDeedsController {
    constructor(private readonly service: SampleDeedsService) {}

  @Get(":id")
    async getOne(@Param("id") id: string) {
          const deed = await this.service.getPublic(id);
          if (!deed) throw new NotFoundException("Deed not found.");
          return deed;
    }
}
