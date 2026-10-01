/**
 * Collects the texts one WhatsApp number sends within a short window and
 * hands them over once, joined ("Jdjdhd" + "Dbhdhd" → one reply, not two).
 * The window starts with the first message of a burst. windowMs <= 0 →
 * every text is handled at once (tests, or WA_DEBOUNCE_MS=0).
 */
export interface DebouncedBatch {
  texts: string[];
  name: string;
}

export class Debouncer {
  private readonly pending = new Map<string, { batch: DebouncedBatch; timer: ReturnType<typeof setTimeout> | null; run: (b: DebouncedBatch) => Promise<void> }>();

  constructor(private readonly windowMs: () => number) {}

  /** Adds a text; `run` is called once per burst with all its texts. Resolves when this text has been handled. */
  push(key: string, text: string, name: string, run: (b: DebouncedBatch) => Promise<void>): Promise<void> {
    const ms = this.windowMs();
    if (ms <= 0) return run({ texts: [text], name });
    const cur = this.pending.get(key);
    if (cur) {
      cur.batch.texts.push(text);
      if (name) cur.batch.name = name;
      return Promise.resolve();
    }
    const entry = { batch: { texts: [text], name }, timer: null as ReturnType<typeof setTimeout> | null, run };
    this.pending.set(key, entry);
    return new Promise<void>((resolve) => {
      entry.timer = setTimeout(() => {
        this.pending.delete(key);
        entry.run(entry.batch).finally(resolve);
      }, ms);
    });
  }

  /** Handle this number's waiting texts now (e.g. a file arrived); no-op when none. */
  async flushNow(key: string): Promise<void> {
    const entry = this.pending.get(key);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    this.pending.delete(key);
    await entry.run(entry.batch);
  }

  get size(): number {
    return this.pending.size;
  }
}
