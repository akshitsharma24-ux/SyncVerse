# Demo programs in every language

The **Samples** menu loads planted-bug programs into the shared editor, and each one exists in Python, Java, JavaScript, C and C++. They are
plain files in [`docs/samples/`](../samples): the Python ones at the top level (`01_index_error.py`), the others in `java/`, `javascript/`,
`c/` and `cpp/` with the same file name.

| Demo | What it shows |
|---|---|
| Index error | a loop that goes one step too far (the room's first program) |
| Name error | a misspelled variable |
| Syntax error | a missing colon, semicolon or bracket |
| Infinite loop | a loop that never ends (time limit) |
| Recursion error | a function with no stopping case |
| List aliasing | two names for one list (output that surprises beginners) |
| Zero division | dividing by an empty collection's size |
| Type error | text used as a number |
| Stdin average | reads numbers from the Input box (try `3 4 5`) |
| Quality sample | long lines, nesting, magic numbers, `eval`: for the code quality tool (Python only) |

How it behaves:

- Samples loads the demo in the **open file's language**. A demo with no version for that language (the Python-only quality sample) opens in
  Python and switches the file.
- Changing a file's language while it still holds a demo, the room's first program or a hello-world swaps it for the **same demo in the new
  language**. Code a person wrote or edited is never replaced.
- Each language fails in its own way (a Java `ArrayIndexOutOfBoundsException`, a JavaScript `TypeError`, a C segmentation fault, a C++
  `std::out_of_range`, compile errors where those languages reject the code), so the console, the error-line marking and the hints can be shown
  in any of them.

`npm run verify:demos` runs all 46 programs through the real runner and checks that each fails (or works) the way its name says. Code:
`web/src/demo/`, `shared/files.ts` (`DEFAULT_PROGRAMS`, `starterFor`).
