// Shared server-side access control — spec/07-netlify-functions.md.
// NO login anywhere: protection = Origin/Referer allowlist + tokenized paths.
// Pure functions here so they can be unit-tested without a Netlify runtime.

export interface GuardConfig {
  allowedOrigins: string[]; // from ALLOWED_ORIGINS (comma-separated)
  pathToken: string; // from API_PATH_TOKEN
}

export function readGuardConfig(env: Record<string, string | undefined>): GuardConfig {
  return {
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean),
    pathToken: env.API_PATH_TOKEN ?? '',
  };
}

// scheme://host with any path/query/fragment stripped off (Referer carries a
// path; Origin never does).
function originOf(candidate: string): string {
  const m = candidate.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i);
  return (m ? m[0] : candidate).replace(/\/$/, '');
}

// `*` in an allowed-origins entry matches one path-free, dot-free host
// segment — e.g. "https://*--sow-post-generator.netlify.app" matches Netlify
// deploy-preview/branch-deploy subdomains but not "...netlify.app.evil.com".
function wildcardToRegex(pattern: string): RegExp {
  const body = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^./]+');
  return new RegExp(`^${body}$`);
}

/** The matched allowed origin, or null when the request must be rejected. */
export function matchOrigin(
  cfg: GuardConfig,
  origin: string | null,
  referer: string | null,
): string | null {
  const candidate = origin || referer;
  if (!candidate) return null;
  const candidateOrigin = originOf(candidate);
  for (const allowed of cfg.allowedOrigins) {
    if (allowed.includes('*')) {
      if (wildcardToRegex(allowed).test(candidateOrigin)) return candidateOrigin;
      continue;
    }
    if (candidateOrigin === allowed) return allowed;
  }
  return null;
}

/**
 * True when the request path carries the secret token segment:
 * /api/<token>/<endpoint>. Netlify rewrites preserve the original URL, so the
 * function sees the tokenized path; a direct hit on
 * /.netlify/functions/<name> has no token and is rejected.
 */
export function pathTokenOk(cfg: GuardConfig, url: string): boolean {
  if (!cfg.pathToken) return false;
  const m = new URL(url).pathname.match(/^\/api\/([^/]+)\//);
  return m !== null && m[1] === cfg.pathToken;
}

export interface GuardResult {
  ok: boolean;
  status?: number;
  corsOrigin?: string;
}

export function guardRequest(cfg: GuardConfig, req: Request): GuardResult {
  const origin = matchOrigin(cfg, req.headers.get('origin'), req.headers.get('referer'));
  if (!origin) return { ok: false, status: 403 };
  if (!pathTokenOk(cfg, req.url)) return { ok: false, status: 403, corsOrigin: origin };
  return { ok: true, corsOrigin: origin };
}

export function jsonResponse(status: number, body: unknown, corsOrigin?: string): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (corsOrigin) {
    // Never '*' — only the matched origin (07 §Access control).
    headers['Access-Control-Allow-Origin'] = corsOrigin;
    headers['Vary'] = 'Origin';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export const MAX_BODY_BYTES = 6 * 1024 * 1024;

/** Parse a JSON body defensively: size cap, JSON only. Returns null on failure. */
export async function readJsonBody(req: Request): Promise<unknown | null> {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > MAX_BODY_BYTES) return 'too-large';
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return 'too-large';
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
