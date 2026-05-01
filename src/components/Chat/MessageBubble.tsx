import { memo, useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Copy, Check, User, RotateCcw, Eye, Code2, RefreshCw, Pencil, ChevronDown, ChevronRight, Pin, PinOff, Maximize2, Minimize2, Volume2 } from 'lucide-react';
import { gateway } from '@/services/gateway';
import { useTranslation } from 'react-i18next';
import { getDirection } from '@/i18n';
import { CodeBlock } from './CodeBlock';
import { ChatImage } from './ChatImage';
import { ChatVideo } from './ChatVideo';
import { AudioPlayer } from './AudioPlayer';
import type { MessageBlock, Artifact, MetaItem } from '@/types/RenderBlock';
import { useChatStore } from '@/stores/chatStore';
import clsx from 'clsx';

// ── Pin Button ──
function PinButton({ messageId, text }: { messageId: string; text: string }) {
  const { t } = useTranslation();
  const isPinned = useChatStore((s) => s.pinnedMessages.some(p => p.id === messageId));
  const pinMessage = useChatStore((s) => s.pinMessage);
  const unpinMessage = useChatStore((s) => s.unpinMessage);

  if (!messageId) return null;

  return (
    <button
      onClick={() => isPinned ? unpinMessage(messageId) : pinMessage(messageId, text)}
      className="p-1 rounded-md hover:bg-[rgb(var(--aegis-overlay)/0.06)] transition-colors"
      title={isPinned ? t('chat.unpin') : t('chat.pin')}
    >
      {isPinned ? (
        <PinOff size={11} className="text-amber-400" />
      ) : (
        <Pin size={11} className="text-aegis-text-muted hover:text-aegis-text-secondary" />
      )}
    </button>
  );
}

// ── Agent Avatar — shows fetched avatar or fallback gradient ──
function AgentAvatar() {
  const avatarUrl = useChatStore((s) => s.agentAvatarUrl);
  const agentName = useChatStore((s) => s.agentName);
  const initial = (agentName || 'A').charAt(0).toUpperCase();
  const [imgError, setImgError] = useState(false);

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={agentName || 'Agent'}
        className="w-8 h-8 rounded-xl shrink-0 mt-0.5 shadow-glow-sm object-cover"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-aegis-primary to-aegis-accent flex items-center justify-center shrink-0 mt-0.5 shadow-glow-sm">
      <span className="text-[10px] font-bold text-aegis-text">{initial}</span>
    </div>
  );
}

// ── Artifact Card Component ──
function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const { t } = useTranslation();
  const [opening, setOpening] = useState(false);

  const typeIcons: Record<string, string> = {
    html: '🌐', react: '⚛️', svg: '🎨', mermaid: '📊', code: '📝',
  };

  const handleOpen = async () => {
    setOpening(true);
    try {
      await window.aegis?.artifact?.open(artifact);
    } catch (err) {
      console.error('[Artifact] Failed to open preview:', err);
    } finally {
      setTimeout(() => setOpening(false), 500);
    }
  };

  return (
    <div className="my-3 border border-aegis-primary/20 bg-aegis-primary/[0.04] overflow-hidden" style={{ borderRadius: 'var(--aegis-radius)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-aegis-primary/10">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">{typeIcons[artifact.type] || '📄'}</span>
          <div>
            <div className="text-[13px] font-medium text-aegis-text">{artifact.title}</div>
            <div className="text-[10px] text-aegis-text-dim uppercase tracking-wider">{artifact.type}</div>
          </div>
        </div>
        <button
          onClick={handleOpen}
          disabled={opening}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all',
            'bg-aegis-primary/15 text-aegis-primary hover:bg-aegis-primary/25',
            'border border-aegis-primary/20 hover:border-aegis-primary/40',
            opening && 'opacity-60'
          )}
        >
          <Eye size={13} />
          {t('chat.preview')}
        </button>
      </div>
      {/* Code preview (collapsed) */}
      <details className="group">
        <summary className="px-4 py-1.5 text-[11px] text-aegis-text-dim cursor-pointer hover:text-aegis-text-muted flex items-center gap-1.5 select-none">
          <Code2 size={11} />
          {t('chat.viewSource', { chars: artifact.content.length })}
        </summary>
        <div className="px-4 pb-3 max-h-[200px] overflow-auto">
          <pre className="text-[11px] text-aegis-text-dim font-mono whitespace-pre-wrap bg-[rgb(var(--aegis-overlay)/0.08)] rounded-lg p-3">
            {artifact.content.slice(0, 2000)}{artifact.content.length > 2000 ? '\n...(truncated)' : ''}
          </pre>
        </div>
      </details>
    </div>
  );
}

// ── Collapsed Meta — thinking, system under reply ──
function CollapsedMeta({ items }: { items: MetaItem[] }) {
  // All meta items start collapsed — user opens manually
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div className="mt-2 pt-2 border-t border-[rgb(var(--aegis-overlay)/0.06)]">
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, idx) => (
          <div key={idx} className="w-full">
            <button
              onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px]
                text-aegis-text-dim hover:text-aegis-text-muted hover:bg-[rgb(var(--aegis-overlay)/0.04)]
                transition-colors"
            >
              {expandedIdx === idx ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              {item.label}
            </button>
            {expandedIdx === idx && (
              <pre className="mt-1 mx-1 p-2.5 rounded-lg text-[11px] leading-relaxed text-aegis-text-muted
                bg-[rgb(var(--aegis-overlay)/0.03)] border border-[rgb(var(--aegis-overlay)/0.05)]
                whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto font-[inherit]">
                {item.content}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Message Bubble — Colors fixed for dark theme visibility
// ═══════════════════════════════════════════════════════════

interface MessageBubbleProps {
  block: MessageBlock;
  onResend?: (content: string) => void;
  onRegenerate?: () => void;
}

// ── File Card Component ──
function FileCard({ path, meta }: { path: string; meta?: string }) {
  const name = path.split(/[/\\]/).pop() || path;
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const icon: Record<string, string> = {
    pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', csv: '📗',
    png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🎨', webp: '🖼️',
    mp3: '🎵', wav: '🎵', ogg: '🎵', mp4: '🎬', mkv: '🎬', mov: '🎬',
    zip: '📦', tar: '📦', gz: '📦', '7z': '📦', rar: '📦',
    ts: '📝', tsx: '📝', js: '📝', jsx: '📝', py: '📝', rs: '📝', go: '📝',
    json: '📋', yaml: '📋', yml: '📋', toml: '📋', md: '📝', txt: '📝',
  };

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 my-1 rounded-lg
      bg-[rgb(var(--aegis-overlay)/0.05)] border border-[rgb(var(--aegis-overlay)/0.08)]
      hover:border-aegis-primary/20 transition-colors cursor-default max-w-full">
      <span className="text-base shrink-0">{icon[ext] || '📄'}</span>
      <div className="min-w-0 flex flex-col">
        <span className="text-[12px] font-medium text-aegis-text truncate">{name}</span>
        {meta && <span className="text-[10px] text-aegis-text-dim">{meta}</span>}
      </div>
    </div>
  );
}

// ── Check if message is recent (< 3 seconds old) for animation ──
function isRecent(timestamp: string): boolean {
  try {
    return Date.now() - new Date(timestamp).getTime() < 3000;
  } catch {
    return false;
  }
}

// ── Progressive streaming: close incomplete fenced code blocks ──
// Without this, ReactMarkdown breaks when streaming partial ```code blocks
function closeIncompleteCodeBlocks(text: string): string {
  // Count opening ``` (with optional lang) and closing ```
  const fencePattern = /^```/gm;
  const matches = text.match(fencePattern);
  if (!matches || matches.length % 2 === 0) return text; // balanced or none
  // Odd number of fences → there's an unclosed block, append closing fence
  return text + '\n```';
}

// ── Streaming markdown components — lightweight, no code highlighting ──
const streamingMarkdownComponents = {
  table({ children }: any) {
    return (
      <div className="table-wrapper">
        <table>{children}</table>
      </div>
    );
  },
  code({ className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    const codeString = String(children).replace(/\n$/, '');
    if (match || codeString.includes('\n')) {
      // During streaming: show styled block WITHOUT syntax highlighting (fast)
      return (
        <div className="my-2 rounded-xl overflow-hidden border border-[rgb(var(--aegis-overlay)/0.08)]" dir="ltr"
          style={{ background: 'var(--aegis-code-bg)' }}>
          <div className="flex items-center px-3.5 py-1.5 border-b border-[rgb(var(--aegis-overlay)/0.06)]"
            style={{ background: 'var(--aegis-code-header)' }}>
            <span className="text-[10px] font-mono font-medium text-aegis-text-muted uppercase tracking-widest">
              {match?.[1] || 'code'}
            </span>
          </div>
          <pre className="p-4 text-[0.87em] font-mono leading-relaxed text-aegis-text whitespace-pre-wrap break-words overflow-x-auto"
            style={{ background: 'var(--aegis-code-bg)', margin: 0 }}>
            <code>{codeString}</code>
          </pre>
        </div>
      );
    }
    return (
      <code
        className="text-[13px] font-mono px-1.5 py-0.5 rounded"
        style={{ background: 'rgb(var(--aegis-primary) / 0.12)', color: 'rgb(var(--aegis-primary))' }}
        {...props}
      >
        {children}
      </code>
    );
  },
  img({ src, alt }: any) {
    if (!src) return null;
    const videoExtensions = /\.(mp4|webm|mov|avi|mkv|m4v|ogg)(\?.*)?$/i;
    if (videoExtensions.test(src)) {
      return <ChatVideo src={src} alt={alt} maxWidth="100%" maxHeight="400px" />;
    }
    return <ChatImage src={src} alt={alt} maxWidth="100%" maxHeight="400px" />;
  },
  a({ href, children }: any) {
    return (
      <a
        href={href}
        onClick={(e) => { e.preventDefault(); if (href) window.open(href, '_blank'); }}
        className="text-aegis-primary hover:text-aegis-primary/70 underline underline-offset-2"
      >
        {children}
      </a>
    );
  },
};

// ── Shared Markdown Components (final — with full syntax highlighting) ──
const markdownComponents = {
  table({ children }: any) {
    return (
      <div className="table-wrapper">
        <table>{children}</table>
      </div>
    );
  },
  code({ className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    const codeString = String(children).replace(/\n$/, '');
    if (match || codeString.includes('\n')) {
      return <CodeBlock language={match?.[1] || ''} code={codeString} />;
    }
    return (
      <code
        className="text-[13px] font-mono px-1.5 py-0.5 rounded"
        style={{ background: 'rgb(var(--aegis-primary) / 0.12)', color: 'rgb(var(--aegis-primary))' }}
        {...props}
      >
        {children}
      </code>
    );
  },
  img({ src, alt }: any) {
    if (!src) return null;
    // Check if it's a video by extension
    const videoExtensions = /\.(mp4|webm|mov|avi|mkv|m4v|ogg)(\?.*)?$/i;
    if (videoExtensions.test(src)) {
      return <ChatVideo src={src} alt={alt} maxWidth="100%" maxHeight="400px" />;
    }
    return <ChatImage src={src} alt={alt} maxWidth="100%" maxHeight="400px" />;
  },
  p({ children }: any) {
    // Detect file references: 📎 file: <path> (mime, size)
    if (typeof children === 'string' || (Array.isArray(children) && children.length === 1 && typeof children[0] === 'string')) {
      const text = typeof children === 'string' ? children : children[0];
      const fileMatch = text.match(/^📎\s*file:\s*(.+?)(?:\s*\(([^)]+)\))?\s*$/);
      if (fileMatch) {
        return <FileCard path={fileMatch[1].trim()} meta={fileMatch[2]?.trim()} />;
      }
      // Voice reference: 🎤 [voice] <path> (duration)
      const voiceMatch = text.match(/^🎤\s*\[voice\]\s*(.+?)(?:\s*\(([^)]+)\))?\s*$/);
      if (voiceMatch) {
        return <FileCard path={voiceMatch[1].trim()} meta={voiceMatch[2]?.trim() || 'voice'} />;
      }
    }
    return <p>{children}</p>;
  },
  a({ href, children }: any) {
    // Check if link is a video
    const videoExtensions = /\.(mp4|webm|mov|avi|mkv|m4v|ogg)(\?.*)?$/i;
    if (href && videoExtensions.test(href)) {
      return <ChatVideo src={href} alt={String(children) || 'video'} maxWidth="100%" maxHeight="400px" />;
    }
    return (
      <a
        href={href}
        onClick={(e) => { e.preventDefault(); if (href) window.open(href, '_blank'); }}
        className="text-aegis-primary hover:text-aegis-primary/70 underline underline-offset-2"
      >
        {children}
      </a>
    );
  },
};

export const MessageBubble = memo(function MessageBubble({ block, onResend, onRegenerate }: MessageBubbleProps) {
  const { t, i18n } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isUser = block.role === 'user';
  const dir = getDirection(i18n.language);

  // block.markdown is already cleaned, directives stripped, code detected
  const content = block.markdown;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSpeak = async () => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    try {
      await gateway.speak(content);
    } catch (err) {
      console.error('[MessageBubble] speak error:', err);
    } finally {
      setIsSpeaking(false);
    }
  };

  const timeStr = (() => {
    try {
      const d = new Date(block.timestamp);
      if (isNaN(d.getTime())) return '';
      const locale = i18n.language?.startsWith('ar') ? 'ar-SA' : 'en-US';
      return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  })();

  return (
    <div
      className={clsx(
        'group flex items-start gap-3 px-5 py-1.5 transition-colors overflow-hidden',
        // Animate only fresh messages (streaming or recent), not history
        (block.isStreaming || isRecent(block.timestamp)) && 'animate-slide-up',
        isUser ? 'flex-row-reverse' : '',
        !isUser && 'hover:bg-[rgb(var(--aegis-overlay)/0.015)]'
      )}
      dir={dir}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {/* Avatar */}
      {isUser ? (
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 bg-aegis-primary/15 border border-aegis-primary/25">
          <User size={14} className="text-aegis-primary" />
        </div>
      ) : (
        <AgentAvatar />
      )}

      {/* Message Content */}
      <div className={clsx('flex flex-col min-w-0 overflow-hidden', isUser ? 'items-end max-w-[80%]' : expanded ? 'max-w-full w-full mx-0' : 'max-w-[80%]')}>
        {/* Bubble */}
        <div
          className={clsx(
            'px-4 py-2.5 relative overflow-hidden',
            isUser
              ? 'rounded-tl-md bg-aegis-primary/[0.12] border border-aegis-primary/20'
              : 'rounded-tr-md bg-[rgb(var(--aegis-overlay)/0.04)] border border-[rgb(var(--aegis-overlay)/0.06)]',
            block.isStreaming && 'border-aegis-primary/30'
          )}
          style={{ borderRadius: 'var(--aegis-radius)' }}
        >
          {/* Streaming shimmer */}
          {block.isStreaming && (
            <div className="absolute -top-px left-0 right-0 h-[2px] overflow-hidden rounded-full">
              <div className="w-full h-full bg-gradient-to-r from-transparent via-aegis-primary/50 to-transparent animate-shimmer bg-[length:200%_100%]" />
            </div>
          )}

          {/* Audio Player */}
          {block.audio && !block.isStreaming && (
            <div className="mb-2">
              <AudioPlayer src={block.audio} />
            </div>
          )}

          {/* Images from attachments — grid layout for multiple */}
          {block.images.length > 0 && (
            <div className={clsx(
              'mb-2 gap-1.5',
              block.images.length === 1 ? 'flex' :
              block.images.length === 2 ? 'grid grid-cols-2' :
              block.images.length === 3 ? 'grid grid-cols-2' :
              'grid grid-cols-2 sm:grid-cols-3'
            )}>
              {block.images.map((img, i) => (
                <ChatImage
                  key={i}
                  src={img.src}
                  alt={img.alt || t('media.attachment')}
                  maxWidth={block.images.length === 1 ? '360px' : '100%'}
                  maxHeight={block.images.length === 1 ? '300px' : '180px'}
                />
              ))}
            </div>
          )}

          {/* Message text (markdown) or Edit mode */}
          {isEditing ? (
            <div className="w-full">
              <textarea
                autoFocus
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full bg-[rgb(var(--aegis-overlay)/0.04)] rounded-lg p-2 text-[13px] text-aegis-text border border-aegis-border outline-none focus:border-aegis-primary/30 resize-y min-h-[60px]"
                rows={Math.min(editText.split('\n').length + 1, 8)}
              />
              <div className="flex gap-1.5 mt-1.5">
                <button
                  onClick={() => { onResend?.(editText); setIsEditing(false); }}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-aegis-primary/10 text-aegis-primary border border-aegis-primary/20 hover:bg-aegis-primary/20 transition-colors"
                >
                  {t('chat.sendEdit', 'Send')}
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-aegis-text-muted hover:text-aegis-text-secondary transition-colors"
                >
                  {t('chat.cancel', 'Cancel')}
                </button>
              </div>
            </div>
          ) : block.isStreaming ? (
            /* Progressive Markdown during streaming — renders headers, code, tables live */
            <div className="markdown-body text-[14px] leading-relaxed text-aegis-text">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={streamingMarkdownComponents}
              >
                {closeIncompleteCodeBlocks(content)}
              </ReactMarkdown>
              <span className="inline-block w-[2px] h-[16px] bg-aegis-primary/60 ml-0.5 align-text-bottom animate-pulse" />
            </div>
          ) : (
            <div className="markdown-body text-[14px] leading-relaxed text-aegis-text">
              {content && (
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
                  {content}
                </ReactMarkdown>
              )}
            </div>
          )}

          {/* Artifacts (pre-parsed by ContentParser) */}
          {block.artifacts.map((art, idx) => (
            <ArtifactCard key={`art-${idx}`} artifact={art} />
          ))}

          {/* Collapsed Meta (thinking, system) */}
          {block.meta && block.meta.length > 0 && !block.isStreaming && (
            <CollapsedMeta items={block.meta} />
          )}
        </div>

        {/* Footer — Time + Actions */}
        <div className="flex items-center gap-2 mt-1 px-1 h-5">
          <span className="text-[10px] text-aegis-text-muted font-mono">{timeStr}</span>

          {showActions && !block.isStreaming && (
            <div className="flex items-center gap-0.5 animate-fade-in">
              <button
                onClick={handleCopy}
                className="p-1 rounded-md hover:bg-[rgb(var(--aegis-overlay)/0.06)] transition-colors"
                title={t('chat.copy')}
              >
                {copied ? (
                  <Check size={11} className="text-aegis-success" />
                ) : (
                  <Copy size={11} className="text-aegis-text-muted hover:text-aegis-text-secondary" />
                )}
              </button>
              {/* Read Aloud — assistant only, text > 50 chars */}
              {block.role === 'assistant' && content.length > 50 && (
                <button
                  onClick={handleSpeak}
                  disabled={isSpeaking}
                  className="p-1 rounded-md hover:bg-[rgb(var(--aegis-overlay)/0.06)] transition-colors disabled:opacity-50"
                  title={t('chat.readAloud', 'Read aloud')}
                >
                  <Volume2 size={11} className={isSpeaking ? 'text-aegis-primary animate-pulse' : 'text-aegis-text-muted hover:text-aegis-text-secondary'} />
                </button>
              )}
              {/* Pin/Unpin */}
              <PinButton messageId={block.id || ''} text={block.markdown} />
              {block.role === 'user' && onResend && (
                <button
                  onClick={() => onResend(block.markdown)}
                  className="p-1 rounded-md hover:bg-[rgb(var(--aegis-overlay)/0.06)] transition-colors"
                  title={t('chat.resend')}
                >
                  <RotateCcw size={11} className="text-aegis-text-muted hover:text-aegis-text-secondary" />
                </button>
              )}
              {/* Regenerate — assistant only */}
              {block.role === 'assistant' && onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="p-1 rounded-md hover:bg-[rgb(var(--aegis-overlay)/0.06)] transition-colors"
                  title={t('chat.regenerate', 'Regenerate')}
                >
                  <RefreshCw size={11} className="text-aegis-text-muted hover:text-aegis-text-secondary" />
                </button>
              )}
              {/* Expand — assistant only, for long messages */}
              {block.role === 'assistant' && content.length > 500 && (
                <button
                  onClick={() => setExpanded(v => !v)}
                  className="p-1 rounded-md hover:bg-[rgb(var(--aegis-overlay)/0.06)] transition-colors"
                  title={expanded ? t('chat.collapse', 'Collapse') : t('chat.expand', 'Expand')}
                >
                  {expanded
                    ? <Minimize2 size={11} className="text-aegis-text-muted hover:text-aegis-text-secondary" />
                    : <Maximize2 size={11} className="text-aegis-text-muted hover:text-aegis-text-secondary" />
                  }
                </button>
              )}
              {/* Edit — user only */}
              {block.role === 'user' && onResend && (
                <button
                  onClick={() => { setIsEditing(true); setEditText(block.markdown); }}
                  className="p-1 rounded-md hover:bg-[rgb(var(--aegis-overlay)/0.06)] transition-colors"
                  title={t('chat.edit', 'Edit')}
                >
                  <Pencil size={11} className="text-aegis-text-muted hover:text-aegis-text-secondary" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
