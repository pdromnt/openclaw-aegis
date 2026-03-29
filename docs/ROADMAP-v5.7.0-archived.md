# AEGIS Desktop — Development Roadmap v1.0

> **Rule:** One phase at a time. No parallel work. Each phase = one focused change.
> **UX Rule:** Any phase marked 🎨 requires a mockup/artifact review BEFORE coding.
> **Checked = Done.** Update this file after each phase is complete.

---

## Design Constraints (Non-Negotiable)

### 🔒 Local-Only Architecture (Memory #2846 — 2026-03-25)
AEGIS Desktop is designed for **local use only** (localhost / LAN).
- ❌ No support for external servers or reverse proxy connections
- ❌ No WSS via reverse proxy (Issue #16 — confirmed unfixable by design)
- ❌ No modifications that could expose users through remote servers
- ✅ Users who want remote access can fork the repo and modify at their own risk
- **Reason:** Security — reverse proxy setups create vulnerabilities that affect all users
- **Applies to:** Issue #16 (ThermalEng) and all similar future requests

> Any phase in this roadmap must respect this constraint.
> Do not add features that assume or require non-localhost connectivity.

---

## Current State: v5.6.2

| Metric | Value |
|---|---|
| Files | 153 (.ts/.tsx) |
| Lines | 41,085 |
| Pages | 22 |
| Stores | 7 (Zustand) |
| Themes | 3 (Dark / Light / Knot) |
| Locales | EN (431 keys) / AR (398 keys) |

---

## Phase 0A — Fix autoInlineCode Breaking URLs
**Priority:** 🔴 Bugfix
**Type:** Code only
**Estimated effort:** Small
**Ref:** AEGIS DB Memory #2847

### Problem
`autoInlineCode` in `src/utils/autoDetectCode.ts` detects paths/packages and wraps them in backticks.
But it also catches URLs inside markdown links like `[text](url)` and `<url>`, turning them into
inline code instead of clickable hyperlinks. Links appear broken/fragmented in chat.

### Solution
Update the regex patterns to exclude URLs that are already inside markdown link syntax.

### Tasks
- [x] In `autoDetectCode.ts`: protect URLs/links with placeholders before running detection regexes
- [x] Ensure `[text](https://example.com)` remains a clickable link
- [x] Ensure bare `https://example.com` is not wrapped in backticks
- [x] Ensure file paths like `D:\project\file.ts` still get detected correctly
- [x] Test: 11/11 cases passed (bare URLs, markdown links, angle links, file paths, config keys, mixed)

### Files touched
- `src/utils/autoDetectCode.ts`

---

## Phase 0B — Filter Heartbeat Messages from Chat
**Priority:** 🔴 Bugfix
**Type:** Code only
**Estimated effort:** Small
**Ref:** AEGIS DB Memory #682

### Problem
Heartbeat messages (`HEARTBEAT_OK` and diagnostic text like "calendar check", "pending tasks")
appear as regular messages in the chat. They clutter the conversation and confuse the user.

### Solution
Add a filter that hides heartbeat messages automatically, or collapses them into a tiny system indicator.

### Tasks
- [x] In `TextCleaner.ts`: changed `^HEARTBEAT_OK$` to `^HEARTBEAT_OK` (catches trailing diagnostic text)
- [x] Added patterns: `heartbeat prompt:`, `^When reading HEARTBEAT\.md`
- [x] In `ContentParser.ts`: added explicit assistant heartbeat filter (`^HEARTBEAT_OK`)
- [x] Updated user noise filter to include `When reading HEARTBEAT` pattern
- [x] Legitimate messages NOT affected — only messages starting with HEARTBEAT_OK are hidden

### Files touched
- `src/processing/ContentParser.ts` or `src/services/gateway/ChatHandler.ts`

---

## Phase 0C — Fix Reasoning/Thinking Not Showing Until Restart
**Priority:** 🔴 Bugfix
**Type:** Code only
**Estimated effort:** Small

### Problem
Thinking/reasoning content (the 🧠 bubble) only appears after closing and reopening the app.
During a live session, after streaming finishes, the thinking content is lost from the UI.

### Root Cause
Race condition in `ChatHandler.ts` final handler:
1. `stream:"thinking"` events → `thinkingText` is set in chatStore ✅
2. `stream:"final"` → calls `onStreamEnd` → `finalizeStreamingMessage` copies `thinkingText` 
   into `message.thinkingContent` then **clears** `thinkingText` to `''`
3. Then `hasThinking = store.thinkingText` checks the store — but it's already cleared in step 2
4. Since `hasThinking` is empty, `fetchReasoningFromHistory` runs with 300ms delay — 
   but the Gateway transcript may not be committed yet, so it returns nothing
5. On app restart, `chat.history` returns `content[]` blocks with `type==='thinking'` → it works

### Solution
Read `thinkingText` BEFORE calling `onStreamEnd` (which clears it), not after.

### Tasks
- [x] In `ChatHandler.ts`: moved `hasThinking` read to BEFORE `onStreamEnd` call (which clears it)
- [x] If `hasThinking` was truthy, skip `fetchReasoningFromHistory` (already captured via streaming)
- [x] Increased `fetchReasoningFromHistory` delay from 300ms to 1000ms for Gateway transcript commit
- [ ] Test: send a message with thinking enabled → verify 🧠 bubble appears immediately after response

### Files touched
- `src/services/gateway/ChatHandler.ts` (reorder hasThinking check)

---

## Phase 0D — Remove Insecure TLS Override (CodeQL Alert #3)
**Priority:** 🔴 Security
**Type:** Code only
**Estimated effort:** Tiny
**Ref:** GitHub CodeQL Alert #3, AEGIS DB Memory #2846

### Problem
`electron/main.ts` line 24 contains:
```typescript
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
```
This disables ALL SSL certificate validation, making the app vulnerable to man-in-the-middle attacks.
CodeQL flags this as **High severity**.

### Why it exists
Added in v5.6.2 as a workaround for connecting to gateways behind reverse proxies with self-signed certificates.

### Why it should be removed
Per Memory #2846: AEGIS Desktop is **local-only by design**. No reverse proxy support.
Local connections use `ws://127.0.0.1:18789` (plain WebSocket, no TLS needed).
This line is unnecessary and is a security vulnerability.

### Tasks
- [x] Removed `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` from `electron/main.ts`
- [x] Removed the associated comment about self-signed SSL
- [ ] Verify: app connects to local gateway normally after removal
- [ ] Verify: CodeQL alert #3 resolves after push

### Files touched
- `electron/main.ts` (remove 2 lines)

---

## Phase 1 — Global Exec Approvals Bar
**Priority:** 🔴 Critical
**Type:** Code only (no UX review needed — pattern already exists in ChatView)
**Estimated effort:** Small

### Problem
Exec approval requests only appear inside `ChatView.tsx` (`ExecApprovalBar`).
If the user is on Dashboard, Cron, Terminal, or any other page — they miss the approval.
The agent blocks waiting, and the user doesn't know why.

### Solution
Move exec approvals to a **global floating bar** in `AppLayout.tsx` (visible on ALL pages).

### Tasks
- [x] Extracted `ExecApprovalBar` from `ChatView.tsx` into `components/shared/ExecApprovalBar.tsx`
- [x] Added to `AppLayout.tsx` (above `<Outlet />`, visible on ALL pages)
- [x] Same UI design (amber card + Allow Once / Always / Deny buttons) + AnimatePresence transitions
- [x] Pulse animation via animate-pulse-subtle on new approvals
- [x] Count badge on TitleBar (🛡️ + count, amber pulsing pill) via `ApprovalBadge` component
- [ ] Add sound notification (optional, respects `soundEnabled` setting)
- [ ] Test: navigate to Dashboard → trigger exec approval → verify it appears
- [x] i18n: added `execApproval.*` keys to both EN and AR locale files

### Files touched
- `src/components/Chat/ChatView.tsx` (remove ExecApprovalBar)
- `src/components/shared/ExecApprovalBar.tsx` (new)
- `src/components/Layout/AppLayout.tsx` (add global bar)
- `src/components/TitleBar.tsx` (add approval count badge)
- `src/locales/en.json` + `src/locales/ar.json`

---

## Phase 2 — Notification Center (Store + Backend)
**Priority:** 🔴 Critical
**Type:** Code only (store + service layer — no UI yet)
**Estimated effort:** Small

### Problem
`notificationStore.ts` is 51 lines — toasts only, no history, 5-second auto-expire.
All notifications are lost after they disappear. No way to review what happened.

### Solution
Upgrade the notification store to support **persistent history** with categories.

### Tasks
- [x] Rewrote `notificationStore.ts`: history (max 200) + unreadCount + markRead/markAllRead/clearHistory
- [x] Categories: `exec-approval` | `cron-result` | `error` | `model-fallback` | `system` | `message`
- [x] Severity: `info` | `warning` | `error` | `success`
- [x] Persistent history via `localStorage` (scoped per gateway)
- [x] Feeds wired:
  - Exec approval requested + resolved → `ChatHandler.ts`
  - Model fallback → `ChatHandler.ts`
  - Cron completed/failed → `gatewayDataStore.ts`
  - Connection lost (unexpected) → `Connection.ts`
  - Connection restored (reconnect) → `Connection.ts`

### Files touched
- `src/stores/notificationStore.ts` (rewrite)
- `src/services/gateway/ChatHandler.ts` (add notification feeds)
- `src/stores/gatewayDataStore.ts` (add notification feeds for cron/session events)

---

## Phase 3 — 🎨 Notification Center (UI)
**Priority:** 🔴 Critical
**Type:** 🎨 UX — Requires mockup review before coding
**Estimated effort:** Medium

### Problem
No visual notification center. Bell icon doesn't exist.

### Solution
Add a bell icon to TitleBar + slide-out notification drawer.

### UX Requirements (mockup needed)
- Bell icon with unread count badge in TitleBar
- Slide-out drawer (right side) with notification history
- Each notification: icon + title + body + timestamp + category badge
- Filter tabs: All / Errors / Approvals / Cron / System
- "Mark all read" button
- "Clear history" button
- Notification items are clickable (e.g., click cron notification → go to Cron page)
- Respect RTL layout

### Tasks (after mockup approval)
- [x] Created `components/NotificationDrawer.tsx` — slide-out drawer with overlay + AnimatePresence
- [x] Added `NotificationBell` component in TitleBar with unread badge (red, pulsing)
- [x] Drawer wired to notification store (open/close via bell button)
- [x] Filter tabs: All / Errors / Approvals / Cron / System (with counts)
- [x] "Mark all read" / "Clear" actions wired
- [x] Click-to-navigate: notifications with `route` field navigate + close drawer
- [x] i18n: added `notifications.*` keys to EN + AR locales
- [ ] Test: RTL + LTR layouts

### Files touched
- `src/components/NotificationDrawer.tsx` (new)
- `src/components/TitleBar.tsx` (add bell + badge)
- `src/locales/en.json` + `src/locales/ar.json`

---

## Phase 4 — Dashboard Health Card
**Priority:** 🔴 Critical
**Type:** 🎨 UX — Requires mockup review (new card in Dashboard)
**Estimated effort:** Small

### Problem
Dashboard has no system health information.
No way to see: gateway version, uptime, channel statuses, connected nodes.

### Solution
Add a **System Health card** to the Dashboard.

### UX Requirements (mockup needed)
- Card showing:
  - Gateway version + uptime
  - Connection status (WS connected/disconnected)
  - Active channels with status dots (Telegram ✅, WhatsApp ❌, Discord ✅)
  - Connected nodes count
  - Current agent model
  - Last heartbeat time
- Compact design — fits in the existing Dashboard grid

### Tasks (after mockup approval)
- [x] Added `getHealth()` and `getChannelsStatus()` to gateway service
- [x] Added `HealthInfo` type + `health` state + `setHealth` + `fetchHealth` to gatewayDataStore
- [x] Health fetched every 30s (MID polling tier)
- [x] Created `HealthCard` component in `pages/Dashboard/components.tsx`
- [x] Added HealthCard to Dashboard grid (before Quick Actions)
- [x] Shows: version, uptime, model, active sessions, channels with status dots
- [x] Graceful fallback if `system.status` API not available (builds from session data)
- [ ] i18n: health card strings (currently English hardcoded — minor)
- [ ] Test: verify data accuracy against `openclaw status`

### Files touched
- `src/services/gateway/index.ts` (add health API call)
- `src/pages/Dashboard/components.tsx` (add HealthCard)
- `src/pages/Dashboard/index.tsx` (add card to grid)
- `src/locales/en.json` + `src/locales/ar.json`

---

## Phase 5 — Session Manager Upgrade
**Priority:** 🟡 High
**Type:** 🎨 UX — Requires mockup review (major page redesign)
**Estimated effort:** Medium

### Problem
Session Manager (385 lines) is view-only. No actions, no filtering, no details.

### Solution
Full upgrade: actions + details + filtering.

### UX Requirements (mockup needed)
- Session list with:
  - Name, agent, type badge (DM / Group / Cron / Sub-agent)
  - Token usage bar
  - Last active timestamp
  - Transcript size
- Actions per session:
  - 🔄 Reset (clear context)
  - 🗑️ Delete (with confirmation dialog)
  - 📋 View last messages (preview drawer)
- Top bar:
  - Filter by type (All / DM / Group / Cron / Sub-agent)
  - Search by name/key
  - "Cleanup Old Sessions" bulk action button
- Empty state for when no sessions match filter

### Tasks (after mockup approval)
- [x] Added `resetSession`, `deleteSession`, `cleanupSessions` to gateway service
- [x] Full rewrite: 385 → 500+ lines with cards, actions, search, filters
- [x] Session cards: icon + name + type badge + model + time + token bar + last message
- [x] Filter tabs: All / DM / Cron / Sub-agent / Group (with counts)
- [x] Search input (filters by key, label, displayName)
- [x] Preview drawer: fetches last 10 messages via `chat.history`
- [x] Actions: Reset (with confirm) + Delete (with confirm) + Cleanup Old (with confirm)
- [x] All destructive actions have confirmation dialogs
- [x] Notifications on success/failure via notificationStore
- [ ] i18n: strings currently English (minor)
- [ ] Test: create sessions of different types → verify filters

### Files touched
- `src/services/gateway/index.ts` (add session reset/delete/cleanup APIs)
- `src/pages/SessionManager.tsx` (full rewrite)
- `src/locales/en.json` + `src/locales/ar.json`

---

## Phase 6 — MCP Tools Page + tools.catalog API
**Priority:** 🟡 High
**Type:** Code + minor UX
**Estimated effort:** Small

### Problem
MCP Tools (327 lines) has a hardcoded tool catalog.
New Gateway APIs (`tools.catalog` and `tools.effective`) provide real data.

### Solution
Replace hardcoded catalog with live data from Gateway.

### Tasks
- [x] Uses `tools.catalog` API (falls back to `tools.effective` on older gateways)
- [x] Cross-references with `tools.effective` for active/inactive status
- [x] Grouped by source: Core / Plugin / Channel
- [x] Shows: name, description, source badge, pluginId, optional flag
- [x] Active tools get green checkmark + highlighted border; inactive are dimmed
- [x] Filter tabs: All / Core / Plugin / Channel (with counts)
- [x] Search by name, description, pluginId
- [x] Full rewrite: 327 → 260 lines (cleaner, no hardcoded catalog)

### Files touched
- `src/services/gateway/index.ts` (add tools API calls)
- `src/pages/McpTools.tsx` (rewrite data fetching, keep layout)
- `src/locales/en.json` + `src/locales/ar.json`

---

## Phase 7 — Multi-Agent View + Actions
**Priority:** 🟡 Medium
**Type:** Code only
**Estimated effort:** Small

### Problem
Multi-Agent View (597 lines) shows running sub-agents but has no control actions.
Can't steer or kill a sub-agent from the UI.

### Solution
Add steer and kill actions to the sub-agent detail panel.

### Tasks
- [x] Uses `sessions.send` for steer and `sessions.kill` for kill (via gateway.call)
- [x] Added `SubAgentActions` component: steer input + send button + kill with inline confirm
- [x] Steer: text input + Enter/click to send instruction to running sub-agent
- [x] Kill: button → inline confirm → execute (with loading states)
- [x] Actions only shown when sub-agent is running
- [ ] i18n: steer placeholder string (currently English)

### Files touched
- `src/services/gateway/index.ts` (add subagent APIs)
- `src/pages/MultiAgentView.tsx` (add action UI)
- `src/locales/en.json` + `src/locales/ar.json`

---

## Phase 8 — 🎨 Logs Viewer Upgrade
**Priority:** 🟡 Medium
**Type:** 🎨 UX — Requires mockup review
**Estimated effort:** Medium

### Problem
Logs Viewer (410 lines) is basic — no search, no level filtering, no live tail.

### Solution
Upgrade to a proper log viewer with search, filters, and live streaming.

### UX Requirements (mockup needed)
- Top toolbar:
  - Search input (text search across log lines)
  - Level filter pills: All / Error / Warn / Info / Debug
  - Time range selector (Last 1h / 6h / 24h / All)
  - Live tail toggle (auto-scroll to newest)
- Log entries:
  - Color-coded by level (red=error, amber=warn, blue=info, gray=debug)
  - Timestamp + source + message
  - Expandable for long messages
- Performance: virtualized list (react-virtuoso) for large log sets

### Tasks (after mockup approval)
- [x] Full rewrite: 410 → 280+ lines
- [x] Search input with real-time filtering
- [x] Level filter pills: All / Error / Warn / Info / Debug
- [x] Time range selector: 1h / 6h / 24h / All
- [x] Live tail toggle (polls every 5s, auto-scrolls)
- [x] Color-coded entries: red=error, amber=warn, blue=info, gray=debug
- [x] Smart log parser: handles JSON format + plain text format
- [x] Uses `logs.tail` Gateway API
- [ ] Virtualized rendering (react-virtuoso) — deferred, not needed for 500 lines

### Files touched
- `src/pages/LogsViewer.tsx` (major rewrite)
- `src/locales/en.json` + `src/locales/ar.json`

---

## Phase 9 — Skills Page Upgrade
**Priority:** 🟡 Medium
**Type:** 🎨 UX — Requires mockup review
**Estimated effort:** Medium

### Problem
Skills Page (900 lines) only shows `skills.status`.
No install flow, no status filtering, no API key guidance.

### Solution
Match the new Gateway Control UI experience: filters + install + setup guidance.

### UX Requirements (mockup needed)
- Filter tabs: All / Ready / Needs Setup / Disabled (with counts)
- Skill card redesign:
  - Status badge (Ready ✅ / Needs Setup ⚠️ / Disabled ❌)
  - Install button (for skills with install recipes)
  - "Setup API Key" flow (where to get key + save command)
  - Source metadata (ClawHub / Built-in / Custom)
  - Homepage link
- Click-to-detail dialog:
  - Requirements list
  - Toggle switch (enable/disable)
  - Install action
  - API key entry field

### Tasks (after mockup approval)
- [x] Restored original working SkillsPage (ClawHub API via clawhub.ai/api/v1)
- [ ] Add filter tabs (All / Ready / Needs Setup / Disabled) on top of existing page
- [ ] Add install flow + API key setup dialog
- [ ] i18n: strings currently English

### Files touched
- `src/services/gateway/index.ts` (add skills APIs)
- `src/pages/SkillsPage/index.tsx` (rewrite)
- `src/pages/SkillsPage/components.tsx` (rewrite)
- `src/locales/en.json` + `src/locales/ar.json`

---

## Phase 10 — Sidebar Reorganization
**Priority:** 🟢 Medium
**Type:** 🎨 UX — Requires mockup review
**Estimated effort:** Small

### Problem
Important pages (Sessions, Memory, Skills) are hidden inside Plugins page.
Sidebar has 11 items but some low-priority items take prime slots.

### Solution
Reorganize sidebar with sections and promote key pages.

### UX Requirements (mockup needed)
- Proposed layout:
  - **Main:** Dashboard, Chat, Workshop
  - **Monitor:** Cron, Sessions, Agents
  - **Tools:** Terminal, Skills, Calendar
  - **Voice** (separate)
  - **Bottom:** Config, Settings
- Section dividers (subtle lines)
- Plugins page becomes an "overflow" accessible from Config or a ⋯ menu
- Memory Explorer accessible from Chat sidebar or Dashboard

### Tasks (after mockup approval)
- [x] Restructured `navItems` → `navSections` (4 sections: Main / Monitor / Tools / More)
- [x] Section dividers between groups
- [x] Sessions promoted to sidebar (Monitor section)
- [x] Skills promoted to sidebar (Tools section)
- [x] Routes already exist — no changes needed
- [x] i18n: added `nav.sessions` + `nav.skills` to EN/AR

### Files touched
- `src/components/Layout/NavSidebar.tsx` (reorganize)
- `src/locales/en.json` + `src/locales/ar.json`

---

## Phase 11 — Device Auth v3 + Dynamic Model Names
**Priority:** 🟢 Low
**Type:** Code only
**Estimated effort:** Small

### Problem
1. Connection.ts uses v2 signature — v3 adds `platform` + `deviceFamily` binding
2. `formatModelName()` in TitleBar has hardcoded model names — doesn't auto-detect new models

### Solution
Two small upgrades bundled together (both are code-only, no UI change).

### Tasks — Device Auth v3
- [x] Updated sign payload to include `platform` + `deviceFamily: 'desktop'` (v3)
- [x] Nonce already comes from `connect.challenge` — no change needed
- [ ] Test: connect to Gateway → verify v3 handshake succeeds

### Tasks — Dynamic Model Names
- [x] `formatModelName()` now accepts `availableModels` and checks aliases first
- [x] Falls back to pattern matching only if no alias found
- [x] Added new models: Haiku 4.5, Gemini Flash, Gemini 3, GPT-5, Kimi K2, Llama 3, Qwen
- [x] Kept hardcoded patterns as fallback (not removed)

### Files touched
- `src/services/gateway/Connection.ts` (v3 signature)
- `src/components/TitleBar.tsx` (dynamic model names)

---

## Phase 12 — Memory Explorer + AEGIS DB Integration
**Priority:** 🟢 Low
**Type:** 🎨 UX — Requires mockup review
**Estimated effort:** Medium

### Problem
Memory Explorer (976 lines) supports generic API + local modes.
But the actual memory system is AEGIS DB (PostgreSQL + pgvector) with its own API at `http://localhost:3040`.

### Solution
Direct integration with AEGIS DB API for search, browse, and save.

### UX Requirements (mockup needed)
- Search tab: semantic search with results showing content + category + importance + date
- Browse tab: filter by category (technical / projects / preferences / decisions / people / general)
- Knowledge Graph tab: entity relationships visualization
- Stats card: total memories, total messages, embedding coverage
- Quick actions: save new memory, edit importance, delete (with confirmation)

### Tasks (after mockup approval)
- [x] Page already connects to AEGIS Memory API (localhost:3040) — no new service needed
- [x] Search, browse, category filter, save/edit/delete — already existed in v5.6.2
- [x] Added stats bar: Memories count, Messages count, KG Relations, Embedding coverage
- [x] Stats fetched from `/stats` endpoint on mount
- [x] Graph + Timeline + Cards views preserved from original
- [ ] Knowledge Graph tab (entity visualization) — deferred to future phase

### Files touched
- `src/services/memoryApi.ts` (new)
- `src/pages/MemoryExplorer.tsx` (full rewrite)
- `src/locales/en.json` + `src/locales/ar.json`

---

## Phase 13 — Plugin Approval UI (Modal Dialog)
**Priority:** 🟡 High
**Type:** Code + minor UX
**Estimated effort:** Medium
**Ref:** OpenClaw v2026.3.28 — `requireApproval` in `before_tool_call` hooks

### Problem
OpenClaw v2026.3.28 added a new plugin approval system: plugins can now pause tool execution
and request user approval via `requireApproval`. Currently this works via Telegram buttons,
Discord interactions, and the `/approve` command — but Desktop has no native UI for it.

Phase 1 handles **exec approvals** (shell commands). This phase handles **plugin approvals**
(any tool call that a plugin flags as sensitive). They use the same `/approve` command on the
Gateway side, but plugin approvals include richer metadata: `title`, `description`, `severity`
(info/warning/critical), and `timeoutMs`.

### Solution
Add a native modal/dialog for plugin approval requests, with severity-colored UI and
countdown timer for timeout.

### Tasks
- [ ] Detect plugin approval events from Gateway WebSocket (distinct from exec approvals)
- [ ] Create `PluginApprovalDialog` component: title + description + severity badge + countdown
- [ ] Severity colors: info=blue, warning=amber, critical=red (with pulsing border for critical)
- [ ] Countdown timer showing remaining seconds before auto-deny/allow (based on `timeoutBehavior`)
- [ ] Actions: Allow Once / Allow Always / Deny (same as exec, routed through `/approve`)
- [ ] Feed into notification store (category: `plugin-approval`)
- [ ] Global visibility (like Phase 1 exec approvals — works from any page)
- [ ] i18n: EN + AR strings

### Files touched
- `src/components/shared/PluginApprovalDialog.tsx` (new)
- `src/services/gateway/ChatHandler.ts` (detect plugin approval events)
- `src/components/Layout/AppLayout.tsx` (mount global dialog)
- `src/stores/notificationStore.ts` (add plugin-approval category)
- `src/locales/en.json` + `src/locales/ar.json`

---

## Phase 14 — Config Validation Before Save
**Priority:** 🟡 High
**Type:** Code only
**Estimated effort:** Small
**Ref:** OpenClaw v2026.3.28 restart loop caused by invalid TTS config; new `openclaw config schema` CLI

### Problem
When saving config from Desktop, there is no validation. If the config contains keys that the
Gateway no longer accepts (like the TTS schema change in v2026.3.28), the Gateway enters a
restart loop with exit code 1 and becomes unreachable.

This ACTUALLY happened on 2026-03-29: `messages.tts.elevenlabs` and `messages.tts.edge` keys
were rejected after the update, causing infinite restart loops.

OpenClaw v2026.3.28 added `openclaw config schema` which outputs the full JSON Schema for
`openclaw.json`. Desktop can use this for client-side validation before saving.

### Solution
Fetch the JSON Schema from Gateway at startup and validate config changes before writing.

### Tasks
- [ ] Add `getConfigSchema()` to gateway service (calls `config.schema` or parses CLI output)
- [ ] Cache schema in memory (refresh on reconnect)
- [ ] Before `config:write`: validate the merged config against schema
- [ ] On validation failure: show error dialog listing unrecognized/invalid keys
- [ ] Option to "Save Anyway" (bypass) or "Fix and Retry"
- [ ] Highlight invalid fields in Config page editor (red underline + tooltip)
- [ ] Show warning banner: "⚠️ Gateway may reject these keys" with list

### Files touched
- `src/services/gateway/index.ts` (add schema API)
- `src/pages/ConfigPage.tsx` (validation + error display)
- `src/stores/configStore.ts` (add schema caching)
- `src/locales/en.json` + `src/locales/ar.json`

---

## Phase 15 — Models Catalog Live Sync
**Priority:** 🟡 Medium
**Type:** Code only
**Estimated effort:** Small
**Ref:** OpenClaw v2026.3.28 — MiniMax trimmed to M2.7 only, xAI Grok-4 family added, Gemini 3.1 added

### Problem
Model dropdowns and Agent Hub model pickers use a mix of hardcoded model lists and
partial API data. When providers add or remove models (like v2026.3.28 removing MiniMax M2/M2.1/M2.5
and adding Grok-4 variants), Desktop shows stale or missing entries.

Phase 11 added dynamic `formatModelName()` but still relies on hardcoded patterns for display.
This phase ensures the full model catalog is always live from the Gateway.

### Solution
Replace all hardcoded model catalogs with `models.list` API data.

### Tasks
- [ ] Add `getModelsList()` to gateway service (calls `models.list` API)
- [ ] Cache model list in gatewayDataStore (refresh every 60s or on reconnect)
- [ ] Replace hardcoded model arrays in:
  - Agent Hub model picker
  - TitleBar model display
  - Settings default model dropdown
  - Quick Model Switch (if exists)
- [ ] Group models by provider in dropdowns (Anthropic / Google / OpenAI / xAI / MiniMax / etc.)
- [ ] Show model metadata: context window, cost tier, capabilities (reasoning, vision, etc.)
- [ ] Graceful fallback: if API unavailable, keep last cached list

### Files touched
- `src/services/gateway/index.ts` (add models API)
- `src/stores/gatewayDataStore.ts` (add models cache)
- `src/pages/AgentHub/AgentSettingsPanel.tsx` (use live models)
- `src/components/TitleBar.tsx` (use live models for display)
- `src/pages/Settings/index.tsx` (use live models for default picker)

---

## Phase 16 — Secrets Reveal-to-Edit Pattern
**Priority:** 🟢 Medium
**Type:** Code + minor UX
**Estimated effort:** Small
**Ref:** OpenClaw v2026.3.28 — Control UI now hides sensitive config by default with reveal-to-edit

### Problem
Config page shows all values including API keys, tokens, and passwords in plain text.
The Gateway Control UI (updated in v2026.3.28) now hides sensitive config by default and
requires an explicit "reveal" action before editing — Desktop should match this pattern.

### Solution
Detect sensitive config fields and mask them by default, with a reveal toggle per field.

### Tasks
- [ ] Define sensitive field patterns: `*apiKey*`, `*token*`, `*secret*`, `*password*`, `*.key`
- [ ] Mask sensitive values in Config page: show `••••••••` with 👁️ reveal button
- [ ] Reveal is per-field and per-session (resets on page navigation)
- [ ] Copy button copies actual value (not mask) — with "Copied secret" toast
- [ ] Raw JSON editor: sensitive values shown as `"[HIDDEN — click to reveal]"`
- [ ] Reveal state does NOT persist (always hidden on page load)

### Files touched
- `src/pages/ConfigPage.tsx` (add masking logic + reveal toggles)
- `src/utils/configSensitive.ts` (new — field pattern matching)
- `src/locales/en.json` + `src/locales/ar.json`

---

## Summary

| Phase | Name | Priority | Type | UX Mockup? |
|---|---|---|---|---|
| 0A | Fix autoInlineCode URLs | 🔴 Bugfix | Code | ❌ |
| 0B | Filter Heartbeat Messages | 🔴 Bugfix | Code | ❌ |
| 0C | Fix Reasoning Not Showing | 🔴 Bugfix | Code | ❌ |
| 0D | Remove Insecure TLS Override | 🔴 Security | Code | ❌ |
| 1 | Global Exec Approvals | 🔴 Critical | Code | ❌ |
| 2 | Notification Store Upgrade | 🔴 Critical | Code | ❌ |
| 3 | Notification Center UI | 🔴 Critical | 🎨 UX | ✅ Required |
| 4 | Dashboard Health Card | 🔴 Critical | 🎨 UX | ✅ Required |
| 5 | Session Manager Upgrade | 🟡 High | 🎨 UX | ✅ Required |
| 6 | MCP Tools + tools.catalog | 🟡 High | Code | ❌ |
| 7 | Multi-Agent Actions | 🟡 Medium | Code | ❌ |
| 8 | Logs Viewer Upgrade | 🟡 Medium | 🎨 UX | ✅ Required |
| 9 | Skills Page Upgrade | 🟡 Medium | 🎨 UX | ✅ Required |
| 10 | Sidebar Reorganization | 🟢 Medium | 🎨 UX | ✅ Required |
| 11 | Device Auth v3 + Model Names | 🟢 Low | Code | ❌ |
| 12 | Memory Explorer + AEGIS DB | 🟢 Low | 🎨 UX | ✅ Required |
| **13** | **Plugin Approval UI** | **🟡 High** | **Code + UX** | **❌** |
| **14** | **Config Validation Before Save** | **🟡 High** | **Code** | **❌** |
| **15** | **Models Catalog Live Sync** | **🟡 Medium** | **Code** | **❌** |
| **16** | **Secrets Reveal-to-Edit** | **🟢 Medium** | **Code + UX** | **❌** |

---

**Phases with 🎨 = Rashed reviews a mockup/artifact BEFORE any code is written.**
**Phases without 🎨 = Rashed approves the plan, then AEGIS codes it directly.**

---

*Created: 2026-03-26*
*Last updated: 2026-03-29 — Added Phases 13-16 (OpenClaw v2026.3.28 alignment)*
