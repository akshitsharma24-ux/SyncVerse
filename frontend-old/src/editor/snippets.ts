/**
 * Code completion and snippets for the shared editor, in the style of VS Code. Owner: Lane A.
 *
 * Type a short prefix and press Tab: in Java `sout` becomes System.out.println(|); `fori`, `foreach`, `main`, `sc` (Scanner)
 * and friends work the same way, and so do the Python, JavaScript / TypeScript, C and C++ equivalents. Tab again jumps to the
 * next blank in the snippet. The list also offers keywords, common built-ins, members after a dot (System.out. , Math. ,
 * math. , console. , std:: ) and the words already in the open files. In Java, picking a class from java.util adds its import
 * line for you (forgetting it is the most common first compile error).
 *
 * Monaco here is the lean core editor, which has syntax colouring but no language services, so everything below is ours.
 * The Yjs binding sees a completed snippet as ordinary typing, so it reaches everyone else like any other edit.
 */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';

interface Snip {
  prefixes: string[];
  body: string;
  detail: string;
}
interface Member {
  name: string;
  /** snippet text; defaults to the name */
  body?: string;
  detail?: string;
  kind?: 'method' | 'field' | 'class';
}
interface Fn {
  name: string;
  body?: string;
  detail?: string;
}
interface Lang {
  snippets: Snip[];
  keywords: string[];
  functions: Fn[];
  /** class / type names offered as plain words (with an import for Java, see JAVA_UTIL) */
  types?: string[];
  /** text before the dot (or ::) -> what to offer after it */
  members: Record<string, Member[]>;
}

const S = (prefixes: string | string[], body: string, detail: string): Snip => ({ prefixes: Array.isArray(prefixes) ? prefixes : [prefixes], body, detail });
const M = (name: string, detail?: string, body?: string, kind: Member['kind'] = 'method'): Member => ({ name, detail, body, kind });
const F = (name: string, body?: string, detail?: string): Fn => ({ name, body, detail });
const words = (s: string) => s.split(/\s+/).filter(Boolean);

// ---------------------------------------------------------------------------------------------------------------- Python
const PYTHON: Lang = {
  snippets: [
    S('def', 'def ${1:name}(${2}):\n\t${0:pass}', 'Function'),
    S('class', 'class ${1:Name}:\n\tdef __init__(self${2}):\n\t\t${0:pass}', 'Class with a constructor'),
    S('for', 'for ${1:item} in ${2:items}:\n\t${0:pass}', 'Loop over a collection'),
    S('foreach', 'for ${1:item} in ${2:items}:\n\t${0:pass}', 'Loop over each item'),
    S('fori', 'for ${1:i} in range(${2:n}):\n\t${0:pass}', 'Loop with a counter'),
    S('while', 'while ${1:condition}:\n\t${0:pass}', 'while loop'),
    S('if', 'if ${1:condition}:\n\t${0:pass}', 'if'),
    S('ifelse', 'if ${1:condition}:\n\t${2:pass}\nelse:\n\t${0:pass}', 'if / else'),
    S('elif', 'elif ${1:condition}:\n\t${0:pass}', 'elif'),
    S('else', 'else:\n\t${0:pass}', 'else'),
    S(['try', 'tryexcept'], 'try:\n\t${1:pass}\nexcept ${2:Exception} as ${3:e}:\n\t${0:print(${3:e})}', 'try / except'),
    S('with', 'with open(${1:"file.txt"}) as ${2:f}:\n\t${0:pass}', 'Open a file safely'),
    S(['main', 'ifmain'], 'if __name__ == "__main__":\n\t${0:main()}', 'Run only when started directly'),
    S('lc', '[${1:x} for ${2:x} in ${3:items}]', 'List comprehension'),
    S('lambda', 'lambda ${1:x}: ${0:x}', 'Small anonymous function'),
    S('fprint', 'print(f"${1:text} {${2:value}}")', 'print with an f-string'),
  ],
  keywords: words('and as assert break continue del elif else except finally from global import in is nonlocal not or pass raise return yield None True False'),
  functions: [
    F('print', 'print(${1})', 'Show text on the console'),
    F('input', 'input(${1:"prompt"})', 'Read a line typed by the user'),
    F('len', 'len(${1})'),
    F('range', 'range(${1})'),
    F('int', 'int(${1})'),
    F('float', 'float(${1})'),
    F('str', 'str(${1})'),
    F('bool', 'bool(${1})'),
    F('list', 'list(${1})'),
    F('dict', 'dict(${1})'),
    F('set', 'set(${1})'),
    F('tuple', 'tuple(${1})'),
    F('sum', 'sum(${1})'),
    F('min', 'min(${1})'),
    F('max', 'max(${1})'),
    F('abs', 'abs(${1})'),
    F('round', 'round(${1})'),
    F('sorted', 'sorted(${1})'),
    F('reversed', 'reversed(${1})'),
    F('enumerate', 'enumerate(${1})'),
    F('zip', 'zip(${1})'),
    F('map', 'map(${1})'),
    F('filter', 'filter(${1})'),
    F('open', 'open(${1})'),
    F('type', 'type(${1})'),
    F('isinstance', 'isinstance(${1}, ${2})'),
    F('any', 'any(${1})'),
    F('all', 'all(${1})'),
  ],
  members: {
    math: ['sqrt', 'pow', 'floor', 'ceil', 'sin', 'cos', 'tan', 'log', 'factorial', 'gcd', 'fabs'].map((n) => M(n, 'math')).concat([M('pi', 'math', undefined, 'field'), M('e', 'math', undefined, 'field')]),
    random: ['random', 'randint', 'choice', 'shuffle', 'uniform', 'sample'].map((n) => M(n, 'random')),
    sys: [M('argv', 'sys', undefined, 'field'), M('exit', 'sys'), M('stdin', 'sys', undefined, 'field'), M('stdout', 'sys', undefined, 'field')],
  },
};

// ------------------------------------------------------------------------------------------------------------- JavaScript
const JS_KEYWORDS = 'break case catch const continue debugger default delete export extends finally function import in instanceof let new of return super this throw typeof var void with yield async await null undefined true false';
const JAVASCRIPT: Lang = {
  snippets: [
    S(['log', 'cl'], 'console.log(${1});', 'Print to the console'),
    S('for', 'for (let ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${0}\n}', 'for loop'),
    S('fori', 'for (let ${1:i} = 0; ${1:i} < ${2:array}.length; ${1:i}++) {\n\t${0}\n}', 'Loop over an array by index'),
    S('forof', 'for (const ${1:item} of ${2:items}) {\n\t${0}\n}', 'Loop over the values'),
    S('forin', 'for (const ${1:key} in ${2:object}) {\n\t${0}\n}', 'Loop over the keys'),
    S('foreach', '${1:array}.forEach((${2:item}) => {\n\t${0}\n});', 'array.forEach'),
    S('while', 'while (${1:condition}) {\n\t${0}\n}', 'while loop'),
    S('if', 'if (${1:condition}) {\n\t${0}\n}', 'if'),
    S('ifelse', 'if (${1:condition}) {\n\t${2}\n} else {\n\t${0}\n}', 'if / else'),
    S('switch', 'switch (${1:value}) {\n\tcase ${2:x}:\n\t\t${0}\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}', 'switch'),
    S(['func', 'fn'], 'function ${1:name}(${2}) {\n\t${0}\n}', 'Function'),
    S('arrow', 'const ${1:name} = (${2}) => {\n\t${0}\n};', 'Arrow function'),
    S('class', 'class ${1:Name} {\n\tconstructor(${2}) {\n\t\t${0}\n\t}\n}', 'Class with a constructor'),
    S(['try', 'trycatch'], 'try {\n\t${1}\n} catch (${2:error}) {\n\t${0:console.error(${2:error});}\n}', 'try / catch'),
    S('promise', 'new Promise((resolve, reject) => {\n\t${0}\n})', 'Promise'),
    S('settimeout', 'setTimeout(() => {\n\t${0}\n}, ${1:1000});', 'Run later'),
  ],
  keywords: words(JS_KEYWORDS),
  functions: [F('console'), F('Math'), F('JSON'), F('Object'), F('Array'), F('String'), F('Number'), F('Promise'), F('Map'), F('Set'), F('Date'), F('parseInt', 'parseInt(${1})'), F('parseFloat', 'parseFloat(${1})'), F('require', "require('${1}')"), F('process')],
  members: {
    console: ['log', 'error', 'warn', 'info', 'table'].map((n) => M(n, 'console', `${n}(\${1})`)),
    Math: ['abs', 'floor', 'ceil', 'round', 'random', 'max', 'min', 'sqrt', 'pow'].map((n) => M(n, 'Math', n === 'random' ? 'random()' : `${n}(\${1})`)).concat([M('PI', 'Math', undefined, 'field')]),
    JSON: [M('stringify', 'JSON', 'stringify(${1})'), M('parse', 'JSON', 'parse(${1})')],
    Object: ['keys', 'values', 'entries', 'assign'].map((n) => M(n, 'Object', `${n}(\${1})`)),
    Array: [M('isArray', 'Array', 'isArray(${1})'), M('from', 'Array', 'from(${1})'), M('of', 'Array', 'of(${1})')],
    Number: [M('isInteger', 'Number', 'isInteger(${1})'), M('parseFloat', 'Number', 'parseFloat(${1})'), M('parseInt', 'Number', 'parseInt(${1})')],
  },
};
const TYPESCRIPT: Lang = {
  ...JAVASCRIPT,
  snippets: [...JAVASCRIPT.snippets, S('interface', 'interface ${1:Name} {\n\t${0}\n}', 'Interface'), S('type', 'type ${1:Name} = ${0};', 'Type alias')],
  keywords: words(`${JS_KEYWORDS} interface type enum implements private public protected readonly number string boolean any unknown never`),
};

// ---------------------------------------------------------------------------------------------------------------------- Java
/** Classes that need `import java.util.X;` (everything else in the list below is in java.lang). */
const JAVA_UTIL = new Set(words('Scanner ArrayList List HashMap Map HashSet Set Arrays Collections Random Optional LinkedList Deque ArrayDeque Queue Stack Iterator Objects'));
const JAVA: Lang = {
  snippets: [
    S(['sout', 'sysout'], 'System.out.println(${1});', 'Print a line'),
    S('soutv', 'System.out.println("${1:value} = " + ${1:value});', 'Print a variable with its name'),
    S(['souf', 'printf'], 'System.out.printf("${1:%d}%n", ${2});', 'Print with a format'),
    S('serr', 'System.err.println(${1});', 'Print a line to the error stream'),
    S(['main', 'psvm'], 'public static void main(String[] args) {\n\t${0}\n}', 'main method'),
    S('mainclass', 'public class ${1:Main} {\n\tpublic static void main(String[] args) {\n\t\t${0}\n\t}\n}', 'Class with a main method'),
    S('class', 'public class ${1:Name} {\n\t${0}\n}', 'Class'),
    S('interface', 'public interface ${1:Name} {\n\t${0}\n}', 'Interface'),
    S('method', 'public ${1:void} ${2:name}(${3}) {\n\t${0}\n}', 'Method'),
    S('fori', 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${0}\n}', 'Loop with a counter'),
    S('for', 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${0}\n}', 'for loop'),
    S('foreach', 'for (${1:String} ${2:item} : ${3:items}) {\n\t${0}\n}', 'Loop over each item'),
    S('while', 'while (${1:condition}) {\n\t${0}\n}', 'while loop'),
    S('dowhile', 'do {\n\t${0}\n} while (${1:condition});', 'do / while loop'),
    S('if', 'if (${1:condition}) {\n\t${0}\n}', 'if'),
    S('ifelse', 'if (${1:condition}) {\n\t${2}\n} else {\n\t${0}\n}', 'if / else'),
    S('switch', 'switch (${1:value}) {\n\tcase ${2:x}:\n\t\t${0}\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}', 'switch'),
    S(['try', 'trycatch'], 'try {\n\t${1}\n} catch (${2:Exception} ${3:e}) {\n\t${0:${3:e}.printStackTrace();}\n}', 'try / catch'),
    S('sc', 'Scanner ${1:sc} = new Scanner(System.in);', 'Read input from the keyboard'),
    S('newlist', 'List<${1:String}> ${2:list} = new ArrayList<>();', 'New list'),
    S('newmap', 'Map<${1:String}, ${2:Integer}> ${3:map} = new HashMap<>();', 'New map'),
    S('array', '${1:int}[] ${2:numbers} = new ${1:int}[${3:10}];', 'New array'),
  ],
  keywords: words(
    'abstract boolean break byte case catch char continue default enum extends final finally float implements import instanceof int long new null package private protected public return short static super this throw throws void volatile true false var record',
  ),
  functions: [],
  types: words(
    'String Scanner ArrayList List HashMap Map HashSet Set Arrays Collections Math Integer Double Long Boolean Character StringBuilder Random Object System Optional LinkedList Deque ArrayDeque Queue Stack Iterator Objects',
  ),
  members: {
    'System.out': [M('println', 'Print a line', 'println(${1})'), M('print', 'Print without a new line', 'print(${1})'), M('printf', 'Print with a format', 'printf("${1:%d}%n", ${2})'), M('flush', undefined, 'flush()')],
    'System.err': [M('println', 'Print a line', 'println(${1})'), M('print', undefined, 'print(${1})')],
    System: [M('out', 'Standard output', undefined, 'field'), M('err', 'Error output', undefined, 'field'), M('in', 'Keyboard input', undefined, 'field'), M('currentTimeMillis', undefined, 'currentTimeMillis()'), M('nanoTime', undefined, 'nanoTime()'), M('exit', undefined, 'exit(${1:0})'), M('arraycopy', undefined, 'arraycopy(${1:src}, ${2:0}, ${3:dest}, ${4:0}, ${5:length})')],
    Math: ['abs', 'max', 'min', 'pow', 'floorMod'].map((n) => M(n, 'Math', `${n}(\${1}, \${2})`)).concat(['sqrt', 'cbrt', 'floor', 'ceil', 'round'].map((n) => M(n, 'Math', `${n}(\${1})`)), [M('random', 'Math', 'random()'), M('PI', 'Math', undefined, 'field'), M('E', 'Math', undefined, 'field')]),
    Integer: [M('parseInt', 'Text to int', 'parseInt(${1})'), M('valueOf', undefined, 'valueOf(${1})'), M('toString', undefined, 'toString(${1})'), M('compare', undefined, 'compare(${1}, ${2})'), M('MAX_VALUE', undefined, undefined, 'field'), M('MIN_VALUE', undefined, undefined, 'field')],
    Double: [M('parseDouble', 'Text to double', 'parseDouble(${1})'), M('valueOf', undefined, 'valueOf(${1})'), M('compare', undefined, 'compare(${1}, ${2})'), M('MAX_VALUE', undefined, undefined, 'field')],
    String: [M('valueOf', undefined, 'valueOf(${1})'), M('format', undefined, 'format("${1}", ${2})'), M('join', undefined, 'join("${1:, }", ${2})')],
    Arrays: ['toString', 'sort', 'asList', 'stream'].map((n) => M(n, 'Arrays', `${n}(\${1})`)).concat([M('fill', 'Arrays', 'fill(${1}, ${2})'), M('copyOf', 'Arrays', 'copyOf(${1}, ${2})'), M('equals', 'Arrays', 'equals(${1}, ${2})')]),
    Collections: ['sort', 'reverse', 'max', 'min', 'shuffle'].map((n) => M(n, 'Collections', `${n}(\${1})`)),
    Character: ['isDigit', 'isLetter', 'isUpperCase', 'isLowerCase', 'toUpperCase', 'toLowerCase'].map((n) => M(n, 'Character', `${n}(\${1})`)),
    List: [M('of', undefined, 'of(${1})')],
  },
};

// ------------------------------------------------------------------------------------------------------------------------ C
const C_FUNCTIONS: Fn[] = [
  F('printf', 'printf("${1}\\n"${2});', 'Print formatted text'),
  F('scanf', 'scanf("${1:%d}", &${2:x});', 'Read formatted input'),
  F('puts', 'puts(${1});'),
  F('putchar', 'putchar(${1});'),
  F('getchar', 'getchar()'),
  F('fgets', 'fgets(${1:buffer}, ${2:size}, ${3:stdin})'),
  F('malloc', 'malloc(${1:size})'),
  F('calloc', 'calloc(${1:count}, ${2:size})'),
  F('free', 'free(${1})'),
  F('strlen', 'strlen(${1})'),
  F('strcpy', 'strcpy(${1:dest}, ${2:src})'),
  F('strcmp', 'strcmp(${1:a}, ${2:b})'),
  F('strcat', 'strcat(${1:dest}, ${2:src})'),
  F('memset', 'memset(${1:ptr}, ${2:0}, ${3:size})'),
  F('atoi', 'atoi(${1})'),
  F('abs', 'abs(${1})'),
  F('sqrt', 'sqrt(${1})'),
  F('pow', 'pow(${1}, ${2})'),
  F('rand', 'rand()'),
  F('exit', 'exit(${1:0});'),
];
const C_SNIPPETS: Snip[] = [
  S('main', 'int main(void) {\n\t${0}\n\treturn 0;\n}', 'main function'),
  S('mainargs', 'int main(int argc, char *argv[]) {\n\t${0}\n\treturn 0;\n}', 'main function with arguments'),
  S('inc', '#include <${1:stdio}.h>', 'Include a header'),
  S('fori', 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${0}\n}', 'Loop with a counter'),
  S('for', 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${0}\n}', 'for loop'),
  S('while', 'while (${1:condition}) {\n\t${0}\n}', 'while loop'),
  S('dowhile', 'do {\n\t${0}\n} while (${1:condition});', 'do / while loop'),
  S('if', 'if (${1:condition}) {\n\t${0}\n}', 'if'),
  S('ifelse', 'if (${1:condition}) {\n\t${2}\n} else {\n\t${0}\n}', 'if / else'),
  S('switch', 'switch (${1:value}) {\n\tcase ${2:x}:\n\t\t${0}\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}', 'switch'),
  S('struct', 'struct ${1:Name} {\n\t${0}\n};', 'struct'),
  S('func', '${1:void} ${2:name}(${3}) {\n\t${0}\n}', 'Function'),
];
const C_KEYWORDS = 'auto break case char const continue default do double else enum extern float goto int long register return short signed sizeof static typedef union unsigned void volatile NULL';
const C_LANG: Lang = { snippets: C_SNIPPETS, keywords: words(C_KEYWORDS), functions: C_FUNCTIONS, members: {} };

const CPP_LANG: Lang = {
  snippets: [
    ...C_SNIPPETS.filter((s) => s.prefixes[0] !== 'struct'),
    S('cout', 'std::cout << ${1} << std::endl;', 'Print a line'),
    S('cin', 'std::cin >> ${1};', 'Read input'),
    S('vec', 'std::vector<${1:int}> ${2:v};', 'New vector'),
    S('foreach', 'for (auto& ${1:item} : ${2:items}) {\n\t${0}\n}', 'Loop over each item'),
    S('class', 'class ${1:Name} {\npublic:\n\t${1:Name}(${2});\n\t${0}\n};', 'Class'),
    S('struct', 'struct ${1:Name} {\n\t${0}\n};', 'struct'),
    S('uns', 'using namespace std;', 'using namespace std'),
    S('try', 'try {\n\t${1}\n} catch (const std::exception& ${2:e}) {\n\t${0}\n}', 'try / catch'),
  ],
  keywords: words(`${C_KEYWORDS} bool catch class delete false namespace new nullptr private protected public template this throw true try typename using virtual`),
  functions: C_FUNCTIONS,
  members: {
    std: [
      ...['cout', 'cin', 'cerr', 'endl'].map((n) => M(n, 'std', undefined, 'field')),
      ...['string', 'vector', 'map', 'set', 'pair', 'array', 'queue', 'stack'].map((n) => M(n, 'std', undefined, 'class')),
      ...['sort', 'min', 'max', 'swap', 'to_string', 'reverse'].map((n) => M(n, 'std', `${n}(\${1})`)),
    ],
  },
};

// ----------------------------------------------------------------------------------------------------------- html and sql
const HTML: Lang = {
  snippets: [S(['html5', '!'], '<!doctype html>\n<html lang="en">\n<head>\n\t<meta charset="utf-8">\n\t<title>${1:Title}</title>\n</head>\n<body>\n\t${0}\n</body>\n</html>', 'HTML page')],
  keywords: [],
  functions: [],
  members: {},
};
const SQL: Lang = {
  snippets: [
    S(['sel', 'select'], 'SELECT ${1:*}\nFROM ${2:table}\nWHERE ${3:condition};', 'SELECT query'),
    S('ins', 'INSERT INTO ${1:table} (${2:columns})\nVALUES (${3:values});', 'INSERT'),
    S('upd', 'UPDATE ${1:table}\nSET ${2:column} = ${3:value}\nWHERE ${4:condition};', 'UPDATE'),
    S('cre', 'CREATE TABLE ${1:table} (\n\t${2:id} INTEGER PRIMARY KEY,\n\t${0}\n);', 'CREATE TABLE'),
  ],
  keywords: words('SELECT FROM WHERE INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ORDER BY GROUP HAVING JOIN LEFT INNER ON AND OR NOT NULL LIMIT AS DISTINCT COUNT'),
  functions: [],
  members: {},
};

export const LANGUAGE_SUPPORT: Record<string, Lang> = {
  python: PYTHON,
  javascript: JAVASCRIPT,
  typescript: TYPESCRIPT,
  java: JAVA,
  c: C_LANG,
  cpp: CPP_LANG,
  html: HTML,
  sql: SQL,
};

// ---------------------------------------------------------------------------------------------------------------- engine
const K = monaco.languages.CompletionItemKind;

/** The text a snippet will produce, for the documentation box next to the list: placeholders replaced by their defaults. */
function preview(body: string): string {
  let t = body;
  for (let i = 0; i < 4; i++) t = t.replace(/\$\{\d+:([^${}]*)\}/g, '$1'); // innermost placeholders first
  return t.replace(/\$\{?\d+\}?/g, '').replace(/\\([$}\\])/g, '$1').replace(/\t/g, '    ');
}

function importEdit(model: monaco.editor.ITextModel, cls: string): monaco.languages.TextEdit[] | undefined {
  if (!JAVA_UTIL.has(cls)) return undefined;
  const text = model.getValue();
  if (new RegExp(`^\\s*import\\s+java\\.util\\.(${cls}|\\*)\\s*;`, 'm').test(text)) return undefined;
  let after = 0;
  let sawImport = false;
  model.getLinesContent().forEach((line, i) => {
    if (/^\s*import\s/.test(line)) {
      after = i + 1;
      sawImport = true;
    } else if (!sawImport && /^\s*package\s/.test(line)) after = i + 1;
  });
  const row = after + 1;
  const pad = sawImport ? '' : '\n'; // a blank line between the new first import and the code
  return [{ range: new monaco.Range(row, 1, row, 1), text: `import java.util.${cls};\n${pad}` }];
}

function documentWords(model: monaco.editor.ITextModel, partial: string): string[] {
  const counts = new Map<string, number>();
  for (const m of monaco.editor.getModels()) {
    if (m.getLanguageId() !== model.getLanguageId() || m.getValueLength() > 300_000) continue;
    for (const w of m.getValue().match(/[A-Za-z_][A-Za-z0-9_]{2,}/g) ?? []) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  if (partial && counts.get(partial) === 1) counts.delete(partial); // do not offer the half-typed word to itself
  return [...counts.keys()].slice(0, 400);
}

function provide(lang: Lang, model: monaco.editor.ITextModel, position: monaco.Position, context: monaco.languages.CompletionContext): monaco.languages.CompletionList {
  const word = model.getWordUntilPosition(position);
  const before = model.getValueInRange(new monaco.Range(position.lineNumber, 1, position.lineNumber, word.startColumn));
  const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
  const Snippet = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;

  // A lone ':' (end of an `if x:` line, a dict, a slice) is a trigger character only for '::'.
  if (context.triggerKind === monaco.languages.CompletionTriggerKind.TriggerCharacter && context.triggerCharacter === ':' && !before.endsWith('::')) return { suggestions: [] };

  // After a dot or ::, offer only that object's members (or nothing when we do not know the object).
  if (/(?:\.|::)$/.test(before)) {
    const target = /([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)(?:\.|::)$/.exec(before)?.[1];
    const list = (target && lang.members[target]) || [];
    return {
      suggestions: list.map((m) => ({
        label: m.name,
        kind: m.kind === 'field' ? K.Field : m.kind === 'class' ? K.Class : K.Method,
        detail: m.detail,
        insertText: m.body ?? m.name,
        insertTextRules: Snippet,
        range,
        sortText: '0_' + m.name,
      })),
    };
  }

  const out: monaco.languages.CompletionItem[] = [];
  const taken = new Set<string>();
  // '#include' starts with a character that is not part of a word: replace the '#' too so it is not typed twice.
  const hash = before.endsWith('#');
  for (const s of lang.snippets) {
    for (const p of s.prefixes) {
      taken.add(p);
      const r = hash && s.body.startsWith('#') ? new monaco.Range(range.startLineNumber, range.startColumn - 1, range.endLineNumber, range.endColumn) : range;
      out.push({
        label: p,
        kind: K.Snippet,
        detail: s.detail,
        documentation: { value: '```\n' + preview(s.body) + '\n```' },
        insertText: s.body,
        insertTextRules: Snippet,
        filterText: hash && s.body.startsWith('#') ? '#' + p : p,
        range: r,
        sortText: '0_' + p,
      });
    }
  }
  for (const f of lang.functions) {
    taken.add(f.name);
    out.push({ label: f.name, kind: K.Function, detail: f.detail, insertText: f.body ?? f.name, insertTextRules: Snippet, range, sortText: '2_' + f.name });
  }
  for (const k of lang.keywords) {
    if (taken.has(k)) continue;
    taken.add(k);
    out.push({ label: k, kind: K.Keyword, insertText: k, range, sortText: '3_' + k });
  }
  for (const t of lang.types ?? []) {
    taken.add(t);
    out.push({ label: t, kind: K.Class, insertText: t, range, sortText: '2_' + t, additionalTextEdits: importEdit(model, t) });
  }
  for (const w of documentWords(model, word.word)) {
    if (taken.has(w)) continue;
    out.push({ label: w, kind: K.Text, insertText: w, range, sortText: '1_' + w });
  }
  return { suggestions: out };
}

let registered = false;

/** Called once from monaco-setup.ts. */
export function registerSnippets(): void {
  if (registered) return;
  registered = true;
  for (const [id, lang] of Object.entries(LANGUAGE_SUPPORT)) {
    monaco.languages.registerCompletionItemProvider(id, {
      triggerCharacters: ['.', ':'],
      provideCompletionItems: (model, position, context) => provide(lang, model, position, context),
    });
  }
}
