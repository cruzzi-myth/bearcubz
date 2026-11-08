import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { portalAsset } from '../../lib/assetPath';
import { PORTAL_HOST_CONFIG } from './portalHostConfig';

type Point = { x: number; y: number };

const STORAGE_KEY = 'sp-host-companion-position';
const DRAG_THRESHOLD_PX = 6;
const EDGE_MARGIN_PX = 8;

function readStoredPosition(): Point | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return parsed;
    return null;
  } catch {
    // Private-mode / storage-blocked browsers: the companion just
    // always starts at its default corner instead of erroring.
    return null;
  }
}

function writeStoredPosition(point: Point | null) {
  try {
    if (point) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(point));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same as above — persistence is a convenience, never required.
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Stage K1.6A.1 — the standalone, draggable, full-body NYX ARDENT
 * launcher. Entirely self-contained: it only ever calls the `onOpen`
 * prop it's given (PortalHost.tsx still owns every actual chat
 * state/API concern) and never reads or writes anything beyond its
 * own on-screen position, which is a per-browser convenience, never
 * an authorization or chat-state mechanism.
 */
export function NyxCompanion({ onOpen }: { onOpen: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Point | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{ pointerId: number; startX: number; startY: number; startLeft: number; startTop: number; dragged: boolean } | null>(null);
  const suppressNextClickRef = useRef(false);

  // Apply + clamp any stored position only once the element has real
  // dimensions to clamp against (clamp() sizing means that isn't
  // known until layout).
  useLayoutEffect(() => {
    const stored = readStoredPosition();
    if (!stored || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    setPosition({
      x: clamp(stored.x, EDGE_MARGIN_PX, window.innerWidth - rect.width - EDGE_MARGIN_PX),
      y: clamp(stored.y, EDGE_MARGIN_PX, window.innerHeight - rect.height - EDGE_MARGIN_PX),
    });
    // Mount only — a user mid-session resize is handled by the
    // listener below, not by re-reading storage again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A viewport that shrinks after a position was set (rotation, zoom,
  // resize) must never leave Nyx permanently inaccessible offscreen.
  useEffect(() => {
    function handleResize() {
      if (!wrapRef.current) return;
      setPosition((prev) => {
        if (!prev) return prev;
        const rect = wrapRef.current!.getBoundingClientRect();
        const next = {
          x: clamp(prev.x, EDGE_MARGIN_PX, window.innerWidth - rect.width - EDGE_MARGIN_PX),
          y: clamp(prev.y, EDGE_MARGIN_PX, window.innerHeight - rect.height - EDGE_MARGIN_PX),
        };
        return next.x === prev.x && next.y === prev.y ? prev : next;
      });
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  function handlePointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (e.button !== undefined && e.button !== 0) return;
    const rect = wrapRef.current!.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      dragged: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    drag.dragged = true;
    setIsDragging(true);
    const rect = wrapRef.current!.getBoundingClientRect();
    setPosition({
      x: clamp(drag.startLeft + dx, EDGE_MARGIN_PX, window.innerWidth - rect.width - EDGE_MARGIN_PX),
      y: clamp(drag.startTop + dy, EDGE_MARGIN_PX, window.innerHeight - rect.height - EDGE_MARGIN_PX),
    });
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (drag.dragged) {
      // The click that follows pointerup is the SAME gesture as this
      // drag, not a separate activation — suppress exactly that one
      // click so dragging never also opens the chat.
      suppressNextClickRef.current = true;
      setPosition((current) => {
        writeStoredPosition(current);
        return current;
      });
    }
    dragStateRef.current = null;
    setIsDragging(false);
  }

  function handleClick() {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    onOpen();
  }

  function handleResetPosition() {
    writeStoredPosition(null);
    setPosition(null);
  }

  const customStyle: CSSProperties = position
    ? { left: `${position.x}px`, top: `${position.y}px`, right: 'auto', bottom: 'auto' }
    : {};

  return (
    <div
      ref={wrapRef}
      className={isDragging ? 'sp-host__companion-wrap sp-host__companion-wrap--dragging' : 'sp-host__companion-wrap'}
      style={customStyle}
    >
      <button
        type="button"
        className="sp-host__companion"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleClick}
        aria-label={`Open ${PORTAL_HOST_CONFIG.displayName}, Signal Portal host`}
      >
        <img src={portalAsset(PORTAL_HOST_CONFIG.standaloneArtworkSrc)} alt="" aria-hidden="true" draggable={false} />
      </button>
      {position && (
        <button
          type="button"
          className="sp-host__companion-reset"
          onClick={handleResetPosition}
          aria-label={`Reset ${PORTAL_HOST_CONFIG.displayName}'s position`}
        >
          ⟲
        </button>
      )}
    </div>
  );
}
