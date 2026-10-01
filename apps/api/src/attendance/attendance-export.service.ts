import { Injectable } from "@nestjs/common";
import type { DayStatus } from "@sampada/shared";
import { type Cell, xlsx } from "../common/xlsx.js";
import { AttendanceService } from "./attendance.service.js";

const CODE: Record<DayStatus, string> = {
  present: "उ",
  late: "दे",
  halfDay: "½",
  field: "बा",
  absent: "अ",
  leave: "छु",
  halfLeave: "½छु",
  off: "-",
  holiday: "अव",
  future: "",
};

/** हाज़िरी sheet as Excel: one row per staff, one column per day, with totals. Same access as the month view. */
@Injectable()
export class AttendanceExportService {
  constructor(private readonly attendance: AttendanceService) {}

  async monthXlsx(month: string, userId?: string): Promise<Buffer> {
    const m = await this.attendance.month(month, userId);
    const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : "");
    const head: Cell[] = ["कर्मचारी", ...m.days.map((d) => Number(d.slice(8))), "उपस्थित", "देर", "आधा दिन", "बाहर", "छुट्टी", "अनुपस्थित"];
    const rows: Cell[][] = m.staff.map((s) => {
      const c = (st: DayStatus[]) => s.days.filter((d) => st.includes(d.status)).length;
      return [s.name, ...s.days.map((d) => CODE[d.status]), c(["present", "late"]), c(["late"]), c(["halfDay"]), c(["field"]), c(["leave", "halfLeave"]), c(["absent"])];
    });
    const detail: Cell[][] = [["कर्मचारी", "तारीख", "स्थिति", "आए", "गए", "देर (मिनट)", "बाहर का काम"]];
    for (const s of m.staff) for (const d of s.days) if (d.inAt || d.outAt || d.field.length) detail.push([s.name, d.day, d.status, time(d.inAt), time(d.outAt), d.lateMin, d.field.map((f) => f.reason ?? "").join("; ")]);
    return xlsx([
      { name: `हाज़िरी ${month}`, rows: [[`हाज़िरी शीट ${month}`], ["उ=उपस्थित, दे=देर, ½=आधा दिन, बा=बाहर का काम, छु=छुट्टी, अ=अनुपस्थित, अव=अवकाश, -=साप्ताहिक बंद"], head, ...rows] },
      { name: "विवरण", rows: detail },
    ]);
  }
}
