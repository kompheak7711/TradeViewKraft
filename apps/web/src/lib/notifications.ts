import { isTauri } from './platform';

/** Request permission to show system notifications. Returns true when granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (isTauri) {
    try {
      const n = await import('@tauri-apps/plugin-notification');
      let granted = await n.isPermissionGranted();
      if (!granted) granted = (await n.requestPermission()) === 'granted';
      return granted;
    } catch {
      return false;
    }
  }
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export function notificationsSupported(): boolean {
  return isTauri || typeof Notification !== 'undefined';
}

/** Show a system notification (macOS Notification Center via Tauri, Web Notifications elsewhere). */
export async function showNotification(title: string, body: string): Promise<void> {
  if (isTauri) {
    try {
      const n = await import('@tauri-apps/plugin-notification');
      if (await n.isPermissionGranted()) n.sendNotification({ title, body });
      return;
    } catch {
      return;
    }
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    // iOS PWAs must use the service worker registration to display notifications.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg && 'showNotification' in reg) {
      await reg.showNotification(title, { body, tag: `tvk-${Date.now()}` });
      return;
    }
    new Notification(title, { body });
  } catch {
    /* ignore */
  }
}

let audioCtx: AudioContext | null = null;
/** Short two-tone chime, generated so no asset is needed. */
export function playAlertSound(): void {
  try {
    audioCtx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const ctx = audioCtx;
    const now = ctx.currentTime;
    for (const [freq, start] of [[880, 0], [1174.66, 0.12]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.2, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + 0.3);
    }
  } catch {
    /* no audio */
  }
}
