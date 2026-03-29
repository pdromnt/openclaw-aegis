# AEGIS Desktop — Development Roadmap v2.0

> **Previous:** `ROADMAP-v5.7.0-archived.md` (Phases 0A–12 completed, 13–16 carried forward)
> **Rule:** One phase at a time. No parallel work. Each phase = one focused change.
> **UX Rule:** Any phase marked 🎨 requires a mockup/artifact review BEFORE coding.
> **Checked = Done.** Update this file after each phase is complete.

---

## Design Constraints (Non-Negotiable)

### 🔒 Local-Only Architecture (Memory #2846)
AEGIS Desktop is designed for **local use only** (localhost / LAN).
- ❌ No external servers or reverse proxy connections
- ❌ No WSS via reverse proxy (Issue #16 — confirmed unfixable by design)
- ✅ Users wanting remote access can fork the repo

---

## Current State: v5.7.0

| Metric | Value |
|---|---|
| Files | 159 (.ts/.tsx) |
| Lines | 43,367 |
| Pages | 22 |
| Stores | 7 (Zustand) |
| Components | 17 Chat + 7 Shared + 2 Layout |
| Themes | 3 (Dark / Light / Knot) |
| Locales | EN + AR + ES + ZH (1,228 keys each) |
| Calendars | Gregorian + Hijri (Umm al-Qura) + Chinese Lunar |
| Config Manager | 6 tabs (Providers, Channels, Agents, Secrets, Advanced, General) |

### v5.7.0 Completed (from old roadmap)
- ✅ Bugfixes: autoInlineCode URLs, heartbeat filter, reasoning display, TLS override removal
- ✅ Global Exec Approvals Bar (all pages)
- ✅ Notification Center (store + UI + drawer + bell badge)
- ✅ Dashboard Health Card
- ✅ Session Manager (actions + filters + preview)
- ✅ MCP Tools (live tools.catalog API)
- ✅ Multi-Agent Actions (steer + kill)
- ✅ Logs Viewer (search + levels + live tail)
- ✅ Sidebar Reorganization (4 sections)
- ✅ Device Auth v3 + Dynamic Model Names
- ✅ Memory Explorer + AEGIS DB Integration

### v5.7.0 — Late Additions (28 مارس 2026)

#### 🆕 New Features
- ✅ **Spanish locale (es.json)** — 1,228 keys, full coverage
- ✅ **Chinese locale (zh.json)** — 1,228 keys, full coverage
- ✅ **Hijri calendar (أم القرى)** — always Arabic script, integrated in Calendar page
- ✅ **Chinese lunar calendar (农历)** — always Chinese characters, integrated in Calendar page
- ✅ New files: `calendarConversions.ts` (304 lines), `calendarTypes.ts` (103 lines), `CalendarSystemTabs.tsx` (81 lines)

#### 🔧 Page Improvements
- ✅ Dashboard, Chat, Workshop, Cron Monitor, Agent Hub, Full Analytics/Costs, Calendar

---

## Remaining Tasks (carried from v5.7.0)

Minor items that were deferred — not blockers, but should be cleaned up:

- [ ] Skills Page: filter tabs (Ready / Needs Setup / Disabled) + install flow + API key dialog
- [ ] Knowledge Graph tab in Memory Explorer (entity visualization)
- [ ] i18n pass: Health Card, Session Manager, Multi-Agent, Logs — some strings still English
- [ ] Virtualized rendering for Logs Viewer (react-virtuoso) — needed at scale
- [ ] Exec Approvals sound notification (optional, respects soundEnabled)
- [ ] Test pass: RTL layout in Notification Drawer, Device Auth v3 handshake

---

## Phase 1 — Plugin Approval UI
**Priority:** 🔴 Critical
**Type:** Code + minor UX
**Estimated effort:** Medium
**Ref:** OpenClaw v2026.3.28 — `requireApproval` in `before_tool_call` hooks

### Problem
OpenClaw v2026.3.28 added plugin-level approval requests (`requireApproval`).
Works via Telegram/Discord/`/approve` — but Desktop has no native UI for it.

Exec approvals (Phase 1 old) handle shell commands.
Plugin approvals handle **any tool call** flagged sensitive by a plugin — with richer metadata:
`title`, `description`, `severity` (info/warning/critical), `timeoutMs`.

### Solution
Native modal dialog with severity-colored UI and countdown timer.

### Tasks
- [ ] Detect plugin approval events from Gateway WebSocket (distinct from exec approvals)
- [ ] Create `PluginApprovalDialog`: title + description + severity badge + countdown
- [ ] Severity colors: info=blue, warning=amber, critical=red (pulsing border for critical)
- [ ] Countdown timer (seconds remaining before auto-deny/allow per `timeoutBehavior`)
- [ ] Actions: Allow Once / Allow Always / Deny (routed through `/approve`)
- [ ] Feed into notification store (category: `plugin-approval`)
- [ ] Global visibility (works from any page, like exec approvals)
- [ ] i18n: EN + AR strings

### Files
- `src/components/shared/PluginApprovalDialog.tsx` (new)
- `src/services/gateway/ChatHandler.ts` (detect events)
- `src/components/Layout/AppLayout.tsx` (mount global)
- `src/stores/notificationStore.ts` (add category)
- `src/locales/en.json` + `src/locales/ar.json`

---

## Phase 2 — Config Validation Before Save
**Priority:** 🔴 Critical
**Type:** Code only
**Estimated effort:** Small
**Ref:** OpenClaw v2026.3.28 restart loop (TTS schema); new `openclaw config schema` CLI

### Problem
Saving invalid config from Desktop → Gateway restart loop → unreachable.
**Actually happened** on 2026-03-29: `messages.tts.elevenlabs` + `messages.tts.edge` rejected.

OpenClaw v2026.3.28 added `openclaw config schema` (full JSON Schema for openclaw.json).

### Solution
Fetch JSON Schema from Gateway, validate config before writing.

### Tasks
- [ ] Add `getConfigSchema()` to gateway service (calls `config.schema` RPC)
- [ ] Cache schema in memory (refresh on reconnect)
- [ ] Before `config:write`: validate merged config against schema
- [ ] On failure: error dialog listing invalid/unrecognized keys
- [ ] "Save Anyway" (bypass) or "Fix and Retry" options
- [ ] Highlight invalid fields in editor (red underline + tooltip)
- [ ] Warning banner: "⚠️ Gateway may reject these keys"

### Files
- `src/services/gateway/index.ts` (add schema API)
- `src/pages/ConfigManager/index.tsx` (validation + error display)
- `src/stores/gatewayDataStore.ts` (schema caching)
- `src/locales/en.json` + `src/locales/ar.json`

---

## Phase 3 — Models Catalog Live Sync
**Priority:** 🟡 High
**Type:** Code only
**Estimated effort:** Small
**Ref:** OpenClaw v2026.3.28 — MiniMax trimmed, xAI Grok-4 added, Gemini 3.1 added

### Problem
Model pickers use hardcoded lists. Providers add/remove models every update.
Desktop shows stale or missing entries.

### Solution
Replace all hardcoded model catalogs with `models.list` API.

### Tasks
- [ ] Add `getModelsList()` to gateway service
- [ ] Cache in gatewayDataStore (refresh every 60s or on reconnect)
- [ ] Replace hardcoded model arrays in:
  - AgentSettingsPanel (model picker)
  - TitleBar (model display)
  - SettingsPage (default model dropdown)
- [ ] Group by provider in dropdowns
- [ ] Show metadata: context window, cost tier, capabilities (reasoning, vision)
- [ ] Graceful fallback: keep last cached list if API unavailable

### Files
- `src/services/gateway/index.ts` (models API)
- `src/stores/gatewayDataStore.ts` (models cache)
- `src/pages/AgentHub/AgentSettingsPanel.tsx`
- `src/components/TitleBar.tsx`
- `src/pages/SettingsPage.tsx`

---

## Phase 4 — Secrets Reveal-to-Edit
**Priority:** 🟡 High
**Type:** Code + minor UX
**Estimated effort:** Small
**Ref:** OpenClaw v2026.3.28 — Control UI hides sensitive config with reveal-to-edit

### Problem
Config page shows API keys/tokens in plain text. Control UI now masks them.
Desktop should match.

### Solution
Detect sensitive fields, mask by default, reveal toggle per field.

### Tasks
- [ ] Define patterns: `*apiKey*`, `*token*`, `*secret*`, `*password*`, `*.key`
- [ ] Mask values: `••••••••` with 👁️ reveal button
- [ ] Reveal is per-field, per-session (resets on navigation)
- [ ] Copy copies actual value with "Copied secret" toast
- [ ] Raw JSON editor: `"[HIDDEN — click to reveal]"`
- [ ] Reveal state never persists

### Files
- `src/pages/ConfigManager/index.tsx` (masking + toggles)
- `src/utils/configSensitive.ts` (new — pattern matching)
- `src/locales/en.json` + `src/locales/ar.json`

---

## Phase 5 — 🎨 Skills Page Full Upgrade
**Priority:** 🟡 High
**Type:** 🎨 UX — Requires mockup review
**Estimated effort:** Medium
**Ref:** Remaining from v5.7.0 Phase 9

### Problem
Skills Page has basic ClawHub listing. No filter tabs, no install flow, no API key guidance.

### Solution
Full upgrade: filters + install + setup guidance (match Gateway Control UI).

### UX Requirements (mockup needed)
- Filter tabs: All / Ready / Needs Setup / Disabled (with counts)
- Skill card: status badge, install button, "Setup API Key" flow, source metadata
- Click-to-detail: requirements, toggle, install action, API key entry

### Tasks
- [ ] Add filter tabs on top of existing page
- [ ] Install flow: calls `skills.install` API
- [ ] API key setup dialog (where to get key + save field)
- [ ] Source badges: ClawHub / Built-in / Custom
- [ ] i18n: EN + AR

### Files
- `src/pages/SkillsPage/index.tsx` (upgrade)
- `src/pages/SkillsPage/components.tsx` (upgrade)
- `src/services/gateway/index.ts` (skills install API)
- `src/locales/en.json` + `src/locales/ar.json`

---

## Phase 6 — i18n Completion Pass
**Priority:** 🟡 Medium
**Type:** Code only
**Estimated effort:** Small

### Problem
Several pages added in v5.7.0 have hardcoded English strings:
Health Card, Session Manager, Multi-Agent, Logs Viewer, MCP Tools.

Current: 1,228 keys (EN + AR synced), but ~40-50 strings are still hardcoded.

### Solution
Audit all pages, extract hardcoded strings, add to both locale files.

### Tasks
- [ ] Audit: grep for hardcoded English strings in all pages
- [ ] Extract to locale keys (grouped by page)
- [ ] Add Arabic translations
- [ ] Verify RTL layout in affected pages
- [ ] Target: 100% i18n coverage

### Files
- All page files with hardcoded strings
- `src/locales/en.json` + `src/locales/ar.json`

---

## Phase 7 — 🎨 Knowledge Graph Visualization
**Priority:** 🟢 Medium
**Type:** 🎨 UX — Requires mockup review
**Estimated effort:** Medium
**Ref:** Deferred from Memory Explorer (v5.7.0 Phase 12)

### Problem
Memory Explorer has Search, Browse, and Stats — but no entity relationship visualization.
AEGIS DB has 2,064+ Knowledge Graph relations that are invisible in the UI.

### Solution
Interactive graph visualization tab in Memory Explorer.

### UX Requirements (mockup needed)
- Force-directed graph (d3-force or similar, inline — no external deps)
- Nodes = entities (people, projects, tools, concepts)
- Edges = relationships (labeled)
- Click node → show related memories
- Search highlights path between entities
- Zoom, pan, drag nodes

### Tasks
- [ ] Add KG tab to Memory Explorer
- [ ] Fetch from AEGIS Memory API `/kg/relations` endpoint
- [ ] Render interactive graph (canvas-based for performance)
- [ ] Node click → side panel with related memories
- [ ] Search integration

### Files
- `src/pages/MemoryExplorer.tsx` (add tab + graph component)
- `src/services/memoryApi.ts` (add KG endpoints)

---

## Phase 8 — Config Auto-Backup
**Priority:** 🟢 Medium
**Type:** Code only
**Estimated effort:** Small

### Problem
No backup before config writes. A bad save can break the Gateway (as we saw with v2026.3.28).
Phase 2 adds validation, but backups add a safety net even for valid-but-wrong configs.

### Solution
Auto-save last 5 config versions before every write.

### Tasks
- [ ] Before `config:write`: save current config to `~/.openclaw/config-backups/`
- [ ] Filename: `openclaw-{timestamp}.json`
- [ ] Keep max 5 backups (delete oldest)
- [ ] Add "Restore Backup" button to Config page
- [ ] Backup list: shows timestamp + diff summary
- [ ] Restore: loads backup into editor (user reviews before saving)

### Files
- `src/services/gateway/index.ts` (backup logic)
- `src/pages/ConfigManager/index.tsx` (restore UI)
- `src/locales/en.json` + `src/locales/ar.json`

---

## Phase 9 — Performance & Stability
**Priority:** 🟢 Low
**Type:** Code only
**Estimated effort:** Small

### Problem
Minor stability issues identified during v5.7.0 development:
1. Logs Viewer needs virtualized rendering at scale (500+ lines)
2. No error boundaries on individual pages (one crash = whole app crash)

### Solution
Targeted performance fixes.

### Tasks
- [ ] Logs Viewer: add react-virtuoso for large log sets
- [ ] Add `ErrorBoundary` wrapper per-page (already have shared component)
- [ ] Audit polling intervals (some pages poll too aggressively)
- [ ] Memory leak check: verify all useEffect cleanups exist

### Files
- `src/pages/LogsViewer.tsx` (virtuoso)
- `src/components/Layout/AppLayout.tsx` (per-page ErrorBoundary)
- Various pages (polling audit)

---

## Summary

| Phase | Name | Priority | Type | Status |
|---|---|---|---|---|
| — | Remaining tasks (deferred) | — | Mixed | 🟡 6 items |
| **1** | **Plugin Approval UI** | **🔴 Critical** | Code + UX | ⬜ |
| **2** | **Config Validation Before Save** | **🔴 Critical** | Code | ⬜ |
| **3** | **Models Catalog Live Sync** | **🟡 High** | Code | ⬜ |
| **4** | **Secrets Reveal-to-Edit** | **🟡 High** | Code + UX | ⬜ |
| **5** | **Skills Page Full Upgrade** | **🟡 High** | 🎨 UX | ⬜ |
| **6** | **i18n Completion Pass** | **🟡 Medium** | Code | ⬜ |
| **7** | **Knowledge Graph Visualization** | **🟢 Medium** | 🎨 UX | ⬜ |
| **8** | **Config Auto-Backup** | **🟢 Medium** | Code | ⬜ |
| **9** | **Performance & Stability** | **🟢 Low** | Code | ⬜ |

**Total: 9 phases + 6 deferred items**

---

**Phases with 🎨 = Rashed reviews a mockup/artifact BEFORE any code is written.**
**Phases without 🎨 = Rashed approves the plan, then AEGIS codes it directly.**

---

*Created: 2026-03-29*
*Based on: OpenClaw v2026.3.28 alignment + v5.7.0 completion review*
