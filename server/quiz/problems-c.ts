/** Coding problems, part 3: dynamic programming, graphs and grids. */
import { ints, letters, perm, rng, row, type CodeProblem } from './types';

const R = String.raw;

/** a rows x cols grid of 0/1 characters, one row per line */
function bits(seed: number, rows: number, cols: number, density: number): string {
  const r = rng(seed);
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => (r() < density ? '1' : '0')).join('')).join('\n');
}

/** a rows x cols grid of 0/1/2 (empty / fresh / rotten), numbers separated by spaces */
function oranges(seed: number, rows: number, cols: number): string {
  const r = rng(seed);
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => {
      const x = r();
      return x < 0.25 ? 0 : x < 0.93 ? 1 : 2;
    }).join(' '),
  ).join('\n');
}

/** an undirected graph as "n m", m edges, then a source and a destination */
function graph(seed: number, n: number, m: number): string {
  const r = rng(seed);
  const edges = Array.from({ length: m }, () => `${Math.floor(r() * n)} ${Math.floor(r() * n)}`);
  return `${n} ${m}\n${edges.join('\n')}\n0 ${n - 1}\n`;
}

/** a directed acyclic course list: every prerequisite goes from a smaller to a larger number, then shuffled */
function dag(seed: number, n: number, m: number, cyclic: boolean): string {
  const r = rng(seed);
  const order = perm(seed + 1, n);
  const pairs: string[] = [];
  for (let i = 0; i < m; i++) {
    const a = Math.floor(r() * (n - 1));
    const b = a + 1 + Math.floor(r() * (n - 1 - a));
    pairs.push(`${order[b]} ${order[a]}`); // order[b] needs order[a] first
  }
  if (cyclic) pairs.push(`${order[0]} ${order[n - 1]}`, `${order[n - 1]} ${order[0]}`);
  return `${n} ${pairs.length}\n${pairs.join('\n')}\n`;
}

export const PROBLEMS_C: CodeProblem[] = [
  // --------------------------------------------------------------------- dp
  {
    id: 'climbing-stairs',
    type: 'code',
    topic: 'dp',
    difficulty: 'easy',
    title: 'Climbing Stairs',
    statement: 'A staircase has n steps. You climb 1 or 2 steps at a time. In how many different ways can you reach the top?',
    inputFormat: 'One integer n.',
    outputFormat: 'One integer: the number of ways.',
    constraints: '1 ≤ n ≤ 45.',
    samples: [
      { input: '2\n', output: '2' },
      { input: '3\n', output: '3' },
    ],
    hidden: ['1\n', '5\n', '10\n', '30\n', '45\n', '20\n'],
    reference: R`import sys

def main():
    n = int(sys.stdin.read().split()[0])
    a, b = 1, 1
    for _ in range(n - 1):
        a, b = b, a + b
    print(b)

main()
`,
  },
  {
    id: 'house-robber',
    type: 'code',
    topic: 'dp',
    difficulty: 'medium',
    title: 'House Robber',
    statement:
      'Houses stand in a row and each holds some money. You may rob any houses, but **never two next to each other**. Print the most money you can take.',
    inputFormat: 'Line 1: n. Line 2: n amounts.',
    outputFormat: 'One integer.',
    constraints: '1 ≤ n ≤ 10000, 0 ≤ amount ≤ 1000.',
    samples: [
      { input: '4\n1 2 3 1\n', output: '4' },
      { input: '5\n2 7 9 3 1\n', output: '12' },
    ],
    hidden: ['1\n5\n', '2\n3 9\n', '3\n10 1 10\n', '6\n0 0 0 0 0 0\n', '7\n5 5 10 100 10 5 5\n', () => `1000\n${row(ints(53, 1000, 0, 1000))}\n`],
    reference: R`import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    a = list(map(int, data[1:1 + n]))
    take, skip = 0, 0
    for x in a:
        take, skip = skip + x, max(take, skip)
    print(max(take, skip))

main()
`,
  },
  {
    id: 'coin-change',
    type: 'code',
    topic: 'dp',
    difficulty: 'medium',
    title: 'Coin Change',
    statement:
      'You have unlimited coins of the given values. Print the **fewest coins** that add up to the amount, or -1 if the amount cannot be made. (Careful: always taking the biggest coin first does not always work.)',
    inputFormat: 'Line 1: k (kinds of coins) and the amount. Line 2: the k coin values.',
    outputFormat: 'One integer.',
    constraints: '1 ≤ k ≤ 12, 1 ≤ coin ≤ 10000, 0 ≤ amount ≤ 10000.',
    samples: [
      { input: '3 11\n1 2 5\n', output: '3' },
      { input: '1 3\n2\n', output: '-1' },
    ],
    hidden: ['1 0\n1\n', '3 6\n1 3 4\n', '2 7\n2 4\n', '4 100\n1 5 10 25\n', '3 9999\n7 13 101\n', '3 63\n1 21 37\n'],
    reference: R`import sys

def main():
    data = sys.stdin.read().split()
    k, amount = int(data[0]), int(data[1])
    coins = list(map(int, data[2:2 + k]))
    INF = float("inf")
    best = [0] + [INF] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a and best[a - c] + 1 < best[a]:
                best[a] = best[a - c] + 1
    print(-1 if best[amount] == INF else best[amount])

main()
`,
  },
  {
    id: 'lis',
    type: 'code',
    topic: 'dp',
    difficulty: 'medium',
    title: 'Longest Increasing Subsequence',
    statement:
      'A subsequence keeps the order of the numbers but may skip some. Find the length of the longest subsequence that is **strictly increasing**.',
    inputFormat: 'Line 1: n. Line 2: n integers.',
    outputFormat: 'One integer.',
    constraints: '1 ≤ n ≤ 2000.',
    samples: [
      { input: '8\n10 9 2 5 3 7 101 18\n', output: '4' },
      { input: '4\n0 1 0 3\n', output: '3' },
    ],
    hidden: ['1\n7\n', '5\n7 7 7 7 7\n', '6\n1 2 3 4 5 6\n', '6\n6 5 4 3 2 1\n', '9\n3 10 2 1 20 4 6 7 8\n', () => `1500\n${row(ints(59, 1500, -1000, 1000))}\n`],
    reference: R`import sys
from bisect import bisect_left

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    a = list(map(int, data[1:1 + n]))
    tails = []
    for x in a:
        i = bisect_left(tails, x)
        if i == len(tails):
            tails.append(x)
        else:
            tails[i] = x
    print(len(tails))

main()
`,
  },
  {
    id: 'edit-distance',
    type: 'code',
    topic: 'dp',
    difficulty: 'hard',
    title: 'Edit Distance',
    statement:
      'You can change a word by **inserting** a letter, **deleting** a letter or **replacing** a letter. Print the smallest number of such steps that turn the first word into the second.',
    inputFormat: 'Line 1: the first word. Line 2: the second word. Lowercase letters.',
    outputFormat: 'One integer.',
    constraints: '1 ≤ length ≤ 500 for each word.',
    samples: [
      { input: 'horse\nros\n', output: '3' },
      { input: 'intention\nexecution\n', output: '5' },
    ],
    hidden: ['a\na\n', 'a\nb\n', 'abc\nabcd\n', 'kitten\nsitting\n', 'sunday\nsaturday\n', () => `${letters(61, 300, 4)}\n${letters(62, 280, 4)}\n`],
    reference: R`import sys

def main():
    s, t = sys.stdin.read().split()
    prev = list(range(len(t) + 1))
    for i in range(1, len(s) + 1):
        cur = [i] + [0] * len(t)
        for j in range(1, len(t) + 1):
            cost = 0 if s[i - 1] == t[j - 1] else 1
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
        prev = cur
    print(prev[len(t)])

main()
`,
  },
  {
    id: 'burst-balloons',
    type: 'code',
    topic: 'dp',
    difficulty: 'hard',
    title: 'Burst Balloons',
    statement:
      'Balloons in a row each show a number. Bursting balloon i earns `left × nums[i] × right` coins, where left and right are its **current** neighbours; a missing neighbour counts as 1. Burst every balloon in the best order and print the most coins you can collect.',
    inputFormat: 'Line 1: n. Line 2: n numbers.',
    outputFormat: 'One integer.',
    constraints: '1 ≤ n ≤ 60, 0 ≤ value ≤ 100.',
    samples: [
      { input: '4\n3 1 5 8\n', output: '167' },
      { input: '2\n1 5\n', output: '10' },
    ],
    hidden: ['1\n7\n', '3\n1 1 1\n', '3\n9 76 64\n', '5\n7 9 8 0 7\n', '6\n3 1 5 8 2 4\n', () => `50\n${row(ints(67, 50, 0, 100))}\n`],
    reference: R`import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    a = [1] + list(map(int, data[1:1 + n])) + [1]
    m = n + 2
    dp = [[0] * m for _ in range(m)]
    for length in range(2, m):
        for left in range(0, m - length):
            right = left + length
            for k in range(left + 1, right):
                dp[left][right] = max(dp[left][right], dp[left][k] + dp[k][right] + a[left] * a[k] * a[right])
    print(dp[0][m - 1])

main()
`,
  },

  // ----------------------------------------------------------------- graphs
  {
    id: 'path-exists',
    type: 'code',
    topic: 'graphs',
    difficulty: 'easy',
    title: 'Find if Path Exists in Graph',
    statement: 'An undirected graph has n vertices numbered 0 to n-1. Decide whether you can walk from the source vertex to the destination vertex along the edges.',
    inputFormat: 'Line 1: n and m. Next m lines: an edge `u v`. Last line: the source and the destination.',
    outputFormat: 'YES or NO.',
    constraints: '1 ≤ n ≤ 20000, 0 ≤ m ≤ 40000.',
    samples: [
      { input: '3 3\n0 1\n1 2\n2 0\n0 2\n', output: 'YES' },
      { input: '6 5\n0 1\n0 2\n3 5\n5 4\n4 3\n0 5\n', output: 'NO' },
    ],
    hidden: ['1 0\n0 0\n', '2 0\n0 1\n', '4 3\n0 1\n1 2\n2 3\n3 0\n', '5 2\n0 1\n3 4\n1 0\n', () => graph(71, 2000, 1500), () => graph(72, 2000, 3000)],
    reference: R`import sys
from collections import deque

def main():
    data = sys.stdin.read().split()
    n, m = int(data[0]), int(data[1])
    adj = [[] for _ in range(n)]
    pos = 2
    for _ in range(m):
        u, v = int(data[pos]), int(data[pos + 1])
        pos += 2
        adj[u].append(v)
        adj[v].append(u)
    src, dst = int(data[pos]), int(data[pos + 1])
    seen = [False] * n
    seen[src] = True
    queue = deque([src])
    while queue:
        u = queue.popleft()
        for v in adj[u]:
            if not seen[v]:
                seen[v] = True
                queue.append(v)
    print("YES" if seen[dst] else "NO")

main()
`,
  },
  {
    id: 'number-of-islands',
    type: 'code',
    topic: 'graphs',
    difficulty: 'medium',
    title: 'Number of Islands',
    statement:
      'The grid shows land (`1`) and water (`0`). An island is a group of land cells connected **up, down, left or right** (not diagonally). Count the islands.',
    inputFormat: 'Line 1: r and c. Then r lines, each a string of c characters 0 or 1 (no spaces).',
    outputFormat: 'One integer.',
    constraints: '1 ≤ r, c ≤ 200.',
    samples: [
      { input: '4 5\n11110\n11010\n11000\n00000\n', output: '1' },
      { input: '4 5\n11000\n11000\n00100\n00011\n', output: '3' },
    ],
    hidden: ['1 1\n0\n', '1 1\n1\n', '2 2\n10\n01\n', '3 3\n101\n010\n101\n', () => `30 40\n${bits(73, 30, 40, 0.4)}\n`, () => `60 60\n${bits(74, 60, 60, 0.55)}\n`],
    reference: R`import sys

def main():
    data = sys.stdin.read().split()
    r, c = int(data[0]), int(data[1])
    grid = [list(row) for row in data[2:2 + r]]
    count = 0
    for i in range(r):
        for j in range(c):
            if grid[i][j] != '1':
                continue
            count += 1
            stack = [(i, j)]
            grid[i][j] = '0'
            while stack:
                x, y = stack.pop()
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < r and 0 <= ny < c and grid[nx][ny] == '1':
                        grid[nx][ny] = '0'
                        stack.append((nx, ny))
    print(count)

main()
`,
  },
  {
    id: 'rotting-oranges',
    type: 'code',
    topic: 'graphs',
    difficulty: 'medium',
    title: 'Rotting Oranges',
    statement:
      'In a grid, `0` is an empty cell, `1` a fresh orange and `2` a rotten one. Every minute, each fresh orange that is next to a rotten one (up, down, left or right) becomes rotten. Print the **minutes** until no fresh orange is left, or -1 if some can never rot.',
    inputFormat: 'Line 1: r and c. Then r lines of c numbers separated by spaces.',
    outputFormat: 'One integer.',
    constraints: '1 ≤ r, c ≤ 100.',
    samples: [
      { input: '3 3\n2 1 1\n1 1 0\n0 1 1\n', output: '4' },
      { input: '3 3\n2 1 1\n0 1 1\n1 0 1\n', output: '-1' },
    ],
    hidden: ['1 2\n0 2\n', '1 1\n1\n', '1 1\n0\n', '2 2\n2 2\n2 2\n', () => `20 25\n${oranges(75, 20, 25)}\n`, () => `40 40\n${oranges(76, 40, 40)}\n`],
    reference: R`import sys
from collections import deque

def main():
    data = sys.stdin.read().split()
    r, c = int(data[0]), int(data[1])
    grid = [[int(data[2 + i * c + j]) for j in range(c)] for i in range(r)]
    queue = deque()
    fresh = 0
    for i in range(r):
        for j in range(c):
            if grid[i][j] == 2:
                queue.append((i, j, 0))
            elif grid[i][j] == 1:
                fresh += 1
    minutes = 0
    while queue:
        x, y, t = queue.popleft()
        minutes = max(minutes, t)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < r and 0 <= ny < c and grid[nx][ny] == 1:
                grid[nx][ny] = 2
                fresh -= 1
                queue.append((nx, ny, t + 1))
    print(minutes if fresh == 0 else -1)

main()
`,
  },
  {
    id: 'course-schedule',
    type: 'code',
    topic: 'graphs',
    difficulty: 'medium',
    title: 'Course Schedule',
    statement:
      'There are n courses numbered 0 to n-1. Each pair `a b` means "to take course a you must first finish course b". Decide whether it is possible to finish **all** the courses.',
    inputFormat: 'Line 1: n and m. Next m lines: a pair `a b`.',
    outputFormat: 'YES or NO.',
    constraints: '1 ≤ n ≤ 5000, 0 ≤ m ≤ 10000.',
    samples: [
      { input: '2 1\n1 0\n', output: 'YES' },
      { input: '2 2\n1 0\n0 1\n', output: 'NO' },
    ],
    hidden: ['1 0\n', '1 1\n0 0\n', '3 2\n1 0\n2 1\n', '4 4\n1 0\n2 1\n3 2\n1 3\n', () => dag(77, 400, 900, false), () => dag(78, 400, 900, true)],
    reference: R`import sys
from collections import deque

def main():
    data = sys.stdin.read().split()
    n, m = int(data[0]), int(data[1])
    adj = [[] for _ in range(n)]
    indeg = [0] * n
    for i in range(m):
        a, b = int(data[2 + 2 * i]), int(data[3 + 2 * i])
        adj[b].append(a)
        indeg[a] += 1
    queue = deque(i for i in range(n) if indeg[i] == 0)
    done = 0
    while queue:
        u = queue.popleft()
        done += 1
        for v in adj[u]:
            indeg[v] -= 1
            if indeg[v] == 0:
                queue.append(v)
    print("YES" if done == n else "NO")

main()
`,
  },
  {
    id: 'swim-rising-water',
    type: 'code',
    topic: 'graphs',
    difficulty: 'hard',
    title: 'Swim in Rising Water',
    statement:
      'An n × n grid holds the elevation of each square (all different, 0 to n²-1). At time t the water depth everywhere is t, and you may swim between two **neighbouring** squares (up, down, left, right) when **both** have elevation at most t. You start at the top-left square and want the bottom-right one. Print the **least time** at which you can get there.',
    inputFormat: 'Line 1: n. Then n lines of n numbers.',
    outputFormat: 'One integer.',
    constraints: '1 ≤ n ≤ 50.',
    samples: [
      { input: '2\n0 2\n1 3\n', output: '3' },
      { input: '5\n0 1 2 3 4\n24 23 22 21 5\n12 13 14 15 16\n11 17 18 19 20\n10 9 8 7 6\n', output: '16' },
    ],
    hidden: [
      '1\n0\n',
      '3\n0 8 7\n1 2 6\n3 4 5\n',
      '3\n8 7 6\n5 4 3\n2 1 0\n',
      () => `10\n${Array.from({ length: 10 }, (_, i) => row(perm(79, 100).slice(i * 10, i * 10 + 10))).join('\n')}\n`,
      () => `30\n${Array.from({ length: 30 }, (_, i) => row(perm(80, 900).slice(i * 30, i * 30 + 30))).join('\n')}\n`,
    ],
    reference: R`import sys
import heapq

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    g = [[int(data[1 + i * n + j]) for j in range(n)] for i in range(n)]
    best = [[float("inf")] * n for _ in range(n)]
    best[0][0] = g[0][0]
    heap = [(g[0][0], 0, 0)]
    while heap:
        t, x, y = heapq.heappop(heap)
        if t > best[x][y]:
            continue
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < n and 0 <= ny < n:
                nt = max(t, g[nx][ny])
                if nt < best[nx][ny]:
                    best[nx][ny] = nt
                    heapq.heappush(heap, (nt, nx, ny))
    print(best[n - 1][n - 1])

main()
`,
  },
];
