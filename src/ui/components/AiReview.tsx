import { useState } from 'react';
import { AI_DISCLAIMER, AI_WEEK_DISCLAIMER, aiReviewAvailable, type WeekFacts } from '../../api';
import { useAppStore } from '../store/useAppStore';

const errorText = (e: string) => `ai review unavailable right now (${e}). the numbers on this page are unaffected.`;

/**
 * Optional Gemini text. `results` reviews the simulation (Compare); `data` summarizes the history (Data Review).
 * Results live in the store, so switching tabs mid-request keeps the request and its answer.
 * Renders nothing unless the dev server has a key.
 */
export function AiReview({ mode = 'results', week }: { mode?: 'results' | 'data' | 'week'; week?: WeekFacts }) {
  const importResult = useAppStore((s) => s.importResult);
  const result = useAppStore((s) => s.experimentResult);
  const slots = useAppStore((s) => s.aiSlots);
  const requestAi = useAppStore((s) => s.requestAi);
  const [question, setQuestion] = useState('');

  const key = mode === 'week' ? (week && week.days.length ? JSON.stringify(week) : null) : mode === 'data' ? importResult : result;
  if (!aiReviewAvailable || !importResult || !key) return null;
  const main = slots[mode === 'results' ? 'review' : mode];
  const ask = slots.ask;
  const fresh = (slot: typeof main) => (slot.key === key ? slot : null); // older answers describe another run
  const m = fresh(main), a = fresh(ask);
  const label = mode === 'week' ? '✨ ai weekly prep & staffing advice' : mode === 'data' ? '✨ ai data summary' : '✨ ai review & recommendations';

  return (
    <section className="ai-review" data-testid={mode === 'week' ? 'ai-week' : mode === 'data' ? 'ai-data-summary' : 'ai-review'}>
      {!m?.text ? (
        <button type="button" className="btn" data-testid={mode === 'week' ? 'ai-week-btn' : mode === 'data' ? 'ai-data-btn' : 'ai-review-btn'} disabled={m?.loading}
          onClick={() => void requestAi(mode === 'week' ? { kind: 'week', week: week! } : { kind: mode === 'data' ? 'data' : 'review' })}>
          {m?.loading ? 'asking gemini…' : label}
        </button>
      ) : (
        <>
          <div className="takeaway-kicker">{mode === 'week' ? 'ai weekly prep memo' : mode === 'data' ? 'ai data summary' : 'ai review'}</div>
          <p className="ai-review-text" data-testid="ai-review-text">{m.text}</p>
          {mode === 'results' && (
            <>
              <form className="ai-ask" onSubmit={(e) => { e.preventDefault(); if (question.trim()) void requestAi({ kind: 'ask', question: question.trim() }); }}>
                <input className="input" placeholder="ask gemini about your dining room…" value={question} maxLength={300}
                  onChange={(e) => setQuestion(e.target.value)} aria-label="question for gemini" />
                <button type="submit" className="btn" disabled={a?.loading || !question.trim()}>{a?.loading ? 'asking…' : 'ask'}</button>
              </form>
              {a?.text && <p className="ai-review-text">{a.text}</p>}
              {a?.error && <p className="inline-error" role="alert">{errorText(a.error)}</p>}
            </>
          )}
          <p className="ai-review-disclaimer">{mode === 'week' ? AI_WEEK_DISCLAIMER : AI_DISCLAIMER}</p>
        </>
      )}
      {m?.error && <p className="inline-error" role="alert">{errorText(m.error)}</p>}
    </section>
  );
}
