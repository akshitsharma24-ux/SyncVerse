// Lane B (Simrit) checks for P-B4: the quality analyzer. No network. Starts its own server on port 4404 for the API check.
//   node --import tsx scripts/laneb-analyze.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import { analyze } from '../server/routes/analyze.ts';

const results = [];
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
const rules = (src) => analyze(src).map((d) => `${d.rule}@${d.line}`);
const cats = (src) => [...new Set(analyze(src).map((d) => d.category))].sort();

const STARTER = 'def average(nums):\n    total = 0\n    for i in range(len(nums) + 1):\n        total += nums[i]\n    return total / len(nums)\n\n\nprint(average([3, 4, 5]))\n';

// The plan's quality sample: nested loops, one-letter names, magic number, long line, eval.
const SAMPLE = `def process(data):
    x = 0
    for row in data:
        for item in row:
            x = x + item * 86400
    return x


def run(user_text):
    result = eval(user_text)
    message = "this is a deliberately long line that keeps going and going so that it passes the one hundred character limit"
    return result, message
`;

check('the plan sample triggers formatting, naming, smell, complexity and security', () => {
  eq(cats(SAMPLE), ['complexity', 'formatting', 'naming', 'security', 'smell'], 'categories');
  const r = rules(SAMPLE);
  for (const want of ['one-letter-name@2', 'nested-loops@4', 'magic-number@5', 'dangerous-call@10', 'line-too-long@11']) {
    if (!r.includes(want)) throw new Error(`missing ${want} in ${r.join(' ')}`);
  }
});
check('the room starter program (the IndexError sample) has no findings', () => eq(rules(STARTER), [], 'findings'));
check('clean, well-named code has no findings', () => {
  const src = 'MAX_ITEMS = 100\n\n\ndef total_price(prices, tax_rate=0.2):\n    total = 0\n    for price in prices:\n        total += price\n    return total * (1 + tax_rate)\n\n\nprint(total_price([10, 20, 30]))\n';
  eq(rules(src), [], 'findings');
});

// ---- false positives: strings, comments, docstrings -------------------------------------------------------------
check('eval / numbers / except inside strings and comments never trigger', () => {
  const src = 'text = "call eval(x) then * 86400 and except:"\n# eval(y) * 12345 and x = 1\nnote = \'os.system("ls") > 4242\'\n';
  eq(rules(src), [], 'findings');
});
check('docstring contents are ignored (including # and quotes inside)', () => {
  const src = 'def area(width, height):\n    """Return width * 86400 # not a comment\n    eval(x) except: y = 5\n    """\n    return width * height\n';
  eq(rules(src), [], 'findings');
});
check('triple-quoted string with both quote styles and an escaped quote', () => {
  const src = "first = '''it's \"fine\" eval(x) * 999'''\nsecond = 'it\\'s eval(z) * 777'\nprint(first, second)\n";
  eq(rules(src), [], 'findings');
});
check('model.eval() and def eval(): are not the dangerous builtin', () => {
  eq(rules('model.eval()\nmodel.exec(1)\n'), [], 'method calls');
  eq(rules('def eval(expression):\n    return expression\n'), [], 'def eval');
});

// ---- line-too-long -----------------------------------------------------------------------------------------------
check('line-too-long: 100 is fine, 101 is flagged, comments and strings count, col 101', () => {
  eq(rules('x_' + 'a'.repeat(98) + '\n'), [], '100 chars');
  const d = analyze('# ' + 'c'.repeat(99) + '\n');
  eq(d.map((x) => x.rule), ['line-too-long'], 'comment line of 101');
  eq(d[0].col, 101, 'col');
  eq(d[0].category, 'formatting', 'category');
});
check('CRLF source: \\r is not counted in the length, line numbers are right', () => {
  const src = 'a_name = 1\r\n' + 'b'.repeat(100) + '\r\nc_name = 2\r\n' + 'd'.repeat(101) + '\r\n';
  eq(rules(src), ['line-too-long@4'], 'findings');
});

// ---- one-letter-name ---------------------------------------------------------------------------------------------
check('naming: assignments, tuple targets, augmented, function name and parameters are flagged once per name', () => {
  const src = 'x = 1\nx = x + 1\na, b = 3, 4\nm += 1\ndef f(p, q=3):\n    return p\n';
  eq(rules(src), ['one-letter-name@1', 'one-letter-name@3', 'one-letter-name@3', 'one-letter-name@4', 'one-letter-name@5', 'one-letter-name@5', 'one-letter-name@5'], 'findings');
});
check('naming: loop variables, "with ... as f", underscore, attributes and keyword arguments are exempt', () => {
  const src = 'for x in range(3):\n    print(x)\nwith open("f.txt") as f:\n    pass\n_ = 1\nself.x = 1\nprint(end="")\ny = [z for z in range(3)]\nfoo(a=1)\nif x == 3:\n    pass\n';
  eq(rules(src).filter((r) => r.startsWith('one-letter')), ['one-letter-name@8'], 'only y is flagged');
});
check('naming: l, O and I get the "looks like 1 or 0" message; annotated assignment works', () => {
  const d = analyze('l = []\nx: int = 3\n');
  if (!/looks like 1 or 0/.test(d[0].message)) throw new Error(d[0].message);
  eq(d.map((x) => x.line), [1, 2], 'lines');
});
check('naming: a multi-line def header is handled', () => {
  const src = 'def compute(\n    first_value,\n    n,\n):\n    return first_value\n';
  eq(rules(src), ['one-letter-name@1'], 'the parameter n is reported on the def line');
});
check('naming: the reported column points at the name', () => {
  const d = analyze('    total = 0\n    q = 5\n');
  eq(d[0].col, 5, 'col of q');
});

// ---- magic numbers -------------------------------------------------------------------------------------------------
check('magic numbers: flagged in arithmetic and comparisons', () => {
  eq(rules('seconds = days * 86400\n'), ['magic-number@1'], 'multiplication');
  eq(rules('if age > 18:\n    pass\n'), ['magic-number@1'], 'comparison');
  eq(rules('area = radius ** 2 * 3.14159\n'), ['magic-number@1'], 'float');
  eq(rules('total -= 50\n'), ['magic-number@1'], 'augmented');
  eq(rules('rest = total - 15\n'), ['magic-number@1'], 'binary minus');
  eq(rules('rate = price * 0.2\n'), ['magic-number@1'], 'decimal');
});
check('magic numbers: not flagged for whole numbers 0-10, 0.5, data, constants, defaults, unary minus, plain assignment', () => {
  eq(rules('half = total / 2\nnext_index = i + 1\nlast = n - 1\nfizz = n % 3\nbuzz = n % 5\ndigit = n // 10\nmid = n * 0.5\n'), [], 'small numbers');
  eq(rules('fifteen = n % 15\nboundary = n > 11\n'), ['magic-number@1', 'magic-number@2'], 'just above the small range');
  eq(rules('data = [3, 4, 5]\nprint(average([30, 40]))\nvalue = 42\nlimit = -7\nshow(-7)\n'), [], 'plain data');
  eq(rules('MAX_SIZE = 100\nTAX_RATE: float = 0.2\n'), [], 'constants');
  eq(rules('def scale(v, factor=10):\n    return v\n').filter((r) => r.startsWith('magic')), [], 'default argument');
  eq(rules('word = "x" * 0\nback = return_value\n'), [], 'misc');
});
check('magic numbers: several on one line are all reported with columns', () => {
  const d = analyze('y = a * 60 * 60 * 24\n').filter((x) => x.rule === 'magic-number');
  eq(d.length, 3, 'count');
  eq(d.map((x) => x.col), [9, 14, 19], 'columns');
});

// ---- nesting and loops ------------------------------------------------------------------------------------------------
const NEST = (levels) => {
  let s = '';
  for (let i = 0; i < levels; i++) s += '    '.repeat(i) + `if a${i}:\n`;
  return s + '    '.repeat(levels) + 'pass\n';
};
check('deep-nesting: 3 levels are fine, the 4th is flagged on its own line', () => {
  eq(rules(NEST(3)), [], '3 levels');
  eq(rules(NEST(4)), ['deep-nesting@4'], '4 levels');
  eq(rules(NEST(5)), ['deep-nesting@4', 'deep-nesting@5'], '5 levels');
});
check('deep-nesting: else/elif siblings are not deeper; def and class restart the count', () => {
  const src = 'if a0:\n    if a1:\n        if a2:\n            pass\n        elif a3:\n            pass\n        else:\n            pass\n';
  eq(rules(src), [], 'elif/else at level 3');
  const inner = 'if a0:\n    if a1:\n        if a2:\n            def helper():\n                if b0:\n                    if b1:\n                        pass\n';
  eq(rules(inner), [], 'nesting restarts inside the function');
});
check('deep-nesting works with tab indentation and with a one-line "if x: y"', () => {
  eq(rules('if a:\n\tif b:\n\t\tif c:\n\t\t\tif d:\n\t\t\t\tpass\n'), ['deep-nesting@4'], 'tabs');
  eq(rules('if a: pass\nif b: pass\nif c: pass\nif d: pass\n'), [], 'one-liners');
});
check('nested-loops: flagged on the inner loop with a plain-language note; siblings and function bodies are not nested', () => {
  const d = analyze('for a in xs:\n    for b in ys:\n        pass\n    for c in zs:\n        pass\n');
  eq(d.filter((x) => x.rule === 'nested-loops').map((x) => x.line), [2, 4], 'lines');
  if (!/n × n/.test(d.find((x) => x.rule === 'nested-loops').message)) throw new Error('message');
  eq(rules('for a in xs:\n    pass\nfor b in ys:\n    pass\n').filter((r) => r.startsWith('nested')), [], 'siblings');
  eq(rules('for a in xs:\n    def helper():\n        for b in ys:\n            pass\n').filter((r) => r.startsWith('nested')), [], 'inside a def');
  const three = analyze('while p:\n    for a in xs:\n        for b in ys:\n            pass\n').filter((x) => x.rule === 'nested-loops');
  if (!/power 3/.test(three[1].message)) throw new Error(three[1].message);
});

// ---- bare except and security ---------------------------------------------------------------------------------------------
check('bare except is flagged; named exceptions are not', () => {
  eq(rules('try:\n    pass\nexcept:\n    pass\n'), ['bare-except@3'], 'bare');
  eq(rules('try:\n    pass\nexcept ValueError:\n    pass\nexcept (A, B) as err:\n    pass\n'), [], 'named');
});
check('security: eval / exec are errors, os.system and pickle are warnings, with columns', () => {
  const d = analyze('a = eval(t)\nexec(code)\nos.system("ls")\nimport pickle\nobj = pickle.loads(blob)\nsubprocess.run(cmd, shell=True)\n');
  eq(d.filter((x) => x.category === 'security').map((x) => `${x.rule}/${x.severity}@${x.line}`), ['dangerous-call/error@1', 'dangerous-call/error@2', 'dangerous-call/warning@3', 'dangerous-call/warning@5', 'dangerous-call/warning@6'], 'findings');
  eq(d.find((x) => x.rule === 'dangerous-call').col, 5, 'eval col');
});
check('security: a hard-coded secret is flagged, reading one from the environment is not, a comment is not', () => {
  eq(rules('password = "hunter2"\n'), ['hardcoded-secret@1'], 'literal');
  eq(rules('api_key = "sk-abc123"\n'), ['hardcoded-secret@1'], 'api key');
  eq(rules('password = os.environ["PASSWORD"]\n'), [], 'env var');
  eq(rules('# password = "hunter2"\n'), [], 'comment');
  eq(rules('label = "password = \\"abc\\""\n'), [], 'inside another string');
});

// ---- robustness ------------------------------------------------------------------------------------------------------------
check('empty and whitespace-only input give no findings and do not throw', () => {
  eq(rules(''), [], 'empty');
  eq(rules('\n\n   \n\t\n'), [], 'blank');
});
check('broken code (unterminated strings, unbalanced brackets, stray backslashes) never throws', () => {
  for (const src of ['x = "abc\ny = 1\n', 's = """never closed\nmore\n', 'print((((\nfoo(\n', 'a = 1 \\\n  + 2\n', '\\\\\\\n', 'def (:\n', ')))\n', 'if :\n', "'\n", '"""\n"""\n"""']) analyze(src);
});
check('findings are sorted by line and capped at 200', () => {
  const src = Array.from({ length: 600 }, (_, i) => `v${i % 7} = a * ${100 + i}`).join('\n');
  const d = analyze(src);
  eq(d.length, 200, 'cap');
  for (let i = 1; i < d.length; i++) if (d[i].line < d[i - 1].line) throw new Error('not sorted at ' + i);
});
check('a 100,000-character single line and binary junk do not hang', () => {
  const t0 = Date.now();
  analyze('a'.repeat(100000));
  analyze('(' + 'x*3'.repeat(30000));
  analyze(String.fromCharCode(...Array.from({ length: 2000 }, (_, i) => (i * 7919) % 65535)));
  const ms = Date.now() - t0;
  if (ms > 2000) throw new Error(`${ms} ms`);
  return `${ms} ms`;
});
check('5,000 lines of realistic code are analysed in under 100 ms', () => {
  const block = SAMPLE + '\n' + STARTER + '\n';
  const src = block.repeat(Math.ceil(5000 / block.split('\n').length));
  analyze(src); // warm up
  const t0 = performance.now();
  const d = analyze(src);
  const ms = performance.now() - t0;
  if (ms > 100) throw new Error(`${ms.toFixed(1)} ms for ${src.split('\n').length} lines`);
  return `${ms.toFixed(1)} ms, ${src.split('\n').length} lines, ${d.length} findings`;
});

// ---- the HTTP endpoint ---------------------------------------------------------------------------------------------------------
const PORT = 4404;
const server = spawn(process.execPath, ['--import', 'tsx', 'index.ts'], { cwd: path.resolve('server'), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/api/health`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  const post = (body) => fetch(`http://localhost:${PORT}/api/analyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  await check('POST /api/analyze returns a Diagnostic[] for the sample', async () => {
    const r = await post({ source: SAMPLE });
    eq(r.status, 200, 'status');
    const j = await r.json();
    if (!Array.isArray(j) || j.length < 5) throw new Error('not an array of findings');
    for (const d of j) if (!d.category || !d.severity || !Number.isInteger(d.line) || !d.rule || !d.message) throw new Error('bad shape ' + JSON.stringify(d));
    return `${j.length} findings`;
  });
  await check('POST /api/analyze: bad bodies -> 400, empty source -> []', async () => {
    eq((await post({})).status, 400, 'missing source');
    eq((await post({ source: 5 })).status, 400, 'wrong type');
    eq((await post({ source: 'x'.repeat(100001) })).status, 400, 'too big');
    const r = await post({ source: '' });
    eq(await r.json(), [], 'empty');
  });
} finally {
  await new Promise((resolve) => {
    server.once('exit', resolve);
    server.kill();
  });
}

let failed = 0;
for (const [ok, name, detail] of results) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
