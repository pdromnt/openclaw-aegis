// ═══════════════════════════════════════════════════════════
// GatewayTab — Gateway health, status, skills, tool catalog
// ═══════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Server, Clock, Zap, Wrench, AlertCircle, RefreshCw } from 'lucide-react';
import { gateway } from '@/services/gateway/index';
import clsx from 'clsx';

interface SystemInfo {
  runtimeVersion?: string;
  tasks?: { total: number; active: number; terminal: number; failures: number };
  sessions?: { count: number; defaults?: { model?: string; contextTokens?: number } };
  channels?: string[];
  heartbeatAgent?: string;
}

interface SkillEntry {
  name?: string;
  skillKey?: string;
  description?: string;
  disabled?: boolean;
  eligible?: boolean;
  emoji?: string;
  source?: string;
}

interface ToolEntry {
  id?: string;
  label?: string;
  description?: string;
  source?: string;
  groupLabel?: string;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function GatewayTab() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [tools, setTools] = useState<ToolEntry[]>([]);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, skillsRes, toolsRes] = await Promise.allSettled([
        gateway.getGatewayStatus(),
        gateway.getSkillsStatus(),
        gateway.getToolCatalog(),
      ]);

      if (statusRes.status === 'fulfilled' && statusRes.value) {
        const s = statusRes.value as any;
        setSystemInfo({
          runtimeVersion: s?.runtimeVersion,
          tasks: s?.tasks,
          sessions: s?.sessions,
          channels: s?.channelSummary,
          heartbeatAgent: s?.heartbeat?.agents?.[0]?.agentId,
        });
      }

      if (skillsRes.status === 'fulfilled') {
        const s = skillsRes.value as any;
        setSkills(s?.skills ?? []);
      }

      if (toolsRes.status === 'fulfilled') {
        const t = toolsRes.value as any;
        const allTools: ToolEntry[] = [];
        for (const group of t?.groups ?? []) {
          for (const tool of group.tools ?? []) {
            allTools.push({ ...tool, groupLabel: group.label });
          }
        }
        setTools(allTools);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch Gateway info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw size={20} className="text-aegis-primary animate-spin" />
        <span className="ml-3 text-aegis-text-muted text-sm">{t('common.loading', 'Loading…')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <AlertCircle size={24} className="text-aegis-danger" />
        <span className="text-aegis-text-muted text-sm">{error}</span>
        <button onClick={fetchAll} className="px-3 py-1.5 rounded-lg text-xs bg-aegis-primary/10 text-aegis-primary hover:bg-aegis-primary/20 transition-colors">
          {t('common.retry', 'Retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── System Info ── */}
      {systemInfo && (
        <div className="rounded-xl border border-aegis-border bg-aegis-elevated p-5">
          <div className="flex items-center gap-2 mb-4">
            <Server size={14} className="text-aegis-primary" />
            <span className="text-[13px] font-semibold text-aegis-text">
              {t('gateway.systemInfo', 'Gateway Status')}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatItem label="Version" value={systemInfo.runtimeVersion} />
            {systemInfo.tasks && (
              <>
                <StatItem label="Tasks" value={`${systemInfo.tasks.terminal} / ${systemInfo.tasks.total}`} />
                <StatItem label="Active" value={systemInfo.tasks.active.toString()} />
                <StatItem label="Failures" value={systemInfo.tasks.failures.toString()} />
              </>
            )}
            {systemInfo.sessions && (
              <>
                <StatItem label="Sessions" value={systemInfo.sessions.count?.toString()} />
                {systemInfo.sessions.defaults?.model && (
                  <StatItem label="Default Model" value={systemInfo.sessions.defaults.model} mono />
                )}
              </>
            )}
            {systemInfo.heartbeatAgent && (
              <StatItem label="Heartbeat" value={systemInfo.heartbeatAgent} mono />
            )}
          </div>
          {systemInfo.channels && systemInfo.channels.length > 0 && (() => {
            const clean = systemInfo.channels!
              .filter(ch => !ch.startsWith('  '))
              .map(ch => ch.replace(/: configured$/, ''));
            return clean.length > 0 && (
              <div className="mt-4 pt-4 border-t border-aegis-border">
                <div className="text-[10px] text-aegis-text-dim uppercase tracking-wider mb-2">Channels</div>
                <div className="flex flex-wrap gap-1.5">
                  {clean.map((ch, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-aegis-success/10 text-aegis-success font-medium">
                      {ch}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ── Skills ── */}
        {skills.length > 0 && (
          <div className="rounded-xl border border-aegis-border bg-aegis-elevated p-5">
            <div className="flex items-center gap-2 mb-4">
              <Zap size={14} className="text-aegis-primary" />
              <span className="text-[13px] font-semibold text-aegis-text">
                {t('gateway.skills', 'Skills')}
              </span>
              <span className="text-[10px] text-aegis-text-dim ml-auto">{skills.length}</span>
            </div>
            <div className="space-y-2">
              {skills.map((skill, i) => (
                <div key={skill.skillKey ?? i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-aegis-surface border border-aegis-border/50">
                  <div className="text-[14px] shrink-0">{skill.emoji ?? '🛠️'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-aegis-text">{skill.name ?? skill.skillKey}</span>
                      {skill.source && (
                        <span className="text-[9px] px-1 rounded bg-aegis-text-dim/10 text-aegis-text-dim">{skill.source}</span>
                      )}
                    </div>
                    {skill.description && <div className="text-[10px] text-aegis-text-dim mt-0.5 line-clamp-2">{skill.description}</div>}
                  </div>
                  <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0',
                    skill.disabled ? 'bg-aegis-text-dim/10 text-aegis-text-dim' :
                    skill.eligible ? 'bg-aegis-success/10 text-aegis-success' :
                    'bg-aegis-warning/10 text-aegis-warning')}>
                    {skill.disabled ? 'DISABLED' : skill.eligible ? 'READY' : 'UNCONFIGURED'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tool Catalog ── */}
        {tools.length > 0 && (
          <div className="rounded-xl border border-aegis-border bg-aegis-elevated p-5">
            <div className="flex items-center gap-2 mb-4">
              <Wrench size={14} className="text-aegis-accent" />
              <span className="text-[13px] font-semibold text-aegis-text">
                {t('gateway.tools', 'Tool Catalog')}
              </span>
              <span className="text-[10px] text-aegis-text-dim ml-auto">{tools.length}</span>
            </div>
            <div className="space-y-2">
              {tools.map((tool, i) => (
                <div key={`${tool.id}-${i}`} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-aegis-surface border border-aegis-border/50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-aegis-text font-mono">{tool.label ?? tool.id}</span>
                      {tool.source && (
                        <span className={clsx('text-[9px] px-1 rounded', tool.source === 'core' ? 'bg-aegis-text-dim/10 text-aegis-text-dim' : 'bg-aegis-accent/10 text-aegis-accent')}>
                          {tool.source}
                        </span>
                      )}
                      {tool.groupLabel && (
                        <span className="text-[9px] text-aegis-text-dim/50">{tool.groupLabel}</span>
                      )}
                    </div>
                    {tool.description && <div className="text-[10px] text-aegis-text-dim mt-0.5">{tool.description}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state when no skills or tools */}
        {skills.length === 0 && tools.length === 0 && (
          <div className="lg:col-span-2 rounded-xl border border-aegis-border bg-aegis-elevated p-8 text-center">
            <Wrench size={24} className="text-aegis-text-dim/30 mx-auto mb-3" />
            <div className="text-[13px] text-aegis-text-dim">{t('gateway.noData', 'No skills or tools available')}</div>
          </div>
        )}
      </div>

      {/* Refresh button */}
      <div className="flex justify-center">
        <button onClick={fetchAll} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-aegis-text-muted hover:text-aegis-text hover:bg-aegis-surface transition-colors">
          <RefreshCw size={12} />
          {t('common.refresh', 'Refresh')}
        </button>
      </div>
    </div>
  );
}

// ── StatItem helper ──
function StatItem({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  if (value == null) return null;
  return (
    <div>
      <div className="text-[9px] text-aegis-text-dim uppercase tracking-wider mb-0.5">{label}</div>
      <div className={clsx('text-[12px] text-aegis-text', mono && 'font-mono')}>{value}</div>
    </div>
  );
}
