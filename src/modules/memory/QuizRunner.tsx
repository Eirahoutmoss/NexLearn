import { useRef, useState } from 'react';
import { Button, Card, ProgressBar } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { PracticeGrade } from '../../services/practice';

export interface QuizQuestion {
  id: string;
  prompt: string;
  answer: string;
}

export interface QuizOutcome {
  grades: PracticeGrade[];
  typed: string[];
  activeMs: number;
}

/** Sınav provası ve meydan okuma için ortak soru akışı: (isteğe bağlı) yaz → cevabı gör → kendini puanla. */
export function QuizRunner({ questions, badge, onFinish }: { questions: QuizQuestion[]; badge: string; onFinish: (o: QuizOutcome) => void }) {
  const { t } = useI18n();
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState('');
  const grades = useRef<PracticeGrade[]>([]);
  const answers = useRef<string[]>([]);
  const activeMs = useRef(0);
  const shownAt = useRef(Date.now());

  const grade = (g: PracticeGrade) => {
    activeMs.current += Math.min(Date.now() - shownAt.current, 120_000);
    grades.current.push(g);
    answers.current.push(typed.trim());
    setRevealed(false);
    setTyped('');
    shownAt.current = Date.now();
    if (pos + 1 >= questions.length) onFinish({ grades: grades.current, typed: answers.current, activeMs: activeMs.current });
    else setPos(pos + 1);
  };

  const item = questions[pos];
  if (!item) return null;
  return (
    <div className="review">
      <div className="review-top">
        <span className="review-count" aria-live="polite">
          {t('review.position', { n: pos + 1, total: questions.length })}
        </span>
        <ProgressBar value={(pos / questions.length) * 100} label={t('review.sessionProgress')} />
      </div>
      <Card className="flashcard" aria-labelledby="qz-prompt">
        <p className="flashcard-kind">{badge}</p>
        <h2 id="qz-prompt" className="flashcard-prompt">
          {item.prompt}
        </h2>
        {!revealed ? (
          <>
            <label className="sr-only" htmlFor="qz-typed">
              {t('review.typeAnswer')}
            </label>
            <textarea id="qz-typed" className="input textarea flashcard-input" rows={2} placeholder={t('review.typeAnswer')} value={typed} onChange={(e) => setTyped(e.target.value)} />
            <Button variant="soft" size="lg" className="flashcard-show" onClick={() => setRevealed(true)}>
              {t('review.showAnswer')}
            </Button>
          </>
        ) : (
          <div className="flashcard-answer" aria-live="polite">
            {typed.trim() && (
              <p className="typed-echo">
                <span className="muted">{t('review.yourAnswer')}:</span> {typed}
              </p>
            )}
            <p className="answer-text">{item.answer}</p>
            <p className="rate-question" id="qz-q">
              {t('practice.howDid')}
            </p>
            <div className="rate-buttons rate-3" role="group" aria-labelledby="qz-q">
              <button type="button" className="rate-btn rate-again" onClick={() => grade('missed')}>
                <span className="rate-label">{t('practice.missed')}</span>
              </button>
              <button type="button" className="rate-btn rate-hard" onClick={() => grade('partial')}>
                <span className="rate-label">{t('practice.partial')}</span>
              </button>
              <button type="button" className="rate-btn rate-easy" onClick={() => grade('knew')}>
                <span className="rate-label">{t('practice.knew')}</span>
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
