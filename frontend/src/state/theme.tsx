// "Nightlight" theme: automatic dimming from 8 pm to 6 am, or fixed day/night.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeMode = 'auto' | 'day' | 'night' | 'red';
const Ctx = createContext<{ mode: ThemeMode; setMode: (m: ThemeMode) => void; isNight: boolean } | null>(null);
const KEY = 'crysense.theme.v1';
const nightNow = () => { const h = new Date().getHours(); return h >= 20 || h < 6; };

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => { try { return (window.localStorage.getItem(KEY) as ThemeMode) || 'auto'; } catch { return 'auto'; } });
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = window.setInterval(() => setTick((t) => t + 1), 60000); return () => window.clearInterval(id); }, []);
  const isNight = mode === 'night' || mode === 'red' || (mode === 'auto' && nightNow());
  useEffect(() => {
    document.documentElement.dataset.theme = mode === 'red' ? 'red' : isNight ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'red' ? '#140708' : isNight ? '#15132A' : '#EEE9F8');
  }, [isNight, mode, tick]);
  const setMode = (m: ThemeMode) => { setModeState(m); try { window.localStorage.setItem(KEY, m); } catch { /* ignore */ } };
  return <Ctx.Provider value={{ mode, setMode, isNight }}>{children}</Ctx.Provider>;
}
export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTheme must be used inside ThemeProvider');
  return v;
}
