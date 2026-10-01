/** Coding problems, part 1: arrays, strings, hash maps. Expected outputs of the hidden tests are generated from `reference`. */
import { ints, letters, perm, row, type CodeProblem } from './types';

const R = String.raw;

/** n large random numbers with exactly one pair summing to the target (for Two Sum). Retries until the pair is unique. */
function twoSumLarge(seed: number, n: number): string {
  for (let attempt = 0; ; attempt++) {
    const p = ints(seed + attempt, n, -500_000_000, 500_000_000);
    const target = p[3] + p[n - 4];
    let pairs = 0;
    for (let a = 0; a < n && pairs < 2; a++) for (let b = a + 1; b < n; b++) if (p[a] + p[b] === target) pairs++;
    if (pairs === 1) return `${n} ${target}\n${row(p)}\n`;
  }
}

export const PROBLEMS_A: CodeProblem[] = [
  // ------------------------------------------------------------------ arrays
  {
    id: 'two-sum',
    type: 'code',
    topic: 'arrays',
    difficulty: 'easy',
    title: 'Two Sum',
    statement:
      'You are given a list of integers and a target number. Find the two **different** positions whose values add up to the target. Exactly one such pair exists.',
    inputFormat: 'Line 1: n and the target. Line 2: n integers.',
    outputFormat: 'The two positions i and j (counting from 0, with i < j) separated by a space.',
    constraints: '2 ≤ n ≤ 2000, |value| ≤ 5 × 10⁸ (so every sum fits in a 32-bit integer).',
    samples: [
      { input: '4 9\n2 7 11 15\n', output: '0 1' },
      { input: '3 6\n3 2 4\n', output: '1 2' },
    ],
    hidden: [
      '2 6\n3 3\n',
      '5 -3\n-1 -2 4 0 7\n',
      '6 20\n5 1 9 11 7 3\n',
      '4 0\n0 4 3 0\n',
      '8 17\n1 2 3 4 5 6 7 10\n',
      () => twoSumLarge(11, 1500),
    ],
    reference: R`import sys

def main():
    data = sys.stdin.read().split()
    n, target = int(data[0]), int(data[1])
    nums = list(map(int, data[2:2 + n]))
    seen = {}
    for j, x in enumerate(nums):
        if target - x in seen:
            print(seen[target - x], j)
            return
        seen[x] = j

main()
`,
  },
  {
    id: 'best-time-stock',
    type: 'code',
    topic: 'arrays',
    difficulty: 'easy',
    title: 'Best Time to Buy and Sell Stock',
    statement:
      'You are given the price of a stock on each day. Choose one day to buy and a **later** day to sell. Print the largest profit you can make, or 0 if every trade would lose money.',
    inputFormat: 'Line 1: n. Line 2: n prices.',
    outputFormat: 'One integer: the best profit.',
    constraints: '1 ≤ n ≤ 10000, 0 ≤ price ≤ 10000.',
    samples: [
      { input: '6\n7 1 5 3 6 4\n', output: '5' },
      { input: '5\n7 6 4 3 1\n', output: '0' },
    ],
    hidden: ['1\n5\n', '2\n1 2\n', '2\n2 1\n', '7\n3 3 5 0 0 3 1\n', '8\n2 4 1 7 5 3 6 8\n', () => `600\n${row(ints(5, 600, 0, 10000))}\n`],
    reference: R`import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    prices = list(map(int, data[1:1 + n]))
    low = prices[0]
    best = 0
    for p in prices:
        low = min(low, p)
        best = max(best, p - low)
    print(best)

main()
`,
  },
  {
    id: 'max-subarray',
    type: 'code',
    topic: 'arrays',
    difficulty: 'medium',
    title: 'Maximum Subarray',
    statement:
      'Find the contiguous run of numbers (at least one number) with the largest sum, and print that sum. A run of one number counts.',
    inputFormat: 'Line 1: n. Line 2: n integers.',
    outputFormat: 'One integer: the largest sum.',
    constraints: '1 ≤ n ≤ 5000, |value| ≤ 10000.',
    samples: [
      { input: '9\n-2 1 -3 4 -1 2 1 -5 4\n', output: '6' },
      { input: '1\n1\n', output: '1' },
    ],
    hidden: ['1\n-1\n', '5\n5 4 -1 7 8\n', '3\n-3 -2 -5\n', '6\n-2 -3 4 -1 -2 1\n', '4\n0 0 0 0\n', () => `800\n${row(ints(9, 800, -50, 50))}\n`],
    reference: R`import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    nums = list(map(int, data[1:1 + n]))
    best = cur = nums[0]
    for x in nums[1:]:
        cur = max(x, cur + x)
        best = max(best, cur)
    print(best)

main()
`,
  },
  {
    id: 'product-except-self',
    type: 'code',
    topic: 'arrays',
    difficulty: 'medium',
    title: 'Product of Array Except Self',
    statement:
      'For every position i, print the product of all the numbers **except** the one at position i. Try to do it without dividing, so that zeros in the list are not a problem.',
    inputFormat: 'Line 1: n. Line 2: n integers.',
    outputFormat: 'n integers separated by spaces.',
    constraints: '2 ≤ n ≤ 20, |value| ≤ 10. Every answer fits in a 32-bit integer.',
    samples: [
      { input: '4\n1 2 3 4\n', output: '24 12 8 6' },
      { input: '5\n-1 1 0 -3 3\n', output: '0 0 9 0 0' },
    ],
    hidden: ['2\n5 7\n', '3\n0 0 2\n', '4\n2 2 2 2\n', '6\n1 -1 1 -1 1 -1\n', '5\n10 3 5 6 2\n', '3\n0 4 5\n'],
    reference: R`import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    nums = list(map(int, data[1:1 + n]))
    out = [1] * n
    left = 1
    for i in range(n):
        out[i] = left
        left *= nums[i]
    right = 1
    for i in range(n - 1, -1, -1):
        out[i] *= right
        right *= nums[i]
    print(*out)

main()
`,
  },
  {
    id: 'trapping-rain-water',
    type: 'code',
    topic: 'arrays',
    difficulty: 'hard',
    title: 'Trapping Rain Water',
    statement:
      'The numbers are the heights of bars that are each 1 unit wide, standing side by side. After it rains, water collects in the gaps between taller bars. Print how many units of water are trapped.',
    inputFormat: 'Line 1: n. Line 2: n heights.',
    outputFormat: 'One integer: the units of water.',
    constraints: '1 ≤ n ≤ 20000, 0 ≤ height ≤ 100000. Aim for O(n).',
    samples: [
      { input: '12\n0 1 0 2 1 0 1 3 2 1 2 1\n', output: '6' },
      { input: '6\n4 2 0 3 2 5\n', output: '9' },
    ],
    hidden: ['1\n7\n', '3\n3 0 3\n', '5\n1 2 3 4 5\n', '5\n5 4 3 2 1\n', '7\n5 2 1 2 1 5 0\n', () => `3000\n${row(ints(13, 3000, 0, 1000))}\n`],
    reference: R`import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    h = list(map(int, data[1:1 + n]))
    lo, hi = 0, n - 1
    left_max = right_max = 0
    water = 0
    while lo < hi:
        if h[lo] < h[hi]:
            left_max = max(left_max, h[lo])
            water += left_max - h[lo]
            lo += 1
        else:
            right_max = max(right_max, h[hi])
            water += right_max - h[hi]
            hi -= 1
    print(water)

main()
`,
  },

  // ----------------------------------------------------------------- strings
  {
    id: 'valid-anagram',
    type: 'code',
    topic: 'strings',
    difficulty: 'easy',
    title: 'Valid Anagram',
    statement: 'Two words are anagrams when one can be rearranged into the other using every letter exactly once. Decide whether the two words are anagrams.',
    inputFormat: 'Line 1: the first word. Line 2: the second word. Lowercase letters only.',
    outputFormat: 'YES or NO.',
    constraints: '1 ≤ length ≤ 10000 for each word.',
    samples: [
      { input: 'anagram\nnagaram\n', output: 'YES' },
      { input: 'rat\ncar\n', output: 'NO' },
    ],
    hidden: ['a\nab\n', 'listen\nsilent\n', 'aacc\nccac\n', 'z\nz\n', 'abcdef\nabcdeg\n', () => `${letters(2, 4000, 4)}\n${letters(2, 4000, 4).split('').reverse().join('')}\n`],
    reference: R`import sys

def main():
    s, t = sys.stdin.read().split()
    print("YES" if sorted(s) == sorted(t) else "NO")

main()
`,
  },
  {
    id: 'common-prefix-length',
    type: 'code',
    topic: 'strings',
    difficulty: 'easy',
    title: 'Longest Common Prefix',
    statement: 'Given several words, find the longest beginning that **all** of them share, and print how long it is (0 when they share nothing).',
    inputFormat: 'Line 1: n. Line 2: n words separated by spaces.',
    outputFormat: 'One integer: the length of the common prefix.',
    constraints: '1 ≤ n ≤ 200, lowercase letters, 1 ≤ length ≤ 200.',
    samples: [
      { input: '3\nflower flow flight\n', output: '2' },
      { input: '3\ndog racecar car\n', output: '0' },
    ],
    hidden: ['1\nhello\n', '2\nsame same\n', '3\ninterview internet interval\n', '4\nab abc abcd a\n', '3\nx y z\n', '2\nprefix pre\n'],
    reference: R`import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    words = data[1:1 + n]
    k = 0
    while all(len(w) > k for w in words) and len({w[k] for w in words}) == 1:
        k += 1
    print(k)

main()
`,
  },
  {
    id: 'longest-substring-no-repeat',
    type: 'code',
    topic: 'strings',
    difficulty: 'medium',
    title: 'Longest Substring Without Repeating Characters',
    statement: 'Find the longest stretch of **consecutive** characters in the word in which no character appears twice. Print its length.',
    inputFormat: 'One line: a word of lowercase letters.',
    outputFormat: 'One integer.',
    constraints: '1 ≤ length ≤ 20000.',
    samples: [
      { input: 'abcabcbb\n', output: '3' },
      { input: 'pwwkew\n', output: '3' },
    ],
    hidden: ['bbbbb\n', 'a\n', 'abba\n', 'dvdf\n', 'tmmzuxt\n', () => `${letters(21, 6000, 12)}\n`],
    reference: R`import sys

def main():
    s = sys.stdin.read().split()[0]
    last = {}
    start = 0
    best = 0
    for i, ch in enumerate(s):
        if ch in last and last[ch] >= start:
            start = last[ch] + 1
        last[ch] = i
        best = max(best, i - start + 1)
    print(best)

main()
`,
  },
  {
    id: 'longest-palindrome-length',
    type: 'code',
    topic: 'strings',
    difficulty: 'medium',
    title: 'Longest Palindromic Substring',
    statement:
      'A palindrome reads the same forwards and backwards. Find the longest palindrome that appears **as a contiguous part** of the word, and print its length.',
    inputFormat: 'One line: a word of lowercase letters.',
    outputFormat: 'One integer.',
    constraints: '1 ≤ length ≤ 1000.',
    samples: [
      { input: 'babad\n', output: '3' },
      { input: 'cbbd\n', output: '2' },
    ],
    hidden: ['a\n', 'ac\n', 'racecar\n', 'forgeeksskeegfor\n', 'abcde\n', () => `${letters(31, 700, 3)}\n`],
    reference: R`import sys

def main():
    s = sys.stdin.read().split()[0]
    best = 1
    for c in range(len(s)):
        for lo, hi in ((c, c), (c, c + 1)):
            while lo >= 0 and hi < len(s) and s[lo] == s[hi]:
                lo -= 1
                hi += 1
            best = max(best, hi - lo - 1)
    print(best)

main()
`,
  },
  {
    id: 'minimum-window-substring',
    type: 'code',
    topic: 'strings',
    difficulty: 'hard',
    title: 'Minimum Window Substring',
    statement:
      'Find the shortest part of word `s` that contains **every** letter of word `t` (a letter that appears twice in `t` must appear at least twice in the part). Print that part. If several parts tie for shortest, print the leftmost. Print `-1` if there is no such part.',
    inputFormat: 'Line 1: s. Line 2: t. Letters only (upper and lower case differ).',
    outputFormat: 'The shortest window, or -1.',
    constraints: '1 ≤ |s|, |t| ≤ 20000. Aim for O(|s| + |t|).',
    samples: [
      { input: 'ADOBECODEBANC\nABC\n', output: 'BANC' },
      { input: 'a\naa\n', output: '-1' },
    ],
    hidden: ['a\na\n', 'ab\nb\n', 'aabdec\nabc\n', 'cabwefgewcwaefgcf\ncae\n', 'bba\nab\n', () => `${letters(41, 3000, 6)}\nabcdef\n`],
    reference: R`import sys
from collections import Counter

def main():
    s, t = sys.stdin.read().split()
    need = Counter(t)
    missing = len(t)
    best = None
    left = 0
    for right, ch in enumerate(s):
        if need[ch] > 0:
            missing -= 1
        need[ch] -= 1
        if missing == 0:
            while need[s[left]] < 0:
                need[s[left]] += 1
                left += 1
            if best is None or right - left < best[1] - best[0]:
                best = (left, right)
            need[s[left]] += 1
            missing += 1
            left += 1
    print(-1 if best is None else s[best[0]:best[1] + 1])

main()
`,
  },

  // ---------------------------------------------------------------- hashing
  {
    id: 'contains-duplicate',
    type: 'code',
    topic: 'hashing',
    difficulty: 'easy',
    title: 'Contains Duplicate',
    statement: 'Print YES if any value appears **at least twice** in the list, otherwise NO.',
    inputFormat: 'Line 1: n. Line 2: n integers.',
    outputFormat: 'YES or NO.',
    constraints: '1 ≤ n ≤ 100000.',
    samples: [
      { input: '4\n1 2 3 1\n', output: 'YES' },
      { input: '4\n1 2 3 4\n', output: 'NO' },
    ],
    hidden: ['1\n5\n', '2\n7 7\n', '5\n1 1 1 3 3\n', '6\n-1 -2 -3 -4 -5 -1\n', '6\n10 20 30 40 50 60\n', () => `5000\n${row(perm(17, 5000))}\n`],
    reference: R`import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    nums = data[1:1 + n]
    print("YES" if len(set(nums)) < len(nums) else "NO")

main()
`,
  },
  {
    id: 'first-unique-char',
    type: 'code',
    topic: 'hashing',
    difficulty: 'easy',
    title: 'First Unique Character',
    statement: 'Find the first character in the word that appears **exactly once**, and print its position (counting from 0). Print -1 if every character repeats.',
    inputFormat: 'One line: a word of lowercase letters.',
    outputFormat: 'One integer.',
    constraints: '1 ≤ length ≤ 100000.',
    samples: [
      { input: 'leetcode\n', output: '0' },
      { input: 'loveleetcode\n', output: '2' },
    ],
    hidden: ['aabb\n', 'z\n', 'aabbc\n', 'abcabcd\n', 'xxyyzzw\n', () => `${letters(51, 4000, 5)}\n`],
    reference: R`import sys
from collections import Counter

def main():
    s = sys.stdin.read().split()[0]
    count = Counter(s)
    for i, ch in enumerate(s):
        if count[ch] == 1:
            print(i)
            return
    print(-1)

main()
`,
  },
  {
    id: 'subarray-sum-k',
    type: 'code',
    topic: 'hashing',
    difficulty: 'medium',
    title: 'Subarray Sum Equals K',
    statement: 'Count the contiguous runs of the list whose sum is exactly `k`. Values can be negative, so a sliding window will not work.',
    inputFormat: 'Line 1: n and k. Line 2: n integers.',
    outputFormat: 'One integer: how many runs.',
    constraints: '1 ≤ n ≤ 20000, |value| ≤ 1000.',
    samples: [
      { input: '3 2\n1 1 1\n', output: '2' },
      { input: '3 3\n1 2 3\n', output: '2' },
    ],
    hidden: ['5 0\n1 -1 0 1 -1\n', '1 5\n5\n', '4 0\n0 0 0 0\n', '6 7\n3 4 7 2 -3 1\n', '3 100\n1 2 3\n', () => `1500 10\n${row(ints(61, 1500, -5, 8))}\n`],
    reference: R`import sys
from collections import defaultdict

def main():
    data = sys.stdin.read().split()
    n, k = int(data[0]), int(data[1])
    nums = list(map(int, data[2:2 + n]))
    seen = defaultdict(int)
    seen[0] = 1
    total = 0
    count = 0
    for x in nums:
        total += x
        count += seen[total - k]
        seen[total] += 1
    print(count)

main()
`,
  },
  {
    id: 'longest-consecutive',
    type: 'code',
    topic: 'hashing',
    difficulty: 'medium',
    title: 'Longest Consecutive Sequence',
    statement:
      'Find the longest run of values that are consecutive integers (like 4, 5, 6, 7), no matter where they sit in the list or in what order. Print the length of that run. Duplicates count once. Aim for O(n).',
    inputFormat: 'Line 1: n. Line 2: n integers.',
    outputFormat: 'One integer.',
    constraints: '1 ≤ n ≤ 100000.',
    samples: [
      { input: '6\n100 4 200 1 3 2\n', output: '4' },
      { input: '10\n0 3 7 2 5 8 4 6 0 1\n', output: '9' },
    ],
    hidden: ['1\n42\n', '3\n5 5 5\n', '5\n-2 -1 0 10 11\n', '7\n9 1 4 7 3 -1 0\n', '4\n1000000000 999999999 -1000000000 5\n', () => `3000\n${row(perm(71, 3000).map((x) => x * 2 - (x % 7 === 0 ? 1 : 0)))}\n`],
    reference: R`import sys

def main():
    data = sys.stdin.read().split()
    n = int(data[0])
    nums = set(map(int, data[1:1 + n]))
    best = 0
    for x in nums:
        if x - 1 not in nums:
            y = x
            while y + 1 in nums:
                y += 1
            best = max(best, y - x + 1)
    print(best)

main()
`,
  },
  {
    id: 'substring-k-distinct',
    type: 'code',
    topic: 'hashing',
    difficulty: 'hard',
    title: 'Longest Substring with At Most K Distinct Characters',
    statement:
      'Find the longest **contiguous** part of the word that contains at most `k` different characters, and print its length.',
    inputFormat: 'Line 1: k. Line 2: a word of lowercase letters.',
    outputFormat: 'One integer.',
    constraints: '1 ≤ k ≤ 26, 1 ≤ length ≤ 50000.',
    samples: [
      { input: '2\neceba\n', output: '3' },
      { input: '1\naa\n', output: '2' },
    ],
    hidden: ['3\nabcabcabc\n', '1\nabcd\n', '26\nhello\n', '2\naabbccdd\n', '3\nabaccc\n', () => `4\n${letters(81, 5000, 9)}\n`],
    reference: R`import sys
from collections import defaultdict

def main():
    data = sys.stdin.read().split()
    k, s = int(data[0]), data[1]
    count = defaultdict(int)
    left = 0
    best = 0
    for right, ch in enumerate(s):
        count[ch] += 1
        while len(count) > k:
            count[s[left]] -= 1
            if count[s[left]] == 0:
                del count[s[left]]
            left += 1
        best = max(best, right - left + 1)
    print(best)

main()
`,
  },
];
