# Thamos6 SOC Platform - Architecture Guide

**Document Version**: 1.0
**Last Updated**: December 29, 2025
**Status**: Production Ready

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Overview](#2-system-overview)
3. [Current Architecture](#3-current-architecture)
4. [Database Requirements](#4-database-requirements)
5. [External API Dependencies](#5-external-api-dependencies)
6. [Self-Hosting Options](#6-self-hosting-options)
7. [Environment Configuration](#7-environment-configuration)
8. [Security Considerations](#8-security-considerations)
9. [Scaling Considerations](#9-scaling-considerations)
10. [Migration Path](#10-migration-path)

---

## 1. Executive Summary

**Thamos6** is a comprehensive Security Operations Center (SOC) toolkit that provides:

- **Threat Intelligence Lookups**: IP reputation, URL scanning, domain intel, hash lookups
- **Analysis Tools**: IOC extraction, email header analysis, encoding/decoding, defanging
- **Investigation Tracking**: Case notes with IOC management, lookup history
- **Multi-Source Correlation**: 13+ threat intelligence APIs aggregated into unified threat scores

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React 18 + TypeScript | Single Page Application |
| Styling | Tailwind CSS | UI Components |
| Build | Vite 5 | Development & Bundling |
| Database | PostgreSQL | Data Persistence |
| Auth | OAuth2 (Google/Microsoft) | User Authentication |
| Serverless | Deno Edge Functions | API Proxy & Aggregation |
| Hosting | Supabase (current) | Managed Backend |

### Key Metrics

- **13 Feature Pages** (5 intel, 5 analysis, 2 investigation, 1 settings)
- **13+ External API Integrations** (VirusTotal, AbuseIPDB, Shodan, etc.)
- **6 Database Tables** (lookups, cases, keys, cache, stats)
- **1 Edge Function** (~614 lines, handles all threat intel)

---

## 2. System Overview

### Feature Breakdown

#### Threat Intelligence (5 tools)
| Feature | Description | External APIs Used |
|---------|-------------|-------------------|
| IP Lookup | Check IP against 13 threat sources | All 13 sources |
| URL Scanner | Scan URLs for malware/phishing | VirusTotal, URLScan, URLhaus |
| Domain Intel | DNS, WHOIS, SSL analysis | Cloudflare DNS, RDAP |
| Hash Lookup | Check file hashes | VirusTotal, MalwareBazaar, Hybrid Analysis |
| Bulk Lookup | Analyze up to 20 IPs | 6 sources (optimized set) |

#### Analysis Tools (5 tools)
| Feature | Description | External APIs Used |
|---------|-------------|-------------------|
| IOC Extractor | Extract IPs, URLs, hashes from text | None (client-side) |
| Email Analyzer | Parse headers, detect spoofing | None (client-side) |
| Defang/Refang | Safely share malicious IOCs | None (client-side) |
| Decoder | Base64, URL, Hex encoding | None (client-side) |
| CVE Lookup | Search vulnerability database | NVD API |

#### Investigation (2 tools)
| Feature | Description | Database Tables |
|---------|-------------|-----------------|
| Case Notes | Track investigations with IOCs | case_notes |
| History | Review past lookups | ip_lookups, url_lookups |

---

## 3. Current Architecture

### Architecture Diagram

```
                                    INTERNET
                                        │
                    ┌───────────────────┴───────────────────┐
                    │         EXTERNAL THREAT APIs          │
                    │  VirusTotal, AbuseIPDB, Shodan, etc.  │
                    └───────────────────┬───────────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    │          SUPABASE PLATFORM            │
                    │  ┌─────────────────────────────────┐  │
                    │  │     Edge Function (Deno)        │  │
                    │  │     /functions/v1/threat-intel  │  │
                    │  │     - IP enrichment             │  │
                    │  │     - URL scanning              │  │
                    │  │     - Bulk processing           │  │
                    │  │     - Response caching          │  │
                    │  └─────────────────┬───────────────┘  │
                    │                    │                  │
                    │  ┌─────────────────┴───────────────┐  │
                    │  │     PostgreSQL Database         │  │
                    │  │     - ip_lookups                │  │
                    │  │     - url_lookups               │  │
                    │  │     - case_notes                │  │
                    │  │     - user_api_keys             │  │
                    │  │     - usage_stats               │  │
                    │  │     - api_cache                 │  │
                    │  └─────────────────┬───────────────┘  │
                    │                    │                  │
                    │  ┌─────────────────┴───────────────┐  │
                    │  │     Supabase Auth               │  │
                    │  │     - OAuth2 (Google/Microsoft) │  │
                    │  │     - Session management        │  │
                    │  └─────────────────────────────────┘  │
                    └───────────────────┬───────────────────┘
                                        │
                                        │ HTTPS
                                        │
                    ┌───────────────────┴───────────────────┐
                    │           STATIC FRONTEND             │
                    │       (React SPA - dist/ folder)      │
                    │                                       │
                    │   Currently: Supabase/Bolt hosting    │
                    │   Can be: S3, Amplify, Lightsail, etc │
                    └───────────────────────────────────────┘
                                        │
                                        │
                                    USER BROWSER
```

### Component Responsibilities

#### Frontend (React SPA)
- **Location**: `src/` directory, builds to `dist/`
- **Size**: ~40KB gzipped
- **Responsibilities**:
  - User interface rendering
  - Client-side IOC extraction/analysis
  - API calls to Edge Functions
  - Auth state management
  - Local form validation

#### Edge Function (Deno Serverless)
- **Location**: `supabase/functions/threat-intel/`
- **Runtime**: Deno (TypeScript)
- **Responsibilities**:
  - Proxy all external API calls (keeps keys server-side)
  - Aggregate responses from 13+ sources
  - Calculate threat scores
  - Cache API responses (6-hour TTL)
  - Record lookup history

#### Database (PostgreSQL)
- **Location**: Supabase managed (currently)
- **Responsibilities**:
  - Store lookup history
  - Store case notes
  - Store user API keys (encrypted)
  - Cache API responses
  - Track usage statistics

---

## 4. Database Requirements

### Schema Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   ip_lookups    │     │   url_lookups   │     │   case_notes    │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (uuid)       │     │ id (uuid)       │     │ id (uuid)       │
│ ip_address      │     │ url             │     │ title           │
│ results (jsonb) │     │ results (jsonb) │     │ description     │
│ threat_score    │     │ is_malicious    │     │ status          │
│ sources_checked │     │ threat_types    │     │ priority        │
│ created_at      │     │ created_at      │     │ iocs (jsonb)    │
└─────────────────┘     └─────────────────┘     │ notes           │
                                                │ tags            │
                                                │ created_at      │
                                                │ updated_at      │
                                                └─────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  user_api_keys  │     │   usage_stats   │     │    api_cache    │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (uuid)       │     │ id (uuid)       │     │ id (uuid)       │
│ user_id (fk)    │     │ user_id (fk)    │     │ cache_key       │
│ service         │     │ date            │     │ source          │
│ api_key         │     │ lookup_type     │     │ query           │
│ is_active       │     │ count           │     │ response (jsonb)│
│ created_at      │     │ created_at      │     │ expires_at      │
│ updated_at      │     └─────────────────┘     │ created_at      │
└─────────────────┘                             └─────────────────┘
```

### Table Details

#### ip_lookups
- **Purpose**: Store IP reputation lookup history
- **Retention**: 30 days recommended
- **Volume Estimate**: ~1KB per record, 100-1000 lookups/day typical
- **Indexes**: ip_address, created_at DESC, threat_score DESC

#### url_lookups
- **Purpose**: Store URL scan history
- **Retention**: 30 days recommended
- **Volume Estimate**: ~2KB per record (larger results)
- **Indexes**: created_at DESC

#### case_notes
- **Purpose**: Investigation tracking and IOC management
- **Retention**: Indefinite (user data)
- **Volume Estimate**: ~5KB per case average
- **Indexes**: status, priority, created_at DESC

#### user_api_keys
- **Purpose**: Store per-user API keys for external services
- **Security**: Should be encrypted at rest
- **Indexes**: user_id, service (composite unique)

#### usage_stats
- **Purpose**: Track lookup counts for analytics
- **Retention**: 90 days recommended
- **Indexes**: user_id, date DESC

#### api_cache
- **Purpose**: Cache external API responses
- **TTL**: 6 hours
- **Volume**: Can grow large; implement cleanup job
- **Indexes**: cache_key (unique), expires_at

### Storage Estimates

| Usage Level | Daily Lookups | Monthly Storage | Annual Storage |
|-------------|---------------|-----------------|----------------|
| Light | 50 | ~50 MB | ~600 MB |
| Medium | 500 | ~500 MB | ~6 GB |
| Heavy | 5,000 | ~5 GB | ~60 GB |

*Note: With 30-day retention and cache cleanup, actual storage is much lower.*

### PostgreSQL Requirements

- **Version**: 14+ recommended
- **Extensions Required**:
  - `uuid-ossp` (UUID generation)
  - `pgcrypto` (optional, for encryption)
- **Connection Pooling**: Recommended for serverless (PgBouncer)
- **Row Level Security**: Enabled on all tables

---

## 5. External API Dependencies

### API Integration Matrix

| Service | Required? | Free Tier | Rate Limit (Free) | Data Provided |
|---------|-----------|-----------|-------------------|---------------|
| IP-API | No key needed | Yes | 45/min | Geolocation |
| ProxyCheck.io | Optional | Yes | 100/day | VPN/Proxy detection |
| VirusTotal | Recommended | Yes | 4/min | Multi-engine scans |
| AbuseIPDB | Recommended | Yes | 1000/day | IP reputation |
| AlienVault OTX | Optional | Yes | Generous | Threat pulses |
| Shodan | Optional | Yes | 100/month | Device info |
| IPQualityScore | Optional | Yes | 200/day | Fraud scoring |
| ThreatFox | No key needed | Yes | Unlimited | IOC database |
| URLhaus | No key needed | Yes | Unlimited | Malware URLs |
| GreyNoise | Recommended | Community | 15,000/month | Scanner detection |
| Spamhaus | No key needed | Yes | DNS-based | Blocklists |
| URLScan.io | Optional | Yes | 200/day | URL sandbox |
| Cloudflare DNS | No key needed | Yes | Unlimited | DNS resolution |
| NVD (CVE) | No key needed | Yes | 5/30s | CVE data |

### API Key Priority

**Must Have** (significantly improves functionality):
1. VirusTotal - Core malware detection
2. AbuseIPDB - IP reputation
3. GreyNoise - Scanner detection

**Nice to Have** (enhanced data):
4. Shodan - Device/port info
5. IPQualityScore - Fraud detection
6. URLScan.io - URL sandboxing

**Optional** (free without keys):
- IP-API, ThreatFox, URLhaus, Spamhaus, NVD

### Monthly API Call Estimates

| Usage Level | IP Lookups | URL Scans | Total API Calls* |
|-------------|------------|-----------|------------------|
| Light | 500 | 100 | ~8,000 |
| Medium | 2,500 | 500 | ~40,000 |
| Heavy | 10,000 | 2,000 | ~160,000 |

*Assumes 13 sources per IP lookup, 3 per URL scan, with 6-hour caching reducing actual calls by ~60%.*

---

## 6. Self-Hosting Options

### Option A: Full Self-Host (AWS Lightsail/EC2)

**Architecture**:
```
┌─────────────────────────────────────────┐
│            AWS Lightsail/EC2            │
│  ┌───────────────────────────────────┐  │
│  │  Nginx (reverse proxy + static)   │  │
│  │  - Serves React SPA               │  │
│  │  - Proxies to Node/Deno           │  │
│  └─────────────────┬─────────────────┘  │
│                    │                    │
│  ┌─────────────────┴─────────────────┐  │
│  │  Node.js / Deno Server            │  │
│  │  - API endpoints                  │  │
│  │  - Threat intel aggregation       │  │
│  └─────────────────┬─────────────────┘  │
│                    │                    │
│  ┌─────────────────┴─────────────────┐  │
│  │  PostgreSQL (RDS or local)        │  │
│  │  - All application data           │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**Requirements**:
- Lightsail: $5-20/mo (1-2 vCPU, 1-4GB RAM)
- Or EC2 t3.small: ~$15/mo
- RDS PostgreSQL: ~$15/mo (or local PostgreSQL)
- Domain + SSL certificate

**Pros**:
- Full control
- All data in one place
- No vendor lock-in
- Predictable costs

**Cons**:
- You manage everything (updates, backups, security)
- Need to port Edge Function to Node.js/Express
- Auth system needs replacement (Passport.js, Auth0, etc.)

**Migration Effort**: Medium-High (rewrite Edge Function, implement auth)

---

### Option B: Hybrid (AWS Amplify + Supabase)

**Architecture**:
```
┌─────────────────────┐     ┌─────────────────────┐
│    AWS Amplify      │     │      Supabase       │
│  ┌───────────────┐  │     │  ┌───────────────┐  │
│  │ React SPA     │  │────▶│  │ PostgreSQL    │  │
│  │ (Static Host) │  │     │  │ Edge Functions│  │
│  └───────────────┘  │     │  │ Auth (OAuth)  │  │
└─────────────────────┘     │  └───────────────┘  │
                            └─────────────────────┘
```

**Requirements**:
- Amplify Hosting: Free tier covers most usage
- Supabase: Free tier or $25/mo Pro

**Pros**:
- Easy to set up (connect repo, auto-deploy)
- No code changes needed
- Keep Supabase backend as-is
- Best of both worlds

**Cons**:
- Still dependent on Supabase
- Data split across providers

**Migration Effort**: Low (just move frontend)

---

### Option C: Full AWS (Amplify + Aurora + Lambda)

**Architecture**:
```
┌─────────────────────────────────────────────────┐
│                      AWS                         │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────┐ │
│  │   Amplify   │  │   Lambda    │  │  Aurora  │ │
│  │   (React)   │──│ (Functions) │──│  (PgSQL) │ │
│  └─────────────┘  └─────────────┘  └──────────┘ │
│                          │                       │
│  ┌─────────────────────────────────────────────┐│
│  │              Cognito (Auth)                  ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

**Requirements**:
- Amplify: Free tier
- Lambda: Free tier covers most usage
- Aurora Serverless v2: ~$30-50/mo minimum
- Cognito: Free tier (50k MAU)

**Pros**:
- Everything in AWS
- Enterprise-grade
- Great scalability
- Consolidated billing

**Cons**:
- Highest migration effort
- Aurora expensive at low scale
- Need to rewrite Edge Functions as Lambda
- Need to replace Supabase Auth with Cognito

**Migration Effort**: High (rewrite backend, new auth)

---

### Option D: Keep Supabase (Recommended for Now)

**Current Setup**:
```
┌─────────────────────────────────────────┐
│              Supabase                    │
│  ┌─────────────────────────────────────┐│
│  │  Everything managed                 ││
│  │  - PostgreSQL                       ││
│  │  - Edge Functions                   ││
│  │  - Auth                             ││
│  │  - Storage                          ││
│  └─────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

**Pricing**:
| Tier | Price | Includes |
|------|-------|----------|
| Free | $0 | 500MB DB, 1GB bandwidth, 50k auth users |
| Pro | $25/mo | 8GB DB, 250GB bandwidth, 100k auth users |
| Team | $599/mo | SOC2, priority support, SLA |

**Pros**:
- Already working
- No migration needed
- Good free tier
- Built-in everything

**Cons**:
- Vendor dependency
- Limited customization
- Data in their cloud

---

### Comparison Summary

| Option | Cost/mo | Effort | Control | Best For |
|--------|---------|--------|---------|----------|
| A. Lightsail | $20-50 | High | Full | Maximum control |
| B. Amplify+Supabase | $0-25 | Low | Medium | Easy win |
| C. Full AWS | $50-100 | High | Full | Enterprise/Scale |
| D. Supabase | $0-25 | None | Low | Current state |

**Recommendation**: Start with **Option B** (Amplify + Supabase) for easy deployment wins, then evaluate **Option A** or **C** when you need more control or hit scale limits.

---

## 7. Environment Configuration

### Frontend Environment Variables

```env
# Required - Supabase Connection
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...

# Note: No API keys in frontend - all handled server-side
```

### Edge Function Environment Variables (Secrets)

```env
# Database (auto-configured in Supabase)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...

# Threat Intelligence APIs (optional - user keys override)
VIRUSTOTAL_API_KEY=your-key-here
ABUSEIPDB_API_KEY=your-key-here
SHODAN_API_KEY=your-key-here
GREYNOISE_API_KEY=your-key-here
URLSCAN_API_KEY=your-key-here
ALIENVAULT_API_KEY=your-key-here
IPQUALITYSCORE_API_KEY=your-key-here
PROXYCHECK_API_KEY=your-key-here
```

### Self-Hosted Environment Variables

For full self-hosting, you'd need:

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/thamos6
DATABASE_SSL=true

# Auth (if using Passport.js/Auth0)
AUTH_GOOGLE_CLIENT_ID=...
AUTH_GOOGLE_CLIENT_SECRET=...
AUTH_MICROSOFT_CLIENT_ID=...
AUTH_MICROSOFT_CLIENT_SECRET=...
SESSION_SECRET=...

# Server
PORT=3000
NODE_ENV=production

# All threat intel API keys
VIRUSTOTAL_API_KEY=...
# ... etc
```

---

## 8. Security Considerations

### Current Security Model

| Layer | Protection |
|-------|------------|
| Auth | OAuth2 (Google/Microsoft) via Supabase |
| API Keys | Stored encrypted in user_api_keys table |
| Database | Row Level Security (RLS) on all tables |
| API Calls | Made server-side (Edge Function) |
| Frontend | No secrets exposed, anon key only |
| CORS | Configured for allowed origins |

### RLS Policies Summary

```sql
-- user_api_keys: Users can only access their own keys
USING (auth.uid() = user_id)

-- case_notes: Currently open (needs tightening for multi-user)
-- ip_lookups/url_lookups: Public read/write (shared history)
-- api_cache: Service role write, public read
-- usage_stats: Users see only their own stats
```

### Security Recommendations for Production

1. **Tighten RLS on case_notes** - Currently allows all authenticated users full access
2. **Add rate limiting** - Prevent abuse of threat intel endpoints
3. **Implement audit logging** - Track who queries what
4. **Encrypt API keys** - Use pgcrypto for at-rest encryption
5. **Add IP allowlisting** - For enterprise deployments
6. **Regular secret rotation** - Rotate API keys periodically

---

## 9. Scaling Considerations

### Current Limits

| Resource | Free Tier | Pro Tier | Notes |
|----------|-----------|----------|-------|
| Database | 500MB | 8GB | Sufficient for years |
| Edge Function | 500k invocations | 2M | ~16k/day |
| Bandwidth | 2GB | 250GB | Image-free app, very light |
| Auth Users | 50k MAU | 100k MAU | More than enough |

### Bottlenecks to Watch

1. **External API Rate Limits** - Most limiting factor
   - Solution: Better caching, user API keys

2. **Edge Function Cold Starts** - ~100-500ms
   - Solution: Keep-warm pings or move to always-on

3. **Database Connections** - Serverless can exhaust pool
   - Solution: Connection pooling (PgBouncer)

4. **Cache Table Growth** - Can grow unbounded
   - Solution: Scheduled cleanup job

### Scaling Path

```
Stage 1: Current (0-1000 users)
├── Supabase Free/Pro tier
├── Shared API keys
└── Basic caching

Stage 2: Growth (1000-10000 users)
├── Supabase Pro/Team
├── Per-user API keys required
├── Redis cache layer
└── Rate limiting per user

Stage 3: Enterprise (10000+ users)
├── Self-hosted or dedicated
├── Multiple Edge Function replicas
├── Read replicas for DB
├── CDN for static assets
└── SLA guarantees
```

---

## 10. Migration Path

### If Moving to Self-Hosted

#### Phase 1: Export Data
```sql
-- Export all tables to CSV/JSON
COPY ip_lookups TO '/tmp/ip_lookups.csv' CSV HEADER;
COPY url_lookups TO '/tmp/url_lookups.csv' CSV HEADER;
COPY case_notes TO '/tmp/case_notes.csv' CSV HEADER;
-- etc.
```

#### Phase 2: Port Edge Function
The Edge Function (`supabase/functions/threat-intel/index.ts`) needs conversion:

```
Current (Deno)              Target (Node.js)
─────────────────           ─────────────────
Deno.serve()          →     Express.js server
Deno.env.get()        →     process.env
fetch (native)        →     fetch (node 18+) or axios
```

Estimated effort: 2-3 days for experienced developer

#### Phase 3: Replace Auth
Options:
- **Auth0**: Drop-in replacement, similar OAuth flow
- **Passport.js**: More control, more code
- **AWS Cognito**: If going full AWS
- **Clerk**: Modern, easy integration

#### Phase 4: Database Migration
```bash
# Export from Supabase
pg_dump -h db.xxx.supabase.co -U postgres -d postgres > backup.sql

# Import to new PostgreSQL
psql -h new-host -U user -d thamos6 < backup.sql
```

#### Phase 5: Update Frontend Config
```env
# Old
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx

# New (self-hosted)
VITE_API_URL=https://api.yourserver.com
VITE_AUTH_PROVIDER=auth0  # or whatever
```

---

## Appendix A: File Structure Reference

```
thamos6/
├── src/
│   ├── pages/
│   │   ├── IPLookup.tsx        # IP reputation (13 sources)
│   │   ├── URLScanner.tsx      # URL malware scanning
│   │   ├── DomainIntel.tsx     # Domain/DNS analysis
│   │   ├── HashLookup.tsx      # File hash checks
│   │   ├── BulkLookup.tsx      # Multi-IP analysis
│   │   ├── IOCExtractor.tsx    # Extract IOCs from text
│   │   ├── EmailAnalyzer.tsx   # Email header parsing
│   │   ├── DefangTool.tsx      # Defang/refang IOCs
│   │   ├── DecoderTool.tsx     # Encode/decode payloads
│   │   ├── CVELookup.tsx       # Vulnerability search
│   │   ├── CaseNotes.tsx       # Investigation tracking
│   │   ├── History.tsx         # Lookup history
│   │   └── Settings.tsx        # API key management
│   ├── components/
│   │   ├── Layout.tsx          # Nav, auth UI, page shell
│   │   ├── ThreatScore.tsx     # Score visualization
│   │   └── SourceCard.tsx      # Individual source results
│   ├── contexts/
│   │   └── AuthContext.tsx     # OAuth state management
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client singleton
│   │   └── threatIntel.ts      # API call helpers
│   ├── types/
│   │   └── index.ts            # TypeScript interfaces
│   ├── App.tsx                 # Route definitions
│   ├── main.tsx                # React entry point
│   └── index.css               # Tailwind imports
├── supabase/
│   ├── migrations/
│   │   ├── 20251229024031_create_threat_intel_schema.sql
│   │   └── 20251229041832_create_case_notes_schema.sql
│   └── functions/
│       └── threat-intel/
│           └── index.ts        # Main API function (614 lines)
├── public/                     # Static assets
├── dist/                       # Production build output
├── .env                        # Environment variables
├── package.json                # Dependencies
├── vite.config.ts              # Vite configuration
├── tailwind.config.js          # Tailwind configuration
└── tsconfig.json               # TypeScript configuration
```

---

## Appendix B: Database Schema SQL

```sql
-- ip_lookups: Store IP reputation lookup history
CREATE TABLE ip_lookups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  results JSONB NOT NULL DEFAULT '{}',
  threat_score INTEGER DEFAULT 0,
  sources_checked TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- url_lookups: Store URL scan history
CREATE TABLE url_lookups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  results JSONB NOT NULL DEFAULT '{}',
  is_malicious BOOLEAN DEFAULT FALSE,
  threat_types TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- case_notes: Investigation tracking
CREATE TABLE case_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'open',
  priority TEXT DEFAULT 'medium',
  iocs JSONB DEFAULT '[]',
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- user_api_keys: Per-user API key storage
CREATE TABLE user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  service TEXT NOT NULL,
  api_key TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, service)
);

-- usage_stats: Analytics tracking
CREATE TABLE usage_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  date DATE DEFAULT CURRENT_DATE,
  lookup_type TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- api_cache: Response caching
CREATE TABLE api_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL,
  query TEXT NOT NULL,
  response JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Appendix C: External API Documentation Links

| Service | Docs | Sign Up |
|---------|------|---------|
| VirusTotal | https://docs.virustotal.com/reference | https://www.virustotal.com/gui/join-us |
| AbuseIPDB | https://docs.abuseipdb.com/ | https://www.abuseipdb.com/register |
| Shodan | https://developer.shodan.io/ | https://account.shodan.io/register |
| GreyNoise | https://docs.greynoise.io/ | https://viz.greynoise.io/signup |
| URLScan.io | https://urlscan.io/docs/api/ | https://urlscan.io/user/signup |
| AlienVault OTX | https://otx.alienvault.com/api | https://otx.alienvault.com/accounts/signup |
| IPQualityScore | https://www.ipqualityscore.com/documentation | https://www.ipqualityscore.com/create-account |
| NVD (CVE) | https://nvd.nist.gov/developers | No key needed |

---

*End of Architecture Document*
