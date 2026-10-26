import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReconnectingWebSocket, type WsLike } from '../src/reconnecting-ws';

class FakeWs implements WsLike {
  static instances: FakeWs[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(public url: string) {
    FakeWs.instances.push(this);
  }
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  message(d: string) {
    this.onmessage?.({ data: d });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.({ code: 1006, reason: 'abnormal' });
  }
}

describe('ReconnectingWebSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWs.instances = [];
  });
  afterEach(() => vi.useRealTimers());

  it('reconnects with exponential backoff and resubscribes', () => {
    const opens: boolean[] = [];
    const states: string[] = [];
    const rws = new ReconnectingWebSocket({
      url: 'wss://x', factory: (u) => new FakeWs(u), random: () => 0.5, minDelayMs: 1000,
      onOpen: (ws, reconnected) => { opens.push(reconnected); ws.send('sub'); },
      onMessage: () => {}, onStateChange: (s) => states.push(s),
    });
    rws.open();
    expect(FakeWs.instances).toHaveLength(1);
    FakeWs.instances[0]!.open();
    expect(opens).toEqual([false]);
    expect(FakeWs.instances[0]!.sent).toEqual(['sub']);
    FakeWs.instances[0]!.drop();
    expect(rws.state).toBe('reconnecting');
    vi.advanceTimersByTime(999);
    expect(FakeWs.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWs.instances).toHaveLength(2);
    FakeWs.instances[1]!.drop();
    vi.advanceTimersByTime(1999);
    expect(FakeWs.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeWs.instances).toHaveLength(3);
    FakeWs.instances[2]!.open();
    expect(opens).toEqual([false, true]);
    expect(FakeWs.instances[2]!.sent).toEqual(['sub']);
    expect(states).toContain('reconnecting');
    rws.close();
    expect(rws.state).toBe('closed');
    vi.advanceTimersByTime(60000);
    expect(FakeWs.instances).toHaveLength(3);
  });

  it('detects stale feeds and sends pings', () => {
    let now = 0;
    vi.setSystemTime(0);
    const rws = new ReconnectingWebSocket({
      url: 'wss://x', factory: (u) => new FakeWs(u), staleMs: 10000, now: () => now,
      ping: { intervalMs: 2000, payload: () => 'ping' }, onMessage: () => {},
    });
    rws.open();
    const ws = FakeWs.instances[0]!;
    ws.open();
    now = 2000; vi.advanceTimersByTime(2000);
    expect(ws.sent).toEqual(['ping']);
    ws.message('data');
    now = 5000; vi.advanceTimersByTime(3000);
    expect(FakeWs.instances).toHaveLength(1);
    now = 16000; vi.advanceTimersByTime(11000);
    expect(FakeWs.instances).toHaveLength(2);
    rws.close();
  });
});
