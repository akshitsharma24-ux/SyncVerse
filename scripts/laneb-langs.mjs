// Lane B (Simrit) API checks for P-B5: C, C++, Java, JavaScript through the real Judge0, plus the local runner's language limits.
// Starts its own servers (ports 4405 = Judge0, 4406 = local runner). Needs internet for the Judge0 part.
//   node scripts/laneb-langs.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';

const results = [];
const servers = [];
const check = async (name, fn) => {
  try {
    results.push([true, name, (await fn()) ?? '']);
  } catch (e) {
    results.push([false, name, String(e.message).split('\n')[0]]);
  }
};
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const has = (text, re, what) => {
  if (!re.test(text ?? '')) throw new Error(`${what}: ${JSON.stringify(text)} does not match ${re}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function start(port, env) {
  const p = spawn(process.execPath, ['--import', 'tsx', 'index.ts'], {
    cwd: path.resolve('server'),
    env: { ...process.env, PORT: String(port), RUN_MIN_INTERVAL_MS: '0', RUN_MAX_PER_10_MIN: '1000', ...env },
    stdio: 'ignore',
  });
  servers.push(p);
}
async function up(port) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/api/health`)).ok) return;
    } catch {}
    await sleep(150);
  }
  throw new Error('server did not start on ' + port);
}
async function call(port, who, method, p, body) {
  const res = await fetch(`http://localhost:${port}${p}`, {
    method,
    headers: { 'x-user-id': 'u-' + who, 'x-user-name': who, 'x-role': 'student', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json };
}
async function run(port, who, language, source, stdin = '') {
  const r = await call(port, who, 'POST', '/api/run', { roomCode: 'room1', language, source, stdin });
  eq(r.status, 202, `POST /api/run (${language}) -> ${JSON.stringify(r.json)}`);
  for (let i = 0; i < 90; i++) {
    await sleep(400);
    const g = await call(port, who, 'GET', '/api/run/' + r.json.id);
    if (g.json && g.json.status !== 'queued' && g.json.status !== 'running') return g.json;
  }
  throw new Error(language + ' run did not finish in 36 s');
}

const JUDGE = 4405;
const LOCAL = 4406;
try {
  start(JUDGE, {});
  start(LOCAL, { RUNNER: 'local' });
  await up(JUDGE);
  await up(LOCAL);

  await check('run-info lists all five languages on Judge0, only Python + JavaScript on the local runner', async () => {
    eq((await call(JUDGE, 'x', 'GET', '/api/run-info')).json.languages, ['python', 'c', 'cpp', 'java', 'javascript'], 'judge0');
    eq((await call(LOCAL, 'x', 'GET', '/api/run-info')).json.languages, ['python', 'javascript'], 'local');
  });

  // Every language group runs at the same time (different users) to keep the suite fast.
  const groups = {
    C: async () => {
      const u = 'c-user';
      await check('C: hello-world', async () => {
        const r = await run(JUDGE, u, 'c', '#include <stdio.h>\nint main(void) {\n    printf("hello\\n");\n    return 0;\n}\n');
        eq([r.status, r.stdout], ['success', 'hello\n'], 'result');
      });
      await check('C: reads stdin with scanf', async () => {
        const r = await run(JUDGE, u, 'c', '#include <stdio.h>\nint main(void) {\n    int n;\n    scanf("%d", &n);\n    printf("%d\\n", n * 2);\n    return 0;\n}\n', '21');
        eq([r.status, r.stdout], ['success', '42\n'], 'result');
      });
      await check('C: sqrt() with a variable links (the -lm flag is applied)', async () => {
        const r = await run(JUDGE, u, 'c', '#include <stdio.h>\n#include <math.h>\nint main(void) {\n    double v;\n    scanf("%lf", &v);\n    printf("%.1f\\n", sqrt(v));\n    return 0;\n}\n', '16');
        eq([r.status, r.stdout], ['success', '4.0\n'], 'result');
      });
      await check('C: missing semicolon -> compile_error on the line that LACKS it (4), not gcc\'s line 5', async () => {
        const r = await run(JUDGE, u, 'c', '#include <stdio.h>\n#include <math.h>\nint main(void) {\n    int x = 5\n    printf("%d\\n", x);\n    return 0;\n}\n');
        eq(r.status, 'compile_error', 'status');
        eq(r.errorLine, 4, 'errorLine');
        has(r.errorMessage, /^error: expected/, 'message');
        has(r.compileOutput, /main\.c:5:5: error/, 'raw compiler output is kept');
      });
      await check('C: warnings are kept in compileOutput on a successful run (-Wall -Wextra)', async () => {
        const r = await run(JUDGE, u, 'c', '#include <stdio.h>\nint main(void) {\n    int unused = 3;\n    printf("ok\\n");\n    return 0;\n}\n');
        eq(r.status, 'success', 'status');
        has(r.compileOutput, /unused variable/, 'warning');
        eq(r.errorLine, undefined, 'no error line for a warning');
      });
      await check('C: segmentation fault -> runtime_error with a plain-language message, no line, no shell noise', async () => {
        const r = await run(JUDGE, u, 'c', '#include <stdio.h>\nint main(void) {\n    int *p = 0;\n    *p = 1;\n    return 0;\n}\n');
        eq(r.status, 'runtime_error', 'status');
        has(r.errorMessage, /^Segmentation fault/, 'message');
        eq(r.errorLine, undefined, 'line');
        if (/run\.sh/.test(r.stderr)) throw new Error('shell wrapper leaked: ' + r.stderr);
      });
      await check('C: division by zero -> arithmetic error message', async () => {
        const r = await run(JUDGE, u, 'c', '#include <stdio.h>\nint main(void) {\n    int b;\n    scanf("%d", &b);\n    printf("%d\\n", 5 / b);\n    return 0;\n}\n', '0');
        eq(r.status, 'runtime_error', 'status');
        has(r.errorMessage, /division by zero/, 'message');
      });
      await check('C: infinite loop -> timeout', async () => {
        eq((await run(JUDGE, u, 'c', 'int main(void) {\n    while (1) {}\n}\n')).status, 'timeout', 'status');
      });
    },
    Cpp: async () => {
      const u = 'cpp-user';
      await check('C++: hello-world and cin', async () => {
        const r = await run(JUDGE, u, 'cpp', '#include <iostream>\nint main() {\n    int n;\n    std::cin >> n;\n    std::cout << "got " << n * 2 << std::endl;\n}\n', '21');
        eq([r.status, r.stdout], ['success', 'got 42\n'], 'result');
      });
      await check('C++: undeclared name -> compile_error on its own line (3)', async () => {
        const r = await run(JUDGE, u, 'cpp', '#include <iostream>\nint main() {\n    std::cout << undefined_name << std::endl;\n}\n');
        eq([r.status, r.errorLine], ['compile_error', 3], 'status + line');
        has(r.errorMessage, /'undefined_name' was not declared/, 'message');
      });
      await check('C++: uncaught exception -> runtime_error explained', async () => {
        const r = await run(JUDGE, u, 'cpp', '#include <stdexcept>\nint main() {\n    throw std::runtime_error("boom");\n}\n');
        eq(r.status, 'runtime_error', 'status');
        eq(r.errorMessage, 'Uncaught C++ exception std::runtime_error: boom', 'message');
      });
    },
    Java: async () => {
      const u = 'java-user';
      await check('Java: hello-world', async () => {
        const r = await run(JUDGE, u, 'java', 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("hi");\n    }\n}\n');
        eq([r.status, r.stdout], ['success', 'hi\n'], 'result');
      });
      await check('Java: reads stdin with Scanner', async () => {
        const r = await run(JUDGE, u, 'java', 'import java.util.Scanner;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        System.out.println(sc.nextInt() * 2);\n    }\n}\n', '21');
        eq([r.status, r.stdout], ['success', '42\n'], 'result');
      });
      await check('Java: "public class Foo" is renamed to Main so it runs, with a note; the source is stored untouched', async () => {
        const src = 'public class Foo {\n    public static void main(String[] args) {\n        System.out.println("renamed");\n    }\n}\n';
        const r = await run(JUDGE, u, 'java', src);
        eq([r.status, r.stdout], ['success', 'renamed\n'], 'result');
        has(r.compileOutput, /class Foo was renamed to Main/, 'note');
        eq(r.source, src, 'stored source is the student\'s');
      });
      await check('Java: missing semicolon -> compile_error, line 3', async () => {
        const r = await run(JUDGE, u, 'java', 'public class Main {\n    public static void main(String[] args) {\n        int x = 5\n        System.out.println(x);\n    }\n}\n');
        eq([r.status, r.errorLine, r.errorMessage], ['compile_error', 3, "error: ';' expected"], 'result');
      });
      await check('Java: ArrayIndexOutOfBoundsException -> runtime_error, line 4', async () => {
        const r = await run(JUDGE, u, 'java', 'public class Main {\n    public static void main(String[] args) {\n        int[] a = new int[3];\n        a[3] = 1;\n    }\n}\n');
        eq([r.status, r.errorLine], ['runtime_error', 4], 'status + line');
        has(r.errorMessage, /^ArrayIndexOutOfBoundsException: Index 3 out of bounds for length 3/, 'message');
      });
      await check('Java: exception thrown inside the JDK (parseInt) points at the student\'s own call (line 3)', async () => {
        const r = await run(JUDGE, u, 'java', 'public class Main {\n    public static void main(String[] args) {\n        int v = Integer.parseInt("abc");\n        System.out.println(v);\n    }\n}\n');
        eq([r.status, r.errorLine], ['runtime_error', 3], 'status + line');
        has(r.errorMessage, /^NumberFormatException/, 'message');
      });
      await check('Java: infinite loop -> timeout', async () => {
        eq((await run(JUDGE, u, 'java', 'public class Main {\n    public static void main(String[] args) {\n        while (true) {}\n    }\n}\n')).status, 'timeout', 'status');
      });
    },
    JavaScript: async () => {
      const u = 'js-user';
      await check('JavaScript: hello-world and stdin', async () => {
        const r = await run(JUDGE, u, 'javascript', 'const input = require("fs").readFileSync(0, "utf8").trim();\nconsole.log("got " + Number(input) * 2);\n', '21');
        eq([r.status, r.stdout], ['success', 'got 42\n'], 'result');
      });
      await check('JavaScript: ReferenceError inside a function -> runtime_error, line 2', async () => {
        const r = await run(JUDGE, u, 'javascript', 'function f() {\n  console.log(missing);\n}\nf();\n');
        eq([r.status, r.errorLine, r.errorMessage], ['runtime_error', 2, 'ReferenceError: missing is not defined'], 'result');
      });
      await check('JavaScript: SyntaxError -> compile_error, line 1', async () => {
        const r = await run(JUDGE, u, 'javascript', 'let x = ;\nconsole.log(x);\n');
        eq([r.status, r.errorLine], ['compile_error', 1], 'status + line');
        has(r.errorMessage, /^SyntaxError/, 'message');
      });
      await check('JavaScript: infinite loop -> timeout', async () => {
        eq((await run(JUDGE, u, 'javascript', 'while (true) {}\n')).status, 'timeout', 'status');
      });
    },
  };
  await Promise.all(Object.values(groups).map((g) => g()));

  // ---- the local runner (no Judge0, no sandbox) -----------------------------------------------------------------------
  await check('local runner: JavaScript works (hello, stdin, error line, syntax error)', async () => {
    const hello = await run(LOCAL, 'lj', 'javascript', 'const s = require("fs").readFileSync(0, "utf8").trim();\nconsole.log("hi " + s);\n', 'Asha');
    eq([hello.status, hello.stdout], ['success', 'hi Asha\n'], 'hello');
    const ref = await run(LOCAL, 'lj', 'javascript', 'function f() {\n  console.log(missing);\n}\nf();\n');
    eq([ref.status, ref.errorLine], ['runtime_error', 2], 'reference error');
    const syn = await run(LOCAL, 'lj', 'javascript', 'let x = ;\n');
    eq([syn.status, syn.errorLine], ['compile_error', 1], 'syntax error');
  });
  await check('local runner: C, C++ and Java are refused with a clear 400 (never pretend)', async () => {
    for (const language of ['c', 'cpp', 'java']) {
      const r = await call(LOCAL, 'lj', 'POST', '/api/run', { roomCode: 'r', language, source: 'x' });
      eq(r.status, 400, language + ' status');
      has(r.json.error, /not available on this server's demo runner/, language + ' message');
    }
  });
  await check('an unknown language is a 400 on both runners', async () => {
    eq((await call(JUDGE, 'lj', 'POST', '/api/run', { roomCode: 'r', language: 'cobol', source: 'x' })).status, 400, 'judge0');
    eq((await call(LOCAL, 'lj', 'POST', '/api/run', { roomCode: 'r', language: 'cobol', source: 'x' })).status, 400, 'local');
  });
} finally {
  for (const s of servers) {
    await new Promise((resolve) => {
      s.once('exit', resolve);
      s.kill();
    });
  }
}
let failed = 0;
for (const [ok, name, detail] of results) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
