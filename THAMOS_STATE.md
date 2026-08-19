# ThamOS v6 — Project State & Sprint Tracker

> **Last Updated:** 2026-08-19 by GitHub Copilot CLI (MS Learn Agent Fix + Bulk IP Scan)
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
| **Tactical** | `src/components/Layout.tsx` | ✅ Stable / Compatibility | Modern card-based GUI retained for existing users and direct theme selection. |
| **Terminal** | `src/components/terminallayout.tsx` | ✅ Stable | Retro CLI with `scan` commands, flags, history. |
| **Desktop** | `src/components/desktop/` | ✅ Product Direction / Most Complete | Full windowed OS environment and the default for new profiles. Existing stored/profile theme choices remain respected. |
| **Mission Control** | `src/components/desktop/DesktopLayout.tsx` | ✅ Desktop Overlay | Working window overview toggled with `Ctrl+Shift+M`. The separate `mission-control` theme value remains legacy/incomplete routing. |

**Documentation warning:** architecture and roadmap documents are useful orientation, but completion status must be verified against live code. This state document and `AGENTS.md` carry the current product/deployment decisions.

### Current Product and Deployment Decisions (2026-08-05)

- Desktop is the intended primary experience; Desktop Terminal and the graphical Scanner are both first-class scan surfaces.
- IP reputation is the anchor scan workflow. The terminal supports explicit commands such as `scan -ip 8.8.8.8` and auto-detection via `scan <value>`.
- Visual direction is a restrained Kali/Ubuntu-inspired operator workstation: graphite surfaces, neutral icons, minimal accent, and semantic color only for real status.
- The long-term deployment target is a **full migration into the tenant**, replacing Supabase Edge Function responsibilities with Azure Functions where practical.
- Secrets belong in Azure Key Vault. Entra ID, tenant authorization, network controls, and optional education-centre IP restrictions form the boundary.
- Raw email, identities, PII, Log Analytics/Data Lake results, and investigation artifacts remain inside the tenant.
- Maestro/T6 access to Log Analytics or the Data Lake is undecided future work; permissions must be explicit and least-privileged.
- The TopDesk prototype is abandoned unless the maintainer explicitly revives it.

---

## UI/UX Audit Findings

> **Historical audit:** the grades and issue descriptions below capture the 2026-05-04 baseline. Later sprint entries and the current-direction section above supersede completed or changed claims.

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
- [x] Neutral Linux-style window controls with persistent glyphs
- [x] Active/inactive window differentiation using surface, border, and shadow
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
- [x] **Build Mission Control / window overview overlay** (all windows + workspaces visible)
- [x] **Make desktop icons draggable** (`src/components/desktop/DesktopIcons.tsx`)
- [x] **Group result windows in the taskbar** (`src/components/desktop/Taskbar.tsx`); broader per-app grouping remains optional
- [ ] **Add calendar popover on clock click** (`src/components/desktop/DesktopClock.tsx` + `Taskbar.tsx`)
- [ ] **Build desktop-styled result wrappers** (`DesktopIPResult`, `DesktopURLResult`, etc.)
- [x] **Reduce expensive/overactive acrylic styling**; active windows use restrained blur and inactive windows use none
- [ ] **Reconcile remaining architecture docs** with the current Desktop and tenant-hosting direction

### 🟢 Medium Priority
- [ ] **Longitudinal Threat Graph / Pivot Explorer** — Phase 1 (IP scans, cumulative context edges, graph/list/timeline UI) completed 2026-08-05; remaining work is multi-IOC coverage, tenant aggregation, cases, maps, clusters, and recurrence controls:
  - Persist a scan observation for every IOC lookup with `observed_at`, verdict/score, case/source context, and enrichment snapshot. IP is complete; extend to the other scanner routes.
  - Model IPs, domains, hashes, URLs, ASNs, organizations/ISPs, VPN providers, countries, regions, cases, emails, and documents as typed entities.
  - Add explicit relationships such as `announced_by`, `located_in`, `uses_vpn_provider`, `resolves_to`, `cert_san`, `redirects_to`, `extracted_from_email`, `extracted_from_document`, `seen_in_case`, and `observed_with`.
  - Track `first_seen`, `last_seen`, and incrementing observation counts instead of merely overwriting an edge during upsert.
  - Provide graph, timeline, hotspot, recurrence, and cluster views with pivots back into Scanner and Case Manager.
  - Keep context separate from verdict: a country, region, ASN, or commercial VPN is not malicious merely because an IOC used it. Weight/filter trends by actual malicious or suspicious evidence and control for repeated analyst rescans.
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
- [x] Network graph for related IOCs (Phase 1 radial explorer; richer layout/filtering remains)
- [ ] Geographic map for IP sources
- [ ] STIX/TAXII integration
- [ ] Browser extension for right-click IOC lookup
- [ ] Natural language queries via AI

---

## Integration Roadmap

Older TopDesk-first and external-companion plans are retained in historical documents for context but are no longer the active direction.

### Phase 1 — Tenant Foundation
- [ ] Establish the Azure/Entra application boundary and deployment model.
- [ ] Move secrets and third-party API keys to Azure Key Vault.
- [ ] Define Azure Function equivalents for current Supabase Edge Functions.
- [ ] Define data residency, retention, audit, RBAC, and network/IP access controls.

### Phase 2 — Investigation Workbench
- [ ] Make Case Manager the investigation spine with “Send to Case” from scans, email verdicts, document analysis, and T6 synthesis.
- [ ] Preserve email/PII and investigation artifacts entirely inside the tenant.
- [ ] Add robust PDF/OOXML URL extraction, OCR/QR detection, and isolated URL detonation.

### Phase 3 — Tenant Intelligence
- [ ] Decide whether Maestro/T6 should query Log Analytics, a Data Lake, or both.
- [ ] Define read-only query scopes, approval boundaries, redaction, and auditable tool execution before enabling access.
- [ ] Consider Sentinel/Defender/Logic App integrations only after the tenant boundary is established.

---

## Known Bugs

| # | Bug | Location | Severity | Fix Strategy |
|---|-----|----------|----------|--------------|
| 1 | Desktop reuses Tactical result pages | `src/components/desktop/DesktopLayout.tsx` | Medium | Build Desktop-native result composition or shared neutral result primitives |
| 2 | Email parsing discards attachment bytes after hashing, preventing direct PDF handoff | `supabase/functions/_shared/email-parser.ts` | High | Retain encrypted/transient attachment artifacts inside the tenant and pass supported documents to analysis |
| 3 | Document analysis is raw-byte pattern matching; it lacks proper PDF/OOXML parsing, OCR/QR, redirects, and detonation | `supabase/functions/analyze-doc/index.ts` | High | Replace with tenant-side structural extraction plus isolated browser analysis |

---

## Sprint Log

### Sprint 2026-08-19d — MS Learn Agent Truncation Fix + Model Switch + Bulk IP Scan
**Agent:** GitHub Copilot CLI (Claude Sonnet 5)
**Scope:** Diagnose a bad/incomplete MS Learn MCP answer, evaluate GitHub custom-agent proxying vs. current direct-MCP architecture, and add bulk/multi-IP scanning to the Scanner + Terminal.

**Completed:**
- [x] MS Learn agent was truncating: `max_tokens: 4096` in `T6.tsx` `DEFAULT_AGENTS` — half the ceiling of the other analyst agents (all 8192) — despite needing the longest synthesized answers after multi-round MCP grounding. Bumped to 8192 (code default + migration `20260819150000_mslearn_agent_max_tokens.sql` to patch existing users' rows, since `loadAgents()` only inserts missing agents, never patches stale existing ones).
- [x] Switched the MS Learn agent from `openai`/`gpt-4o-mini` to `anthropic`/`claude-haiku-4-5-20251001` for stronger multi-domain tool-use/reasoning (code default + migration `20260819160000_mslearn_agent_switch_haiku.sql`). `ai-chat/index.ts`'s `callAnthropicWithTools` loop already fully supported this — zero backend changes needed. **Requires an Anthropic API key configured** to keep working.
- [x] Evaluated "route through a GitHub Enterprise custom agent instead" — not viable: Copilot custom agents/Extensions are invoked from licensed Copilot Chat surfaces, no supported API for a third-party product to call one on behalf of many unlicensed end users. Confirmed the existing direct-MCP-client architecture in `ai-chat` is the correct integration, not a workaround.
- [x] Bulk IP scanning: found Bulk Lookup already existed (`BulkLookup.tsx` + `/bulk` edge route, 20-IP cap) but ran a **separate, stale, uncalibrated scoring formula** (flat uncapped Spamhaus +25 — the exact bug fixed in the main `/ip` route on 2026-08-13b, never propagated here) and was missing VirusTotal/ProxyCheck/IPQualityScore/Shodan from its source set.
- [x] Recalibrated `/bulk` to call the same `computeCalibratedScoring()` engine as `/ip` (per-IP `scoring` object now included in the response) and added the missing sources for parity. `BulkIPResult` type extended (`scoring`, `org`, `vpnService`, `isTor`/`isVPN`, `blocklistde*`).
- [x] `BulkLookup.tsx` now displays/exports the calibrated score, accepts an optional `initialIPs` prop that pre-fills + auto-runs.
- [x] Terminal: `scan -ip 1.1.1.1,8.8.8.8,9.9.9.9` (comma/space separated, up to 20) now opens the Bulk Lookup window pre-filled and auto-running instead of erroring on a mashed-together value; help text/examples updated.
- [x] `npm run build` + `tsc --noEmit` clean; `threat-intel` edge function + both migrations deployed live; committed/pushed (70562be, c46d86c).

**Deferred / Next Sprint:** Bulk Lookup's visual style is still old Tailwind slate/emerald (not migrated onto `tokens.ts`/result kit) — candidate for the same design-token pass done to Intel Stream/Thamos AI; 20-IP cap left as-is (external API rate limits, e.g. VirusTotal free tier, were the likely original reason — not raised without confirming per-source limits first).

---

### Sprint 2026-08-19b — Intel Stream + Thamos AI: Design-Token Migration
**Agent:** GitHub Copilot CLI (Claude Sonnet 5)
**Scope:** User flagged that Intel Stream's own app view (not the desktop widget) and the Thamos AI workshop both look "old/AI-sloppy" and don't match the rest of the platform.

**Completed:**
- [x] Root-caused it: `DesktopIntelDashboard.tsx` and `workshop/T6.tsx` were both still running a hand-rolled "neon hacker" local palette (`P` / `C`) predating `tokens.ts` — literally identical hex values duplicated in both files (`#00d9ff` cyan, `#00ff9d` green, `#0a0e1a` surface, etc.), plus the entire UI forced into JetBrains Mono at 0.55–0.85rem. Neither had been migrated when the result kit / `ResultShell` / `IPResult` v2 / `IntelWidget` moved onto the shared operator-workstation palette back on 2026-08-13.
- [x] Both local palette objects now alias `palette.*` from `design-system/tokens.ts` instead of hardcoded hex — future OS-wide theme tweaks propagate automatically. `tokens.ts` already had `pink`/`orange` compatibility aliases reserved for exactly this migration.
- [x] Root shell typography switched from forced monospace to `typography.ui` (Inter) in both apps; mono kept only where it's a legitimate content type — inline code spans, section-label badge captions (CONSENSUS/TRADE-OFFS/DELIBERATION/etc.), IOC-ish snippet paste fields. Thamos AI's chat composer textarea moved off mono onto a normal readable chat font.
- [x] Thamos AI persona colors (Red Teamer/Defender/Skeptic/Forensics) and per-provider agent colors (anthropic/openai/google/openrouter) now pull from the shared palette instead of raw neon hex (openrouter's jarring `#9370DB` purple → muted `palette.pink`).
- [x] `T6Orb.tsx` (the semantic state orb) deliberately left untouched — already well-designed (soft desaturated radial gradients, not neon flat hex) and not part of the problem.
- [x] `npm run build` + `tsc --noEmit` clean; committed/pushed (e2b7cc5).

**Deferred / Next Sprint:** deeper layout/IA pass on both apps (not just recoloring) if the user wants it after living with the palette fix; Hash/URL/Domain result pages still not migrated onto the shared result kit (see 2026-08-13b).

---

### Sprint 2026-08-19 — Intel Stream Data-Integrity Fixes + abuse.ch Auth-Key Sources + Scanner Pro Mode Default
**Agent:** GitHub Copilot CLI (Claude Sonnet 5)
**Scope:** Fix a stuck/stale Intel Stream, audit IPv4 vs IPv6 scan-route parity, restore dead RSS sources (incl. real abuse.ch API integration), desktop widget UX polish, and default all scanner result pages to Pro Mode.

**Completed:**
- [x] **Root-caused the stuck Intel Stream** (last item dated 5/13/2026 for days): `/my/refresh` in `news-feeds/index.ts` only ever refreshed a signed-in user's *custom* RSS sources — it never touched the default `rss_sources` that actually feed the main Intel Stream, so a logged-in user's refresh silently did nothing. Fixed to refresh default + custom sources in parallel (`Promise.all`). Deployed; verified live (217 fresh items pulled, dated today).
- [x] Fixed a secondary bug in the same pass: a double-escaped regex `/<!\[CDATA\[([\\s\\S]*?)\]\]>/g` only matched literal backslash-s/S characters (that trick only works inside `new RegExp("...")` string construction, not a regex literal) — left raw `<![CDATA[...]]>` wrappers on some stored titles. Fixed to `[\s\S]`.
- [x] **IPv6 parity audit**: the `ipKey`/`ipResult` flat-shape fallback in `threat-intel/index.ts` already treats v4/v6 identically — no version-specific gap found. Did find a real, version-agnostic bug along the way: proxycheck v3's `risk` field lives under `detections.risk`, not top-level `ipResult.risk`, so `enrichment.riskScore` never populated from proxycheck for **any** IP (v4 or v6). Fixed. User confirmed live: IPv6 Tor-node scans now return consistent proxycheck/AbuseIPDB data; the original "missing data" report was a clean IP, not a bug.
- [x] **RSS source health pass**: found 6/17 default sources dead (404): CISA KEV, NCSC UK, MalwareBazaar, URLhaus, ThreatFox, NVD CVE. NCSC UK had simply moved URLs — fixed to `all-rss-feed.xml` (migration `20260819130000_fix_ncsc_rss_url.sql`, verified 20 items live). CISA KEV and NVD CVE have fully retired RSS/XML in favor of JSON-only APIs — no simple URL swap possible; flagged as backlog "real integration work," explicitly not faked with an unreliable third-party mirror.
- [x] **abuse.ch Auth-Key integration** (MalwareBazaar/URLhaus/ThreatFox all dropped open RSS for a free-account API): added `fetch_type` column to `rss_sources` (migration `20260819140000_abusech_auth_key_sources.sql`); implemented `parseAbuseChDate`, `fetchBazaarRecent` (`POST mb-api.abuse.ch/api/v1/`, form `query=get_recent&selector=time`), `fetchUrlhausRecent` (`GET urlhaus-api.abuse.ch/v1/urls/recent/`, `Auth-Key` header), `fetchThreatFoxRecent` (`POST threatfox-api.abuse.ch/api/v1/`, JSON `{query:"get_iocs",days:1}`) in `news-feeds/index.ts`; `fetchAndStoreDefaultFeed` branches on `fetch_type`, threaded through both `/refresh` and `/my/refresh`. Discovered `ABUSECH_AUTH_KEY` was **already configured** on the project (same secret `threat-intel`'s own live lookups use) — all three feeds went live immediately, no user setup needed. Feed health: 17/19 → confirmed real items rendering (ThreatFox IOCs, URLhaus malware URLs, MalwareBazaar samples).
- [x] Added two new no-auth RSS sources per user request ("add the two solid ones"): **The Record** (therecord.media/feed) and **Malwarebytes Labs** — both verified live before adding.
- [x] **IntelWidget UX**: clicking an article on the desktop home-screen widget now opens the link directly in a new tab (`window.open`) instead of opening the Intel app window and requiring a second click.
- [x] **IntelWidget News/All toggle**: abuse.ch IOC feeds (category `threats`) are high-volume/noisy for a glanceable ticker. Added a header pill (defaults to "News", persisted in localStorage) that passes `category=news` into the existing `/items` / `/my/items` filters; one click switches to "All" for the full IOC firehose.
- [x] **Pro Mode is now the default** on all four scanner result pages (`IPResult.tsx`, `HashResult.tsx`, `URLResult.tsx`, `DomainResult.tsx`) — `proMode` initial state `false` → `true`. Simple Mode is still toggleable per-session via the existing `ResultShell` header button; not removed (yet).
- [x] `npm run build` clean throughout; all changes committed/pushed to `main` (df914a9, 7ed0851, 2b14ab4, 7bba525).

**Decisions Made:**
- Simple Mode stays as a togglable option for now; user is considering removing it outright later but didn't commit to that this sprint.
- CISA KEV / NVD CVE JSON-API integrations deliberately deferred — real work (pagination, different schema), not a quick fix; user can request it explicitly later.
- Frontend deploy pipeline (no `vercel.json`/`netlify.toml`/CI config found in repo) is presumed to be a dashboard-connected auto-deploy-on-push host — **not fully confirmed**. If a future "my fix isn't showing up" report recurs, verify this explicitly with the user rather than assuming propagation delay.

**Deferred / Next Sprint:**
- User flagged a **maximized-window width bug**: result cards fill correctly in a boxed/non-maximized window, but pills/content don't reflow to fill the new width when the window is maximized — called out as "easy fix," not yet started.
- Broader Desktop Scanner result-card **restructure** pass is next (per user's original request): tighten generic icons further, refine app identities, and revisit result-card layout/IA beyond the Pro Mode default. IPResult v2 (2026-08-13b) is the template; Hash/URL/Domain are not yet migrated onto the shared result kit.
- Email scanner UX/UI pass flagged by user (referencing a `thamosemail.md` draft from a separate session with Sonnet) — not yet started, needs either direct code investigation or clarifying questions per user's instruction not to blindly follow the draft's recommendations.
- Consider a geo-context scoring layer and AbuseIPDB/Spamhaus recalibration follow-through (see 2026-08-13b) once more real-world scored IPs are field-tested — user has been spot-checking live scores during this sprint and reported the current AbuseIPDB/Spamhaus calibration is landing well.

---

### Sprint 2026-08-15 — MS Learn MCP Agent in Thamos (T6 Workshop)
**Agent:** GitHub Copilot CLI (Claude Fable 5)
**Scope:** Give DSBN users grounded Microsoft answers for pennies — a tool-enabled agent inside the existing Thamos app, wired to the public Microsoft Learn MCP server.

**Completed:**
- [x] Migration `20260815120000`: `ai_agents.tools text` column (NULL = plain chat; `'mslearn'` = tool-grounded). Applied to remote.
- [x] **`ai-chat` edge function**: minimal MCP client for `https://learn.microsoft.com/api/mcp` (Streamable HTTP/JSON-RPC, initialize handshake + session header, SSE response parsing, re-init retry) with hardcoded schemas for the 3 Learn tools (`microsoft_docs_search`/`docs_fetch`/`code_sample_search`). Tool-calling loops for OpenAI-compatible (OpenAI + OpenRouter) and Anthropic providers, max 5 rounds then a forced no-tools synthesis round; 50KB per-tool-result cap. Google + tools → 400 with guidance. Deployed.
- [x] **T6 workshop**: `Agent.tools` field; new default agent **MS Learn** (gpt-4o-mini, temp 0.3, cite-your-sources system prompt); self-heal insert for users seeded before the agent existed; `tools` passed through single-chat and council dispatches.
- [x] MCP flow smoke-tested live against learn.microsoft.com (initialize → notifications/initialized → tools/call, 25KB doc payload returned).
- [x] **Grounding-enforcement patch** (field-tested — gpt-4o-mini answered from memory): first round now sends `tool_choice: "required"` (OpenAI/OpenRouter) / `{type:"any"}` (Anthropic); response carries `tool_calls` count; T6 chat badge shows "N Learn lookups"; AgentConfigModal has an MS Learn toggle for any non-Google agent + MS LEARN chip.

**Notes:** Runs on users' own API keys (`user_api_keys`), not subscriptions. Full ai-chat path not E2E-tested in-session (needs a logged-in user + OpenAI key) — logic mirrors the verified MCP script. Decision logged: VPS terminal stays the personal power path; Maestro is not being wired into t6 — only UI patterns may be borrowed for the Thamos app later.

---

### Sprint 2026-08-13c — urlscan.io Detonation Wiring (URL Scanner)
**Agent:** GitHub Copilot CLI (Claude Fable 5)
**Scope:** Close the half-wired urlscan integration — scans were submitted but results never fetched or rendered.

**Completed:**
- [x] **Backend `/urlscan-result` endpoint** (threat-intel): `{uuid, url?}` → polls `urlscan.io/api/v1/result/{uuid}/`; 404 → `{ready:false}` (scan still processing); success → trimmed payload via `trimUrlscanResult` (task/report/screenshot URLs, overall verdict incl. brands/categories, final-page context ip/asn/country/server/title/TLS, Document-request redirect chain, linkDomains ≤40, traffic counts, malicious request count). Completed detonations cached under `("urlscan_result", url)`.
- [x] `checkURLScan` is now cache-aware: a previously completed detonation for the same URL is returned inline with the lookup (no resubmission, no polling needed); otherwise submits and returns `{submitted, pending, uuid, resultUrl}`.
- [x] **Frontend**: `fetchUrlscanResult(uuid, url)` + `UrlscanDetonation` type in `threatIntel.ts`. `URLResult.tsx` gains a **Detonation tab** — polls every 5s (first poll at 7s, ~80s budget), renders verdict strip (score/malicious/brands/categories), page screenshot (`urlscan.io/screenshots/{uuid}.png`, click-through to report), final-page context grid, redirect chain (visible gate-page hops), outgoing link domains, traffic summary; pending spinner / timeout-with-report-link states.
- [x] Fixed pre-existing bug: Overview's urlscan banner read `urlscanData.submitted` but normalization nests data under `.details` — the banner never rendered. Now shows live status (running/complete + verdict summary) with a jump-to-Detonation button.
- [x] `npm run build` clean; `supabase functions deploy threat-intel` deployed.

**Notes:** URLResult intentionally not kit-migrated yet (focused wiring only; migration stays on the backlog). Redirect chain = urlscan Document-type requests — the mechanism that exposes two-stage phishing gate pages.

---

### Sprint 2026-08-13b — IPResult v2: Calibrated Verdict + Investigation-First Overview
**Agent:** GitHub Copilot CLI (Claude Fable 5)
**Scope:** Make the calibrated scoring the headline, restructure IPResult around the analyst workflow (Tor/VPN/abuse/location at a glance), and cut redundant chrome.

**Completed:**
- [x] **Calibration pass 2 (field-tested)**: Spamhaus hard-capped at 25 (XBL 85→25 medium, SBL 50→12 low) — a mail-reputation feed can corroborate but never drive the verdict. AbuseIPDB re-curved: confidence ≥50 scores as-is (high), but any recent verbose reports now score on their own merit (30 base + 8/extra report + conf/2, cap 65, medium) instead of inheriting a near-zero community confidence (+9 for brute-force + port-scan reports was way off). Deployed via `supabase functions deploy threat-intel`.
- [x] Fullscreen fix: `ResultShell` content no longer capped (`max-w-7xl` removed) — fills maximized windows.
- [x] Sources tab loads all cards expanded (close what you don't need).
- [x] **Calibrated verdict is now the headline** in `IPResult.tsx`: header pill + score come from `result.scoring` (verdict/calibrated) instead of legacy `isMalicious`/`overallThreatScore` (legacy floors at 50 on any single-source hit and adds +25 for any Spamhaus listing incl. PBL — the calibrated engine already handles PBL=0/SBL=50/XBL=85, Tor=+12 note, VPN=0). Legacy retained as fallback when `scoring` is absent; copy-summary notes legacy divergence.
- [x] **Signal-lights row** (`SignalLight` in `ResultPrimitives.tsx`, rendered via new `ResultShell` `signals` prop): fixed-position TOR / VPN(+provider) / PROXY / HOSTING chips that "come on" when detected, plus a country chip — one-second read for analysts.
- [x] **Overview merged with Network + Location** (tabs removed, 9 → 6): two-column fullscreen-friendly layout — left: Context card (location/org/ISP/ASN/hosting/anonymity, proMode adds coords + Team Cymru BGP) and Score Drivers card (top calibrated contributions with weight pills + jump to Verdict tab); right: AbuseIPDB and VirusTotal cards.
- [x] **Clickable report detail**: AbuseIPDB card expands to the actual verbose `reports[]` (category chips via official taxonomy map, date, reporter country, comment); VirusTotal card expands to the flagging engines from `last_analysis_results`. Frontend-only — data was already in the payload.
- [x] **VPN tab aggregates provider names across ALL sources** (`collectProviderReports`): ProxyCheck (operator/network), IP2Proxy, IPQualityScore, VPNAPI.io, IPHub, ThamOS VPN DB — per-source detection + named provider table, plus ProxyCheck operator deep-dive. Fixed ProxyCheck v3 nesting (result lives under the IP key; previous code read `.operator` off the envelope and always missed).
- [x] **Raw JSON tab removed** (fully redundant with Sources + header Copy JSON); Sources cards are now click-to-expand accordions showing per-provider raw JSON without the proMode gate or 5-source cap.
- [x] `ResultShell` content width widened `max-w-5xl` → `max-w-7xl` for fullscreen use.
- [x] `npm run build` passes; lint flags match the pre-existing result-page `no-explicit-any` baseline (kit files clean).

**Decisions Made:**
- Verdict stays a separate tab (full contribution/variance breakdown); Overview answers "why" via top-3 score drivers with a jump link.
- Geo-context weighting (expected-country = CA for the school board) deliberately deferred — it's a scoring-policy change in the edge function, not a layout concern.

**Deferred / Next Sprint:**
- Geo-context scoring layer (non-CA + no VPN flag) in `threat-intel` edge function; consider retiring the legacy score outright once Bulk Lookup/History consumers are migrated.
- Migrate URL/Domain/Hash/CVE/Email/Wallet/Extension result pages onto the result kit (IPResult v2 is the template — including SignalLight + expandable evidence patterns).
- Restyle `VerdictStrip`/`VerdictPanel` internals to tokens.ts.

### Sprint 2026-08-13 — Icon Identity + IP-First Result Restructure
**Agent:** GitHub Copilot CLI (Claude Fable 5)
**Scope:** Tighten Desktop icon/app identity and rebuild IPResult as the first Desktop-native result page.

**Completed:**
- [x] Added `ThamosLogoIcon` (hex plate + T circuit trace) in `icons.tsx`; replaced the "T6" text glyph in the Taskbar launcher button.
- [x] Redrew the app icon set with app-specific silhouettes (same 24px/1.5px stroke grammar): radar Scanner, differentiated Terminal vs VPS Terminal, sliders Settings, broadcast Intel, briefcase Cases, folder+branch Files, I-beam Editor, pulse Monitor, `[.]` Defang, envelope+lens Email Analyzer, doc+arrow IOC Extractor, list+lens Bulk Lookup, puzzle-in-scanframe Extension Scanner, orbital Thamos orb.
- [x] Rationalized `appRegistry.ts` accent colors by category (core=distinct hues, workspace tools=teal, transform utils=cyan, analyzers=amber, system=slate, all result windows=accent); added `palette.slate` to `tokens.ts`; documented the logic in a registry comment.
- [x] Built shared result kit in `src/components/results/`: `ResultShell` (header + tabs/sidebar variants + loading/error/empty states), `MetricCard`/`StatCell`, `Pill`/`SectionHeader`/`Callout`/`ResultCard`, `SummaryActions` — all tokens.ts-driven, typography.ui chrome, mono reserved for IOC values.
- [x] Rewrote `IPResult.tsx` on the kit: removed scanline overlay, neon text glow, hardcoded slate/cyan Tailwind, and uppercase-tracking styling; kept all sections (overview/verdict/network/threats/vpn/location/pivot/sources/raw), proMode, `VerdictStrip`/`VerdictPanel`/`RelatedIOCs`; added a real empty state; typed the untyped `result.sources` access.
- [x] `npm run build` passes; no new typecheck/lint errors introduced (remaining `any` flags match the pre-existing result-page baseline).

**Decisions Made:**
- Identity color lives only in icon tiles; result windows share a single accent to read as one scanner surface.
- The result kit renders a Tactical sidebar variant and a Desktop tab variant from one shell, so the shared page stays honest in both themes.

**Deferred / Next Sprint:**
- Migrate URL/Domain/Hash/CVE/Email/Wallet/Extension result pages onto the result kit (IPResult is the template).
- Restyle `VerdictStrip`/`VerdictPanel` internals to tokens.ts (still Tailwind slate; visually acceptable inside the new shell).
- App naming/description identity pass beyond icons.

### Sprint 2026-08-07 — Workstation Login Simplification
**Agent:** Codex
**Scope:** Remove the SaaS-style sign-in presentation and make credential login feel native to the Desktop shell.

**Completed:**
- [x] Replaced the marketing-led split layout with a compact Linux-style login box over the Nexus background.
- [x] Made email/password the immediate default and moved Microsoft/Google into a collapsed optional section.
- [x] Preserved password recovery and the existing provider wiring without adding new authentication behavior.

**Decision:** Sign-in is OS chrome, not a product landing page.

### Sprint 2026-08-05 — Identity, Login, Desktop Shell + Browser
**Agent:** Codex
**Scope:** Give ThamOS a clearer visual identity, add a real signed-out entry experience, and bring the Desktop shell and internal browser to the same quality bar.

**Completed:**
- [x] Added a full-screen ThamOS sign-in experience using the existing Supabase email/password, password-reset, Microsoft/Entra, and Google flows.
- [x] Made Desktop the fallback for new profiles while preserving every stored or profile-level theme choice.
- [x] Introduced reusable colored app-icon tiles and applied them consistently to the desktop, command center, taskbar, window chrome, and Mission Control.
- [x] Replaced the wordy Applications taskbar control with a compact T6 command mark and rebuilt the launcher as a centered command center.
- [x] Reworked the internal browser chrome and home screen around calm near-black surfaces, clear navigation, and app-level color rather than neon fill.
- [x] Added the optional original `Nexus` wallpaper and a dedicated ThamOS favicon; existing wallpapers and user choices remain available.
- [x] Replaced joke/placeholder page metadata with production-facing ThamOS T6 identity copy.

**Decisions Made:**
- ThamOS is not a Windows replica: its identity is deep black operational surfaces, a blue-violet atmospheric canvas, and restrained color on compact interactive objects.
- Email/password is the default workstation login. Microsoft/Entra and Google remain optional routes because those flows already exist.
- Authentication UI states only what the application can verify; tenant, device, network, and Conditional Access claims remain deployment concerns.

**Deferred / Next:**
- Configure and verify production OAuth redirect URLs and the final Entra tenant/Conditional Access policy.
- Continue Desktop-native scanner/result composition and responsive small-screen work.

### Sprint 2026-08-05 — Longitudinal IP Graph Foundation
**Agent:** Codex
**Scope:** Turn the primary IP scanner's static relationship list into a cumulative, time-aware investigation surface.

**Completed:**
- [x] Added append-only `scan_observations` history for persisted IP scans, with analyst-scoped reads, verdict/score, enrichment snapshot, source list, and timestamp.
- [x] Added an atomic `record_ioc_relationship` database function so repeated relationships increment their observation count and extend first/last-seen windows.
- [x] Recorded neutral IP context edges for ASN, country, region, ISP/organization, and named VPN provider, alongside existing pDNS and certificate edges.
- [x] Replaced the flat Related IOCs list with graph, relationship, and scan-history views using the restrained operator theme.
- [x] Wired scannable graph nodes back into the Tactical and Desktop scanner flows.

**Decisions Made:**
- Scan events and graph edges are separate layers: events preserve each investigation; edges summarize recurring infrastructure relationships.
- Geography/provider/ASN links are contextual facts, never malicious verdicts by association.
- Personal scan history is readable only by its analyst under current Supabase RLS. Shared tenant aggregation must be designed explicitly during the tenant migration.

**Deferred / Next:**
- Apply observation recording to domain, hash, URL, email, document, CVE, wallet, and extension scans.
- Add case/document/email edges, recurrence de-biasing, time filters, clusters, and the world-map/intel-feed layer.
- Deploy the migration and Edge Function before expecting production scans to populate the new layers.

### Sprint 2026-08-05 — Operator Workstation Theme + State Reconciliation
**Agent:** Codex
**Scope:** Reduce visual noise in the Desktop shell and primary scanner, fix small Desktop regressions, and reconcile current product/deployment direction.

**Completed:**
- [x] Reworked global Desktop tokens to restrained graphite surfaces and muted semantic colors.
- [x] Follow-up contrast pass: shifted large surfaces and chrome to near-black and restored subdued app identity colors to icons after the first graphite pass read as overly monochrome.
- [x] Replaced neon active-window halos and macOS traffic lights with neutral Linux-style chrome.
- [x] Converted the launcher into a compact Applications menu and reduced color competition in the taskbar, desktop icons, and Mission Control.
- [x] Made the near-black Obsidian wallpaper the default for new local profiles while preserving existing saved wallpaper choices (`default` storage ID retained for compatibility).
- [x] Simplified the primary scanner around IP-first IOC investigation; removed fake session/latency/security telemetry, random source dots, scanlines, and oversized branding.
- [x] Added honest detection badges for CVE, wallet, and email and wired recent investigations to reopen their result flow.
- [x] Fixed the Desktop Terminal prompt printing literal `\u279C`; it now renders `➜`.
- [x] Persisted window `data` and minimized state so restored result windows retain their IOC payload.
- [x] Updated `AGENTS.md` and this state document with current theme rules and the full in-tenant Azure Functions/Key Vault direction.

**Decisions Made:**
- IP reputation remains the anchor scanner workflow; Desktop Terminal and graphical Scanner are both first-class entry points.
- Visual authority comes from hierarchy and evidence, not decorative neon or simulated telemetry.
- Full tenant migration supersedes the older external companion split. PII and tenant data remain inside the tenant.
- TopDesk is not an active priority.

**Deferred / Next:**
- Desktop-native result composition and Case Manager handoffs.
- Longitudinal Threat Graph: observation history, infrastructure/provider/geography entities, temporal clustering, and a real pivot canvas.
- Tenant architecture for Azure Functions, Key Vault, Entra, Log Analytics/Data Lake, and document/URL detonation.

### Sprint 2026-07-03 — Scanner: close the detection→result gap (CVE / wallet / email) + graphify RAG
**Agent:** Claude Fable 5 (Claude Code)
**Scope:** Set up graphify knowledge-graph RAG, then wire the scanner's detected-but-dead IOC types to their existing backends.

**Completed:**
- [x] Set up graphify (`graphify-out/`: graph.json, graph.html, GRAPH_REPORT.md, Obsidian vault + graph.canvas). `graphify-out/` gitignored; rebuild with `graphify update .` (AST-only, no tokens). CLAUDE.md + PreToolUse hooks added by `graphify claude install` (note: hooks call `python3`, the MS Store stub on this machine, so they no-op harmlessly).
- [x] **Root cause found:** `detectIOCType` recognizes 9 IOC types but every result switch only handled ip/url/domain/hash. The `threat-intel` edge function already serves `/cve`, `/wallet`, `/email` (full NVD+KEV+EPSS / blockchain.info+ethplorer / DNS+EmailRep+HIBP) — but the frontend had no client fns or result pages, so those verdicts were unreachable.
- [x] Added `lookupCVE`, `lookupWallet`, `lookupEmail` to `src/lib/threatIntel.ts` + types (`CVELookupResult`, `WalletLookupResult`, `EmailLookupResult`).
- [x] New result pages: `src/pages/results/{CVEResult,WalletResult,EmailResult}.tsx` (tactical house style; CVE has KEV banner + CVSS/EPSS, wallet has sanctions/balance, email has SPF/DMARC/MX + breach/reputation).
- [x] Wired cve/wallet/email through all live routers: `App.tsx` (tactical + terminal switches), `components/desktop/DesktopScanner.tsx`, and `DesktopLayout.tsx` `renderWindowContent` (cve-result/wallet-result/email-result now render real pages instead of a `DesktopScanner initialScan` placeholder).
- [x] **Extension consistency fix:** Desktop smart-scanner now routes detected extensions to `ExtensionScanner` (was dead-ending on "coming soon" while Tactical already routed it).
- [x] **Cleanup:** deleted `src/pages/DesktopScanner.tsx` — the unreachable fake-CLI (mock nmap/whois/git + hardcoded "VirusTotal CONNECTED"); its only caller was the never-invoked `renderDesktopPage()` in `App.tsx`, also removed. Removed the dead `ExtensionResult` import.
- [x] Verified: `tsc` adds 0 new errors (baseline 123→117); `vite build` passes; graph updated.

**Decisions Made:**
- Detected email address → `/email` intel page (sender triage), NOT the `.eml` EmailAnalyzer — different artifacts.
- Did NOT auto-delete substantive unwired features (`OrchestraMode.tsx` 1220 lines, `IntelHub.tsx` 671) — those are salvage-or-delete decisions for the maintainer, not safe to nuke in auto mode.

**Deferred / Next:**
- Decide wire-vs-delete for orphans: `OrchestraMode.tsx`, `IntelHub.tsx`, `ExtensionResult.tsx` (dead result page), `AnalysisHistory.tsx`, and the abandoned scanner UI kit (`ActionsBar/EvidenceCard/KeyFacts/RawJsonCollapse/SourceStatus`).
- Community labels reset to placeholders on `graphify update`; re-label with `graphify label .` if a Gemini key is set.
- Add "Send to Case" from the new CVE/wallet/email result pages.

### Sprint 2026-06-19 — Email Workbench Phase 1
**Agent:** GitHub Copilot CLI (GPT-5.5)
**Scope:** Built the first Desktop Email Workbench slice from the t1 bridge findings.

**Completed:**
- [x] Refactored `src/pages/EmailAnalyzer.tsx` result mode into a two-pane workbench: safe reconstructed message preview on the left, evidence tabs on the right.
- [x] Added a sanitized inert HTML email preview path using the existing `bodyHtmlPreview` returned by `analyze-email`; scripts, forms, remote loads, styles, active media, and live link navigation are stripped before rendering.
- [x] Preserved the existing t6 forensic pipeline: `.eml` upload, server parse, Defender/EOP signals, SafeLinks/base64 handling, attachments, IOC enrichment, grounded THAMOS verdict, and encrypted Save to Workbench.
- [x] Made enrichment and Save to Workbench failures visible instead of silently swallowing them.
- [x] Added dedicated mail-preview design tokens in `src/design-system/tokens.ts` instead of hardcoding Outlook-style preview colors in the component.
- [x] Cleaned local `EmailAnalyzer.tsx` lint debt touched by this sprint (`any` casts, regex escapes, AppId typing).

**Validation:**
- `npx eslint src/pages/EmailAnalyzer.tsx src/design-system/tokens.ts` passes.
- `npm run build` passes.
- `npm run typecheck -- --pretty false` still fails on the existing repo-wide baseline; no `EmailAnalyzer.tsx` or `tokens.ts` errors remain in the output.

**Deferred / Next Sprint:**
- Add "Send to Case" directly from Email Workbench.
- Add workbench history/recall for encrypted saved `.eml` artifacts.
- Consider a richer URL hover/inspection overlay in the safe preview, backed by extracted IOC data rather than live anchors.

### Sprint 2026-06-19 — Desktop-First Architecture Audit
**Agent:** GitHub Copilot CLI (GPT-5.5)
**Scope:** Reviewed architecture docs, upgrade path, Supabase migrations/functions, Desktop shell, scanner, verdict, case, T6, and theme/auth surfaces.

**Completed:**
- [x] Confirmed product direction from maintainer: Desktop is the new standard mode replacing Tactical; Tactical should be treated as legacy/compat unless explicitly targeted.
- [x] Verified GitHub push access via `gh auth status`, Supabase CLI availability, linked project ref, and local/remote migration parity through `20260618002000`.
- [x] Confirmed core drift pattern: backend/Tactical capabilities exist but are not consistently surfaced in Desktop.
- [x] Confirmed Desktop is not yet the default in `themecontext.tsx`; fresh visitors still fall back to Tactical.
- [x] Confirmed CVE, wallet, and email threat-intel endpoints/tables exist, but frontend client/result routing is incomplete.
- [x] Confirmed Desktop scanner and result windows still dead-end or placeholder some detected IOC types.
- [x] Confirmed verdict tables/functions exist but history/recall UI is still missing.
- [x] Confirmed Case Manager is not yet the investigation spine: scans, verdicts, email analysis, and T6 syntheses need "Send to Case" wiring.
- [x] Confirmed T6 has manual context snippets but no automatic scan/email/verdict context injection.
- [x] Ran `npm run typecheck`; current baseline fails with existing TypeScript errors, including active Desktop issues.
- [x] Reviewed the `C:\Thamos\t1` PhishBowl reference project for the Email Analyzer bridge. Useful source material is the Outlook-style shell (`OutlookLayout.tsx`), inbox/message/side-panel interaction (`Simulator.tsx`), URL hover/reveal pattern (`UrlTooltip.tsx`), and structured red-flag explanation model (`ThinkBreakdownCard.tsx`).
- [x] Confirmed t6 already has the stronger forensic foundation for email work: MIME parsing, Defender/EOP header intelligence, SafeLinks/base64 artifact handling, attachment triage, grounded email verdicts, encrypted `.eml` persistence, and non-PII IOC graph edges.

**Decisions Made:**
- Desktop-first work should take priority over Tactical parity. New login/default-theme work should land in the Desktop shell.
- Next upgrades should surface existing capabilities before adding more backend sources.
- The tenant companion/data-egress contract should enforce: indicators may leave the tenant; identities, raw email, and body text should remain tenant-side.
- The t1 bridge should be adapted as an analyst Email Workbench UX, not ported as a training simulator. Reuse the Outlook-like reader concept and side-by-side red-flag explanation pattern, but keep t6's parser/verdict/persistence pipeline as the source of truth.
- Do not reuse t1's `dangerouslySetInnerHTML` email-body renderer directly. Any email recreation in t6 must be sanitized/isolated, link-disabled or defanged, and unable to load active remote content.

**Deferred / Next Sprint:**
- Make Desktop the default entry mode and design the OS-style login screen.
- Fix Desktop/typecheck blockers.
- Add Desktop result/client support for CVE, wallet, email, and extension flows.
- Add "Send to Case" across scan results, IOC verdicts, email verdicts, and T6 synthesis.
- Add verdict history/workbench recall surfaces.
- Update `UPGRADE_PATH.md` with a Desktop-first resurfacing roadmap.
- Refactor Email Analyzer into a Desktop Email Workbench: reconstructed/safe message preview on one side; Defender/auth/body/IOC/attachment/verdict flags on the other; save-to-workbench and pivot-graph actions visible without hiding the email.

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
