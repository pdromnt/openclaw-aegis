# Changelog

All notable changes to AEGIS are documented here. Only listing post-fork changes.

Format based on [Keep a Changelog](https://keepachangelog.com/).

---

## [7.1.2] — 2026-05-02

- Fix semi-broken pairing request
- Remove Claude experimental settings
- Remove memory explorer (deprecated)
- Remove "voice chat" (deprecated)
- Massive cleanup

---

## [7.1.1] — 2026-05-02

- Completely toast text truncation
- Fix typo to keep my OCD in check

---

## [7.1.0] — 2026-05-02

- Fix toast truncating text
- Fix terminal opening a new tab everytime you open the terminal page
- Fix an issue with chart rendering
- Remove PostCSS from the stack
- Fixes missing native Tailwind integration with Vite 8
- Load gateway configuration instead of local config in the Config Manager
- General code maintenance and cleanup

---

## [7.0.3] — 2026-05-01

- Fixes to the emoji picker

---

## [7.0.2] — 2026-05-01

- Fixes to update check feature (now on macOS and Windows)

---

## [7.0.1] — 2026-05-01

- Fix update check feature and redirect to our repo
- Fix small visual issues

---

## [7.0.0] — 2026-04-30

- Removed workshop functionality
- Added missing translation strings to notifications
- Fixed issue with navbar having scroll when it shouldn't
- Fixed issue with notification panel buttons being hard to click
- Updated all dependencies (Tailwind 4, React 19, Vite 8, Electron 41 and more)
- Remove prompt injection to reduce token usage
- Added macOS build target
- Renamed AEGIS Desktop -> AEGIS