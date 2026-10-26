/**
 * HTTP layer. Defaults to global fetch; the Mac app injects Tauri's native fetch (no CORS),
 * and the browser can fall back to the Vercel relay for exchanges that block browser CORS.
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

let fetchImpl: FetchLike = (input, init) => globalThis.fetch(input, init);
let relayBase: string | null = null;
/** Hosts that are allowed to go through the generic relay (Binance is deliberately excluded: it blocks datacenter IPs). */
export const RELAYABLE_HOSTS = ['api.bybit.com', 'www.okx.com', 'api.kraken.com', 'api.exchange.coinbase.com'];

export function setFetch(fn: FetchLike): void {
  fetchImpl = fn;
}

/** Base URL of the Vercel deployment ('' for same-origin). null disables relay fallback. */
export function setRelayBase(base: string | null): void {
  relayBase = base;
}

export function getRelayBase(): string | null {
  return relayBase;
}

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly url: string, message?: string) {
    super(message ?? `HTTP ${status} for ${url}`);
  }
}

const inflight = new Map<string, Promise<unknown>>();

export interface GetJsonOptions {
  /** Try the relay when the direct request fails with a network/CORS error. */
  relayOnNetworkError?: boolean;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/** GET JSON with request de-duplication, timeout and optional relay fallback. */
export async function getJson<T>(url: string, opts: GetJsonOptions = {}): Promise<T> {
  const key = url;
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = (async () => {
    try {
      return await doGet<T>(url, opts);
    } catch (e) {
      if (opts.relayOnNetworkError && relayBase !== null && isNetworkError(e) && isRelayable(url)) {
        const relayed = `${relayBase}/api/proxy?url=${encodeURIComponent(url)}`;
        return await doGet<T>(relayed, { ...opts, relayOnNetworkError: false });
      }
      throw e;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

async function doGet<T>(url: string, opts: GetJsonOptions): Promise<T> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15000) : null;
  try {
    const res = await fetchImpl(url, { headers: opts.headers, signal: ctrl?.signal });
    if (!res.ok) throw new HttpError(res.status, url, `HTTP ${res.status} ${res.statusText} for ${url}`);
    return (await res.json()) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError || (e instanceof Error && /network|fetch|cors|load failed/i.test(e.message));
}

export function isRelayable(url: string): boolean {
  try {
    const host = new URL(url).host;
    return RELAYABLE_HOSTS.includes(host);
  } catch {
    return false;
  }
}
