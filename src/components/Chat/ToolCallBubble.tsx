import { useTranslation } from 'react-i18next';
// ═══════════════════════════════════════════════════════════
// ToolCallBubble — Intent-first tool call display
// Shows tool name + key params + result in a compact card
// ═══════════════════════════════════════════════════════════

import { useState, memo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

export interface ToolCallInfo {
  toolName: string;
  input?: Record<string, any>;
  output?: string;
  status: 'running' | 'done' | 'error';
  durationMs?: number;
}

// ── Tool icon + color mapping ─────────────────────────────
const TOOL_META: Record<string, { icon: string; label: string; color: string }> = {
  // Search & web
  web_search:    { icon: '🔍', label: 'Web Search',    color: 'var(--aegis-accent)' },
  web_fetch:     { icon: '🌐', label: 'Web Fetch',     color: 'var(--aegis-accent)' },
  browser:       { icon: '🖥️', label: 'Browser',       color: 'var(--aegis-accent)' },
  // File system
  Read:          { icon: '📄', label: 'Read',          color: 'var(--aegis-primary)' },
  Write:         { icon: '✍️', label: 'Write',         color: 'var(--aegis-primary)' },
  Edit:          { icon: '✏️', label: 'Edit',          color: 'var(--aegis-primary)' },
  // Execution
  exec:          { icon: '⚡', label: 'Exec',          color: 'var(--aegis-warning)' },
  process:       { icon: '⚙️', label: 'Process',       color: 'var(--aegis-warning)' },
  // Memory
  memory_search: { icon: '🧠', label: 'Memory Search', color: 'var(--aegis-success)' },
  memory_get:    { icon: '🧠', label: 'Memory Get',    color: 'var(--aegis-success)' },
  // AI / agents
  sessions_spawn:  { icon: '🤖', label: 'Spawn Agent', color: 'var(--aegis-danger)' },
  sessions_send:   { icon: '📨', label: 'Send Message', color: 'var(--aegis-danger)' },
  session_status:  { icon: '📊', label: 'Status',      color: 'var(--aegis-success)' },
  // Cron
  cron:          { icon: '⏰', label: 'Cron',          color: 'var(--aegis-accent)' },
  // Misc
  image:         { icon: '🖼️', label: 'Image',         color: 'var(--aegis-accent)' },
  tts:           { icon: '🔊', label: 'TTS',           color: 'var(--aegis-accent)' },
  gateway:       { icon: 'Æ', label: 'Gateway',       color: 'var(--aegis-primary)' },
  message:       { icon: '💬', label: 'Message',       color: 'var(--aegis-accent)' },
};

function getToolMeta(name: string) {
  return TOOL_META[name] || { icon: '🔧', label: name, color: 'var(--aegis-text-dim)' };
}

/** Summarize input params into a short readable string */
function summarizeInput(toolName: string, input: Record<string, any>): string {
  if (!input || Object.keys(input).length === 0) return '';

  // Tool-specific summaries
  const query = input.query || input.q || input.url || input.path || input.file_path
    || input.command || input.message || input.text || input.task;

  if (query && typeof query === 'string') {
    const truncated = query.length > 60 ? query.slice(0, 57) + '…' : query;
    return `"${truncated}"`;
  }

  // Generic: show first key=value pair
  const first = Object.entries(input)[0];
  if (first) {
    const val = typeof first[1] === 'string' ? first[1] : JSON.stringify(first[1]);
    const truncated = val.length > 50 ? val.slice(0, 47) + '…' : val;
    return `${first[0]}: ${truncated}`;
  }

  return '';
}

/** Format output preview (first non-empty line, max 80 chars) */
function previewOutput(output: string): string {
  if (!output) return '';
  const lines = output.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return '';
  const first = lines[0];
  return first.length > 80 ? first.slice(0, 77) + '…' : first;
}

// ── Component ─────────────────────────────────────────────
interface ToolCallBubbleProps {
  tool: ToolCallInfo;
}

export const ToolCallBubble = memo(function ToolCallBubble({ tool }: ToolCallBubbleProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const meta = getToolMeta(tool.toolName);
  const summary = tool.input ? summarizeInput(tool.toolName, tool.input) : '';
  const outputPreview = tool.output ? previewOutput(tool.output) : '';
  const hasDetails = !!(tool.input && Object.keys(tool.input).length > 0) || !!tool.output;

  return (
    <div className="px-5 py-px animate-fade-in">
      <div
        className={clsx(
          'group inline-flex items-center gap-1 px-2 py-0.5 transition-all duration-150',
          'border border-[rgb(var(--aegis-overlay)/0.08)]',
          'bg-[rgb(var(--aegis-overlay)/0.03)]',
          'rounded-full text-[10px]',
          hasDetails && 'cursor-pointer hover:border-[rgb(var(--aegis-overlay)/0.18)] hover:bg-[rgb(var(--aegis-overlay)/0.06)]'
        )}
        onClick={() => hasDetails && setExpanded((v) => !v)}
      >
        <span className="text-[10px]">{meta.icon}</span>
        <span className="font-mono font-semibold" style={{ color: `rgb(${meta.color})` }}>
          {meta.label}
        </span>
        {summary && <span className="text-aegis-text-dim truncate max-w-[200px] text-[9px]">{summary}</span>}
        {tool.status === 'running' && <span className="w-1 h-1 rounded-full bg-aegis-warning animate-pulse" />}
        {tool.status === 'done' && <span className="text-aegis-success/60">✓</span>}
        {tool.status === 'error' && <span className="text-aegis-danger/60">✗</span>}
        {tool.durationMs !== undefined && tool.status === 'done' && (
          <span className="text-[8px] text-aegis-text-dim font-mono">
            {tool.durationMs < 1000 ? `${tool.durationMs}ms` : `${(tool.durationMs / 1000).toFixed(1)}s`}
          </span>
        )}
        {hasDetails && (expanded ? <ChevronDown size={8} className="text-aegis-text-dim" /> : <ChevronRight size={8} className="text-aegis-text-dim" />)}
      </div>

      {/* ── Expanded details ── */}
      {expanded && hasDetails && (
        <div className="mt-1 ml-2 border-l-2 border-[rgb(var(--aegis-overlay)/0.08)] pl-3 pb-1 space-y-1.5 max-w-[80%]">
            {/* Input */}
            {tool.input && Object.keys(tool.input).length > 0 && (
              <div>
                <div className="text-[9px] text-aegis-text-dim uppercase tracking-wider mb-1">{t('chat.toolInput')}</div>
                <pre className="text-[10px] font-mono text-aegis-text-muted whitespace-pre-wrap break-all
                  bg-[rgb(var(--aegis-overlay)/0.04)] rounded-lg p-2 max-h-[120px] overflow-auto"
                  dir="ltr">
                  {JSON.stringify(tool.input, null, 2)}
                </pre>
              </div>
            )}
            {/* Output */}
            {tool.output && (
              <div>
                <div className="text-[9px] text-aegis-text-dim uppercase tracking-wider mb-1">{t('chat.toolOutput')}</div>
                <pre className="text-[10px] font-mono text-aegis-text-muted whitespace-pre-wrap break-all
                  bg-[rgb(var(--aegis-overlay)/0.04)] rounded-lg p-2 max-h-[200px] overflow-auto"
                  dir="ltr">
                  {tool.output.length > 1000
                    ? tool.output.slice(0, 1000) + '\n…(truncated)'
                    : tool.output}
                </pre>
              </div>
            )}
        </div>
      )}
    </div>
  );
});
