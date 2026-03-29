// ═══════════════════════════════════════════════════════════
// CodeInterpreter — Tool Execution / Sandbox View
// Displays all exec/process/file tool calls as terminal cards
// ═══════════════════════════════════════════════════════════

import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Terminal,
  Filter,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Copy,
  Check,
} from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { useChatStore } from '@/stores/chatStore';
import type { ToolBlock } from '@/types/RenderBlock';
import clsx from 'clsx';

// ── Constants ─────────────────────────────────────────────

const FILTER_OPTIONS = ['All', 'exec', 'process', 'Read', 'Write', 'Edit'] as const;
type FilterOption = (typeof FILTER_OPTIONS)[number];

// ── Helpers ───────────────────────────────────────────────

function getToolIcon(toolName: string): string {
  switch (toolName.toLowerCase()) {
    case 'exec':    return '⚡';
    case 'process': return '⚙️';
    case 'read':    return '📄';
    case 'write':   return '✍️';
    case 'edit':    return '✏️';
    default:        return '🔧';
  }
}

function getInputText(input?: Record<string, unknown>): string {
  if (!input) return '';
  if (typeof input.command === 'string') return input.command;
  if (typeof input.path === 'string') return input.path;
  if (typeof input.file_path === 'string') return input.file_path;
  // Fallback: show first string value found
  for (const v of Object.values(input)) {
    if (typeof v === 'string') return v;
  }
  return JSON.stringify(input, null, 2);
}

function truncateLines(text: string, n: number): string {
  return text.split('\n').slice(0, n).join('\n');
}

// ── StatusBadge ───────────────────────────────────────────

function StatusBadge({ status }: { status: ToolBlock['status'] }) {
  const { t } = useTranslation();
  if (status === 'running') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--aegis-accent)/0.1)] px-2 py-0.5 text-[11px] font-semibold text-aegis-accent">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t('codeInterpreter.statusRunning')}
      </span>
    );
  }
  if (status === 'done') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-aegis-success-surface px-2 py-0.5 text-[11px] font-semibold text-aegis-success">
        <CheckCircle className="h-3 w-3" />
        {t('codeInterpreter.statusDone')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-aegis-danger-surface px-2 py-0.5 text-[11px] font-semibold text-aegis-danger">
      <XCircle className="h-3 w-3" />
      {t('codeInterpreter.statusError')}
    </span>
  );
}

// ── CopyButton ────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard not available
    }
  };

  return (
    <button
      onClick={handleCopy}
      title={t('codeInterpreter.copyOutput', 'Copy output')}
      className={clsx(
        'inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors',
        copied
          ? 'bg-aegis-success-surface text-aegis-success'
          : 'bg-aegis-surface text-aegis-text-muted hover:bg-aegis-elevated hover:text-aegis-text-secondary',
      )}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? t('codeInterpreter.copied') : t('codeInterpreter.copy')}
    </button>
  );
}

// ── ExecCard ──────────────────────────────────────────────

function ExecCard({ block }: { block: ToolBlock }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const inputText = getInputText(block.input);
  const outputText = block.output ?? '';
  const outputLines = outputText.split('\n');
  const hasMoreOutput = outputLines.length > 3;
  const visibleOutput = expanded ? outputText : truncateLines(outputText, 3);

  const hasInput  = inputText.trim().length > 0;
  const hasOutput = outputText.trim().length > 0;

  return (
    <div className="rounded-xl border border-aegis-border bg-aegis-surface backdrop-blur-sm overflow-hidden">
      {/* ── Card Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-aegis-surface border-b border-aegis-border">
        {/* Toggle expand */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-aegis-text-muted hover:text-aegis-text-secondary transition-colors shrink-0"
          title={expanded ? t('codeInterpreter.collapse') : t('codeInterpreter.expand')}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {/* Icon + name */}
        <span className="text-base select-none">{getToolIcon(block.toolName)}</span>
        <span className="font-mono text-sm font-semibold text-aegis-text">{block.toolName}</span>

        {/* Status */}
        <StatusBadge status={block.status} />

        <div className="flex-1" />

        {/* Duration */}
        {block.durationMs !== undefined && (
          <span className="inline-flex items-center gap-1 text-[11px] text-aegis-text-muted">
            <Clock className="h-3 w-3" />
            {(block.durationMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      {/* ── Input ── */}
      {hasInput && (
        <div className="px-4 pt-3 pb-2">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-aegis-text-dim">
            {t('codeInterpreter.input')}
          </div>
          <pre className="overflow-x-auto rounded-lg bg-aegis-bg px-3 py-2 font-mono text-xs leading-relaxed text-aegis-success whitespace-pre-wrap break-words">
            {inputText}
          </pre>
        </div>
      )}

      {/* ── Output ── */}
      {hasOutput && (
        <div className="px-4 pt-2 pb-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-aegis-text-dim">
              {t('codeInterpreter.output')}
            </span>
            <CopyButton text={outputText} />
          </div>
          <div
            className={clsx(
              'overflow-y-auto rounded-lg bg-aegis-bg',
              !expanded && 'max-h-[300px]',
            )}
            style={expanded ? undefined : { maxHeight: '300px' }}
          >
            <pre className="px-3 py-2 font-mono text-xs leading-relaxed text-aegis-text-secondary whitespace-pre-wrap break-words">
              {visibleOutput}
            </pre>
          </div>

          {/* Expand toggle for output lines */}
          {!expanded && hasMoreOutput && (
            <button
              onClick={() => setExpanded(true)}
              className="mt-1.5 text-[11px] text-aegis-text-muted hover:text-aegis-text-secondary transition-colors"
            >
              {t('codeInterpreter.moreLines', { count: outputLines.length - 3 })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Stats Bar ─────────────────────────────────────────────

interface StatsBarProps {
  total: number;
  errors: number;
  running: number;
  avgDuration: number;
}

function StatsBar({ total, errors, running, avgDuration }: StatsBarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-3">
      <StatPill label={t('codeInterpreter.stats.total', 'Total')} value={total} color="default" />
      <StatPill label={t('codeInterpreter.stats.running', 'Running')} value={running} color="blue" />
      <StatPill label={t('codeInterpreter.stats.errors', 'Errors')} value={errors} color="red" />
      {total > 0 && (
        <StatPill
          label={t('codeInterpreter.stats.avgDuration', 'Avg')}
          value={`${(avgDuration / 1000).toFixed(1)}s`}
          color="default"
        />
      )}
    </div>
  );
}

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: 'default' | 'blue' | 'red';
}) {
  return (
    <div
      className={clsx(
        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium',
        color === 'blue'    && 'bg-[rgb(var(--aegis-accent)/0.1)] text-aegis-accent',
        color === 'red'     && 'bg-aegis-danger-surface text-aegis-danger',
        color === 'default' && 'bg-aegis-surface text-aegis-text-secondary',
      )}
    >
      <span className="text-aegis-text-muted">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────

export function CodeInterpreterPage() {
  const { t } = useTranslation();
  const [activeFilter, setActiveFilter] = useState<FilterOption>('All');

  // Ensure history is loaded (may not have visited Chat page first)
  const messages = useChatStore((s) => s.messages);
  const connected = useChatStore((s) => s.connected);
  const loadSessionHistory = useChatStore((s) => s.loadSessionHistory);
  useEffect(() => {
    if (connected && messages.length === 0) {
      loadSessionHistory();
    }
  }, [connected, messages.length, loadSessionHistory]);

  // Get tool blocks with toolIntent forced on (always shows tools here)
  const getToolBlocks = useChatStore((s) => s.getToolBlocks);
  const toolBlocks = useMemo(() => getToolBlocks(), [messages, getToolBlocks]);

  const stats = useMemo(
    () => ({
      total: toolBlocks.length,
      errors: toolBlocks.filter((t) => t.status === 'error').length,
      running: toolBlocks.filter((t) => t.status === 'running').length,
      avgDuration:
        toolBlocks
          .filter((t) => t.durationMs)
          .reduce((a, t) => a + (t.durationMs || 0), 0) /
        Math.max(toolBlocks.filter((t) => t.durationMs).length, 1),
    }),
    [toolBlocks],
  );

  const filteredBlocks = useMemo(() => {
    if (activeFilter === 'All') return toolBlocks;
    return toolBlocks.filter(
      (b) => b.toolName.toLowerCase() === activeFilter.toLowerCase(),
    );
  }, [toolBlocks, activeFilter]);

  return (
    <PageTransition className="flex h-full flex-col overflow-hidden">
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">

        {/* ── Page Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-aegis-primary-surface">
              <Terminal className="h-5 w-5 text-aegis-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-aegis-text">
                {t('codeInterpreter.title', 'Code Interpreter')}
              </h1>
              <p className="text-xs text-aegis-text-muted">
                {t('codeInterpreter.subtitle', 'Tool execution sandbox — all exec & file operations')}
              </p>
            </div>
          </div>

          {/* Stats */}
          <StatsBar {...stats} />
        </div>

        {/* ── Filter Bar ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-aegis-text-dim shrink-0" />
          {FILTER_OPTIONS.map((opt) => {
            const count =
              opt === 'All'
                ? toolBlocks.length
                : toolBlocks.filter(
                    (b) => b.toolName.toLowerCase() === opt.toLowerCase(),
                  ).length;

            return (
              <button
                key={opt}
                onClick={() => setActiveFilter(opt)}
                className={clsx(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                  activeFilter === opt
                    ? 'bg-aegis-primary-surface text-aegis-primary ring-1 ring-aegis-primary/30'
                    : 'bg-aegis-surface text-aegis-text-muted hover:bg-aegis-elevated hover:text-aegis-text-secondary',
                )}
              >
                <span>{getToolIcon(opt === 'All' ? '' : opt)}</span>
                {opt}
                <span
                  className={clsx(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                    activeFilter === opt
                      ? 'bg-aegis-primary/30 text-aegis-primary/70'
                      : 'bg-aegis-elevated text-aegis-text-muted',
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Execution Cards ── */}
        {filteredBlocks.length === 0 ? (
          <EmptyState activeFilter={activeFilter} />
        ) : (
          <div className="flex flex-col gap-3">
            {filteredBlocks.map((block) => (
              <ExecCard key={block.id} block={block} />
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}

// ── Empty State ───────────────────────────────────────────

function EmptyState({ activeFilter }: { activeFilter: FilterOption }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-aegis-surface">
        <Terminal className="h-8 w-8 text-aegis-text-dim" />
      </div>
      <div>
        <p className="text-base font-semibold text-aegis-text-muted">
          {activeFilter === 'All'
            ? t('codeInterpreter.empty.noExecs')
            : t('codeInterpreter.noFiltered', { filter: activeFilter })}
        </p>
        <p className="mt-1 text-xs text-aegis-text-dim">
          {t('codeInterpreter.hint')}
        </p>
      </div>
    </div>
  );
}
