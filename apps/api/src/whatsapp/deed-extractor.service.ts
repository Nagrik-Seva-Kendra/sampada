import { Injectable, Logger } from "@nestjs/common";

export interface DeedParty { name: string; relation: string | null }
export interface DeedProperty {
  district: string | null;
  tehsil: string | null;
  village: string | null;
  locality: string | null;
  khasraOrPlotNo: string | null;
  propertyType: "agricultural" | "residential_plot" | "house" | "flat" | "commercial" | null;
  areaValue: number | null;
  areaUnit: string | null;
}
export interface DeedExtract {
  isSaleDeed: boolean;
  documentType: string | null;
  registrationNo: string | null;
  registrationDate: string | null;
  sellers: DeedParty[];
  buyers: DeedParty[]; // इस रजिस्ट्री के क्रेता = वर्तमान मालिक
  property: DeedProperty | null;
  consideration: number | null;
}

const SYSTEM = `You read Madhya Pradesh (India) property registration documents written in Hindi or English.
Return ONLY one JSON object (no prose, no markdown) with keys:
isSaleDeed, documentType, registrationNo, registrationDate, sellers[{name,relation}], buyers[{name,relation}],
property{district,tehsil,village,locality,khasraOrPlotNo,propertyType,areaValue,areaUnit}, consideration.
Rules:
- Copy names and place names exactly as written (keep Devanagari as-is).
- Use null for anything not clearly readable. Never guess or fill from general knowledge.
- Do NOT extract Aadhaar, PAN, phone numbers or photos.
- "buyers" are the क्रेता/purchasers of THIS deed (current owners).
- propertyType is one of "agricultural","residential_plot","house","flat","commercial" or null.
- areaValue is a number; areaUnit exactly as in the document (e.g. "वर्ग मीटर", "हेक्टेयर", "वर्ग फुट").`;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

@Injectable()
export class DeedExtractorService {
  private readonly log = new Logger(DeedExtractorService.name);

  async extract(buf: Buffer, mime: string): Promise<DeedExtract | null> {
    const data = buf.toString("base64");
    let block: any;
    if (mime === "application/pdf") {
      block = { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
    } else if (IMAGE_TYPES.includes(mime)) {
      block = { type: "image", source: { type: "base64", media_type: mime, data } };
    } else {
      return null; // docx आदि — स्टाफ देखेगा
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY as string,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{ role: "user", content: [block, { type: "text", text: "Extract the JSON." }] }],
      }),
    });
    if (!res.ok) {
      this.log.error(`Claude extract failed ${res.status}: ${await res.text()}`);
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
      return JSON.parse(text) as DeedExtract;
    } catch {
      this.log.warn("Could not parse deed JSON");
      return null;
    }
  }
}
