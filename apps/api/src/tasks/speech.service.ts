import { Injectable, Logger } from "@nestjs/common";

export type SpeechResult =
  | { ok: true; text: string }
  | { ok: false; reason: "no-key" | "disabled" | "unsupported" | "too-long" | "empty" | "error" };

const OPUS_RATES = [8000, 12000, 16000, 24000, 48000];

/** Input sample rate from an Ogg Opus file's "OpusHead" header (WhatsApp voice notes); 16000 if unknown. */
export function opusSampleRate(buf: Buffer): number {
  const i = buf.indexOf("OpusHead");
  if (i < 0 || buf.length < i + 16) return 16000;
  const rate = buf.readUInt32LE(i + 12);
  return OPUS_RATES.includes(rate) ? rate : 48000;
}

/** Google Speech "config" for a WhatsApp audio file, or null when the format isn't supported. */
export function speechConfig(mime: string, buf: Buffer): Record<string, unknown> | null {
  const base = { languageCode: "hi-IN", alternativeLanguageCodes: ["en-IN"], enableAutomaticPunctuation: true };
  const m = mime.toLowerCase();
  if (m.includes("ogg") || m.includes("opus")) return { ...base, encoding: "OGG_OPUS", sampleRateHertz: opusSampleRate(buf) };
  if (m.includes("mpeg") || m.includes("mp3")) return { ...base, encoding: "MP3", sampleRateHertz: 16000 };
  if (m.includes("amr")) return { ...base, encoding: "AMR", sampleRateHertz: 8000 };
  return null;
}

/** Google's error → why voice can't be used ("API band hai" vs other). */
export function speechErrorReason(status: number, body: any): SpeechResult & { ok: false } {
  const msg = String(body?.error?.message ?? "");
  const reasons = JSON.stringify(body?.error?.details ?? []);
  if (status === 403 || /SERVICE_DISABLED|has not been used|is disabled|API_KEY_SERVICE_BLOCKED|API key not valid|API_KEY_INVALID/.test(msg + reasons)) {
    return { ok: false, reason: "disabled" };
  }
  if (/too long|exceeds|duration/i.test(msg)) return { ok: false, reason: "too-long" };
  return { ok: false, reason: "error" };
}

/**
 * Owner's WhatsApp voice notes → text with Google Cloud Speech-to-Text
 * (hi-IN, en-IN alternative). Key: GOOGLE_SPEECH_API_KEY, else
 * GOOGLE_VISION_API_KEY. Logs status/reason only -- never the audio or text.
 */
@Injectable()
export class SpeechService {
  private readonly log = new Logger("Speech");

  async transcribe(buf: Buffer, mime: string): Promise<SpeechResult> {
    const key = process.env.GOOGLE_SPEECH_API_KEY || process.env.GOOGLE_VISION_API_KEY;
    if (!key) return { ok: false, reason: "no-key" };
    const config = speechConfig(mime, buf);
    if (!config) return { ok: false, reason: "unsupported" };
    try {
      const res = await fetch(`https://speech.googleapis.com/v1p1beta1/speech:recognize?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config, audio: { content: buf.toString("base64") } }),
      });
      const json: any = await res.json().catch(() => null);
      if (!res.ok) {
        const r = speechErrorReason(res.status, json);
        this.log.warn(`speech failed: HTTP ${res.status} reason=${r.reason}`);
        return r;
      }
      const text = (json?.results ?? [])
        .map((r: any) => r?.alternatives?.[0]?.transcript ?? "")
        .join(" ")
        .trim();
      return text ? { ok: true, text } : { ok: false, reason: "empty" };
    } catch (e: any) {
      this.log.warn(`speech failed: ${e?.name ?? "error"}`);
      return { ok: false, reason: "error" };
    }
  }
}
