import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { hash as argon2Hash, verify as argon2Verify, Algorithm } from "@node-rs/argon2";
import { ClsService } from "nestjs-cls";
import type { User } from "@prisma/client";
import type {
  CreateEmployeeInput,
  CreateUserInput,
  EmployeeSignupInput,
  Role,
  UpdateProfileInput,
  UpdateUserInput,
} from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { requireTenantContext } from "../tenant/current-tenant.js";
import type { TenantContext } from "../tenant/tenant-context.js";
import { LastOwnerViolationError } from "../organizations/organization-invariants.core.js";
import { assertOrgKeepsActiveOwner } from "../organizations/organization-invariants.js";
import { nextEmployeeCodeTx } from "../organizations/employee-code.js";

export interface StoredUser {
  id: string;
  email: string;
  /** Login handle the employee sets themselves; null until they do. */
  username: string | null;
  /** argon2id hash (legacy rows may still be scrypt "<salt-hex>:<hash-hex>" until first login). */
  passwordHash: string;
  /** Session-revocation counter; tokens minted at an older value are rejected. */
  tokenVersion: number;
  role: Role;
  fname: string;
  lname: string;
  createdAt: string;
  /** Stored profile-photo filename (under uploads/profile-photos/); null if none. */
  photoFileName: string | null;
  /** PENDING: awaiting admin approval. INACTIVE: services discontinued by the admin (can be reactivated). */
  status: "PENDING" | "ACTIVE" | "INACTIVE";
  /** 10-digit mobile number; only collected for employees so far. */
  phone: string | null;
  /** Sequential admin-facing id, e.g. "EMP-0007"; only assigned to EMPLOYEE accounts. */
  employeeCode: string | null;
  /** Platform staff (me/my team) — gates back-office capabilities like the shared guideline library. */
  isPlatformAdmin: boolean;
}

export function toStoredUser(row: User): StoredUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    passwordHash: row.passwordHash,
    tokenVersion: row.tokenVersion,
    role: row.role as Role,
    fname: row.fname,
    lname: row.lname,
    createdAt: row.createdAt.toISOString(),
    photoFileName: row.photoFileName,
    status: row.status,
    phone: row.mobile,
    employeeCode: row.employeeCode,
    isPlatformAdmin: row.isPlatformAdmin,
  };
}

const STAFF_ROLES: Role[] = ["EMPLOYEE"];
// Login must also find the ADMIN row; management/listing methods stay
// scoped to STAFF_ROLES so admin never shows up in an employee list.
const LOGIN_ROLES: Role[] = ["EMPLOYEE", "ADMIN"];

/**
 * Employee/admin account store, backed by the Prisma User table.
 * Both roles authenticate identically (scrypt password hash).
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  /**
   * The caller's full tenant context. Every call site that uses this is
   * behind JwtAdminGuard, which populates the CLS tenant context before the
   * controller method runs — a missing context here is a genuine bug state,
   * not a normal caller path.
   */
  private requireTenant(): TenantContext {
    return requireTenantContext(this.cls);
  }

  private requireOrgId(): string {
    return this.requireTenant().organizationId;
  }

  /**
   * Verify a login password against the stored hash and, on success, transparently
   * re-hash a legacy scrypt password to argon2id so no user is ever forced to reset.
   */
  async verifyCredentials(user: StoredUser, password: string): Promise<boolean> {
    const ok = await verifyPassword(password, user.passwordHash);
    if (ok && isLegacyHash(user.passwordHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(password) },
      });
    }
    return ok;
  }

  /** The membership the user acts under at login: their most recent ACTIVE one (null if none yet). */
  /**
   * Which org a session should act under. Tries, in order: an explicit
   * preference (e.g. the org the caller just switched/created), then
   * whichever org the user was last active in, then falls back to their
   * most-recently-created active membership. Returning org name/slug/etc
   * inline so callers (issueSession) don't need a second query.
   */
  async resolveActiveMembership(userId: string) {
    const select = {
      id: true,
      organizationId: true,
      role: true,
      organization: { select: { name: true, slug: true, status: true } },
    } as const;
    // CANCELLED marks a soft-deleted org (see OrganizationsService.deleteOwn) —
    // its data stays intact for recovery, but it must stop resolving as anyone's
    // active workspace, same as if the membership itself were gone.
    const liveOrg = { organization: { status: { not: "CANCELLED" as const } } };

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { lastActiveOrganizationId: true },
    });
    if (user?.lastActiveOrganizationId) {
      const lastActive = await this.prisma.membership.findFirst({
        where: { userId, organizationId: user.lastActiveOrganizationId, status: "ACTIVE", ...liveOrg },
        select,
      });
      if (lastActive) return lastActive;
    }

    return this.prisma.membership.findFirst({
      where: { userId, status: "ACTIVE", ...liveOrg },
      orderBy: { createdAt: "desc" },
      select,
    });
  }

  /** Login-time guard: does this account have any non-deleted org left to act under? */
  async hasLiveMembership(userId: string): Promise<boolean> {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, status: "ACTIVE", organization: { status: { not: "CANCELLED" } } },
      select: { id: true },
    });
    return !!membership;
  }

  /** Persist which org a session is acting under, so refresh/next-login lands back there. */
  async setLastActiveOrganization(userId: string, organizationId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { lastActiveOrganizationId: organizationId } });
  }

  /** Set a users password via the reset-link flow and revoke existing sessions. */
  async resetPassword(userId: string, newPassword: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundException("User not found.");
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword), tokenVersion: { increment: 1 } },
    });
  }

  /**
   * Scoped to the caller's org — a user with only a membership elsewhere must
   * never show up here. Matches ACTIVE and INACTIVE memberships (not PENDING,
   * which belongs in the Requests tab) so a deactivated member still shows up
   * — as discontinued — instead of disappearing from the list entirely.
   */
  async list(): Promise<StoredUser[]> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.user.findMany({
      where: {
        role: { in: STAFF_ROLES },
        memberships: { some: { organizationId, status: { in: ["ACTIVE", "INACTIVE"] } } },
      },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toStoredUser);
  }

  /**
   * Admin "User Management" tab: every approved staff account — employees AND
   * admins — so admin-created admin logins show up too. Excludes PENDING
   * self-signups (those live in the Requests tab via listPendingEmployees).
   * Scoped to the caller's org; matches ACTIVE and INACTIVE memberships so a
   * deactivated member still shows up as discontinued, not gone.
   */
  async listStaff(): Promise<StoredUser[]> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.user.findMany({
      where: {
        role: { in: LOGIN_ROLES },
        status: { in: ["ACTIVE", "INACTIVE"] },
        // Membership.status, not User.status above — same enum values, different field.
        memberships: { some: { organizationId, status: { in: ["ACTIVE", "INACTIVE"] } } },
      },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toStoredUser);
  }

  async findByEmail(email: string): Promise<StoredUser | undefined> {
    const row = await this.prisma.user.findFirst({
      where: { email: email.trim().toLowerCase(), role: { in: STAFF_ROLES } },
    });
    return row ? toStoredUser(row) : undefined;
  }

  async findById(id: string): Promise<StoredUser | undefined> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toStoredUser(row) : undefined;
  }

  /**
   * Login by username if set, else email (keeps accounts without a username usable).
   * Also finds platform service/staff accounts (isPlatformAdmin) even though their
   * role isn't a customer-facing EMPLOYEE/ADMIN — they authenticate for the
   * platform/back-office APIs (e.g. the NSK ERP "Sampada Management" service account).
   */
  async findByLogin(login: string): Promise<StoredUser | undefined> {
    const needle = login.trim().toLowerCase();
    const row = await this.prisma.user.findFirst({
      where: {
        AND: [
          { OR: [{ role: { in: LOGIN_ROLES } }, { isPlatformAdmin: true }] },
          { OR: [{ username: needle }, { email: needle }] },
        ],
      },
    });
    return row ? toStoredUser(row) : undefined;
  }

  /** Employee self-edit: own name/email/username/password (current password required to change password). */
  async updateProfile(id: string, input: UpdateProfileInput): Promise<StoredUser> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("User not found.");

    if (input.password && !(await verifyPassword(input.currentPassword ?? "", existing.passwordHash))) {
      throw new ForbiddenException("Current password is incorrect.");
    }

    const email = input.email?.trim().toLowerCase();
    if (email) {
      const clash = await this.prisma.user.findFirst({ where: { email, NOT: { id } } });
      if (clash) throw new ConflictException("A user with this email already exists.");
    }
    const username = input.username?.trim().toLowerCase();
    if (username) {
      const clash = await this.prisma.user.findFirst({
        where: { NOT: { id }, OR: [{ username }, { email: username }] },
      });
      if (clash) throw new ConflictException("That username is already taken.");
    }

    const row = await this.prisma.user.update({
      where: { id },
      data: {
        ...(input.fname !== undefined ? { fname: input.fname } : {}),
        ...(input.lname !== undefined ? { lname: input.lname } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(username !== undefined ? { username } : {}),
        ...(input.password !== undefined
          ? { passwordHash: await hashPassword(input.password), tokenVersion: { increment: 1 } }
          : {}),
      },
    });
    return toStoredUser(row);
  }

  /** Replace the stored profile-photo filename for a user (null clears it). */
  async setPhoto(id: string, photoFileName: string | null): Promise<StoredUser> {
    const row = await this.prisma.user
      .update({ where: { id }, data: { photoFileName } })
      .catch(() => null);
    if (!row) throw new NotFoundException("User not found.");
    return toStoredUser(row);
  }

  /** Admin-created: immediately active. */
  async createEmployee(input: CreateEmployeeInput): Promise<StoredUser> {
    return this.createStaff(input, "ACTIVE");
  }

  /** Admin "Add User": create an employee or another admin, immediately active. */
  async createUser(input: CreateUserInput): Promise<StoredUser> {
    return this.createStaff(input, "ACTIVE", input.role);
  }

  /**
   * Admin edits a staff account from User Management: name/email/phone/username,
   * role, and an optional password reset. Only the fields present in `input`
   * change. Email/username uniqueness is checked across all staff (excluding
   * this account). Promoting to EMPLOYEE assigns an employee code if missing.
   */
  async adminUpdateUser(id: string, input: UpdateUserInput): Promise<StoredUser> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing || (existing.role !== "EMPLOYEE" && existing.role !== "ADMIN")) {
      throw new NotFoundException("User not found.");
    }

    const data: Record<string, unknown> = {};

    if (input.email !== undefined) {
      const email = input.email.trim().toLowerCase();
      const clash = await this.prisma.user.findFirst({
        where: { email, role: { in: LOGIN_ROLES }, NOT: { id } },
      });
      if (clash) throw new ConflictException("A user with this email already exists.");
      data.email = email;
    }

    if (input.username !== undefined) {
      const username = input.username.trim().toLowerCase();
      const clash = await this.prisma.user.findFirst({
        where: { role: { in: LOGIN_ROLES }, NOT: { id }, OR: [{ username }, { email: username }] },
      });
      if (clash) throw new ConflictException("That username is already taken.");
      data.username = username;
    }

    if (input.fname !== undefined) data.fname = input.fname;
    if (input.lname !== undefined) data.lname = input.lname;
    if (input.phone !== undefined) data.mobile = input.phone;

    // Resolved whenever a role is submitted at all — not just when it differs
    // from existing.role (User.role), because an Owner's User.role is already
    // "ADMIN" (only Membership.role says OWNER), so diffing against User.role
    // alone would treat "demote this Owner to ADMIN" as a no-op and silently
    // do nothing. Membership.role — the field that actually drives org-level
    // authorization (the permission matrix, the last-owner invariant) — is
    // the authoritative source for "did the role actually change." Doesn't
    // fully close the broader gap that adminUpdateUser has no cross-org guard
    // for its other fields — left for a future hardening pass.
    let membership: { id: string; role: "OWNER" | "ADMIN" | "EMPLOYEE"; employeeCode: string | null } | null = null;
    let organizationId: string | undefined;
    let newRole: Extract<Role, "EMPLOYEE" | "ADMIN"> | undefined;
    if (input.role !== undefined) {
      organizationId = this.requireOrgId();
      membership = await this.prisma.membership.findFirst({
        where: { userId: id, organizationId, status: "ACTIVE" },
        select: { id: true, role: true, employeeCode: true },
      });
      if (!membership) throw new NotFoundException("User not found.");
      if (input.role !== existing.role) {
        data.role = input.role;
      }
      if (input.role !== membership.role) {
        newRole = input.role;
      }
    }

    if (input.password !== undefined) {
      data.passwordHash = await hashPassword(input.password);
      data.tokenVersion = { increment: 1 };
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (membership && newRole !== undefined) {
          // membership.role === "OWNER" here always means a demotion away from
          // OWNER (newRole is StaffRole, EMPLOYEE|ADMIN only, never "OWNER" itself).
          if (membership.role === "OWNER") {
            await assertOrgKeepsActiveOwner(tx, organizationId!);
          }
          // Employees carry a sequential code; assign one if promoting into EMPLOYEE who lacks it.
          let employeeCode = membership.employeeCode;
          if (newRole === "EMPLOYEE" && !employeeCode) {
            employeeCode = await nextEmployeeCodeTx(tx, organizationId!);
            data.employeeCode = employeeCode;
          }
          await tx.membership.update({ where: { id: membership.id }, data: { role: newRole, employeeCode } });
        }
        return tx.user.update({ where: { id }, data });
      });
      return toStoredUser(row);
    } catch (err) {
      if (err instanceof LastOwnerViolationError) throw new ConflictException(err.message);
      throw err;
    }
  }

  /** Public self-signup: stays PENDING until the admin approves it. */
  async signupEmployee(input: EmployeeSignupInput): Promise<StoredUser> {
    return this.createStaff(input, "PENDING");
  }

  /** Admin: list employee signups awaiting approval. Scoped to the caller's org. */
  async listPendingEmployees(): Promise<StoredUser[]> {
    const organizationId = this.requireOrgId();
    const rows = await this.prisma.user.findMany({
      where: {
        role: "EMPLOYEE",
        status: "PENDING",
        memberships: { some: { organizationId, status: "PENDING" } },
      },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toStoredUser);
  }

  /** Admin: activate a pending employee signup. */
  async approveEmployee(id: string): Promise<StoredUser> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing || existing.role !== "EMPLOYEE") throw new NotFoundException("Request not found.");
    const organizationId = this.requireOrgId();
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.membership.updateMany({
        where: { userId: id, organizationId, status: "PENDING" },
        data: { status: "ACTIVE" },
      });
      if (updated.count === 0) throw new NotFoundException("Request not found.");
      return tx.user.update({ where: { id }, data: { status: "ACTIVE" } });
    });
    return toStoredUser(row);
  }

  /** Admin: reject (delete) a pending employee signup. */
  async rejectEmployee(id: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing || existing.role !== "EMPLOYEE" || existing.status !== "PENDING") {
      throw new NotFoundException("Request not found.");
    }
    const organizationId = this.requireOrgId();
    // Membership.userId -> User is ON DELETE RESTRICT: the membership must go first.
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.membership.deleteMany({ where: { userId: id, organizationId, status: "PENDING" } });
      if (deleted.count === 0) throw new NotFoundException("Request not found.");
      await tx.user.delete({ where: { id } });
    });
  }

  /** Admin: discontinue any staff member's services (employee, admin, or owner) — blocks login, keeps the record (reversible). */
  async deactivateMember(id: string): Promise<StoredUser> {
    return this.setMemberStatus(id, "INACTIVE");
  }

  /** Admin: restore a discontinued staff member's access. */
  async reactivateMember(id: string): Promise<StoredUser> {
    return this.setMemberStatus(id, "ACTIVE");
  }

  /**
   * Keeps User.status and this org's Membership.status in sync (every user
   * has exactly one org today, so this is safe; AuthService.tryLogin reads
   * User.status for its clean "services discontinued" rejection at login —
   * if only Membership flipped, a removed user could still log in with no
   * org claims in their token instead of getting a clean rejection).
   */
  private async setMemberStatus(id: string, status: "ACTIVE" | "INACTIVE"): Promise<StoredUser> {
    const tenant = this.requireTenant();
    if (status === "INACTIVE" && id === tenant.userId) {
      throw new ForbiddenException("You cannot deactivate your own account.");
    }

    const membership = await this.prisma.membership.findFirst({
      where: { userId: id, organizationId: tenant.organizationId },
    });
    if (!membership || membership.status === "PENDING") {
      throw new NotFoundException("Account not found.");
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        if (status === "INACTIVE" && membership.role === "OWNER") {
          await assertOrgKeepsActiveOwner(tx, tenant.organizationId);
        }
        await tx.membership.update({ where: { id: membership.id }, data: { status } });
        // Deactivation revokes existing sessions immediately.
        return tx.user.update({
          where: { id },
          data: { status, ...(status === "INACTIVE" ? { tokenVersion: { increment: 1 } } : {}) },
        });
      });
      return toStoredUser(row);
    } catch (err) {
      if (err instanceof LastOwnerViolationError) throw new ConflictException(err.message);
      throw err;
    }
  }

  /**
   * Throws if email/username already belongs to any staff account (EMPLOYEE|ADMIN),
   * platform-wide — an admin-created or self-signed-up login can never collide
   * with an existing one, regardless of which org it's joining. Shared by
   * createStaff and OrganizationsService.signup.
   */
  async assertStaffLoginAvailable(email: string, username: string | null): Promise<void> {
    const emailClash = await this.prisma.user.findFirst({
      where: { email, role: { in: LOGIN_ROLES } },
    });
    if (emailClash) throw new ConflictException("A user with this email already exists.");

    if (username) {
      const usernameClash = await this.prisma.user.findFirst({
        where: { role: { in: LOGIN_ROLES }, OR: [{ username }, { email: username }] },
      });
      if (usernameClash) throw new ConflictException("That username is already taken.");
    }
  }

  private async createStaff(
    input: CreateEmployeeInput | EmployeeSignupInput | CreateUserInput,
    status: "PENDING" | "ACTIVE",
    role: Extract<Role, "EMPLOYEE" | "ADMIN"> = "EMPLOYEE",
  ): Promise<StoredUser> {
    const email = input.email.trim().toLowerCase();
    const username =
      "username" in input && input.username ? input.username.trim().toLowerCase() : null;

    await this.assertStaffLoginAvailable(email, username);

    const passwordHash = await hashPassword(input.password);
    const organizationId = await this.resolveOrgForStaffCreate(
      status,
      "joinCode" in input ? input.joinCode : undefined,
    );
    const membershipStatus = status === "PENDING" ? "PENDING" : "ACTIVE";

    // User + Membership are created together: a User row with no Membership
    // has no org context, which would make it invisible to list()/listStaff()
    // and unable to log in (guards can't resolve a tenant for it). The
    // employee code is allocated inside the same transaction, atomically
    // incrementing the org's own counter, so two concurrent joins can never
    // claim the same code.
    const row = await this.prisma.$transaction(async (tx) => {
      const employeeCode = role === "EMPLOYEE" ? await nextEmployeeCodeTx(tx, organizationId) : null;
      const user = await tx.user.create({
        data: {
          email,
          username,
          passwordHash,
          role,
          fname: input.fname,
          lname: input.lname,
          status,
          mobile: "phone" in input ? input.phone : null,
          employeeCode,
        },
      });
      await tx.membership.create({
        data: { userId: user.id, organizationId, role, status: membershipStatus, employeeCode },
      });
      return user;
    });
    return toStoredUser(row);
  }

  /**
   * Admin-driven creates (createEmployee/createUser) join the admin's own org
   * via tenant context. Public self-signup (signupEmployee) resolves the org
   * from the joinCode the signer entered.
   */
  private async resolveOrgForStaffCreate(status: "PENDING" | "ACTIVE", joinCode?: string): Promise<string> {
    if (status !== "PENDING") return this.requireOrgId();
    if (!joinCode) throw new BadRequestException("A join code is required.");
    const org = await this.prisma.$unscoped.organization.findUnique({ where: { joinCode } });
    if (!org) throw new BadRequestException("Invalid join code.");
    return org.id;
  }

}

/** Hash a new or changed password with argon2id. */
export async function hashPassword(password: string): Promise<string> {
  return argon2Hash(password, { algorithm: Algorithm.Argon2id });
}

/** True for a legacy scrypt hash ("<salt-hex>:<hash-hex>") — i.e. not yet argon2. */
export function isLegacyHash(stored: string): boolean {
  return !stored.startsWith("$argon2");
}

/**
 * Verify a password against either an argon2id hash (new) or a legacy scrypt
 * hash ("<salt-hex>:<hash-hex>"). Returns false on any malformed input rather
 * than throwing, so a bad stored value can never crash a login.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!isLegacyHash(stored)) {
    try {
      return await argon2Verify(stored, password);
    } catch {
      return false;
    }
  }
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), 32);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
