export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}
export function sinceLabel(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return 'Not yet';
  const m = Math.max(0, minutesBetween(new Date(iso), now));
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}
export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const dayOf = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
export const shortDay = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: 'narrow' });
export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}
export function ageLabel(days: number): string {
  if (days < 14) return `${days} days old`;
  if (days < 84) return `${Math.floor(days / 7)} weeks old`;
  return `${Math.floor(days / 30.4)} months old`;
}
/** Local ISO with offset, e.g. 2026-10-16T20:05:00+05:30 */
export function localIso(d = new Date()): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.floor(off / 60))}:${pad(off % 60)}`;
}
export function toInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export const fromInputValue = (v: string) => localIso(new Date(v));
export const todayIso = (d = new Date()) => localIso(d).slice(0, 10);
