# ThamOS Enrichment Upgrade Plan

> Phased plan for adding new threat-intel sources, IOC types, and analyzer apps to ThamOS X.
> Lane assignments split execution between Sonnet (pattern work) and Opus (design / security / synthesis).

**Lane key:** **S** = Sonnet (pattern execution) · **O** = Opus (design / security / synthesis) · **O→S** = Opus designs, Sonnet implements

---

## Phase 0 — Quick wins, no design (1–2 sessions)

Pure pattern work — every one of these is a copy of an existing `threat-intel` source function or a 20-line glue change.

| Item | Lane | Notes |
|---|---|---|
| Wire extension scanner's extracted IOCs → existing `/url` + `/hash` endpoints | **S** | Highest ratio of value/effort in the whole plan |
| Add **PhishTank** source to `/url` | **S** | Free, no key |
| Add **OpenPhish** source to `/url` | **S** | Free community feed |
| Add **Google Safe Browsing v4** to `/url` | **S** | Free API key |
| Add **Tranco top-1M** rank lookup to `/url` and `/domain` | **S** | Static file refresh, like your tor-list pattern |
| Add **CRXcavator** to extension flow | **S** | Single GET, reputation pill in `DesktopExtensionResult` |
| Surface **VT resolutions** tab on `/domain` and `/ip` results | **S** | You already pay for VT — just expose the field |

---

## Phase 1 — New IOC types (2–3 sessions)

Mechanical extensions of the existing IOC pipeline (detection regex → endpoint → result window).

| Item | Lane | Notes |
|---|---|---|
| **`cve` IOC type** unifying NVD + CISA KEV + FIRST EPSS | **O→S** | Opus designs the unified response shape (three sources, three schemas) — Sonnet implements endpoint + `DesktopCVEResult.tsx` |
| **`wallet` IOC type** (BTC/ETH addresses) with Chainalysis Public + Misttrack | **S** | Pattern is identical to `hash` |
| **`email` IOC type** (sender address/domain) with EmailRep + HIBP + MX/SPF/DMARC live DNS | **S** | Distinct from the *email file* app in Phase 4 |

---

## Phase 2 — Passive DNS + cert transparency (2 sessions)

This unlocks the pivot graph in Phase 3. Don't skip — it's what makes the graph valuable.

| Item | Lane | Notes |
|---|---|---|
| Unified pDNS shape design (CIRCL + Mnemonic + SecurityTrails + VT resolutions) | **O** | Each source returns different schemas; get the abstraction right once |
| pDNS source implementations | **S** | Following the established source-function pattern |
| **crt.sh** cert transparency for `/domain` (subdomain enumeration) | **S** | Free, no key |
| **Censys** free tier as Shodan complement | **S** | Same shape as Shodan source |
| Persist pDNS edges in a new `ioc_relationships` table | **O** | Schema design — feeds Phase 3 |

---

## Phase 3 — IOC pivot graph (3–4 sessions) ⭐ flagship feature

The single biggest UX leverage point in the platform. Design-heavy; cheap to get wrong.

| Item | Lane | Notes |
|---|---|---|
| Relationship schema: edge types (resolves_to, hosted_on, signed_by, seen_with, related_hash, …) | **O** | Get this wrong = expensive backfill later |
| Backfill strategy for existing `scan_history`, `ip_lookups`, `url_lookups`, `domain_lookups`, `hash_lookups` | **O** | One-shot edge-extraction script |
| Query patterns: 1-hop, 2-hop, "show everything related to X" with depth/score limits | **O** | Postgres recursive CTE territory; needs cost guardrails |
| Pivot UI inside existing `Desktop*Result.tsx` windows | **O→S** | Opus mocks the interaction (graph view? sidebar? new "Investigation" app?), Sonnet builds it |
| "Related IOCs" panel on every result window | **S** | Once the query layer exists |

---

## Phase 4 — Email (.eml / .msg) app (3–4 sessions)

| Item | Lane | Notes |
|---|---|---|
| App architecture: parser placement (edge vs client), attachment queue, recursive enrich loop termination, size limits, zip-bomb defense | **O** | First app with user file upload — get the boundaries right |
| `.eml` / `.msg` parser + header analysis (SPF/DKIM/DMARC, display-name mismatch, IDN/homoglyph) | **S** | Pure local parsing, mostly RFC 5322 |
| Body URL extraction → `/url` pipeline fan-out | **S** | Reuses Phase 0 work |
| Attachment SHA256 → `/hash` pipeline fan-out | **S** | Reuses existing pipeline |
| `DesktopEmailAnalyzer.tsx` window | **S** | Pattern of `Desktop*Result.tsx` |
| **Security review before merge** | **O** | First file-upload path; non-negotiable |

---

## Phase 5 — PDF / Office doc app (2–3 sessions)

| Item | Lane | Notes |
|---|---|---|
| Architecture + security model (mostly mirrors Phase 4) | **O** | Lighter design pass since Phase 4 set the pattern |
| `pdfid`-style static analyzer (flags `/JS`, `/JavaScript`, `/OpenAction`, `/Launch`, embedded files) | **S** | Public algorithm, port to Deno |
| `olevba`-style macro extraction for `.doc/.docm/.xlsm` | **S** | Public rules |
| URL + embedded-hash fan-out to existing pipelines | **S** | Same pattern as email |
| `DesktopDocAnalyzer.tsx` window | **S** | Reuses email app shell if you make it generic |
| **Security review before merge** | **O** | |

---

## Phase 6 — Detonation tier (2–3 sessions)

Async sandboxes are a different shape from your current synchronous-fan-out pattern — this needs new infrastructure.

| Item | Lane | Notes |
|---|---|---|
| Async job pattern: submit → poll → notify (Supabase realtime channel?) | **O** | New primitive; sets the pattern for any future long-running task |
| `detonation_jobs` table + state machine | **O** | Design once, reuse forever |
| **Triage** (Hatching) integration | **S** | Best free verdicts |
| **ANY.RUN** community tier | **S** | |
| **Joe Sandbox Cloud Basic** | **S** | |
| Hybrid Analysis *URL* submission (you already have the hash one) | **S** | |
| "Send to sandbox" button on URL + Email + Doc result windows | **S** | |

---

## Phase 7 — Extension scanner deepening (2 sessions)

Your current scanner is solid; these are the genuine gaps.

| Item | Lane | Notes |
|---|---|---|
| YARA integration: ruleset management, where to run (edge vs separate worker), perf budget | **O** | The "where to run" question matters — yara-x in WASM works in edge |
| YARA against bundle (Yara-Rules/rules + Neo23x0/signature-base) | **S** | Once the runtime is decided |
| **retire.js / OSV.dev** lookup against bundled libs | **S** | Free APIs |
| Web Store metadata delta tracking (rating crash + permission expansion detection) | **O→S** | Opus designs the snapshot/diff cadence; Sonnet builds the cron + diff logic |
| Reverse-IOC pivot: "what other extensions share this domain/hash" | **S** | Falls out of Phase 3 pivot graph |

---

## Phase 2.5 — Feeds, Intel Dashboard & Browser polish (2–3 sessions)

Sits between Phase 2 and Phase 3. All backend is already built — this is pure frontend exposure of existing endpoints.

### Intel Dashboard

| Item | Lane | Notes |
|---|---|---|
| Fix filter closure bug in `loadItems` (`filter` captured at definition, category param never sent on change) | **S** | One-line fix — add `filter` to deps or pass as arg |
| Ransomware panel — `FEEDS \| RANSOMWARE` tab row pulling from `/ransomware-intel/victims` + `/groups` | **S** | Full backend exists; victims table, group attribution, sector/country breakdowns |
| Read/save article actions (bookmark + mark-read buttons per item) | **S** | Endpoints exist: `/my/items/:id/read` and `/my/items/:id/save` |
| Unread / Saved filter tabs alongside existing category pills | **S** | Backend supports `?unread=true` and `?saved=true` query params |
| Unread count badge on Intel icon in Taskbar | **S** | Query `user_feed_items` where `is_read=false` |
| Custom source add/delete UI (name + URL + category modal, "+" in sidebar header) | **S** | Backend CRUD ready at `/my/sources` |
| Per-source enable/disable toggle in sidebar | **S** | Backend at `/my/preferences` |
| Article count badges on category filter pills (e.g. `THREATS (12)`) | **S** | Derived from already-fetched `items` array |
| Hover states on article list items | **S** | Known issue — one CSS line |
| Error state instead of silent failure | **S** | Known issue — `catch` returns 0 with no user message |
| Auto-refresh timer (15–30 min interval) | **S** | `setInterval` + `clearInterval` on unmount |
| "Extract IOCs" button on selected article — scans IPs/domains/hashes from title/description | **S** | Reuse `detectIOCType` + call `onScan` |

### New default RSS sources (DB inserts, no code changes)

All free. Add to `rss_sources` table:

| Source | Category | Notes |
|---|---|---|
| CISA KEV / alerts feed | alerts | Highest-signal single source for a SOC operator |
| SANS Internet Storm Center | threats | Daily handler diaries |
| NVD new CVEs | vulnerabilities | Pairs with Phase 1 CVE IOC type |
| Bleeping Computer | news | High volume, very relevant |
| The Hacker News | news | Broad coverage |
| Abuse.ch (MalwareBazaar, URLhaus, ThreatFox RSS) | threats | Already queried in threat-intel; expose in feeds |
| NCSC (UK) alerts | alerts | High-quality advisories |

### Browser

| Item | Lane | Notes |
|---|---|---|
| `thamos://ransomware` route → ransomware dashboard component | **S** | Once ransomware panel exists in Intel Dashboard, route it here |
| History page: add `HASH`, `DOMAIN`, `EXTENSION` tabs | **S** | Tables exist (`hash_lookups`, `domain_lookups`); identical pattern to existing IP/URL tabs |
| "Scan this URL" pill in address bar on external pages | **S** | One button firing `onScan('url', activeTab.url)` |
| User bookmark save/delete (save current page to `user_bookmarks` table) | **S** | New table + simple CRUD; bookmarks bar renders user + defaults |

---

## Phase 8 — Desktop UX/UI polish (2–4 sessions)

Desktop experience audit gaps not covered by the enrichment phases. Grouped by priority.

### Fix first — credibility issues

| Item | Lane | Notes |
|---|---|---|
| Replace emoji app icons with SVGs in `appRegistry.ts` | **O→S** | Kimi audit graded iconography D+ — #1 visual blocker. Opus picks the SVG set and sizes; Sonnet implements |
| Remove fake random flicker from `ServiceStatus.tsx` | **S** | `Math.random() > 0.98` flickering fake warnings. Show real state or hide the component until integrations are live |

### High-value UX wins

| Item | Lane | Notes |
|---|---|---|
| Case Manager — delete confirmation dialog | **S** | Known issue; `handleDelete` fires immediately |
| Case Manager — IOC items clickable to launch scanner | **S** | IOCs listed in detail pane but dead; thread `onScan` callback in |
| Case Manager — priority filter alongside status filter | **S** | `PRIORITY_COLORS` already defined; add filter pill row |
| Case Manager — tag-click filtering | **S** | Click a tag pill → sets search to that tag |
| Case Manager — auto-classify IOCs on paste using `detectIOCType` | **S** | Replaces fragile `type: value` free-text format |
| Case Manager — export (JSON + copy-to-clipboard) | **S** | Low-lift; PDF export is heavier but JSON is trivial |
| Settings — "Test key" button per service | **S** | Fire a lightweight probe to the relevant API; show pass/fail inline |
| Settings — add new service rows as Phase 0/1 ships | **S** | `SERVICES` array in `DesktopSettings.tsx` is hardcoded; add PhishTank, Safe Browsing, CRXcavator, NVD etc. |
| System Monitor — add case / watchlist / ransomware victim counts | **S** | Three extra DB queries; display as stat tiles alongside scan counts |
| System Monitor — key validity vs key presence (ping the API) | **S** | Currently shows green for any stored key, even broken ones |

### Terminal — keep in sync with new IOC types

| Item | Lane | Notes |
|---|---|---|
| Add `scan -cve` command (Phase 1) | **S** | Add when CVE endpoint ships |
| Add `scan -wallet` command (Phase 1) | **S** | Add when wallet endpoint ships |
| Add `scan -extension` to terminal scan router | **S** | Extension scanner exists but isn't wired to terminal `scan` |
| Add `ransomware [group\|victims\|sectors]` command | **S** | Query `/ransomware-intel` endpoints |
| Add `feeds` command (show latest N intel items) | **S** | Query `/news-feeds/items` |

### Medium priority — polish

| Item | Lane | Notes |
|---|---|---|
| Taskbar window grouping (group by appId, expand on hover) | **O→S** | Opus designs the expand/collapse interaction; Sonnet implements |
| Minimize/maximize animations (200ms scale/translate CSS transition) | **S** | Known issue; `DesktopWindow.tsx` |
| Calendar popover on clock click | **S** | Standard OS behavior; small component |
| Workshop conversation export | **S** | JSON or markdown of message history |
| Workshop — fix loading dots animation (all pulse in sync) | **S** | Known issue |
| Workshop — document OrchestraMode + 5-agent setup in architecture docs | **S** | Undocumented; update `THAMOS_DESKTOP_REFERENCE.md` |

### Design-heavy — Opus sessions

| Item | Lane | Notes |
|---|---|---|
| Mission Control / Exposé view (see all open windows) | **O→S** | Significant UI design: thumbnail layout, click-to-focus, Ctrl+` shortcut |
| Real service health checks for ServiceStatus (TopDesk, Sentinel, Defender, Entra) | **O** | What to actually ping, how often, how to surface partial outages |

---

## Sequencing recommendation

```
Week 1:  Phase 0 (visible value, momentum)
Week 2:  Phase 1 (CVE type especially — high SOC value)
Week 3:  Phase 2 (sets up Phase 3)
Week 3.5: Phase 2.5 (feeds polish + ransomware panel — high visibility, no risk)
Week 4:  Phase 3 (flagship — pay full attention here)
Week 5:  Phase 4 (email)
Week 6:  Phase 5 (PDF — leverages Phase 4 shell)
Week 7:  Phase 7 (extension deepening)
Week 8:  Phase 8 (desktop UX — emoji icons first, then the rest)
Later:   Phase 6 (detonation — slot in once async-job pattern is designed)
```

Shuffle Phase 6 earlier if users specifically ask for URL detonation — but it's the heaviest infra lift, so deferring it lets you ship 6 of 8 phases against your current synchronous pattern.

---

## Opus footprint summary

If tracking spend: **Opus is on the critical path for ~10 design checkpoints + 2 security reviews** across the whole plan. Everything else is Sonnet.

| Checkpoint | Phase | Approx. effort |
|---|---|---|
| CVE unified-shape design | 1 | ~20 min |
| pDNS shape + `ioc_relationships` schema | 2 | ~30 min |
| Pivot graph: schema + queries + UI design | 3 | ~3 sessions (the big one) |
| Email app architecture | 4 | ~1 session |
| Email file-upload security review | 4 | ~30 min |
| Doc app architecture | 5 | ~30 min |
| Doc file-upload security review | 5 | ~30 min |
| Async-job pattern + state machine | 6 | ~1 session |
| YARA runtime decision + metadata-delta design | 7 | ~30 min |
| SVG icon set selection + sizing system | 8 | ~20 min |
| Taskbar window grouping interaction design | 8 | ~20 min |
| Mission Control / Exposé view design | 8 | ~1 session |
| Real ServiceStatus health check architecture | 8 | ~20 min |

---

## Already-existing context this plan builds on

- **`supabase/functions/threat-intel/index.ts`** — 19 IP sources, 3 URL sources, 4 hash sources, 4 domain sources. All Phase 0/1/2 source additions follow the established `check*` function pattern in this file.
- **`supabase/functions/analyze-extension/index.ts`** — static analyzer that already extracts URLs/IPs/hashes but doesn't fan them out. Phase 0 closes that loop.
- **`src/lib/iocDetection.ts`** — IOC type detection. Phase 1 adds new types here.
- **`src/components/desktop/Desktop*Result.tsx`** — result window pattern. Every new IOC type / analyzer ships a new file in this shape.
- **`INTEGRATION_ROADMAP.md`** — already lists email/PDF/detonation as P3; this plan supersedes those notes with concrete lanes.
