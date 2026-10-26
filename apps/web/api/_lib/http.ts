import type { VercelRequest, VercelResponse } from '@vercel/node';

/** CORS for the Mac app (tauri://localhost, http://tauri.localhost) and optional extra origins. */
export function cors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin;
  const allowed = new Set(['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost', 'http://localhost:5173', 'http://localhost:4173', ...(process.env.RELAY_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)]);
  if (origin && allowed.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

/** Edge/CDN cache so many clients share one upstream call (critical for free quotas). */
export function cacheFor(res: VercelResponse, seconds: number, staleSeconds = seconds * 2): void {
  res.setHeader('Cache-Control', `public, s-maxage=${seconds}, stale-while-revalidate=${staleSeconds}, max-age=0`);
  res.setHeader('CDN-Cache-Control', `public, s-maxage=${seconds}, stale-while-revalidate=${staleSeconds}`);
}

export function param(req: VercelRequest, name: string): string | undefined {
  const v = req.query[name];
  return Array.isArray(v) ? v[0] : v;
}

export function sendError(res: VercelResponse, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

export class UpstreamError extends Error {
  constructor(public readonly status: number, message: string, public readonly code = 'upstream') {
    super(message);
  }
}

/** In-memory cache per warm function instance (helps on top of CDN caching). */
const memo = new Map<string, { exp: number; value: unknown }>();
export async function memoize<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && hit.exp > Date.now()) return hit.value as T;
  const value = await fn();
  memo.set(key, { exp: Date.now() + ttlMs, value });
  if (memo.size > 500) {
    const now = Date.now();
    for (const [k, v] of memo) if (v.exp < now) memo.delete(k);
  }
  return value;
}

export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 10000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new UpstreamError(r.status, `Upstream ${r.status}: ${text.slice(0, 200)}`, r.status === 429 ? 'rate_limited' : 'upstream');
    }
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export function handleError(res: VercelResponse, e: unknown): void {
  if (e instanceof UpstreamError) {
    sendError(res, e.status === 429 ? 429 : 502, e.code, e.message);
    return;
  }
  if (e instanceof Error && e.name === 'AbortError') {
    sendError(res, 504, 'timeout', 'Upstream request timed out');
    return;
  }
  sendError(res, 500, 'internal', e instanceof Error ? e.message : String(e));
}
