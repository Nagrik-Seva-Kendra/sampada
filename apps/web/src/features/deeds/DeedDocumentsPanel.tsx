import { useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { Eye, FileUp, Search, Trash2, UserPlus } from "lucide-react";
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
    type PartyType,
} from "./useDeedDocuments";

type T = (en: string, hi: string) => string;

/** Files accepted for a property map (naxa): images, PDF, and Word documents. */
const NAXA_ACCEPT =
  "image/*,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function maskAadhaar(a: string | null): string {
  const d = (a || "").replace(/[^0-9]/g, "");
  if (d.length < 4) return d;
  return d.slice(0, 4) + "-" + d.slice(4, 8) + "-" + d.slice(8, 12);}

const ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "6px 10px",
  border: "1px solid var(--border, #333)",
  borderRadius: 8,
  background: "var(--surface, rgba(255,255,255,0.02))",
};

/** Inline documents panel shown under a deed row: sellers'/buyers' Aadhaar (reused across deeds) + property map, plus a search over saved people to see who's already added. */
export function DeedDocumentsPanel({ deedId }: { deedId: string }) {
  const lang = useUiStore((s) => s.lang);
  const T: T = (en, hi) => (lang === "hi" ? hi : en);

  const parties = useDeedParties(deedId);
  const naxa = useDeedNaxa(deedId);
  const openFile = useFileOpener();
  const add = useAddDeedParty(deedId);

  const items = parties.data ?? [];
  const buyers = items.filter((p) => p.role === "buyer");
  const sellers = items.filter((p) => p.role === "seller");

  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const results = useSearchParties(q);

  async function view(path: string) {
    const url = await openFile(path);
    window.open(url, "_blank");
  }

  function addExisting(p: PartyMeta, role: PartyRole) {
    setErr(null);
    add.mutate({ role, partyId: p.id }, { onError: (e) => setErr(e.message) });
  }

  return (
    <div style={{ padding: "14px 8px 8px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ background: "var(--surface-2, rgba(255,255,255,0.03))", borderRadius: 10, padding: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Search size={15} style={{ opacity: 0.6 }} />
          <input
            className="district-input"
            style={{ flex: 1 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={T("Search saved people — already added?", "सेव लोगों में खोजें — पहले से जुड़ा?")}
          />
        </label>
        {q.trim().length >= 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
            {(results.data ?? []).map((p) => {
              const on = items.find((it) => it.party.id === p.id);
              return (
                <div key={p.id} style={ROW}>
                  <span style={{ fontWeight: 600 }}>{p.name}</span>
                  <span style={{ opacity: 0.6, fontSize: 13 }}>{maskAadhaar(p.aadhaarNumber)}</span>
                  {on ? (
                    <span style={{ marginLeft: "auto", color: "var(--accent)", fontSize: 13, fontWeight: 600 }}>
                      {T("Already added — ", "पहले से जुड़ा — ") +
                        (on.role === "buyer" ? T("buyer", "खरीददार") : T("seller", "विक्रेता"))}
                    </span>
                  ) : (
                    <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                      <button type="button" className="doc-btn" disabled={add.isPending} onClick={() => addExisting(p, "seller")}>
                        + {T("Seller", "विक्रेता")}
                      </button>
                      <button type="button" className="doc-btn" disabled={add.isPending} onClick={() => addExisting(p, "buyer")}>
                        + {T("Buyer", "खरीददार")}
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
            {results.isFetched && (results.data?.length ?? 0) === 0 && (
              <div style={{ fontSize: 13, opacity: 0.6 }}>{T("No saved person found.", "कोई सेव व्यक्ति नहीं मिला।")}</div>
            )}
          </div>
        )}
        {err && (
          <p className="modal-error" style={{ marginTop: 8 }}>
            {err}
          </p>
        )}
      </div>

      <PartyGroup role="seller" title={T("Sellers", "विक्रेता")} items={sellers} deedId={deedId} onView={view} T={T} />
      <PartyGroup role="buyer" title={T("Buyers", "खरीददार")} items={buyers} deedId={deedId} onView={view} T={T} />
      <NaxaGroup deedId={deedId} items={naxa.data ?? []} onView={view} T={T} />
    </div>
  );
}

function PartyGroup({
  role,
  title,
  items,
  deedId,
  onView,
  T,
}: {
  role: PartyRole;
  title: string;
  items: DeedPartyItem[];
  deedId: string;
  onView: (path: string) => void;
  T: T;
}) {
  const add = useAddDeedParty(deedId);
  const remove = useRemoveDeedParty(deedId);
    const [name, setName] = useState("");
    const [partyType, setPartyType] = useState<PartyType>("individual");
    const [aadhaar, setAadhaar] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [pan, setPan] = useState("");
    const [panFile, setPanFile] = useState<File | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const panFileRef = useRef<HTMLInputElement>(null);

    function reset() {
      setName("");
      setPartyType("individual");
      setAadhaar("");
      setFile(null);
      setPan("");
      setPanFile(null);
      setErr(null);
      if (fileRef.current) fileRef.current.value = "";
      if (panFileRef.current) panFileRef.current.value = "";
    }

    function addNew() {
      setErr(null);
      const digits = aadhaar.replace(/[^0-9]/g, "");
      const panTrimmed = pan.trim().toUpperCase();
      if (!name.trim()) {
        setErr(T("Enter the person's name.", "व्यक्ति का नाम डालें।"));
        return;
      }
      if (aadhaar && digits.length !== 12) {
        setErr(T("Enter a valid 12-digit Aadhaar number.", "सही 12 अंकों का आधार नंबर डालें।"));
        return;
      }
      if (pan && !/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/.test(panTrimmed)) {
        setErr(T("Enter a valid 10-character PAN number.", "सही 10 अक्षर का पेन नंबर डालें।"));
        return;
      }
      if (!digits && !panTrimmed) {
        setErr(T("Enter an Aadhaar number or PAN number.", "आधार नंबर या पेन नंबर डालें।"));
        return;
      }
      if (digits && !file) {
        setErr(T("Choose the Aadhaar card image/PDF.", "आधार कार्ड की इमेज/PDF चुनें।"));
        return;
      }
      if (panTrimmed && !panFile) {
        setErr(T("Choose the PAN card image/PDF.", "पेन कार्ड की इमेज/PDF चुनें।"));
        return;
      }
      add.mutate(
        {
          role,
          name: name.trim(),
          partyType,
          aadhaarNumber: digits || undefined,
          panNumber: panTrimmed || undefined,
          file: file || undefined,
          panFile: panFile || undefined,
        },
        { onSuccess: reset, onError: (e) => setErr(e.message) },
      );
    }

  return (
    <section style={{ borderTop: "1px solid var(--border, #333)", paddingTop: 12 }}>
      <h4 style={{ margin: "0 0 8px", fontSize: 15 }}>
        {title} <span style={{ opacity: 0.55 }}>({items.length})</span>
      </h4>
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {items.map((it) => {
            const removing = remove.isPending && remove.variables === it.linkId;
            return (
              <div key={it.linkId} style={ROW}>
                <span style={{ fontWeight: 600 }}>{it.party.name}</span>
                <span style={{ opacity: 0.6, fontSize: 13 }}>{maskAadhaar(it.party.aadhaarNumber)}</span>
                <button
                  type="button"
                  className="doc-btn"
                  style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5 }}
                  onClick={() => onView("parties/" + it.party.id + "/file")}
                >
                  <Eye size={15} /> {T("View", "देखें")}
                </button>
                <button
                  type="button"
                  className="doc-btn"
                  disabled={removing}
                  onClick={() => remove.mutate(it.linkId)}
                  title={T("Remove", "हटाएँ")}
                >
                  {removing ? T("Removing…", "हटा रहे…") : <Trash2 size={15} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <select
          className="district-input"
          style={{ flex: "0 0 130px" }}
          value={partyType}
          onChange={(e) => setPartyType(e.target.value as PartyType)}
        >
          <option value="individual">{T("Individual", "व्यक्ति")}</option>
          <option value="company">{T("Company/Firm", "कंपनी/फर्म")}</option>
        </select>
        <input
          className="district-input"
          style={{ flex: "1 1 150px" }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={partyType === "company" ? T("Company/Firm name", "कंपनी/फर्म का नाम") : T("Name", "नाम")}
        />
        <input
          className="district-input"
          style={{ flex: "1 1 150px" }}
          value={aadhaar}
          onChange={(e) => setAadhaar(e.target.value)}
          placeholder={T("Aadhaar number", "आधार नंबर")}
          inputMode="numeric"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          style={{ flex: "1 1 170px", fontSize: 13 }}
        />
        <input
          className="district-input"
          style={{ flex: "1 1 130px" }}
          value={pan}
          onChange={(e) => setPan(e.target.value.toUpperCase())}
          placeholder={T("PAN number", "पेन नंबर")}
        />
        <input
          ref={panFileRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setPanFile(e.target.files?.[0] ?? null)}
          style={{ flex: "1 1 170px", fontSize: 13 }}
        />
        <button
          type="button"
          className="btn-calc"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          disabled={add.isPending}
          onClick={addNew}
        >
          <UserPlus size={15} /> {add.isPending ? T("Adding…", "जोड़ रहे...") : T("Add new", "नया जोड़ें")}
        </button>
      </div>
      {err && (
        <p className="modal-error" style={{ marginTop: 8 }}>
          {err}
        </p>
      )}
    </section>
  );
}

function NaxaGroup({
  deedId,
  items,
  onView,
  T,
}: {
  deedId: string;
  items: NaxaMeta[];
  onView: (path: string) => void;
  T: T;
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
    <section style={{ borderTop: "1px solid var(--border, #333)", paddingTop: 12 }}>
      <h4 style={{ margin: "0 0 8px", fontSize: 15 }}>
        {T("Property map (Naxa)", "संपत्ति नक्शा")} <span style={{ opacity: 0.55 }}>({items.length})</span>
      </h4>
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {items.map((n) => {
            const removing = remove.isPending && remove.variables === n.id;
            return (
              <div key={n.id} style={ROW}>
                <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.fileName}</span>
                <button
                  type="button"
                  className="doc-btn"
                  style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5 }}
                  onClick={() => onView("deeds/" + deedId + "/naxa/" + n.id + "/file")}
                >
                  <Eye size={15} /> {T("View", "देखें")}
                </button>
                <button type="button" className="doc-btn" disabled={removing} onClick={() => remove.mutate(n.id)} title={T("Remove", "हटाएँ")}>
                  {removing ? T("Removing…", "हटा रहे…") : <Trash2 size={15} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <label className="btn-calc" style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
        <FileUp size={15} /> {add.isPending ? T("Uploading…", "अपलोड हो रहा…") : T("Upload map (image / PDF / Word)", "नक्शा अपलोड करें (इमेज / PDF / Word)")}
        <input ref={fileRef} type="file" accept={NAXA_ACCEPT} onChange={onFile} style={{ display: "none" }} />
      </label>
      {err && (
        <p className="modal-error" style={{ marginTop: 8 }}>
          {err}
        </p>
      )}
    </section>
  );
}
