import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ContactInput, ContactMessage } from "@sampada/shared";

/**
 * Interim contact store: appends messages to a JSONL file on disk (DB-free).
 * Swap for a DB table (+ email notification via Resend) in a later phase.
 */
@Injectable()
export class ContactService {
  private readonly baseDir =
    process.env.UPLOAD_DIR
      ? path.join(process.env.UPLOAD_DIR, "..", "contact")
      : path.resolve(process.cwd(), "uploads", "contact");
  private readonly file = path.join(this.baseDir, "messages.jsonl");

  async submit(input: ContactInput): Promise<ContactMessage> {
    const msg: ContactMessage = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.appendFile(this.file, JSON.stringify(msg) + "\n", "utf8");
    return msg;
  }

  async list(): Promise<ContactMessage[]> {
    let text: string;
    try {
      text = await fs.readFile(this.file, "utf8");
    } catch {
      return [];
    }
    return text
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ContactMessage)
      .reverse();
  }
}
