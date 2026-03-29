import { useTranslation } from 'react-i18next';
// ═══════════════════════════════════════════════════════════
// Dashboard/components.tsx
// Sub-components: ContextRing, QuickAction, SessionItem,
//                 FeedItem, AgentItem
// ═══════════════════════════════════════════════════════════

import { motion } from 'framer-motion';
import { Loader2, Activity, Radio, Clock, Bot, Wifi, WifiOff } from 'lucide-react';
import clsx from 'clsx';
import type { HealthInfo } from '@/stores/gatewayDataStore';
import { themeHex } from '@/utils/theme-colors';

// ── Format helpers (shared with index.tsx) ──────────────────
import { formatTokens } from '@/utils/format';

export const fmtTokens = formatTokens; // re-export alias for backward compat

export const fmtCost = (n: number) => `$${n.toFixed(2)}`;

export const fmtCostShort = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`;

export { timeAgo, formatUptime as fmtUptime } from '@/utils/format';

// ═══════════════════════════════════════════════════════════
// ContextRing — SVG circular progress ring
// ═══════════════════════════════════════════════════════════
export function ContextRing({ percentage }: { percentage: number }) {
  const { t } = useTranslation();
  const size = 88;
  const sw   = 6;
  const r    = (size - sw) / 2;
  const c    = 2 * Math.PI * r;
  const offset = c - (Math.min(100, percentage) / 100) * c;
  const color  = percentage > 85 ? themeHex('danger')
               : percentage > 60 ? themeHex('warning')
               : themeHex('primary');

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="rgb(var(--aegis-overlay) / 0.04)" strokeWidth={sw} />
        {/* Glow layer */}
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={sw + 4}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          opacity={0.12}
          style={{ transition: 'stroke-dashoffset 1.5s ease', filter: 'blur(3px)' }} />
        {/* Fill */}
        <circle cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.5s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[20px] font-extrabold" style={{ color, textShadow: `0 0 12px ${color}40` }}>
          {Math.round(percentage)}%
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// QuickAction — Action button with hover glow
// ═══════════════════════════════════════════════════════════
export function QuickAction({ icon: Icon, label, glowColor, bgColor, iconColor, onClick, loading }: {
  icon: React.ElementType;
  label: string;
  glowColor: string;
  bgColor: string;
  iconColor: string;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={clsx(
        'group relative flex flex-col items-center gap-2 p-3.5 rounded-xl',
        'border border-[rgb(var(--aegis-overlay)/0.05)] bg-[rgb(var(--aegis-overlay)/0.015)]',
        'transition-all duration-250 overflow-hidden',
        'hover:border-[rgb(var(--aegis-overlay)/0.12)] hover:-translate-y-0.5 active:translate-y-0',
        loading && 'opacity-50 pointer-events-none'
      )}
    >
      {/* Radial hover glow */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl"
        style={{ background: `radial-gradient(ellipse at top, ${glowColor}, transparent)` }}
      />
      {loading ? (
        <Loader2 size={18} className="animate-spin text-aegis-text-dim relative z-10" />
      ) : (
        <div
          className="w-9 h-9 rounded-[10px] flex items-center justify-center relative z-10 transition-transform duration-250 group-hover:scale-110"
          style={{ background: bgColor, border: `1px solid ${iconColor}25` }}
        >
          <Icon size={18} style={{ color: iconColor }} />
        </div>
      )}
      <span className="text-[10.5px] font-medium text-aegis-text-muted leading-tight text-center relative z-10 group-hover:text-aegis-text transition-colors">
        {label}
      </span>
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// SessionItem — Single session row
// ═══════════════════════════════════════════════════════════
export function SessionItem({ isMain, name, model, detail, tokens, avatarBg, avatarColor, icon: Icon }: {
  isMain?: boolean;
  name: string;
  model: string;
  detail: string;
  tokens: string;
  avatarBg: string;
  avatarColor: string;
  icon: React.ElementType;
}) {
  return (
    <div className={clsx(
      'flex items-center gap-3 p-2.5 rounded-[10px] transition-all duration-200 cursor-default',
      isMain
        ? 'bg-aegis-primary-surface border border-aegis-primary/10'
        : 'hover:bg-[rgb(var(--aegis-overlay)/0.03)]'
    )}>
      <div
        className="w-[34px] h-[34px] rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: avatarBg }}
      >
        <Icon size={16} style={{ color: avatarColor }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-aegis-text truncate">{name}</div>
        <div className="text-[10px] text-aegis-text-muted font-mono flex gap-2 mt-0.5">
          <span className="truncate max-w-[90px]">{model}</span>
          <span className="opacity-60">{detail}</span>
        </div>
      </div>
      <span className={clsx(
        'text-[11px] font-bold font-mono flex-shrink-0',
        isMain ? 'text-aegis-primary' : 'text-aegis-text-dim'
      )}>{tokens}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// FeedItem — Activity feed entry with connector line
// ═══════════════════════════════════════════════════════════
export function FeedItem({ color, text, time, isLast }: {
  color: string;
  text: string;
  time: string;
  isLast?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="flex gap-2.5 py-2 border-b border-[rgb(var(--aegis-overlay)/0.025)] last:border-b-0"
    >
      <div className="flex flex-col items-center pt-1.5">
        <div
          className="w-[7px] h-[7px] rounded-full flex-shrink-0"
          style={{ background: color, boxShadow: `0 0 6px ${color}60` }}
        />
        {!isLast && (
          <div className="w-px flex-1 mt-1 bg-gradient-to-b from-white/[0.06] to-transparent" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-aegis-text leading-[1.4]">{text}</div>
        <div className="text-[9px] text-aegis-text-muted font-mono mt-0.5">{time}</div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// AgentItem — Agent row with relative cost bar
// ═══════════════════════════════════════════════════════════
export function AgentItem({ emoji, name, model, cost, costToday, maxCost, isFree }: {
  emoji: string;
  name: string;
  model: string;
  cost: string;
  costToday: number;
  maxCost: number;
  isFree?: boolean;
}) {
  const barPct = maxCost > 0 ? Math.min(100, (costToday / maxCost) * 100) : 0;
  const barColor = barPct > 70 ? themeHex('danger') : barPct > 40 ? themeHex('warning') : themeHex('primary');

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-[rgb(var(--aegis-overlay)/0.04)] last:border-b-0">
      <span className="text-[18px] flex-shrink-0 leading-none w-6 text-center">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[12px] font-semibold text-aegis-text truncate">{name}</span>
          {isFree ? (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-aegis-success/10 text-aegis-success tracking-wide flex-shrink-0">
              FREE
            </span>
          ) : (
            <span className="text-[12px] font-bold font-mono text-aegis-text flex-shrink-0">{cost}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-[rgb(var(--aegis-overlay)/0.04)] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${barPct}%`, background: barColor, boxShadow: `0 0 4px ${barColor}40` }}
            />
          </div>
          <span className="text-[9px] text-aegis-text-muted font-mono flex-shrink-0">{model}</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HealthCard — System health overview for Dashboard
// ═══════════════════════════════════════════════════════════

function fmtUptime2(seconds?: number): string {
  if (!seconds) return '—';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

export function HealthCard({ health, connected }: { health: HealthInfo | null; connected: boolean }) {
  const { t } = useTranslation();
  const stats = [
    { icon: Clock,    label: 'Uptime',    value: fmtUptime2(health?.uptime) },
    { icon: Bot,      label: 'Model',     value: health?.model?.split('/').pop() || '—' },
    { icon: Activity, label: 'Sessions',  value: health?.activeSessions != null ? `${health.activeSessions} active` : '—' },
    { icon: Radio,    label: 'Heartbeat', value: health?.lastHeartbeat ? fmtHbAgo(health.lastHeartbeat) : '—' },
  ];

  const channels = health?.channels || [];

  return (
    <div className="rounded-xl border border-aegis-border bg-aegis-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-aegis-text">🏥 System Health</span>
          {health?.version && (
            <span className="text-[10px] font-mono text-aegis-text-dim px-1.5 py-0.5 rounded bg-[rgb(var(--aegis-overlay)/0.04)] border border-[rgb(var(--aegis-overlay)/0.06)]">
              v{health.version}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <div className={clsx(
            'w-2 h-2 rounded-full',
            connected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.4)] animate-pulse' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]'
          )} />
          <span className={clsx('text-[11px] font-medium', connected ? 'text-emerald-400' : 'text-red-400')}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-[rgb(var(--aegis-overlay)/0.02)] border border-[rgb(var(--aegis-overlay)/0.04)]">
            <s.icon size={14} className="text-aegis-text-dim shrink-0" />
            <div>
              <div className="text-[9px] text-aegis-text-dim uppercase tracking-wider">{s.label}</div>
              <div className="text-[12px] font-semibold text-aegis-text font-mono">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Channels */}
      {channels.length > 0 && (
        <div className="pt-2 border-t border-[rgb(var(--aegis-overlay)/0.04)]">
          <div className="text-[9px] text-aegis-text-dim uppercase tracking-wider mb-2">{t('dashboard.channels')}</div>
          <div className="flex flex-wrap gap-1.5">
            {channels.map((ch, i) => (
              <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[rgb(var(--aegis-overlay)/0.03)] border border-[rgb(var(--aegis-overlay)/0.06)] text-[11px]">
                <div className={clsx('w-1.5 h-1.5 rounded-full', ch.status === 'connected' || ch.status === 'ready' ? 'bg-emerald-500' : 'bg-red-500')} />
                <span className="text-aegis-text-muted">{ch.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function fmtHbAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}
