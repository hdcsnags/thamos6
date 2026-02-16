# ThamOS X v7.0 Desktop Environment -- Architecture & Status Reference

Last updated: 2026-02-16

---

## 1. Overview

ThamOS X is a browser-based desktop operating system environment for cybersecurity operations. It provides a windowed OS experience with multi-workspace support, AI agent integration, threat intelligence scanning, case management, and a terminal CLI.

**Theme:** Desktop (windowed OS), Tactical (sidebar dashboard), Terminal (CLI-only)
**Stack:** React 18 + TypeScript + Tailwind CSS + Supabase + Vite
**Font:** JetBrains Mono (monospace throughout)

---

## 2. Component Map

### 2.1 Core Infrastructure

| File | Purpose | Status |
|------|---------|--------|
| `src/contexts/DesktopContext.tsx` | Window manager state (open/close/minimize/maximize/focus/resize/snap, 4 workspaces, z-index tracking) | Complete |
| `src/contexts/themecontext.tsx` | Theme switching (desktop/tactical/terminal/mission-control) with Supabase persistence | Complete |
| `src/contexts/AuthContext.tsx` | Supabase auth (email/password), session management | Complete |
| `src/contexts/AlertContext.tsx` | Notification/alert badge count | Complete |

### 2.2 Desktop Chrome (Window Manager UI)

| File | Purpose | Status |
|------|---------|--------|
| `src/components/desktop/DesktopLayout.tsx` | Root layout: wallpaper, workspace rendering, app-to-component routing, Ctrl+K launcher shortcut | Complete |
| `src/components/desktop/DesktopWindow.tsx` | Window frame: title bar, traffic lights (close/min/max), drag-to-move, 8-direction resize, edge snapping (top=maximize, left/right=half, corners=quarter) | Complete (fixed: window shadowing bug) |
| `src/components/desktop/Taskbar.tsx` | Bottom bar: app launcher button, 4 workspace switchers, open window tabs, live agent status dots (from DB), notification bell (opens Intel), clock | Complete |
| `src/components/desktop/AppLauncher.tsx` | Full-screen modal: searchable 10-app grid, arrow/Enter/Escape keyboard nav | Complete |
| `src/components/desktop/DesktopIcons.tsx` | Desktop shortcut icons (5): Terminal, Scanner, Browser, Files, Settings. Double-click to open. | Complete |
| `src/components/desktop/BootSequence.tsx` | Startup animation: 16 boot messages + progress bar. Skipped on subsequent loads via sessionStorage. | Complete |

### 2.3 Application Windows

| File | AppId | Purpose | Status |
|------|-------|---------|--------|
| `DesktopTerminal.tsx` | `terminal` | CLI with 15+ commands: scan, get feeds, neofetch, nmap/whois/dig (simulated), thamosx/y/z (AI), workspace switching, app launching. Arrow key history, tab completion. | Complete |
| `DesktopScanner.tsx` | `scanner` | Thin wrapper around `pages/Scanner.tsx`. Maps scan results to desktop windows. | Complete |
| `DesktopBrowser.tsx` | `browser` | Tabbed internal browser. `thamos://` URLs: home, intel, cases, history, settings, 404. Tab management, URL bar, navigation. | Complete |
| `DesktopWorkshop.tsx` | `workshop` | AI chat: 3 agents (X=Claude/Anthropic, Y=GPT/OpenAI, Z=Gemini/Google). Conversation management, message persistence, markdown rendering for responses. | Complete |
| `DesktopIntelDashboard.tsx` | `intel` | RSS + ransomware feed reader. Left sidebar with source list + article counts, right panel with article list. Auto-fetches from edge functions. | Complete |
| `DesktopCaseManager.tsx` | `cases` | Incident case CRUD. Left panel: search + status filters + case list. Right panel: case detail or edit form with IOCs, notes, tags, priority, status. | Complete |
| `DesktopSystemMonitor.tsx` | `monitor` | Dashboard: session info, agent API key status, scan counts by type with bar charts, threat feed stats, API key config progress. | Complete |
| `DesktopSettings.tsx` | `settings` | 3 tabs: API Keys (13 services, encrypted via edge function), Account (email, password change), Theme (desktop/tactical/terminal selector). | Complete |
| -- | `files` | **PLACEHOLDER** -- renders "Requires GitHub OAuth (Phase 3)". No component file exists. | Stub |
| -- | `editor` | **PLACEHOLDER** -- renders "Requires CodeMirror (Phase 4)". No component file exists. | Stub |

### 2.4 Scan Result Windows

| File | AppId | Purpose | Status |
|------|-------|---------|--------|
| `DesktopIPResult.tsx` | `ip-result` | IP scan results: threat score, geolocation, ISP, abuse reports, VPN/proxy detection, WHOIS. | Complete |
| `DesktopURLResult.tsx` | `url-result` | URL scan results: threat score, screenshot, redirects, certificates, page analysis. | Complete |
| `DesktopDomainResult.tsx` | `domain-result` | Domain scan results: threat score, DNS records, WHOIS, subdomains, certificates. | Complete |
| `DesktopHashResult.tsx` | `hash-result` | File hash results: threat score, detection ratio, file metadata, behavioral analysis. | Complete |

---

## 3. Window Management System

### AppId Union Type
```
terminal | scanner | browser | workshop | intel | cases | files | editor | monitor | settings | ip-result | url-result | domain-result | hash-result
```

### Window Instance Properties
- `id` (unique string)
- `appId` (AppId)
- `title`, `icon`, `accentColor`
- `position` { x, y }
- `size` { width, height }
- `minimized`, `maximized` (booleans)
- `zIndex` (number, incremented on focus)
- `workspaceId` (1-4)
- `pinned` (visible across workspaces)
- `data` (optional payload, used by scan results for scan value/flags)

### Default Sizes
| App | Default Size |
|-----|-------------|
| terminal | 800x500 |
| scanner | 900x700 |
| browser | 1000x700 |
| workshop | 1000x700 |
| intel | 1100x700 |
| cases | 1000x650 |
| files | 900x600 |
| editor | 1000x700 |
| monitor | 800x600 |
| settings | 700x550 |
| *-result | 900x700 |

### Keyboard Shortcuts
- `Ctrl+K` -- Open App Launcher
- `Ctrl+1-4` -- Switch workspace
- `Escape` -- Close App Launcher

---

## 4. Design System (Current State)

### 4.1 Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| void | `#060610` | Deepest background |
| surface | `#0a0e1a` | Panel backgrounds, headers |
| surfaceLight | `#0f1424` | Elevated surfaces, inputs |
| border | `#1a1f35` | All borders |
| dim | `#3a3f55` | Disabled/muted text |
| text | `#8a8fa8` | Secondary body text |
| textLight | `#c8cde0` | Primary body text |
| cyan | `#00d9ff` | Primary accent (links, active states) |
| green | `#00ff9d` | Success, safe, Agent X |
| amber | `#fbbf24` | Warning, caution |
| pink | `#ff0080` | Danger, malicious, critical |
| orange | `#ff6b35` | Agent Y (OpenAI) |
| blue | `#00b4d8` | Agent Z (Google) |
| purple | `#b794f6` | File Manager accent |

### 4.2 Agent Identity

| Agent | Name | Provider | Color | Key Service |
|-------|------|----------|-------|-------------|
| X | ThamOS-X | Anthropic (Claude) | `#00ff9d` green | `anthropic_key` |
| Y | ThamOS-Y | OpenAI (GPT) | `#ff6b35` orange | `openai_key` |
| Z | ThamOS-Z | Google (Gemini) | `#00b4d8` blue | `gemini_key` |

### 4.3 API Services (13 total)

| Service ID | Name | Purpose |
|-----------|------|---------|
| `anthropic_key` | Anthropic | AI Agent X |
| `openai_key` | OpenAI | AI Agent Y |
| `gemini_key` | Google Gemini | AI Agent Z |
| `virustotal` | VirusTotal | File/URL analysis |
| `abuseipdb` | AbuseIPDB | IP reputation |
| `shodan` | Shodan | Device search |
| `greynoise` | GreyNoise | Scan data |
| `urlscan` | URLScan.io | URL scanning |
| `alienvault` | AlienVault OTX | Threat intel |
| `ipqualityscore` | IPQualityScore | Fraud detection |
| `proxycheck` | ProxyCheck | Proxy/VPN detection |
| `ip2proxy` | IP2Proxy | Proxy database |
| `iphub` | IPHub | VPN/proxy detection |

---

## 5. Edge Functions

| Function | Purpose |
|----------|---------|
| `ai-chat` | Proxies chat messages to Anthropic/OpenAI/Google APIs |
| `analyze-extension` | Chrome extension static analysis |
| `api-keys` | Encrypted API key CRUD (AES-256-GCM) |
| `ip2proxy-refresh` | IP2Proxy database refresh |
| `news-feeds` | RSS feed fetcher/parser |
| `ransomware-intel` | Ransomware threat feed aggregation |
| `threat-intel` | Multi-source threat intelligence lookup |
| `tor-list-refresh` | Tor exit node list refresh |

---

## 6. Database Tables (Desktop-Relevant)

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles, admin status, UI theme preference |
| `user_api_keys` | Encrypted API key storage per user per service |
| `case_notes` | Incident cases with IOCs, notes, tags, priority, status |
| `ai_agents` | AI agent configurations per user |
| `ai_conversations` | Chat conversation metadata |
| `ai_messages` | Individual chat messages with token tracking |
| `scan_history` | Scan results (IP/URL/hash/domain) |
| `news_sources` | RSS feed source definitions |
| `news_articles` | Cached RSS articles |
| `user_alerts` | Alert/notification records |
| `user_custom_sources` | User-defined RSS sources |
| `watchlist_items` | IOC watchlist entries |

---

## 7. Known Issues & Technical Debt

### 7.1 Architecture Issues

| Issue | Severity | Location |
|-------|----------|----------|
| Palette (`P` object) duplicated in 5+ files, hardcoded in 14+ files | Medium | All desktop components |
| Shared scan result utilities (Section, DataRow, getThreatColor) duplicated 4x | Medium | Desktop*Result.tsx |
| `DesktopScanner` delegates to `pages/Scanner` which has different visual language | Low | DesktopScanner.tsx |
| No shared constants for app definitions (duplicated in AppLauncher, DesktopIcons, Terminal) | Low | Multiple files |

### 7.2 UX Issues

| Issue | Severity | Location |
|-------|----------|----------|
| No confirmation dialogs for delete operations | High | CaseManager, Workshop, Settings |
| `focus:outline-none` removes focus indicators everywhere | High | All inputs/buttons |
| No hover states on list items in sidebars | Medium | IntelDashboard, CaseManager, Workshop |
| Workshop loading dots animation broken (all pulse in sync) | Low | DesktopWorkshop.tsx |
| Browser home page quick links don't navigate | Medium | DesktopBrowser.tsx |
| IntelDashboard silently swallows API errors | Medium | DesktopIntelDashboard.tsx |
| CaseManager has no error display for save/delete failures | Medium | DesktopCaseManager.tsx |
| Sidebar widths inconsistent (224px / 300px / 340px) | Low | Workshop, CaseManager, IntelDashboard |
| No window open/close animations | Low | DesktopWindow.tsx |

### 7.3 Accessibility Issues

| Issue | Severity |
|-------|----------|
| Focus rings removed on all interactive elements | High |
| `dim` color (#3a3f55) fails WCAG AA contrast on dark bg (2.3:1) | Medium |
| `pink` color (#ff0080) borderline contrast (4.3:1) | Low |
| ARIA labels missing from desktop icons, filter buttons, sidebar items | Medium |

---

## 8. Phased Roadmap

### Phase 1 (Complete)
- Desktop window manager with drag/resize/snap
- Boot sequence
- Terminal CLI
- Scanner integration
- AI Workshop (3 agents)
- Intel Dashboard (RSS + ransomware feeds)
- Case Manager
- System Monitor
- Settings (API keys, account, theme)
- Internal Browser

### Phase 2 (Current -- Polish)
- [x] Fix window snapping bug (window shadowing)
- [x] Dynamic agent status in Taskbar
- [x] App Launcher search + keyboard nav
- [x] Markdown rendering in Workshop
- [x] Version string consistency
- [ ] Extract shared palette to single file
- [ ] Add confirmation dialogs for destructive actions
- [ ] Fix Browser home page links
- [ ] Add error handling to IntelDashboard and CaseManager
- [ ] Standardize section headers
- [ ] Add hover states to list items
- [ ] Add window open/close animations
- [ ] Fix Workshop loading dots animation
- [ ] Add focus indicators

### Phase 3 (Planned)
- File Manager (GitHub repository browser via OAuth)

### Phase 4 (Planned)
- Code Editor (CodeMirror integration)

### Phase 5 (Ideas)
- Desktop right-click context menu
- Window tiling keyboard shortcuts (Super+Left/Right)
- Notification dropdown panel
- Desktop wallpaper customization
- Drag-and-drop desktop icon arrangement
- Window pinning indicator in title bar
- Multi-monitor/viewport support
