import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { PasswordInput } from "../../components/PasswordInput";
import { BrandMark } from "../../components/icons";
import { useOnboard, useSendEmailOtp, useVerifyEmailOtp } from "../auth/useAuth";

/**
 * Public full-screen entry point for the landing page's "Try Now" CTA.
 * Creates the account's organization directly — the founder becomes its OWNER.
 */
export function OnboardingPage() {
  const lang = useLang();
  const t = (k: StringKey) => translate(k, lang);
  const navigate = useNavigate();
  const onboard = useOnboard();
  const sendOtp = useSendEmailOtp();
  const verifyOtp = useVerifyEmailOtp();

  const [orgName, setOrgName] = useState("");
  const [fname, setFname] = useState("");
  const [lname, setLname] = useState("");
  const [email, setEmail] = useState("");
  const [emailOtp, setEmailOtp] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    onboard.mutate(
      {
        orgName: orgName.trim(),
        fname: fname.trim(),
        lname: lname.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        username: username.trim() || undefined,
        password,
        emailOtp: emailOtp.trim(),
      },
      { onSuccess: () => navigate({ to: "/" }) },
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-brand">
        <div className="auth-brand-mark">
          <BrandMark />
          {t("brandName")}
        </div>
        <p className="auth-brand-quote">{t("onboardSub")}</p>
        <p className="auth-brand-foot">{t("brandName")} · Sampada</p>
      </div>

      <div className="auth-panel">
        <div className="auth-card">
          <div className="kicker">
            <span className="rule" />
            {t("onboardKicker")}
          </div>
          <h1 className="page-title">{t("onboardTitle")}</h1>
          <p className="auth-card-sub">{t("onboardSub")}</p>

          <form onSubmit={onSubmit} className="modal-form">
            <label className="modal-field">
              {t("authOrgName")}
              <input value={orgName} onChange={(e) => setOrgName(e.target.value)} required minLength={2} maxLength={200} autoFocus />
            </label>
            <label className="modal-field">
              {t("profileFname")}
              <input value={fname} onChange={(e) => setFname(e.target.value)} required maxLength={100} />
            </label>
            <label className="modal-field">
              {t("profileLname")}
              <input value={lname} onChange={(e) => setLname(e.target.value)} required maxLength={100} />
            </label>
            <label className="modal-field">
              {t("profileEmail")}
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required />
            </label>
            <div className="modal-field">
              <button
                type="button"
                className="btn-calc"
                onClick={() => sendOtp.mutate(email.trim())}
                disabled={!email.trim() || sendOtp.isPending}
              >
                {sendOtp.isPending ? "…" : t(sendOtp.isSuccess ? "authResendOtp" : "authSendOtp")}
              </button>
              {sendOtp.isSuccess && <p className="dr-status-active">✓ {t("authOtpSent")}</p>}
              {sendOtp.isError && <p className="modal-error">{t("authOtpFailed")}</p>}
            </div>
            <label className="modal-field">
              {t("authOtpLabel")}
              <input
                value={emailOtp}
                onChange={(e) => {
                  setEmailOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
                  verifyOtp.reset();
                }}
                placeholder={t("authOtpPlaceholder")}
                inputMode="numeric"
                maxLength={6}
                required
              />
            </label>
            <div className="modal-field">
              <button
                type="button"
                className="btn-calc"
                onClick={() => verifyOtp.mutate({ email: email.trim(), code: emailOtp.trim() })}
                disabled={emailOtp.trim().length !== 6 || verifyOtp.isPending}
              >
                {verifyOtp.isPending ? "…" : t("authVerifyOtp")}
              </button>
              {verifyOtp.isSuccess && <p className="dr-status-active">✓ {t("authOtpVerified")}</p>}
              {verifyOtp.isError && <p className="modal-error">{t("authOtpVerifyFailed")}</p>}
            </div>
            <label className="modal-field">
              {t("addUserUsername")}
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                minLength={3}
                maxLength={50}
                placeholder={t("addUserUsernamePlaceholder")}
                autoComplete="off"
              />
            </label>
            <label className="modal-field">
              {t("authPhone")}
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                pattern="[0-9]{10}"
                maxLength={10}
                autoComplete="off"
              />
            </label>
            <label className="modal-field">
              {t("authPassword")}
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
            </label>
            {onboard.isError && <p className="modal-error">{onboard.error.message}</p>}
            <button className="btn-calc modal-submit" type="submit" disabled={onboard.isPending}>
              {onboard.isPending ? "…" : t("onboardSubmit")}
            </button>
            <button type="button" className="modal-link" onClick={() => navigate({ to: "/login" })}>
              {t("onboardHaveAccount")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
