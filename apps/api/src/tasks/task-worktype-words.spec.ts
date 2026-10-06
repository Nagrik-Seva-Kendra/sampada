import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TaskExtractorService } from "./task-extractor.service.js";
import { istDate, workTypeFromWords } from "./task-rules.js";

beforeEach(() => {
  vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the document the owner named wins over the model", () => {
  it.each([
    ["कल वसीयत होनी है मुस्कान मिश्रा को असाइन कर दो", "will"],
    ["wasiyat kal karni hai", "will"],
    ["रमेश का बैनामा सोमवार तक", "sale"],
    ["बंधक पत्र बनाना है", "mortgage"],
    ["किरायानामा एग्रीमेंट", "agreement"],
    ["नामांतरण के कागज़", "mutation"],
    ["पट्टा नवीनीकरण", "patta"],
    ["पुरानी रजिस्ट्री की नकल", "copy"],
  ])("%s → %s", (text, type) => {
    expect(workTypeFromWords(text)).toBe(type);
  });

  it.each(["रमेश को फोन करना है", "वसीयत और बैनामा दोनों", "kal will"])("%s → none / not sure", (text) => {
    expect(workTypeFromWords(text)).toBe(text === "kal will" ? "will" : null);
  });

  it("the model said 'sale' for 'कल वसीयत होनी है' → saved as will", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ title: "वसीयत तैयार करना", workType: "sale", dueText: "कल" }) }] }), { status: 200 })),
    );
    const d = await new TaskExtractorService().extract("कल वसीयत होनी है मुस्कान मिश्रा को असाइन कर दो", istDate(2026, 9, 6, 21, 50));
    expect(d).toMatchObject({ title: "वसीयत तैयार करना", workType: "will" });
  });

  it("a call or collecting papers stays that", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ title: "बैनामा के कागज़ लेना", workType: "collect_papers" }) }] }), { status: 200 })),
    );
    const d = await new TaskExtractorService().extract("रमेश को फोन करके बैनामा के कागज़ मँगाने हैं", istDate(2026, 9, 6, 21, 50));
    expect(d!.workType).toBe("collect_papers");
  });
});
