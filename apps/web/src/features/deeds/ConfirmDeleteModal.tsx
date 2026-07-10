import { useEffect } from "react";
import { useScrollLock } from "../../lib/useScrollLock";

/**
 * Destructive-confirm dialog with an in-progress state. While `pending` the
 * dialog is locked open — overlay click, Escape and the ✕ are all disabled —
 * and the confirm button shows a spinner, so the user gets clear feedback that
 * the deletion is running rather than wondering if their click registered.
 */
export function ConfirmDeleteModal({
  title,
  message,
  itemName,
  confirmLabel,
  pendingLabel,
  cancelLabel,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  itemName?: string;
  confirmLabel: string;
  pendingLabel: string;
  cancelLabel: string;
  pending: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useScrollLock(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  return (
    <div className="modal-overlay" onClick={() => !pending && onClose()}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          {!pending && (
            <button className="modal-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          )}
        </div>

        <p style={{ marginBottom: itemName ? 6 : 16 }}>{message}</p>
        {itemName && (
          <p style={{ fontWeight: 700, marginBottom: 16 }}>“{itemName}”</p>
        )}
        {error && <p className="modal-error">{error}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button type="button" className="doc-btn" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm} disabled={pending}>
            {pending && <span className="spinner spinner--sm" aria-hidden />}
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
