import { ProviderRegistry, setFetch, setRelayBase } from '@tvk/market-data';
import { DATA_MODE, RELAY_BASE, isTauri } from '../lib/platform';

let registry: ProviderRegistry | null = null;

/** Lazily create the provider registry; in the Mac app, REST goes through Tauri's native HTTP (no CORS). */
export async function getRegistry(): Promise<ProviderRegistry> {
  if (registry) return registry;
  if (isTauri) {
    try {
      const { fetch: nativeFetch } = await import('@tauri-apps/plugin-http');
      setFetch((input, init) => nativeFetch(input, init as never) as Promise<Response>);
    } catch (e) {
      console.warn('Tauri HTTP plugin unavailable, using browser fetch', e);
    }
  }
  // Same-origin relay on the web; the Mac app needs the deployed URL.
  setRelayBase(isTauri ? (RELAY_BASE || null) : RELAY_BASE);
  registry = new ProviderRegistry({ mode: DATA_MODE, relayBase: RELAY_BASE });
  return registry;
}

export function registrySync(): ProviderRegistry | null {
  return registry;
}
