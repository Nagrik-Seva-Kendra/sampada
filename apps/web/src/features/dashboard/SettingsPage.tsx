import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { hasPermission } from "@sampada/shared";
import { useUiStore } from "../../stores/uiStore";
import { useActiveOrganization } from "../../stores/authStore";
import { translate, type StringKey } from "../../i18n/strings";
import { ProfilePage } from "../profile/ProfilePage";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { useDeleteOrganization } from "../auth/useAuth";

/**
 * Settings: workspace info + change password, then the personal profile
 * form. Open to every org role — unlike the old /profile route, which only
 * employees could reach.
 */
export function SettingsPage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const activeOrganization = useActiveOrganization();
  const [pwOpen, setPwOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const canDelete = !!activeOrganization && hasPermission(activeOrganization.role, "org.delete");

  return (
    <>
      <section className="page">
        <div className="wrap" style={{ maxWidth: 560 }}>
          <div className="kicker">
            <span className="rule" />
            {t("settingsTitle")}
          </div>
          <h2 className="page-title">{t("settingsWorkspaceSection")}</h2>

          {activeOrganization && (
            <div
              style={{
                marginTop: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: 14,
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                background: "var(--surface)",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{activeOrganization.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{activeOrganization.role}</div>
              </div>
            </div>
          )}

          <button
            type="button"
            className="btn-calc"
            style={{ marginTop: 14 }}
            onClick={() => setPwOpen(true)}
          >
            {lang === "hi" ? "पासवर्ड बदलें" : "Change Password"}
          </button>

          {canDelete && (
            <div
              style={{
                marginTop: 32,
                padding: 16,
                border: "1px solid var(--primary)",
                borderRadius: "var(--radius)",
                background: "color-mix(in srgb, var(--primary) 6%, transparent)",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--primary)", marginBottom: 4 }}>
                {t("settingsDangerZone")}
              </div>
              <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 10px" }}>{t("deleteOrgWarning")}</p>
              <button type="button" className="btn-danger" onClick={() => setDeleteOpen(true)}>
                {t("settingsDeleteOrg")}
              </button>
            </div>
          )}
        </div>
      </section>

      <ProfilePage />

      {pwOpen && <ChangePasswordModal lang={lang} onClose={() => setPwOpen(false)} />}
      {deleteOpen && activeOrganization && (
        <DeleteOrgModal orgName={activeOrganization.name} t={t} onClose={() => setDeleteOpen(false)} />
      )}
    </>
  );
}

function DeleteOrgModal({
  orgName,
  t,
  onClose,
}: {
  orgName: string;
  t: (k: StringKey) => string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const deleteOrg = useDeleteOrganization();
  const [confirmText, setConfirmText] = useState("");
  const canConfirm = confirmText.trim() === orgName.trim();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{t("deleteOrgConfirmTitle")}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--muted)" }}>{t("deleteOrgWarning")}</p>
        <div className="modal-form">
          <label className="modal-field">
            {t("deleteOrgConfirmPrompt")} <strong style={{ color: "var(--fg)" }}>{orgName}</strong>
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoFocus autoComplete="off" />
          </label>
          {deleteOrg.isError && <p className="modal-error">{deleteOrg.error.message}</p>}
          <button
            type="button"
            className="btn-danger"
            style={{ width: "100%" }}
            disabled={!canConfirm || deleteOrg.isPending}
            onClick={() =>
              deleteOrg.mutate(undefined, {
                onSuccess: () => navigate({ to: "/login" }),
              })
            }
          >
            {deleteOrg.isPending ? "…" : t("settingsDeleteOrg")}
          </button>
          <button type="button" className="modal-link" onClick={onClose}>
            {t("settingsCancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
