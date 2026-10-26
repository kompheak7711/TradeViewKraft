/**
 * Reconnecting WebSocket with exponential backoff + jitter, heartbeat/stale detection and
 * iOS Safari resume handling (visibilitychange / pageshow / online).
 */
export type WsLike = {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
};
export type WsFactory = (url: string) => WsLike;

export interface ReconnectingWsOptions {
  url: string | (() => string);
  /** Called after each (re)connect; use it to (re)subscribe. */
  onOpen?: (ws: ReconnectingWebSocket, reconnected: boolean) => void;
  onMessage: (data: string) => void;
  onStateChange?: (state: WsState, detail?: string) => void;
  /** Send a ping payload every `intervalMs` (undefined = none; browser auto-answers protocol pings). */
  ping?: { intervalMs: number; payload: () => string };
  /** If no message is received for this long, the connection is considered stale and is recycled. */
  staleMs?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  factory?: WsFactory;
  /** Injected timers and randomness for tests. */
  now?: () => number;
  random?: () => number;
}

export type WsState = 'connecting' | 'open' | 'reconnecting' | 'stale' | 'closed';

export class ReconnectingWebSocket {
  private ws: WsLike | null = null;
  private attempt = 0;
  private everOpened = false;
  private closedByUser = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private _state: WsState = 'closed';
  public lastMessageAt = 0;
  private readonly resumeHandler = () => this.resume();

  constructor(private readonly opts: ReconnectingWsOptions) {}

  get state(): WsState {
    return this._state;
  }

  open(): void {
    this.closedByUser = false;
    this.attachResumeListeners();
    this.connect();
  }

  send(data: string | object): boolean {
    if (!this.ws || this.ws.readyState !== 1) return false;
    this.ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    return true;
  }

  close(): void {
    this.closedByUser = true;
    this.detachResumeListeners();
    this.clearTimers();
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.onclose = null;
      try { ws.close(1000, 'client closed'); } catch { /* ignore */ }
    }
    this.setState('closed');
  }

  /** Force a reconnect now (used on resume from background or when a stale feed is detected). */
  reconnectNow(reason = 'manual'): void {
    if (this.closedByUser) return;
    this.clearTimers();
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.onclose = null;
      try { ws.close(4000, reason); } catch { /* ignore */ }
    }
    this.attempt = 0;
    this.connect();
  }

  private resume(): void {
    if (this.closedByUser) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const now = this.now();
    const stale = this.opts.staleMs !== undefined && this.lastMessageAt > 0 && now - this.lastMessageAt > this.opts.staleMs;
    if (!this.ws || this.ws.readyState !== 1 || stale) {
      this.reconnectNow('resume');
    }
  }

  private connect(): void {
    if (this.closedByUser) return;
    const url = typeof this.opts.url === 'function' ? this.opts.url() : this.opts.url;
    this.setState(this.everOpened ? 'reconnecting' : 'connecting');
    let ws: WsLike;
    try {
      ws = (this.opts.factory ?? defaultFactory)(url);
    } catch (e) {
      this.scheduleReconnect(String(e));
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      const reconnected = this.everOpened;
      this.everOpened = true;
      this.attempt = 0;
      this.lastMessageAt = this.now();
      this.setState('open');
      this.startTimers();
      this.opts.onOpen?.(this, reconnected);
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      this.lastMessageAt = this.now();
      const data = typeof ev.data === 'string' ? ev.data : String(ev.data);
      this.opts.onMessage(data);
    };
    ws.onerror = () => {
      /* onclose follows; nothing to do */
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearTimers();
      if (this.closedByUser) return;
      this.scheduleReconnect(`closed ${ev?.code ?? ''} ${ev?.reason ?? ''}`.trim());
    };
  }

  private scheduleReconnect(detail: string): void {
    if (this.closedByUser) return;
    const min = this.opts.minDelayMs ?? 1000;
    const max = this.opts.maxDelayMs ?? 30000;
    const base = Math.min(max, min * 2 ** this.attempt);
    const jitter = 0.5 + (this.opts.random ?? Math.random)();
    const delay = Math.round(base * jitter);
    this.attempt = Math.min(this.attempt + 1, 10);
    this.setState('reconnecting', detail);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private startTimers(): void {
    if (this.opts.ping) {
      this.pingTimer = setInterval(() => this.send(this.opts.ping!.payload()), this.opts.ping.intervalMs);
    }
    if (this.opts.staleMs) {
      const check = Math.max(1000, Math.floor(this.opts.staleMs / 2));
      this.staleTimer = setInterval(() => {
        if (this.now() - this.lastMessageAt > this.opts.staleMs!) {
          this.setState('stale', 'no messages');
          this.reconnectNow('stale');
        }
      }, check);
    }
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.reconnectTimer = this.pingTimer = this.staleTimer = null;
  }

  private setState(s: WsState, detail?: string): void {
    if (this._state === s && !detail) return;
    this._state = s;
    this.opts.onStateChange?.(s, detail);
  }

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  private attachResumeListeners(): void {
    if (typeof window === 'undefined') return;
    document.addEventListener('visibilitychange', this.resumeHandler);
    window.addEventListener('pageshow', this.resumeHandler);
    window.addEventListener('online', this.resumeHandler);
    window.addEventListener('focus', this.resumeHandler);
  }

  private detachResumeListeners(): void {
    if (typeof window === 'undefined') return;
    document.removeEventListener('visibilitychange', this.resumeHandler);
    window.removeEventListener('pageshow', this.resumeHandler);
    window.removeEventListener('online', this.resumeHandler);
    window.removeEventListener('focus', this.resumeHandler);
  }
}

function defaultFactory(url: string): WsLike {
  if (typeof WebSocket === 'undefined') throw new Error('WebSocket is not available in this environment');
  return new WebSocket(url) as unknown as WsLike;
}
