/**
 * Rule-based hints for the optional "Guide me with hints" ladder: a conceptual nudge, then a guiding question, written from the error
 * alone. They work with no AI key and when the AI provider is down; when the AI answers, its own (more specific) hints are used.
 * Neither rung gives the fix away: the fix is the third rung, shown only when the learner asks for it.
 */
import type { ExplanationHints } from '@syncverse/shared';

interface Rule {
  match: RegExp;
  hints: (where: string, text: string) => ExplanationHints;
}

const RULES: Rule[] = [
  {
    match: /IndexError|ArrayIndexOutOfBounds|IndexOutOfBounds|StringIndexOutOfBounds|out_of_range|list index out of range|index out of range/i,
    hints: (where) => ({
      nudge: 'The program asked for a position that does not exist in the list or array. Positions start at 0, so a collection of n items ends at position n - 1.',
      question: `On ${where}, what is the largest position the code can ask for, and how many items are there? Is that position inside 0 to n - 1?`,
    }),
  },
  {
    match: /EOFError|NoSuchElementException|End of file|EOF when reading/i,
    hints: (where) => ({
      nudge: 'The program tried to read more input than it was given.',
      question: `How many values does the program read on ${where} (and in the loop around it), and how many did you type into the Input box before pressing Run?`,
    }),
  },
  {
    match: /KeyError|key not found/i,
    hints: (where) => ({
      nudge: 'The program looked up a key that is not stored in the dictionary or map.',
      question: `Which key does ${where} look up, and where in your program is it added? Print the dictionary just before that line to see what it really holds.`,
    }),
  },
  {
    match: /NameError|ReferenceError|is not defined|cannot find symbol|undeclared|not declared/i,
    hints: (where) => ({
      nudge: 'The program uses a name that does not exist yet at that point: it was never created, is spelled differently, or is created later.',
      question: `Compare the name on ${where} with the place where you create it. Is it spelled the same, letter for letter and capital for capital, and is it created before this line runs?`,
    }),
  },
  {
    match: /Cannot read propert(?:y|ies) of (?:undefined|null)|Cannot set propert(?:y|ies) of (?:undefined|null)|NullPointerException|NoneType|null pointer/i,
    hints: (where) => ({
      nudge: 'A variable held nothing (undefined, null or None) at the moment the code tried to use it as if it held a real value.',
      question: `Which variable on ${where} could be empty? Print it just before that line, and trace back to where it should have been given a value (or whether a loop or lookup ran past the end).`,
    }),
  },
  {
    match: /ZeroDivision|ArithmeticException|division by zero|\/ by zero|Floating point exception|ArithmeticError/i,
    hints: (where) => ({
      nudge: 'The program divided a number by zero, which has no answer.',
      question: `Which value is the divisor on ${where}? Can it ever be 0, for example from an empty list or a counter that starts at 0?`,
    }),
  },
  {
    match: /RecursionError|StackOverflow|Maximum call stack|stack overflow|SegmentationFault|Segmentation fault/i,
    hints: (where, text) =>
      /Segmentation/i.test(text)
        ? {
            nudge: 'The program touched memory it does not own: an index outside the array, a pointer that was never set, or a function that kept calling itself until the stack ran out.',
            question: `Around ${where}, can any index go outside 0 to size - 1, is any pointer unset or NULL, or does a function call itself with no stopping case?`,
          }
        : {
            nudge: 'A function kept calling itself and never stopped, until the computer ran out of room for the calls.',
            question: `For which input should ${where === 'the line the error points to' ? 'the function' : 'the function on ' + where} stop calling itself? Is there an if that returns before the recursive call, and does every call get closer to that input?`,
          },
  },
  {
    match: /Time limit exceeded|timeout|timed out|TLE/i,
    hints: (where) => ({
      nudge: 'The program did not finish in time: either a loop never ends, or it does far more work than needed.',
      question: `In the loop near ${where}, which variable changes on every pass, and does it ever make the loop condition false?`,
    }),
  },
  {
    match: /Memory limit|MemoryError|OutOfMemory/i,
    hints: () => ({
      nudge: 'The program used more memory than allowed, usually because something keeps growing.',
      question: 'Which list, string or structure keeps getting bigger inside a loop, and does anything ever stop it from growing?',
    }),
  },
  {
    match: /AttributeError|has no attribute|is not a function|has no method/i,
    hints: (where) => ({
      nudge: 'The program asked an object for something it does not have: a method or attribute that the object does not offer, or that is spelled differently.',
      question: `What type of value is the object on ${where}, and does that type really have what you are calling? Print its type and check the spelling.`,
    }),
  },
  {
    match: /TypeError|incompatible types|bad operand types|invalid operands|cannot be converted|unsupported operand|can only concatenate|no match for/i,
    hints: (where) => ({
      nudge: 'Two values of different kinds were mixed in a way the language does not allow, such as text with a number, or a list where a number is needed.',
      question: `What kind of value is on each side of the operator or in each argument on ${where} (text, number, list)? Print the type of each one to find out which does not belong.`,
    }),
  },
  {
    match: /ValueError|NumberFormatException|invalid literal|InputMismatch/i,
    hints: (where) => ({
      nudge: 'A function received a value of the right kind but with content it cannot work with, for example text that is not a number.',
      question: `What exact value reaches ${where}, and what content does that function accept? Print the value, including any spaces or newline, just before it.`,
    }),
  },
  {
    match: /SyntaxError|IndentationError|TabError|invalid syntax|unexpected indent|expected .*(?:;|\)|\}|:)|error: expected|reached end of file|unclosed|unterminated|missing \)/i,
    hints: (where) => ({
      nudge: 'The language could not even read this part of the code: punctuation, brackets or indentation are missing, extra or misplaced.',
      question: `Look at ${where} and the line just before it. Is every bracket and quote that opens also closed, is whatever ends or starts a statement in this language present there, and is the indentation consistent?`,
    }),
  },
];

const GENERIC = (where: string): ExplanationHints => ({
  nudge: `The program stopped because of the problem named in the last line of the error message. Read that line first: it says what kind of problem it is, and the program stopped at ${where}.`,
  question: `What did you expect ${where} to do, and which value or condition there could be different from what you expect? Print the values just before that line to check.`,
});

/** The line the error points to, in words (a line number when the parser found one). */
export function whereText(line: number | undefined): string {
  return line ? `line ${line}` : 'the line the error points to';
}

/** Hints from the error text alone. Always returns something useful, even for an error no rule knows. */
export function ruleHints(errorText: string, line?: number): ExplanationHints {
  const where = whereText(line);
  const rule = RULES.find((r) => r.match.test(errorText));
  return rule ? rule.hints(where, errorText) : GENERIC(where);
}
