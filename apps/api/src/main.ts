import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { AppModule } from "./app.module.js";
import { ZodExceptionFilter } from "./common/zod-exception.filter.js";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // CSP off: the built SPA loads its own bundled JS/CSS from this same origin.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.useGlobalFilters(new ZodExceptionFilter(app.getHttpAdapter()));
  app.setGlobalPrefix("api/v1");
  // Comma-separated allowlist. Surrounding spaces and trailing slashes are
  // stripped because a browser's Origin header carries neither, so an entry
  // like " https://app.example.com/" would never match.
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
      .split(",")
      .map((o) => o.trim().replace(/\/+$/, ""))
      .filter(Boolean),
    credentials: true,
  });

  // Production: serve the built React SPA from the same origin as the API, so
  // the app's relative "/api/v1" calls work with no CORS and a single URL.
  // WEB_DIST defaults to a "public" folder next to the running server. Always
  // resolved to an absolute path — res.sendFile() rejects relative ones, and
  // WEB_DIST is set as a repo-root-relative value on hosts like Render.
  const webDist = resolve(process.env.WEB_DIST ?? "public");
  const hasSpa = existsSync(join(webDist, "index.html"));
  if (hasSpa) {
    app.useStaticAssets(webDist);
    // SPA client-side routing fallback: a GET for a non-API, extension-less
    // path (e.g. /all-deed-details) returns index.html. Registered as global
    // middleware so it runs before Nest's router (and its terminal 404); real
    // files (they contain a ".") and /api/* fall through to static/Nest.
    const indexHtml = join(webDist, "index.html");
    app.use((req: { method: string; path: string }, res: { sendFile: (p: string) => void }, next: () => void) => {
      if (req.method === "GET" && !req.path.startsWith("/api/") && !req.path.includes(".")) {
        res.sendFile(indexHtml);
      } else {
        next();
      }
    });
  }

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);

  // eslint-disable-next-line no-console
  console.log(`API listening on port ${port} (SPA ${hasSpa ? "served" : "not bundled"})`);
}

void bootstrap();
