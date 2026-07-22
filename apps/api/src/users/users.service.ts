import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { hash as argon2Hash, verify as argon2Verify, Algorithm } from "@node-rs/argon2";
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
}

function toStoredUser(row: User): StoredUser {
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
  constructor(private readonly prisma: PrismaService) {}

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

  async list(): Promise<StoredUser[]> {
    const rows = await this.prisma.user.findMany({
      where: { role: { in: STAFF_ROLES } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toStoredUser);
  }

  /**
   * Admin "User Management" tab: every approved staff account — employees AND
   * admins — so admin-created admin logins show up too. Excludes PENDING
   * self-signups (those live in the Requests tab via listPendingEmployees).
   */
  async listStaff(): Promise<StoredUser[]> {
    const rows = await this.prisma.user.findMany({
      where: { role: { in: LOGIN_ROLES }, status: { in: ["ACTIVE", "INACTIVE"] } },
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

  /** Login by username if set, else email (keeps accounts without a username usable). */
  async findByLogin(login: string): Promise<StoredUser | undefined> {
    const needle = login.trim().toLowerCase();
    const row = await this.prisma.user.findFirst({
      where: { role: { in: LOGIN_ROLES }, OR: [{ username: needle }, { email: needle }] },
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

    if (input.role !== undefined && input.role !== existing.role) {
      data.role = input.role;
      // Employees carry a sequential code; assign one if promoting an admin who lacks it.
      if (input.role === "EMPLOYEE" && !existing.employeeCode) {
        data.employeeCode = await this.nextEmployeeCode();
      }
    }

    if (input.password !== undefined) {
      data.passwordHash = await hashPassword(input.password);
      data.tokenVersion = { increment: 1 };
    }

    const row = await this.prisma.user.update({ where: { id }, data });
    return toStoredUser(row);
  }

  /** Public self-signup: stays PENDING until the admin approves it. */
  async signupEmployee(input: EmployeeSignupInput): Promise<StoredUser> {
    return this.createStaff(input, "PENDING");
  }

  /** Admin: list employee signups awaiting approval. */
  async listPendingEmployees(): Promise<StoredUser[]> {
    const rows = await this.prisma.user.findMany({
      where: { role: "EMPLOYEE", status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toStoredUser);
  }

  /** Admin: activate a pending employee signup. */
  async approveEmployee(id: string): Promise<StoredUser> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing || existing.role !== "EMPLOYEE") throw new NotFoundException("Request not found.");
    const row = await this.prisma.user.update({ where: { id }, data: { status: "ACTIVE" } });
    return toStoredUser(row);
  }

  /** Admin: reject (delete) a pending employee signup. */
  async rejectEmployee(id: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing || existing.role !== "EMPLOYEE" || existing.status !== "PENDING") {
      throw new NotFoundException("Request not found.");
    }
    await this.prisma.user.delete({ where: { id } });
  }

  /** Admin: discontinue an employee's services — blocks login, keeps the record (reversible). */
  async deactivateEmployee(id: string): Promise<StoredUser> {
    return this.setEmployeeStatus(id, "INACTIVE");
  }

  /** Admin: restore a discontinued employee's access. */
  async reactivateEmployee(id: string): Promise<StoredUser> {
    return this.setEmployeeStatus(id, "ACTIVE");
  }

  private async setEmployeeStatus(id: string, status: "ACTIVE" | "INACTIVE"): Promise<StoredUser> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing || existing.role !== "EMPLOYEE" || existing.status === "PENDING") {
      throw new NotFoundException("Account not found.");
    }
    const row = await this.prisma.user.update({
      where: { id },
      // Deactivation revokes existing sessions immediately.
      data: { status, ...(status === "INACTIVE" ? { tokenVersion: { increment: 1 } } : {}) },
    });
    return toStoredUser(row);
  }

  private async createStaff(
    input: CreateEmployeeInput | EmployeeSignupInput | CreateUserInput,
    status: "PENDING" | "ACTIVE",
    role: Extract<Role, "EMPLOYEE" | "ADMIN"> = "EMPLOYEE",
  ): Promise<StoredUser> {
    const email = input.email.trim().toLowerCase();
    const username =
      "username" in input && input.username ? input.username.trim().toLowerCase() : null;

    // Clash checks span every staff account (employees + admins) so an
    // admin-created login can never collide with an existing one.
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

    // Sequential EMP-code identifies employees only; admins don't get one.
    const employeeCode = role === "EMPLOYEE" ? await this.nextEmployeeCode() : null;

    const row = await this.prisma.user.create({
      data: {
        email,
        username,
        passwordHash: await hashPassword(input.password),
        role,
        fname: input.fname,
        lname: input.lname,
        status,
        mobile: "phone" in input ? input.phone : null,
        employeeCode,
      },
    });
    return toStoredUser(row);
  }

  /** Sequential "EMP-0007"-style code; based on the highest existing employee code so gaps from deletions aren't reused. */
  private async nextEmployeeCode(): Promise<string> {
    const rows = await this.prisma.user.findMany({
      where: { role: "EMPLOYEE", employeeCode: { not: null } },
      select: { employeeCode: true },
    });
    const max = rows
      .map((r) => Number(r.employeeCode!.replace("EMP-", "")))
      .filter((n) => Number.isFinite(n))
      .reduce((a, b) => Math.max(a, b), 0);
    return `EMP-${String(max + 1).padStart(4, "0")}`;
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
