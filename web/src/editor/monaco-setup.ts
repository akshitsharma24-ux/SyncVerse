/**
 * Load Monaco from the local package (works offline) with only the core editor + Python highlighting, and define the
 * 'syncverse' theme (warm paper, ink text, restrained syntax colours). Imported once by editor/index.tsx BEFORE the
 * first editor mounts. Owner: Lane A.
 */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { loader } from '@monaco-editor/react';

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

loader.config({ monaco });

export { monaco };
