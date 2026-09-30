// Lane B (Simrit) unit checks for the Python error parser (P-B3). Needs no server and no network.
//   node --import tsx scripts/laneb-parse.mjs
import {
  parsePythonError,
  errorKind,
  mapJudge0Status,
  parseNodeError,
  parseGccError,
  parseJavacError,
  parseJavaRuntimeError,
  describeNativeCrash,
  prepareJava,
  pickLanguageIds,
} from '../server/routes/run.ts';

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
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
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

// ---- other languages (P-B5). The outputs below were captured from the real Judge0 instance. -------------------------------
const NODE_TAIL = `    at Module._compile (node:internal/modules/cjs/loader:1546:14)
    at Module.load (node:internal/modules/cjs/loader:1317:32)

Node.js v22.8.0
`;
check('Node: ReferenceError inside a function -> line 2 and message', () => {
  const err = `/box/script.js:2\n  console.log(missing);\n              ^\n\nReferenceError: missing is not defined\n    at f (/box/script.js:2:15)\n    at Object.<anonymous> (/box/script.js:4:1)\n${NODE_TAIL}`;
  const r = parseNodeError(err, 'function f() {\n  console.log(missing);\n}\nf();\n');
  eq(r.line, 2, 'line');
  eq(r.message, 'ReferenceError: missing is not defined', 'message');
});
check('Node: SyntaxError -> line 1; thrown Error -> line 2', () => {
  const syn = `/box/script.js:1\nlet x = ;\n        ^\n\nSyntaxError: Unexpected token ';'\n    at wrapSafe (node:internal/modules/cjs/loader:1469:18)\n${NODE_TAIL}`;
  const r = parseNodeError(syn, 'let x = ;\nconsole.log(x);\n');
  eq([r.line, r.message], [1, "SyntaxError: Unexpected token ';'"], 'syntax');
  const thrown = `/box/script.js:2\n  throw new Error("bad");\n  ^\n\nError: bad\n    at g (/box/script.js:2:9)\n${NODE_TAIL}`;
  const t = parseNodeError(thrown, 'function g() {\n  throw new Error("bad");\n}\ng();\n');
  eq([t.line, t.message], [2, 'Error: bad'], 'throw');
  eq(errorKind(thrown), 'Error', 'kind');
});
check('Node: the "Node.js v22" footer and stack lines are never taken as the message', () => {
  eq(parseNodeError(`/box/script.js:1\nx\n^\n\nTypeError: x is not a function\n${NODE_TAIL}`, 'x()\n').message, 'TypeError: x is not a function', 'message');
  eq(parseNodeError('', 'x').line, undefined, 'empty');
});

const C_SRC = '#include <stdio.h>\n#include <math.h>\nint main(void) {\n    int x = 5\n    printf("%d\\n", y);\n    return 0;\n}\n';
check('gcc: missing semicolon is reported on the NEXT line by gcc; we point at the line that lacks it (4)', () => {
  const out = `main.c: In function 'main':\nmain.c:5:5: error: expected ',' or ';' before 'printf'\n    5 |     printf("%d\\n", y);\n      |     ^~~~~~\nmain.c:4:9: warning: unused variable 'x' [-Wunused-variable]\n`;
  const r = parseGccError(out, C_SRC);
  eq(r.line, 4, 'line');
  eq(r.message, "error: expected ',' or ';' before 'printf'", 'message');
});
check('gcc: an error in the middle of a line is NOT moved; blank lines are skipped when moving back', () => {
  eq(parseGccError("main.c:4:14: error: expected ';' before '}' token\n", C_SRC).line, 4, 'mid-line');
  const src = 'int main(void) {\n    int a = 1\n\n    int b = 2;\n}\n';
  eq(parseGccError("main.c:4:5: error: expected ',' or ';' before 'int'\n", src).line, 2, 'skips the blank line');
});
check('g++: undeclared name -> its own line, message keeps the name', () => {
  const out = "main.cpp: In function 'int main()':\nmain.cpp:3:18: error: 'undefined_name' was not declared in this scope\n    3 |     std::cout << undefined_name << std::endl;\n";
  const r = parseGccError(out, '#include <iostream>\nint main() {\n    std::cout << undefined_name << std::endl;\n}\n');
  eq([r.line, r.message], [3, "error: 'undefined_name' was not declared in this scope"], 'result');
});
check('gcc: the FIRST error wins (later ones are usually consequences); warnings alone give nothing', () => {
  const out = "main.c:3:1: warning: something\nmain.c:6:2: error: first\nmain.c:9:1: error: second\n";
  eq(parseGccError(out, 'a\nb\nc\nd\ne\nf\ng\nh\ni\n').line, 6, 'first error');
  eq(parseGccError("main.c:3:9: warning: unused variable 'x'\n", 'a\nb\nc\n').line, undefined, 'warning only');
});
check('linker error (undefined reference) -> message, no line', () => {
  const out = "/usr/bin/ld: /tmp/cc3Ovyl1.o: in function `main':\nmain.c:(.text+0x2d): undefined reference to `sqrt'\ncollect2: error: ld returned 1 exit status\n";
  const r = parseGccError(out, 'int main(void) { return 0; }\n');
  eq(r.line, undefined, 'line');
  if (!/undefined reference to 'sqrt'/.test(r.message)) throw new Error(r.message);
});
check('javac: ";" expected -> line 3; wrong public class name is explained', () => {
  const r = parseJavacError("Main.java:3: error: ';' expected\n        int x = 5\n                 ^\n1 error\n", 'a\nb\nc\nd\ne\n');
  eq([r.line, r.message], [3, "error: ';' expected"], 'result');
  eq(parseJavacError('Main.java:1: error: class Foo is public, should be declared in a file named Foo.java\n', 'x\n').line, 1, 'class name');
});
check('Java exception: ArrayIndexOutOfBounds -> line 4, short name + detail', () => {
  const err = 'Exception in thread "main" java.lang.ArrayIndexOutOfBoundsException: Index 3 out of bounds for length 3\n\tat Main.main(Main.java:4)\n';
  const r = parseJavaRuntimeError(err, 'a\nb\nc\nd\ne\n');
  eq([r.line, r.message], [4, 'ArrayIndexOutOfBoundsException: Index 3 out of bounds for length 3'], 'result');
});
check('Java exception thrown inside the JDK: the line is the first frame in the student\'s Main.java', () => {
  const err = 'Exception in thread "main" java.lang.NumberFormatException: For input string: "abc"\n\tat java.base/java.lang.NumberFormatException.forInputString(NumberFormatException.java:67)\n\tat java.base/java.lang.Integer.parseInt(Integer.java:668)\n\tat Main.main(Main.java:3)\n';
  const r = parseJavaRuntimeError(err, 'a\nb\nc\nd\n');
  eq([r.line, r.message], [3, 'NumberFormatException: For input string: "abc"'], 'result');
});
check('Java: a custom exception without a message, and a stack overflow, both work', () => {
  eq(parseJavaRuntimeError('Exception in thread "main" MyError\n\tat Main.main(Main.java:2)\n', 'a\nb\nc\n').message, 'MyError', 'no message');
  eq(parseJavaRuntimeError('Exception in thread "main" java.lang.StackOverflowError\n\tat Main.f(Main.java:3)\n\tat Main.f(Main.java:3)\n', 'a\nb\nc\nd\n').line, 3, 'overflow line');
});
check('C/C++ crashes are explained in plain words', () => {
  eq(describeNativeCrash('Segmentation fault (core dumped) ./a.out\n').kind, 'SegmentationFault', 'segv');
  eq(describeNativeCrash('Floating point exception(core dumped) ./a.out\n').kind, 'ArithmeticError', 'fpe');
  eq(describeNativeCrash('Aborted                 (core dumped) ./a.out\n').kind, 'Abort', 'abort');
  const t = describeNativeCrash("terminate called after throwing an instance of 'std::runtime_error'\n  what():  boom\nAborted (core dumped)\n");
  eq([t.kind, t.message], ['UncaughtException', 'Uncaught C++ exception std::runtime_error: boom'], 'terminate');
  eq(describeNativeCrash('just some output\n'), undefined, 'nothing');
});
check('Java: class Foo is renamed to Main (identifiers only, line numbers unchanged)', () => {
  const src = 'public class Foo {\n    Foo() { System.out.println("Foo is a string"); } // Foo in a comment\n    public static void main(String[] args) {\n        Foo f = new Foo();\n    }\n}\n';
  const r = prepareJava(src);
  eq(r.source, 'public class Main {\n    Main() { System.out.println("Foo is a string"); } // Foo in a comment\n    public static void main(String[] args) {\n        Main f = new Main();\n    }\n}\n', 'source');
  if (!/class Foo was renamed to Main/.test(r.note)) throw new Error(r.note);
  eq(r.source.split('\n').length, src.split('\n').length, 'line count');
});
check('Java: Main stays as is; no main() -> untouched; nested classes are not renamed; non-public top-level class is handled', () => {
  const ok = 'public class Main {\n    public static void main(String[] a) {}\n}\n';
  eq(prepareJava(ok), { source: ok }, 'already Main');
  const none = 'public class Foo {\n}\n';
  eq(prepareJava(none), { source: none }, 'no main');
  const nested = 'public class Foo {\n    static class Node {}\n    public static void main(String[] a) { new Node(); }\n}\n';
  eq(prepareJava(nested).source, 'public class Main {\n    static class Node {}\n    public static void main(String[] a) { new Node(); }\n}\n', 'nested class kept');
  const plain = 'class Helper {}\nclass Demo {\n    public static void main(String[] a) { new Helper(); }\n}\n';
  eq(prepareJava(plain).source, 'class Helper {}\nclass Main {\n    public static void main(String[] a) { new Helper(); }\n}\n', 'non-public class with main');
});
check('language ids are picked by name, newest version (Python prefers 3.12) and fall back to known ids', () => {
  const list = [
    { id: 71, name: 'Python (3.8.1)' }, { id: 100, name: 'Python (3.12.5)' }, { id: 113, name: 'Python (3.14.0)' },
    { id: 50, name: 'C (GCC 9.2.0)' }, { id: 103, name: 'C (GCC 14.1.0)' }, { id: 104, name: 'C (Clang 18.1.8)' },
    { id: 54, name: 'C++ (GCC 9.2.0)' }, { id: 105, name: 'C++ (GCC 14.1.0)' },
    { id: 62, name: 'Java (OpenJDK 13.0.1)' }, { id: 91, name: 'Java (JDK 17.0.6)' }, { id: 96, name: 'JavaFX (JDK 17.0.6, OpenJFX 22.0.2)' },
    { id: 63, name: 'JavaScript (Node.js 12.14.0)' }, { id: 102, name: 'JavaScript (Node.js 22.08.0)' }, { id: 97, name: 'JavaScript (Node.js 20.17.0)' },
  ];
  eq(pickLanguageIds(list), { python: 100, c: 103, cpp: 105, java: 91, javascript: 102 }, 'ids');
  eq(pickLanguageIds([]), { python: 71, c: 50, cpp: 54, java: 62, javascript: 63 }, 'fallback');
});

let failed = 0;
for (const [ok, name, detail] of results) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  - ' + detail : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
