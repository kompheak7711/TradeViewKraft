import type { MarketSession } from '@tvk/shared-types';

/** US equities regular session: 09:30–16:00 America/New_York, Monday–Friday (holidays are not modelled in v1). */
export function usEquitySession(now: Date = new Date()): MarketSession {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = get('weekday');
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  const mins = hour * 60 + minute;
  const weekend = weekday === 'Sat' || weekday === 'Sun';
  if (weekend) return { state: 'closed', label: 'Market closed (weekend)' };
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return { state: 'open', label: 'Market open' };
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return { state: 'pre', label: 'Pre-market' };
  if (mins >= 16 * 60 && mins < 20 * 60) return { state: 'post', label: 'After hours' };
  return { state: 'closed', label: 'Market closed' };
}

/** Spot metals trade roughly Sunday 18:00 ET to Friday 17:00 ET. */
export function metalsSession(now: Date = new Date()): MarketSession {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, weekday: 'short', hour: '2-digit' }).formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  if (weekday === 'Sat') return { state: 'closed', label: 'Market closed (weekend)' };
  if (weekday === 'Sun' && hour < 18) return { state: 'closed', label: 'Market closed (opens Sun 18:00 ET)' };
  if (weekday === 'Fri' && hour >= 17) return { state: 'closed', label: 'Market closed (weekend)' };
  return { state: 'open', label: 'Market open' };
}
