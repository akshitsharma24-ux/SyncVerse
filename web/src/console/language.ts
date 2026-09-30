/**
 * Lane B (Simrit): the language the person runs their code in (per browser tab). Shared by the console (selector, runs) and the
 * quality panel (its checks are Python-only). Nothing is sent to other people: each learner picks their own runner language.
 */
import { useSyncExternalStore } from 'react';

export type Lang = 'python' | 'c' | 'cpp' | 'java' | 'javascript';

export const LANGUAGE_LABEL: Record<Lang, string> = {
  python: 'Python',
  c: 'C',
  cpp: 'C++',
  java: 'Java',
  javascript: 'JavaScript',
};
export const ALL_LANGUAGES = Object.keys(LANGUAGE_LABEL) as Lang[];

const KEY = 'sv.language';

function read(): Lang {
  try {
    const v = sessionStorage.getItem(KEY);
    if (v && (ALL_LANGUAGES as string[]).includes(v)) return v as Lang;
  } catch {
    /* ignore */
  }
  return 'python';
}

let current: Lang = read();
const listeners = new Set<() => void>();

export function getLanguage(): Lang {
  return current;
}

export function setLanguage(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    sessionStorage.setItem(KEY, lang);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useLanguage(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getLanguage,
    getLanguage,
  );
}
