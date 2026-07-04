import ky from "ky";

/** Typed HTTP client. Proxied to the API via Vite in dev (see vite.config.ts). */
export const api = ky.create({
  prefixUrl: "/api/v1",
  retry: 1,
  // credentials: "include" — enable when auth/refresh cookies land.
});
