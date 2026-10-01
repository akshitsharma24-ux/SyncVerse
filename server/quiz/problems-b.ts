/** Coding problems, part 2: stacks and queues, binary search and sorting, recursion. */
import { ints, perm, row, type CodeProblem } from './types';

const R = String.raw;

/** a sorted array of `n` distinct values */
const sortedDistinct = (seed: number, n: number): number[] => perm(seed, n * 4).slice(0, n).sort((a, b) => a - b);

/** brackets: a long, valid nesting built from a seed */
function nested(seed: number, pairs: number): string {
  const kinds = ['()', '[]', '{}'];
  const choice = ints(seed, pairs, 0, 2);
  return choice.map((k) => kinds[k][0]).join('') + choice.map((k) => kinds[k][1]).reverse().join('');
}

export const PROBLEMS_B: CodeProblem[] = [
  // ------------------------------------------------------------------ stacks
  {
    id: 'valid-parentheses',
    type: 'code',
    topic: 'stacks',
    difficulty: 'easy',
    title: 'Valid Parentheses',
    statement:
      'A string made only of the brackets `( ) [ ] { }` is **valid** when every opening bracket is closed by the same kind of bracket, in the right order. Decide whether it is valid.',
    inputFormat: 'One line: the bracket string.',
    outputFormat: 'YES or NO.',
    constraints: '1 ≤ length ≤ 20000.',
    samples: [
      { input: '()[]{}\n', output: 'YES' },
      { input: '([)]\n', output: 'NO' },
    ],
    hidden: ['(]\n', '{[]}\n', '(\n', ')(\n', '((()))[[]]{}\n', () => `${nested(7, 2000)}\n`, () => `${nested(8, 2000).slice(0, -1)}\n`],
    reference: R`import sys

def main():
    s = sys.stdin.read().split()[0]
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for ch in s:
        if ch in '([{':
            stack.append(ch)
        elif not stack or stack.pop() != pairs[ch]:
            print("NO")
            return
    print("YES" if not stack else "NO")

main()
`,
  },
  {
    id: 'daily-temperatures',
    type: 'code',
    topic: 'stacks',
    difficulty: 'medium',
    title: 'Daily Temperatures',
    statement:
      'For each day, print how many days you have to wait until a **warmer** temperature. Print 0 for a day with no warmer day after it.',
    inputFormat: 'Line 1: n. Line 2: n temperatures.',
    outputFormat: 'n integers separated by spaces.',
    constraints: '1 ≤ n ≤ 20000, 30 ≤ temperature ≤ 100.',
    samples: [
      { input: '8\n73 74 75 71 69 72 76 73\n', output: '1 1 4 2 1 1 0 0' },
      { input: '3\n30 40 50\n', output: '1 1 0' },
    ],
    hidden: ['1\n55\n', '4\n50 50 50 50\n', '5\n90 80 70 60 50\n', '6\n60 70 60 70 60 70\n', '7\n31 35 33 34 32 36 30\n', () => `3000\n${row(ints(3, 3000, 30, 100))}\n`],
    reference: R`import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    t = list(map(int, data[1:1 + n]))
    out = [0] * n
    stack = []
    for i, x in enumerate(t):
        while stack and t[stack[-1]] < x:
            j = stack.pop()
            out[j] = i - j
        stack.append(i)
    print(*out)

main()
`,
  },
  {
    id: 'evaluate-rpn',
    type: 'code',
    topic: 'stacks',
    difficulty: 'medium',
    title: 'Evaluate Reverse Polish Notation',
    statement:
      'In reverse Polish notation an operator comes **after** its two numbers: `2 1 +` means 2 + 1. Evaluate the expression. Division **truncates toward zero** (7 / -2 is -3, not -4). Every expression is valid and never divides by zero.',
    inputFormat: 'Line 1: n, the number of tokens. Line 2: n tokens separated by spaces. A token is an integer or one of + - * /.',
    outputFormat: 'One integer: the value.',
    constraints: '1 ≤ n ≤ 10000. Every intermediate result fits in a 32-bit integer.',
    samples: [
      { input: '5\n2 1 + 3 *\n', output: '9' },
      { input: '13\n10 6 9 3 + -11 * / * 17 + 5 +\n', output: '22' },
    ],
    hidden: ['1\n42\n', '3\n7 -2 /\n', '3\n-7 2 /\n', '5\n4 13 5 / +\n', '7\n3 4 + 2 * 7 /\n', '9\n5 1 2 + 4 * + 3 -\n'],
    reference: R`import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    stack = []
    for tok in data[1:1 + n]:
        if tok in ('+', '-', '*', '/'):
            b = stack.pop()
            a = stack.pop()
            if tok == '+':
                stack.append(a + b)
            elif tok == '-':
                stack.append(a - b)
            elif tok == '*':
                stack.append(a * b)
            else:
                q = abs(a) // abs(b)
                stack.append(-q if (a < 0) != (b < 0) else q)
        else:
            stack.append(int(tok))
    print(stack[0])

main()
`,
  },
  {
    id: 'largest-rectangle-histogram',
    type: 'code',
    topic: 'stacks',
    difficulty: 'hard',
    title: 'Largest Rectangle in Histogram',
    statement:
      'The numbers are the heights of bars, each 1 unit wide, standing side by side. Find the **area of the largest rectangle** that fits inside the bars (it can span several bars, and its height is limited by the shortest bar it covers).',
    inputFormat: 'Line 1: n. Line 2: n heights.',
    outputFormat: 'One integer: the largest area.',
    constraints: '1 ≤ n ≤ 20000, 0 ≤ height ≤ 10000. Aim for O(n).',
    samples: [
      { input: '6\n2 1 5 6 2 3\n', output: '10' },
      { input: '2\n2 4\n', output: '4' },
    ],
    hidden: ['1\n0\n', '1\n9\n', '5\n2 2 2 2 2\n', '5\n5 4 3 2 1\n', '7\n6 2 5 4 5 1 6\n', () => `2500\n${row(ints(19, 2500, 0, 500))}\n`],
    reference: R`import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    h = list(map(int, data[1:1 + n])) + [0]
    stack = []
    best = 0
    for i, x in enumerate(h):
        while stack and h[stack[-1]] >= x:
            height = h[stack.pop()]
            left = stack[-1] + 1 if stack else 0
            best = max(best, height * (i - left))
        stack.append(i)
    print(best)

main()
`,
  },
  {
    id: 'sliding-window-maximum',
    type: 'code',
    topic: 'stacks',
    difficulty: 'hard',
    title: 'Sliding Window Maximum',
    statement:
      'A window of size `k` slides from the left end of the list to the right end, one step at a time. Print the **largest value inside the window** at every position. Aim for O(n) with a deque.',
    inputFormat: 'Line 1: n and k. Line 2: n integers.',
    outputFormat: 'n - k + 1 integers separated by spaces.',
    constraints: '1 ≤ k ≤ n ≤ 20000.',
    samples: [
      { input: '8 3\n1 3 -1 -3 5 3 6 7\n', output: '3 3 5 5 6 7' },
      { input: '1 1\n1\n', output: '1' },
    ],
    hidden: ['4 4\n9 11 8 5\n', '5 1\n4 3 2 1 0\n', '6 2\n1 -1 -2 -3 -4 -5\n', '7 3\n7 2 4 4 4 1 9\n', '5 2\n-7 -8 7 5 7\n', () => `3000 50\n${row(ints(23, 3000, -1000, 1000))}\n`],
    reference: R`import sys
from collections import deque

def main():
    data = sys.stdin.read().split()
    n, k = int(data[0]), int(data[1])
    a = list(map(int, data[2:2 + n]))
    dq = deque()
    out = []
    for i, x in enumerate(a):
        while dq and a[dq[-1]] <= x:
            dq.pop()
        dq.append(i)
        if dq[0] <= i - k:
            dq.popleft()
        if i >= k - 1:
            out.append(a[dq[0]])
    print(*out)

main()
`,
  },

  // ----------------------------------------------------------------- search
  {
    id: 'binary-search',
    type: 'code',
    topic: 'search',
    difficulty: 'easy',
    title: 'Binary Search',
    statement: 'The numbers are sorted from smallest to largest and all different. Print the position (from 0) of the target, or -1 if it is not there. Aim for O(log n).',
    inputFormat: 'Line 1: n and the target. Line 2: n sorted integers.',
    outputFormat: 'One integer.',
    constraints: '1 ≤ n ≤ 100000.',
    samples: [
      { input: '6 9\n-1 0 3 5 9 12\n', output: '4' },
      { input: '6 2\n-1 0 3 5 9 12\n', output: '-1' },
    ],
    hidden: ['1 5\n5\n', '1 4\n5\n', '5 1\n1 2 3 4 5\n', '5 5\n1 2 3 4 5\n', '4 100\n-5 0 7 50\n', () => `4000 ${sortedDistinct(29, 4000)[2500]}\n${row(sortedDistinct(29, 4000))}\n`],
    reference: R`import sys

def main():
    data = sys.stdin.read().split()
    n, target = int(data[0]), int(data[1])
    a = list(map(int, data[2:2 + n]))
    lo, hi = 0, n - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if a[mid] == target:
            print(mid)
            return
        if a[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    print(-1)

main()
`,
  },
  {
    id: 'merge-sorted',
    type: 'code',
    topic: 'search',
    difficulty: 'easy',
    title: 'Merge Two Sorted Lists',
    statement: 'Two lists are each sorted from smallest to largest. Merge them into one sorted list, keeping duplicates.',
    inputFormat: 'Line 1: n and m. Line 2: the n numbers of the first list. Line 3: the m numbers of the second list.',
    outputFormat: 'n + m integers in increasing order, separated by spaces.',
    constraints: '1 ≤ n, m ≤ 20000.',
    samples: [
      { input: '3 3\n1 2 4\n1 3 4\n', output: '1 1 2 3 4 4' },
      { input: '1 2\n5\n2 9\n', output: '2 5 9' },
    ],
    hidden: ['1 1\n1\n1\n', '2 2\n1 2\n3 4\n', '2 2\n3 4\n1 2\n', '3 4\n-5 0 0\n-5 -4 0 8\n', '4 1\n1 1 1 1\n1\n', () => `1500 1500\n${row(ints(1, 1500, -100, 100).sort((a, b) => a - b))}\n${row(ints(2, 1500, -100, 100).sort((a, b) => a - b))}\n`],
    reference: R`import sys

def main():
    data = sys.stdin.read().split()
    n, m = int(data[0]), int(data[1])
    a = list(map(int, data[2:2 + n]))
    b = list(map(int, data[2 + n:2 + n + m]))
    out = []
    i = j = 0
    while i < n and j < m:
        if a[i] <= b[j]:
            out.append(a[i])
            i += 1
        else:
            out.append(b[j])
            j += 1
    out += a[i:] + b[j:]
    print(*out)

main()
`,
  },
  {
    id: 'search-rotated',
    type: 'code',
    topic: 'search',
    difficulty: 'medium',
    title: 'Search in Rotated Sorted Array',
    statement:
      'A sorted list of different numbers was **rotated** at some unknown point, so 0 1 2 4 5 6 7 might have become 4 5 6 7 0 1 2. Find the position of the target (from 0), or print -1. Aim for O(log n).',
    inputFormat: 'Line 1: n and the target. Line 2: the n numbers.',
    outputFormat: 'One integer.',
    constraints: '1 ≤ n ≤ 50000, all values different.',
    samples: [
      { input: '7 0\n4 5 6 7 0 1 2\n', output: '4' },
      { input: '7 3\n4 5 6 7 0 1 2\n', output: '-1' },
    ],
    hidden: ['1 1\n1\n', '1 0\n1\n', '2 1\n3 1\n', '5 5\n1 2 3 4 5\n', '6 6\n6 7 8 1 2 3\n', () => {
      const a = sortedDistinct(37, 3000);
      const k = 1234;
      const rotated = [...a.slice(k), ...a.slice(0, k)];
      return `3000 ${a[17]}\n${row(rotated)}\n`;
    }],
    reference: R`import sys

def main():
    data = sys.stdin.read().split()
    n, target = int(data[0]), int(data[1])
    a = list(map(int, data[2:2 + n]))
    print(a.index(target) if target in a else -1)

main()
`,
  },
  {
    id: 'koko-bananas',
    type: 'code',
    topic: 'search',
    difficulty: 'medium',
    title: 'Koko Eating Bananas',
    statement:
      'Koko has piles of bananas and `h` hours. Each hour she picks one pile and eats up to `k` bananas from it (if the pile has fewer, she finishes it and wastes the rest of that hour). Find the **smallest whole number k** that lets her eat everything within `h` hours.',
    inputFormat: 'Line 1: n (piles) and h (hours). Line 2: n pile sizes.',
    outputFormat: 'One integer: the smallest k.',
    constraints: '1 ≤ n ≤ 10000, n ≤ h ≤ 10⁹, 1 ≤ pile ≤ 10⁹. The total hours can pass 32 bits: use 64-bit integers (long, long long) for it.',
    samples: [
      { input: '4 8\n3 6 7 11\n', output: '4' },
      { input: '5 5\n30 11 23 4 20\n', output: '30' },
    ],
    hidden: ['5 6\n30 11 23 4 20\n', '1 1\n1\n', '1 10\n100\n', '3 1000000000\n1000000000 1000000000 1000000000\n', '4 4\n1 1 1 1\n', () => `500 2000\n${row(ints(43, 500, 1, 100000))}\n`],
    reference: R`import sys

def main():
    data = sys.stdin.read().split()
    n, h = int(data[0]), int(data[1])
    piles = list(map(int, data[2:2 + n]))
    lo, hi = 1, max(piles)
    while lo < hi:
        mid = (lo + hi) // 2
        hours = sum((p + mid - 1) // mid for p in piles)
        if hours <= h:
            hi = mid
        else:
            lo = mid + 1
    print(lo)

main()
`,
  },
  {
    id: 'median-two-sorted',
    type: 'code',
    topic: 'search',
    difficulty: 'hard',
    title: 'Median of Two Sorted Arrays',
    statement:
      'Two arrays are each sorted. Find the **median** of all their numbers together (the middle value, or the average of the two middle values when the total count is even). Aim for O(log(n + m)).',
    inputFormat: 'Line 1: n and m. Line 2: the n numbers of the first array. Line 3: the m numbers of the second.',
    outputFormat: 'The median with exactly one digit after the decimal point (for example 2.0 or 2.5).',
    constraints: '1 ≤ n, m ≤ 50000, |value| ≤ 10⁶.',
    samples: [
      { input: '2 1\n1 3\n2\n', output: '2.0' },
      { input: '2 2\n1 2\n3 4\n', output: '2.5' },
    ],
    hidden: ['1 1\n5\n5\n', '1 1\n-2\n-3\n', '3 2\n1 2 3\n10 20\n', '2 3\n7 8\n1 2 3\n', '4 4\n1 1 1 1\n1 1 1 1\n', () => `1200 800\n${row(ints(1, 1200, -1000, 1000).sort((a, b) => a - b))}\n${row(ints(2, 800, -1000, 1000).sort((a, b) => a - b))}\n`],
    reference: R`import sys

def main():
    data = sys.stdin.read().split()
    n, m = int(data[0]), int(data[1])
    a = list(map(int, data[2:2 + n]))
    b = list(map(int, data[2 + n:2 + n + m]))
    merged = sorted(a + b)
    t = len(merged)
    if t % 2:
        print(f"{merged[t // 2]}.0")
    else:
        total = merged[t // 2 - 1] + merged[t // 2]
        print(f"{total / 2:.1f}")

main()
`,
  },

  // -------------------------------------------------------------- recursion
  {
    id: 'fibonacci',
    type: 'code',
    topic: 'recursion',
    difficulty: 'easy',
    title: 'Fibonacci Number',
    statement: 'The Fibonacci numbers start F(0) = 0, F(1) = 1 and every later one is the sum of the two before it: F(n) = F(n-1) + F(n-2). Print F(n).',
    inputFormat: 'One integer n.',
    outputFormat: 'One integer: F(n).',
    constraints: '0 ≤ n ≤ 30.',
    samples: [
      { input: '10\n', output: '55' },
      { input: '2\n', output: '1' },
    ],
    hidden: ['0\n', '1\n', '5\n', '20\n', '30\n', '17\n'],
    reference: R`import sys

def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)

def main():
    n = int(sys.stdin.read().split()[0])
    print(fib(n))

main()
`,
  },
  {
    id: 'permutations',
    type: 'code',
    topic: 'recursion',
    difficulty: 'medium',
    title: 'All Permutations',
    statement:
      'Print every ordering (permutation) of the numbers 1 to n, one per line, in **lexicographic order** (so 1 2 3 comes before 1 3 2). Numbers on a line are separated by spaces.',
    inputFormat: 'One integer n.',
    outputFormat: 'n! lines.',
    constraints: '1 ≤ n ≤ 5.',
    samples: [
      { input: '3\n', output: '1 2 3\n1 3 2\n2 1 3\n2 3 1\n3 1 2\n3 2 1' },
      { input: '1\n', output: '1' },
    ],
    hidden: ['2\n', '4\n', '5\n'],
    reference: R`import sys
from itertools import permutations

def main():
    n = int(sys.stdin.read().split()[0])
    for p in permutations(range(1, n + 1)):
        print(*p)

main()
`,
  },
  {
    id: 'subset-sum-count',
    type: 'code',
    topic: 'recursion',
    difficulty: 'medium',
    title: 'Count Subsets With a Given Sum',
    statement:
      'Count the ways to choose some of the numbers (by position, so equal values at different positions count separately) so that they add up to exactly the target. Choosing nothing is allowed only when the target is 0.',
    inputFormat: 'Line 1: n and the target. Line 2: n positive integers.',
    outputFormat: 'One integer: the number of subsets.',
    constraints: '1 ≤ n ≤ 20, 0 ≤ target ≤ 1000, 1 ≤ value ≤ 100.',
    samples: [
      { input: '4 5\n1 2 3 4\n', output: '2' },
      { input: '3 3\n1 1 1\n', output: '1' },
    ],
    hidden: ['1 5\n5\n', '1 4\n5\n', '3 0\n1 2 3\n', '4 4\n2 2 2 2\n', '5 10\n1 2 3 4 5\n', () => `20 120\n${row(ints(47, 20, 1, 30))}\n`],
    reference: R`import sys

def main():
    data = sys.stdin.read().split()
    n, target = int(data[0]), int(data[1])
    nums = list(map(int, data[2:2 + n]))
    ways = [0] * (target + 1)
    ways[0] = 1
    for x in nums:
        for s in range(target, x - 1, -1):
            ways[s] += ways[s - x]
    print(ways[target])

main()
`,
  },
  {
    id: 'n-queens-count',
    type: 'code',
    topic: 'recursion',
    difficulty: 'hard',
    title: 'N-Queens',
    statement:
      'Place n queens on an n × n chessboard so that no two queens attack each other (no two share a row, a column or a diagonal). Print **how many different ways** there are to do it.',
    inputFormat: 'One integer n.',
    outputFormat: 'One integer: the number of solutions.',
    constraints: '1 ≤ n ≤ 9.',
    samples: [
      { input: '4\n', output: '2' },
      { input: '1\n', output: '1' },
    ],
    hidden: ['2\n', '3\n', '5\n', '6\n', '8\n', '9\n'],
    reference: R`import sys

def main():
    n = int(sys.stdin.read().split()[0])
    cols, d1, d2 = set(), set(), set()

    def place(r):
        if r == n:
            return 1
        total = 0
        for c in range(n):
            if c in cols or r - c in d1 or r + c in d2:
                continue
            cols.add(c); d1.add(r - c); d2.add(r + c)
            total += place(r + 1)
            cols.remove(c); d1.remove(r - c); d2.remove(r + c)
        return total

    print(place(0))

main()
`,
  },
];
