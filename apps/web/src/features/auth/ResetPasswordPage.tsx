import { useState } from "react";
import { useUiStore } from "../../stores/uiStore";
import { api, apiErrorMessage } from "../../lib/api";
import { PasswordInput } from "../../components/PasswordInput";

/** Public page reached via an admin-issued reset link: /reset-password?token=... */
export function ResetPasswordPage() {
  const lang = useUiStore((s) => s.lang);
  const L = (en: string, hi: string) => (lang === "hi" ? hi : en);

  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(L("Password must be at least 8 characters.", "पासवर्ड कम से कम 8 अक्षरों का होना चाहिए।"));
      return;
    }
    if (password !== confirm) {
      setError(L("Passwords do not match.", "पासवर्ड मेल नहीं खाते।"));
      return;
    }
    setSubmitting(true);
    try {
      await api.post("auth/reset-password", { json: { token, password } }).json();
      setDone(true);
    } catch (err) {
      setError(await apiErrorMessage(err, L("Couldn't reset the password. The link may have expired.", "पासवर्ड रीसेट नहीं हो सका। लिंक की समय-सीमा समाप्त हो सकती है।")));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page">
      <div className="wrap" style={{ maxWidth: 440 }}>
        <div className="kicker">
          <span className="rule" />
          {L("Account", "खाता")}
        </div>
        <h2 className="page-title">{L("Reset your password", "अपना पासवर्ड रीसेट करें")}</h2>

        {!token ? (
          <p className="modal-error">
            {L("This link is missing its token. Ask your admin to send a new reset link.", "इस लिंक में टोकन नहीं है। नया रीसेट लिंक भेजने के लिए अपने एडमिन से कहें।")}
          </p>
        ) : done ? (
          <div className="doc-sub" style={{ marginTop: 12 }}>
            <p>{L("Your password has been updated. You can now sign in with your new password.", "आपका पासवर्ड अपडेट हो गया है। अब आप अपने नए पासवर्ड से लॉगिन कर सकते हैं।")}</p>
            <a className="btn-calc" href="/" style={{ marginTop: 12, display: "inline-block" }}>
              {L("Go to sign in", "लॉगिन पर जाएं")}
            </a>
          </div>
        ) : (
          <form onSubmit={onSubmit} style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
            <label>
              {L("New password", "नया पासवर्ड")}
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            <label>
              {L("Confirm new password", "नए पासवर्ड की पुष्टि करें")}
              <PasswordInput
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            {error && <p className="modal-error">{error}</p>}
            <button type="submit" className="btn-calc" disabled={submitting}>
              {submitting ? L("Saving…", "सहेजा जा रहा है…") : L("Set new password", "नया पासवर्ड सेट करें")}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
