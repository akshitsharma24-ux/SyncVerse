/** A small chip in the top bar while a quiz is live: one click to the quiz (the answering view for students, the board for mentors). */
import { Icon } from '../shell/icons';
import { useQuiz } from './context';
import { Countdown } from './Overlay';

export function QuizTopChip({ onOpenTool }: { onOpenTool: () => void }) {
  const { view, canManage, canAnswer, open } = useQuiz();
  if (!view || view.status === 'ended') return null;
  if (view.status === 'lobby' && !canManage) return null;
  const live = view.status === 'running';
  const go = () => {
    if (!live) return onOpenTool();
    if (canAnswer) open({ kind: 'arena', quizId: view.id });
    else if (view.leaderboard) open({ kind: 'board', quizId: view.id });
    else onOpenTool();
  };
  return (
    <button className={`qz-top-chip ${live ? 'live' : ''}`} onClick={go} data-testid="quiz-chip" aria-label={live ? `Quiz live, ${view.title}` : `Quiz ready: ${view.title}`}>
      <Icon name="trophy" size={13} />
      <span>{live ? 'Quiz live' : 'Quiz ready'}</span>
      {live && <Countdown view={view} />}
    </button>
  );
}
