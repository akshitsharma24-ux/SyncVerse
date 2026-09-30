/**
 * Planted-bug sample programs: the ones in the demo script. Shared by everyone:
 *   Lane B tests runs and error-line marking against them, Lane C uses the explanations as pre-baked answers and as an
 *   evaluation set, Lane D's Samples menu loads them into the editor. `npm run verify:samples` RUNS each program
 *   locally and checks `expect`, so the expectations are facts, not guesses.
 * Line numbers are 1-based, counted in `source`.
 */
import type { Explanation, RunStatus } from './types';

export interface Sample {
  id: string;
  title: string;
  language: 'python';
  source: string;
  stdin: string;
  /** What a correct run of this program produces. `errorName` is the Python exception; `errorLine` is where it is raised. */
  expect: { status: RunStatus; errorName?: string; errorLine?: number; stdout?: string };
  concepts: string[];
  /** Why this sample exists / which demo step uses it. */
  note: string;
  /** A beginner-level explanation that is correct for this exact program. Also usable as a pre-baked AI answer. */
  explanation?: Explanation;
}

export const SAMPLES: Sample[] = [
  {
    id: 'index-error',
    title: 'Loop goes one step too far (IndexError)',
    language: 'python',
    source: `def average(nums):
    total = 0
    for i in range(len(nums) + 1):
        total += nums[i]
    return total / len(nums)


print(average([3, 4, 5]))
`,
    stdin: '',
    expect: { status: 'runtime_error', errorName: 'IndexError', errorLine: 4 },
    concepts: ['loop-boundaries', 'lists-arrays'],
    note: 'GOLDEN PATH. Run, error line marked, Explain with AI, patch Accept/Reject. Same program as the room starter.',
    explanation: {
      what: 'Your program stopped with an IndexError.',
      whereLine: 4,
      why: 'range(len(nums) + 1) makes i reach 3, but a list with 3 items only has positions 0, 1 and 2.',
      plain: 'A list with 3 items has positions 0, 1, 2. Position 3 does not exist, so Python stops when the loop asks for it.',
      fix: 'Stop the loop one step earlier: use range(len(nums)).',
      snippet: '    for i in range(len(nums)):',
      concepts: ['loop-boundaries', 'lists-arrays'],
    },
  },
  {
    id: 'name-error',
    title: 'Misspelled variable (NameError)',
    language: 'python',
    source: `def greet(name):
    message = "Hello, " + name
    print(mesage)


greet("Asha")
`,
    stdin: '',
    expect: { status: 'runtime_error', errorName: 'NameError', errorLine: 3 },
    concepts: ['variables-types'],
    note: 'Second easiest error for the AI to explain; good for the hint-mode demo.',
    explanation: {
      what: "Python does not know the name 'mesage'.",
      whereLine: 3,
      why: 'The variable is called message (with two s) but line 3 spells it mesage.',
      plain: 'Python only knows names you created. One typo makes a brand-new name that has no value.',
      fix: 'Use the same spelling as where you created it: print(message).',
      snippet: '    print(message)',
      concepts: ['variables-types'],
    },
  },
  {
    id: 'syntax-error',
    title: 'Missing colon (SyntaxError)',
    language: 'python',
    source: `def double(x)
    return x * 2


print(double(4))
`,
    stdin: '',
    expect: { status: 'compile_error', errorName: 'SyntaxError', errorLine: 1 },
    concepts: ['syntax-basics'],
    note: 'Judge0 reports Python syntax errors as a runtime error; Lane B maps SyntaxError/IndentationError in stderr to compile_error.',
    explanation: {
      what: 'Python could not read line 1.',
      whereLine: 1,
      why: 'A function definition must end with a colon before its body.',
      plain: 'The colon tells Python that the indented lines below belong to the function.',
      fix: 'Add a colon after the parentheses: def double(x):',
      snippet: 'def double(x):',
      concepts: ['syntax-basics'],
    },
  },
  {
    id: 'type-error',
    title: 'Adding text and a number (TypeError)',
    language: 'python',
    source: `total = 5
print("Total: " + total)
`,
    stdin: '',
    expect: { status: 'runtime_error', errorName: 'TypeError', errorLine: 2 },
    concepts: ['variables-types'],
    note: 'Short program; good for a fast live demo.',
    explanation: {
      what: 'You tried to add text and a number.',
      whereLine: 2,
      why: '"Total: " is text and total is a number; + cannot join the two.',
      plain: 'Python will not guess whether you want maths or text, so it stops and asks you to be explicit.',
      fix: 'Turn the number into text with str(total), or use an f-string.',
      snippet: 'print("Total: " + str(total))',
      concepts: ['variables-types'],
    },
  },
  {
    id: 'infinite-loop',
    title: 'Loop that never stops (timeout)',
    language: 'python',
    source: `count = 0
while count < 5:
    print(count)
`,
    stdin: '',
    expect: { status: 'timeout' },
    concepts: ['loops'],
    note: 'Exercises the time limit and the output cap. Do not run it in a demo unless the limit is proven to work.',
    explanation: {
      what: 'Your program ran until the time limit and was stopped.',
      whereLine: 2,
      why: 'count never changes inside the loop, so count < 5 stays true forever.',
      plain: 'A while loop repeats as long as its condition is true. Nothing inside this loop ever makes it false.',
      fix: 'Increase count inside the loop: count += 1.',
      snippet: '    count += 1',
      concepts: ['loops'],
    },
  },
  {
    id: 'recursion-error',
    title: 'Function with no stopping case (RecursionError)',
    language: 'python',
    source: `def countdown(n):
    print(n)
    return countdown(n - 1)


countdown(3)
`,
    stdin: '',
    expect: { status: 'runtime_error', errorName: 'RecursionError' },
    concepts: ['recursion'],
    note: 'Produces ~1000 lines of output before failing; shows the output cap. Good for the canvas later (frames stack up).',
    explanation: {
      what: 'The function called itself too many times.',
      whereLine: 3,
      why: 'countdown has no stopping case, so it keeps calling itself until Python hits its safety limit.',
      plain: 'Every call waits for the next one to finish. Without a base case none of them ever can.',
      fix: 'Add a base case that returns when n reaches 0, before the recursive call.',
      snippet: '    if n <= 0:\n        return',
      concepts: ['recursion'],
    },
  },
  {
    id: 'stdin-average',
    title: 'Average of numbers from input (works)',
    language: 'python',
    source: `nums = list(map(int, input().split()))
print(sum(nums) / len(nums))
`,
    stdin: '3 4 5\n',
    expect: { status: 'success', stdout: '4.0\n' },
    concepts: ['input-output'],
    note: 'PRIVATE EXECUTION demo: three people run this same file with different stdin (3 4 5, 10 20, 9) and get different output.',
  },
  {
    id: 'list-aliasing',
    title: 'Two names, one list (surprising output)',
    language: 'python',
    source: `a = [1, 2, 3]
b = a
b.append(4)
print(a)
`,
    stdin: '',
    expect: { status: 'success', stdout: '[1, 2, 3, 4]\n' },
    concepts: ['list-mutation-aliasing'],
    note: 'The execution-canvas signature example (roadmap): it runs fine but prints something beginners do not expect.',
  },
  {
    id: 'quality-smells',
    title: 'Works, but has quality problems',
    language: 'python',
    source: `def f(x):
    t = 0
    for a in range(10):
        for b in range(10):
            for c in range(10):
                for d in range(10):
                    if d > 3:
                        t = t + a * b * c * d * 3.14159 * 86400 * 7
    try:
        r = eval("1 + 1")
    except:
        pass
    return t + r  # this is a deliberately very long comment so that the line goes well past one hundred characters

print(f(2))
`,
    stdin: '',
    expect: { status: 'success' },
    concepts: ['complexity-efficiency', 'exceptions-errors'],
    note: 'QUALITY PANEL demo: long line, one-letter names, 4-deep nesting, magic numbers, eval, bare except (see fixtureDiagnostics).',
  },
];

export const SAMPLE_BY_ID: Record<string, Sample> = Object.fromEntries(SAMPLES.map((s) => [s.id, s]));
