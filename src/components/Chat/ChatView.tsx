import { useRef, useEffect, useState, useCallback } from 'react';
import { ArrowDown, Download, Loader2, Search, X, Zap, Pin, PinOff, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { useChatStore, type ChatMessage } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { gateway } from '@/services/gateway/index';
import { MessageBubble } from './MessageBubble';
import { ToolCallBubble } from './ToolCallBubble';
import { ThinkingBubble } from './ThinkingBubble';
import { MessageInput } from './MessageInput';
import { TypingIndicator } from './TypingIndicator';
import { InlineButtonBar } from './InlineButtonBar';
import { QuickReplyBar } from './QuickReplyBar';
import type { RenderBlock } from '@/types/RenderBlock';
// exportChatMarkdown moved to ChatTabs toolbar
import clsx from 'clsx';

// ═══════════════════════════════════════════════════════════
// Compact Divider — shimmer animated line
// ═══════════════════════════════════════════════════════════

function CompactDivider({ timestamp }: { timestamp?: string }) {
  const { t } = useTranslation();
  const time = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <div className="flex items-center gap-0 py-5 px-4 group">
      {/* Left line with shimmer */}
      <div className="flex-1 h-px relative overflow-visible">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
        <div
          className="absolute top-[-1px] h-[3px] w-[60%] bg-gradient-to-r from-transparent via-amber-400/50 to-transparent rounded-full"
          style={{ animation: 'compact-shimmer 4s ease-in-out infinite' }}
        />
      </div>
      {/* Badge */}
      <div className="flex items-center gap-1.5 px-3.5 py-1 bg-amber-500/[0.06] border border-amber-500/[0.12] rounded-full shrink-0 mx-1 transition-colors group-hover:bg-amber-500/[0.1] group-hover:border-amber-500/[0.2]">
        <Zap size={10} className="text-amber-500/50" />
        <span className="text-[9px] font-bold uppercase tracking-[1.5px] text-amber-500/50 group-hover:text-amber-500/70 transition-colors">
          {t('chat.contextCompacted')}
        </span>
        {time && <span className="text-[9px] text-amber-500/25 font-mono">· {time}</span>}
      </div>
      {/* Right line with shimmer */}
      <div className="flex-1 h-px relative overflow-visible">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
        <div
          className="absolute top-[-1px] h-[3px] w-[60%] bg-gradient-to-r from-transparent via-amber-400/50 to-transparent rounded-full"
          style={{ animation: 'compact-shimmer 4s ease-in-out infinite 2s', right: 0 }}
        />
      </div>
      <style>{`
        @keyframes compact-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(260%); }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Chat View — Virtualized chat area
// ═══════════════════════════════════════════════════════════

export function ChatView() {
  const { t } = useTranslation();

  // ── Store selectors (split to minimize re-renders) ──
  const renderBlocks = useChatStore((s) => s.renderBlocks);
  const messages = useChatStore((s) => s.messages);
  const isTyping = useChatStore((s) => s.isTyping);
  // thinkingText + thinkingRunId read inside Footer component (stable Virtuoso ref)
  const quickReplies = useChatStore((s) => s.quickReplies);
  const isLoadingHistory = useChatStore((s) => s.isLoadingHistory);
  const fallbackInfo = useChatStore((s) => s.fallbackInfo);

  const { connected, connecting, connectionError } = useChatStore(
    useShallow((s) => ({ connected: s.connected, connecting: s.connecting, connectionError: s.connectionError }))
  );

  const activeSessionKey = useChatStore((s) => s.activeSessionKey);
  const tokenUsage = useChatStore((s) => s.tokenUsage);

  // Actions (stable references)
  const addMessage = useChatStore((s) => s.addMessage);
  const setHistoryLoader = useChatStore((s) => s.setHistoryLoader);
  const setQuickReplies = useChatStore((s) => s.setQuickReplies);
  const loadSessionHistory = useChatStore((s) => s.loadSessionHistory);

  const toolIntentEnabled = useSettingsStore((s) => s.toolIntentEnabled);

  // ── Search state ──
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<number[]>([]); // indices in renderBlocks
  const [searchIndex, setSearchIndex] = useState(0); // current highlight index

  // ── Virtuoso ref & scroll state ──
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  // ── Keyboard shortcut: Ctrl+F to open search ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
        setSearchQuery('');
        setSearchResults([]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchOpen]);

  // ── Search logic: compute matching block indices ──
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const q = searchQuery.toLowerCase();
    const results: number[] = [];
    renderBlocks.forEach((block, i) => {
      if (block.type === 'message' && block.markdown.toLowerCase().includes(q)) {
        results.push(i);
      } else if (block.type === 'tool' && (block.toolName.toLowerCase().includes(q) || (block.output || '').toLowerCase().includes(q))) {
        results.push(i);
      }
    });
    setSearchResults(results);
    setSearchIndex(0);
  }, [searchQuery, renderBlocks]);

  // ── Navigate to current search result ──
  useEffect(() => {
    if (searchResults.length > 0 && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({ index: searchResults[searchIndex], behavior: 'smooth', align: 'center' });
    }
  }, [searchIndex, searchResults]);

  // Listen for pinned message scroll requests
  useEffect(() => {
    const handler = (e: Event) => {
      const idx = (e as CustomEvent).detail?.index;
      if (idx >= 0 && virtuosoRef.current) {
        virtuosoRef.current.scrollToIndex({ index: idx, behavior: 'smooth', align: 'center' });
      }
    };
    window.addEventListener('aegis:scroll-to-index', handler);
    return () => window.removeEventListener('aegis:scroll-to-index', handler);
  }, []);

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: 'LAST',
      behavior: 'smooth',
      align: 'end',
    });
  }, []);

  // Force scroll when streaming content updates (thinking bubbles etc.
  // are too subtle for followOutput to detect alone)
  const prevBlockLen = useRef(renderBlocks.length);
  useEffect(() => {
    if (isTyping && renderBlocks.length >= prevBlockLen.current) {
      // Only auto-scroll if user hasn't manually scrolled up
      if (atBottom) {
        scrollToBottom();
      }
    }
    prevBlockLen.current = renderBlocks.length;
  }, [renderBlocks, isTyping, atBottom, scrollToBottom]);

  // ── Scroll to bottom helper (after history load or navigation) ──
  // Virtuoso needs time to measure all virtual items before it can
  // scroll accurately. We retry at increasing intervals to handle
  // both small and large chat histories reliably.
  const scrollToBottomAfterLoad = useCallback(() => {
    const delays = [50, 200, 500];
    delays.forEach((ms) => {
      setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({
          index: 'LAST',
          behavior: 'auto',
          align: 'end',
        });
      }, ms);
    });
  }, []);

  // ── History loading (delegates to store action, handles scroll) ──
  const loadHistory = useCallback(async () => {
    await loadSessionHistory(activeSessionKey);
    scrollToBottomAfterLoad();
  }, [activeSessionKey, loadSessionHistory, scrollToBottomAfterLoad]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    if (isRefreshing || isLoadingHistory) return;
    setIsRefreshing(true);
    try { await loadHistory(); }
    finally { setTimeout(() => setIsRefreshing(false), 500); }
  }, [isRefreshing, isLoadingHistory, loadHistory]);

  // Auto-load history on connect
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (connected && !hasLoadedRef.current && messages.length === 0) {
      hasLoadedRef.current = true;
      loadHistory();
    }
  }, [connected, messages.length, loadHistory]);

  // ── Scroll to bottom on mount (when navigating back to chat) ──
  // If messages are already loaded (navigated away and came back),
  // Virtuoso re-mounts and initialTopMostItemIndex shows the last
  // message's TOP. We need to scroll to show the BOTTOM instead.
  useEffect(() => {
    if (renderBlocks.length > 0) {
      scrollToBottomAfterLoad();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps = only on mount

  // Register loadHistory in store so MessageInput can trigger it before first send
  useEffect(() => {
    setHistoryLoader(loadHistory);
    return () => setHistoryLoader(null);
  }, [loadHistory, setHistoryLoader]);

  useEffect(() => {
    const handler = () => handleRefresh();
    window.addEventListener('aegis:refresh', handler);
    return () => window.removeEventListener('aegis:refresh', handler);
  }, [handleRefresh]);

  const handleResend = useCallback((content: string) => {
    gateway.sendMessage(content, undefined, activeSessionKey);
  }, [activeSessionKey]);

  // Regenerate: re-send the last user message
  const handleRegenerate = useCallback(() => {
    const lastUserMsg = [...renderBlocks].reverse().find(
      (b) => b.type === 'message' && b.role === 'user'
    );
    if (lastUserMsg && lastUserMsg.type === 'message') {
      gateway.sendMessage(lastUserMsg.markdown, undefined, activeSessionKey);
    }
  }, [renderBlocks, activeSessionKey]);

  const handleInlineButtonClick = useCallback(async (callbackData: string) => {
    const text = callbackData;
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    addMessage(userMsg);
    const { setIsTyping } = useChatStore.getState();
    setIsTyping(true);
    try {
      await gateway.sendMessage(text, undefined, activeSessionKey);
    } catch (err) {
      console.error('[InlineButtons] Send error:', err);
    }
  }, [addMessage, activeSessionKey]);

  // ── Render a single block (used by Virtuoso) ──
  const renderBlock = useCallback((index: number, block: RenderBlock) => {
    switch (block.type) {
      case 'compaction':
        return <CompactDivider timestamp={block.timestamp} />;

      case 'inline-buttons':
        return (
          <InlineButtonBar
            buttons={block.rows.map(r => r.buttons.map(b => ({ text: b.text, callback_data: b.callback_data })))}
            onCallback={handleInlineButtonClick}
          />
        );

      case 'tool':
        if (!toolIntentEnabled) return <div />;
        return (
          <ToolCallBubble
            tool={{
              toolName: block.toolName,
              input: block.input,
              output: block.output,
              status: block.status,
              durationMs: block.durationMs,
            }}
          />
        );

      case 'thinking':
        return <ThinkingBubble content={block.content} />;

      case 'message':
        return (
          <div>
            {block.thinkingContent && (
              <ThinkingBubble content={block.thinkingContent} />
            )}
            <MessageBubble
              block={block}
              onResend={block.role === 'user' ? handleResend : undefined}
              onRegenerate={block.role === 'assistant' ? handleRegenerate : undefined}
            />
          </div>
        );

      default:
        return <div />;
    }
  }, [toolIntentEnabled, handleResend, handleRegenerate, handleInlineButtonClick]);

  // Footer is a stable component reference — reads store internally
  // (avoids Virtuoso re-mount on every thinkingText change)

  // ── Drag & drop overlay for file uploads ──
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    // Forward drop event to MessageInput via custom event
    window.dispatchEvent(new CustomEvent('aegis:file-drop', { detail: { files: Array.from(e.dataTransfer.files) } }));
  }, []);

  return (
    <div
      className="flex flex-col flex-1 min-h-0 bg-aegis-bg relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-aegis-bg/80 backdrop-blur-sm border-2 border-dashed border-aegis-primary/40 m-2 pointer-events-none" style={{ borderRadius: 'var(--aegis-radius)' }}>
          <div className="flex flex-col items-center gap-2 text-aegis-primary">
            <Download size={40} className="animate-bounce" />
            <span className="text-[14px] font-semibold">{t('chat.dropFiles')}</span>
            <span className="text-[11px] text-aegis-text-dim">{t('chat.dropFilesSubtitle')}</span>
          </div>
        </div>
      )}

      {/* Pinned Messages */}
      <PinnedMessagesBar />

      {/* Fallback Indicator */}
      {fallbackInfo && (
        <div className="shrink-0 px-4 py-1.5 text-center text-[11px] bg-amber-500/10 text-amber-400 border-b border-amber-500/15 flex items-center justify-center gap-2">
          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
          <span>{t('chat.modelFallback')} <strong>{fallbackInfo.from}</strong> → <strong>{fallbackInfo.to}</strong></span>
          {fallbackInfo.reason && <span className="opacity-60">({fallbackInfo.reason})</span>}
          <button onClick={() => useChatStore.getState().setFallbackInfo(null)} className="ml-2 opacity-40 hover:opacity-80 text-[10px]">✕</button>
        </div>
      )}

      {/* Connection Banner */}
      {!connected && (
        <div className={clsx(
          'shrink-0 px-4 py-2 text-center text-[12px] border-b',
          connecting ? 'bg-aegis-warning-surface text-aegis-warning border-aegis-warning/10' : 'bg-aegis-danger-surface text-aegis-danger border-aegis-danger/10'
        )}>
          {connecting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 bg-aegis-warning rounded-full animate-pulse-soft" />
              {t('connection.connectingBanner')}
            </span>
          ) : (
            <span>
              {t('connection.disconnectedBanner')}
              {connectionError && <span className="opacity-60"> — {connectionError}</span>}
              <button onClick={() => {
                window.aegis?.config.get().then((c: any) => {
                  gateway.connect(c.gatewayUrl || 'ws://127.0.0.1:18789', c.gatewayToken || '');
                });
              }} className="mx-2 underline hover:no-underline">
                {t('connection.reconnect')}
              </button>
            </span>
          )}
        </div>
      )}

      {/* Search Bar (Ctrl+F in-chat search) */}
      {searchOpen && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-aegis-border bg-aegis-elevated/50">
          <Search size={14} className="text-aegis-text-muted shrink-0" />
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setSearchIndex((prev) => (prev + 1) % Math.max(searchResults.length, 1));
              if (e.key === 'Enter' && e.shiftKey) setSearchIndex((prev) => (prev - 1 + searchResults.length) % Math.max(searchResults.length, 1));
            }}
            placeholder={t('chat.searchPlaceholder')}
            className="flex-1 bg-transparent text-[12px] text-aegis-text outline-none placeholder:text-aegis-text-dim"
          />
          {searchResults.length > 0 && (
            <span className="text-[10px] font-mono text-aegis-text-muted shrink-0">
              {searchIndex + 1}/{searchResults.length}
            </span>
          )}
          {searchQuery && searchResults.length === 0 && (
            <span className="text-[10px] text-aegis-text-dim shrink-0">{t('chat.noResults')}</span>
          )}
          <button onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults([]); }}
            className="p-1 rounded hover:bg-[rgb(var(--aegis-overlay)/0.06)]">
            <X size={12} className="text-aegis-text-muted" />
          </button>
        </div>
      )}

      {/* Messages Area — Virtualized */}
      <div className="flex-1 min-h-0 relative">
        {isLoadingHistory ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <Loader2 size={28} className="text-aegis-primary animate-spin mb-4" />
            <p className="text-aegis-text-muted text-[13px]">{t('chat.loadingHistory')}</p>
          </div>
        ) : renderBlocks.length === 0 ? (
          <div className="flex-1 h-full" />
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            data={renderBlocks}
            followOutput="smooth"
            overscan={{ main: 600, reverse: 600 }}
            increaseViewportBy={{ top: 400, bottom: 400 }}
            defaultItemHeight={120}
            initialTopMostItemIndex={renderBlocks.length - 1}
            atBottomStateChange={setAtBottom}
            atBottomThreshold={100}
            itemContent={renderBlock}
            components={{ Footer }}
            className="h-full py-3 scrollbar-thin"
            style={{ overflowX: 'clip' }}
          />
        )}

        {/* Scroll to bottom */}
        {!atBottom && renderBlocks.length > 3 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
            <button onClick={scrollToBottom}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass shadow-float text-[11px] text-aegis-text-muted hover:text-aegis-text transition-colors">
              <ArrowDown size={13} />
              <span>{t('chat.newMessages')}</span>
            </button>
          </div>
        )}
      </div>

      {/* Quick Reply buttons */}
      {quickReplies.length > 0 && !isTyping && (
        <QuickReplyBar
          buttons={quickReplies}
          onSend={async (text) => {
            setQuickReplies([]);
            const userMsg: ChatMessage = {
              id: `user-${Date.now()}`,
              role: 'user',
              content: text,
              timestamp: new Date().toISOString(),
            };
            addMessage(userMsg);
            const { setIsTyping } = useChatStore.getState();
            setIsTyping(true);
            try {
              await gateway.sendMessage(text, undefined, activeSessionKey);
            } catch (err) {
              console.error('[QuickReplyBar] Send error:', err);
            }
          }}
          onDismiss={() => setQuickReplies([])}
        />
      )}

      {/* Exec Approval Requests */}
      {/* Exec approvals moved to global AppLayout — visible on all pages */}

      {/* Context Usage Bar */}
      {tokenUsage && tokenUsage.percentage > 0 && (
        <div className="shrink-0 px-3 pt-1 pb-0 flex items-center gap-2">
          <div className="flex-1 h-[3px] rounded-full bg-[rgb(var(--aegis-overlay)/0.08)] overflow-hidden">
            <div
              className={clsx(
                'h-full rounded-full transition-all duration-500',
                tokenUsage.percentage < 60 ? 'bg-aegis-primary' :
                tokenUsage.percentage < 85 ? 'bg-aegis-warning' : 'bg-red-500'
              )}
              style={{ width: `${Math.min(tokenUsage.percentage, 100)}%` }}
            />
          </div>
          <span className="text-[9px] text-aegis-text-dim shrink-0 tabular-nums">
            {tokenUsage.percentage}%
          </span>
        </div>
      )}

      <MessageInput />
    </div>
  );
}

// ── Pinned Messages Bar ──
function PinnedMessagesBar() {
  const { t } = useTranslation();
  const pinnedMessages = useChatStore((s) => s.pinnedMessages);
  const unpinMessage = useChatStore((s) => s.unpinMessage);
  const renderBlocks = useChatStore((s) => s.renderBlocks);
  const [expanded, setExpanded] = useState(false);

  if (pinnedMessages.length === 0) return null;

  const scrollToMessage = (messageId: string) => {
    const idx = renderBlocks.findIndex((b: any) => b.id === messageId);
    if (idx >= 0) {
      // Dispatch event for ChatView to handle scroll
      window.dispatchEvent(new CustomEvent('aegis:scroll-to-index', { detail: { index: idx } }));
    }
  };

  return (
    <div className="shrink-0 border-b border-aegis-border/10">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-1.5 text-[11px] text-amber-400 hover:bg-amber-500/5 transition-colors"
      >
        <Pin size={11} />
        <span className="font-medium">{t('chat.pinnedCount', { count: pinnedMessages.length })}</span>
        <ChevronDown size={11} className={clsx('ml-auto transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="px-4 pb-2 flex flex-col gap-1 max-h-32 overflow-y-auto scrollbar-thin">
          {pinnedMessages.map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-2 py-1 rounded-md bg-[rgb(var(--aegis-overlay)/0.03)] text-[11px] cursor-pointer hover:bg-[rgb(var(--aegis-overlay)/0.06)] transition-colors"
              onClick={() => scrollToMessage(p.id)}
            >
              <span className="flex-1 truncate text-aegis-text-muted">{p.text}</span>
              <button onClick={(e) => { e.stopPropagation(); unpinMessage(p.id); }} className="shrink-0 opacity-40 hover:opacity-80">
                <PinOff size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Virtuoso Footer — reads store directly for stable reference ──
function Footer() {
  const thinkingText = useChatStore((s) => s.thinkingText);
  const thinkingRunId = useChatStore((s) => s.thinkingRunId);
  const isTyping = useChatStore((s) => s.isTyping);

  return (
    <div className="pb-1">
      {thinkingText && thinkingRunId && (
        <ThinkingBubble content={thinkingText} isStreaming />
      )}
      {isTyping && <TypingIndicator />}
    </div>
  );
}

// ExecApprovalBar moved to src/components/shared/ExecApprovalBar.tsx (global)
