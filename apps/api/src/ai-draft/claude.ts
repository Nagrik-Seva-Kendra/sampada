/**
 * One Messages API call over HTTP (the repo calls Claude with fetch, no SDK),
 * streamed so a long deed never hits a request timeout. Returns the text and
 * the token usage; never logs the prompt or the answer.
 */
export interface ClaudeResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}

export const AI_DRAFT_MODEL = () => process.env.AI_DRAFT_MODEL || "claude-opus-5-5";

export async function callClaude(opts: {
  system: string;
  user: string;
  maxTokens: number;
  effort?: "low" | "medium" | "high";
  model?: string;
  fetchImpl?: typeof fetch;
}): Promise<ClaudeResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("no-key");
  const res = await (opts.fetchImpl ?? fetch)("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: opts.model ?? AI_DRAFT_MODEL(),
      max_tokens: opts.maxTokens,
      stream: true,
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort ?? "high" },
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  if (!res.ok || !res.body) throw new Error(`http-${res.status}`);
  return readStream(res.body);
}

/** Parses the SSE stream: text deltas, input tokens (message_start) and output tokens (message_delta). */
export async function readStream(body: ReadableStream<Uint8Array>): Promise<ClaudeResult> {
  const out: ClaudeResult = { text: "", inputTokens: 0, outputTokens: 0, stopReason: null };
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      let ev: any;
      try {
        ev = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      if (ev.type === "message_start") {
        const u = ev.message?.usage ?? {};
        out.inputTokens = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      } else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") out.text += ev.delta.text ?? "";
      else if (ev.type === "message_delta") {
        out.outputTokens = ev.usage?.output_tokens ?? out.outputTokens;
        out.stopReason = ev.delta?.stop_reason ?? out.stopReason;
      } else if (ev.type === "error") throw new Error(`stream-${ev.error?.type ?? "error"}`);
    }
    if (done) break;
  }
  return out;
}
