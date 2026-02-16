# ThamOS v2 -- Desktop Environment Redesign Brainstorm

**Purpose:** This document is for the AI development council. It provides an honest assessment of ThamOS v1's shortcomings, defines what makes something *feel like an OS*, identifies reference points from real desktop environments, and proposes the architectural/UX shifts needed for v2 to feel like a modern Linux DE (Kali's Xfce, GNOME, KDE Plasma) rather than a windowed web app.

**This is a brainstorm, not a spec.** The goal is to give every team member the same mental model so we converge on v2 rather than reinventing independently.

---

## 1. The Honest Problem

ThamOS v1 has functional window management -- drag, resize, snap, minimize, maximize, workspaces. But using it doesn't *feel* like using an OS. It feels like clicking through a web app that happens to have floating panels.

**The core issue is not missing features. It's missing interaction paradigms.**

A real OS has these qualities that v1 lacks:

| Quality | What it means | v1 Status |
|---------|---------------|-----------|
| **Surface interactivity** | Every pixel is a potential interaction target. Right-click anywhere, get a context menu. | Dead surfaces. Only buttons respond. |
| **System self-awareness** | The OS knows its own state -- CPU, memory, network, processes -- and surfaces it passively. | System Monitor exists but is a standalone app, not ambient information. |
| **Data continuity** | Window positions persist. Recent files are tracked. The OS remembers where you left off. | Full reset on every page load. No session persistence. |
| **App integration** | Clipboard works across apps. Files can be opened "with" apps. Drag from one window to another. | Apps are isolated islands. No inter-app communication. |
| **Visual physicality** | Layered shadows, backdrop blur, depth cues. Surfaces feel like they exist in space. | Flat solid colors with hard borders. No depth hierarchy. |
| **Ambient feedback** | Sounds, haptics, micro-animations on every interaction. The OS acknowledges your actions. | No animations, no transitions, no feedback beyond state changes. |
| **Progressive disclosure** | Simple on the surface, deep when you dig. Right-click reveals power features. | Everything is at the same depth. No layers of complexity. |

---

## 2. Reference Points -- What to Study

These are the real desktop environments v2 should learn from. Each does something specific well.

### 2.1 Kali Linux (Xfce)

**Why it matters:** This is the direct competitor/inspiration. Kali is a security-focused OS, and its DE choices are deliberate.

**What to take:**
- **Panel density.** Kali's top panel packs workspace switcher, app menu, quick launch icons, notification area, system tray (wifi, bluetooth, volume, battery, clock) into a single bar. Every pixel carries information.
- **Whisker Menu.** The app launcher is categorized (Favorites, Recently Used, Information Gathering, Vulnerability Analysis, Web Applications, etc.) -- security-specific categories, not generic. ThamOS should categorize by function: Scanning, Intelligence, AI, Cases, System.
- **Terminal centrality.** Kali launches with a terminal. The terminal isn't just an app -- it's the primary interface. v2 should make the terminal a first-class citizen that can be embedded, split, tabbed.
- **Thunar file manager.** Side pane with places/tree, toolbar with common actions, context menus on everything. The file manager ties the OS together.

### 2.2 GNOME 44+

**What to take:**
- **Activities overview.** Pressing Super shows all windows at once with a workspace strip on the side. This is the single most "this feels like an OS" interaction. v2 needs an equivalent -- a way to see everything at a glance.
- **Notification center.** The clock is the notification entry point. Click it, see a calendar + all notifications grouped by app. Not a separate window -- an overlay panel.
- **Quick Settings.** Dropdown from the system tray: toggles for wifi, bluetooth, night light, power mode. Sliders for volume and brightness. This is ambient control -- you adjust the OS without opening an app.
- **Application overview animations.** Windows scale and spread smoothly. Workspace transitions are animated. The physics make it feel real.

### 2.3 KDE Plasma 6

**What to take:**
- **Right-click everything.** Desktop, panel, window title bar, system tray icons -- every surface has a context menu with relevant actions. This is the deepest interaction paradigm difference between "web app" and "OS."
- **Panel customization.** Users can add/remove/move panel widgets. The panel is not fixed -- it's a canvas.
- **Window rules.** Per-app window rules (always open Terminal at position X, always maximize Browser). The OS learns your preferences.
- **Activities.** Multiple independent desktops with different wallpapers, widgets, and open apps. Goes beyond workspaces.

### 2.4 macOS Sonoma

**What to take:**
- **Visual refinement.** Translucent sidebars with backdrop blur. Layered shadows that indicate depth. Smooth, 60fps animations on everything.
- **Spotlight.** The search is OS-level -- searches apps, files, settings, web, dictionary, calculator. v2's Ctrl+K launcher should be this powerful.
- **Continuity.** State persistence across sessions. Open windows restore on reboot. Recent documents in the Dock.
- **Menu bar conventions.** Every app has a menu bar with standardized entries (File, Edit, View, Help). This creates consistency across apps.

---

## 3. Paradigm Shifts for v2

These are the fundamental changes in *how ThamOS works*, not just what it looks like.

### 3.1 Every Surface is Interactive

**Current:** Click buttons. That's it.
**v2:** Right-click on any surface and get a relevant context menu.

Context menus to implement:

| Surface | Right-click actions |
|---------|-------------------|
| Desktop background | New Terminal, New Scan, Paste IOC, Change Wallpaper, Display Settings, Sort Icons |
| Window title bar | Pin to All Workspaces, Move to Workspace 1/2/3/4, Always on Top, Close, Minimize, Maximize |
| Taskbar | Taskbar Settings, Add Separator, Show/Hide Workspaces |
| Taskbar window tab | Close, Pin, Move to Workspace... |
| Desktop icon | Open, Open With..., Remove from Desktop |
| Inside Terminal | Copy, Paste, Clear, Select All |
| Inside Scanner input | Paste, Scan Clipboard, Recent Scans |
| Intel article | Copy Link, Open in Browser, Add to Case |
| Case item | Edit, Delete, Export, Copy IOCs |

This is probably the single highest-impact change. It makes every pixel feel alive.

### 3.2 The OS is Self-Aware

**Current:** System Monitor is an app you open when curious.
**v2:** The system state is always visible, passively, in the panel.

**System tray indicators (always visible in taskbar/panel):**
- Network status icon (connected/disconnected, with edge function health)
- Agent mesh status (3 dots already exist -- good, but expand with tooltip showing last response time)
- Active scan count (pulsing icon when scans are running)
- Case count badge (open cases with unresolved status)
- CPU/memory indicator (simulated or real via Performance API)
- Notification bell with grouped notifications dropdown

**Ambient information display:**
- Taskbar should show total scans today, active threats found, agent availability at a glance
- When a scan is running in any window, the taskbar scanner icon should pulse
- When an AI agent responds, a brief notification toast should appear

### 3.3 State Persists Across Sessions

**Current:** Everything resets. Open windows, their positions, workspace assignments -- gone on reload.
**v2:** The OS remembers.

**What to persist (Supabase or localStorage):**
- Which windows were open, their positions, sizes, workspace assignments
- Active workspace number
- Terminal command history (already exists per session -- persist it)
- Last scan queries
- Workshop conversation that was active
- Browser open tabs and URLs
- Which sidebar panels were expanded/collapsed
- Desktop icon positions (if we allow rearrangement)

**Implementation approach:**
- On any window state change (move, resize, open, close), debounce-save the full window state to `localStorage` or Supabase `user_desktop_state` table
- On load, restore from saved state instead of opening default windows
- Provide a "Reset Desktop" option in settings/context menu for when things get messy

### 3.4 Apps Communicate

**Current:** Each window is an island. You can't even copy an IP from a scan result and have it pre-fill the scanner.
**v2:** Apps share a data bus.

**Inter-app communication patterns:**
1. **Clipboard bus:** When you click an IP/hash/URL/domain in any result, it goes to a ThamOS clipboard. The scanner input can "paste from clipboard." The terminal can reference `$CLIPBOARD`.
2. **Open With:** Right-click an IOC in any context and get "Scan this IP," "Add to Case," "Look up in Browser," "Query Agent X about this."
3. **Drag and drop:** Drag an IOC from a result window into the scanner to start a new scan. Drag an article from Intel into a Case to attach it.
4. **Event bus:** When a scan completes, emit an event. The System Monitor can listen and update counts. The notification system can show a toast.

**Proposed implementation:**
- A `DesktopEventBus` context or lightweight pub/sub system
- Events: `scan:started`, `scan:completed`, `case:updated`, `agent:response`, `clipboard:updated`
- Any app can emit, any app can subscribe

### 3.5 Visual Depth and Physicality

**Current:** Flat `#0a0e1a` backgrounds with `1px solid #1a1f35` borders. Every surface looks the same.
**v2:** Layered depth with blur, shadow, and subtle gradients.

**Depth hierarchy (4 levels):**

| Level | Use | Visual Treatment |
|-------|-----|-----------------|
| 0 - Desktop | Wallpaper, icons | No blur, no shadow |
| 1 - Panel | Taskbar, notification panel | `backdrop-filter: blur(20px)`, subtle border, 80% opacity background |
| 2 - Window | App windows | Distinct shadow (0 8px 32px rgba(0,0,0,0.5)), 1px border with accent glow when focused |
| 3 - Overlay | Context menus, dropdowns, modals, tooltips | Stronger blur, deeper shadow, higher z-index, slight scale animation on appear |

**Specific visual upgrades:**
- Windows should have a subtle gradient on the title bar (not flat solid)
- Active window should have a more dramatic shadow + border glow
- Inactive windows should desaturate slightly
- Minimizing should animate the window shrinking into the taskbar
- Maximizing should animate expansion
- Opening a new window should scale up from 95% with fade-in
- Closing should scale down to 95% with fade-out
- Context menus should appear with a fast scale + fade (100ms)
- Panel/taskbar should use `backdrop-filter: blur(16px) saturate(180%)` like macOS
- Tooltips should have a slight delay, then fade in

### 3.6 A Real Notification System

**Current:** A bell icon with a count. Clicking it opens the Intel Dashboard (a full app).
**v2:** A proper notification center with toasts and a dropdown.

**Components:**
1. **Toast notifications** -- Slide in from top-right, auto-dismiss after 5s. For: scan complete, agent response ready, new intel article, case updated.
2. **Notification dropdown** -- Click bell in taskbar, get a grouped list of recent notifications. Each is actionable (click to focus the relevant window).
3. **Notification grouping** -- Group by source (Scanner, Intel, Workshop, Cases). Show count per group.
4. **Read/unread state** -- Unread notifications have a cyan dot. Clicking marks as read. "Mark all read" button at top.

### 3.7 Activities/Overview Mode

**Current:** No way to see all windows at once. You have to click through taskbar tabs.
**v2:** A GNOME-style overview.

**Trigger:** Press a keyboard shortcut (Super or F3 or a dedicated "Overview" key), or click a dedicated button in the taskbar, or use a hot corner (move mouse to top-left).

**Behavior:**
- All windows in the current workspace scale down to fit on screen (like expose/mission control)
- Workspace thumbnails shown on the side or top, showing miniature previews
- Click a window to focus it and exit overview
- Click a workspace to switch to it
- Drag a window thumbnail between workspaces to move it
- Search bar at top to find and launch apps (converge with the existing Ctrl+K launcher)

This is the single most "wow, this feels like an OS" feature.

---

## 4. Component Architecture Changes

### 4.1 New Components Needed

| Component | Purpose |
|-----------|---------|
| `ContextMenu` | Reusable right-click menu with nested submenus, keyboard nav, icons |
| `NotificationCenter` | Dropdown panel from taskbar bell. Grouped, actionable notifications. |
| `Toast` | Slide-in notification with auto-dismiss. Stackable. |
| `OverviewMode` | Activities/expose view. Window thumbnails, workspace strip, search. |
| `SystemTray` | Expandable tray area in taskbar: network, audio, agent mesh, power |
| `QuickSettings` | Dropdown from system tray: theme toggle, notification mute, display settings |
| `PanelClock` | Click clock to get calendar + upcoming alerts dropdown |
| `DesktopEventBus` | Context provider for inter-app pub/sub communication |
| `SessionManager` | Handles persist/restore of window layout state |
| `WindowAnimations` | Wrapper or hook for open/close/minimize/maximize transitions |
| `SearchOmnibar` | Unified search: apps, recent scans, cases, IOCs, settings, commands |

### 4.2 Refactored Components

| Component | Changes |
|-----------|---------|
| `Taskbar` | Split into: start button, panel widgets area (pluggable), system tray, clock. Each section is its own component. |
| `DesktopWindow` | Add animation wrapper. Integrate with context menu system. Add menu bar support (optional per app). |
| `DesktopLayout` | Add context menu handler for desktop background. Add overview mode toggle. Integrate session restore. Add hot corners. |
| `AppLauncher` | Evolve into omnibar -- search apps, scans, cases, IOCs, settings. Categorize apps by function. Show recent/frequent. |
| `DesktopIcons` | Support drag-and-drop rearrangement. Right-click context menu. Persist positions. |

### 4.3 Shared Infrastructure (Extract from v1)

These are duplicated across v1 and need to be centralized:

| What | Current State | v2 Target |
|------|--------------|-----------|
| Color palette | `P` object copy-pasted in 5+ files | Single `src/lib/palette.ts` export |
| App definitions | Duplicated in 4 files | Single `src/lib/appRegistry.ts` with all metadata |
| Scan result utilities | Section/DataRow/getThreatColor duplicated 4x | Shared `src/components/scanner/shared.tsx` |
| Font family | Inline `style={{ fontFamily }}` everywhere | Set once on `body` in CSS |

---

## 5. The Panel/Taskbar Redesign

The taskbar is the most visible "this is an OS" signal. v1's taskbar is thin and sparse. v2 needs density and functionality.

### 5.1 Proposed Panel Layout (left to right)

```
[Activities] [App Menu] | [Workspace 1][2][3][4] | [...open window tabs...] | [Scan: 0 active] [Intel: 247] | [Agent X*][Y*][Z ] | [Net: OK] [Bell: 3] [Clock: 14:32]
```

**Breakdown:**

| Section | Contents | Behavior |
|---------|----------|----------|
| Activities button | ThamOS logo or grid icon | Opens overview mode |
| App Menu | "Applications" text or icon | Opens categorized app launcher (not just a grid -- a proper menu with categories like Kali's whisker menu) |
| Workspace strip | 4 workspace buttons with miniature window previews | Click to switch. Drag window tab onto workspace to move. Active workspace highlighted. |
| Window tabs | Tabs for each open window in current workspace | Click to focus/restore. Right-click for context menu. Middle-click to close. Icon + truncated title. Active tab has accent underline. |
| Status indicators | Active scan count, intel article count | Ambient information. Click to open relevant app. |
| Agent mesh | 3 dots with pulsing when active | Hover for detailed status. Click to open Workshop. |
| System tray | Network, notifications | Click network for connection details. Click bell for notification center dropdown. |
| Clock | Time + date | Click for calendar dropdown + upcoming alerts. |

### 5.2 Panel Visual Treatment

- Height: 40-44px (current is fine)
- Background: `rgba(10, 14, 26, 0.75)` with `backdrop-filter: blur(20px) saturate(150%)`
- Top border: `1px solid rgba(200, 205, 224, 0.08)` (subtle light edge for depth)
- Window tabs should have a subtle background on hover, accent-colored underline when active
- System tray icons should be monochrome with accent color on hover/active

---

## 6. Window Management Upgrades

### 6.1 Animations

| Action | Animation |
|--------|-----------|
| Open | Scale from 0.95 to 1.0, opacity 0 to 1, 150ms ease-out |
| Close | Scale from 1.0 to 0.95, opacity 1 to 0, 120ms ease-in |
| Minimize | Scale + translate toward the window's taskbar tab position, 200ms |
| Restore from minimize | Reverse of minimize, 200ms |
| Maximize | Smooth expansion from current bounds to full screen, 200ms |
| Restore from maximize | Smooth contraction to previous bounds, 200ms |
| Focus (bring to front) | Very subtle scale pulse (1.0 -> 1.005 -> 1.0), 100ms |
| Snap preview | The preview rectangle should fade in, not just appear |

### 6.2 Window Title Bar Enhancements

**Current:** Traffic light buttons + centered title.
**v2 additions:**
- Optional per-app **menu bar** below title bar (File, Edit, View, Tools, Help)
- **Pin indicator** -- small pin icon when window is pinned across workspaces
- **Loading indicator** -- subtle progress bar in title bar when app is loading data
- Title bar should have a **very subtle gradient** (2-3% lighter at top) for depth

### 6.3 Advanced Window Features

- **Window grouping/tabbing:** Drag one window's title bar onto another to create a tabbed group (like browser tabs but for OS windows). Very advanced, possibly v2.5.
- **Window rules:** User can set per-app defaults: "Terminal always opens on Workspace 1 at position X,Y with size WxH." Stored in Supabase.
- **Quick resize:** Double-click a window edge to expand in that direction to the screen edge.

---

## 7. The Boot Experience

v1's boot sequence is good but basic (text lines + progress bar). v2 should make it more cinematic.

**Proposed v2 boot sequence:**

1. **BIOS/POST screen** (0.5s): ThamOS logo + "Initializing hardware..." in monospace. Hardware checks listed (CPU, Memory, Network, Secure Boot).
2. **Bootloader** (0.5s): GRUB-style menu showing "ThamOS v2.0" selected, with a countdown timer. Maybe a subtle matrix/hex rain behind it.
3. **Kernel messages** (1s): Scrolling dmesg-style output. Loading kernel modules, mounting filesystems, starting services. Include security-relevant messages: "Loading threat signature database... 247,891 signatures loaded" / "Initializing agent mesh... 3 endpoints configured" / "Starting encrypted session manager..."
4. **Login screen** (interactive): An actual login screen with the user's avatar/email, password field, and a "Log In" button. This is where Supabase auth happens -- not on a separate web page but integrated into the OS boot flow.
5. **Desktop load** (0.5s): After auth, the desktop fades in with the taskbar, icons, and restored windows.

The login screen is critical. Right now, auth happens on a web-style form page, and then you navigate to the desktop. In v2, the entire experience should be: open the URL, see a boot sequence, arrive at a login screen that looks like it belongs to the OS, authenticate, and land on your desktop with your previous session restored.

---

## 8. Visual Design Direction

### 8.1 Overall Aesthetic

v1 is "hacker terminal dark mode." v2 should be **"modern security operations center."**

Think: the difference between a green-text-on-black terminal from 1995 and a Bloomberg Terminal or a modern SOC dashboard. Both are dense with information, but the latter uses:
- Subtle color gradients instead of flat fills
- Multiple font weights (not just monospace for everything)
- Card-based layouts with rounded corners and shadows
- Data visualization (charts, graphs, heatmaps) instead of just text
- White space as a design element

### 8.2 Font Strategy

| Context | Font | Weight |
|---------|------|--------|
| System UI (menus, labels, notifications) | Inter or system sans-serif | 400/500/600 |
| Data display (scan results, tables) | JetBrains Mono | 400/500 |
| Terminal / code | JetBrains Mono | 400 |
| Headings | Inter or system sans-serif | 600/700 |

Using monospace for *everything* is a v1 aesthetic choice that contributes to the "terminal toy" feel. Real OSes use proportional fonts for UI and monospace only for code/data.

### 8.3 Color Refinement

v1's palette is good but needs nuance:
- Add alpha variants for every color (10%, 20%, 40%, 60% opacity) for backgrounds, hovers, borders
- Surface colors need more steps: at least 5 levels of surface elevation
- Text needs 4 clear levels: primary, secondary, tertiary, disabled
- Accent colors need hover/active/disabled variants
- Consider a "warm" and "cool" sub-palette for different data types (threats=warm reds/ambers, safe=cool greens/blues)

### 8.4 Desktop Wallpaper

v1 has a dot grid + scanline. Options for v2:
- **Dynamic wallpaper:** Subtle animated particles or network graph visualization (very low CPU, using canvas or CSS animations)
- **Threat heatmap:** Live visualization of recent scan activity as a world map or abstract data viz
- **User-selectable:** 4-6 built-in wallpapers (dark abstract, grid, topology, gradient, solid black) + custom color
- **Time-aware:** Wallpaper subtly shifts hue over the course of the day

---

## 9. New Apps / Features for v2

### 9.1 File Manager (Priority: High)

Not a GitHub browser. A proper file manager for ThamOS's data:
- **IOC Library:** All scanned IOCs organized by type (IP, URL, Hash, Domain) with tags, notes, risk scores
- **Evidence Vault:** Uploaded files, screenshots, packet captures associated with cases
- **Export Center:** Generate reports, export case data, download scan results
- Side panel navigation (tree view), main content area (list/grid view), preview panel

### 9.2 Network Monitor (Priority: Medium)

A live view of ThamOS's network activity:
- Edge function health (are all endpoints responding?)
- API quota usage per service (VirusTotal: 12/500 today)
- Response times graphed over session
- Failed requests log

### 9.3 Dashboard / Widgets (Priority: Medium)

A configurable dashboard workspace (like KDE's widget canvas):
- Drag-and-drop widget placement on the desktop itself
- Widgets: threat score summary, recent scans, open cases, feed headlines, agent status, clock, system stats
- Think of it as the "desktop background" being a widget canvas rather than just wallpaper

### 9.4 Rich Terminal (Priority: High)

Upgrade the terminal from a basic command processor to something closer to a real terminal emulator:
- Tabs and split panes (horizontal/vertical split)
- Color output (ANSI escape code rendering)
- Clickable URLs/IOCs in output
- Command output that includes interactive elements (click an IP to scan it)
- Persistent history across sessions
- Aliases and custom commands
- Pipeline support: `scan 8.8.8.8 | grep threat`
- Auto-suggestions from history (like fish shell)

---

## 10. Technical Considerations

### 10.1 Performance

v1 re-renders aggressively because all desktop state is in a single `useState`. v2 should:
- Split window layout state from window content state
- Use `React.memo` on window components to prevent re-render when only position changes
- Consider `zustand` or `jotai` for fine-grained state subscriptions
- Debounce window move/resize operations (already partially done)
- Use CSS transforms for window movement during drag (don't update React state on every mousemove -- use refs)
- Lazy-load app components (React.lazy + Suspense) since not all apps are open at once

### 10.2 Animation Performance

- Use CSS transitions/animations wherever possible (GPU-accelerated)
- For complex animations (overview mode), use `requestAnimationFrame` with transforms
- Avoid animating layout properties (width, height, top, left) -- use `transform: translate()` and `transform: scale()` instead
- Consider `framer-motion` for orchestrated animations (it's well-optimized)

### 10.3 State Persistence Architecture

```
User opens ThamOS
  -> Check localStorage for `desktop-session`
  -> If exists, restore windows/positions/workspace
  -> If not, open default layout (terminal + monitor)

On any window change (debounced 1s):
  -> Serialize window state (positions, sizes, workspaces, which apps open)
  -> Save to localStorage (immediate) + Supabase (debounced 5s)

On logout/close:
  -> Final state save
```

### 10.4 Context Menu Architecture

```typescript
// Proposed context menu system
interface ContextMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
  separator?: boolean;
  submenu?: ContextMenuItem[];
}

// Each surface registers its context menu items
// A single ContextMenuProvider renders the menu at cursor position
// on right-click, looks up the nearest registered surface, shows its items
```

### 10.5 Event Bus Architecture

```typescript
// Lightweight pub/sub for inter-app communication
type DesktopEvent =
  | { type: 'scan:started'; payload: { ioc: string; iocType: string; windowId: string } }
  | { type: 'scan:completed'; payload: { ioc: string; iocType: string; threatScore: number; windowId: string } }
  | { type: 'clipboard:updated'; payload: { value: string; type: 'ip' | 'url' | 'hash' | 'domain' | 'text' } }
  | { type: 'case:updated'; payload: { caseId: string; action: 'created' | 'updated' | 'deleted' } }
  | { type: 'agent:response'; payload: { agentId: string; conversationId: string } }
  | { type: 'notification:new'; payload: { title: string; body: string; source: string; action?: () => void } }
```

---

## 11. Migration Strategy -- v1 to v2

The question is: do we rewrite or refactor?

**Recommendation: Incremental refactor with clear milestones.**

The window management core is solid. The app components work. What needs to change is:
1. The *shell* around the apps (taskbar, panels, system tray, context menus, notifications)
2. The *visual layer* (animations, depth, blur, fonts)
3. The *connective tissue* (event bus, clipboard, session persistence)
4. The *interaction model* (right-click everywhere, overview mode, inter-app communication)

The individual apps (Terminal, Scanner, Workshop, Intel, Cases, etc.) can be upgraded incrementally.

### Suggested Migration Order

**Wave 1 -- Foundation (Highest Impact)**
1. Extract shared palette, app registry, and utility components into single-source-of-truth files
2. Implement the context menu system (reusable component + provider)
3. Add window open/close animations
4. Redesign the taskbar with blur, system tray, and richer layout
5. Add session state persistence (localStorage first)

**Wave 2 -- Interaction**
6. Add right-click context menus to desktop, windows, taskbar
7. Implement the notification center (toasts + dropdown)
8. Implement the event bus for inter-app communication
9. Add the overview/activities mode
10. Upgrade the app launcher to omnibar search

**Wave 3 -- Polish**
11. Add proportional font for UI elements (keep monospace for data/code)
12. Add visual depth (blur, shadows, gradients)
13. Redesign the boot sequence with login screen integration
14. Add desktop widgets or ambient dashboard
15. Upgrade the terminal (tabs, splits, rich output)

**Wave 4 -- Advanced**
16. File manager / IOC library
17. Window grouping/tabbing
18. Window rules and per-app defaults
19. Drag-and-drop IOCs between apps
20. Network monitor / API health dashboard

---

## 12. What NOT to Do

Things that will waste time or go in the wrong direction:

1. **Don't add a real file system.** ThamOS runs in a browser. Simulating `ls /home/user/Documents` is a dead end. Instead, make the "file" metaphor about ThamOS data: IOCs, cases, scans, reports.

2. **Don't simulate hardware.** Fake CPU/RAM percentages that mean nothing are worse than not showing them. If we show system metrics, they should be real (edge function latency, API quota usage, session duration) or clearly labeled as the security data they are (active threats, scan queue depth).

3. **Don't overload the desktop with widgets by default.** The power should be there, but the default experience should be clean. Power users add widgets; new users get a clean desktop with a terminal.

4. **Don't chase pixel-perfect OS replication.** We're not building a Linux DE. We're building a cybersecurity operations environment that *feels* like an OS. The goal is the feeling of depth, interactivity, and persistence -- not replicating every GNOME feature.

5. **Don't sacrifice performance for visual effects.** Blur and animations are great until they lag. Every visual effect should degrade gracefully. Test on mid-range hardware.

6. **Don't break what works.** The scan pipeline, AI workshop, intel dashboard, case manager -- these work. v2 is about the shell, not the apps. Upgrade apps incrementally after the shell is solid.

---

## 13. Success Criteria

How do we know v2 *feels* like an OS?

1. **The right-click test:** Right-click anywhere on the screen. If nothing happens, it's still a web app.
2. **The persistence test:** Close the tab, reopen it. If your windows are where you left them, it's an OS.
3. **The cross-app test:** Find a malicious IP in a scan result. Can you, in two clicks or fewer, add it to a case, scan it against another source, or ask an AI agent about it? If yes, the apps are integrated.
4. **The overview test:** You have 8 windows open across 3 workspaces. Can you see all of them at a glance and jump to any one? If yes, it's manageable.
5. **The ambient test:** Without opening any app, can you tell from the taskbar how many scans ran today, whether your agents are online, and if there are new intel alerts? If yes, the OS is self-aware.
6. **The animation test:** Open a window. Does it appear instantly (web app) or does it smoothly scale into existence (OS)?
7. **The "I forgot it's a browser" test:** After 10 minutes of use, do you forget you're in Chrome? That's the ultimate goal.

---

## 14. Current v1 File Inventory (for context)

### Desktop Shell Components
- `src/components/desktop/DesktopLayout.tsx` -- Root layout, wallpaper, window routing
- `src/components/desktop/DesktopWindow.tsx` -- Window frame with drag/resize/snap
- `src/components/desktop/Taskbar.tsx` -- Bottom panel
- `src/components/desktop/AppLauncher.tsx` -- Ctrl+K app grid
- `src/components/desktop/DesktopIcons.tsx` -- Desktop shortcuts
- `src/components/desktop/BootSequence.tsx` -- Boot animation

### App Components
- `src/components/desktop/DesktopTerminal.tsx` -- CLI
- `src/components/desktop/DesktopScanner.tsx` -- Scanner wrapper
- `src/components/desktop/DesktopBrowser.tsx` -- Internal browser
- `src/components/desktop/DesktopWorkshop.tsx` -- AI chat
- `src/components/desktop/DesktopIntelDashboard.tsx` -- RSS feeds
- `src/components/desktop/DesktopCaseManager.tsx` -- Case notes
- `src/components/desktop/DesktopSystemMonitor.tsx` -- System stats
- `src/components/desktop/DesktopSettings.tsx` -- Settings

### Scan Result Components
- `src/components/desktop/DesktopIPResult.tsx`
- `src/components/desktop/DesktopURLResult.tsx`
- `src/components/desktop/DesktopDomainResult.tsx`
- `src/components/desktop/DesktopHashResult.tsx`

### State/Context
- `src/contexts/DesktopContext.tsx` -- Window manager state
- `src/contexts/themecontext.tsx` -- UI mode (desktop/tactical/terminal)
- `src/contexts/ThemeContext.tsx` -- Database-driven color themes
- `src/contexts/AuthContext.tsx` -- Supabase auth
- `src/contexts/AlertContext.tsx` -- Notification counts

### Key Technical Details
- Window management: 14 operations (open, close, minimize, maximize, restore, focus, updatePosition, updateSize, moveToWorkspace, switchWorkspace, togglePin, updateWindowData, setBootComplete, getVisibleWindows)
- 4 workspaces with pinnable windows
- Window snapping: top=maximize, left/right=half, corners=quarter
- 8-direction resize with 400x300 minimum
- Palette `P` object duplicated in 5+ component files
- App definitions duplicated in 4 files
- Two incompatible theme systems
- No animations, no context menus, no session persistence, no inter-app communication

---

## 15. Open Questions for the Council

1. **State management library:** Stay with React Context + useState, or adopt zustand/jotai for better performance with fine-grained subscriptions?

2. **Animation library:** Pure CSS transitions, or framer-motion for orchestrated animations (overview mode, window groups)?

3. **Terminal approach:** Build a richer custom terminal, or integrate xterm.js for a real terminal emulator experience?

4. **Panel architecture:** Fixed layout (like GNOME) or fully customizable widget-based panel (like KDE Plasma)?

5. **Theming depth:** Just dark mode with accent color customization, or full theme engine with light/dark/custom color schemes?

6. **Mobile/responsive:** Should v2 have any mobile consideration, or is this desktop-only? (Security tools are desktop activities.)

7. **Sound design:** Should ThamOS have subtle UI sounds (boot chime, notification ping, scan complete tone)? Web Audio API makes this possible.

8. **Login flow:** Integrate login into the boot sequence (OS-style), or keep it as a separate pre-desktop screen?
