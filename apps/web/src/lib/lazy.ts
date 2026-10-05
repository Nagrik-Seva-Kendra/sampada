/**
 * Loading a chunk after the app has been redeployed.
 *
 * The heavy exports (jspdf, html2canvas) are fetched only when someone uses
 * them. Their filenames carry a build hash, so a tab left open across a deploy
 * asks for a file the server no longer has and the import fails with a browser
 * message nobody can act on. Turning that into one known marker lets the
 * screen say the plain thing instead: the app was updated, reload the page.
 */
export const APP_UPDATED = "app-updated";

/** True when an import failed because the open tab is older than the deployed build. */
export function isStaleChunkError(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e);
  return /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk|Failed to fetch/i.test(
    message,
  );
}

/** Imports a module, reporting a stale build as APP_UPDATED rather than a browser message. */
export async function loadModule<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (e) {
    if (isStaleChunkError(e)) throw new Error(APP_UPDATED);
    throw e;
  }
}
