# Chrome Extension Scanner - Architecture Guide

## Overview
The Chrome Extension Scanner is a security analysis tool that downloads, unpacks, and analyzes Chrome extensions for malicious patterns, suspicious behaviors, and security vulnerabilities.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Layer                           │
├─────────────────────────────────────────────────────────────┤
│  ExtensionScanner.tsx                                        │
│  └─> AnalysisResults.tsx (displays findings)                │
│  └─> AnalysisHistory.tsx (past scans)                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Supabase Edge Function                    │
├─────────────────────────────────────────────────────────────┤
│  analyze-extension/index.ts                                  │
│  ├─> Download .crx file from Chrome Web Store               │
│  ├─> Unzip extension package                                │
│  ├─> Parse manifest.json                                    │
│  ├─> Scan all files for security issues                     │
│  ├─> Calculate risk score                                   │
│  └─> Store results in database                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Database Schema                           │
├─────────────────────────────────────────────────────────────┤
│  • extension_analyses (main analysis records)                │
│  • security_findings (detailed vulnerabilities)              │
│  • extension_iocs (IOCs: domains, URLs, IPs)                │
│  • extension_file_hashes (file integrity tracking)           │
│  • extension_rules (detection rules)                         │
│  • rule_hits (which rules triggered)                         │
└─────────────────────────────────────────────────────────────┘
```

---

## File Structure & What to Edit Where

### Frontend Components

#### **1. Main Scanner Interface**
📁 `/src/pages/ExtensionScanner.tsx`

**Purpose:** User input, scan triggering, results display coordination

**Edit this when:**
- Changing the UI layout or input fields
- Adding new scan options (e.g., deep scan mode, custom rules)
- Modifying how results are displayed or filtered
- Adding export functionality (PDF, JSON, CSV)

**Key sections:**
```typescript
// Input handling
const handleAnalyze = async () => { ... }

// API call to edge function
const response = await fetch(apiUrl, {
  method: 'POST',
  body: JSON.stringify({ extensionUrl })
})

// State management for current analysis
const [currentAnalysis, setCurrentAnalysis] = useState()
```

---

#### **2. Results Display Component**
📁 `/src/components/extension/AnalysisResults.tsx`

**Purpose:** Rich visualization of security findings, IOCs, and behavior flags

**Edit this when:**
- Adding new visualization types (charts, graphs)
- Changing how findings are grouped or sorted
- Adding new tabs or sections
- Customizing color schemes or severity indicators
- Adding export or sharing functionality

**Key sections:**
```typescript
// Data loading from database
const loadData = async () => {
  const [findingsResult, iocsResult] = await Promise.all([...])
}

// Tab system
const [activeTab, setActiveTab] = useState<'findings' | 'iocs' | 'behavior'>()

// Risk color coding
const getRiskColor = (level: string) => { ... }
```

**Current tabs:**
- Security Findings (grouped by category)
- IOCs (domains and URLs)
- Behavior Analysis (suspicious patterns)

---

#### **3. Historical Analysis Viewer**
📁 `/src/components/extension/AnalysisHistory.tsx`

**Purpose:** Browse past extension scans

**Edit this when:**
- Adding search/filter functionality
- Implementing comparison between scans
- Adding bulk operations (delete, export)
- Showing trending threat patterns

---

### Backend Analysis Engine

#### **4. Core Analysis Edge Function**
📁 `/supabase/functions/analyze-extension/index.ts`

**Purpose:** Downloads, unpacks, scans extensions and detects threats

**Edit this when:**
- Adding new security detection rules
- Modifying risk scoring algorithm
- Changing file size limits or timeouts
- Adding support for new file types
- Implementing new analysis techniques

**Key configuration:**
```typescript
const MAX_FILE_SIZE = 100 * 1024 * 1024;           // 100MB total
const MAX_INDIVIDUAL_FILE_SIZE = 2 * 1024 * 1024;  // 2MB per file
const SCAN_TIMEOUT_MS = 250;                        // Per-file timeout
const DOWNLOAD_TIMEOUT = 45000;                     // Download timeout
```

**Main workflow:**
```typescript
1. validateExtensionUrl()      // Ensure valid Chrome Web Store URL
2. downloadExtension()          // Fetch .crx file
3. unzipExtension()            // Extract contents
4. parseManifest()             // Read manifest.json
5. scanFiles()                 // Analyze all files for threats
6. calculateRiskScore()        // Aggregate findings into score
7. storeResults()              // Save to database
```

---

### Detection Rules System

#### **5. Security Detection Patterns**
📁 `/supabase/functions/analyze-extension/index.ts` (lines ~60-200)

**Edit this when:**
- Adding new malware detection patterns
- Updating regex patterns for IOC extraction
- Adding new dangerous API patterns
- Implementing machine learning detection

**Current detection categories:**
```typescript
1. PERMISSIONS
   - Dangerous Chrome APIs (webRequest, debugger, cookies)
   - Excessive or unusual permission requests

2. CODE_PATTERNS
   - eval() usage (code injection risk)
   - Function constructors
   - Crypto mining patterns
   - Data exfiltration patterns
   - Credential harvesting

3. OBFUSCATION
   - Hex/unicode encoding detection
   - Minification/packing indicators
   - String concealment techniques

4. MANIFEST
   - External script loading
   - Broad host permissions (<all_urls>)
   - Content security policy weaknesses

5. BEHAVIOR
   - Cookie theft patterns
   - Storage manipulation
   - Background script abuse

6. ANTI-ANALYSIS
   - Debugger detection
   - VM/sandbox detection
   - Code integrity checks

7. NETWORK
   - IOC extraction (domains, IPs, URLs)
   - Suspicious remote connections
   - C2 communication patterns
```

**Example rule structure:**
```typescript
{
  rule_id: 'PERM-001',
  category: 'permissions',
  severity: 'high',
  confidence: 'high',
  title: 'Dangerous Permission: webRequest',
  description: 'Extension can intercept and modify all web traffic',
  evidence: manifestContent,
  file_path: 'manifest.json'
}
```

---

### Database Schema

#### **6. Extension Analysis Tables**
📁 `/supabase/migrations/20260123043953_create_extension_analyzer_schema.sql`

**Edit this when:**
- Adding new metadata fields to analyses
- Tracking additional statistics
- Adding versioning/comparison features

**Main table:**
```sql
extension_analyses
  - id (uuid)
  - user_id (uuid, FK to auth.users)
  - extension_id (text, Chrome Web Store ID)
  - extension_name, extension_version, extension_url
  - risk_score (0-100)
  - risk_level (low, medium, high, critical)
  - manifest_data (jsonb)
  - analysis_summary (text)
  - obfuscation_score (0-100)
  - total_files_scanned
  - behavior_flags (jsonb array)
  - file_hashes (jsonb map)
  - analyzed_at
```

---

#### **7. Security Findings Table**
📁 `/supabase/migrations/20260123044006_add_iocs_and_file_hashes.sql`

**Edit this when:**
- Adding new finding attributes
- Implementing finding deduplication
- Adding remediation suggestions

```sql
security_findings
  - analysis_id (FK)
  - rule_id (reference to detection rule)
  - category, severity, confidence
  - title, description, evidence
  - file_path (where issue was found)
```

---

#### **8. IOC Tracking Table**
📁 Same migration file

**Edit this when:**
- Adding threat intelligence enrichment
- Implementing IOC reputation lookups
- Adding automatic IOC defanging

```sql
extension_iocs
  - analysis_id (FK)
  - ioc_type (domain, url, ip, hash)
  - ioc_value (the actual IOC)
  - source_file (where it was found)
  - context (surrounding code)
```

---

#### **9. Detection Rules Database**
📁 `/supabase/migrations/20260123044017_add_rule_tracking_and_performance.sql`

**Edit this when:**
- Making rules user-customizable
- Implementing rule marketplace/sharing
- Adding rule versioning

```sql
extension_rules
  - rule_id (unique identifier)
  - category, severity
  - pattern (detection regex/logic)
  - description
  - enabled (toggle on/off)
```

---

## Risk Scoring Algorithm

**Location:** `/supabase/functions/analyze-extension/index.ts` (~line 700+)

**Current formula:**
```typescript
base_score = (
  critical_findings * 25 +
  high_findings * 15 +
  medium_findings * 8 +
  low_findings * 3
) + obfuscation_score * 0.3

risk_score = min(100, base_score)

risk_level:
  90-100  → critical
  70-89   → high
  40-69   → medium
  0-39    → low
```

**Edit this when:**
- Adjusting severity weights
- Adding confidence score influence
- Implementing ML-based scoring
- Adding context-aware scoring (popular extensions get lower false positives)

---

## Key Extension Points

### Adding a New Detection Rule

1. **Define the rule** in `analyze-extension/index.ts`:
```typescript
const newRule = {
  rule_id: 'NET-005',
  category: 'network',
  severity: 'high',
  title: 'Cryptocurrency Wallet Connection',
  description: 'Extension connects to crypto wallet APIs',
  pattern: /web3|ethereum|metamask/i
};
```

2. **Add detection logic** in `scanFiles()` function
3. **Update risk score calculation** if needed
4. **Test with sample extensions**

---

### Adding a New Visualization Tab

1. **Update state** in `AnalysisResults.tsx`:
```typescript
const [activeTab, setActiveTab] = useState<
  'findings' | 'iocs' | 'behavior' | 'YOUR_NEW_TAB'
>('findings');
```

2. **Add tab button** in the tab bar section
3. **Add tab content** in the render section
4. **Fetch additional data** if needed in `loadData()`

---

### Increasing File Size Limits

**Location:** `/supabase/functions/analyze-extension/index.ts` (top of file)

```typescript
const MAX_FILE_SIZE = 100 * 1024 * 1024;           // Total extension size
const MAX_INDIVIDUAL_FILE_SIZE = 2 * 1024 * 1024;  // Per-file limit
const DOWNLOAD_TIMEOUT = 45000;                     // Download timeout
```

**Remember to redeploy:**
```bash
# Uses mcp__supabase__deploy_edge_function tool
```

---

## Performance Considerations

### Current Optimizations

1. **Timeout Protection:** Each file scan limited to 250ms
2. **File Size Filtering:** Skips files >2MB (configurable)
3. **Parallel Processing:** Manifest analysis runs concurrently with file scanning
4. **Regex Compilation:** Patterns compiled once, reused across files
5. **Early Exit:** Critical findings can trigger early termination

### Bottlenecks to Watch

1. **Large Extensions:** 100MB limit may be hit by complex extensions
2. **Deeply Nested ZIPs:** Unzipping can be slow
3. **Obfuscated Code:** Detection patterns slower on minified code
4. **Database Writes:** Bulk inserts for findings/IOCs can add latency

---

## Security Best Practices

### RLS Policies
All tables enforce Row Level Security:
- Users can only see their own analyses
- No cross-user data leakage
- Admin panel has elevated permissions

### Input Validation
```typescript
// URLs must match Chrome Web Store pattern
const urlPattern = /chrome\.google\.com\/webstore\/detail\/[a-z-]+\/([a-z]{32})/i

// Extension IDs are exactly 32 lowercase letters
const idPattern = /^[a-z]{32}$/
```

### Data Sanitization
- IOCs stored without defanging (allows direct investigation)
- File paths normalized to prevent traversal
- Evidence snippets truncated to prevent payload injection

---

## Testing Strategy

### Manual Testing Checklist

1. **Safe Extension:** Should score low risk
2. **Adware Extension:** Should detect excessive permissions
3. **Obfuscated Code:** Should flag high obfuscation score
4. **Large Extension:** Should handle gracefully or reject properly
5. **Invalid URLs:** Should return clear error messages

### Known Good Test Extensions

- **Low Risk:** Simple ad blockers, themes
- **Medium Risk:** Extensions with broad permissions but legitimate use
- **High Risk:** Removed/flagged extensions (use cached URLs)

---

## Common Customizations

### 1. Change Risk Level Thresholds
📁 `analyze-extension/index.ts` + `AnalysisResults.tsx`

```typescript
// Backend
if (riskScore >= 85) riskLevel = 'critical';     // was 90
else if (riskScore >= 65) riskLevel = 'high';    // was 70
// ...

// Frontend color matching
const getRiskColor = (level: string) => {
  // Update to match backend thresholds
}
```

---

### 2. Add Export Functionality
📁 `AnalysisResults.tsx`

```typescript
const exportToPDF = () => {
  // Generate PDF report
}

const exportToJSON = () => {
  // Export raw data
}

// Add export buttons to UI
```

---

### 3. Implement Comparison Mode
📁 `AnalysisHistory.tsx` + new component

```typescript
// Allow selecting 2+ analyses to compare
// Show diff of findings, score changes over versions
```

---

### 4. Add Threat Intelligence Enrichment
📁 `analyze-extension/index.ts`

```typescript
// For each IOC, query threat intel APIs
const enrichIOC = async (ioc: string) => {
  const virustotal = await checkVirusTotal(ioc);
  const abuseipdb = await checkAbuseIPDB(ioc);
  return { ...ioc, reputation: ... }
}
```

---

## Troubleshooting

### "Extension too large" errors
→ Increase `MAX_FILE_SIZE` constant

### Timeouts during analysis
→ Increase `SCAN_TIMEOUT_MS` or `DOWNLOAD_TIMEOUT`

### Missing IOCs
→ Update regex patterns in IOC extraction section

### False positives
→ Adjust confidence levels or add whitelisting logic

### Database errors
→ Check RLS policies, ensure user is authenticated

---

## Future Enhancement Ideas

### Advanced Features
- [ ] Machine learning-based detection
- [ ] Community-contributed detection rules
- [ ] Real-time threat intel integration
- [ ] Automated re-scanning of installed extensions
- [ ] Browser extension for one-click scanning
- [ ] API endpoint for CI/CD integration
- [ ] Sandbox execution for dynamic analysis
- [ ] Cross-extension comparison (detect clones/forks)
- [ ] Historical version tracking (detect when extension goes rogue)
- [ ] Bulk organization scanning for IT admins

### UI Enhancements
- [ ] Visual network graph of IOC relationships
- [ ] Timeline view of behavior analysis
- [ ] Risk trend charts over time
- [ ] Filterable/searchable findings
- [ ] Customizable severity thresholds
- [ ] Dark mode (wait, you already have this!)
- [ ] Mobile-responsive views

---

## Quick Reference

| Task | File(s) to Edit |
|------|----------------|
| Change UI layout | `ExtensionScanner.tsx` |
| Add detection rule | `analyze-extension/index.ts` |
| Modify risk scoring | `analyze-extension/index.ts` |
| Add visualization | `AnalysisResults.tsx` |
| Change file limits | `analyze-extension/index.ts` |
| Add DB fields | Migration files + TypeScript interfaces |
| Export results | `AnalysisResults.tsx` |
| Filter history | `AnalysisHistory.tsx` |

---

## API Reference

### Edge Function Endpoint
```
POST /functions/v1/analyze-extension
Authorization: Bearer {SUPABASE_ANON_KEY}

Body:
{
  "extensionUrl": "https://chrome.google.com/webstore/detail/..."
}

Response:
{
  "id": "uuid",
  "extension_name": "...",
  "risk_score": 45,
  "risk_level": "medium",
  "findings": [...],
  "iocs": [...]
}
```

---

**Last Updated:** 2026-02-08
**Version:** 2.0
**Maintainer:** Security Intelligence Platform Team
