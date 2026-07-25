import { useEffect, useState } from "react";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { useCreateOrganization } from "../auth/useAuth";

/** Settings/Sidebar → "Create Organisation": an additional org, separate from the user's personal workspace. */
export function CreateOrganizationModal({ onClose }: { onClose: () => void }) {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const create = useCreateOrganization();
  const [name, setName] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    create.mutate({ name: name.trim() }, { onSuccess: onClose });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{t("createOrgTitle")}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--muted)" }}>{t("createOrgSub")}</p>
        <form onSubmit={onSubmit} className="modal-form">
          <label className="modal-field">
            {t("createOrgNameLabel")}
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={200} autoFocus />
          </label>
          {create.isError && <p className="modal-error">{create.error.message}</p>}
          <button className="btn-calc modal-submit" type="submit" disabled={create.isPending}>
            {create.isPending ? "…" : t("createOrgSubmit")}
          </button>
          <button type="button" className="modal-link" onClick={onClose}>
            {t("createOrgCancel")}
          </button>
        </form>
      </div>
    </div>
  );
}
