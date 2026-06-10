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
5. [Integration Roadmap](#integration-roadmap)
6. [Known Bugs](#known-bugs)
7. [Sprint Log](#sprint-log)
8. [Agent Operating Notes](#agent-operating-notes)

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

## Integration Roadmap

> See **`INTEGRATION_ROADMAP.md`** for the complete feasibility analysis and phased implementation plan.
> 
> **Summary:** Integration with TopDesk (ticketing), Entra ID (remediation), Sentinel (SIEM/playbooks), and Defender (email investigation) is **technically feasible**. TopDesk and Entra are the highest-ROI, lowest-effort integrations. Email deep-link analysis is the most complex.

### 🔴 Phase 1 — TopDesk + Entra Guard (High Priority)
- [ ] **TopDesk Desktop app** — Search incidents by UPN, deduplication, enrichment, close/update
- [ ] **Entra Guard Desktop app** — Revoke sessions, force password reset, view sign-in logs, disable account
- [ ] **Analyst API credential storage** — Encrypted `analyst_api_credentials` table in Supabase
- [ ] **Supabase Edge Functions** — `topdesk/*`, `entra/*`
- [ ] **Settings panel expansion** — API key/config forms for TopDesk and Entra

### 🟡 Phase 2 — Sentinel Console (Medium Priority)
- [ ] **Sentinel Desktop app** — Incident list, KQL query runner, playbook trigger
- [ ] **Pre-built KQL library** — Adopt `security-investigator` query pattern with metadata headers
- [ ] **Logic App webhook integration** — Trigger remediation playbooks from ThamOS UI

### 🟢 Phase 3 — Email Investigator (Lower Priority)
- [ ] **Email Investigator Desktop app** — Defender email search, detonation results
- [ ] **Attachment extraction pipeline** — Fetch attachments from mailbox or eDiscovery
- [ ] **URL extraction from PDF/DOCX** — Custom parser Edge Function
- [ ] **Redirect chain follower** — Recursive HTTP hop tracker
- [ ] **Third-party sandbox integration** — URLScan.io, VirusTotal for URL detonation

### 🔵 Phase 4 — AI Summaries (Future)
- [ ] **Ticket correlation narrative** — "This UPN has 3 tickets, 2 Sentinel incidents, flagged by AbuseIPDB"
- [ ] **Auto-generated closure notes** — One-click generate TopDesk action note with reasoning
- [ ] **KQL query explanation** — Plain English description of pre-built queries

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

### Sprint 2026-06-10 — Extension Scanner Phase B (Grounded AI Verdict)
**Agent:** GitHub Copilot CLI (Claude)
**Scope:** Move THAMOS verdict server-side, ground it in actual code evidence, persist verdicts

**Completed:**
- [x] New `extension_verdicts` table (migration `20260610201000`) — RLS: authenticated SELECT, service_role INSERT; applied to production
- [x] New edge function `supabase/functions/extension-verdict/index.ts` (deployed):
  - Requires a logged-in user (JWT verified); uses user's Anthropic/OpenAI key (same encryption scheme as ai-chat)
  - Loads analysis/findings/IOCs/CRXplorer data server-side — client can no longer tamper with verdict inputs
  - Pulls raw file contents from `extension_files`, extracts code windows (±1500 chars) around each finding's evidence (max 8 files / 45KB budget, severity-prioritized)
  - Prompt now instructs the model to CONFIRM/REFUTE/CAPABILITY_ONLY/UNVERIFIABLE each finding against the actual code — fixes the "blindly trusts scanner labels" gap
  - IOCs ranked by suspicion (IPs, suspicious TLDs first; whitelisted CDNs last) before the top-25 cut
  - Verdict persisted to `extension_verdicts` (audit trail for BLOCK/REMOVE decisions)
- [x] `ExtensionScanner.tsx`: `runThamosVerdict` now calls the new function (~170 lines of client-side prompt construction removed); persisted verdicts auto-load when viewing an analysis; new "Finding Verification — Code-Grounded" UI block with CONFIRMED/REFUTED badges per rule
- [x] Production verified: 401 for no-auth/anon/garbage tokens; build clean

**Decisions Made:**
- Verdict requires login (uses the analyst's own API key) — anonymous scans still work, verdicts don't
- Old ai-chat-based client flow fully removed rather than kept as fallback

**Deferred / Next Sprint:**
- Phase C/D: DECODE pass, .mjs coverage, four-axis scoring, org disposition workflow
- Verdict history UI (table stores all verdicts; UI shows latest only)

### Sprint 2026-06-10 — Extension Scanner Phase A (Security + FP Hardening)
**Agent:** GitHub Copilot CLI (Claude Fable 5)
**Scope:** Critical security fixes + top false-positive defusal in the extension scanner, per full scanner audit (vs CRXplorer-depth benchmark).

**Completed:**
- **Auth validation in `analyze-extension`** — previously any non-empty `Authorization` header was accepted while the function ran as service role (internet-writable). Now requires the project anon key (anonymous tier) or a valid user JWT verified via `auth.getUser()`.
- **RLS fix migration** (`20260610194500_lock_down_extension_iocs_insert.sql`) — `extension_iocs` INSERT was `WITH CHECK (true)` with no role restriction = IOC/prompt poisoning vector. Now service_role only.
- **Vault cross-tenant fix** — vault delta lookup/update was unscoped by user (broke `maybeSingle()` when 2+ users vaulted the same extension, and mutated other users' vault pointers). Now scoped to the authenticated requester; frontend now sends session token (falls back to anon key).
- **FP defusal:** GRAB-1 keywords word-boundary anchored + require ≥2 distinct matches (bare `pin` matched "spinner" → "financial theft" criticals); C2-1 `setInterval`+"callback" branch removed; API-1/DYN-2 require a non-whitelisted literal destination in-file else downgraded to capability-level severity/confidence; NET-3 WebSocket downgraded for whitelisted hosts; `hasExfilMethods` now ignores whitelisted domains (previously ANY url string = "exfil capable").
- **Scoring:** per-rule dedup (same rule in N files = 1 signal + ≤50% repeat bonus, not N× criticals); AI-DATA governance findings and `shadow_ai_risk` flag excluded from the malware risk score (governance ≠ malware).

**Decisions Made:**
- Anonymous-tier scanning kept (anon key accepted); vault delta requires login.
- Evidence collection unchanged — only severity/confidence gating and scoring were tuned (audit principle: don't weaken collection, improve correlation).

**Deferred / Next Sprint (Phase B+ from audit):**
- Server-side THAMOS verdict grounded in raw `extension_files` contents (fixes AI blindly trusting scanner labels); persist verdicts (`extension_verdicts`).
- DECODE pass for base64/charcode payloads; `.mjs` coverage; AST-based flow rules; obfuscation-vs-minification split; four-axis scoring (capability/behavior/reputation/governance); org disposition workflow tables.

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

### Sprint 2026-05-04 — TopDesk Integration + Build Fixes
**Agent:** Kimi Code CLI
**Scope:** TopDesk Desktop App, build fixes, clean boot state, settings integration

**Completed:**
- Removed forced Terminal + System Monitor open on fresh boot → clean desktop by default
- Fixed build error: `src/pages/DesktopScanner.tsx` imported deleted `DesktopLayout.tsx` — replaced with local AGENTS/P definitions
- Fixed build error: `appRegistry.ts` had `SearchResultIcon({ size: 20 })` function calls instead of component references
- Built `TopDeskIcon` SVG in `icons.tsx` (ticket/helpdesk style outline icon)
- Added `topdesk` to `AppId` union type in `DesktopContext.tsx`
- Registered `topdesk` app in `appRegistry.ts` with blue accent, desktop icon enabled
- Created `DesktopTopDesk.tsx` with full mock-data UI:
  - UPN search bar with loading state
  - Incident list with status badges, duplicate markers, primary auto-selection
  - Detail view with action notes, category, operator info
  - Deduplication panel: shows duplicate tickets, [CLOSE DUPLICATES & MERGE] button
  - [ENRICH] button for adding ThamOS scan results to primary ticket
  - [CLOSE AS BENIGN] and [ESCALATE] action buttons
  - Toast notifications for actions
- Added TopDesk configuration UI in Settings > Connections:
  - URL, username, application password fields
  - Save to localStorage
  - Visual active/inactive status indicator
- Created Supabase Edge Function stubs:
  - `supabase/functions/topdesk/search-incidents.ts`
  - `supabase/functions/topdesk/update-incident.ts`
  - `supabase/functions/topdesk/deduplicate.ts`

**Decisions Made:**
- TopDesk App uses mock data for now; Edge Functions are ready for real API integration
- Credentials stored in localStorage for rapid iteration; will migrate to encrypted Supabase table when API integration is live
- Primary ticket auto-selected as newest open ticket; duplicates flagged via `isDuplicate` property

**Next Sprint Candidates:**
1. Wire TopDesk App to real Edge Functions (needs school board TopDesk credentials)
2. Entra Guard app (session revoke, password reset)
3. Azure Web App sister project (secure proxy for Microsoft APIs)

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
