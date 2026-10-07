import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { fullPhone } from "./chat-words.js";
import { answerToCustomerText, learnedReplyText, matchLearned, type QuestionCommand, questionKeys } from "./customer-questions.js";
import { WaOutboxService } from "./wa-outbox.service.js";
import { redactForModel } from "./wa-smart.js";

/** At most this many questions from one number in 10 minutes reach the owner. */
const ALERTS_PER_10_MIN = 3;

/**
 * Customer questions the bot cannot answer: kept (numbers masked) and sent to
 * the owner with a number; "जवाब 12 ..." from the owner goes to that customer;
 * "याद रखो 12" makes the bot give that answer itself next time. Logs carry
 * question numbers only -- never the text or the customer's number.
 */
@Injectable()
export class CustomerQuestionsService {
  private readonly log = new Logger("CustomerQuestions");
  private readonly orgId = process.env.WA_DEFAULT_ORG_ID ?? "";

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: WaOutboxService,
  ) {}

  /** A remembered answer for this question, or null. */
  async learnedAnswer(text: string): Promise<string | null> {
    if (!this.orgId) return null;
    const rows = await this.prisma.waLearnedAnswer.findMany({ where: { organizationId: this.orgId, enabled: true }, take: 500 });
    const hit = matchLearned(text, rows);
    if (!hit) return null;
    await this.prisma.waLearnedAnswer.update({ where: { id: hit.id }, data: { uses: { increment: 1 } } }).catch(() => undefined);
    this.log.log(`learned answer used (question #${hit.questionNumber})`);
    return learnedReplyText(hit.answer);
  }

  /** Keeps the question and tells the owner; returns its number (null without an organization). */
  async record(phone: string, text: string, now = new Date()): Promise<number | null> {
    if (!this.orgId) {
      await this.outbox.alertOwners(`❓ WhatsApp नंबर ${fullPhone(phone)} का सवाल:\n"${redactForModel(text).slice(0, 300)}"`).catch(() => undefined);
      return null;
    }
    const clean = redactForModel(text).slice(0, 500);
    const recent = await this.prisma.waQuestion.count({ where: { organizationId: this.orgId, phone, createdAt: { gte: new Date(now.getTime() - 10 * 60_000) } } });
    // Several questions in one breath stay one question.
    if (recent >= ALERTS_PER_10_MIN) return null;
    let row: { number: number } | null = null;
    for (let i = 0; i < 3 && !row; i++) {
      const last = await this.prisma.waQuestion.findFirst({ where: { organizationId: this.orgId }, orderBy: { number: "desc" }, select: { number: true } });
      row = await this.prisma.waQuestion
        .create({ data: { organizationId: this.orgId, number: (last?.number ?? 0) + 1, phone, text: clean }, select: { number: true } })
        .catch(() => null); // two at once: the unique number makes one retry
    }
    if (!row) return null;
    await this.outbox
      .alertOwners(
        `❓ सवाल #${row.number} — WhatsApp नंबर ${fullPhone(phone)} (बॉट जवाब नहीं दे पाया):\n"${clean.slice(0, 300)}"\n\n` +
          `ग्राहक को जवाब भेजने के लिए लिखें:\nजवाब ${row.number} <आपका जवाब>`,
      )
      .catch(() => undefined);
    this.log.log(`question #${row.number} recorded`);
    return row.number;
  }

  /** The owner's command; replies for the owner. */
  async command(cmd: QuestionCommand, now = new Date()): Promise<string[]> {
    if (!this.orgId) return ["संगठन सेट नहीं है (WA_DEFAULT_ORG_ID)।"];
    if (cmd.kind === "list") return [await this.openList()];
    const q = await this.prisma.waQuestion.findUnique({ where: { organizationId_number: { organizationId: this.orgId, number: cmd.n } } });
    if (!q) return [`सवाल #${cmd.n} नहीं मिला। खुले सवाल देखने के लिए "सवाल" लिखें।`];

    if (cmd.kind === "answer") {
      const inWindow = await this.outbox.inWindow(q.phone, now);
      const sent = inWindow && process.env.WA_ACCESS_TOKEN ? (await this.outbox.post(q.phone, { type: "text", text: { body: answerToCustomerText(cmd.answer) } })).ok : false;
      await this.prisma.waQuestion.update({ where: { id: q.id }, data: { status: "ANSWERED", answer: cmd.answer.slice(0, 2000), answeredAt: now } });
      this.log.log(`question #${q.number} answered sent=${sent}`);
      const learn = `\n\nयही सवाल फिर आए तो बॉट खुद यही जवाब दे? लिखें: याद रखो ${q.number}`;
      if (sent) return [`✅ सवाल #${q.number} का जवाब ग्राहक को भेज दिया।${learn}`];
      return [`⚠️ ग्राहक का 24 घंटे का WhatsApp समय निकल गया है, इसलिए जवाब नहीं जा सका (जवाब सेव है)। कृपया फ़ोन करें: ${fullPhone(q.phone)}${learn}`];
    }
    if (cmd.kind === "learn") {
      if (!q.answer) return [`सवाल #${q.number} का अभी कोई जवाब नहीं है। पहले लिखें: जवाब ${q.number} <आपका जवाब>`];
      const keys = questionKeys(q.text);
      if (keys.length < 2) return [`सवाल #${q.number} बहुत छोटा है, इसे याद नहीं रखा जा सकता।`];
      await this.prisma.waLearnedAnswer.updateMany({ where: { organizationId: this.orgId, questionNumber: q.number }, data: { enabled: false } });
      await this.prisma.waLearnedAnswer.create({ data: { organizationId: this.orgId, questionNumber: q.number, question: q.text, answer: q.answer, keys } });
      this.log.log(`question #${q.number} learned`);
      return [`🧠 याद रख लिया। ऐसा सवाल फिर आएगा तो बॉट खुद यह जवाब देगा। हटाना हो तो लिखें: भूल जाओ ${q.number}`];
    }
    const r = await this.prisma.waLearnedAnswer.updateMany({ where: { organizationId: this.orgId, questionNumber: q.number, enabled: true }, data: { enabled: false } });
    return [r.count ? `ठीक है, सवाल #${q.number} का जवाब अब बॉट नहीं देगा।` : `सवाल #${q.number} का कोई याद रखा जवाब नहीं था।`];
  }

  /** Open questions, newest first (for "सवाल" and the weekly report). */
  async openList(limit = 10): Promise<string> {
    const rows = await this.prisma.waQuestion.findMany({ where: { organizationId: this.orgId, status: "OPEN" }, orderBy: { number: "desc" }, take: limit });
    if (!rows.length) return "✅ कोई खुला सवाल नहीं है।";
    return [
      `❓ खुले सवाल (${rows.length}${rows.length === limit ? "+" : ""}):`,
      ...rows.map((r) => `#${r.number} ${fullPhone(r.phone)}: ${r.text.slice(0, 120)}`),
      "",
      "जवाब भेजने के लिए: जवाब <नंबर> <आपका जवाब>",
    ].join("\n");
  }
}
