import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PropertyCategory, PropertyStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { newPropertyImageKey, r2Configured, r2Get, r2Put } from "./r2-properties.js";

export interface UploadedImage {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}

const MAX_IMAGE_SIZE = 15 * 1024 * 1024;
const MAX_IMAGES_PER_PROPERTY = 20;

const SUMMARY_SELECT = {
  id: true,
  title: true,
  category: true,
  city: true,
  state: true,
  areaValue: true,
  areaUnit: true,
  priceValue: true,
  priceLabel: true,
  status: true,
  createdAt: true,
  images: { select: { id: true }, orderBy: { sortOrder: "asc" as const }, take: 1 },
} satisfies Prisma.PropertySelect;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  description: true,
  addressLine: true,
  district: true,
  pincode: true,
  contactName: true,
  contactPhone: true,
  images: { select: { id: true, sortOrder: true }, orderBy: { sortOrder: "asc" as const } },
} satisfies Prisma.PropertySelect;

type SummaryRow = Prisma.PropertyGetPayload<{ select: typeof SUMMARY_SELECT }>;
type DetailRow = Prisma.PropertyGetPayload<{ select: typeof DETAIL_SELECT }>;

function toSummary(r: SummaryRow) {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    city: r.city,
    state: r.state,
    areaValue: r.areaValue,
    areaUnit: r.areaUnit,
    priceValue: r.priceValue,
    priceLabel: r.priceLabel,
    status: r.status,
    coverImageId: r.images[0]?.id ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

function toDetail(r: DetailRow) {
  return {
    ...toSummary(r),
    description: r.description,
    addressLine: r.addressLine,
    district: r.district,
    pincode: r.pincode,
    contactName: r.contactName,
    contactPhone: r.contactPhone,
    images: r.images.map((i) => ({ id: i.id, sortOrder: i.sortOrder })),
  };
}

export interface PropertyFilters {
  category?: PropertyCategory;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  cursor?: string;
  limit: number;
}

export interface CreatePropertyInput {
  title: string;
  category: PropertyCategory;
  description?: string;
  addressLine: string;
  city: string;
  district?: string;
  state?: string;
  pincode?: string;
  areaValue?: number;
  areaUnit?: string;
  priceValue?: number;
  priceLabel?: string;
  contactName?: string;
  contactPhone?: string;
  createdById?: string;
  createdByName?: string;
}

export type UpdatePropertyInput = Partial<CreatePropertyInput> & { status?: PropertyStatus };

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public catalog — published listings only. */
  async listPublished(filters: PropertyFilters) {
    return this.list({ ...filters, status: "PUBLISHED" });
  }

  /** Staff management table — every status. */
  async listAll(filters: PropertyFilters) {
    return this.list(filters);
  }

  private async list(filters: PropertyFilters & { status?: PropertyStatus }) {
    const where: Prisma.PropertyWhereInput = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.city ? { city: { equals: filters.city, mode: "insensitive" } } : {}),
      ...(filters.minPrice != null || filters.maxPrice != null
        ? { priceValue: { gte: filters.minPrice ?? undefined, lte: filters.maxPrice ?? undefined } }
        : {}),
    };
    const rows = await this.prisma.property.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: SUMMARY_SELECT,
      take: filters.limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > filters.limit;
    const page = hasMore ? rows.slice(0, -1) : rows;
    const lastRow = page[page.length - 1];
    return { data: page.map(toSummary), nextCursor: hasMore && lastRow ? lastRow.id : null };
  }

  async getPublished(id: string) {
    const row = await this.prisma.property.findFirst({ where: { id, status: "PUBLISHED" }, select: DETAIL_SELECT });
    if (!row) throw new NotFoundException("Property not found.");
    return toDetail(row);
  }

  async getForStaff(id: string) {
    const row = await this.prisma.property.findUnique({ where: { id }, select: DETAIL_SELECT });
    if (!row) throw new NotFoundException("Property not found.");
    return toDetail(row);
  }

  async create(input: CreatePropertyInput) {
    const row = await this.prisma.property.create({
      data: { ...input, state: input.state || undefined },
      select: DETAIL_SELECT,
    });
    return toDetail(row);
  }

  async update(id: string, input: UpdatePropertyInput) {
    const exists = await this.prisma.property.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException("Property not found.");
    const row = await this.prisma.property.update({ where: { id }, data: input, select: DETAIL_SELECT });
    return toDetail(row);
  }

  async remove(id: string): Promise<void> {
    const exists = await this.prisma.property.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException("Property not found.");
    await this.prisma.property.delete({ where: { id } }); // cascades PropertyImage rows
  }

  async addImages(propertyId: string, files: UploadedImage[]): Promise<void> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, _count: { select: { images: true } } },
    });
    if (!property) throw new NotFoundException("Property not found.");
    if (property._count.images + files.length > MAX_IMAGES_PER_PROPERTY) {
      throw new BadRequestException(`A property may have at most ${MAX_IMAGES_PER_PROPERTY} images.`);
    }
    const last = await this.prisma.propertyImage.findFirst({
      where: { propertyId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    let nextOrder = (last?.sortOrder ?? -1) + 1;

    for (const file of files) {
      if (file.buffer.length > MAX_IMAGE_SIZE) {
        throw new BadRequestException(`Each image must be under ${MAX_IMAGE_SIZE / (1024 * 1024)}MB.`);
      }
      const mimeType = file.mimetype ?? "application/octet-stream";
      if (!mimeType.startsWith("image/")) throw new BadRequestException("Only image files are allowed.");

      const data: Record<string, unknown> = {
        propertyId,
        fileName: file.originalname ?? "photo.jpg",
        mimeType,
        size: file.buffer.length,
        sortOrder: nextOrder++,
      };
      if (r2Configured()) {
        const key = newPropertyImageKey();
        await r2Put(key, file.buffer, mimeType);
        data.r2Key = key;
      } else {
        data.data = file.buffer;
      }
      await this.prisma.propertyImage.create({ data: data as Prisma.PropertyImageUncheckedCreateInput });
    }
  }

  async removeImage(propertyId: string, imageId: string): Promise<void> {
    const found = await this.prisma.propertyImage.findFirst({ where: { id: imageId, propertyId }, select: { id: true } });
    if (!found) throw new NotFoundException("Image not found.");
    await this.prisma.propertyImage.delete({ where: { id: imageId } });
  }

  async getImage(propertyId: string, imageId: string): Promise<{ fileName: string; mimeType: string; data: Buffer }> {
    const row = await this.prisma.propertyImage.findFirst({
      where: { id: imageId, propertyId },
      select: { fileName: true, mimeType: true, data: true, r2Key: true },
    });
    if (!row) throw new NotFoundException("Image not found.");
    if (row.r2Key) {
      const data = await r2Get(row.r2Key);
      return { fileName: row.fileName, mimeType: row.mimeType, data };
    }
    if (!row.data) throw new NotFoundException("Image data missing.");
    return { fileName: row.fileName, mimeType: row.mimeType, data: Buffer.from(row.data) };
  }
}
