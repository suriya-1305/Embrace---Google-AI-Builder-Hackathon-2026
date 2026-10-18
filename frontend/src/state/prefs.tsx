// Device preferences: one-handed mode and the language for voice input.
import { createContext, useContext, useState, type ReactNode } from 'react';

export const VOICE_LANGUAGES = [
  { code: 'en-IN', label: 'English (India)' }, { code: 'hi-IN', label: 'हिन्दी' }, { code: 'ta-IN', label: 'தமிழ்' },
  { code: 'te-IN', label: 'తెలుగు' }, { code: 'kn-IN', label: 'ಕನ್ನಡ' }, { code: 'ml-IN', label: 'മലയാളം' },
  { code: 'bn-IN', label: 'বাংলা' }, { code: 'mr-IN', label: 'मराठी' },
];
interface Prefs { oneHanded: boolean; voiceLanguage: string }
const KEY = 'crysense.prefs.v1';
const Ctx = createContext<{ prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void } | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, set] = useState<Prefs>(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
      const language = saved.voiceLanguage ?? 'en-IN';
      return { oneHanded: saved.oneHanded ?? false, voiceLanguage: VOICE_LANGUAGES.some((item) => item.code === language) ? language : 'en-IN' };
    }
    catch { return { oneHanded: false, voiceLanguage: 'en-IN' }; }
  });
  const setPrefs = (p: Partial<Prefs>) => set((cur) => {
    const next = { ...cur, ...p };
    try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  return <Ctx.Provider value={{ prefs, setPrefs }}>{children}</Ctx.Provider>;
}
export function usePrefs() {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePrefs must be used inside PrefsProvider');
  return v;
}
