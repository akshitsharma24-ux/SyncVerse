/**
 * Load Monaco from the local package (works offline) with the core editor and syntax highlighting for the languages in
 * shared/files.ts, and define the 'syncverse' / 'syncverse-dark' themes (warm paper or charcoal, restrained syntax colours).
 * Each language's grammar is a separate small chunk that loads only when a file of that language is first opened.
 * Imported once by editor/index.tsx BEFORE the first editor mounts. Owner: Lane A.
 */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import 'monaco-editor/esm/vs/basic-languages/java/java.contribution';
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution'; // registers both 'c' and 'cpp'
import 'monaco-editor/esm/vs/basic-languages/r/r.contribution';
import 'monaco-editor/esm/vs/basic-languages/julia/julia.contribution';
import 'monaco-editor/esm/vs/basic-languages/sql/sql.contribution';
import 'monaco-editor/esm/vs/basic-languages/shell/shell.contribution';
import 'monaco-editor/esm/vs/basic-languages/html/html.contribution';
import 'monaco-editor/esm/vs/basic-languages/css/css.contribution';
import 'monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution';
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution';
import 'monaco-editor/esm/vs/basic-languages/xml/xml.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

monaco.editor.defineTheme('syncverse', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: 'B4236B' },
    { token: 'string', foreground: '1F7A4D' },
    { token: 'number', foreground: 'B45309' },
    { token: 'comment', foreground: '8A877E', fontStyle: 'italic' },
    { token: 'identifier', foreground: '151515' },
    { token: 'delimiter', foreground: '77756E' },
    { token: 'operator', foreground: '3B3B38' },
  ],
  colors: {
    'editor.background': '#FBFAF7',
    'editor.foreground': '#151515',
    'editorLineNumber.foreground': '#B8B5AB',
    'editorLineNumber.activeForeground': '#151515',
    'editor.lineHighlightBackground': '#F3F1EA',
    'editor.lineHighlightBorder': '#F3F1EA',
    'editorCursor.foreground': '#151515',
    'editor.selectionBackground': '#DDD9CC',
    'editor.inactiveSelectionBackground': '#E8E5DB',
    'editorIndentGuide.background1': '#E8E5DB',
    'editorIndentGuide.activeBackground1': '#C9C6BC',
    'editorGutter.background': '#FBFAF7',
    'scrollbarSlider.background': '#D8D5CD99',
    'scrollbarSlider.hoverBackground': '#A9A69DAA',
  },
});

monaco.editor.defineTheme('syncverse-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'keyword', foreground: 'F08BBD' },
    { token: 'string', foreground: '8FD9A0' },
    { token: 'number', foreground: 'F0A060' },
    { token: 'comment', foreground: '8F8B80', fontStyle: 'italic' },
    { token: 'identifier', foreground: 'EFECE4' },
    { token: 'delimiter', foreground: 'A8A397' },
    { token: 'operator', foreground: 'CFCABD' },
  ],
  colors: {
    'editor.background': '#1D1C19',
    'editor.foreground': '#EFECE4',
    'editorLineNumber.foreground': '#6F6B62',
    'editorLineNumber.activeForeground': '#EFECE4',
    'editor.lineHighlightBackground': '#24231F',
    'editor.lineHighlightBorder': '#24231F',
    'editorCursor.foreground': '#EFECE4',
    'editor.selectionBackground': '#3C3930',
    'editor.inactiveSelectionBackground': '#322F28',
    'editorIndentGuide.background1': '#2D2B27',
    'editorIndentGuide.activeBackground1': '#4A463E',
    'editorGutter.background': '#1D1C19',
    'scrollbarSlider.background': '#38352F99',
    'scrollbarSlider.hoverBackground': '#6F6B62AA',
  },
});

export { monaco };
