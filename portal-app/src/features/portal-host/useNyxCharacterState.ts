import { useEffect, useRef, useState } from 'react';
import { NYX_SEQUENCES, type NyxCharacterState } from './nyxCharacterState';

type SequenceName = keyof typeof NYX_SEQUENCES;

export interface NyxCharacterController {
  state: NyxCharacterState;
  greet: () => void;
  listenThenSpeak: () => void;
  present: () => void;
  fail: () => void;
  /** Stops any pending sequence and returns to idle immediately —
   * used when the chat closes, so nothing keeps animating behind a
   * dialog that is no longer open. */
  reset: () => void;
}

/**
 * Stage K1.6A.2 — schedules the NYX_SEQUENCES as real timers, with one
 * rule enforced throughout: only the MOST RECENTLY triggered sequence
 * may ever change what's displayed. Every call bumps a generation
 * counter and clears every previously-scheduled timer, so an earlier
 * interaction's delayed "speaking"/"idle" step can never land after a
 * newer interaction has already moved the character on — the exact
 * race this hook exists to prevent.
 */
export function useNyxCharacterState(): NyxCharacterController {
  const [state, setState] = useState<NyxCharacterState>('idle');
  const generationRef = useRef(0);
  const timerIdsRef = useRef<number[]>([]);

  function clearPendingTimers() {
    timerIdsRef.current.forEach((id) => window.clearTimeout(id));
    timerIdsRef.current = [];
  }

  useEffect(() => clearPendingTimers, []);

  function run(name: SequenceName) {
    clearPendingTimers();
    const myGeneration = ++generationRef.current;
    for (const step of NYX_SEQUENCES[name]) {
      const id = window.setTimeout(() => {
        if (generationRef.current !== myGeneration) return;
        setState(step.state);
      }, step.afterMs);
      timerIdsRef.current.push(id);
    }
  }

  function reset() {
    clearPendingTimers();
    generationRef.current += 1;
    setState('idle');
  }

  return {
    state,
    greet: () => run('greet'),
    listenThenSpeak: () => run('listenThenSpeak'),
    present: () => run('present'),
    fail: () => run('fail'),
    reset,
  };
}
