# Quick Comparison: Old vs New Implementation

## Hash Lookup - THE KEY ISSUE

### Old Working Implementation (`src/pages/HashLookup.tsx`)
✅ **WORKS - COMPLETE IMPLEMENTATION**

```typescript
// Calls API
const data = await lookupHash(trimmedHash);

// Response structure it expects:
{
  sources: {
    virustotal: { found, malicious, details },
    malwarebazaar: { found, malicious, details },
    hybrid_analysis: { found, malicious, details },
    alienvault: { found, malicious, details }
  },
  isMalicious: boolean,
  checkedAt: string
}

// Displays:
- Hash type detection (MD5, SHA1, SHA256)
- All source results with found/malicious status
- Detailed information from each source
- External lookup links
- Full JSON export
```

### New Broken Implementation (`src/pages/results/HashResult.tsx`)
❌ **BROKEN - PLACEHOLDER ONLY**

```typescript
// Does NOT call API
// Just shows "Coming soon" message
// No actual implementation

// What it needs:
1. Call lookupHash(hash) from threatIntel.ts
2. Handle loading/error states
3. Display results from all sources
4. Use the new component structure (ActionsBar, KeyFacts, SourceCard)
```

---

## Backend API Status

### Edge Function Hash Endpoint
✅ **WORKS - FULLY IMPLEMENTED**

Location: `supabase/functions/threat-intel/index.ts:1772`

```typescript
POST /threat-intel/hash
Body: { hash: "abc123..." }

// Sources it checks:
- MalwareBazaar (free)
- VirusTotal (requires API key)
- Hybrid Analysis (requires API key)
- AlienVault OTX (requires API key)

// Response structure:
{
  hash: string,
  isMalicious: boolean,
  overallThreatScore: number,
  maxThreatScore: number,
  sources: {
    malwarebazaar: { found, malicious, details, error? },
    virustotal_hash: { found, malicious, details, error? },
    hybrid_analysis: { found, malicious, details, error? },
    alienvault: { found, malicious, details, error? }
  },
  detections: {
    virustotal: { malicious, suspicious, harmless, undetected, total },
    malwarebazaar: { signature, file_type, file_name, first_seen, tags },
    hybrid_analysis: { verdict, threat_score, av_detect, vx_family, submit_name }
  },
  checkedAt: string,
  tier: string,
  sourcesAvailable: string[]
}
```

---

## What Happened During Migration

### The Problem
1. **Old scanner pages** (IPLookup, URLScanner, HashLookup, etc.) had full working implementations
2. **During refactor**, new result pages were created (IPResult, URLResult, HashResult, etc.)
3. **IP and URL** got properly migrated - they call the API and display results
4. **Hash and potentially Domain** got left as placeholders - they DON'T call the API

### The Evidence
Compare line counts:

```
OLD HashLookup.tsx:     323 lines - FULL IMPLEMENTATION
NEW HashResult.tsx:      93 lines - PLACEHOLDER ONLY

OLD IPLookup.tsx:       ~300 lines - FULL IMPLEMENTATION
NEW IPResult.tsx:       ~300 lines - FULL IMPLEMENTATION (properly migrated)
```

---

## Data Structure Mismatch Issues

### IP Lookup
**Issue:** Backend returns `sources`, frontend expected `results`
**Status:** ✅ FIXED (now handles both)

```typescript
// Fixed in IPResult.tsx line 36:
const resultsData = data.results || data.sources || {};
```

### URL Scanner
**Issue:** Same as IP - key name mismatch
**Status:** ✅ FIXED (now handles both)

### Hash Lookup
**Issue:** Not implemented at all
**Status:** ❌ NEEDS FIXING

**Backend returns:**
```json
{
  "sources": {
    "malwarebazaar": { ... },
    "virustotal_hash": { ... }
  }
}
```

**Old frontend expects (and works with):**
```json
{
  "sources": {
    "malwarebazaar": { ... },
    "virustotal": { ... }  // NOTE: Different key name!
  }
}
```

**Mismatch:**
- Backend uses `virustotal_hash`, `hybrid_analysis`, etc.
- Old frontend expects `virustotal`, `hybridanalysis`, etc.

---

## Source Name Standardization Issues

### Current Inconsistencies

**Backend naming:**
- `virustotal_hash` (for hash lookups)
- `virustotal` (for IP lookups)
- `urlscan`
- `hybrid_analysis`
- `malwarebazaar`

**Frontend expects:**
- `virustotal` (consistent across all)
- `urlscan`
- `hybridanalysis` (no underscore!)
- `malwarebazaar`

**Display names (from getSourceDisplayName):**
- `"VirusTotal"`
- `"URLScan"`
- `"Hybrid Analysis"` (with space!)
- `"MalwareBazaar"`

### The Fix Needed
Either:
1. Backend standardizes to lowercase, no underscores
2. Frontend adds mapping for all variations
3. Create a unified source key mapping file used by both

---

## Complete Fix Checklist

### 1. Hash Lookup (HIGH PRIORITY)
- [ ] Copy working logic from `HashLookup.tsx` to `HashResult.tsx`
- [ ] Adapt to new component structure:
  - [ ] Use ActionsBar for copy/export/save
  - [ ] Use KeyFacts for hash type, malicious status
  - [ ] Use ThreatScore component
  - [ ] Use SourceStatus for loading states
  - [ ] Use SourceCard for each source result
  - [ ] Use RawJsonCollapse for full JSON
- [ ] Handle source name mismatches (virustotal_hash vs virustotal)
- [ ] Test with real API calls
- [ ] Verify all 4 sources display correctly

### 2. Data Structure Consistency (MEDIUM PRIORITY)
- [ ] Verify IP endpoint response matches what frontend expects
- [ ] Verify URL endpoint response matches what frontend expects
- [ ] Verify hash endpoint response matches what frontend expects
- [ ] Add fallback handling for `results` vs `sources` key in all result pages
- [ ] Test with actual API responses

### 3. Source Name Mapping (MEDIUM PRIORITY)
- [ ] Create source key normalization function
- [ ] Use it consistently in all result pages
- [ ] Update backend to use consistent keys OR
- [ ] Update frontend to handle all backend key variations

### 4. Domain Lookup (LOW PRIORITY - IF IT EXISTS)
- [ ] Check if DomainResult.tsx is implemented or placeholder
- [ ] If placeholder, implement like HashResult fix
- [ ] If implemented, verify it works

### 5. Old Pages (LOW PRIORITY)
- [ ] Decide: redirect to scanner or keep as alternate views?
- [ ] Update App.tsx routes accordingly
- [ ] Update navigation menu

---

## Files to Send to OpenAI for Analysis

### Core Files (MUST INCLUDE)
1. `src/pages/HashLookup.tsx` - OLD WORKING VERSION
2. `src/pages/results/HashResult.tsx` - NEW BROKEN VERSION
3. `src/lib/threatIntel.ts` - API call functions
4. `supabase/functions/threat-intel/index.ts` - Backend implementation (lines 1772-1865 for hash endpoint)
5. `src/types/index.ts` - Type definitions

### Supporting Files (SHOULD INCLUDE)
6. `src/pages/results/IPResult.tsx` - WORKING EXAMPLE of migrated page
7. `src/pages/Scanner.tsx` - Entry point
8. This document (`COMPARISON_SUMMARY.md`)
9. Main architecture doc (`ARCHITECTURE_V2.md`)

### Optional Context Files
10. `src/pages/DomainIntel.tsx` - If checking domain implementation
11. `src/pages/results/DomainResult.tsx` - If checking domain implementation

---

## Questions for OpenAI to Answer

1. **Why do source keys mismatch?**
   - Backend: `virustotal_hash`, `hybrid_analysis`
   - Frontend: `virustotal`, `hybridanalysis`
   - What's the correct standard?

2. **Should we use `results` or `sources` key?**
   - IP endpoint returns `sources`
   - URL endpoint returns `results`?
   - Hash endpoint returns `sources`
   - Which is correct?

3. **How to properly migrate HashLookup.tsx?**
   - Keep same logic but use new components?
   - Change data handling to match new structure?
   - What needs to change beyond copy/paste?

4. **Is Domain lookup implemented?**
   - Does the backend have a `/domain` endpoint?
   - Is DomainResult.tsx a placeholder or real?
   - What needs to be fixed there?

5. **What broke during the migration?**
   - Was there a specific commit or change?
   - Can we see the diff that broke it?
   - What was the original intention?

---

## Expected Working Flow (After Fix)

```
User enters hash in Scanner
↓
Scanner detects it's a hash (MD5/SHA1/SHA256)
↓
Routes to /scanner?type=hash&value=abc123...
↓
HashResult component loads
↓
Calls: lookupHash(hash) → POST /threat-intel/hash
↓
Backend queries:
  - MalwareBazaar (free, always available)
  - VirusTotal (if API key configured)
  - Hybrid Analysis (if API key configured)
  - AlienVault OTX (if API key configured)
↓
Backend returns unified response with:
  - sources: { malwarebazaar: {...}, virustotal_hash: {...}, ... }
  - isMalicious: boolean
  - overallThreatScore: number
  - detections: { virustotal: {...}, malwarebazaar: {...}, ... }
↓
Frontend displays:
  - Hash and type (MD5/SHA1/SHA256)
  - Threat score
  - Each source result in SourceCard
  - Detailed detections
  - External lookup links
  - Raw JSON in collapsible
↓
User can:
  - Copy results
  - Export to JSON
  - Save to case notes
  - View on external sites
```

---

## Success Criteria

### Hash Lookup Must:
1. ✅ Accept MD5, SHA1, or SHA256 hashes
2. ✅ Call the backend API endpoint
3. ✅ Display results from all available sources
4. ✅ Show threat score and malicious determination
5. ✅ Handle sources with/without API keys gracefully
6. ✅ Show loading states while querying
7. ✅ Handle errors from individual sources
8. ✅ Allow export/copy of results
9. ✅ Provide links to external lookups
10. ✅ Match the UI/UX of working IP and URL scanners

### All Scanners Must:
1. ✅ Use consistent data structures
2. ✅ Handle both `results` and `sources` keys
3. ✅ Normalize source names correctly
4. ✅ Display threat intelligence consistently
5. ✅ Work with and without API keys
6. ✅ Cache results appropriately
7. ✅ Log to database when authenticated
8. ✅ Show clear error messages
9. ✅ Be responsive and fast
10. ✅ Follow the same component patterns

---

## Next Steps (Recommended Order)

1. **Send files to OpenAI** with this document
2. **OpenAI analyzes** and provides specific fixes
3. **Implement Hash lookup first** (most critical)
4. **Test with real API calls** (with and without keys)
5. **Fix any remaining source name issues**
6. **Verify domain lookup** (if needed)
7. **Clean up old pages** (redirect or remove)
8. **Full end-to-end testing**
9. **Document any remaining issues**
10. **Deploy and celebrate** 🎉
