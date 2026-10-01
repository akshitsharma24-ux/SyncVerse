/** Tiny text renderer for question text: ```fenced code```, `inline code` and **bold**. Everything else is plain text, never HTML. */
import { Fragment, type ReactNode } from 'react';

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={i}>{part.slice(1, -1)}</code>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function Rich({ text }: { text: string }) {
  const parts = text.split('```');
  return (
    <div className="qz-rich">
      {parts.map((part, i) => {
        if (i % 2 === 1) return <pre key={i}><code>{part.replace(/^\n/, '').replace(/\n$/, '')}</code></pre>;
        const paragraphs = part.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
        return paragraphs.map((p, j) => <p key={`${i}-${j}`}>{inline(p)}</p>);
      })}
    </div>
  );
}
