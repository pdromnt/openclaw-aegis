// ═══════════════════════════════════════════════════════════
// Session Manager — Full session monitoring, search, actions
// Header + search + filter tabs + 2-col session cards + preview drawer
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Users, RefreshCw, Loader2, Search, Trash2, RotateCcw,
  Eye, X, Bot, Clock, HardDrive, MessageSquare,
} from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { useGatewayDataStore, refreshGroup } from '@/stores/gatewayDataStore';
import { gateway } from '@/services/gateway/index';
import { useNotificationStore } from '@/stores/notificationStore';
import { formatTokens } from '@/utils/format';
import type { SessionInfo } from '@/stores/gatewayDataStore';
import clsx from 'clsx';

// ═══════════════════════════════════════════════════════════
// Types & Helpers
// ═══════════════════════════════════════════════════════════

type SessionType = 'dm' | 'cron' | 'subagent' | 'group' | 'voice' | 'other';
type FilterKey = 'all' | 'dm' | 'cron' | 'subagent' | 'group';

function classifySession(key: string): SessionType {
  if (/:cron:/.test(key)) return 'cron';
  if (/:subagent:/.test(key)) return 'subagent';
  if (/:voice/.test(key)) return 'voice';
  if (/:group:/.test(key) || /:discord:/.test(key) || /:telegram:.*:g/.test(key)) return 'group';
  return 'dm';
}

function sessionLabel(s: SessionInfo, t?: (key: string) => string): string {
  const key = s.key || '';
  if (s.label || s.displayName) return (s.label || s.displayName || '').slice(0, 40);
  if (key === 'agent:main:main') return t ? t('sessionManager.mainSession') : 'Main';
  const parts = key.split(':');
  if (parts.length >= 3) {
    if (parts[2] === 'subagent') {
      const agentId = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
      const uuid = (parts[3] || '').replace(/-/g, '').substring(0, 6);
      return `${agentId} · ${uuid}`;
    }
    return parts.slice(2).join(':').substring(0, 30);
  }
  return key.substring(0, 30);
}

function sessionIcon(type: SessionType): string {
  switch (type) {
    case 'dm': return '💬';
    case 'cron': return '⏰';
    case 'subagent': return '🔧';
    case 'group': return '👥';
    case 'voice': return '🎤';
    default: return '📄';
  }
}

function badgeClass(type: SessionType): string {
  switch (type) {
    case 'dm': return 'bg-blue-500/15 text-blue-400';
    case 'cron': return 'bg-purple-500/15 text-purple-400';
    case 'subagent': return 'bg-amber-500/15 text-amber-400';
    case 'group': return 'bg-emerald-500/15 text-emerald-400';
    case 'voice': return 'bg-pink-500/15 text-pink-400';
    default: return 'bg-zinc-500/15 text-zinc-400';
  }
}

function timeAgo(ts: string | undefined | null, t: (key: string, opts?: any) => string): string {
  if (!ts) return '—';
  try {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 0 || diff < 60_000) return t('sessionManager.justNow');
    if (diff < 3_600_000) return t('sessionManager.minutesAgo', { n: Math.floor(diff / 60_000) });
    if (diff < 86_400_000) return t('sessionManager.hoursAgo', { n: Math.floor(diff / 3_600_000) });
    return t('sessionManager.daysAgo', { n: Math.floor(diff / 86_400_000) });
  } catch { return '—'; }
}

function tokenPercent(ctx?: number, max?: number): number {
  if (!ctx || !max || max === 0) return 0;
  return Math.min(100, Math.round((ctx / max) * 100));
}

function tokenBarColor(pct: number): string {
  if (pct >= 80) return 'bg-red-500/70';
  if (pct >= 50) return 'bg-amber-500/70';
  return 'bg-aegis-primary/60';
}

const fmtTokens = (n?: number): string => n == null ? '—' : formatTokens(n);

// ═══════════════════════════════════════════════════════════
// Preview Drawer
// ═══════════════════════════════════════════════════════════

function PreviewDrawer({ session, onClose }: { session: SessionInfo | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch messages when session changes
  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setMessages([]);
    gateway.getHistory(session.key, 10)
      .then((res: any) => {
        const msgs = Array.isArray(res?.messages) ? res.messages : Array.isArray(res) ? res : [];
        setMessages(msgs.slice(-10));
      })
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, [session]);

  if (!session) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 z-[90]" onClick={onClose}
      />
      <motion.div
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed top-0 right-0 w-[400px] h-full z-[100] bg-aegis-elevated-solid border-l border-aegis-border flex flex-col shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-aegis-border">
          <span className="text-[14px] font-semibold text-aegis-text">
            📋 {sessionLabel(session, t)} — {t('sessionManager.lastMessages')}
          </span>
          <button onClick={onClose} className="p-1 rounded-md text-aegis-text-dim hover:text-aegis-text-secondary hover:bg-[rgb(var(--aegis-overlay)/0.06)]">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-aegis-primary/50" /></div>
          ) : messages.length === 0 ? (
            <div className="text-center text-aegis-text-dim text-[12px] mt-8">{t('sessions.noMessages')}</div>
          ) : messages.map((m: any, i: number) => {
            const role = m.role || 'unknown';
            const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
            const isUser = role === 'user';
            return (
              <div key={i} className={clsx(
                'px-3 py-2.5 rounded-lg text-[12px] leading-relaxed',
                isUser ? 'bg-aegis-primary/8 ml-10' : 'bg-[rgb(var(--aegis-overlay)/0.03)] mr-10',
              )}>
                <div className="text-[10px] font-semibold text-aegis-text-dim mb-1">
                  {isUser ? t('sessionManager.you') : role.charAt(0).toUpperCase() + role.slice(1)}
                </div>
                <div className="text-aegis-text-muted line-clamp-4">{content.substring(0, 300)}</div>
              </div>
            );
          })}
        </div>
      </motion.div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// Confirm Dialog
// ═══════════════════════════════════════════════════════════

function ConfirmDialog({ title, message, onConfirm, onCancel, danger }: {
  title: string; message: string; onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[110]" onClick={onCancel} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[120] w-[360px] bg-aegis-elevated-solid border border-aegis-border rounded-xl p-5 shadow-2xl">
        <div className="text-[14px] font-semibold text-aegis-text mb-2">{title}</div>
        <div className="text-[12px] text-aegis-text-muted mb-4">{message}</div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-[11px] text-aegis-text-muted bg-[rgb(var(--aegis-overlay)/0.04)] border border-aegis-border hover:bg-[rgb(var(--aegis-overlay)/0.08)]">
            {t('common.cancel')}
          </button>
          <button onClick={onConfirm} className={clsx(
            'px-3 py-1.5 rounded-lg text-[11px] font-medium border',
            danger ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20' : 'bg-aegis-primary/10 text-aegis-primary border-aegis-primary/20 hover:bg-aegis-primary/20'
          )}>
            {t('common.confirm')}
          </button>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════

export function SessionManagerPage() {
  const { t } = useTranslation();
  const sessions = useGatewayDataStore((s) => s.sessions);
  const loading = useGatewayDataStore((s) => s.loading.sessions);

  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [previewSession, setPreviewSession] = useState<SessionInfo | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: 'reset' | 'delete' | 'cleanup'; session?: SessionInfo } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Classify and filter
  const classified = useMemo(() =>
    sessions.map((s) => ({ ...s, _type: classifySession(s.key) })),
    [sessions]
  );

  const filtered = useMemo(() => {
    let list = classified;
    if (filter !== 'all') list = list.filter((s) => s._type === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) =>
        (s.key || '').toLowerCase().includes(q) ||
        (s.label || '').toLowerCase().includes(q) ||
        (s.displayName || '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => {
      const ta = new Date(a.updatedAt || a.lastActive || 0).getTime();
      const tb = new Date(b.updatedAt || b.lastActive || 0).getTime();
      return tb - ta;
    });
  }, [classified, filter, search]);

  // Counts
  const counts = useMemo(() => ({
    all: sessions.length,
    dm: classified.filter((s) => s._type === 'dm').length,
    cron: classified.filter((s) => s._type === 'cron').length,
    subagent: classified.filter((s) => s._type === 'subagent').length,
    group: classified.filter((s) => s._type === 'group').length,
  }), [sessions, classified]);

  // Actions
  const handleReset = useCallback(async (s: SessionInfo) => {
    setActionLoading(s.key);
    try {
      await gateway.resetSession(s.key);
      useNotificationStore.getState().addNotification({
        category: 'system', severity: 'success',
        title: t('sessionManager.resetSuccess'), body: sessionLabel(s, t),
      });
      refreshGroup('sessions');
    } catch (e: any) {
      useNotificationStore.getState().addNotification({
        category: 'error', severity: 'error',
        title: t('errors.resetFailed'), body: e?.message || t('errors.unknown'),
      });
    }
    setActionLoading(null);
    setConfirmAction(null);
  }, []);

  const handleDelete = useCallback(async (s: SessionInfo) => {
    setActionLoading(s.key);
    try {
      await gateway.deleteSession(s.key);
      useNotificationStore.getState().addNotification({
        category: 'system', severity: 'success',
        title: t('sessionManager.deleteSuccess'), body: sessionLabel(s, t),
      });
      refreshGroup('sessions');
    } catch (e: any) {
      useNotificationStore.getState().addNotification({
        category: 'error', severity: 'error',
        title: t('errors.deleteFailed'), body: e?.message || t('errors.unknown'),
      });
    }
    setActionLoading(null);
    setConfirmAction(null);
  }, []);

  const handleCleanup = useCallback(async () => {
    setActionLoading('cleanup');
    try {
      await gateway.cleanupSessions();
      useNotificationStore.getState().addNotification({
        category: 'system', severity: 'success',
        title: t('sessionManager.cleanupComplete'), body: t('sessionManager.oldSessionsRemoved'),
      });
      refreshGroup('sessions');
    } catch (e: any) {
      useNotificationStore.getState().addNotification({
        category: 'error', severity: 'error',
        title: t('errors.cleanupFailed'), body: e?.message || t('errors.unknown'),
      });
    }
    setActionLoading(null);
    setConfirmAction(null);
  }, []);

  const filterKeys: FilterKey[] = ['all', 'dm', 'cron', 'subagent', 'group'];

  return (
    <PageTransition>
      <div className="p-6 max-w-[1100px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-[18px] font-bold text-aegis-text flex items-center gap-2">
              <Users size={20} /> {t('sessionManager.title')}
            </h1>
            <p className="text-[12px] text-aegis-text-dim mt-0.5">
              {t('sessionManager.sessionsCount', { count: sessions.length })} · {t('sessionManager.activeCount', { count: classified.filter((s) => s.running).length })}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => refreshGroup('sessions')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-aegis-text-muted bg-[rgb(var(--aegis-overlay)/0.03)] border border-[rgb(var(--aegis-overlay)/0.08)] hover:bg-[rgb(var(--aegis-overlay)/0.06)] transition-colors"
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> {t('sessionManager.refresh')}
            </button>
            <button
              onClick={() => setConfirmAction({ type: 'cleanup' })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-red-400 bg-red-500/5 border border-red-500/15 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={12} /> {t('sessionManager.cleanupOld')}
            </button>
          </div>
        </div>

        {/* Search + Filters */}
        <div className="flex gap-3 mb-4 items-center">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-aegis-text-dim" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('sessions.searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2 rounded-lg text-[12px] bg-[rgb(var(--aegis-overlay)/0.03)] border border-[rgb(var(--aegis-overlay)/0.08)] text-aegis-text placeholder:text-aegis-text-dim/40 outline-none focus:border-aegis-primary/30"
            />
          </div>
          <div className="flex gap-1">
            {filterKeys.map((key) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={clsx(
                  'px-2.5 py-1.5 rounded-md text-[11px] font-medium border transition-all',
                  filter === key
                    ? 'bg-aegis-primary/10 text-aegis-primary border-aegis-primary/20'
                    : 'bg-[rgb(var(--aegis-overlay)/0.03)] text-aegis-text-muted border-transparent hover:bg-[rgb(var(--aegis-overlay)/0.06)]'
                )}
              >
                {t(`sessionManager.filter${key.charAt(0).toUpperCase() + key.slice(1)}`)}
                <span className="ml-1 opacity-60 text-[9px]">{counts[key]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Session Grid */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[200px] text-aegis-text-dim">
            <Users size={32} className="opacity-20 mb-2" />
            <span className="text-[12px]">{t('sessions.noResults')}</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <AnimatePresence mode="popLayout">
              {filtered.map((s) => {
                const type = s._type;
                const pct = tokenPercent(s.totalTokens || s.contextTokens, s.maxTokens || s.contextWindow || 200000);
                const isLoading = actionLoading === s.key;

                return (
                  <motion.div
                    key={s.key}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="p-4 rounded-xl bg-[rgb(var(--aegis-overlay)/0.02)] border border-[rgb(var(--aegis-overlay)/0.06)] hover:border-[rgb(var(--aegis-overlay)/0.12)] transition-all"
                  >
                    {/* Top row */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-[13px] font-semibold text-aegis-text">
                        <span>{sessionIcon(type)}</span>
                        <span className="truncate max-w-[180px]">{sessionLabel(s, t)}</span>
                        <span className={clsx('text-[9px] px-1.5 py-0.5 rounded font-semibold', badgeClass(type))}>
                          {type}
                        </span>
                      </div>
                      <span className="text-[10px] text-aegis-text-dim">{s.model?.split('/').pop() || ''}</span>
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-3 text-[10px] text-aegis-text-dim mb-2">
                      <span className="flex items-center gap-1"><Clock size={10} /> {timeAgo(s.updatedAt || s.lastActive, t)}</span>
                      <span className="flex items-center gap-1"><Bot size={10} /> {s.key.split(':')[1] || 'main'}</span>
                    </div>

                    {/* Token bar */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 h-1 rounded-full bg-[rgb(var(--aegis-overlay)/0.06)] overflow-hidden">
                        <div className={clsx('h-full rounded-full transition-all', tokenBarColor(pct))} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-aegis-text-dim font-mono whitespace-nowrap">
                        {fmtTokens(s.totalTokens || s.contextTokens)} / {fmtTokens(s.maxTokens || s.contextWindow || 200000)}
                      </span>
                    </div>

                    {/* Last message preview */}
                    {s.lastMessage?.content && (
                      <div className="text-[11px] text-aegis-text-muted truncate mb-2">
                        💬 {typeof s.lastMessage.content === 'string' ? s.lastMessage.content.substring(0, 60) : '...'}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-1.5 pt-2 border-t border-[rgb(var(--aegis-overlay)/0.04)]">
                      <button
                        onClick={() => setPreviewSession(s)}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-aegis-primary bg-aegis-primary/5 border border-aegis-primary/15 hover:bg-aegis-primary/10 transition-colors"
                      >
                        <Eye size={10} /> {t('sessionManager.preview')}
                      </button>
                      <button
                        onClick={() => setConfirmAction({ type: 'reset', session: s })}
                        disabled={isLoading}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-blue-400 bg-blue-500/5 border border-blue-500/15 hover:bg-blue-500/10 transition-colors disabled:opacity-30"
                      >
                        <RotateCcw size={10} /> {t('sessionManager.reset')}
                      </button>
                      {s.key !== 'agent:main:main' && (
                        <button
                          onClick={() => setConfirmAction({ type: 'delete', session: s })}
                          disabled={isLoading}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-red-400 bg-red-500/5 border border-red-500/10 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                        >
                          <Trash2 size={10} /> {t('sessionManager.delete')}
                        </button>
                      )}
                      {isLoading && <Loader2 size={12} className="animate-spin text-aegis-text-dim ml-1" />}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {/* Preview Drawer */}
        <AnimatePresence>
          {previewSession && (
            <PreviewDrawer session={previewSession} onClose={() => setPreviewSession(null)} />
          )}
        </AnimatePresence>

        {/* Confirm Dialog */}
        {confirmAction && (
          <ConfirmDialog
            title={
              confirmAction.type === 'reset' ? t('sessionManager.resetTitle') :
              confirmAction.type === 'delete' ? t('sessionManager.deleteTitle') :
              t('sessionManager.cleanupTitle')
            }
            message={
              confirmAction.type === 'reset' ? t('sessionManager.resetMessage', { name: sessionLabel(confirmAction.session!, t) }) :
              confirmAction.type === 'delete' ? t('sessionManager.deleteMessage', { name: sessionLabel(confirmAction.session!, t) }) :
              t('sessionManager.cleanupWarning')
            }
            danger={confirmAction.type === 'delete' || confirmAction.type === 'cleanup'}
            onCancel={() => setConfirmAction(null)}
            onConfirm={() => {
              if (confirmAction.type === 'reset' && confirmAction.session) handleReset(confirmAction.session);
              else if (confirmAction.type === 'delete' && confirmAction.session) handleDelete(confirmAction.session);
              else if (confirmAction.type === 'cleanup') handleCleanup();
            }}
          />
        )}
      </div>
    </PageTransition>
  );
}
