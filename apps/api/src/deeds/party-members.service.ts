import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { tenantCreateData } from "../prisma/tenant-scope.extension.js";

/** How the deeds introduce the people signing for an organisation. */
export const DESIGNATIONS = ["पार्टनर", "डायरेक्टर", "प्रोप्राइटर", "प्रबंधक", "अधिकृत"] as const;
export type Designation = (typeof DESIGNATIONS)[number];

export function parseDesignation(raw: unknown): Designation {
  if (raw === undefined || raw === null || raw === "") return "पार्टनर";
  if ((DESIGNATIONS as readonly unknown[]).includes(raw)) return raw as Designation;
  throw new BadRequestException(`designation must be one of: ${DESIGNATIONS.join(", ")}.`);
}

export interface FirmMember {
  personId: string;
  name: string;
  designation: string;
  position: number;
  aadhaarNumber: string | null;
  panNumber: string | null;
  address: string | null;
}

/** "123456789012" -> "1234 5678 9012", the way deeds write it. */
function groupAadhaar(a: string): string {
  const d = a.replace(/[^0-9]/g, "");
  return d.length === 12 ? `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8)}` : a;
}

/**
 * A firm's signatories as facts for filling a deed, in the deed's order: each
 * person as an "अधिकृत व्यक्ति" / "पद" pair followed by their own numbers --
 * the same shape the document reader gives for a partnership deed, so the
 * deed is written the same way whichever route the partners came by.
 */
export function memberFacts(members: FirmMember[]): { label: string; value: string; group: "party" }[] {
  return [...members]
    .sort((a, b) => a.position - b.position)
    .flatMap((m) => [
      { label: "अधिकृत व्यक्ति", value: m.name, group: "party" as const },
      { label: "पद", value: m.designation, group: "party" as const },
      ...(m.aadhaarNumber ? [{ label: "आधार नं.", value: groupAadhaar(m.aadhaarNumber), group: "party" as const }] : []),
      ...(m.panNumber ? [{ label: "पैन नं.", value: m.panNumber, group: "party" as const }] : []),
      ...(m.address ? [{ label: "पता", value: m.address, group: "party" as const }] : []),
    ]);
}

/**
 * Who acts for a saved organisation. Everything goes through the tenant-scoped
 * client, so a firm or person from another workspace is simply not found.
 */
@Injectable()
export class PartyMembersService {
  constructor(private readonly prisma: PrismaService) {}

  private async firm(firmId: string) {
    const firm = await this.prisma.party.findUnique({ where: { id: firmId }, select: { id: true, partyType: true } });
    if (!firm) throw new NotFoundException("Organisation not found.");
    if (firm.partyType !== "company") throw new BadRequestException("Only an organisation has partners.");
    return firm;
  }

  async list(firmId: string): Promise<FirmMember[]> {
    await this.firm(firmId);
    return (await this.membersOf([firmId])).get(firmId) ?? [];
  }

  /** Signatories for several firms at once, keyed by firm id. */
  async membersOf(firmIds: string[]): Promise<Map<string, FirmMember[]>> {
    const out = new Map<string, FirmMember[]>();
    if (firmIds.length === 0) return out;
    const rows = await this.prisma.partyMember.findMany({
      where: { firmId: { in: firmIds } },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: {
        firmId: true,
        designation: true,
        position: true,
        person: { select: { id: true, name: true, aadhaarNumber: true, panNumber: true, address: true } },
      },
    });
    for (const r of rows) {
      const list = out.get(r.firmId) ?? [];
      list.push({
        personId: r.person.id,
        name: r.person.name,
        designation: r.designation,
        position: r.position,
        aadhaarNumber: r.person.aadhaarNumber,
        panNumber: r.person.panNumber,
        address: r.person.address,
      });
      out.set(r.firmId, list);
    }
    return out;
  }

  /** Add a person to a firm, at the end; adding them again just updates the designation. */
  async add(firmId: string, personId: string, designation: Designation): Promise<FirmMember[]> {
    await this.firm(firmId);
    const person = await this.prisma.party.findUnique({ where: { id: personId }, select: { id: true, partyType: true } });
    if (!person) throw new NotFoundException("Person not found.");
    if (person.partyType === "company") throw new BadRequestException("An organisation cannot be a partner here.");

    const existing = await this.prisma.partyMember.findFirst({ where: { firmId, personId }, select: { id: true } });
    if (existing) {
      await this.prisma.partyMember.update({ where: { id: existing.id }, data: { designation } });
    } else {
      const last = await this.prisma.partyMember.findFirst({
        where: { firmId },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      await this.prisma.partyMember.create({
        data: tenantCreateData<Prisma.PartyMemberUncheckedCreateInput>({
          firmId,
          personId,
          designation,
          position: (last?.position ?? -1) + 1,
        }),
      });
    }
    return this.list(firmId);
  }

  async remove(firmId: string, personId: string): Promise<FirmMember[]> {
    await this.firm(firmId);
    await this.prisma.partyMember.deleteMany({ where: { firmId, personId } });
    return this.list(firmId);
  }
}
