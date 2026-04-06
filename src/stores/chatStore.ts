import { create } from 'zustand';
import type { RenderBlock, ToolBlock } from '@/types/RenderBlock';
import { parseHistory, parseHistoryMessage } from '@/processing/ContentParser';
import { useSettingsStore } from './settingsStore';
import { gateway } from '@/services/gateway/index';

// ═══════════════════════════════════════════════════════════
// Chat Store — Message, Session, Tabs & Usage State
// ═══════════════════════════════════════════════════════════

const MAIN_SESSION = 'agent:main:main';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'compaction';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  mediaUrl?: string;
  mediaType?: string;
  attachments?: Array<{
    mimeType: string;
    content: string;
    fileName: string;
  }>;
  // Tool call metadata (role === 'tool')
  toolName?: string;
  toolInput?: Record<string, any>;
  toolOutput?: string;
  toolStatus?: 'running' | 'done' | 'error';
  toolDurationMs?: number;
  // Thinking/reasoning content (saved after streaming completes)
  thinkingContent?: string;
}

export interface Session {
  key: string;
  label: string;
  lastMessage?: string;
  lastTimestamp?: string;
  unread?: number;
  kind?: string;
}

export interface TokenUsage {
  contextTokens: number;
  maxTokens: number;
  percentage: number;
  compactions: number;
}

interface ChatState {
  // Messages (active session)
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  updateStreamingMessage: (id: string, content: string, extra?: { mediaUrl?: string; mediaType?: string }) => void;
  finalizeStreamingMessage: (id: string, content: string, extra?: { mediaUrl?: string; mediaType?: string }) => void;
  updateMessageThinking: (id: string, thinkingContent: string) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  clearMessages: () => void;

  // Derived render data (recomputed whenever messages change)
  renderBlocks: RenderBlock[];

  // Per-session message cache
  messagesPerSession: Record<string, ChatMessage[]>;
  _blocksCache: Record<string, RenderBlock[]>;
  cacheMessagesForSession: (key: string, msgs: ChatMessage[]) => void;
  getCachedMessages: (key: string) => ChatMessage[] | undefined;

  // Sessions
  sessions: Session[];
  activeSessionKey: string;
  setSessions: (sessions: Session[]) => void;
  setActiveSession: (key: string) => void;

  // Tabs
  openTabs: string[];
  openTab: (key: string) => void;
  closeTab: (key: string) => void;
  reorderTabs: (keys: string[]) => void;

  // Token Usage
  tokenUsage: TokenUsage | null;
  setTokenUsage: (usage: TokenUsage | null) => void;

  // Current model (live from gateway)
  currentModel: string | null;
  setCurrentModel: (model: string | null) => void;

  // Manual model override — set when user picks manually, prevents polling from overwriting
  manualModelOverride: string | null;
  setManualModelOverride: (model: string | null) => void;

  // Current thinking level (live from gateway session)
  currentThinking: string | null;
  setCurrentThinking: (level: string | null) => void;
  currentFastMode: boolean;
  setCurrentFastMode: (enabled: boolean) => void;
  agentAvatarUrl: string | null;
  agentName: string | null;
  setAgentIdentity: (name: string | null, avatarUrl: string | null) => void;
  fallbackInfo: { from: string; to: string; reason?: string } | null;
  setFallbackInfo: (info: { from: string; to: string; reason?: string } | null) => void;
  execApprovals: Array<{ id: string; command: string; cwd?: string; expiresAt: number }>;
  addExecApproval: (approval: { id: string; command: string; cwd?: string; expiresAt: number }) => void;
  removeExecApproval: (id: string) => void;
  clearExpiredApprovals: () => void;
  pluginApprovals: Array<{ id: string; title: string; description: string; severity: string | null; toolName: string | null; pluginId: string | null; expiresAt: number }>;
  addPluginApproval: (approval: { id: string; title: string; description: string; severity: string | null; toolName: string | null; pluginId: string | null; expiresAt: number }) => void;
  removePluginApproval: (id: string) => void;
  pinnedMessages: Array<{ id: string; text: string; pinnedAt: number }>;
  pinMessage: (id: string, text: string) => void;
  unpinMessage: (id: string) => void;

  // Available models (fetched from gateway models.list → config.get → agents fallback)
  availableModels: Array<{ id: string; label: string; alias?: string; contextWindow?: number; reasoning?: boolean; provider?: string }>;
  setAvailableModels: (models: Array<{ id: string; label: string; alias?: string }>) => void;

  // Drafts (per-session)
  drafts: Record<string, string>;
  setDraft: (key: string, text: string) => void;
  getDraft: (key: string) => string;

  // UI State
  isTyping: boolean;
  setIsTyping: (typing: boolean) => void;
  isSending: boolean;
  setIsSending: (sending: boolean) => void;
  isLoadingHistory: boolean;
  setIsLoadingHistory: (loading: boolean) => void;
  // Called by MessageInput before first send — loads history if not yet loaded
  historyLoader: (() => Promise<void>) | null;
  setHistoryLoader: (fn: (() => Promise<void>) | null) => void;

  // History loading (shared — usable from any page, not just ChatView)
  loadSessionHistory: (sessionKey?: string) => Promise<void>;

  // Tool blocks with toolIntent forced on (for CodeInterpreter / McpTools pages)
  getToolBlocks: () => ToolBlock[];

  // Quick Replies (from [[button:...]] markers)
  quickReplies: Array<{ text: string; value: string }>;
  setQuickReplies: (buttons: Array<{ text: string; value: string }>) => void;

  // Thinking stream (live reasoning display)
  thinkingText: string;
  thinkingRunId: string | null;
  setThinkingStream: (runId: string, text: string) => void;
  clearThinking: () => void;

  // Connection
  connected: boolean;
  connecting: boolean;
  connectionError: string | null;
  setConnectionStatus: (status: { connected: boolean; connecting: boolean; error?: string }) => void;
}

// ─── Helper: recompute RenderBlock[] from current messages ───

const recomputeBlocks = (messages: ChatMessage[]): RenderBlock[] => {
  const raw = messages.map(msg => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
    toolName: msg.toolName,
    toolInput: msg.toolInput,
    toolOutput: msg.toolOutput,
    toolStatus: msg.toolStatus,
    toolDurationMs: msg.toolDurationMs,
    thinkingContent: msg.thinkingContent,
    mediaUrl: msg.mediaUrl,
    mediaType: msg.mediaType,
    attachments: msg.attachments,
    isStreaming: msg.isStreaming,
  }));

  const toolIntentEnabled = useSettingsStore.getState().toolIntentEnabled;
  return parseHistory(raw, toolIntentEnabled);
};

export const useChatStore = create<ChatState>((set, get) => ({
  // ── Messages (active session) ──
  messages: [],

  // ── Derived render data ──
  renderBlocks: [],

  addMessage: (msg) => {
    set((state) => {
      if (state.messages.some((m) => m.id === msg.id)) return state;
      const updated = [...state.messages, msg];

      // Incremental: parse only the new message, append to existing blocks
      const toolIntentEnabled = useSettingsStore.getState().toolIntentEnabled;
      const newBlocks = parseHistoryMessage({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        toolName: msg.toolName,
        toolInput: msg.toolInput,
        toolOutput: msg.toolOutput,
        toolStatus: msg.toolStatus,
        toolDurationMs: msg.toolDurationMs,
        thinkingContent: msg.thinkingContent,
        mediaUrl: msg.mediaUrl,
        mediaType: msg.mediaType,
        attachments: msg.attachments,
      }, toolIntentEnabled);

      return {
        messages: updated,
        renderBlocks: [...state.renderBlocks, ...newBlocks],
        messagesPerSession: {
          ...state.messagesPerSession,
          [state.activeSessionKey]: updated,
        },
      };
    });
  },

  updateStreamingMessage: (id, content, extra) => {
    set((state) => {
      const existingIdx = state.messages.findIndex((m) => m.id === id);
      let updated: ChatMessage[];
      if (existingIdx >= 0) {
        updated = [...state.messages];
        updated[existingIdx] = {
          ...updated[existingIdx],
          content,
          isStreaming: true,
          ...(extra?.mediaUrl ? { mediaUrl: extra.mediaUrl, mediaType: extra.mediaType } : {}),
        };
      } else {
        updated = [
          ...state.messages,
          {
            id,
            role: 'assistant' as const,
            content,
            timestamp: new Date().toISOString(),
            isStreaming: true,
            ...(extra?.mediaUrl ? { mediaUrl: extra.mediaUrl, mediaType: extra.mediaType } : {}),
          },
        ];
      }
      // Performance: directly update/append streaming block instead of full recompute
      const blocks = [...state.renderBlocks];
      const blockIdx = blocks.findIndex(b => b.id === id);
      if (blockIdx >= 0) {
        // Update existing streaming block in-place
        blocks[blockIdx] = {
          ...blocks[blockIdx],
          ...(blocks[blockIdx].type === 'message' ? { markdown: content } : {}),
          isStreaming: true,
        } as any;
      } else {
        // Append new streaming block
        blocks.push({
          type: 'message' as const,
          id,
          role: 'assistant' as const,
          markdown: content,
          artifacts: [],
          images: [],
          isStreaming: true,
          timestamp: new Date().toISOString(),
        });
      }
      return {
        messages: updated,
        renderBlocks: blocks,
        messagesPerSession: {
          ...state.messagesPerSession,
          [state.activeSessionKey]: updated,
        },
      };
    });
  },

  finalizeStreamingMessage: (id, content, extra) => {
    set((state) => {
      const existingIdx = state.messages.findIndex((m) => m.id === id);
      if (existingIdx >= 0) {
        const updated = [...state.messages];

        // Attach thinking content if available (from stream:"thinking" events
        // OR from separate Reasoning: messages intercepted in gateway.ts)
        const thinkingContent = state.thinkingText || undefined;

        updated[existingIdx] = {
          ...updated[existingIdx],
          content: content || updated[existingIdx].content,
          isStreaming: false,
          ...(extra?.mediaUrl ? { mediaUrl: extra.mediaUrl, mediaType: extra.mediaType } : {}),
          ...(thinkingContent ? { thinkingContent } : {}),
        };

        // OS notification handled in App.tsx onStreamEnd callback (single source)

        return {
          messages: updated,
          renderBlocks: recomputeBlocks(updated),
          isTyping: false,
          // Clear thinking state after attaching to message
          thinkingText: '',
          thinkingRunId: null,
          messagesPerSession: {
            ...state.messagesPerSession,
            [state.activeSessionKey]: updated,
          },
        };
      }
      // Message not found — this happens when post-tool-call text arrives
      // with a new runId that had no preceding delta events. Create a new message.
      if (content && content.trim()) {
        // Attach thinking content if available (same as existing-message branch)
        const thinkingContent = state.thinkingText || undefined;

        const newMsg: ChatMessage = {
          id,
          role: 'assistant',
          content,
          timestamp: new Date().toISOString(),
          isStreaming: false,
          ...(extra?.mediaUrl ? { mediaUrl: extra.mediaUrl, mediaType: extra.mediaType } : {}),
          ...(thinkingContent ? { thinkingContent } : {}),
        };
        const updated = [...state.messages, newMsg];
        return {
          messages: updated,
          renderBlocks: recomputeBlocks(updated),
          isTyping: false,
          // Clear thinking state after attaching to message
          thinkingText: '',
          thinkingRunId: null,
          messagesPerSession: {
            ...state.messagesPerSession,
            [state.activeSessionKey]: updated,
          },
        };
      }
      // Nothing to display — still clear thinking to prevent leakage
      return { isTyping: false, thinkingText: '', thinkingRunId: null };
    });
  },

  // Post-finalization: attach thinking content to an already-finalized message.
  // Used when reasoning is fetched from the transcript after the message was displayed.
  updateMessageThinking: (id, thinkingContent) => {
    set((state) => {
      const idx = state.messages.findIndex((m) => m.id === id);
      if (idx < 0) {
        // Message not found by exact ID — try the last assistant message
        const lastIdx = [...state.messages].reverse().findIndex((m) => m.role === 'assistant');
        if (lastIdx < 0) return {};
        const actualIdx = state.messages.length - 1 - lastIdx;
        const updated = [...state.messages];
        updated[actualIdx] = { ...updated[actualIdx], thinkingContent };
        return {
          messages: updated,
          renderBlocks: recomputeBlocks(updated),
          messagesPerSession: {
            ...state.messagesPerSession,
            [state.activeSessionKey]: updated,
          },
        };
      }
      const updated = [...state.messages];
      updated[idx] = { ...updated[idx], thinkingContent };
      return {
        messages: updated,
        renderBlocks: recomputeBlocks(updated),
        messagesPerSession: {
          ...state.messagesPerSession,
          [state.activeSessionKey]: updated,
        },
      };
    });
  },

  setMessages: (msgs) => set((state) => {
    const blocks = recomputeBlocks(msgs);
    return {
      messages: msgs,
      renderBlocks: blocks,
      messagesPerSession: {
        ...state.messagesPerSession,
        [state.activeSessionKey]: msgs,
      },
      _blocksCache: {
        ...state._blocksCache,
        [state.activeSessionKey]: blocks,
      },
    };
  }),

  clearMessages: () => set((state) => ({
    messages: [],
    renderBlocks: [],
    messagesPerSession: {
      ...state.messagesPerSession,
      [state.activeSessionKey]: [],
    },
  })),

  // ── Per-session cache ──
  messagesPerSession: {},
  _blocksCache: {},

  cacheMessagesForSession: (key, msgs) => set((state) => ({
    messagesPerSession: { ...state.messagesPerSession, [key]: msgs },
    _blocksCache: { ...state._blocksCache, [key]: recomputeBlocks(msgs) },
  })),

  getCachedMessages: (key) => get().messagesPerSession[key],

  // ── Sessions ──
  sessions: [{ key: MAIN_SESSION, label: 'Main Session' }],
  activeSessionKey: MAIN_SESSION,

  setSessions: (sessions) => set({ sessions }),

  setActiveSession: (key) => {
    const state = get();
    const msgs = state.messagesPerSession[key] || [];
    const blocks = state._blocksCache[key];
    set({
      activeSessionKey: key,
      messages: msgs,
      renderBlocks: blocks || recomputeBlocks(msgs),
      isTyping: false,
    });
  },

  // ── Tabs ──
  openTabs: [MAIN_SESSION],

  openTab: (key) => set((state) => {
    if (state.openTabs.includes(key)) {
      const cached = state.messagesPerSession[key] || [];
      const blocks = state._blocksCache[key];
      return {
        activeSessionKey: key,
        messages: cached,
        renderBlocks: blocks || recomputeBlocks(cached),
        isTyping: false,
      };
    }
    const msgs = state.messagesPerSession[key] || [];
    const blocks = state._blocksCache[key];
    return {
      openTabs: [...state.openTabs, key],
      activeSessionKey: key,
      messages: msgs,
      renderBlocks: blocks || recomputeBlocks(msgs),
      isTyping: false,
    };
  }),

  closeTab: (key) => set((state) => {
    // Can't close main session
    if (key === MAIN_SESSION) return state;
    const newTabs = state.openTabs.filter((t) => t !== key);
    if (newTabs.length === 0) newTabs.push(MAIN_SESSION);
    // If closing active tab, switch to last tab or main
    const newActive = state.activeSessionKey === key
      ? newTabs[newTabs.length - 1]
      : state.activeSessionKey;
    const msgs = state.messagesPerSession[newActive] || [];
    const blocks = state._blocksCache[newActive];
    return {
      openTabs: newTabs,
      activeSessionKey: newActive,
      messages: msgs,
      renderBlocks: blocks || recomputeBlocks(msgs),
      isTyping: false,
    };
  }),

  reorderTabs: (keys) => set({ openTabs: keys }),

  // ── Token Usage ──
  tokenUsage: null,
  setTokenUsage: (usage) => set({ tokenUsage: usage }),
  currentModel: null,
  setCurrentModel: (model) => set({ currentModel: model }),
  manualModelOverride: null,
  setManualModelOverride: (model) => set({ manualModelOverride: model, currentModel: model }),
  currentThinking: null,
  setCurrentThinking: (level) => set({ currentThinking: level }),
  currentFastMode: false,
  setCurrentFastMode: (enabled) => set({ currentFastMode: enabled }),
  agentAvatarUrl: null,
  agentName: null,
  setAgentIdentity: (name, avatarUrl) => set({ agentName: name, agentAvatarUrl: avatarUrl }),
  fallbackInfo: null,
  setFallbackInfo: (info) => set({ fallbackInfo: info }),
  execApprovals: [],
  addExecApproval: (approval) => set((s) => ({
    execApprovals: [...s.execApprovals.filter(a => a.id !== approval.id && a.expiresAt > Date.now()), approval]
  })),
  removeExecApproval: (id) => set((s) => ({
    execApprovals: s.execApprovals.filter(a => a.id !== id)
  })),
  clearExpiredApprovals: () => set((s) => {
    const now = Date.now();
    return {
      execApprovals: s.execApprovals.filter(a => a.expiresAt > now),
      pluginApprovals: s.pluginApprovals.filter(a => a.expiresAt > now),
    };
  }),
  pluginApprovals: [],
  addPluginApproval: (approval) => set((s) => ({
    pluginApprovals: [...s.pluginApprovals.filter(a => a.id !== approval.id && a.expiresAt > Date.now()), approval]
  })),
  removePluginApproval: (id) => set((s) => ({
    pluginApprovals: s.pluginApprovals.filter(a => a.id !== id)
  })),
  pinnedMessages: JSON.parse(localStorage.getItem('aegis-pinned-messages') || '[]'),
  pinMessage: (id, text) => set((s) => {
    const preview = text.replace(/[#*`_~>\[\]]/g, '').slice(0, 120);
    const next = [...s.pinnedMessages.filter(p => p.id !== id), { id, text: preview, pinnedAt: Date.now() }];
    localStorage.setItem('aegis-pinned-messages', JSON.stringify(next));
    return { pinnedMessages: next };
  }),
  unpinMessage: (id) => set((s) => {
    const next = s.pinnedMessages.filter(p => p.id !== id);
    localStorage.setItem('aegis-pinned-messages', JSON.stringify(next));
    return { pinnedMessages: next };
  }),

  // ── Available Models ──
  availableModels: [],
  setAvailableModels: (models) => set({ availableModels: models }),

  // ── UI State ──
  isTyping: false,
  setIsTyping: (typing) => set({ isTyping: typing }),
  isSending: false,
  setIsSending: (sending) => set({ isSending: sending }),
  isLoadingHistory: false,
  setIsLoadingHistory: (loading) => set({ isLoadingHistory: loading }),
  historyLoader: null,
  setHistoryLoader: (fn) => set({ historyLoader: fn }),

  // ── Drafts ──
  drafts: {},
  setDraft: (key, text) => set((state) => ({ drafts: { ...state.drafts, [key]: text } })),
  getDraft: (key) => get().drafts[key] || '',

  // ── History Loading (shared across pages) ──
  loadSessionHistory: async (sessionKey?: string) => {
    const state = get();
    const key = sessionKey || state.activeSessionKey;

    // Use cache if available
    const cached = state.messagesPerSession[key];
    if (cached && cached.length > 0) {
      if (key === state.activeSessionKey && state.messages.length === 0) {
        set({
          messages: cached,
          renderBlocks: state._blocksCache[key] || recomputeBlocks(cached),
        });
      }
      return;
    }

    set({ isLoadingHistory: true });
    try {
      const result = await gateway.getHistory(key, 200);
      const rawMessages = Array.isArray(result?.messages) ? result.messages : [];

      const messages: ChatMessage[] = rawMessages.map((msg: any) => ({
        id: msg.id || msg.messageId || `hist-${crypto.randomUUID()}`,
        role: msg.role || 'unknown',
        content: msg.content,
        timestamp: msg.timestamp || msg.createdAt || new Date().toISOString(),
        mediaUrl: msg.mediaUrl || undefined,
        mediaType: msg.mediaType || undefined,
        attachments: msg.attachments,
        toolName: msg.toolName || msg.name,
        toolInput: msg.toolInput || msg.input,
        toolCallId: msg.toolCallId || msg.tool_call_id,
        thinkingContent: msg.thinkingContent,
      }));

      // Update store: set messages for active session, cache for any session
      const blocks = recomputeBlocks(messages);
      const update: Partial<ChatState> = {
        messagesPerSession: { ...get().messagesPerSession, [key]: messages },
        _blocksCache: { ...get()._blocksCache, [key]: blocks },
      };
      if (key === get().activeSessionKey) {
        update.messages = messages;
        update.renderBlocks = blocks;
      }
      set(update as any);
    } catch (err) {
      console.error('[chatStore] loadSessionHistory failed:', err);
    } finally {
      set({ isLoadingHistory: false });
    }
  },

  // ── Tool Blocks (always includes tools, ignores toolIntentEnabled) ──
  getToolBlocks: (): ToolBlock[] => {
    const state = get();
    const raw = state.messages.map(msg => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      toolName: msg.toolName,
      toolInput: msg.toolInput,
      toolOutput: msg.toolOutput,
      toolStatus: msg.toolStatus,
      toolDurationMs: msg.toolDurationMs,
      thinkingContent: msg.thinkingContent,
      mediaUrl: msg.mediaUrl,
      mediaType: msg.mediaType,
      attachments: msg.attachments,
      isStreaming: msg.isStreaming,
    }));
    // Force toolIntentEnabled = true so tool blocks are always parsed
    const allBlocks = parseHistory(raw, true);
    return allBlocks.filter((b): b is ToolBlock => b.type === 'tool');
  },

  // ── Quick Replies ──
  quickReplies: [],
  setQuickReplies: (buttons) => set({ quickReplies: buttons }),

  // ── Thinking Stream ──
  thinkingText: '',
  thinkingRunId: null,
  setThinkingStream: (runId, text) => set({ thinkingRunId: runId, thinkingText: text }),
  clearThinking: () => set({ thinkingText: '', thinkingRunId: null }),

  // ── Connection ──
  connected: false,
  connecting: false,
  connectionError: null,

  setConnectionStatus: (status) =>
    set({
      connected: status.connected,
      connecting: status.connecting,
      connectionError: status.error || null,
    }),
}));
