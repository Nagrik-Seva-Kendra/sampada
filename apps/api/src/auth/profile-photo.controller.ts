import { Controller, Get, NotFoundException, Param, Res, StreamableFile } from "@nestjs/common";
import { createReadStream } from "node:fs";
import * as path from "node:path";
import type { Response } from "express";
import { UsersService } from "../users/users.service.js";
import { PHOTO_DIR, mimeFor } from "./profile.controller.js";

/** Public: serve a partner's profile photo. Kept unguarded so <img> tags work without auth. */
@Controller("profile/photo")
export class ProfilePhotoController {
  constructor(private readonly users: UsersService) {}

  @Get(":id")
  async photo(
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const user = await this.users.findById(id);
    if (!user?.photoFileName) throw new NotFoundException("No photo set.");
    res.set({ "Content-Type": mimeFor(user.photoFileName) });
    return new StreamableFile(createReadStream(path.join(PHOTO_DIR, user.photoFileName)));
  }
}
