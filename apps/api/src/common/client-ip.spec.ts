import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp, isPrivateIp, networkKey, sameNetwork } from "./client-ip.js";

afterEach(() => vi.unstubAllEnvs());
const req = (xff?: string, remote = "10.0.1.5", extra: Record<string, string> = {}) => ({ headers: { ...(xff ? { "x-forwarded-for": xff } : {}), ...extra }, socket: { remoteAddress: remote } });

describe("clientIp", () => {
  it("takes the address our proxy added (rightmost), never the part the browser can fake", () => {
    expect(clientIp(req("49.36.10.20"))).toBe("49.36.10.20");
    expect(clientIp(req("1.2.3.4, 49.36.10.20"))).toBe("49.36.10.20"); // "1.2.3.4" was sent by the browser
    vi.stubEnv("TRUST_PROXY_HOPS", "2");
    expect(clientIp(req("1.2.3.4, 49.36.10.20, 172.16.0.2"))).toBe("49.36.10.20");
    vi.stubEnv("TRUST_PROXY_HOPS", "0");
    expect(clientIp(req("49.36.10.20", "::ffff:203.0.113.9"))).toBe("203.0.113.9");
  });

  it("CLIENT_IP_HEADER (CDN) wins; junk is null", () => {
    vi.stubEnv("CLIENT_IP_HEADER", "CF-Connecting-IP");
    expect(clientIp(req("1.1.1.1", "10.0.0.1", { "cf-connecting-ip": "2401:4900:1c2a:5d10:a1b2:c3d4:e5f6:1234" }))).toBe("2401:4900:1c2a:5d10:a1b2:c3d4:e5f6:1234");
    vi.unstubAllEnvs();
    expect(clientIp(req("not-an-ip"))).toBeNull();
  });

  it("private ranges; IPv6 matched by /64, IPv4 exactly", () => {
    for (const ip of ["10.1.2.3", "192.168.1.10", "172.20.0.1", "127.0.0.1", "100.70.1.1", "::1", "fd00::1", "fe80::1"]) expect([ip, isPrivateIp(ip)]).toEqual([ip, true]);
    for (const ip of ["49.36.10.20", "2401:4900:1c2a:5d10::1"]) expect([ip, isPrivateIp(ip)]).toEqual([ip, false]);
    expect(networkKey("2401:4900:1c2a:5d10:a1b2:c3d4:e5f6:1234")).toBe("2401:4900:1c2a:5d10::/64");
    expect(sameNetwork("2401:4900:1c2a:5d10::1", "2401:4900:1c2a:5d10:a1b2:c3d4:e5f6:1234")).toBe(true);
    expect(sameNetwork("2401:4900:1c2a:5d11::1", "2401:4900:1c2a:5d10::1")).toBe(false);
    expect(sameNetwork("49.36.10.20", "49.36.10.21")).toBe(false);
    expect(sameNetwork("49.36.10.20", "49.36.10.20")).toBe(true);
  });
});
