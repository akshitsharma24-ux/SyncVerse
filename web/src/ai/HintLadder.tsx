/**
 * The optional "Guide me with hints" ladder in the Understand tool. Rung 1 is a nudge (what happened, in concept), rung 2 a guiding
 * question, rung 3 the fix and the patch. Nobody has to climb it: "Explain with AI" and "Suggest a patch" work on their own, and the
 * ladder can be left, or skipped for a direct explanation, at any time.
 */
import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { Icon } from '../shell/icons';
import './hints.css';

export interface HintSet {
  nudge: string;
  question: string;
  /** where they came from: the AI, a built-in answer, or rules written from the error message */
  source: 'sample' | 'cache' | 'gemini' | 'rules';
}

export type Tier = 0 | 1 | 2 | 3;

/** `code` between backticks is shown as code; everything else is plain text. */
function Inline({ text }: { text: string }): ReactNode {
  return text.split(/(`[^`]+`)/g).map((part, i) =>
    part.startsWith('`') && part.endsWith('`') && part.length > 2 ? <code key={i}>{part.slice(1, -1)}</code> : <Fragment key={i}>{part}</Fragment>,
  );
}

export function HintLadder({
  tier,
  hints,
  loading,
  error,
  line,
  fix,
  patchLoading,
  onHighlight,
  onQuestion,
  onFix,
  onRetryFix,
  onPatch,
  onDirect,
  onExit,
}: {
  tier: Tier;
  hints: HintSet | null;
  loading: boolean;
  error: string | null;
  line?: number;
  /** rung 3: the explanation that holds the fix is loading, failed, or is on screen */
  fix: 'idle' | 'loading' | 'error' | 'done';
  patchLoading: boolean;
  onHighlight: () => void;
  onQuestion: () => void;
  onFix: () => void;
  onRetryFix: () => void;
  onPatch: () => void;
  onDirect: () => void;
  onExit: () => void;
}) {
  const questionRef = useRef<HTMLParagraphElement>(null);
  const fixRef = useRef<HTMLParagraphElement>(null);
  // Move focus to what was just revealed, so a keyboard or screen-reader user lands on the new hint.
  useEffect(() => {
    if (tier === 2) questionRef.current?.focus();
    if (tier === 3) fixRef.current?.focus();
  }, [tier]);

  const rung = (n: number) => (tier >= n ? 'reached' : 'locked');

  return (
    <section className="ai-ladder" data-testid="ai-hint-ladder" aria-label="Hint ladder">
      <header>
        <div className="eyebrow ai-ladder-title"><Icon name="bulb" size={13} /> HINT LADDER</div>
        <button type="button" className="ai-link" onClick={onExit} data-testid="ai-hint-exit">Leave the ladder</button>
      </header>

      <ol className="ai-rungs">
        <li className={rung(1)} data-testid="ai-hint-rung-1">
          <span className="dot" aria-hidden="true">1</span>
          <div>
            <h3>Nudge</h3>
            {loading && <p role="status" className="muted">Thinking of a gentle nudge…</p>}
            {error && <p role="alert" className="alert" data-testid="ai-hint-error">{error}</p>}
            {hints && (
              <p data-testid="ai-hint-nudge">
                <Inline text={hints.nudge} />
                {line && <button type="button" className="ai-line mono" onClick={onHighlight} aria-label={`Highlight line ${line}`}>L{line}</button>}
              </p>
            )}
          </div>
        </li>

        <li className={rung(2)} data-testid="ai-hint-rung-2">
          <span className="dot" aria-hidden="true">2</span>
          <div>
            <h3>Guiding question</h3>
            {tier >= 2 && hints ? (
              <p ref={questionRef} tabIndex={-1} data-testid="ai-hint-question"><Inline text={hints.question} /></p>
            ) : tier === 1 && hints ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={onQuestion} data-testid="ai-hint-next">Need another hint?</button>
            ) : (
              <p className="muted">Opens when you ask for another hint.</p>
            )}
          </div>
        </li>

        <li className={rung(3)} data-testid="ai-hint-rung-3">
          <span className="dot" aria-hidden="true">3</span>
          <div>
            <h3>The fix</h3>
            {tier >= 3 ? (
              <>
                <p ref={fixRef} tabIndex={-1} className="muted" data-testid="ai-hint-fix-note">
                  {fix === 'loading' ? 'Getting the fix…' : fix === 'error' ? 'The fix could not be loaded.' : 'It is shown below. Try typing it yourself first, then compare. The patch button applies it for you to review.'}
                </p>
                {fix === 'error' && <button type="button" className="btn btn-outline btn-sm" onClick={onRetryFix} data-testid="ai-hint-fix-retry">Try again</button>}
                {fix === 'done' && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={onPatch} disabled={patchLoading} data-testid="ai-hint-patch-button">
                    {patchLoading ? 'Preparing patch preview…' : 'Suggest a patch'}
                  </button>
                )}
              </>
            ) : tier === 2 ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={onFix} data-testid="ai-hint-fix">Still stuck? Show the fix</button>
            ) : (
              <p className="muted">Opens after the guiding question.</p>
            )}
          </div>
        </li>
      </ol>

      <footer>
        {hints && <span className="ai-source">{hints.source === 'rules' ? 'General hints from the error message' : 'Hints written for this program'}</span>}
        <button type="button" className="ai-link" onClick={onDirect} data-testid="ai-hint-skip">Skip the hints and explain it directly</button>
      </footer>
    </section>
  );
}
