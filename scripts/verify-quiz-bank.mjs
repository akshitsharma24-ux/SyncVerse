// Structural checks on the quiz question bank: counts per topic and difficulty, unique ids, well-formed multiple-choice questions,
// coding problems with samples and generated tests, no accidental duplicates, and expected.ts up to date with the model solutions.
//   npm run verify:quiz
import { spawnSync } from 'node:child_process';
import { tsImport } from 'tsx/esm/api';

const { QUESTIONS, CODE_PROBLEMS, testsFor, catalog, pickQuestions } = await tsImport('../server/quiz/bank.ts', import.meta.url);
const { MCQS } = await tsImport('../server/quiz/mcq.ts', import.meta.url);
const { QUIZ_TOPIC_IDS } = await tsImport('../shared/quiz.ts', import.meta.url);

const results = [];
const check = (name, fn) => {
  try {
    results.push([true, name, fn() ?? '']);
  } catch (e) {
    results.push([false, name, e.message]);
  }
};
const ok = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

check('ids are unique', () => {
  const ids = QUESTIONS.map((q) => q.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  ok(!dup.length, 'duplicate ids: ' + dup.join(', '));
  return `${ids.length} questions`;
});

check('88 questions: 48 multiple choice and 40 coding, none dropped for missing tests', () => {
  ok(MCQS.length === 48, `multiple choice: ${MCQS.length}`);
  ok(CODE_PROBLEMS.length === 40, `coding: ${CODE_PROBLEMS.length}`);
  ok(QUESTIONS.length === 88, `usable: ${QUESTIONS.length} (run npm run gen:quiz?)`);
});

check('every topic has multiple choice and coding questions at all three levels', () => {
  for (const t of catalog()) {
    for (const level of ['easy', 'medium', 'hard']) {
      ok(t.counts[level].mcq >= 2, `${t.id} ${level}: ${t.counts[level].mcq} multiple choice`);
      ok(t.counts[level].code >= 1, `${t.id} ${level}: ${t.counts[level].code} coding`);
    }
  }
  return `${catalog().length} topics`;
});

check('multiple choice: four different options, a valid answer, an explanation', () => {
  for (const m of MCQS) {
    ok(m.options.length === 4 && new Set(m.options).size === 4, `${m.id}: options`);
    ok([0, 1, 2, 3].includes(m.answer), `${m.id}: answer index`);
    ok(m.explanation.length > 20 && m.prompt.length > 10 && m.title.length > 2, `${m.id}: text`);
  }
  const spread = [0, 1, 2, 3].map((i) => MCQS.filter((m) => m.answer === i).length);
  ok(Math.min(...spread) >= 6, `the right answer is almost always in one slot: ${spread}`);
  return `right answer by position: ${spread.join(' / ')}`;
});

check('coding problems: samples, a model solution, tests, 5+ tests in all', () => {
  for (const p of CODE_PROBLEMS) {
    ok(p.samples.length >= 1 && p.samples.every((s) => s.input && s.output), `${p.id}: samples`);
    ok(p.reference.includes('main'), `${p.id}: reference`);
    const tests = testsFor(p);
    ok(tests, `${p.id}: no generated tests`);
    ok(tests.length >= 5, `${p.id}: only ${tests.length} tests`);
    ok(tests.filter((t) => t.visible).length === p.samples.length, `${p.id}: visible tests`);
    ok(new Set(tests.map((t) => t.input)).size === tests.length, `${p.id}: two tests have the same input`);
    ok(tests.every((t) => t.output.trim().length > 0), `${p.id}: empty expected output`);
    ok(tests.every((t) => t.input.length < 40_000), `${p.id}: an input over 40 KB`);
  }
  return `${CODE_PROBLEMS.reduce((n, p) => n + (testsFor(p)?.length ?? 0), 0)} tests`;
});

check('picking: every combination of topic, level, type and count returns what was asked for', () => {
  let made = 0;
  for (const topic of QUIZ_TOPIC_IDS) {
    for (const difficulty of ['easy', 'medium', 'hard', 'mixed']) {
      for (const format of ['mcq', 'code', 'mixed']) {
        const picked = pickQuestions({ topics: [topic], difficulty, format, count: 5 }, 7);
        ok(picked.length >= 3, `${topic} ${difficulty} ${format}: only ${picked.length}`);
        ok(new Set(picked.map((q) => q.id)).size === picked.length, `${topic} ${difficulty} ${format}: repeats a question`);
        made++;
      }
    }
  }
  const all = pickQuestions({ topics: QUIZ_TOPIC_IDS, difficulty: 'mixed', format: 'mixed', count: 10 }, 3);
  ok(all.length === 10, 'ten from all topics: ' + all.length);
  const order = all.map((q) => ['easy', 'medium', 'hard'].indexOf(q.difficulty));
  ok(order.every((v, i) => i === 0 || v >= order[i - 1]), 'a mixed quiz should go from easy to hard');
  return `${made} combinations`;
});

check('expected.ts is up to date with the model solutions (re-runs all 40 and 237+ tests with Python)', () => {
  const r = spawnSync(process.execPath, ['scripts/gen-quiz-bank.mjs', '--check'], { encoding: 'utf8' });
  ok(r.status === 0, (r.stdout + r.stderr).trim().split('\n').pop());
  return r.stdout.trim();
});

for (const [pass, name, d] of results) console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${d ? '  - ' + d : ''}`);
console.log(`\n${results.filter((r) => r[0]).length} of ${results.length} checks passed`);
process.exit(results.every((r) => r[0]) ? 0 : 1);
