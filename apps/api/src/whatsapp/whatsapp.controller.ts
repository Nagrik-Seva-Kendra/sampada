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
import { formatPayloadSummary, recordWebhookPost, recordWebhookVerify, summarizePayload } from "./webhook-diagnostics.js";
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
    if (expected && mode === "subscribe" && token === expected) {
      this.log.log("webhook verification (GET) ok");
      recordWebhookVerify(true);
      return res.status(200).send(challenge);
    }
    recordWebhookVerify(false);
    this.log.warn(`webhook verification (GET) rejected mode=${mode ?? "-"} verifyTokenConfigured=${!!expected}`);
    return res.sendStatus(403);
  }

  @Post()
  @HttpCode(200)
  receive(@Req() req: RawBodyRequest<Request>, @Headers("x-hub-signature-256") signature: string) {
    // One line per delivery (counts only -- no message text, numbers or tokens),
    // so "Meta says it sent it but we saw nothing" is always answerable from logs.
    const parsed = summarizePayload(req.body);
    const summary = formatPayloadSummary(parsed);
    const sig = this.wa.verifySignature(req.rawBody, signature);
    recordWebhookPost(sig.ok, sig.ok ? null : sig.reason, parsed);
    if (!sig.ok) {
      this.log.warn(`webhook POST signature=invalid reason=${sig.reason} ${summary}`);
      throw new ForbiddenException("Invalid signature");
    }
    this.log.log(`webhook POST signature=valid ${summary}`);
    // Reply 200 immediately (Meta retries slow webhooks); process in background.
    setImmediate(() => {
      this.wa.handlePayload(req.body).catch((e) => this.log.error(`webhook failed: ${e?.message}`));
    });
    return "OK";
  }
}
