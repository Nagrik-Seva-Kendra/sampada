import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { ZodExceptionFilter } from "./common/zod-exception.filter.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  app.useGlobalFilters(new ZodExceptionFilter(app.getHttpAdapter()));
  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(","),
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
