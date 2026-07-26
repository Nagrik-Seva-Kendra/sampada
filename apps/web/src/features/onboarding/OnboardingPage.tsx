import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronLeft,
  ClipboardCheck,
  FileCheck,
  FileEdit,
  Home,
  Landmark,
  Scale,
  Search,
  Users,
} from "lucide-react";
import { useLang } from "../../stores/uiStore";
import { translate, type StringKey } from "../../i18n/strings";
import { PasswordInput } from "../../components/PasswordInput";
import { BrandMark } from "../../components/icons";
import { useOnboard, useSendEmailOtp, useVerifyEmailOtp } from "../auth/useAuth";

type Role = "agent" | "writer" | "legal" | "office";
type Goal = "rates" | "deeds" | "team" | "eregistry";

const ROLE_OPTIONS: { value: Role; icon: React.ReactNode; titleKey: StringKey; subKey: StringKey }[] = [
  { value: "agent", icon: <Home size={22} strokeWidth={2} />, titleKey: "obRoleAgentTitle", subKey: "obRoleAgentSub" },
  { value: "writer", icon: <FileEdit size={22} strokeWidth={2} />, titleKey: "obRoleWriterTitle", subKey: "obRoleWriterSub" },
  { value: "legal", icon: <Scale size={22} strokeWidth={2} />, titleKey: "obRoleLegalTitle", subKey: "obRoleLegalSub" },
  { value: "office", icon: <Landmark size={22} strokeWidth={2} />, titleKey: "obRoleOfficeTitle", subKey: "obRoleOfficeSub" },
];

const GOAL_OPTIONS: { value: Goal; icon: React.ReactNode; titleKey: StringKey; subKey: StringKey }[] = [
  { value: "rates", icon: <Search size={22} strokeWidth={2} />, titleKey: "obGoalRatesTitle", subKey: "obGoalRatesSub" },
  { value: "deeds", icon: <FileCheck size={22} strokeWidth={2} />, titleKey: "obGoalDeedsTitle", subKey: "obGoalDeedsSub" },
  { value: "team", icon: <Users size={22} strokeWidth={2} />, titleKey: "obGoalTeamTitle", subKey: "obGoalTeamSub" },
  { value: "eregistry", icon: <ClipboardCheck size={22} strokeWidth={2} />, titleKey: "obGoalEregistryTitle", subKey: "obGoalEregistrySub" },
];

const TRACKER_KEYS: StringKey[] = ["obStepGetStarted", "obStepAboutYou", "obStepYourGoal", "obStepWorkspace", "obStepAccount"];
const PROGRESS_PCT = [0, 25, 50, 75, 100, 100];

/**
 * Public full-screen entry point for the landing page's "Try Now" CTA. A
 * multi-step wizard (welcome → role → goal → workspace → account → success);
 * only the workspace + account steps feed the actual signup call — role/goal
 * are collected for onboarding context, not sent to the API. Creates the
 * account's organization directly — the founder becomes its OWNER.
 */
export function OnboardingPage() {
  const lang = useLang();
  const t = (k: StringKey) => translate(k, lang);
  const navigate = useNavigate();
  const onboard = useOnboard();
  const sendOtp = useSendEmailOtp();
  const verifyOtp = useVerifyEmailOtp();

  const [step, setStep] = useState(0);
  const [role, setRole] = useState<Role | "">("");
  const [goal, setGoal] = useState<Goal | "">("");
  const [orgName, setOrgName] = useState("");
  const [fname, setFname] = useState("");
  const [lname, setLname] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  function canContinue(s: number): boolean {
    switch (s) {
      case 1:
        return !!role;
      case 2:
        return !!goal;
      case 3:
        return orgName.trim().length > 1 && fname.trim().length > 0 && lname.trim().length > 0;
      case 4:
        return !!email.trim() && password.length >= 8 && verifyOtp.isSuccess;
      default:
        return true;
    }
  }

  function next() {
    if (!canContinue(step)) return;
    setStep((s) => Math.min(s + 1, 5));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }
  /** Role/goal are personalization only, never required to finish onboarding. */
  function skip() {
    setStep((s) => Math.min(s + 1, 5));
  }

  function onEmailChange(value: string) {
    setEmail(value);
    setOtp("");
    sendOtp.reset();
    verifyOtp.reset();
  }
  function onOtpChange(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setOtp(digits);
    verifyOtp.reset();
    if (digits.length === 6) verifyOtp.mutate({ email: email.trim(), code: digits });
  }

  function submitAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!canContinue(4)) return;
    onboard.mutate(
      {
        orgName: orgName.trim(),
        fname: fname.trim(),
        lname: lname.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        username: username.trim() || undefined,
        password,
        emailOtp: otp.trim(),
      },
      { onSuccess: () => setStep(5) },
    );
  }

  const showProgress = step >= 1 && step <= 4;
  const trackerCurrent = Math.min(step, 5);
  const roleOption = ROLE_OPTIONS.find((r) => r.value === role);
  const goalOption = GOAL_OPTIONS.find((g) => g.value === goal);

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
          <p className="auth-brand-quote">{t("onboardBrandQuote")}</p>
          <div className="ob-tracker">
            {TRACKER_KEYS.map((key, i) => {
              const done = trackerCurrent > i;
              const active = trackerCurrent === i;
              return (
                <div className="ob-tracker-row" key={key}>
                  <div className={"ob-tracker-circle" + (done ? " done" : "") + (active ? " active" : "")}>
                    {done ? <Check size={14} strokeWidth={3} /> : i + 1}
                  </div>
                  <div className={"ob-tracker-label" + (done ? " done" : "") + (active ? " active" : "")}>{t(key)}</div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="auth-brand-foot">{t("brandName")} · Government of Madhya Pradesh</p>
      </div>

      <div className="auth-panel">
        <div className="auth-card" style={{ maxWidth: 456 }}>
          {showProgress && (
            <div style={{ marginBottom: 34 }}>
              <div className="ob-step-head">
                <button type="button" className="ob-back-btn" onClick={back}>
                  <ChevronLeft size={15} strokeWidth={2.4} />
                  {t("obBack")}
                </button>
                <span className="ob-step-counter">{lang === "hi" ? `चरण ${step} / 4` : `Step ${step} of 4`}</span>
              </div>
              <div className="ob-progress">
                <div className="ob-progress-fill" style={{ width: `${PROGRESS_PCT[step]}%` }} />
              </div>
            </div>
          )}

          {step === 0 && (
            <div className="ob-fade">
              <div className="kicker">
                <span className="rule" />
                {t("onboardKicker")}
              </div>
              <h1 className="page-title" style={{ fontSize: 38, lineHeight: 1.08, marginBottom: 14 }}>
                {t("onboardTitle")}
              </h1>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--muted)", margin: "0 0 30px" }}>{t("onboardSub")}</p>
              <div className="ob-perks">
                {(["obPerk1", "obPerk2", "obPerk3"] as StringKey[]).map((key) => (
                  <div className="ob-perk" key={key}>
                    <span className="ob-perk-chip">
                      <Check size={14} strokeWidth={3} />
                    </span>
                    {t(key)}
                  </div>
                ))}
              </div>
              <button type="button" className="btn-calc ob-continue" onClick={next}>
                {t("obContinue")}
              </button>
              <p style={{ textAlign: "center", fontSize: 13.5, color: "var(--muted)", margin: "16px 0 0" }}>
                <button type="button" className="modal-link" onClick={() => navigate({ to: "/login" })}>
                  {t("onboardHaveAccount")}
                </button>
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="ob-fade">
              <h1 className="page-title" style={{ fontSize: 29, marginBottom: 8 }}>
                {t("obRoleTitle")}
              </h1>
              <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--muted)", margin: "0 0 26px" }}>{t("obRoleSub")}</p>
              <div className="ob-options">
                {ROLE_OPTIONS.map((opt) => {
                  const sel = role === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={"ob-option" + (sel ? " on" : "")}
                      onClick={() => setRole(opt.value)}
                    >
                      <span className="ob-option-icon">{opt.icon}</span>
                      <span className="ob-option-body">
                        <span className="ob-option-title">{t(opt.titleKey)}</span>
                        <span className="ob-option-sub">{t(opt.subKey)}</span>
                      </span>
                      <span className="ob-option-dot" />
                    </button>
                  );
                })}
              </div>
              <button type="button" className="btn-calc ob-continue" onClick={next} disabled={!canContinue(1)}>
                {t("obContinue")}
              </button>
              <button type="button" className="modal-link" onClick={skip}>
                {t("obSkip")}
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="ob-fade">
              <h1 className="page-title" style={{ fontSize: 29, marginBottom: 8 }}>
                {t("obGoalTitle")}
              </h1>
              <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--muted)", margin: "0 0 26px" }}>{t("obGoalSub")}</p>
              <div className="ob-options">
                {GOAL_OPTIONS.map((opt) => {
                  const sel = goal === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={"ob-option" + (sel ? " on" : "")}
                      onClick={() => setGoal(opt.value)}
                    >
                      <span className="ob-option-icon">{opt.icon}</span>
                      <span className="ob-option-body">
                        <span className="ob-option-title">{t(opt.titleKey)}</span>
                        <span className="ob-option-sub">{t(opt.subKey)}</span>
                      </span>
                      <span className="ob-option-dot" />
                    </button>
                  );
                })}
              </div>
              <button type="button" className="btn-calc ob-continue" onClick={next} disabled={!canContinue(2)}>
                {t("obContinue")}
              </button>
              <button type="button" className="modal-link" onClick={skip}>
                {t("obSkip")}
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="ob-fade">
              <h1 className="page-title" style={{ fontSize: 29, marginBottom: 8 }}>
                {t("obWorkspaceTitle")}
              </h1>
              <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--muted)", margin: "0 0 26px" }}>{t("obWorkspaceSub")}</p>
              <div className="modal-form">
                <label className="modal-field">
                  {t("authOrgName")}
                  <input value={orgName} onChange={(e) => setOrgName(e.target.value)} minLength={2} maxLength={200} autoFocus />
                </label>
                <label className="modal-field">
                  {t("profileFname")}
                  <input value={fname} onChange={(e) => setFname(e.target.value)} maxLength={100} />
                </label>
                <label className="modal-field">
                  {t("profileLname")}
                  <input value={lname} onChange={(e) => setLname(e.target.value)} maxLength={100} />
                </label>
              </div>
              <button type="button" className="btn-calc ob-continue" onClick={next} disabled={!canContinue(3)}>
                {t("obContinue")}
              </button>
            </div>
          )}

          {step === 4 && (
            <form className="ob-fade" onSubmit={submitAccount}>
              <h1 className="page-title" style={{ fontSize: 29, marginBottom: 8 }}>
                {t("obAccountTitle")}
              </h1>
              <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--muted)", margin: "0 0 26px" }}>{t("obAccountSub")}</p>
              <div className="modal-form">
                <label className="modal-field">
                  {t("profileEmail")}
                  <div className="ob-otp-row">
                    <input type="email" value={email} onChange={(e) => onEmailChange(e.target.value)} autoComplete="off" />
                    <button
                      type="button"
                      className="btn-calc"
                      onClick={() => sendOtp.mutate(email.trim())}
                      disabled={!email.trim() || sendOtp.isPending}
                    >
                      {sendOtp.isPending ? "…" : t(sendOtp.isSuccess ? "authResendOtp" : "authSendOtp")}
                    </button>
                  </div>
                  {sendOtp.isSuccess && <p className="dr-status-active">✓ {t("authOtpSent")}</p>}
                  {sendOtp.isError && <p className="modal-error">{t("authOtpFailed")}</p>}
                </label>

                {sendOtp.isSuccess && (
                  <label className="modal-field">
                    {t("authOtpLabel")}
                    <div className="ob-otp-row">
                      <input
                        value={otp}
                        onChange={(e) => onOtpChange(e.target.value)}
                        inputMode="numeric"
                        maxLength={6}
                        placeholder={t("authOtpPlaceholder")}
                      />
                      {verifyOtp.isPending && <span className="spinner spinner--sm" />}
                      {verifyOtp.isSuccess && (
                        <span className="ob-verified">
                          <Check size={16} strokeWidth={3} />
                          {t("obVerifiedBadge")}
                        </span>
                      )}
                    </div>
                    {verifyOtp.isError && <p className="modal-error">{t("authOtpVerifyFailed")}</p>}
                  </label>
                )}

                <div className="form-grid">
                  <label className="modal-field">
                    {t("authPhone")}
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
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
                    />
                  </label>
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
                {onboard.isError && <p className="modal-error">{onboard.error.message}</p>}
              </div>
              <button type="submit" className="btn-calc ob-continue" disabled={!canContinue(4) || onboard.isPending}>
                {onboard.isPending ? "…" : t("onboardSubmit")}
              </button>
            </form>
          )}

          {step === 5 && (
            <div className="ob-fade ob-success">
              <div className="ob-success-icon-outer">
                <div className="ob-success-icon-inner">
                  <Check size={30} strokeWidth={3} />
                </div>
              </div>
              <h1 className="page-title" style={{ fontSize: 32, marginBottom: 12 }}>
                {t("obSuccessTitle")}
                {fname.trim() ? `, ${fname.trim()}!` : "!"}
              </h1>
              <p style={{ fontSize: 15.5, lineHeight: 1.6, color: "var(--muted)", margin: "0 auto 28px", maxWidth: 380 }}>
                {t("obSuccessSubPrefix")} <strong style={{ color: "var(--fg)" }}>{orgName.trim()}</strong> {t("obSuccessSubSuffix")}
              </p>
              <div className="ob-summary">
                <div className="ob-summary-row">
                  <span className="ob-summary-icon">
                    <Check size={18} strokeWidth={2} />
                  </span>
                  <div>
                    <div className="ob-summary-title">{t("obSuccessRoleLabel")}</div>
                    <div className="ob-summary-sub">{roleOption ? t(roleOption.titleKey) : "—"}</div>
                  </div>
                </div>
                <div className="ob-summary-row">
                  <span className="ob-summary-icon">
                    <Check size={18} strokeWidth={2} />
                  </span>
                  <div>
                    <div className="ob-summary-title">{t("obSuccessGoalLabel")}</div>
                    <div className="ob-summary-sub">{goalOption ? t(goalOption.titleKey) : "—"}</div>
                  </div>
                </div>
              </div>
              <button type="button" className="btn-calc ob-continue" onClick={() => navigate({ to: "/" })}>
                {t("obEnterDashboard")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
