import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import express, { type Express } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { ZodExceptionFilter } from "./common/zod-exception.filter.js";

// Vercel entrypoint: the API runs as its own serverless project here (the web
// SPA is deployed separately on Vercel), so this skips main.ts's SPA static
// serving and just exposes the Nest app as a request handler. The Nest app is
// built once per warm lambda instance and reused across invocations.
let cachedServer: Express | undefined;

async function bootstrap(): Promise<Express> {
  const expressApp = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));

  app.use(helmet({ contentSecurityPolicy: false }));
  app.useGlobalFilters(new ZodExceptionFilter(app.getHttpAdapter()));
  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(","),
    credentials: true,
  });

  await app.init();
  return expressApp;
}

export default async function handler(
  req: import("express").Request,
  res: import("express").Response,
): Promise<void> {
  cachedServer ??= await bootstrap();
  cachedServer(req, res);
}
