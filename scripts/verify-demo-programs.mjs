// Runs every Samples-menu program (docs/samples) in every language through the real code runner and checks what it does.
// The menu offers the same demo in Python, Java, JavaScript, C and C++; this proves each one fails (or works) the way its name says.
// Starts its own API on port 4410. Needs internet when JUDGE0_URL points at a hosted Judge0.
//   node scripts/verify-demo-programs.mjs            (all)     node scripts/verify-demo-programs.mjs java   (one language)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.VERIFY_PORT ?? 4410);
const only = process.argv[2];
const SAMPLES = path.resolve('docs/samples');
const EXT = { python: 'py', java: 'java', javascript: 'js', c: 'c', cpp: 'cpp' };
const DIR = { python: '', java: 'java', javascript: 'javascript', c: 'c', cpp: 'cpp' };

/** id -> language -> what a correct run does. `stderr` is matched against error output + compile output. */
const E = (status, extra = {}) => ({ status, ...extra });
const EXPECT = {
  '01_index_error': {
    python: E('runtime_error', { stdin: '3 4 5\n', err: /IndexError/ }),
    java: E('runtime_error', { err: /ArrayIndexOutOfBounds/ }),
    javascript: E('runtime_error', { err: /TypeError/ }),
    c: E('runtime_error'),
    cpp: E('runtime_error', { err: /out_of_range|UncaughtException|terminate/ }),
  },
  '02_name_error': {
    python: E('runtime_error', { err: /NameError/ }),
    java: E('compile_error', { err: /cannot find symbol/ }),
    javascript: E('runtime_error', { err: /ReferenceError/ }),
    c: E('compile_error', { err: /totl/ }),
    cpp: E('compile_error', { err: /totl/ }),
  },
  '03_syntax_error': {
    python: E('compile_error', { err: /SyntaxError/ }),
    java: E('compile_error', { err: /';' expected/ }),
    javascript: E('compile_error', { err: /SyntaxError/ }),
    c: E('compile_error', { err: /expected/ }),
    cpp: E('compile_error', { err: /expected/ }),
  },
  '04_infinite_loop': {
    python: E('timeout', { alt: ['runtime_error'] }), // prints forever: the runner may stop it on output size first
    java: E('timeout'),
    javascript: E('timeout'),
    c: E('timeout'),
    cpp: E('timeout'),
  },
  '05_recursion_error': {
    python: E('runtime_error', { err: /RecursionError/ }),
    java: E('runtime_error', { err: /StackOverflowError/ }),
    javascript: E('runtime_error', { err: /RangeError/ }),
    c: E('runtime_error'),
    cpp: E('runtime_error'),
  },
  '06_quality_sample': { python: E('success', { stdin: '[1, 2]\n' }) },
  '07_list_aliasing': {
    python: E('success', { out: /a is \[1, 2, 3, 4\]/ }),
    java: E('success', { out: /a is \[1, 2, 3, 4\]/ }),
    javascript: E('success', { out: /a is \[ 1, 2, 3, 4 \]/ }),
    c: E('success', { out: /a\[0\] is 99/ }),
    cpp: E('success', { out: /a is 1 2 3 4/ }),
  },
  '08_zero_division': {
    python: E('runtime_error', { err: /ZeroDivisionError/ }),
    java: E('runtime_error', { err: /ArithmeticException/ }),
    javascript: E('success', { out: /NaN/ }),
    c: E('runtime_error'),
    cpp: E('runtime_error'),
  },
  '09_type_error': {
    python: E('runtime_error', { stdin: '15\n', err: /TypeError/ }),
    java: E('compile_error', { err: /bad operand types/ }),
    javascript: E('runtime_error', { stdin: '15\n', err: /TypeError/ }),
    c: E('compile_error', { err: /invalid operands/ }),
    cpp: E('compile_error', { err: /operator\*|no match/ }),
  },
  '10_stdin_average': {
    python: E('success', { stdin: '3 4 5\n', out: /^4(\.0)?\s*$/ }),
    java: E('success', { stdin: '3 4 5\n', out: /^4\.0\s*$/ }),
    javascript: E('success', { stdin: '3 4 5\n', out: /^4\.0\s*$/ }),
    c: E('success', { stdin: '3 4 5\n', out: /^4\.0\s*$/ }),
    cpp: E('success', { stdin: '3 4 5\n', out: /^4\.0\s*$/ }),
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['--import', 'tsx', 'index.ts'], {
  cwd: path.resolve('server'),
  env: { ...process.env, PORT: String(PORT), RUN_MIN_INTERVAL_MS: '0', RUN_MAX_PER_10_MIN: '1000' },
  stdio: 'ignore',
});
const stop = () => server.kill();
process.on('exit', stop);

async function up() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/api/health`)).ok) return;
    } catch {}
    await sleep(150);
  }
  throw new Error('server did not start');
}
const headers = { 'x-user-id': 'u-verify', 'x-user-name': 'Verify', 'x-role': 'student', 'content-type': 'application/json' };

async function run(language, source, stdin) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`http://localhost:${PORT}/api/run`, { method: 'POST', headers, body: JSON.stringify({ roomCode: 'verify', language, source, stdin }) });
    const j = await r.json();
    if (r.status !== 202) throw new Error(`POST /api/run -> ${r.status} ${JSON.stringify(j)}`);
    for (let i = 0; i < 80; i++) {
      await sleep(400);
      const g = await (await fetch(`http://localhost:${PORT}/api/run/${j.id}`, { headers })).json();
      if (g.status !== 'queued' && g.status !== 'running') {
        if (g.status === 'service_error' && attempt < 3) break; // the public runner is busy: try again
        return g;
      }
    }
    await sleep(1500);
  }
  throw new Error('the runner never answered');
}

const read = (id, lang) => {
  const file = path.join(SAMPLES, DIR[lang], `${id}.${EXT[lang]}`);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
};

await up();
let bad = 0;
let total = 0;
for (const [id, byLang] of Object.entries(EXPECT)) {
  for (const [lang, want] of Object.entries(byLang)) {
    if (only && only !== lang) continue;
    total++;
    const source = read(id, lang);
    if (source === null) {
      console.log(`FAIL  ${id} [${lang}]  - program file is missing`);
      bad++;
      continue;
    }
    let run1;
    try {
      run1 = await run(lang, source, want.stdin ?? '');
    } catch (e) {
      console.log(`FAIL  ${id} [${lang}]  - ${e.message}`);
      bad++;
      continue;
    }
    const text = `${run1.stderr}\n${run1.compileOutput}\n${run1.errorMessage ?? ''}`;
    const problems = [];
    if (run1.status !== want.status && !(want.alt ?? []).includes(run1.status)) problems.push(`status ${run1.status}, wanted ${want.status}`);
    if (want.err && !want.err.test(text)) problems.push(`error text does not match ${want.err}: ${JSON.stringify(text.trim().slice(0, 160))}`);
    if (want.out && !want.out.test(run1.stdout)) problems.push(`output does not match ${want.out}: ${JSON.stringify(run1.stdout.slice(0, 120))}`);
    const line = run1.errorLine ? ` line ${run1.errorLine}` : '';
    if (problems.length) bad++;
    console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${id} [${lang}]  ${run1.status}${line}${problems.length ? '  - ' + problems.join('; ') : ''}`);
    await sleep(250);
  }
}
console.log(`\n${total - bad} of ${total} demo programs behave as named`);
stop();
process.exit(bad ? 1 : 0);
