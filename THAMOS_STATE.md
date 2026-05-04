# ThamOS v6 — Project State & Sprint Tracker

> **Last Updated:** 2026-05-04 by Kimi Code CLI (Desktop UI/UX Audit + Documentation Sprint)
> 
> **Purpose:** This document tracks the current state of ThamOS v6, documents completed work, pending features, known bugs, and UI/UX audit findings. Any agent starting cold on this project should read this file **after** `ARCHITECTURE.md`, `ARCHITECTURE_V2.md`, and `MODULAR_GUIDE.md` to understand what has been done and what remains.

---

## Table of Contents
1. [Interface Overview](#interface-overview)
2. [UI/UX Audit Findings](#uiux-audit-findings)
3. [Completed Features](#completed-features)
4. [Pending Work (Prioritized)](#pending-work-prioritized)
5. [Known Bugs](#known-bugs)
6. [Sprint Log](#sprint-log)
7. [Agent Operating Notes](#agent-operating-notes)

---

## Interface Overview

ThamOS v6 has **four themes/interfaces**, not two as documented in the stale architecture guides:

| Theme | Location | Status | Description |
|-------|----------|--------|-------------|
| **Tactical** | `src/components/Layout.tsx` | ✅ Stable | Modern card-based GUI. Default theme. |
| **Terminal** | `src/components/terminallayout.tsx` | ✅ Stable | Retro CLI with `scan` commands, flags, history. |
| **Desktop** | `src/components/desktop/` | ✅ Active / Most Complete | Full windowed OS environment. **Currently the primary active theme at t6.thamOS.ca.** |
| **Mission Control** | `src/contexts/themecontext.tsx` | ⚠️ Stub | Exists in theme type but minimal implementation. |

**The architecture docs (`ARCHITECTURE.md`, `ARCHITECTURE_V2.md`, `MODULAR_GUIDE.md`) are stale** — they only document Tactical and Terminal modes. The Desktop theme is entirely absent from documentation until this audit.

---

## UI/UX Audit Findings

> **Audited by:** Kimi Code CLI, 2026-05-04
> **Benchmark:** Ubuntu Tour (malisipi/ubuntu-tour), WebVM 2.0, general desktop OS realism standards
> **Method:** Deep code review of `src/components/desktop/*`, `src/contexts/DesktopContext.tsx`, `src/design-system/*`, live functionality assessment.

### Grades

| Category | Grade | Notes |
|----------|-------|-------|
| **UX Polish** | B+ | Excellent snap previews, hover traffic lights, glassmorphism, context menus everywhere. Missing minimize animations, window dimensions in title bar are dev-facing clutter. |
| **Visual Hierarchy** | B | Great color system (`tokens.ts`), elevation layers, active/inactive differentiation. **Crippled by emoji icons.** Static unchangeable wallpaper. |
| **Window Management** | A- | 8-direction resize, snap-to-edge (top/left/right/corners), cascading open, z-index stack, pinned windows, layout persistence, Ctrl+Arrow tiling. No Mission Control/Exposé view, no split-view sync. |
| **Animations** | B+ | Spring window-open, launcher scale-in, workspace flash, boot fade-ins. **No minimize/maximize transitions** — instant snap. No window shake on error. |
| **Iconography** | D+ | **All app icons are Unicode emojis** (`⌘`, `🔍`, `🌐`, `📝`, `⚙️`). Renders inconsistently across OSes. No unified SVG set. **#1 visual blocker.** |
| **Terminal Authenticity** | A | Custom CLI (22 commands + tab completion + history) AND real `xterm.js` VPS terminal with WebSocket/Cloudflare Tunnel. Best-in-class for browser OS. |
| **Taskbar Behavior** | B+ | Launcher, 4 workspaces with dots, window list, agent status dots, notification bell with unread badge, live clock. Missing window grouping, jump lists, volume/network/battery tray icons. |
| **Workspace Switching** | B+ | 4 desks, Ctrl+1-4, pinned windows跨workspaces, flash indicator. No workspace thumbnails/previews, no drag-to-move between workspaces. |
| **System Tray Realism** | C+ | Agent dots + bell + clock. No volume, network, battery, calendar popover. No Do Not Disturb. |

### Critical Issues (Fix First)

1. **Emoji Iconography** — Replace all 12 app icons in `appRegistry.ts` with custom SVGs. This is the highest-ROI visual fix.
2. **Minimize/Maximize Animations** — Windows snap instantly. Add 200ms CSS scale/translate transitions.
3. **Wallpaper Customization** — Background is hardcoded gradient in `DesktopLayout.tsx`. Add wallpaper picker + 3-4 options.
4. **Remove Pixel Dimensions from Title Bar** — `900x600` in `DesktopWindow.tsx` title bar is developer clutter.

### High Priority Issues

5. **Mission Control / Window Overview** — No way to see all windows at once.
6. **Desktop Icon Drag-and-Drop** — Icons are fixed top-left grid. Users expect to rearrange.
7. **Taskbar Window Grouping** — 3 terminals = 3 buttons. Group by app + expand on hover.
8. **Calendar Popover on Clock Click** — Standard OS behavior, easy win.
9. **Desktop-Styled Result Pages** — Tactical `IPResult`/`URLResult` reused in desktop windows look visually inconsistent.
10. **True Window Transparency / Acrylic** — `backdropFilter: blur(24px)` with solid bg. Let wallpaper bleed through.

### Medium Priority Issues

11. System tray expansion (volume, network, battery mocks).
12. Browser renders real web pages (currently `thamos://` only).
13. Notification badges on app icons.
14. Window snap divider sync (resize one snapped window, neighbor adjusts).
15. Screensaver / lock screen.
16. **Dead code cleanup** — `src/components/DesktopLayout.tsx` (old monolithic 561-line version) is unused.
17. **Update architecture docs** — They don't mention Desktop or Mission Control.

### Bugs Found During Audit

- `extension-result` handled in `renderWindowContent` but **missing from `AppId` type** in `DesktopContext.tsx`.
- `src/components/DesktopLayout.tsx` (old) is **dead code** — superseded by `src/components/desktop/DesktopLayout.tsx`.
- Architecture docs are **100% silent** on Desktop theme and `mission-control` theme.

---

## Completed Features

### Desktop Theme (Completed)
- [x] Window manager with create/focus/minimize/maximize/restore/close
- [x] 8-direction resize handles
- [x] Snap-to-edge (top=maximize, left/right=half, corners=quarter) with live preview overlay
- [x] 4 virtual workspaces with pinned window support
- [x] Layout auto-save/restore to `localStorage` (500ms debounced)
- [x] macOS-style traffic lights with hover icons (×, −, □)
- [x] Active/inactive window differentiation (glow border + opacity)
- [x] Desktop icons (top-left grid, double-click open, right-click menu)
- [x] App Launcher (search, categories, keyboard navigation, spring animation)
- [x] Spotlight Search (Ctrl+K, app search, IOC auto-detect, recent history)
- [x] Boot Sequence (typing effect, scanlines, progress bar, 27 themed messages)
- [x] Taskbar (workspaces, window list, agent dots, notifications, clock)
- [x] Notification Center (toast system with history, severity levels, timestamps)
- [x] Context Menu system (desktop, title bar, taskbar, icons)
- [x] Keyboard shortcuts (Ctrl+W close, Ctrl+Shift+T reopen, Ctrl+Tab cycle, Ctrl+` focus terminal, Ctrl+1-4 workspaces, Ctrl+Arrow tile, Ctrl+D show desktop, ? help)
- [x] 11 functional desktop apps (Terminal, VPS Terminal, Scanner, Browser, Maestro, Intel Dashboard, Case Manager, File Manager/GitHub, Code Editor, System Monitor, Settings)

### Tactical Theme (Completed)
- [x] All threat intel pages (IP, URL, Domain, Hash, Extension lookups)
- [x] Unified Scanner with auto-detect
- [x] Smart IOC Intake with verdict classification
- [x] Case Notes, History, News Feed with watchlist alerts
- [x] Admin Panel with user management
- [x] Settings with API key management

### Terminal Theme (Completed)
- [x] CLI commands (`scan`, `help`, `status`, `history`, `clear`, `startx`/`killx`)
- [x] CLI flags system (`--verbose`, `--threats`, `--network`, etc.)
- [x] Command history with Up/Down arrows
- [x] Terminal-specific result pages

---

## Pending Work (Prioritized)

### 🔴 Critical (Do First)
- [x] **Replace emoji icons with SVG icon set** (`src/design-system/icons.tsx` + `appRegistry.ts`) ✅ 2026-05-04
- [x] **Add minimize/maximize CSS animations** (`src/components/desktop/DesktopWindow.tsx`) ✅ 2026-05-04
- [x] **Add wallpaper picker + multiple wallpapers** (`src/design-system/wallpapers.ts` + `DesktopLayout.tsx` + `DesktopSettings.tsx`) ✅ 2026-05-04
- [x] **Remove window pixel dimensions from title bar** (`src/components/desktop/DesktopWindow.tsx`) ✅ 2026-05-04
- [x] **Fix `extension-result` missing from `AppId` type** (`src/contexts/DesktopContext.tsx`) ✅ 2026-05-04
- [x] **Delete dead code** `src/components/DesktopLayout.tsx` (old monolithic version) ✅ 2026-05-04

### 🟡 High Priority
- [ ] **Build Mission Control / window overview overlay** (all windows + workspaces visible)
- [ ] **Make desktop icons draggable** (`src/components/desktop/DesktopIcons.tsx`)
- [ ] **Add window grouping to taskbar** (`src/components/desktop/Taskbar.tsx`)
- [ ] **Add calendar popover on clock click** (`src/components/desktop/DesktopClock.tsx` + `Taskbar.tsx`)
- [ ] **Build desktop-styled result wrappers** (`DesktopIPResult`, `DesktopURLResult`, etc.)
- [ ] **Add window transparency / acrylic effect** (let wallpaper bleed through)
- [ ] **Update all architecture docs** to include Desktop and Mission Control themes

### 🟢 Medium Priority
- [ ] System tray expansion: volume, network, battery status icons
- [ ] Browser: real web page rendering via sandboxed iframe
- [ ] Notification badges on desktop app icons
- [ ] Snap divider sync (resize one snapped window, neighbor adjusts)
- [ ] Screensaver / lock screen
- [ ] Workspace thumbnails/previews
- [ ] Drag-to-move windows between workspaces
- [ ] Boot sequence re-trigger command (e.g., `reboot` in terminal)
- [ ] Full-screen mode for individual apps
- [ ] PWA support + mobile responsiveness for Desktop theme

### 🔵 Low Priority / Nice to Have
- [ ] Diffing tool (compare two lookups side-by-side)
- [ ] Network graph for related IOCs
- [ ] Geographic map for IP sources
- [ ] STIX/TAXII integration
- [ ] Browser extension for right-click IOC lookup
- [ ] Natural language queries via AI

---

## Known Bugs

| # | Bug | Location | Severity | Fix Strategy |
|---|-----|----------|----------|--------------|
| 1 | `extension-result` missing from `AppId` union type | `src/contexts/DesktopContext.tsx:4-19` | Medium | Add `'extension-result'` to `AppId` type |
| 2 | Old `DesktopLayout.tsx` is dead code | `src/components/DesktopLayout.tsx` | Low | Delete file after confirming no imports |
| 3 | Architecture docs don't mention Desktop/Mission Control | `ARCHITECTURE.md`, `ARCHITECTURE_V2.md`, `MODULAR_GUIDE.md` | Medium | Update docs (in progress via this sprint) |
| 4 | Desktop reuses Tactical result pages | `src/components/desktop/DesktopLayout.tsx:433-476` | Medium | Build `DesktopIPResult`, `DesktopURLResult`, etc. |
| 5 | Hash lookup may be broken/placeholder | `src/pages/results/HashResult.tsx` | High | Per `ARCHITECTURE_V2.md`, needs verification |
| 6 | Domain lookup may be incomplete | `src/pages/results/DomainResult.tsx` | Medium | Per `ARCHITECTURE_V2.md`, needs verification |

---

## Sprint Log

### Sprint 2026-05-04 — UI/UX Audit & Documentation
**Agent:** Kimi Code CLI
**Scope:** Frontend-focused audit of Desktop theme. No backend/Supabase changes.

**Completed:**
- Deep audit of entire Desktop theme codebase (`src/components/desktop/*`, `DesktopContext.tsx`, `appRegistry.ts`, `tokens.ts`)
- Graded 9 categories of UI/UX realism against browser-OS benchmarks
- Identified 4 critical issues, 8 high-priority issues, 10 medium-priority issues
- Found 3 bugs during audit (`extension-result` type missing, dead code, stale docs)
- Created `THAMOS_STATE.md` (this document)
- Created `AGENTS.md` operational standards
- Updated `ARCHITECTURE.md` to include Desktop and Mission Control themes
- Updated `ARCHITECTURE_V2.md` to include Desktop architecture
- Updated `MODULAR_GUIDE.md` to include Desktop module

**Decisions Made:**
- Prioritized iconography replacement as #1 visual fix (highest ROI)
- Documented Desktop theme as the most complete of the four themes
- Mission Control theme exists as a stub; documented but not prioritized

### Sprint 2026-05-04 — Desktop Critical Polish
**Agent:** Kimi Code CLI
**Scope:** All 4 critical UX/UI issues from audit + 2 bugs

**Completed:**
- Built custom SVG icon set (12 outline-style icons in `src/design-system/icons.tsx`)
- Replaced all emoji icons across appRegistry, DesktopIcons, Taskbar, Window chrome, AppLauncher, Spotlight
- Added minimize animation (scale+fade, 200ms) and maximize/restore transitions (250ms position/size)
- Built wallpaper system (`src/design-system/wallpapers.ts`) with 6 CSS wallpapers + preview swatches
- Added wallpaper picker to Settings > Appearance with live update via custom event
- Removed pixel dimensions from window title bar
- Fixed `extension-result` missing from `AppId` union type
- Deleted dead code `src/components/DesktopLayout.tsx` (old monolithic version)
- Committed and pushed to GitHub (hdcsnags/thamos6.git)

**Decisions Made:**
- Icons stored as `React.FC<IconProps>` in registry (not rendered nodes) so each consumer can set its own size
- Wallpaper system uses CSS-only backgrounds (no image assets needed) for zero bundle impact
- Custom event `thamos:wallpaper-changed` used for cross-component wallpaper sync without prop drilling

**Next Sprint Candidates:**
1. Mission Control overlay + desktop icon drag-and-drop
2. Desktop-styled result pages (IPResult/URLResult wrappers)
3. System tray expansion (volume, network, battery)

---

**Next Sprint Candidates:**
1. Mission Control overlay + desktop icon drag-and-drop (Week 2 features)
2. Desktop-styled result pages + system tray expansion (Week 3 integration)

---

## Agent Operating Notes

### For New Agents Starting Cold

1. **Read in this order:**
   - `ARCHITECTURE.md` (system overview)
   - `ARCHITECTURE_V2.md` (V2 scanner architecture)
   - `MODULAR_GUIDE.md` (module breakdown)
   - `THAMOS_STATE.md` (this file — current state & audit)
   - `AGENTS.md` (operational standards)

2. **Four themes exist**, not two. Desktop is the most complete and currently active.

3. **Before modifying Desktop theme components**, check `src/design-system/tokens.ts` and `src/design-system/appRegistry.ts` — these are the source of truth for colors, typography, and app metadata.

4. **The `DesktopContext` is the window manager.** Any window lifecycle changes go through it.

5. **When you complete a code sprint**, append a new entry to the **Sprint Log** section above with:
   - Date, agent name, scope
   - What was completed
   - Any architectural decisions made
   - What was intentionally deferred

6. **Do not modify architecture docs without updating `THAMOS_STATE.md`** to reflect the change.

7. **Dead code to avoid:** `src/components/DesktopLayout.tsx` (old monolithic version). Use `src/components/desktop/DesktopLayout.tsx` instead.
