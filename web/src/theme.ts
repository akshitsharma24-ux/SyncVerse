import { useSyncExternalStore } from 'react';
export type Theme = 'light' | 'dark';
export function currentTheme(): Theme { return 'dark'; }
export function setTheme(_theme: Theme): void { document.documentElement.dataset.theme = 'dark'; }
export function toggleTheme(): void { setTheme('dark'); }
export function initTheme(): void { setTheme('dark'); }
export function useTheme(): Theme { return useSyncExternalStore(() => () => {}, currentTheme, currentTheme); }