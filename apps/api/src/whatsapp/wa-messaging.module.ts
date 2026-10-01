import { Module } from "@nestjs/common";
import { WaOutboxService } from "./wa-outbox.service.js";

/** WhatsApp sending (WaOutboxService) for modules outside the bot (attendance, tasks). */
@Module({
  providers: [WaOutboxService],
  exports: [WaOutboxService],
})
export class WaMessagingModule {}
