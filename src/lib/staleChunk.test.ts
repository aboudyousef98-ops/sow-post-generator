import { describe, expect, it } from 'vitest';
import { isStaleChunkError, shouldAutoReload, STALE_CHUNK_MESSAGE } from './staleChunk';

describe('isStaleChunkError', () => {
  it('recognises the browsers’ failed-dynamic-import errors', () => {
    // Chrome / Edge
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/exceljs.min-CqchhxPw.js'))).toBe(true);
    // Firefox
    expect(isStaleChunkError(new TypeError('error loading dynamically imported module'))).toBe(true);
    // Safari
    expect(isStaleChunkError(new TypeError('Importing a module script failed.'))).toBe(true);
    // Vite preload helper
    expect(isStaleChunkError(new Error('Unable to preload CSS for /assets/chunk-abc.css'))).toBe(true);
  });

  it('does NOT swallow real file/parse errors', () => {
    expect(isStaleChunkError(new Error('empty workbook'))).toBe(false);
    expect(isStaleChunkError(new RangeError('invalid zip'))).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
    expect(isStaleChunkError('string error')).toBe(false);
  });

  it('message tells the user to reload, not to re-export', () => {
    expect(STALE_CHUNK_MESSAGE).toMatch(/reload/i);
    expect(STALE_CHUNK_MESSAGE).not.toMatch(/export/i);
  });
});

describe('shouldAutoReload', () => {
  it('reloads on the first failure, then backs off for a minute', () => {
    expect(shouldAutoReload(1_000_000, null)).toBe(true);
    expect(shouldAutoReload(1_030_000, 1_000_000)).toBe(false); // 30 s later — no loop
    expect(shouldAutoReload(1_061_000, 1_000_000)).toBe(true); // next deploy, next day…
  });
});
