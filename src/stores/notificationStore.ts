import { create } from 'zustand';
import { scopedGet, scopedSet } from '@/utils/scopedStorage';

// ═══════════════════════════════════════════════════════════
// Notification Store — Toasts + Persistent History
//
// Toasts: ephemeral popups (max 3, auto-expire 5s)
// History: persistent log (max 200, stored in localStorage)
// Categories: exec-approval, cron-result, error, model-fallback, system, message
// ═══════════════════════════════════════════════════════════

// ── Types ────────────────────────────────────────────────

export type NotificationCategory =
  | 'exec-approval'
  | 'plugin-approval'
  | 'cron-result'
  | 'error'
  | 'model-fallback'
  | 'system'
  | 'message';

export type NotificationSeverity = 'info' | 'warning' | 'error' | 'success';

export interface Toast {
  id: string;
  type: string;
  title: string;
  body: string;
  timestamp: string;
  expiresAt: number;
}

export interface Notification {
  id: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
  /** Optional route to navigate to when clicked */
  route?: string;
}

// ── State ────────────────────────────────────────────────

interface NotificationState {
  // Ephemeral toasts (unchanged behavior)
  toasts: Toast[];
  addToast: (type: string, title: string, body: string) => void;
  removeToast: (id: string) => void;

  // Persistent history
  history: Notification[];
  unreadCount: number;

  /** Add a notification to history (and optionally show as toast) */
  addNotification: (opts: {
    category: NotificationCategory;
    severity: NotificationSeverity;
    title: string;
    body: string;
    route?: string;
    showToast?: boolean;
  }) => void;

  /** Mark a single notification as read */
  markRead: (id: string) => void;

  /** Mark all notifications as read */
  markAllRead: () => void;

  /** Clear all history */
  clearHistory: () => void;
}

// ── Persistence helpers ──────────────────────────────────

const STORAGE_KEY = 'aegis-notification-history';
const MAX_HISTORY = 200;

function loadHistory(): Notification[] {
  try {
    const raw = scopedGet(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: Notification[]) {
  try {
    scopedSet(STORAGE_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch { /* localStorage full — silent fail */ }
}

// ── Store ────────────────────────────────────────────────

const initialHistory = loadHistory();

export const useNotificationStore = create<NotificationState>((set, get) => ({
  // ── Toasts (ephemeral) ──
  toasts: [],

  addToast: (type, title, body) => set((state) => {
    const toast: Toast = {
      id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      title,
      body,
      timestamp: new Date().toISOString(),
      expiresAt: Date.now() + 5000,
    };
    const current = state.toasts.length >= 3
      ? state.toasts.slice(-(3 - 1))
      : state.toasts;
    return { toasts: [...current, toast] };
  }),

  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter((t) => t.id !== id),
  })),

  // ── History (persistent) ──
  history: initialHistory,
  unreadCount: initialHistory.filter((n) => !n.read).length,

  addNotification: ({ category, severity, title, body, route, showToast = true }) => {
    const notification: Notification = {
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      category,
      severity,
      title,
      body,
      timestamp: new Date().toISOString(),
      read: false,
      route,
    };

    set((state) => {
      const history = [notification, ...state.history].slice(0, MAX_HISTORY);
      saveHistory(history);
      return {
        history,
        unreadCount: history.filter((n) => !n.read).length,
      };
    });

    // Also show as toast if requested
    if (showToast) {
      get().addToast(category, title, body);
    }
  },

  markRead: (id) => set((state) => {
    const history = state.history.map((n) =>
      n.id === id ? { ...n, read: true } : n
    );
    saveHistory(history);
    return { history, unreadCount: history.filter((n) => !n.read).length };
  }),

  markAllRead: () => set((state) => {
    const history = state.history.map((n) => ({ ...n, read: true }));
    saveHistory(history);
    return { history, unreadCount: 0 };
  }),

  clearHistory: () => {
    saveHistory([]);
    set({ history: [], unreadCount: 0 });
  },
}));
