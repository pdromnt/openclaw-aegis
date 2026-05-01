// ═══════════════════════════════════════════════════════════
// RenderBlock — Structured chat data BEFORE rendering
// Each message is parsed into one or more RenderBlocks.
// The UI just renders blocks — no parsing at render time.
// ═══════════════════════════════════════════════════════════

/** Parsed artifact from <aegis_artifact> tags */
export interface Artifact {
  type: string;   // html | react | svg | mermaid
  title: string;
  content: string;
}

/** Image reference (from markdown or attachments) */
export interface ImageRef {
  src: string;
  alt?: string;
  isAttachment?: boolean; // true = from file attachment, false = inline markdown
}

/** Video reference */
export interface VideoRef {
  src: string;
  alt?: string;
}

/** Interactive button */
export interface ButtonItem {
  text: string;
  value: string;       // sent as message when clicked
  callbackData?: string; // for inline buttons from tool calls
}

/** Inline button row (from message tool) */
export interface InlineButtonRow {
  buttons: Array<{ text: string; callback_data: string }>;
}

// ─── Block Types (discriminated union) ───

interface BlockBase {
  id: string;
  timestamp: string;
  isStreaming: boolean;
}

/** Collapsed meta item (thinking, system notes) shown under reply */
export interface MetaItem {
  kind: 'thinking' | 'system' | 'tool-summary';
  label: string;     // short label: "🧠 Reasoning", etc.
  content: string;   // full content (shown when expanded)
}

/** Regular chat message — user or assistant */
export interface MessageBlock extends BlockBase {
  type: 'message';
  role: 'user' | 'assistant';
  markdown: string;            // cleaned, ready-to-render
  artifacts: Artifact[];       // extracted <aegis_artifact> blocks
  images: ImageRef[];          // from attachments + inline markdown images
  audio?: string;              // TTS audio URL (mediaUrl)
  thinkingContent?: string;    // attached reasoning (finalized, not streaming)
  meta?: MetaItem[];           // collapsed meta items (thinking, etc.)
}

/** Tool call display */
export interface ToolBlock extends BlockBase {
  type: 'tool';
  toolName: string;
  input?: Record<string, unknown>;
  output?: string;
  status: 'running' | 'done' | 'error';
  durationMs?: number;
}

/** Inline buttons from message tool */
export interface InlineButtonsBlock extends BlockBase {
  type: 'inline-buttons';
  rows: InlineButtonRow[];
}

/** Thinking/reasoning display */
export interface ThinkingBlock extends BlockBase {
  type: 'thinking';
  content: string;
}

/** Compaction divider */
export interface CompactionBlock extends BlockBase {
  type: 'compaction';
}

/** The discriminated union */
export type RenderBlock =
  | MessageBlock
  | ToolBlock
  | InlineButtonsBlock
  | ThinkingBlock
  | CompactionBlock;
