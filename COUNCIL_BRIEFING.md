# Council Briefing — ThamOS v6 Azure Connector Authentication Architecture

> **Date:** 2026-05-04
> **Agent:** Kimi Code CLI (ThamOS Lead Architect)
> **Status:** Decision Required Before Implementation
> **Classification:** Architectural — Security-Critical

---

## Executive Summary

ThamOS v6 is a browser-based OS for SOC analysts. We are architecting an **Azure Connector Web App** that lives inside a school board's Microsoft tenant and acts as a secure proxy to Microsoft Graph, Sentinel, Logic Apps, and TopDesk. The Connector uses Azure Managed Identity — no secrets stored in code.

**The unresolved question:** How does ThamOS (public web app, t6.thamOS.ca) authenticate to the Azure Connector in a way that is secure, auditable, and pentest-resistant?

This briefing presents three authentication patterns, a phased rollout strategy, and specific questions for Council deliberation. One of you will pentest the final implementation. We want to build it right the first time.

---

## Context: The Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  ThamOS Frontend (React 18 + Vite, t6.thamOS.ca)                   │
│  • Public-facing, no tenant secrets                                 │
│  • User authenticates via Supabase Auth (email/GitHub)              │
│  • Needs to: search TopDesk, view Entra sign-ins, trigger playbooks│
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────────────┐
│  Supabase Edge Functions (Deno/TypeScript)                          │
│  • Optional: session validation, rate limiting, audit logging       │
│  • Proxies requests to Azure Connector                              │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTPS + Authentication Layer
┌──────────────────────────▼──────────────────────────────────────────┐
│  Azure Connector Web App (Python FastAPI, in tenant)                │
│  • Azure Managed Identity → Microsoft Graph API                     │
│  • Azure Key Vault → TopDesk application password                   │
│  • Validates caller identity before executing any action            │
└────┬──────────────┬──────────────┬─────────────────────────────────┘
     │              │              │
 Microsoft      Microsoft      Microsoft        TopDesk
 Graph API      Sentinel       Logic Apps       REST API
 (Managed       (Managed       (Webhook         (Key Vault)
  Identity)      Identity)      triggers)
```

**Threat model:**
- ThamOS is public. If compromised, an attacker must gain ZERO useful credentials.
- The Connector is inside the tenant boundary. If compromised, the attacker has Managed Identity access.
- AITM (Adversary-in-the-Middle) attacks are a real concern in this environment.
- A future pentest (Opus 4.7) will actively try to break this chain.

---

## The Core Question

**How does ThamOS prove identity and authorization to the Azure Connector?**

The Connector must answer two questions for every request:
1. **Authentication:** Who is calling? Are they a real user?
2. **Authorization:** Is this user allowed to perform this action on this target UPN?

We have identified three patterns. Each has different security, complexity, and operational trade-offs.

---

## Option A — Supabase Auth + Delegated Entra Token (Recommended by Kimi)

### Flow
```
1. User logs into ThamOS via Supabase Auth (existing: email/GitHub)
2. User clicks "Connect Microsoft Account" in Settings
3. Entra OAuth popup → user consents → ThamOS receives Entra access token
4. Entra token encrypted and stored in Supabase per-user row
5. ThamOS calls Supabase Edge Function (Supabase JWT auth)
6. Edge Function retrieves user's Entra token from DB
7. Edge Function calls Connector: Authorization: Bearer <entra-token>
8. Connector validates Entra JWT (signature, expiry, tenant, audience)
9. Connector extracts UPN from token claims
10. Connector uses Managed Identity to execute action
```

### Pros
- **Per-user audit trail:** Every Connector action is tied to a real Entra UPN
- **Token expiry:** Entra tokens expire (~1 hour). Short-lived compromise window.
- **No shared secrets:** No static API key to leak
- **Supabase handles refresh:** Edge Function can refresh expired tokens server-side
- **Familiar pattern:** Similar to how SaaS apps integrate with Microsoft

### Cons
- **Two identity systems:** User has Supabase identity AND Entra identity. Potential confusion.
- **Token storage risk:** Entra tokens stored in Supabase. If Supabase is compromised, tokens leaked.
- **Consent friction:** User must go through Entra OAuth consent flow
- **Complexity:** Requires msal-browser or Supabase OAuth provider setup

### Security Notes
- Entra tokens stored with AES-256-GCM encryption (pgsodium)
- Edge Function validates Supabase session BEFORE retrieving Entra token
- Connector validates Entra token audience = `api://thamos-connector` (if registered as API) OR `https://graph.microsoft.com` (if reusing Graph token)

---

## Option B — Entra-Only Authentication (Single Identity)

### Flow
```
1. User logs into ThamOS via Entra ID ONLY (no Supabase auth)
2. Entra issues ID token + access token
3. ThamOS stores Entra tokens in memory (no persistent storage)
4. Every API call: Browser → Connector directly with Entra Bearer token
5. Connector validates token, extracts UPN, executes via Managed Identity
6. ThamOS uses Entra token claims for UI personalization
```

### Pros
- **Single identity:** One login, one source of truth
- **No token persistence:** Tokens live in browser memory only (until refresh)
- **Simplest architecture:** No Supabase Edge Function needed for Microsoft calls
- **Native Microsoft integration:** Conditional Access, MFA, device compliance all enforced by Entra

### Cons
- **Major refactor:** ThamOS currently uses Supabase Auth for everything (cases, API keys, settings). Switching to Entra-only is a large rewrite.
- **Guest user issues:** If the user is a guest in the tenant, some Graph APIs behave differently
- **CORS complexity:** Browser calls Connector directly → CORS must be configured on Connector
- **Token refresh in browser:** msal-browser handles this, but adds bundle size and complexity

### Security Notes
- No server-side token storage = no server-side token leak
- But: XSS in ThamOS could steal tokens from browser memory
- Conditional Access policies apply directly (e.g., require compliant device)

---

## Option C — Service Principal with User Attribution (Static API Key)

### Flow
```
1. User logs into ThamOS via Supabase Auth (no Entra login)
2. ThamOS calls Supabase Edge Function (Supabase JWT)
3. Edge Function has a static service principal credential (client secret OR certificate)
4. Edge Function authenticates to Connector with static API key: X-Connector-Key
5. Request body includes target UPN and action
6. Connector validates API key, checks if requesting analyst is authorized
7. Connector uses Managed Identity to execute action
```

### Pros
- **Simplest to implement:** No OAuth flows, no token management
- **Fastest to deploy:** One key, one header
- **Works with existing auth:** No changes to ThamOS login

### Cons
- **Shared secret risk:** One key for all users. If leaked, attacker has full access.
- **No per-user audit in Entra:** Entra logs show "Managed Identity did X" but not WHICH analyst requested it
- **Key rotation pain:** Must update in both Azure and Supabase
- **Pentest nightmare:** Static keys are the #1 thing red teams hunt for

### Security Notes
- Key stored in Azure Key Vault + Supabase encrypted storage
- Rate limiting per IP + per user
- Key rotation policy (e.g., 90 days)
- But: still a static key

---

## Comparative Analysis

| Criteria | Option A (Supabase+Entra) | Option B (Entra-Only) | Option C (Static Key) |
|---|---|---|---|
| **Implementation effort** | Medium | High (refactor) | Low |
| **Security (auth)** | Strong | Strongest | Weak |
| **Security (audit)** | Strong | Strongest | Medium |
| **User experience** | Two logins initially | One login | One login |
| **Pentest resilience** | Good | Best | Poor |
| **Operational complexity** | Medium | Medium | Low |
| **Token lifetime** | 1 hour (refreshable) | 1 hour (refreshable) | Infinite |
| **Blast radius if leaked** | One user's access | One user's access | All users' access |
| **Compatibility with existing ThamOS** | Excellent | Poor (major refactor) | Excellent |

---

## Phased Rollout Strategy (Regardless of Auth Choice)

We propose a phased approach that lets us validate security at each layer before adding risk.

### Phase 1 — Read-Only Observability (Zero Risk)
| Endpoint | Method | Example |
|---|---|---|
| `/api/entra/user/{upn}` | GET | Profile, risk state, MFA status |
| `/api/entra/signins/{upn}` | GET | Last 7 days of sign-in logs |
| `/api/topdesk/incidents` | GET | Search tickets by UPN |
| `/api/sentinel/incidents` | GET | List incidents for UPN |
| `/api/health` | GET | Connector status check |

**Goal:** Validate authentication, token flow, and Managed Identity permissions without any write capability.

### Phase 2 — Ticket Management (Low Risk)
| Endpoint | Method | Example |
|---|---|---|
| `/api/topdesk/enrich` | POST | Add ThamOS scan results to ticket |
| `/api/topdesk/close` | POST | Close ticket as benign/duplicate |
| `/api/topdesk/merge` | POST | Merge duplicate tickets |

**Goal:** Test write operations on non-destructive external system (TopDesk).

### Phase 3 — Identity Remediation (High Risk)
| Endpoint | Method | Example |
|---|---|---|
| `/api/entra/revoke-sessions` | POST | Invalidate all refresh tokens |
| `/api/entra/force-password-reset` | POST | Set `forceChangePasswordNextSignIn` |
| `/api/entra/disable-user` | POST | Set `accountEnabled: false` |

**Goal:** Enable the core SOC remediation playbook. Requires confirmation modal in UI.

### Phase 4 — Sentinel Automation (High Risk)
| Endpoint | Method | Example |
|---|---|---|
| `/api/sentinel/trigger-playbook` | POST | Call Logic App webhook |
| `/api/sentinel/run-kql` | POST | Execute KQL query |

**Goal:** Trigger automated response from within ThamOS.

### Phase 5 — Approval Workflows (Risk Mitigation)
| Feature | Description |
|---|---|
| Dual authorization | Destructive actions require second analyst approval |
| Time-bound access | Just-in-time elevation for sensitive operations |
| Audit dashboard | All actions logged with analyst UPN, timestamp, IP |

---

## Specific Questions for Council Deliberation

### Question 1 — Authentication Pattern
> **Which option (A, B, or C) should we implement?**
>
> Kimi currently recommends **Option A** for pragmatic reasons (minimal ThamOS refactor, strong security, per-user audit). But if the Council believes Option B's single-identity model is worth the rewrite cost, or if Option C's simplicity is acceptable given other mitigations, we need to know.
>
> **Sub-questions:**
> - Should the Connector be registered as its own Entra API (`api://thamos-connector`) with custom scopes?
> - Or should we reuse the Graph API token and validate it in the Connector?
> - Is there a fourth option (e.g., mTLS, Azure API Management, Azure Front Door with WAF) that is better?

### Question 2 — Authorization Model
> **How should the Connector decide WHO can do WHAT?**
>
> The user (Council member's operator) is a **Global Admin** with 70k+ users. For now, they are the primary user. But the system should support a SOC team.
>
> **Options:**
> - **Role-based:** Check if user's Entra token has `Global Administrator`, `Privileged Authentication Administrator`, or `User Administrator` role
> - **Group-based:** Check if user is in `SOC Analysts` Entra security group
> - **Per-action:** Different roles for different actions (e.g., read-only analysts vs. remediation analysts)
> - **Trust-all:** Since the Connector is internal and only reachable with a valid Entra token, trust any user in the tenant
>
> **Sub-question:** Should Phase 1 skip authorization checks entirely and just validate the token is from the correct tenant?

### Question 3 — The Supabase Edge Function Role
> **Should ThamOS call the Connector directly, or always go through Supabase Edge Functions?**
>
> The user explicitly wants Edge Functions involved: "t6 frontend never calls azure directly, it'll call supabase edge function."
>
> **Arguments for Edge Functions:**
> - Rate limiting
> - Audit logging (who called what when)
> - Token refresh (if Entra token expired, refresh before calling Connector)
> - CORS handled at Supabase layer
>
> **Arguments against Edge Functions (direct browser → Connector):**
> - Fewer hops = lower latency
> - Connector can handle its own rate limiting
> - Simpler architecture
>
> **Council question:** Is the Edge Function a valuable security layer, or unnecessary complexity? Should it be mandatory for all calls, or only for write operations?

### Question 4 — Pentest Preparation
> **What should we build NOW to make the eventual pentest (Opus 4.7) useful rather than embarrassing?**
>
> Known attack vectors we should defend against:
> - **Token theft via XSS:** If ThamOS has an XSS vulnerability, can the attacker steal Entra tokens from localStorage/sessionStorage?
> - **CSRF:** Can an attacker trick a logged-in analyst into triggering a remediation action?
> - **Replay attacks:** Can an intercepted request be replayed?
> - **Entra token persistence:** If the user's machine is compromised, do old tokens in browser storage help the attacker?
> - **Connector enumeration:** Can an unauthenticated attacker discover the Connector endpoint and probe it?
> - **MITM:** AITM attack on the ThamOS → Connector connection
>
> **Council question:** What specific headers, patterns, or architectural decisions should we implement NOW to close these vectors?

### Question 5 — TopDesk Integration via Connector
> **Should TopDesk also go through the Connector, or does ThamOS call TopDesk directly?**
>
> The user proposed: "why don't I let the azure webapp also handle TopDesk?"
>
> **Pros of Connector handling TopDesk:**
> - TopDesk credentials live ONLY in Azure Key Vault (never in ThamOS or Supabase)
> - Unified audit trail: "Analyst X requested TopDesk search for UPN Y"
> - Single security boundary
>
> **Cons:**
> - Adds latency to TopDesk calls
> - Connector becomes a required dependency for TopDesk (instead of optional direct integration)
>
> **Council question:** Should ALL external APIs (TopDesk, future sandbox APIs, threat intel) flow through the Connector? Or only Microsoft APIs?

---

## What Kimi Will Build Next (Pending Council Guidance)

Once the Council deliberates and returns a recommendation, Kimi will implement:

1. **Azure Connector scaffold** (Python FastAPI) with the chosen auth pattern
2. **ThamOS Settings panel** for Microsoft account connection (if Option A or B)
3. **Supabase Edge Functions** for Connector proxy (if Council approves)
4. **Phase 1 read-only endpoints** (user profile, sign-ins, TopDesk search, Sentinel incidents)
5. **Deployment guide** for the user's Azure tenant

The pentest should happen AFTER Phase 3 (remediation endpoints) are live. Building it right from the start means the pentest finds interesting edge cases, not fundamental flaws.

---

## Appendix: Threat Scenarios

### Scenario 1 — ThamOS Frontend Compromised
An attacker finds an XSS vulnerability in ThamOS. They inject JavaScript to steal tokens and call the Connector.

**Defense (depending on auth choice):**
- Option A: Attacker gets the user's current Entra token (expires in ~1 hour) + Supabase session. Can act as the user until token expiry.
- Option B: Same as A, but no persistent token storage.
- Option C: Attacker gets the static API key. Can act as ANY user indefinitely until key rotation.

### Scenario 2 — Supabase Compromised
An attacker gains read access to the Supabase database.

**Defense:**
- Option A: Encrypted Entra tokens are exposed but encrypted. Attacker needs encryption key.
- Option B: No tokens in Supabase. Minimal exposure.
- Option C: Static API key exposed. Total compromise.

### Scenario 3 — Connector Compromised
An attacker gains code execution on the Azure Web App.

**Defense:**
- Managed Identity can be revoked in Entra
- Key Vault access can be revoked
- All three options equally vulnerable here (attacker has Managed Identity)

### Scenario 4 — AITM on Analyst Workstation
An Evilginx/AitM proxy intercepts the analyst's login to ThamOS.

**Defense:**
- Option A/B: MFA on Entra login prevents token issuance without second factor
- Option C: API key is in Supabase; AitM on ThamOS login gets Supabase session, not the API key itself

---

## Council Deliberation Format

Each Council member is asked to respond with:

1. **Auth recommendation:** Option A, B, C, or a new option
2. **Justification:** Why this option over the others
3. **Authorization model:** How should the Connector enforce "who can do what"
4. **Edge Function stance:** Required, optional, or unnecessary
5. **Pentest prep:** One specific thing to implement now for security hardening
6. **TopDesk via Connector:** Yes or no, with reasoning
7. **Phase 1 priority:** What should be built first (read-only endpoints, auth flow, or deployment scaffold)

The user will consolidate Council responses and provide Kimi with a unified direction.

---

*This document is a living artifact. Council members may suggest additions, corrections, or alternative architectures. The goal is not to choose the "perfect" option but to choose the option we can build securely and iterate upon.*
