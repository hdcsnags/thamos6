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
- Comprehensive IOC lookup support (IPs, domains, URLs, file hashes, Chrome extensions)
- Smart caching to reduce API costs and rate limiting
- Tiered access system (Anonymous, DSBN internal, External authenticated)
- Team-shared history and case notes
- Real-time threat feed monitoring with watchlist alerts
- Automated verdict classification with confidence scoring

**User Tiers:**
1. **Anonymous** - Free sources only (7 sources)
2. **DSBN** - Users with @dsbn.org email get all 13+ sources with org API keys
3. **Org** - Users toggled to org tier by admin get all 13+ sources with org API keys (uses same org keys as DSBN tier)
4. **External** - Authenticated non-DSBN/non-org users can add their own API keys
5. **Admin** - Special users with platform management capabilities (user management, tier assignment, ban control)

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
  - URLhaus (malicious URLs and domains)
  - RDAP/WHOIS (domain registration data - always available)
  - TEOH.IO (Tor exit nodes)
  - Spamhaus (blocklists)
  - AlienVault OTX (community threat intel - requires free API key)

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
│  │ Tables: ip_lookups, url_lookups, domain_lookups, │   │
│  │ case_notes, feed_items, watchlist_entries, etc.  │   │
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

### Data Flow Example (Domain Lookup)

1. User enters domain in Scanner or DomainIntel page
2. Frontend calls `lookupDomain()` from `lib/threatIntel.ts`
3. Request sent to Edge Function `/threat-intel/domain` with auth headers
4. Edge Function:
   - Verifies user tier (anon/dsbn/external)
   - Checks cache for recent results (6-hour TTL per domain per tier)
   - Determines available sources based on tier and API keys
   - Queries threat intel sources in parallel:
     - RDAP/WHOIS (always available, free)
     - VirusTotal domain lookup (if API key configured)
     - URLhaus (free, checks domain URLs)
     - AlienVault OTX (if API key configured)
   - Parses WHOIS data (registrar, creation date, expiration, nameservers, domain age)
   - Aggregates results and calculates threat score
   - Stores in `domain_lookups` table and cache
   - Logs audit event
5. Results returned to frontend:
   - `domain` - The queried domain
   - `isMalicious` - Boolean flag if any source flagged as malicious
   - `overallThreatScore` - Calculated 0-100 score
   - `sources` - Object with results from each source
   - `whois` - Parsed WHOIS/RDAP data
   - `reputation` - VirusTotal reputation score (if available)
   - `categories` - Threat categories (if available)
   - `tier` - User's access tier
   - `sourcesAvailable` - List of sources queried
6. Frontend displays results with source cards, key facts, and threat score

### Data Flow Example (Smart IOC Intake Auto-Analysis)

1. User pastes raw text into Smart IOC Intake page
2. Frontend extracts IOCs using regex patterns (client-side)
3. User clicks "Analyze IPs" button
4. Frontend calls `lookupIP()` for up to 10 IPs in parallel
5. Each IP lookup follows the standard IP Lookup flow above
6. Frontend receives raw threat data from edge function
7. `classifyIPVerdict()` from `lib/iocAnalysis.ts` processes each result:
   - Analyzes threat indicators (Tor, VPN, proxy, malicious, hosting)
   - Assigns verdict label and confidence score
   - Generates evidence bullets from data sources
   - Creates actionable recommendations
   - Assigns severity level and color coding
8. Verdict cards displayed with one-click actions:
   - "Add to Watchlist" → inserts into `watchlist_entries` table
   - "Create Case" → inserts into `case_notes` table with pre-filled data
9. User can export results in multiple formats (CSV, JSON, text, defanged)

---

## Page Capabilities Matrix

**Note**: The unified Scanner page (`src/pages/Scanner.tsx`) serves as the main entry point for all IOC lookups. It automatically detects the input type (IP, domain, URL, hash, or Chrome extension ID) and routes to the appropriate result page. Users can also access specialized lookup pages directly from the navigation menu.

### Main Navigation

| Category | Page | Auth Required | Database | Edge Function | External APIs | Purpose |
|----------|------|---------------|----------|---------------|---------------|---------|
| **Threat Intel** |
| | IP Lookup | No | `ip_lookups` | `threat-intel/ip` | 13+ sources | Check IP reputation across multiple threat feeds |
| | Hash Lookup | No | - | `threat-intel/hash` | ThreatFox, VT | Check file hash against malware databases |
| | Domain Intel | No | - | `threat-intel/domain` | RDAP, VT, others | WHOIS and reputation for domains |
| **Analysis Tools** |
| | Smart IOC Intake | No* | `watchlist_entries`, `case_notes` | `threat-intel/ip` | 13+ sources | Extract and analyze IOCs from raw text with instant verdicts |
| | Defang/Refang | No | - | No | No | Convert IOCs to safe/active format |
| | Decoder | No | - | No | No | Decode Base64, URL encoding, hex, etc. |
| **Investigation** |
| | News Feed | No | `feed_items`, `feed_sources` | `news-feeds` | RSS/Atom feeds | Aggregate security news from multiple sources |
| **Extras** (Dropdown) |
| | Email Analyzer | No | - | No | No | Parse email headers for threat indicators |
| | URL Scanner | No | `url_lookups` | `threat-intel/url` | URLhaus, VT, URLScan | Check URL reputation and safety |
| | Bulk Lookup | No | `ip_lookups` | `threat-intel/bulk` | Same as IP Lookup | Batch check multiple IPs |
| | Case Notes | Yes* | `case_notes` | No | No | Document investigations and findings |
| | History | No | `ip_lookups`, `url_lookups`, `domain_lookups` | No | No | View past lookups (shared across team) |
| **Settings** |
| | Settings | Yes | `user_api_keys`, `user_custom_sources` | `api-keys` | No | Manage API keys and custom sources |
| **Admin** |
| | Admin Panel | Yes (Admin Only) | `profiles`, `admin_user_overview`, `usage_stats`, `user_api_keys`, `case_notes` | No | No | Platform administration - user management, tier control, ban system |

\* *Smart IOC Intake extraction is always free; optional auto-analysis requires auth for paid sources*

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
  - WHOIS/RDAP registration data (registrar, creation date, expiration, nameservers, domain age)
  - Reputation scores from VirusTotal
  - Malicious detection status
  - Categories and threat classifications
  - Per-source results (WHOIS, VirusTotal, URLhaus, AlienVault OTX)
- **Sources**:
  - RDAP/WHOIS (free, always available)
  - VirusTotal (requires API key)
  - URLhaus (free)
  - AlienVault OTX (requires API key)
- **Database**: Stores all lookups in `domain_lookups` table
- **Caching**: 6-hour cache per domain per tier
- **Edge Function**: `threat-intel/domain`

#### Analysis Tools

**Smart IOC Intake** (`src/pages/IOCExtractor.tsx`)
- **Functionality**: Advanced regex-based extraction of:
  - IPv4 addresses (filters localhost/reserved ranges)
  - IPv6 addresses
  - Domains (including defanged formats: evil[.]com, example(.)com)
  - URLs (including defanged: hxxp://, h[tt]ps://)
  - Email addresses (including defanged: user[@]domain[.]com)
  - MD5/SHA1/SHA256 hashes
  - CVE identifiers
- **Advanced Features**:
  - **SafeLinks Unwrapping**: Automatically extracts real URLs from Outlook/ProofPoint wrappers
  - **Auto-Analysis**: One-click parallel threat intel lookup for extracted IPs (up to 10)
  - **Verdict Cards**: Smart classification system with:
    - Verdict labels (Known Malicious, Tor Exit Node, Commercial VPN, Clean Residential, etc.)
    - Confidence scores (70-95% based on evidence strength)
    - Severity levels (Critical, High, Medium, Low, Info) with color-coded borders
    - Evidence bullets explaining the verdict
    - Actionable recommendations
    - Visual badges (VPN provider, datacenter, Tor Network, etc.)
  - **One-Click Actions**:
    - Add to watchlist for monitoring
    - Create case note with pre-filled investigation details
  - **Export Options**:
    - CSV (spreadsheet format with all analysis data)
    - JSON (structured data for automation)
    - Plain text (human-readable report)
    - Defanged list (safe-to-share IOC list)
  - Deduplication across all IOC types
  - Copy to clipboard (individual sections or all IOCs)
- **Integration**: Leverages `lib/threatIntel.ts` for auto-analysis and `lib/iocAnalysis.ts` for verdict classification
- **Database**: Uses `watchlist_entries` and `case_notes` tables for one-click actions
- **Architecture**: Hybrid approach - extraction runs in browser, optional analysis uses threat intel APIs

**Verdict Classification Engine** (`src/lib/iocAnalysis.ts`)
- **Purpose**: Unified threat verdict system for Smart IOC Intake
- **Functions**:
  - `classifyIPVerdict()`: Analyzes IP reputation data and returns verdict with:
    - Detection of Tor exit nodes (95% confidence)
    - Commercial VPN identification with provider names (85-90% confidence)
    - Proxy server detection (80% confidence)
    - Known malicious IP classification (90% confidence)
    - Mass scanner identification
    - Datacenter/hosting detection
    - Clean residential IP classification (70% confidence)
  - `classifyDomainVerdict()`: Domain reputation analysis
  - `classifyURLVerdict()`: URL threat categorization
  - `classifyHashVerdict()`: File hash analysis
  - `exportToCSV()`, `exportToJSON()`, `exportToPlainText()`, `exportToDefanged()`: Export utilities
  - `defangIOC()`: Safe IOC formatting
- **Verdict Structure**:
  - `verdict`: Human-readable classification
  - `confidence`: 0-100% score based on evidence quality
  - `severity`: critical | high | medium | low | info
  - `color`: Visual indicator color
  - `badges`: Quick-view tags (VPN provider, datacenter, etc.)
  - `evidence`: Array of reasons for the verdict
  - `recommendations`: Actionable security advice
- **Integration**: Used by Smart IOC Intake for auto-analysis results

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
- **Quick-Win Features**:
  - **Trending Keywords Panel** (NEW)
    - Analyzes last 24 hours of articles
    - Shows top 8 trending keywords with mention counts
    - Click any keyword to instantly filter feed
    - Filters common stop words for relevance
    - Dismissible panel with persistent state
  - **One-Click IOC Extraction** (NEW)
    - Extract IOCs from any article with single button click
    - Opens full-screen modal with categorized results:
      - IP Addresses (IPv4 with filtering of localhost/reserved)
      - Domains (including defanged formats)
      - URLs (full HTTP/HTTPS links)
      - Hashes (MD5/SHA1/SHA256)
    - Per-category copy-to-clipboard
    - Add individual IOCs to watchlist directly from modal
    - Shows count badge of total IOCs found
- **Core Features**:
  - Auto-refresh every 5 minutes
  - Watchlist matching (alerts user when keywords appear in articles)
  - Multi-level filtering: category, read/unread, saved, watchlist alerts
  - Read/unread tracking and save/unsave articles
  - Sort by newest/oldest
  - Two-pane layout: article list + preview pane
  - Article navigation (Previous/Next buttons)
  - Read full article in new tab
  - Toggle between Intel Stream and Ransomware Tracker views
- **Database**:
  - `feed_items` - Cached news items
  - `feed_sources` - Feed URLs and metadata
  - `user_custom_sources` - User-added feeds
  - `user_feed_items` - Per-user read/saved status
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
- **Shows**: Past IP, URL, and domain lookups from last 30 days
- **Features**:
  - Filter by type (IP/URL/Domain)
  - Sort by date, threat score
  - Re-run lookup with one click
  - Delete individual entries
  - View detailed results for each lookup
- **Database**: Queries `ip_lookups`, `url_lookups`, and `domain_lookups`
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

#### Admin Panel

**Admin Panel** (`src/pages/Admin.tsx`)
- **Requires**: Admin privileges (`is_admin = true` in profiles table)
- **Purpose**: Platform administration and user management
- **Features**:
  - **Dashboard Statistics**:
    - Total registered users
    - Active users (not banned)
    - Org tier users count
    - Banned users count
  - **User Management Table**:
    - Search users by email
    - View comprehensive user statistics:
      - Total API lookups performed
      - Number of API keys configured
      - Number of case notes created
      - Last login timestamp
    - Toggle user tier (Free ↔ Org) with single click
    - Ban/unban users instantly
    - Visual admin badges for admin users
  - **Access Control**:
    - Only admins can access the panel
    - Admins cannot ban themselves
    - Admins cannot change their own tier
- **Database**:
  - `profiles` - User profiles with admin flags
  - `admin_user_overview` - View aggregating user statistics
  - `usage_stats` - User activity metrics
  - `user_api_keys` - API key counts
  - `case_notes` - Case note counts
- **Security Functions**:
  - `update_user_tier(target_user_id, new_tier)` - Admin-only tier changes
  - `update_user_ban_status(target_user_id, banned)` - Admin-only ban control
- **Access**:
  - Visible only to users with `is_admin = true`
  - Accessible via user menu dropdown (click avatar → "Admin Panel")
  - Direct route: `/admin` (auto-protected by component)

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

#### `domain_lookups`
Stores domain reputation lookup history (team-shared, 30-day retention)
```sql
- id (uuid, PK)
- domain (text, indexed)
- results (jsonb) - Aggregated results from all sources (WHOIS, VirusTotal, URLhaus, AlienVault)
- is_malicious (boolean, indexed)
- threat_score (integer, 0-100, indexed)
- sources_checked (text[]) - Which APIs were queried
- user_id (uuid, nullable) - User who performed lookup (if authenticated)
- context (text) - Cache context (anon, org:dsbn, user:{id})
- created_at (timestamptz, indexed)
```
**RLS**: Read/write for all (anon + authenticated)
**Cleanup**: Automatic 30-day retention policy

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

#### `profiles`
User profile and administrative data
```sql
- id (uuid, PK, FK → auth.users)
- email (text)
- full_name (text)
- avatar_url (text)
- role (text)
- is_admin (boolean, default: false) - Admin panel access
- tier (user_tier enum: 'free' | 'org', default: 'free') - User tier for API access
- is_banned (boolean, default: false) - Ban status
- last_login_at (timestamptz, default: now()) - Last login timestamp
- created_at (timestamptz)
- updated_at (timestamptz)
```
**RLS**:
- All users can read their own profile
- Admins can read all profiles
- Admins can update tier and ban status of other users
**Indexes**: email, is_admin, tier, is_banned

#### `admin_user_overview` (View)
Aggregated user statistics for admin panel
```sql
SELECT
  p.id as user_id,
  p.email,
  p.tier,
  p.is_admin,
  p.is_banned,
  p.created_at,
  p.last_login_at,
  p.updated_at,
  COUNT(DISTINCT uak.id) as api_key_count,
  COUNT(DISTINCT cn.id) as case_note_count,
  COALESCE(SUM(us.count), 0) as total_lookups,
  MAX(us.date) as last_activity_date
FROM profiles p
LEFT JOIN user_api_keys uak ON uak.user_id = p.id
LEFT JOIN case_notes cn ON cn.user_id = p.id
LEFT JOIN usage_stats us ON us.user_id = p.id
GROUP BY p.id
ORDER BY p.created_at DESC
```
**Access**: Read-only for admins via RLS

#### `usage_stats`
Tracks user activity for statistics
```sql
- id (uuid, PK)
- user_id (uuid, FK → auth.users)
- date (date, indexed)
- count (integer) - Number of lookups performed
- created_at (timestamptz)
```
**Purpose**: Powers admin dashboard statistics and usage analytics

---

## Authentication & Authorization

### Auth Methods
- **OAuth Providers**: Google, Microsoft (configured in Supabase)
- **Email/Password**: Traditional auth
- **Anonymous**: Full access to free features without sign-in

### User Tiers (Implemented in Edge Functions)

**Tier Detection Logic** (`supabase/functions/threat-intel/index.ts:93-134`):
```typescript
1. No auth header → ANON
2. Auth header present:
   - Email === ADMIN_EMAIL → DSBN tier (org keys)
   - Email ends with @dsbn.org → DSBN tier (org keys)
   - profiles.tier === 'org' → DSBN tier (org keys)
   - Otherwise → EXTERNAL tier (user's own keys)
```

**Org Tier Configuration**:
- Admins can toggle any user to "org" tier via Admin Panel
- Org tier users automatically use organization API keys
- Organization keys are configured as **Edge Function Secrets** in Supabase Dashboard
- Navigate to: **Project Settings > Edge Functions > Secrets**
- Set these environment variables for org-wide access:
  - `VIRUSTOTAL_API_KEY`
  - `ABUSEIPDB_API_KEY`
  - `SHODAN_API_KEY`
  - `URLSCAN_API_KEY`
  - `IPQUALITYSCORE_API_KEY`
  - `ALIENVAULT_API_KEY`
  - `GREYNOISE_API_KEY`
  - `PROXYCHECK_API_KEY`
  - `IP2PROXY_API_KEY`
  - `IPHUB_API_KEY`
  - `VPNAPI_API_KEY`
  - `HYBRID_ANALYSIS_API_KEY`

**Tier Capabilities**:

| Feature | Anonymous | DSBN (@dsbn.org) | External (authenticated) | Admin | Org Tier (toggled) |
|---------|-----------|------------------|--------------------------|-------|--------------------|
| Free sources (7) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Paid sources (6+) | ❌ | ✅ (org keys + own keys) | ✅ (own keys) | ✅ | ✅ (org keys + own keys) |
| Bulk lookup limit | 5 IPs | 100 IPs | 50 IPs | 100 IPs | 100 IPs |
| Add API keys | ❌ | ✅ (fallback for missing org keys) | ✅ | ✅ | ✅ (fallback) |
| Add custom feeds | ❌ | ✅ | ✅ | ✅ | ✅ |
| Watchlist & alerts | ❌ | ✅ | ✅ | ✅ | ✅ |
| Admin panel access | ❌ | ❌ | ❌ | ✅ | ❌ |
| Manage user tiers | ❌ | ❌ | ❌ | ✅ | ❌ |
| Ban/unban users | ❌ | ❌ | ❌ | ✅ | ❌ |
| View all user stats | ❌ | ❌ | ❌ | ✅ | ❌ |
| Cache context | "anon" | "org:dsbn" | "user:{id}" | "user:{id}" | "org:shared" |

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

-- Admin-restricted (profiles)
CREATE POLICY "Admins can view all user profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true)
    OR auth.uid() = id
  );

CREATE POLICY "Admins can update user status"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true)
  )
  WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true)
  );
```

### Admin Functions

**`update_user_tier(target_user_id uuid, new_tier user_tier)`**
- **Purpose**: Change user tier between 'free' and 'org'
- **Security**: SECURITY DEFINER function, only callable by admins
- **Validation**: Checks caller has `is_admin = true`
- **Returns**: JSON with success status and message
- **Usage**: Powers tier toggle in admin panel

**`update_user_ban_status(target_user_id uuid, banned boolean)`**
- **Purpose**: Ban or unban a user account
- **Security**: SECURITY DEFINER function, only callable by admins
- **Validation**:
  - Checks caller has `is_admin = true`
  - Prevents admins from banning themselves
- **Returns**: JSON with success status and message
- **Usage**: Powers ban/unban buttons in admin panel
- **Note**: Banned users can't access protected features

---

## Edge Functions

### `/functions/threat-intel`
**Purpose**: Main routing hub for all threat intel queries

**Routes**:
- `POST /ip` - IP reputation lookup
  - Input: `{ "ip": "8.8.8.8" }`
  - Output: Aggregated threat data with geolocation, VPN/Tor detection, blocklist status
  - Sources: IP-API, AbuseIPDB, VirusTotal, Shodan, ProxyCheck, etc.

- `POST /url` - URL scanning
  - Input: `{ "url": "https://example.com" }`
  - Output: Malicious status, categories, screenshot (if URLScan available)
  - Sources: URLhaus, VirusTotal, URLScan

- `POST /domain` - Domain intelligence
  - Input: `{ "domain": "example.com" }`
  - Output: WHOIS/RDAP data, reputation, categories, threat score
  - Sources: RDAP (free), VirusTotal, URLhaus, AlienVault OTX
  - Returns: `{ domain, isMalicious, overallThreatScore, sources, whois, reputation, categories, tier, sourcesAvailable }`

- `POST /bulk` - Bulk IP lookup (batch processing)
  - Input: `{ "ips": ["8.8.8.8", "1.1.1.1", ...] }`
  - Limits: Anon (5 IPs), DSBN (100 IPs), External (50 IPs)

- `POST /hash` - Hash lookup
  - Input: `{ "hash": "abc123..." }`
  - Sources: ThreatFox, VirusTotal

- `GET /config` - Get configured sources for current user
  - Returns: Available sources based on tier and API keys

**Key Features**:
- Tier verification and enforcement
- Cache checking and management (6-hour TTL)
- Parallel API requests with timeout (10s)
- Error handling and fallback
- Result aggregation and threat scoring
- Database persistence

**API Key Management**:
```typescript
1. Determine user tier (checks auth token, email domain, and profiles.tier)
2. If DSBN tier (including org tier users toggled by admin):
   - Load org API keys from Edge Function environment variables first
   - Then load user's personal API keys from database as fallback
   - Merge: org keys take priority, user keys fill gaps
   - This allows org tier users to add their own keys for services
     where org keys aren't configured
3. If EXTERNAL tier:
   - Decrypt user's own API keys from database only
4. If ANON tier:
   - No paid sources, only free sources
```

**Setting Org Keys** (Admin Task):
1. Log into Supabase Dashboard
2. Navigate to Project Settings > Edge Functions
3. Click on "Manage secrets"
4. Add each API key as an environment variable:
   - Variable name: `VIRUSTOTAL_API_KEY` (exact name, uppercase)
   - Value: Your actual API key
   - Repeat for all services
5. Redeploy edge functions if needed (automatic in most cases)

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
- [ ] **Configure org-level API keys** in Edge Function Secrets (see "Setting Org Keys" section above)
  - [ ] `VIRUSTOTAL_API_KEY`
  - [ ] `ABUSEIPDB_API_KEY`
  - [ ] `SHODAN_API_KEY`
  - [ ] `URLSCAN_API_KEY`
  - [ ] `IPQUALITYSCORE_API_KEY`
  - [ ] `ALIENVAULT_API_KEY`
  - [ ] `GREYNOISE_API_KEY`
  - [ ] `PROXYCHECK_API_KEY`
  - [ ] Other optional keys (IP2PROXY, IPHUB, VPNAPI, etc.)
- [ ] Configure OAuth providers (Google, Microsoft) in Supabase Auth
- [ ] Review and adjust RLS policies based on team needs
- [ ] Add CAPTCHA or rate limiting for anonymous users
- [ ] Set up monitoring and error tracking (Sentry, Supabase Logs)
- [ ] Test all user tiers (anon, DSBN, external, admin)
- [ ] Verify API keys are encrypted and never exposed
- [ ] Run security audit (SQL injection, XSS, CSRF)
- [ ] Set up automated backups for database
- [ ] Document API key setup process for external users
- [ ] Create admin guide for managing org API keys
- [ ] Load test bulk lookup with max IPs (100)
- [ ] **Assign initial admin users** by running SQL:
  ```sql
  UPDATE profiles SET is_admin = true WHERE email = 'admin@example.com';
  ```
- [ ] Test admin panel functionality (view users, tier toggle, ban/unban)
- [ ] Verify admin-only RLS policies are working correctly
- [ ] Document admin procedures for user management

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
│   │   ├── threatIntel.ts    # API wrapper functions
│   │   └── iocAnalysis.ts    # Verdict classification engine
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
