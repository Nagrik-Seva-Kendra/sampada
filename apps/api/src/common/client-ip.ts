import { isIP } from "node:net";

/** The parts of an HTTP request the client address is read from. */
export interface IpSource {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string | null };
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const clean = (v: string | undefined | null): string | null => {
  let s = (v ?? "").trim();
  if (s.startsWith("::ffff:") && isIP(s.slice(7)) === 4) s = s.slice(7);
  if (/^\[.*\]$/.test(s)) s = s.slice(1, -1);
  return isIP(s) ? s.toLowerCase() : null;
};

/**
 * The visitor's public address.
 * - CLIENT_IP_HEADER (e.g. "cf-connecting-ip") when a CDN in front sets one.
 * - Otherwise the X-Forwarded-For entry added by our own proxy: counted from
 *   the right, TRUST_PROXY_HOPS (default 1 = Coolify's Traefik). The left part
 *   is whatever the browser sent and is never trusted.
 * - TRUST_PROXY_HOPS=0: the socket address (no proxy).
 */
export function clientIp(req: IpSource): string | null {
  const header = (process.env.CLIENT_IP_HEADER ?? "").trim().toLowerCase();
  if (header) return clean(first(req.headers[header]));
  const hops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
  if (Number.isInteger(hops) && hops > 0) {
    const xff = (first(req.headers["x-forwarded-for"]) ?? "").split(",").map((p) => p.trim()).filter(Boolean);
    if (xff.length) return clean(xff[Math.max(0, xff.length - hops)]);
  }
  return clean(req.socket?.remoteAddress);
}

/** Private, loopback, link-local or shared (CGNAT) space: never an office's public address. */
export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  const s = ip.toLowerCase();
  return s === "::1" || s === "::" || s.startsWith("fe80:") || s.startsWith("fc") || s.startsWith("fd");
}

/** IPv6 → its first four groups (the /64 network); IPv4 unchanged. */
export function networkKey(ip: string): string | null {
  const v = isIP(ip);
  if (v === 4) return ip;
  if (v !== 6) return null;
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const h = head ? head.split(":") : [];
  const t = ip.includes("::") ? (tail ? tail.split(":") : []) : [];
  const groups = ip.includes("::") ? [...h, ...Array(8 - h.length - t.length).fill("0"), ...t] : h;
  if (groups.length !== 8) return null;
  return groups.slice(0, 4).map((g) => (parseInt(g, 16) || 0).toString(16)).join(":") + "::/64";
}

export function sameNetwork(a: string, b: string): boolean {
  const x = networkKey(a);
  return !!x && x === networkKey(b);
}
