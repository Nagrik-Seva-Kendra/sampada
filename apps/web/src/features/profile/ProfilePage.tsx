import { useState } from "react";
import { HTTPError } from "ky";
import { useUiStore } from "../../stores/uiStore";
import { useAuthStore } from "../../stores/authStore";
import { translate, type StringKey } from "../../i18n/strings";
import { useUpdateProfile, useUploadProfilePhoto } from "./useProfile";
import { PasswordInput } from "../../components/PasswordInput";

/** Partner/employee self-service profile: edit own name, email, username, password, and photo. */
export function ProfilePage() {
  const lang = useUiStore((s) => s.lang);
  const t = (k: StringKey) => translate(k, lang);
  const user = useAuthStore((s) => s.user);
  const update = useUpdateProfile();
  const uploadPhoto = useUploadProfilePhoto();

  const [fname, setFname] = useState(user?.fname ?? "");
  const [lname, setLname] = useState(user?.lname ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<StringKey | null>(null);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [photoMissing, setPhotoMissing] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);

    if (password) {
      if (!currentPassword) {
        setPasswordError("profileCurrentPasswordRequired");
        return;
      }
      if (password !== confirmPassword) {
        setPasswordError("profilePasswordMismatch");
        return;
      }
    }

    update.mutate(
      {
        fname: fname.trim(),
        lname: lname.trim(),
        email: email.trim(),
        ...(username.trim() ? { username: username.trim() } : {}),
        ...(password ? { currentPassword, password } : {}),
      },
      {
        onSuccess: () => {
          setCurrentPassword("");
          setPassword("");
          setConfirmPassword("");
        },
        onError: (err) => {
          setPasswordError(
            err instanceof HTTPError && err.response.status === 403
              ? "profileCurrentPasswordWrong"
              : null,
          );
        },
      },
    );
  }

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    uploadPhoto.mutate(file, {
      onSuccess: () => {
        setPhotoMissing(false);
        setPhotoVersion((v) => v + 1);
      },
    });
  }

  return (
    <section className="page">
      <div className="wrap" style={{ maxWidth: 560 }}>
        <div className="kicker">
          <span className="rule" />
          {t("navProfile")}
        </div>
        <h2 className="page-title">{t("profileTitle")}</h2>

        {user && (
          <div className="profile-photo-row">
            {photoMissing ? (
              <div className="profile-photo profile-photo-placeholder">
                {user.fname.slice(0, 1).toUpperCase()}
              </div>
            ) : (
              <img
                key={photoVersion}
                className="profile-photo"
                src={`/api/v1/profile/photo/${user.id}?v=${photoVersion}`}
                alt=""
                onError={() => setPhotoMissing(true)}
              />
            )}
            <label className="btn-calc profile-photo-btn">
              {uploadPhoto.isPending ? "…" : t("profilePhotoChange")}
              <input
                type="file"
                accept="image/*"
                onChange={onPhotoChange}
                disabled={uploadPhoto.isPending}
                hidden
              />
            </label>
            {uploadPhoto.isError && <p className="modal-error">{t("profilePhotoFailed")}</p>}
          </div>
        )}

        <form className="modal-form" onSubmit={onSubmit} style={{ marginTop: 20 }}>
          <label className="modal-field">
            {t("profileFname")}
            <input
              value={fname}
              onChange={(e) => setFname(e.target.value)}
              required
              maxLength={100}
            />
          </label>
          <label className="modal-field">
            {t("profileLname")}
            <input
              value={lname}
              onChange={(e) => setLname(e.target.value)}
              required
              maxLength={100}
            />
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
          <label className="modal-field">
            {t("profileUsername")}
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={50}
              placeholder={t("profileUsernamePlaceholder")}
            />
          </label>
          <p className="er-sub" style={{ marginTop: -8 }}>
            {t("profileUsernameHint")}
          </p>
          <label className="modal-field">
            {t("profileCurrentPassword")}
            <PasswordInput
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </label>
          <label className="modal-field">
            {t("profilePassword")}
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </label>
          <label className="modal-field">
            {t("profileConfirmPassword")}
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              placeholder="••••••••"
              autoComplete="new-password"
            />
          </label>
          <p className="er-sub" style={{ marginTop: -8 }}>
            {t("profilePasswordHint")}
          </p>

          {passwordError && <p className="modal-error">{t(passwordError)}</p>}
          {update.isError && !passwordError && (
            <p className="modal-error">{t("profileSaveFailed")}</p>
          )}
          {update.isSuccess && <p className="dr-status-active">✓ {t("profileSaved")}</p>}

          <button className="btn-calc" type="submit" disabled={update.isPending}>
            {update.isPending ? "…" : t("profileSave")}
          </button>
        </form>
      </div>
    </section>
  );
}
