/**
 * Light / dark theme. Owner: Lane A (shell).
 *
 * The theme is the attribute  <html data-theme="light|dark">  which switches the CSS variables in index.css.
 * - First visit: follows the operating system (prefers-color-scheme).
 * - Once someone clicks the toggle, their choice is remembered (localStorage 'sv.theme') and wins over the system.
 * - index.html sets the attribute before the first paint, so there is no light flash in dark mode.
 *
 * Other lanes: use CSS variables (var(--ink), var(--panel), ...) and you get both themes for free.
 * React code can read the theme with useTheme() (for example to pick a chart or editor theme).
 */
import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'sv.theme';
const listeners = new Set<() => void>();

const systemDark = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function apply(t: Theme): void {
  document.documentElement.dataset.theme = t;
  listeners.forEach((l) => l());
}

export function setTheme(t: Theme): void {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* private mode: the choice just will not be remembered */
  }
  apply(t);
}

export function toggleTheme(): void {
  setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}

/** Call once at startup (main.tsx). Also follows live changes of the OS setting until the user has chosen. */
export function initTheme(): void {
  apply(stored() ?? (systemDark() ? 'dark' : 'light'));
  if (typeof matchMedia !== 'undefined') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!stored()) apply(e.matches ? 'dark' : 'light');
    });
  }
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    currentTheme,
    () => 'light' as Theme,
  );
}
