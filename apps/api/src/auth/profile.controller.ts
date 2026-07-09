import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtService } from "@nestjs/jwt";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Request } from "express";
import { UpdateProfileInput, type AuthResponse } from "@sampada/shared";
import { JwtStaffGuard, type StaffUser } from "./jwt-staff.guard.js";
import { UsersService } from "../users/users.service.js";

type StaffRequest = Request & { user: StaffUser };

interface UploadedImage {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}

export const PHOTO_DIR =
  process.env.UPLOAD_DIR
    ? path.join(process.env.UPLOAD_DIR, "..", "profile-photos")
    : path.resolve(process.cwd(), "uploads", "profile-photos");

/**
 * Employee self-service profile (own name/email/username/password/photo).
 * ADMIN has no self-edit UI, so these endpoints are employee-only.
 */
@Controller("profile")
@UseGuards(JwtStaffGuard)
export class ProfileController {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  @Patch()
  async update(@Body() body: unknown, @Req() req: StaffRequest): Promise<AuthResponse> {
    if (req.user.role !== "EMPLOYEE") {
      throw new ForbiddenException("Only employee accounts have an editable profile.");
    }
    const updated = await this.users.updateProfile(req.user.id, UpdateProfileInput.parse(body));
    return this.reissue(updated);
  }

  @Post("photo")
  @UseInterceptors(FileInterceptor("file"))
  async uploadPhoto(
    @Req() req: StaffRequest,
    @UploadedFile() file?: UploadedImage,
  ): Promise<AuthResponse> {
    if (req.user.role !== "EMPLOYEE") {
      throw new ForbiddenException("Only employee accounts have an editable profile.");
    }
    if (!file) throw new BadRequestException("Image file is required (field 'file').");
    const isImage = file.mimetype?.startsWith("image/");
    if (!isImage) throw new BadRequestException("Only image files are allowed.");

    await fs.mkdir(PHOTO_DIR, { recursive: true });
    await this.clearExistingPhoto(req.user.id);

    const ext = extFor(file.mimetype, file.originalname);
    const fileName = `${req.user.id}${ext}`;
    await fs.writeFile(path.join(PHOTO_DIR, fileName), file.buffer);

    const updated = await this.users.setPhoto(req.user.id, fileName);
    return this.reissue(updated);
  }

  private async clearExistingPhoto(id: string): Promise<void> {
    let names: string[];
    try {
      names = await fs.readdir(PHOTO_DIR);
    } catch {
      return;
    }
    await Promise.all(
      names
        .filter((n) => n.startsWith(`${id}.`))
        .map((n) => fs.unlink(path.join(PHOTO_DIR, n)).catch(() => {})),
    );
  }

  /** Reissue the token so the JWT's embedded name/email stay in sync. */
  private async reissue(updated: Awaited<ReturnType<UsersService["updateProfile"]>>) {
    const user = {
      id: updated.id,
      email: updated.email,
      username: updated.username,
      fname: updated.fname,
      lname: updated.lname,
      role: updated.role,
    };
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: `${user.fname} ${user.lname}`.trim(),
    });
    return { accessToken, user };
  }
}

function extFor(mimetype?: string, originalname?: string): string {
  const fromName = originalname ? path.extname(originalname).toLowerCase() : "";
  if (fromName) return fromName;
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  return map[mimetype ?? ""] ?? ".jpg";
}

export function mimeFor(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  return map[ext] ?? "application/octet-stream";
}
