import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "@tanstack/react-router";
import {
  formatParty,
  formatPartyBlock,
  formatPropertyBlock,
  missingSampadaFields,
  PARTY_FIELD_LABEL,
  type PartyField,
  splitNameRelation,
  type WaRequestDetail,
  type WaRevealResult,
  type WaWorkStatus,
} from "@sampada/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage } from "../../lib/api";
import { CreateDeedMenu } from "../deeds/CreateDeedMenu";
import { useCreateSampleDeed } from "../deeds/useSampleDeeds";
import {
  useResendWaNotification,
  useRevealWaRequest,
  useUpdateWaRequest,
  useWaAssignees,
  useWaDocumentOpener,
  useWaIdPhotoOpener,
  useWaRequest,
} from "./useWhatsappRequests";
import {
  DEED_TYPE_LABEL,
  formatAmount,
  formatDate,
  INTAKE_STATUS_LABEL,
  WORK_STATUS_LABEL,
  WORK_STATUS_PILL,
  WORK_STATUSES,
} from "./waLabels";

const PROPERTY_TYPE_LABEL: Record<string, string> = {
  agricultural: "कृषि भूमि",
  residential_plot: "आवासीय प्लॉट",
  house: "मकान",
  flat: "फ्लैट",
  commercial: "व्यावसायिक",
};

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
    return [formatPartyBlock("विक्रेता पक्ष", sellers), formatPartyBlock("क्रेता पक्ष", [buyer]), property]
      .filter(Boolean)
      .join("\n\n");
  }
  if (r.deedType === "mortgage" && r.mortgage) {
    const [mortgagor, ...witnesses] = r.mortgage.people.map((x, i) =>
      formatParty({ name: x.name, relation: x.relation, guardian: x.fatherName, aadhaar: revealed?.people[i]?.aadhaar ?? x.aadhaarMasked }),
    );
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
const NOTIFICATION_KIND: Record<string, string> = { STATUS: "स्थिति सूचना", ALERT: "मालिक को अलर्ट", DRAFT: "ड्राफ्ट जाँच" };

/** WhatsApp messages sent for this request; PENDING ones get a resend button. */
function MessagesCard({ r }: { r: WaRequestDetail }) {
  const resend = useResendWaNotification(r.id);
  const [error, setError] = useState<string | null>(null);
  const list = r.notifications ?? [];
  if (!list.length) return null;
  async function onResend(nid: string) {
    setError(null);
    try {
      const n = await resend.mutateAsync(nid);
      if (n.status !== "SENT") setError(`अभी भी नहीं भेजा जा सका: ${n.reason ?? ""}`);
    } catch (err) {
      setError(await apiErrorMessage(err, "संदेश दोबारा नहीं भेजा जा सका।"));
    }
  }
  return (
    <Card title="ग्राहक को भेजे WhatsApp संदेश">
      {list.map((n) => (
        <div key={n.id} style={{ padding: "8px 0", borderTop: "1px solid var(--border, #e5e5e5)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700 }}>{NOTIFICATION_KIND[n.kind] ?? n.kind}</span>
            <span className="doc-sub" style={{ marginTop: 0 }}>
              {n.toMasked} · {formatDate(n.sentAt ?? n.createdAt)}
            </span>
            {n.status === "SENT" ? (
              <span className="status-pill good">भेजा गया{n.via === "template" ? " (टेम्पलेट)" : ""}</span>
            ) : (
              <>
                <span className="status-pill bad">बाकी{n.reason ? ` — ${n.reason}` : ""}</span>
                <button type="button" className="doc-btn" disabled={resend.isPending} onClick={() => onResend(n.id)}>
                  {resend.isPending ? "भेज रहे हैं…" : "फिर से भेजें"}
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

const ID_PHOTO_STATE: Record<string, string> ={ later: "ग्राहक बाद में भेजेगा", deleted: "हटा दी गई (अवधि पूरी)" };

/**
 * ID-card photos per person, the cross-check warnings, and whether the Aadhaar/PAN
 * fields came from the card. The photos open only for OWNER/ADMIN and the
 * request's assignee (the API 404s for anyone else).
 */
function IdCardsCard({ r }: { r: WaRequestDetail }) {
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
      setError(await apiErrorMessage(err, "फ़ोटो नहीं खुल सकी।"));
    }
  }
  return (
    <Card title="पहचान पत्र (ID) की फ़ोटो">
      {r.idPhotosPurgedAt && (
        <p className="doc-sub" style={{ marginBottom: 8 }}>
          काम पूरा होने के बाद तय अवधि बीतने पर ये फ़ोटो {formatDate(r.idPhotosPurgedAt)} को अपने-आप हटा दी गईं।
        </p>
      )}
      {r.idCards.map((c, i) => (
        <div key={c.party} style={{ marginTop: i ? 14 : 0 }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>{c.heading}</div>
          {c.warnings.map((w) => (
            <p key={w} className="status-pill warn" style={{ margin: "4px 0" }}>
              ⚠️ {w} — स्टाफ जाँच करें
            </p>
          ))}
          <Field
            label="कार्ड से भरी जानकारी"
            value={[c.aadhaarFromCard && "आधार (ग्राहक ने पुष्टि की)", c.panFromCard && "PAN (ग्राहक ने पुष्टि की)"].filter(Boolean).join(" · ") || "नहीं — ग्राहक ने लिखकर दी"}
          />
          {c.photos.map((p) => (
            <div key={p.kind} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0", flexWrap: "wrap" }}>
              <span style={{ fontWeight: 600, minWidth: 160 }}>{p.label}</span>
              {p.state === "received" ? (
                <button type="button" className="doc-btn" onClick={() => onView(c.party, p.kind)}>
                  देखें
                </button>
              ) : (
                <span className="doc-sub" style={{ marginTop: 0 }}>
                  {p.state ? ID_PHOTO_STATE[p.state] : "— नहीं मिली"}
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
  const missing = missingSampadaFields(party);
  if (!missing.length) return <Field label="SAMPADA 2.0 जानकारी" value="पूरी ✅" />;
  return (
    <Field
      label="SAMPADA के लिए बाकी"
      value={<span className="status-pill bad">{missing.map((f) => PARTY_FIELD_LABEL[f]).join(", ")}</span>}
    />
  );
}

/** A required paper of a बंधक पत्र. */
const docStateLabel = (v: "received" | "later" | null) =>
  v === "received" ? "मिला ✅" : v === "later" ? "ग्राहक बाद में भेजेगा" : "नहीं मिला";
/** Customer's plot answer: true/false, null = they said "पता नहीं". */
const yesNo = (v: boolean | null) => (v === true ? "हाँ" : v === false ? "नहीं" : "पता नहीं");

/** Staff: one WhatsApp draft request -- customer, buyer, registry details, files and office workflow. */
export function WhatsappRequestDetailPage() {
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
          <p className="modal-error">अनुरोध नहीं मिला।</p>
          <Link to="/whatsapp-requests">← सभी अनुरोध</Link>
        </div>
      </section>
    );
  }

  async function onReveal() {
    setMessage(null);
    try {
      setRevealed(await reveal.mutateAsync());
    } catch (err) {
      setMessage(await apiErrorMessage(err, "आधार/PAN नहीं दिखाया जा सका।"));
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
      setMessage("बदलाव सहेज दिए गए।");
    } catch (err) {
      setMessage(await apiErrorMessage(err, "बदलाव सहेजे नहीं जा सके।"));
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
      setDocError(await apiErrorMessage(err, "दस्तावेज़ नहीं खुल सका।"));
    }
  }

  function onCreateDeed() {
    // TODO: prefill parties (buyer / mortgagor + witnesses, sellers = registry's
    // current owners) and the property detail once the editor supports seeding them.
    // For now: a blank deed of the requested type, titled with the request number and name.
    const type = r!.deedType === "mortgage" ? "equitable-mortgage-deed" : "sale-deed";
    const title = `WhatsApp अनुरोध ${r!.ref}${r!.buyerName ? ` — ${r!.buyerName}` : ""}`;
    createDeed.mutate(
      { type, title, content: "" },
      {
        onSuccess: (item) => {
          const sample = item.content.trim() ? "&sample=1" : "";
          const url = `/deeds/${type}/edit/${item.id}?new=1${sample}`;
          const tab = window.open(url, "_blank");
          if (!tab) window.location.assign(url);
        },
        onError: async (err) => setMessage(await apiErrorMessage(err, "नया डीड नहीं बन सका।")),
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
          ← सभी अनुरोध
        </Link>
        <div className="page-head" style={{ marginTop: 8 }}>
          <h2 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            अनुरोध {r.ref}
            {r.workStatus ? (
              <span className={`status-pill ${WORK_STATUS_PILL[r.workStatus]}`}>{WORK_STATUS_LABEL[r.workStatus]}</span>
            ) : (
              <span className="status-pill neutral">{INTAKE_STATUS_LABEL[r.status]}</span>
            )}
            {r.needsStaff && <span className="status-pill bad">स्टाफ जाँच ज़रूरी</span>}
            {(r.notifications ?? []).some((n) => n.status === "PENDING" && n.kind !== "ALERT") && (
              <span className="status-pill bad">ग्राहक को संदेश बाकी</span>
            )}
            {r.idCards.some((c) => c.warnings.length > 0) && (
              <span className="status-pill warn">⚠️ ID कार्ड मिलान में अंतर — नीचे देखें</span>
            )}
            <span className="status-pill good">{DEED_TYPE_LABEL[r.deedType]}</span>
          </h2>
          {r.deedType === "other" ? (
            // The bot doesn't know which deed type this is -- staff pick it.
            <CreateDeedMenu triggerLabel="नया डीड बनाएँ (प्रकार चुनें)" />
          ) : (
            <button type="button" className="btn-calc" onClick={onCreateDeed} disabled={createDeed.isPending}>
              {createDeed.isPending ? "बनाया जा रहा है…" : "इससे नया डीड बनाएँ"}
            </button>
          )}
        </div>
        {message && (
          <p className="doc-sub" style={{ fontSize: 13 }} role="status">
            {message}
          </p>
        )}

        <Card title="ग्राहक की जानकारी">
          <Field label="WhatsApp नाम" value={orDash(r.customerName)} />
          <Field label="WhatsApp नंबर" value={<a href={`tel:+${r.phone}`}>+{r.phone}</a>} />
          <Field label="अनुरोध की तारीख" value={formatDate(r.createdAt)} />
          <Field label="बातचीत की स्थिति" value={INTAKE_STATUS_LABEL[r.status]} />
        </Card>

        {draftText && (
          <Card
            title="ड्राफ्ट टेक्स्ट (ऑफ़िस प्रारूप)"
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
                {copied ? "कॉपी हो गया ✓" : "कॉपी करें"}
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
              "____" वाली जगहें (चतुःसीमा, भुजाएँ, विक्रेता का आधार आदि) स्टाफ भरें।
              {r.canReveal && !revealed && " पूरा आधार/PAN \"आधार दिखाएँ\" के बाद आएगा।"}
            </p>
          </Card>
        )}

        {r.deedType === "other" && (
          <Card title="अनुरोधित दस्तावेज़">
            <Field label="ग्राहक ने लिखा" value={orDash(r.requestedDeed)} />
            <p className="doc-sub" style={{ marginTop: 6 }}>
              इस दस्तावेज़ के लिए bot ने विवरण नहीं लिया है — ग्राहक से संपर्क करें।
            </p>
          </Card>
        )}

        {r.mortgage && (
          <Card
            title="बंधक पत्र — बंधककर्ता और गवाह"
            actions={
              r.canReveal &&
              r.mortgage.people.some((x) => x.aadhaarMasked) &&
              (revealed ? (
                <button type="button" className="doc-btn" onClick={() => setRevealed(null)}>
                  छिपाएँ
                </button>
              ) : (
                <button type="button" className="doc-btn" onClick={onReveal} disabled={reveal.isPending}>
                  {reveal.isPending ? "लोड हो रहा है…" : "आधार दिखाएँ"}
                </button>
              ))
            }
          >
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>ज़रूरी दस्तावेज़</div>
              <Field label="बैंक सैंक्शन लेटर" value={docStateLabel(r.mortgage.docs.sanction)} />
              <Field label="संपत्ति की रजिस्ट्री" value={docStateLabel(r.mortgage.docs.registry)} />
              {r.mortgage.registryOwners.length > 0 && (
                <Field label="रजिस्ट्री के अनुसार मालिक" value={r.mortgage.registryOwners.join(", ")} />
              )}
              <Field
                label="रजिस्ट्री वाले मालिक ही वर्तमान मालिक"
                value={r.mortgage.ownerIsCurrent === undefined ? "— (अभी पूछा नहीं)" : yesNo(r.mortgage.ownerIsCurrent)}
              />
              {r.mortgage.ownerIsCurrent === false && (
                <Field label="वसीयत/नामांतरण दस्तावेज़" value={docStateLabel(r.mortgage.docs.transfer)} />
              )}
            </div>
            {r.mortgage.people.map((person, i) => (
              <div key={person.role} style={{ marginTop: i ? 14 : 0 }}>
                <div style={{ fontWeight: 800, marginBottom: 4 }}>{person.role}</div>
                <Field label="नाम" value={orDash(person.name)} />
                <Field label="पिता/पति का नाम" value={orDash(person.fatherName)} />
                <Field label="माता का नाम" value={orDash(person.motherName)} />
                <Field label="मोबाइल" value={orDash(person.mobile)} />
                <Field label="ईमेल" value={orDash(person.email)} />
                <Field label="पता" value={orDash(person.address)} />
                <Field
                  label="आधार"
                  value={revealed ? orDash(revealed.people[i]?.aadhaar) : orDash(person.aadhaarMasked)}
                />
                {person.panMasked && <Field label="PAN" value={person.panMasked} />}
                {(person.dob || person.gender) && (
                  <Field label="जन्म तिथि / लिंग (आधार से)" value={[person.dob, person.gender].filter(Boolean).join(" · ")} />
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
            title="खरीदार का विवरण"
            actions={
              r.canReveal &&
              (r.buyer.aadhaarMasked || r.buyer.panMasked || r.sellerPanMasked) &&
              (revealed ? (
                <button type="button" className="doc-btn" onClick={() => setRevealed(null)}>
                  छिपाएँ
                </button>
              ) : (
                <button type="button" className="doc-btn" onClick={onReveal} disabled={reveal.isPending}>
                  {reveal.isPending ? "लोड हो रहा है…" : "आधार/PAN दिखाएँ"}
                </button>
              ))
            }
          >
            <Field label="नाम" value={orDash(r.buyer.name)} />
            <Field label="पिता/पति का नाम" value={orDash(r.buyer.fatherName)} />
            <Field label="माता का नाम" value={orDash(r.buyer.motherName)} />
            <Field label="मोबाइल" value={orDash(r.buyer.mobile)} />
            <Field label="ईमेल" value={orDash(r.buyer.email)} />
            <Field label="पता" value={orDash(r.buyer.address)} />
            <Field label="आधार" value={revealed ? orDash(revealed.aadhaar) : orDash(r.buyer.aadhaarMasked)} />
            <Field label="PAN" value={revealed ? orDash(revealed.pan) : orDash(r.buyer.panMasked)} />
            {(r.buyer.dob || r.buyer.gender) && (
              <Field label="जन्म तिथि / लिंग (आधार से)" value={[r.buyer.dob, r.buyer.gender].filter(Boolean).join(" · ")} />
            )}
            <Field label="विक्रेता PAN (TDS)" value={revealed ? orDash(revealed.sellerPan) : orDash(r.sellerPanMasked)} />
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
          <Card title="राशि और आयकर">
            <Field label="रजिस्ट्री राशि" value={formatAmount(r.amount, r.amountMode)} />
            {r.tax && (
              <Field
                label="आयकर नियम"
                value={
                  [
                    r.tax.panRequired && "PAN अनिवार्य",
                    r.tax.sftReported && "SFT रिपोर्टिंग",
                    r.tax.tdsApplies && "1% TDS लागू",
                  ]
                    .filter(Boolean)
                    .join(" · ") || "कोई विशेष नियम नहीं"
                }
              />
            )}
          </Card>
        )}

        <Card title="पुरानी रजिस्ट्री से निकाला विवरण">
          {!reg ? (
            <p className="doc-sub">रजिस्ट्री से कोई विवरण नहीं निकला — स्टाफ मूल दस्तावेज़ देखें।</p>
          ) : (
            <>
              {!reg.isSaleDeed && (
                <p className="status-pill warn" style={{ marginBottom: 8 }}>
                  यह विक्रय पत्र नहीं लगता — जाँच करें
                </p>
              )}
              <Field label="संपत्ति" value={orDash(place)} />
              <Field label="खसरा/प्लॉट नं." value={orDash(p?.khasraOrPlotNo)} />
              <Field
                label="क्षेत्रफल"
                value={p?.areaValue != null ? `${p.areaValue} ${p.areaUnit ?? ""}`.trim() : "—"}
              />
              <Field label="संपत्ति का प्रकार" value={p?.propertyType ? (PROPERTY_TYPE_LABEL[p.propertyType] ?? p.propertyType) : "—"} />
              <Field
                label="वर्तमान मालिक (विक्रेता)"
                value={reg.currentOwners.length ? reg.currentOwners.map((o) => o.name).join(", ") : "—"}
              />
              <Field
                label="पिछली रजिस्ट्री नं."
                value={reg.registrationNo ? `${reg.registrationNo}${reg.registrationDate ? `, ${reg.registrationDate}` : ""}` : "—"}
              />
              <Field
                label="पिछले विक्रेता"
                value={reg.previousSellers.length ? reg.previousSellers.map((o) => o.name).join(", ") : "—"}
              />
              {r.plot && (
                <>
                  <Field label="प्लॉट पर मकान/निर्माण" value={yesNo(r.plot.hasBuilding)} />
                  <Field label="कॉर्नर प्लॉट" value={yesNo(r.plot.corner)} />
                  <Field label="बाउंड्री वॉल" value={yesNo(r.plot.boundaryWall)} />
                </>
              )}
              <Field
                label="पिछला प्रतिफल"
                value={reg.consideration != null ? `₹${reg.consideration.toLocaleString("en-IN")}` : "—"}
              />
            </>
          )}
        </Card>

        <MessagesCard r={r} />

        <IdCardsCard r={r} />

        <Card title="दस्तावेज़">
          {r.documents.length === 0 ? (
            <p className="doc-sub">कोई दस्तावेज़ नहीं।</p>
          ) : (
            r.documents.map((d) => (
              <div key={d.index} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, minWidth: 160 }}>{d.label}</span>
                <button type="button" className="doc-btn" onClick={() => onOpenDocument(d.index, false)}>
                  देखें
                </button>
                <button type="button" className="doc-btn" onClick={() => onOpenDocument(d.index, true)}>
                  डाउनलोड करें
                </button>
              </div>
            ))
          )}
          {docError && <p className="modal-error">{docError}</p>}
        </Card>

        <Card title="कार्यालय कार्य">
          <div className="dr-form-grid">
            <label>
              स्थिति
              <select value={workStatus} onChange={(e) => setWorkStatus(e.target.value as WaWorkStatus | "")}>
                {!r.workStatus && <option value="">— चुनें —</option>}
                {WORK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {WORK_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ज़िम्मेदार स्टाफ
              {r.canAssign ? (
                <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                  <option value="">— कोई नहीं —</option>
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
              स्टाफ नोट
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
            {update.isPending ? "सहेजा जा रहा है…" : "सहेजें"}
          </button>
        </Card>
      </div>
    </section>
  );
}
