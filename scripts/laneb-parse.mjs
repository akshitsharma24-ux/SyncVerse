// Lane B (Simrit) unit checks for the Python error parser (P-B3). Needs no server and no network.
//   node --import tsx scripts/laneb-parse.mjs
import { parsePythonError, errorKind, mapJudge0Status } from '../server/routes/run.ts';

const results = [];
const check = (name, fn) => {
  try {
    fn();
    results.push([true, name, '']);
  } catch (e) {
    results.push([false, name, String(e.message).split('\n')[0]]);
  }
};
const eq = (a, b, what) => {
  if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};

const STARTER = 'def average(nums):\n    total = 0\n    for i in range(len(nums) + 1):\n        total += nums[i]\n    return total / len(nums)\n\n\nprint(average([3, 4, 5]))\n';

check('IndexError, Python 3.12 (carets ignored) -> line 4', () => {
  const err = `Traceback (most recent call last):
  File "/box/script.py", line 8, in <module>
    print(average([3, 4, 5]))
          ^^^^^^^^^^^^^^^^^^
  File "/box/script.py", line 4, in average
    total += nums[i]
             ~~~~^^^
IndexError: list index out of range
`;
  const r = parsePythonError(err, STARTER);
  eq(r.line, 4, 'line');
  eq(r.message, 'IndexError: list index out of range', 'message');
  eq(errorKind(err), 'IndexError', 'kind');
});
check('IndexError, Python 3.8 (no carets) -> line 4', () => {
  const err = `Traceback (most recent call last):
  File "script.py", line 8, in <module>
    print(average([3, 4, 5]))
  File "script.py", line 4, in average
    total += nums[i]
IndexError: list index out of range
`;
  eq(parsePythonError(err, STARTER).line, 4, 'line');
});
check('SyntaxError missing colon (3.12) -> line 1', () => {
  const err = `  File "/box/script.py", line 1
    def greet(name)
                   ^
SyntaxError: expected ':'
`;
  const r = parsePythonError(err, 'def greet(name)\n    print(name)\n');
  eq(r.line, 1, 'line');
  eq(r.message, "SyntaxError: expected ':'", 'message');
});
check('SyntaxError (3.8 "invalid syntax") -> right line', () => {
  const err = `  File "script.py", line 3
    if x == 1
            ^
SyntaxError: invalid syntax
`;
  eq(parsePythonError(err, 'x = 1\n\nif x == 1\n    print(x)\n').line, 3, 'line');
});
check('IndentationError -> line and message', () => {
  const err = `  File "/box/script.py", line 2
    print(2)
IndentationError: unexpected indent
`;
  const r = parsePythonError(err, 'print(1)\n    print(2)\n');
  eq(r.line, 2, 'line');
  eq(r.message, 'IndentationError: unexpected indent', 'message');
  eq(errorKind(err), 'IndentationError', 'kind');
});
check('NameError keeps the "Did you mean" hint, line 2', () => {
  const err = `Traceback (most recent call last):
  File "/box/script.py", line 2, in <module>
    print(totl)
          ^^^^
NameError: name 'totl' is not defined. Did you mean: 'total'?
`;
  const r = parsePythonError(err, 'total = 0\nprint(totl)\n');
  eq(r.line, 2, 'line');
  eq(r.message, "NameError: name 'totl' is not defined. Did you mean: 'total'?", 'message');
});
check('RecursionError with repeated frames -> recursive call line 2', () => {
  const err = `Traceback (most recent call last):
  File "/box/script.py", line 3, in <module>
    print(f(0))
          ^^^^
  File "/box/script.py", line 2, in f
    return f(n + 1)
           ^^^^^^^^
  File "/box/script.py", line 2, in f
    return f(n + 1)
           ^^^^^^^^
  [Previous line repeated 996 more times]
RecursionError: maximum recursion depth exceeded
`;
  const r = parsePythonError(err, 'def f(n):\n    return f(n + 1)\nprint(f(0))\n');
  eq(r.line, 2, 'line');
  eq(errorKind(err), 'RecursionError', 'kind');
});
check('chained exceptions: uses the FINAL traceback (line 6)', () => {
  const err = `Traceback (most recent call last):
  File "/box/script.py", line 2, in <module>
    int("x")
ValueError: invalid literal for int() with base 10: 'x'

During handling of the above exception, another exception occurred:

Traceback (most recent call last):
  File "/box/script.py", line 6, in <module>
    raise RuntimeError("bad")
RuntimeError: bad
`;
  const src = 'try:\n    int("x")\nexcept ValueError:\n    pass\n\nraise RuntimeError("bad")\n';
  const r = parsePythonError(err, src);
  eq(r.line, 6, 'line');
  eq(r.message, 'RuntimeError: bad', 'message');
});
check('error raised inside the stdlib -> line of the LAST user frame', () => {
  const err = `Traceback (most recent call last):
  File "/box/script.py", line 3, in <module>
    json.loads("{")
  File "/usr/local/lib/python3.12/json/__init__.py", line 346, in loads
    return _default_decoder.decode(s)
  File "/usr/local/lib/python3.12/json/decoder.py", line 356, in raw_decode
    raise JSONDecodeError("Expecting value", s, err.value) from None
json.decoder.JSONDecodeError: Expecting property name enclosed in double quotes: line 1 column 2 (char 1)
`;
  const r = parsePythonError(err, 'import json\n\njson.loads("{")\n');
  eq(r.line, 3, 'line');
  eq(errorKind(err), 'JSONDecodeError', 'kind');
});
check('Windows temp path of the local runner is recognised', () => {
  const err = 'Traceback (most recent call last):\n  File "C:\\Users\\x\\AppData\\Local\\Temp\\sv-run-ab12\\script.py", line 5, in <module>\nZeroDivisionError: division by zero\n';
  eq(parsePythonError(err, '1\n2\n3\n4\nprint(1/0)\n').line, 5, 'line');
});
check('custom exception name and no traceback -> message only, no line', () => {
  const err = 'mypkg.CustomError: boom\n';
  const r = parsePythonError(err, 'print(1)\n');
  eq(r.line, undefined, 'line');
  eq(r.message, 'mypkg.CustomError: boom', 'message');
  eq(errorKind(err), 'CustomError', 'kind');
});
check('line beyond the program is dropped (never a wrong marker)', () => {
  eq(parsePythonError('  File "/box/script.py", line 99\nSyntaxError: x\n', 'print(1)\n').line, undefined, 'line');
});
check('frames from other files (<string>, exec) are ignored', () => {
  const err = `Traceback (most recent call last):
  File "/box/script.py", line 2, in <module>
    exec("1/0")
  File "<string>", line 1, in <module>
ZeroDivisionError: division by zero
`;
  eq(parsePythonError(err, 'x = 1\nexec("1/0")\n').line, 2, 'line');
});
check('empty stderr / truncation notice do not crash and give nothing', () => {
  eq(JSON.stringify(parsePythonError('', 'x')), '{}', 'empty');
  const r = parsePythonError('[earlier output truncated]\n  File "/box/script.py", line 2, in f\nRecursionError: maximum recursion depth exceeded\n', 'a\nb\n');
  eq(r.line, 2, 'line');
  eq(r.message, 'RecursionError: maximum recursion depth exceeded', 'message');
});
check('CRLF source is counted correctly', () => {
  eq(parsePythonError('  File "/box/script.py", line 3\nSyntaxError: x\n', 'a\r\nb\r\nc\r\n').line, 3, 'line');
});
check('Judge0 status mapping', () => {
  eq(mapJudge0Status(3, ''), 'success', '3');
  eq(mapJudge0Status(5, ''), 'timeout', '5');
  eq(mapJudge0Status(6, ''), 'compile_error', '6');
  eq(mapJudge0Status(11, 'SyntaxError: x'), 'compile_error', '11 syntax');
  eq(mapJudge0Status(11, 'IndentationError: x'), 'compile_error', '11 indentation');
  eq(mapJudge0Status(11, 'IndexError: x'), 'runtime_error', '11 runtime');
  eq(mapJudge0Status(11, 'MemoryError'), 'memory_limit', '11 MemoryError');
  eq(mapJudge0Status(9, '', 131000), 'memory_limit', 'at the limit');
  eq(mapJudge0Status(11, '', 52000), 'runtime_error', 'normal memory');
  eq(mapJudge0Status(13, ''), 'service_error', '13');
  eq(mapJudge0Status(14, ''), 'service_error', '14');
});

let failed = 0;
for (const [ok, name, detail] of results) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
