// Pure prompt-building and response-parsing logic for AI-assisted property-
// detail extraction, deliberately free of any NestJS/Prisma/fetch import so
// it can be unit-tested without mocking the network. deed-property-
// detail.service.ts wraps this with the actual Claude HTTP call (same
// pattern as SampleDeedsService.draftWithClaude).
import { DeedPropertyDetailExtraction } from "@sampada/shared";

export class ExtractionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionParseError";
  }
}

export const EXTRACTION_SYSTEM_PROMPT = `You are an expert at reading Indian property-registration deed documents \
(Hindi and/or English, Madhya Pradesh) and extracting structured facts about the property itself. Deed phrasing \
varies a lot between authors and eras, so read the whole text and understand it rather than looking for one fixed \
wording.

Extract ONLY facts explicitly stated in the text. Never guess, infer, compute, or fabricate a value — if a field \
isn't clearly stated, use null for it. In particular: never derive ewLength/nsLength by splitting or taking the \
square root of a total area — only fill them if the deed states two separate edge measurements (e.g. "60 फुट वाय \
49.25 फुट" / "30 ft x 40 ft"). Distinguish this property's OWN plot number from a neighboring plot's number that \
only appears as a chauhaddi (boundary) reference — chauhaddi entries always name a direction (पूर्व/पश्चिम/उत्तर/\
दक्षिण/East/West/North/South) right before or around the reference; this property's own number is stated as its \
own declaration, without a direction word attached. Not every deed has a plot number at all — leave it null rather \
than guessing one.

"location" is the property's FULL address as one piece of free text (colony/area name, village, patwari halka \
number(s), tehsil, district — whatever the deed states, combined into one readable line) — do not split it into \
separate fields.

"sellerName"/"buyerName" are the seller's and buyer's names exactly as the deed states them, including any \
parentage clause if given (e.g. "श्री संजय पाण्डेय पुत्र स्व.श्री किशोरी शरण पाण्डेय", not just "संजय पाण्डेय") — \
look for lines like "विक्रेता पक्ष", "क्रेता पक्ष", "Seller", "Buyer", or the parties named at the top of the deed. \
If there are multiple sellers or buyers, join their full names with "व" (or "and" for English text).

Output ONLY a single JSON object with exactly this shape, no markdown code fences, no commentary, no explanation \
before or after it:

{
  "plotNo": string | null,
  "block": string | null,
  "location": string | null,
  "sellerName": string | null,
  "buyerName": string | null,
  "statedArea": number | null,
  "statedAreaUnit": "sqft" | "sqm" | null,
  "ewLength": number | null,
  "nsLength": number | null,
  "unit": "ft" | "m" | null,
  "boundaries": {
    "north": string | null,
    "south": string | null,
    "east": string | null,
    "west": string | null
  }
}`;

export function buildExtractionUserPrompt(deedContent: string): string {
  return `Deed text:\n"""\n${deedContent}\n"""`;
}

/** Strips a ```json ... ``` fence if the model wrapped its output in one despite being told not to. */
function stripCodeFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

/** Parses and validates the model's raw text reply into a DeedPropertyDetailExtraction. */
export function parseExtractionResponse(raw: string): DeedPropertyDetailExtraction {
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFence(raw));
  } catch {
    throw new ExtractionParseError("AI extraction returned invalid JSON.");
  }
  const parsed = DeedPropertyDetailExtraction.safeParse(json);
  if (!parsed.success) {
    throw new ExtractionParseError(`AI extraction returned an unexpected shape: ${parsed.error.message}`);
  }
  return parsed.data;
}
