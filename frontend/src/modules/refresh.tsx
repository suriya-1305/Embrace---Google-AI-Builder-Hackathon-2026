// Lets any action (a saved log, a toggled module) refresh all home widgets.
import { createContext, useContext, useState, type ReactNode } from 'react';
const Ctx = createContext<{ version: number; bump: () => void }>({ version: 0, bump: () => undefined });
export function RefreshProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  return <Ctx.Provider value={{ version, bump: () => setVersion((v) => v + 1) }}>{children}</Ctx.Provider>;
}
export const useRefresh = () => useContext(Ctx);
