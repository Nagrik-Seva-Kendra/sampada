import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
  type RawBodyRequest,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { WhatsappService } from "./whatsapp.service.js";

/**
 * Public (unguarded) — Meta calls this without our JWT.
 * Every POST is authenticated by the X-Hub-Signature-256 HMAC instead.
 * URL: https://app.nsk.mpe-registry.com/api/v1/whatsapp/webhook
 */
@Controller("whatsapp/webhook")
export class WhatsappController {
  private readonly log = new Logger(WhatsappController.name);

  constructor(private readonly wa: WhatsappService) {}

  @Get()
  verify(
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") token: string,
    @Query("hub.challenge") challenge: string,
    @Res() res: Response,
  ) {
    const expected = process.env.WA_VERIFY_TOKEN;
    if (expected && mode === "subscribe" && token === expected) return res.status(200).send(challenge);
    return res.sendStatus(403);
  }

  @Post()
  @HttpCode(200)
  receive(@Req() req: RawBodyRequest<Request>, @Headers("x-hub-signature-256") signature: string) {
    if (!this.wa.isValidSignature(req.rawBody, signature)) throw new ForbiddenException("Invalid signature");
    // Reply 200 immediately (Meta retries slow webhooks); process in background.
    setImmediate(() => {
      this.wa.handlePayload(req.body).catch((e) => this.log.error(`webhook failed: ${e?.message}`));
    });
    return "OK";
  }
}
