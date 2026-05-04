# ThamOS Integration Roadmap — SOC Platform Unification

> **Last Updated:** 2026-05-04 by Kimi Code CLI
>
> **Purpose:** Feasibility analysis and phased implementation plan for integrating ThamOS Desktop with TopDesk (ticketing), Microsoft Entra ID (identity/remediation), Sentinel (SIEM/playbooks), and Defender for Office 365 (email threat investigation). Based on review of `SCStelz/security-investigator` patterns and real-world API research.
>
> **Owner Context:** SOC analyst + Global Admin at a district school board (70k+ users). Daily workflow: Sentinel incident → TopDesk ticket → ThamOS investigation → remediation (Entra session revoke + password reset) or close as benign.

---

## Table of Contents
1. [Reference Project Analysis](#reference-project-analysis)
2. [Integration Matrix](#integration-matrix)
3. [TopDesk Integration](#topdesk-integration)
4. [Entra ID / Microsoft Graph](#entra-id--microsoft-graph)
5. [Sentinel Integration](#sentinel-integration)
6. [Defender / Email Investigation](#defender--email-investigation)
7. [Architecture Blueprint](#architecture-blueprint)
8. [Implementation Phases](#implementation-phases)
9. [Open Questions](#open-questions)

---

## Reference Project Analysis

### `SCStelz/security-investigator` — What to Adopt vs. Ignore

Scott Stelz's project is a VS Code Copilot extension framework using MCP servers for Sentinel investigation. It is **not** a web OS and cannot be directly ported. Relevant patterns:

| Asset | Relevance | Action |
|---|---|---|
| KQL query library (`queries/` with metadata headers) | **High** — Pre-built, categorized, MITRE-mapped queries | Adopt structure for ThamOS Sentinel app |
| Skill routing (keyword → workflow) | **Medium** — ThamOS apps already work this way | Could add natural language command bar in Desktop |
| MCP server architecture | **Ignore** — VS Code-specific. Use underlying REST APIs directly. | Extract API call patterns only |
| HTML report generation (`scripts/generate_report_from_json.py`) | **Medium** — Battle-tested report templates | Port to TS or Edge Function for client-side generation |
| IP enrichment pipeline (ipinfo, AbuseIPDB, Shodan, vpnapi) | **Already have** — ThamOS queries these sources | Adopt caching pattern from his pipeline |

**Key insight:** Don't port MCP servers. ThamOS should be a thin orchestration layer over the same REST APIs (Graph, Sentinel, Log Analytics), accessed via Supabase Edge Functions.

---

## Integration Matrix

| Integration | Feasibility | Effort | Priority | Blockers |
|---|---|---|---|---|
| **TopDesk** — Search, deduplicate, update, close tickets | ✅ Easy | Low | 🔴 P1 | None |
| **Entra ID** — Revoke sessions, force password reset, disable account | ✅ Straightforward | Medium | 🔴 P1 | Ghost token edge case (documented) |
| **Entra ID** — Sign-in logs, MFA re-registration | ✅ Straightforward | Medium | 🔴 P1 | None |
| **Sentinel** — List incidents, get details, update status | ✅ Doable | Medium | 🟡 P2 | None |
| **Sentinel** — Run KQL queries | ✅ Doable | Medium | 🟡 P2 | None |
| **Sentinel** — Trigger Logic App playbooks | ⚠️ Requires setup | Medium | 🟡 P2 | Needs webhook URLs per playbook |
| **Defender** — Search analyzed emails, get detonation results | ✅ New APIs (July 2024) | Medium | 🟢 P3 | None |
| **Defender** — Remediate emails (delete, quarantine) | ✅ Supported | Low | 🟢 P3 | None |
| **Email** — Export attachments from Defender | ⚠️ Complex | High | 🟢 P3 | No direct attachment API; needs eDiscovery or mailbox fetch |
| **Email** — Extract URLs from PDF/Doc attachments | ⚠️ Custom build | High | 🟢 P3 | Needs PDF parser + doc parser |
| **Email** — Sandbox detonate extracted URLs | ⚠️ Third-party APIs | High | 🟢 P3 | URLScan.io, VirusTotal, Hybrid Analysis, Joe Sandbox |
| **Email** — Follow deep redirect chains | ⚠️ Custom HTTP follower | Medium | 🟢 P3 | Recursive HEAD/GET with hop tracking |
| **iframe embed** — TopDesk | ✅ Likely works | Low | 🔵 P4 | Test X-Frame-Options |
| **iframe embed** — Sentinel, Defender, Entra portals | ❌ Blocked | N/A | 🔵 P4 | Microsoft portals set `X-Frame-Options: DENY` |

---

## TopDesk Integration

### API Capabilities

TopDesk exposes a mature REST API at `https://<instance>.topdesk.net/tas/api/`.

| Capability | Endpoint | Notes |
|---|---|---|
| Search incidents by UPN | `GET /incidents?caller.email={upn}` or `query={upn}` | Full-text search across caller, description, action |
| Get incident details | `GET /incidents/{id}` | Returns status, actions, attachments, operator |
| Update incident | `PATCH /incidents/{id}` | Update status, add action note, change operator |
| Close incident | `PATCH /incidents/{id}` with `processingStatus.name="Closed"` | Set archiving reason |
| Create incident | `POST /incidents` | For escalation from ThamOS |
| List actions | `GET /incidents/{id}/actions` | Append investigation notes |

### Authentication
- **Application Password** (recommended for service account)
- Basic Auth with dedicated API user
- No OAuth 2.0 — simpler for this use case

### Deduplication Strategy

Store incident metadata in PostgreSQL with a similarity hash:

```sql
CREATE TABLE topdesk_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topdesk_id TEXT UNIQUE NOT NULL,
  upn TEXT NOT NULL,
  brief_description TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  thamos_scan_id uuid REFERENCES scans(id),
  similarity_hash TEXT GENERATED ALWAYS AS (
    md5(lower(upn) || '::' || lower(left(brief_description, 50)))
  ) STORED
);

CREATE INDEX idx_similarity_hash ON topdesk_incidents(similarity_hash, created_at);
```

### Supabase Edge Functions
- `topdesk/search-incidents.ts` — Query by UPN with pagination
- `topdesk/update-incident.ts` — Add action notes, change status
- `topdesk/deduplicate.ts` — Check for existing tickets by similarity hash

### UI — New Desktop App: "TopDesk"
- Search bar: "Search tickets by UPN..."
- Incident list with status badges (Open / In Progress / Closed)
- Deduplication panel: "3 similar tickets found for this UPN in the last 7 days"
- Enrichment section: Link ThamOS scan results to ticket
- Action buttons: `[Close as Benign]` `[Escalate]` `[Add Investigation Note]`

---

## Entra ID / Microsoft Graph

### Supported Remediation Actions

| Action | Graph API Endpoint | Permission | Latency |
|---|---|---|---|
| Revoke all sessions | `POST /users/{upn}/revokeSignInSessions` | `User.RevokeSessions.All` | 1–2 min propagation |
| Force password change | `PATCH /users/{upn}` → `passwordProfile.forceChangePasswordNextSignIn: true` | `User-PasswordProfile.ReadWrite.All` | Immediate |
| Reset password + force change | Same as above, include `password` field | Same | Immediate |
| Disable account | `PATCH /users/{upn}` → `accountEnabled: false` | `User.ReadWrite.All` | Immediate |
| Get sign-in logs | `GET /auditLogs/signIns?$filter=userPrincipalName eq '{upn}'` | `AuditLog.Read.All` | Near real-time |
| Force MFA re-register | `DELETE /users/{id}/authentication/methods/{methodId}` | `UserAuthenticationMethod.ReadWrite.All` | Immediate |

### Known Limitations

**Ghost Tokens (CVE-2026-0012):**
- `revokeSignInSessions` kills browser cookies and native MS app tokens
- **Third-party app OAuth refresh tokens** (especially with `offline_access` scope) may persist
- Standard playbook is still correct for 95%+ of compromise scenarios
- For advanced threats, audit OAuth app consents separately via `GET /users/{id}/oauth2PermissionGrants`

**Multi-Tenant / AITM Considerations:**
- Password reset + revoke sessions breaks AitM proxy sessions (user must re-auth)
- CA policy requiring compliant device blocks non-managed devices
- For persistent AitM, disable account is the most reliable immediate kill

### Authentication Pattern

**Option A — Delegated (Recommended for interactive use):**
- Analyst signs in via Entra OAuth flow in ThamOS
- Access token stored encrypted in Supabase
- Audit trail shows which analyst performed action
- Token refresh handled automatically

**Option B — Client Credentials (For automation):**
- Service principal with application permissions
- No user interaction required
- Less audit granularity; use for Sentinel-driven playbook triggers

### Supabase Edge Functions
- `entra/revoke-sessions.ts`
- `entra/reset-password.ts`
- `entra/get-signins.ts`
- `entra/disable-user.ts`

### UI — New Desktop App: "Entra Guard"
- Sign-in log viewer with geo/IP/device columns
- Risk state indicator (Identity Protection)
- Active sessions list with location + device type
- One-click actions: `[Revoke Sessions]` `[Force PW Reset]` `[Disable Account]` `[Force MFA Re-Reg]`
- Confirmation modal with checklist: "This will terminate 3 active sessions including 1 from Moscow, RU"

---

## Sentinel Integration

### APIs

| Capability | API | Status |
|---|---|---|
| List incidents | Sentinel REST API `/incidents` | ✅ Available |
| Get incident details | Sentinel REST API `/incidents/{id}` | ✅ Available |
| Update incident | Sentinel REST API `PUT /incidents/{id}` | ✅ Available |
| Add comment | Sentinel REST API `POST /incidents/{id}/comments` | ✅ Available |
| Run KQL | Log Analytics Query API | ✅ Available |
| Get entities | Sentinel Entity API | ✅ Available |

### Playbook Triggering

Sentinel playbooks are Logic Apps. Trigger options:

**Option 1 — HTTP Webhook (Recommended):**
- Logic App has "When an HTTP request is received" trigger
- ThamOS calls webhook URL with JSON payload: `{ upn, action, reason }`
- Simple, direct, fast
- ⚠️ Webhook URL is a secret — store encrypted in Supabase

**Option 2 — Sentinel Incident Creation:**
- ThamOS creates a new Sentinel incident via API
- Automation rule triggers playbook on incident creation
- Full audit trail within Sentinel
- ⚠️ More complex; incident-based rather than direct action

### Pre-Built KQL Query Library

Adopt `security-investigator` query pattern:

```
supabase/functions/sentinel/queries/
├── identity/
│   ├── signins-from-suspicious-locations.kql
│   ├── risky-users-last-7-days.kql
│   └── mfa-failures-by-user.kql
├── email/
│   ├── compromised-account-mailbox-access.kql
│   └── suspicious-email-rules.kql
├── endpoint/
│   └── device-alerts-by-user.kql
└── incidents/
    └── high-severity-by-user.kql
```

Each query file has a metadata header:
```kql
# User Sign-ins from Suspicious Locations
# Tables: SigninLogs
# Keywords: signin, location, risk, geo
# MITRE: T1078
# Domains: identity
```

### Supabase Edge Functions
- `sentinel/list-incidents.ts`
- `sentinel/run-kql.ts`
- `sentinel/trigger-playbook.ts` — Calls Logic App webhook

### UI — New Desktop App: "Sentinel Console"
- Incident list filtered by UPN / severity / status
- Pre-built KQL query browser with MITRE tags
- Query results table with export to CSV
- `[Trigger Remediation]` button that calls Logic App webhook

---

## Defender / Email Investigation

### Defender for Office 365 APIs (July 2024 Release)

| Capability | Endpoint | Status |
|---|---|---|
| Search analyzed emails | `GET /security/threatIntelligence/messages` (Graph) | ✅ New |
| Get email detonation results | `GET /security/threatIntelligence/messages/{id}` | ✅ Includes Safe Links + Safe Attachments verdicts |
| Remediate email | `POST /security/threatIntelligence/messages/{id}/remediate` | ✅ Soft delete, hard delete, move to inbox |

### The Deep-Link Chain Problem

Attack chain: **Email → PDF attachment → URL in PDF → Redirects → Final malicious URL**

| Layer | Microsoft's Protection | Gap |
|---|---|---|
| Email body URLs | Safe Links (delivery-time scan + click-time detonation) | ✅ Covered |
| PDF attachment | Safe Attachments (sandbox detonation at delivery) | ✅ Covered |
| URL *inside* PDF | ❌ **Not recursively detonated at delivery** | Gap |
| User clicks PDF link | Safe Links intercepts at click-time | ✅ Covered (if user clicks) |

**The operational need:** Analyst wants to proactively extract and detonate URLs from attachments *before* the user clicks.

### Required Custom Pipeline

```
Step 1: Search email in Defender
    → Graph API /security/threatIntelligence/messages

Step 2: Get email details + detonation results
    → Safe Links verdict, Safe Attachments verdict

Step 3: Export/fetch attachment
    → Option A: EWS/Graph mailbox fetch (if email not deleted)
    → Option B: eDiscovery export (slow, bulk)
    → Option C: Compliance search + export

Step 4: Parse attachment for URLs
    → PDF: pdfminer or pdf.js
    → DOCX: python-docx / mammoth
    → XLSX: xlsx-parser

Step 5: Detonate extracted URLs
    → URLScan.io API
    → VirusTotal URL scan
    → Hybrid Analysis
    → Joe Sandbox

Step 6: Follow redirect chains
    → HTTP HEAD/GET with redirect following
    → Track each hop: status, headers, final URL

Step 7: Surface final URL in ThamOS scanners
    → Reuse existing IP/URL/Domain/Hash lookups
```

### Supabase Edge Functions
- `defender/search-emails.ts`
- `defender/get-email-details.ts`
- `defender/remediate-email.ts`
- `extract/parse-attachment.ts` — PDF/Doc parsing (if building custom)
- `extract/follow-redirects.ts` — Recursive redirect chain follower

### UI — New Desktop App: "Email Investigator"
- Search by recipient, sender, subject, timeframe
- Email detail view with detonation verdict badges
- Attachment list with `[Extract URLs]` button
- Redirect chain visualization (graph/hop list)
- Final URL linked to ThamOS unified scanner

---

## Architecture Blueprint

### New Desktop Apps

| App | Registry ID | Purpose | Phase |
|---|---|---|---|
| **TopDesk** | `topdesk` | Ticket search, deduplication, enrichment, close/update | P1 |
| **Entra Guard** | `entra-guard` | Session revocation, password reset, sign-in logs, MFA re-register | P1 |
| **Sentinel Console** | `sentinel` | Incident list, KQL query runner, playbook trigger | P2 |
| **Email Investigator** | `email-investigator` | Defender email search, attachment extraction, URL chain analysis | P3 |

### Supabase Edge Functions Structure

```
supabase/functions/
├── topdesk/
│   ├── search-incidents.ts
│   ├── update-incident.ts
│   └── deduplicate.ts
├── entra/
│   ├── revoke-sessions.ts
│   ├── reset-password.ts
│   ├── get-signins.ts
│   └── disable-user.ts
├── sentinel/
│   ├── list-incidents.ts
│   ├── run-kql.ts
│   ├── trigger-playbook.ts
│   └── queries/           # KQL query library
├── defender/
│   ├── search-emails.ts
│   ├── get-email-details.ts
│   └── remediate-email.ts
└── extract/
    ├── parse-attachment.ts
    └── follow-redirects.ts
```

### Encrypted Credentials Storage

```sql
CREATE TABLE analyst_api_credentials (
  analyst_id uuid REFERENCES auth.users(id) PRIMARY KEY,

  -- TopDesk
  topdesk_url TEXT,
  topdesk_username TEXT,
  topdesk_app_password TEXT, -- encrypted with pgsodium

  -- Entra (delegated tokens)
  entra_access_token TEXT,  -- encrypted
  entra_refresh_token TEXT, -- encrypted
  entra_token_expires_at TIMESTAMPTZ,

  -- Sentinel
  sentinel_workspace_id TEXT,
  sentinel_subscription_id TEXT,
  sentinel_resource_group TEXT,

  -- Playbook webhooks
  remediation_playbook_webhook TEXT, -- encrypted
  escalation_playbook_webhook TEXT,  -- encrypted

  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### AI Integration — Noise Reduction (Not Investigation)

Use AI for **summarization and correlation**, not for making decisions:

| Use Case | AI Role | Implementation |
|---|---|---|
| Ticket context summary | "This UPN has 3 tickets in 7 days, all Russia sign-ins" | Edge Function calling OpenAI/Claude |
| Cross-source correlation narrative | "IP 203.0.113.42 in 5 tickets, 2 Sentinel incidents, AbuseIPDB flagged" | Edge Function with structured prompt |
| Incident closure report | Auto-generate TopDesk action note with reasoning | Edge Function |
| KQL query explanation | Plain English description of what a query does | Edge Function |
| Redirect chain summary | "PDF → bit.ly → evil.com → credential harvester" | Edge Function |

**Important:** Deterministic remediation decisions (revoke, reset, disable) remain hardcoded playbooks. AI only generates text summaries and explanations.

---

## Implementation Phases

### Phase 1 — TopDesk + Entra Guard (Week 1–2)
**Goal:** Unify the core analyst workflow inside ThamOS Desktop.

| Deliverable | Files |
|---|---|
| TopDesk search app | `src/apps/TopDeskApp.tsx`, Edge Functions `topdesk/*` |
| TopDesk deduplication | Supabase migration for `topdesk_incidents` table |
| Entra Guard app | `src/apps/EntraGuardApp.tsx`, Edge Functions `entra/*` |
| Analyst credential storage | Supabase migration for `analyst_api_credentials` table |
| Settings panel additions | API key/config forms in `DesktopSettings.tsx` |

**Success Criteria:**
- Analyst can search TopDesk by UPN from ThamOS
- Duplicate tickets are surfaced with similarity match
- Analyst can revoke sessions + force password reset with 2 clicks
- All actions logged to audit table

### Phase 2 — Sentinel Console (Week 3–4)
**Goal:** Add SIEM incident visibility and playbook triggering.

| Deliverable | Files |
|---|---|
| Sentinel incident list app | `src/apps/SentinelApp.tsx` |
| Pre-built KQL query library | `supabase/functions/sentinel/queries/*.kql` |
| KQL runner with results table | Edge Function `sentinel/run-kql.ts` |
| Playbook webhook trigger | Edge Function `sentinel/trigger-playbook.ts` |
| Logic App webhook config | Settings UI for webhook URL entry |

**Success Criteria:**
- Analyst sees Sentinel incidents filtered by UPN
- Can run pre-built KQL queries and see results
- Can trigger remediation playbook from ThamOS UI

### Phase 3 — Email Investigator (Week 5–7)
**Goal:** Deep-link chain analysis for advanced phishing.

| Deliverable | Files |
|---|---|
| Defender email search | `src/apps/EmailInvestigatorApp.tsx` |
| Email detonation results view | Safe Links/Attachments verdict badges |
| Attachment export pipeline | EWS/Graph fetch or eDiscovery integration |
| PDF URL extraction | `supabase/functions/extract/parse-attachment.ts` (pdf.js or python) |
| Redirect chain follower | `supabase/functions/extract/follow-redirects.ts` |
| Third-party sandbox integration | URLScan.io, VirusTotal APIs |

**Success Criteria:**
- Search and view Defender-analyzed emails
- Extract URLs from PDF/DOCX attachments
- Detonate URLs in third-party sandbox
- Visualize redirect chain with final URL linked to scanners

### Phase 4 — AI Summaries (Week 8)
**Goal:** Reduce analyst cognitive load with correlation narratives.

| Deliverable | Files |
|---|---|
| Ticket correlation summary | Edge Function + UI panel in TopDesk app |
| Cross-source narrative | "This UPN appears in X tickets, Y Sentinel incidents, Z threat intel hits" |
| Auto-generated closure notes | One-click generate TopDesk action note |

---

## Open Questions

1. **TopDesk instance URL and API credentials** — Does the school board have REST API enabled? What auth method (application password vs. user creds)?

2. **Entra auth model preference** — Delegated (analyst signs in) vs. Client Credentials (service principal)? Hybrid approach?

3. **Sentinel Logic App webhooks** — Do remediation playbooks already exist with HTTP triggers? If not, they need to be created in Azure.

4. **Attachment extraction path** — Are quarantined emails accessible via mailbox API (need compliance admin) or only through eDiscovery (slow)?

5. **Third-party sandbox budget** — URLScan.io has free tier. VirusTotal requires API key. Hybrid Analysis / Joe Sandbox are paid. Which to integrate?

6. **iframe test for TopDesk** — Should test whether TopDesk portal allows iframe embedding before investing in native app.

---

## Related Documents

- `THAMOS_STATE.md` — Current project state and UI/UX backlog
- `ARCHITECTURE_V2.md` — Scanner architecture and data flow
- `AGENTS.md` — Agent operational standards
