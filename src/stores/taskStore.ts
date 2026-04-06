// ═══════════════════════════════════════════════════════════
// Task Store — Background task tracking
// Tracks ACP, subagent, cron, and CLI tasks from Gateway
// ═══════════════════════════════════════════════════════════

import { create } from 'zustand';
import { gateway } from '@/services/gateway/index';

export interface BackgroundTask {
  id: string;
  runtime: 'acp' | 'subagent' | 'cron' | 'cli' | string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'timed_out' | 'cancelled' | 'lost';
  summary?: string;
  error?: string;
  childSessionKey?: string;
  requesterSessionKey?: string;
  runId?: string;
  jobName?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt?: string;
  notify?: string;
}

interface TaskStore {
  tasks: BackgroundTask[];
  loading: boolean;
  lastFetchedAt: number | null;
  pollTimer: ReturnType<typeof setInterval> | null;

  // Actions
  setTasks: (tasks: BackgroundTask[]) => void;
  updateTask: (id: string, patch: Partial<BackgroundTask>) => void;
  fetchTasks: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;

  // Computed helpers
  getActiveTasks: () => BackgroundTask[];
  getRecentTasks: (limit?: number) => BackgroundTask[];
}

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'timed_out', 'cancelled', 'lost']);
const POLL_INTERVAL_ACTIVE = 15_000;  // 15s when tasks are active
const POLL_INTERVAL_IDLE = 60_000;    // 60s when no active tasks

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  loading: false,
  lastFetchedAt: null,
  pollTimer: null,

  setTasks: (tasks) => set({ tasks, lastFetchedAt: Date.now() }),

  updateTask: (id, patch) => set((s) => ({
    tasks: s.tasks.map(t => t.id === id ? { ...t, ...patch } : t),
  })),

  fetchTasks: async () => {
    try {
      set({ loading: true });
      const result = await gateway.call('tasks.list', {}) as any;
      if (result?.tasks && Array.isArray(result.tasks)) {
        const mapped: BackgroundTask[] = result.tasks.map((t: any) => ({
          id: t.id || t.taskId,
          runtime: t.runtime || t.kind || 'unknown',
          status: t.status || 'queued',
          summary: t.summary || t.description || t.label,
          error: t.error || t.errorMessage,
          childSessionKey: t.childSessionKey || t.sessionKey,
          requesterSessionKey: t.requesterSessionKey,
          runId: t.runId,
          jobName: t.jobName || t.name,
          startedAt: t.startedAt,
          endedAt: t.endedAt,
          createdAt: t.createdAt || t.queuedAt,
          notify: t.notify,
        }));
        set({ tasks: mapped, lastFetchedAt: Date.now() });
      }
    } catch (err) {
      // tasks.list may not exist on older gateways — silent fail
      console.log('[Tasks] fetch failed (may be unsupported):', err);
    } finally {
      set({ loading: false });
    }
  },

  startPolling: () => {
    const state = get();
    if (state.pollTimer) return; // already polling

    const poll = () => {
      const { tasks } = get();
      const hasActive = tasks.some(t => !TERMINAL_STATUSES.has(t.status));
      const interval = hasActive ? POLL_INTERVAL_ACTIVE : POLL_INTERVAL_IDLE;

      // Adjust interval dynamically
      const currentTimer = get().pollTimer;
      if (currentTimer) clearInterval(currentTimer);

      const newTimer = setInterval(() => {
        get().fetchTasks();
      }, interval);
      set({ pollTimer: newTimer });
    };

    // Initial fetch + start polling
    get().fetchTasks().then(poll);
  },

  stopPolling: () => {
    const { pollTimer } = get();
    if (pollTimer) {
      clearInterval(pollTimer);
      set({ pollTimer: null });
    }
  },

  getActiveTasks: () => {
    return get().tasks.filter(t => !TERMINAL_STATUSES.has(t.status));
  },

  getRecentTasks: (limit = 5) => {
    return get().tasks
      .filter(t => TERMINAL_STATUSES.has(t.status))
      .sort((a, b) => {
        const aTime = a.endedAt || a.createdAt || '';
        const bTime = b.endedAt || b.createdAt || '';
        return bTime.localeCompare(aTime);
      })
      .slice(0, limit);
  },
}));
