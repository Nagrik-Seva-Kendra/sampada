import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { StaffRole } from "@sampada/shared";
import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { PasswordInput } from "../../components/PasswordInput";
import { BrandMark } from "../../components/icons";
import { useEmployeeSignup, useLogin, useSendEmailOtp, useVerifyEmailOtp } from "./useAuth";

const TABS: { role: StaffRole; key: StringKey }[] = [
  { role: "EMPLOYEE", key: "authEmployeeLogin" },
  { role: "ADMIN", key: "authAdminLogin" },
];

/** Public full-screen login — replaces the old LoginModal popover as the primary entry point. */
export function LoginPage() {
  const lang = useLang();
  const t = (k: StringKey) => translate(k, lang);
  const login = useLogin();
  const navigate = useNavigate();
  const [role, setRole] = useState<StaffRole>("EMPLOYEE");
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "join">("login");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    login.mutate(
      { role, login: loginValue, password },
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
        <p className="auth-brand-quote">{t("heroTitle")}</p>
        <p className="auth-brand-foot">{t("brandName")} · Sampada</p>
      </div>

      <div className="auth-panel">
        <div className="auth-card">
          {mode === "join" ? (
            <JoinTeamForm t={t} onBack={() => setMode("login")} />
          ) : (
            <>
              <div className="kicker">
                <span className="rule" />
                {t("loginKicker")}
              </div>
              <h1 className="page-title">{t("loginTitle")}</h1>

              <div className="login-tabs" role="tablist" style={{ marginTop: 18 }}>
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
                    autoComplete="off"
                    required
                  />
                </label>
                <label className="modal-field">
                  {t("authPassword")}
                  <PasswordInput
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="off"
                    required
                  />
                </label>
                {login.isError && <p className="modal-error">{login.error.message}</p>}
                <button className="btn-calc modal-submit" type="submit" disabled={login.isPending}>
                  {login.isPending ? "…" : t("authLogin")}
                </button>
                <button type="button" className="modal-link" onClick={() => navigate({ to: "/onboarding" })}>
                  {t("loginNoAccount")}
                </button>
                {role === "EMPLOYEE" && (
                  <button type="button" className="modal-link" onClick={() => setMode("join")}>
                    {t("loginJoinTeamLink")}
                  </button>
                )}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Join an existing team via its join code — public self-signup, stays PENDING until admin approval. */
function JoinTeamForm({ t, onBack }: { t: (k: StringKey) => string; onBack: () => void }) {
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
  const [joinCode, setJoinCode] = useState("");

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
      joinCode: joinCode.trim(),
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
    <>
      <div className="kicker">
        <span className="rule" />
        {t("authSignupTitle")}
      </div>
      <h1 className="page-title">{t("authSignupTitle")}</h1>
      <form onSubmit={onSubmit} className="modal-form" style={{ marginTop: 18 }}>
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
          {t("profileUsername")}
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            minLength={3}
            maxLength={50}
            placeholder={t("profileUsernamePlaceholder")}
            autoComplete="off"
            required
          />
        </label>
        <label className="modal-field">
          {t("authJoinCode")}
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} autoComplete="off" required />
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
            required
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
        {signup.isError && <p className="modal-error">{signup.error.message}</p>}
        <button className="btn-calc modal-submit" type="submit" disabled={signup.isPending}>
          {signup.isPending ? "…" : t("authSignupSubmit")}
        </button>
        <button type="button" className="modal-link" onClick={onBack}>
          {t("authBackToLogin")}
        </button>
      </form>
    </>
  );
}
