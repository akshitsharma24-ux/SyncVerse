// Runs every planted-bug sample with the local Python and checks the expectations in shared/samples.ts.
//   npm run verify:samples        (needs `python` on PATH; uses a 3 s timeout)
// This is a LOCAL check of the programs themselves. Judge0 may use an older Python: line numbers and exception names are the same.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tsImport } from 'tsx/esm/api';

const { SAMPLES: samples } = await tsImport('../shared/samples.ts', import.meta.url);
const { errorCategory } = await tsImport('../shared/concepts.ts', import.meta.url);

const py = process.env.PYTHON ?? 'python';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-samples-'));
let failed = 0;

for (const s of samples) {
  const file = path.join(dir, s.id + '.py');
  fs.writeFileSync(file, s.source, 'utf8');
  const r = spawnSync(py, [file], { input: s.stdin, encoding: 'utf8', timeout: 3000, maxBuffer: 50 * 1024 * 1024 });
  let status;
  if (r.error && r.error.code === 'ETIMEDOUT') status = 'timeout';
  else if (r.status === 0) status = 'success';
  else status = /SyntaxError|IndentationError/.test(r.stderr) ? 'compile_error' : 'runtime_error';
  const category = errorCategory(status, r.stderr ?? '');
  // last "line N" in the traceback that points at our file = where it was raised
  const lines = [...(r.stderr ?? '').matchAll(/File "[^"]*", line (\d+)/g)].map((m) => Number(m[1]));
  const errorLine = lines.length ? lines[lines.length - 1] : undefined;

  const problems = [];
  if (status !== s.expect.status) problems.push(`status ${status} != expected ${s.expect.status}`);
  if (s.expect.errorName && category !== s.expect.errorName) problems.push(`error ${category} != expected ${s.expect.errorName}`);
  if (s.expect.errorLine !== undefined && errorLine !== s.expect.errorLine) problems.push(`line ${errorLine} != expected ${s.expect.errorLine}`);
  if (s.expect.stdout !== undefined && (r.stdout ?? '').replace(/\r\n/g, '\n') !== s.expect.stdout) problems.push(`stdout ${JSON.stringify(r.stdout)} != expected ${JSON.stringify(s.expect.stdout)}`);
  if (s.explanation?.whereLine !== undefined && s.expect.errorLine !== undefined && s.explanation.whereLine !== s.expect.errorLine) problems.push('explanation.whereLine differs from expect.errorLine');

  const ok = problems.length === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${s.id.padEnd(16)} observed: ${status}${category !== status ? ' / ' + category : ''}${errorLine ? ' @ line ' + errorLine : ''}${ok ? '' : '   <- ' + problems.join('; ')}`);
}
fs.rmSync(dir, { recursive: true, force: true });

// ------------------------------------------------------------------------------------------- fixtures vs samples
const { fixtureRuns, fixtureDiagnostics, fixtureExplanations, makeSeedEvents } = await tsImport('../shared/fixtures.ts', import.meta.url);
const { CONCEPT_SLUGS, OBSERVATION_RULE } = await tsImport('../shared/concepts.ts', import.meta.url);
const report = (ok, name, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '   <- ' + detail : ''}`);
};

{
  const bad = [];
  for (const s of samples) for (const c of [...s.concepts, ...(s.explanation?.concepts ?? [])]) if (!CONCEPT_SLUGS.includes(c)) bad.push(`${s.id}:${c}`);
  report(bad.length === 0, 'every concept slug used by a sample exists in the taxonomy', bad.join(', '));
}
{
  const statuses = ['queued', 'running', 'success', 'runtime_error', 'compile_error', 'timeout', 'memory_limit', 'service_error'];
  const missing = statuses.filter((s) => !fixtureRuns[s] || fixtureRuns[s].status !== s);
  const noLine = ['runtime_error', 'compile_error'].filter((s) => !fixtureRuns[s].errorLine);
  report(missing.length === 0 && noLine.length === 0, 'fixtureRuns has one run per status; error runs carry errorLine', [...missing, ...noLine].join(', '));
}
{
  const q = samples.find((s) => s.id === 'quality-smells').source.split('\n');
  const probs = [];
  for (const d of fixtureDiagnostics) {
    const text = q[d.line - 1];
    if (text === undefined) { probs.push(`${d.rule}: line ${d.line} does not exist`); continue; }
    const rules = {
      'line-too-long': () => text.length > 100,
      'dangerous-eval': () => text.includes('eval'),
      'bare-except': () => text.trim() === 'except:',
      'deep-nesting': () => text.includes('for d'),
      'magic-number': () => text.includes('3.14159'),
      'short-name': () => /^( *)(def f\(|t = )/.test(text),
    };
    if (!rules[d.rule]) probs.push(`${d.rule}: unknown rule`);
    else if (!rules[d.rule]()) probs.push(`${d.rule}: line ${d.line} is ${JSON.stringify(text.slice(0, 40))}`);
  }
  const cats = new Set(fixtureDiagnostics.map((d) => d.category));
  for (const c of ['formatting', 'naming', 'smell', 'complexity', 'security']) if (!cats.has(c)) probs.push('no ' + c + ' diagnostic');
  report(probs.length === 0, 'fixtureDiagnostics point at the right lines and cover all five categories', probs.join('; '));
}
{
  const ev = makeSeedEvents({ userId: 'u', roomCode: 'r', now: 1_790_000_000_000 }).filter((e) => e.type === 'run').sort((a, b) => a.at - b.at);
  const last = ev.slice(-OBSERVATION_RULE.windowRuns);
  const counts = {};
  for (const e of last) if (!e.ok) counts[e.category] = (counts[e.category] ?? 0) + 1;
  const latestFailed = !last[last.length - 1].ok;
  const flagged = Object.entries(counts).filter(([, n]) => n >= OBSERVATION_RULE.repeatFailures).map(([c]) => c);
  report(latestFailed && flagged.includes('IndexError'), 'seed history triggers "Retry recommended" for IndexError (rule in concepts.ts)', JSON.stringify(counts));
}
{
  const probs = Object.keys(fixtureExplanations).filter((id) => !samples.find((s) => s.id === id));
  report(probs.length === 0 && Object.keys(fixtureExplanations).length >= 6, 'pre-baked explanations exist for the failing samples', probs.join(', '));
}

process.exit(failed ? 1 : 0);
