// ═══════════════════════════════════════════════════════════
// ThinkingBubble — ChatGPT/Claude-grade thinking display
//
// Live mode:  Animated bar with timer + summary extraction
//             Click to expand full thinking content
// Finalized:  Compact pill "Thought for Xs" — click to expand
// ═══════════════════════════════════════════════════════════

import { useState, useRef, useEffect, memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

interface ThinkingBubbleProps {
  content: string;
  isStreaming?: boolean;
}

// ── Extract a "summary line" from thinking content ──
// Looks for the last meaningful line that describes what the model is doing
function extractSummaryLine(text: string): string {
  if (!text) return '';
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return '';

  // Walk backwards to find a short, descriptive line
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
    const line = lines[i];
    // Skip very long lines (those are analysis, not summaries)
    if (line.length > 80) continue;
    // Skip lines that are just punctuation, bullets, or numbers
    if (/^[\d\-\*\•\>\#\|]+$/.test(line)) continue;
    // Good candidate: short, starts with capital or contains action words
    if (line.length >= 8 && line.length <= 80) {
      return line.length > 60 ? line.slice(0, 57) + '…' : line;
    }
  }

  // Fallback: first 60 chars of last line
  const last = lines[lines.length - 1];
  return last.length > 60 ? last.slice(0, 57) + '…' : last;
}

// ── Timer hook ──
function useElapsedSeconds(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    startRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [active]);

  return elapsed;
}

export const ThinkingBubble = memo(function ThinkingBubble({ content, isStreaming = false }: ThinkingBubbleProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const elapsed = useElapsedSeconds(isStreaming);
  const [finalElapsed, setFinalElapsed] = useState(0);

  // Capture elapsed time when streaming ends
  useEffect(() => {
    if (!isStreaming && elapsed > 0) {
      setFinalElapsed(elapsed);
    }
  }, [isStreaming]);

  // Auto-collapse when streaming ends
  useEffect(() => {
    if (!isStreaming) setExpanded(false);
  }, [isStreaming]);

  // Auto-scroll while streaming + expanded
  useEffect(() => {
    if (isStreaming && expanded && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content, isStreaming, expanded]);

  const summary = useMemo(() => extractSummaryLine(content), [content]);
  const lineCount = content.split('\n').length;
  const charCount = content.length;
  const displayElapsed = isStreaming ? elapsed : finalElapsed;

  if (!content && !isStreaming) return null;

  // ═══════════════════════════════════════════════════════
  // LIVE STREAMING MODE
  // ═══════════════════════════════════════════════════════
  if (isStreaming) {
    return (
      <div className="px-14 mb-2">
        {/* Main thinking bar */}
        <div className="rounded-xl border border-aegis-accent/15 overflow-hidden thinking-shimmer">
          {/* Header bar — always visible */}
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 bg-aegis-accent/[0.04] hover:bg-aegis-accent/[0.06] transition-colors cursor-pointer"
          >
            {/* Animated brain icon */}
            <div className="relative shrink-0">
              <div className="w-5 h-5 rounded-md bg-aegis-accent/10 flex items-center justify-center">
                <span className="text-[11px]">🧠</span>
              </div>
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-aegis-accent animate-ping opacity-40" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-aegis-accent" />
            </div>

            {/* Status text + summary */}
            <div className="flex-1 min-w-0 text-start">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-aegis-accent/80">
                  {t('thinking.thinking')}
                </span>
                {elapsed > 0 && (
                  <span className="text-[10px] font-mono text-aegis-accent/40 tabular-nums">
                    {elapsed}s
                  </span>
                )}
              </div>
              {/* Live summary line — shows what the model is working on */}
              <AnimatePresence mode="wait">
                {summary && (
                  <motion.div
                    key={summary.slice(0, 20)}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                    className="text-[10px] text-aegis-text-dim/50 truncate mt-0.5 font-mono"
                  >
                    {summary}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Expand chevron */}
            <ChevronDown
              size={12}
              className={clsx(
                'shrink-0 text-aegis-accent/30 transition-transform duration-200',
                expanded && 'rotate-180'
              )}
            />
          </button>

          {/* Expandable content */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="border-t border-aegis-accent/10">
                  <div
                    ref={contentRef}
                    className="px-3.5 py-2.5 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words
                      text-aegis-text-muted/60 max-h-[300px] overflow-y-auto scrollbar-thin"
                  >
                    {content}
                    <span className="inline-block w-[2px] h-[13px] bg-aegis-accent/50 ms-0.5 align-text-bottom animate-pulse" />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // FINALIZED MODE — compact pill
  // ═══════════════════════════════════════════════════════
  if (!expanded) {
    return (
      <div className="px-14 mb-1">
        <button
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg
            bg-[rgb(var(--aegis-overlay)/0.02)] hover:bg-[rgb(var(--aegis-overlay)/0.05)]
            border border-[rgb(var(--aegis-overlay)/0.04)] hover:border-[rgb(var(--aegis-overlay)/0.10)]
            transition-all group"
        >
          <ChevronRight size={10} className="text-aegis-text-dim/30 group-hover:text-aegis-text-dim/60 transition-colors" />
          <span className="text-[10px] text-aegis-text-dim/30 group-hover:text-aegis-text-dim/60 transition-colors">
            {displayElapsed > 0
              ? t('thinking.thoughtFor', { seconds: displayElapsed })
              : t('thinking.thoughtProcess')
            }
          </span>
          <span className="text-[9px] text-aegis-text-dim/20 group-hover:text-aegis-text-dim/40 font-mono transition-colors">
            {lineCount}L · {charCount > 1000 ? `${(charCount / 1000).toFixed(1)}k` : charCount}c
          </span>
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // FINALIZED + EXPANDED
  // ═══════════════════════════════════════════════════════
  return (
    <div className="px-14 mb-1">
      <div className="rounded-xl border border-[rgb(var(--aegis-overlay)/0.06)] bg-[rgb(var(--aegis-overlay)/0.015)] overflow-hidden">
        <button
          onClick={() => setExpanded(false)}
          className="w-full flex items-center gap-2 px-3.5 py-2 text-start cursor-pointer
            hover:bg-[rgb(var(--aegis-overlay)/0.02)] transition-colors"
        >
          <ChevronDown size={12} className="shrink-0 text-aegis-text-dim/40 rotate-180" />
          <span className="text-[11px] text-aegis-text-dim font-medium">
            {displayElapsed > 0
              ? t('thinking.thoughtFor', { seconds: displayElapsed })
              : t('thinking.thoughtProcess')
            }
          </span>
        </button>
        <div className="border-t border-[rgb(var(--aegis-overlay)/0.04)]">
          <div
            className="px-3.5 py-2.5 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words
              text-aegis-text-dim/60 max-h-[400px] overflow-y-auto scrollbar-thin"
          >
            {content}
          </div>
        </div>
      </div>
    </div>
  );
});
