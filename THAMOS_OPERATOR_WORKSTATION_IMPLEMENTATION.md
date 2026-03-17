# ThamOS Operator Workstation -- Unified Implementation Plan
## Council Document: Synthesized from All Architecture Sources

**For:** AI Development Council (Malakh, Claude, Bolt, GPT, Gemini)
**Project:** ThamOS X -- Private AI-Powered Operator Workstation
**Date:** 2026-03-17
**Status:** Implementation Ready
**Sources Synthesized:**
- Operator Workstation v2 (Council Plan)
- VPS Terminal Research & Implementation Plan
- ThamOS v2 Brainstorm
- ThamOS Desktop Reference
- Architecture v1 & v2

---

## 1. What This Document Is

This is the single source of truth for building ThamOS into a private AI-powered operator workstation. It merges the strategic vision (council plan), the terminal engineering blueprint (VPS research), the UX redesign goals (brainstorm), and the current system state (reference docs) into one phased build sequence.

Every council member reads this. Every implementation session references this.

---

## 2. Mission (Restated for Clarity)

Build a **private, single-operator workstation** that:
- Runs real commands on real infrastructure from a browser-based desktop
- Orchestrates AI agents to perform security analysis, DevOps, and app building
- Enforces controlled autonomy through tiered approvals
- Tracks everything through an observation layer
- Feels like a real operating system, not a web dashboard

**This is NOT:**
- SaaS or multi-tenant
- A simulation or toy
- Over-engineered for hypothetical users

---

## 3. Current System State (What Exists Today)

### 3.1 Working Infrastructure

| Component | Status | Location |
|-----------|--------|----------|
| Desktop window manager (drag/resize/snap/workspaces) | Complete | `DesktopContext.tsx`, `DesktopWindow.tsx` |
| 14 windowed apps | Complete | `src/components/desktop/Desktop*.tsx` |
| 4 workspaces with pinnable windows | Complete | `DesktopContext.tsx` |
| Taskbar with agent status dots | Complete | `Taskbar.tsx` |
| App launcher (Ctrl+K) | Complete | `AppLauncher.tsx` |
| Boot sequence | Complete | `BootSequence.tsx` |
| Simulated terminal (15+ commands) | Complete | `DesktopTerminal.tsx` |
| Scanner (IP/URL/Hash/Domain/Extension) | Complete | `DesktopScanner.tsx` + result windows |
| AI Workshop (3 agents: Claude/GPT/Gemini) | Complete | `DesktopWorkshop.tsx` |
| Intel Dashboard (RSS + ransomware feeds) | Complete | `DesktopIntelDashboard.tsx` |
| Case Manager | Complete | `DesktopCaseManager.tsx` |
| System Monitor | Complete | `DesktopSystemMonitor.tsx` |
| Settings (API keys, account, theme) | Complete | `DesktopSettings.tsx` |
| Internal browser | Complete | `DesktopBrowser.tsx` |
| Code editor (CodeMirror) | Complete | `DesktopCodeEditor.tsx` |
| GitHub file viewer | Complete | `GitHubFileViewer.tsx` |
| Supabase auth (email/password) | Complete | `AuthContext.tsx` |
| 12+ database tables with RLS | Complete | `supabase/migrations/` |
| 8 edge functions | Complete | `supabase/functions/` |
| 13+ threat intel API integrations | Complete | `threat-intel/index.ts` |

### 3.2 What Does NOT Exist Yet

| Component | Status | Priority |
|-----------|--------|----------|
| Real VPS terminal (xterm.js + WebSocket) | Not started | Phase 1 -- Critical |
| SAFE vs LIVE mode indicator | Not started | Phase 1 -- Critical |
| Tiered approval system for AI actions | Not started | Phase 2 |
| Observation layer (cost/action tracking) | Not started | Phase 2 |
| Privilege elevation model | Not started | Phase 2 |
| AI command execution pipeline | Not started | Phase 2 |
| Custom WebSocket relay (JWT auth) | Not started | Phase 3 |
| Rollback / dry-run for destructive ops | Not started | Phase 4 |
| Container isolation (Docker/Kali) | Not started | Phase 4 |
| Right-click context menus | Not started | Phase 3 (UX) |
| Window open/close animations | Not started | Phase 3 (UX) |
| Session state persistence | Not started | Phase 3 (UX) |
| Inter-app event bus | Not started | Phase 3 (UX) |
| Notification center (toasts + dropdown) | Not started | Phase 3 (UX) |
| Overview/activities mode | Not started | Phase 4 (UX) |

### 3.3 Known Technical Debt

| Issue | Severity | Impact on Build |
|-------|----------|-----------------|
| Palette `P` object duplicated in 5+ files | Medium | Does not block, but should be resolved in Phase 3 |
| Two incompatible theme systems (`themecontext.tsx` vs `ThemeContext.tsx`) | Medium | Does not block Phase 1-2 |
| No window animations | Low | UX polish, Phase 3 |
| No right-click context menus anywhere | Medium | UX polish, Phase 3 |
| No session persistence (windows reset on reload) | Medium | Phase 3 |
| `focus:outline-none` removes accessibility indicators | Medium | Should be fixed incrementally |

---

## 4. Architecture Overview

```
                    +-----------------------------------------+
                    |         THAMOS CONTROL PLANE             |
                    |  React / Vite / Tailwind / Supabase      |
                    |                                           |
                    |  +----------+  +----------+  +--------+  |
                    |  | ThamOS   |  | VPS      |  | AI     |  |
                    |  | Terminal |  | Terminal |  | Workshop|  |
                    |  | (SAFE)   |  | (LIVE)   |  | (Agents)|  |
                    |  +----------+  +----------+  +--------+  |
                    |       |              |             |       |
                    |  +---------+    +--------+   +---------+  |
                    |  |Orchestr.|    | WebSoc.|   |Approval |  |
                    |  |Commands |    | Conn.  |   |System   |  |
                    |  +---------+    +--------+   +---------+  |
                    +-----------|---------|-----------|---------+
                                |         |           |
                    +-----------|---------|-----------|---------+
                    |         OBSERVATION LAYER                 |
                    |  API cost | AI actions | Session logs     |
                    |  Anomaly detection | Budget enforcement   |
                    +-----------|---------|-----------|---------+
                                |         |           |
                    +-----------|---------|-----------|---------+
                    |         EXECUTION PLANE                   |
                    |                                           |
                    |  +-------+  +---------+  +----------+    |
                    |  | VPS   |  | GitHub  |  | Supabase |    |
                    |  | (ttyd |  | API     |  | DB/Edge  |    |
                    |  |  +CF) |  |         |  | Functions|    |
                    |  +-------+  +---------+  +----------+    |
                    |                                           |
                    |  +---------+  +--------+  +----------+   |
                    |  | Docker  |  | CLI    |  | Deploy   |   |
                    |  | Contain.|  | Tools  |  | Targets  |   |
                    |  +---------+  +--------+  +----------+   |
                    +-------------------------------------------+
```

### 4.1 Two Terminal Model (Critical Concept)

| Property | ThamOS Terminal (SAFE) | VPS Terminal (LIVE) |
|----------|----------------------|---------------------|
| Purpose | ThamOS commands, orchestration | Real shell on real infrastructure |
| Implementation | Custom React CLI (`DesktopTerminal.tsx`) | xterm.js + WebSocket (`DesktopVPSTerminal.tsx`) |
| Commands | `scan`, `thamosx/y/z`, `open`, `workspace` | Any Linux command: `nmap`, `vim`, `tmux`, `docker` |
| Interactive programs | No | Yes |
| ANSI rendering | Basic colors | Full (256 color, cursor, mouse) |
| Connection | None (runs in browser) | WebSocket to VPS via Cloudflare Tunnel |
| Risk level | Zero | Real -- commands execute on real systems |
| App ID | `terminal` | `vps-terminal` |
| Status bar color | Green border | Amber/red border |
| Mode badge | `SAFE` | `LIVE` |

### 4.2 Execution Flow

```
AI generates plan
  --> Plan displayed in ThamOS UI
    --> Operator reviews plan
      --> Tier check:
          A (auto): Execute immediately
          B (once): Approve plan, auto-execute steps
          C (always): Confirm each action
        --> Execute on VPS via terminal/API
          --> Log action to observation layer
            --> Display result in ThamOS
```

### 4.3 Tiered Approval System

| Tier | Name | Actions | Behavior |
|------|------|---------|----------|
| A | Auto Execute | New repos, branches, commits (non-main), preview deploys, analysis, tests, read operations | Execute without confirmation |
| B | Approve Plan Once | Multi-step workflows, scaffolding, dependency installs, config changes | Show full plan, approve once, steps auto-execute |
| C | Always Confirm | Production deploy, delete resources, force push, billing actions, destructive ops, `sudo` | Confirm every individual action |

### 4.4 Privilege Model

```
DEFAULT STATE: Non-root, restricted workspace
  |
  v
ELEVATION REQUEST: AI or operator requests elevated access
  |
  v
APPROVAL: Operator confirms in ThamOS UI (modal dialog)
  |
  v
GRANTED: Time-bound (e.g., 15 minutes), task-bound, visible in taskbar
  |
  v
AUTO-EXPIRE: Privilege drops back to default after timeout or task completion
```

---

## 5. Security Model

### 5.1 Defense in Depth (5 Layers)

```
Layer 1: Supabase Auth
  -- Valid session required for all ThamOS features
  -- JWT contains user ID, role, expiration

Layer 2: Cloudflare Tunnel
  -- VPS has ZERO open ports
  -- All traffic routed through Cloudflare network
  -- DDoS protection, TLS termination

Layer 3: (Optional) Cloudflare Access
  -- SSO/MFA before traffic reaches VPS
  -- Restrict by email, IP range, identity provider

Layer 4: Application Auth (Phase 2+ -- Custom Relay)
  -- WebSocket includes JWT as query parameter
  -- Relay validates JWT using Supabase public key
  -- Rejects invalid/expired tokens immediately

Layer 5: OS-Level Isolation
  -- Terminal spawns as non-root user (thamosvps)
  -- Limited permissions, no sudo by default
  -- ulimits on CPU, memory, file descriptors
  -- Phase 4: Docker container isolation
```

### 5.2 Prompt Injection Defense

The council plan identifies a critical AI security pattern: **split AI roles**.

```
UNTRUSTED DATA (web pages, email headers, scan results, code repos)
  |
  v
ANALYZER AGENT (reads untrusted content, produces structured summary)
  -- Cannot execute commands
  -- Cannot call APIs
  -- Output is a clean data structure, not raw text
  |
  v
EXECUTOR AGENT (acts on clean summary)
  -- Never sees raw untrusted content
  -- Only processes structured data from Analyzer
  -- Subject to tiered approval system
```

This prevents prompt injection via malicious content in scanned data from reaching the execution pipeline.

### 5.3 Command Guardrails

Commands blocked by default (require Tier C approval):

```
rm -rf /
dd if=/dev/zero
mkfs
:(){:|:&};:
> /dev/sda
chmod -R 777 /
iptables -F
systemctl stop sshd
kill -9 1
```

### 5.4 Mode Awareness (UI Requirements)

The UI must make the current execution context impossible to mistake:

| Element | SAFE Mode | LIVE Mode |
|---------|-----------|-----------|
| Terminal status bar | Green left border, `SAFE` badge | Amber left border, `LIVE` badge |
| Window title | "Terminal" | "VPS Terminal -- [hostname]" |
| Taskbar tab | Standard appearance | Amber dot indicator next to title |
| Hostname display | `thamosx@local` | `thamosvps@[actual-hostname]` |
| Connection indicator | None needed | Green dot (connected), Yellow (connecting), Red (error) |
| Latency display | None | `45ms` ping indicator |
| PTY dimensions | None | `120x40` cols/rows |

---

## 6. Observation Layer

### 6.1 What to Track

| Category | Data Points | Storage |
|----------|-------------|---------|
| API Cost | Token counts per AI call, estimated dollar cost, running daily total | `observation_api_costs` table |
| AI Actions | What the AI proposed, what was approved, what was rejected, what was executed | `observation_ai_actions` table |
| Session Activity | VPS connection events, duration, commands executed (Phase 2) | `observation_sessions` table |
| Anomalies | Unusual patterns: cost spike, rapid command execution, privilege escalation attempts | Derived from above tables |

### 6.2 Budget Enforcement

```
DAILY BUDGET: $X (configurable in settings)
  |
  v
Per-task limit: $Y (configurable per task type)
  |
  v
On each AI API call:
  --> Check remaining daily budget
  --> If exceeded: block call, notify operator
  --> If within budget: execute, log cost
  |
  v
Dashboard widget in System Monitor or Taskbar:
  --> "Today: $2.47 / $10.00" with progress bar
  --> Color shifts from green to amber to red as limit approaches
```

### 6.3 Database Schema (Observation Tables)

```sql
-- API cost tracking
CREATE TABLE observation_api_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  service text NOT NULL,          -- 'anthropic', 'openai', 'gemini'
  model text NOT NULL,            -- 'claude-3-opus', 'gpt-4', etc.
  input_tokens integer DEFAULT 0,
  output_tokens integer DEFAULT 0,
  estimated_cost_usd numeric(10,6) DEFAULT 0,
  task_id uuid,                   -- optional link to specific task
  created_at timestamptz DEFAULT now()
);

-- AI action audit log
CREATE TABLE observation_ai_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  agent text NOT NULL,            -- 'x', 'y', 'z'
  action_type text NOT NULL,      -- 'plan', 'execute', 'analyze'
  approval_tier text NOT NULL,    -- 'A', 'B', 'C'
  status text NOT NULL,           -- 'proposed', 'approved', 'rejected', 'executed', 'failed'
  description text NOT NULL,
  command text,                   -- actual command if applicable
  result text,                    -- execution result summary
  created_at timestamptz DEFAULT now()
);

-- VPS session tracking
CREATE TABLE observation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  vps_host text NOT NULL,
  connected_at timestamptz DEFAULT now(),
  disconnected_at timestamptz,
  client_ip text,
  duration_seconds integer,
  command_count integer DEFAULT 0
);
```

---

## 7. VPS Terminal -- Technical Implementation

This section is derived directly from the VPS Terminal Research document. It contains the exact steps to build the real terminal.

### 7.1 VPS Side Setup (Phase 1: ttyd + Cloudflare Tunnel)

#### Step 1: Install ttyd

```bash
sudo apt update
sudo apt install -y ttyd
ttyd --version
```

#### Step 2: Create dedicated terminal user

```bash
sudo useradd -m -s /bin/bash thamosvps
sudo passwd thamosvps
sudo apt install -y nmap dnsutils whois net-tools curl wget
```

#### Step 3: Create systemd service

File: `/etc/systemd/system/ttyd.service`
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

Key flags:
- `--interface 127.0.0.1` -- Only listen on localhost (NOT accessible from internet)
- `--writable` -- Allow input (without this, terminal is read-only)
- `--max-clients 3` -- Limit concurrent sessions
- `--ping-interval 30` -- Keep WebSocket alive

```bash
sudo systemctl daemon-reload
sudo systemctl enable ttyd
sudo systemctl start ttyd
```

#### Step 4: Install Cloudflare Tunnel

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb
```

#### Step 5: Create tunnel

**Named Tunnel (production):**
```bash
cloudflared tunnel login
cloudflared tunnel create thamos-terminal
cloudflared tunnel route dns thamos-terminal terminal.yourdomain.com
```

Config file `~/.cloudflared/config.yml`:
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

**Quick Tunnel (testing):**
```bash
cloudflared tunnel --url http://127.0.0.1:7681
```

#### Step 6: Run tunnel as service

```bash
sudo cloudflared service install
sudo systemctl start cloudflared
```

### 7.2 ThamOS Side (Frontend Integration)

#### New Dependencies

```bash
npm install @xterm/xterm @xterm/addon-fit @xterm/addon-web-links @xterm/addon-webgl
```

| Package | Purpose |
|---------|---------|
| `@xterm/xterm` | Terminal emulator core |
| `@xterm/addon-fit` | Auto-resize to fit container |
| `@xterm/addon-web-links` | Clickable URLs in output |
| `@xterm/addon-webgl` | GPU-accelerated rendering |

#### New Files to Create

| File | Purpose |
|------|---------|
| `src/components/desktop/DesktopVPSTerminal.tsx` | xterm.js terminal with WebSocket connection, status bar, LIVE mode indicator |
| `src/lib/vpsConnection.ts` | WebSocket management: connect, reconnect, auth, resize protocol |
| `src/lib/vpsTheme.ts` | xterm.js theme matching ThamOS palette |

#### Files to Modify

| File | Change |
|------|--------|
| `src/design-system/appRegistry.ts` | Add `vps-terminal` app definition |
| `src/contexts/DesktopContext.tsx` | Add `'vps-terminal'` to `AppId` union type |
| `src/components/desktop/DesktopLayout.tsx` | Add routing case for `vps-terminal` |
| `src/components/desktop/DesktopTerminal.tsx` | Add `vps` command to open VPS terminal |
| `src/components/desktop/DesktopSettings.tsx` | Add VPS connection configuration section |
| `package.json` | Add xterm.js dependencies |

#### xterm.js Theme (Matching ThamOS Palette)

```typescript
const terminalTheme = {
  background: '#060610',
  foreground: '#c8cde0',
  cursor: '#00d9ff',
  cursorAccent: '#060610',
  selectionBackground: 'rgba(0, 217, 255, 0.2)',
  black: '#0a0e1a',
  red: '#ff0080',
  green: '#00ff9d',
  yellow: '#fbbf24',
  blue: '#00b4d8',
  magenta: '#b794f6',
  cyan: '#00d9ff',
  white: '#c8cde0',
  brightBlack: '#3a3f55',
  brightRed: '#ff3399',
  brightGreen: '#33ffb4',
  brightYellow: '#fcd34d',
  brightBlue: '#38bdf8',
  brightMagenta: '#c4b5fd',
  brightCyan: '#22d3ee',
  brightWhite: '#f8fafc',
};
```

#### VPS Terminal Component Structure

```
DesktopVPSTerminal
  |-- Connection status bar (top)
  |     |-- LIVE badge (amber background)
  |     |-- Status dot (green=connected, yellow=connecting, red=error)
  |     |-- VPS hostname
  |     |-- Latency indicator (e.g., "45ms")
  |     |-- PTY dimensions (e.g., "120x40")
  |     |-- Disconnect button
  |
  |-- xterm.js container (fills remaining space)
  |     |-- Full terminal emulation
  |     |-- ANSI 256-color support
  |     |-- Mouse support (tmux, vim, etc.)
  |     |-- Clickable URLs
  |
  |-- (On disconnect) Reconnect overlay
        |-- "Connection lost" message
        |-- Reconnect button
        |-- Back to ThamOS Terminal button
```

#### Connection States

```
DISCONNECTED (default)
  --> Show "Connect" button + VPS URL config

CONNECTING
  --> WebSocket handshake in progress
  --> Spinner/pulse animation
  --> Timeout after 10 seconds

CONNECTED
  --> Full terminal interaction
  --> Green status dot
  --> Latency ping every 5 seconds

ERROR
  --> Connection failed or dropped
  --> Show error message + "Reconnect" button
  --> Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)

RECONNECTING
  --> "Reconnecting in Xs..." message
  --> "Reconnect now" button to skip wait
```

#### Resize Protocol

```
Window resize detected (DesktopWindow.tsx)
  --> Container dimensions passed to VPSTerminal
    --> ResizeObserver detects container size change
      --> FitAddon.fit() recalculates rows/cols
        --> Send resize message over WebSocket:
            { type: 'resize', cols: 120, rows: 40 }
          --> VPS relay calls pty.resize(cols, rows)
            --> Running program receives SIGWINCH and redraws
```

### 7.3 VPS Side (Phase 2: Custom WebSocket Relay)

When ready for JWT auth and audit logging, replace ttyd with:

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
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const token = url.searchParams.get('token');

  try {
    const decoded = jwt.verify(token, SUPABASE_JWT_SECRET);
    console.log(`[AUTH] User ${decoded.sub} connected`);
  } catch (err) {
    console.log(`[AUTH] Invalid token, closing connection`);
    ws.close(4001, 'Unauthorized');
    return;
  }

  const shell = pty.spawn(SHELL, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME,
    env: process.env,
  });

  shell.onData((data) => {
    if (ws.readyState === 1) ws.send(data);
  });

  ws.on('message', (msg) => {
    const str = msg.toString();
    try {
      const parsed = JSON.parse(str);
      if (parsed.type === 'resize') {
        shell.resize(parsed.cols, parsed.rows);
        return;
      }
    } catch {}
    shell.write(str);
  });

  ws.on('close', () => {
    shell.kill();
  });

  shell.onExit(() => {
    ws.close();
  });
});

console.log(`[RELAY] Listening on 127.0.0.1:${PORT}`);
```

---

## 8. OpenClaw Strategy

**OpenClaw = TRANSITIONAL TOOL. Not architecture.**

### Purpose
- Test autonomy patterns: what does AI need to do?
- Observe real workflows: what approval flows emerge naturally?
- Identify required capabilities for the custom orchestrator

### How It Fits
- OpenClaw runs on the VPS as a standalone tool
- AI agents in ThamOS Workshop send commands to OpenClaw via the VPS terminal
- ThamOS itself does NOT deeply integrate with OpenClaw
- No OpenClaw-specific code in the ThamOS React codebase

### What Replaces It (Phase 4+)
A custom broker/orchestrator built into ThamOS that:
- Receives task descriptions from the AI Workshop
- Decomposes tasks into steps
- Applies tiered approval
- Executes via the VPS terminal or APIs
- Logs to the observation layer
- Reports results back to the UI

---

## 9. Phased Build Plan

### Phase 1: Real Terminal in ThamOS (Foundation)

**Goal:** Working remote VPS terminal inside ThamOS desktop environment with SAFE/LIVE mode distinction.

**VPS Side Tasks:**
1. Provision VPS (Ubuntu/Debian) if not already done
2. Install ttyd
3. Create `thamosvps` user with security tools
4. Create systemd service for ttyd (localhost:7681 only)
5. Install cloudflared
6. Create Cloudflare Tunnel pointing to localhost:7681
7. Run tunnel as systemd service
8. Verify: open tunnel URL in browser, see working terminal

**ThamOS Side Tasks:**
1. Install xterm.js packages (`@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`, `@xterm/addon-webgl`)
2. Create `src/lib/vpsTheme.ts` (xterm.js theme matching ThamOS palette)
3. Create `src/lib/vpsConnection.ts` (WebSocket management)
4. Create `src/components/desktop/DesktopVPSTerminal.tsx` (xterm.js component with status bar)
5. Add `vps-terminal` to app registry in `appRegistry.ts`
6. Add `'vps-terminal'` to `AppId` union type in `DesktopContext.tsx`
7. Add routing case in `DesktopLayout.tsx`
8. Add `vps` command to `DesktopTerminal.tsx` to open VPS terminal window
9. Add VPS URL configuration to `DesktopSettings.tsx`
10. Add SAFE/LIVE mode badge to both terminal status bars
11. Store VPS URL in user profile or `user_vps_config` table

**Deliverable:** Open ThamOS, type `vps` in terminal, VPS Terminal window opens, run `nmap 192.168.1.1` on real infrastructure, see real output. SAFE and LIVE modes are visually distinct.

---

### Phase 2: AI Execution Pipeline

**Goal:** AI agents can propose and execute real actions through the VPS terminal with human approval.

**Tasks:**
1. Design the AI action proposal format (structured JSON: action, reason, risk tier, expected outcome)
2. Build approval UI component (modal with plan details, approve/reject/modify buttons)
3. Implement tiered approval logic in `ExecutionContext`:
   - Tier A: auto-execute, log only
   - Tier B: show plan, approve once, auto-execute steps
   - Tier C: confirm each action individually
4. Wire AI Workshop agents to emit action proposals (extend `ai-chat` edge function)
5. Build execution bridge: approved action --> VPS terminal command
6. Log all actions to `observation_ai_actions` table

**Database Migration:**
- Create `observation_ai_actions` table
- Create `observation_api_costs` table
- Create `observation_sessions` table
- RLS: user can only see their own observation data

**Deliverable:** Ask AI Agent X "Create a new GitHub repo called test-project", agent proposes plan, operator approves, repo is created on VPS, action is logged.

---

### Phase 3: Observation + Hardened Auth + UX Polish

**Goal:** Full visibility into system behavior. Production-grade terminal auth. Desktop feels like an OS.

**Observation Tasks:**
1. Build cost tracking widget (daily spend, per-task spend, budget progress bar)
2. Add cost tracking to AI Workshop (count tokens per message, estimate cost)
3. Build observation dashboard (either in System Monitor or as new app)
4. Implement budget enforcement (block AI calls when daily budget exceeded)
5. Add session logging for VPS terminal connections

**Terminal Hardening Tasks:**
1. Replace ttyd with custom Node.js relay (JWT validation)
2. Add Cloudflare Access policy (SSO/MFA)
3. Add session logging to Supabase
4. Add command audit trail (relay logs commands to observation layer)

**UX Polish Tasks (from v2 Brainstorm):**
1. Implement context menu system (right-click on desktop, windows, taskbar)
2. Add window open/close animations (scale + opacity, 150ms)
3. Add session state persistence (save/restore window positions to localStorage + Supabase)
4. Implement notification toasts (slide-in from top-right, auto-dismiss)
5. Add inter-app event bus (`scan:completed`, `clipboard:updated`, `agent:response`)
6. Redesign taskbar with blur, system tray, richer layout

**Database Migration:**
- Add `user_vps_config` table (VPS URL, default shell, connection preferences)
- Add `user_desktop_state` table (window positions, workspace, open apps)

**Deliverable:** Cost is tracked and visible. Terminal uses JWT auth. Desktop has right-click menus, animations, and persists state across sessions.

---

### Phase 4: Advanced Capabilities

**Goal:** Container isolation, dry-run for destructive ops, multi-VPS routing, activities overview.

**Tasks:**
1. Add Docker container support to relay (spawn PTY inside container instead of host)
2. Pre-build Kali Linux container image with security tools
3. Implement dry-run mode: preview destructive commands without executing
4. Implement rollback: undo last N actions (git-based where applicable)
5. Add multi-VPS connection picker (store configs in `user_vps_config` table)
6. Build activities/overview mode (GNOME-style expose: all windows at a glance)
7. Build custom orchestrator to replace OpenClaw
8. Add task routing (send tasks to appropriate VPS/container based on requirements)

**Deliverable:** Operator can spin up a Kali container, run tools in isolation, preview destructive commands before executing, undo mistakes, manage multiple VPS targets, and see all windows at a glance.

---

## 10. Database Migration Plan

### Phase 1 Migrations

```sql
-- Add VPS URL to profiles (simplest approach for single operator)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vps_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS vps_default_shell text DEFAULT 'bash';
```

### Phase 2 Migrations

Tables: `observation_api_costs`, `observation_ai_actions`, `observation_sessions`
(Full schema in Section 6.3 above)

### Phase 3 Migrations

```sql
-- User desktop state persistence
CREATE TABLE IF NOT EXISTS user_desktop_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL UNIQUE,
  window_state jsonb NOT NULL DEFAULT '[]',
  active_workspace integer DEFAULT 1,
  updated_at timestamptz DEFAULT now()
);

-- Multi-VPS configuration (Phase 4 ready)
CREATE TABLE IF NOT EXISTS user_vps_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  name text NOT NULL,
  vps_url text NOT NULL,
  hostname text,
  default_shell text DEFAULT 'bash',
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
```

All tables will have RLS enabled with user-only access policies.

---

## 11. Questions That Need Answers Before Phase 1

These are blockers. They need answers from the operator before implementation begins.

1. **VPS Status:** Is the VPS provisioned? What provider? What OS? Do you have SSH access and can install packages?

2. **Cloudflare Status:** Do you have a Cloudflare account with a domain configured? This determines named tunnel (stable URL like `terminal.yourdomain.com`) vs quick tunnel (random URL, changes on restart).

3. **Phase 1 Scope Boundary:** Should the SAFE/LIVE mode indicator be part of Phase 1, or is a plain VPS terminal window sufficient for the first ship?

4. **VPS Config Storage:** Store VPS URL in `profiles` table (simple, one VPS) or create `user_vps_connections` table from the start (supports multiple VPS targets)?

5. **OpenClaw Timing:** Is OpenClaw being tested concurrently with Phase 1, or is it deferred to Phase 2?

---

## 12. Non-Goals (Explicitly Excluded)

- Multi-user / multi-tenant support
- SaaS features (billing, onboarding, public registration)
- Perfect security (practical containment + visibility instead)
- Over-engineering for future users who don't exist
- Mobile/responsive design (this is a desktop workstation)
- Simulating hardware metrics (only real data: API costs, connection latency, etc.)

---

## 13. Council Roles

| Council Member | Role | Focus |
|----------------|------|-------|
| Malakh | Architecture + Security | System design, privilege model, threat modeling |
| Claude | Enhancements + Safety | Code quality, edge cases, safety systems |
| Bolt | Execution + Implementation | Hands-on code, deployment, testing |
| GPT | Research + Analysis | Technical research, alternative approaches |
| Gemini | Verification + Testing | Validation, testing strategies, quality assurance |

---

## 14. Success Criteria

Phase 1 is done when:
- [ ] VPS terminal opens inside ThamOS as a windowed app
- [ ] Real commands execute on real infrastructure
- [ ] Interactive programs work (vim, tmux, htop)
- [ ] Window resize adjusts terminal dimensions correctly
- [ ] SAFE and LIVE modes are visually distinguishable
- [ ] Connection states are handled (connecting, connected, error, reconnect)
- [ ] VPS URL is configurable in Settings

Phase 2 is done when:
- [ ] AI agent can propose an action plan in structured format
- [ ] Operator can approve/reject/modify the plan
- [ ] Approved actions execute on VPS
- [ ] All actions are logged to observation tables
- [ ] Tiered approval works correctly for all three tiers

Phase 3 is done when:
- [ ] API costs are tracked and displayed
- [ ] Budget enforcement blocks over-budget AI calls
- [ ] Terminal uses JWT auth (custom relay replaces ttyd)
- [ ] Right-click context menus work on desktop/windows/taskbar
- [ ] Window state persists across browser sessions
- [ ] Notification toasts appear for scan completions and agent responses

Phase 4 is done when:
- [ ] Commands can execute inside Docker containers
- [ ] Dry-run mode previews destructive commands
- [ ] Multiple VPS connections are supported
- [ ] Activities overview shows all windows at a glance

---

## 15. File Reference (Existing Codebase)

### Desktop Shell
- `src/components/desktop/DesktopLayout.tsx` -- Root layout, wallpaper, app routing
- `src/components/desktop/DesktopWindow.tsx` -- Window frame (drag/resize/snap)
- `src/components/desktop/Taskbar.tsx` -- Bottom panel
- `src/components/desktop/AppLauncher.tsx` -- Ctrl+K app grid
- `src/components/desktop/DesktopIcons.tsx` -- Desktop shortcuts
- `src/components/desktop/BootSequence.tsx` -- Boot animation

### App Windows
- `src/components/desktop/DesktopTerminal.tsx` -- Simulated CLI (SAFE mode)
- `src/components/desktop/DesktopScanner.tsx` -- Scanner
- `src/components/desktop/DesktopBrowser.tsx` -- Internal browser
- `src/components/desktop/DesktopWorkshop.tsx` -- AI Workshop (3 agents)
- `src/components/desktop/DesktopIntelDashboard.tsx` -- Intel feeds
- `src/components/desktop/DesktopCaseManager.tsx` -- Case management
- `src/components/desktop/DesktopSystemMonitor.tsx` -- System stats
- `src/components/desktop/DesktopSettings.tsx` -- Settings
- `src/components/desktop/DesktopCodeEditor.tsx` -- Code editor
- `src/components/desktop/GitHubFileViewer.tsx` -- GitHub browser

### State Management
- `src/contexts/DesktopContext.tsx` -- Window manager (14 operations, 4 workspaces)
- `src/contexts/AuthContext.tsx` -- Supabase auth
- `src/contexts/AlertContext.tsx` -- Notification counts
- `src/contexts/themecontext.tsx` -- UI mode (desktop/tactical/terminal/mission-control)
- `src/contexts/ThemeContext.tsx` -- Database-driven color themes

### Design System
- `src/design-system/appRegistry.ts` -- App definitions (14 apps)
- `src/design-system/tokens.ts` -- Palette, typography, spacing tokens

### Libraries
- `src/lib/supabase.ts` -- Supabase client
- `src/lib/threatIntel.ts` -- Threat intel API wrapper
- `src/lib/iocAnalysis.ts` -- Verdict classification
- `src/lib/iocDetection.ts` -- IOC extraction patterns
- `src/lib/cliFlags.ts` -- CLI flags parser
- `src/lib/github.ts` -- GitHub API wrapper

### Edge Functions
- `supabase/functions/ai-chat/` -- AI agent proxy
- `supabase/functions/threat-intel/` -- Threat intel routing hub
- `supabase/functions/api-keys/` -- Encrypted key management
- `supabase/functions/analyze-extension/` -- Chrome extension analysis
- `supabase/functions/news-feeds/` -- RSS aggregation
- `supabase/functions/ransomware-intel/` -- Ransomware feeds
- `supabase/functions/github-proxy/` -- GitHub API proxy
- `supabase/functions/tor-list-refresh/` -- Tor exit node updates
- `supabase/functions/ip2proxy-refresh/` -- VPN/proxy database updates

---

## 16. Final Directive

Build fast. Ship Phase 1. Observe behavior. Refine.

The system does not need to be perfect. It needs to be real.

A working VPS terminal inside ThamOS with a clear SAFE/LIVE distinction is more valuable than a perfect architecture document with no running code.

Every phase builds on the previous. Nothing is thrown away. The ttyd setup becomes the relay. The relay becomes the orchestrator. The observation layer grows with each phase.

**STATUS: READY FOR IMPLEMENTATION**

---

*This document supersedes all previous architecture plans for the operator workstation build. All council members should reference this document for implementation decisions. Last updated: 2026-03-17.*
