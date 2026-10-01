// The quiz judge in every language, through the real code runner (Judge0): Java, JavaScript, C and C++ solutions to two problems must
// pass every test, and broken programs must be reported the way a student needs them. Starts its own server (port 4421), needs internet.
//   node scripts/test-quiz-languages.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 4421;
const BASE = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-quiz-lang-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = async (name, fn) => {
  try {
    results.push([true, name, (await fn()) ?? '']);
  } catch (e) {
    results.push([false, name, String(e.message).split('\n')[0]]);
  }
};

const server = spawn(process.execPath, ['--import', 'tsx', 'index.ts'], {
  cwd: path.resolve('server'),
  env: { ...process.env, PORT: String(PORT), COLLAB_DATA_DIR: dataDir, QUIZ_SUBMIT_GAP_MS: '0', RUN_MIN_INTERVAL_MS: '0' },
  stdio: 'ignore',
});
const stop = () => server.kill();
process.on('exit', stop);
for (let i = 0; i < 120; i++) {
  try {
    if ((await fetch(`${BASE}/api/health`)).ok) break;
  } catch {}
  await sleep(150);
}

const ROOM = 'qlang-' + Math.random().toString(36).slice(2, 6);
const T = { id: 'u-t', name: 'Teacher', role: 'mentor' };
const S = { id: 'u-s', name: 'Student', role: 'student' };
const call = async (who, method, p, body) => {
  const r = await fetch(BASE + p, { method, headers: { 'x-user-id': who.id, 'x-user-name': who.name, 'x-role': who.role, 'x-room': ROOM, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  return { status: r.status, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
};

const SOLUTIONS = {
  'Two Sum': {
    java: `import java.util.*;
public class Solution {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt();
        int target = in.nextInt();
        int[] a = new int[n];
        for (int i = 0; i < n; i++) a[i] = in.nextInt();
        Map<Integer, Integer> seen = new HashMap<>();
        for (int j = 0; j < n; j++) {
            Integer i = seen.get(target - a[j]);
            if (i != null) { System.out.println(i + " " + j); return; }
            seen.put(a[j], j);
        }
    }
}
`,
    javascript: `const d = require("fs").readFileSync(0, "utf8").split(/\\s+/).filter(Boolean).map(Number);
const n = d[0], t = d[1], a = d.slice(2, 2 + n);
const seen = new Map();
for (let j = 0; j < n; j++) {
  if (seen.has(t - a[j])) { console.log(seen.get(t - a[j]) + " " + j); break; }
  seen.set(a[j], j);
}
`,
    c: `#include <stdio.h>
int main(void) {
    int n, t, a[2000];
    scanf("%d %d", &n, &t);
    for (int i = 0; i < n; i++) scanf("%d", &a[i]);
    for (int i = 0; i < n; i++)
        for (int j = i + 1; j < n; j++)
            if (a[i] + a[j] == t) { printf("%d %d\\n", i, j); return 0; }
    return 0;
}
`,
    cpp: `#include <bits/stdc++.h>
using namespace std;
int main() {
    int n, t;
    cin >> n >> t;
    vector<int> a(n);
    for (auto& x : a) cin >> x;
    unordered_map<int, int> seen;
    for (int j = 0; j < n; j++) {
        auto it = seen.find(t - a[j]);
        if (it != seen.end()) { cout << it->second << " " << j << endl; return 0; }
        seen[a[j]] = j;
    }
}
`,
  },
  'Best Time to Buy and Sell Stock': {
    java: `import java.util.*;
public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        int n = in.nextInt();
        int low = Integer.MAX_VALUE, best = 0;
        for (int i = 0; i < n; i++) { int p = in.nextInt(); low = Math.min(low, p); best = Math.max(best, p - low); }
        System.out.println(best);
    }
}
`,
    javascript: `const d = require("fs").readFileSync(0, "utf8").split(/\\s+/).filter(Boolean).map(Number);
let low = Infinity, best = 0;
for (const p of d.slice(1)) { low = Math.min(low, p); best = Math.max(best, p - low); }
console.log(best);
`,
    c: `#include <stdio.h>
int main(void) {
    int n, p, low = 1 << 30, best = 0;
    scanf("%d", &n);
    while (n-- > 0 && scanf("%d", &p) == 1) { if (p < low) low = p; if (p - low > best) best = p - low; }
    printf("%d\\n", best);
    return 0;
}
`,
    cpp: `#include <bits/stdc++.h>
using namespace std;
int main() {
    int n;
    cin >> n;
    int low = INT_MAX, best = 0, p;
    while (n-- > 0 && cin >> p) { low = min(low, p); best = max(best, p - low); }
    cout << best << endl;
}
`,
  },
};

let problems = [];
await call(T, 'POST', `/api/rooms/${ROOM}/join`, { role: 'mentor' });
await call(S, 'POST', `/api/rooms/${ROOM}/join`, { role: 'student' });
await check('a quiz with the two easy Arrays coding problems starts', async () => {
  const c = await call(T, 'POST', '/api/quiz/create', { title: 'Languages', topics: ['arrays'], difficulty: 'easy', format: 'code', count: 2, minutes: 30, liveBoard: true });
  if (c.status !== 200) throw new Error('create: ' + JSON.stringify(c.json));
  await call(T, 'POST', '/api/quiz/start');
  problems = (await call(S, 'GET', '/api/quiz')).json.active.questions;
  if (problems.length !== 2) throw new Error('questions: ' + problems.length);
});

for (const [title, byLang] of Object.entries(SOLUTIONS)) {
  for (const [language, source] of Object.entries(byLang)) {
    await check(`${title} in ${language}: every test passes`, async () => {
      const q = problems.find((x) => x.title === title);
      const r = await call(S, 'POST', '/api/quiz/submit', { questionId: q.id, language, source });
      if (r.status !== 200) throw new Error(`status ${r.status}: ${JSON.stringify(r.json).slice(0, 200)}`);
      const { passed, total, outcomes, message } = r.json.result;
      if (passed !== total) throw new Error(`${passed} of ${total} passed: ${message ?? JSON.stringify(outcomes.filter((o) => o.verdict !== 'passed').slice(0, 2))}`);
      return `${passed}/${total}`;
    });
  }
}

await check('a C++ compile error is reported with the compiler message and no test runs', async () => {
  const q = problems[0];
  const r = await call(S, 'POST', '/api/quiz/submit', { questionId: q.id, language: 'cpp', source: 'int main() { int x = ; }\n' });
  if (r.status !== 200) throw new Error('status ' + r.status);
  if (!/error/i.test(r.json.result.message ?? '')) throw new Error('no compiler message: ' + r.json.result.message);
  if (!r.json.result.outcomes.every((o) => o.verdict === 'compile_error')) throw new Error('outcomes should all be compile errors');
});

await check('an infinite loop is stopped as a time limit, not a hang', async () => {
  const q = problems[1];
  const r = await call(S, 'POST', '/api/quiz/submit', { questionId: q.id, language: 'javascript', source: 'while (true) {}\n' });
  if (r.status !== 200) throw new Error('status ' + r.status);
  if (!r.json.result.outcomes.some((o) => o.verdict === 'timeout')) throw new Error('verdicts: ' + r.json.result.outcomes.map((o) => o.verdict).join(','));
});

await check('after all that the student is on top with full marks', async () => {
  const s = (await call(T, 'GET', '/api/quiz')).json.active.leaderboard[0];
  if (s.name !== 'Student' || s.score !== 20) throw new Error(JSON.stringify(s));
});

stop();
fs.rmSync(dataDir, { recursive: true, force: true });
for (const [pass, name, d] of results) console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${d ? '  - ' + d : ''}`);
console.log(`\n${results.filter((r) => r[0]).length} of ${results.length} checks passed`);
process.exit(results.every((r) => r[0]) ? 0 : 1);
