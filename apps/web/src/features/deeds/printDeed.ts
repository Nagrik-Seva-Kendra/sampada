/** Opens a printable window for a deed's title + content and triggers print. */
export function printDeed(title: string, content: string): void {
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return;
  w.document.write(
    `<html><head><title>${escapeHtml(title)}</title></head>` +
      `<body style="font-family: sans-serif; padding: 32px; white-space: pre-wrap; text-align: justify;">` +
      `<h2>${escapeHtml(title)}</h2><div>${escapeHtml(content)}</div>` +
      `</body></html>`,
  );
  w.document.close();
  w.focus();
  w.print();
}

function escapeHtml(s: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return s.replace(/[&<>"']/g, (c) => map[c]!);
}
