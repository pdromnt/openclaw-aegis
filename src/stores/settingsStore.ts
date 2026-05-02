import { create } from 'zustand';
import { scopedGet, scopedSet } from '@/utils/scopedStorage';

// ═══════════════════════════════════════════════════════════
// Settings Store
// ═══════════════════════════════════════════════════════════

interface SettingsState {
  theme: 'aegis-dark' | 'aegis-light' | 'aegis-knot';
  fontSize: number;
  sidebarOpen: boolean;
  sidebarWidth: number;
  settingsOpen: boolean;
  language: 'ar' | 'en' | 'zh' | 'es';
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  dndMode: boolean;
  budgetLimit: number;
  commandPaletteOpen: boolean;
  focusMode: boolean;
  toolIntentEnabled: boolean;
  audioAutoPlay: boolean;
  gatewayUrl: string;
  gatewayToken: string;

  setTheme: (theme: string) => void;
  setFontSize: (size: number) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setSettingsOpen: (open: boolean) => void;
  setLanguage: (lang: 'ar' | 'en' | 'zh' | 'es') => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setDndMode: (dnd: boolean) => void;
  setBudgetLimit: (n: number) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleFocusMode: () => void;
  setToolIntentEnabled: (enabled: boolean) => void;
  setAudioAutoPlay: (enabled: boolean) => void;
  setGatewayUrl: (url: string) => void;
  setGatewayToken: (token: string) => void;
  accentColor: string;
  setAccentColor: (color: string) => void;
  uiRoundness: 'sharp' | 'soft' | 'round';
  setUiRoundness: (r: 'sharp' | 'soft' | 'round') => void;
}

const ACCENT_SHADES: Record<string, { 400: string; 500: string; 600: string; raw400: string }> = {
  teal:    { 400: 'var(--color-teal-400)',    500: 'var(--color-teal-500)',    600: 'var(--color-teal-600)',    raw400: 'var(--color-teal-400)' },
  blue:    { 400: 'var(--color-blue-400)',    500: 'var(--color-blue-500)',    600: 'var(--color-blue-600)',    raw400: 'var(--color-blue-400)' },
  purple:  { 400: 'var(--color-purple-400)',  500: 'var(--color-purple-500)',  600: 'var(--color-purple-600)',  raw400: 'var(--color-purple-400)' },
  rose:    { 400: 'var(--color-rose-400)',    500: 'var(--color-rose-500)',    600: 'var(--color-rose-600)',    raw400: 'var(--color-rose-400)' },
  amber:   { 400: 'var(--color-amber-400)',   500: 'var(--color-amber-500)',   600: 'var(--color-amber-600)',   raw400: 'var(--color-amber-400)' },
  emerald: { 400: 'var(--color-emerald-400)', 500: 'var(--color-emerald-500)', 600: 'var(--color-emerald-600)', raw400: 'var(--color-emerald-400)' },
};

// Auto-detect language on first run: check saved → system language → fallback to English
const detectLang = (): 'ar' | 'en' | 'zh' | 'es' => {
  const saved = localStorage.getItem('aegis-language');
  if (saved === 'ar' || saved === 'en' || saved === 'zh' || saved === 'es') return saved;
  // First run — detect from system/browser language
  const sysLang = navigator.language || navigator.languages?.[0] || '';
  if (sysLang.startsWith('ar')) return 'ar';
  if (sysLang.startsWith('zh')) return 'zh';
  if (sysLang.startsWith('es')) return 'es';
  return 'en';
};
const savedLang = detectLang();

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: (localStorage.getItem('aegis-theme') || 'aegis-dark') as 'aegis-dark' | 'aegis-light' | 'aegis-knot',
  fontSize: 14,
  sidebarOpen: true,
  sidebarWidth: 280,
  settingsOpen: false,
  language: savedLang,
  notificationsEnabled: localStorage.getItem('aegis-notifications') !== 'false',
  soundEnabled: localStorage.getItem('aegis-sound') !== 'false',
  dndMode: false,
  budgetLimit: parseFloat(scopedGet('aegis-budget-limit') || '0') || 0,
  commandPaletteOpen: false,
  focusMode: false,
  toolIntentEnabled: scopedGet('aegis-tool-intent') !== 'false',
  audioAutoPlay: scopedGet('aegis-audio-autoplay') === 'true',
  gatewayUrl: localStorage.getItem('aegis-gateway-url') || '',
  gatewayToken: localStorage.getItem('aegis-gateway-token') || '',
  accentColor: localStorage.getItem('aegis-accent-color') || 'teal',

  setTheme: (theme) => {
    localStorage.setItem('aegis-theme', theme);
    set({ theme: theme as 'aegis-dark' | 'aegis-light' | 'aegis-knot' });
    window.aegis?.settings?.save?.('theme', theme).catch?.(() => {});
  },
  setFontSize: (size) => {
    set({ fontSize: size });
    window.aegis?.settings?.save?.('fontSize', size).catch?.(() => {});
  },
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSidebarWidth: (width) => set({ sidebarWidth: width }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setLanguage: (lang: 'ar' | 'en' | 'zh' | 'es') => set({ language: lang }),
  setNotificationsEnabled: (enabled) => { localStorage.setItem('aegis-notifications', String(enabled)); set({ notificationsEnabled: enabled }); },
  setSoundEnabled: (enabled) => { localStorage.setItem('aegis-sound', String(enabled)); set({ soundEnabled: enabled }); },
  setDndMode: (dnd) => set({ dndMode: dnd }),
  setBudgetLimit: (n) => { scopedSet('aegis-budget-limit', String(n)); set({ budgetLimit: n }); },
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleFocusMode: () => set((s) => ({ focusMode: !s.focusMode })),
  setToolIntentEnabled: (enabled) => { scopedSet('aegis-tool-intent', String(enabled)); set({ toolIntentEnabled: enabled }); },
  setAudioAutoPlay: (enabled) => { scopedSet('aegis-audio-autoplay', String(enabled)); set({ audioAutoPlay: enabled }); },
  setGatewayUrl: (url) => {
    localStorage.setItem('aegis-gateway-url', url);
    set({ gatewayUrl: url });
    window.aegis?.settings?.save?.('gatewayUrl', url).catch?.(() => {});
  },
  setGatewayToken: (token) => {
    localStorage.setItem('aegis-gateway-token', token);
    set({ gatewayToken: token });
    window.aegis?.settings?.save?.('gatewayToken', token).catch?.(() => {});
  },
  setAccentColor: (color) => {
    localStorage.setItem('aegis-accent-color', color);
    set({ accentColor: color });
    // Apply CSS override
    const root = document.documentElement;
    const shades = ACCENT_SHADES[color as keyof typeof ACCENT_SHADES];
    if (shades) {
      root.style.setProperty('--aegis-primary', shades[400]);
      root.style.setProperty('--aegis-primary-hover', shades[500]);
      root.style.setProperty('--aegis-primary-deep', shades[600]);
      root.style.setProperty('--aegis-primary-glow', `rgb(${shades.raw400} / 0.16)`);
      root.style.setProperty('--aegis-primary-surface', `rgb(${shades.raw400} / 0.08)`);
    }
  },
  uiRoundness: (localStorage.getItem('aegis-ui-roundness') || 'round') as 'sharp' | 'soft' | 'round',
  setUiRoundness: (r) => {
    localStorage.setItem('aegis-ui-roundness', r);
    set({ uiRoundness: r });
    // Apply CSS variable
    const map = { sharp: '2px', soft: '6px', round: '12px' };
    document.documentElement.style.setProperty('--aegis-radius', map[r]);
  },
}));

// Apply saved accent on load
const savedAccent = localStorage.getItem('aegis-accent-color');
if (savedAccent && savedAccent !== 'teal') {
  useSettingsStore.getState().setAccentColor(savedAccent);
}

// Apply saved roundness on load
const savedRoundness = localStorage.getItem('aegis-ui-roundness');
if (savedRoundness) {
  const map: Record<string, string> = { sharp: '2px', soft: '6px', round: '12px' };
  document.documentElement.style.setProperty('--aegis-radius', map[savedRoundness] || '12px');
}
