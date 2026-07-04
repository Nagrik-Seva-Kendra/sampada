import { ArgumentsHost, Catch, HttpStatus } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import type { Response } from "express";

/**
 * Maps Zod validation errors to HTTP 400, delegating everything else to Nest's
 * default handling. Detects Zod by shape (not `instanceof`) so it works even
 * when the shared package and the API resolve separate copies of `zod`.
 */
@Catch()
export class ZodExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const err = exception as { name?: string; issues?: { path: (string | number)[]; message: string }[] };
    if (err?.name === "ZodError" && Array.isArray(err.issues)) {
      const res = host.switchToHttp().getResponse<Response>();
      res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: "Bad Request",
        message: err.issues.map(
          (i) => `${i.path.join(".") || "value"}: ${i.message}`,
        ),
      });
      return;
    }
    super.catch(exception, host);
  }
}
