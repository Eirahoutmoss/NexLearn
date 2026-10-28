import { useState } from 'react';
import { Target, Plus, Trash2, ExternalLink, Pencil } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useQuery } from '../../app/useQuery';
import { useApp } from '../../app/AppContext';
import { routes } from '../../app/router';
import { Badge, Button, Card, EmptyState, IconButton, SelectField, TextArea } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { addTaskAttempt, createTask, listConcepts, listTasks, trashTask, updateTaskPrompt } from '../../services/learn';
import { restoreDeleted } from '../../adapters/storage/repo';
import { listSources } from '../../services/sources';
import type { ApplicationTask, TaskAttempt } from '../../domain/types';

/** NexÖğren uygulama görevleri: öğrenileni yeni bir bağlamda denemek (transfer). */
export default function TasksPage() {
  const { t, formatDate } = useI18n();
  const { toast, reportError } = useApp();
  const [creating, setCreating] = useState(false);
  const [newPrompt, setNewPrompt] = useState('');
  const [newConcept, setNewConcept] = useState('');
  const [attemptFor, setAttemptFor] = useState<ApplicationTask | null>(null);
  const [response, setResponse] = useState('');
  const [assessment, setAssessment] = useState<TaskAttempt['selfAssessment']>('done');
  const [editing, setEditing] = useState<ApplicationTask | null>(null);
  const [editText, setEditText] = useState('');

  const { data } = useQuery(
    async () => {
      const [tasks, concepts, sources] = await Promise.all([listTasks(), listConcepts(), listSources()]);
      return { tasks: tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt)), concepts, conceptMap: new Map(concepts.map((c) => [c.id, c])), sources: new Map(sources.map((s) => [s.id, s])) };
    },
    [],
    ['tasks', 'concepts', 'sources'],
  );

  const create = async () => {
    try {
      await createTask({ prompt: newPrompt, conceptIds: newConcept ? [newConcept] : [] });
      setCreating(false);
      setNewPrompt('');
      setNewConcept('');
      toast(t('tasks.created'), { tone: 'success' });
    } catch (e) {
      reportError(e, 'task-create');
    }
  };

  const saveAttempt = async () => {
    if (!attemptFor) return;
    try {
      await addTaskAttempt(attemptFor.id, response, assessment);
      setAttemptFor(null);
      setResponse('');
      toast(t('tasks.attemptSaved'), { tone: 'success' });
    } catch (e) {
      reportError(e, 'attempt');
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{t('tasks.title')}</h1>
          <p className="page-sub">{t('tasks.subtitle')}</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
          {t('tasks.new')}
        </Button>
      </header>

      {data && data.tasks.length === 0 ? (
        <EmptyState icon={Target} title={t('tasks.emptyTitle')} text={t('tasks.emptyText')} action={<Button icon={Plus} onClick={() => setCreating(true)}>{t('tasks.new')}</Button>} />
      ) : (
        <ul className="task-list">
          {data?.tasks.map((task) => {
            const last = task.attempts[task.attempts.length - 1];
            return (
              <li key={task.id}>
                <Card as="article" className="task-card">
                  <div className="row-between">
                    <p className="task-prompt">{task.prompt}</p>
                    <div className="row-wrap">
                      <IconButton
                        icon={Pencil}
                        size="sm"
                        label={t('common.edit')}
                        onClick={() => {
                          setEditText(task.prompt);
                          setEditing(task);
                        }}
                      />
                      <IconButton
                        icon={Trash2}
                        size="sm"
                        label={t('common.delete')}
                        onClick={() =>
                          void trashTask(task.id)
                            .then(() => toast(t('tasks.deleted'), { action: { label: t('common.undo'), run: () => void restoreDeleted('tasks', task.id) } }))
                            .catch((e) => reportError(e, 'task-delete'))
                        }
                      />
                    </div>
                  </div>
                  <p className="mini-meta">
                    {task.conceptIds.map((id) => data.conceptMap.get(id)).filter(Boolean).map((c) => (
                      <a key={c!.id} href={`#${routes.map(c!.id)}`} className="tag">
                        {c!.label}
                      </a>
                    ))}
                    {task.sourceRefs.map((r) => {
                      const s = data.sources.get(r.sourceId);
                      return s ? (
                        <a key={`${r.sourceId}${r.segmentId}`} href={`#${routes.read(r.sourceId, r.segmentId)}`} className="link-inline">
                          <ExternalLink size={14} aria-hidden="true" /> {s.title}
                        </a>
                      ) : null;
                    })}
                    {task.isSample && <Badge tone="accent">{t('common.sample')}</Badge>}
                  </p>
                  {last ? (
                    <p className="muted">
                      {t('tasks.lastAttempt', { date: formatDate(last.at) })} · <Badge tone={last.selfAssessment === 'done' ? 'success' : last.selfAssessment === 'partial' ? 'warning' : 'neutral'}>{t(`tasks.assess.${last.selfAssessment}`)}</Badge>
                    </p>
                  ) : (
                    <p className="muted">{t('tasks.noAttempts')}</p>
                  )}
                  {task.attempts.length > 0 && (
                    <details>
                      <summary>{t('tasks.attempts', { count: task.attempts.length })}</summary>
                      <ol className="history-list">
                        {[...task.attempts].reverse().map((a) => (
                          <li key={a.id}>
                            <span>{formatDate(a.at)}</span>
                            <Badge>{t(`tasks.assess.${a.selfAssessment}`)}</Badge>
                            <span className="mini-text">{a.response}</span>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                  <Button
                    size="sm"
                    variant="soft"
                    onClick={() => {
                      setResponse('');
                      setAssessment('done');
                      setAttemptFor(task);
                    }}
                  >
                    {t('tasks.try')}
                  </Button>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t('tasks.new')}
        description={t('tasks.taskHint')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void create()} disabled={!newPrompt.trim()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="stack">
          <TextArea label={t('tasks.prompt')} value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)} rows={4} placeholder={t('tasks.placeholderGeneric')} data-autofocus />
          {data && data.concepts.length > 0 && (
            <SelectField label={t('tasks.concept')} value={newConcept} onChange={(e) => setNewConcept(e.target.value)} options={[{ value: '', label: t('tasks.noConcept') }, ...data.concepts.map((c) => ({ value: c.id, label: c.label }))]} />
          )}
        </div>
      </Modal>

      <Modal
        open={Boolean(attemptFor)}
        onClose={() => setAttemptFor(null)}
        title={t('tasks.try')}
        description={attemptFor?.prompt}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAttemptFor(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => void saveAttempt()} disabled={!response.trim()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="stack">
          <TextArea label={t('tasks.response')} hint={t('tasks.responseHint')} value={response} onChange={(e) => setResponse(e.target.value)} rows={6} data-autofocus />
          <fieldset className="radio-group">
            <legend className="field-label">{t('tasks.selfAssess')}</legend>
            {(['done', 'partial', 'stuck'] as const).map((v) => (
              <label key={v} className="radio">
                <input type="radio" name="assess" value={v} checked={assessment === v} onChange={() => setAssessment(v)} /> {t(`tasks.assess.${v}`)}
              </label>
            ))}
          </fieldset>
          <p className="field-hint">{t('tasks.honest')}</p>
        </div>
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={t('common.edit')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={!editText.trim()}
              onClick={() =>
                void updateTaskPrompt(editing!.id, editText)
                  .then(() => setEditing(null))
                  .catch((e) => reportError(e, 'task-edit'))
              }
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <TextArea label={t('tasks.prompt')} value={editText} onChange={(e) => setEditText(e.target.value)} rows={4} data-autofocus />
      </Modal>
    </div>
  );
}
