/**
 * The demo programs behind the Samples menu, in every language the runner supports. They are plain files in docs/samples:
 * the Python ones at the top level (01_index_error.py), the others in docs/samples/<java|javascript|c|cpp>/ with the same
 * file name stem, so "01_index_error" is one demo shown in five languages. `npm run verify:demos` runs them all.
 */
import { starterFor } from '@syncverse/shared';

export type DemoLang = 'python' | 'java' | 'javascript' | 'c' | 'cpp';
export const DEMO_LANGS: DemoLang[] = ['python', 'java', 'javascript', 'c', 'cpp'];

export interface DemoProgram {
  /** file name stem, e.g. 01_index_error */
  id: string;
  /** "index error" (the menu capitalises it) */
  label: string;
  /** the program in each language that has one */
  texts: Partial<Record<DemoLang, string>>;
}

const files = import.meta.glob(['../../../docs/samples/*.py', '../../../docs/samples/*/*'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const byId = new Map<string, DemoProgram>();
for (const [path, source] of Object.entries(files)) {
  const parts = path.split('/');
  const file = parts.pop()!;
  const dir = parts[parts.length - 1];
  const lang = (dir === 'samples' ? 'python' : dir) as DemoLang;
  if (!DEMO_LANGS.includes(lang)) continue;
  const id = file.replace(/\.[^.]+$/, '');
  const program = byId.get(id) ?? { id, label: id.replace(/^\d+_/, '').replace(/_/g, ' '), texts: {} };
  program.texts[lang] = source;
  byId.set(id, program);
}

export const DEMO_PROGRAMS: DemoProgram[] = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));

const normalize = (text: string): string => text.replace(/\r\n?/g, '\n').trim();

/** The demo program whose text (in any language) is exactly this, if any. */
export function findDemo(text: string): DemoProgram | undefined {
  const t = normalize(text);
  if (!t) return undefined;
  return DEMO_PROGRAMS.find((p) => Object.values(p.texts).some((s) => normalize(s ?? '') === t));
}

/** The language a demo opens in for a file whose language is `fileLanguage`: its own, or Python when the demo has none for it. */
export function demoLanguageFor(program: DemoProgram, fileLanguage: string | undefined): DemoLang {
  return DEMO_LANGS.includes(fileLanguage as DemoLang) && program.texts[fileLanguage as DemoLang] ? (fileLanguage as DemoLang) : 'python';
}

/**
 * What an open file should show after its language changes to `language`, or null to leave the code alone. A loaded demo becomes
 * the same demo in the new language (its hello-world when it has none there); the room's first program and hello-worlds are
 * handled by starterFor. Anything a person wrote or edited is never replaced.
 */
export function codeForLanguage(text: string, language: string): string | null {
  const demo = findDemo(text);
  if (demo) {
    const lang = language as DemoLang;
    return demo.texts[lang] ?? starterFor('', language);
  }
  return starterFor(text, language);
}
