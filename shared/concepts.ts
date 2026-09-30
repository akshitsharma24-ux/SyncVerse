/**
 * Concept taxonomy and the error -> concept mapping. ONE list used by every lane:
 *   Lane C tags explanations with these slugs, Lane D's progress view groups evidence by them, Lane B can tag runs.
 * Change rules: additive only (new slugs are fine; never rename one).
 */
import type { RunStatus } from './types';

export interface Concept {
  slug: string;
  name: string;
  meaning: string;
}

export const CONCEPTS: Concept[] = [
  { slug: 'syntax-basics', name: 'Syntax basics', meaning: 'colons, brackets, semicolons' },
  { slug: 'variables-types', name: 'Variables and types', meaning: 'names, values, numbers vs text' },
  { slug: 'input-output', name: 'Input and output', meaning: 'reading input, printing' },
  { slug: 'conditionals', name: 'Conditionals', meaning: 'if / else, guarding against bad cases' },
  { slug: 'loops', name: 'Loops', meaning: 'for / while, when a loop stops' },
  { slug: 'loop-boundaries', name: 'Loop boundaries', meaning: 'off-by-one, where a range ends' },
  { slug: 'functions-params', name: 'Functions and parameters', meaning: 'defining and calling functions' },
  { slug: 'return-values', name: 'Return values', meaning: 'what a function gives back' },
  { slug: 'scope', name: 'Scope', meaning: 'local vs global names' },
  { slug: 'recursion', name: 'Recursion', meaning: 'base case, the call stack' },
  { slug: 'lists-arrays', name: 'Lists and arrays', meaning: 'indexing, length' },
  { slug: 'list-mutation-aliasing', name: 'List mutation and aliasing', meaning: 'two names, one list' },
  { slug: 'strings', name: 'Strings', meaning: 'text, slicing' },
  { slug: 'dictionaries-maps', name: 'Dictionaries', meaning: 'key / value lookups' },
  { slug: 'exceptions-errors', name: 'Exceptions and errors', meaning: 'reading and handling errors' },
  { slug: 'classes-objects', name: 'Classes and objects', meaning: 'OOP basics, attributes' },
  { slug: 'pointers-memory', name: 'Pointers and memory', meaning: 'C and C++ memory' },
  { slug: 'compilation-linking', name: 'Compilation', meaning: 'C, C++, Java build errors' },
  { slug: 'complexity-efficiency', name: 'Complexity', meaning: 'nested loops, cost of a solution' },
  { slug: 'debugging-strategy', name: 'Debugging strategy', meaning: 'reproduce, isolate, fix' },
];

export const CONCEPT_SLUGS: string[] = CONCEPTS.map((c) => c.slug);

export function conceptName(slug: string): string {
  return CONCEPTS.find((c) => c.slug === slug)?.name ?? slug;
}

/**
 * The "category" stored on a LearningEvent and shown as an error label:
 * the Python exception name for a failed run (IndexError, NameError, ...), otherwise the run status
 * ('timeout', 'compile_error', 'memory_limit', 'service_error'), or 'success'.
 */
export function errorCategory(status: RunStatus, stderr = ''): string {
  if (status === 'success') return 'success';
  if (status === 'runtime_error' || status === 'compile_error') {
    const last = stderr
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .pop();
    const m = last?.match(/^([A-Za-z_][A-Za-z0-9_.]*(?:Error|Exception|Exit|Interrupt)):/);
    if (m) return m[1].split('.').pop()!;
  }
  return status;
}

const BY_ERROR: Record<string, string[]> = {
  IndexError: ['lists-arrays', 'loop-boundaries'],
  NameError: ['variables-types'],
  UnboundLocalError: ['scope', 'variables-types'],
  TypeError: ['variables-types'],
  ValueError: ['variables-types', 'input-output'],
  ZeroDivisionError: ['conditionals'],
  KeyError: ['dictionaries-maps'],
  AttributeError: ['classes-objects'],
  SyntaxError: ['syntax-basics'],
  IndentationError: ['syntax-basics'],
  RecursionError: ['recursion'],
  ModuleNotFoundError: ['exceptions-errors'],
  timeout: ['loops', 'complexity-efficiency'],
  memory_limit: ['complexity-efficiency'],
  compile_error: ['syntax-basics', 'compilation-linking'],
};

/** Concepts a learner practised (or struggled with) when a run ended in this category. [] for success. */
export function conceptsForCategory(category: string): string[] {
  if (category === 'success' || category === 'service_error') return [];
  return BY_ERROR[category] ?? ['exceptions-errors'];
}

/**
 * Rule for the progress page's "Retry recommended" observation (Lane D, P-D2):
 * a concept is flagged when the learner has at least `repeatFailures` failed runs of the SAME category
 * among their last `windowRuns` runs AND their latest run is not a success.
 */
export const OBSERVATION_RULE = { windowRuns: 10, repeatFailures: 3 } as const;
