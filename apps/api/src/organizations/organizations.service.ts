import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ClsService } from "nestjs-cls";
import type { AuthResponse, OrgSignupInput } from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { OtpService } from "../otp/otp.service.js";
import { UsersService, hashPassword, toStoredUser } from "../users/users.service.js";
import { AuthService } from "../auth/auth.service.js";
import { requireTenantContext } from "../tenant/current-tenant.js";
import { generateUniqueJoinCode, generateUniqueSlug } from "./organization-codes.js";

const MAX_SIGNUP_ATTEMPTS = 3;

/**
 * Self-serve org signup / onboarding: creates a new Organization + its
 * founding Owner User + OWNER Membership in one transaction, then logs them
 * in immediately (unlike employee self-signup, which stays PENDING for admin
 * approval). Starts TRIALING with the curated starter deeds copied in (see
 * seedStarterDeeds); real trial-expiry tracking still doesn't exist
 * (Phase 3/billing's job). Backs both POST /organizations/signup and POST
 * /organizations/onboard — every new account creates a real, named
 * organization directly.
 */
@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly cls: ClsService,
  ) {}

  async signup(input: OrgSignupInput): Promise<AuthResponse> {
    this.otp.assertVerified(input.email, input.emailOtp);

    const email = input.email.trim().toLowerCase();
    const username = input.username ? input.username.trim().toLowerCase() : null;
    await this.users.assertStaffLoginAvailable(email, username);

    const passwordHash = await hashPassword(input.password);

    for (let attempt = 1; attempt <= MAX_SIGNUP_ATTEMPTS; attempt++) {
      const slug = await generateUniqueSlug(this.prisma.$unscoped, input.orgName);
      const joinCode = await generateUniqueJoinCode(this.prisma.$unscoped);
      try {
        const user = await this.prisma.$transaction(async (tx) => {
          const org = await tx.organization.create({
            data: {
              name: input.orgName,
              slug,
              joinCode,
              status: "TRIALING",
              onboardingRole: input.onboardingRole ?? null,
              onboardingGoal: input.onboardingGoal ?? null,
              district: input.district ?? null,
            },
          });
          const created = await tx.user.create({
            data: {
              email,
              username,
              passwordHash,
              role: "ADMIN",
              fname: input.fname,
              lname: input.lname,
              status: "ACTIVE",
              mobile: input.phone ?? null,
              employeeCode: null,
              lastActiveOrganizationId: org.id,
            },
          });
          await tx.membership.create({
            data: {
              userId: created.id,
              organizationId: org.id,
              role: "OWNER",
              status: "ACTIVE",
              employeeCode: null,
            },
          });
          return { user: created, organizationId: org.id };
        });

        await this.seedStarterDeeds(user.organizationId, user.user);
        return this.auth.issueSession(toStoredUser(user.user));
      } catch (err) {
        const isUniqueCollision = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
        if (!isUniqueCollision || attempt === MAX_SIGNUP_ATTEMPTS) throw err;
      }
    }
    /* istanbul ignore next -- loop always returns or throws */
    throw new Error("unreachable");
  }

  /**
   * Copies the curated starter deeds into a brand-new workspace, so the first
   * thing a partner sees is work they can edit rather than "No deeds yet".
   *
   * Unscoped by necessity: the starters live in the platform's own
   * organization, and this runs on a public route with no tenant in context.
   * Reads are narrowed to `isStarter` rows and only the body is carried
   * across — nothing about the source organization goes with the copy, and
   * the copy is not itself a starter (it belongs to the new partner, who is
   * free to rewrite it).
   *
   * Never allowed to fail signup: an account that exists without its sample
   * deeds is a much smaller problem than an account that could not be
   * created because a nice-to-have copy failed.
   */
  private async seedStarterDeeds(
    organizationId: string,
    owner: { id: string; fname: string; lname: string },
  ): Promise<void> {
    try {
      const starters = await this.prisma.$unscoped.deedTemplate.findMany({
        where: { isStarter: true, status: "active" },
        select: { type: true, title: true, content: true },
        orderBy: { title: "asc" },
      });
      if (starters.length === 0) return;

      // DeedTemplate.createdAt has no database default (deeds carry the date
      // they were drafted, which the legacy import needed to set by hand), so
      // it has to be stamped here.
      const now = new Date();
      await this.prisma.$unscoped.deedTemplate.createMany({
        data: starters.map((starter) => ({
          // DeedTemplate ids are supplied, not defaulted — the deed id is the
          // party-facing share link, and the legacy import had to carry the
          // old system's ids across.
          id: randomUUID(),
          organizationId,
          type: starter.type,
          title: starter.title,
          content: starter.content,
          status: "active",
          createdById: owner.id,
          createdByName: `${owner.fname} ${owner.lname}`.trim(),
          createdByRole: "OWNER",
          createdAt: now,
          updatedAt: now,
          isStarter: false,
        })),
      });
    } catch (err) {
      this.logger.error(
        `Starter deeds could not be copied into organization ${organizationId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Owner-only self-service soft delete: marks the org CANCELLED (excluded
   * from resolveActiveMembership going forward, so it stops resolving as
   * anyone's active workspace — recoverable by flipping status back) and
   * revokes every member's session immediately. Nothing is actually erased —
   * deeds, members, everything stays in place for possible recovery.
   */
  async deleteOwn(): Promise<void> {
    const { organizationId } = requireTenantContext(this.cls);
    await this.prisma.$transaction(async (tx) => {
      const members = await tx.membership.findMany({
        where: { organizationId },
        select: { userId: true },
      });
      await tx.organization.update({ where: { id: organizationId }, data: { status: "CANCELLED" } });
      await tx.user.updateMany({
        where: { id: { in: members.map((m) => m.userId) } },
        data: { tokenVersion: { increment: 1 } },
      });
    });
  }
}
