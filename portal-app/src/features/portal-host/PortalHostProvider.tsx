import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePortalAuth } from '../auth/PortalAuthContext';
import type { ChatMessage, ProjectChoice } from './portalHostTypes';

interface PortalHostState {
  isOpen: boolean;
  messages: ChatMessage[];
  pendingSelection: { action: 'listen' | 'proposal' | 'visuals' | 'respond'; choices: ProjectChoice[] } | null;
  open: () => void;
  close: () => void;
  addMessage: (message: Omit<ChatMessage, 'id'>) => void;
  setPendingSelection: (value: PortalHostState['pendingSelection']) => void;
}

const PortalHostContext = createContext<PortalHostState | null>(null);

let nextId = 0;

/**
 * In-memory only — React state, nothing written to Supabase, nothing
 * sent anywhere external. Mounted above the router so history
 * survives navigating between the Dashboard and the chambers, but
 * reset entirely the moment the signed-in account changes (including
 * to signed-out) — no conversation ever carries over to a different
 * artist, even in the same browser tab.
 */
export function PortalHostProvider({ children }: { children: ReactNode }) {
  const { session } = usePortalAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingSelection, setPendingSelection] = useState<PortalHostState['pendingSelection']>(null);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    const currentUserId = session?.user?.id ?? null;
    if (currentUserId !== lastUserId.current) {
      lastUserId.current = currentUserId;
      setMessages([]);
      setPendingSelection(null);
      setIsOpen(false);
    }
  }, [session?.user?.id]);

  function addMessage(message: Omit<ChatMessage, 'id'>) {
    nextId += 1;
    setMessages((prev) => [...prev, { ...message, id: `host-${nextId}` }]);
  }

  return (
    <PortalHostContext.Provider
      value={{
        isOpen,
        messages,
        pendingSelection,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
        addMessage,
        setPendingSelection,
      }}
    >
      {children}
    </PortalHostContext.Provider>
  );
}

export function usePortalHost(): PortalHostState {
  const ctx = useContext(PortalHostContext);
  if (!ctx) throw new Error('usePortalHost must be used within PortalHostProvider');
  return ctx;
}
