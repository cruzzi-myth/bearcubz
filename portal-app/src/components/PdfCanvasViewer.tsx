import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './private-proposal-viewer.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

type FitMode = 'width' | 'page' | 'custom';
const MIN_SCALE = 0.4;
const MAX_SCALE = 3;
const ZOOM_STEP = 0.2;

type Props = {
  /** A real, already-authorized signed URL (or null while one is
   * still being requested) — this component never decides
   * authorization itself, only renders whatever URL it's given. */
  url: string | null;
  label: string;
};

/**
 * The real PDF.js page-by-page renderer — page navigation, zoom,
 * Fit Width/Fit Page, all against a <canvas>, never a browser
 * <iframe> embed. Extracted out of PrivateProposalViewer (Stage
 * K1.6B addendum) so Stage K1.6C's attachment PDF viewer can reuse
 * the exact same renderer instead of a second implementation —
 * PrivateProposalViewer and AttachmentDocumentViewer both wrap this
 * with their own signed-URL source and chrome (notice banner, close
 * button).
 */
export function PdfCanvasViewer({ url, label }: Props) {
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState(1);
  const [fitMode, setFitMode] = useState<FitMode>('width');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setLoadError(null);
    setPdf(null);
    const loadingTask = pdfjsLib.getDocument({ url });
    loadingTask.promise.then(
      (doc) => {
        if (cancelled) return;
        setPdf(doc);
        setPageNum(1);
      },
      (err) => {
        if (cancelled) return;
        setLoadError(err?.message ?? 'Failed to load document');
      },
    );
    return () => {
      cancelled = true;
      loadingTask.destroy();
    };
  }, [url]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    setRendering(true);

    pdf.getPage(pageNum).then(async (page) => {
      if (cancelled) return;
      renderTaskRef.current?.cancel();

      const baseViewport = page.getViewport({ scale: 1 });
      let effectiveScale = scale;
      const containerWidth = viewportRef.current?.clientWidth ?? baseViewport.width;
      if (fitMode === 'width') {
        effectiveScale = (containerWidth - 24) / baseViewport.width;
      } else if (fitMode === 'page') {
        const containerHeight = viewportRef.current?.clientHeight ?? baseViewport.height;
        effectiveScale = Math.min((containerWidth - 24) / baseViewport.width, (containerHeight - 24) / baseViewport.height);
      }
      effectiveScale = Math.min(Math.max(effectiveScale, MIN_SCALE), MAX_SCALE);

      const viewport = page.getViewport({ scale: effectiveScale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');
      if (!context) return;

      const task = page.render({ canvasContext: context, viewport, canvas });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch (err) {
        if (!cancelled && (err as { name?: string })?.name !== 'RenderingCancelledException') {
          setLoadError('Failed to render this page.');
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    });

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageNum, scale, fitMode]);

  useEffect(() => {
    if (fitMode === 'custom') return;
    function onResize() {
      setPageNum((p) => p);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fitMode]);

  const numPages = pdf?.numPages ?? 0;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight') goToPage(pageNum + 1);
    else if (e.key === 'ArrowLeft') goToPage(pageNum - 1);
  }
  function goToPage(n: number) {
    if (n < 1 || n > numPages) return;
    setPageNum(n);
  }
  function zoomIn() {
    setFitMode('custom');
    setScale((s) => Math.min(s + ZOOM_STEP, MAX_SCALE));
  }
  function zoomOut() {
    setFitMode('custom');
    setScale((s) => Math.max(s - ZOOM_STEP, MIN_SCALE));
  }

  if (!url) return <p className="sp-proposal__empty">Requesting secure document access…</p>;

  return (
    <div className="sp-pdf">
      <div className="sp-pdf__toolbar">
        <div className="sp-pdf__pager">
          <button type="button" onClick={() => goToPage(pageNum - 1)} disabled={!pdf || pageNum <= 1} aria-label="Previous page">
            ‹
          </button>
          <span className="sp-pdf__page-indicator">{pdf ? `Page ${pageNum} of ${numPages}` : '—'}</span>
          <button type="button" onClick={() => goToPage(pageNum + 1)} disabled={!pdf || pageNum >= numPages} aria-label="Next page">
            ›
          </button>
        </div>
        <div className="sp-pdf__zoom">
          <button type="button" onClick={zoomOut} disabled={!pdf} aria-label="Zoom out">
            −
          </button>
          <button type="button" className={fitMode === 'width' ? 'sp-pdf__fit-btn sp-pdf__fit-btn--active' : 'sp-pdf__fit-btn'} onClick={() => setFitMode('width')} disabled={!pdf}>
            Fit Width
          </button>
          <button type="button" className={fitMode === 'page' ? 'sp-pdf__fit-btn sp-pdf__fit-btn--active' : 'sp-pdf__fit-btn'} onClick={() => setFitMode('page')} disabled={!pdf}>
            Fit Page
          </button>
          <button type="button" onClick={zoomIn} disabled={!pdf} aria-label="Zoom in">
            +
          </button>
        </div>
      </div>

      <div className="sp-pdf__canvas-viewport" ref={viewportRef} tabIndex={0} role="img" aria-label={`${label}, page ${pageNum} of ${numPages || '…'}`} onKeyDown={handleKeyDown}>
        {loadError && <p className="sp-proposal__empty">{loadError}</p>}
        {!loadError && !pdf && <p className="sp-proposal__empty">Loading document…</p>}
        <canvas ref={canvasRef} style={{ display: pdf && !loadError ? 'block' : 'none', opacity: rendering ? 0.6 : 1 }} />
      </div>
    </div>
  );
}
