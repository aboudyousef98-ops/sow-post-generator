import { describe, expect, it } from 'vitest';
import { guardRequest, matchOrigin, pathTokenOk, readGuardConfig } from './guard';

const cfg = readGuardConfig({
  ALLOWED_ORIGINS: 'https://sowpost.netlify.app, http://localhost:8888',
  API_PATH_TOKEN: 'tok123',
});

describe('matchOrigin', () => {
  it('accepts an allowed Origin', () => {
    expect(matchOrigin(cfg, 'https://sowpost.netlify.app', null)).toBe('https://sowpost.netlify.app');
  });

  it('falls back to Referer when Origin is absent (same-origin GET)', () => {
    expect(matchOrigin(cfg, null, 'http://localhost:8888/some/page')).toBe('http://localhost:8888');
  });

  it('rejects a foreign origin and missing headers', () => {
    expect(matchOrigin(cfg, 'https://evil.example', null)).toBeNull();
    expect(matchOrigin(cfg, null, null)).toBeNull();
  });

  it('does not accept a prefix-lookalike domain', () => {
    expect(matchOrigin(cfg, 'https://sowpost.netlify.app.evil.com', null)).toBeNull();
  });
});

describe('pathTokenOk', () => {
  it('accepts the tokenized path and rejects others', () => {
    expect(pathTokenOk(cfg, 'https://sowpost.netlify.app/api/tok123/rewrite')).toBe(true);
    expect(pathTokenOk(cfg, 'https://sowpost.netlify.app/api/WRONG/rewrite')).toBe(false);
    expect(pathTokenOk(cfg, 'https://sowpost.netlify.app/.netlify/functions/rewrite')).toBe(false);
  });

  it('rejects everything when no token is configured', () => {
    const empty = readGuardConfig({ ALLOWED_ORIGINS: 'http://localhost:8888' });
    expect(pathTokenOk(empty, 'http://localhost:8888/api//rewrite')).toBe(false);
  });
});

describe('guardRequest', () => {
  it('403 for a foreign Origin (acceptance case)', () => {
    const req = new Request('https://sowpost.netlify.app/api/tok123/rewrite', {
      method: 'POST',
      headers: { origin: 'https://foreign.example' },
    });
    expect(guardRequest(cfg, req)).toEqual({ ok: false, status: 403 });
  });

  it('ok from the site with the token path', () => {
    const req = new Request('https://sowpost.netlify.app/api/tok123/rewrite', {
      method: 'POST',
      headers: { origin: 'https://sowpost.netlify.app' },
    });
    const r = guardRequest(cfg, req);
    expect(r.ok).toBe(true);
    expect(r.corsOrigin).toBe('https://sowpost.netlify.app');
  });

  it('403 from the site when the token is wrong', () => {
    const req = new Request('https://sowpost.netlify.app/.netlify/functions/rewrite', {
      method: 'POST',
      headers: { origin: 'https://sowpost.netlify.app' },
    });
    const r = guardRequest(cfg, req);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
  });
});
