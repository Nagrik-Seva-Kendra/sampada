import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  formatParty,
  formatPartyBlock,
  formatPropertyBlock,
  missingSampadaFields,
  type PartyField,
  splitNameRelation,
  type WaRequestDetail,
  type WaRevealResult,
  type WaWorkStatus,
} from "@sampada/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage } from "../../lib/api";
import { CreateDeedMenu } from "../deeds/CreateDeedMenu";
import { deedPdfBase64 } from "../deeds/deedPdf";
import { useCreateSampleDeed } from "../deeds/useSampleDeeds";
import { DeleteRequestDialog, setWaToast } from "./DeleteRequestDialog";
import "./waRequests.css";
import {
  useDeleteWaRequest,
  useDraftForCustomer,
  useResendWaNotification,
  useSendWaDraft,
  useRevealWaRequest,
  useUpdateWaRequest,
  useWaAssignees,
  useWaDocumentOpener,
  useWaIdPhotoOpener,
  useWaRequest,
} from "./useWhatsappRequests";
import type { StringKey } from "../../i18n/strings";
import { DEED_TYPE_KEY, INTAKE_STATUS_KEY, useWaT, type WaT, WORK_STATUS_KEY } from "./waI18n";
import { formatAmount, formatDate, WORK_STATUS_PILL, WORK_STATUSES } from "./waLabels";

const PROPERTY_TYPE_KEY: Record<string, StringKey> = {
  agricultural: "waPropAgricultural",
  residential_plot: "waPropResidentialPlot",
  house: "waPropHouse",
  flat: "waPropFlat",
  commercial: "waPropCommercial",
};
const PARTY_FIELD_KEY: Record<PartyField, StringKey> = {
  name: "waFieldName",
  guardian: "waFieldGuardian",
  motherName: "waFieldMotherName",
  aadhaar: "waFieldAadhaar",
  mobile: "waFieldMobile",
  email: "waFieldEmail",
  address: "waFieldAddress",
};
const PARTY_KEY: Record<string, StringKey> = {
  buyer: "waRoleBuyer",
  mortgagor: "waRoleMortgagor",
  witness1: "waRoleWitness1",
  witness2: "waRoleWitness2",
};
/** detail.mortgage.people is always mortgagor, first witness, second witness. */
const MORTGAGE_ROLE_KEYS: StringKey[] = ["waRoleMortgagor", "waRoleWitness1", "waRoleWitness2"];
const ID_KIND_KEY: Record<string, StringKey> = {
  aadhaarFront: "waIdKindAadhaarFront",
  aadhaarBack: "waIdKindAadhaarBack",
  pan: "waIdKindPan",
  passportPhoto: "waIdKindPassportPhoto",
};
const ID_WARNING_KEY: Record<string, StringKey> = {
  aadhaarPanName: "waIdWarnAadhaarPanName",
  panFather: "waIdWarnPanFather",
  unreadable: "waIdWarnUnreadable",
};
const DOC_KIND_KEY: Record<string, StringKey> = {
  sanction: "waDocSanction",
  registry: "waDocRegistry",
  transfer: "waDocTransfer",
  first: "waDocFirst",
  oldRegistry: "waDocOldRegistry",
};
/** Gender as stored from the Aadhaar card (Hindi data) → the UI's language. */
// i18n-exempt: keys are the stored data values, not UI text.
const GENDER_KEY: Record<string, StringKey> = { पुरुष: "waGenderMale", महिला: "waGenderFemale", अन्य: "waGenderOther" };
const genderText = (g: string | null | undefined, t: WaT) => (g ? (GENDER_KEY[g] ? t(GENDER_KEY[g]!) : g) : null);
const REASON_KEY: Record<string, StringKey> = {
  notConfigured: "waReasonNotConfigured",
  windowClosedTemplate: "waReasonWindowClosedTemplate",
  windowClosed: "waReasonWindowClosed",
  templateNotApproved: "waReasonTemplateNotApproved",
  cannotReceive: "waReasonCannotReceive",
  pdfMissing: "waReasonPdfMissing",
  pdfUpload: "waReasonPdfUpload",
  noticeSent: "waReasonNoticeSent",
};
/** Why a message is pending, in the UI's language (falls back to the stored text). */
function reasonText(n: { reason: string | null; reasonCode?: string | null; reasonVars?: { via?: string; code?: string } }, t: WaT): string {
  if (n.reasonCode === "sendFailed") {
    const code = n.reasonVars?.code ? t("waReasonCode", { code: n.reasonVars.code }) : "";
    return t("waReasonSendFailed", { via: n.reasonVars?.via ?? "", code });
  }
  return n.reasonCode && REASON_KEY[n.reasonCode] ? t(REASON_KEY[n.reasonCode]!) : (n.reason ?? "");
}
const docLabel = (d: WaRequestDetail["documents"][number], t: WaT) =>
  d.kind === "extra" ? t("waDocExtra", { n: d.n ?? d.index }) : d.kind && DOC_KIND_KEY[d.kind] ? t(DOC_KIND_KEY[d.kind]!) : d.label;

function Card({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="dr-form">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 16, fontWeight: 800 }}>{title}</h3>
        {actions}
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 190px) 1fr", gap: 10, padding: "6px 0" }}>
      <div className="doc-sub" style={{ fontSize: 13, marginTop: 0 }}>
        {label}
      </div>
      <div style={{ fontWeight: 600, wordBreak: "break-word" }}>{value ?? "—"}</div>
    </div>
  );
}

const orDash = (v: string | null | undefined) => (v && v.trim() ? v : "—");
/**
 * Party + property text in the office's drafting style
 * (docs/nsk-deed-drafting-pattern.md), ready to paste into the deed. Full
 * Aadhaar/PAN only after the owner/admin reveal; blanks ("____") where the
 * office fills in (boundaries, sides, seller Aadhaar) -- nothing is invented.
 */
function officeDraftText(r: WaRequestDetail, revealed: WaRevealResult | null): string | null {
  const reg = r.registry;
  // i18n-exempt: deed text in the office's Hindi drafting style (docs/nsk-deed-drafting-pattern.md).
  const property = reg?.property ? formatPropertyBlock(reg.property, r.deedType === "mortgage" ? "बंधक सम्पत्ति का विवरण -" : undefined) : null;
  if (r.deedType === "sale") {
    const sellers = (reg?.currentOwners ?? []).map((o) => {
      const split = o.relation ? splitNameRelation(`${o.name} ${o.relation}`) : null;
      return formatParty(split ?? { name: o.name, relation: null, guardian: null });
    });
    const buyer = formatParty({
      name: r.buyer.name,
      relation: r.buyer.relation,
      guardian: r.buyer.fatherName,
      aadhaar: revealed?.aadhaar ?? r.buyer.aadhaarMasked,
      pan: revealed?.pan ?? null,
    });
    // i18n-exempt: deed text (office drafting style)
    return [formatPartyBlock("विक्रेता पक्ष", sellers), formatPartyBlock("क्रेता पक्ष", [buyer]), property]
      .filter(Boolean)
      .join("\n\n");
  }
  if (r.deedType === "mortgage" && r.mortgage) {
    const [mortgagor, ...witnesses] = r.mortgage.people.map((x, i) =>
      formatParty({ name: x.name, relation: x.relation, guardian: x.fatherName, aadhaar: revealed?.people[i]?.aadhaar ?? x.aadhaarMasked }),
    );
    // i18n-exempt: deed text (office drafting style)
  return [formatPartyBlock("बंधककर्ता", mortgagor ? [mortgagor] : []), formatPartyBlock("गवाह", witnesses), property]
      .filter(Boolean)
      .join("\n\n");
  }
  return null;
}

/**
 * SAMPADA 2.0 needs name, father/husband, mother, Aadhaar, mobile, email and
 * address for every party's ID. Shows what this party is still missing.
 */
/** OWNER/ADMIN: red "अनुरोध हटाएँ" with a type-the-number dialog; back to the list afterwards. */
function DeleteRequestButton({ r }: { r: WaRequestDetail }) {
  const { t } = useWaT();
  const del = useDeleteWaRequest(r.id);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onConfirm() {
    setError(null);
    try {
      const out = await del.mutateAsync(r.ref);
      setWaToast(t("waDeletedOne", { ref: out.ref }) + (out.deedTemplateId ? t("waDeletedDeedKept") : ""));
      navigate({ to: "/whatsapp-requests" });
    } catch (err) {
      setError(await apiErrorMessage(err, t("waDeleteError")));
    }
  }
  return (
    <>
      <button type="button" className="wa-btn-delete" onClick={() => setOpen(true)}>
        {t("waDeleteRequest")}
      </button>
      {open && (
        <DeleteRequestDialog
          title={t("waDeleteTitleOne", { ref: r.ref })}
          expected={r.ref}
          prompt={t("waDeletePromptOne", { ref: r.ref })}
          note={t("waDeleteNoteOne") + (r.deed ? t("waDeleteNoteDeed", { title: r.deed.title }) : "")}
          busy={del.isPending}
          error={error}
          onConfirm={onConfirm}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

const DRAFT_STATE: Record<string, StringKey> = {
  pending: "waDraftStatePending",
  sent: "waDraftStateSent",
  approved: "waDraftStateApproved",
  correction: "waDraftStateCorrection",
};
/** On the customer's PDF (customer-facing, so always Hindi like the bot's messages). */
const WATERMARK = "DRAFT - केवल जाँच हेतु"; // i18n-exempt: printed on the customer's PDF

/** "/deeds/sale-deed/edit/<id>" or a bare id → the id. */
function deedIdFrom(input: string): string | null {
  const t = input.trim();
  const m = t.match(/\/edit\/([^/?#\s]+)/);
  const id = m ? m[1]! : t;
  return /^[\w-]{6,64}$/.test(id) ? id : null;
}

/**
 * The deed linked to this request, and (OWNER/ADMIN, status DRAFT_READY) the
 * button that sends the customer a watermarked PDF with Aadhaar/PAN cut to the
 * last 4, plus their "SAHI HAI" / correction answer.
 */
function DraftCard({ r }: { r: WaRequestDetail }) {
  const { t } = useWaT();
  const update = useUpdateWaRequest(r.id);
  const send = useSendWaDraft(r.id);
  const loadDraft = useDraftForCustomer();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onLink() {
    setMsg(null);
    const id = deedIdFrom(link);
    if (!id) return setMsg(t("waLinkInvalid"));
    try {
      await update.mutateAsync({ deedTemplateId: id });
      setLink("");
    } catch (err) {
      setMsg(await apiErrorMessage(err, t("waLinkError")));
    }
  }
  async function onSend() {
    setMsg(null);
    if (!window.confirm(t("waSendDraftConfirm"))) return;
    setBusy(true);
    try {
      const d = await loadDraft(r.id);
      const pdf = await deedPdfBase64(d.title, d.content, WATERMARK);
      const detail = await send.mutateAsync(pdf);
      setMsg(detail.draftReview?.state === "sent" ? t("waDraftSent") : t("waDraftNotDelivered"));
    } catch (err) {
      setMsg(await apiErrorMessage(err, t("waDraftSendError")));
    } finally {
      setBusy(false);
    }
  }
  const review = r.draftReview;
  return (
    <Card title={t("waCardDraft")}>
      <Field
        label={t("waLinkedDeed")}
        value={
          r.deed ? (
            <a href={`/deeds/${r.deed.type}/edit/${r.deed.id}`} target="_blank" rel="noreferrer">
              {r.deed.title}
            </a>
          ) : (
            t("waNone")
          )
        }
      />
      {!r.deed && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "6px 0" }}>
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder={t("waLinkPlaceholder")}
            style={{ flex: "1 1 240px" }}
          />
          <button type="button" className="doc-btn" onClick={onLink} disabled={update.isPending || !link.trim()}>
            {t("waLinkDeed")}
          </button>
        </div>
      )}
      {review && (
        <>
          <Field label={t("waDraftState")} value={t(DRAFT_STATE[review.state]!)} />
          {review.reply && <Field label={t("waCustomerReply")} value={<span style={{ whiteSpace: "pre-wrap" }}>{review.reply}</span>} />}
        </>
      )}
      {r.canSendDraft && (
        <button type="button" className="btn-calc" style={{ marginTop: 8 }} onClick={onSend} disabled={busy}>
          {busy ? t("waSendingDraft") : review ? t("waResendDraft") : t("waSendDraft")}
        </button>
      )}
      {!r.canSendDraft && r.canAssign && r.deed && r.workStatus !== "DRAFT_READY" && (
        <p className="doc-sub">{t("waDraftNeedsReady")}</p>
      )}
      {msg && <p className="doc-sub" role="status">{msg}</p>}
    </Card>
  );
}

const NOTIFICATION_KIND: Record<string, StringKey> = { STATUS: "waKindSTATUS", ALERT: "waKindALERT", DRAFT: "waKindDRAFT" };

/** WhatsApp messages sent for this request; PENDING ones get a resend button. */
function MessagesCard({ r }: { r: WaRequestDetail }) {
  const { t, lang } = useWaT();
  const resend = useResendWaNotification(r.id);
  const [error, setError] = useState<string | null>(null);
  const list = r.notifications ?? [];
  if (!list.length) return null;
  async function onResend(nid: string) {
    setError(null);
    try {
      const n = await resend.mutateAsync(nid);
      if (n.status !== "SENT") setError(t("waStillNotSent", { reason: reasonText(n, t) }));
    } catch (err) {
      setError(await apiErrorMessage(err, t("waResendError")));
    }
  }
  return (
    <Card title={t("waCardMessages")}>
      {list.map((n) => (
        <div key={n.id} style={{ padding: "8px 0", borderTop: "1px solid var(--border, #e5e5e5)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700 }}>{NOTIFICATION_KIND[n.kind] ? t(NOTIFICATION_KIND[n.kind]!) : n.kind}</span>
            <span className="doc-sub" style={{ marginTop: 0 }}>
              {n.toMasked} · {formatDate(n.sentAt ?? n.createdAt, lang)}
            </span>
            {n.status === "SENT" ? (
              <span className="status-pill good">
                {t("waMsgSent")}
                {n.via === "template" ? t("waMsgViaTemplate") : ""}
              </span>
            ) : (
              <>
                <span className="status-pill bad">
                  {t("waMsgPendingPill")}
                  {n.reason ? ` — ${reasonText(n, t)}` : ""}
                </span>
                <button type="button" className="doc-btn" disabled={resend.isPending} onClick={() => onResend(n.id)}>
                  {resend.isPending ? t("waSending") : t("waResend")}
                </button>
              </>
            )}
          </div>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 13, marginTop: 4 }}>{n.body}</div>
        </div>
      ))}
      {error && <p className="modal-error">{error}</p>}
    </Card>
  );
}

const ID_PHOTO_STATE: Record<string, StringKey> = { later: "waIdPhotoLater", deleted: "waIdPhotoDeleted" };

/**
 * ID-card photos per person, the cross-check warnings, and whether the Aadhaar/PAN
 * fields came from the card. The photos open only for OWNER/ADMIN and the
 * request's assignee (the API 404s for anyone else).
 */
function IdCardsCard({ r }: { r: WaRequestDetail }) {
  const { t, lang } = useWaT();
  const openPhoto = useWaIdPhotoOpener();
  const [error, setError] = useState<string | null>(null);
  if (!r.idCards.length) return null;
  async function onView(party: string, kind: string) {
    setError(null);
    const tab = window.open("", "_blank");
    try {
      const url = await openPhoto(r.id, party, kind);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      tab?.close();
      setError(await apiErrorMessage(err, t("waIdPhotoOpenError")));
    }
  }
  return (
    <Card title={t("waCardIdPhotos")}>
      {r.idPhotosPurgedAt && (
        <p className="doc-sub" style={{ marginBottom: 8 }}>
          {t("waIdPurged", { date: formatDate(r.idPhotosPurgedAt, lang) })}
        </p>
      )}
      {r.idCards.map((c, i) => (
        <div key={c.party} style={{ marginTop: i ? 14 : 0 }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>{PARTY_KEY[c.party] ? t(PARTY_KEY[c.party]!) : c.heading}</div>
          {(c.warningKinds?.map((k) => (ID_WARNING_KEY[k] ? t(ID_WARNING_KEY[k]!) : k)) ?? c.warnings).map((w) => (
            <p key={w} className="status-pill warn" style={{ margin: "4px 0" }}>
              ⚠️ {t("waIdCheckStaff", { warning: w })}
            </p>
          ))}
          <Field
            label={t("waIdFromCard")}
            value={[c.aadhaarFromCard && t("waIdAadhaarConfirmed"), c.panFromCard && t("waIdPanConfirmed")].filter(Boolean).join(" · ") || t("waIdTyped")}
          />
          {c.photos.map((p) => (
            <div key={p.kind} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, minWidth: 160 }}>{ID_KIND_KEY[p.kind] ? t(ID_KIND_KEY[p.kind]!) : p.label}</span>
              {p.state === "received" ? (
                <button type="button" className="doc-btn" onClick={() => onView(c.party, p.kind)}>
                  {t("waView")}
                </button>
              ) : (
                <span className="doc-sub" style={{ marginTop: 0 }}>
                  {p.state && ID_PHOTO_STATE[p.state] ? t(ID_PHOTO_STATE[p.state]!) : t("waIdPhotoMissing")}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
      {error && <p className="modal-error">{error}</p>}
    </Card>
  );
}

function SampadaMissing({ party }: { party: Partial<Record<PartyField, string | null>> }) {
  const { t } = useWaT();
  const missing = missingSampadaFields(party);
  if (!missing.length) return <Field label={t("waSampadaComplete")} value={t("waSampadaCompleteValue")} />;
  return (
    <Field
      label={t("waSampadaMissing")}
      value={<span className="status-pill bad">{missing.map((f) => t(PARTY_FIELD_KEY[f])).join(", ")}</span>}
    />
  );
}

/** A required paper of a बंधक पत्र. */
const docStateLabel = (v: "received" | "later" | null, t: WaT) =>
  v === "received" ? t("waDocReceived") : v === "later" ? t("waDocLater") : t("waDocMissing");
/** Customer's plot answer: true/false, null = they said "पता नहीं". */
const yesNo = (v: boolean | null, t: WaT) => (v === true ? t("waYes") : v === false ? t("waNo") : t("waUnknown"));

/** Staff: one WhatsApp draft request -- customer, buyer, registry details, files and office workflow. */
export function WhatsappRequestDetailPage() {
  const { t, lang } = useWaT();
  const { id } = useParams({ strict: false }) as { id: string };
  const query = useWaRequest(id);
  const assignees = useWaAssignees(!!query.data?.canAssign);
  const update = useUpdateWaRequest(id);
  const reveal = useRevealWaRequest(id);
  const openDocument = useWaDocumentOpener();
  const createDeed = useCreateSampleDeed();

  const [revealed, setRevealed] = useState<WaRevealResult | null>(null);
  const [workStatus, setWorkStatus] = useState<WaWorkStatus | "">("");
  const [assigneeId, setAssigneeId] = useState("");
  const [staffNote, setStaffNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const r = query.data;
  useEffect(() => {
    if (!r) return;
    setWorkStatus(r.workStatus ?? "");
    setAssigneeId(r.assigneeId ?? "");
    setStaffNote(r.staffNote ?? "");
  }, [r?.id, r?.workStatus, r?.assigneeId, r?.staffNote]);

  // Decrypted values live only in this component's state; drop them on leave.
  useEffect(() => () => setRevealed(null), []);

  if (query.isLoading) {
    return (
      <section className="page">
        <div className="wrap">
          <Skeleton className="h-5 w-full" />
        </div>
      </section>
    );
  }
  if (!r) {
    return (
      <section className="page">
        <div className="wrap">
          <p className="modal-error">{t("waNotFound")}</p>
          <Link to="/whatsapp-requests">{t("waBackToAll")}</Link>
        </div>
      </section>
    );
  }

  async function onReveal() {
    setMessage(null);
    try {
      setRevealed(await reveal.mutateAsync());
    } catch (err) {
      setMessage(await apiErrorMessage(err, t("waRevealError")));
    }
  }

  async function onSave() {
    setMessage(null);
    try {
      await update.mutateAsync({
        workStatus: workStatus || undefined,
        // Only OWNER/ADMIN may reassign; the API rejects assigneeId from anyone else.
        ...(r!.canAssign ? { assigneeId: assigneeId || null } : {}),
        staffNote: staffNote.trim() || null,
      });
      setMessage(t("waSaved"));
    } catch (err) {
      setMessage(await apiErrorMessage(err, t("waSaveError")));
    }
  }

  async function onOpenDocument(index: number, download: boolean) {
    setDocError(null);
    // Open the tab before the fetch so the browser still treats it as a user action.
    const tab = download ? null : window.open("", "_blank");
    try {
      const url = await openDocument(r!.id, index);
      if (download) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `whatsapp-${r!.ref}-${index === 0 ? "registry" : `doc-${index}`}`;
        a.click();
      } else if (tab) {
        tab.location.href = url;
      } else {
        window.location.assign(url);
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      tab?.close();
      setDocError(await apiErrorMessage(err, t("waDocOpenError")));
    }
  }

  function onCreateDeed() {
    // TODO: prefill parties (buyer / mortgagor + witnesses, sellers = registry's
    // current owners) and the property detail once the editor supports seeding them.
    // For now: a blank deed of the requested type, titled with the request number and name.
    const type = r!.deedType === "mortgage" ? "equitable-mortgage-deed" : "sale-deed";
    const title = `${t("waTitle")} ${r!.ref}${r!.buyerName ? ` — ${r!.buyerName}` : ""}`;
    createDeed.mutate(
      { type, title, content: "" },
      {
        onSuccess: (item) => {
          // Link the new deed to this request (for "ग्राहक को ड्राफ्ट भेजें").
          update.mutate({ deedTemplateId: item.id });
          const sample = item.content.trim() ? "&sample=1" : "";
          const url = `/deeds/${type}/edit/${item.id}?new=1${sample}`;
          const tab = window.open(url, "_blank");
          if (!tab) window.location.assign(url);
        },
        onError: async (err) => setMessage(await apiErrorMessage(err, t("waCreateDeedError"))),
      },
    );
  }

  const draftText = officeDraftText(r, revealed);
  const reg = r.registry;
  const p = reg?.property;
  const place = p ? [p.locality, p.village, p.tehsil, p.district].filter(Boolean).join(", ") : "";

  return (
    <section className="page">
      <div className="wrap" style={{ maxWidth: 920 }}>
        <Link to="/whatsapp-requests" className="doc-sub" style={{ fontSize: 13 }}>
          {t("waBackToAll")}
        </Link>
        <div className="page-head" style={{ marginTop: 8 }}>
          <h2 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {t("waRequestNo", { ref: r.ref })}
            {r.workStatus ? (
              <span className={`status-pill ${WORK_STATUS_PILL[r.workStatus]}`}>{t(WORK_STATUS_KEY[r.workStatus])}</span>
            ) : (
              <span className="status-pill neutral">{t(INTAKE_STATUS_KEY[r.status])}</span>
            )}
            {r.needsStaff && <span className="status-pill bad">{t("waStaffCheckNeeded")}</span>}
            {(r.notifications ?? []).some((n) => n.status === "PENDING" && n.kind !== "ALERT") && (
              <span className="status-pill bad">{t("waMsgPending")}</span>
            )}
            {(r.reusedFrom ?? []).length > 0 && (
              <span className="status-pill warn">{t("waReusedFrom", { refs: r.reusedFrom!.join(", ") })}</span>
            )}
            {r.idCards.some((c) => c.warnings.length > 0) && (
              <span className="status-pill warn">{t("waIdMismatch")}</span>
            )}
            <span className="status-pill good">{t(DEED_TYPE_KEY[r.deedType])}</span>
          </h2>
          {r.deedType === "other" ? (
            // The bot doesn't know which deed type this is -- staff pick it.
            <CreateDeedMenu triggerLabel={t("waCreateDeedPick")} />
          ) : (
            <button type="button" className="btn-calc" onClick={onCreateDeed} disabled={createDeed.isPending}>
              {createDeed.isPending ? t("waCreating") : t("waCreateDeed")}
            </button>
          )}
          {r.canAssign && <DeleteRequestButton r={r} />}
        </div>
        {message && (
          <p className="doc-sub" style={{ fontSize: 13 }} role="status">
            {message}
          </p>
        )}

        <Card title={t("waCardCustomer")}>
          <Field label={t("waWhatsappName")} value={orDash(r.customerName)} />
          <Field label={t("waWhatsappNumber")} value={<a href={`tel:+${r.phone}`}>+{r.phone}</a>} />
          <Field label={t("waRequestDate")} value={formatDate(r.createdAt, lang)} />
          <Field label={t("waChatStatus")} value={t(INTAKE_STATUS_KEY[r.status])} />
        </Card>

        {draftText && (
          <Card
            title={t("waCardDraftText")}
            actions={
              <button
                type="button"
                className="doc-btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(draftText);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? t("waCopied") : t("waCopy")}
              </button>
            }
          >
            <textarea
              readOnly
              value={draftText}
              rows={Math.min(18, draftText.split("\n").length + 1)}
              style={{ width: "100%", fontFamily: "inherit", fontSize: 14, lineHeight: 1.6 }}
            />
            <p className="doc-sub" style={{ marginTop: 6 }}>
              {t("waDraftBlanksNote")}
              {r.canReveal && !revealed && t("waDraftRevealNote")}
            </p>
          </Card>
        )}

        {r.deedType === "other" && (
          <Card title={t("waCardRequestedDoc")}>
            <Field label={t("waCustomerWrote")} value={orDash(r.requestedDeed)} />
            <p className="doc-sub" style={{ marginTop: 6 }}>
              {t("waOtherDocNote")}
            </p>
          </Card>
        )}

        {r.mortgage && (
          <Card
            title={t("waCardMortgage")}
            actions={
              r.canReveal &&
              r.mortgage.people.some((x) => x.aadhaarMasked) &&
              (revealed ? (
                <button type="button" className="doc-btn" onClick={() => setRevealed(null)}>
                  {t("waHide")}
                </button>
              ) : (
                <button type="button" className="doc-btn" onClick={onReveal} disabled={reveal.isPending}>
                  {reveal.isPending ? t("waLoading") : t("waShowAadhaar")}
                </button>
              ))
            }
          >
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>{t("waRequiredDocs")}</div>
              <Field label={t("waSanctionLetter")} value={docStateLabel(r.mortgage.docs.sanction, t)} />
              <Field label={t("waPropertyRegistry")} value={docStateLabel(r.mortgage.docs.registry, t)} />
              {r.mortgage.registryOwners.length > 0 && (
                <Field label={t("waRegistryOwners")} value={r.mortgage.registryOwners.join(", ")} />
              )}
              <Field
                label={t("waOwnerIsCurrent")}
                value={r.mortgage.ownerIsCurrent === undefined ? t("waNotAskedYet") : yesNo(r.mortgage.ownerIsCurrent, t)}
              />
              {r.mortgage.ownerIsCurrent === false && (
                <Field label={t("waTransferDoc")} value={docStateLabel(r.mortgage.docs.transfer, t)} />
              )}
            </div>
            {r.mortgage.people.map((person, i) => (
              <div key={person.role} style={{ marginTop: i ? 14 : 0 }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>{MORTGAGE_ROLE_KEYS[i] ? t(MORTGAGE_ROLE_KEYS[i]!) : person.role}</div>
                <Field label={t("waName")} value={orDash(person.name)} />
                <Field label={t("waFatherHusband")} value={orDash(person.fatherName)} />
                <Field label={t("waMother")} value={orDash(person.motherName)} />
                <Field label={t("waMobile")} value={orDash(person.mobile)} />
                <Field label={t("waEmail")} value={orDash(person.email)} />
                <Field label={t("waAddress")} value={orDash(person.address)} />
                <Field
                  label={t("waAadhaar")}
                  value={revealed ? orDash(revealed.people[i]?.aadhaar) : orDash(person.aadhaarMasked)}
                />
                {person.panMasked && <Field label={t("waPan")} value={person.panMasked} />}
                {(person.dob || person.gender) && (
                  <Field label={t("waDobGender")} value={[person.dob, genderText(person.gender, t)].filter(Boolean).join(" · ")} />
                )}
                <SampadaMissing
                  party={{
                    name: person.name,
                    guardian: person.fatherName,
                    motherName: person.motherName,
                    aadhaar: person.aadhaarMasked,
                    mobile: person.mobile,
                    email: person.email,
                    address: person.address,
                  }}
                />
              </div>
            ))}
          </Card>
        )}

        {r.deedType === "sale" && (
          <Card
            title={t("waCardBuyer")}
            actions={
              r.canReveal &&
              (r.buyer.aadhaarMasked || r.buyer.panMasked || r.sellerPanMasked) &&
              (revealed ? (
                <button type="button" className="doc-btn" onClick={() => setRevealed(null)}>
                  {t("waHide")}
                </button>
              ) : (
                <button type="button" className="doc-btn" onClick={onReveal} disabled={reveal.isPending}>
                  {reveal.isPending ? t("waLoading") : t("waShowAadhaarPan")}
                </button>
              ))
            }
          >
            <Field label={t("waName")} value={orDash(r.buyer.name)} />
            <Field label={t("waFatherHusband")} value={orDash(r.buyer.fatherName)} />
            <Field label={t("waMother")} value={orDash(r.buyer.motherName)} />
            <Field label={t("waMobile")} value={orDash(r.buyer.mobile)} />
            <Field label={t("waEmail")} value={orDash(r.buyer.email)} />
            <Field label={t("waAddress")} value={orDash(r.buyer.address)} />
            <Field label={t("waAadhaar")} value={revealed ? orDash(revealed.aadhaar) : orDash(r.buyer.aadhaarMasked)} />
            <Field label={t("waPan")} value={revealed ? orDash(revealed.pan) : orDash(r.buyer.panMasked)} />
            {(r.buyer.dob || r.buyer.gender) && (
              <Field label={t("waDobGender")} value={[r.buyer.dob, genderText(r.buyer.gender, t)].filter(Boolean).join(" · ")} />
            )}
            <Field label={t("waSellerPan")} value={revealed ? orDash(revealed.sellerPan) : orDash(r.sellerPanMasked)} />
            <SampadaMissing
              party={{
                name: r.buyer.name,
                guardian: r.buyer.fatherName,
                motherName: r.buyer.motherName,
                aadhaar: r.buyer.aadhaarMasked,
                mobile: r.buyer.mobile,
                email: r.buyer.email,
                address: r.buyer.address,
              }}
            />
          </Card>
        )}

        {r.deedType === "sale" && (
          <Card title={t("waCardAmount")}>
            <Field label={t("waRegistryAmount")} value={formatAmount(r.amount, r.amountMode, t)} />
            {r.tax && (
              <Field
                label={t("waTaxRules")}
                value={
                  [
                    r.tax.panRequired && t("waTaxPan"),
                    r.tax.sftReported && t("waTaxSft"),
                    r.tax.tdsApplies && t("waTaxTds"),
                  ]
                    .filter(Boolean)
                    .join(" · ") || t("waTaxNone")
                }
              />
            )}
          </Card>
        )}

        <Card title={t("waCardRegistry")}>
          {!reg ? (
            <p className="doc-sub">{t("waRegistryNone")}</p>
          ) : (
            <>
              {!reg.isSaleDeed && (
                <p className="status-pill warn" style={{ marginBottom: 8 }}>
                  {t("waNotSaleDeed")}
                </p>
              )}
              <Field label={t("waProperty")} value={orDash(place)} />
              <Field label={t("waKhasra")} value={orDash(p?.khasraOrPlotNo)} />
              <Field
                label={t("waArea")}
                value={p?.areaValue != null ? `${p.areaValue} ${p.areaUnit ?? ""}`.trim() : "—"}
              />
              <Field
                label={t("waPropertyType")}
                value={p?.propertyType ? (PROPERTY_TYPE_KEY[p.propertyType] ? t(PROPERTY_TYPE_KEY[p.propertyType]!) : p.propertyType) : "—"}
              />
              <Field
                label={t("waCurrentOwners")}
                value={reg.currentOwners.length ? reg.currentOwners.map((o) => o.name).join(", ") : "—"}
              />
              <Field
                label={t("waPrevRegistryNo")}
                value={reg.registrationNo ? `${reg.registrationNo}${reg.registrationDate ? `, ${reg.registrationDate}` : ""}` : "—"}
              />
              <Field
                label={t("waPrevSellers")}
                value={reg.previousSellers.length ? reg.previousSellers.map((o) => o.name).join(", ") : "—"}
              />
              {r.plot && (
                <>
                  <Field label={t("waPlotBuilding")} value={yesNo(r.plot.hasBuilding, t)} />
                  <Field label={t("waPlotCorner")} value={yesNo(r.plot.corner, t)} />
                  <Field label={t("waPlotBoundary")} value={yesNo(r.plot.boundaryWall, t)} />
                </>
              )}
              <Field
                label={t("waPrevConsideration")}
                value={reg.consideration != null ? `₹${reg.consideration.toLocaleString("en-IN")}` : "—"}
              />
            </>
          )}
        </Card>

        <DraftCard r={r} />

        <MessagesCard r={r} />

        <IdCardsCard r={r} />

        <Card title={t("waCardDocuments")}>
          {r.documents.length === 0 ? (
            <p className="doc-sub">{t("waNoDocuments")}</p>
          ) : (
            r.documents.map((d) => (
              <div key={d.index} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, minWidth: 160 }}>{docLabel(d, t)}</span>
                <button type="button" className="doc-btn" onClick={() => onOpenDocument(d.index, false)}>
                  {t("waView")}
                </button>
                <button type="button" className="doc-btn" onClick={() => onOpenDocument(d.index, true)}>
                  {t("waDownload")}
                </button>
              </div>
            ))
          )}
          {docError && <p className="modal-error">{docError}</p>}
        </Card>

        <Card title={t("waCardOffice")}>
          <div className="dr-form-grid">
            <label>
              {t("waColStatus")}
              <select value={workStatus} onChange={(e) => setWorkStatus(e.target.value as WaWorkStatus | "")}>
                {!r.workStatus && <option value="">{t("waChoose")}</option>}
                {WORK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(WORK_STATUS_KEY[s])}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("waAssigneeStaff")}
              {r.canAssign ? (
                <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                  <option value="">{t("waNobody")}</option>
                  {(assignees.data ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{ padding: "8px 0", fontWeight: 600 }}>{r.assigneeName || "—"}</div>
              )}
            </label>
            <label className="dr-notes">
              {t("waStaffNote")}
              <textarea
                rows={3}
                maxLength={2000}
                value={staffNote}
                onChange={(e) => setStaffNote(e.target.value)}
                style={{ width: "100%" }}
              />
            </label>
          </div>
          <button type="button" className="btn-calc" onClick={onSave} disabled={update.isPending}>
            {update.isPending ? t("waSaving") : t("waSave")}
          </button>
        </Card>
      </div>
    </section>
  );
}
