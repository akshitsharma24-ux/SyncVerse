/**
 * Lane B (Simrit): P-B4 quality analysis (Python). Beginner-friendly feedback, not a grade.
 *   POST /api/analyze  {source} -> Diagnostic[]   (pure, stores nothing, sorted by line)
 * Heuristics on text and indentation, not a parser. Rules run on a copy of the code with strings and comments blanked
 * out (same line numbers and columns), so "eval" inside a string or a number inside a comment never triggers anything.
 *   formatting  line-too-long
 *   naming      one-letter-name
 *   smell       deep-nesting, magic-number, bare-except
 *   complexity  nested-loops
 *   security    dangerous-call (eval / exec / os.system / ...), hardcoded-secret
 */
import { Router } from 'express';
import { z } from 'zod';
import type { Diagnostic } from '@syncverse/shared';

const MAX_SOURCE_CHARS = 100_000;
const MAX_FINDINGS = 200;
const MAX_LINE = 100;
const MAX_NESTING = 3;
const TAB = 4;

/** Returns one string per line: strings' contents and comments replaced by spaces (quotes and all other code kept). */
function blankLines(source: string): string[] {
  const out: string[] = [];
  let cur = '';
  let i = 0;
  let quote = ''; // '' = code, otherwise the string delimiter (', ", ''' or """)
  const n = source.length;
  while (i < n) {
    const c = source[i];
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      out.push(cur);
      cur = '';
      if (quote.length === 1) quote = ''; // an unterminated single-quoted string ends at the line end
      i++;
      continue;
    }
    if (quote) {
      if (c === '\\') {
        cur += ' ';
        i++;
        if (i < n && source[i] !== '\n' && source[i] !== '\r') {
          cur += ' ';
          i++;
        }
        continue;
      }
      if (source.startsWith(quote, i)) {
        cur += quote;
        i += quote.length;
        quote = '';
        continue;
      }
      cur += ' ';
      i++;
      continue;
    }
    if (c === '#') {
      while (i < n && source[i] !== '\n') i++;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = source.startsWith(c.repeat(3), i) ? c.repeat(3) : c;
      cur += quote;
      i += quote.length;
      continue;
    }
    cur += c;
    i++;
  }
  out.push(cur);
  return out;
}

interface Logical {
  line: number; // first physical line, 1-based
  indent: number;
  text: string; // blanked text of the whole statement, continuation lines joined with spaces
}

function indentOf(s: string): number {
  let w = 0;
  for (const ch of s) {
    if (ch === ' ') w++;
    else if (ch === '\t') w += TAB - (w % TAB);
    else break;
  }
  return w;
}

/** Joins lines that belong to one statement (open brackets or a trailing backslash). */
function logicalLines(blank: string[]): Logical[] {
  const res: Logical[] = [];
  let depth = 0;
  let cont = false;
  let open: Logical | null = null;
  blank.forEach((text, idx) => {
    const trimmed = text.trim();
    if (open) {
      open.text += ' ' + trimmed;
    } else if (trimmed) {
      open = { line: idx + 1, indent: indentOf(text), text: trimmed };
      res.push(open);
    }
    for (const ch of text) {
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
    }
    cont = /\\\s*$/.test(text);
    if (depth === 0 && !cont) open = null;
  });
  return res;
}

const BLOCK_KINDS = ['if', 'elif', 'else', 'for', 'while', 'try', 'except', 'finally', 'with'] as const;
const KEYWORD_LINE =
  /^(for|while|if|elif|else|try|except|finally|with|return|import|from|class|lambda|assert|del|global|nonlocal|pass|break|continue|raise|yield|print|async\s+for|async\s+with)\b/;

function splitTop(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

const oneLetter = (s: string) => /^[A-Za-z]$/.test(s);

/** Names defined by a statement: assignment targets, function name and its parameters (loop variables are exempt). */
function definedNames(text: string): string[] {
  const names: string[] = [];
  const def = /^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(([\s\S]*)\)\s*(?:->[^:]+)?:\s*$/.exec(text);
  if (def) {
    names.push(def[1]);
    for (const p of splitTop(def[2])) {
      const id = /^\s*\*{0,2}\s*([A-Za-z_]\w*)/.exec(p);
      if (id) names.push(id[1]);
    }
    return names.filter(oneLetter);
  }
  if (KEYWORD_LINE.test(text)) return [];
  const asg = /^([\w\s,*]+?)\s*(?::\s*[^=]+?)?\s*(?:[+\-*/%&|^@]|\/\/|\*\*|>>|<<)?=(?!=)/.exec(text);
  if (!asg) return [];
  for (const t of splitTop(asg[1])) {
    const id = t.replace(/^[\s*]+/, '').trim();
    if (oneLetter(id)) names.push(id);
  }
  return names;
}

const NUMBER = /(?<![\w.])(0[xX][0-9a-fA-F]+|\d+\.\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|\d+(?:[eE][+-]?\d+)?)(?![\w.])/g;
const OPERATOR_BEFORE = /(\*\*=?|\/\/=?|==|!=|<=|>=|[+\-*/%]=?|[<>])\s*$/;
/** Small whole numbers (0 to 10) and 0.5 read naturally in code (x % 3, * 2, / 10); they are not flagged. */
const isTrivial = (n: number) => (Number.isInteger(n) && n >= 0 && n <= 10) || n === 0.5;

/** Numbers used in arithmetic or comparisons (not plain data like [3, 4, 5] or x = 5, nor constants/defaults). */
function magicNumbers(code: string): { value: string; col: number }[] {
  if (/^\s*[A-Z][A-Z0-9_]*\s*(?::[^=]+)?=/.test(code)) return []; // NAMED_CONSTANT = 100 is the fix, not the problem
  const found: { value: string; col: number }[] = [];
  const seen = new Set<string>();
  NUMBER.lastIndex = 0;
  for (let m = NUMBER.exec(code); m; m = NUMBER.exec(code)) {
    const value = m[1];
    const num = Number(value);
    if (Number.isFinite(num) && isTrivial(num)) continue;
    const before = code.slice(0, m.index);
    const op = OPERATOR_BEFORE.exec(before);
    if (!op) continue;
    if (op[1] === '+' || op[1] === '-') {
      const beforeOp = before.slice(0, op.index).trimEnd();
      if (!/[\w)\]]$/.test(beforeOp)) continue; // unary sign such as x = -5 or f(-5)
      if (/\b(return|in|and|or|not|if|elif|while|else|is|lambda|yield)$/.test(beforeOp)) continue;
    }
    if (seen.has(value + ':' + m.index)) continue;
    seen.add(value + ':' + m.index);
    found.push({ value, col: m.index + 1 });
  }
  return found;
}

const SECRET = /\b\w*(password|passwd|secret|api_?key|token)\w*\s*=\s*(['"])[^'"\n]{3,}\2/i;

export function analyze(source: string): Diagnostic[] {
  const raw = source.split(/\r?\n/);
  const blank = blankLines(source);
  const out: Diagnostic[] = [];
  const add = (d: Diagnostic) => {
    if (out.length < MAX_FINDINGS * 4) out.push(d);
  };

  // ---- per physical line -------------------------------------------------------------------------------
  blank.forEach((code, idx) => {
    const line = idx + 1;
    const original = raw[idx] ?? '';
    if (original.length > MAX_LINE) {
      add({
        category: 'formatting',
        severity: 'warning',
        line,
        col: MAX_LINE + 1,
        rule: 'line-too-long',
        message: `This line is ${original.length} characters long. Lines over ${MAX_LINE} are hard to read; try splitting it into shorter lines.`,
      });
    }
    for (const n of magicNumbers(code)) {
      add({
        category: 'smell',
        severity: 'info',
        line,
        col: n.col,
        rule: 'magic-number',
        message: `The number ${n.value} appears without a name. Put it in a named constant (like SECONDS_PER_DAY = 86400) so readers know what it means.`,
      });
    }
    const danger = /(?<![\w.])(eval|exec)\s*\(/.exec(code);
    if (danger && !/\bdef\s+(eval|exec)\b/.test(code)) {
      add({
        category: 'security',
        severity: 'error',
        line,
        col: danger.index + 1,
        rule: 'dangerous-call',
        message: `${danger[1]}() runs any text as code, so a bad input can take over your program. Use a safe alternative such as int(), float() or a dictionary lookup.`,
      });
    }
    const shell = /\bos\s*\.\s*system\s*\(/.exec(code) ?? /\bsubprocess\s*\.\s*\w+\s*\([^)]*shell\s*=\s*True/.exec(code);
    if (shell) {
      add({
        category: 'security',
        severity: 'warning',
        line,
        col: shell.index + 1,
        rule: 'dangerous-call',
        message:
          'Running shell commands from text can be unsafe if the text comes from a user. Prefer a Python function, or subprocess with a list of arguments.',
      });
    }
    const pickle = /\bpickle\s*\.\s*loads?\s*\(/.exec(code);
    if (pickle) {
      add({
        category: 'security',
        severity: 'warning',
        line,
        col: pickle.index + 1,
        rule: 'dangerous-call',
        message: 'pickle can run code hidden inside the data it loads. Only load pickle files you created yourself.',
      });
    }
    // Secrets live inside strings, so look at the raw text (cut at a comment start that is outside quotes: approximate by blank length).
    const secret = SECRET.exec(original.slice(0, code.length));
    if (secret && /\b\w*(password|passwd|secret|api_?key|token)\w*\s*=/i.test(code)) {
      add({
        category: 'security',
        severity: 'warning',
        line,
        col: secret.index + 1,
        rule: 'hardcoded-secret',
        message:
          'A password or key is written directly in the code. Anyone who sees the file can read it; load it from an environment variable instead.',
      });
    }
  });

  // ---- per statement --------------------------------------------------------------------------------------
  const logical = logicalLines(blank);
  const flaggedNames = new Set<string>();
  const stack: { indent: number; kind: string }[] = [];
  for (const ll of logical) {
    while (stack.length && ll.indent <= stack[stack.length - 1].indent) stack.pop();
    const text = ll.text;
    const first = blank[ll.line - 1];

    for (const name of definedNames(text)) {
      if (flaggedNames.has(name)) continue;
      flaggedNames.add(name);
      const col = new RegExp(`(?<![\\w])${name}(?![\\w])`).exec(first)?.index;
      const confusing = name === 'l' || name === 'O' || name === 'I';
      add({
        category: 'naming',
        severity: 'info',
        line: ll.line,
        col: col !== undefined ? col + 1 : undefined,
        rule: 'one-letter-name',
        message: confusing
          ? `The name '${name}' is a single letter that looks like 1 or 0. Pick a descriptive name such as 'length' or 'count'.`
          : `The name '${name}' is a single letter. A descriptive name (like 'total' or 'count') makes the code easier to read.`,
      });
    }

    if (/^except\s*:/.test(text)) {
      add({
        category: 'smell',
        severity: 'warning',
        line: ll.line,
        col: ll.indent + 1,
        rule: 'bare-except',
        message:
          "A bare 'except:' hides every error, even typos and Ctrl+C. Name the error you expect, for example 'except ValueError:'.",
      });
    }

    const kindMatch = /^(?:async\s+)?(def|class|if|elif|else|for|while|try|except|finally|with)\b/.exec(text);
    if (kindMatch && /:\s*$/.test(text)) {
      const kind = kindMatch[1];
      const lastDef = stack.map((s) => s.kind).lastIndexOf('def');
      const lastClass = stack.map((s) => s.kind).lastIndexOf('class');
      const scope = stack.slice(Math.max(lastDef, lastClass) + 1); // nesting restarts inside a function or class
      if ((BLOCK_KINDS as readonly string[]).includes(kind)) {
        const level = scope.filter((s) => (BLOCK_KINDS as readonly string[]).includes(s.kind)).length + 1;
        if (level > MAX_NESTING) {
          add({
            category: 'smell',
            severity: 'warning',
            line: ll.line,
            col: ll.indent + 1,
            rule: 'deep-nesting',
            message: `This block is nested ${level} levels deep. Deeply nested code is hard to follow; try an early 'return'/'continue' or move part of it into a function.`,
          });
        }
      }
      if (kind === 'for' || kind === 'while') {
        const depth = scope.filter((s) => s.kind === 'for' || s.kind === 'while').length + 1;
        if (depth >= 2) {
          add({
            category: 'complexity',
            severity: 'info',
            line: ll.line,
            col: ll.indent + 1,
            rule: 'nested-loops',
            message:
              depth === 2
                ? 'A loop inside a loop: the work grows roughly with n × n (about O(n²)), so it slows down quickly for big inputs.'
                : `${depth} loops nested: the work grows roughly like n to the power ${depth}, so it slows down very quickly for big inputs.`,
          });
        }
      }
      stack.push({ indent: ll.indent, kind });
    }
  }

  out.sort((a, b) => a.line - b.line || (a.col ?? 0) - (b.col ?? 0) || a.rule.localeCompare(b.rule));
  return out.slice(0, MAX_FINDINGS);
}

export const router = Router();

router.post('/analyze', (req, res) => {
  const parsed = z.object({ source: z.string().max(MAX_SOURCE_CHARS) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Send {source: string} (up to 100,000 characters).' });
    return;
  }
  res.json(analyze(parsed.data.source));
});
