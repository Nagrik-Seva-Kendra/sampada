import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import type { User } from "@prisma/client";
import type { CreateEmployeeInput, EmployeeSignupInput, Role, UpdateProfileInput } from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";

export interface StoredUser {
  id: string;
  email: string;
  /** Login handle the employee sets themselves; null until they do. */
  username: string | null;
  /** scrypt: `<salt-hex>:<hash-hex>` */
  passwordHash: string;
  /** AES-256-GCM reversible copy so the admin can look up what the user set: `<iv-hex>:<tag-hex>:<ciphertext-hex>`. */
  passwordEnc: string;
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
    passwordEnc: row.passwordEnc ?? "",
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

  async list(): Promise<StoredUser[]> {
    const rows = await this.prisma.user.findMany({
      where: { role: { in: STAFF_ROLES } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toStoredUser);
  }

  /** Admin: decrypt the password an employee set at signup (for support/recovery use). */
  async getPassword(id: string): Promise<string> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException("User not found.");
    if (!user.passwordEnc) {
      throw new NotFoundException("No recoverable password stored for this account.");
    }
    return decryptPassword(user.passwordEnc);
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

    if (input.password && !verifyPassword(input.currentPassword ?? "", existing.passwordHash)) {
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
          ? { passwordHash: hashPassword(input.password), passwordEnc: encryptPassword(input.password) }
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
    const row = await this.prisma.user.update({ where: { id }, data: { status } });
    return toStoredUser(row);
  }

  private async createStaff(
    input: CreateEmployeeInput | EmployeeSignupInput,
    status: "PENDING" | "ACTIVE",
  ): Promise<StoredUser> {
    const email = input.email.trim().toLowerCase();
    const username = "username" in input ? input.username.trim().toLowerCase() : null;

    const emailClash = await this.prisma.user.findFirst({
      where: { email, role: { in: STAFF_ROLES } },
    });
    if (emailClash) throw new ConflictException("A user with this email already exists.");

    if (username) {
      const usernameClash = await this.prisma.user.findFirst({
        where: { role: { in: STAFF_ROLES }, OR: [{ username }, { email: username }] },
      });
      if (usernameClash) throw new ConflictException("That username is already taken.");
    }

    const employeeCode = await this.nextEmployeeCode();

    const row = await this.prisma.user.create({
      data: {
        email,
        username,
        passwordHash: hashPassword(input.password),
        passwordEnc: encryptPassword(input.password),
        role: "EMPLOYEE",
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

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const hash = scryptSync(password, Buffer.from(saltHex, "hex"), 32);
  return timingSafeEqual(hash, Buffer.from(hashHex, "hex"));
}

/**
 * Reversible AES-256-GCM copy of the password so the admin can look it up.
 * Interim only — a real deployment shouldn't keep recoverable passwords at
 * all; this exists because the admin asked to be able to view what employees
 * set. Key is derived from JWT_SECRET so no extra env var is needed.
 */
function encKey(): Buffer {
  const secret = process.env.JWT_SECRET ?? "";
  return createHash("sha256").update(secret).digest();
}

function encryptPassword(password: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${ciphertext.toString("hex")}`;
}

function decryptPassword(stored: string): string {
  const [ivHex, tagHex, ciphertextHex] = stored.split(":");
  if (!ivHex || !tagHex || !ciphertextHex) throw new Error("Malformed encrypted password.");
  const decipher = createDecipheriv("aes-256-gcm", encKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const plain = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
  return plain.toString("utf8");
}
