# Changelog

All notable changes to AEGIS Desktop are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/).

---

## [6.1.0] — 2026-04-06

### 🧠 Thinking & Reasoning Display

- **Thinking Bubble** — AI reasoning/thinking content now appears in chat as an expandable bubble with live timer during streaming and compact "Thought for Xs" pill after completion.
- **Multi-source extraction** — 4 fallback sources for thinking content: `thinkingContent` field, `content[]` blocks with `type === 'thinking'`, `"Reasoning:"` prefix, and `<think>` tags.
- **Stream + poll fallback** — real-time `stream:"thinking"` events with automatic 1.5s poll fallback when stream events are unavailable.
- **Forward-compatible** — sends both `reasoningLevel` and `thinkingVisibility` session patches; older Gateways silently ignore unsupported fields.

### ⚡ Exec Approvals — Fixed

- **Approvals now appear** — added missing `operator.approvals` scope and `tool-events` capability to handshake, so `exec.approval.requested` events are received.
- **Buttons now work** — fixed `exec.approvals.resolve` → `exec.approval.resolve` method name typo that caused Allow/Always/Deny to silently fail.
- **Correct ID extraction** — fixed payload parsing to read approval ID from top-level `p.id` instead of nested `req.id`.
- **Auto-cleanup** — expired approvals are automatically filtered from display and cleaned up every 10 seconds + on reconnect.

### 🔗 Gateway Connection Resilience

- **Classified close reasons** — 1008 close codes now differentiated: token mismatch, token missing, origin blocked, rate limited, or pairing required (was: all treated as pairing).
- **Auto token recovery** — on token mismatch, reads the correct token from Gateway's `openclaw.json` via IPC and reconnects automatically without user intervention.
- **Origin blocked handling** — stops retry loop and shows clear error when `controlUi.allowedOrigins` rejects the connection.
- **Rate limit backoff** — 60-second cooldown before retrying after too many failed auth attempts.

### 📋 Background Tasks Panel

- **Tasks Panel** — new collapsible panel showing active background tasks (ACP, subagent, cron, CLI) above the chat area.
- **Smart polling** — 15s refresh when tasks are active, 60s when idle. Auto-expands when tasks appear, auto-collapses when done.
- **Gateway integration** — `tasks.list` RPC + real-time `task.*` event handlers for instant status updates.
- **4 language support** — task status labels translated in en/ar/es/zh.

### 🌐 i18n Interpolation Fix

- **Fixed ~100 broken placeholders** — `{var}` → `{{var}}` across all 4 locale files (en, ar, es, zh). Affected cron timing, chat pins, code blocks, analytics, agent hub, and more.
- **More complete than PR #23** — our fix covers 24-27 replacements per file vs. PR's 19, and fixes `monthly`, `daysAgo`, `inDays` which the PR missed.

### 🔇 Notification Filtering

- **Heartbeat silence** — `HEARTBEAT_OK` and `NO_REPLY` responses no longer trigger desktop notifications when the app is minimized.

### 🔒 Security

- **Electron** updated to latest (resolves 3 CVEs including high-severity command injection).
- **lodash** updated to latest (resolves 2 CVEs).
- **0 GitHub Dependabot alerts** remaining.

### 🔧 TypeScript Cleanup

- Fixed 23 TypeScript errors across 9 files (missing `useTranslation` hooks, type mismatches, undefined properties, removed stale type imports).
- Added `readGatewayToken` to global type definitions.
- Added `platform`/`deviceFamily` to device sign params.
- Added `plugin-approval` to notification categories.
- Extended `SessionInfo` interface with `contextWindow`, `updatedAt`, `displayName`, `lastMessage`.

---

## [6.0.0] — 2026-03-29

### 🌍 Multilingual & Calendar Overhaul

- **4 Languages** — added Spanish (es) and Chinese (zh) alongside Arabic and English. All 1,363 translation keys fully covered across all four locales.
- **Three Calendar Systems** — Gregorian, Hijri (Islamic Umm al-Qura), and Chinese. Tabbed switcher with native script per system (Arabic numerals for Hijri, 中文 for Chinese). Cron reminders work identically across all systems.
- **MonthView Rewrite** — full rewrite with per-system grid generation, secondary calendar labels, month-start badges, and configurable week start day.
- **TodayCard** — new component showing today's date in all three calendar systems simultaneously.

### 🔌 Plugin Approval System

- **PluginApprovalDialog** — global approval bar visible on ALL pages (not just Chat). Shows pending plugin approval requests with severity colors (info/warning/critical), countdown timer, and Allow Once / Allow Always / Deny actions.
- **Gateway integration** — `plugin.approval.requested` WebSocket event handling with `plugin.approval.resolve` API.

### ⚙️ Config Manager Upgrades

- **Schema Validation** — configs validated against Gateway JSON Schema before save. Catches unrecognized keys and type mismatches to prevent restart loops.
- **Sensitive Field Detection** — auto-masks API keys, tokens, secrets, and passwords in the config editor.
- **Concurrent Edit Guard** — `baseHash` tracking prevents overwriting changes made by CLI or other sessions.

### 💬 Chat Improvements

- **Export Chat** — download conversation as clean Markdown document (📥 button in chat header).
- **Streaming Code Block Fix** — incomplete fenced code blocks auto-closed during streaming to prevent markdown rendering breakage.
- **Emoji Picker** — full emoji picker with search and categories in message input.
- **Message Animations** — entrance animations for recent messages (< 3 seconds old).
- **Avatar Error Handling** — graceful fallback when custom avatar URLs fail to load.

### 🤖 Agent Hub Enhancements

- **Session Overrides** — live per-session controls directly from Agent Hub. Patch model, verbose level, and other settings on active sessions without restarting.

### 📊 Analytics & Dashboard

- **DashboardChart** — lazy-loaded recharts component (~331KB) moved to separate chunk for faster initial load.
- **All Time Preset** — Analytics now properly fetches complete history for "All Time" preset instead of capping at 365 days.
- **Smarter Fetching** — preset-aware fetch parameters with proper limits (30d: 200, 90d: 500, All: 2000).

### 🔧 Model Picker

- **Context Window Display** — model dropdown now shows context window size (e.g., "1M", "200K") per model.
- **Reasoning Indicator** — 🧠 badge on models that support reasoning/thinking.
- **Alias Subtitle** — shows full model ID below the alias name for clarity.

### ⏰ Cron Monitor

- **Human-Readable Schedules** — cron expressions now display as "Daily 9:00 AM", "Every 6h", "Monthly 1st 10:00" etc. with full i18n support.
- **Better Time Ago** — "in 5m", "in 2h 30m" format for next run times.

### 🏗️ Performance & Architecture

- **Store Diffing** — `gatewayDataStore` now skips state updates when sessions/agents haven't actually changed, preventing unnecessary re-renders across all pages.
- **9 Plugins** — added Skills and Memory Explorer to the plugin system (was 8).
- **Gateway Service** — new methods: `setSessionVerbose`, `resolvePluginApproval`, `getConfigSchema`, `lookupConfigSchema`, `getConfig`, `applyConfig`, `reloadSecrets`.

### 🐛 Fixes

- **Cron Monitor** — full i18n pass; all hardcoded strings moved to locale files.
- **Full Analytics** — "This Month" preset now handles months with 31 days correctly.
- **Circular Import Warning** — `gatewayDataStore` → `chatStore` dynamic import converted to static import.

---

## [5.7.0] — 2026-03-26

### Added
- **Global Exec Approvals** — approval bar now visible on ALL pages (not just Chat). Badge in TitleBar shows pending count.
- **Notification Center** — bell icon in TitleBar with slide-out drawer. Persistent history (max 200), filter tabs (All/Errors/Approvals/Cron/System), mark read/clear.
- **Dashboard Health Card** — system health overview: Gateway version, uptime, model, active sessions, channel statuses.
- **Session Manager Upgrade** — full rewrite with search, type filters (DM/Cron/Sub-agent/Group), reset/delete/cleanup actions, message preview drawer, confirmation dialogs.
- **MCP Tools Upgrade** — powered by Gateway `tools.catalog` + `tools.effective` APIs. Grouped by source (Core/Plugin/Channel), active/inactive indicators.
- **Multi-Agent Actions** — steer (send instruction) and kill sub-agents directly from the UI.
- **Logs Viewer Upgrade** — search, level filter (Error/Warn/Info/Debug), time range selector, live tail with auto-scroll.
- **Skills Page** — card grid design for installed skills with status badges (Ready/Disabled), toggle switches, filter tabs. ClawHub marketplace preserved.
- **Sidebar Sections** — organized into Main/Monitor/Tools/More with visual dividers.
- **Memory Explorer Stats** — stats bar showing total memories, messages, KG relations, embedding coverage from AEGIS DB.
- **Device Auth v3** — signature now includes `platform` + `deviceFamily` for stronger binding.
- **Dynamic Model Names** — TitleBar checks `models.list` aliases before falling back to hardcoded patterns. Added Haiku 4.5, Gemini Flash, GPT-5, Kimi K2, Llama 3, Qwen.

### Fixed
- **autoInlineCode URLs** — URLs inside markdown links no longer broken by inline code detection. Uses placeholder protection.
- **Heartbeat messages** — filtered from chat display. `HEARTBEAT_OK` with trailing diagnostic text now hidden.
- **Reasoning/Thinking bubble** — now appears immediately after response (fixed race condition: `thinkingText` read before `onStreamEnd` clears it).
- **Gateway polling** — `sessions.usage` and `usage.cost` interval increased from 120s to 300s (these APIs take 20-60s each).

### Security
- **Removed `NODE_TLS_REJECT_UNAUTHORIZED=0`** — was disabling all SSL certificate validation. Not needed for local-only design (CodeQL Alert #3 resolved).
- **Gateway crash protection** — added `--unhandled-rejections=warn` to entrypoint to prevent Discord Carbon uncaught exceptions from killing the container.

### Changed
- **Issue #16 closed** — WSS via reverse proxy officially unsupported (local-only by design).

## [5.6.1] — 2026-03-24

### Added
- **Tool Intent View** — tool calls now visible by default with compact pill badges. Toggle button (🔧) in chat header to show/hide. Matches Gateway UI behavior.
- **Read Aloud** — "🔊 Read aloud" button on assistant messages (>50 chars) using Gateway `talk.speak` API
- **Context Usage Bar** — color-coded progress bar above input showing context consumption %. Follows accent color. Character counter appears when typing >50 chars.
- **Roundness Setting** — customize UI corner radius (Sharp/Soft/Round) in Settings. Applied across all main components (cards, bubbles, input, toasts, sidebar).
- **Knot Theme** — new black & red theme with WCAG AA contrast
- **Expand-to-Canvas** — expand long assistant messages to full-width view (⛶ button for messages >500 chars)
- **Per-Agent Thinking Defaults** — set thinking level (Off/Low/Medium/High) per agent in Agent Hub
- **Scoped Settings per Gateway** — gateway-specific settings (memory, budget, audio) don't leak between different gateway connections
- **Plugin Management** — enable/disable plugins with toggle switches and status badges
- **Auto-detect inline code** — file paths, package names, and config keys auto-wrapped in inline code for user messages
- **Auto-detect code blocks for user messages** — code detection now works on user messages too, not just assistant
- **Voice Live window controls** — minimize/maximize/close buttons visible when Voice Live covers the title bar

### Fixed
- **Reasoning/Thinking not showing** — thinking content now extracted from `content[]` blocks (matching Gateway UI), not just the `thinkingContent` field. Shows expanded by default under each reply.
- **Newlines lost in user messages** — Shift+Enter line breaks now render correctly (added `remark-breaks`)
- **Command Palette actions not firing** — slash commands from Ctrl+K now execute properly
- **Secrets Audit Badge** — no longer shows "Clean" incorrectly; checks both stdout and stderr with content-based detection
- **Config Manager overwrites CLI changes** — now uses smart 3-way merge + patch semantics instead of full overwrite
- **Config Auto-Backup** — saves last 5 versions before each config save with restore UI
- **Voice Settings header overlap** — settings panel no longer overlaps the back arrow
- **Voice Settings visualizer** — changed from card grid to dropdown menu

### Security
- **CSP Hardening** — removed `unsafe-eval` from Content-Security-Policy, added `frame-src` directive
- **Self-signed SSL support** — connections to gateways behind reverse proxies with self-signed certificates now work correctly instead of silently failing to the pairing screen

### Changed
- **Update Notification** — right-click version badge to open GitHub releases page directly. Tooltip updated with instructions.
- **Update Toast** — uses notification store directly for reliable in-app toasts
- **Models Catalog** — fetched dynamically from Gateway `models.list` API (already implemented, verified)
- **ClawHub Integration** — skill marketplace browse/install (already implemented, verified)

---

## [5.5.1] — 2026-03-10

### Added
- **Voice Chat** — real-time voice conversations powered by Gemini Live API as a speech relay. Gemini handles STT/TTS via `ask_aegis` function calling, Gateway handles the intelligence. AudioWorklet mic capture (PCM16 @ 16kHz) with gapless playback (PCM @ 24kHz). Silero VAD filters background noise. Aura visualizer with four animated states (idle, listening, thinking, speaking). Dedicated settings panel for API key, response model, voice selection. Isolated voice sessions separate from text chat.
- **Plugin System** — modular page with 8 built-in plugins (Pixel Agents, Session Manager, Logs Viewer, Multi-Agent, File Manager, Code Interpreter, MCP Tools, Analytics). Responsive grid layout, inline rendering without route navigation, persistent state via localStorage. Replaced Pixel Agents sidebar entry with Plugins (🧩).
- **Office Visualization** — virtual office page showing agents as characters working at desks in real-time (closes [#8](https://github.com/rshodoskar-star/openclaw-desktop/issues/8))
- **Code Interpreter & MCP Tools — shared history loading** — extracted `loadSessionHistory` from ChatView into chatStore as a shared action. Both pages now auto-load history on open (no need to visit Chat first). Added `getToolBlocks()` that forces tool parsing regardless of `toolIntentEnabled` setting.
- **MCP Tools — Unknown Tools section** — tools that appear in the session but aren't in the known catalog now show under "Other Active Tools" instead of being hidden
- **Cron Monitor — Delete Job** — delete button with confirmation dialog and Gateway API integration

### Fixed
- **Cron Monitor title** — changed from "Mission Control" to "Cron Monitor"
- **Dashboard title** — changed from "Mission Control" to "Dashboard"
- **Settings footer** — changed from "Mission Control" to "AEGIS Desktop"
- **Cron Monitor sort order** — latest successful run now appears at the bottom
- **Voice Chat header overlap** — back button no longer overlaps page title in both LTR and RTL layouts
- **Chat messages lost after tool calls** — post-tool-call text now appears in real-time
- **Accent Color palette** — purple, rose, and emerald colors now apply correctly
- **Chat scroll position** — conversation scrolls to bottom on app open

---

## [5.3.1] — 2026-02-23

### Fixed
- **BREAKING: Device Auth v2** — removed v1 signature fallback; Gateway 2026.2.22+ rejects v1. If no challenge nonce arrives, handshake proceeds with token-only auth instead of sending an invalid v1 signature
- **Hardcoded platform** — `'windows'` was sent to Gateway for all users; now auto-detected (`windows`/`macos`/`linux`) via `navigator.userAgent`
- **Hardcoded locale** — `'ar-SA'` was sent to Gateway for all users; now follows the app's language setting
- **Hardcoded Arabic strings** — 9 notification/label strings outside the i18n system now use translation keys, so English users see English text
- **Date/time locale** — `toLocaleTimeString('ar-SA')` hardcoded in MessageBubble and TokenDashboard; now follows app language
- **i18n fallback language** — changed from `'ar'` to `'en'` so missing translation keys fall back to English (the more complete locale)
- **i18n initial language** — detects system language on first run instead of defaulting to Arabic
- **Close code 1008** — WebSocket close with code 1008 now correctly detected as pairing-required, triggering the auto-pairing flow
- **Unreachable theme code** — theme initialization in App.tsx was placed after an early `return` statement and never executed; moved before cleanup return
- **Orphan WebSocket** — added `gateway.disconnect()` to useEffect cleanup, preventing duplicate connections on component remount
- **Installer language not applied** — selected language now flows from NSIS → main process → preload → renderer synchronously before first render
- **Duplicate language dialog** — removed redundant `MUI_LANGDLL_DISPLAY`; electron-builder handles it automatically
- **Language persistence across reinstalls** — version-aware detection respects installer language choice even with existing localStorage
- **Default language** — English is now the default; users can switch to Arabic from Settings

### Added
- **Cron delivery status** — Cron Monitor now shows separate run status and delivery status badges (Gateway 2026.2.22+ splits `lastRunStatus` from `lastDeliveryStatus`)
- **Directive tag stripping** — client-side stripping of `[[reply_to_current]]`, `[[audio_as_voice]]`, and `<<<EXTERNAL_UNTRUSTED_CONTENT>>>` from assistant messages (defense-in-depth; Gateway 2026.2.22+ strips server-side)
- **Challenge timeout** — increased from 750ms to 2s for more reliable v2 device-auth handshake on slow connections
- **Centralized version** — `src/hooks/useAppVersion.ts` exports `APP_VERSION` + `useAppVersion()` hook; version defined once in `package.json`

### Changed (i18n Audit)
- **Full i18n audit** — ~100 hardcoded strings (Arabic + English) moved to locale files across 22 source files
- **Locale keys: 278 → 431 (en), 224 → 398 (ar)** — 13 new sections: `format`, `notificationCenter`, `errors`, `code`, `media`, `thinking`, `pairing`, `settingsExtra`, `settingsTheme`, `cronDetail`, `cronTemplates`, `dashboardExtra`, `memoryExplorer`, `agentHubExtra`, `workshopExtra`, `skillsExtra`, `commandPaletteFooter`
- **format.ts** — `timeAgo()` and `formatUptime()` now use i18n
- **PairingScreen** — all `isRTL ? '...' : '...'` ternaries → `t()` calls
- **CronMonitor** — templates use `getCronTemplates(t)` instead of inline `{en, ar}` objects; all buttons/labels i18n
- **MemoryExplorer** — `CATEGORY_KEYS` with `i18nKey` pattern; all labels/empty states i18n
- **Workshop** — columns, stats, legend labels through `t()`
- **SkillsPage** — Featured, Installs, Requirements → `t()`
- **ErrorBoundary** (both) — `i18n.t()` for class components
- **NotificationCenter / TokenDashboard** — removed local `timeAgo()`, uses shared `format.ts`

---

## [5.3.0] — 2026-02-22

### Added
- **Skills Page** — browse and search 3,286+ skills from ClawHub with vector search, categories, and detail panel
- **Integrated Terminal** — PowerShell / Bash via xterm.js + node-pty, multi-tab, auto-resize, clickable links
- **Pairing UX** — auto-detects when Gateway requires pairing, shows CLI instructions with auto-retry
- **Connection Settings** — Gateway URL and Token editable in Settings (no config file needed)
- **Thinking Stream UI** — reasoning bubble for future Gateway WebSocket reasoning support

### Fixed
- **Cron Monitor** — 12 fixes: ref-based caching, batched loading, responsive grid, reduced tick interval
- **Table Overflow** — wide markdown tables scroll horizontally instead of breaking chat bubbles
- **CompactDivider** — context compaction detected from agent events instead of polling
- **CSP** — Google Fonts (IBM Plex Sans Arabic) no longer blocked
- **PTY Crash** — "Object has been destroyed" on app close resolved

---

## [5.2.1] — 2026-02-21

### Fixed
- **Command Palette i18n** — all entries translated correctly
- **Pairing error** — clearer error message + auto-detect system language

---

## [5.2.0] — 2026-02-20

### Added
- **Smart Quick Reply Buttons** — AI presents clickable chips via `[[button:Label]]` for decisions. Works with any model, no gateway config needed
- **Auto-load chat history** — conversation loads on connect (no blank screen)
- **Clean history display** — Desktop metadata stripped from user messages
- **Dynamic version** — single source of truth from `package.json`
- **Optimized system prompt** — context injection reduced ~33%

### Security
- **`webSecurity` always enabled** — Origin header rewriting replaces the old workaround of disabling Chromium web security
- **Broader Origin rewrite** — covers WS + HTTP protocols (previously WebSocket only)

### Fixed
- **Cron Monitor** — disabled/paused jobs now visible
- **Full Analytics** — `Promise.allSettled` for resilience, tiered fetching (30d → 90d → 365d), preset workflow redesign, cache bug fix, "This Month" day-31 fix, "All Time" uses server totals
- **Chat** — user messages restored in history (noise filter was over-filtering)
- Removed duplicate `call()` method in gateway client

---

## [5.1.0] — 2026-02-17

### Added
- **Dashboard** — rewritten with cost-first design, hero cards, agent panel, live sessions feed
- **Full Analytics** — 17-file suite replacing Cost Tracker (date ranges, model/agent/token breakdowns, daily table, CSV export)
- **Model Picker** — switch AI models from the title bar
- **Thinking Picker** — change reasoning level (off / low / medium / high)
- **Tool Intent View** — collapsible cards showing tool calls with params and results
- **Light Mode** — complete theme with custom palette
- **Theme System** — CSS variable architecture (`--aegis-*`), zero hardcoded colors
- **1M Context Toggle** — extended context for Anthropic API
- **`gateway.call()`** — public RPC method for direct gateway communication

### Fixed
- All hardcoded colors replaced with theme tokens
- Code blocks auto-switch between `oneLight` and `oneDark` syntax themes
- Model detection uses exact match instead of `includes()`
- Central Zustand store with smart polling intervals (10s / 30s / 120s)
- Cost Tracker removed — fully replaced by Full Analytics

---

## [5.0.0] — 2026-02-16

### Added
- **Artifacts Preview** — HTML, React, SVG, and Mermaid in a sandboxed window
- **Video playback** — inline video players for URL attachments
- **Workshop** — Kanban board manageable by AI via text commands
- **RTL/LTR overhaul** — logical CSS properties throughout

---

## [4.0.0] — 2026-02-09

### Added
- **Mission Control Dashboard** — agent monitoring and status overview
- **Bilingual UI** — Arabic (RTL) and English (LTR) with logical CSS
- **Notification Center** — bell badge, history panel, chime sound
- **Memory Explorer** — browse and search agent memories
- **Emoji Picker** — categories, search, and direction-aware positioning
- **Ed25519 device identity** — auto-generated keypair for gateway authentication
- **Challenge-response handshake** — secure WebSocket connection
