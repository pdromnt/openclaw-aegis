// ═══════════════════════════════════════════════════════════
// NotificationDrawer — Slide-out notification history panel
// Bell icon in TitleBar → opens this drawer from the right
// Filter tabs: All / Errors / Approvals / Cron / System
// ═══════════════════════════════════════════════════════════

import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Bell, CheckCheck, Trash2,
  ShieldAlert, Clock, Plug, AlertTriangle, RefreshCw, MessageSquare,
} from 'lucide-react';
import {
  useNotificationStore,
  type Notification,
  type NotificationCategory,
} from '@/stores/notificationStore';
import clsx from 'clsx';

// ── Filter config ────────────────────────────────────────

type FilterKey = 'all' | 'error' | 'approval' | 'cron' | 'system';

const FILTER_CATS: Record<FilterKey, NotificationCategory[] | null> = {
  all: null,
  error: ['error'],
  approval: ['exec-approval'],
  cron: ['cron-result'],
  system: ['system', 'model-fallback'],
};

// ── Icon + color helpers ─────────────────────────────────

function notifIcon(n: Notification) {
  switch (n.category) {
    case 'exec-approval': return <ShieldAlert size={14} />;
    case 'cron-result': return <Clock size={14} />;
    case 'model-fallback': return <RefreshCw size={14} />;
    case 'system': return <Plug size={14} />;
    case 'error': return <AlertTriangle size={14} />;
    case 'message': return <MessageSquare size={14} />;
    default: return <Bell size={14} />;
  }
}

function iconBg(severity: string) {
  switch (severity) {
    case 'success': return 'bg-emerald-500/10 text-emerald-400';
    case 'warning': return 'bg-amber-500/10 text-amber-400';
    case 'error': return 'bg-red-500/10 text-red-400';
    default: return 'bg-blue-500/10 text-blue-400';
  }
}

function badgeClass(cat: NotificationCategory) {
  switch (cat) {
    case 'exec-approval': return 'bg-amber-500/15 text-amber-400';
    case 'cron-result': return 'bg-purple-500/15 text-purple-400';
    case 'model-fallback': return 'bg-orange-500/15 text-orange-400';
    case 'error': return 'bg-red-500/15 text-red-400';
    case 'system': return 'bg-blue-500/15 text-blue-400';
    case 'message': return 'bg-teal-500/15 text-teal-400';
    default: return 'bg-zinc-500/15 text-zinc-400';
  }
}

function badgeLabel(cat: NotificationCategory) {
  switch (cat) {
    case 'exec-approval': return 'approval';
    case 'cron-result': return 'cron';
    case 'model-fallback': return 'fallback';
    default: return cat;
  }
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ── Component ────────────────────────────────────────────

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationDrawer({ open, onClose }: NotificationDrawerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { history, unreadCount, markRead, markAllRead, clearHistory } = useNotificationStore();
  const [filter, setFilter] = useState<FilterKey>('all');

  const filtered = useMemo(() => {
    const cats = FILTER_CATS[filter];
    if (!cats) return history;
    return history.filter((n) => cats.includes(n.category));
  }, [history, filter]);

  // Count per filter
  const counts = useMemo(() => ({
    all: history.length,
    error: history.filter((n) => n.category === 'error').length,
    approval: history.filter((n) => n.category === 'exec-approval').length,
    cron: history.filter((n) => n.category === 'cron-result').length,
    system: history.filter((n) => n.category === 'system' || n.category === 'model-fallback').length,
  }), [history]);

  const handleClick = useCallback((n: Notification) => {
    markRead(n.id);
    if (n.route) {
      navigate(n.route);
      onClose();
    }
  }, [markRead, navigate, onClose]);

  return (
    <>
      {/* Overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 z-[90]"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Drawer */}
      <div
        className={clsx(
          'fixed top-0 right-0 w-[380px] h-full z-[100]',
          'bg-aegis-elevated-solid border-l border-aegis-border',
          'flex flex-col shadow-2xl',
          'transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-aegis-border">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-aegis-text-muted" />
            <span className="text-[14px] font-semibold text-aegis-text">
              {t('notifications.title', 'Notifications')}
            </span>
            {unreadCount > 0 && (
              <span className="text-[10px] text-aegis-text-dim">
                {unreadCount} {t('notifications.unread', 'unread')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-aegis-text-muted
                  bg-[rgb(var(--aegis-overlay)/0.03)] border border-[rgb(var(--aegis-overlay)/0.08)]
                  hover:bg-[rgb(var(--aegis-overlay)/0.06)] hover:text-aegis-text-secondary transition-colors"
              >
                <CheckCheck size={12} />
                {t('notifications.markAllRead', 'Mark all read')}
              </button>
            )}
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-aegis-text-muted
                  bg-[rgb(var(--aegis-overlay)/0.03)] border border-[rgb(var(--aegis-overlay)/0.08)]
                  hover:bg-[rgb(var(--aegis-overlay)/0.06)] hover:text-aegis-text-secondary transition-colors"
              >
                <Trash2 size={12} />
                {t('notifications.clear', 'Clear')}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-md text-aegis-text-dim hover:text-aegis-text-secondary
                hover:bg-[rgb(var(--aegis-overlay)/0.06)] transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 px-5 py-2 border-b border-[rgb(var(--aegis-overlay)/0.04)] overflow-x-auto">
          {(Object.keys(FILTER_CATS) as FilterKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={clsx(
                'px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all',
                'border',
                filter === key
                  ? 'bg-aegis-primary/10 text-aegis-primary border-aegis-primary/20'
                  : 'bg-[rgb(var(--aegis-overlay)/0.03)] text-aegis-text-muted border-transparent hover:bg-[rgb(var(--aegis-overlay)/0.06)]',
              )}
            >
              {t(`notifications.filter.${key}`, key.charAt(0).toUpperCase() + key.slice(1))}
              {counts[key] > 0 && (
                <span className="ml-1 opacity-60 text-[9px]">{counts[key]}</span>
              )}
            </button>
          ))}
        </div>

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto px-3 py-2 scrollbar-thin">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-aegis-text-dim">
              <Bell size={32} className="opacity-20 mb-2" />
              <span className="text-[12px]">{t('notifications.empty', 'No notifications')}</span>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filtered.map((n) => (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => handleClick(n)}
                  className={clsx(
                    'flex gap-2.5 px-3 py-2.5 mb-1 rounded-lg cursor-pointer transition-all',
                    'border border-transparent',
                    'hover:bg-[rgb(var(--aegis-overlay)/0.03)] hover:border-[rgb(var(--aegis-overlay)/0.06)]',
                    !n.read && 'bg-[rgb(var(--aegis-overlay)/0.02)]',
                  )}
                >
                  {/* Unread dot */}
                  {!n.read && (
                    <div className="w-1.5 h-1.5 rounded-full bg-aegis-primary mt-1.5 shrink-0" />
                  )}

                  {/* Icon */}
                  <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', iconBg(n.severity))}>
                    {notifIcon(n)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-aegis-text truncate">{n.title}</div>
                    <div className="text-[11px] text-aegis-text-muted truncate">{n.body}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-aegis-text-dim font-mono">{timeAgo(n.timestamp)}</span>
                      <span className={clsx('text-[9px] px-1.5 py-0.5 rounded font-medium', badgeClass(n.category))}>
                        {badgeLabel(n.category)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </>
  );
}
