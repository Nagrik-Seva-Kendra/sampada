import { useState } from "react";

/**
 * "Type it to confirm" dialog for permanently deleting WhatsApp requests: the
 * delete button stays disabled until the exact text (request number, or
 * "DELETE 5" for several) is typed.
 */
export function DeleteRequestDialog({
  title,
  expected,
  prompt,
  note,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  expected: string;
  prompt: string;
  note?: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const ok = typed.trim().replace(/\s+/g, " ").toUpperCase() === expected.toUpperCase();
  return (
    <div className="modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="modal-card modal-card--form wa-delete-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="बंद करें" disabled={busy}>
            ✕
          </button>
        </div>
        <form
          className="modal-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (ok && !busy) onConfirm();
          }}
        >
          <p style={{ fontWeight: 700, color: "var(--wa-danger)" }}>यह स्थायी है, वापस नहीं आएगा।</p>
          {note && <p className="doc-sub">{note}</p>}
          <label className="modal-field">
            {prompt}
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={expected} autoFocus autoComplete="off" />
          </label>
          {error && <p className="modal-error">{error}</p>}
          <button type="submit" className="wa-btn-delete modal-submit" disabled={!ok || busy}>
            {busy ? "हटा रहे हैं…" : "स्थायी रूप से हटाएँ"}
          </button>
        </form>
      </div>
    </div>
  );
}

/** One-shot message for the list page after a delete (survives the navigation). */
const TOAST_KEY = "wa-requests-toast";
export function setWaToast(message: string): void {
  try {
    sessionStorage.setItem(TOAST_KEY, message);
  } catch {
    /* storage unavailable: no toast */
  }
}
export function takeWaToast(): string | null {
  try {
    const m = sessionStorage.getItem(TOAST_KEY);
    sessionStorage.removeItem(TOAST_KEY);
    return m;
  } catch {
    return null;
  }
}
