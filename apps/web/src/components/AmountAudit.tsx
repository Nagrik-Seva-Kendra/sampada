/**
 * AmountAudit.tsx
 * Drop-in panel for the Edit Deed screen. Watches the deed content and
 * reports amounts whose figures and words disagree.
 *
 *   <AmountAudit content={deedContent} onJumpTo={(start, end) => ...} />
 *
 * Colours come from CSS variables so it inherits the existing theme.
 * Fallbacks are only used if a variable isn't defined.
 */

import { useMemo, useState, useEffect } from 'react';
import { auditAmounts, type AmountFinding, type AmountAuditSummary } from '@sampada/shared';

/* ---------------- hook ---------------- */

export function useAmountAudit(content: string, debounceMs = 300): AmountAuditSummary {
  const [debounced, setDebounced] = useState(content);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(content), debounceMs);
    return () => clearTimeout(t);
  }, [content, debounceMs]);

  return useMemo(() => auditAmounts(debounced), [debounced]);
}

/* ---------------- styles ---------------- */

const LEVEL_STYLE: Record<string, { bar: string; text: string; label: string }> = {
  error:   { bar: 'var(--danger, #e05a4b)',  text: 'var(--danger, #e05a4b)',  label: 'गलती' },
  warning: { bar: 'var(--warning, #d9a441)', text: 'var(--warning, #d9a441)', label: 'जाँचें' },
  info:    { bar: 'var(--success, #4c9a72)', text: 'var(--fg-muted, #9b9289)', label: 'ठीक' },
};

const panel: React.CSSProperties = {
  border: '1px solid var(--border, #34302b)',
  borderRadius: 10,
  background: 'var(--surface, #16130f)',
  overflow: 'hidden',
  fontSize: 14,
};

const header: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 14px',
  borderBottom: '1px solid var(--border, #34302b)',
  cursor: 'pointer',
  userSelect: 'none',
};

const row: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  padding: '10px 14px',
  borderTop: '1px solid var(--border-subtle, #262220)',
  textAlign: 'start',
  width: '100%',
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  cursor: 'pointer',
  font: 'inherit',
};

/* ---------------- component ---------------- */

export interface AmountAuditProps {
  content: string;
  /** Called when a finding is clicked — select that range in the editor. */
  onJumpTo?: (start: number, end: number) => void;
  /** Hide the rows that are already correct. Default true. */
  hideMatched?: boolean;
  /** Start expanded. Default: expanded when something needs attention. */
  defaultOpen?: boolean;
}

export function AmountAudit({ content, onJumpTo, hideMatched = true, defaultOpen }: AmountAuditProps) {
  const audit = useAmountAudit(content);
  const needsAttention = audit.errors + audit.warnings > 0;
  const [open, setOpen] = useState(defaultOpen ?? true);

  const visible = hideMatched
    ? audit.findings.filter((f) => f.code !== 'ok')
    : audit.findings;

  if (audit.findings.length === 0) return null;

  const dot = needsAttention
    ? (audit.errors > 0 ? LEVEL_STYLE.error!.bar : LEVEL_STYLE.warning!.bar)
    : LEVEL_STYLE.info!.bar;

  return (
    <section style={panel} aria-label="राशि जाँच">
      <div
        style={header}
        onClick={() => setOpen((v) => !v)}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v); } }}
      >
        <span style={{ width: 8, height: 8, borderRadius: 4, background: dot, flexShrink: 0 }} />
        <strong style={{ fontWeight: 600 }}>राशि जाँच</strong>
        <span style={{ color: 'var(--fg-muted, #9b9289)' }}>
          {needsAttention
            ? `${audit.errors} गलती, ${audit.warnings} जाँचने योग्य`
            : `${audit.matched} राशि सही`}
        </span>
        <span style={{ marginInlineStart: 'auto', color: 'var(--fg-muted, #9b9289)' }}>
          {open ? '−' : '+'}
        </span>
      </div>

      {open && visible.map((f, i) => <FindingRow key={`${f.start}-${i}`} finding={f} onJumpTo={onJumpTo} />)}

      {open && visible.length === 0 && (
        <p style={{ padding: '10px 14px', margin: 0, color: 'var(--fg-muted, #9b9289)' }}>
          सभी {audit.matched} राशियाँ अंक और शब्द दोनों में मेल खाती हैं।
        </p>
      )}
    </section>
  );
}

function FindingRow({ finding, onJumpTo }: { finding: AmountFinding; onJumpTo?: (s: number, e: number) => void }) {
  const s = LEVEL_STYLE[finding.level] ?? LEVEL_STYLE.info!;
  return (
    <button
      type="button"
      style={row}
      onClick={() => onJumpTo?.(finding.start, finding.end)}
      title="इस पंक्ति पर जाएँ"
    >
      <span style={{ width: 3, borderRadius: 2, background: s.bar, flexShrink: 0, alignSelf: 'stretch' }} />
      <span style={{ display: 'grid', gap: 4 }}>
        <span style={{ color: s.text, fontSize: 12, fontWeight: 600 }}>{s.label}</span>
        <span>{finding.message}</span>
        <code style={{ color: 'var(--fg-muted, #9b9289)', fontSize: 12, direction: 'ltr' }}>
          …{finding.excerpt}…
        </code>
      </span>
    </button>
  );
}

/* ---------------- save gate ---------------- */

/**
 * Wrap the Print / PDF handler so mismatched amounts get a confirmation
 * step. Never blocks — the drafter may have a reason.
 */
export function confirmAmountsBeforePrint(content: string): boolean {
  const audit = auditAmounts(content);
  if (audit.errors === 0) return true;

  const lines = audit.findings
    .filter((f) => f.level === 'error')
    .map((f, i) => `${i + 1}. ${f.message}`)
    .join('\n\n');

  return window.confirm(
    `इस विलेख में ${audit.errors} राशि की गड़बड़ी मिली:\n\n${lines}\n\nफिर भी आगे बढ़ें?`,
  );
}
