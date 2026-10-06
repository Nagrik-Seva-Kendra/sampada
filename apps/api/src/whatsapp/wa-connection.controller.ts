import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtStaffGuard } from "../auth/jwt-staff.guard.js";
import { WaConnectionService, WEBHOOK_PATH } from "./wa-connection.service.js";

/** This server's webhook URL: WA_WEBHOOK_URL, else the host the request came to. */
export function webhookUrl(req: Pick<Request, "headers">): string | null {
  if (process.env.WA_WEBHOOK_URL) return process.env.WA_WEBHOOK_URL;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.split(",")[0]?.trim();
  const host = first(req.headers["x-forwarded-host"]) ?? first(req.headers.host);
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return null;
  return `https://${host}${WEBHOOK_PATH}`;
}

/** OWNER: WhatsApp connection check, a test message, register the number, re-subscribe the app to the WABA. */
@Controller("whatsapp/connection")
@UseGuards(JwtStaffGuard)
export class WaConnectionController {
  constructor(private readonly service: WaConnectionService) {}

  @Get()
  check() {
    return this.service.check();
  }

  @Post("test")
  test() {
    return this.service.testMessage();
  }

  @Post("register")
  register() {
    return this.service.register();
  }

  @Post("resubscribe")
  resubscribe(@Body() body: { override?: boolean } | undefined, @Req() req: Request) {
    return this.service.resubscribe(body?.override === true ? webhookUrl(req) : null);
  }
}
