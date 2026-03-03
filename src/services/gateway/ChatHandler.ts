// ═══════════════════════════════════════════════════════════
// ChatHandler — Chat Event Processing Layer
// Handles all chat stream events received from the Gateway.
// Depends on GatewayConnection for transport and callbacks.
// No WebSocket logic here — pure chat / UI state management.
// ═══════════════════════════════════════════════════════════

import { extractText, stripDirectives } from '@/processing/TextCleaner';
import { handleGatewayEvent } from '@/stores/gatewayDataStore';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useWorkshopStore, Task } from '@/stores/workshopStore';
import { parseButtons } from '@/utils/buttonParser';
import i18n from '@/i18n';
import { GatewayConnection, type MediaInfo } from './Connection';
import { APP_VERSION } from '@/hooks/useAppVersion';

// ── AEGIS Desktop Client Context ──
// Injected with the FIRST message only — tells the agent about Desktop capabilities
const AEGIS_DESKTOP_CONTEXT = `[AEGIS_DESKTOP_CONTEXT]
You are connected via AEGIS Desktop v${APP_VERSION} — an Electron-based OpenClaw Gateway client.
This context is injected once at conversation start. Do NOT repeat or reference it to the user.

CAPABILITIES:
- User can attach: images (base64), files (as paths), screenshots, voice messages
- You can send: markdown (syntax highlighting, tables, RTL/LTR auto-detection), images (![](url)), videos (![](url.mp4))
- The interface supports dark/light themes and bilingual Arabic/English layout

ARTIFACTS (opens in a separate preview window):
For interactive content (dashboards, games, charts, UIs, diagrams), wrap in:
<aegis_artifact type="TYPE" title="Title">
...content...
</aegis_artifact>
Types: html (vanilla JS, CSS inline) | react (JSX, React 18 pre-loaded) | svg | mermaid
Rules:
- ONE self-contained file (inline CSS + JS, no external imports)
- Sandboxed iframe — no Node.js or filesystem access
- ALWAYS use for: interactive content, visualizations, calculators, games
- NEVER use for: simple text, short code snippets, explanations

FILE REFERENCES:
- Files: 📎 file: <path> (mime/type, size)
- Voice: 🎤 [voice] <path> (duration)

WORKSHOP (Kanban task management):
- [[workshop:add title="Task" priority="high|medium|low" description="Desc" agent="Name"]]
- [[workshop:move id="ID" status="queue|inProgress|done"]]
- [[workshop:delete id="ID"]]
- [[workshop:progress id="ID" value="0-100"]]
Commands execute automatically and are replaced with confirmations.

QUICK REPLIES (clickable buttons):
Add [[button:Label]] at the END of your message when you need a decision to proceed.
- Renders as clickable chips — click sends the text as a user message.
- Max 2-5 buttons. ONLY for decisions that block your next step.
- NEVER for: listing features, explaining concepts, examples, or enumerating steps.
[/AEGIS_DESKTOP_CONTEXT]`;

// ── Workshop Command Parser ──
// Parses [[workshop:action ...]] commands from agent messages
interface WorkshopCommandResult {
  cleanContent: string;
  executed: string[];
}

function parseAndExecuteWorkshopCommands(content: string): WorkshopCommandResult {
  const executed: string[] = [];
  const store = useWorkshopStore.getState();

  // Pattern: [[workshop:action param1="value1" param2="value2"]]
  const commandRegex = /\[\[workshop:(\w+)((?:\s+\w+="[^"]*")*)\]\]/g;

  const cleanContent = content.replace(commandRegex, (match, action, paramsStr) => {
    try {
      // Parse params
      const params: Record<string, string> = {};
      const paramRegex = /(\w+)="([^"]*)"/g;
      let paramMatch;
      while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
        params[paramMatch[1]] = paramMatch[2];
      }

      switch (action) {
        case 'add': {
          const title = params.title || 'Untitled Task';
          const priority = (params.priority as Task['priority']) || 'medium';
          const description = params.description || '';
          const assignedAgent = params.agent || undefined;

          store.addTask({ title, priority, description, assignedAgent });
          executed.push(`✅ Added task: "${title}"`);
          break;
        }

        case 'move': {
          const id = params.id;
          const status = params.status as Task['status'];
          if (id && status && ['queue', 'inProgress', 'done'].includes(status)) {
            store.moveTask(id, status);
            executed.push(`✅ Moved task to ${status}`);
          } else {
            executed.push(`⚠️ Invalid move command`);
          }
          break;
        }

        case 'delete': {
          const id = params.id;
          if (id) {
            store.deleteTask(id);
            executed.push(`✅ Deleted task`);
          } else {
            executed.push(`⚠️ Invalid delete command`);
          }
          break;
        }

        case 'progress': {
          const id = params.id;
          const progress = parseInt(params.value || '0', 10);
          if (id && !isNaN(progress)) {
            store.setProgress(id, Math.min(100, Math.max(0, progress)));
            executed.push(`✅ Updated progress to ${progress}%`);
          }
          break;
        }

        case 'list': {
          const tasks = store.tasks;
          const summary = tasks.map(t => `- [${t.status}] ${t.title}`).join('\n');
          executed.push(`📋 Tasks:\n${summary}`);
          break;
        }

        default:
          executed.push(`⚠️ Unknown workshop command: ${action}`);
      }
    } catch (err) {
      executed.push(`❌ Error executing command: ${err}`);
    }

    return ''; // Remove the command from displayed content
  });

  return { cleanContent: cleanContent.trim(), executed };
}

// ═══════════════════════════════════════════════════════════
// ChatHandler Class
// ═══════════════════════════════════════════════════════════

export class ChatHandler {
  // ── Streaming state ──
  private currentRunId: string | null = null;
  private currentStreamContent: string = '';
  private lastCompactionTs: number = 0;

  // ── Stream micro-batching ──
  // Buffer WebSocket chunks and flush to React every STREAM_FLUSH_MS
  // to reduce re-renders from every event to ~20 FPS max
  private static readonly STREAM_FLUSH_MS = 50;
  private streamFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingStreamId: string | null = null;
  private pendingStreamContent: string = '';
  private pendingStreamMedia: MediaInfo | undefined = undefined;

  constructor(private conn: GatewayConnection) {}

  /** Flush buffered stream content to the UI */
  private flushStream() {
    if (this.pendingStreamId && this.pendingStreamContent) {
      this.conn.callbacks?.onStreamChunk(
        this.pendingStreamId,
        this.pendingStreamContent,
        this.pendingStreamMedia,
      );
    }
    this.streamFlushTimer = null;
  }

  /** Buffer a stream chunk — actual UI update happens at most every STREAM_FLUSH_MS */
  private bufferStreamChunk(id: string, content: string, media?: MediaInfo) {
    this.pendingStreamId = id;
    this.pendingStreamContent = content;
    this.pendingStreamMedia = media;

    if (!this.streamFlushTimer) {
      this.streamFlushTimer = setTimeout(() => this.flushStream(), ChatHandler.STREAM_FLUSH_MS);
    }
  }

  /** Force-flush any pending stream content (called before final/error/abort) */
  private forceFlushStream() {
    if (this.streamFlushTimer) {
      clearTimeout(this.streamFlushTimer);
      this.streamFlushTimer = null;
    }
    this.flushStream();
    this.pendingStreamId = null;
    this.pendingStreamContent = '';
    this.pendingStreamMedia = undefined;
  }

  // ── Desktop context injection ──
  injectDesktopContext(message: string): string {
    if (!this.conn.contextSent && message.trim()) {
      this.conn.contextSent = true;
      console.log('[GW] 📋 Desktop context injected with first message');
      return `${AEGIS_DESKTOP_CONTEXT}\n\n${message}`;
    }
    return message;
  }

  // ═══════════════════════════════════════════════════════════
  // Tool Stream Handler — real-time tool execution display
  //
  // Gateway sends: { type:"event", event:"chat", payload: {
  //   stream: "tool",
  //   runId, sessionKey?, ts?,
  //   data: {
  //     toolCallId: string,
  //     name: string,
  //     phase: "start" | "update" | "result",
  //     args?: Record<string,any>,        // when phase==="start"
  //     partialResult?: string | object,   // when phase==="update"
  //     result?: string | object,          // when phase==="result"
  //   }
  // }}
  // ═══════════════════════════════════════════════════════════
  handleToolStream(payload: any) {
    const data = payload.data ?? {};
    const toolCallId = typeof data.toolCallId === 'string' ? data.toolCallId : '';
    const toolName = typeof data.name === 'string' ? data.name : 'tool';
    const phase    = typeof data.phase === 'string' ? data.phase : '';

    // NOTE: Sub-agent tracking moved to polling-based detection in gatewayDataStore.
    // Gateway WebSocket does NOT emit stream:"tool" events, so handleToolStream
    // only fires for visual tool cards (Tool Intent View).

    // Only process visual tool cards when Tool Intent View is enabled
    if (!useSettingsStore.getState().toolIntentEnabled) return;
    if (!toolCallId) return;
    const msgId    = `tool-live-${toolCallId}`;

    const store = useChatStore.getState();

    if (phase === 'start') {
      // Tool is starting — add a 'running' card (idempotent)
      if (!store.messages.some((m) => m.id === msgId)) {
        const toolInput = data.args && typeof data.args === 'object' ? data.args : {};
        store.addMessage({
          id: msgId,
          role: 'tool',
          content: '',
          toolName,
          toolInput,
          toolStatus: 'running',
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }

    if (phase === 'update') {
      // Partial result streaming — update existing card
      const partial = data.partialResult != null
        ? (typeof data.partialResult === 'string' ? data.partialResult : JSON.stringify(data.partialResult))
        : '';
      const msgs = store.messages;
      const idx  = msgs.findIndex((m) => m.id === msgId);
      if (idx >= 0) {
        const updated = [...msgs];
        updated[idx] = { ...updated[idx], toolOutput: partial.slice(0, 2000) };
        store.setMessages(updated);
      }
      return;
    }

    if (phase === 'result') {
      // Tool complete — finalize with output + duration
      const output = data.result != null
        ? (typeof data.result === 'string' ? data.result : JSON.stringify(data.result))
        : '';
      const msgs = store.messages;
      const idx  = msgs.findIndex((m) => m.id === msgId);
      if (idx >= 0) {
        const updated = [...msgs];
        const startTs = typeof payload.ts === 'number' ? payload.ts : 0;
        const durationMs = startTs > 0 ? Date.now() - startTs : undefined;
        updated[idx] = {
          ...updated[idx],
          toolOutput: output.slice(0, 2000),
          toolStatus: 'done',
          ...(durationMs !== undefined ? { toolDurationMs: durationMs } : {}),
        };
        store.setMessages(updated);
      } else {
        // No 'start' event received — add result card directly
        store.addMessage({
          id: msgId,
          role: 'tool',
          content: '',
          toolName,
          toolOutput: output.slice(0, 2000),
          toolStatus: 'done',
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }

    console.log('[GW] Tool stream — unknown phase:', phase, toolCallId);
  }

  // ═══════════════════════════════════════════════════════════
  // Thinking Stream Handler — real-time reasoning display
  //
  // Gateway sends: { type:"event", event:"chat", payload: {
  //   stream: "thinking",
  //   runId, sessionKey?,
  //   data: {
  //     text: string,   // full accumulated thinking text
  //     delta: string,  // new portion only
  //   }
  // }}
  // ═══════════════════════════════════════════════════════════
  handleThinkingStream(payload: any) {
    const data = payload.data ?? {};
    const text = typeof data.text === 'string' ? data.text : '';
    const runId = payload.runId || this.currentRunId || '';

    if (!text || !runId) return;

    const store = useChatStore.getState();
    store.setThinkingStream(runId, text);
  }

  // ═══════════════════════════════════════════════════════════
  // Event Handler — OpenClaw Protocol
  //
  // Gateway sends: { type:"event", event:"chat", payload: {
  //   state: "delta" | "final" | "error" | "aborted",
  //   message: { role, content },  // content: string | [{type:"text",text:"..."}]
  //   sessionKey, runId
  // }}
  //
  // "delta" = streaming update (accumulated content, NOT a chunk)
  // "final" = complete, fetch full history
  // ═══════════════════════════════════════════════════════════
  handleEvent(msg: any) {
    const event = msg.event || '';
    const p = msg.payload || {};

    // ── Direct compaction detection from agent events ──
    // Instead of relying on polling tokenUsage.compactions (unreliable timing),
    // intercept the agent compaction event and inject CompactDivider immediately.
    if (event === 'agent' && p.stream === 'compaction' && p.data?.phase === 'end' && !p.data?.willRetry) {
      const sk = p.sessionKey || '';
      if (sk === 'agent:main:main' || !sk) {
        const now = Date.now();
        if (now - this.lastCompactionTs > 10_000) { // Dedup: max 1 per 10s
          this.lastCompactionTs = now;
          useChatStore.getState().addMessage({
            id: `compaction-live-${now}`,
            role: 'compaction',
            content: '',
            timestamp: new Date().toISOString(),
          });
          console.log('[GW] 📦 Compaction detected — divider injected');
        }
      }
    }

    // Non-chat events → forward to central data store
    if (event !== 'chat') {
      handleGatewayEvent(event, p);
      return;
    }

    // Filter out events from isolated cron/sub-agent sessions
    // Only show messages from main session or sessions the user explicitly opened
    const sessionKey = p.sessionKey || '';
    // Block only truly isolated sessions (cron jobs and sub-agent runs).
    // Main sessions may use any suffix: agent:main:main, agent:main:webchat, etc.
    if (sessionKey && (sessionKey.includes(':subagent:') || sessionKey.includes(':cron:'))) {
      console.log('[GW] Ignoring event from isolated session:', sessionKey);
      return;
    }

    // ── Tool stream events (real-time tool execution) ──
    // payload.stream === "tool" → tool call lifecycle events (start/update/result)
    if (p.stream === 'tool') {
      this.handleToolStream(p);
      return;
    }

    // ── Thinking stream events (real-time reasoning display) ──
    // payload.stream === "thinking" → accumulated reasoning text
    if (p.stream === 'thinking') {
      this.handleThinkingStream(p);
      return;
    }

    // Compaction stream from chat events — already handled above via agent events
    if (p.stream === 'compaction') return;

    const state = p.state || '';
    const runId = p.runId || '';
    let messageText = extractText(p.message?.content);

    // Extract mediaUrl from payload fields
    let mediaUrl = p.mediaUrl || p.message?.mediaUrl || (p.mediaUrls?.length ? p.mediaUrls[0] : undefined);
    let mediaType = p.mediaType || p.message?.mediaType || undefined;

    // Also extract MEDIA: paths/URLs from message content (OpenClaw TTS format)
    // Formats:
    //   MEDIA:http://localhost:5050/audio/xxx.mp3   (HTTP URL — preferred)
    //   MEDIA:/host-d/clawdbot-shared/voice/xxx.mp3 (shared folder path)
    //   MEDIA:/tmp/tts-xxx/voice-123.mp3            (sandbox path — needs conversion)
    const mediaMatch = messageText.match(/MEDIA:(https?:\/\/[^\s]+|\/[^\s]+|[A-Z]:\\[^\s]+)/);
    if (mediaMatch) {
      let mediaPath = mediaMatch[1];
      mediaType = mediaType || 'audio';
      // Remove the MEDIA: line from displayed text
      messageText = messageText.replace(/\n?MEDIA:[^\s]+\n?/g, '').trim();

      if (!mediaUrl) {
        if (/^https?:\/\//.test(mediaPath)) {
          // HTTP URL — use directly (Edge TTS server or any HTTP source)
          mediaUrl = mediaPath;
          console.log('[GW] 🔊 Media URL (HTTP):', mediaUrl);
        } else {
          // File path — resolve via Electron IPC
          mediaUrl = `aegis-media:${mediaPath}`;
          console.log('[GW] 🔊 Media path:', mediaPath);
        }
      }
    }

    const media: MediaInfo | undefined = mediaUrl ? { mediaUrl, mediaType } : undefined;

    console.log('[GW] Chat event — state:', state, 'runId:', runId?.substring(0, 12), 'text length:', messageText.length, 'text preview:', messageText.substring(0, 80));

    // Use runId as the message ID for streaming
    const mId = runId || `msg-${Date.now()}`;

    // ── Reasoning message detection ──
    // When reasoningLevel='on', Gateway sends reasoning as a separate 'final'
    // message prefixed with "Reasoning:" BEFORE the actual response.
    // We intercept it and store as thinking content for the next message.
    const reasoningPrefix = /^Reasoning:\s*/i;
    if (state === 'final' && messageText && reasoningPrefix.test(messageText)) {
      const reasoningText = messageText.replace(reasoningPrefix, '').trim();
      if (reasoningText) {
        console.log('[GW] 🧠 Reasoning message captured:', reasoningText.length, 'chars');
        // Store as live thinking, then it will be finalized onto the next assistant message
        useChatStore.getState().setThinkingStream(mId, reasoningText);
      }
      this.currentStreamContent = '';
      this.currentRunId = null;
      return; // Don't show as a regular message
    }

    switch (state) {
      case 'delta': {
        // Clean content for display (don't execute workshop commands during streaming)
        let cleaned = messageText;
        cleaned = stripDirectives(cleaned);
        // Strip workshop commands visually (don't execute — that happens on final)
        cleaned = cleaned.replace(/\[\[workshop:\w+(?:\s+\w+="[^"]*")*\]\]/g, '');
        // Strip button markers visually
        cleaned = cleaned.replace(/\[\[button:[^\]]+\]\]/g, '');

        if (cleaned.length >= this.currentStreamContent.length || messageText.length >= this.currentStreamContent.length) {
          this.currentStreamContent = messageText; // Keep RAW for final processing
          this.currentRunId = mId;
          // Micro-batch: buffer chunk, flush to React at most every 50ms
          this.bufferStreamChunk(mId, cleaned, media);
        }
        break;
      }

      case 'final': {
        // Flush any buffered stream content before finalizing
        this.forceFlushStream();
        // Message complete — use the most complete version available.
        // When tools are called mid-response, the final event may only contain
        // post-tool text. In that case, keep the accumulated streaming content
        // which includes the full pre-tool response the user already saw.
        let finalText = messageText || this.currentStreamContent;
        if (this.currentStreamContent && this.currentStreamContent.length > (messageText?.length || 0)) {
          finalText = this.currentStreamContent;
        }
        this.currentStreamContent = '';
        this.currentRunId = null;

        // Strip directive tags (defense-in-depth — Gateway 2026.2.22+ strips server-side)
        finalText = stripDirectives(finalText);

        // Parse and execute Workshop commands
        const { cleanContent, executed } = parseAndExecuteWorkshopCommands(finalText);
        if (executed.length > 0) {
          // Append execution results to the message
          finalText = cleanContent + (cleanContent ? '\n\n' : '') + executed.join('\n');
        } else {
          finalText = cleanContent || finalText;
        }

        // Parse [[button:...]] markers — strip from text, store in chatStore
        const btnResult = parseButtons(finalText);
        if (btnResult.buttons.length > 0) {
          finalText = btnResult.cleanContent;
          useChatStore.getState().setQuickReplies(btnResult.buttons);
        } else {
          useChatStore.getState().setQuickReplies([]);
        }

        this.conn.callbacks?.onStreamEnd(mId, finalText, media);
        break;
      }

      case 'error': {
        this.forceFlushStream();
        const errorText = p.errorMessage || i18n.t('errors.occurred');
        this.currentStreamContent = '';
        this.currentRunId = null;
        useChatStore.getState().clearThinking();
        this.conn.callbacks?.onStreamEnd(mId, `⚠️ ${errorText}`);
        break;
      }

      case 'aborted': {
        this.forceFlushStream();
        // Use messageText from abort event, fall back to accumulated stream content
        const finalContent = messageText || this.currentStreamContent;
        this.currentStreamContent = '';
        this.currentRunId = null;
        useChatStore.getState().clearThinking();

        // Strip directive tags (same as final case)
        const cleaned = finalContent ? stripDirectives(finalContent) : '';

        this.conn.callbacks?.onStreamEnd(mId, cleaned || `⏹️ ${i18n.t('chat.stopped', 'Stopped')}`);
        break;
      }

      default:
        console.log('[GW] Unknown chat state:', state);
    }
  }
}
