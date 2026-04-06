// ═══════════════════════════════════════════════════════════
// Gateway Service — Public API Facade
// Wires Connection + ChatHandler into a single interface.
// Backward-compatible with: import { gateway } from '@/services/gateway'
// ═══════════════════════════════════════════════════════════

import { GatewayConnection, type GatewayCallbacks, type ChatMessage, type MediaInfo } from './Connection';
import { ChatHandler } from './ChatHandler';
import { waitForResponse } from './responseBus';

// Re-export types for consumers
export type { ChatMessage, MediaInfo, GatewayCallbacks };

// ── Create instances ──
const connection = new GatewayConnection();
const chatHandler = new ChatHandler(connection);

// Wire event handler: Connection dispatches events to ChatHandler
connection.onEvent = (msg: any) => chatHandler.handleEvent(msg);

// ── Public API (matches original gateway.ts exactly) ──
export const gateway = {
  // Setup
  setCallbacks(cb: GatewayCallbacks) { connection.setCallbacks(cb); },

  // Connection
  connect(url: string, token: string) { connection.connect(url, token); },
  disconnect() { chatHandler.destroy(); connection.disconnect(); },
  getStatus() { return connection.getStatus(); },

  // Messaging
  async sendMessage(message: string, attachments?: any[], sessionKey = 'agent:main:main') {
    // Inject Desktop context with first message
    const finalMessage = chatHandler.injectDesktopContext(message);

    // Queue if disconnected
    if (!connection.isConnected()) {
      connection.enqueueMessage(finalMessage, attachments, sessionKey);
      return { queued: true, queueSize: connection.getQueueSize() };
    }

    // Build attachments
    const gwAttachments = attachments?.map((att) => {
      let rawBase64 = att.content || '';
      if (rawBase64.startsWith('data:')) {
        rawBase64 = rawBase64.replace(/^data:[^;]+;base64,/, '');
      }
      return {
        type: att.mimeType?.startsWith('image/') ? 'image' : 'file',
        mimeType: att.mimeType,
        content: rawBase64,
        fileName: att.fileName || 'file',
      };
    });

    return connection.request('chat.send', {
      sessionKey,
      message: finalMessage,
      idempotencyKey: `aegis-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ...(gwAttachments?.length ? { attachments: gwAttachments } : {}),
    });
  },

  // Sessions & Agents
  async getSessions() { return connection.request('sessions.list', {}); },
  async getAgents() { return connection.request('agents.list', {}); },
  async createAgent(agent: any) { return connection.request('agents.create', agent); },
  async updateAgent(agentId: string, patch: any) { return connection.request('agents.update', { agentId, ...patch }); },
  async deleteAgent(agentId: string) { return connection.request('agents.delete', { agentId }); },

  // History & Abort
  async getHistory(sessionKey: string, limit = 200) { return connection.request('chat.history', { sessionKey, limit }); },
  async abortChat(sessionKey = 'agent:main:main') { return connection.request('chat.abort', { sessionKey }); },

  // TTS via Gateway
  async speak(text: string) { return connection.request('talk.speak', { text }); },

  // Session Settings
  async setSessionModel(model: string, sessionKey = 'agent:main:main') {
    return connection.request('sessions.patch', { key: sessionKey, model });
  },
  async setSessionThinking(level: string | null, sessionKey = 'agent:main:main') {
    return connection.request('sessions.patch', { key: sessionKey, thinkingLevel: level });
  },
  async setSessionFast(enabled: boolean, sessionKey = 'agent:main:main') {
    return connection.request('sessions.patch', { key: sessionKey, fastMode: enabled });
  },
  async setSessionVerbose(level: string | null, sessionKey = 'agent:main:main') {
    return connection.request('sessions.patch', { key: sessionKey, verboseLevel: level });
  },
  async getAgentIdentity(agentId?: string) {
    return connection.request('agent.identity.get', agentId ? { agentId } : {});
  },
  async resolveExecApproval(id: string, decision: 'allow-once' | 'allow-always' | 'deny') {
    return connection.request('exec.approval.resolve', { id, decision });
  },
  async resolvePluginApproval(id: string, decision: 'allow-once' | 'allow-always' | 'deny') {
    return connection.request('plugin.approval.resolve', { id, decision });
  },
  async getConfigSchema() {
    return connection.request('config.schema', {});
  },
  async lookupConfigSchema(path: string) {
    return connection.request('config.schema.lookup', { path });
  },
  async getConfig() {
    return connection.request('config.get', {});
  },
  async applyConfig(raw: any, baseHash?: string, note?: string) {
    return connection.request('config.apply', { raw, baseHash, note });
  },
  async reloadSecrets() {
    return connection.request('secrets.reload', {});
  },
  async updateAgentParams(agentId: string, params: Record<string, any>) {
    return connection.request('agents.update', { agentId, params });
  },

  // Models & Usage
  async getSessionStatus(sessionKey = 'agent:main:main') { return connection.request('sessions.list', {}); },
  async getAvailableModels() { return connection.request('models.list', {}); },
  async call(method: string, params: any = {}) { return connection.request(method, params); },
  // Tasks
  async getTasks() { return connection.request('tasks.list', {}); },
  async getTaskDetail(lookup: string) { return connection.request('tasks.show', { lookup }); },

  // Health & Status
  async getHealth() { return connection.request('system.status', {}); },
  async getChannelsStatus() { return connection.request('channels.status', {}); },

  // Session Management
  async resetSession(sessionKey: string) { return connection.request('sessions.reset', { key: sessionKey }); },
  async deleteSession(sessionKey: string) { return connection.request('sessions.delete', { key: sessionKey }); },
  async cleanupSessions() { return connection.request('sessions.cleanup', {}); },

  async getCostSummary(days = 30) { return connection.request('usage.cost', { days }); },
  async getSessionsUsage(params: any = {}) { return connection.request('sessions.usage', { limit: 50, ...params }); },
  async getSessionTimeseries(key: string) { return connection.request('sessions.usage.timeseries', { key }); },
  async getSessionLogs(key: string, limit = 200) { return connection.request('sessions.usage.logs', { key, limit }); },

  // Voice Live: send message and wait for full streaming response
  async sendMessageAndWait(message: string, sessionKey: string, timeoutMs = 60000): Promise<string> {
    const result = await this.sendMessage(message, [], sessionKey) as any;
    const runId = result?.runId;
    if (!runId) {
      throw new Error('No runId returned from sendMessage');
    }
    return waitForResponse(runId, timeoutMs);
  },

  // Queue
  getQueueSize() { return connection.getQueueSize(); },

  // Pairing
  getHttpBaseUrl() { return connection.getHttpBaseUrl(); },
  stopPairingRetry() { connection.stopPairingRetry(); },
  async requestPairing() { return connection.requestPairing(); },
  async pollPairingStatus(deviceId: string) { return connection.pollPairingStatus(deviceId); },
  reconnectWithToken(newToken: string) { connection.reconnectWithToken(newToken); },
};
