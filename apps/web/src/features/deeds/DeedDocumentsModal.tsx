import { useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { Eye, Search, Trash2, Upload, UserPlus, X } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import {
  useAddDeedParty,
  useAddNaxa,
  useDeedNaxa,
  useDeedParties,
  useFileOpener,
  useRemoveDeedParty,
  useRemoveNaxa,
  useSearchParties,
  type DeedPartyItem,
  type NaxaMeta,
  type PartyMeta,
  type PartyRole,
} from "./useDeedDocuments";

type L = (en: string, hi: string) => string;

function maskAadhaar(a: string): string {
  const d = (a || "").replace(/[^0-9]/g, "");
  if (d.length < 4) return d;
  return "XXXX-XXXX-" + d.slice(-4);
}

const ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 10px",
  border: "1px solid var(--border, #333)",
  borderRadius: 8,
};

const SECTION: CSSProperties = {
  margin: "18px 0",
  borderTop: "1px solid var(--border, #333)",
  paddingTop: 14,
};

/** Per-deed documents: buyers'/sellers' Aadhaar cards (reused across deeds) and the property map. */
export function DeedDocumentsModal({
  deedId,
  deedTitle,
  onClose,
}: {
  deedId: string;
  deedTitle: string;
  onClose: () => void;
}) {
  const lang = useUiStore((s) => s.lang);
  const L: L = (en, hi) => (lang === "hi" ? hi : en);

  const parties = useDeedParties(deedId);
  const naxa = useDeedNaxa(deedId);
  const openFile = useFileOpener();

  const buyers = (parties.data ?? []).filter((p) => p.role === "buyer");
  const sellers = (parties.data ?? []).filter((p) => p.role === "seller");

  async function view(path: string) {
    const url = await openFile(path);
    window.open(url, "_blank");
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: 760, width: "94%", maxHeight: "90vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 17 }}>
            {L("Documents", "दस्तावेज़")}
            <span style={{ opacity: 0.6, fontWeight: 400 }}> — {deedTitle}</span>
          </h3>
          <button
            type="button"
            className="doc-btn"
            style={{ marginLeft: "auto" }}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <PartySection
          role="buyer"
          title={L("Buyers", "खरीददार")}
          items={buyers}
          deedId={deedId}
          onView={view}
          L={L}
        />
        <PartySection
          role="seller"
          title={L("Sellers", "विक्रेता")}
          items={sellers}
          deedId={deedId}
          onView={view}
          L={L}
        />
        <NaxaSection deedId={deedId} items={naxa.data ?? []} onView={view} L={L} />
      </div>
    </div>
  );
}

function PartySection({
  role,
  title,
  items,
  deedId,
  onView,
  L,
}: {
  role: PartyRole;
  title: string;
  items: DeedPartyItem[];
  deedId: string;
  onView: (path: string) => void;
  L: L;
}) {
  const add = useAddDeedParty(deedId);
  const remove = useRemoveDeedParty(deedId);

  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const results = useSearchParties(search);

  function reset() {
    setSearch("");
    setName("");
    setAadhaar("");
    setFile(null);
    setErr(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function pick(p: PartyMeta) {
    setErr(null);
    add.mutate({ role, partyId: p.id }, { onSuccess: reset, onError: (e) => setErr(e.message) });
  }

  function addNew() {
    setErr(null);
    const digits = aadhaar.replace(/[^0-9]/g, "");
    if (digits.length !== 12) {
      setErr(L("Enter a valid 12-digit Aadhaar number.", "सही 12 अंकों का आधार नंबर डालें।"));
      return;
    }
    if (!name.trim()) {
      setErr(L("Enter the person's name.", "व्यक्ति का नाम डालें।"));
      return;
    }
    if (!file) {
      setErr(L("Choose the Aadhaar card image/PDF.", "आधार कार्ड की इमेज/PDF चुनें।"));
      return;
    }
    add.mutate(
      { role, name: name.trim(), aadhaarNumber: digits, file },
      { onSuccess: reset, onError: (e) => setErr(e.message) },
    );
  }

  return (
    <section style={SECTION}>
      <h4 style={{ margin: "0 0 10px", fontSize: 15 }}>
        {title} <span style={{ opacity: 0.55 }}>({items.length})</span>
      </h4>

      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {items.map((it) => (
            <div key={it.linkId} style={ROW}>
              <span style={{ fontWeight: 600 }}>{it.party.name}</span>
              <span style={{ opacity: 0.6, fontSize: 13 }}>{maskAadhaar(it.party.aadhaarNumber)}</span>
              <button
                type="button"
                className="doc-btn"
                style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5 }}
                onClick={() => onView("parties/" + it.party.id + "/file")}
              >
                <Eye size={15} /> {L("View", "देखें")}
              </button>
              <button
                type="button"
                className="doc-btn"
                onClick={() => remove.mutate(it.linkId)}
                title={L("Remove", "हटाएँ")}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ background: "var(--surface-2, rgba(255,255,255,0.03))", borderRadius: 10, padding: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Search size={15} style={{ opacity: 0.6 }} />
          <input
            className="district-input"
            style={{ flex: 1 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={L("Reuse a saved person (name / Aadhaar)…", "पहले से सेव व्यक्ति चुनें (नाम / आधार)…")}
          />
        </label>
        {search.trim().length >= 2 && (results.data?.length ?? 0) > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
            {(results.data ?? []).map((p) => (
              <button
                key={p.id}
                type="button"
                className="doc-btn"
                style={{ justifyContent: "flex-start", textAlign: "left" }}
                onClick={() => pick(p)}
              >
                {p.name} · {maskAadhaar(p.aadhaarNumber)}
              </button>
            ))}
          </div>
        )}

        <div style={{ fontSize: 12, opacity: 0.55, margin: "6px 0" }}>
          {L("or add a new person", "या नया व्यक्ति जोड़ें")}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <input
            className="district-input"
            style={{ flex: "1 1 150px" }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={L("Name", "नाम")}
          />
          <input
            className="district-input"
            style={{ flex: "1 1 150px" }}
            value={aadhaar}
            onChange={(e) => setAadhaar(e.target.value)}
            placeholder={L("Aadhaar number", "आधार नंबर")}
            inputMode="numeric"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ flex: "1 1 190px", fontSize: 13 }}
          />
          <button
            type="button"
            className="btn-calc"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            disabled={add.isPending}
            onClick={addNew}
          >
            <UserPlus size={15} /> {add.isPending ? L("Adding…", "जोड़ रहे…") : L("Add", "जोड़ें")}
          </button>
        </div>
        {err && (
          <p className="modal-error" style={{ marginTop: 8 }}>
            {err}
          </p>
        )}
      </div>
    </section>
  );
}

function NaxaSection({
  deedId,
  items,
  onView,
  L,
}: {
  deedId: string;
  items: NaxaMeta[];
  onView: (path: string) => void;
  L: L;
}) {
  const add = useAddNaxa(deedId);
  const remove = useRemoveNaxa(deedId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(null);
    add.mutate(f, {
      onSuccess: () => {
        if (fileRef.current) fileRef.current.value = "";
      },
      onError: (er) => setErr(er.message),
    });
  }

  return (
    <section style={{ ...SECTION, marginBottom: 4 }}>
      <h4 style={{ margin: "0 0 10px", fontSize: 15 }}>
        {L("Property map (Naxa)", "संपत्ति नक्शा")} <span style={{ opacity: 0.55 }}>({items.length})</span>
      </h4>
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {items.map((n) => (
            <div key={n.id} style={ROW}>
              <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {n.fileName}
              </span>
              <button
                type="button"
                className="doc-btn"
                style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5 }}
                onClick={() => onView("deeds/" + deedId + "/naxa/" + n.id + "/file")}
              >
                <Eye size={15} /> {L("View", "देखें")}
              </button>
              <button
                type="button"
                className="doc-btn"
                onClick={() => remove.mutate(n.id)}
                title={L("Remove", "हटाएँ")}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      <label className="btn-calc" style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
        <Upload size={15} /> {add.isPending ? L("Uploading…", "अपलोड हो रहा…") : L("Upload map", "नक्शा अपलोड करें")}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={onFile}
          style={{ display: "none" }}
        />
      </label>
      {err && (
        <p className="modal-error" style={{ marginTop: 8 }}>
          {err}
        </p>
      )}
    </section>
  );
}
