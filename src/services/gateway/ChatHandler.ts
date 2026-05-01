// ═══════════════════════════════════════════════════════════
// ChatHandler — Chat Event Processing Layer
// Handles all chat stream events received from the Gateway.
// Depends on GatewayConnection for transport and callbacks.
// No WebSocket logic here — pure chat / UI state management.
// ═══════════════════════════════════════════════════════════

import { extractText, stripDirectives } from '@/processing/TextCleaner';
import { handleGatewayEvent } from '@/stores/gatewayDataStore';
import { resolveResponse, rejectResponse, hasPendingWaiter } from './responseBus';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { parseButtons } from '@/utils/buttonParser';
import i18n from '@/i18n';
import { GatewayConnection, type MediaInfo } from './Connection';
import { useNotificationStore } from '@/stores/notificationStore';

// ═══════════════════════════════════════════════════════════
// ChatHandler Class
// ═══════════════════════════════════════════════════════════

export class ChatHandler {
  // ── Streaming state ──
  private currentRunId: string | null = null;
  private currentStreamContent: string = '';
  private lastCompactionTs: number = 0;

  // ── Silent run detection ──
  // Some providers (e.g., Gemini) don't emit streaming events at all.
  // The response is delivered through reply delivery (webchat) but not
  // via WebSocket chat/agent events. We detect these "silent runs"
  // (lifecycle start → end without assistant events) and fetch the
  // response from session history.
  private silentRunPending = new Map<string, { sessionKey: string }>();

  // ── Agent assistant fallback ──
  // Some providers emit agent assistant events but not chat delta events.
  // We use these as a fallback when no chat deltas arrive.
  private static readonly FALLBACK_GRACE_MS = 2000;
  private lastChatDeltaTs: number = 0;
  private agentFallbackActive = false;

  // ── Stream micro-batching ──
  // Buffer WebSocket chunks and flush to React every STREAM_FLUSH_MS
  // to reduce re-renders from every event to ~20 FPS max
  private static readonly STREAM_FLUSH_MS = 50;
  private streamFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingStreamId: string | null = null;
  private pendingStreamContent: string = '';
  private pendingStreamMedia: MediaInfo | undefined = undefined;

  // ── Thinking poll fallback ──
  // When the Gateway doesn't emit stream:"thinking" events for chat.send
  // responses (e.g., direct Desktop messages), we poll the session transcript
  // periodically during streaming to detect thinking content blocks.
  // This gives a delayed but functional ThinkingBubble display.
  private static readonly THINKING_POLL_MS = 1500;
  private thinkingPollTimer: ReturnType<typeof setInterval> | null = null;
  private thinkingPollActive = false;

  constructor(private conn: GatewayConnection) {}

  /** Clean up timers and state — call from Connection.disconnect() */
  destroy() {
    this.forceFlushStream();
    this.stopThinkingPoll();
    this.currentStreamContent = '';
    this.currentRunId = null;
    this.silentRunPending.clear();
    this.lastChatDeltaTs = 0;
    this.agentFallbackActive = false;
  }

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

    // Real thinking stream received — stop polling fallback (not needed)
    this.stopThinkingPoll();

    const store = useChatStore.getState();
    store.setThinkingStream(runId, text);
  }

  // ═══════════════════════════════════════════════════════════
  // Thinking Poll Fallback — for chat.send responses without
  // stream:"thinking" events.
  //
  // When the Gateway doesn't emit thinking stream events for direct
  // Desktop messages, we poll the session transcript during streaming
  // to detect thinking content blocks as they accumulate.
  // Stops automatically when:
  //   - Real thinking stream events arrive (handleThinkingStream)
  //   - The message is finalized (stopThinkingPoll)
  //   - Thinking content is found via polling
  // ═══════════════════════════════════════════════════════════
  private startThinkingPoll(runId: string, sessionKey: string) {
    // Don't start if already have thinking content or poll already active
    if (this.thinkingPollActive) return;
    if (useChatStore.getState().thinkingText) return;

    this.thinkingPollActive = true;
    console.log('[GW] 🧠 Starting thinking poll fallback for runId:', runId.substring(0, 12));

    this.thinkingPollTimer = setInterval(async () => {
      // Stop if thinking was already captured (by real stream events or previous poll)
      const currentThinking = useChatStore.getState().thinkingText;
      if (currentThinking) {
        this.stopThinkingPoll();
        return;
      }

      try {
        const result = await this.conn.request('chat.history', {
          sessionKey: sessionKey || 'agent:main:main',
          limit: 3,
        });

        const messages: any[] = result?.messages || result || [];
        if (!Array.isArray(messages) || messages.length === 0) return;

        // Find the latest assistant message (the one currently streaming)
        const lastAssistant = [...messages].reverse().find(
          (m: any) => m.role === 'assistant'
        );
        if (!lastAssistant) return;

        let thinking = '';

        // Check thinkingContent field
        if (typeof lastAssistant.thinkingContent === 'string' && lastAssistant.thinkingContent.trim()) {
          thinking = lastAssistant.thinkingContent.trim();
        }

        // Check content blocks with type === 'thinking'
        if (!thinking && Array.isArray(lastAssistant.content)) {
          const thinkingBlocks: string[] = [];
          for (const block of lastAssistant.content) {
            if (block.type === 'thinking' && (typeof block.thinking === 'string' || typeof block.text === 'string')) {
              const t = (block.thinking || block.text || '').trim();
              if (t) thinkingBlocks.push(t);
            }
          }
          if (thinkingBlocks.length > 0) {
            thinking = thinkingBlocks.join('\n');
          }
        }

        if (thinking) {
          console.log('[GW] 🧠 Thinking found via poll fallback:', thinking.length, 'chars');
          useChatStore.getState().setThinkingStream(runId, thinking);
          this.stopThinkingPoll();
        }
      } catch {
        // Non-critical — silently continue polling
      }
    }, ChatHandler.THINKING_POLL_MS);
  }

  private stopThinkingPoll() {
    if (this.thinkingPollTimer) {
      clearInterval(this.thinkingPollTimer);
      this.thinkingPollTimer = null;
    }
    this.thinkingPollActive = false;
  }

  // ═══════════════════════════════════════════════════════════
  // Silent Run Handler — for providers that don't stream at all
  //
  // Some providers (e.g., Gemini with thinking) complete the entire
  // response without emitting any streaming events. The response is
  // only available in the session transcript. We detect these "silent
  // runs" and fetch the latest response from history.
  // ═══════════════════════════════════════════════════════════
  /**
   * Split <think>...</think> tags from response text.
   * Returns { thinking, response } where thinking is the extracted content
   * and response is the text with tags removed.
   * Handles: <think>content</think>, unclosed <think>content, and multiple blocks.
   */
  private static splitThinkingTags(text: string): { thinking: string; response: string } {
    if (!text) return { thinking: '', response: '' };

    let thinking = '';
    let response = text;

    // Match <think>...</think> blocks (case-insensitive, multiline)
    const thinkRegex = /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi;
    const matches = [...text.matchAll(thinkRegex)];

    if (matches.length > 0) {
      // Extract all thinking content
      thinking = matches.map(m => m[1].trim()).join('\n\n');
      // Remove thinking blocks from response
      response = text.replace(thinkRegex, '').trim();
    } else {
      // Handle unclosed <think> tag — no closing </think> found.
      // Can't reliably separate thinking from response, so just strip the tag
      // and return everything as response (no thinking extraction).
      const openMatch = text.match(/^<think(?:ing)?>\s*/i);
      if (openMatch) {
        thinking = '';
        response = text.slice(openMatch[0].length).trim();
      }
    }

    return { thinking, response };
  }

  /**
   * Post-finalization: fetch reasoning/thinking from the session transcript.
   *
   * The Gateway may store thinking content in multiple formats:
   *   1. A separate "Reasoning:" prefixed assistant message
   *   2. Content blocks with type === 'thinking' inside the assistant message
   *   3. A dedicated thinkingContent field on the assistant message
   *   4. <think>...</think> tags embedded in the response text
   *
   * We check ALL sources (matching parseHistoryMessage logic) so that
   * reasoning displays immediately instead of only after app restart.
   *
   * Retry logic: if first attempt finds nothing (transcript not committed yet),
   * we retry once after a longer delay.
   */
  private async fetchReasoningFromHistory(messageId: string, attempt = 1): Promise<void> {
    // First attempt: 1s delay. Retry: 3s delay (gives Gateway time to commit).
    const delay = attempt === 1 ? 1000 : 3000;
    await new Promise(r => setTimeout(r, delay));

    try {
      const result = await this.conn.request('chat.history', {
        sessionKey: 'agent:main:main',
        limit: 5,
      });

      const messages: any[] = result?.messages || result || [];
      if (!Array.isArray(messages) || messages.length === 0) {
        if (attempt === 1) return this.fetchReasoningFromHistory(messageId, 2);
        return;
      }

      // Find the latest assistant message (the one we just finalized)
      const lastAssistant = [...messages].reverse().find(
        (m: any) => m.role === 'assistant'
      );
      if (!lastAssistant) {
        if (attempt === 1) return this.fetchReasoningFromHistory(messageId, 2);
        return;
      }

      let thinking = '';

      // ── Source 1: dedicated thinkingContent field ──
      if (typeof lastAssistant.thinkingContent === 'string' && lastAssistant.thinkingContent.trim()) {
        thinking = lastAssistant.thinkingContent.trim();
      }

      // ── Source 2: content blocks with type === 'thinking' ──
      if (!thinking && Array.isArray(lastAssistant.content)) {
        const thinkingBlocks: string[] = [];
        for (const block of lastAssistant.content) {
          if (block.type === 'thinking' && (typeof block.thinking === 'string' || typeof block.text === 'string')) {
            const t = (block.thinking || block.text || '').trim();
            if (t) thinkingBlocks.push(t);
          }
        }
        if (thinkingBlocks.length > 0) {
          thinking = thinkingBlocks.join('\n');
        }
      }

      // ── Source 3: "Reasoning:" prefixed assistant message ──
      if (!thinking) {
        const reasoningPrefix = /^Reasoning:\s*/i;
        const reasoningMsg = [...messages].reverse().find(
          (m: any) => m.role === 'assistant' && reasoningPrefix.test(extractText(m.content))
        );
        if (reasoningMsg) {
          const rawReasoning = extractText(reasoningMsg.content);
          thinking = rawReasoning.replace(reasoningPrefix, '').trim();
        }
      }

      // ── Source 4: <think>...</think> tags in the response text ──
      if (!thinking) {
        const rawText = extractText(lastAssistant.content);
        if (rawText) {
          const { thinking: tagThinking } = ChatHandler.splitThinkingTags(rawText);
          if (tagThinking) {
            thinking = tagThinking;
          }
        }
      }

      if (!thinking) {
        // Nothing found — retry once if first attempt
        if (attempt === 1) {
          console.log('[GW] 🧠 No reasoning found on attempt 1, retrying...');
          return this.fetchReasoningFromHistory(messageId, 2);
        }
        return;
      }

      // Update the message with thinkingContent directly in the store
      useChatStore.getState().updateMessageThinking(messageId, thinking);
      console.log('[GW] 🧠 Reasoning fetched from transcript (attempt', attempt + '):', thinking.length, 'chars');
    } catch (err) {
      // Non-critical — just log and continue
      console.warn('[GW] Could not fetch reasoning from transcript:', err);
      // Retry once on error
      if (attempt === 1) {
        return this.fetchReasoningFromHistory(messageId, 2);
      }
    }
  }

  private async handleSilentRunEnd(sessionKey: string, runId: string) {
    // Small delay to let the Gateway finalize the transcript
    await new Promise(r => setTimeout(r, 500));

    try {
      const result = await this.conn.request('chat.history', {
        sessionKey: sessionKey || 'agent:main:main',
        limit: 5,
      });

      const messages: any[] = result?.messages || result || [];
      if (!Array.isArray(messages) || messages.length === 0) return;

      // Find the latest assistant message
      const lastAssistant = [...messages].reverse().find(
        (m: any) => m.role === 'assistant'
      );

      if (!lastAssistant) return;

      // ── Extract thinking and response from content ──
      // Strategy: check multiple sources, preferring structured data over tag parsing.
      //
      // Source 1: dedicated thinkingContent field
      // Source 2: content blocks — separate "thinking" blocks from "text" blocks
      // Source 3: <think>...</think> tags in the text (fallback)
      let thinking = '';
      let responseText = '';

      // Source 1: thinkingContent field
      if (typeof lastAssistant.thinkingContent === 'string' && lastAssistant.thinkingContent.trim()) {
        thinking = lastAssistant.thinkingContent;
      }

      // Source 2: content blocks (array of {type, text/thinking} objects)
      if (Array.isArray(lastAssistant.content)) {
        const thinkingBlocks: string[] = [];
        const textBlocks: string[] = [];

        for (const block of lastAssistant.content) {
          if (block.type === 'thinking' && (typeof block.thinking === 'string' || typeof block.text === 'string')) {
            thinkingBlocks.push(block.thinking || block.text);
          } else if (block.type === 'text' && typeof block.text === 'string') {
            textBlocks.push(block.text);
          }
        }

        if (thinkingBlocks.length > 0 && !thinking) {
          thinking = thinkingBlocks.join('\n');
        }

        // Use ONLY text blocks for display (excludes thinking blocks)
        if (thinkingBlocks.length > 0 && textBlocks.length > 0) {
          responseText = textBlocks.join('\n');
        }
      }

      // Get the full raw text (all blocks merged) as fallback
      const rawText = responseText || extractText(lastAssistant.content);
      if (!rawText || !rawText.trim()) return;

      // Skip silent replies
      const trimmed = rawText.trim();
      if (trimmed === 'NO_REPLY' || trimmed === 'HEARTBEAT_OK') return;

      // Source 3: <think>...</think> tags in text (only if no thinking found yet)
      let displayText = rawText;
      if (!thinking) {
        const { thinking: tagThinking, response: cleanResponse } = ChatHandler.splitThinkingTags(rawText);
        if (tagThinking) {
          thinking = tagThinking;
          // Only use cleanResponse if the regex found a proper closing tag
          // (cleanResponse will be non-empty if </think> was found)
          if (cleanResponse) {
            displayText = cleanResponse;
          }
        }
      } else {
        // We already have thinking from blocks — use responseText as display
        displayText = responseText || rawText;
      }

      displayText = stripDirectives(displayText);

      // Set thinking content for ThinkingBubble BEFORE creating the message
      if (thinking) {
        useChatStore.getState().setThinkingStream(runId, thinking);
      }

      if (!displayText.trim()) {
        // Nothing visible to display. Clear thinking to prevent leakage.
        if (!thinking) {
          useChatStore.getState().clearThinking();
        }
        console.log('[GW] 📥 Silent run — thinking only:', thinking.length, 'chars');
        return;
      }

      // Display the clean response
      this.conn.callbacks?.onStreamEnd(runId, displayText);
      console.log('[GW] 📥 Silent run — response:', displayText.length, 'chars, thinking:', thinking.length, 'chars');

    } catch (err) {
      console.error('[GW] Failed to fetch silent run response:', err);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Agent Assistant Fallback — for providers without chat deltas
  //
  // Some providers (e.g., Gemini with thinking) send the response
  // only through agent "assistant" events, not chat "delta" events.
  // This fallback intercepts those agent events and displays them
  // as streaming text in the UI.
  // ═══════════════════════════════════════════════════════════
  private handleAgentAssistantFallback(payload: any) {
    const runId = payload.runId || '';
    const text = typeof payload.data?.text === 'string' ? payload.data.text : '';
    if (!runId || !text) return;

    const cleaned = stripDirectives(text);

    // New fallback run — reset state
    if (runId !== this.currentRunId) {
      this.forceFlushStream();
      this.currentStreamContent = '';
      this.currentRunId = runId;
    }

    this.agentFallbackActive = true;
    this.currentStreamContent = text;
    this.bufferStreamChunk(runId, cleaned);
  }

  private finalizeAgentFallback() {
    if (!this.agentFallbackActive || !this.currentStreamContent) {
      this.agentFallbackActive = false;
      return;
    }

    this.forceFlushStream();

    let finalText = this.currentStreamContent;
    const mId = this.currentRunId || `msg-${Date.now()}`;

    this.currentStreamContent = '';
    this.currentRunId = null;
    this.agentFallbackActive = false;

    // Strip directive tags
    finalText = stripDirectives(finalText);

    // Parse [[button:...]] markers
    const btnResult = parseButtons(finalText);
    if (btnResult.buttons.length > 0) {
      finalText = btnResult.cleanContent;
      useChatStore.getState().setQuickReplies(btnResult.buttons);
    } else {
      useChatStore.getState().setQuickReplies([]);
    }

    // Deliver to UI
    const consumed = resolveResponse(mId, finalText);
    if (!consumed) {
      this.conn.callbacks?.onStreamEnd(mId, finalText);
    }

    console.log('[GW] 🔄 Agent fallback finalized:', finalText.length, 'chars');
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

    // ── Exec approval requests ──
    if (event === 'exec.approval.requested') {
      const req = p?.request || p;
      // Gateway sends { id, request: { command, cwd, ... }, expiresAtMs }
      // The approval `id` lives at p.id (top-level), NOT inside p.request.
      const approvalId = p?.id || req?.id;
      const command = req?.command || p?.command;
      if (approvalId && command) {
        console.log('[GW] 🔒 Exec approval requested:', approvalId, command);
        useChatStore.getState().addExecApproval({
          id: approvalId,
          command,
          cwd: req.cwd || p?.cwd || null,
          expiresAt: p.expiresAtMs || (Date.now() + 120000),
        });
        useNotificationStore.getState().addNotification({
          category: 'exec-approval',
          severity: 'warning',
          title: 'Exec Approval Required',
          body: command,
          route: '/chat',
          showToast: true,
        });
      } else {
        console.warn('[GW] ⚠️ exec.approval.requested — missing id or command:', JSON.stringify(p).substring(0, 300));
      }
    }
    if (event === 'exec.approval.resolved') {
      const id = p?.id || p?.request?.id;
      const decision = p?.decision || 'resolved';
      if (id) {
        useChatStore.getState().removeExecApproval(id);
        useNotificationStore.getState().addNotification({
          category: 'exec-approval',
          severity: decision === 'deny' ? 'error' : 'success',
          title: `Exec ${decision === 'deny' ? 'Denied' : 'Approved'}`,
          body: p?.request?.command || p?.command || id,
          showToast: false,
        });
      }
    }

    // ── Plugin approval requests ──
    if (event === 'plugin.approval.requested') {
      const req = p?.request || p;
      if (p?.id && req?.title) {
        useChatStore.getState().addPluginApproval({
          id: p.id,
          title: req.title || 'Plugin Approval',
          description: req.description || '',
          severity: req.severity || null,
          toolName: req.toolName || null,
          pluginId: req.pluginId || null,
          expiresAt: p.expiresAtMs || (Date.now() + 120000),
        });
        useNotificationStore.getState().addNotification({
          category: 'plugin-approval',
          severity: req.severity === 'critical' ? 'error' : 'warning',
          title: req.title,
          body: req.description || req.toolName || '',
          route: '/chat',
          showToast: false,
        });
      }
    }
    if (event === 'plugin.approval.resolved') {
      const id = p?.id;
      const decision = p?.decision || 'resolved';
      if (id) {
        useChatStore.getState().removePluginApproval(id);
        useNotificationStore.getState().addNotification({
          category: 'plugin-approval',
          severity: decision === 'deny' ? 'error' : 'success',
          title: `Plugin ${decision === 'deny' ? 'Denied' : 'Approved'}`,
          body: p?.request?.title || p?.request?.toolName || id,
          showToast: false,
        });
      }
    }

    // ── Model fallback detection ──
    if (event === 'agent' && (p.stream === 'fallback' || p.stream === 'lifecycle')) {
      const data = p.data || {};
      const fromModel = data.selectedModel || data.fromModel;
      const toModel = data.activeModel || data.toModel;
      if (fromModel && toModel && fromModel !== toModel) {
        const reason = data.reasonSummary || data.reason;
        useChatStore.getState().setFallbackInfo({ from: fromModel, to: toModel, reason });
        useNotificationStore.getState().addNotification({
          category: 'model-fallback',
          severity: 'warning',
          title: 'Model Fallback',
          body: `${fromModel} → ${toModel}${reason ? ': ' + reason : ''}`,
          showToast: false, // Already shown in TitleBar fallback banner
        });
        // Auto-clear after 15 seconds
        setTimeout(() => useChatStore.getState().setFallbackInfo(null), 15000);
      }
      if (data.phase === 'fallback_cleared') {
        useChatStore.getState().setFallbackInfo(null);
      }
    }

    // Non-chat events → forward to central data store (+ agent fallback for Gemini etc.)
    if (event !== 'chat') {
      if (event === 'agent') {
        const agentSessionKey = p.sessionKey || '';
        const isIsolated = agentSessionKey && (
          agentSessionKey.includes(':subagent:') || agentSessionKey.includes(':cron:')
        );

        if (!isIsolated) {
          const runId = p.runId || '';

          // ── Silent run tracking ──
          // Track lifecycle start for non-isolated sessions
          if (p.stream === 'lifecycle' && p.data?.phase === 'start' && runId) {
            this.silentRunPending.set(runId, { sessionKey: agentSessionKey });
          }

          // ── Agent thinking → ThinkingBubble display ──
          if (p.stream === 'thinking') {
            this.handleThinkingStream(p);
            // Has streaming content — not a silent run
            if (runId) this.silentRunPending.delete(runId);
          }

          // ── Agent assistant events ──
          if (p.stream === 'assistant' && typeof p.data?.text === 'string') {
            // Has streaming content — not a silent run
            if (runId) this.silentRunPending.delete(runId);

            // Fallback: display via agent events if no chat deltas arrive.
            // Check CONTINUOUSLY — if chat deltas started arriving after fallback
            // began, deactivate the fallback to prevent duplicate display.
            const recentChatDelta = Date.now() - this.lastChatDeltaTs < ChatHandler.FALLBACK_GRACE_MS;
            if (recentChatDelta && this.agentFallbackActive) {
              // Chat deltas are now active — abandon fallback, chat handler will display
              this.agentFallbackActive = false;
              this.currentStreamContent = '';
              this.currentRunId = null;
            } else if (runId && !recentChatDelta) {
              this.handleAgentAssistantFallback(p);
            }
          }

          // ── Agent lifecycle end ──
          if (p.stream === 'lifecycle' && p.data?.phase === 'end') {
            // Finalize agent fallback if active
            if (this.agentFallbackActive) {
              this.finalizeAgentFallback();
            }

            // Detect silent runs (no assistant events at all) → fetch from history
            const pending = runId ? this.silentRunPending.get(runId) : undefined;
            if (pending) {
              this.silentRunPending.delete(runId);
              this.handleSilentRunEnd(pending.sessionKey, runId);
            }
          }
        }
      }

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
    // Check if this runId is being awaited by Voice Live (responseBus).
    // If so, skip chat UI updates — Voice pipeline handles it separately.
    const isVoiceWaiter = runId ? hasPendingWaiter(runId) : false;

    switch (state) {
      case 'delta': {
        // Mark that chat deltas are active (disables agent fallback)
        this.lastChatDeltaTs = Date.now();

        // Voice Live responses: only track content, don't show in chat UI
        if (isVoiceWaiter) {
          this.currentStreamContent = messageText;
          this.currentRunId = mId;
          break;
        }

        const cleaned = stripDirectives(messageText);

        // New run detected (e.g. post-tool-call response) — reset tracking
        // Without this, the length guard below blocks shorter post-tool deltas
        // because currentStreamContent still holds the longer pre-tool content.
        if (mId !== this.currentRunId) {
          // Flush any pending content from the previous run before resetting
          this.forceFlushStream();
          this.currentStreamContent = '';
          this.currentRunId = mId;

          // ── Thinking poll fallback ──
          // Start polling for thinking content in case the Gateway doesn't
          // emit stream:"thinking" events for this chat.send response.
          // If real thinking events arrive, the poll stops automatically.
          const sk = p.sessionKey || 'agent:main:main';
          this.startThinkingPoll(mId, sk);
        }

        if (messageText.length > 0) {
          this.currentStreamContent = messageText; // Keep RAW for final processing
          // Micro-batch: buffer chunk, flush to React at most every 50ms
          this.bufferStreamChunk(mId, cleaned, media);
        }
        break;
      }

      case 'final': {
        // Stop thinking poll — finalization will capture any found thinking
        this.stopThinkingPoll();
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

        // Parse [[button:...]] markers — strip from text, store in chatStore
        const btnResult = parseButtons(finalText);
        if (btnResult.buttons.length > 0) {
          finalText = btnResult.cleanContent;
          useChatStore.getState().setQuickReplies(btnResult.buttons);
        } else {
          useChatStore.getState().setQuickReplies([]);
        }

        // Capture thinking state BEFORE onStreamEnd clears it.
        // onStreamEnd → finalizeStreamingMessage copies thinkingText into
        // message.thinkingContent and then resets thinkingText to ''.
        // We must read it first to know if streaming already captured reasoning.
        const hasThinking = useChatStore.getState().thinkingText;

        // Notify Voice Live response waiters first — if consumed, skip chat UI
        const consumed = resolveResponse(runId, finalText);
        if (!consumed) {
          this.conn.callbacks?.onStreamEnd(mId, finalText, media);

          // Post-finalization: fetch reasoning/thinking from transcript if not
          // captured via streaming or polling. Checks all sources:
          // thinkingContent field, content blocks, "Reasoning:" prefix, <think> tags.
          // Retries once with longer delay if first attempt finds nothing.
          if (!hasThinking) {
            this.fetchReasoningFromHistory(mId);
          }
        }
        break;
      }

      case 'error': {
        this.stopThinkingPoll();
        this.forceFlushStream();
        const errorText = p.errorMessage || i18n.t('errors.occurred');
        this.currentStreamContent = '';
        this.currentRunId = null;
        // If Voice waiter exists, reject it and skip chat UI
        if (isVoiceWaiter) {
          rejectResponse(runId, errorText);
        } else {
          useChatStore.getState().clearThinking();
          this.conn.callbacks?.onStreamEnd(mId, `⚠️ ${errorText}`);
          rejectResponse(runId, errorText);
        }
        break;
      }

      case 'aborted': {
        this.stopThinkingPoll();
        this.forceFlushStream();
        const finalContent = messageText || this.currentStreamContent;
        this.currentStreamContent = '';
        this.currentRunId = null;
        // If Voice waiter exists, reject it and skip chat UI
        if (isVoiceWaiter) {
          rejectResponse(runId, 'aborted');
        } else {
          useChatStore.getState().clearThinking();
          const cleaned = finalContent ? stripDirectives(finalContent) : '';
          this.conn.callbacks?.onStreamEnd(mId, cleaned || `⏹️ ${i18n.t('chat.stopped', 'Stopped')}`);
          rejectResponse(runId, 'aborted');
        }
        break;
      }

      default:
        console.log('[GW] Unknown chat state:', state);
    }
  }
}
