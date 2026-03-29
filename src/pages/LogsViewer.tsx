// ═══════════════════════════════════════════════════════════
// LogsViewer — Gateway log viewer with search, level filter, live tail
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollText, RefreshCw, Loader2, Search, Radio } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { gateway } from '@/services/gateway/index';
import clsx from 'clsx';

// ── Types ────────────────────────────────────────────────

interface LogEntry {
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug' | string;
  source: string;
  message: string;
}

type LogLevel = 'all' | 'error' | 'warn' | 'info' | 'debug';
type TimeRange = '1h' | '6h' | '24h' | 'all';

// ── Helpers ──────────────────────────────────────────────

function parseLogLine(raw: string): LogEntry | null {
  // Try JSON format first: { "0": "subsystem", "1": "message", "_meta": { "logLevelName": "INFO", "date": "..." } }
  try {
    const obj = JSON.parse(raw);
    if (obj._meta) {
      const time = obj._meta.date || obj.time || '';
      const level = (obj._meta.logLevelName || 'info').toLowerCase();
      const source = typeof obj['0'] === 'string' && obj['0'].startsWith('{')
        ? (JSON.parse(obj['0']).subsystem || '').replace('gateway/', '')
        : String(obj['0'] || '');
      const message = typeof obj['1'] === 'string' ? obj['1'] : JSON.stringify(obj['1'] || '');
      return { timestamp: time, level, source: `[${source}]`, message };
    }
  } catch { /* not JSON */ }

  // Try plain text format: timestamp [source] LEVEL message
  const m = raw.match(/(\d{2}:\d{2}:\d{2})\s+\[(\w+)\]\s+(\w+)\s+(.*)/);
  if (m) return { timestamp: m[1], level: m[3].toLowerCase(), source: `[${m[2]}]`, message: m[4] };

  // Fallback: treat as info
  if (raw.trim()) return { timestamp: '', level: 'info', source: '', message: raw.trim() };
  return null;
}

function formatTime(ts: string): string {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts.substring(0, 8);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return ts.substring(0, 8); }
}

function levelClass(level: string): string {
  switch (level) {
    case 'error': return 'text-red-400 bg-red-500/8';
    case 'warn': return 'text-amber-400 bg-amber-500/8';
    case 'info': return 'text-blue-400 bg-blue-500/8';
    case 'debug': return 'text-zinc-500 bg-zinc-500/5';
    default: return 'text-zinc-400 bg-zinc-500/5';
  }
}

function msgClass(level: string): string {
  switch (level) {
    case 'error': return 'text-red-300';
    case 'warn': return 'text-amber-200/80';
    default: return 'text-aegis-text-muted';
  }
}

function msAgo(range: TimeRange): number {
  switch (range) {
    case '1h': return 3_600_000;
    case '6h': return 21_600_000;
    case '24h': return 86_400_000;
    default: return Infinity;
  }
}

// ═══════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════

export function LogsViewerPage() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<LogLevel>('all');
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [liveTail, setLiveTail] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    try {
      const res = await gateway.call('logs.tail', { limit: 500 });
      const raw: string[] = Array.isArray(res?.lines) ? res.lines
        : typeof res === 'string' ? res.split('\n')
        : Array.isArray(res) ? res
        : [];

      const parsed = raw
        .map((line: any) => parseLogLine(typeof line === 'string' ? line : JSON.stringify(line)))
        .filter(Boolean) as LogEntry[];

      setLogs(parsed);
    } catch {
      // Fallback: empty
      setLogs([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Live tail polling
  useEffect(() => {
    if (liveTail) {
      pollRef.current = setInterval(fetchLogs, 5000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [liveTail, fetchLogs]);

  // Auto-scroll on live tail
  useEffect(() => {
    if (liveTail && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [logs, liveTail]);

  // Filter
  const filtered = useMemo(() => {
    const now = Date.now();
    const rangeMs = msAgo(timeRange);
    const q = search.toLowerCase();

    return logs.filter((entry) => {
      // Level filter
      if (levelFilter !== 'all' && entry.level !== levelFilter) return false;

      // Time range
      if (rangeMs < Infinity && entry.timestamp) {
        try {
          const ts = new Date(entry.timestamp).getTime();
          if (now - ts > rangeMs) return false;
        } catch { /* keep */ }
      }

      // Search
      if (q && !entry.message.toLowerCase().includes(q) && !entry.source.toLowerCase().includes(q)) return false;

      return true;
    });
  }, [logs, levelFilter, timeRange, search]);

  const levels: LogLevel[] = ['all', 'error', 'warn', 'info', 'debug'];
  const timeRanges: { key: TimeRange; labelKey: string }[] = [
    { key: '1h', labelKey: 'logs.last1h' },
    { key: '6h', labelKey: 'logs.last6h' },
    { key: '24h', labelKey: 'logs.last24h' },
    { key: 'all', labelKey: 'logs.timeAll' },
  ];

  return (
    <PageTransition>
      <div className="p-6 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-[18px] font-bold text-aegis-text flex items-center gap-2">
              <ScrollText size={20} /> {t('logs.title')}
            </h1>
            <p className="text-[12px] text-aegis-text-dim mt-0.5">
              {t('logs.entriesCount', { count: filtered.length })}{logs.length !== filtered.length ? ` ${t('logs.totalCount', { count: logs.length })}` : ''}
            </p>
          </div>
          <button
            onClick={() => { setLoading(true); fetchLogs(); }}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-aegis-text-muted bg-[rgb(var(--aegis-overlay)/0.03)] border border-[rgb(var(--aegis-overlay)/0.08)] hover:bg-[rgb(var(--aegis-overlay)/0.06)] transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> {t('logs.refresh')}
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex gap-2 mb-3 items-center flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-aegis-text-dim" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('logs.filterPlaceholder')}
              className="w-full pl-9 pr-3 py-2 rounded-lg text-[12px] font-mono bg-[rgb(var(--aegis-overlay)/0.03)] border border-[rgb(var(--aegis-overlay)/0.08)] text-aegis-text placeholder:text-aegis-text-dim/40 outline-none focus:border-aegis-primary/30"
            />
          </div>

          {/* Level pills */}
          <div className="flex gap-1">
            {levels.map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                className={clsx(
                  'px-2.5 py-1.5 rounded-md text-[10px] font-semibold border transition-all',
                  levelFilter === lvl
                    ? lvl === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20'
                    : lvl === 'warn' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-aegis-primary/10 text-aegis-primary border-aegis-primary/20'
                    : 'bg-[rgb(var(--aegis-overlay)/0.03)] text-aegis-text-muted border-transparent hover:bg-[rgb(var(--aegis-overlay)/0.06)]'
                )}
              >
                {t(`logs.level${lvl.charAt(0).toUpperCase() + lvl.slice(1)}`)}
              </button>
            ))}
          </div>

          {/* Time range */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="px-2.5 py-1.5 rounded-md text-[11px] bg-[rgb(var(--aegis-overlay)/0.03)] border border-[rgb(var(--aegis-overlay)/0.08)] text-aegis-text-muted outline-none cursor-pointer"
          >
            {timeRanges.map((tr) => (
              <option key={tr.key} value={tr.key}>{t(tr.labelKey)}</option>
            ))}
          </select>

          {/* Live tail */}
          <button
            onClick={() => setLiveTail(!liveTail)}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-medium border transition-all',
              liveTail
                ? 'bg-emerald-500/8 text-emerald-400 border-emerald-500/20'
                : 'bg-[rgb(var(--aegis-overlay)/0.03)] text-aegis-text-muted border-[rgb(var(--aegis-overlay)/0.08)]'
            )}
          >
            {liveTail && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
            <Radio size={10} />
            {t('logs.liveTail')}
          </button>
        </div>

        {/* Log List */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto rounded-lg border border-[rgb(var(--aegis-overlay)/0.06)] bg-[rgb(var(--aegis-overlay)/0.01)] font-mono text-[11px] scrollbar-thin"
        >
          {loading ? (
            <div className="flex items-center justify-center h-[200px]">
              <Loader2 className="w-5 h-5 animate-spin text-aegis-primary/50" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-aegis-text-dim">
              <ScrollText size={28} className="opacity-20 mb-2" />
              <span className="text-[12px]">{t('logs.noResults')}</span>
            </div>
          ) : (
            filtered.map((entry, i) => (
              <div
                key={i}
                className="flex gap-2 px-3 py-[3px] border-b border-[rgb(var(--aegis-overlay)/0.03)] hover:bg-[rgb(var(--aegis-overlay)/0.02)]"
              >
                <span className="text-aegis-text-dim/40 whitespace-nowrap min-w-[70px]">
                  {formatTime(entry.timestamp)}
                </span>
                <span className={clsx('font-bold min-w-[45px] text-center px-1 rounded text-[10px]', levelClass(entry.level))}>
                  {entry.level.toUpperCase()}
                </span>
                <span className="text-purple-400/70 min-w-[90px] truncate">
                  {entry.source}
                </span>
                <span className={clsx('flex-1 break-all', msgClass(entry.level))}>
                  {entry.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </PageTransition>
  );
}
