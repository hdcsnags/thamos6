# Smart IOC Platform - Architecture V2

## Overview
This document details the current architecture after the unified scanner migration. It shows what changed, where changes were made, how each scan type works, and what's broken vs working.

---

## Major Changes from V1

### 1. Unified Scanner Architecture
**Old Approach (V1):**
- Separate pages: `IPLookup.tsx`, `URLScanner.tsx`, `HashLookup.tsx`, `DomainIntel.tsx`
- Each page had its own input form, loading states, and result display
- Direct inline results on the same page

**New Approach (V2):**
- Single entry point: `Scanner.tsx` (unified search interface)
- Shared result pages: `results/IPResult.tsx`, `results/URLResult.tsx`, etc.
- Route-based navigation: `/scanner?type=ip&value=8.8.8.8`
- Reusable components: `ActionsBar.tsx`, `KeyFacts.tsx`, `SourceStatus.tsx`, etc.

### 2. File Structure Changes

#### New Files Created:
```
src/pages/Scanner.tsx                    # NEW: Unified scanner entry point
src/pages/results/IPResult.tsx           # NEW: IP lookup results display
src/pages/results/URLResult.tsx          # NEW: URL scan results display
src/pages/results/HashResult.tsx         # NEW: Hash lookup results display
src/pages/results/DomainResult.tsx       # NEW: Domain intel results display
src/pages/results/ExtensionResult.tsx    # NEW: Extension analysis results

src/components/scanner/ActionsBar.tsx    # NEW: Copy/Export/Save actions
src/components/scanner/KeyFacts.tsx      # NEW: Key metrics display
src/components/scanner/SourceStatus.tsx  # NEW: Source loading indicators
src/components/scanner/EvidenceCard.tsx  # NEW: Evidence display
src/components/scanner/VarianceCard.tsx  # NEW: Cross-source variance
src/components/scanner/RawJsonCollapse.tsx # NEW: Raw JSON viewer
```

#### Files Modified:
```
src/App.tsx                              # MODIFIED: Added new routes
src/pages/IPLookup.tsx                   # KEPT: Still functional standalone
src/pages/URLScanner.tsx                 # KEPT: Still functional standalone
src/pages/HashLookup.tsx                 # KEPT: Still functional standalone
src/pages/DomainIntel.tsx                # KEPT: Still functional standalone
```

#### Files That Should Be Updated (Not Done Yet):
```
src/pages/IPLookup.tsx                   # Should redirect to Scanner
src/pages/URLScanner.tsx                 # Should redirect to Scanner
src/pages/HashLookup.tsx                 # Should redirect to Scanner
src/pages/DomainIntel.tsx                # Should redirect to Scanner
```

---

## Data Flow Architecture

### IP Lookup Flow

#### 1. Entry Point
```
User Input → Scanner.tsx (detects IP) → Route to /scanner?type=ip&value=1.1.1.1
```

#### 2. API Call
```typescript
// File: src/pages/results/IPResult.tsx
const data = await lookupIP(ip);

// File: src/lib/threatIntel.ts
export async function lookupIP(ip: string): Promise<IPLookupResult>
```

#### 3. Edge Function Endpoint
```
POST ${SUPABASE_URL}/functions/v1/threat-intel/ip
Body: { ip: "1.1.1.1" }
```

#### 4. Expected Response Structure
```typescript
{
  results: {                           // OR "sources" (both are checked now)
    abuseipdb: {
      malicious: boolean,
      confidence: number,
      data: { ... }
    },
    proxycheck: { ... },
    ipinfo: { ... },
    // ... other sources
  },
  enrichment: {
    country: string,
    city: string,
    org: string,
    asn: string,
    isp: string,
    isVPN: boolean,
    isTor: boolean,
    isProxy: boolean,
    isHosting: boolean,
    vpnService?: string
  },
  overallThreatScore: number,
  isMalicious: boolean,
  confidence: number,
  threatTypes: string[]
}
```

#### 5. Display Components
```
IPResult.tsx renders:
- ActionsBar (copy, export, save)
- KeyFacts (country, org, ASN, ISP, VPN/TOR)
- ThreatScore (overall score)
- SourceStatus (loading indicators)
- SourceCard (for each source with data)
- RawJsonCollapse (full JSON)
```

---

### URL Scan Flow

#### 1. Entry Point
```
User Input → Scanner.tsx (detects URL) → Route to /scanner?type=url&value=https://example.com
```

#### 2. API Call
```typescript
// File: src/pages/results/URLResult.tsx
const data = await scanURL(url);

// File: src/lib/threatIntel.ts
export async function scanURL(url: string): Promise<URLLookupResult>
```

#### 3. Edge Function Endpoint
```
POST ${SUPABASE_URL}/functions/v1/threat-intel/url
Body: { url: "https://example.com" }
```

#### 4. Expected Response Structure
```typescript
{
  results: {
    virustotal: {
      malicious: boolean,
      confidence: number,
      details: { ... }
    },
    urlscan: { ... },
    urlhaus: { ... }
  },
  isMalicious: boolean,
  overallThreatScore: number,
  confidence: number,
  threatTypes: string[]
}
```

#### 5. Display Components
```
URLResult.tsx renders:
- ActionsBar
- KeyFacts (URL, malicious status, threat types)
- ThreatScore
- SourceStatus
- SourceCard (for each source)
- RawJsonCollapse
```

---

### Hash Lookup Flow

#### 1. Entry Point
```
User Input → Scanner.tsx (detects hash) → Route to /scanner?type=hash&value=abc123...
```

#### 2. API Call
```typescript
// File: src/pages/results/HashResult.tsx
const data = await lookupHash(hash);

// File: src/lib/threatIntel.ts
export async function lookupHash(hash: string): Promise<HashLookupResult>
```

#### 3. Edge Function Endpoint
```
POST ${SUPABASE_URL}/functions/v1/threat-intel/hash
Body: { hash: "abc123..." }
```

#### 4. Expected Response Structure
```typescript
{
  results: {
    virustotal: {
      malicious: boolean,
      confidence: number,
      details: { ... }
    },
    malwarebazaar: { ... },
    hybridanalysis: { ... }
  },
  isMalicious: boolean,
  overallThreatScore: number,
  confidence: number,
  threatTypes: string[],
  fileInfo?: {
    md5: string,
    sha1: string,
    sha256: string,
    fileType: string,
    fileSize: number
  }
}
```

#### 5. Display Components
```
HashResult.tsx renders:
- ActionsBar
- KeyFacts (hash type, malicious status, file info)
- ThreatScore
- SourceStatus
- SourceCard (for each source)
- RawJsonCollapse
```

---

### Domain Lookup Flow

#### 1. Entry Point
```
User Input → Scanner.tsx (detects domain) → Route to /scanner?type=domain&value=example.com
```

#### 2. API Call
```typescript
// File: src/pages/results/DomainResult.tsx
const data = await lookupDomain(domain);

// File: src/lib/threatIntel.ts
export async function lookupDomain(domain: string): Promise<DomainLookupResult>
```

#### 3. Edge Function Endpoint
```
POST ${SUPABASE_URL}/functions/v1/threat-intel/domain
Body: { domain: "example.com" }
```

#### 4. Expected Response Structure
```typescript
{
  results: {
    virustotal: {
      malicious: boolean,
      confidence: number,
      details: { ... }
    },
    urlhaus: { ... },
    // ... other sources
  },
  enrichment: {
    registrar: string,
    createdDate: string,
    expiresDate: string,
    nameservers: string[],
    // ... WHOIS data
  },
  isMalicious: boolean,
  overallThreatScore: number,
  confidence: number,
  threatTypes: string[]
}
```

#### 5. Display Components
```
DomainResult.tsx renders:
- ActionsBar
- KeyFacts (registrar, creation date, nameservers)
- ThreatScore
- SourceStatus
- SourceCard (for each source)
- RawJsonCollapse
```

---

## Edge Function Endpoints

### Current Implementation
```
File: supabase/functions/threat-intel/index.ts
```

#### Endpoints Available:
1. `POST /threat-intel/ip` - IP lookup
2. `POST /threat-intel/url` - URL scan
3. `POST /threat-intel/hash` - Hash lookup
4. `POST /threat-intel/domain` - Domain lookup
5. `GET /threat-intel/config` - Get configured sources
6. `POST /threat-intel/bulk` - Bulk IP lookup

### What Each Endpoint Does:

#### IP Endpoint
```typescript
Route: POST /ip
Body: { ip: string }

Process:
1. Validates IP format
2. Checks internal databases (TOR list, IP2Proxy, threat_intel_iocs)
3. Calls external APIs (AbuseIPDB, ProxyCheck, IPInfo, etc.)
4. Aggregates results
5. Calculates threat score
6. Returns unified response

Sources Used:
- AbuseIPDB (requires API key)
- ProxyCheck (requires API key)
- IPInfo (requires API key)
- Internal TOR list
- Internal IP2Proxy database
- Internal threat_intel_iocs table
```

#### Hash Endpoint
```typescript
Route: POST /hash
Body: { hash: string }

Process:
1. Validates hash format (MD5, SHA1, SHA256)
2. Checks internal databases
3. Calls external APIs (VirusTotal, MalwareBazaar, Hybrid Analysis)
4. Aggregates results
5. Calculates threat score
6. Returns unified response

Sources Used:
- VirusTotal (requires API key)
- MalwareBazaar (free)
- Hybrid Analysis (requires API key)
- Internal threat_intel_iocs table
```

#### URL Endpoint
```typescript
Route: POST /url
Body: { url: string }

Process:
1. Validates URL format
2. Extracts domain for additional checks
3. Calls external APIs (VirusTotal, URLhaus, URLScan)
4. Aggregates results
5. Calculates threat score
6. Returns unified response

Sources Used:
- VirusTotal (requires API key)
- URLhaus (free)
- URLScan (free/API key)
- Internal threat_intel_iocs table
```

#### Domain Endpoint
```typescript
Route: POST /domain
Body: { domain: string }

Process:
1. Validates domain format
2. Performs WHOIS lookup
3. Calls external APIs (VirusTotal, URLhaus, etc.)
4. Aggregates results
5. Calculates threat score
6. Returns unified response

Sources Used:
- VirusTotal (requires API key)
- URLhaus (free)
- WHOIS data
- Internal threat_intel_iocs table
```

---

## Known Issues & Status

### ✅ Working
1. Scanner input detection (IP, URL, hash, domain)
2. Routing to result pages
3. Basic layout and UI components
4. Error handling for null results (fixed)
5. Edge function structure exists
6. Database schema exists

### ❌ Broken / Not Working

#### 1. Hash Lookup Completely Non-Functional
**Status:** Shows "Coming Soon" placeholder
**Location:** `src/pages/results/HashResult.tsx`
**Issue:** The page is just a placeholder, no actual implementation

**What Needs to Happen:**
- Remove placeholder content
- Implement actual hash lookup logic similar to IPResult.tsx
- Display file information (MD5, SHA1, SHA256, file type, size)
- Show VirusTotal, MalwareBazaar, Hybrid Analysis results
- Add proper error handling

#### 2. Domain Lookup May Not Work
**Status:** Unknown, likely broken
**Location:** `src/pages/results/DomainResult.tsx`
**Issue:** Similar to hash lookup, may be placeholder

**What Needs to Happen:**
- Verify if `lookupDomain()` function exists in `threatIntel.ts`
- Implement domain-specific enrichment display
- Show WHOIS data
- Display DNS records
- Show threat intelligence from all sources

#### 3. API Endpoints May Not Be Fully Wired
**Status:** Edge function exists but may not have all endpoints
**Location:** `supabase/functions/threat-intel/index.ts`

**What Needs to Happen:**
- Verify all 4 endpoints are implemented: `/ip`, `/url`, `/hash`, `/domain`
- Check if response structures match what the frontend expects
- Ensure proper error handling
- Add missing API integrations

#### 4. Source Names Don't Match
**Status:** Possible mismatch between frontend and backend
**Issue:** Frontend expects `abuseipdb`, backend might return `AbuseIPDB`

**What Needs to Happen:**
- Standardize source naming (lowercase, no spaces)
- Update both frontend and backend to match
- Create a mapping function if needed

#### 5. Old Pages Not Redirecting
**Status:** Old individual lookup pages still exist and accessible
**Location:** `src/pages/IPLookup.tsx`, etc.

**What Needs to Happen:**
- Update old pages to redirect to new scanner
- Or remove them entirely
- Update navigation/menu to point to scanner only

---

## Component Hierarchy

```
App.tsx
├── Layout.tsx
│   ├── ThemeToggle.tsx
│   └── Navigation Menu
│
├── Scanner.tsx (NEW)
│   ├── Auto-detects IOC type
│   ├── Routes to appropriate result page
│   └── Shows recent history
│
├── results/IPResult.tsx (NEW)
│   ├── ActionsBar
│   ├── KeyFacts
│   ├── ThreatScore
│   ├── SourceStatus
│   ├── SourceCard (multiple)
│   └── RawJsonCollapse
│
├── results/URLResult.tsx (NEW)
│   └── (same structure as IPResult)
│
├── results/HashResult.tsx (NEW - BROKEN)
│   └── Currently just placeholder
│
├── results/DomainResult.tsx (NEW - MAY BE BROKEN)
│   └── May be placeholder or incomplete
│
└── results/ExtensionResult.tsx (NEW)
    └── Extension analysis display
```

---

## API Integration Points

### Frontend → Edge Function Communication

```typescript
// File: src/lib/threatIntel.ts

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/threat-intel`;

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  };
}

// IP Lookup
export async function lookupIP(ip: string): Promise<IPLookupResult> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${EDGE_FUNCTION_URL}/ip`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ip }),
  });
  if (!response.ok) throw new Error(`Failed to lookup IP: ${response.statusText}`);
  return response.json();
}

// Hash Lookup
export async function lookupHash(hash: string): Promise<HashLookupResult> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${EDGE_FUNCTION_URL}/hash`, {
    method: "POST",
    headers,
    body: JSON.stringify({ hash }),
  });
  if (!response.ok) throw new Error(`Failed to lookup hash: ${response.statusText}`);
  return response.json();
}

// URL Scan
export async function scanURL(url: string): Promise<URLLookupResult> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${EDGE_FUNCTION_URL}/url`, {
    method: "POST",
    headers,
    body: JSON.stringify({ url }),
  });
  if (!response.ok) throw new Error(`Failed to scan URL: ${response.statusText}`);
  return response.json();
}

// Domain Lookup (MAY NOT EXIST)
export async function lookupDomain(domain: string): Promise<DomainLookupResult> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${EDGE_FUNCTION_URL}/domain`, {
    method: "POST",
    headers,
    body: JSON.stringify({ domain }),
  });
  if (!response.ok) throw new Error(`Failed to lookup domain: ${response.statusText}`);
  return response.json();
}
```

---

## Type Definitions

```typescript
// File: src/types/index.ts

export interface SourceResult {
  malicious: boolean;
  confidence: number;
  data?: any;
  details?: any;
  error?: string;
}

export interface IPLookupResult {
  results: Record<string, SourceResult>;  // or "sources"
  enrichment: {
    country?: string;
    city?: string;
    region?: string;
    org?: string;
    asn?: string;
    isp?: string;
    isVPN?: boolean;
    isTor?: boolean;
    isProxy?: boolean;
    isHosting?: boolean;
    vpnService?: string;
  };
  overallThreatScore: number;
  isMalicious: boolean;
  confidence: number;
  threatTypes: string[];
}

export interface URLLookupResult {
  results: Record<string, SourceResult>;
  isMalicious: boolean;
  overallThreatScore: number;
  confidence: number;
  threatTypes: string[];
}

export interface HashLookupResult {
  results: Record<string, SourceResult>;
  isMalicious: boolean;
  overallThreatScore: number;
  confidence: number;
  threatTypes: string[];
  fileInfo?: {
    md5: string;
    sha1: string;
    sha256: string;
    fileType: string;
    fileSize: number;
  };
}

export interface DomainLookupResult {
  results: Record<string, SourceResult>;
  enrichment: {
    registrar?: string;
    createdDate?: string;
    expiresDate?: string;
    nameservers?: string[];
    // WHOIS data
  };
  isMalicious: boolean;
  overallThreatScore: number;
  confidence: number;
  threatTypes: string[];
}
```

---

## What Was Working Before (V1)

Based on your comment that "I know I fixed and had this working before", the old system likely had:

1. **Hash Lookup (`src/pages/HashLookup.tsx`)**
   - Full implementation with VirusTotal integration
   - File hash analysis working
   - Proper display of file information
   - **This got replaced with placeholder in V2**

2. **Individual API Calls**
   - Each page made its own API calls
   - Results displayed inline on the same page
   - No routing complexity
   - **These still exist but aren't being used by new scanner**

3. **Working Endpoints**
   - The edge functions were properly wired
   - Hash endpoint specifically was working
   - All sources returning data correctly
   - **May have been broken during refactor**

---

## Migration Strategy to Fix

### Step 1: Restore Hash Lookup
1. Copy working logic from old `HashLookup.tsx` to new `HashResult.tsx`
2. Adapt to new component structure (use ActionsBar, KeyFacts, etc.)
3. Keep the working API call logic

### Step 2: Verify All Endpoints
1. Check `threat-intel/index.ts` has all 4 endpoints
2. Test each endpoint independently
3. Verify response structures match frontend expectations
4. Fix any mismatches

### Step 3: Standardize Data Structures
1. Ensure all endpoints return consistent structure
2. Use either `results` or `sources` (not both)
3. Update frontend to handle either format (already done for IP/URL)

### Step 4: Fix Domain Lookup
1. Implement domain-specific features
2. Add WHOIS display
3. Add DNS records display

### Step 5: Update Old Pages
1. Add redirects from old pages to scanner
2. Or keep them as alternate views
3. Update navigation menu

---

## Files to Review for OpenAI Analysis

### Frontend Files:
1. `src/pages/Scanner.tsx` - Entry point
2. `src/pages/results/IPResult.tsx` - Working example
3. `src/pages/results/URLResult.tsx` - Working example
4. `src/pages/results/HashResult.tsx` - BROKEN, needs fixing
5. `src/pages/results/DomainResult.tsx` - May be broken
6. `src/lib/threatIntel.ts` - All API calls
7. `src/types/index.ts` - Type definitions

### Backend Files:
1. `supabase/functions/threat-intel/index.ts` - Main edge function
2. Any related helper functions

### Old Working Files (for comparison):
1. Old `src/pages/HashLookup.tsx` (if it still exists)
2. Old `src/pages/DomainIntel.tsx` (if different from new one)

---

## Summary of Changes

### What Changed:
- Unified scanner interface replacing individual pages
- Route-based result display instead of inline
- Shared reusable components
- Centralized API call functions

### What Broke:
- Hash lookup completely non-functional (became placeholder)
- Domain lookup may be incomplete
- Possible API endpoint mismatches
- Source name inconsistencies

### What Still Works:
- IP lookup basic functionality
- URL scan basic functionality
- Scanner input detection and routing
- Database schema and edge function structure

### What Needs Fixing:
1. Hash lookup implementation (HIGH PRIORITY)
2. Domain lookup verification (MEDIUM PRIORITY)
3. API endpoint wiring verification (HIGH PRIORITY)
4. Source name standardization (MEDIUM PRIORITY)
5. Old page redirects/cleanup (LOW PRIORITY)

---

## Next Steps

1. **Provide this document + old working code to OpenAI**
2. **OpenAI analyzes differences and identifies specific fixes**
3. **Implement fixes in priority order**
4. **Test each scanner type end-to-end**
5. **Verify all sources returning data correctly**
6. **Clean up any remaining issues**

---

## Additional Context

### CSP Error
The Cloudflare beacon error is unrelated to functionality - just a Content Security Policy warning that can be ignored or fixed with CSP headers.

### Error Pattern
The `Cannot read properties of undefined (reading 'abuseipdb')` error was caused by:
- Trying to access `result.results.abuseipdb` before checking if result exists
- Not handling both `results` and `sources` key variations
- **This has been fixed for IP and URL, but needs same fix for Hash/Domain**
