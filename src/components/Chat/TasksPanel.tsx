// ═══════════════════════════════════════════════════════════
// Tasks Panel — Shows active background tasks above the chat
// Collapsed: compact bar showing count
// Expanded: list of tasks with status, runtime, and timing
// ═══════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock, Loader2, AlertTriangle } from 'lucide-react';
import { useTaskStore, type BackgroundTask } from '@/stores/taskStore';
import clsx from 'clsx';

// ── Status config ──
const STATUS_CONFIG: Record<string, { icon: typeof Activity; color: string; label: string }> = {
  queued:    { icon: Clock,        color: 'text-yellow-400', label: 'Queued' },
  running:   { icon: Loader2,      color: 'text-blue-400',   label: 'Running' },
  succeeded: { icon: CheckCircle2, color: 'text-emerald-400', label: 'Done' },
  failed:    { icon: XCircle,      color: 'text-red-400',     label: 'Failed' },
  timed_out: { icon: AlertTriangle, color: 'text-orange-400', label: 'Timeout' },
  cancelled: { icon: XCircle,      color: 'text-gray-400',    label: 'Cancelled' },
  lost:      { icon: AlertTriangle, color: 'text-red-400',    label: 'Lost' },
};

const RUNTIME_EMOJI: Record<string, string> = {
  acp: '🤖',
  subagent: '🔀',
  cron: '⏰',
  cli: '💻',
};

function formatTimeAgo(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function formatDuration(startedAt?: string, endedAt?: string): string {
  if (!startedAt) return '';
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const diff = Math.floor((end - start) / 1000);
  if (diff < 60) return `${diff}s`;
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  if (m < 60) return `${m}m ${s}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function TaskRow({ task }: { task: BackgroundTask }) {
  const config = STATUS_CONFIG[task.status] || STATUS_CONFIG.running;
  const Icon = config.icon;
  const isActive = task.status === 'running' || task.status === 'queued';
  const emoji = RUNTIME_EMOJI[task.runtime] || '📋';

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.15 }}
      className={clsx(
        'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[12px]',
        isActive ? 'bg-blue-500/5' : 'bg-white/[0.02]'
      )}
    >
      {/* Runtime emoji */}
      <span className="text-[13px] shrink-0">{emoji}</span>

      {/* Status icon */}
      <Icon
        size={13}
        className={clsx(config.color, 'shrink-0', task.status === 'running' && 'animate-spin')}
      />

      {/* Name / Summary */}
      <span className="flex-1 min-w-0 truncate text-aegis-text">
        {task.jobName || task.summary || task.runtime}
      </span>

      {/* Duration or time ago */}
      <span className="text-[11px] text-aegis-text-dim shrink-0 tabular-nums">
        {isActive
          ? formatDuration(task.startedAt || task.createdAt)
          : formatTimeAgo(task.endedAt || task.createdAt)
        }
      </span>

      {/* Error indicator */}
      {task.error && (
        <span className="text-[10px] text-red-400 truncate max-w-[120px]" title={task.error}>
          {task.error.substring(0, 30)}
        </span>
      )}
    </motion.div>
  );
}

export function TasksPanel() {
  const { t } = useTranslation();
  const tasks = useTaskStore((s) => s.tasks);
  const fetchTasks = useTaskStore((s) => s.fetchTasks);
  const startPolling = useTaskStore((s) => s.startPolling);
  const stopPolling = useTaskStore((s) => s.stopPolling);
  const [expanded, setExpanded] = useState(false);

  const activeTasks = tasks.filter(t => t.status === 'running' || t.status === 'queued');
  const recentDone = tasks
    .filter(t => t.status !== 'running' && t.status !== 'queued')
    .sort((a, b) => (b.endedAt || b.createdAt || '').localeCompare(a.endedAt || a.createdAt || ''))
    .slice(0, 3);

  // Start polling on mount
  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  // Auto-expand when tasks appear, auto-collapse when done
  useEffect(() => {
    if (activeTasks.length > 0 && !expanded) setExpanded(true);
    if (activeTasks.length === 0 && expanded) {
      const timer = setTimeout(() => setExpanded(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [activeTasks.length]);

  // Nothing to show
  if (activeTasks.length === 0 && recentDone.length === 0) return null;

  const failedCount = tasks.filter(t => t.status === 'failed' || t.status === 'timed_out').length;

  return (
    <div className="shrink-0 border-b border-white/[0.06]">
      {/* Collapsed bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-1.5 text-[11px] hover:bg-white/[0.03] transition-colors"
      >
        <Activity size={13} className={activeTasks.length > 0 ? 'text-blue-400' : 'text-aegis-text-dim'} />
        <span className={clsx('font-medium', activeTasks.length > 0 ? 'text-blue-400' : 'text-aegis-text-dim')}>
          {activeTasks.length > 0
            ? t('tasks.activeCount', { count: activeTasks.length, defaultValue: `${activeTasks.length} tasks running` })
            : t('tasks.recentDone', { defaultValue: 'Recent tasks' })
          }
        </span>
        {failedCount > 0 && (
          <span className="text-[10px] text-red-400 font-medium">
            {failedCount} {t('tasks.failed', { defaultValue: 'failed' })}
          </span>
        )}
        <span className="flex-1" />
        {expanded ? <ChevronUp size={12} className="text-aegis-text-dim" /> : <ChevronDown size={12} className="text-aegis-text-dim" />}
      </button>

      {/* Expanded task list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 space-y-0.5">
              {activeTasks.map(task => (
                <TaskRow key={task.id} task={task} />
              ))}
              {recentDone.length > 0 && activeTasks.length > 0 && (
                <div className="border-t border-white/[0.04] my-1" />
              )}
              {recentDone.map(task => (
                <TaskRow key={task.id} task={task} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
