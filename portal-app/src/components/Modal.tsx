import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './modal.css';

type Props = {
  titleId: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Stage K1.4 — a real accessible dialog shell: focus trap (Tab/Shift+Tab
 * cycle inside, never escaping to the page behind), Escape to close,
 * focus restored to whatever triggered it on unmount, role="dialog"
 * aria-modal so assistive tech treats the page behind as inert. The
 * existing GalleryLightbox (Stage I2E) only does Escape-to-close, no
 * focus trap/restore — this is a genuinely new, stronger primitive the
 * Briefing Modal needs, not a second copy of something equivalent
 * already in the codebase.
 */
export function Modal({ titleId, onClose, children, className }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    document.body.style.overflow = 'hidden';

    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (first ?? dialog)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = '';
      if (previouslyFocused.current instanceof HTMLElement) previouslyFocused.current.focus();
    };
  }, [onClose]);

  // Stage K1.6P fix: rendered inline (not via a portal) before this,
  // every usage was nested inside whatever DOM tree called it — fine
  // as long as no ancestor established its own stacking context with
  // a z-index that a LATER sibling also used, since this dialog's own
  // z-index (in modal.css) only ever ranks it among siblings within
  // whatever stacking context it's trapped in, not globally. Found
  // for real: PortalChamberLayout's header (z-index 2) sits before
  // its own <main> (also z-index 2) in DOM order, so a Modal opened
  // from inside that header painted BEHIND <main> despite its own
  // z-index of 300 — confirmed via a real browser test where a click
  // inside the open dialog was intercepted by <main>. A portal to
  // document.body removes this dialog from that tree entirely, so its
  // own z-index is finally compared at the document's top level,
  // where nothing else competes with it — fixes every existing caller
  // (CollaborationBriefingModal, PrivateProposalViewer,
  // DeleteAssetDialog) the same way, not just this one.
  return createPortal(
    <div className="sp-modal__overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} className={`sp-modal__dialog ${className ?? ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
