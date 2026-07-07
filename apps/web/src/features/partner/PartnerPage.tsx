import { useState } from "react";
import { useUiStore } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { usePartnerSignup } from "../deeds/useDeedRegister";
import { useSendEmailOtp, useVerifyEmailOtp } from "../auth/useAuth";
import { PasswordInput } from "../../components/PasswordInput";

const BENEFITS: StringKey[] = ["partnerB1", "partnerB2", "partnerB3"];

export function PartnerPage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const [showForm, setShowForm] = useState(false);

  return (
    <section className="page">
      <div className="wrap">
        <div className="kicker">
          <span className="rule" />
          {t("partnerTitle")}
        </div>
        <h2 className="page-title">{t("partnerTitle")}</h2>
        <p className="er-sub">{t("partnerP")}</p>

        <ul className="er-docs">
          {BENEFITS.map((b) => (
            <li key={b}>
              <span className="er-check">✓</span> {t(b)}
            </li>
          ))}
        </ul>

        {showForm ? (
          <PartnerSignupForm t={t} />
        ) : (
          <div className="er-note">
            <button className="btn-calc" onClick={() => setShowForm(true)}>
              {t("partnerCta")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/** Public partner self-registration; account stays PENDING until the admin approves it. */
function PartnerSignupForm({ t }: { t: (k: StringKey) => string }) {
  const signup = usePartnerSignup();
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
    return <p className="dr-status-active" style={{ marginTop: 20 }}>✓ {t("partnerSignupSuccess")}</p>;
  }

  return (
    <form onSubmit={onSubmit} className="modal-form" style={{ marginTop: 20, maxWidth: 420 }}>
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
          autoComplete="off"
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
          autoComplete="off"
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
      <button className="btn-calc" type="submit" disabled={signup.isPending}>
        {signup.isPending ? "…" : t("partnerSignupSubmit")}
      </button>
    </form>
  );
}
