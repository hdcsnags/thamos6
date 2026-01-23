# Configuration Reference

Complete guide to all configurable settings, constants, and parameters in the Chrome Extension Malware Analyzer.

## Table of Contents

- [Environment Variables](#environment-variables)
- [Performance Limits](#performance-limits)
- [Detection Thresholds](#detection-thresholds)
- [Network Configuration](#network-configuration)
- [Risk Scoring Weights](#risk-scoring-weights)
- [UI Customization](#ui-customization)
- [Database Configuration](#database-configuration)
- [Rule Configuration](#rule-configuration)
- [Advanced Settings](#advanced-settings)

---

## Environment Variables

### Frontend Environment (.env)

**Location**: `/tmp/cc-agent/62615798/project/.env`

```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

**Variables**:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Public anonymous key for client-side access |

**Note**: `VITE_` prefix exposes variables to browser (Vite requirement)

---

### Edge Function Environment

**Auto-configured by Supabase** (no manual setup):

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Public anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin key (bypasses RLS) |
| `SUPABASE_DB_URL` | Direct PostgreSQL connection string |

---

## Performance Limits

### File Size Limits

**Location**: `supabase/functions/analyze-extension/index.ts` (Lines 10-13)

```typescript
const MAX_FILE_SIZE = 50 * 1024 * 1024;           // 50MB
const MAX_INDIVIDUAL_FILE_SIZE = 500 * 1024;      // 500KB
const SCAN_TIMEOUT_MS = 250;                       // Not currently enforced
const DOWNLOAD_TIMEOUT = 30000;                    // 30 seconds
```

#### MAX_FILE_SIZE

**Default**: `50 MB` (52,428,800 bytes)

**Purpose**: Maximum total size of CRX file to download

**Impact**:
- Larger values allow bigger extensions but increase memory usage
- Smaller values reduce memory but may reject legitimate large extensions

**Recommended Values**:
- **Conservative**: 25 MB (fast, low memory)
- **Standard**: 50 MB (current default)
- **Aggressive**: 100 MB (slow, high memory risk)

**How to Change**:
```typescript
const MAX_FILE_SIZE = 100 * 1024 * 1024;  // 100MB
```

---

#### MAX_INDIVIDUAL_FILE_SIZE

**Default**: `500 KB` (512,000 bytes)

**Purpose**: Maximum size of individual files to analyze (JS, HTML, JSON)

**Impact**:
- Files larger than this are skipped with PERF-1 finding
- Prevents timeout on huge minified files
- Reduces scan time

**Recommended Values**:
- **Fast scanning**: 250 KB
- **Standard**: 500 KB (current default)
- **Thorough**: 1 MB (may timeout on obfuscated files)

**How to Change**:
```typescript
const MAX_INDIVIDUAL_FILE_SIZE = 1 * 1024 * 1024;  // 1MB
```

**Side Effect**: Large skipped files are tracked in `skipped_files` array

---

#### DOWNLOAD_TIMEOUT

**Default**: `30000` milliseconds (30 seconds)

**Purpose**: Maximum time to wait for CRX download from Chrome Web Store

**Impact**:
- Shorter timeout fails faster on unavailable extensions
- Longer timeout handles slow connections better

**Recommended Values**:
- **Fast fail**: 15 seconds
- **Standard**: 30 seconds (current default)
- **Patient**: 60 seconds

**How to Change**:
```typescript
const DOWNLOAD_TIMEOUT = 60000;  // 60 seconds
```

---

## Detection Thresholds

### Obfuscation Scoring

**Location**: `supabase/functions/analyze-extension/index.ts` (Lines 989-1044)

```typescript
// Line length thresholds
if (avgLineLength > 500) {
  fileScore += 30;
} else if (avgLineLength > 200) {
  fileScore += 15;
}

// Code density threshold
if (codeLength > 10000 && lineCount < 50) {
  fileScore += 25;
}

// Entropy thresholds
if (entropy > 4.5) {
  fileScore += 20;
} else if (entropy > 4.0) {
  fileScore += 10;
}

// Whitespace ratio
if (spaceRatio < 0.1) {
  fileScore += 10;
}
```

**Adjustable Parameters**:

| Parameter | Current | Purpose |
|-----------|---------|---------|
| `avgLineLength > 500` | 500 chars | High obfuscation threshold |
| `avgLineLength > 200` | 200 chars | Medium obfuscation threshold |
| `codeLength > 10000 && lineCount < 50` | 10KB / 50 lines | Dense code detection |
| `entropy > 4.5` | 4.5 bits | High randomness threshold |
| `entropy > 4.0` | 4.0 bits | Medium randomness threshold |
| `spaceRatio < 0.1` | 10% | Low whitespace threshold |

**To Reduce False Positives** (more lenient):
```typescript
if (avgLineLength > 800) {  // Raised from 500
  fileScore += 30;
}
if (entropy > 5.0) {  // Raised from 4.5
  fileScore += 20;
}
```

**To Increase Sensitivity** (stricter):
```typescript
if (avgLineLength > 300) {  // Lowered from 500
  fileScore += 30;
}
if (entropy > 3.5) {  // Lowered from 4.5
  fileScore += 20;
}
```

---

### Extension ID Blacklist Threshold

**Location**: `supabase/functions/analyze-extension/index.ts` (Lines 650-663)

```typescript
if (allExtensionIds.length >= 5) {
  const rule = RULE_DEFINITIONS["ANALYSIS-2"];
  const confidence = allExtensionIds.length >= 10 ? "high" : "medium";
  // Triggers ANALYSIS-2 finding
}
```

**Thresholds**:
- **5+ IDs**: Triggers finding with medium confidence
- **10+ IDs**: Upgrades to high confidence

**Purpose**: Detects hardcoded lists of extension IDs (security tool blacklists)

**To Reduce False Positives**:
```typescript
if (allExtensionIds.length >= 10) {  // Raised from 5
  // Only triggers on larger lists
}
```

**To Increase Sensitivity**:
```typescript
if (allExtensionIds.length >= 3) {  // Lowered from 5
  // Triggers on smaller lists
}
```

---

## Network Configuration

### Domain Whitelisting

**Location**: `supabase/functions/analyze-extension/index.ts` (Lines 223-227)

```typescript
const WHITELISTED_DOMAINS = [
  'google-analytics.com',
  'googleapis.com',
  'gstatic.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'cdnjs.cloudflare.com',
  'github.com',
  'githubusercontent.com'
];
```

**Purpose**: Exclude trusted domains from NET-1 and NET-2 findings

**How to Add Domains**:
```typescript
const WHITELISTED_DOMAINS = [
  'google-analytics.com',
  'googleapis.com',
  // Add your trusted domains:
  'your-trusted-api.com',
  'cdn.your-company.com',
  'api.legitimate-service.com'
];
```

**Matching Logic**:
```typescript
const isWhitelisted = WHITELISTED_DOMAINS.some(d => urlObj.hostname.includes(d));
```

**Note**: Uses substring matching, so `gstatic.com` matches `fonts.gstatic.com`

---

### Suspicious TLDs

**Location**: `supabase/functions/analyze-extension/index.ts` (Line 222)

```typescript
const SUSPICIOUS_TLDS = ['.xyz', '.top', '.tk', '.ml', '.ga', '.cf', '.gq', '.pw', '.cc'];
```

**Purpose**: Flag domains with high-risk top-level domains (NET-2)

**How to Modify**:
```typescript
const SUSPICIOUS_TLDS = [
  '.xyz',    // Generic abuse
  '.top',    // Often used by malware
  '.tk',     // Free domain (Tokelau)
  '.ml',     // Free domain (Mali)
  '.ga',     // Free domain (Gabon)
  '.cf',     // Free domain (Central African Republic)
  '.gq',     // Free domain (Equatorial Guinea)
  '.pw',     // Palau
  '.cc',     // Cocos Islands
  // Add more:
  '.work',   // Generic
  '.click',  // Often spam
  '.link'    // Generic abuse
];
```

**To Add TLD**:
```typescript
const SUSPICIOUS_TLDS = [...existing, '.suspicious-tld'];
```

**To Remove TLD**:
```typescript
const SUSPICIOUS_TLDS = ['.xyz', '.top'];  // Removed others
```

---

## Risk Scoring Weights

### Severity Points

**Location**: `supabase/functions/analyze-extension/index.ts` (Lines 1099-1103)

```typescript
const severityScores = {
  low: 5,
  medium: 15,
  high: 30,
  critical: 50,
};
```

**Purpose**: Base score for each severity level

**How to Adjust**:
```typescript
const severityScores = {
  low: 3,       // Reduced from 5
  medium: 10,   // Reduced from 15
  high: 25,     // Reduced from 30
  critical: 60, // Increased from 50
};
```

**Impact**:
- Higher values → Higher risk scores
- Lower values → Lower risk scores
- Affects which risk level (low/medium/high/critical) analysis falls into

---

### Confidence Multipliers

**Location**: `supabase/functions/analyze-extension/index.ts` (Lines 1105-1109)

```typescript
const confidenceMultipliers = {
  low: 0.4,     // 40%
  medium: 0.7,  // 70%
  high: 1.0,    // 100%
};
```

**Purpose**: Discount findings with lower confidence

**Example**:
```
Critical finding (50 pts) with medium confidence (0.7):
  50 × 0.7 = 35 points

High finding (30 pts) with low confidence (0.4):
  30 × 0.4 = 12 points
```

**How to Adjust**:
```typescript
const confidenceMultipliers = {
  low: 0.3,     // More discount (30%)
  medium: 0.6,  // More discount (60%)
  high: 1.0,    // No change (100%)
};
```

**Impact**:
- Lower multipliers → More conservative scoring
- Higher multipliers → Less discount for uncertain findings

---

### Obfuscation Weight

**Location**: `supabase/functions/analyze-extension/index.ts` (Line 1123)

```typescript
score += Math.round(obfuscationScore * 0.3);
```

**Purpose**: Contribution of obfuscation score to final risk score

**Current**: 30% of obfuscation score added to risk

**Examples**:
- Obfuscation score: 80 → Adds 24 points to risk
- Obfuscation score: 50 → Adds 15 points to risk
- Obfuscation score: 20 → Adds 6 points to risk

**How to Adjust**:
```typescript
score += Math.round(obfuscationScore * 0.5);  // 50% weight
score += Math.round(obfuscationScore * 0.1);  // 10% weight
score += Math.round(obfuscationScore * 0);    // Ignore obfuscation
```

**Recommendation**:
- **Conservative**: 0.1-0.2 (less weight on obfuscation)
- **Standard**: 0.3 (current default)
- **Aggressive**: 0.4-0.5 (more weight on obfuscation)

---

### Risk Level Thresholds

**Location**: `supabase/functions/analyze-extension/index.ts` (Lines 1128-1133)

```typescript
function getRiskLevel(score: number): string {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}
```

**Purpose**: Map numeric score (0-100) to risk level

**How to Adjust**:
```typescript
// More lenient (harder to reach high risk)
if (score >= 85) return "critical";  // Was 80
if (score >= 70) return "high";      // Was 60
if (score >= 40) return "medium";    // Was 30

// More strict (easier to reach high risk)
if (score >= 70) return "critical";  // Was 80
if (score >= 50) return "high";      // Was 60
if (score >= 25) return "medium";    // Was 30
```

**Impact on UI**:
- Changes badge colors and urgency indicators
- Affects how extensions are categorized in history

---

## UI Customization

### Color Schemes

**Location**: `src/components/AnalysisResults.tsx`

#### Risk Level Colors

```typescript
const getRiskLevelColor = (level: string) => {
  switch (level) {
    case 'critical':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'high':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'low':
      return 'bg-green-100 text-green-800 border-green-200';
    default:
      return 'bg-slate-100 text-slate-800 border-slate-200';
  }
};
```

**How to Change**: Modify Tailwind classes
```typescript
case 'critical':
  return 'bg-red-600 text-white border-red-700';  // Darker red
```

---

#### Category Colors

```typescript
const getCategoryColor = (category: string) => {
  switch (category) {
    case 'permissions':
      return 'bg-violet-100 text-violet-800';
    case 'code_patterns':
      return 'bg-pink-100 text-pink-800';
    case 'obfuscation':
      return 'bg-red-100 text-red-800';
    case 'manifest':
      return 'bg-cyan-100 text-cyan-800';
    case 'behavior':
      return 'bg-rose-100 text-rose-800';
    case 'anti-analysis':
      return 'bg-orange-100 text-orange-800';
    case 'network':
      return 'bg-blue-100 text-blue-800';
    case 'performance':
      return 'bg-slate-100 text-slate-600';
    default:
      return 'bg-slate-100 text-slate-800';
  }
};
```

**How to Add Category**:
```typescript
case 'my_new_category':
  return 'bg-purple-100 text-purple-800';
```

---

#### Severity Badge Colors

```typescript
const getSeverityBadgeColor = (severity: string) => {
  switch (severity) {
    case 'critical':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'high':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'low':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    default:
      return 'bg-slate-100 text-slate-800 border-slate-200';
  }
};
```

---

#### Confidence Badge Colors

```typescript
const getConfidenceBadgeColor = (confidence?: string) => {
  switch (confidence) {
    case 'high':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'low':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};
```

---

### Text Labels

**Confidence Labels** (Lines 407-408):
```typescript
{finding.confidence === 'high' ? '✓ High Confidence' :
 finding.confidence === 'medium' ? 'Medium Confidence' :
 'Low Confidence'}
```

**How to Change**:
```typescript
{finding.confidence === 'high' ? '🔒 Verified' :
 finding.confidence === 'medium' ? '⚠️ Likely' :
 '❓ Possible'}
```

---

## Database Configuration

### Connection Pooling

**Managed by Supabase** - no configuration needed

Default settings:
- Pool size: Based on plan (Pro: 15 connections)
- Timeout: 30 seconds
- Max lifetime: 3600 seconds

---

### Query Timeouts

**Location**: Supabase client initialization

```typescript
const supabase = createClient(supabaseUrl, supabaseKey, {
  db: {
    schema: 'public'
  },
  auth: {
    persistSession: false
  }
});
```

**To Add Timeout**:
```typescript
const supabase = createClient(supabaseUrl, supabaseKey, {
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'x-request-timeout': '10000'  // 10 seconds
    }
  }
});
```

---

### Batch Insert Size

**Location**: `supabase/functions/analyze-extension/index.ts` (Lines 397-410)

```typescript
if (findings.length > 0) {
  const findingsToInsert = findings.map(f => ({
    analysis_id: analysis.id,
    ...f,
  }));

  const { error: findingsError } = await supabase
    .from("security_findings")
    .insert(findingsToInsert);
}
```

**Current**: Inserts all findings at once

**To Add Batching** (for large result sets):
```typescript
// Batch into chunks of 100
const BATCH_SIZE = 100;
for (let i = 0; i < findings.length; i += BATCH_SIZE) {
  const batch = findings.slice(i, i + BATCH_SIZE);
  await supabase.from("security_findings").insert(batch);
}
```

---

## Rule Configuration

### Enabling/Disabling Rules

**To Disable a Rule**:

Comment out the detection logic while keeping the rule definition:

```typescript
// Disable API-2 (document.cookie detection)
/*
if (/document\.cookie/.test(code)) {
  const rule = RULE_DEFINITIONS["API-2"];
  findings.push({...});
}
*/
```

Keep rule definition for historical data:
```typescript
"API-2": {
  id: "API-2",
  // ... rule definition stays
}
```

---

### Changing Rule Severity

**Location**: `RULE_DEFINITIONS` object (Lines 59-220)

```typescript
"NET-2": {
  id: "NET-2",
  severity: "medium",  // Change to "high" or "low"
  confidence: "medium",
  // ... rest unchanged
}
```

**Impact**: Affects risk score calculation immediately

---

### Changing Rule Confidence

```typescript
"PERM-1": {
  id: "PERM-1",
  severity: "high",
  confidence: "medium",  // Change to "high" or "low"
  // ... rest unchanged
}
```

**Impact**: Applies confidence multiplier to severity score

---

### Adjusting Detection Patterns

**Example: Make API-1 more specific**

```typescript
// Before (Lines 667-688)
const hasCookieAccess = /chrome\.cookies\.(getAll|get)\s*\(/.test(code);
const hasNetworkCall = /fetch\s*\(|XMLHttpRequest|\.send\s*\(/.test(code);

// After - require both in close proximity
const cookieMatch = code.match(/chrome\.cookies\.(getAll|get)\s*\([^)]*\)/);
if (cookieMatch) {
  const cookieIndex = code.indexOf(cookieMatch[0]);
  const surroundingCode = code.substring(
    Math.max(0, cookieIndex - 500),
    Math.min(code.length, cookieIndex + 500)
  );
  const hasNearbyNetworkCall = /fetch\s*\(|XMLHttpRequest|\.send\s*\(/.test(surroundingCode);

  if (hasNearbyNetworkCall) {
    // Trigger API-1
  }
}
```

---

## Advanced Settings

### CRX Download URL

**Location**: `supabase/functions/analyze-extension/index.ts` (Line 264)

```typescript
const crxUrl = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=120.0&acceptformat=crx3&x=id%3D${extensionId}%26installsource%3Dondemand%26uc`;
```

**Parameters**:
- `prodversion=120.0`: Chrome version (can be updated)
- `acceptformat=crx3`: Prefers CRX3 format
- `installsource=ondemand`: Simulates on-demand install

**To Update Chrome Version**:
```typescript
const crxUrl = `...&prodversion=130.0&...`;  // Chrome 130
```

---

### Regex Pattern Flags

Most patterns use default flags. To add case-insensitive matching:

```typescript
// Before
if (/document\.cookie/.test(code)) {

// After - case insensitive
if (/document\.cookie/i.test(code)) {
  // Matches Document.Cookie, DOCUMENT.COOKIE, etc.
}
```

---

### IOC Context Length

**Location**: `extractContext()` function (Lines 857-865)

```typescript
function extractContext(text: string, needle: string, contextLength: number): string {
  const index = text.indexOf(needle);
  if (index === -1) return "";

  const start = Math.max(0, index - contextLength);
  const end = Math.min(text.length, index + needle.length + contextLength);

  return text.substring(start, end).replace(/\s+/g, ' ').trim();
}
```

**Usage**:
```typescript
const context = extractContext(text, url, 50);  // 50 chars before/after
```

**To Increase Context**:
```typescript
const context = extractContext(text, url, 100);  // 100 chars before/after
```

---

### Entropy Calculation Sample Size

**Location**: `calculateObfuscationScore()` (Line 1014)

```typescript
const entropy = calculateEntropy(code.substring(0, Math.min(10000, code.length)));
```

**Current**: First 10KB of code

**To Analyze More**:
```typescript
const entropy = calculateEntropy(code.substring(0, Math.min(50000, code.length)));
```

**To Analyze Less** (faster):
```typescript
const entropy = calculateEntropy(code.substring(0, Math.min(5000, code.length)));
```

---

### File Type Analysis

**Location**: `analyzeAllFiles()` (Lines 615-620)

```typescript
const isScript = filename.endsWith(".js") || scriptFiles.has(filename);
const isHtml = filename.endsWith(".html");
const isJson = filename.endsWith(".json");

if (isScript || isHtml || isJson) {
  // Analyze file
}
```

**To Add More File Types**:
```typescript
const isScript = filename.endsWith(".js") || scriptFiles.has(filename);
const isHtml = filename.endsWith(".html");
const isJson = filename.endsWith(".json");
const isCss = filename.endsWith(".css");  // NEW

if (isScript || isHtml || isJson || isCss) {
  if (isCss) {
    analyzeCSS(filename, text, findings, iocs);
  }
  // ... existing logic
}
```

---

## Configuration Best Practices

### Performance vs Accuracy

**Fast Scanning** (Quick analysis, may miss some malware):
```typescript
MAX_FILE_SIZE = 25 * 1024 * 1024;           // 25MB
MAX_INDIVIDUAL_FILE_SIZE = 250 * 1024;      // 250KB
DOWNLOAD_TIMEOUT = 15000;                    // 15 seconds
obfuscationWeight = 0.1;                     // Low weight
```

**Thorough Scanning** (Slower, more comprehensive):
```typescript
MAX_FILE_SIZE = 100 * 1024 * 1024;          // 100MB
MAX_INDIVIDUAL_FILE_SIZE = 2 * 1024 * 1024; // 2MB
DOWNLOAD_TIMEOUT = 60000;                    // 60 seconds
obfuscationWeight = 0.5;                     // High weight
```

---

### False Positive Reduction

**Conservative Settings**:
```typescript
// Stricter multi-condition rules
if (condition1 && condition2 && condition3) { ... }

// Higher thresholds
if (allExtensionIds.length >= 10) { ... }  // Was 5

// Lower confidence for borderline detections
confidence: "medium"  // Instead of "high"

// More lenient obfuscation
if (avgLineLength > 800) { ... }  // Was 500
```

---

### Testing Configuration Changes

1. **Make change** in edge function or frontend
2. **Save file** (edge function auto-deploys)
3. **Clear browser cache** if needed
4. **Test with known extensions**:
   - Legitimate extension (should have low score)
   - Known malware sample (should have high score)
5. **Review findings** for correctness
6. **Check performance** (scan duration)

---

## Environment-Specific Configs

### Development

```typescript
// Verbose logging
console.log(`Analyzing extension: ${extensionId}`);
console.log(`Downloaded CRX: ${crxData.byteLength} bytes`);
console.log(`Extracted ZIP data: ${zipData.length} bytes`);

// Relaxed limits for testing
MAX_FILE_SIZE = 100 * 1024 * 1024;
```

---

### Production

```typescript
// Minimal logging (only errors)
console.error(`Error analyzing ${extensionId}:`, error);

// Strict limits for performance
MAX_FILE_SIZE = 50 * 1024 * 1024;
MAX_INDIVIDUAL_FILE_SIZE = 500 * 1024;

// Enable caching (future)
// checkCache(extensionId)
```

---

## Configuration Validation

### Checking Your Configuration

Run these queries to verify settings:

**Check Rule IDs are unique**:
```sql
SELECT rule_id, COUNT(*)
FROM security_findings
WHERE rule_id IS NOT NULL
GROUP BY rule_id
HAVING COUNT(*) > 0;
```

**Check Average Risk Scores**:
```sql
SELECT
  AVG(risk_score) as avg_risk,
  MAX(risk_score) as max_risk,
  MIN(risk_score) as min_risk
FROM extension_analyses;
```

**Check Findings Distribution**:
```sql
SELECT
  severity,
  confidence,
  COUNT(*) as count
FROM security_findings
GROUP BY severity, confidence
ORDER BY severity, confidence;
```

---

## Quick Reference

### Most Common Adjustments

| What | Where | Default | Common Change |
|------|-------|---------|---------------|
| Max extension size | `MAX_FILE_SIZE` | 50MB | 25MB or 100MB |
| Max file size | `MAX_INDIVIDUAL_FILE_SIZE` | 500KB | 250KB or 1MB |
| Download timeout | `DOWNLOAD_TIMEOUT` | 30s | 15s or 60s |
| Risk thresholds | `getRiskLevel()` | 80/60/30 | More/less strict |
| Whitelist domain | `WHITELISTED_DOMAINS` | 8 domains | Add yours |
| Suspicious TLD | `SUSPICIOUS_TLDS` | 9 TLDs | Add/remove |
| Obfuscation weight | `obfuscationScore * 0.3` | 30% | 10-50% |

---

For rule details, see [RULES.md](RULES.md).
For architecture details, see [ARCHITECTURE.md](ARCHITECTURE.md).
