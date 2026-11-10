import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export interface Me {
  id: string;
  name: string;
}

const STORAGE_KEY = 'rally.me';

function load(): Me | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const v = raw ? (JSON.parse(raw) as Me) : null;
    return v && typeof v.id === 'string' && typeof v.name === 'string' ? v : null;
  } catch {
    return null;
  }
}

interface IdentityValue {
  me: Me | null;
  setMe: (me: Me | null) => void;
  /** Open the "Who are you?" picker. */
  switching: boolean;
  setSwitching: (v: boolean) => void;
}

const IdentityContext = createContext<IdentityValue | null>(null);

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [me, setMeState] = useState<Me | null>(load);
  const [switching, setSwitching] = useState(false);
  const setMe = useCallback((v: Me | null) => {
    setMeState(v);
    try {
      if (v) localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* private mode: identity just won't persist */
    }
  }, []);
  const value = useMemo(() => ({ me, setMe, switching, setSwitching }), [me, setMe, switching]);
  return <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useIdentity() {
  const ctx = useContext(IdentityContext);
  if (!ctx) throw new Error('useIdentity outside IdentityProvider');
  return ctx;
}
