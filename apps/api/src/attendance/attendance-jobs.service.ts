import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { WA_TEMPLATES } from "@sampada/shared";
import { PrismaService } from "../prisma/prisma.service.js";
import { WaOutboxService } from "../whatsapp/wa-outbox.service.js";
import { closedDay, hhmmToMin, istDay, istMinutes } from "./attendance-rules.js";
import { AttendanceService } from "./attendance.service.js";
import { SalaryService } from "./salary.service.js";

/** Owner's staff list (name → WhatsApp), applied once to the Team page mobile field (10 digits). */
export const INITIAL_STAFF_PHONES: { name: string; phone: string }[] = [
  { name: "Rahul Baghel", phone: "918319127664" },
  { name: "Amit Mathur", phone: "918770167486" },
  { name: "Muskan Mishra", phone: "917974876905" },
  { name: "Anmol Kandoi", phone: "919039535672" },
  { name: "Rohit Sharma", phone: "918109275681" },
];
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Which of the owner's names match which members (exact full name, case-insensitive); unmatched are reported. */
export function matchStaffNames(members: { userId: string; name: string }[], list = INITIAL_STAFF_PHONES) {
  const matched: { userId: string; name: string; mobile: string }[] = [];
  const missing: string[] = [];
  for (const p of list) {
    const hits = members.filter((m) => norm(m.name) === norm(p.name));
    if (hits.length === 1) matched.push({ userId: hits[0]!.userId, name: p.name, mobile: p.phone.slice(-10) });
    else missing.push(p.name);
  }
  return { matched, missing };
}

export const STAFF_INTRO =
  "नमस्ते {name}, नागरिक सेवा केंद्र से: अब हाज़िरी आपके अपने लॉगिन में \"Attendance / हाज़िरी\" पेज पर लगेगी।\n" +
  "• ऑफिस पहुँचकर \"हाज़िरी लगाएँ\" और जाते समय \"जा रहा हूँ\" दबाएँ।\n" +
  "• लोकेशन सिर्फ़ बटन दबाने के समय एक बार ली जाती है — कोई ट्रैकिंग नहीं।\n" +
  "• बाहर का काम हो तो \"बाहर का काम\" में कारण लिखें (या यहाँ \"बाहर का काम: कारण\" लिखकर लोकेशन भेजें)।\n" +
  "• छुट्टी: पेज पर अर्ज़ी दें, या यहाँ लिखें — जैसे \"छुट्टी 12/10 से 13/10 बीमारी: कारण\"।";

/**
 * Once a minute: the owner's morning attendance report (start + 30 min) and
 * the evening "OUT नहीं किया" list (end + 60 min) on working days; once: staff
 * phones from the owner's list and an intro message to each staff member;
 * on the 1st of a month the previous month's salary sheet (DRAFT).
 */
@Injectable()
export class AttendanceJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger("AttendanceJobs");
  private readonly orgId = process.env.WA_DEFAULT_ORG_ID ?? "";
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly salary: SalaryService,
    private readonly outbox: WaOutboxService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test" || !this.orgId) return;
    this.timer = setInterval(() => this.tick().catch((e) => this.log.error(`tick failed: ${e?.name ?? "error"}`)), 60_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** Runs `fn` once per key (WaJobRun). */
  private async once(name: string, fn: () => Promise<void>): Promise<boolean> {
    const done = await this.prisma.waJobRun.findUnique({ where: { name } });
    if (done) return false;
    await this.prisma.waJobRun.create({ data: { name, lastRunAt: new Date() } });
    await fn();
    return true;
  }

  async tick(now = new Date()): Promise<void> {
    await this.staffPhones();
    await this.intro();
    await this.reports(now);
    await this.monthEnd(now);
  }

  async staffPhones(): Promise<void> {
    await this.once("staff-phones-2026-10", async () => {
      const members = await this.attendance.staff(this.orgId);
      const { matched, missing } = matchStaffNames(members);
      for (const m of matched) await this.prisma.user.update({ where: { id: m.userId }, data: { mobile: m.mobile } });
      this.log.log(`staff phones set: ${matched.length}, not found: ${missing.length}`);
      if (missing.length) await this.toOwner(`⚠️ Team में ये नाम नहीं मिले, इनका मोबाइल Team पेज पर खुद भरें: ${missing.join(", ")}`);
    });
  }

  async intro(): Promise<void> {
    const settings = await this.attendance.settings(this.orgId);
    if (settings.officeLat == null) return; // only once the office location is set
    for (const s of await this.attendance.staff(this.orgId)) {
      if (!s.phone) continue;
      await this.once(`attendance-intro:${s.userId}`, async () => {
        await this.outbox.deliverDirect(s.phone!, STAFF_INTRO.replace("{name}", s.firstName), {
          name: WA_TEMPLATES.staffNotice.name,
          language: WA_TEMPLATES.staffNotice.language,
          params: [s.firstName, "अब हाज़िरी आपके लॉगिन के हाज़िरी पेज पर लगेगी, लोकेशन सिर्फ़ बटन दबाने के समय ली जाती है"],
        });
      });
    }
  }

  async reports(now: Date): Promise<void> {
    const settings = await this.attendance.settings(this.orgId);
    if (!settings.reportsEnabled) return;
    const day = istDay(now);
    const holidays = (await this.attendance.holidays(this.orgId)).map((h) => h.date);
    if (closedDay(day, settings, holidays)) return;
    const mins = istMinutes(now);
    // Each report only within 2 hours of its time (a restart later in the day does not send a stale one).
    const morning = hhmmToMin(settings.startTime) + 30;
    if (mins >= morning && mins < morning + 120) {
      await this.once(`att-morning:${day}`, async () => this.toOwner(await this.attendance.morningReport(this.orgId, now)));
    }
    const evening = hhmmToMin(settings.endTime) + 60;
    if (mins >= evening && mins < evening + 120) {
      await this.once(`att-evening:${day}`, async () => {
        const text = await this.attendance.eveningReport(this.orgId, now);
        if (text) await this.toOwner(text);
      });
    }
  }

  /** Text inside the 24h window; outside it the staff_notice template with the report on one line. */
  private async toOwner(text: string): Promise<void> {
    for (const o of this.attendance.ownerNumbers()) {
      await this.outbox.deliverDirect(o, text, {
        name: WA_TEMPLATES.staffNotice.name,
        language: WA_TEMPLATES.staffNotice.language,
        params: ["मालिक जी", text.replace(/\s*\n\s*/g, " · ").slice(0, 900)],
      });
    }
  }

  async monthEnd(now: Date): Promise<void> {
    const day = istDay(now);
    if (day.slice(8) !== "01") return;
    const d = new Date(Date.parse(`${day}T00:00:00Z`) - 864e5).toISOString().slice(0, 7);
    await this.once(`salary-sheet:${d}`, async () => {
      await this.salary.sheetFor(this.orgId, d, now);
      this.log.log(`salary sheet ${d} drafted`);
    });
  }
}
