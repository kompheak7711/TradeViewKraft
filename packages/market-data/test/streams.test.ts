import { describe, expect, it } from 'vitest';
import type { Tick } from '@tvk/shared-types';
import { BinanceProvider, BybitProvider, CoinbaseProvider, KrakenProvider, OkxProvider } from '../src';
import type { WsLike } from '../src/reconnecting-ws';

class FakeWs implements WsLike {
  static last: FakeWs;
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(public url: string) { FakeWs.last = this; }
  send(d: string) { this.sent.push(d); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.({}); }
  message(d: string) { this.onmessage?.({ data: d }); }
}
const factory = (u: string) => new FakeWs(u);

describe('exchange trade streams', () => {
  it('Binance subscribes and parses trades', () => {
    const p = new BinanceProvider({ wsFactory: factory });
    const ticks: Tick[] = [];
    const un = p.subscribeTicks('BINANCE:BTCUSDT', (t) => ticks.push(t));
    FakeWs.last.open();
    expect(JSON.parse(FakeWs.last.sent[0]!)).toMatchObject({ method: 'SUBSCRIBE', params: ['btcusdt@trade'] });
    FakeWs.last.message(JSON.stringify({ stream: 'btcusdt@trade', data: { e: 'trade', s: 'BTCUSDT', p: '68000.5', q: '0.01', T: 1700000000000 } }));
    expect(ticks).toEqual([{ symbol: 'BINANCE:BTCUSDT', time: 1700000000000, price: 68000.5, size: 0.01 }]);
    un();
  });
  it('Coinbase subscribes to matches with heartbeat', () => {
    const p = new CoinbaseProvider({ wsFactory: factory });
    const ticks: Tick[] = [];
    p.subscribeTicks('COINBASE:BTCUSD', (t) => ticks.push(t));
    FakeWs.last.open();
    expect(JSON.parse(FakeWs.last.sent[0]!)).toMatchObject({ type: 'subscribe', product_ids: ['BTC-USD'], channels: ['matches', 'heartbeat'] });
    FakeWs.last.message(JSON.stringify({ type: 'match', product_id: 'BTC-USD', price: '68001', size: '0.5', time: '2024-01-01T00:00:00.000Z' }));
    FakeWs.last.message(JSON.stringify({ type: 'heartbeat' }));
    expect(ticks).toHaveLength(1);
    expect(ticks[0]!.price).toBe(68001);
    expect(ticks[0]!.time).toBe(Date.parse('2024-01-01T00:00:00.000Z'));
  });
  it('Kraken v2 trade channel', () => {
    const p = new KrakenProvider({ wsFactory: factory });
    const ticks: Tick[] = [];
    p.subscribeTicks('KRAKEN:ETHUSD', (t) => ticks.push(t));
    FakeWs.last.open();
    expect(JSON.parse(FakeWs.last.sent[0]!)).toMatchObject({ method: 'subscribe', params: { channel: 'trade', symbol: ['ETH/USD'] } });
    FakeWs.last.message(JSON.stringify({ channel: 'trade', type: 'update', data: [{ symbol: 'ETH/USD', price: 3500.1, qty: 2, timestamp: '2024-01-01T00:00:01.000Z' }] }));
    expect(ticks[0]).toMatchObject({ symbol: 'KRAKEN:ETHUSD', price: 3500.1, size: 2 });
  });
  it('Bybit public trade topic with ping', () => {
    const p = new BybitProvider({ wsFactory: factory });
    const ticks: Tick[] = [];
    p.subscribeTicks('BYBIT:SOLUSDT', (t) => ticks.push(t));
    FakeWs.last.open();
    expect(JSON.parse(FakeWs.last.sent[0]!)).toMatchObject({ op: 'subscribe', args: ['publicTrade.SOLUSDT'] });
    FakeWs.last.message(JSON.stringify({ topic: 'publicTrade.SOLUSDT', data: [{ T: 1700000000000, p: '160.5', v: '3' }] }));
    FakeWs.last.message(JSON.stringify({ op: 'pong' }));
    expect(ticks).toEqual([{ symbol: 'BYBIT:SOLUSDT', time: 1700000000000, price: 160.5, size: 3 }]);
  });
  it('OKX trades channel', () => {
    const p = new OkxProvider({ wsFactory: factory });
    const ticks: Tick[] = [];
    p.subscribeTicks('OKX:BTCUSDT', (t) => ticks.push(t));
    FakeWs.last.open();
    expect(JSON.parse(FakeWs.last.sent[0]!)).toMatchObject({ op: 'subscribe', args: [{ channel: 'trades', instId: 'BTC-USDT' }] });
    FakeWs.last.message('pong');
    FakeWs.last.message(JSON.stringify({ arg: { channel: 'trades', instId: 'BTC-USDT' }, data: [{ px: '68002', sz: '0.2', ts: '1700000000000' }] }));
    expect(ticks).toEqual([{ symbol: 'OKX:BTCUSDT', time: 1700000000000, price: 68002, size: 0.2 }]);
  });
  it('shares one socket per exchange and unsubscribes cleanly', () => {
    const p = new BinanceProvider({ wsFactory: factory });
    const a = p.subscribeTicks('BINANCE:BTCUSDT', () => {});
    const ws = FakeWs.last;
    ws.open();
    const b = p.subscribeTicks('BINANCE:ETHUSDT', () => {});
    expect(FakeWs.last).toBe(ws);
    expect(JSON.parse(ws.sent[1]!)).toMatchObject({ method: 'SUBSCRIBE', params: ['ethusdt@trade'] });
    b();
    expect(JSON.parse(ws.sent[2]!)).toMatchObject({ method: 'UNSUBSCRIBE', params: ['ethusdt@trade'] });
    a();
    expect(ws.readyState).toBe(3);
  });
});
