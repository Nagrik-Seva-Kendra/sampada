import { ConflictException, Injectable } from "@nestjs/common";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CreatePartnerInput, Role } from "@sampada/shared";

export interface StoredUser {
  id: string;
  email: string;
  /** scrypt: `<salt-hex>:<hash-hex>` */
  passwordHash: string;
  role: Role;
  fname: string;
  lname: string;
  createdAt: string;
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
      .map((line) => JSON.parse(line) as StoredUser);
  }

  async findByEmail(email: string): Promise<StoredUser | undefined> {
    const needle = email.trim().toLowerCase();
    return (await this.list()).find((u) => u.email.toLowerCase() === needle);
  }

  async createPartner(input: CreatePartnerInput): Promise<StoredUser> {
    if (await this.findByEmail(input.email)) {
      throw new ConflictException("A user with this email already exists.");
    }
    const user: StoredUser = {
      id: randomUUID(),
      email: input.email.trim().toLowerCase(),
      passwordHash: hashPassword(input.password),
      role: "PARTNER",
      fname: input.fname,
      lname: input.lname,
      createdAt: new Date().toISOString(),
    };
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.appendFile(this.file, JSON.stringify(user) + "\n", "utf8");
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
