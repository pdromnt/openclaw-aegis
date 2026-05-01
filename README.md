<div align="center">
  <img src="https://raw.githubusercontent.com/openclaw/openclaw/main/ui/public/apple-touch-icon.png" width="96" alt="OpenClaw" />
  <h1>AEGIS</h1>
  <p><strong>The desktop client that turns your OpenClaw Gateway into a full mission control center.</strong></p>
</div>

---
[![Electron](https://img.shields.io/badge/Electron-35-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-2026.3.12+-blueviolet)](https://github.com/openclaw/openclaw)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

### About the Fork

This is a small fork made to add some small QoL that I don't intend to contribute back to the original repo due to diverging opinions. I also intend on maintaining this for anyone else except myself. If you find any issues, please don't report in the original repo.

---

## 🤔 Why AEGIS?

OpenClaw is powerful — but managing it through a terminal or basic webchat leaves a lot on the table. AEGIS gives it a proper home:

- 💬 **Chat** — streaming responses, artifacts, images, voice, in-chat search, and multi-tab sessions
- 🎤 **Voice Chat** — real-time voice conversations powered by Gemini Live with intelligent Gateway relay
- 🔘 **Smart Quick Replies** — clickable buttons when the AI needs your decision
- 📅 **Calendar** — full calendar with Cron-powered reminders delivered to Telegram, Discord, or WhatsApp
- 📊 **Analytics** — see exactly what you're spending and where, broken down by model and agent
- 🤖 **Agent Hub** — manage all your agents from a single panel
- ⏰ **Cron Monitor** — schedule and control jobs visually
- ⚙️ **Config Manager** — edit your OpenClaw configuration with Smart Merge (preserves external edits)
- 🧩 **Plugins** — modular system with 9 built-in plugins, inline rendering, and persistent state
- 🔧 **Skills & Terminal** — browse the marketplace and run shell commands without leaving the app
- 🧠 **Memory Explorer** — semantic search and CRUD for agent memories
- 📋 **Session Manager** — monitor and manage all active sessions
- 📜 **Logs Viewer** — real-time Gateway logs with filtering
- 📁 **File Manager** — browse and manage workspace files
- 🌍 **Multilingual** — Arabic (RTL), English, Spanish, and Chinese out of the box

If you run OpenClaw, AEGIS is the UI it deserves.

---

## 📸 Screenshots

### 💬 Chat
![Chat](screenshots/chat.gif)

### 🔘 Smart Quick Reply Buttons
![Quick Replies](screenshots/quick-replies.gif)

### 🔧 Skills Marketplace
![Skills](screenshots/Skills.gif)

### 💻 Integrated Terminal
![Terminal](screenshots/Terminal.gif)

### 🎤 Voice Chat
![Voice Chat](screenshots/voice%20chat.gif)

### 🧩 Plugins
![Plugins](screenshots/Plugins.gif)

### 🌑 Dark Mode
![Dark Mode](screenshots/pages-dark.gif)

### 🌕 Light Mode
![Light Mode](screenshots/pages-light.gif)

---

## ✨ Features

### 💬 Chat & Communication
- Streaming markdown with syntax highlighting and theme-aware code blocks
- Multi-tab sessions with `Ctrl+Tab` switching
- Smart Quick Reply Buttons — AI presents clickable `[[button:Label]]` chips
- In-chat search (`Ctrl+F`) with result navigation
- Image paste/drag/upload, file attachments, video playback, voice messages
- Emoji picker with search and categories
- Artifacts preview — interactive HTML, React, SVG, and Mermaid in a sandboxed window
- Virtuoso virtualized list for smooth scrolling in long conversations
- Message queue with auto-send on reconnect

### 📅 Calendar
- **Three calendar systems** — Gregorian, Hijri (Islamic Umm al-Qura), and Chinese
- Month, Week, and Day views with hour-by-hour timeline
- Add, edit, and delete events with color-coded categories (work, personal, health, social, other)
- Recurring events — daily, weekly, monthly, and yearly
- Cron-powered reminders — each event creates an OpenClaw Cron job for automatic notifications (works across all calendar systems)
- Customizable reminder timing — 5, 15, 30, 60 minutes, 2 hours, 1 day, or 1 week before the event
- Delivery channel selection — receive reminders on Telegram, Discord, WhatsApp, or last active channel
- One-shot reminders auto-delete after firing
- Offline-first — events persist in localStorage, sync with Gateway when connected
- Full multilingual support (Arabic, English, Spanish, Chinese)

### 🎤 Voice Chat
- Real-time voice conversations powered by **Gemini Live API** as a speech relay
- **`ask_aegis` function calling** — Gemini handles speech-to-text and text-to-speech, Gateway handles the intelligence
- **AudioWorklet** mic capture (PCM16 @ 16kHz) with gapless audio playback (PCM @ 24kHz)
- **Silero VAD** (Voice Activity Detection) — filters background noise, only sends real speech
- **Aura Visualizer** — animated orb with four states: idle, listening, thinking, speaking
- Dedicated settings panel — Gemini API Key, response model, voice selection, live model
- Isolated voice session — separate from text chat history
- Session timer with model info display

### 🧩 Plugins
- Modular plugin system with **9 built-in plugins**: Pixel Agents, Session Manager, Logs Viewer, Multi-Agent, File Manager, Code Interpreter, MCP Tools, Skills, Memory Explorer
- **Responsive grid layout** — 3 columns on desktop, 2 on tablet, 1 on mobile
- **Inline rendering** — plugins open inside the page without route navigation
- **Persistent state** — remembers your last opened plugin via localStorage
- Glass-card design with hover animations and glow effects

### 📊 Monitoring & Analytics
- **Dashboard** — cost, tokens, sessions, and active agents at a glance
- **Full Analytics** — date ranges, model/agent/token breakdowns, daily table, CSV export
- **Agent Hub** — create/edit/delete agents, monitor sub-agents and workers
- **Cron Monitor** — schedule, run, pause jobs with per-job activity log and templates

### ⚙️ Configuration
- **Config Manager** — visual editor for OpenClaw configuration (Providers, Agents, Channels, Advanced)
- **Smart Merge** — on save, re-reads disk and merges only your changes, preserving CLI/external edits
- **Secrets Manager** — secrets audit, providers view, and runtime reload

### 🔧 Tools
- **Skills Marketplace** — browse and search 3,286+ skills from ClawHub
- **Integrated Terminal** — PowerShell/Bash via xterm.js with multi-tab support
- **Memory Explorer** — semantic search and CRUD for agent memories

### 🎨 Interface
- Dark and light themes with full CSS variable system (`--aegis-*`)
- 6 accent colors (teal, blue, purple, rose, amber, emerald)
- 4 languages: Arabic (RTL), English (LTR), Spanish, and Chinese — with logical CSS properties
- Command Palette (`Ctrl+K`), keyboard shortcuts, global hotkey (`Alt+Space`)
- Model and reasoning level pickers in the title bar
- Lazy-loaded pages with code splitting for fast startup
- Glass morphism design with Framer Motion animations
- Ed25519 device identity with challenge-response authentication

---

## 📦 Installation

Download from [Releases](../../releases):

| File | Type |
|------|------|
| `AEGIS-Desktop-Setup-X.X.X.exe` | Windows installer |
| `AEGIS-Desktop-X.X.X.exe` | Portable (no install) |

### Requirements

- Windows 10/11 
- [OpenClaw](https://github.com/openclaw/openclaw) Gateway running locally or remotely

On first launch, you'll pair with your Gateway — a one-time setup using Ed25519 device authentication.

---

## 🔌 How It Works

AEGIS is a frontend client — it doesn't run AI or store data. Everything lives in your OpenClaw Gateway.

```
OpenClaw Gateway (local or remote)       Gemini Live API
        │                                      │
        │  WebSocket                           │  WebSocket
        ▼                                      ▼
  AEGIS ──────────────────────────────────
  ├── Chat        ← messages + streaming responses
  ├── Voice Chat  ← real-time speech via Gemini relay
  ├── Dashboard   ← sessions, cost, agent status
  ├── Calendar    ← events + Cron reminders
  ├── Analytics   ← cost summary + token history
  ├── Agent Hub   ← registered agents + workers
  ├── Cron        ← scheduled jobs
  ├── Plugins     ← modular extension system
  ├── Config      ← visual config editor
  ├── Skills      ← ClawHub marketplace
  ├── Terminal    ← shell via node-pty
  ├── Sessions    ← active session manager
  ├── Logs        ← real-time log viewer
  ├── Memory      ← semantic memory explorer
  ├── Files       ← workspace file manager
  ├── Sandbox     ← code interpreter
  ├── MCP Tools   ← tool management
  └── Settings    ← app preferences
```

---

## 🛠️ Development

```bash
npm install
npm run dev              # Electron + Vite (hot reload)
npm run dev:web          # Browser only (no Electron)
npm run build            # Production build
npm run package          # NSIS installer
npm run package:portable # Portable exe
```

---

<details>
<summary><strong>⌨️ Keyboard Shortcuts</strong></summary>

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Command Palette |
| `Ctrl+1` – `Ctrl+8` | Navigate pages |
| `Ctrl+,` | Settings |
| `Ctrl+Tab` | Switch chat tabs |
| `Ctrl+W` | Close tab |
| `Ctrl+N` | New chat |
| `Ctrl+F` | Search in chat |
| `Ctrl+R` | Refresh |
| `Alt+Space` | Show/hide window (global) |

</details>

---

## 📚 Documentation

- [Changelog](CHANGELOG.md) — version history and release notes
- [Contributing](CONTRIBUTING.md) — how to contribute
- [Security](SECURITY.md) — vulnerability reporting
- [Code of Conduct](CODE_OF_CONDUCT.md) — community guidelines

---

## 📄 License

[MIT](LICENSE)
