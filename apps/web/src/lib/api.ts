import ky, { HTTPError } from "ky";
import { useAuthStore } from "../stores/authStore";

const apiBase = `${import.meta.env.VITE_API_URL ?? ""}/api/v1`;

/**
 * Silent access-token refresh. When a request comes back 401, we exchange the
 * stored refresh token for a new pair (rotation) and replay the request once.
 * Concurrent 401s share a single in-flight refresh so we never rotate twice.
 */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) return null;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await ky
          .post(`${apiBase}/auth/refresh`, { json: { refreshToken }, retry: 0 })
          .json<{ accessToken: string; refreshToken: string }>();
        useAuthStore.getState().setTokens(res.accessToken, res.refreshToken);
        return res.accessToken;
      } catch {
        useAuthStore.getState().logout();
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

/**
 * Typed HTTP client. Proxied to the API via Vite in dev (see vite.config.ts).
 * In production (web and api deployed as separate Vercel projects), set
 * VITE_API_URL to the api project's URL; the API's CORS_ORIGIN must allow it.
 */
export const api = ky.create({
  prefixUrl: apiBase,
  retry: 1,
  hooks: {
    afterResponse: [
      async (request, _options, response) => {
        if (response.status !== 401) return response;
        // Never try to refresh the auth endpoints themselves (avoids a loop).
        if (request.url.includes("/auth/refresh") || request.url.includes("/auth/login")) {
          return response;
        }
        const newToken = await refreshAccessToken();
        if (!newToken) return response;
        request.headers.set("Authorization", `Bearer ${newToken}`);
        return ky(request);
      },
    ],
  },
});

/** Pulls the server's actual `message` out of a failed request (Nest sends `{ message, error, statusCode }`; message can be a string or a list of validation errors). */
export async function apiErrorMessage(err: unknown, fallback: string): Promise<string> {
  if (err instanceof HTTPError) {
    try {
      const body = await err.response.json<{ message?: string | string[] }>();
      if (Array.isArray(body.message)) return body.message.join(" ");
      if (body.message) return body.message;
    } catch {
      // response wasn't JSON — fall through to the fallback.
    }
  }
  return fallback;
}
