// ═══════════════════════════════════════════════════════════
// Global Exec Approval Bar — Visible on ALL pages
// Shows pending exec approval requests with Allow/Always/Deny
// Floats above page content so approvals are never missed
// ═══════════════════════════════════════════════════════════

import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert } from 'lucide-react';
import { useChatStore } from '@/stores/chatStore';
import { gateway } from '@/services/gateway/index';
import clsx from 'clsx';

export function GlobalExecApprovalBar() {
  const { t } = useTranslation();
  const approvals = useChatStore((s) => s.execApprovals);
  const removeApproval = useChatStore((s) => s.removeExecApproval);

  // Auto-cleanup expired approvals every 10 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const expired = approvals.filter(a => a.expiresAt <= now);
      expired.forEach(a => removeApproval(a.id));
    }, 10_000);
    return () => clearInterval(timer);
  }, [approvals, removeApproval]);

  // Filter out expired approvals for display
  const activeApprovals = useMemo(
    () => approvals.filter(a => a.expiresAt > Date.now()),
    [approvals]
  );

  if (activeApprovals.length === 0) return null;

  return (
    <div className="shrink-0 flex flex-col gap-1.5 px-4 py-2 border-b border-amber-500/15 bg-amber-500/[0.03]">
      <AnimatePresence mode="popLayout">
        {activeApprovals.map((a) => (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className={clsx(
              'flex items-center gap-3 px-3 py-2 rounded-lg',
              'bg-amber-500/8 border border-amber-500/15',
              'animate-pulse-subtle'
            )}
          >
            <ShieldAlert size={16} className="text-amber-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-amber-400 font-medium mb-0.5">
                {t('execApproval.title', '⚡ Exec Approval Required')}
              </div>
              <code className="text-[12px] text-aegis-text block truncate" title={a.command}>
                {a.command}
              </code>
              {a.cwd && (
                <span className="text-[10px] text-aegis-text-dim">
                  {t('execApproval.in', 'in')} {a.cwd}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={async () => {
                  try { await gateway.resolveExecApproval(a.id, 'allow-once'); } catch {}
                  removeApproval(a.id);
                }}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/20 transition-colors"
              >
                {t('execApproval.allowOnce', 'Allow Once')}
              </button>
              <button
                onClick={async () => {
                  try { await gateway.resolveExecApproval(a.id, 'allow-always'); } catch {}
                  removeApproval(a.id);
                }}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 border border-blue-500/20 transition-colors"
              >
                {t('execApproval.allowAlways', 'Always')}
              </button>
              <button
                onClick={async () => {
                  try { await gateway.resolveExecApproval(a.id, 'deny'); } catch {}
                  removeApproval(a.id);
                }}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/15 transition-colors"
              >
                {t('execApproval.deny', 'Deny')}
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
