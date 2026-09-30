/**
 * Low-bandwidth mode. Owner: Lane A (shell).
 *
 * For a weak connection (phone hotspot, shared school Wi-Fi). When ON:
 *   - the video call joins AUDIO ONLY (camera off), at the smallest video size if someone turns the camera on later
 *   - other people's cursor positions are sent at most once every 0.7 s instead of on every key
 *   - animations stop (the entry-page demo, caret glide, transitions) and the status check runs less often
 * The text itself is tiny either way: editing stays instant and in sync.
 * The choice is remembered per browser ('sv.lowbw'). If the browser says the connection is slow (Data Saver, 2G/3G), the
 * workspace suggests switching; it never switches by itself.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'sv.lowbw';
const listeners = new Set<() => void>();
let on = false;

function stored(): boolean | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'on' ? true : v === 'off' ? false : null;
  } catch {
    return null;
  }
}

function apply(v: boolean): void {
  on = v;
  document.documentElement.dataset.lowbw = v ? 'on' : 'off';
  listeners.forEach((l) => l());
}

export const isLowBandwidth = (): boolean => on;

export function setLowBandwidth(v: boolean): void {
  try {
    localStorage.setItem(KEY, v ? 'on' : 'off');
  } catch {
    /* not remembered */
  }
  apply(v);
}

export function initLowBandwidth(): void {
  apply(stored() ?? false);
}

export function useLowBandwidth(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => on,
    () => false,
  );
}

interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: string;
}

/** True when the browser reports Data Saver or a 2G/3G connection (Chromium browsers only; elsewhere always false). */
export function connectionLooksSlow(): boolean {
  const c = (navigator as unknown as { connection?: NetworkInformation }).connection;
  return Boolean(c && (c.saveData || ['slow-2g', '2g', '3g'].includes(c.effectiveType ?? '')));
}

/** Whether the person already decided (either way), so the suggestion is not repeated. */
export const hasChosen = (): boolean => stored() !== null;
