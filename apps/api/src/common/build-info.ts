import { hostname } from "node:os";

const STARTED_AT = new Date();

/**
 * Which API copy is answering: the build's commit (Coolify SOURCE_COMMIT, when
 * "Include Source Commit in Build" is on), the container's host name and when
 * this process started. Two copies running at once show two host names.
 */
export function buildInfo(): { commit: string; host: string; startedAt: string } {
  const commit = process.env.SOURCE_COMMIT || process.env.GIT_COMMIT || process.env.COMMIT_SHA || "unknown";
  return { commit: commit.slice(0, 7), host: hostname().slice(0, 40), startedAt: STARTED_AT.toISOString() };
}

/** One line for the owner (IST start time). */
export function buildInfoText(): string {
  const b = buildInfo();
  const at = new Date(b.startedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return `🔧 API version: commit ${b.commit} · container ${b.host} · चालू: ${at}`;
}
