# VPS Terminal Integration -- Architecture Research & Implementation Plan

**For:** AI Development Council (Claude, GPT, Gemini)
**Project:** ThamOS X v7.0 -- Browser-Based Cybersecurity Operations Desktop
**Date:** 2026-03-17
**Author:** AI Council Session
**Status:** Research Complete, Ready for Implementation

---

## Executive Summary

ThamOS X is a browser-based cybersecurity desktop OS for SOC (Security Operations Center) teams. It runs as a React SPA that looks and feels like a Linux desktop environment with windowed apps, workspaces, a taskbar, and a CLI terminal.

The current terminal (`DesktopTerminal.tsx`) is a **simulated CLI** -- it processes commands internally in React and returns hardcoded or API-fetched results. It is NOT a real terminal emulator. Commands like `nmap`, `whois`, and `dig` return simulated output.

**The goal:** Connect a real VPS (Virtual Private Server) to ThamOS so users can run actual shell commands on real infrastructure from within the browser-based desktop. This turns ThamOS from a web dashboard with a fake terminal into a genuine operational environment where `nmap 192.168.1.1` actually runs nmap.

**Constraints:**
- Must be secure -- no exposed ports, no plaintext credentials, authenticated access only
- Must be practical -- minimal VPS-side setup, low maintenance, reliable
- Must integrate cleanly with ThamOS's existing window manager, app registry, and theme system
- User already runs VPS infrastructure and can build/deploy anything

---

## Table of Contents

1. [Current Terminal Architecture](#1-current-terminal-architecture)
2. [What We Need](#2-what-we-need)
3. [Approach Analysis -- Five Options](#3-approach-analysis)
4. [Comparison Matrix](#4-comparison-matrix)
5. [Recommended Architecture](#5-recommended-architecture)
6. [Data Flow Diagram](#6-data-flow-diagram)
7. [VPS Setup Guide](#7-vps-setup-guide)
8. [ThamOS Integration Guide](#8-thamos-integration-guide)
9. [Security Model](#9-security-model)
10. [Implementation File Manifest](#10-implementation-file-manifest)
11. [Alternative: WebSocket Relay (Advanced)](#11-alternative-websocket-relay)
12. [Terminal UX Considerations](#12-terminal-ux-considerations)
13. [Phase Plan](#13-phase-plan)

---

## 1. Current Terminal Architecture

### What Exists

**File:** `src/components/desktop/DesktopTerminal.tsx` (~658 lines)

The current terminal is a React component that:
- Renders a monospace text output area with colored lines
- Accepts text input at the bottom (controlled input)
- Parses commands client-side via a `switch` statement
- Calls Supabase Edge Functions for some commands (scan, AI agents)
- Returns simulated output for network tools (nmap, whois, dig)

### Available Commands (15+)

| Command | What It Does | Real or Simulated |
|---------|-------------|-------------------|
| `scan -ip [IP]` | Calls threat-intel edge function | Real (API calls) |
| `scan -hash [HASH]` | Calls threat-intel edge function | Real (API calls) |
| `scan -url [URL]` | Calls threat-intel edge function | Real (API calls) |
| `scan -domain [DOMAIN]` | Calls threat-intel edge function | Real (API calls) |
| `thamosx [query]` | Calls ai-chat edge function (Claude) | Real (API call) |
| `thamosy [query]` | Calls ai-chat edge function (GPT) | Real (API call) |
| `thamosz [query]` | Calls ai-chat edge function (Gemini) | Real (API call) |
| `get -feed rss` | Calls news-feeds edge function | Real (API call) |
| `get -feed ransomware` | Calls ransomware-intel edge function | Real (API call) |
| `nmap [target]` | Returns hardcoded output | Simulated |
| `whois [domain]` | Returns hardcoded output | Simulated |
| `dig [domain]` | Returns hardcoded output | Simulated |
| `neofetch` | Shows ThamOS system info ASCII art | Simulated |
| `workspace [1-4]` | Switches desktop workspace | Real (UI action) |
| `open [app]` | Opens a desktop window | Real (UI action) |
| `ls` | Lists available apps | Informational |
| `help` / `clear` / `history` / `status` / `pwd` | Utility commands | Internal |

### Key Technical Details

- **Output model:** Array of `OutputLine` objects: `{ text: string, type: 'prompt'|'command'|'success'|'error'|'info'|'agent', color?: string }`
- **History:** In-memory `commandHistory` array, Up/Down arrows navigate, lost on window close
- **Tab completion:** Matches against the `COMMANDS` array
- **CLI flags:** Parsed via `src/lib/cliFlags.ts` -- supports `--verbose`, `--threats`, `--network`, `--vpn`, `--geo`, `--sources`, `--json`
- **Fonts:** JetBrains Mono, consistent with ThamOS design system
- **Colors:** Uses `palette` from `src/design-system/tokens.ts` -- cyan accent, green success, rose errors

### What's Missing

- No real shell access -- cannot run actual commands on infrastructure
- No xterm.js or any real terminal emulator library
- No WebSocket connections
- No PTY (pseudo-terminal) support
- No ANSI escape code rendering (colors, cursor movement, etc.)
- No terminal resize/reflow
- Cannot run interactive programs (vim, htop, less, etc.)
- Cannot SSH to other machines

---

## 2. What We Need

### Requirements

1. **Real shell access** -- User types a command in ThamOS, it executes on an actual VPS, output streams back in real-time
2. **Interactive programs** -- `vim`, `htop`, `top`, `less`, `tmux` must work correctly with cursor positioning and real-time updates
3. **Authenticated** -- Only authenticated ThamOS users with proper permissions can access the VPS
4. **Encrypted** -- All traffic encrypted in transit (TLS/WSS)
5. **No open ports** -- The VPS should not expose SSH or any terminal service directly to the internet
6. **Low latency** -- Keystrokes should feel responsive (< 100ms round-trip)
7. **Integrated** -- Opens as a desktop window in ThamOS, respects the window manager, theme, and app registry
8. **Resizable** -- Terminal adapts to window resize events (rows/cols recalculated)
9. **Coexist** -- The existing simulated terminal remains for ThamOS-specific commands. The VPS terminal is a separate app or a toggle mode

### Non-Requirements (For Now)

- Multi-user terminal sharing / screen sharing
- File upload/download through the terminal
- Terminal recording/playback
- Multiple VPS connections simultaneously (can be added later)

---

## 3. Approach Analysis

### Approach A: xterm.js + Custom WebSocket Relay

**How it works:**
- Install a lightweight WebSocket relay on the VPS that spawns a PTY (pseudo-terminal) per connection
- The browser uses xterm.js (the industry-standard terminal emulator library used by VS Code, Gitpod, Theia, etc.) to render the terminal
- xterm.js connects via WebSocket to the relay
- The relay authenticates the connection using a JWT or shared secret before spawning the PTY

**VPS side:**
```
[WebSocket Relay (Node.js/Go/Rust)] --spawns--> [PTY (bash/zsh)]
   |
   | listens on localhost:7681 (NOT exposed to internet)
   |
[Cloudflare Tunnel / nginx reverse proxy] --exposes via HTTPS/WSS-->
```

**Browser side:**
```
[xterm.js in DesktopVPSTerminal.tsx] --WSS--> [Cloudflare Tunnel URL] --> [Relay] --> [PTY]
```

**Pros:**
- Full terminal emulation (ANSI, colors, cursor, mouse, resize)
- All interactive programs work (vim, tmux, htop)
- xterm.js is battle-tested (used by VS Code's terminal)
- WebSocket relay can be 50-200 lines of code
- Full control over auth, logging, rate limiting
- Can add multi-VPS support later

**Cons:**
- Must write or deploy the relay service
- Must manage a process on the VPS
- Must set up tunnel or reverse proxy for the WebSocket

**Verdict:** Best option for full terminal functionality. Most flexible. Most secure when combined with a tunnel.

---

### Approach B: ttyd (Terminal Sharing Tool)

**How it works:**
- ttyd is an open-source tool that shares a terminal over the web
- It bundles its own xterm.js frontend and WebSocket server
- You run `ttyd bash` on the VPS, it serves a web terminal on a port
- ThamOS can either iframe ttyd's built-in UI or connect to its WebSocket protocol directly

**VPS side:**
```
ttyd --port 7681 --writable --credential user:pass bash
   |
   | serves HTTP + WebSocket on port 7681
   |
[Cloudflare Tunnel] --exposes via HTTPS-->
```

**Browser side (Option 1 -- iframe):**
```
<iframe src="https://tunnel-url.trycloudflare.com" />
```

**Browser side (Option 2 -- direct WebSocket):**
```
[xterm.js] --WSS--> [tunnel-url] --> [ttyd WebSocket] --> [PTY]
```

**Pros:**
- Zero custom code on VPS -- just install and run ttyd
- Battle-tested (3.4k GitHub stars, actively maintained)
- Built-in basic auth (`--credential`)
- Built-in SSL support
- Can restrict to read-only mode
- Supports window resize

**Cons:**
- ttyd's built-in auth is basic (username:password, not JWT)
- Iframe approach loses control over styling and key bindings
- Direct WebSocket approach requires understanding ttyd's protocol
- Less control over session management
- ttyd is a C binary -- must compile or install from package manager

**Verdict:** Fastest path to a working solution. Great for Phase 1. Can be hardened with Cloudflare Tunnel + Supabase JWT validation in a wrapper.

---

### Approach C: GoTTY / WeTTY

**How it works:**
- GoTTY (Go) and WeTTY (Node.js) are similar to ttyd but in different languages
- GoTTY: Run any CLI tool on the web. Single binary, minimal config
- WeTTY: Web-based terminal emulator that can SSH into remote hosts

**GoTTY VPS side:**
```
gotty --port 7681 --permit-write --credential user:pass bash
```

**WeTTY VPS side:**
```
wetty --port 3000 --ssh-host=localhost --ssh-port=22
```

**Pros:**
- GoTTY is a single Go binary, very easy to deploy
- WeTTY has SSH proxy built in (can proxy to other machines)
- Both are established projects

**Cons:**
- GoTTY is essentially unmaintained (last commit years ago)
- WeTTY requires Node.js on the VPS
- Same auth limitations as ttyd (basic auth, not JWT)
- Same iframe/direct-WebSocket tradeoff
- Fewer features than ttyd

**Verdict:** GoTTY is dead, skip it. WeTTY only makes sense if you need SSH proxy to other machines (useful later, not now). ttyd is the better choice in this category.

---

### Approach D: Supabase Edge Function as WebSocket Proxy

**How it works:**
- A Supabase Edge Function receives authenticated requests from ThamOS
- The Edge Function opens a connection to the VPS (via SSH or API) and relays I/O
- This keeps the VPS completely hidden behind Supabase's infrastructure

**Flow:**
```
[xterm.js in browser] --HTTPS--> [Supabase Edge Function] --SSH--> [VPS]
```

**Pros:**
- VPS has zero public exposure
- Auth handled entirely by Supabase (JWT validation is automatic)
- No need for Cloudflare Tunnel or any VPS-side web service

**Cons:**
- Supabase Edge Functions do NOT support WebSockets (Deno.serve is request/response only)
- Would need to fall back to HTTP polling (terrible for terminal latency)
- Edge Function timeout limits (typically 60s) make long-running sessions impossible
- Cannot maintain a persistent PTY session across HTTP requests
- Would need to implement a complex session-persistence layer

**Verdict:** Not viable. Edge Functions cannot maintain WebSocket connections or long-lived sessions. This architecture fundamentally doesn't work for real-time terminal I/O.

---

### Approach E: Cloudflare Tunnel + Direct SSH (via WebSocket-to-SSH gateway)

**How it works:**
- Run a WebSocket-to-SSH gateway on the VPS (like `webssh2` or a custom relay)
- Expose it through a Cloudflare Tunnel (zero open ports on VPS)
- The browser connects via WSS through the tunnel
- Auth can be layered: Cloudflare Access (SSO) + application-level JWT

**Flow:**
```
[xterm.js] --WSS--> [Cloudflare Tunnel] --> [WS-to-SSH gateway on localhost] --> [SSH] --> [bash]
```

**Pros:**
- Zero open ports on VPS
- Cloudflare Access provides SSO/MFA at the network layer
- SSH provides robust session management, key-based auth, etc.
- Can SSH to other machines from the gateway

**Cons:**
- Extra layer of complexity (SSH within WebSocket)
- Must manage SSH keys on the VPS
- More moving parts than a direct PTY relay

**Verdict:** Good for production with multiple VPS targets. Overkill for a single-VPS setup. Consider for Phase 2 when multi-VPS support is needed.

---

## 4. Comparison Matrix

| Criterion | A: Custom Relay | B: ttyd | C: GoTTY/WeTTY | D: Edge Fn Proxy | E: CF + SSH |
|-----------|:-:|:-:|:-:|:-:|:-:|
| **Terminal Quality** | 10 | 9 | 7 | 3 | 9 |
| **Interactive Programs** | Yes | Yes | Yes | No | Yes |
| **Setup Complexity** | Medium | Low | Low | N/A | High |
| **Auth Integration** | Full (JWT) | Basic only | Basic only | Full (Supabase) | Full (CF Access) |
| **Supabase JWT** | Can validate | Needs wrapper | Needs wrapper | Native | Via middleware |
| **No Open Ports** | With tunnel | With tunnel | With tunnel | Native | Native |
| **Maintenance** | Low (systemd) | Low (systemd) | GoTTY: dead | N/A | Medium |
| **Customization** | Total | Limited | Limited | N/A | Medium |
| **Latency** | ~50ms | ~50ms | ~50ms | ~200ms+ | ~60ms |
| **Multi-VPS Ready** | Phase 2 | No | WeTTY: yes | No | Yes |
| **Production Viability** | High | Medium | Low | None | High |

**Scores (1-10):**
- A: Custom Relay = **9/10** (best balance of quality and control)
- B: ttyd = **7/10** (fastest MVP, limited long-term)
- C: GoTTY/WeTTY = **4/10** (dated tooling)
- D: Edge Fn Proxy = **2/10** (architecturally impossible)
- E: CF + SSH = **8/10** (production-grade, more complex)

---

## 5. Recommended Architecture

### Phase 1: ttyd + Cloudflare Tunnel (Ship Fast)

Use ttyd because it requires zero custom code on the VPS. Harden it with Cloudflare Tunnel for zero open ports and TLS termination.

```
Browser (ThamOS)                    Cloudflare                         VPS
===================                 ==========                         ===
xterm.js component                  CF Tunnel                          ttyd
  |                                   |                                  |
  |-- WSS connection -------->        |                                  |
  |                              routes to origin -------->              |
  |                                   |                          ttyd WebSocket
  |                                   |                                  |
  |                                   |                          spawns PTY (bash)
  |<-- terminal output -------        |  <------- stdout ------         |
  |-- keystrokes ------------>        |  -------> stdin ------->        |
```

### Phase 2: Custom Relay + JWT Auth (Production)

Replace ttyd with a lightweight custom relay (Node.js with `node-pty` + `ws`, or Go with `creack/pty`) that validates Supabase JWTs directly. This gives full control over:
- Per-user session management
- Audit logging (who ran what, when)
- Rate limiting
- Command filtering (optional, for restricting dangerous commands)
- Multi-VPS routing

---

## 6. Data Flow Diagram

### Authentication Flow
```
1. User logs into ThamOS (Supabase Auth)
   --> Receives JWT (access_token)

2. User opens VPS Terminal window in ThamOS
   --> ThamOS reads JWT from auth context

3. xterm.js component initiates WebSocket connection:
   --> wss://[tunnel-url]?token=[JWT]
   (or via Authorization header if custom relay)

4. PHASE 1 (ttyd): Cloudflare Tunnel routes to ttyd on localhost
   --> ttyd accepts connection (basic auth or open behind tunnel)
   --> PTY spawned

   PHASE 2 (custom relay): Relay validates JWT
   --> Verifies with Supabase public key (JWKS)
   --> Checks user role/permissions
   --> If valid: spawn PTY
   --> If invalid: close connection with 401
```

### Data Flow (Steady State)
```
User types "ls -la" in xterm.js
  --> Keystroke sent as binary frame over WebSocket
    --> Cloudflare Tunnel forwards to VPS
      --> ttyd/relay writes to PTY stdin
        --> bash processes command
        --> bash writes to PTY stdout
      --> ttyd/relay reads from PTY stdout
    --> Response sent back through tunnel
  --> xterm.js receives binary frame
--> xterm.js renders output (ANSI parsing, colors, cursor positioning)
```

### Resize Flow
```
User resizes ThamOS window
  --> DesktopWindow.tsx detects resize
    --> Passes new width/height to VPSTerminal component
      --> xterm.js calculates new rows/cols via FitAddon
        --> Sends resize event over WebSocket (JSON: {cols: 120, rows: 40})
          --> ttyd/relay calls pty.resize(cols, rows)
            --> PTY notifies running program of SIGWINCH
              --> Program (vim, htop, etc.) redraws for new dimensions
```

---

## 7. VPS Setup Guide

### Phase 1: ttyd + Cloudflare Tunnel

#### Step 1: Install ttyd

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install -y ttyd
```

**Or compile from source (latest features):**
```bash
sudo apt install -y build-essential cmake git libjson-c-dev libwebsockets-dev
git clone https://github.com/tsl0922/ttyd.git
cd ttyd && mkdir build && cd build
cmake .. && make && sudo make install
```

**Verify:**
```bash
ttyd --version
```

#### Step 2: Create a dedicated terminal user (security)

```bash
sudo useradd -m -s /bin/bash thamosvps
sudo passwd thamosvps
# Set a strong password

# Give the user access to security tools you want available:
sudo usermod -aG docker thamosvps  # if using Docker
# Install tools: nmap, whois, dig, etc.
sudo apt install -y nmap dnsutils whois net-tools curl wget
```

#### Step 3: Create systemd service for ttyd

Create `/etc/systemd/system/ttyd.service`:
```ini
[Unit]
Description=ThamOS VPS Terminal (ttyd)
After=network.target

[Service]
Type=simple
User=thamosvps
ExecStart=/usr/bin/ttyd \
  --port 7681 \
  --interface 127.0.0.1 \
  --writable \
  --max-clients 3 \
  --ping-interval 30 \
  /bin/bash
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**Key flags:**
- `--interface 127.0.0.1` -- Only listen on localhost (NOT accessible from internet)
- `--writable` -- Allow input (without this, terminal is read-only)
- `--max-clients 3` -- Limit concurrent sessions
- `--ping-interval 30` -- Keep WebSocket alive

```bash
sudo systemctl daemon-reload
sudo systemctl enable ttyd
sudo systemctl start ttyd
```

**Verify it's running on localhost only:**
```bash
curl http://127.0.0.1:7681  # Should return ttyd HTML
curl http://[VPS-PUBLIC-IP]:7681  # Should timeout/refuse (good!)
```

#### Step 4: Install Cloudflare Tunnel (cloudflared)

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb
```

#### Step 5: Create the tunnel

**Option A: Named Tunnel (recommended for production)**
```bash
cloudflared tunnel login
cloudflared tunnel create thamos-terminal
cloudflared tunnel route dns thamos-terminal terminal.yourdomain.com
```

Create `~/.cloudflared/config.yml`:
```yaml
tunnel: thamos-terminal
credentials-file: /home/thamosvps/.cloudflared/<TUNNEL-ID>.json

ingress:
  - hostname: terminal.yourdomain.com
    service: http://127.0.0.1:7681
    originRequest:
      noTLSVerify: true
  - service: http_status:404
```

**Option B: Quick Tunnel (zero config, random URL, good for testing)**
```bash
cloudflared tunnel --url http://127.0.0.1:7681
# Outputs: https://random-words.trycloudflare.com
```

#### Step 6: Run the tunnel as a service

```bash
sudo cloudflared service install
sudo systemctl start cloudflared
```

**Verify:** Open `https://terminal.yourdomain.com` in a browser. You should see ttyd's built-in terminal UI.

#### Step 7: (Optional) Add Cloudflare Access for extra auth

In the Cloudflare Zero Trust dashboard:
1. Go to Access > Applications > Add an Application
2. Set the application domain to `terminal.yourdomain.com`
3. Add an access policy (e.g., email must be `your-email@domain.com`)
4. This adds SSO/MFA before the user even reaches ttyd

---

### Phase 2: Custom WebSocket Relay (replaces ttyd)

When ready for JWT auth and audit logging, replace ttyd with a custom relay.

**Node.js relay (~80 lines):**

```javascript
// relay.js -- VPS WebSocket-to-PTY relay with JWT validation
import { WebSocketServer } from 'ws';
import pty from 'node-pty';
import jwt from 'jsonwebtoken';

const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const PORT = 7681;
const SHELL = process.env.SHELL || '/bin/bash';

const wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' });

wss.on('connection', (ws, req) => {
  // Extract token from query string
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const token = url.searchParams.get('token');

  // Validate JWT
  try {
    const decoded = jwt.verify(token, SUPABASE_JWT_SECRET);
    console.log(`[AUTH] User ${decoded.sub} connected`);
  } catch (err) {
    console.log(`[AUTH] Invalid token, closing connection`);
    ws.close(4001, 'Unauthorized');
    return;
  }

  // Spawn PTY
  const shell = pty.spawn(SHELL, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME,
    env: process.env,
  });

  // PTY stdout -> WebSocket
  shell.onData((data) => {
    if (ws.readyState === 1) ws.send(data);
  });

  // WebSocket -> PTY stdin
  ws.on('message', (msg) => {
    const str = msg.toString();
    // Handle resize messages (JSON)
    try {
      const parsed = JSON.parse(str);
      if (parsed.type === 'resize') {
        shell.resize(parsed.cols, parsed.rows);
        return;
      }
    } catch {}
    // Regular input
    shell.write(str);
  });

  // Cleanup
  ws.on('close', () => {
    console.log('[SESSION] WebSocket closed, killing PTY');
    shell.kill();
  });

  shell.onExit(() => {
    console.log('[SESSION] PTY exited, closing WebSocket');
    ws.close();
  });
});

console.log(`[RELAY] Listening on 127.0.0.1:${PORT}`);
```

**Install dependencies on VPS:**
```bash
npm init -y
npm install ws node-pty jsonwebtoken
```

**Run as systemd service** (same pattern as ttyd service above, replacing ExecStart).

---

## 8. ThamOS Integration Guide

### 8.1 New npm Dependencies

```bash
npm install @xterm/xterm @xterm/addon-fit @xterm/addon-web-links @xterm/addon-webgl
```

| Package | Purpose |
|---------|---------|
| `@xterm/xterm` | Terminal emulator core (renders ANSI, handles input) |
| `@xterm/addon-fit` | Auto-resize terminal to fit container |
| `@xterm/addon-web-links` | Clickable URLs in terminal output |
| `@xterm/addon-webgl` | GPU-accelerated rendering (optional, for performance) |

### 8.2 App Registry Update

**File:** `src/design-system/appRegistry.ts`

Add a new app entry:

```typescript
'vps-terminal': {
  id: 'vps-terminal',
  name: 'VPS Terminal',
  icon: '>_',
  description: 'Remote VPS shell access',
  accentColor: palette.green,
  category: 'core',
  keywords: ['vps', 'terminal', 'ssh', 'shell', 'remote', 'server'],
  defaultSize: { width: 900, height: 600 },
  showOnDesktop: true,
},
```

Also add `'vps-terminal'` to the `AppId` union type in `src/contexts/DesktopContext.tsx`.

### 8.3 New Component: DesktopVPSTerminal.tsx

**File:** `src/components/desktop/DesktopVPSTerminal.tsx`

This component:
1. Mounts an xterm.js Terminal instance into a container div
2. Loads the Fit addon to handle resize
3. Connects to the VPS WebSocket endpoint
4. Pipes keyboard input to the WebSocket
5. Pipes WebSocket messages to xterm.js for rendering
6. Handles connection state (connecting, connected, disconnected, error)
7. Handles window resize events from the DesktopWindow parent
8. Shows a reconnect button on disconnect
9. Uses ThamOS palette colors for the terminal theme

**Component structure:**
```
DesktopVPSTerminal
  |-- Connection status bar (top)
  |     |-- Status indicator (green dot = connected, yellow = connecting, red = error)
  |     |-- VPS hostname display
  |     |-- Latency indicator
  |     |-- Disconnect button
  |
  |-- xterm.js container (fills remaining space)
  |     |-- Full terminal emulation
  |     |-- ANSI color support
  |     |-- Mouse support (for tmux, vim, etc.)
  |     |-- Clickable URLs
  |
  |-- (On disconnect) Reconnect overlay
        |-- "Connection lost" message
        |-- Reconnect button
        |-- Back to ThamOS Terminal button
```

**xterm.js theme (matching ThamOS palette):**
```typescript
const terminalTheme = {
  background: '#060610',     // palette.void
  foreground: '#c8cde0',     // palette.textLight
  cursor: '#00d9ff',         // palette.cyan
  cursorAccent: '#060610',
  selectionBackground: 'rgba(0, 217, 255, 0.2)',
  black: '#0a0e1a',
  red: '#ff0080',            // palette.pink
  green: '#00ff9d',          // palette.green
  yellow: '#fbbf24',         // palette.amber
  blue: '#00b4d8',           // palette.blue
  magenta: '#b794f6',        // palette.purple
  cyan: '#00d9ff',           // palette.cyan
  white: '#c8cde0',
  brightBlack: '#3a3f55',    // palette.dim
  brightRed: '#ff3399',
  brightGreen: '#33ffb4',
  brightYellow: '#fcd34d',
  brightBlue: '#38bdf8',
  brightMagenta: '#c4b5fd',
  brightCyan: '#22d3ee',
  brightWhite: '#f8fafc',
};
```

### 8.4 DesktopLayout Routing

**File:** `src/components/desktop/DesktopLayout.tsx`

Add the component to the app routing switch:

```typescript
case 'vps-terminal':
  return <DesktopVPSTerminal />;
```

### 8.5 Terminal Command Integration

**File:** `src/components/desktop/DesktopTerminal.tsx`

Add a command to the existing ThamOS terminal that opens a VPS terminal:

```
vps        -- Opens VPS Terminal window
vps status -- Shows VPS connection status
```

This way, users can type `vps` in the ThamOS CLI to launch the VPS terminal window, keeping the two terminals distinct:
- **ThamOS Terminal** = ThamOS-specific commands (scan, AI agents, workspace management)
- **VPS Terminal** = Real shell access to the VPS

### 8.6 Settings Integration

**File:** `src/components/desktop/DesktopSettings.tsx`

Add a "VPS Connection" section to Settings:
- VPS URL field (the Cloudflare Tunnel URL or custom domain)
- Connection test button (attempts WebSocket handshake, reports success/failure/latency)
- Default shell option (bash, zsh, fish)

Store the VPS URL in the Supabase `profiles` table (new column) or in a separate `user_vps_config` table.

### 8.7 Resize Integration

The DesktopWindow component already tracks window size. Pass the container dimensions to the VPS terminal component so xterm.js + FitAddon can recalculate rows and columns on resize.

The component should use a `ResizeObserver` on its container div:
```
ResizeObserver detects container size change
  --> FitAddon.fit() recalculates rows/cols
    --> Send resize message over WebSocket: { type: 'resize', cols, rows }
      --> VPS relay calls pty.resize(cols, rows)
```

---

## 9. Security Model

### 9.1 Defense in Depth (Layers)

```
Layer 1: Supabase Auth
  -- User must be logged into ThamOS with valid session
  -- JWT contains user ID, role, expiration

Layer 2: Cloudflare Tunnel
  -- VPS has ZERO open ports (no SSH, no HTTP, nothing)
  -- All traffic routes through Cloudflare's network
  -- DDoS protection included
  -- TLS termination at Cloudflare edge

Layer 3: (Optional) Cloudflare Access
  -- SSO/MFA required before reaching the tunnel
  -- Can restrict by email, IP range, identity provider
  -- Adds a service token that the relay can verify

Layer 4: Application Auth (Phase 2 -- Custom Relay)
  -- WebSocket connection includes JWT as query param or header
  -- Relay validates JWT signature using Supabase public key
  -- Checks user role (e.g., must be admin)
  -- Rejects invalid/expired tokens immediately

Layer 5: OS-Level Isolation
  -- Terminal spawns as a non-root user (thamosvps)
  -- User has limited permissions (no sudo unless needed)
  -- Chroot or container isolation (optional, for paranoid mode)
  -- ulimits on CPU, memory, file descriptors
```

### 9.2 What's Protected Against

| Threat | Mitigation |
|--------|-----------|
| Unauthorized access | Supabase Auth + JWT + Cloudflare Access |
| Port scanning | Zero open ports on VPS (Cloudflare Tunnel) |
| Man-in-the-middle | TLS via Cloudflare, WSS transport |
| DDoS | Cloudflare's network handles DDoS |
| Privilege escalation on VPS | Non-root user, limited permissions |
| Session hijacking | JWT expiration, token rotation |
| Credential exposure | No passwords stored in ThamOS (JWT-based) |
| Brute force | Cloudflare rate limiting + Access policies |
| Resource exhaustion | ulimits, max-clients limit on ttyd |
| Command injection from browser | Browser sends raw keystrokes, not commands -- the PTY handles all parsing. There is no "command" field to inject into. |

### 9.3 Audit Trail (Phase 2)

With the custom relay, log:
- Connection events (who connected, when, from what IP)
- Session duration
- (Optional) Command history -- the relay can intercept PTY output and parse command lines
- Disconnection events and reason

Store in Supabase `vps_session_logs` table:
```sql
CREATE TABLE vps_session_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  connected_at timestamptz DEFAULT now(),
  disconnected_at timestamptz,
  client_ip text,
  vps_host text,
  duration_seconds integer
);
```

---

## 10. Implementation File Manifest

### New Files

| File | Purpose |
|------|---------|
| `src/components/desktop/DesktopVPSTerminal.tsx` | xterm.js terminal component with WebSocket connection |
| `src/lib/vpsConnection.ts` | WebSocket management: connect, reconnect, auth, resize protocol |
| `src/lib/vpsTheme.ts` | xterm.js theme configuration matching ThamOS palette |

### Modified Files

| File | Change |
|------|--------|
| `src/design-system/appRegistry.ts` | Add `vps-terminal` app definition |
| `src/contexts/DesktopContext.tsx` | Add `'vps-terminal'` to `AppId` union type |
| `src/components/desktop/DesktopLayout.tsx` | Add routing case for `vps-terminal` |
| `src/components/desktop/DesktopTerminal.tsx` | Add `vps` command to open VPS terminal |
| `src/components/desktop/DesktopSettings.tsx` | Add VPS connection configuration section |
| `package.json` | Add xterm.js dependencies |

### VPS Files (Not in ThamOS repo)

| File | Purpose |
|------|---------|
| `/etc/systemd/system/ttyd.service` | ttyd systemd service definition |
| `~/.cloudflared/config.yml` | Cloudflare Tunnel configuration |
| `/etc/systemd/system/cloudflared.service` | Tunnel systemd service (created by `cloudflared service install`) |

### Database Migration (if storing VPS config)

| Migration | Purpose |
|-----------|---------|
| `add_vps_config_to_profiles.sql` | Add `vps_url` column to profiles table, or create `user_vps_config` table |

---

## 11. Alternative: WebSocket Relay (Advanced)

For the council's reference, here are three relay implementations in different languages. Any of these can replace ttyd in Phase 2.

### Go Relay (~60 lines)

```go
// Uses gorilla/websocket + creack/pty
// Single binary, no runtime dependencies
// Cross-compile for any platform
```

**Advantages:** Single binary, tiny memory footprint (~5MB), fast compilation, easy to deploy.

### Rust Relay (~80 lines)

```rust
// Uses tokio + tungstenite + portable-pty
// Maximum performance, minimum resource usage
// Security-focused language
```

**Advantages:** Memory safety guarantees, smallest possible binary, best performance.

### Node.js Relay (~80 lines)

Full implementation provided in Section 7, Phase 2 above.

**Advantages:** JavaScript ecosystem (easy to understand), `node-pty` is well-maintained (used by VS Code), simplest JWT validation (use `jsonwebtoken` npm package).

**Recommendation:** Start with Node.js for familiarity, consider Go for production deployment (single binary, no runtime needed).

---

## 12. Terminal UX Considerations

### 12.1 Two-Terminal Model

ThamOS should have TWO terminal types:

| Feature | ThamOS Terminal | VPS Terminal |
|---------|----------------|-------------|
| **Purpose** | ThamOS commands (scan, AI, workspace) | Real shell on VPS |
| **Implementation** | Custom React CLI | xterm.js + WebSocket |
| **Commands** | `scan`, `thamosx`, `open`, `workspace` | Any Linux command |
| **Interactive programs** | No | Yes (vim, tmux, htop) |
| **ANSI rendering** | Basic colors | Full (256 color, cursor, mouse) |
| **Connection** | None (runs locally in browser) | WebSocket to VPS |
| **Offline capable** | Yes (some commands) | No |
| **App ID** | `terminal` | `vps-terminal` |
| **Icon** | Command prompt icon | >_ with a remote indicator |

### 12.2 Bridging the Two

Users should be able to:
- From ThamOS Terminal: type `vps` to open a VPS Terminal window
- From ThamOS Terminal: type `vps exec nmap 192.168.1.1` to run a single command on the VPS and return output to ThamOS Terminal (Phase 3)
- Copy/paste between the two terminals (via ThamOS clipboard bus, when implemented)

### 12.3 Visual Differentiation

The VPS Terminal should be visually distinct from the ThamOS Terminal:
- Different window title: "VPS Terminal -- [hostname]" vs "Terminal"
- Status bar showing: connection state, latency, hostname, PTY size (cols x rows)
- Subtle visual indicator (border glow or accent color) when connected to live infrastructure
- "LIVE" badge in the title bar to indicate real shell access

### 12.4 Connection States

```
DISCONNECTED (default)
  --> User opens VPS Terminal window
  --> Show "Connect" button + VPS URL config

CONNECTING
  --> WebSocket handshake in progress
  --> Show spinner/pulse animation
  --> Timeout after 10 seconds

CONNECTED
  --> Full terminal interaction
  --> Show green status dot
  --> Show latency (ping every 5s)

ERROR
  --> Connection failed or dropped
  --> Show error message
  --> Show "Reconnect" button
  --> Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)

RECONNECTING
  --> Automatic reconnect in progress
  --> Show "Reconnecting in Xs..." message
  --> User can click "Reconnect now" to skip wait
```

---

## 13. Phase Plan

### Phase 1: MVP (ttyd + Cloudflare Tunnel)

**VPS side:**
1. Install ttyd
2. Create systemd service (listen on localhost:7681)
3. Install cloudflared
4. Create tunnel pointing to localhost:7681
5. Run tunnel as systemd service
6. Verify: open tunnel URL in browser, see working terminal

**ThamOS side:**
1. Install xterm.js packages
2. Add `vps-terminal` to app registry and AppId type
3. Create `DesktopVPSTerminal.tsx` component
4. Add routing in `DesktopLayout.tsx`
5. Add `vps` command to ThamOS Terminal
6. Add VPS URL to Settings
7. Test: open VPS Terminal in ThamOS, run real commands

**Result:** Working remote terminal in ThamOS. Basic auth via Cloudflare Tunnel. Full interactive terminal (vim, tmux, etc.).

### Phase 2: Hardened Auth

1. Replace ttyd with custom Node.js relay (JWT validation)
2. Add Cloudflare Access policy (SSO/MFA)
3. Add session logging to Supabase
4. Add admin-only access control

**Result:** Production-grade security. Audit trail. Role-based access.

### Phase 3: Multi-VPS + Integration

1. Support multiple VPS connections (connection picker in UI)
2. Store VPS configs per user in Supabase
3. Add `vps exec [command]` to ThamOS Terminal for single-command execution
4. Bridge ThamOS clipboard bus to VPS terminal (copy IOC from scan result, paste in VPS terminal)
5. Add terminal tabs/split panes within the VPS Terminal window

**Result:** Full operational environment. Multiple servers. Deep ThamOS integration.

---

## Appendix A: Key Libraries & Resources

| Resource | URL | Purpose |
|----------|-----|---------|
| xterm.js | https://xtermjs.org | Terminal emulator library |
| xterm.js GitHub | https://github.com/xtermjs/xterm.js | Source, docs, examples |
| ttyd | https://github.com/tsl0922/ttyd | Terminal sharing tool |
| Cloudflare Tunnel | https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/ | Zero-trust tunnel |
| node-pty | https://github.com/microsoft/node-pty | Node.js PTY binding (for custom relay) |
| Supabase JWT | https://supabase.com/docs/guides/auth/jwts | JWT structure and validation |

## Appendix B: ThamOS Architecture Context

For AI council members who need to understand ThamOS before working on this feature:

**What ThamOS is:**
A browser-based cybersecurity desktop OS (React SPA) that provides windowed apps, 4 workspaces, a taskbar, AI agents (Claude/GPT/Gemini), threat intelligence scanning (13+ API sources), case management, RSS feeds, and a CLI terminal. It targets SOC teams and security analysts.

**Tech stack:**
- Frontend: React 18 + TypeScript + Tailwind CSS + Vite
- Backend: Supabase (PostgreSQL + Edge Functions + Auth)
- State: React Context API (DesktopContext for windows, AuthContext for auth, ThemeContext for themes)
- Design: JetBrains Mono font, dark theme, cyan/green/amber/rose accent colors

**Window system:**
- `DesktopContext.tsx` manages all window state (position, size, z-index, workspace, minimized/maximized)
- `DesktopWindow.tsx` renders the window frame with drag, resize, snap
- `DesktopLayout.tsx` routes `appId` to the correct component
- `appRegistry.ts` defines all app metadata (14 apps currently)
- 4 workspaces, windows can be pinned across workspaces
- Keyboard: Ctrl+K opens app launcher, Ctrl+1-4 switches workspace

**Current apps (14):** Terminal, Scanner, Browser, AI Workshop, Intel Dashboard, Case Manager, System Monitor, Settings, File Manager (stub), Code Editor (stub), + 4 scan result viewers (IP/URL/Domain/Hash)

**Edge Functions (8):** ai-chat, analyze-extension, api-keys, github-proxy, ip2proxy-refresh, news-feeds, ransomware-intel, threat-intel, tor-list-refresh

**Database tables (12+):** profiles, user_api_keys, case_notes, ai_agents, ai_conversations, ai_messages, scan_history, news_sources, news_articles, user_alerts, user_custom_sources, watchlist_items

---

## Appendix C: Questions for the Council

1. **ttyd vs custom relay for Phase 1?** ttyd is faster to deploy but limits auth options. Custom relay takes a few hours more but gives JWT validation immediately. Given the user can build anything, the custom relay might be worth the upfront investment.

2. **Cloudflare Access -- worth the setup?** It adds SSO/MFA at the network layer before traffic even reaches the VPS. Strong recommendation if the user has a Cloudflare account. If not, JWT validation in the relay is sufficient.

3. **Terminal tabs/splits in Phase 1?** xterm.js supports multiple instances in one container. Should Phase 1 include tabs (multiple shell sessions), or keep it single-session for simplicity?

4. **Audit logging priority?** Should we log commands from day one (captures everything the user runs on the VPS) or defer to Phase 2? Logging from day one is more secure but requires the custom relay (ttyd doesn't expose command-level logging).

5. **VPS config storage?** Store the VPS URL in the `profiles` table (simple, one VPS per user) or create a dedicated `user_vps_connections` table (supports multiple VPS targets from the start)?

---

*This document is designed to be self-contained. Any AI on the council should be able to read this and immediately understand the problem, the options, the recommended solution, and exactly how to implement it.*
