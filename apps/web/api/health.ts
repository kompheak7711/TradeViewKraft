import type { VercelRequest, VercelResponse } from '@vercel/node';
import { cors } from './_lib/http';

export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (cors(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    time: new Date().toISOString(),
    stocks: Boolean(process.env.ALPACA_KEY_ID && process.env.ALPACA_SECRET_KEY),
    metals: Boolean(process.env.TWELVEDATA_API_KEY),
    region: process.env.VERCEL_REGION ?? 'local',
  });
}
