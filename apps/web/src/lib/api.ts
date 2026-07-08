import ky, { HTTPError } from "ky";

/**
 * Typed HTTP client. Proxied to the API via Vite in dev (see vite.config.ts).
 * In production (web and api deployed as separate Vercel projects), set
 * VITE_API_URL to the api project's URL; the API's CORS_ORIGIN must allow it.
 */
export const api = ky.create({
  prefixUrl: `${import.meta.env.VITE_API_URL ?? ""}/api/v1`,
  retry: 1,
  // credentials: "include" — enable when auth/refresh cookies land.
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
