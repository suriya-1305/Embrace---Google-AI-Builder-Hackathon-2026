// The module system. Every feature is a module: an id, a space, a home widget
// and (optionally) its own screen. Families switch modules on or off in the
// library, so the home screen only shows what they use.
import { createContext, useContext, useState, type ComponentType, type ReactNode } from 'react';
import type { IconName } from '../components/Icon';

export type Space = 'baby' | 'mom';
export type TileSize = 's' | 'm' | 'l';
export interface ModuleDef {
  id: string; space: Space; title: string; blurb: string; icon: IconName;
  hue: 'lilac' | 'blush' | 'mint' | 'butter' | 'sky' | 'peach';
  size: TileSize; defaultOn: boolean; route?: string; Widget?: ComponentType;
}
export interface RoadmapItem { id: string; title: string; blurb: string; icon: IconName }

const KEY = 'crysense.modules.v3';
const Ctx = createContext<{ enabled: Set<string>; toggle: (id: string, on: boolean) => void } | null>(null);
let registry: ModuleDef[] = [];
export const registerModules = (defs: ModuleDef[]) => { registry = defs; };
export const allModules = () => registry;

export function ModulesProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState<Set<string>>(() => {
    try { const raw = window.localStorage.getItem(KEY); if (raw) return new Set(JSON.parse(raw) as string[]); } catch { /* ignore */ }
    return new Set(registry.filter((m) => m.defaultOn).map((m) => m.id));
  });
  const toggle = (id: string, on: boolean) => setEnabled((cur) => {
    const next = new Set(cur); if (on) next.add(id); else next.delete(id);
    try { window.localStorage.setItem(KEY, JSON.stringify([...next])); } catch { /* ignore */ }
    return next;
  });
  return <Ctx.Provider value={{ enabled, toggle }}>{children}</Ctx.Provider>;
}
export function useModules() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useModules must be used inside ModulesProvider');
  return v;
}

export const ROADMAP: RoadmapItem[] = [
  { id: 'wearable', title: 'Watch and "Hey Google" logging', blurb: '"Hey Google, log a wet diaper" or one tap on a watch.', icon: 'mic' },
  { id: 'digest', title: 'Scheduled weekly notifications', blurb: 'Optional scheduled delivery of the summaries already available in Insights.', icon: 'chart' },
];
