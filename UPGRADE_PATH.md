# thamos6 — Upgrade Path & Roadmap

A forward-looking record of recommended improvements, so the plan survives a
machine switch. Grouped by area, roughly in priority order within each. Items
marked **[done]** were shipped in the June 2026 work cycle and are listed only so
a fresh checkout knows the current baseline.

> Scope note: thamos6 is a defensive SOC / threat-intel platform with a
> browser-based "desktop OS" shell (window manager, taskbar, workspaces) whose
> windows are real capabilities backed by Supabase edge functions. The
> differentiator vs. generic web desktops is that every app is a real analyst
> tool with a backend — so most upgrades below deepen that "bite" rather than
> chase chrome.

---

## 0. Baseline shipped in this cycle (for reference)

- **[done]** Email Analyzer audit: attachment triage (dangerous/double-extension/
  HTML-smuggling), display-name impersonation + anchor-text-vs-href mismatch,
  false-positive defusal (hidden-preheader, Return-Path/Reply-To nuance),
  provider selector (Claude/GPT) so OpenAI-only users aren't locked out, full
  per-IOC enrichment fed to the verdict, shared design tokens, attachments tab.
- **[done]** Sender-domain DNS posture (SPF/DMARC/MX via DoH, `_shared/dns.ts`)
  surfaced in the analyzer and the grounded verdict ("is the From domain even
  spoofable?").
- **[done]** New threat-intel sources: Shodan InternetDB + SANS/DShield (no key),
  abuse.ch Auth-Key wired for URLhaus/ThreatFox/MalwareBazaar (`ABUSECH_AUTH_KEY`
  secret set).
- **[done]** Scoring made category-aware: `CalibratedScoring.categories[]` tags
  *what* an IOC is seen doing; Spamhaus SBL re-weighted 80→50 so spam-only reads
  "suspicious," not "malicious." Legacy `overallThreatScore` remains the default;
  calibrated shown alongside in `VerdictPanel`.

---

## 1. Desktop shell — bugs to fix

1. **Restored windows come back blank (functional bug).** `saveLayout()` in
   `DesktopContext.tsx` does not persist a window's `data`, so result windows
   (ip/url/hash/domain) reopen with `value === undefined`. Persist `data` (and
   `minimized`) in `SavedLayout`.
2. **Per-pixel drag re-render storm.** Dragging commits position to global
   context every mousemove; with no memoized provider value, every window +
   taskbar re-renders each frame. Hold transient position locally during drag,
   commit on mouseup; memoize the context value; consider slice-based subscribe.
3. **New windows can open off-screen.** `openWindow` uses a fixed cascade with no
   viewport clamp at open time. Clamp initial position/size to the viewport.
4. **Stacked backdrop-blurs are GPU-expensive.** Every window blurs at 24px even
   when inactive/occluded. Drop blur on inactive windows.
5. **Traffic-light affordance is colour-only**; glyphs hidden until hover.
   Show faint glyphs always (colour-blind a11y); consider macOS close-first order.
6. **Mouse vs keyboard tiling mismatch** — drag-snap supports quarters, keyboard
   only halves+max. Add `Ctrl+Shift+Arrow` for quarters.
7. **Agent-status dots never refresh** after mount; refetch on a
   `thamos:keys-changed` event (same pattern as the wallpaper event).
8. **`palette.pink` typo** in `DesktopTerminal.tsx` (no such token → invalid
   colour string).

## 2. Scanner — bugs to fix

1. **Detection is ahead of rendering.** `detectIOCType` classifies cve/wallet/
   email and the hero advertises extension IDs, but `DesktopScanner` only renders
   ip/url/domain/hash — everything else dead-ends at "coming soon." Route
   extension IDs to the existing `ExtensionScanner`; either build cve/wallet/email
   result pages or stop classifying them / show an honest message.
2. **`Math.random()` inside render** for the source-activity dots (impure;
   flickers each keystroke).
3. **Recent-lookup cards are dead** — `cursor-pointer` + an empty `onClick`.
   Wire to `onScan(type, value)`.
4. **Decorative fake telemetry** (`LATENCY: 24MS`, `SESSION`, footer
   `Region/AES-256/TLS 1.3`) reads as live. De-emphasize or make real.
5. Recent panel still reads legacy `threat_score`, not the calibrated layer.

## 3. Feature ideas — terminals / scanner / AI

**Terminal**
- Make `whois`/`dig`/`nmap` real (route through existing enrichment) or tag
  `[sim]` — currently hardcoded fake output, a credibility trap in a SOC tool.
- **Scan → verdict chain**: `scan -ip x --ask` runs the scan *and* drops the
  grounded `ioc-verdict` in one step (activates work already shipped).
- Persist command history across sessions + `Ctrl+R` reverse search.
- Tab-complete arguments/flags/recent IOCs, not just command names.

**Scanner**
- **IOC triage queue**: paste a blob → auto-extract (IOCExtractor) → batch-scan →
  ranked table by calibrated score / highest legacy-vs-calibrated divergence.
  The payoff workflow for the scoring work.
- Make `ioc-verdict.pivot_suggestions[]` clickable → open new scans.
- Score-delta on re-scan ("seen 3d ago, 40 → 72").
- Finish CVE / wallet result pages (currently stubbed).

**AI council (T6)**
- Feed live scan/email context into the council via the existing `ContextSnippet`
  infra (it's currently an island — biggest unlock).
- Pre-flight token/cost estimate before the 3-provider fan-out.
- One-click "send synthesis to Case."

## 4. Threat-intel sources & data

- **ip-api.com is non-commercial-only** (`threat-intel/index.ts`). If thamos6
  goes commercial, swap to IPinfo / IPLocate / ipwho or self-hosted MaxMind.
- **emailrep.io is effectively dead** (needs a key now) — replaced in practice by
  the DNS sender-posture check; consider removing the dead call.
- Optional aggregators (free key): **Pulsedive**, **Maltiverse** — one call, many
  feeds. Lower priority given current breadth.
- **Feodo Tracker** (abuse.ch botnet C2) — deferred; abuse.ch downloads now also
  need the Auth-Key, and it overlaps ThreatFox C2 coverage.
- Verify Google Safe Browsing endpoint (v4 → v5 / Web Risk migration).

## 5. "Bite" upgrades — mechanics drawn from real web-desktop projects

The generic web desktops are general-purpose; steal their *mechanics*, not their
domain. References: **daedalOS** (https://github.com/DustinBrett/daedalOS),
**Puter** (https://github.com/HeyPuter/puter), **OS.js**
(https://github.com/os-js/OS.js), and **Maltego** for investigation UX.

- **Real virtual file system for cases/evidence** (daedalOS model). Back the Case
  Manager with a persisted VFS; dropping a `.eml`/sample on the desktop opens it
  in the right analyzer.
- **App SDK / plugin model** (Puter + OS.js). De-hardcode `renderWindowContent`
  into a registered-app API so analyst tools are pluggable, not switch-cased.
- **File associations** — double-click an artifact → correct app, by type.
- **In-browser disposable sandbox / viewer** for suspicious `.eml`/HTML
  attachments, isolated from the analyst host (idea from copy.sh / v86). Real
  detonation stays server-side; an isolated preview is on-brand and unique.
- **Pivot / link-analysis canvas app** (Maltego model) — a graph view that turns
  `ioc-verdict.pivot_suggestions` into a visual investigation surface.
- **Case Manager as the spine**: a "Send to Case" affordance on every scan,
  verdict, and council synthesis turns the desktop from a tool pile into an
  investigation record.
- **Verdict history**: `email_verdicts` / `ioc_verdicts` are currently write-only
  — add a recall/history view.

## 6. Reference projects

| Project | Why study it |
|---|---|
| [daedalOS](https://github.com/DustinBrett/daedalOS) | Gold standard: persistent VFS, file associations, in-browser app/emulation. MIT. |
| [Puter](https://github.com/HeyPuter/puter) | Productized web OS: app SDK + store, multi-user, self-host, built-in AI. **AGPL — ideas only, see licensing note.** |
| [OS.js](https://github.com/os-js/OS.js) | Cleanest app-platform architecture (window manager, VFS abstraction, package API). |
| [macos-web (puruvj)](https://github.com/puruvj/macos-web) | Dock/genie/animation polish. |
| Maltego | Investigation/pivot canvas UX (commercial; concept reference). |

> **Licensing landmine:** Puter is **AGPL-3.0** — copying its *code* would force
> thamos6 to become AGPL too. Draw architectural *ideas* from it, do not paste
> code. daedalOS/OS.js are permissive (MIT-ish) but still require attribution if
> code is reused. Keep proprietary code clean of copied snippets.

---

## 7. Architecture decision — t6 vs. tenant (companion split vs. full fork)

**Status:** under active design (brainstorm in progress). This section is the
working record; revise as decisions firm up.

### The problem

t6 today is fully externally hosted. For real enterprise/SOC use it must touch
tenant-confidential things — PII, Entra auth, Azure Logic App playbooks, data
lake / Sentinel queries, TopDesk secrets in Key Vault. Putting those in an
external SaaS is wrong. Two ways to resolve it:

- **Option A — Companion app (split).** A static web app deployed *inside the
  Entra tenant* (e.g. Azure Static Web Apps) holds all UI, PII handling, and
  tenant-privileged actions. It calls *out* to externally-hosted t6 for
  enrichment/scanning. Sensitive data and secrets never leave the tenant.
- **Option B — Full redeployable t6 in-tenant.** Package the entire t6 stack
  (edge functions, DB, all third-party API keys) to run inside each tenant. The
  deployment is then either fully org-hosted or fully external — no split.

### Decision (current lean): Option A, boundary drawn by data sensitivity

Not "thin UI vs. all brains" — draw the line by **what the data is**:

> **Send indicators, never identities.**

IPs, hashes, domains, defanged URLs = indicators (already sent to VT/Shodan/etc;
fine to send to t6). Recipient names, internal UPNs, raw email bodies, sign-in
logs, data-lake rows = identities/tenant data (must not cross the boundary).

### Three-layer shape

1. **Tenant-side companion** (Azure SWA, Entra-protected): all UI, PII handling,
   Logic App triggers, data-lake/Sentinel queries, TopDesk via Key Vault, **plus
   the portable pure logic** — email parser, calibrated scoring, category
   attribution. These already live as near-pure functions in `_shared/`; extract
   them as a small shared package so the companion runs them locally with zero
   PII egress.
2. **t6 enrichment API** (external, proprietary): third-party-feed aggregation +
   your keys, behind a clean contract — `POST /enrich { type, value } →
   { aggregate, scoring }`. The companion receives t6's *output*, never its code
   or keys. ("Return all enrichment" = return results; the logic stays
   server-side, which is what protects the IP.)
3. **Tenant LLM** (Azure OpenAI in-tenant) for verdicts needing body/identity
   grounding, so even AI grounding stays home.

### The email PII trap (must-fix for Option A)

The analyzer currently ships **raw `.eml`** to `analyze-email` / `email-verdict`
— raw mail *is* PII, so naive Option A would leak it. Fix: run the dependency-
free `_shared/email-parser.ts` **tenant-side**; only extracted indicators go out.
Run the grounded verdict against **Azure OpenAI in-tenant** (or redact the body
before sending).

### Why not Option B (full fork)

- **API keys / licenses.** t6's value is aggregated VT/Shodan/AbuseIPDB/abuse.ch/
  GreyNoise keys — several under per-org or non-commercial terms. Replicating the
  backend per tenant duplicates secrets into customer environments (security +
  ToS + cost) and scatters them.
- **Drift.** Every tenant runs a fork; you patch each bug N times.
- **IP exposure.** The whole proprietary codebase ships into customer
  environments — against the LICENSE. Central enrichment keeps the brains + keys
  in one protected place.
- Only viable if you're a single self-hosting tenant forever and never share it —
  and even then it's more ops for no security gain over the split.

### Auth

Static API key = MVP only (long-lived secret). Preferred: **Entra app-to-app
(OAuth2 client-credentials)** or a per-tenant key in the tenant's Key Vault with
rotation. t6 validates, scopes, and rate-limits per tenant → free per-tenant
audit + billing. Foundations already exist: org tier, `user_api_keys`, and the
`ALLOWED_ORIGINS` CORS allowlist.

### License synergy

The split reinforces the proprietary LICENSE: brains + feed keys stay
server-side (uncopyable); the companion is a thinner client you could let tenants
self-deploy. Posture: **source-available companion, closed enrichment engine.**

### Open questions (to resolve while brainstorming)

- Exact field-level data-egress contract: what crosses, what's redacted/tokenized?
- Does the tenant have Azure OpenAI available for in-tenant verdicts?
- Auth mechanism: Entra app-to-app vs. per-tenant Key Vault key for v1?
- Which capabilities are IOC-only (safe to externalize) vs. PII-touching
  (tenant-side)? Draw the full per-feature map.
- Caching/availability: how does the companion degrade if t6 is unreachable?
- Multi-tenant future: one shared enrichment engine for many tenants, or
  per-customer isolation?
