import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  CreateEmployeeInput,
  CreatePartnerInput,
  EmployeeSignupInput,
  PartnerSignupInput,
  Role,
  UpdateProfileInput,
} from "@sampada/shared";

export interface StoredUser {
  id: string;
  email: string;
  /** Login handle the partner sets themselves; null until they do. */
  username: string | null;
  /** scrypt: `<salt-hex>:<hash-hex>` */
  passwordHash: string;
  role: Role;
  fname: string;
  lname: string;
  createdAt: string;
  /** Stored profile-photo filename (under uploads/profile-photos/); null if none. */
  photoFileName: string | null;
  /** PENDING employee self-signups can't log in until the admin approves them. */
  status: "PENDING" | "ACTIVE";
  /** 10-digit mobile number; only collected for employees so far. */
  phone: string | null;
}

/**
 * Interim user store: JSONL on disk (DB-free), same pattern as ContactService.
 * Holds partner accounts created by the admin; the admin itself stays on env
 * credentials. Swap for the Prisma User table in the DB phase.
 */
@Injectable()
export class UsersService {
  private readonly baseDir =
    process.env.UPLOAD_DIR
      ? path.join(process.env.UPLOAD_DIR, "..", "users")
      : path.resolve(process.cwd(), "uploads", "users");
  private readonly file = path.join(this.baseDir, "users.jsonl");

  async list(): Promise<StoredUser[]> {
    let text: string;
    try {
      text = await fs.readFile(this.file, "utf8");
    } catch {
      return [];
    }
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as StoredUser)
      .map((u) => ({ ...u, status: u.status ?? "ACTIVE", phone: u.phone ?? null }));
  }

  async findByEmail(email: string): Promise<StoredUser | undefined> {
    const needle = email.trim().toLowerCase();
    return (await this.list()).find((u) => u.email.toLowerCase() === needle);
  }

  async findById(id: string): Promise<StoredUser | undefined> {
    return (await this.list()).find((u) => u.id === id);
  }

  /** Login by username if set, else email (keeps accounts without a username usable). */
  async findByLogin(login: string): Promise<StoredUser | undefined> {
    const needle = login.trim().toLowerCase();
    return (await this.list()).find(
      (u) => u.username?.toLowerCase() === needle || u.email.toLowerCase() === needle,
    );
  }

  /** Partner/employee self-edit: own name/email/username/password (current password required to change password). */
  async updateProfile(id: string, input: UpdateProfileInput): Promise<StoredUser> {
    const users = await this.list();
    const index = users.findIndex((u) => u.id === id);
    if (index === -1) throw new NotFoundException("User not found.");

    if (input.password && !verifyPassword(input.currentPassword ?? "", users[index]!.passwordHash)) {
      throw new ForbiddenException("Current password is incorrect.");
    }

    const email = input.email?.trim().toLowerCase();
    if (email && users.some((u) => u.id !== id && u.email.toLowerCase() === email)) {
      throw new ConflictException("A user with this email already exists.");
    }
    const username = input.username?.trim().toLowerCase();
    if (
      username &&
      users.some(
        (u) =>
          u.id !== id &&
          (u.username?.toLowerCase() === username || u.email.toLowerCase() === username),
      )
    ) {
      throw new ConflictException("That username is already taken.");
    }

    const updated: StoredUser = {
      ...users[index]!,
      ...(input.fname !== undefined ? { fname: input.fname } : {}),
      ...(input.lname !== undefined ? { lname: input.lname } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(username !== undefined ? { username } : {}),
      ...(input.password !== undefined ? { passwordHash: hashPassword(input.password) } : {}),
    };
    users[index] = updated;
    await this.writeAll(users);
    return updated;
  }

  /** Replace the stored profile-photo filename for a user (null clears it). */
  async setPhoto(id: string, photoFileName: string | null): Promise<StoredUser> {
    const users = await this.list();
    const index = users.findIndex((u) => u.id === id);
    if (index === -1) throw new NotFoundException("User not found.");
    users[index] = { ...users[index]!, photoFileName };
    await this.writeAll(users);
    return users[index]!;
  }

  private async writeAll(users: StoredUser[]): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    const body = users.map((u) => JSON.stringify(u)).join("\n");
    await fs.writeFile(this.file, body ? body + "\n" : "", "utf8");
  }

  /** Admin-created: immediately active. */
  async createPartner(input: CreatePartnerInput): Promise<StoredUser> {
    return this.createStaff("PARTNER", input, "ACTIVE");
  }

  /** Admin-created: immediately active. */
  async createEmployee(input: CreateEmployeeInput): Promise<StoredUser> {
    return this.createStaff("EMPLOYEE", input, "ACTIVE");
  }

  /** Public self-signup: stays PENDING until the admin approves it. */
  async signupPartner(input: PartnerSignupInput): Promise<StoredUser> {
    return this.createStaff("PARTNER", input, "PENDING");
  }

  /** Public self-signup: stays PENDING until the admin approves it. */
  async signupEmployee(input: EmployeeSignupInput): Promise<StoredUser> {
    return this.createStaff("EMPLOYEE", input, "PENDING");
  }

  /** Admin: list partner signups awaiting approval. */
  async listPendingPartners(): Promise<StoredUser[]> {
    return this.listPending("PARTNER");
  }

  /** Admin: list employee signups awaiting approval. */
  async listPendingEmployees(): Promise<StoredUser[]> {
    return this.listPending("EMPLOYEE");
  }

  /** Admin: activate a pending partner signup. */
  async approvePartner(id: string): Promise<StoredUser> {
    return this.approveStaff(id, "PARTNER");
  }

  /** Admin: activate a pending employee signup. */
  async approveEmployee(id: string): Promise<StoredUser> {
    return this.approveStaff(id, "EMPLOYEE");
  }

  /** Admin: reject (delete) a pending partner signup. */
  async rejectPartner(id: string): Promise<void> {
    return this.rejectStaff(id, "PARTNER");
  }

  /** Admin: reject (delete) a pending employee signup. */
  async rejectEmployee(id: string): Promise<void> {
    return this.rejectStaff(id, "EMPLOYEE");
  }

  private async listPending(role: "PARTNER" | "EMPLOYEE"): Promise<StoredUser[]> {
    return (await this.list()).filter((u) => u.role === role && u.status === "PENDING");
  }

  private async approveStaff(id: string, role: "PARTNER" | "EMPLOYEE"): Promise<StoredUser> {
    const users = await this.list();
    const index = users.findIndex((u) => u.id === id && u.role === role);
    if (index === -1) throw new NotFoundException("Request not found.");
    users[index] = { ...users[index]!, status: "ACTIVE" };
    await this.writeAll(users);
    return users[index]!;
  }

  private async rejectStaff(id: string, role: "PARTNER" | "EMPLOYEE"): Promise<void> {
    const users = await this.list();
    const target = users.find((u) => u.id === id && u.role === role && u.status === "PENDING");
    if (!target) throw new NotFoundException("Request not found.");
    await this.writeAll(users.filter((u) => u.id !== id));
  }

  private async createStaff(
    role: "PARTNER" | "EMPLOYEE",
    input: CreatePartnerInput | CreateEmployeeInput | PartnerSignupInput | EmployeeSignupInput,
    status: "PENDING" | "ACTIVE",
  ): Promise<StoredUser> {
    const users = await this.list();
    if (users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) {
      throw new ConflictException("A user with this email already exists.");
    }
    const username = "username" in input ? input.username.trim().toLowerCase() : null;
    if (
      username &&
      users.some((u) => u.username?.toLowerCase() === username || u.email.toLowerCase() === username)
    ) {
      throw new ConflictException("That username is already taken.");
    }
    const user: StoredUser = {
      id: randomUUID(),
      email: input.email.trim().toLowerCase(),
      username,
      passwordHash: hashPassword(input.password),
      role,
      fname: input.fname,
      lname: input.lname,
      createdAt: new Date().toISOString(),
      photoFileName: null,
      status,
      phone: "phone" in input ? input.phone : null,
    };
    await this.writeAll([...users, user]);
    return user;
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
