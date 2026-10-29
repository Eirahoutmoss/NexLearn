import { useRef, useState } from 'react';
import { Swords, Upload, Download, Trash2, Play } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Badge, Button, Card, EmptyState, IconButton, Spinner, TextField } from '../../components/ui';
import { useI18n } from '../../i18n';
import { useApp } from '../../app/AppContext';
import { useQuery } from '../../app/useQuery';
import { downloadBytes } from '../../services/export/download';
import { answerChallenge, createChallenge, loadDuels, receiveDuelFile, removeDuel, saveOwnResults, type DuelChallenge, type DuelResultRow } from '../../services/duel';
import { summarizePractice } from '../../services/practice';
import type { LearningItem } from '../../domain/types';
import { QuizRunner, type QuizOutcome } from './QuizRunner';

const NAME_KEY = 'nexlearn.duel.name';
function rememberedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
function rememberName(n: string) {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    /* isteğe bağlı kolaylık */
  }
}

/** Seçili kapsamdan meydan okuma dosyası üretir. */
export function ChallengeModal({ open, onClose, build }: { open: boolean; onClose: () => void; build: () => LearningItem[] }) {
  const { t } = useI18n();
  const { toast, reportError } = useApp();
  const [title, setTitle] = useState('');
  const [name, setName] = useState(rememberedName);
  const [error, setError] = useState<string>();

  const submit = async () => {
    if (!title.trim()) {
      setError(t('duel.titleRequired'));
      return;
    }
    try {
      const items = build();
      const r = await createChallenge(items, { title, from: name });
      rememberName(name);
      downloadBytes(r.bytes, r.fileName, 'application/json');
      toast(t('duel.created', { n: r.challenge.questions.length }), { tone: 'success' });
      onClose();
    } catch (e) {
      reportError(e, 'duel-create');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('duel.createTitle')}
      description={t('duel.createIntro')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" icon={Download} onClick={() => void submit()}>
            {t('duel.createButton')}
          </Button>
        </>
      }
    >
      <div className="stack-sm">
        <TextField
          label={t('duel.title')}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(undefined);
          }}
          error={error}
          maxLength={200}
        />
        <TextField label={t('duel.yourName')} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} optional={t('common.optional')} />
        <p className="field-hint">{t('duel.honesty')}</p>
      </div>
    </Modal>
  );
}

function toRows(c: DuelChallenge, o: QuizOutcome): DuelResultRow[] {
  return c.questions.map((q, i) => ({ id: q.id, typed: o.typed[i] ?? '', grade: o.grades[i] ?? 'missed' }));
}

const GRADE_MARK = { knew: '✓', partial: '~', missed: '✗' } as const;

/** Meydan okumalar sekmesi: gelenleri çöz, gönderdiklerinin sonuçlarını karşılaştır. */
export function DuelView() {
  const { t, formatDate } = useI18n();
  const { toast, reportError, confirm } = useApp();
  const { data } = useQuery(loadDuels, [], ['meta']);
  const [playing, setPlaying] = useState<{ challenge: DuelChallenge; mode: 'answer' | 'own' } | null>(null);
  const [name, setName] = useState(rememberedName);
  const fileRef = useRef<HTMLInputElement>(null);

  const openFiles = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      try {
        const r = await receiveDuelFile(new Uint8Array(await f.arrayBuffer()));
        toast(r.kind === 'challenge' ? t('duel.receivedChallenge') : r.matched ? t('duel.receivedAnswer') : t('duel.unknownAnswer'), { tone: r.matched ? 'success' : 'info' });
      } catch (e) {
        reportError(e, 'duel-open');
      }
    }
  };

  const finish = async (o: QuizOutcome) => {
    if (!playing) return;
    const rows = toRows(playing.challenge, o);
    try {
      if (playing.mode === 'own') {
        await saveOwnResults(playing.challenge.challengeId, rows);
      } else {
        rememberName(name);
        const r = await answerChallenge(playing.challenge.challengeId, rows, name);
        downloadBytes(r.bytes, r.fileName, 'application/json');
        toast(t('duel.answerSaved', { score: r.answer.score }), { tone: 'success' });
      }
    } catch (e) {
      reportError(e, 'duel-finish');
    }
    setPlaying(null);
  };

  if (!data) return <Spinner label={t('common.loading')} />;
  if (playing) return <QuizRunner questions={playing.challenge.questions} badge={t('duel.badge', { title: playing.challenge.title })} onFinish={(o) => void finish(o)} />;

  return (
    <div className="stack duel">
      <Card className="duel-intro">
        <h2 className="card-title">
          <Swords size={20} aria-hidden="true" /> {t('duel.title2')}
        </h2>
        <p className="muted">{t('duel.intro')}</p>
        <div className="row-wrap">
          <Button icon={Upload} onClick={() => fileRef.current?.click()}>
            {t('duel.openFile')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            hidden
            multiple
            accept=".nexduel,.nexduel-cevap,application/json"
            data-testid="duel-input"
            onChange={(e) => {
              void openFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        <TextField label={t('duel.yourName')} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} hint={t('duel.nameHint')} />
      </Card>

      <section aria-labelledby="duel-in">
        <h2 id="duel-in" className="section-title">
          {t('duel.received')}
        </h2>
        {data.received.length === 0 ? (
          <p className="muted">{t('duel.noneReceived')}</p>
        ) : (
          <ul className="mini-list">
            {data.received.map((c) => (
              <li key={c.challengeId} className="mini-item duel-item">
                <p className="mini-title">{c.title}</p>
                <p className="mini-text">
                  {t('duel.fromLine', { from: c.from || t('duel.anon'), n: c.questions.length })}
                  {c.myAnswer && (
                    <>
                      {' · '}
                      <Badge tone="success">{t('duel.yourScore', { score: c.myAnswer.score })}</Badge>
                    </>
                  )}
                </p>
                <div className="row-wrap">
                  <Button size="sm" variant={c.myAnswer ? 'ghost' : 'primary'} icon={Play} onClick={() => setPlaying({ challenge: c, mode: 'answer' })}>
                    {c.myAnswer ? t('duel.answerAgain') : t('duel.answer')}
                  </Button>
                  <IconButton
                    icon={Trash2}
                    size="sm"
                    label={t('duel.remove', { title: c.title })}
                    onClick={() => void confirm({ title: t('duel.removeTitle'), message: c.title, confirmLabel: t('common.delete') }).then((ok) => (ok ? removeDuel(c.challengeId) : undefined))}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="duel-out">
        <h2 id="duel-out" className="section-title">
          {t('duel.sent')}
        </h2>
        {data.sent.length === 0 ? (
          <EmptyState icon={Swords} title={t('duel.noneSent')} text={t('duel.noneSentHint')} />
        ) : (
          <ul className="mini-list">
            {data.sent.map((c) => {
              const players = [
                ...(c.myResults ? [{ by: t('duel.me'), results: c.myResults }] : []),
                ...c.answers.map((a) => ({ by: a.by || t('duel.anon'), results: a.results })),
              ];
              return (
                <li key={c.challengeId} className="mini-item duel-item">
                  <p className="mini-title">{c.title}</p>
                  <p className="mini-text">{t('duel.sentLine', { date: c.createdAt ? formatDate(c.createdAt) : '', n: c.questions.length, answers: c.answers.length })}</p>
                  {players.length > 0 && (
                    <div className="table-wrap">
                      <table className="duel-table">
                        <caption className="sr-only">{t('duel.compare', { title: c.title })}</caption>
                        <thead>
                          <tr>
                            <th scope="col">{t('duel.question')}</th>
                            {players.map((p, i) => (
                              <th key={i} scope="col">
                                {p.by} · %{summarizePractice(p.results.map((r) => r.grade)).score}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {c.questions.map((q) => (
                            <tr key={q.id}>
                              <th scope="row">{q.prompt}</th>
                              {players.map((p, i) => {
                                const r = p.results.find((x) => x.id === q.id);
                                return (
                                  <td key={i} className={r ? `duel-${r.grade}` : ''} title={r?.typed || undefined}>
                                    <span aria-hidden="true">{r ? GRADE_MARK[r.grade] : '–'}</span>
                                    <span className="sr-only">{r ? t(`practice.${r.grade}`) : t('duel.noAnswer')}</span>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="row-wrap">
                    {!c.myResults && (
                      <Button size="sm" icon={Play} onClick={() => setPlaying({ challenge: c, mode: 'own' })}>
                        {t('duel.playOwn')}
                      </Button>
                    )}
                    <IconButton
                      icon={Trash2}
                      size="sm"
                      label={t('duel.remove', { title: c.title })}
                      onClick={() => void confirm({ title: t('duel.removeTitle'), message: c.title, confirmLabel: t('common.delete') }).then((ok) => (ok ? removeDuel(c.challengeId) : undefined))}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
