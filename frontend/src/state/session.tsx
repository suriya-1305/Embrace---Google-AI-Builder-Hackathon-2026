import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { config } from '../config';
import type { CrySenseApi } from '../api/contract';
import { createMockApi } from '../api/mock/mockApi';
import { createLiveApi } from '../api/live';
import { mockDemoAccounts } from '../auth/mockDemoAccounts';
import { clearLogDrafts } from './logDrafts';
import type { Me, Region } from '../types';

interface Session extends Me { token: string }
interface SessionValue {
  session: Session | null;
  api: CrySenseApi | null;
  ready: boolean;
  region: Region;
  motherUnlocked: boolean;
  unlockMother: () => void;
  setActiveInfant: (infantId: string) => void;
  refreshProfile: () => Promise<Session>;
  signInDemo: (uid: 'u_meera' | 'u_arjun') => Promise<Session>;
  switchDemoAccount: (email: string) => Promise<Session>;
  signInGoogle: () => Promise<Session>;
  sendEmailLink: (email: string) => Promise<void>;
  signInEmailLink: (email: string) => Promise<Session>;
  sendPhoneCode: (phone: string) => Promise<void>;
  verifyPhoneCode: (code: string) => Promise<Session>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);
const STORE_KEY = config.apiMode === 'mock' ? 'embrace.demo.session.v1' : 'crysense.session.v1';

function buildApi(token: string, uid: string, me?: Pick<Me, 'infantId' | 'motherId'>): CrySenseApi {
  if (config.apiMode === 'mock') return createMockApi(uid, me?.infantId ?? undefined);
  return createLiveApi({ token, uid, infantId: me?.infantId ?? null, motherId: me?.motherId ?? null });
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const region: Region = 'IN';
  const [motherUnlocked, setMotherUnlocked] = useState(false);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORE_KEY);
      if (raw) { const s = JSON.parse(raw) as Session; setSession({ ...s, region: 'IN' }); }
    } catch { /* ignore */ }
    setReady(true);
  }, []);

  const api = useMemo(() => (session ? buildApi(session.token, session.uid, session) : null), [session]);

  const finish = useCallback(async (token: string, uid: string, fallbackName = 'Caregiver') => {
    const me = await buildApi(token, uid).me();
    const s: Session = { ...me, displayName: me.displayName || fallbackName, region: 'IN', token };
    setSession(s); setMotherUnlocked(false);
    try { window.sessionStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
    return s;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session) throw new Error('Not signed in');
    const me = await buildApi(session.token, session.uid).me();
    const infantIds = me.infantIds ?? (me.infantId ? [me.infantId] : []);
    const next: Session = { ...me, infantId: infantIds.includes(session.infantId ?? '') ? session.infantId : me.infantId, infantIds, region: 'IN', token: session.token };
    setSession(next);
    try { window.sessionStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  }, [session]);

  const setActiveInfant = useCallback((infantId: string) => {
    if (!session) return;
    const infantIds = session.infantIds ?? (session.infantId ? [session.infantId] : []);
    if (!infantIds.includes(infantId)) return;
    const next = { ...session, infantId, infantIds };
    setSession(next);
    try { window.sessionStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }, [session]);

  const value: SessionValue = {
    session, api, ready, region, motherUnlocked, refreshProfile, setActiveInfant,
    unlockMother: () => setMotherUnlocked(true),
    signInDemo: (uid) => finish(`mock-${uid}`, uid),
    switchDemoAccount: async (email) => {
      if (config.authMode !== 'demo' || config.apiMode !== 'mock') throw new Error('These accounts are available only in mock mode.');
      const account = mockDemoAccounts.find((item) => item.email === email);
      if (!account) throw new Error('Choose one of the sample families.');
      clearLogDrafts();
      return finish(`mock-${account.uid}`, account.uid);
    },
    signInGoogle: async () => {
      const { signInWithGoogle } = await import('../auth/firebase');
      const u = await signInWithGoogle();
      return finish(u.token, u.uid, u.displayName);
    },
    sendEmailLink: async (email) => { const { sendEmailSignInLink } = await import('../auth/firebase'); await sendEmailSignInLink(email); },
    signInEmailLink: async (email) => { const { finishEmailSignInLink } = await import('../auth/firebase'); const u = await finishEmailSignInLink(email); return finish(u.token, u.uid, u.displayName); },
    sendPhoneCode: async (phone) => { const { sendPhoneOtp } = await import('../auth/firebase'); await sendPhoneOtp(phone); },
    verifyPhoneCode: async (code) => { const { finishPhoneOtp } = await import('../auth/firebase'); const u = await finishPhoneOtp(code); return finish(u.token, u.uid, u.displayName); },
    signOut: async () => {
      if (config.authMode === 'firebase') { const { signOutGoogle } = await import('../auth/firebase'); await signOutGoogle(); }
      setSession(null); setMotherUnlocked(false);
      clearLogDrafts();
      try { window.sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}
export function useApi(): CrySenseApi {
  const { api } = useSession();
  if (!api) throw new Error('Not signed in');
  return api;
}
