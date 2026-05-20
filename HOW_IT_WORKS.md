# How ThamOS X Works

> The "it looks like Kali / is that a VM?" explainer.

---

## What it actually is

ThamOS X is a **web application that renders a desktop operating system interface inside a browser tab.** There is no virtual machine, no container, no remote desktop, no Electron shell. It is a React app — the same technology that powers dashboards like Linear, Notion, or Vercel — but styled and wired to behave like a desktop OS.

When you open it, you're looking at a single HTML page. Every window you drag, every app you open, every workspace you switch to is React state being rendered to the DOM. The "desktop" is a `<div>` with absolute-positioned child `<div>`s acting as windows. The taskbar is a fixed element at the bottom. It's all browser-native.

The reason it looks like Kali or a VM is intentional: the dark palette, JetBrains Mono font, terminal-first aesthetic, and the fact that it actually *does* security tooling — it's designed to feel like an operator workstation, not a SaaS dashboard.

---

## The Frontend

**Stack:** React 18, TypeScript, Tailwind CSS, Vite.

The entire app is a single-page application (SPA). There is no server rendering, no page navigation. Everything lives inside one component tree.

### The Desktop Context

The heart of the OS is `DesktopContext` — a React context that acts as the window manager. It holds the state for every open window:

- Which windows exist, their position and size, whether they're minimized/maximized
- Which workspace (1–4) each window lives on
- Which window is currently focused (receives keyboard events)
- Pinned windows that persist across all workspaces

When you open an app, something calls `openWindow({ appId: 'scanner', title: 'Scanner' })`. The context creates a new window entry with a unique ID, a default size from the app registry, and the current workspace. React re-renders. A new draggable window appears on screen.

### The App Registry

Every app in ThamOS is registered in `appRegistry.ts` with:
- An ID (e.g., `'email-analyzer'`)
- A name, icon, description, accent color
- A category (`core`, `intel`, `tools`, `system`)
- Keywords for Spotlight search
- A default window size

This registry drives the App Launcher, the Spotlight search (`Ctrl+K`), the desktop icons, and the taskbar. Adding a new app means adding one entry to this file — the rest picks it up automatically.

### Windows and App Routing

`DesktopLayout.tsx` contains a `renderWindowContent(appId)` switch statement. When a window needs to render its content, it calls this function with the app ID, which returns the appropriate React component. A window showing the Scanner renders `<DesktopScanner />`. A window showing the Email Analyzer renders `<EmailAnalyzer />`. They're just React components mounted inside a windowed container.

Each window is a `DesktopWindow` component that provides the chrome (title bar, traffic-light buttons, drag handle, resize corners) and renders its content component as children. The content component fills the window's interior — it has no idea it's inside a windowed frame.

### Workspaces

Workspaces (1–4) are just a number stored per window. The desktop filters `windows` to only render those matching the `activeWorkspace`. Switching workspaces is a state update — no page change, no component unmount/remount for windows on other workspaces (they stay mounted, just hidden).

---

## The Backend

There is no traditional server. The backend is **Supabase** — a hosted Postgres database with a few additions:

| Supabase feature | What ThamOS uses it for |
|---|---|
| **Postgres database** | Storing scan results, cases, IOC relationships, cached API responses, audit logs |
| **Edge Functions** | All threat-intel logic, email/doc analysis, AI chat routing |
| **Auth** | User sessions, access tiers |
| **Row Level Security** | Enforcing what each user tier can read/write |

### Edge Functions

Edge Functions are small server-side scripts that run on Deno (a JavaScript/TypeScript runtime). They live in `supabase/functions/` and are deployed to Supabase's global edge network. Each function is a standalone HTTP endpoint.

When you click **Scan** on an IP, here's what happens:

```
Browser → POST /functions/v1/threat-intel/ip
         { ip: "1.2.3.4" }
              ↓
Edge Function (Deno, runs server-side)
  - Checks api_cache table (has this IP been looked up recently?)
  - If cached: returns cached result immediately
  - If not cached: fans out to up to 19 external APIs in parallel
      VirusTotal, AbuseIPDB, Shodan, GreyNoise, URLScan,
      AlienVault OTX, IPQualityScore, ProxyCheck, IPHub,
      ThreatFox, URLhaus, Spamhaus, Team Cymru, Tor exit list...
  - Waits for all responses (with timeouts)
  - Aggregates: calculates overallThreatScore, sets isMalicious flag
  - Writes result to ip_lookups table
  - Writes pDNS edges to ioc_relationships table (side effect)
  - Returns unified JSON to the browser
              ↓
Browser renders the IP Result window
```

The browser never talks directly to VirusTotal or Shodan. All external API calls happen inside the edge function, server-side, where the API keys are stored as environment secrets. The browser only ever talks to Supabase.

### API Keys and Tiers

Users can add their own API keys in Settings (encrypted with AES-256-GCM before storage). When a scan runs, the edge function checks if the user has a key for each source and uses it; otherwise it falls back to the shared platform key or skips that source.

There are three access tiers:
- **anon** — unauthenticated, limited sources
- **dsbn** — org users, full source access
- **external** — authenticated external users, intermediate access

---

## The Threat Intel Pipeline in Detail

### Score Aggregation

Every source returns a score (0–100). The edge function does not average them — it takes the **maximum**. One source calling something malicious at 95 is more meaningful than ten sources giving it a 5. The `overallThreatScore` is `Math.max(...sourceScores)`.

`isMalicious` is set if any source explicitly flags the IOC as malicious, or if the overall score crosses a threshold.

### Caching

Every lookup is cached in the `api_cache` table with an expiry (typically 24h for most sources). The cache key is `source:ioc_type:value`. If a cached result exists and isn't expired, the edge function skips the external API call entirely and returns the cached data. This keeps response times fast and avoids burning API rate limits when the same IOC gets looked up repeatedly.

### Result Persistence

Scan results are written to type-specific tables (`ip_lookups`, `domain_lookups`, `hash_lookups`, `url_lookups`, etc.). These power the recent scans history and mean your results are queryable across sessions.

---

## The IOC Pivot Graph

Every domain and IP scan has a side effect: it writes **relationship edges** to the `ioc_relationships` table.

When you scan a **domain**, the edge function fetches its passive DNS (pDNS) history — every IP address that domain has ever resolved to, across multiple pDNS providers. Each `domain → IP` pair becomes a row:

```
source_type: "domain"   source_value: "evil.com"
target_type: "ip"       target_value: "1.2.3.4"
edge_type:   "resolves_to"
source_dataset: "alienvault_otx"
observation_count: 47
first_seen: "2024-01-15"  last_seen: "2024-11-03"
```

It also fetches certificate transparency logs (crt.sh) for that domain — every other domain on the same TLS certificate becomes a `cert_san` edge:

```
source_type: "domain"   source_value: "evil.com"
target_type: "domain"   target_value: "also-evil.com"
edge_type:   "cert_san"
```

When you scan an **IP**, the reverse happens — pDNS lookups for what domains have pointed to that IP.

The `RelatedIOCs` component in result windows queries these edges and renders the pivot graph. Nothing shows until you've scanned the IOC. The graph builds up as your team investigates — each scan enriches the shared graph for everyone. Over time, you can trace infrastructure: domain → shared IP → other domains on that IP → their cert siblings → a completely separate campaign.

---

## The Terminal

The Terminal is a real terminal emulator (`xterm.js`) running inside a window component. It connects to a local command interpreter (no shell access to the underlying machine — it's a curated command set: `scan`, `lookup`, `help`, `clear`, etc.) that dispatches actions back into the desktop context. When you type `scan 8.8.8.8` in the terminal, it calls the same `openWindow` path as clicking Scan in the Scanner UI.

The VPS Terminal is different — it connects via WebSocket to an actual remote VPS you've configured, giving you real shell access to that machine inside a ThamOS window.

---

## Maestro (AI)

The Workshop/Maestro app routes messages to Claude, GPT, and Gemini simultaneously through the `ai-chat` edge function. The edge function holds the API keys and fans the same prompt out to all three models in parallel, returning all three responses. The UI renders them side-by-side so you can compare reasoning across models for the same threat context.

---

## What It Is Not

- **Not a VM.** No virtualization layer. No OS running inside the browser.
- **Not Kali Linux.** No Linux kernel, no system calls, no package manager. The aesthetic is inspired by it; the architecture is not.
- **Not Electron.** Runs entirely in a standard browser tab. No desktop install required.
- **Not a remote desktop.** The UI runs locally in your browser. Only the *data requests* (scans, AI calls) go to the network.
- **Not a monolith.** There's no single backend server. Compute is Supabase Edge Functions (Deno, globally distributed). Data is Postgres. Auth is Supabase Auth. The "server" is serverless.

---

## One-Sentence Version

> ThamOS X is a React app that renders a fake desktop OS in the browser, where each "app" is a React component mounted in a draggable window, and every scan or AI call goes through a Supabase edge function that hits external threat-intel APIs server-side and returns a unified result.
