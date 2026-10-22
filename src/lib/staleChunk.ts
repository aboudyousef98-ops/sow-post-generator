// Stale-tab chunk failures (found 2026-10-22, the day of four deploys).
//
// Lazy chunks (`await import('exceljs')`) are fetched by their CONTENT-HASHED
// name from the deploy the tab was loaded on. After a new deploy that chunk is
// gone, and the SPA fallback answers its URL with index.html (200, text/html)
// — so the import() throws. The Import modal's catch used to blame the chosen
// FILE ("Export the report again…"), sending Aboud to re-export four times
// while the only fix was reloading the tab.

/** True when `e` is a failed dynamic-import/chunk load, in any browser's wording. */
export function isStaleChunkError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return /dynamically imported module|importing a module script|unable to preload/i.test(e.message);
}

export const STALE_CHUNK_MESSAGE =
  'The site was updated since this tab was opened — reload the page (F5 / Ctrl+R) and try again. Your work is saved.';

const RELOAD_FLAG = 'sowpost.chunkReloadAt';
const RELOAD_COOLDOWN_MS = 60_000;

/**
 * One auto-reload per minute, no more — if the chunk is STILL missing after a
 * fresh load the problem is not staleness, and a reload loop would make the
 * app unusable. Pure so the guard is testable.
 */
export function shouldAutoReload(nowMs: number, lastMs: number | null): boolean {
  return lastMs === null || nowMs - lastMs > RELOAD_COOLDOWN_MS;
}

/**
 * Self-heal for stale tabs: Vite fires `vite:preloadError` when a lazy chunk
 * fails to load (after a deploy, the old hashed chunk URL answers with
 * index.html). Reloading picks up the new index and its new chunk names.
 * Compose autosaves and the board store persist, so a reload loses nothing.
 */
export function installStaleChunkAutoReload(): void {
  window.addEventListener('vite:preloadError', (event) => {
    const last = Number(sessionStorage.getItem(RELOAD_FLAG)) || null;
    if (!shouldAutoReload(Date.now(), last)) return; // let the error surface instead
    sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
    event.preventDefault(); // we handle it — don't also log an unhandled rejection
    window.location.reload();
  });
}
