import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { FileText } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useApp } from '../../app/AppContext';
import { Button, Spinner } from '../../components/ui';
import { getSourceFile } from '../../services/sources';
import type { Source } from '../../domain/types';

/** PDF "Orijinal sayfa" görünümü: sayfalar görünür oldukça tuvale çizilir (tembel yükleme). */
export function PageView({ source, initialPage, onOpenText }: { source: Source; initialPage: number; onOpenText: (page: number) => void }) {
  const { t } = useI18n();
  const { reportError } = useApp();
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    let loaded: PDFDocumentProxy | null = null;
    void (async () => {
      try {
        const blob = await getSourceFile(source);
        if (!blob) throw new Error('missing');
        const { openPdf } = await import('../../adapters/pdf/pdf');
        // Parola korumalı PDF'lerde sayfa görünümü parolasız açılamaz; metin görünümü çalışmaya devam eder.
        loaded = await openPdf(new Uint8Array(await blob.arrayBuffer()));
        if (live) setDoc(loaded);
        else void loaded.destroy();
      } catch (e) {
        if (live) {
          setFailed(true);
          reportError(e, 'page-view');
        }
      }
    })();
    return () => {
      live = false;
      void loaded?.destroy();
    };
    // Kaynak nesnesi her veri yenilemesinde değişir; yalnızca dosya değişince yeniden yükle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.id, source.storageRef]);

  useEffect(() => {
    if (!doc) return;
    const el = wrapRef.current?.querySelector(`[data-page="${initialPage}"]`);
    el?.scrollIntoView({ block: 'start' });
    // yalnızca belge yüklendiğinde
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  if (failed) return <p className="muted">{t('reader.pageViewFailed')}</p>;
  if (!doc) return <Spinner label={t('reader.loadingPages')} />;
  return (
    <div className="page-view" ref={wrapRef}>
      {Array.from({ length: doc.numPages }, (_, i) => (
        <PdfPage key={i + 1} doc={doc} pageNumber={i + 1} onOpenText={onOpenText} hasText={source.processingStatus === 'ready'} />
      ))}
    </div>
  );
}

function PdfPage({ doc, pageNumber, onOpenText, hasText }: { doc: PDFDocumentProxy; pageNumber: number; onOpenText: (p: number) => void; hasText: boolean }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !rendered && canvasRef.current) {
          setRendered(true);
          const width = Math.min(el.clientWidth || 800, 900);
          void import('../../adapters/pdf/pdf').then(({ renderPdfPage }) => renderPdfPage(doc, pageNumber, canvasRef.current!, width)).catch(() => setRendered(false));
        }
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [doc, pageNumber, rendered]);

  return (
    <section className="pdf-page" ref={ref} data-page={pageNumber} aria-label={t('common.pageN', { n: pageNumber })}>
      <div className="pdf-page-head">
        <span>{t('common.pageN', { n: pageNumber })}</span>
        {hasText && (
          <Button size="sm" variant="ghost" icon={FileText} onClick={() => onOpenText(pageNumber)}>
            {t('reader.openInText')}
          </Button>
        )}
      </div>
      <canvas ref={canvasRef} className="pdf-canvas" role="img" aria-label={t('reader.pageImage', { n: pageNumber })} />
    </section>
  );
}
