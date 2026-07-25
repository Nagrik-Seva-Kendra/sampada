import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { StaffUser } from "./jwt-staff.guard.js";

export type StaffRequest = Request & { user: StaffUser };

/**
 * Extracts req.user the same way every controller's hand-rolled `StaffRequest`
 * alias does today (profile.controller.ts, sample-deeds.controller.ts,
 * guideline.controller.ts). Additive: existing @Req() call sites are untouched;
 * new controllers can use this instead of redeclaring the type.
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): StaffUser => {
  return ctx.switchToHttp().getRequest<StaffRequest>().user;
});
