import { useEffect, useState } from "react";
import type { Language } from "@sampada/shared";
import { PasswordInput } from "../../components/PasswordInput";
import { useChangePassword } from "../profile/useProfile";

/** Self-service change-password modal — available to every logged-in account, any org role. */
export function ChangePasswordModal({ lang, onClose }: { lang: Language; onClose: () => void }) {
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const L = (en: string, hi: string) => (lang === "hi" ? hi : en);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    change.mutate({ currentPassword: current, password: next });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{L("Change Password", "पासवर्ड बदलें")}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {change.isSuccess ? (
          <div className="modal-form">
            <p className="dr-status-active">✓ {L("Password changed successfully.", "पासवर्ड सफलतापूर्वक बदल गया।")}</p>
            <button type="button" className="btn-calc modal-submit" onClick={onClose}>
              {L("Done", "ठीक है")}
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="modal-form">
            <label className="modal-field">
              {L("Current password", "वर्तमान पासवर्ड")}
              <PasswordInput
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <label className="modal-field">
              {L("New password", "नया पासवर्ड")}
              <PasswordInput
                value={next}
                onChange={(e) => setNext(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
            </label>
            <label className="modal-field">
              {L("Confirm new password", "नया पासवर्ड दोबारा")}
              <PasswordInput
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
            </label>
            {mismatch && <p className="modal-error">{L("New passwords do not match.", "नए पासवर्ड मेल नहीं खाते।")}</p>}
            {change.isError && <p className="modal-error">{change.error.message}</p>}
            <button className="btn-calc modal-submit" type="submit" disabled={change.isPending}>
              {change.isPending ? "…" : L("Change Password", "पासवर्ड बदलें")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
