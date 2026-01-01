# Thamos6 Threat Intelligence Platform - Architecture Guide

## Table of Contents
1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture Layers](#architecture-layers)
4. [Page Capabilities Matrix](#page-capabilities-matrix)
5. [Database Schema](#database-schema)
6. [Authentication & Authorization](#authentication--authorization)
7. [Edge Functions](#edge-functions)
8. [Configuration](#configuration)
9. [Extensibility Points](#extensibility-points)
10. [Potential Improvements](#potential-improvements)

---

## System Overview

Thamos6 is a multi-tier threat intelligence platform designed for SOC (Security Operations Center) teams. It aggregates data from 13+ threat intelligence sources, provides analysis tools, and includes case management capabilities.

**Core Value Propositions:**
- Unified interface for multiple threat intelligence APIs
- Smart caching to reduce API costs and rate limiting
- Tiered access system (Anonymous, DSBN internal, External authenticated)
- Team-shared history and case notes
- Real-time threat feed monitoring with watchlist alerts

**User Tiers:**
1. **Anonymous** - Free sources only (7 sources)
2. **DSBN** - Users with @dsbn.org email get all 13+ sources with org API keys
3. **External** - Authenticated non-DSBN users can add their own API keys

---

## Technology Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: TailwindCSS
- **Icons**: Lucide React
- **State Management**: React Context API
  - `AuthContext` - User authentication state
  - `AlertContext` - Real-time alerts and notifications

### Backend
- **Platform**: Supabase
  - PostgreSQL database with Row Level Security (RLS)
  - Supabase Auth (OAuth + Email/Password)
  - Edge Functions (Deno runtime)

### APIs & Services
- **Free Threat Intel Sources** (7):
  - IP-API (geolocation)
  - ThreatFox (malware IOCs)
  - URLhaus (malicious URLs)
  - RDAP (domain registration)
  - TEOH.IO (Tor exit nodes)
  - Spamhaus (blocklists)
  - AlienVault OTX (community threat intel)

- **Paid/API Key Sources** (6+):
  - VirusTotal
  - AbuseIPDB
  - Shodan
  - IPQualityScore
  - ProxyCheck
  - GreyNoise
  - URLScan

### Deployment
- Static hosting (via Vite build)
- Supabase cloud for backend services

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                   React Frontend                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │  Pages   │  │Components│  │  Contexts (Auth/Alert)│  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS/REST
┌────────────────────▼────────────────────────────────────┐
│              Supabase Edge Functions                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ threat-intel │  │  api-keys    │  │ news-feeds   │  │
│  │  (routing)   │  │ (encrypted)  │  │  (RSS/Atom)  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│           Supabase PostgreSQL Database                   │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Tables: ip_lookups, url_lookups, case_notes,     │   │
│  │ feed_items, watchlist_entries, user_alerts, etc. │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│            External Threat Intel APIs                    │
│   VirusTotal, AbuseIPDB, Shodan, AlienVault, etc.       │
└──────────────────────────────────────────────────────────┘
```

### Data Flow Example (IP Lookup)

1. User enters IP address in IPLookup page
2. Frontend calls `lookupIP()` from `lib/threatIntel.ts`
3. Request sent to Edge Function `/threat-intel/ip` with auth headers
4. Edge Function:
   - Verifies user tier (anon/dsbn/external)
   - Checks cache for recent results
   - Retrieves API keys (org keys or user keys)
   - Queries configured threat intel sources in parallel
   - Aggregates results and calculates threat score
   - Stores in `ip_lookups` table and cache
5. Results returned to frontend and displayed

---

## Page Capabilities Matrix

### Main Navigation

| Category | Page | Auth Required | Database | Edge Function | External APIs | Purpose |
|----------|------|---------------|----------|---------------|---------------|---------|
| **Threat Intel** |
| | IP Lookup | No | `ip_lookups` | `threat-intel/ip` | 13+ sources | Check IP reputation across multiple threat feeds |
| | Hash Lookup | No | - | `threat-intel/hash` | ThreatFox, VT | Check file hash against malware databases |
| | Domain Intel | No | - | `threat-intel/domain` | RDAP, VT, others | WHOIS and reputation for domains |
| **Analysis Tools** |
| | IOC Extractor | No | - | No | No | Extract IPs, domains, URLs, hashes from text |
| | Defang/Refang | No | - | No | No | Convert IOCs to safe/active format |
| | Decoder | No | - | No | No | Decode Base64, URL encoding, hex, etc. |
| **Investigation** |
| | News Feed | No | `feed_items`, `feed_sources` | `news-feeds` | RSS/Atom feeds | Aggregate security news from multiple sources |
| **Extras** (Dropdown) |
| | Email Analyzer | No | - | No | No | Parse email headers for threat indicators |
| | URL Scanner | No | `url_lookups` | `threat-intel/url` | URLhaus, VT, URLScan | Check URL reputation and safety |
| | Bulk Lookup | No | `ip_lookups` | `threat-intel/bulk` | Same as IP Lookup | Batch check multiple IPs |
| | Case Notes | Yes* | `case_notes` | No | No | Document investigations and findings |
| | History | No | `ip_lookups`, `url_lookups` | No | No | View past lookups (shared across team) |
| **Settings** |
| | Settings | Yes | `user_api_keys`, `user_custom_sources` | `api-keys` | No | Manage API keys and custom sources |

\* *Case Notes allows anonymous access but authenticated users get better features*

### Page Details

#### Threat Intel Pages

**IP Lookup** (`src/pages/IPLookup.tsx`)
- **Input**: IPv4 or IPv6 address
- **Output**:
  - Threat score (0-100)
  - Geolocation data
  - VPN/Tor/Proxy detection
  - ASN and ISP information
  - Blocklist status (Spamhaus, etc.)
  - Per-source results from all configured APIs
- **Features**:
  - Validates IP format
  - Shows which sources were checked
  - Color-coded threat score
  - Export capability
- **Database**: Stores all lookups in `ip_lookups` table
- **Caching**: 6-hour cache per IP per tier

**Hash Lookup** (`src/pages/HashLookup.tsx`)
- **Input**: MD5, SHA1, or SHA256 hash
- **Output**:
  - Malware detection status
  - File metadata if available
  - Community votes (if VirusTotal available)
- **Sources**: ThreatFox (free), VirusTotal (requires key)
- **Database**: No persistence currently

**Domain Intel** (`src/pages/DomainIntel.tsx`)
- **Input**: Domain name or FQDN
- **Output**:
  - WHOIS/RDAP registration data
  - Reputation scores
  - Associated IPs
  - Historical data
- **Sources**: RDAP (free), VirusTotal, others
- **Database**: No persistence currently

#### Analysis Tools (Client-side only)

**IOC Extractor** (`src/pages/IOCExtractor.tsx`)
- **Functionality**: Regex-based extraction of:
  - IPv4 addresses
  - Domains
  - URLs
  - Email addresses
  - MD5/SHA1/SHA256 hashes
  - CVE identifiers
- **Features**:
  - Deduplication
  - Copy to clipboard
  - One-click lookup for extracted IOCs
- **No Backend**: Runs entirely in browser

**Defang/Refang** (`src/pages/DefangTool.tsx`)
- **Defang**: Converts `http://evil.com` → `hxxp://evil[.]com`
- **Refang**: Converts back to active format
- **Purpose**: Safe sharing of IOCs in emails/docs
- **No Backend**: Pure client-side transformation

**Decoder** (`src/pages/DecoderTool.tsx`)
- **Supported Formats**:
  - Base64
  - URL encoding
  - Hex
  - HTML entities
  - Unicode escapes
- **Features**: Auto-detect encoding, multi-stage decoding
- **No Backend**: Runs in browser

#### Investigation Tools

**News Feed** (`src/pages/NewsFeed.tsx`)
- **Sources**:
  - Default security news feeds (Bleeping Computer, Krebs, etc.)
  - User-added custom RSS/Atom feeds (if authenticated)
- **Features**:
  - Auto-refresh every 5 minutes
  - Watchlist matching (alerts user when keywords appear)
  - Filter by source
  - Open in new tab
- **Database**:
  - `feed_items` - Cached news items
  - `feed_sources` - Feed URLs and metadata
  - `user_custom_sources` - User-added feeds
  - `watchlist_entries` - Keywords/IOCs to monitor
  - `user_alerts` - Generated alerts
- **Edge Function**: `news-feeds` fetches and parses RSS/Atom

**Case Notes** (`src/pages/CaseNotes.tsx`)
- **Purpose**: Document ongoing investigations
- **Features**:
  - Create cases with title, description, priority, status
  - Attach IOCs (IPs, domains, URLs, hashes)
  - Add investigation notes
  - Tag for categorization
  - Status tracking (open → investigating → resolved → closed)
  - Priority levels (low, medium, high, critical)
- **Database**: `case_notes` table (team-shared)
- **RLS**: Open to all users (team tool)

**History** (`src/pages/History.tsx`)
- **Shows**: Past IP and URL lookups from last 30 days
- **Features**:
  - Filter by type (IP/URL)
  - Sort by date, threat score
  - Re-run lookup
  - Delete entries
- **Database**: Queries `ip_lookups` and `url_lookups`
- **RLS**: All users see all history (team-shared)

#### Extras (Secondary Tools)

**Email Analyzer** (`src/pages/EmailAnalyzer.tsx`)
- **Input**: Raw email headers
- **Output**:
  - Parsed headers (From, To, Subject, etc.)
  - SPF/DKIM/DMARC results (if present)
  - Originating IP extraction
  - Suspicious header detection
- **Features**: One-click IP lookup from headers
- **No Backend**: Client-side parsing

**URL Scanner** (`src/pages/URLScanner.tsx`)
- **Input**: Full URL
- **Output**:
  - Malicious status
  - Threat categories (phishing, malware, etc.)
  - Screenshot (if URLScan available)
  - HTTP status, redirects
- **Database**: `url_lookups` table
- **Edge Function**: `threat-intel/url`

**Bulk Lookup** (`src/pages/BulkLookup.tsx`)
- **Input**: Multiple IPs (one per line)
- **Limits**:
  - Anonymous: 5 IPs
  - DSBN: 100 IPs
  - External: 50 IPs
- **Output**: Table with all results
- **Features**: Export to CSV
- **Edge Function**: `threat-intel/bulk` (parallel processing)

#### Settings

**Settings** (`src/pages/Settings.tsx`)
- **Requires**: Authentication
- **Features**:
  - View current tier and available sources
  - Add/manage API keys (encrypted)
  - Add custom RSS feeds for news monitoring
  - Test API key validity
- **Database**:
  - `user_api_keys` - Encrypted API keys
  - `user_custom_sources` - User RSS feeds
- **Edge Function**: `api-keys` (encryption/decryption)

---

## Database Schema

### Core Tables

#### `ip_lookups`
Stores IP reputation lookup history (team-shared, 30-day retention)
```sql
- id (uuid, PK)
- ip_address (text, indexed)
- results (jsonb) - Aggregated results from all sources
- threat_score (integer, 0-100, indexed)
- sources_checked (text[]) - Which APIs were queried
- created_at (timestamptz, indexed)
```
**RLS**: Read/write for all (anon + authenticated)

#### `url_lookups`
Stores URL scan history (team-shared, 30-day retention)
```sql
- id (uuid, PK)
- url (text)
- results (jsonb)
- is_malicious (boolean)
- threat_types (text[])
- created_at (timestamptz, indexed)
```
**RLS**: Read/write for all (anon + authenticated)

#### `api_cache`
Caches external API responses to reduce costs
```sql
- id (uuid, PK)
- cache_key (text, unique) - Hash of (source + query + tier)
- source (text) - API source name
- query (text) - The IP/URL/hash queried
- response (jsonb) - Cached response
- expires_at (timestamptz, indexed) - 6 hours default
- created_at (timestamptz)
```
**RLS**: Read for all, write for service role only

#### `case_notes`
Investigation case management (team-shared)
```sql
- id (uuid, PK)
- title (text, required)
- description (text)
- status (text) - open, investigating, resolved, closed
- priority (text) - low, medium, high, critical
- iocs (jsonb) - Array of IOCs: [{type, value, notes}]
- notes (text) - Investigation notes
- tags (text[])
- created_at (timestamptz, indexed)
- updated_at (timestamptz)
```
**RLS**: Read/write for all (team tool)
**Indexes**: status, priority, created_at

#### `feed_items`
Cached news feed items
```sql
- id (uuid, PK)
- source_id (uuid, FK → feed_sources)
- title (text, required)
- description (text)
- link (text, unique)
- published_at (timestamptz)
- content (text)
- created_at (timestamptz)
```
**RLS**: Read for all, write for service role
**Indexes**: source_id, published_at, link

#### `feed_sources`
News feed source configuration
```sql
- id (uuid, PK)
- name (text, required)
- url (text, unique) - RSS/Atom feed URL
- category (text)
- is_active (boolean)
- last_fetched_at (timestamptz)
- fetch_error (text)
- created_at (timestamptz)
```
**RLS**: Read for all

#### `watchlist_entries`
User-defined IOCs and keywords to monitor in feeds
```sql
- id (uuid, PK)
- user_id (uuid, FK → auth.users)
- entry_type (text) - ip, domain, url, hash, email, keyword, cve
- value (text, indexed) - The IOC/keyword to watch
- description (text)
- severity (text) - critical, high, medium, low
- is_active (boolean, indexed)
- match_count (integer) - Times matched
- last_matched_at (timestamptz)
- created_at (timestamptz)
```
**RLS**: Users see only their own entries
**Indexes**: user_id, value, entry_type, is_active
**Unique**: (user_id, entry_type, value)

#### `user_alerts`
Alerts generated when watchlist entries match feed items
```sql
- id (uuid, PK)
- user_id (uuid, FK → auth.users)
- watchlist_entry_id (uuid, FK → watchlist_entries)
- feed_item_id (uuid, FK → feed_items)
- title (text) - Alert title
- description (text)
- severity (text) - From watchlist entry
- match_context (text) - Where the match occurred
- is_read (boolean, indexed)
- is_dismissed (boolean, indexed)
- created_at (timestamptz, indexed)
```
**RLS**: Users see only their own alerts
**Indexes**: user_id, is_read, is_dismissed, created_at
**Unique**: (user_id, watchlist_entry_id, feed_item_id)

#### `user_api_keys`
Encrypted API keys for external authenticated users
```sql
- id (uuid, PK)
- user_id (uuid, FK → auth.users)
- source (text) - virustotal, abuseipdb, shodan, etc.
- encrypted_key (text) - AES-encrypted
- is_valid (boolean)
- last_tested_at (timestamptz)
- created_at (timestamptz)
```
**RLS**: Users manage only their own keys
**Encryption**: AES-256 via edge function

#### `user_custom_sources`
User-added custom RSS feeds
```sql
- id (uuid, PK)
- user_id (uuid, FK → auth.users)
- name (text, required)
- url (text, required)
- category (text)
- is_active (boolean)
- created_at (timestamptz)
```
**RLS**: Users manage only their own sources

---

## Authentication & Authorization

### Auth Methods
- **OAuth Providers**: Google, Microsoft (configured in Supabase)
- **Email/Password**: Traditional auth
- **Anonymous**: Full access to free features without sign-in

### User Tiers (Implemented in Edge Functions)

**Tier Detection Logic** (`supabase/functions/threat-intel/index.ts:73-105`):
```typescript
1. No auth header → ANON
2. Auth header present:
   - Email === ADMIN_EMAIL → DSBN tier
   - Email ends with @dsbn.org → DSBN tier
   - Otherwise → EXTERNAL tier
```

**Tier Capabilities**:

| Feature | Anonymous | DSBN (@dsbn.org) | External (authenticated) |
|---------|-----------|------------------|--------------------------|
| Free sources (7) | ✅ | ✅ | ✅ |
| Paid sources (6+) | ❌ | ✅ (org keys) | ✅ (own keys) |
| Bulk lookup limit | 5 IPs | 100 IPs | 50 IPs |
| Add API keys | ❌ | ❌ | ✅ |
| Add custom feeds | ❌ | ✅ | ✅ |
| Watchlist & alerts | ❌ | ✅ | ✅ |
| Cache context | "anon" | "org:dsbn" | "user:{id}" |

**Cache Isolation**:
- Anonymous users share cache ("anon" context)
- DSBN users share org cache ("org:dsbn" context)
- External users have isolated cache ("user:{id}" context)

### Row Level Security (RLS)

**Philosophy**:
- **Team tools** (ip_lookups, url_lookups, case_notes) → Open to all
- **User tools** (watchlist, alerts, api_keys) → Restricted to owner
- **System data** (api_cache, feed_items) → Read-only for users

**Example Policies**:
```sql
-- Team-shared (case_notes)
CREATE POLICY "Allow all operations for all users"
  ON case_notes FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);

-- User-restricted (watchlist_entries)
CREATE POLICY "Users can view own entries"
  ON watchlist_entries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Cache (service role only writes)
CREATE POLICY "Allow public read on valid cache"
  ON api_cache FOR SELECT
  TO anon, authenticated
  USING (expires_at > now());
```

---

## Edge Functions

### `/functions/threat-intel`
**Purpose**: Main routing hub for all threat intel queries

**Routes**:
- `POST /ip` - IP reputation lookup
- `POST /url` - URL scanning
- `POST /bulk` - Bulk IP lookup
- `POST /hash` - Hash lookup (future)
- `POST /domain` - Domain intelligence
- `GET /config` - Get configured sources for current user

**Key Features**:
- Tier verification and enforcement
- Cache checking and management (6-hour TTL)
- Parallel API requests with timeout (10s)
- Error handling and fallback
- Result aggregation and threat scoring
- Database persistence

**API Key Management**:
```typescript
1. Determine user tier
2. If DSBN tier:
   - Decrypt org API keys (from admin user's user_api_keys)
3. If EXTERNAL tier:
   - Decrypt user's own API keys
4. If ANON tier:
   - No paid sources, only free sources
```

**Threat Score Algorithm** (IP Lookup):
```typescript
1. Start with base score = 0
2. For each source result:
   - Known malicious: +30
   - Suspicious activity: +15
   - VPN/Tor/Proxy: +5
   - Clean: +0
3. Weight by source reliability
4. Cap at 100
5. Categorize: 0-25 Low, 26-50 Medium, 51-75 High, 76-100 Critical
```

**Environment Variables**:
- `SUPABASE_URL` - Auto-populated
- `SUPABASE_ANON_KEY` - Auto-populated
- `SUPABASE_SERVICE_ROLE_KEY` - Auto-populated
- `API_KEY_ENCRYPTION_KEY` - Set manually for encryption
- `ADMIN_EMAIL` - DSBN admin email for org key management

### `/functions/api-keys`
**Purpose**: Secure API key storage and retrieval

**Routes**:
- `POST /api-keys/set` - Store encrypted API key
- `GET /api-keys/list` - List user's keys (encrypted)
- `DELETE /api-keys/:id` - Remove key
- `POST /api-keys/test` - Validate key against provider

**Security**:
- Uses AES-256-GCM encryption
- Encryption key from environment variable
- Each key encrypted separately
- Never returns plaintext keys to frontend

### `/functions/news-feeds`
**Purpose**: Fetch and parse RSS/Atom feeds

**Routes**:
- `GET /feeds` - Fetch all feed items
- `POST /feeds/refresh` - Force refresh specific feed
- `POST /feeds/check-watchlist` - Check new items against user watchlist

**Process**:
1. Fetch RSS/Atom XML from feed URLs
2. Parse using XML parser
3. Extract items (title, description, link, published date)
4. Store in `feed_items` table
5. For authenticated users, check against `watchlist_entries`
6. Generate `user_alerts` for matches
7. Return aggregated feed items

**Refresh Strategy**:
- Auto-refresh every 15 minutes (can be triggered from frontend)
- Cache items for 24 hours
- Deduplication by link URL

---

## Configuration

### Environment Variables (`.env`)
```bash
# Supabase (auto-populated in hosted environment)
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxx

# Optional: Set in Edge Function environment
API_KEY_ENCRYPTION_KEY=your-32-char-encryption-key
ADMIN_EMAIL=admin@dsbn.org
```

### Adding New Threat Intel Sources

**Frontend** (`src/lib/threatIntel.ts`):
No changes needed - edge function handles sources

**Edge Function** (`supabase/functions/threat-intel/index.ts`):

1. Add source to appropriate array:
```typescript
const FREE_SOURCES = [..., "newsource"];
// or
const PAID_SOURCES = [..., "newsource"];
```

2. Implement query function:
```typescript
async function queryNewSource(query: string, apiKey?: string): Promise<ThreatResult> {
  const response = await fetch(`https://api.newsource.com/v1/lookup?q=${query}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  const data = await response.json();
  return {
    source: 'newsource',
    data: { /* normalized data */ },
    threatScore: calculateScore(data),
    isMalicious: data.is_bad
  };
}
```

3. Add to source dispatcher:
```typescript
if (sources.includes('newsource')) {
  promises.push(queryNewSource(ip, apiKeys.newsource));
}
```

### Adding New Pages

1. Create page component in `src/pages/NewPage.tsx`
2. Add route to `Page` type in `src/components/Layout.tsx`
3. Add navigation item to appropriate `navCategories` array
4. Add case to `renderPage()` switch in `src/App.tsx`
5. Import component in `App.tsx`

---

## Extensibility Points

### 1. Custom Threat Intel Sources
**Current**: 13+ sources hardcoded in edge function
**Extension**:
- Add plugin system where sources are defined in database
- Each source has: name, endpoint template, request format, response parser
- Users can add custom sources via Settings page
- Edge function dynamically loads and queries sources

**Implementation**:
```sql
CREATE TABLE threat_sources (
  id uuid PRIMARY KEY,
  name text UNIQUE,
  source_type text, -- ip, url, hash, domain
  endpoint_template text, -- "https://api.example.com/v1/lookup?q={query}"
  auth_method text, -- bearer, query_param, header
  auth_key text, -- header name or param name
  is_free boolean,
  response_parser jsonb, -- JSONPath or transform logic
  created_at timestamptz
);
```

### 2. Webhook Integrations
**Current**: No outbound integrations
**Extension**:
- Add webhook table to send alerts to external systems (Slack, Discord, SIEM)
- Trigger webhooks on high-severity alerts
- Support multiple webhook types (Slack, generic JSON, email)

**Implementation**:
```sql
CREATE TABLE webhooks (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  webhook_type text, -- slack, discord, generic, email
  endpoint_url text,
  secret text, -- for signature verification
  trigger_conditions jsonb, -- severity >= high, specific IOC types
  is_active boolean,
  created_at timestamptz
);
```

### 3. Scheduled Scans
**Current**: Manual lookups only
**Extension**:
- Add cron-triggered edge function to re-scan watchlist IOCs
- Store historical scores to detect reputation changes
- Alert on significant score increases

**Implementation**:
- Use Supabase cron extension or external scheduler
- Create `scheduled_scans` table
- Edge function queries all active watchlist entries
- Compare new threat scores with previous

### 4. Advanced Analytics
**Current**: Basic threat scores
**Extension**:
- Dashboard with graphs: threat score trends, most active IOCs, geographic distribution
- Machine learning anomaly detection
- Risk scoring based on multiple factors

### 5. Multi-Tenancy
**Current**: DSBN org + external users (flat structure)
**Extension**:
- Formal organization/team structure
- Team-level sharing of watchlists, cases, API keys
- Invite system for team members
- Admin roles and permissions

**Implementation**:
```sql
CREATE TABLE organizations (
  id uuid PRIMARY KEY,
  name text,
  tier text, -- determines API access
  created_at timestamptz
);

CREATE TABLE organization_members (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES organizations(id),
  user_id uuid REFERENCES auth.users(id),
  role text, -- admin, analyst, viewer
  joined_at timestamptz
);

-- Update existing tables to reference org_id instead of user_id
```

### 6. STIX/TAXII Integration
**Current**: Custom format for IOCs
**Extension**:
- Import/export STIX 2.1 bundles
- Subscribe to TAXII feeds
- Share findings via TAXII server

### 7. Automation & Playbooks
**Current**: Manual investigation workflow
**Extension**:
- Define automated response playbooks
- Trigger actions based on threat score (e.g., auto-create case for score > 80)
- Integration with SOAR platforms

---

## Potential Improvements

### High Priority

1. **User Experience**
   - Add keyboard shortcuts (e.g., `/` to focus search, `Ctrl+K` for command palette)
   - Implement dark/light theme toggle
   - Add loading skeletons instead of spinners
   - Persistent user preferences (default page, favorite sources)

2. **Performance**
   - Implement virtual scrolling for History page (large datasets)
   - Add pagination to case notes
   - Lazy load news feed items
   - Service Worker for offline caching of static assets

3. **Security Hardening**
   - Add CAPTCHA for anonymous users (prevent abuse)
   - Rate limiting per IP address
   - API key rotation reminders
   - Audit log for sensitive operations (API key changes, bulk lookups)

4. **Data Export**
   - Export case notes as PDF/DOCX
   - Export history as CSV/JSON
   - Generate investigation reports with graphs
   - API endpoint for programmatic access

### Medium Priority

5. **Collaboration**
   - Real-time updates (show when teammate adds case note)
   - @mentions in case notes
   - Commenting on investigations
   - Share specific lookup results via link

6. **Threat Intelligence Enrichment**
   - Passive DNS integration
   - SSL certificate lookups
   - Shodan enrichment (open ports, vulnerabilities)
   - Dark web monitoring (credential leaks)

7. **Visualization**
   - Network graph for related IOCs
   - Geographic map for IP sources
   - Timeline view for investigations
   - Threat trends dashboard

8. **Mobile Support**
   - Progressive Web App (PWA)
   - Responsive layout improvements
   - Mobile-optimized input methods
   - Push notifications for alerts

### Low Priority (Nice to Have)

9. **AI/ML Features**
   - Natural language queries ("Show me all IPs from Russia in the last week")
   - Auto-categorization of case notes
   - Predictive threat scoring
   - IOC recommendation engine

10. **Integrations**
    - Browser extension for right-click IOC lookup
    - Email plugin for Outlook/Gmail
    - IDE extension for developers
    - SIEM connectors (Splunk, Elastic)

11. **Advanced Features**
    - Diffing tool (compare two lookups side-by-side)
    - Regex-based search across all stored data
    - Custom alert rules engine
    - API gateway for partner integrations

---

## Current Limitations

1. **API Rate Limits**
   - Free tier users share anonymous cache (6-hour TTL)
   - No request queue or retry logic for rate-limited requests
   - Mitigation: Increase cache duration or implement smart retry

2. **Bulk Lookup Performance**
   - Currently serial processing (one at a time)
   - Can be slow for 100 IPs at DSBN tier
   - Mitigation: Implement true parallel processing with concurrency control

3. **Search Functionality**
   - No full-text search across cases, history, or feeds
   - Mitigation: Add PostgreSQL FTS or external search service (Typesense/Algolia)

4. **Real-Time Updates**
   - No WebSocket or SSE for live data
   - Users must manually refresh
   - Mitigation: Implement Supabase Realtime subscriptions

5. **Storage Limits**
   - No cleanup strategy for old lookups (30-day policy in RLS but data remains)
   - Feed items accumulate indefinitely
   - Mitigation: Scheduled cleanup jobs in edge function

6. **Error Handling**
   - Generic error messages for failed API requests
   - No retry logic for transient failures
   - Mitigation: Improve error classification and user feedback

---

## Security Considerations

1. **API Keys**
   - ✅ Encrypted at rest (AES-256-GCM)
   - ✅ Never exposed to frontend
   - ⚠️ Encryption key stored as environment variable (consider secrets manager)

2. **Row Level Security**
   - ✅ Enabled on all tables
   - ✅ Proper policies for user data isolation
   - ⚠️ Some tables intentionally open for team sharing (review if needed)

3. **Input Validation**
   - ✅ IP format validation
   - ✅ URL validation
   - ⚠️ No sanitization on free-text fields (case notes, watchlist descriptions)
   - Mitigation: Add XSS protection and content security policy

4. **Rate Limiting**
   - ⚠️ No rate limiting on edge functions
   - Anonymous users can abuse free sources
   - Mitigation: Implement IP-based rate limits in edge functions

5. **Authentication**
   - ✅ Supabase Auth (industry standard)
   - ✅ OAuth and email/password supported
   - ⚠️ No 2FA/MFA option
   - Mitigation: Enable MFA in Supabase Auth settings

---

## Deployment Checklist

Before deploying to production:

- [ ] Set `API_KEY_ENCRYPTION_KEY` in Supabase Edge Function environment
- [ ] Set `ADMIN_EMAIL` for DSBN org admin
- [ ] Configure OAuth providers (Google, Microsoft) in Supabase Auth
- [ ] Review and adjust RLS policies based on team needs
- [ ] Add CAPTCHA or rate limiting for anonymous users
- [ ] Set up monitoring and error tracking (Sentry, Supabase Logs)
- [ ] Test all user tiers (anon, DSBN, external)
- [ ] Verify API keys are encrypted and never exposed
- [ ] Run security audit (SQL injection, XSS, CSRF)
- [ ] Set up automated backups for database
- [ ] Document API key setup process for external users
- [ ] Create admin guide for managing org API keys
- [ ] Load test bulk lookup with max IPs (100)

---

## Getting Started for Developers

### Local Development Setup

1. Clone repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and fill in Supabase credentials
4. Run dev server: `npm run dev`
5. For edge function development:
   - Install Supabase CLI
   - Run `supabase functions serve`
   - Update `EDGE_FUNCTION_URL` in `src/lib/supabase.ts` to local endpoint

### Project Structure

```
/project
├── src/
│   ├── components/       # Reusable UI components
│   │   ├── Layout.tsx        # Main navigation and layout
│   │   ├── SourceCard.tsx    # Threat source result display
│   │   └── ThreatScore.tsx   # Threat score indicator
│   ├── contexts/         # React contexts
│   │   ├── AuthContext.tsx   # Authentication state
│   │   └── AlertContext.tsx  # Alert notifications
│   ├── lib/              # Utility libraries
│   │   ├── supabase.ts       # Supabase client config
│   │   └── threatIntel.ts    # API wrapper functions
│   ├── pages/            # Page components
│   │   ├── IPLookup.tsx
│   │   ├── URLScanner.tsx
│   │   ├── [...]
│   ├── types/            # TypeScript type definitions
│   ├── App.tsx           # Root component with routing
│   └── main.tsx          # Entry point
├── supabase/
│   ├── functions/        # Edge functions
│   │   ├── threat-intel/     # Main TI routing
│   │   ├── api-keys/         # Key management
│   │   └── news-feeds/       # RSS feed aggregation
│   └── migrations/       # Database migrations
├── public/               # Static assets
└── package.json
```

### Common Development Tasks

**Add a new page**:
1. Create `src/pages/NewPage.tsx`
2. Update `Page` type in `Layout.tsx`
3. Add navigation item
4. Add route in `App.tsx`

**Add a threat intel source**:
1. Update `FREE_SOURCES` or `PAID_SOURCES` in `threat-intel/index.ts`
2. Implement query function
3. Add to dispatcher logic

**Modify database schema**:
1. Create new migration: `supabase migration new migration_name`
2. Write SQL with proper RLS policies
3. Apply: `supabase db push`

**Test edge functions locally**:
```bash
supabase functions serve threat-intel
curl -X POST http://localhost:54321/functions/v1/threat-intel/ip \
  -H "Content-Type: application/json" \
  -d '{"ip": "8.8.8.8"}'
```

---

## Contact & Support

For questions or improvements, contact the development team or refer to internal documentation.

**Key Files for Reference**:
- Edge Function Logic: `supabase/functions/threat-intel/index.ts`
- Database Schema: `supabase/migrations/*.sql`
- Main Navigation: `src/components/Layout.tsx`
- API Client: `src/lib/threatIntel.ts`
