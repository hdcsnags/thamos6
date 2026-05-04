# Agent Operating Standards — ThamOS v6

> **For:** Kimi Code CLI, Claude Code, Cursor Agent, GitHub Copilot Chat, or any other AI coding agent
> **Project:** ThamOS v6 — Browser-based Threat Intelligence OS (https://t6.thamOS.ca)
> **Maintainer:** hdcsnags / thamos6.git
> **Last Updated:** 2026-05-04

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
| `mission-control` | Stub only | `themecontext.tsx` type only |

**Desktop is the most complete theme** and is currently active in production. If you are asked to work on "the UI" without specification, assume Desktop theme.

### Key Directories

```
src/
  components/
    desktop/           ← Desktop theme ONLY (active, most complete)
    scanner/           ← Shared scanner components
    editor/            ← CodeMirror editor components
    Layout.tsx         ← Tactical mode layout
    terminallayout.tsx ← Terminal mode layout
    DesktopLayout.tsx  ← ⚠️ DEAD CODE (old monolithic version). Do not use.
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

**Dead code warning:** `src/components/DesktopLayout.tsx` (old 561-line monolithic version) is **not imported anywhere**. The active Desktop layout is at `src/components/desktop/DesktopLayout.tsx`.

---

## Design System — Source of Truth

### Colors (`src/design-system/tokens.ts`)

```typescript
palette.void      // '#050508' — Deepest background
palette.base      // '#0a0d12' — Desktop background
palette.elevated  // '#11141a' — Window backgrounds
palette.float     // '#181b22' — Floating elements
palette.surface   // '#1e222b' — Title bars, cards

palette.cyan      // '#00d9ff' — Primary accent
palette.green     // '#00ff9d' — Success / Terminal
palette.amber     // '#fbbf24' — Warning
palette.rose      // '#f43f5e' — Danger / Close button

palette.textPrimary    // '#e2e8f0'
palette.textSecondary  // '#94a3b8'
palette.textTertiary   // '#64748b'
palette.textDisabled   // '#475569'
```

**Rule:** Do not hardcode colors. Import from `tokens.ts`. If a color doesn't exist there, add it.

### Typography

```typescript
typography.ui   // 'Inter, system-ui, -apple-system, sans-serif'
typography.mono // "'JetBrains Mono', 'Fira Code', monospace"
```

**Rule:** Desktop theme uses `typography.ui` for chrome, `typography.mono` for content.

### App Registry (`src/design-system/appRegistry.ts`)

All Desktop apps are defined here. If you add a new desktop app, you **must**:
1. Add it to `appRegistry`
2. Add it to `AppId` type in `DesktopContext.tsx`
3. Add a case in `renderWindowContent` in `desktop/DesktopLayout.tsx`

**Current apps:** terminal, vps-terminal, scanner, browser, workshop (Maestro), intel, cases, files (GitHub), editor, monitor, settings.

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
6. **Verify no TypeScript errors:** `npm run build` or `tsc --noEmit`.

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

- **Project repo:** `thamos6.git` (hdcsnags)
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
