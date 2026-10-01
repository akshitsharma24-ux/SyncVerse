/** What a coding answer starts as, per language: a skeleton that already reads all of stdin, so students start with the problem. */
export const QUIZ_LANGUAGES = [
  { id: 'python', label: 'Python', monaco: 'python' },
  { id: 'java', label: 'Java', monaco: 'java' },
  { id: 'javascript', label: 'JavaScript', monaco: 'javascript' },
  { id: 'cpp', label: 'C++', monaco: 'cpp' },
  { id: 'c', label: 'C', monaco: 'c' },
] as const;

export type QuizLanguage = (typeof QUIZ_LANGUAGES)[number]['id'];

export const STARTERS: Record<QuizLanguage, string> = {
  python: `import sys


def main():
    data = sys.stdin.read().split()
    # read the input from data, solve the problem, print the answer


main()
`,
  java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        // read the input with in.nextInt() / in.next(), solve the problem, print the answer
    }
}
`,
  javascript: `const data = require("fs").readFileSync(0, "utf8").split(/\\s+/).filter(Boolean);
// read the input from data, solve the problem, print the answer with console.log
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    // read the input with cin, solve the problem, print the answer with cout
    return 0;
}
`,
  c: `#include <stdio.h>

int main(void) {
    /* read the input with scanf, solve the problem, print the answer with printf */
    return 0;
}
`,
};

export const isQuizLanguage = (v: string): v is QuizLanguage => v in STARTERS;
