/** Multiple-choice questions, six per topic (two easy, two medium, two hard). `answer` is the index of the right option. */
import type { McqQuestion } from './types';

type Row = Omit<McqQuestion, 'type'>;
const q = (r: Row): McqQuestion => ({ ...r, type: 'mcq' });

/**
 * The questions below are written in whatever order is natural; this puts the right answer in A, B, C and D equally often
 * (question k gets slot k mod 4) and mixes the wrong ones, so nobody can win by guessing a pattern.
 */
function balanced(all: McqQuestion[]): McqQuestion[] {
  return all.map((m, k) => {
    const right = m.options[m.answer];
    const wrong = m.options.filter((_, i) => i !== m.answer);
    const turn = (k * 7 + m.id.length) % 3;
    const mixed = [...wrong.slice(turn), ...wrong.slice(0, turn)];
    const slot = (k % 4) as 0 | 1 | 2 | 3;
    const options = [...mixed.slice(0, slot), right, ...mixed.slice(slot)] as McqQuestion['options'];
    return { ...m, options, answer: slot };
  });
}

export const MCQS: McqQuestion[] = balanced([
  // ------------------------------------------------------------------ arrays
  q({
    id: 'arrays-1', topic: 'arrays', difficulty: 'easy', title: 'Reading one item',
    prompt: 'How long does it take to read `arr[i]` from an array of n items when you know i?',
    options: ['O(n)', 'O(log n)', 'O(1)', 'O(n²)'], answer: 2,
    explanation: 'An array is one block of memory, so the address of item i is computed directly: start + i × size. The cost does not depend on n.',
  }),
  q({
    id: 'arrays-2', topic: 'arrays', difficulty: 'easy', title: 'The slow end',
    prompt: 'Which operation on a dynamic array (a Python list or a Java ArrayList) is O(n) in the worst case?',
    options: ['Appending at the end', 'Inserting at the front', 'Reading by index', 'Asking for its length'], answer: 1,
    explanation: 'Inserting at the front shifts every existing item one place to the right. Append is O(1) on average, indexing and length are O(1).',
  }),
  q({
    id: 'arrays-3', topic: 'arrays', difficulty: 'medium', title: 'Telescoping loop',
    prompt: 'What does this print?\n```\nnums = [2, 7, 11, 15]\ntotal = 0\nfor i in range(1, len(nums)):\n    total += nums[i] - nums[i - 1]\nprint(total)\n```',
    options: ['9', '13', '28', '35'], answer: 1,
    explanation: 'The differences are 5, 4 and 4. They cancel out like a telescope: the sum is the last value minus the first, 15 - 2 = 13.',
  }),
  q({
    id: 'arrays-4', topic: 'arrays', difficulty: 'medium', title: 'Range sums with prefix sums',
    prompt: 'Let `prefix[i]` be the sum of the first i items (so `prefix[0] = 0`). What is the sum of the items at positions l to r, both included?',
    options: ['prefix[r] - prefix[l]', 'prefix[r + 1] - prefix[l]', 'prefix[r] - prefix[l - 1]', 'prefix[r + 1] - prefix[l + 1]'], answer: 1,
    explanation: 'prefix[r + 1] holds items 0..r and prefix[l] holds items 0..l-1. Subtracting leaves exactly items l..r.',
  }),
  q({
    id: 'arrays-5', topic: 'arrays', difficulty: 'hard', title: 'Kadane by hand',
    prompt: 'What is the largest sum of a contiguous run in `[-2, 1, -3, 4, -1, 2, 1, -5, 4]`?',
    options: ['5', '6', '7', '4'], answer: 1,
    explanation: 'The run 4, -1, 2, 1 adds up to 6. Kadane\'s algorithm finds it in one pass by keeping the best sum of a run that ends at the current item.',
  }),
  q({
    id: 'arrays-6', topic: 'arrays', difficulty: 'hard', title: 'The duplicate in 1..n',
    prompt: 'An array holds n + 1 integers, each between 1 and n, so at least one value repeats. Which approach finds a repeated value in O(n) time and O(1) extra space **without changing** the array?',
    options: ['Sort it and compare neighbours', 'Put everything in a hash set', 'Treat values as pointers and use Floyd\'s cycle detection', 'Compare every pair with two loops'], answer: 2,
    explanation: 'Reading the array as "index → value" makes a linked structure that must contain a cycle; the cycle entrance is the duplicate. Sorting changes the array, a hash set uses O(n) space and two loops take O(n²).',
  }),

  // ----------------------------------------------------------------- strings
  q({
    id: 'strings-1', topic: 'strings', difficulty: 'easy', title: 'Counting substrings',
    prompt: 'How many non-empty contiguous substrings does a string of length 4 have (counting repeats by position)?',
    options: ['4', '8', '10', '16'], answer: 2,
    explanation: 'There are 4 of length 1, 3 of length 2, 2 of length 3 and 1 of length 4: 4 + 3 + 2 + 1 = 10, which is n(n+1)/2.',
  }),
  q({
    id: 'strings-2', topic: 'strings', difficulty: 'easy', title: 'Spot the palindrome',
    prompt: 'A palindrome reads the same forwards and backwards. Which of these is one?',
    options: ['lever', 'revel', 'level', 'levee'], answer: 2,
    explanation: '"level" reversed is "level". "lever" reversed is "revel", and "levee" reversed is "eevel".',
  }),
  q({
    id: 'strings-3', topic: 'strings', difficulty: 'medium', title: 'Anagram check in O(n)',
    prompt: 'Two lowercase words have length n. Which method decides whether they are anagrams in **O(n)** time?',
    options: ['Sort both and compare', 'Count each letter with an array of 26 counters', 'Compare their first letters', 'Compare their lengths only'], answer: 1,
    explanation: 'Add 1 for each letter of the first word and subtract 1 for each letter of the second; they are anagrams when all 26 counters end at 0. Sorting costs O(n log n).',
  }),
  q({
    id: 'strings-4', topic: 'strings', difficulty: 'medium', title: 'Window without repeats',
    prompt: 'In the sliding-window solution for "longest substring without repeating characters", the new character is already inside the window. What do you do?',
    options: ['Move the left edge just past the earlier copy', 'Start over from the beginning of the string', 'Move the right edge back by one', 'Clear the window and keep only the new character'], answer: 0,
    explanation: 'Only the part of the window up to and including the earlier copy has to go. Moving the left edge past it keeps the window valid without losing work.',
  }),
  q({
    id: 'strings-5', topic: 'strings', difficulty: 'hard', title: 'Expand around the centre',
    prompt: 'The usual "expand around each centre" method finds the longest palindromic substring of a string of length n in...',
    options: ['O(n)', 'O(n log n)', 'O(n²)', 'O(2ⁿ)'], answer: 2,
    explanation: 'There are 2n - 1 centres and each expansion can walk up to n/2 steps, so O(n²) in the worst case. (Manacher\'s algorithm reaches O(n) with extra bookkeeping.)',
  }),
  q({
    id: 'strings-6', topic: 'strings', difficulty: 'hard', title: 'Why KMP is fast',
    prompt: 'Knuth–Morris–Pratt uses a prefix (failure) table so the search never re-reads text characters. Finding a pattern of length m in a text of length n takes...',
    options: ['O(n · m)', 'O(n + m)', 'O(n log m)', 'O(m²)'], answer: 1,
    explanation: 'Building the table costs O(m) and the scan moves forward through the text once, O(n), because a mismatch only moves the pattern, never the text pointer back.',
  }),

  // ----------------------------------------------------------------- hashing
  q({
    id: 'hashing-1', topic: 'hashing', difficulty: 'easy', title: 'Looking a key up',
    prompt: 'What is the average time to look a key up in a hash map?',
    options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'], answer: 0,
    explanation: 'The key is hashed to a bucket number and the bucket is checked directly. Collisions are rare enough that the average stays constant.',
  }),
  q({
    id: 'hashing-2', topic: 'hashing', difficulty: 'easy', title: 'Right tool',
    prompt: 'Which task is the best fit for a hash **set**?',
    options: ['Finding the median of a list', 'Checking whether a list has a duplicate', 'Sorting a list', 'Finding the largest value'], answer: 1,
    explanation: 'Add items one by one; if an item is already in the set you have found a duplicate. Each check is O(1), so the whole scan is O(n).',
  }),
  q({
    id: 'hashing-3', topic: 'hashing', difficulty: 'medium', title: 'Two Sum with a map',
    prompt: 'Solving Two Sum with a hash map, for each number `x` you look in the map for...',
    options: ['x × 2', 'target + x', 'target - x', 'target ÷ x'], answer: 2,
    explanation: 'If an earlier number equals target - x, then that number plus x makes the target. The map answers "have I seen it?" in O(1).',
  }),
  q({
    id: 'hashing-4', topic: 'hashing', difficulty: 'medium', title: 'One crowded bucket',
    prompt: 'What happens to a hash map whose keys all land in the same bucket?',
    options: ['It refuses new keys', 'Lookups slow down to O(n)', 'Nothing, it stays O(1)', 'It sorts the keys by itself'], answer: 1,
    explanation: 'The bucket becomes one long chain that must be searched item by item. A good hash function spreads keys evenly to avoid this.',
  }),
  q({
    id: 'hashing-5', topic: 'hashing', difficulty: 'hard', title: 'Prefix sums and k',
    prompt: 'To count subarrays with sum k, you keep a map of prefix sums seen so far. At position i with running sum `s`, how many subarrays ending at i have sum k?',
    options: ['The number of earlier prefix sums equal to s + k', 'The number of earlier prefix sums equal to s - k', 'Always 1 if s equals k', 'The number of earlier prefix sums equal to k'], answer: 1,
    explanation: 'A subarray from j+1 to i has sum s - prefix[j]. It equals k exactly when prefix[j] = s - k.',
  }),
  q({
    id: 'hashing-6', topic: 'hashing', difficulty: 'hard', title: 'Unhashable key',
    prompt: 'In Python, which of these CANNOT be used as a dictionary key?',
    options: ['A tuple of numbers', 'A string', 'A list', 'An integer'], answer: 2,
    explanation: 'Keys must be hashable, which means immutable. A list can change after it is stored, so its hash could change and the lookup would break. Use a tuple instead.',
  }),

  // ------------------------------------------------------------------ stacks
  q({
    id: 'stacks-1', topic: 'stacks', difficulty: 'easy', title: 'Last in, first out',
    prompt: 'Which data structure removes the item that was added **most recently**?',
    options: ['Queue', 'Stack', 'Hash set', 'Sorted array'], answer: 1,
    explanation: 'A stack is LIFO: last in, first out. Think of a pile of plates.',
  }),
  q({
    id: 'stacks-2', topic: 'stacks', difficulty: 'easy', title: 'First in, first out',
    prompt: 'You enqueue 1, 2, 3 and then dequeue once. Which value comes out?',
    options: ['3', '2', '1', 'It depends'], answer: 2,
    explanation: 'A queue is FIFO: the first item added is the first one removed.',
  }),
  q({
    id: 'stacks-3', topic: 'stacks', difficulty: 'medium', title: 'Push and pop',
    prompt: 'Starting with an empty stack: push 1, push 2, pop, push 3, pop. What does the stack contain now (bottom to top)?',
    options: ['[1]', '[2]', '[1, 3]', '[3]'], answer: 0,
    explanation: 'After push 1, push 2: [1, 2]. pop removes 2: [1]. push 3: [1, 3]. pop removes 3: [1].',
  }),
  q({
    id: 'stacks-4', topic: 'stacks', difficulty: 'medium', title: 'Balanced brackets',
    prompt: 'To check that `({[]})` is balanced with a stack, what do you do on each closing bracket?',
    options: ['Push it', 'Pop and check that it matches', 'Clear the stack', 'Count it'], answer: 1,
    explanation: 'Opening brackets are pushed. A closing bracket must match the most recent unmatched opening bracket, which is the top of the stack.',
  }),
  q({
    id: 'stacks-5', topic: 'stacks', difficulty: 'hard', title: 'Monotonic stack cost',
    prompt: 'A "next greater element" solution keeps a stack of decreasing values. Each item is pushed once and popped at most once. The total time is...',
    options: ['O(n)', 'O(n log n)', 'O(n²)', 'O(log n)'], answer: 0,
    explanation: 'The inner while-loop looks like a second loop, but pops can never exceed pushes, so the total work over the whole scan is O(n).',
  }),
  q({
    id: 'stacks-6', topic: 'stacks', difficulty: 'hard', title: 'Sliding window maximum',
    prompt: 'Which structure gives the maximum of every window of size k in O(n) total time?',
    options: ['A max-heap', 'A stack of values', 'A deque of indices kept in decreasing order of value', 'A sorted list that is re-sorted'], answer: 2,
    explanation: 'The front of the deque is always the largest value in the window. Smaller values behind a larger newcomer can never be a maximum, so they are dropped. A heap costs O(n log n).',
  }),

  // ------------------------------------------------------------------ search
  q({
    id: 'search-1', topic: 'search', difficulty: 'easy', title: 'What binary search needs',
    prompt: 'Binary search only works when the data is...',
    options: ['Stored in a linked list', 'Sorted', 'All different', 'Made of numbers'], answer: 1,
    explanation: 'Each step throws away half the range by comparing with the middle item. That is only valid when the order is known.',
  }),
  q({
    id: 'search-2', topic: 'search', difficulty: 'easy', title: 'How many halvings',
    prompt: 'Roughly how many comparisons does binary search need, at most, for 1000 sorted items?',
    options: ['10', '100', '500', '1000'], answer: 0,
    explanation: 'Each step halves the range: 1000 → 500 → 250 → ... → 1 takes about log₂(1000) ≈ 10 steps.',
  }),
  q({
    id: 'search-3', topic: 'search', difficulty: 'medium', title: 'A stable fast sort',
    prompt: 'Which sort is **stable** and runs in O(n log n) even in the worst case?',
    options: ['Quick sort', 'Heap sort', 'Selection sort', 'Merge sort'], answer: 3,
    explanation: 'Merge sort keeps equal items in their original order and always splits in half. Quick sort can degrade to O(n²), heap sort is not stable and selection sort is O(n²).',
  }),
  q({
    id: 'search-4', topic: 'search', difficulty: 'medium', title: 'Lower bound loop',
    prompt: 'Find the first position whose value is at least x in a sorted array:\n```\nlo, hi = 0, n\nwhile lo < hi:\n    mid = (lo + hi) // 2\n    if a[mid] >= x:\n        hi = mid\n    else:\n        lo = mid + 1\n```\nWhen the loop ends, the answer is...',
    options: ['mid', 'lo (which equals hi)', 'lo - 1', 'hi + 1'], answer: 1,
    explanation: 'The loop keeps the invariant "the answer is in [lo, hi]" and stops when the range has one point, so lo == hi is the first position with a[pos] >= x (or n when there is none).',
  }),
  q({
    id: 'search-5', topic: 'search', difficulty: 'hard', title: 'Search on the answer',
    prompt: 'In "Koko Eating Bananas" you binary search the eating speed k. Why is that valid?',
    options: ['The piles are sorted', 'If speed k is enough, any faster speed is enough too', 'The answer is always a power of two', 'Speeds must be tried from the largest down'], answer: 1,
    explanation: 'Feasibility is monotonic: once a speed finishes in time, all larger speeds do. Binary search needs exactly that property, not a sorted input.',
  }),
  q({
    id: 'search-6', topic: 'search', difficulty: 'hard', title: 'Quick sort, bad pivot',
    prompt: 'Quick sort always uses the first element as the pivot. How long does it take on an array that is **already sorted**?',
    options: ['O(n)', 'O(n log n)', 'O(n²)', 'O(log n)'], answer: 2,
    explanation: 'The pivot is the smallest item every time, so each partition peels off just one element: n + (n-1) + ... = O(n²). Random or median pivots avoid this.',
  }),

  // --------------------------------------------------------------- recursion
  q({
    id: 'recursion-1', topic: 'recursion', difficulty: 'easy', title: 'The one thing a recursion needs',
    prompt: 'Every recursive function needs...',
    options: ['A loop', 'A global variable', 'A base case', 'A second function'], answer: 2,
    explanation: 'The base case stops the calls. Without it the function calls itself until the stack overflows.',
  }),
  q({
    id: 'recursion-2', topic: 'recursion', difficulty: 'easy', title: 'Factorial trace',
    prompt: 'What does `f(4)` return?\n```\ndef f(n):\n    return 1 if n <= 1 else n * f(n - 1)\n```',
    options: ['10', '24', '16', '12'], answer: 1,
    explanation: 'f(4) = 4 × f(3) = 4 × 3 × f(2) = 4 × 3 × 2 × f(1) = 24.',
  }),
  q({
    id: 'recursion-3', topic: 'recursion', difficulty: 'medium', title: 'Calls in naive Fibonacci',
    prompt: '`fib(n)` returns n for n < 2 and `fib(n-1) + fib(n-2)` otherwise. How many function calls does `fib(5)` make, counting the first one?',
    options: ['5', '9', '15', '25'], answer: 2,
    explanation: 'Calls(n) = 1 + Calls(n-1) + Calls(n-2) with Calls(0) = Calls(1) = 1: 1, 1, 3, 5, 9, 15. The same subproblems are solved again and again, which is why memoization helps.',
  }),
  q({
    id: 'recursion-4', topic: 'recursion', difficulty: 'medium', title: 'Counting subsets',
    prompt: 'How many subsets (including the empty one) does a set of 5 different items have?',
    options: ['10', '25', '32', '120'], answer: 2,
    explanation: 'Each item is either in or out: 2 choices five times, 2⁵ = 32. (120 is the number of orderings, 5!.)',
  }),
  q({
    id: 'recursion-5', topic: 'recursion', difficulty: 'hard', title: 'Permutation tree',
    prompt: 'A backtracking solution builds every permutation of n different items. How many leaves does its recursion tree have?',
    options: ['2ⁿ', 'n!', 'nⁿ', 'n²'], answer: 1,
    explanation: 'There are n choices for the first slot, n-1 for the second and so on: n × (n-1) × ... × 1 = n!.',
  }),
  q({
    id: 'recursion-6', topic: 'recursion', difficulty: 'hard', title: 'Too deep',
    prompt: 'In standard CPython the recursion limit is about 1000 frames. What happens if a function recurses 100 000 levels deep?',
    options: ['It runs, just slower', 'Python raises RecursionError', 'The recursion becomes a loop automatically', 'The program freezes silently'], answer: 1,
    explanation: 'Python does not optimize tail calls and protects itself with a depth limit. Convert deep recursion to a loop or an explicit stack.',
  }),

  // ---------------------------------------------------------------------- dp
  q({
    id: 'dp-1', topic: 'dp', difficulty: 'easy', title: 'When DP applies',
    prompt: 'Dynamic programming fits a problem that has overlapping subproblems and...',
    options: ['A sorted input', 'Optimal substructure', 'Only positive numbers', 'A graph'], answer: 1,
    explanation: 'Optimal substructure means the best answer is built from best answers to smaller pieces; overlapping subproblems mean those pieces repeat, so we store them.',
  }),
  q({
    id: 'dp-2', topic: 'dp', difficulty: 'easy', title: 'Stairs',
    prompt: 'ways(n) = ways(n-1) + ways(n-2) with ways(1) = 1 and ways(2) = 2. What is ways(5)?',
    options: ['5', '7', '8', '13'], answer: 2,
    explanation: 'ways(3) = 3, ways(4) = 5, ways(5) = 8.',
  }),
  q({
    id: 'dp-3', topic: 'dp', difficulty: 'medium', title: 'Greedy fails',
    prompt: 'With coins {1, 3, 4}, what is the fewest coins that make 6?',
    options: ['2', '3', '4', '6'], answer: 0,
    explanation: '3 + 3 uses two coins. Greedy would take 4 first and then 1 + 1, which is three coins, so greedy is not always optimal.',
  }),
  q({
    id: 'dp-4', topic: 'dp', difficulty: 'medium', title: 'Table size',
    prompt: 'The classic DP for the longest common subsequence of strings with lengths m and n fills a table. Its time is...',
    options: ['O(m + n)', 'O(m · n)', 'O(2^(m+n))', 'O(m log n)'], answer: 1,
    explanation: 'There is one cell for every pair (i, j) of prefixes and each cell takes constant time: m × n cells.',
  }),
  q({
    id: 'dp-5', topic: 'dp', difficulty: 'hard', title: 'Backwards inner loop',
    prompt: 'In 0/1 knapsack with a single array `dp[0..W]`, why does the inner loop over capacity go from high to low?',
    options: ['To save memory', 'So each item is used at most once', 'To sort the items', 'It makes no difference'], answer: 1,
    explanation: 'Going downwards, dp[c - w] still holds the value from before this item was considered. Going upwards would reuse the item several times (unbounded knapsack).',
  }),
  q({
    id: 'dp-6', topic: 'dp', difficulty: 'hard', title: 'Edit distance',
    prompt: 'What is the edit distance (insert, delete, replace) between "kitten" and "sitting"?',
    options: ['2', '3', '4', '5'], answer: 1,
    explanation: 'kitten → sitten (replace k with s) → sittin (replace e with i) → sitting (insert g): 3 steps.',
  }),

  // ------------------------------------------------------------------ graphs
  q({
    id: 'graphs-1', topic: 'graphs', difficulty: 'easy', title: 'BFS and queues',
    prompt: 'Breadth-first search explores a graph with the help of a...',
    options: ['Stack', 'Queue', 'Heap', 'Hash set only'], answer: 1,
    explanation: 'A queue visits vertices in the order they were discovered, so nearer vertices are processed before farther ones.',
  }),
  q({
    id: 'graphs-2', topic: 'graphs', difficulty: 'easy', title: 'Edges of a tree',
    prompt: 'An undirected tree has 5 vertices. How many edges does it have?',
    options: ['3', '4', '5', '10'], answer: 1,
    explanation: 'A tree with n vertices is connected with no cycles and always has n - 1 edges.',
  }),
  q({
    id: 'graphs-3', topic: 'graphs', difficulty: 'medium', title: 'Shortest in steps',
    prompt: 'To find the path with the fewest edges from a source in an **unweighted** graph, use...',
    options: ['Depth-first search', 'Breadth-first search', 'Binary search', 'Merge sort'], answer: 1,
    explanation: 'BFS reaches every vertex by a path with the fewest edges first. DFS may find a much longer path.',
  }),
  q({
    id: 'graphs-4', topic: 'graphs', difficulty: 'medium', title: 'Adjacency list memory',
    prompt: 'A graph has V vertices and E edges. How much memory does an adjacency list use?',
    options: ['O(V)', 'O(E)', 'O(V + E)', 'O(V²)'], answer: 2,
    explanation: 'One list per vertex (V) plus one entry per edge end (E, or 2E for undirected). An adjacency matrix needs V².',
  }),
  q({
    id: 'graphs-5', topic: 'graphs', difficulty: 'hard', title: 'Dijkstra cost',
    prompt: 'Dijkstra\'s algorithm with a binary heap on V vertices and E edges (non-negative weights) runs in...',
    options: ['O(V + E)', 'O((V + E) log V)', 'O(V · E)', 'O(V³)'], answer: 1,
    explanation: 'Each edge may push one entry onto the heap and each heap operation costs O(log V).',
  }),
  q({
    id: 'graphs-6', topic: 'graphs', difficulty: 'hard', title: 'Cycle check with Kahn',
    prompt: 'You run Kahn\'s algorithm (repeatedly remove vertices with no incoming edges). The directed graph has a cycle when...',
    options: ['The queue starts empty only for trees', 'Fewer than V vertices were removed in the end', 'More than V vertices were removed', 'Some vertex has two outgoing edges'], answer: 1,
    explanation: 'Vertices on a cycle never reach in-degree 0, so they are never removed. If all V are removed, an order exists and there is no cycle.',
  }),
]);
