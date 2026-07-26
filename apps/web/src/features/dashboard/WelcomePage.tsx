import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { useAuthStore, useActiveOrganization } from "../../stores/authStore";
import { useAllDeeds } from "../deeds/useSampleDeeds";
import { BrandMark } from "../../components/icons";

const REDIRECT_AFTER = 3; // seconds
const SPARK_COUNT = 9;

function greetWord(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning," : h < 17 ? "Good afternoon," : "Good evening,";
}

/**
 * One-time post-login splash: a personalized greeting + this org's deed
 * stats, auto-advancing into the dashboard after a short countdown (or
 * immediately on "Enter now"). Shown right after login/onboarding/accepting
 * an invite -- not on every dashboard visit, so it stays a moment rather
 * than a tax on every page load.
 */
export function WelcomePage() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const activeOrganization = useActiveOrganization();
  const navigate = useNavigate();
  const deeds = useAllDeeds({});

  const [count, setCount] = useState(REDIRECT_AFTER);

  const go = () => navigate({ to: "/deeds" });

  useEffect(() => {
    if (count <= 0) {
      go();
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const sparks = useMemo(
    () =>
      Array.from({ length: SPARK_COUNT }, (_, i) => ({
        left: 8 + i * 10 + (i % 2 ? 3 : 0),
        size: 5 + (i % 3) * 3,
        delay: 0.6 + (i % 5) * 0.5,
        duration: 2.4 + (i % 4) * 0.4,
        gold: i % 2 === 0,
      })),
    [],
  );

  if (!token) return <Navigate to="/login" />;
  if (!user) return null;

  const dateLine = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const words = [greetWord(), `${user.fname}!`];

  const rows = deeds.data ?? [];
  const total = rows.length;
  const active = rows.filter((d) => d.status === "active").length;
  const inactive = total - active;
  const stats = [
    { value: total, label: "Total deeds" },
    { value: active, label: "Active" },
    { value: inactive, label: "Inactive" },
  ];

  const progressPct = Math.max(0, Math.min(100, ((REDIRECT_AFTER - count) / REDIRECT_AFTER) * 100));

  return (
    <div className="welcome-screen">
      <div className="welcome-aurora welcome-aurora-1" aria-hidden />
      <div className="welcome-aurora welcome-aurora-2" aria-hidden />
      <div className="welcome-glow" aria-hidden />

      <div className="welcome-sparks" aria-hidden>
        {sparks.map((s, i) => (
          <span
            key={i}
            className={"welcome-spark" + (s.gold ? " gold" : "")}
            style={{
              left: `${s.left}%`,
              width: s.size,
              height: s.size,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.duration}s`,
            }}
          />
        ))}
      </div>

      <div className="welcome-content">
        <div className="welcome-mark">
          <BrandMark />
        </div>

        <p className="welcome-dateline">{dateLine}</p>

        <h1 className="welcome-heading">
          {words.map((w, i) => (
            <span
              key={i}
              className={"welcome-word" + (i === words.length - 1 ? " accent" : "")}
              style={{ animationDelay: `${0.3 + i * 0.16}s` }}
            >
              {w}
            </span>
          ))}
        </h1>

        <div className="welcome-badge">
          <span className="welcome-badge-dot" />
          {activeOrganization?.role ?? "MEMBER"} · {activeOrganization?.name ?? ""}
        </div>

        <div className="welcome-stats">
          {stats.map((s, i) => (
            <div key={s.label} className="welcome-stat" style={{ animationDelay: `${0.7 + i * 0.12}s` }}>
              <div className="welcome-stat-value">{s.value}</div>
              <div className="welcome-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="welcome-footer">
        <div className="welcome-countdown">
          <svg width="22" height="22" viewBox="0 0 50 50" aria-hidden>
            <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="4" />
            <circle
              cx="25"
              cy="25"
              r="20"
              fill="none"
              stroke="#e7c87a"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={125.6}
              strokeDashoffset={125.6 * (1 - progressPct / 100)}
              transform="rotate(-90 25 25)"
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          Opening <strong>All Deeds</strong> in <span className="welcome-count">{Math.max(count, 1)}</span>s
        </div>
        <div className="welcome-progress">
          <div className="welcome-progress-bar" style={{ width: `${progressPct}%` }} />
        </div>
        <button type="button" className="welcome-skip" onClick={go}>
          Enter now →
        </button>
      </div>
    </div>
  );
}
