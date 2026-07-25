import { Module } from "@nestjs/common";
import { OwnershipTransfersController } from "./ownership-transfers.controller.js";
import { OwnershipTransferService } from "./ownership-transfer.service.js";

@Module({
  controllers: [OwnershipTransfersController],
  providers: [OwnershipTransferService],
})
export class OwnershipTransfersModule {}
