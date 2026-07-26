import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AuthResponse, OrgSignupInput } from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { OtpService } from "../otp/otp.service.js";
import { UsersService, hashPassword, toStoredUser } from "../users/users.service.js";
import { AuthService } from "../auth/auth.service.js";
import { generateUniqueJoinCode, generateUniqueSlug } from "./organization-codes.js";

const MAX_SIGNUP_ATTEMPTS = 3;

/**
 * Self-serve org signup / onboarding: creates a new Organization + its
 * founding Owner User + OWNER Membership in one transaction, then logs them
 * in immediately (unlike employee self-signup, which stays PENDING for admin
 * approval). Starts TRIALING with no templates cloned — starter-template
 * cloning and real trial-expiry tracking don't exist yet (Phase 3/billing's
 * job). Backs both POST /organizations/signup and POST /organizations/onboard
 * — every new account creates a real, named organization directly.
 */
@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
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
            data: { name: input.orgName, slug, joinCode, status: "TRIALING" },
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
          return created;
        });
        return this.auth.issueSession(toStoredUser(user));
      } catch (err) {
        const isUniqueCollision = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
        if (!isUniqueCollision || attempt === MAX_SIGNUP_ATTEMPTS) throw err;
      }
    }
    /* istanbul ignore next -- loop always returns or throws */
    throw new Error("unreachable");
  }
}
