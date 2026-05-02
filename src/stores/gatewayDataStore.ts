import { create } from 'zustand';
import { useNotificationStore } from './notificationStore';
import { useChatStore } from './chatStore';
import { useTaskStore } from './taskStore';

// ═══════════════════════════════════════════════════════════
// Gateway Data Store — Central data layer for all pages
//
// DESIGN:
//   All pages READ from this store — nobody calls gateway directly.
//   Smart polling fetches at 3 speeds:
//     Fast  (10s)  → sessions.list         (who's running now?)
//     Mid   (30s)  → agents.list + cron    (rarely change)
//     Slow  (120s) → usage.cost + sessions.usage (heavy, slow-changing)
//
//   Gateway events (session.started, etc.) update the store
//   in real-time without polling.
// ═══════════════════════════════════════════════════════════

// ── Types ────────────────────────────────────────────────

export interface SessionInfo {
  key: string;
  label?: string;
  model?: string;
  running?: boolean;
  totalTokens?: number;
  contextTokens?: number;
  maxTokens?: number;
  contextWindow?: number;
  compactions?: number;
  lastActive?: string;
  updatedAt?: string;
  displayName?: string;
  lastMessage?: { content?: string; role?: string };
  kind?: string;
  [k: string]: any;
}

export interface AgentInfo {
  id: string;
  name?: string;
  model?: string;
  workspace?: string;
  [k: string]: any;
}

export interface DailyEntry {
  date: string;
  totalCost: number;
  inputCost: number;
  outputCost: number;
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  requests: number;
  [k: string]: any;
}

export interface CostSummary {
  days: number;
  daily: DailyEntry[];
  totals: {
    totalCost: number;
    inputCost: number;
    outputCost: number;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    requests: number;
    [k: string]: any;
  };
  updatedAt?: number;
}

export interface SessionsUsage {
  sessions?: any[];
  totals?: any;
  aggregates?: {
    byAgent?: any[];
    byModel?: any[];
    [k: string]: any;
  };
  [k: string]: any;
}

export interface HealthInfo {
  version?: string;
  uptime?: number;       // seconds
  model?: string;
  activeSessions?: number;
  channels?: Array<{ name: string; status: string; account?: string }>;
  lastHeartbeat?: string;
}

export interface CronJob {
  id: string;
  name?: string;
  schedule?: any;
  enabled?: boolean;
  lastRun?: string;
  state?: any;
  // Gateway 2026.2.22+: split run vs delivery status
  lastRunStatus?: string;
  lastDeliveryStatus?: string;
  [k: string]: any;
}

// ── Running Sub-Agent Tracking ───────────────────────────
// Detected from sessions polling (every 10s).
// Gateway WebSocket does NOT send stream:"tool" events,
// so we scan sessions.list for key "agent:<id>:subagent:<uuid>" + running=true.

export interface RunningSubAgent {
  agentId: string;
  startTime: number;
  label?: string;
  sessionKey?: string;
}

// ── Store State ──────────────────────────────────────────

interface GatewayDataState {
  // Data
  sessions: SessionInfo[];
  agents: AgentInfo[];
  costSummary: CostSummary | null;
  sessionsUsage: SessionsUsage | null;
  cronJobs: CronJob[];
  runningSubAgents: RunningSubAgent[];
  health: HealthInfo | null;

  // Timestamps (ms) — when each group was last fetched
  lastFetch: {
    sessions: number;
    agents: number;
    cost: number;
    usage: number;
    cron: number;
    health: number;
  };

  // Loading states per group
  loading: {
    sessions: boolean;
    agents: boolean;
    cost: boolean;
    usage: boolean;
    cron: boolean;
  };

  // Error states per group
  errors: {
    sessions: string | null;
    agents: string | null;
    cost: string | null;
    usage: string | null;
    cron: string | null;
  };

  // Polling active flag
  polling: boolean;

  // ── Actions ──

  // Setters (called by polling engine or event handler)
  setSessions: (sessions: SessionInfo[]) => void;
  setAgents: (agents: AgentInfo[]) => void;
  setCostSummary: (data: CostSummary) => void;
  setSessionsUsage: (data: SessionsUsage) => void;
  setCronJobs: (jobs: CronJob[]) => void;
  setHealth: (info: HealthInfo) => void;

  setLoading: (group: keyof GatewayDataState['loading'], val: boolean) => void;
  setError: (group: keyof GatewayDataState['errors'], err: string | null) => void;

  // Sub-agent tracking (synced from sessions polling)
  setRunningSubAgents: (list: RunningSubAgent[]) => void;

  // Mark polling active/inactive
  setPolling: (active: boolean) => void;

  // ── Derived helpers (convenience) ──
  getMainSession: () => SessionInfo | undefined;
}

// ── Store ────────────────────────────────────────────────

export const useGatewayDataStore = create<GatewayDataState>((set, get) => ({
  // Data
  sessions: [],
  agents: [],
  costSummary: null,
  sessionsUsage: null,
  cronJobs: [],
  runningSubAgents: [],
  health: null,

  // Timestamps
  lastFetch: { sessions: 0, agents: 0, cost: 0, usage: 0, cron: 0, health: 0 },

  // Loading
  loading: { sessions: false, agents: false, cost: false, usage: false, cron: false },

  // Errors
  errors: { sessions: null, agents: null, cost: null, usage: null, cron: null },

  polling: false,

  // ── Setters ──

  setSessions: (sessions) => {
    // Skip update if sessions haven't actually changed (prevents unnecessary re-renders)
    const prev = get().sessions;
    const changed = sessions.length !== prev.length
      || sessions.some((s: any, i: number) => {
        const p = prev[i] as any;
        return !p || s.key !== p.key || s.status !== p.status || s.totalTokens !== p.totalTokens
          || s.updatedAt !== p.updatedAt || s.endedAt !== p.endedAt;
      });
    set({
      ...(changed ? { sessions } : {}),
      lastFetch: { ...get().lastFetch, sessions: Date.now() },
      loading: { ...get().loading, sessions: false },
      errors: { ...get().errors, sessions: null },
    });
  },

  setAgents: (agents) => {
    const prev = get().agents;
    const changed = agents.length !== prev.length
      || agents.some((a: any, i: number) => {
        const p = prev[i] as any;
        return !p || a.id !== p.id || a.name !== p.name || a.configured !== p.configured;
      });
    set({
      ...(changed ? { agents } : {}),
      lastFetch: { ...get().lastFetch, agents: Date.now() },
      loading: { ...get().loading, agents: false },
      errors: { ...get().errors, agents: null },
    });
  },

  setCostSummary: (data) =>
    set({
      costSummary: data,
      lastFetch: { ...get().lastFetch, cost: Date.now() },
      loading: { ...get().loading, cost: false },
      errors: { ...get().errors, cost: null },
    }),

  setSessionsUsage: (data) =>
    set({
      sessionsUsage: data,
      lastFetch: { ...get().lastFetch, usage: Date.now() },
      loading: { ...get().loading, usage: false },
      errors: { ...get().errors, usage: null },
    }),

  setCronJobs: (jobs) =>
    set({
      cronJobs: jobs,
      lastFetch: { ...get().lastFetch, cron: Date.now() },
      loading: { ...get().loading, cron: false },
      errors: { ...get().errors, cron: null },
    }),

  setHealth: (info) =>
    set({
      health: info,
      lastFetch: { ...get().lastFetch, health: Date.now() },
    }),

  setLoading: (group, val) =>
    set({ loading: { ...get().loading, [group]: val } }),

  setError: (group, err) =>
    set({ errors: { ...get().errors, [group]: err } }),

  // ── Sub-agent tracking ──

  setRunningSubAgents: (list) => set({ runningSubAgents: list }),

  setPolling: (active) => set({ polling: active }),

  // ── Derived ──

  getMainSession: () =>
    get().sessions.find((s) => s.key === 'agent:main:main'),
}));


// ═══════════════════════════════════════════════════════════
// Polling Engine — starts/stops with gateway connection
// ═══════════════════════════════════════════════════════════

// Polling intervals (ms)
const FAST_INTERVAL  = 10_000;   // 10s — sessions
const MID_INTERVAL   = 30_000;   // 30s — agents + cron
const SLOW_INTERVAL  = 300_000;  // 300s (5min) — cost + usage (these APIs take 20-60s each)

let fastTimer:  ReturnType<typeof setInterval> | null = null;
let midTimer:   ReturnType<typeof setInterval> | null = null;
let slowTimer:  ReturnType<typeof setInterval> | null = null;

// Reference to gateway connection (set by startPolling)
// Uses request() directly to avoid circular imports with gateway facade
let gw: { request: (method: string, params: any) => Promise<any>; getHttpBaseUrl?: () => string } | null = null;

// ── Fetch functions ──────────────────────────────────────

async function fetchSessions() {
  if (!gw) return;
  const store = useGatewayDataStore.getState();
  store.setLoading('sessions', true);
  try {
    const res = await gw.request('sessions.list', {});
    const list = Array.isArray(res?.sessions) ? res.sessions : [];
    store.setSessions(list);
  } catch (e: any) {
    store.setError('sessions', e?.message || String(e));
    store.setLoading('sessions', false);
  }
}

async function fetchAgents() {
  if (!gw) return;
  const store = useGatewayDataStore.getState();
  store.setLoading('agents', true);
  try {
    const res = await gw.request('agents.list', {});
    const list = Array.isArray(res?.agents) ? res.agents
               : Array.isArray(res) ? res : [];
    store.setAgents(list);
  } catch (e: any) {
    store.setError('agents', e?.message || String(e));
    store.setLoading('agents', false);
  }
}

async function fetchCost() {
  if (!gw) return;
  const store = useGatewayDataStore.getState();
  store.setLoading('cost', true);
  try {
    const res = await gw.request('usage.cost', { days: 30 });
    if (res) store.setCostSummary(res);
  } catch (e: any) {
    store.setError('cost', e?.message || String(e));
    store.setLoading('cost', false);
  }
}

async function fetchUsage() {
  if (!gw) return;
  const store = useGatewayDataStore.getState();
  store.setLoading('usage', true);
  try {
    const res = await gw.request('sessions.usage', { limit: 100 });
    if (res) store.setSessionsUsage(res);
  } catch (e: any) {
    store.setError('usage', e?.message || String(e));
    store.setLoading('usage', false);
  }
}

async function fetchCron() {
  if (!gw) return;
  const store = useGatewayDataStore.getState();
  store.setLoading('cron', true);
  try {
    const res = await gw.request('cron.list', { includeDisabled: true });
    const list = Array.isArray(res?.jobs) ? res.jobs
               : Array.isArray(res) ? res : [];
    store.setCronJobs(list);
  } catch (e: any) {
    store.setError('cron', e?.message || String(e));
    store.setLoading('cron', false);
  }
}

// ── Grouped fetchers (called by timers) ─────────────────

async function tickFast() {
  await fetchSessions();
  // Detect running sub-agents from sessions data
  syncRunningSubAgents();
}

async function fetchHealth() {
  if (!gw) return;
  const store = useGatewayDataStore.getState();
  const sessions = store.sessions;
  const mainSession = sessions.find((s: any) => s.key === 'agent:main:main');

  // Fetch uptime from HTTP /readyz (no auth needed, lightweight)
  let uptimeSeconds: number | undefined;
  try {
    const httpBase = (gw as any).getHttpBaseUrl?.() || 'http://127.0.0.1:18789';
    const res = await fetch(`${httpBase}/readyz`);
    if (res.ok) {
      const data = await res.json();
      if (data.uptimeMs) uptimeSeconds = Math.floor(data.uptimeMs / 1000);
    }
  } catch { /* silent */ }

  // Fetch channel statuses from WS (may not exist)
  let channels: Array<{ name: string; status: string }> = [];
  try {
    const res = await gw.request('channels.status', {});
    if (Array.isArray(res?.channels)) {
      channels = res.channels.map((ch: any) => ({
        name: ch.name || ch.channel || ch.provider,
        status: ch.status || (ch.running ? 'connected' : 'disconnected'),
      }));
    }
  } catch { /* channels.status may not exist */ }

  store.setHealth({
    version: undefined, // Not available via lightweight endpoints
    uptime: uptimeSeconds,
    model: mainSession?.model,
    activeSessions: sessions.length,
    channels,
  });
}

async function tickMid() {
  await Promise.allSettled([fetchAgents(), fetchCron(), fetchHealth(), refreshModels()]);
}

/** Refresh available models from models.list API → update chatStore */
async function refreshModels() {
  if (!gw) return;
  try {
    const res = await gw.request('models.list', {});
    const rawModels = Array.isArray(res?.models) ? res.models : [];
    if (rawModels.length > 0) {
      const current = useChatStore.getState().availableModels;
      // Only update if count changed (avoid unnecessary re-renders)
      if (rawModels.length !== current.length) {
        const models = rawModels.map((m: any) => ({
          id: typeof m === 'string' ? m : (m.id || m.model || ''),
          label: typeof m === 'string' ? m : (m.id || m.model || ''),
          alias: typeof m === 'object' ? (m.alias || m.name || undefined) : undefined,
          contextWindow: typeof m === 'object' ? (m.contextWindow || m.context_window || undefined) : undefined,
          reasoning: typeof m === 'object' ? (m.reasoning || false) : false,
          provider: typeof m === 'object' ? (m.provider || (m.id || '').split('/')[0] || undefined) : undefined,
        })).filter((m: any) => m.id);
        useChatStore.getState().setAvailableModels(models);
      }
    }
  } catch {
    // Non-critical — keep existing list
  }
}

async function tickSlow() {
  await Promise.allSettled([fetchCost(), fetchUsage()]);
}

// ── Public API ──────────────────────────────────────────

/**
 * Start smart polling. Call once when gateway connects.
 * @param gateway  The GatewayService instance
 */
export function startPolling(gateway: { request: (method: string, params: any) => Promise<any> }) {
  // Prevent double-start
  if (gw && useGatewayDataStore.getState().polling) return;

  gw = gateway;
  useGatewayDataStore.getState().setPolling(true);
  console.log('[DataStore] ▶ Polling started (fast=10s, mid=30s, slow=120s)');

  // Immediate initial fetch — all groups
  tickFast();
  tickMid();
  tickSlow();

  // Set up intervals
  fastTimer = setInterval(tickFast, FAST_INTERVAL);
  midTimer  = setInterval(tickMid,  MID_INTERVAL);
  slowTimer = setInterval(tickSlow, SLOW_INTERVAL);
}

/**
 * Stop polling. Call when gateway disconnects.
 */
export function stopPolling() {
  if (fastTimer)  { clearInterval(fastTimer);  fastTimer  = null; }
  if (midTimer)   { clearInterval(midTimer);   midTimer   = null; }
  if (slowTimer)  { clearInterval(slowTimer);  slowTimer  = null; }
  gw = null;
  useGatewayDataStore.getState().setPolling(false);
  console.log('[DataStore] ⏹ Polling stopped');
}

/**
 * Force refresh all data now (e.g. user clicks Refresh button).
 */
export async function refreshAll() {
  if (!gw) return;
  console.log('[DataStore] 🔄 Manual refresh — all groups');
  await Promise.allSettled([tickFast(), tickMid(), tickSlow()]);
}

/**
 * Force refresh a specific group.
 */
export async function refreshGroup(group: 'sessions' | 'agents' | 'cost' | 'usage' | 'cron') {
  if (!gw) return;
  switch (group) {
    case 'sessions': return fetchSessions();
    case 'agents':   return fetchAgents();
    case 'cost':     return fetchCost();
    case 'usage':    return fetchUsage();
    case 'cron':     return fetchCron();
  }
}

/**
 * Fetch full-year cost data (for FullAnalytics).
 * NOT part of regular polling — only called on-demand.
 */
export async function fetchFullCost(days?: number, allTime = false): Promise<CostSummary | null> {
  if (!gw) return null;
  try {
    // "All Time": send startDate from far back instead of days cap
    const params = allTime
      ? { startDate: '2024-01-01', endDate: new Date().toISOString().slice(0, 10) }
      : { days: days || 365 };
    return await gw.request('usage.cost', params);
  } catch {
    return null;
  }
}

/**
 * Fetch heavy usage data on-demand (for FullAnalytics).
 */
export async function fetchFullUsage(limit = 2000): Promise<SessionsUsage | null> {
  if (!gw) return null;
  try {
    return await gw.request('sessions.usage', { limit });
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// Sub-Agent Detection — polling-based
// Gateway WebSocket does NOT emit stream:"tool" events,
// so we detect running sub-agents from sessions.list data.
// ═══════════════════════════════════════════════════════════

const SUB_AGENT_RE = /^agent:([^:]+):subagent:/;

/**
 * Sync runningSubAgents from sessions data.
 * Called every 10s in tickFast() after fetchSessions().
 * Sessions with key "agent:<id>:subagent:<uuid>" that appear in sessions.list
 * are running — completed sub-agent sessions are removed from the list automatically.
 * Note: sessions.list does NOT return a "running" field, so presence = active.
 */
function syncRunningSubAgents() {
  const store = useGatewayDataStore.getState();
  const sessions = store.sessions;
  const prev = store.runningSubAgents;

  // Determine truly running sub-agents using multiple signals:
  // 1. status field: "completed"/"error"/"aborted" → not running
  // 2. endedAt field: set → not running
  // 3. Time-based: not updated in 5+ minutes → likely stale (not running)
  // 4. Positive signal: status === "running" → definitely running
  const running: RunningSubAgent[] = [];
  const now = Date.now();
  const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  for (const s of sessions) {
    const match = s.key?.match(SUB_AGENT_RE);
    if (!match) continue;

    const status = (s as any).status;
    const endedAt = (s as any).endedAt;
    const updatedAt = (s as any).updatedAt || 0;

    // Definitive "not running" signals
    if (status === 'completed' || status === 'error' || status === 'aborted') continue;
    if (endedAt) continue;

    // If status is explicitly "running" → trust it
    const isExplicitlyRunning = status === 'running';

    // If no status field → use time-based heuristic
    // Sessions not updated in 5+ minutes are stale (completed but not cleaned up)
    if (!isExplicitlyRunning && updatedAt > 0 && (now - updatedAt) > STALE_THRESHOLD_MS) continue;

    const agentId = match[1];
    // Preserve startTime for already-tracked entries
    const existing = prev.find((r) => r.sessionKey === s.key);
    running.push({
      agentId,
      startTime: existing?.startTime || Date.now(),
      label: s.label || s.displayName || '',
      sessionKey: s.key,
    });
  }

  // Only update store if list actually changed
  const prevKeys = new Set(prev.map((r) => r.sessionKey));
  const newKeys = new Set(running.map((r) => r.sessionKey));
  const changed =
    prev.length !== running.length ||
    running.some((r) => !prevKeys.has(r.sessionKey)) ||
    prev.some((r) => !newKeys.has(r.sessionKey));

  if (!changed) return;

  // Log transitions
  for (const r of running) {
    if (!prevKeys.has(r.sessionKey)) {
      console.log('[DataStore] 🚀 Sub-agent detected:', r.agentId, r.label);
    }
  }
  for (const old of prev) {
    if (!newKeys.has(old.sessionKey)) {
      console.log('[DataStore] ✅ Sub-agent done:', old.agentId);
    }
  }

  store.setRunningSubAgents(running);
}

// ═══════════════════════════════════════════════════════════
// Event Handler — real-time updates from Gateway events
// ═══════════════════════════════════════════════════════════

/**
 * Handle a non-chat gateway event and update the store.
 * Call this from gateway.ts handleEvent for non-chat events.
 */
export function handleGatewayEvent(event: string, payload: any) {
  const store = useGatewayDataStore.getState();

  switch (event) {
    // ── Session events ──
    case 'session.started':
    case 'session.running': {
      const key = payload?.sessionKey || payload?.key;
      if (!key) break;
      const existing = store.sessions.find((s) => s.key === key);
      if (existing) {
        store.setSessions(
          store.sessions.map((s) => s.key === key ? { ...s, running: true } : s)
        );
      } else {
        // New session — add it
        store.setSessions([...store.sessions, { key, running: true, ...payload }]);
      }
      console.log('[DataStore] 📡 Session started:', key);
      break;
    }

    case 'session.ended':
    case 'session.stopped':
    case 'session.idle': {
      const key = payload?.sessionKey || payload?.key;
      if (!key) break;
      store.setSessions(
        store.sessions.map((s) => s.key === key ? { ...s, running: false } : s)
      );
      console.log('[DataStore] 📡 Session ended:', key);
      break;
    }

    // ── Cron events ──
    case 'cron.run.started': {
      const jobId = payload?.jobId || payload?.id;
      if (!jobId) break;
      store.setCronJobs(
        store.cronJobs.map((j) => j.id === jobId ? { ...j, state: 'running' } : j)
      );
      console.log('[DataStore] 📡 Cron started:', jobId);
      break;
    }

    case 'cron.run.completed':
    case 'cron.run.finished': {
      const jobId = payload?.jobId || payload?.id;
      if (!jobId) break;
      const job = store.cronJobs.find((j) => j.id === jobId);
      store.setCronJobs(
        store.cronJobs.map((j) => j.id === jobId
          ? { ...j, state: 'idle', lastRun: new Date().toISOString() }
          : j)
      );
      const status = payload?.status || payload?.runStatus || 'completed';
      const failed = status === 'error' || status === 'failed';
      useNotificationStore.getState().addNotification({
        category: 'cron-result',
        severity: failed ? 'error' : 'success',
        title: `Cron ${failed ? 'Failed' : 'Completed'}`,
        body: job?.name || jobId,
        route: '/cron',
      });
      console.log('[DataStore] 📡 Cron completed:', jobId);
      break;
    }

    // ── Agent events ──
    case 'agent.spawned':
    case 'agent.created': {
      // Trigger a full agents refresh to get accurate data
      fetchAgents();
      console.log('[DataStore] 📡 Agent event — refreshing agents');
      break;
    }

    // ── Task events ──
    case 'task.created':
    case 'task.started':
    case 'task.completed':
    case 'task.failed':
    case 'task.cancelled':
    case 'task.lost':
    case 'task.updated': {
      // Refresh task list when any task event arrives
      try { useTaskStore.getState().fetchTasks(); } catch {}
      console.log('[DataStore] 📡 Task event:', event);
      break;
    }

    // ── Silently ignored events (keepalives / periodic) ──
    case 'tick':
      break;

    // ── Health event — update live status ──
    case 'health':
      set({ health: payload as any });
      break;

    // ── Catch-all logging ──
    default:
      console.debug('[DataStore] 📡 Unhandled event:', event);
      break;
  }
}
