import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "@tanstack/react-router";
import type { WaRevealResult, WaWorkStatus } from "@sampada/shared";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage } from "../../lib/api";
import { useCreateSampleDeed } from "../deeds/useSampleDeeds";
import {
  useRevealWaRequest,
  useUpdateWaRequest,
  useWaAssignees,
  useWaDocumentOpener,
  useWaRequest,
} from "./useWhatsappRequests";
import {
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

/** Staff: one WhatsApp draft request -- customer, buyer, registry details, files and office workflow. */
export function WhatsappRequestDetailPage() {
  const { id } = useParams({ strict: false }) as { id: string };
  const query = useWaRequest(id);
  const assignees = useWaAssignees();
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
        assigneeId: assigneeId || null,
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
    // TODO: prefill parties (buyer from this request, sellers = registry's current
    // owners) and the property detail once the editor supports seeding them.
    // For now: a blank sale deed titled with the request number and buyer.
    const title = `WhatsApp अनुरोध ${r!.ref}${r!.buyerName ? ` — ${r!.buyerName}` : ""}`;
    createDeed.mutate(
      { type: "sale-deed", title, content: "" },
      {
        onSuccess: (item) => {
          const sample = item.content.trim() ? "&sample=1" : "";
          const url = `/deeds/sale-deed/edit/${item.id}?new=1${sample}`;
          const tab = window.open(url, "_blank");
          if (!tab) window.location.assign(url);
        },
        onError: async (err) => setMessage(await apiErrorMessage(err, "नया डीड नहीं बन सका।")),
      },
    );
  }

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
          </h2>
          <button type="button" className="btn-calc" onClick={onCreateDeed} disabled={createDeed.isPending}>
            {createDeed.isPending ? "बनाया जा रहा है…" : "इससे नया डीड बनाएँ"}
          </button>
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
          <Field label="विक्रेता PAN (TDS)" value={revealed ? orDash(revealed.sellerPan) : orDash(r.sellerPanMasked)} />
        </Card>

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
              <Field
                label="पिछला प्रतिफल"
                value={reg.consideration != null ? `₹${reg.consideration.toLocaleString("en-IN")}` : "—"}
              />
            </>
          )}
        </Card>

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
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">— कोई नहीं —</option>
                {(assignees.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
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
