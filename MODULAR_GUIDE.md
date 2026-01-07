# Thamos6 Modular Architecture Guide

This guide breaks down the project into independent feature modules. Use this to work on specific features in isolation by loading only the required files into a new chat session.

## Table of Contents
- [Core Infrastructure](#core-infrastructure)
- [Feature Modules](#feature-modules)
  - [IP Lookup](#module-ip-lookup)
  - [Hash Lookup](#module-hash-lookup)
  - [Domain Intel](#module-domain-intel)
  - [URL Scanner](#module-url-scanner)
  - [Smart IOC Intake](#module-smart-ioc-intake)
  - [Bulk Lookup](#module-bulk-lookup)
  - [Email Analyzer](#module-email-analyzer)
  - [News Feed](#module-news-feed)
  - [Case Notes](#module-case-notes)
  - [History](#module-history)
  - [Defang Tool](#module-defang-tool)
  - [Decoder Tool](#module-decoder-tool)
  - [Settings & API Keys](#module-settings--api-keys)
- [Integration Points](#integration-points)

---

## Core Infrastructure

These files are required by ALL modules. Always include when starting a new chat:

### Essential Core Files
```
/src/main.tsx                    # App entry point
/src/App.tsx                     # Main router and page switcher
/src/index.css                   # Global styles
/src/components/Layout.tsx       # Navigation and layout wrapper
/src/lib/supabase.ts            # Supabase client config
/src/types/index.ts             # Shared TypeScript types
/src/contexts/AuthContext.tsx   # Authentication state
/package.json                    # Dependencies
/tsconfig.json                   # TypeScript config
/.env                            # Environment variables
```

### Core Database Tables (Always Available)
- `auth.users` - User authentication (Supabase built-in)
- `profiles` - User profile metadata
- `api_cache` - Shared API response cache

---

## Feature Modules

Each module lists ONLY the files needed for that specific feature.

---

## Module: IP Lookup

**Purpose**: Look up IP reputation across 13+ threat intelligence sources

### Files Required
```
CORE FILES (see above) +

# Page Component
/src/pages/IPLookup.tsx

# API Client
/src/lib/threatIntel.ts

# UI Components
/src/components/ThreatScore.tsx
/src/components/SourceCard.tsx

# Edge Function
/supabase/functions/threat-intel/index.ts

# Database Tables
ip_lookups - Lookup history
api_cache - API response caching
tor_exit_nodes - Tor detection
vpn_providers - VPN detection
user_api_keys - User API keys (encrypted)
```

### Database Schema
```sql
-- ip_lookups table
id (uuid, PK)
ip_address (text, indexed)
results (jsonb)
threat_score (integer, 0-100)
sources_checked (text[])
user_id (uuid, FK, nullable)
context (text) - "anon", "org:dsbn", "user:xxx"
created_at (timestamptz)

-- RLS: Open to all (team-shared)
```

### Integration Points
- **Entry**: User types IP → calls `lookupIP(ip)` from `lib/threatIntel.ts`
- **Edge Function**: `POST /threat-intel/ip` with body `{"ip": "8.8.8.8"}`
- **Response**: Returns `IPLookupResult` type with aggregated data
- **Display**: Shows threat score, enrichment data, per-source results
- **Connected To**: Bulk Lookup, Smart IOC Intake, Email Analyzer

### API Keys Used
- **Free sources** (always available): IP-API, ThreatFox, URLhaus, RDAP, Teoh VPN, Spamhaus, AlienVault OTX, Team Cymru, Blocklist.de, Tor Exit List
- **Paid sources** (require API keys): VirusTotal, AbuseIPDB, Shodan, IPQualityScore, ProxyCheck, GreyNoise, IP2Proxy, IPHub, VPNAPI

**ProxyCheck Integration:**
- Detects VPN, proxy, Tor, residential vs datacenter
- Shows provider name when available
- Provides risk score (0-100)
- Results appear in both: "Privacy & Anonymization Analysis" section AND "Source Results" cards

---

## Module: Hash Lookup

**Purpose**: Check file hashes against malware databases

### Files Required
```
CORE FILES +

# Page Component
/src/pages/HashLookup.tsx

# API Client
/src/lib/threatIntel.ts

# UI Components
/src/components/ThreatScore.tsx
/src/components/SourceCard.tsx

# Edge Function
/supabase/functions/threat-intel/index.ts
```

### Database Schema
Currently no persistence - lookups are not stored

### Integration Points
- **Entry**: User types hash → validates format (MD5/SHA1/SHA256)
- **Edge Function**: `POST /threat-intel/hash` (to be implemented)
- **Response**: Returns malware detection status
- **Connected To**: Smart IOC Intake

### API Keys Used
- ThreatFox (free), VirusTotal

---

## Module: Domain Intel

**Purpose**: WHOIS and reputation lookup for domains

### Files Required
```
CORE FILES +

# Page Component
/src/pages/DomainIntel.tsx

# API Client
/src/lib/threatIntel.ts

# UI Components
/src/components/SourceCard.tsx

# Edge Function
/supabase/functions/threat-intel/index.ts
```

### Database Schema
Currently no persistence

### Integration Points
- **Entry**: User types domain → calls RDAP/WHOIS
- **Edge Function**: `POST /threat-intel/domain` (to be implemented)
- **Response**: Registration data, reputation
- **Connected To**: Smart IOC Intake, URL Scanner

### API Keys Used
- RDAP (free), VirusTotal, AlienVault

---

## Module: URL Scanner

**Purpose**: Scan URLs for phishing/malware

### Files Required
```
CORE FILES +

# Page Component
/src/pages/URLScanner.tsx

# API Client
/src/lib/threatIntel.ts

# UI Components
/src/components/SourceCard.tsx

# Edge Function
/supabase/functions/threat-intel/index.ts

# Database Tables
url_lookups - URL scan history
```

### Database Schema
```sql
-- url_lookups table
id (uuid, PK)
url (text)
results (jsonb)
is_malicious (boolean)
threat_types (text[])
user_id (uuid, FK, nullable)
context (text)
created_at (timestamptz)

-- RLS: Open to all (team-shared)
```

### Integration Points
- **Entry**: User pastes URL → validates format
- **Edge Function**: `POST /threat-intel/url` with body `{"url": "https://..."}`
- **Response**: Returns `URLLookupResult` with malicious status
- **Connected To**: Smart IOC Intake, Email Analyzer

### API Keys Used
- URLhaus (free), VirusTotal, URLScan.io

---

## Module: Smart IOC Intake

**Purpose**: Extract IOCs from raw text, auto-analyze with verdict cards, one-click actions

### Files Required
```
CORE FILES +

# Page Component
/src/pages/IOCExtractor.tsx

# Analysis Library
/src/lib/iocAnalysis.ts

# API Client (for auto-analysis)
/src/lib/threatIntel.ts

# UI Components
/src/components/ThreatScore.tsx

# Edge Function (for auto-analysis)
/supabase/functions/threat-intel/index.ts

# Database Tables (for one-click actions)
watchlist_entries - Add to watchlist
case_notes - Create case
```

### Database Schema
```sql
-- watchlist_entries table
id (uuid, PK)
user_id (uuid, FK → auth.users)
entry_type (text) - ip, domain, url, hash, email, keyword, cve
value (text, indexed)
description (text)
severity (text) - critical, high, medium, low
is_active (boolean, indexed)
match_count (integer)
last_matched_at (timestamptz)
created_at (timestamptz)

-- RLS: Users see only their own entries

-- case_notes table (see Case Notes module)
```

### Integration Points
- **Entry**: User pastes raw text → regex extraction runs in browser
- **Auto-Analysis**: User clicks "Analyze IPs" → calls `lookupIP()` for each IP
- **Verdict Classification**: Results processed by `classifyIPVerdict()` from `lib/iocAnalysis.ts`
- **One-Click Actions**:
  - "Add to Watchlist" → `INSERT INTO watchlist_entries`
  - "Create Case" → `INSERT INTO case_notes` with pre-filled data
- **Export**: CSV, JSON, Plain Text, Defanged formats
- **Connected To**: IP Lookup, Hash Lookup, Domain Intel, URL Scanner, Case Notes, Watchlist

### Key Functions in iocAnalysis.ts
```typescript
classifyIPVerdict(ipResult: IPLookupResult): VerdictAnalysis
  // Returns: verdict, confidence, severity, badges, evidence, recommendations

exportToCSV(analyses: VerdictAnalysis[]): string
exportToJSON(analyses: VerdictAnalysis[]): string
exportToPlainText(analyses: VerdictAnalysis[]): string
exportToDefanged(iocs: ExtractedIOCs): string
defangIOC(value: string, type: string): string
```

---

## Module: Bulk Lookup

**Purpose**: Check multiple IPs in batch

### Files Required
```
CORE FILES +

# Page Component
/src/pages/BulkLookup.tsx

# API Client
/src/lib/threatIntel.ts

# UI Components
/src/components/ThreatScore.tsx

# Edge Function
/supabase/functions/threat-intel/index.ts

# Database Tables
ip_lookups - Each IP stored individually
```

### Database Schema
Uses same `ip_lookups` table as IP Lookup module

### Integration Points
- **Entry**: User pastes list of IPs (one per line)
- **Edge Function**: `POST /threat-intel/bulk` with body `{"ips": ["1.1.1.1", ...]}`
- **Limits**: Anon: 5, DSBN: 100, External: 50
- **Response**: Returns array of `BulkIPResult` objects
- **Display**: Table with all results, export to CSV
- **Connected To**: IP Lookup, Smart IOC Intake

---

## Module: Email Analyzer

**Purpose**: Parse email headers and extract threat indicators

### Files Required
```
CORE FILES +

# Page Component
/src/pages/EmailAnalyzer.tsx

# No additional libs (pure client-side parsing)
```

### Database Schema
No database usage - client-side only

### Integration Points
- **Entry**: User pastes raw email headers
- **Processing**: Regex parsing in browser
- **Output**: Parsed headers, SPF/DKIM/DMARC, originating IP
- **One-Click**: "Lookup IP" button calls IP Lookup module
- **Connected To**: IP Lookup

---

## Module: News Feed

**Purpose**: Aggregate security news RSS feeds with watchlist alerting

### Files Required
```
CORE FILES +

# Page Component
/src/pages/NewsFeed.tsx

# Alert Context
/src/contexts/AlertContext.tsx

# Edge Function
/supabase/functions/news-feeds/index.ts

# Database Tables
feed_items - Cached news items
feed_sources - RSS/Atom feed URLs
user_custom_sources - User-added feeds
watchlist_entries - Keywords/IOCs to monitor
user_alerts - Generated alerts
```

### Database Schema
```sql
-- feed_items table
id (uuid, PK)
source_id (uuid, FK → feed_sources)
title (text)
description (text)
link (text, unique)
published_at (timestamptz)
content (text)
created_at (timestamptz)

-- RLS: Read for all, write for service role

-- feed_sources table
id (uuid, PK)
name (text)
url (text, unique)
category (text)
is_active (boolean)
last_fetched_at (timestamptz)
fetch_error (text)
created_at (timestamptz)

-- RLS: Read for all

-- user_custom_sources table
id (uuid, PK)
user_id (uuid, FK → auth.users)
name (text)
url (text)
category (text)
is_active (boolean)
created_at (timestamptz)

-- RLS: Users manage only their own sources

-- user_alerts table
id (uuid, PK)
user_id (uuid, FK → auth.users)
watchlist_entry_id (uuid, FK → watchlist_entries)
feed_item_id (uuid, FK → feed_items)
title (text)
description (text)
severity (text)
match_context (text)
is_read (boolean, indexed)
is_dismissed (boolean, indexed)
created_at (timestamptz)

-- RLS: Users see only their own alerts
```

### Integration Points
- **Entry**: Page loads → fetches feed items from edge function
- **Edge Function**: `GET /news-feeds` returns aggregated items
- **Refresh**: Auto-refresh every 5 minutes or manual trigger
- **Watchlist Matching**: Edge function checks new items against `watchlist_entries`
- **Alerting**: Creates `user_alerts` for matches, displayed via `AlertContext`
- **Connected To**: Watchlist, Settings (custom feeds)

### Edge Function Routes
```typescript
GET /news-feeds           // Fetch all feed items
POST /news-feeds/refresh  // Force refresh specific feed
POST /news-feeds/check-watchlist  // Check for matches
```

---

## Module: Case Notes

**Purpose**: Document investigations with IOCs and notes

### Files Required
```
CORE FILES +

# Page Component
/src/pages/CaseNotes.tsx
```

### Database Schema
```sql
-- case_notes table
id (uuid, PK)
title (text, required)
description (text)
status (text) - open, investigating, resolved, closed
priority (text) - low, medium, high, critical
iocs (jsonb) - Array: [{type, value, notes}]
notes (text)
tags (text[])
created_by (uuid, FK → auth.users, nullable)
created_at (timestamptz, indexed)
updated_at (timestamptz)

-- RLS: Open to all (team-shared tool)

-- Indexes on: status, priority, created_at
```

### Integration Points
- **Entry**: User clicks "New Case" or from Smart IOC Intake "Create Case" button
- **Database**: Direct Supabase operations (no edge function)
- **Pre-Fill**: Smart IOC Intake can pre-populate title, IOCs, priority
- **Display**: List view with filters, detail view with edit
- **Connected To**: Smart IOC Intake

---

## Module: History

**Purpose**: View past IP and URL lookups

### Files Required
```
CORE FILES +

# Page Component
/src/pages/History.tsx

# UI Components
/src/components/ThreatScore.tsx
```

### Database Schema
Uses `ip_lookups` and `url_lookups` tables (from IP Lookup and URL Scanner modules)

### Integration Points
- **Entry**: User navigates to History page
- **Database**: Queries `ip_lookups` and `url_lookups` for last 30 days
- **Display**: Unified list with filters (type, date, threat score)
- **Actions**: Re-run lookup (calls IP Lookup or URL Scanner), Delete entry
- **Connected To**: IP Lookup, URL Scanner

---

## Module: Defang Tool

**Purpose**: Convert IOCs to safe format for sharing

### Files Required
```
CORE FILES +

# Page Component
/src/pages/DefangTool.tsx
```

### Database Schema
No database usage - client-side only

### Integration Points
- **Entry**: User pastes IOCs
- **Processing**: Regex replacement in browser
- **Defang**: `http://evil.com` → `hxxp://evil[.]com`
- **Refang**: Reverse operation
- **Connected To**: Smart IOC Intake (uses defang function)

---

## Module: Decoder Tool

**Purpose**: Decode Base64, URL encoding, hex, etc.

### Files Required
```
CORE FILES +

# Page Component
/src/pages/DecoderTool.tsx
```

### Database Schema
No database usage - client-side only

### Integration Points
- **Entry**: User pastes encoded text
- **Processing**: Auto-detect format, decode in browser
- **Formats**: Base64, URL, Hex, HTML entities, Unicode
- **Connected To**: None (standalone tool)

---

## Module: Settings & API Keys

**Purpose**: Manage API keys, view usage stats, configure custom feeds

### Files Required
```
CORE FILES +

# Page Component
/src/pages/Settings.tsx

# Edge Function
/supabase/functions/api-keys/index.ts

# Database Tables
user_api_keys - Encrypted API keys
usage_stats - Lookup statistics
user_custom_sources - Custom RSS feeds
```

### Database Schema
```sql
-- user_api_keys table
id (uuid, PK)
user_id (uuid, FK → auth.users)
service (text) - virustotal, abuseipdb, shodan, etc.
encrypted_key (jsonb) - {iv, ciphertext, keyVersion}
api_key (text, deprecated, nullable)
is_active (boolean)
created_at (timestamptz)
updated_at (timestamptz)

-- RLS: Users manage only their own keys

-- usage_stats table
id (uuid, PK)
user_id (uuid, FK → auth.users)
date (date)
lookup_type (text) - ip, url, hash, domain, bulk
count (integer)
created_at (timestamptz)

-- RLS: Users see only their own stats
```

### Integration Points
- **Entry**: User navigates to Settings (auth required)
- **Edge Function**: `POST /api-keys` to add/update, `DELETE /api-keys/{service}` to remove
- **Encryption**: AES-256-GCM encryption via edge function
- **Display**: List of configured services, usage stats for 30 days
- **Import/Export**: .env file format support
- **Connected To**: All modules that use API keys

### Edge Function Routes
```typescript
GET /api-keys              // List user's keys (metadata only, no plaintext)
POST /api-keys             // Add or update key (encrypts before storing)
DELETE /api-keys/{service} // Remove key
```

### Supported Services
```typescript
const VALID_SERVICES = [
  "virustotal", "abuseipdb", "alienvault", "shodan",
  "ipqualityscore", "urlscan", "proxycheck", "greynoise",
  "ip2proxy", "iphub"
];
```

---

## Integration Points

### Main Data Flow Diagram
```
User Input (Page)
    ↓
lib/threatIntel.ts (API wrapper)
    ↓
Edge Function /threat-intel/* (routing, auth, caching)
    ↓
External APIs (VirusTotal, AbuseIPDB, etc.)
    ↓
Database Tables (persistence)
    ↓
Page Display (results)
```

### Cross-Module Dependencies

**IP Lookup ←→ Smart IOC Intake**
- Smart IOC calls `lookupIP()` for auto-analysis
- Results processed by `classifyIPVerdict()`

**Smart IOC Intake → Case Notes**
- "Create Case" button pre-fills case data
- IOCs attached to case

**Smart IOC Intake → Watchlist**
- "Add to Watchlist" button creates entry
- Watchlist used by News Feed for alerting

**News Feed ←→ Watchlist**
- Feed items checked against watchlist entries
- Matches create user alerts

**Email Analyzer → IP Lookup**
- Extracted IPs can be looked up with one click

**History ← IP Lookup, URL Scanner**
- All lookups stored in history tables
- History page queries both tables

### Shared Edge Function

The `threat-intel` edge function handles multiple endpoints:
- `/ip` - IP Lookup module
- `/url` - URL Scanner module
- `/bulk` - Bulk Lookup module
- `/hash` - Hash Lookup module (to be implemented)
- `/domain` - Domain Intel module (to be implemented)
- `/config` - Returns configured sources for current user

All modules use the same authentication and caching logic.

---

## Working on a Specific Module

### Example: Working on Smart IOC Intake Only

**Files to Load in New Chat:**
```
# Core Infrastructure
/src/main.tsx
/src/App.tsx
/src/components/Layout.tsx
/src/lib/supabase.ts
/src/types/index.ts
/src/contexts/AuthContext.tsx
/package.json
/.env

# Module-Specific Files
/src/pages/IOCExtractor.tsx
/src/lib/iocAnalysis.ts
/src/lib/threatIntel.ts
/src/components/ThreatScore.tsx

# Database Migrations (if modifying schema)
/supabase/migrations/20251230001309_create_watchlist_schema.sql
/supabase/migrations/20251229041832_create_case_notes_schema.sql

# Edge Function (if modifying auto-analysis)
/supabase/functions/threat-intel/index.ts

# Architecture Reference
/MODULAR_GUIDE.md (this file)
```

**Context to Provide:**
- "I want to work on the Smart IOC Intake feature"
- "This module extracts IOCs, auto-analyzes IPs, shows verdict cards, and has one-click actions"
- "Connected to: IP Lookup (for analysis), Case Notes (for create case), Watchlist (for monitoring)"

---

## Main Wiring & Connectivity

### App.tsx - Central Router
```typescript
// Main page switcher
function renderPage() {
  switch (currentPage) {
    case 'ip-lookup': return <IPLookup />;
    case 'smart-ioc': return <IOCExtractor />;
    case 'case-notes': return <CaseNotes />;
    // ... all other pages
  }
}
```

### Layout.tsx - Navigation
```typescript
// Navigation categories
const navCategories = [
  {
    title: 'Threat Intel',
    items: [
      { id: 'ip-lookup', label: 'IP Lookup', icon: Globe },
      { id: 'hash-lookup', label: 'Hash Lookup', icon: Hash },
      { id: 'domain-intel', label: 'Domain Intel', icon: Globe }
    ]
  },
  // ... other categories
];

// Page change handler
function handleNavigate(page: Page) {
  onNavigate(page);
}
```

### lib/threatIntel.ts - API Wrapper
```typescript
// All modules call these functions
export async function lookupIP(ip: string): Promise<IPLookupResult>
export async function scanURL(url: string): Promise<URLLookupResult>
export async function bulkLookupIPs(ips: string[]): Promise<{results: BulkIPResult[]}>
export async function getConfiguredSources(): Promise<ConfiguredSources>

// Internal helper for auth headers
async function getAuthHeaders(): Promise<Record<string, string>>
```

### Edge Function Routing
```typescript
// supabase/functions/threat-intel/index.ts
Deno.serve(async (req: Request) => {
  const path = new URL(req.url).pathname.replace("/threat-intel", "");

  if (path === "/ip") { /* IP Lookup */ }
  if (path === "/url") { /* URL Scanner */ }
  if (path === "/bulk") { /* Bulk Lookup */ }
  if (path === "/config") { /* Get configured sources */ }
});
```

---

## Environment Setup

### Frontend (.env)
```bash
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxx
```

### Edge Function Environment (Set in Supabase Dashboard)
```bash
# Auto-populated by Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=xxxxx
SUPABASE_SERVICE_ROLE_KEY=xxxxx

# Must set manually
API_KEY_ENCRYPTION_KEY=<32-byte base64 key>
ADMIN_EMAIL=your-email@dsbn.org

# Optional: Org-level API keys (for DSBN tier)
VIRUSTOTAL_API_KEY=xxxxx
ABUSEIPDB_API_KEY=xxxxx
SHODAN_API_KEY=xxxxx
IPQUALITYSCORE_API_KEY=xxxxx
PROXYCHECK_API_KEY=xxxxx
GREYNOISE_API_KEY=xxxxx
IP2PROXY_API_KEY=xxxxx
IPHUB_API_KEY=xxxxx
VPNAPI_API_KEY=xxxxx
URLSCAN_API_KEY=xxxxx
ALIENVAULT_API_KEY=xxxxx
```

---

## Testing Individual Modules

### Test IP Lookup
```bash
# Anonymous user (free sources only)
curl -X POST https://aufxheaofpzbovgqwcdr.supabase.co/functions/v1/threat-intel/ip \
  -H "Content-Type: application/json" \
  -d '{"ip": "8.8.8.8"}'

# Authenticated user (with Bearer token)
curl -X POST https://aufxheaofpzbovgqwcdr.supabase.co/functions/v1/threat-intel/ip \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <supabase_access_token>" \
  -d '{"ip": "8.8.8.8"}'
```

### Test API Key Management
```bash
# Add API key
curl -X POST https://aufxheaofpzbovgqwcdr.supabase.co/functions/v1/api-keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <supabase_access_token>" \
  -d '{"service": "virustotal", "apiKey": "your-vt-key-here"}'

# List keys (returns encrypted only)
curl -X GET https://aufxheaofpzbovgqwcdr.supabase.co/functions/v1/api-keys \
  -H "Authorization: Bearer <supabase_access_token>"
```

---

## Quick Reference: File → Module Mapping

| File | Module(s) |
|------|-----------|
| `src/pages/IPLookup.tsx` | IP Lookup |
| `src/pages/IOCExtractor.tsx` | Smart IOC Intake |
| `src/pages/CaseNotes.tsx` | Case Notes |
| `src/pages/NewsFeed.tsx` | News Feed |
| `src/pages/Settings.tsx` | Settings & API Keys |
| `src/pages/URLScanner.tsx` | URL Scanner |
| `src/pages/BulkLookup.tsx` | Bulk Lookup |
| `src/pages/HashLookup.tsx` | Hash Lookup |
| `src/pages/DomainIntel.tsx` | Domain Intel |
| `src/pages/EmailAnalyzer.tsx` | Email Analyzer |
| `src/pages/DefangTool.tsx` | Defang Tool |
| `src/pages/DecoderTool.tsx` | Decoder Tool |
| `src/pages/History.tsx` | History |
| `src/lib/threatIntel.ts` | All threat intel modules |
| `src/lib/iocAnalysis.ts` | Smart IOC Intake |
| `src/components/ThreatScore.tsx` | IP Lookup, Bulk Lookup, History, Smart IOC |
| `src/components/SourceCard.tsx` | IP Lookup, URL Scanner, Hash Lookup |
| `supabase/functions/threat-intel/index.ts` | IP Lookup, URL Scanner, Bulk Lookup, Hash, Domain |
| `supabase/functions/api-keys/index.ts` | Settings & API Keys |
| `supabase/functions/news-feeds/index.ts` | News Feed |

---

## Summary

This modular guide allows you to:
1. Identify exactly which files are needed for a specific feature
2. Understand the database tables and schemas for that feature
3. See how modules connect to each other
4. Load only necessary files into a new chat session
5. Work on features in isolation without the entire project context

**For token-efficient development:**
- Start new chat with Core Files + MODULAR_GUIDE.md
- Add only the module files you need
- Reference integration points when connecting modules
- Use this guide as the single source of truth for dependencies
