import { useEffect, useState } from "react";
import { HTTPError } from "ky";
import type { StaffRole } from "@sampada/shared";
import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { PasswordInput } from "../../components/PasswordInput";
import { useScrollLock } from "../../lib/useScrollLock";
import { useEmployeeSignup, useLogin, useSendEmailOtp, useVerifyEmailOtp } from "./useAuth";

const TABS: { role: StaffRole; key: StringKey }[] = [
  { role: "EMPLOYEE", key: "authEmployeeLogin" },
  { role: "ADMIN", key: "authAdminLogin" },
  { role: "PARTNER", key: "authPartnerLogin" },
];

export function LoginModal({ onClose }: { onClose: () => void }) {
  const lang = useLang();
  const t = (k: StringKey) => translate(k, lang);
  const login = useLogin();
  const [role, setRole] = useState<StaffRole>("EMPLOYEE");
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");

  useScrollLock(true);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    login.mutate({ role, login: loginValue, password }, { onSuccess: onClose });
  }

  const loginPending = login.error instanceof HTTPError && login.error.response.status === 403;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{mode === "signup" ? t("authSignupTitle") : t("authLogin")}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {mode === "signup" ? (
          <EmployeeSignupForm t={t} onBack={() => setMode("login")} />
        ) : (
          <>
            <div className="login-tabs" role="tablist">
              {TABS.map((tab) => (
                <button
                  key={tab.role}
                  type="button"
                  role="tab"
                  aria-selected={role === tab.role}
                  className={role === tab.role ? "on" : ""}
                  onClick={() => setRole(tab.role)}
                >
                  {t(tab.key)}
                </button>
              ))}
            </div>
            <form onSubmit={onSubmit} className="modal-form">
              <label className="modal-field">
                {t("authUsername")}
                <input
                  type="text"
                  autoFocus
                  value={loginValue}
                  onChange={(e) => setLoginValue(e.target.value)}
                  required
                />
              </label>
              <label className="modal-field">
                {t("authPassword")}
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>
              {login.isError && (
                <p className="modal-error">{t(loginPending ? "authPending" : "authInvalid")}</p>
              )}
              <button className="btn-calc modal-submit" type="submit" disabled={login.isPending}>
                {login.isPending ? "…" : t("authLogin")}
              </button>
              {role === "EMPLOYEE" && (
                <button type="button" className="modal-link" onClick={() => setMode("signup")}>
                  {t("authSignupLink")}
                </button>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/** Public employee self-signup form; account stays PENDING until the admin approves it. */
function EmployeeSignupForm({
  t,
  onBack,
}: {
  t: (k: StringKey) => string;
  onBack: () => void;
}) {
  const signup = useEmployeeSignup();
  const sendOtp = useSendEmailOtp();
  const verifyOtp = useVerifyEmailOtp();
  const [fname, setFname] = useState("");
  const [lname, setLname] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [emailOtp, setEmailOtp] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    signup.mutate({
      fname: fname.trim(),
      lname: lname.trim(),
      email: email.trim(),
      username: username.trim(),
      phone: phone.trim(),
      password,
      emailOtp: emailOtp.trim(),
    });
  }

  if (signup.isSuccess) {
    return (
      <div className="modal-form">
        <p className="dr-status-active">✓ {t("authSignupSuccess")}</p>
        <button type="button" className="btn-calc modal-submit" onClick={onBack}>
          {t("authBackToLogin")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="modal-form">
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
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
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
        {t("profileUsername")}
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          minLength={3}
          maxLength={50}
          placeholder={t("profileUsernamePlaceholder")}
          required
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
          required
        />
      </label>
      <label className="modal-field">
        {t("authPassword")}
        <PasswordInput
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
      </label>
      {signup.isError && <p className="modal-error">{t("authSignupFailed")}</p>}
      <button className="btn-calc modal-submit" type="submit" disabled={signup.isPending}>
        {signup.isPending ? "…" : t("authSignupSubmit")}
      </button>
      <button type="button" className="modal-link" onClick={onBack}>
        {t("authBackToLogin")}
      </button>
    </form>
  );
}
