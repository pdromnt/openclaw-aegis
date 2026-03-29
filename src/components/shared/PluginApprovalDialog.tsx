// ═══════════════════════════════════════════════════════════
// Global Plugin Approval Bar — Visible on ALL pages
// Shows pending plugin approval requests with severity colors,
// countdown timer, and Allow/Always/Deny actions.
// Uses same pattern as ExecApprovalBar but with richer metadata.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, AlertTriangle, Info, Clock } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { gateway } from '@/services/gateway/index';
import clsx from 'clsx';

// ── Severity config ──

function severityConfig(severity: string | null) {
  switch (severity) {
    case 'critical':
      return {
        icon: ShieldAlert,
        border: 'border-red-500/25',
        bg: 'bg-red-500/[0.06]',
        text: 'text-red-400',
        badge: 'bg-red-500/15 text-red-400 border-red-500/25',
        pulse: true,
      };
    case 'warning':
      return {
        icon: AlertTriangle,
        border: 'border-amber-500/25',
        bg: 'bg-amber-500/[0.06]',
        text: 'text-amber-400',
        badge: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
        pulse: false,
      };
    default: // info
      return {
        icon: Info,
        border: 'border-blue-500/20',
        bg: 'bg-blue-500/[0.04]',
        text: 'text-blue-400',
        badge: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
        pulse: false,
      };
  }
}

// ── Countdown hook ──

function useCountdown(expiresAt: number): number {
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));

  useEffect(() => {
    const iv = setInterval(() => {
      const r = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setRemaining(r);
    }, 1000);
    return () => clearInterval(iv);
  }, [expiresAt]);

  return remaining;
}

// ── Single approval card ──

function PluginApprovalCard({ approval }: {
  approval: { id: string; title: string; description: string; severity: string | null; toolName: string | null; pluginId: string | null; expiresAt: number };
}) {
  const { t } = useTranslation();
  const removeApproval = useChatStore((s) => s.removePluginApproval);
  const remaining = useCountdown(approval.expiresAt);
  const cfg = severityConfig(approval.severity);
  const Icon = cfg.icon;

  const handleResolve = async (decision: 'allow-once' | 'allow-always' | 'deny') => {
    try { await gateway.resolvePluginApproval(approval.id, decision); } catch {}
    removeApproval(approval.id);
  };

  // Auto-remove expired
  useEffect(() => {
    if (remaining <= 0) removeApproval(approval.id);
  }, [remaining, approval.id, removeApproval]);

  if (remaining <= 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className={clsx(
        'flex items-start gap-3 px-3 py-2.5 rounded-lg border',
        cfg.bg, cfg.border,
        cfg.pulse && 'animate-pulse-subtle',
      )}
    >
      {/* Severity icon */}
      <Icon size={18} className={clsx(cfg.text, 'shrink-0 mt-0.5')} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title + severity badge */}
        <div className="flex items-center gap-2 mb-0.5">
          <span className={clsx('text-[12px] font-semibold', cfg.text)}>
            {approval.title}
          </span>
          {approval.severity && (
            <span className={clsx('text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border', cfg.badge)}>
              {approval.severity}
            </span>
          )}
        </div>

        {/* Description */}
        {approval.description && (
          <p className="text-[11px] text-aegis-text-muted leading-relaxed mb-1">
            {approval.description}
          </p>
        )}

        {/* Meta: toolName + pluginId */}
        <div className="flex items-center gap-2 text-[10px] text-aegis-text-dim">
          {approval.toolName && (
            <span className="font-mono bg-[rgb(var(--aegis-overlay)/0.06)] px-1.5 py-0.5 rounded">
              {approval.toolName}
            </span>
          )}
          {approval.pluginId && (
            <span className="opacity-60">
              {t('pluginApproval.plugin', 'plugin')}: {approval.pluginId}
            </span>
          )}
        </div>
      </div>

      {/* Countdown */}
      <div className="flex items-center gap-1 shrink-0 text-[10px] text-aegis-text-dim font-mono">
        <Clock size={10} />
        <span className={clsx(remaining <= 10 && 'text-red-400 font-bold')}>
          {remaining}s
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={() => handleResolve('allow-once')}
          className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/20 transition-colors"
        >
          {t('execApproval.allowOnce', 'Allow Once')}
        </button>
        <button
          onClick={() => handleResolve('allow-always')}
          className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/20 transition-colors"
        >
          {t('execApproval.allowAlways', 'Always')}
        </button>
        <button
          onClick={() => handleResolve('deny')}
          className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/15 transition-colors"
        >
          {t('execApproval.deny', 'Deny')}
        </button>
      </div>
    </motion.div>
  );
}

// ── Global bar ──

export function GlobalPluginApprovalBar() {
  const approvals = useChatStore((s) => s.pluginApprovals);

  if (approvals.length === 0) return null;

  return (
    <div className="shrink-0 flex flex-col gap-1.5 px-4 py-2 border-b border-[rgb(var(--aegis-overlay)/0.06)]">
      <AnimatePresence mode="popLayout">
        {approvals.map((a) => (
          <PluginApprovalCard key={a.id} approval={a} />
        ))}
      </AnimatePresence>
    </div>
  );
}
