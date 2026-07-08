// Streaming parser for a mysqldump (phpMyAdmin "both of the above" style):
//   INSERT INTO `tbl` (`c1`,`c2`,...) VALUES (v,v,...),(v,v,...);
// Handles single-quoted strings with \' and '' escapes, commas/parens inside
// strings, and inter-value formatting whitespace. Streams the file line by
// line so a 300MB+ dump never loads whole into memory.
import fs from "node:fs";
import readline from "node:readline";

/** Parse one VALUES payload "(...),(...)" into an array of row-arrays. */
export function parseTuples(s) {
  const rows = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    while (i < n && s[i] !== "(") i++;
    if (i >= n) break;
    i++; // past '('
    const row = [];
    let field = "";
    let inStr = false;
    let started = false;
    while (i < n) {
      const c = s[i];
      if (inStr) {
        if (c === "\\") { field += s[i + 1] ?? ""; i += 2; continue; }
        if (c === "'") {
          if (s[i + 1] === "'") { field += "'"; i += 2; continue; }
          inStr = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (!started && (c === " " || c === "\n" || c === "\r" || c === "\t")) { i++; continue; }
      if (c === "'") { inStr = true; started = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; started = false; i++; continue; }
      if (c === ")") { row.push(field); i++; break; }
      started = true; field += c; i++;
    }
    rows.push(row.map((v) => (v === "NULL" ? null : typeof v === "string" ? v.trimEnd() : v)));
    while (i < n && (s[i] === "," || s[i] === " " || s[i] === "\n" || s[i] === "\r")) i++;
  }
  return rows;
}

/** Stream rows for one table, calling onRow(rowArray, columns) for each. */
export async function streamTable(file, table, onRow, limit = Infinity) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  const header = new RegExp("^INSERT INTO `" + table + "` \\(([^)]*)\\) VALUES ?(.*)$");
  let columns = null;
  let count = 0;
  let buf = null;
  for await (const line of rl) {
    if (buf !== null) {
      buf += "\n" + line;
      if (/;\s*$/.test(line)) {
        for (const row of parseTuples(buf)) {
          if (count++ < limit) onRow(row, columns);
          if (count >= limit) { rl.close(); return { columns, count }; }
        }
        buf = null;
      }
      continue;
    }
    const m = header.exec(line);
    if (m) {
      columns = m[1].split(",").map((c) => c.trim().replace(/`/g, ""));
      const payload = m[2];
      if (/;\s*$/.test(line)) {
        for (const row of parseTuples(payload)) {
          if (count++ < limit) onRow(row, columns);
          if (count >= limit) { rl.close(); return { columns, count }; }
        }
      } else {
        buf = payload;
      }
    }
  }
  return { columns, count };
}
