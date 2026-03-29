// ═══════════════════════════════════════════════════════════
// McpTools — Tools & Integrations Page
// Now powered by Gateway tools.catalog + tools.effective APIs
// Groups by source: Core / Plugin / Channel
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Wrench, Plug, RefreshCw, Loader2, CheckCircle, XCircle, Package, Cpu, Radio } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { gateway } from '@/services/gateway/index';
import clsx from 'clsx';

// ── Types ────────────────────────────────────────────────

interface CatalogTool {
  name: string;
  description?: string;
  source: 'core' | 'plugin' | 'channel' | string;
  pluginId?: string;
  optional?: boolean;
  category?: string;
}

interface EffectiveTool {
  name: string;
  available: boolean;
}

type SourceFilter = 'all' | 'core' | 'plugin' | 'channel';

// ── Source badge helpers ─────────────────────────────────

function sourceBadgeClass(source: string): string {
  switch (source) {
    case 'core': return 'bg-blue-500/10 text-blue-400';
    case 'plugin': return 'bg-purple-500/10 text-purple-400';
    case 'channel': return 'bg-emerald-500/10 text-emerald-400';
    default: return 'bg-zinc-500/10 text-zinc-400';
  }
}

function sourceIcon(source: string) {
  switch (source) {
    case 'core': return <Cpu size={12} />;
    case 'plugin': return <Package size={12} />;
    case 'channel': return <Radio size={12} />;
    default: return <Wrench size={12} />;
  }
}

// ═══════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════

export function McpToolsPage() {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<CatalogTool[]>([]);
  const [effective, setEffective] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [search, setSearch] = useState('');

  // Fetch data
  const fetchTools = async () => {
    setLoading(true);
    setError(null);
    try {
      let tools: CatalogTool[] = [];

      // Try tools.catalog first (new API) — may return groups or flat tools
      const catRes = await gateway.call('tools.catalog', {}).catch((e: any) => {
        console.warn('[McpTools] tools.catalog failed:', e?.message);
        return null;
      });

      if (catRes?.tools && Array.isArray(catRes.tools)) {
        tools = catRes.tools.map((t: any) => ({
          name: t.name,
          description: t.description || '',
          source: t.source || 'core',
          pluginId: t.pluginId,
          optional: t.optional,
          category: t.category,
        }));
      } else if (catRes?.groups && Array.isArray(catRes.groups)) {
        // tools.catalog may return { groups: [{ id, label, source, tools: [...] }] }
        for (const group of catRes.groups) {
          const groupSource = group.source || 'core';
          const groupTools = Array.isArray(group.tools) ? group.tools : [];
          for (const t of groupTools) {
            tools.push({
              name: t.name || t.id,
              description: t.description || '',
              source: groupSource,
              pluginId: group.pluginId || t.pluginId,
              optional: t.optional,
              category: group.label || group.id,
            });
          }
        }
      }

      // Fallback: use tools.effective if catalog returned nothing
      if (tools.length === 0) {
        const effRes = await gateway.call('tools.effective', { sessionKey: 'agent:main:main' }).catch((e: any) => {
          console.warn('[McpTools] tools.effective failed:', e?.message);
          return null;
        });
        if (effRes?.tools && Array.isArray(effRes.tools)) {
          tools = effRes.tools.map((t: any) => ({
            name: typeof t === 'string' ? t : (t.name || t.id || ''),
            description: typeof t === 'string' ? '' : (t.description || ''),
            source: typeof t === 'string' ? 'core' : (t.source || 'core'),
            pluginId: typeof t === 'string' ? undefined : t.pluginId,
          }));
        }
      }

      setCatalog(tools);

      // Fetch effective tools for the main session (for active/inactive status)
      try {
        const effRes = await gateway.call('tools.effective', { sessionKey: 'agent:main:main' });
        const map = new Map<string, boolean>();
        const effTools = effRes?.tools || [];
        for (const et of effTools) {
          const name = typeof et === 'string' ? et : (et.name || et.id || '');
          if (name) map.set(name, true);
        }
        setEffective(map);
      } catch {
        // tools.effective may not exist — that's OK
      }
    } catch (e: any) {
      setError(e?.message || t('mcpTools.failedToLoad'));
    }
    setLoading(false);
  };

  useEffect(() => { fetchTools(); }, []);

  // Filter + search
  const filtered = useMemo(() => {
    let list = catalog;
    if (filter !== 'all') list = list.filter((t) => t.source === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((t) =>
        t.name.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        (t.pluginId || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [catalog, filter, search]);

  // Counts
  const counts = useMemo(() => ({
    all: catalog.length,
    core: catalog.filter((t) => t.source === 'core').length,
    plugin: catalog.filter((t) => t.source === 'plugin').length,
    channel: catalog.filter((t) => t.source === 'channel').length,
  }), [catalog]);

  // Group by source
  const grouped = useMemo(() => {
    const groups: Record<string, CatalogTool[]> = {};
    for (const t of filtered) {
      const key = t.source || 'other';
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    }
    return groups;
  }, [filtered]);

  const filterKeys: SourceFilter[] = ['all', 'core', 'plugin', 'channel'];

  return (
    <PageTransition>
      <div className="p-6 max-w-[1000px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-[18px] font-bold text-aegis-text flex items-center gap-2">
              <Wrench size={20} /> {t('mcpTools.title')}
            </h1>
            <p className="text-[12px] text-aegis-text-dim mt-0.5">
              {t('mcpTools.toolsAvailable', { count: catalog.length })} · {t('mcpTools.activeInSession', { count: effective.size })}
            </p>
          </div>
          <button
            onClick={fetchTools}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-aegis-text-muted bg-[rgb(var(--aegis-overlay)/0.03)] border border-[rgb(var(--aegis-overlay)/0.08)] hover:bg-[rgb(var(--aegis-overlay)/0.06)] transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> {t('mcpTools.refresh')}
          </button>
        </div>

        {/* Search + Filters */}
        <div className="flex gap-3 mb-4 items-center">
          <div className="relative flex-1">
            <Wrench size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-aegis-text-dim" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('mcpTools.searchPlaceholder')}
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
                {t(`mcpTools.filter${key.charAt(0).toUpperCase() + key.slice(1)}`)}
                <span className="ml-1 opacity-60 text-[9px]">{counts[key as keyof typeof counts] || 0}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Loading / Error */}
        {loading && (
          <div className="flex items-center justify-center h-[200px]">
            <Loader2 className="w-6 h-6 animate-spin text-aegis-primary/50" />
          </div>
        )}

        {error && (
          <div className="text-center text-red-400 text-[12px] py-8">{error}</div>
        )}

        {/* Tool Groups */}
        {!loading && !error && (
          <div className="space-y-6">
            {Object.entries(grouped).map(([source, tools]) => (
              <div key={source}>
                <div className="flex items-center gap-2 mb-3">
                  {sourceIcon(source)}
                  <span className="text-[13px] font-semibold text-aegis-text capitalize">{t('mcpTools.sourceTools', { source })}</span>
                  <span className="text-[10px] text-aegis-text-dim">({tools.length})</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {tools.map((tool) => {
                    const isActive = effective.has(tool.name);
                    return (
                      <div
                        key={tool.name}
                        className={clsx(
                          'px-3 py-2.5 rounded-lg border transition-all',
                          isActive
                            ? 'bg-[rgb(var(--aegis-overlay)/0.03)] border-aegis-primary/15'
                            : 'bg-[rgb(var(--aegis-overlay)/0.01)] border-[rgb(var(--aegis-overlay)/0.06)] opacity-60'
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12px] font-semibold text-aegis-text font-mono">{tool.name}</span>
                          <div className="flex items-center gap-1.5">
                            {isActive ? (
                              <CheckCircle size={12} className="text-emerald-400" />
                            ) : (
                              <XCircle size={12} className="text-zinc-500" />
                            )}
                            <span className={clsx('text-[8px] px-1.5 py-0.5 rounded font-medium', sourceBadgeClass(tool.source))}>
                              {tool.source}
                            </span>
                          </div>
                        </div>
                        {tool.description && (
                          <div className="text-[10px] text-aegis-text-dim leading-relaxed line-clamp-2">{tool.description}</div>
                        )}
                        {tool.pluginId && (
                          <div className="text-[9px] text-purple-400/60 mt-1">{t('mcpTools.plugin')}: {tool.pluginId}</div>
                        )}
                        {tool.optional && (
                          <div className="text-[9px] text-amber-400/60 mt-0.5">{t('mcpTools.optional')}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center h-[150px] text-aegis-text-dim">
                <Wrench size={28} className="opacity-20 mb-2" />
                <span className="text-[12px]">{t('mcpTools.noResults')}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
