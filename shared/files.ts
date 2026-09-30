/**
 * Multi-file workspace contract. Owner: Lane A. Used by the server (collab, snapshots) and the web editor.
 *
 * Every room is ONE Yjs document:
 *   - Y.Map 'files'        fileId -> FileMeta (plain object, replaced as a whole on rename / language change)
 *   - Y.Text per file      fileId 'main' lives in the text called 'code' (the original single-file name, kept so old rooms
 *                          and tests still work); every other file lives in the text called 'f:<id>'
 * Lane B: read the active file's language with useActiveFile() (web/src/session.tsx) and pass it as RunRequest.language.
 */

export const FILES_MAP = 'files';
export const MAIN_FILE_ID = 'main';
export const MAX_FILES = 20;
export const MAX_FILE_BYTES = 200_000;

export interface FileMeta {
  name: string;
  language: string; // a LanguageId
  order: number;
  createdAt: number;
}

export interface FileEntry extends FileMeta {
  id: string;
}

/** Name of the Y.Text that holds a file's content. */
export const textKey = (fileId: string): string => (fileId === MAIN_FILE_ID ? 'code' : `f:${fileId}`);

export interface LanguageDef {
  id: string;
  label: string;
  extensions: string[];
  /** Judge0 language id, for Lane B's runner. Undefined = not runnable. */
  judge0?: number;
  starter: string;
}

export const LANGUAGES: LanguageDef[] = [
  { id: 'python', label: 'Python', extensions: ['py', 'pyw'], judge0: 71, starter: 'print("Hello, SyncVerse!")\n' },
  { id: 'javascript', label: 'JavaScript', extensions: ['js', 'mjs', 'cjs'], judge0: 63, starter: 'console.log("Hello, SyncVerse!");\n' },
  { id: 'typescript', label: 'TypeScript', extensions: ['ts'], judge0: 74, starter: 'const greeting: string = "Hello, SyncVerse!";\nconsole.log(greeting);\n' },
  {
    id: 'java',
    label: 'Java',
    extensions: ['java'],
    judge0: 62,
    starter: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, SyncVerse!");\n    }\n}\n',
  },
  { id: 'c', label: 'C', extensions: ['c', 'h'], judge0: 50, starter: '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, SyncVerse!\\n");\n    return 0;\n}\n' },
  {
    id: 'cpp',
    label: 'C++',
    extensions: ['cpp', 'cc', 'cxx', 'hpp'],
    judge0: 54,
    starter: '#include <iostream>\n\nint main() {\n    std::cout << "Hello, SyncVerse!" << std::endl;\n    return 0;\n}\n',
  },
  { id: 'r', label: 'R', extensions: ['r'], judge0: 80, starter: 'cat("Hello, SyncVerse!\\n")\n' },
  { id: 'julia', label: 'Julia', extensions: ['jl'], starter: 'println("Hello, SyncVerse!")\n' },
  { id: 'sql', label: 'SQL', extensions: ['sql'], starter: 'SELECT 1 AS hello;\n' },
  { id: 'shell', label: 'Shell', extensions: ['sh', 'bash'], starter: '#!/bin/bash\necho "Hello, SyncVerse!"\n' },
  { id: 'html', label: 'HTML', extensions: ['html', 'htm'], starter: '<!doctype html>\n<html>\n  <body>\n    <h1>Hello, SyncVerse!</h1>\n  </body>\n</html>\n' },
  { id: 'css', label: 'CSS', extensions: ['css'], starter: 'body {\n  font-family: sans-serif;\n}\n' },
  { id: 'markdown', label: 'Markdown', extensions: ['md', 'markdown'], starter: '# Notes\n\n' },
  { id: 'yaml', label: 'YAML', extensions: ['yml', 'yaml'], starter: 'name: example\n' },
  { id: 'xml', label: 'XML', extensions: ['xml'], starter: '<?xml version="1.0"?>\n<root />\n' },
  { id: 'plaintext', label: 'Plain text', extensions: ['txt', 'text', 'csv', 'log', 'json'], starter: '' },
];

export const LANGUAGE_BY_ID: Record<string, LanguageDef> = Object.fromEntries(LANGUAGES.map((l) => [l.id, l]));
export const isLanguageId = (id: unknown): id is string => typeof id === 'string' && id in LANGUAGE_BY_ID;

const EXT_TO_LANG: Record<string, string> = {};
for (const l of LANGUAGES) for (const e of l.extensions) EXT_TO_LANG[e] = l.id;

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

/** Language from a file name alone; undefined when the extension is unknown. */
export function languageFromName(name: string): string | undefined {
  return EXT_TO_LANG[extensionOf(name)];
}

/** Look at the first lines when the name does not say (no extension, or .txt). Returns undefined when it cannot tell. */
export function sniffLanguage(content: string): string | undefined {
  const head = content.slice(0, 2000);
  const first = head.split('\n', 1)[0] ?? '';
  if (/^#!.*\b(python|python3)\b/.test(first)) return 'python';
  if (/^#!.*\b(node|deno|bun)\b/.test(first)) return 'javascript';
  if (/^#!.*\b(bash|sh|zsh)\b/.test(first)) return 'shell';
  if (/^\s*<!doctype html|^\s*<html[\s>]/i.test(head)) return 'html';
  if (/^\s*#include\s*<(iostream|vector|string|map|algorithm)>|std::/.test(head)) return 'cpp';
  if (/^\s*#include\s*<[a-z]+\.h>/.test(head)) return 'c';
  if (/\bpublic\s+(static\s+)?(class|void\s+main)\b|\bSystem\.out\.print/.test(head)) return 'java';
  if (/^\s*(def|class)\s+\w+.*:\s*$|^\s*(import|from)\s+\w+.*$|^\s*print\(/m.test(head) && !/[;{}]\s*$/m.test(head)) return 'python';
  if (/\b(const|let|var)\s+\w+\s*=|\bfunction\s+\w+\s*\(|console\.log\(/.test(head)) return 'javascript';
  if (/^\s*(SELECT|INSERT|CREATE\s+TABLE|UPDATE|DELETE\s+FROM)\b/im.test(head)) return 'sql';
  if (/^#\s+\S/.test(head)) return 'markdown';
  return undefined;
}

/** The language to use for a file: the extension wins, content is the fallback, plain text is the last resort. */
export function detectLanguage(name: string, content = ''): string {
  return languageFromName(name) ?? sniffLanguage(content) ?? 'plaintext';
}

const NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_ .+()-]{0,39}$/;

/** Returns an error message, or null when the name is acceptable. `taken` are the other files' names. */
export function validateFileName(name: string, taken: string[]): string | null {
  const n = name.trim();
  if (!n) return 'Give the file a name.';
  if (n.length > 40) return 'File names can be at most 40 characters.';
  if (!NAME_RE.test(n)) return 'Use letters, numbers, spaces and . _ - + ( ) only, and start with a letter or number.';
  if (/^\.+$/.test(n)) return 'That name is not allowed.';
  if (taken.some((t) => t.toLowerCase() === n.toLowerCase())) return `A file called ${n} already exists.`;
  return null;
}

/** Turn an arbitrary uploaded file name into an acceptable, unused one. */
export function uniqueFileName(raw: string, taken: string[]): string {
  let base = raw.replace(/[\\/]/g, '_').replace(/[^A-Za-z0-9_ .+()-]/g, '_').replace(/^[^A-Za-z0-9_]+/, '').slice(0, 36).trim() || 'file.txt';
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  let n = 1;
  while (taken.some((t) => t.toLowerCase() === base.toLowerCase())) base = `${stem}-${n++}${ext}`;
  return base;
}

/** Short random id for a new file. */
export function newFileId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** A saved copy of a room's files (version history). */
export interface SnapshotFile extends FileEntry {
  content: string;
}
export interface VersionInfo {
  id: string;
  label: string;
  auto: boolean;
  createdAt: number;
  by: { userId: string; name: string } | null;
  fileCount: number;
  bytes: number;
}
