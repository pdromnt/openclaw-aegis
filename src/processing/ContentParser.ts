// ═══════════════════════════════════════════════════════════
// ContentParser — Converts raw chat data to RenderBlock[]
// The bridge between Gateway events and the UI.
// All content parsing happens HERE, not at render time.
// ═══════════════════════════════════════════════════════════

import type {
  RenderBlock, MessageBlock, ToolBlock, InlineButtonsBlock,
  CompactionBlock, Artifact, ImageRef, InlineButtonRow, MetaItem,
} from '@/types/RenderBlock';
import { extractText, stripDirectives, isNoise, stripUserMeta } from './TextCleaner';
import { autoDetectCode, autoInlineCode } from '@/utils/autoDetectCode';

// ─── Artifact Parser ───

const ARTIFACT_REGEX = /<aegis_artifact\s+type="([^"]+)"\s+title="([^"]*)">([\s\S]*?)<\/aegis_artifact>/g;

/**
 * Extract artifacts from text. Returns cleaned text (artifacts removed) + artifact array.
 */
export function parseArtifacts(text: string): { cleanText: string; artifacts: Artifact[] } {
  const artifacts: Artifact[] = [];
  let lastIndex = 0;
  const textParts: string[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex for global regex
  ARTIFACT_REGEX.lastIndex = 0;

  while ((match = ARTIFACT_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index).trim();
      if (before) textParts.push(before);
    }
    artifacts.push({
      type: match[1],
      title: match[2],
      content: match[3].trim(),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim();
    if (remaining) textParts.push(remaining);
  }

  return {
    cleanText: textParts.join('\n\n'),
    artifacts,
  };
}

// ─── Image Extraction ───

const VIDEO_EXT = /\.(mp4|webm|mov|avi|mkv|m4v|ogg)(\?.*)?$/i;

/**
 * Extract image references from attachments.
 */
export function extractAttachmentImages(attachments?: Array<{ mimeType: string; content: string; fileName?: string }>): ImageRef[] {
  if (!attachments?.length) return [];
  return attachments
    .filter(att => att.mimeType?.startsWith('image/'))
    .map(att => ({
      src: att.content,
      alt: att.fileName || 'attachment',
      isAttachment: true,
    }));
}

// ─── Inline Buttons Extraction ───

/**
 * Check if a tool call message contains inline buttons.
 * Returns button rows or null.
 */
function extractInlineButtonRows(toolName: string, toolInput?: Record<string, unknown>): InlineButtonRow[] | null {
  if (toolName !== 'message') return null;
  if (!toolInput?.buttons || !Array.isArray(toolInput.buttons)) return null;

  const rows = (toolInput.buttons as unknown[])
    .filter((row): row is unknown[] => Array.isArray(row))
    .map(row =>
      (row as any[]).filter(btn =>
        btn && typeof btn.text === 'string' && typeof btn.callback_data === 'string'
      )
    )
    .filter(row => row.length > 0)
    .map(row => ({ buttons: row }));

  return rows.length > 0 ? rows : null;
}

// ─── Quick Reply ([[button:...]]) Extraction ───

const QUICK_REPLY_REGEX = /\[\[button:([^\]]+)\]\]/g;

/**
 * Extract [[button:Label]] markers from text.
 * Returns cleaned text (markers removed) + button array.
 */
export function extractQuickReplies(text: string): { cleanText: string; buttons: Array<{ text: string; value: string }> } {
  const buttons: Array<{ text: string; value: string }> = [];
  const cleanText = text.replace(QUICK_REPLY_REGEX, (_match, label: string) => {
    buttons.push({ text: label.trim(), value: label.trim() });
    return '';
  }).trim();
  return { cleanText, buttons };
}

// ─── Main Parsers ───

/**
 * Parse a single raw history message into RenderBlock(s).
 * One message can produce multiple blocks (e.g., tool call arrays).
 */
export function parseHistoryMessage(msg: any, toolIntentEnabled: boolean): RenderBlock[] {
  const role = typeof msg.role === 'string' ? msg.role : 'unknown';
  const content = extractText(msg.content);
  const timestamp = msg.timestamp || msg.createdAt || new Date().toISOString();
  const id = msg.id || msg.messageId || `hist-${crypto.randomUUID()}`;

  // System messages
  // Compaction divider (live-injected by ChatHandler)
  if (role === 'compaction') {
    return [{ type: 'compaction', id, timestamp, isStreaming: false } as CompactionBlock];
  }

  if (role === 'system') {
    if (/compact/i.test(content)) {
      return [{ type: 'compaction', id, timestamp, isStreaming: false } as CompactionBlock];
    }
    return []; // Skip other system messages
  }

  // Tool call messages (assistant with toolCall content blocks)
  if (role === 'assistant' && Array.isArray(msg.content)) {
    const toolBlocks = msg.content.filter((b: any) =>
      b.type === 'toolCall' || b.type === 'tool_use'
    );

    if (toolBlocks.length > 0 && toolBlocks.length === msg.content.length) {
      // Pure tool call message — all blocks are tool calls
      if (!toolIntentEnabled) return []; // Hidden when tool intent is off

      return toolBlocks.map((block: any, idx: number) => ({
        type: 'tool' as const,
        id: `${id}-call-${idx}`,
        timestamp,
        isStreaming: false,
        toolName: block.name || block.toolName || 'unknown',
        input: block.input ?? block.params ?? {},
        status: 'done' as const,
      } satisfies ToolBlock));
    }
  }

  // Tool result messages
  if (role === 'toolResult' || role === 'tool') {
    const toolName = msg.toolName || msg.name || 'unknown';
    const toolInput = msg.toolInput || msg.input;

    // Check for inline buttons FIRST (always shown regardless of toolIntentEnabled)
    const buttonRows = extractInlineButtonRows(toolName, toolInput);
    if (buttonRows) {
      return [{
        type: 'inline-buttons',
        id,
        timestamp,
        isStreaming: false,
        rows: buttonRows,
      } as InlineButtonsBlock];
    }

    // Normal tool result
    if (!toolIntentEnabled) return [];
    const output = typeof msg.content === 'string'
      ? msg.content
      : extractText(msg.content);
    return [{
      type: 'tool',
      id,
      timestamp,
      isStreaming: false,
      toolName,
      input: toolInput,
      output: output?.slice(0, 2000) || '',
      status: 'done',
    } as ToolBlock];
  }

  // Skip non user/assistant
  if (role !== 'user' && role !== 'assistant') return [];

  // Skip pure tool content
  if (Array.isArray(msg.content)) {
    const allTools = msg.content.every((b: any) =>
      b.type === 'toolCall' || b.type === 'toolResult' || b.type === 'tool_use' || b.type === 'tool_result'
    );
    if (allTools) return [];
  }
  if (msg.toolCallId || msg.tool_call_id) return [];

  // Filter noise from both assistant and user (heartbeat prompts, system injections)
  if (isNoise(content)) {
    if (role === 'assistant') return [];
    if (role === 'user' && /^(Read HEARTBEAT|HEARTBEAT_OK|NO_REPLY|When reading HEARTBEAT)/i.test(content)) return [];
  }
  // Additional heartbeat detection: assistant messages that are purely heartbeat results
  if (role === 'assistant' && /^HEARTBEAT_OK/i.test(content.trim())) return [];

  // Clean content
  let markdown = role === 'user' ? stripUserMeta(content) : content;
  if (!markdown) return [];

  // Strip directives
  markdown = stripDirectives(markdown);

  // Auto-detect code blocks for user and assistant messages
  markdown = autoDetectCode(markdown);
  // Auto-detect inline code patterns (file paths, package names, config keys)
  markdown = autoInlineCode(markdown);

  // Parse artifacts
  const { cleanText, artifacts } = parseArtifacts(markdown);

  // Extract quick replies (assistant only — stored separately, not in the block)
  // Quick replies are handled at the ChatView level, not per-block

  // Extract attachment images
  const images = extractAttachmentImages(msg.attachments);

  // Build collapsed meta items (assistant only)
  const meta: MetaItem[] = [];
  if (role === 'assistant') {
    // Thinking/reasoning content
    // Source 1: dedicated thinkingContent field (from streaming)
    // Source 2: content[] blocks with type==='thinking' (from chat.history)
    let thinking = msg.thinkingContent;
    if (!thinking && Array.isArray(msg.content)) {
      const thinkingBlocks = msg.content
        .filter((b: any) => b.type === 'thinking' && (typeof b.thinking === 'string' || typeof b.text === 'string'))
        .map((b: any) => (b.thinking || b.text || '').trim())
        .filter(Boolean);
      if (thinkingBlocks.length > 0) thinking = thinkingBlocks.join('\n');
    }
    if (thinking && typeof thinking === 'string' && thinking.trim()) {
      const lines = thinking.trim().split('\n').length;
      const chars = thinking.trim().length;
      meta.push({
        kind: 'thinking',
        label: `🧠 ${lines}L · ${chars > 1000 ? (chars / 1000).toFixed(1) + 'k' : chars}c`,
        content: thinking.trim(),
      });
    }
  }

  return [{
    type: 'message',
    id,
    timestamp,
    isStreaming: false,
    role: role as 'user' | 'assistant',
    markdown: cleanText || markdown, // fallback to full markdown if no artifacts
    artifacts,
    images,
    audio: msg.mediaUrl || undefined,
    thinkingContent: msg.thinkingContent || undefined,
    ...(meta.length > 0 ? { meta } : {}),
  } as MessageBlock];
}

/**
 * Convert a complete chat history response into RenderBlock[].
 * Single entry point for history → UI data.
 */
export function parseHistory(messages: any[], toolIntentEnabled: boolean): RenderBlock[] {
  return messages
    .flatMap(msg => parseHistoryMessage(msg, toolIntentEnabled))
    .filter(block => block !== null);
}
