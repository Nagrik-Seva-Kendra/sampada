import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import type { PropertyCategory } from "@prisma/client";
import type { Request, Response } from "express";
import { PropertyCreateInput, PropertyUpdateInput } from "@sampada/shared";
import { JwtAdminGuard } from "../auth/jwt-admin.guard.js";
import { JwtStaffGuard } from "../auth/jwt-staff.guard.js";
import { PropertiesService, type UploadedImage } from "./properties.service.js";

const MAX_IMAGE_SIZE = 15 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 20;

type AuthedRequest = Request & { user?: { id: string; name: string } };

function parseCategory(raw: unknown): PropertyCategory | undefined {
  return raw === "PLOT" || raw === "VILLA" || raw === "FLAT" || raw === "AGRICULTURAL_LAND"
    ? (raw as PropertyCategory)
    : undefined;
}

function parseListQuery(q: {
  category?: string;
  city?: string;
  minPrice?: string;
  maxPrice?: string;
  cursor?: string;
  limit?: string;
}) {
  const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 100);
  return {
    category: parseCategory(q.category),
    city: q.city?.trim() || undefined,
    minPrice: q.minPrice ? Number(q.minPrice) : undefined,
    maxPrice: q.maxPrice ? Number(q.maxPrice) : undefined,
    cursor: q.cursor || undefined,
    limit,
  };
}

/**
 * Property listings for the public sales site (plots/villas/flats/
 * agricultural land). List/detail/images are public for PUBLISHED rows;
 * everything else (including seeing DRAFT/ARCHIVED rows) requires staff
 * login. Hard delete is admin-only — this is the business's own listing
 * data, not tenant/customer data, so the platform's "never hard-delete
 * tenant data" rule doesn't apply here.
 */
@Controller("properties")
export class PropertiesController {
  constructor(private readonly service: PropertiesService) {}

  @Get()
  list(
    @Query("category") category?: string,
    @Query("city") city?: string,
    @Query("minPrice") minPrice?: string,
    @Query("maxPrice") maxPrice?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.listPublished(parseListQuery({ category, city, minPrice, maxPrice, cursor, limit }));
  }

  @Get("admin")
  @UseGuards(JwtStaffGuard)
  listAll(
    @Query("category") category?: string,
    @Query("city") city?: string,
    @Query("minPrice") minPrice?: string,
    @Query("maxPrice") maxPrice?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.service.listAll(parseListQuery({ category, city, minPrice, maxPrice, cursor, limit }));
  }

  @Get("admin/:id")
  @UseGuards(JwtStaffGuard)
  getForStaff(@Param("id") id: string) {
    return this.service.getForStaff(id);
  }

  @Get(":id/images/:imageId")
  async image(
    @Param("id") id: string,
    @Param("imageId") imageId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const f = await this.service.getImage(id, imageId);
    res.set({ "Content-Type": f.mimeType, "Cache-Control": "public, max-age=31536000, immutable" });
    return new StreamableFile(f.data);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.service.getPublished(id);
  }

  @Post()
  @UseGuards(JwtStaffGuard)
  create(@Req() req: AuthedRequest, @Body() body: unknown) {
    const input = PropertyCreateInput.parse(body);
    return this.service.create({ ...input, createdById: req.user?.id, createdByName: req.user?.name });
  }

  @Patch(":id")
  @UseGuards(JwtStaffGuard)
  update(@Param("id") id: string, @Body() body: unknown) {
    const input = PropertyUpdateInput.parse(body);
    return this.service.update(id, input);
  }

  @Post(":id/images")
  @UseGuards(JwtStaffGuard)
  @UseInterceptors(FilesInterceptor("images", MAX_FILES_PER_REQUEST, { limits: { fileSize: MAX_IMAGE_SIZE } }))
  async addImages(@Param("id") id: string, @UploadedFiles() files?: UploadedImage[]) {
    if (!files?.length) throw new BadRequestException("At least one image is required.");
    await this.service.addImages(id, files);
    return this.service.getForStaff(id);
  }

  @Delete(":id/images/:imageId")
  @UseGuards(JwtStaffGuard)
  async removeImage(@Param("id") id: string, @Param("imageId") imageId: string) {
    await this.service.removeImage(id, imageId);
    return { removed: true };
  }

  @Delete(":id")
  @UseGuards(JwtAdminGuard)
  async remove(@Param("id") id: string) {
    await this.service.remove(id);
    return { removed: true };
  }
}
