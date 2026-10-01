/**
 * A private code editor for quiz answers: a plain Monaco editor (no Yjs, nothing shared), so what a student types is only theirs.
 * It is remounted for each question and language (key them), and reports every change through onChange.
 */
import { useEffect, useRef } from 'react';
import { monaco } from '../editor/monaco-setup';

export function CodeBox({ value, language, onChange, readOnly, label, onRun }: { value: string; language: string; onChange: (v: string) => void; readOnly?: boolean; label: string; onRun?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const runRef = useRef(onRun);
  runRef.current = onRun;

  useEffect(() => {
    if (!host.current) return;
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const model = monaco.editor.createModel(value, language);
    model.setEOL(monaco.editor.EndOfLineSequence.LF);
    const editor = monaco.editor.create(host.current, {
      model,
      theme: 'syncverse-dark',
      minimap: { enabled: false },
      fontFamily: "'Geist Mono Variable', ui-monospace, Consolas, monospace",
      fontSize: 13.5,
      lineHeight: 22,
      padding: { top: 10, bottom: 10 },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      ariaLabel: label,
      readOnly: Boolean(readOnly),
      snippetSuggestions: 'top',
      acceptSuggestionOnEnter: 'off',
      quickSuggestions: { other: true, comments: false, strings: false },
      smoothScrolling: !reduceMotion,
      cursorSmoothCaretAnimation: reduceMotion ? 'off' : 'on',
      tabSize: 4,
    });
    const sub = model.onDidChangeContent(() => changeRef.current(model.getValue()));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current?.());
    // Dev-only hook so browser tests can type a solution: window.__svQuizCode.setValue('print(1)')
    if (import.meta.env.DEV) (window as unknown as { __svQuizCode?: unknown }).__svQuizCode = { setValue: (t: string) => model.setValue(t), getValue: () => model.getValue() };
    return () => {
      sub.dispose();
      editor.dispose();
      model.dispose();
    };
    // Mounted once per (question, language): the parent changes `key` to start over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="qz-code" ref={host} data-testid="quiz-code" />;
}
