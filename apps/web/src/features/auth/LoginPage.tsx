import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Mail, Lock } from "lucide-react";
import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { PasswordInput } from "../../components/PasswordInput";
import { BrandMark } from "../../components/icons";
import { useEmployeeSignup, useForgotPassword, useLogin, useSendEmailOtp, useVerifyEmailOtp } from "./useAuth";

const LOGIN_PERKS: StringKey[] = ["loginPerk1", "loginPerk2", "loginPerk3"];

/** Public full-screen login — direct, no role tabs: the account's own stored role decides admin vs. employee. */
export function LoginPage() {
  const lang = useLang();
  const t = (k: StringKey) => translate(k, lang);
  const login = useLogin();
  const navigate = useNavigate();
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [mode, setMode] = useState<"login" | "join" | "forgot">("login");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    login.mutate(
      { login: loginValue, password, remember },
      { onSuccess: () => navigate({ to: "/welcome" }) },
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-brand auth-brand--deco">
        <span className="auth-brand-deco-mark" aria-hidden="true">
          <svg width="360" height="360" viewBox="0 0 48 48">
            <path d="M24 8 12 18v2h24v-2L24 8Z" fill="#fff" />
            <rect x="14" y="20" width="3.5" height="15" fill="#fff" />
            <rect x="22" y="20" width="3.5" height="15" fill="#fff" />
            <rect x="30" y="20" width="3.5" height="15" fill="#fff" />
            <rect x="12" y="36" width="24" height="3.5" fill="#fff" />
          </svg>
        </span>
        <span className="auth-brand-deco-glow" aria-hidden="true" />

        <div className="auth-brand-mark">
          <BrandMark />
          {t("brandName")}
        </div>

        <div>
          <p className="auth-brand-quote">{t("loginBrandQuote")}</p>
          <div className="ob-perks" style={{ marginBottom: 0 }}>
            {LOGIN_PERKS.map((key) => (
              <div className="ob-perk" key={key} style={{ color: "var(--primary-fg)" }}>
                <span className="ob-perk-chip" style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}>
                  ✓
                </span>
                {t(key)}
              </div>
            ))}
          </div>
        </div>

        <p className="auth-brand-foot">{t("brandName")} · Government of Madhya Pradesh</p>
      </div>

      <div className="auth-panel">
        <div className="auth-card">
          {mode === "join" ? (
            <JoinTeamForm t={t} onBack={() => setMode("login")} />
          ) : mode === "forgot" ? (
            <ForgotPasswordForm t={t} onBack={() => setMode("login")} />
          ) : (
            <>
              <div className="kicker">
                <span className="rule" />
                {t("loginKicker")}
              </div>
              <h1 className="page-title">{t("loginTitle")}</h1>
              <p className="auth-card-sub">{t("loginSub")}</p>

              <form onSubmit={onSubmit} className="modal-form">
                <label className="modal-field">
                  {t("authUsername")}
                  <div className="field-icon-wrap">
                    <Mail size={16} strokeWidth={2} />
                    <input
                      type="text"
                      autoFocus
                      value={loginValue}
                      onChange={(e) => setLoginValue(e.target.value)}
                      autoComplete="username"
                      required
                    />
                  </div>
                </label>
                <label className="modal-field">
                  <div className="modal-field-row">
                    {t("authPassword")}
                    <button type="button" className="modal-link" onClick={() => setMode("forgot")}>
                      {t("loginForgot")}
                    </button>
                  </div>
                  <div className="field-icon-wrap">
                    <Lock size={16} strokeWidth={2} />
                    <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                  </div>
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  {t("loginKeepSignedIn")}
                </label>
                {login.isError && <p className="modal-error">{login.error.message}</p>}
                <button className="btn-calc modal-submit" type="submit" disabled={login.isPending}>
                  {login.isPending ? "…" : t("authLogin")}
                </button>

                <div className="divider-or">{t("loginOr")}</div>

                <button type="button" className="modal-link" onClick={() => navigate({ to: "/onboarding" })}>
                  {t("loginNoAccount")}
                </button>
                <button type="button" className="modal-link" onClick={() => setMode("join")}>
                  {t("loginJoinTeamLink")}
                </button>
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
          {sendOtp.isError && <p className="modal-error">{sendOtp.error.message}</p>}
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
          {verifyOtp.isError && <p className="modal-error">{verifyOtp.error.message}</p>}
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

/** Self-service "forgot password" — always shows the same generic result, win or miss. */
function ForgotPasswordForm({ t, onBack }: { t: (k: StringKey) => string; onBack: () => void }) {
  const forgot = useForgotPassword();
  const [loginValue, setLoginValue] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    forgot.mutate(loginValue.trim());
  }

  if (forgot.isSuccess) {
    return (
      <div className="modal-form">
        <p className="dr-status-active">✓ {t("loginForgotSent")}</p>
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
        {t("loginForgotTitle")}
      </div>
      <h1 className="page-title">{t("loginForgotTitle")}</h1>
      <p className="auth-card-sub">{t("loginForgotSub")}</p>
      <form onSubmit={onSubmit} className="modal-form">
        <label className="modal-field">
          {t("authUsername")}
          <input
            type="text"
            autoFocus
            value={loginValue}
            onChange={(e) => setLoginValue(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        {forgot.isError && <p className="modal-error">{forgot.error.message}</p>}
        <button className="btn-calc modal-submit" type="submit" disabled={forgot.isPending || !loginValue.trim()}>
          {forgot.isPending ? "…" : t("loginForgotSubmit")}
        </button>
        <button type="button" className="modal-link" onClick={onBack}>
          {t("authBackToLogin")}
        </button>
      </form>
    </>
  );
}
