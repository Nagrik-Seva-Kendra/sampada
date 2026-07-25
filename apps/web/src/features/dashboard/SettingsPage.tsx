import { useState } from "react";
import { useUiStore } from "../../stores/uiStore";
import { useActiveOrganization } from "../../stores/authStore";
import { translate, type StringKey } from "../../i18n/strings";
import { ProfilePage } from "../profile/ProfilePage";
import { CreateOrganizationModal } from "./CreateOrganizationModal";
import { ChangePasswordModal } from "./ChangePasswordModal";

/**
 * Settings: workspace info + create-organisation + change password, then the
 * personal profile form. Open to every org role — unlike the old /profile
 * route, which only employees could reach.
 */
export function SettingsPage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const activeOrganization = useActiveOrganization();
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

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
              <button type="button" className="btn-calc" onClick={() => setCreateOrgOpen(true)}>
                {t("workspaceCreateOrg")}
              </button>
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
        </div>
      </section>

      <ProfilePage />

      {createOrgOpen && <CreateOrganizationModal onClose={() => setCreateOrgOpen(false)} />}
      {pwOpen && <ChangePasswordModal lang={lang} onClose={() => setPwOpen(false)} />}
    </>
  );
}
