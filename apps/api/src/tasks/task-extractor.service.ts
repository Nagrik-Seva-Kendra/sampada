import { Injectable, Logger } from "@nestjs/common";
import { mapTaskExtract, type TaskDraft } from "./task-rules.js";
import { normalizePhone } from "./tasks.service.js";

const SYSTEM = `You turn one note from the owner of a property-document writing office in Gwalior (India) into a to-do item.
The note is Hindi, Hinglish or English, often speech-to-text. Return ONLY one JSON object:
{"title": short Hindi title, "partyName": string|null, "workType": one of "sale","mortgage","agreement","patta","mutation","copy","call","collect_papers","other",
 "place": property/place or null, "dueText": the exact words of the deadline as said (e.g. "सोमवार तक", "kal shaam") or null, "note": anything else useful or null}
workType: विक्रय पत्र/बैनामा/registry=sale, बंधक/mortgage=mortgage, अनुबंध/एग्रीमेंट=agreement, पट्टा=patta, नामांतरण=mutation, नकल=copy, फोन/कॉल करना=call, कागज़ लेना=collect_papers.
If unsure of a field, use null. Never invent names, places or dates. A phone number appears as [MOBILE].`;

/** Owner's note → task draft (ANTHROPIC_MODEL). The mobile is taken out before the model sees the text. */
@Injectable()
export class TaskExtractorService {
  private readonly log = new Logger("TaskExtractor");

  async extract(text: string, now = new Date()): Promise<TaskDraft | null> {
    const phone = findMobile(text);
    const forModel = text.replace(/(\+?91[\s-]?)?[6-9](?:[\s-]?\d){9}/g, "[MOBILE]").slice(0, 2000);
    let raw: unknown = null;
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({
            model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
            max_tokens: 400,
            system: SYSTEM,
            messages: [{ role: "user", content: forModel }],
          }),
        });
        if (res.ok) {
          const json: any = await res.json();
          const out = (json.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("").replace(/```json|```/g, "").trim();
          raw = JSON.parse(out);
        } else this.log.warn(`task extract failed: HTTP ${res.status}`);
      } catch (e: any) {
        this.log.warn(`task extract unusable: ${e?.name ?? "error"}`);
      }
    }
    // Model off/unusable: the note itself becomes the title.
    const draft = mapTaskExtract(raw ?? { title: text.slice(0, 200), dueText: text }, now);
    if (draft && phone) draft.partyPhone = phone;
    return draft;
  }
}

/** First Indian mobile number in the text, as 91XXXXXXXXXX. */
export function findMobile(text: string): string | null {
  const m = text.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d))).match(/(\+?91[\s-]?)?[6-9](?:[\s-]?\d){9}/);
  return m ? normalizePhone(m[0]) : null;
}
