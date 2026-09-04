# Agent Operating Standards — ThamOS v6

> **For:** Kimi Code CLI, Claude Code, Cursor Agent, GitHub Copilot Chat, or any other AI coding agent
> **Project:** ThamOS v6 — Browser-based Threat Intelligence OS (https://t6.thamOS.ca)
> **Maintainer:** hdcsnags / thamos6.git
> **Last Updated:** 2026-08-05

---

## Mandatory Read Order

When starting cold on this project, **read these files in this exact order**:

1. **`ARCHITECTURE.md`** — System overview, data flow, database schema
2. **`ARCHITECTURE_V2.md`** — V2 unified scanner architecture, component hierarchy
3. **`MODULAR_GUIDE.md`** — Per-module file listings and dependencies
4. **`THAMOS_STATE.md`** — Current project state, completed work, pending work, audit findings
5. **`AGENTS.md`** — This file (operational standards)

**Do not skip `THAMOS_STATE.md`.** It contains the most current information about what has been built, what is broken, and what is prioritized. The architecture docs are authoritative for design but may be stale on completion status.

---

## Project Structure Reality Check

### Four Themes Exist (Not Two)

The architecture docs historically documented only **Tactical** and **Terminal** themes. There are **four** themes:

| Theme | Code Location | Router Entry |
|-------|--------------|--------------|
| `tactical` | `src/components/Layout.tsx` | `App.tsx` → `<Layout>` |
| `terminal` | `src/components/terminallayout.tsx` | `App.tsx` → `<TerminalLayout>` |
| `desktop` | `src/components/desktop/DesktopLayout.tsx` | `App.tsx` → `<DesktopProvider>` + `<DesktopLayout>` |
| `mission-control` | Legacy theme value; no dedicated `App.tsx` branch | Use the Desktop overlay instead |

**Desktop is the product direction and the most complete theme.** Fresh sessions now default to Desktop in `themecontext.tsx` (stored theme choices are still respected). If asked to work on "the UI" without specification, assume Desktop unless the user says otherwise. Tactical and Terminal are compatibility shells: do not migrate their Tactical-only pages (`IPLookup`, `URLScanner`, `HashLookup`, `DomainIntel`, `Settings`, `Admin`, `History`, `NewsFeed`, `IntelHub`, `CaseNotes`, `Layout`, `terminallayout`, `Terminal*Result`) unless explicitly asked; they still carry Tailwind palette classes and the pre-existing `tsc` errors.

### Result pages use the shared result kit

Every scanner result page (`src/pages/results/*Result.tsx`) renders through `src/components/results/` (`ResultShell`, `ResultCard`, `MetricCard`, `StatCell`, `Pill`, `Callout`, `SignalLight`, `SummaryActions`). `ResultShell` picks `variant="tabs"` in Desktop and `variant="sidebar"` in Tactical, so one page serves both themes. Rules:

- Every result component accepts `onScan?: (type, value) => void` and renders pivot affordances (resolved IPs, detonation domains, cert subdomains, "Full domain report", "Detonate root") only when it is provided. `renderWindowContent` in `desktop/DesktopLayout.tsx` passes a pivot that opens sibling result windows; `DesktopScanner` and `App.tsx` pass their own handlers.
- Sources tabs must be honest: `Error` (rose), `Key missing` (amber, for 401/403/"not configured"), `Not listed`/`No data` (neutral), `Flagged` (rose), `OK` (green only for a real verified state).
- No Tailwind palette classes in result pages, scanner components, or Desktop-rendered tools. Verify with the grep in the "Testing" section below.

### Type-check baseline (honest)

`npm run typecheck` is **not** clean. As of 2026-09-04 it reports ~60 pre-existing errors, all in Tactical-only pages and a few Desktop shell files (`DesktopCaseManager`, `ToastNotifications`, `SpotlightSearch`, `IntelHub`, `CaseNotes`, `Layout`, `IPLookup`, …). Earlier sprint notes claiming a zero-error baseline were wrong. The rule is: zero errors in files you touch; do not add new ones. `npm run build` (Vite) does not type-check, so a passing build is not evidence of type safety.

**Mission Control reality:** the working implementation is the window-overview overlay inside `src/components/desktop/DesktopLayout.tsx`, toggled with `Ctrl+Shift+M`. The `mission-control` theme value is legacy/incomplete routing and should not be treated as a separate finished shell.

### Key Directories

```
src/
  components/
    desktop/           ← Desktop theme ONLY (active, most complete)
    scanner/           ← Shared scanner components
    editor/            ← CodeMirror editor components
    Layout.tsx         ← Tactical mode layout
    terminallayout.tsx ← Terminal mode layout
  contexts/
    DesktopContext.tsx ← Window manager state for Desktop theme
    themecontext.tsx   ← Theme switcher (tactical | terminal | desktop | mission-control)
  design-system/
    tokens.ts          ← Colors, typography, shadows, spacing (source of truth)
    appRegistry.ts     ← App definitions, icons, metadata for Desktop theme
  pages/
    results/           ← Tactical-themed result pages (reused in Desktop windows)
    Scanner.tsx        ← Unified scanner entry point
    [...other pages]
```

The old `src/components/DesktopLayout.tsx` monolith has been deleted. The only active Desktop layout is `src/components/desktop/DesktopLayout.tsx`.

---

## Design System — Source of Truth

### Colors (`src/design-system/tokens.ts`)

```typescript
palette.void      // '#030405' — Near-black desktop/taskbar foundation
palette.base      // '#080a0c' — Main black panel background
palette.elevated  // '#0d1013' — Window/content background
palette.float     // '#14191e' — Active title bars and floating controls
palette.surface   // '#1b2228' — Selected/hovered surface

palette.accent    // '#3399d8' — Primary interactive accent
palette.green     // '#43b77b' — Success / terminal prompt
palette.amber     // '#d5a044' — Warning
palette.rose      // '#d86473' — Danger
```

**Rule:** Do not hardcode colors. Import from `tokens.ts`. If a color doesn't exist there, add it.

### Typography

```typescript
typography.ui   // 'Inter, system-ui, -apple-system, sans-serif'
typography.mono // "'JetBrains Mono', 'Fira Code', monospace"
```

**Rule:** Desktop chrome and ordinary application UI use `typography.ui`. Use `typography.mono` only for commands, IOCs, hashes, logs, code, and evidence that benefits from fixed-width alignment.

### Visual Direction

Desktop follows a restrained Kali/Ubuntu-inspired **operator workstation** direction:

- Near-black surfaces carry the hierarchy; cool charcoal is reserved for elevation rather than filling the entire interface.
- App identity colors belong in compact icon tiles and selected states. Keep large surfaces neutral and reserve strong semantic color for state.
- Signed-out users are gated by `src/components/auth/SignInScreen.tsx`; email/password is the default Linux-style login, with Microsoft and Google collapsed under optional sign-in methods.
- New profiles default to Desktop. Existing stored/profile theme selections remain respected.
- Do not add neon glows, decorative telemetry, fake latency/session/security claims, scanlines, or cyber-HUD ornament outside explicitly themed terminal content.
- Application icons are neutral by default. Use accent/semantic color for selection, activity, warnings, and verdicts.
- Window structure should come from border, surface, and shadow—not a per-app colored halo.
- Status colors must convey real state. “Green” means a verified positive state, not decoration.

### App Registry (`src/design-system/appRegistry.ts`)

All Desktop apps are defined here. If you add a new desktop app, you **must**:
1. Add it to `appRegistry`
2. Add it to `AppId` type in `DesktopContext.tsx`
3. Add a case in `renderWindowContent` in `desktop/DesktopLayout.tsx`

**Current launchable apps:** terminal, VPS terminal, scanner, browser, Thamos/Maestro, intel dashboard, case manager, file manager, code editor, system monitor, settings, decoder, defang/refang, email analyzer, IOC extractor, bulk lookup, extension scanner, and document analyzer. Result-window IDs for IP, URL, domain, hash, extension, CVE, wallet, and email are also registered.

### Primary Scan Workflows

- IP reputation is the primary scan workflow.
- Desktop Terminal is a first-class scanner interface: `scan -ip 8.8.8.8`, `scan -hash <value>`, or auto-detect with `scan <value>`.
- The graphical Scanner must stay consistent with the terminal routes and `detectIOCType`; when a new IOC type is detected, it must have an honest result route.

### Threat Graph Data Rules

- `scan_observations` is the append-only event layer. Do not collapse repeat scans into a single mutable row.
- `ioc_relationships` is the cumulative graph layer. Write through `record_ioc_relationship` so observation counts and first/last-seen windows advance atomically.
- ASN, provider, organisation, VPN, country, and region nodes are context. Never infer a malicious verdict from association alone.
- Keep sensitive scan history analyst/tenant scoped. The shared relationship graph must remain non-PII unless a future tenant-isolated schema explicitly changes that boundary.
- The current longitudinal implementation is IP-first. When adding another scanner route, record its observation and typed edges deliberately; do not claim full graph coverage until that route writes both layers.

---

## Desktop Theme — Architecture Rules

### Window Lifecycle

All window operations go through `DesktopContext`:

```typescript
const desktop = useDesktop();
desktop.openWindow({ appId: 'terminal', title: 'Terminal' });
desktop.closeWindow(windowId);
desktop.minimizeWindow(windowId);
desktop.maximizeWindow(windowId);
desktop.restoreWindow(windowId);
desktop.focusWindow(windowId);
desktop.moveToWorkspace(windowId, 2);
desktop.togglePinWindow(windowId);
```

### Adding a New Desktop App

1. **Create component** in `src/components/desktop/DesktopMyApp.tsx`
2. **Register in `appRegistry.ts`** with icon, accent color, default size
3. **Add to `AppId` type** in `src/contexts/DesktopContext.tsx`
4. **Add case to `renderWindowContent`** in `src/components/desktop/DesktopLayout.tsx`
5. **Add to App Launcher** (automatic via `appRegistry` + `getLaunchableApps()`)
6. **Optionally add to desktop icons** via `showOnDesktop: true` in registry

### Keyboard Shortcuts

Desktop shortcuts are defined in `DesktopLayout.tsx` (the `handleKeyDown` listener). If you add a new global shortcut, register it there **and** add it to the `ShortcutsOverlay` component in the same file.

### Context Menus

Use the `ContextMenu` system:

```typescript
import { useContextMenu } from './ContextMenu';
const { showContextMenu } = useContextMenu();

showContextMenu(e.clientX, e.clientY, [
  { label: 'Open', icon: '📂', action: () => { ... } },
  { type: 'divider' },
  { label: 'Delete', icon: '✕', action: () => { ... }, danger: true },
]);
```

---

## Code Style & Standards

### General Rules

- **TypeScript strict mode is on.** No `any` without justification.
- **TailwindCSS for layout**, inline styles for dynamic/theme values.
- **No inline color strings.** Import from `tokens.ts`.
- **Component files:** PascalCase (`DesktopWindow.tsx`)
- **Utility files:** camelCase (`useDesktop.ts`)
- **Constants:** UPPER_SNAKE_CASE in component scope

### Desktop Theme Specific

- Windows use `palette.elevated` for background, `palette.surface` for title bar.
- Active window border uses `accentBorder(accentColor, 0.3)`.
- Inactive windows use `opacity: 0.85`.
- Border radius: `12px` for windows, `0` when maximized.
- All animations use `cubic-bezier(0.25, 0.1, 0.25, 1)` unless spring physics are intended.
- Minimum window size: `400x300` (`MIN_WIDTH` / `MIN_HEIGHT` in `DesktopWindow.tsx`).

### What NOT to Do

- **Do not modify `src/components/DesktopLayout.tsx`** (old dead code). Use `src/components/desktop/DesktopLayout.tsx`.
- **Do not add new themes** without updating `themecontext.tsx`, `App.tsx`, and `THAMOS_STATE.md`.
- **Do not hardcode app metadata** outside `appRegistry.ts`.
- **Do not bypass `DesktopContext`** for window state mutations.

---

## Testing & Verification

### Before Committing Desktop Changes

1. **Verify window operations:** Open, close, minimize, maximize, restore, drag, resize.
2. **Verify keyboard shortcuts:** All shortcuts in `ShortcutsOverlay` still work.
3. **Verify context menus:** Right-click on desktop, title bar, taskbar, icons.
4. **Verify workspace switching:** Ctrl+1-4, pinned windows appear on all desks.
5. **Verify layout persistence:** Refresh page — windows should restore positions.
6. **Verify no new TypeScript errors:** `npm run typecheck` — zero errors in the files you touched (see the baseline note above; `npm run build` does not type-check).
7. **Verify no palette classes crept in** (result pages, scanner components, Desktop tools):
   ```bash
   grep -noE "(text|bg|border|from|via|to|ring)-(slate|gray|zinc|cyan|emerald|rose|violet|amber|sky|red|green|blue|purple|yellow|orange|pink|indigo|fuchsia|white|black)(-[0-9]{2,3})?(/[0-9]+)?" src/pages/results/*.tsx src/components/results/*.tsx src/components/scanner/*.tsx src/components/bulk/*.tsx src/components/extension/*.tsx
   ```
   Expected output: nothing.

### Quick Manual Test Script

```bash
# Build check
npm run build

# If you have the dev server running:
# 1. Switch to Desktop theme (if not default)
# 2. Open Terminal (double-click icon or Ctrl+K → search)
# 3. Open Scanner (second window)
# 4. Drag windows, snap to edges
# 5. Minimize one, restore from taskbar
# 6. Switch workspaces (Ctrl+2, Ctrl+1)
# 7. Right-click desktop → New Terminal
# 8. Close all, refresh — verify layout restore
```

---

## Git & Commit Standards

### Commit Message Format

```
[theme] brief description

- What changed
- Why it changed
- Any breaking changes
```

Examples:
```
[desktop] add SVG icon set replacing emojis

- Replaced all emoji icons in appRegistry with custom SVG components
- Added Icon component to render SVGs consistently
- No breaking changes; icon prop now accepts ReactNode
```

```
[docs] update ARCHITECTURE.md with Desktop theme

- Added Desktop theme section to Dual Interface System
- Updated project structure to include desktop/ directory
- Documented window manager architecture and keyboard shortcuts
```

### When to Update Documentation

**Always update docs when:**
- Adding a new theme or module
- Changing the project structure
- Adding new environment variables
- Modifying database schema
- Changing authentication/authorization logic

**Files to keep in sync:**
- `ARCHITECTURE.md` — High-level system design
- `ARCHITECTURE_V2.md` — Scanner architecture and data flow
- `MODULAR_GUIDE.md` — Per-module file listings
- `THAMOS_STATE.md` — Project state, completed work, pending work
- `AGENTS.md` — This file (if operational standards change)

---

## Sprint Completion Checklist

When you finish a code sprint, append to `THAMOS_STATE.md` Sprint Log with:

```markdown
### Sprint YYYY-MM-DD — Brief Description
**Agent:** [Your name/tool]
**Scope:** [What you worked on]

**Completed:**
- [ ] List of completed tasks

**Decisions Made:**
- Any architectural or design decisions

**Deferred / Next Sprint:**
- What was intentionally not done
```

---

## Emergency Contacts & Context

- **Public upstream:** `https://github.com/hdcsnags/thamos6` (`main` branch)
- **Local checkout note:** the transferred `C:\Thamos\SoFaSo\t6\thamos6-main` folder currently has no `.git` metadata. Do not claim a push or commit from that folder until it is cloned from or explicitly linked to the upstream repository.
- **Production URL:** https://t6.thamOS.ca
- **Active theme:** Desktop (dark, terminal-centric with sidebar dock)
- **Backend:** Supabase (PostgreSQL + Edge Functions)
- **Build tool:** Vite + React 18 + TypeScript + TailwindCSS

### If Something Breaks

1. Check `THAMOS_STATE.md` Known Bugs section
2. Check `ARCHITECTURE_V2.md` Known Issues section
3. Verify you're modifying the correct file (check for dead code equivalents)
4. Test in Tactical mode — if it works there but not Desktop, the issue is in `src/components/desktop/`

---

## Agent Ethics

- **Be honest about limitations.** If you can't verify a fix works, say so.
- **Don't invent problems.** The user wants brutal honesty, not invented issues.
- **Prefer minimal changes.** The user values "minimal intrusions to existing code."
- **Frontend-first.** Unless explicitly asked, avoid Supabase/backend changes.
- **Preserve working code.** Don't break Terminal or Tactical modes when modifying Desktop.
- **Update the state document.** Always log your work in `THAMOS_STATE.md`.

---

## Deployment Direction (Current Decision)

The long-term target is a **full in-tenant deployment**, not the older external-enrichment/tenant-companion split:

- Migrate Supabase Edge Function responsibilities to Azure Functions where practical.
- Store third-party credentials and service secrets in Azure Key Vault; do not add new browser/localStorage credential storage.
- Use Entra ID and tenant controls as the security boundary.
- Keep raw email, identities, PII, Log Analytics/Data Lake results, and investigation artifacts inside the tenant.
- Gate application and service access through tenant identity, authorization, network controls, and—where appropriate—education-centre IP restrictions.
- Maestro/T6 access to Log Analytics or the Data Lake is future design work. Do not grant query or action authority implicitly.
- The TopDesk prototype was abandoned. Do not prioritize or extend it unless the maintainer explicitly revives it.
