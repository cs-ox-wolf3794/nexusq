import { useSyncExternalStore } from 'react';

export type Language = 'en-US' | 'nb-NO';
export type Currency = 'USD' | 'NOK';
export type Preferences = { language: Language; currency: Currency };
export const PREFERENCES_KEY = 'nexusq-preferences-v1';
export function readPreferences(raw: string | null): Preferences {
  try { const p = JSON.parse(raw ?? '{}'); return { language: p?.language === 'nb-NO' ? 'nb-NO' : 'en-US', currency: p?.currency === 'NOK' ? 'NOK' : 'USD' }; }
  catch { return { language: 'en-US', currency: 'USD' }; }
}
function initial() { try { return readPreferences(localStorage.getItem(PREFERENCES_KEY)); } catch { return readPreferences(null); } }
let current = initial();
const listeners = new Set<() => void>();
export const preferences = () => current;
export const locale = () => current.language;
function stamp() { if (typeof document !== 'undefined') document.documentElement.lang = current.language; }
stamp();
export function setPreferences(next: Preferences): boolean {
  current = readPreferences(JSON.stringify(next)); stamp(); listeners.forEach(fn => fn());
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(current)); return true; } catch { return false; }
}
if (typeof window !== 'undefined') window.addEventListener('storage', e => {
  if (e.key === PREFERENCES_KEY || e.key === null) { current = readPreferences(e.newValue); stamp(); listeners.forEach(fn => fn()); }
});
export function usePreferences() {
  return useSyncExternalStore(callback => { listeners.add(callback); return () => listeners.delete(callback); }, preferences, preferences);
}
export function number(value: number, digits = 2, minimum = 0) {
  return Number.isFinite(value) ? new Intl.NumberFormat(locale(), { maximumFractionDigits: digits, minimumFractionDigits: minimum }).format(value) : '—';
}
