import { useRef, useState } from 'react';
import { ScanText } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useApp } from '../../app/AppContext';
import { Button, ProgressBar, SelectField } from '../../components/ui';
import { runOcr, type OcrLang } from '../../services/ocr';
import { applyOcrResult } from '../../services/sources';
import { isAppError } from '../../domain/errors';
import type { Source } from '../../domain/types';

/** Taranmış PDF ve görseller için yerel metin tanıma. İptal edilebilir; sonuç "OCR metni" olarak işaretlenir. */
export function OcrAction({ source }: { source: Source }) {
  const { t } = useI18n();
  const { toast, reportError } = useApp();
  const [lang, setLang] = useState<OcrLang>('tur+eng');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const ctrl = useRef<AbortController | null>(null);

  const start = async () => {
    setRunning(true);
    setProgress(0);
    ctrl.current = new AbortController();
    try {
      const res = await runOcr(source, { lang, onProgress: setProgress, signal: ctrl.current.signal });
      await applyOcrResult(source.id, res.drafts, { confidence: res.confidence, pages: res.pages, langs: lang });
      toast(res.drafts.length ? t('ocr.done', { n: res.drafts.length }) : t('ocr.nothing'), { tone: res.drafts.length ? 'success' : 'info' });
    } catch (e) {
      if (isAppError(e) && e.code === 'SRC-006') toast(t('ocr.cancelled'));
      else reportError(e, 'ocr');
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="ocr-action" aria-labelledby="ocr-title">
      <h2 id="ocr-title" className="section-mini">
        <ScanText size={18} aria-hidden="true" /> {t('ocr.title')}
      </h2>
      <p className="field-hint">{t('ocr.intro')}</p>
      {running ? (
        <div className="stack-sm">
          <ProgressBar value={progress * 100} label={t('ocr.progress')} showValue />
          <Button size="sm" variant="ghost" onClick={() => ctrl.current?.abort()}>
            {t('common.cancel')}
          </Button>
        </div>
      ) : (
        <div className="row-wrap ocr-row">
          <SelectField
            label={t('ocr.lang')}
            value={lang}
            onChange={(e) => setLang(e.target.value as OcrLang)}
            options={[
              { value: 'tur+eng', label: t('ocr.langBoth') },
              { value: 'tur', label: t('ocr.langTur') },
              { value: 'eng', label: t('ocr.langEng') },
            ]}
          />
          <Button variant="primary" icon={ScanText} onClick={() => void start()}>
            {t('ocr.run')}
          </Button>
        </div>
      )}
    </section>
  );
}
