import { Body, Controller, Get, Param, Patch, Post, Query, Res, StreamableFile, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { TaskCreateInput, TaskStatus, TaskUpdateInput } from "@sampada/shared";
import { JwtStaffGuard } from "../auth/jwt-staff.guard.js";
import { TasksService } from "./tasks.service.js";

/** "मेरे काम": OWNER/ADMIN see and assign all; other staff only their own. */
@Controller("tasks")
@UseGuards(JwtStaffGuard)
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get()
  list(@Query("status") status?: string, @Query("assigneeId") assigneeId?: string) {
    const s = TaskStatus.safeParse(status);
    return this.service.list({ status: s.success ? s.data : undefined, assigneeId: assigneeId || undefined });
  }

  @Post()
  create(@Body() body: unknown) {
    return this.service.createWeb(TaskCreateInput.parse(body));
  }

  /** The file the owner sent with the task (?view=1 previews inline). */
  @Get(":id/document")
  async document(@Param("id") id: string, @Query("view") view: string | undefined, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const f = await this.service.documentWeb(id);
    res.set({
      "Content-Type": f.mimeType,
      "Content-Disposition": (view ? "inline" : "attachment") + "; filename=" + JSON.stringify(f.fileName),
      "Cache-Control": "private, no-store",
    });
    return new StreamableFile(f.data);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: unknown) {
    return this.service.updateWeb(id, TaskUpdateInput.parse(body));
  }
}
