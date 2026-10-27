/**
 * Live stock trades as Server-Sent Events. Vercel Functions cannot accept WebSocket upgrades, so this
 * function opens the Alpaca websocket server-side (key stays secret) and streams trades to the client.
 * The stream ends at the function's max duration (an `end` event is sent first) and the client reconnects.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import WebSocket from 'ws';
import { cors, param } from '../_lib/http.js';
import { ALPACA_STREAM, alpacaKeys } from '../_lib/alpaca.js';
import { FINNHUB_WS, finnhubKey } from '../_lib/finnhub.js';

export const config = { maxDuration: 300 };

const MAX_SYMBOLS = 30; // Alpaca free plan: 30 symbols per stream
const LIFETIME_MS = 280_000; // stay under maxDuration and send `end` before Vercel cuts the socket

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (cors(req, res)) return;
  const symbols = (param(req, 'symbols') ?? '').toUpperCase().split(',').map((s) => s.trim()).filter((s) => /^[A-Z.]{1,10}$/.test(s));
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.status(200);
  res.flushHeaders?.();
  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const keys = alpacaKeys();
  const fh = finnhubKey();
  if (!keys && !fh) {
    send('status', { code: 'no_key', message: 'Stock relay is not configured (set FINNHUB_API_KEY or ALPACA_KEY_ID / ALPACA_SECRET_KEY)' });
    res.end();
    return;
  }
  if (!symbols.length) {
    send('status', { code: 'bad_request', message: 'No symbols' });
    res.end();
    return;
  }
  const maxSymbols = keys ? MAX_SYMBOLS : 50; // Finnhub free: 50 symbols per connection
  if (symbols.length > maxSymbols) {
    send('status', { code: 'symbol_limit', message: `Free plan allows ${maxSymbols} symbols per stream; streaming the first ${maxSymbols}` });
    symbols.length = maxSymbols;
  }

  const ws = keys ? new WebSocket(`${ALPACA_STREAM}/${keys.feed}`) : new WebSocket(`${FINNHUB_WS}?token=${fh}`);
  let closed = false;
  const finish = (reason: string) => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(lifetime);
    try { send('end', { reason }); } catch { /* ignore */ }
    try { ws.close(); } catch { /* ignore */ }
    res.end();
  };
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
  const lifetime = setTimeout(() => finish('max_duration'), LIFETIME_MS);
  req.on('close', () => finish('client_closed'));

  if (!keys) {
    // ---- Finnhub: subscribe per symbol; trades arrive as {type:'trade', data:[{s,p,v,t}]}; server pings every ~30 s.
    ws.on('open', () => {
      for (const s of symbols) ws.send(JSON.stringify({ type: 'subscribe', symbol: s }));
      send('status', { code: 'subscribed', message: `Streaming ${symbols.length} symbols from Finnhub` });
    });
    ws.on('message', (raw) => {
      let m: { type: string; msg?: string; data?: Array<{ s: string; p: number; v: number; t: number }> };
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (m.type === 'trade' && Array.isArray(m.data)) {
        for (const t of m.data) send('trade', { S: t.s, p: t.p, s: t.v ?? 0, t: t.t });
      } else if (m.type === 'error') {
        const limit = /limit|too many|429/i.test(m.msg ?? '');
        send('status', { code: limit ? 'connection_limit' : 'error', message: m.msg ?? 'Finnhub stream error' });
        if (limit) finish('connection_limit');
      }
    });
    ws.on('close', () => finish('upstream_closed'));
    ws.on('error', (e) => {
      send('status', { code: 'error', message: e.message });
      finish('upstream_error');
    });
    return;
  }

  ws.on('open', () => ws.send(JSON.stringify({ action: 'auth', key: keys.key, secret: keys.secret })));
  ws.on('message', (raw) => {
    let msgs: Array<{ T: string; msg?: string; code?: number; S?: string; p?: number; s?: number; t?: string }>;
    try {
      msgs = JSON.parse(raw.toString());
    } catch {
      return;
    }
    for (const m of msgs) {
      if (m.T === 'success' && m.msg === 'authenticated') {
        ws.send(JSON.stringify({ action: 'subscribe', trades: symbols }));
        send('status', { code: 'subscribed', message: `Streaming ${symbols.length} symbols from IEX` });
      } else if (m.T === 'error') {
        // 406 = connection limit exceeded (free plan allows 1), 405 = symbol limit, 402 = auth failed
        const code = m.code === 406 ? 'connection_limit' : m.code === 405 ? 'symbol_limit' : m.code === 402 ? 'auth_failed' : 'error';
        send('status', { code, message: m.msg ?? 'Alpaca stream error' });
        if (code === 'connection_limit' || code === 'auth_failed') finish(code);
      } else if (m.T === 't' && m.S && typeof m.p === 'number') {
        send('trade', { S: m.S, p: m.p, s: m.s ?? 0, t: Date.parse(m.t ?? '') || Date.now() });
      }
    }
  });
  ws.on('close', () => finish('upstream_closed'));
  ws.on('error', (e) => {
    send('status', { code: 'error', message: e.message });
    finish('upstream_error');
  });
}
