import { Injectable, Logger } from "@nestjs/common";
import type { IdCardRaw } from "./id-cards.js";

/**
 * Reads an Aadhaar (front/back) or PAN card photo the customer sent for their
 * own registry work, with the same Claude vision call as DeedExtractorService.
 * Returns the raw JSON; id-cards.ts mapIdRead() validates it (Verhoeff, PAN
 * pattern). Logs only HTTP status / parse failure -- never the card's content.
 */
const SYSTEM = `You read Indian identity cards (Aadhaar card front or back, PAN card) from a photo that the card holder
sent to a document-writer office for their own property-registration paperwork.
Return ONLY one JSON object (no prose, no markdown) with keys:
readable, cardType, nameEn, nameHi, dob, gender, address, aadhaarNumber, panNumber, fatherNameEn.
Rules:
- readable: false if the photo is blurred, cut off, too dark, or the key text cannot be read with certainty.
- cardType: "aadhaar_front" (photo, name, DOB, gender, number), "aadhaar_back" (address side),
  "aadhaar_both" (a letter/e-Aadhaar showing both), "pan", or "other".
- Copy text exactly as printed. Use null for anything not clearly readable. Never guess a digit or letter.
- nameEn: the name in English letters; nameHi: the name in Devanagari if printed, else null.
- dob: as printed (DD/MM/YYYY, or the year alone if only "Year of Birth" is printed).
- gender: "M", "F" or "T" as printed (पुरुष/Male = M, महिला/Female = F), else null.
- address: the full address as printed (Aadhaar only), in the card's Hindi text if present, else English; null for PAN.
- aadhaarNumber: the 12-digit Aadhaar number (digits only). Null if only a masked/VID number is visible.
- panNumber: the 10-character PAN (PAN card only). fatherNameEn: "Father's Name" on the PAN card, else null.`;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

@Injectable()
export class IdCardExtractorService {
  private readonly log = new Logger(IdCardExtractorService.name);

  async read(buf: Buffer, mime: string): Promise<IdCardRaw | null> {
    const data = buf.toString("base64");
    let block: any;
    if (mime === "application/pdf") {
      block = { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
    } else if (IMAGE_TYPES.includes(mime)) {
      block = { type: "image", source: { type: "base64", media_type: mime, data } };
    } else {
      return null;
    }
    if (!process.env.ANTHROPIC_API_KEY) return null;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
        max_tokens: 1000,
        system: SYSTEM,
        messages: [{ role: "user", content: [block, { type: "text", text: "Extract the JSON." }] }],
      }),
    });
    if (!res.ok) {
      // Status only: the error body can echo the request.
      this.log.error(`ID card read failed: HTTP ${res.status}`);
      return null;
    }
    const json: any = await res.json();
    const text = (json.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("")
      .replace(/```json|```/g, "")
      .trim();
    try {
      return JSON.parse(text) as IdCardRaw;
    } catch {
      this.log.warn("ID card read: response was not JSON");
      return null;
    }
  }
}
