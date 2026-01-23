# System Architecture

Complete technical documentation for the Chrome Extension Malware Analyzer system architecture, data flow, and implementation details.

## Table of Contents

- [System Overview](#system-overview)
- [Architecture Diagram](#architecture-diagram)
- [Data Flow](#data-flow)
- [Component Details](#component-details)
- [Database Schema](#database-schema)
- [Edge Function Architecture](#edge-function-architecture)
- [Frontend Architecture](#frontend-architecture)
- [Security Model](#security-model)
- [Performance Considerations](#performance-considerations)
- [Scalability](#scalability)

---

## System Overview

The analyzer is a three-tier application:

1. **Frontend (React + TypeScript + Vite)**: User interface for submitting URLs and viewing results
2. **Backend (Supabase Edge Function)**: Serverless function that downloads and analyzes extensions
3. **Database (PostgreSQL/Supabase)**: Stores analysis results, findings, and IOCs

### Technology Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite
- **Backend**: Deno runtime, TypeScript
- **Database**: PostgreSQL with Supabase extensions
- **Hosting**: Supabase (Edge Functions + Database)
- **Authentication**: Supabase Auth (optional, currently bypassed for demo)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                             │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              React Frontend (Vite)                        │  │
│  │                                                           │  │
│  │  Components:                                              │  │
│  │  ├─ App.tsx           (Main UI, submission)              │  │
│  │  ├─ AnalysisResults   (Display findings)                 │  │
│  │  └─ AnalysisHistory   (Past analyses)                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                           │                                       │
│                           │ HTTPS + CORS                          │
│                           ↓                                       │
└───────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      SUPABASE PLATFORM                           │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │           Edge Function (Deno Runtime)                     │ │
│  │                                                            │ │
│  │  analyze-extension/index.ts                               │ │
│  │  ├─ 1. Validate URL                                       │ │
│  │  ├─ 2. Download CRX from Chrome Web Store                 │ │
│  │  ├─ 3. Extract ZIP from CRX container                     │ │
│  │  ├─ 4. Parse manifest.json                                │ │
│  │  ├─ 5. Analyze files (JS, HTML, JSON)                     │ │
│  │  │    ├─ Permission analysis                              │ │
│  │  │    ├─ Code pattern matching                            │ │
│  │  │    ├─ IOC extraction                                   │ │
│  │  │    └─ Obfuscation scoring                              │ │
│  │  ├─ 6. Calculate risk score                               │ │
│  │  └─ 7. Store results in database                          │ │
│  └────────────────────────────────────────────────────────────┘ │
│                           │                                       │
│                           │ SQL                                   │
│                           ↓                                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │             PostgreSQL Database                            │ │
│  │                                                            │ │
│  │  Tables:                                                   │ │
│  │  ├─ extension_analyses    (Main results)                  │ │
│  │  ├─ security_findings     (Individual issues)             │ │
│  │  └─ extension_iocs        (URLs, domains)                 │ │
│  │                                                            │ │
│  │  Row Level Security (RLS):                                │ │
│  │  └─ Authenticated users see own data only                 │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    CHROME WEB STORE API                          │
│                                                                   │
│  clients2.google.com/service/update2/crx                         │
│  (Extension download endpoint)                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Analysis Request Flow

1. **User Submits URL**
   ```
   User enters: https://chromewebstore.google.com/detail/example-ext/abcd...xyz
   Frontend extracts extension ID: abcd...xyz
   ```

2. **Frontend → Edge Function**
   ```typescript
   POST /functions/v1/analyze-extension
   Headers:
     Authorization: Bearer {ANON_KEY}
     Content-Type: application/json
   Body:
     { "extensionUrl": "https://..." }
   ```

3. **Edge Function → Chrome Web Store**
   ```
   GET https://clients2.google.com/service/update2/crx
       ?response=redirect
       &prodversion=120.0
       &acceptformat=crx3
       &x=id%3D{extensionId}%26installsource%3Dondemand%26uc

   Response: Binary CRX file (Chrome extension package)
   ```

4. **CRX Processing**
   ```
   Binary CRX → Parse header (Cr24 magic bytes)
   → Extract header metadata (v2 or v3)
   → Locate ZIP data offset
   → Extract ZIP payload
   → Unzip files to memory
   ```

5. **File Analysis**
   ```
   For each file in extension:
     If .js → analyzeJavaScript()
     If .html → analyzeHTML()
     If .json → analyzeJSON()
     If manifest.json → analyzePermissions() + analyzeManifestDeep()

   Extract:
     - Security findings (with rule IDs)
     - IOCs (URLs, domains)
     - File hashes (SHA-256)
     - Obfuscation scores
   ```

6. **Risk Calculation**
   ```typescript
   riskScore = Σ(finding.severity × finding.confidence) + (obfuscation × 0.3)
   riskLevel = riskScore >= 80 ? "critical" : riskScore >= 60 ? "high" : ...
   ```

7. **Database Storage**
   ```sql
   INSERT INTO extension_analyses (...)
   INSERT INTO security_findings (...)  -- Bulk insert all findings
   INSERT INTO extension_iocs (...)     -- Bulk insert all IOCs
   ```

8. **Response to Frontend**
   ```json
   {
     "success": true,
     "analysis_id": "uuid",
     "extension_name": "Example Extension",
     "risk_score": 65,
     "risk_level": "high",
     "findings_count": 8,
     "iocs_count": 12,
     "behavior_flags": 2,
     "scan_duration_ms": 3450
   }
   ```

9. **Frontend Displays Results**
   ```
   Fetch full analysis:
     GET /rest/v1/extension_analyses?id=eq.{uuid}
     GET /rest/v1/security_findings?analysis_id=eq.{uuid}
     GET /rest/v1/extension_iocs?analysis_id=eq.{uuid}

   Render:
     - Risk score gauge
     - Findings grouped by category
     - IOC table
     - Behavior flags
   ```

---

## Component Details

### Frontend Components

#### App.tsx (Main Component)

**Purpose**: Orchestrates entire application flow

**State Management**:
```typescript
const [extensionUrl, setExtensionUrl] = useState('')
const [isAnalyzing, setIsAnalyzing] = useState(false)
const [results, setResults] = useState<AnalysisData | null>(null)
const [error, setError] = useState<string>('')
const [history, setHistory] = useState<Analysis[]>([])
```

**Key Functions**:
- `handleAnalyze()`: Submits URL to edge function
- `loadHistory()`: Fetches past analyses from database
- `loadAnalysis(id)`: Loads specific analysis by ID

**File Location**: `src/App.tsx`

---

#### AnalysisResults.tsx

**Purpose**: Displays detailed analysis results

**Features**:
- Risk score visualization (color-coded gauge)
- Findings grouped by category with expand/collapse
- Rule ID badges and confidence indicators
- Evidence snippets with syntax highlighting
- IOC table with filtering
- Behavior flags with severity
- File hashes for forensics

**Data Processing**:
```typescript
// Groups findings by category
const findingsByCategory = findings.reduce((acc, finding) => {
  const cat = finding.category || 'other'
  if (!acc[cat]) acc[cat] = []
  acc[cat].push(finding)
  return acc
}, {})

// Sorts categories by severity
const sortedCategories = Object.keys(findingsByCategory).sort((a, b) => {
  return getMaxSeverityScore(findingsByCategory[b]) - getMaxSeverityScore(findingsByCategory[a])
})
```

**File Location**: `src/components/AnalysisResults.tsx`

---

#### AnalysisHistory.tsx

**Purpose**: Lists past analyses with quick access

**Features**:
- Chronological list of analyses
- Risk level badges
- Extension metadata
- Click to load full results

**Database Query**:
```typescript
const { data } = await supabase
  .from('extension_analyses')
  .select('*')
  .order('created_at', { ascending: false })
  .limit(20)
```

**File Location**: `src/components/AnalysisHistory.tsx`

---

### Backend (Edge Function)

#### Main Analysis Flow

The edge function is a single TypeScript file with modular functions:

**Entry Point**: `Deno.serve(async (req: Request) => { ... })`

**Function Modules**:

1. **extractExtensionId(url)**
   - Parses Chrome Web Store URL
   - Validates extension ID format (32 lowercase letters)
   - Returns: `string | null`

2. **extractZipFromCrx(crxData)**
   - Detects CRX version (v2 or v3)
   - Parses binary header
   - Extracts ZIP payload
   - Returns: `Uint8Array`

3. **extractFiles(zipData)**
   - Unzips extension files
   - Stores in memory Map
   - Returns: `Map<filename, Uint8Array>`

4. **analyzePermissions(manifest, findings)**
   - Checks manifest.permissions array
   - Matches against dangerous permission list
   - Triggers: PERM-1 through PERM-6
   - Mutates: `findings` array

5. **analyzeAllFiles(files, manifest, findings, iocs, skippedFiles)**
   - Iterates through all files
   - Identifies script files from manifest
   - Calls specific analyzers per file type
   - Handles file size limits
   - Mutates: `findings`, `iocs`, `skippedFiles` arrays

6. **analyzeJavaScript(filename, code, findings, iocs, allExtensionIds)**
   - Regex pattern matching for suspicious code
   - Multi-condition detection (e.g., API-1)
   - Extracts extension IDs for ANALYSIS-2
   - Triggers: API-*, DYN-*, ANALYSIS-* rules
   - Mutates: `findings`, `iocs`, `allExtensionIds` arrays

7. **analyzeHTML(filename, html, findings, iocs)**
   - Extracts inline scripts
   - Calls analyzeJavaScript on script content
   - Extracts IOCs from HTML

8. **extractIOCsFromText(text, sourceFile, iocs, findings)**
   - URL regex extraction
   - Domain whitelisting check
   - IP address detection (NET-1)
   - Suspicious TLD detection (NET-2)
   - Mutates: `iocs`, `findings` arrays

9. **analyzeManifestDeep(manifest, findings)**
   - CSP analysis (MAN-1)
   - externally_connectable check (MAN-2)
   - Manifest v2 vs v3 specific checks
   - Mutates: `findings` array

10. **analyzeBehaviorPatterns(manifest, findings, iocs)**
    - High-level threat detection
    - Combines multiple indicators
    - Detects: session theft, keylogger, proxy hijack
    - Returns: `{ flags: BehaviorFlag[], findings: SecurityFinding[] }`

11. **calculateObfuscationScore(files)**
    - Per-file analysis of JS files
    - Metrics: line length, entropy, density, whitespace
    - Returns: 0-100 score

12. **calculateFileHashes(files, manifest)**
    - SHA-256 hashing of manifest and key scripts
    - Returns: `Record<filename, hash>`

13. **calculateRiskScore(findings, behaviorFlags, obfuscationScore)**
    - Severity × Confidence weighting
    - Adds behavior flag scores
    - Adds obfuscation contribution
    - Returns: 0-100 risk score

**File Location**: `supabase/functions/analyze-extension/index.ts`

---

## Database Schema

### extension_analyses

**Purpose**: Stores complete analysis results and metadata

```sql
CREATE TABLE extension_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id text NOT NULL,
  extension_name text,
  extension_version text,
  extension_url text,
  risk_score integer,
  risk_level text,
  manifest_data jsonb,
  analysis_summary text,
  file_hashes jsonb,
  behavior_flags jsonb,
  obfuscation_score integer,
  total_files_scanned integer,
  skipped_files jsonb,
  scan_duration_ms integer,
  files_skipped_count integer,
  created_at timestamptz DEFAULT now()
);
```

**Indexes**:
- `idx_analyses_extension_id` on `extension_id`
- `idx_analyses_risk_level` on `risk_level`
- `idx_analyses_created_at` on `created_at DESC`

**RLS Policy**:
```sql
-- Users can read all analyses (public data for demo)
CREATE POLICY "Allow public read" ON extension_analyses
  FOR SELECT TO public USING (true);
```

---

### security_findings

**Purpose**: Individual security issues detected during analysis

```sql
CREATE TABLE security_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES extension_analyses(id) ON DELETE CASCADE,
  rule_id text,
  category text,
  severity text,
  confidence text DEFAULT 'medium',
  title text,
  description text,
  evidence text,
  file_path text,
  created_at timestamptz DEFAULT now()
);
```

**Indexes**:
- `idx_findings_analysis_id` on `analysis_id`
- `idx_findings_severity` on `severity`
- `idx_findings_rule_id` on `rule_id`
- `idx_findings_confidence` on `confidence`

**RLS Policy**:
```sql
CREATE POLICY "Allow public read" ON security_findings
  FOR SELECT TO public USING (true);
```

---

### extension_iocs

**Purpose**: Indicators of compromise (URLs, domains, IPs)

```sql
CREATE TABLE extension_iocs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES extension_analyses(id) ON DELETE CASCADE,
  ioc_type text,
  ioc_value text,
  source_file text,
  context text,
  created_at timestamptz DEFAULT now()
);
```

**Indexes**:
- `idx_iocs_analysis_id` on `analysis_id`
- `idx_iocs_type` on `ioc_type`
- `idx_iocs_value` on `ioc_value`

**RLS Policy**:
```sql
CREATE POLICY "Allow public read" ON extension_iocs
  FOR SELECT TO public USING (true);
```

---

## Edge Function Architecture

### Execution Environment

- **Runtime**: Deno 1.x (JavaScript/TypeScript runtime)
- **Memory**: 512MB per invocation
- **Timeout**: 150 seconds max
- **Concurrency**: Automatic scaling based on load

### Dependencies

```typescript
import { createClient } from "npm:@supabase/supabase-js@2.57.4"
import JSZip from "npm:jszip@3.10.1"
```

All dependencies are fetched via npm: specifier at runtime (no node_modules).

### Error Handling

```typescript
try {
  // Analysis logic
} catch (error) {
  console.error("Error:", error)
  return new Response(
    JSON.stringify({ error: error.message || "Internal server error" }),
    { status: 500, headers: corsHeaders }
  )
}
```

### CORS Configuration

All responses include CORS headers to allow frontend access:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
}

// OPTIONS preflight
if (req.method === "OPTIONS") {
  return new Response(null, { status: 200, headers: corsHeaders })
}
```

### Authentication

```typescript
const authHeader = req.headers.get("Authorization")
if (!authHeader) {
  return new Response(
    JSON.stringify({ error: "Authentication required" }),
    { status: 401, headers: corsHeaders }
  )
}
```

Frontend sends: `Authorization: Bearer {VITE_SUPABASE_ANON_KEY}`

### Service Role Access

Edge function uses service role key for database writes:

```typescript
const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const supabase = createClient(supabaseUrl, supabaseKey)
```

This bypasses RLS policies for inserting analysis data.

---

## Frontend Architecture

### Build System

**Vite Configuration** (`vite.config.ts`):
```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  }
})
```

### State Management

No Redux/Context - uses React hooks for simple state:

```typescript
// Local component state
const [data, setData] = useState(null)

// Supabase client as singleton
import { supabase } from './supabaseClient'
```

### Styling

**Tailwind CSS** for utility-first styling:
- `tailwind.config.js`: Theme configuration
- `src/index.css`: Global styles + Tailwind imports

### API Communication

Direct Supabase client calls:

```typescript
// Edge function
const response = await fetch(`${supabaseUrl}/functions/v1/analyze-extension`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${supabaseAnonKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ extensionUrl })
})

// Database query
const { data, error } = await supabase
  .from('extension_analyses')
  .select('*')
  .eq('id', analysisId)
  .single()
```

---

## Security Model

### Row Level Security (RLS)

All tables have RLS enabled with public read policies (for demo purposes).

**Production Recommendation**:
```sql
-- Restrict to authenticated users
CREATE POLICY "Users can read own analyses" ON extension_analyses
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Add user_id column
ALTER TABLE extension_analyses ADD COLUMN user_id uuid REFERENCES auth.users(id);
```

### API Key Security

- **Anon Key**: Safe to expose in frontend (limited permissions)
- **Service Role Key**: Server-only, never exposed to client
- **Environment Variables**: Stored in `.env`, never committed

### Input Validation

```typescript
// URL validation
const extensionId = extractExtensionId(url)
if (!extensionId) {
  return error("Invalid Chrome Web Store URL")
}

// File size limits
if (crxData.byteLength > MAX_FILE_SIZE) {
  return error("Extension too large")
}
```

### SQL Injection Prevention

Supabase client uses parameterized queries automatically:

```typescript
// Safe - parameters are escaped
await supabase
  .from('extension_analyses')
  .insert({ extension_id: userInput })
```

---

## Performance Considerations

### Frontend Optimizations

1. **Lazy Loading**: Components load on demand
2. **Memoization**: Expensive calculations cached
3. **Virtual Scrolling**: For large finding lists
4. **Debouncing**: Input fields debounced

### Backend Optimizations

1. **Streaming**: Large files processed in chunks
2. **Early Exit**: Skip non-analyzable files immediately
3. **Parallel Analysis**: Independent files could be analyzed concurrently (future)
4. **Size Limits**: Prevent OOM with MAX_FILE_SIZE

### Database Optimizations

1. **Indexes**: All foreign keys and common queries indexed
2. **Batch Inserts**: Findings inserted in bulk
3. **Connection Pooling**: Supabase handles automatically
4. **Cascading Deletes**: ON DELETE CASCADE for cleanup

### Caching Strategy

Currently no caching implemented. **Future optimization**:

```typescript
// Check if extension already analyzed recently
const { data: existing } = await supabase
  .from('extension_analyses')
  .select('*')
  .eq('extension_id', extensionId)
  .gte('created_at', new Date(Date.now() - 24*60*60*1000).toISOString())
  .single()

if (existing) {
  return cached(existing.id)
}
```

---

## Scalability

### Current Limits

- **Concurrent requests**: Limited by Supabase plan (1-10 concurrent edge functions)
- **Database connections**: Pooled, scales with plan
- **Storage**: Analysis data grows ~10KB per extension
- **Compute**: Each analysis takes 5-30 seconds

### Scaling Strategies

**Horizontal Scaling**:
- Edge functions auto-scale with load
- Add read replicas for database
- Use CDN for static assets

**Vertical Scaling**:
- Upgrade Supabase plan for more compute
- Increase database resources

**Optimization**:
- Implement caching layer (Redis)
- Use message queue for async processing (Bull/BullMQ)
- Pre-compute common analyses
- Batch similar extensions

### Cost Estimation

**Supabase Pro Plan** ($25/mo):
- 500K edge function invocations
- 8GB database storage
- 100GB bandwidth

**Per-Analysis Cost**:
- Compute: ~$0.0001 (5-30 sec execution)
- Storage: ~10KB per analysis
- Bandwidth: ~1-5MB download from Chrome Web Store

**At Scale** (1000 analyses/day):
- Monthly compute: ~$3
- Monthly storage: ~300MB
- Monthly bandwidth: ~150GB

---

## Monitoring & Debugging

### Logs

**Edge Function Logs**:
```bash
# View in Supabase Dashboard > Edge Functions > Logs
# Or via CLI:
supabase functions logs analyze-extension
```

**Database Logs**:
```bash
# Query slow queries
SELECT * FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### Error Tracking

Edge function errors logged to console:
```typescript
console.error("Database error:", analysisError)
console.log(`Analyzing extension: ${extensionId}`)
```

### Performance Monitoring

Track scan duration:
```typescript
const scanStartTime = Date.now()
// ... analysis ...
const scanDuration = Date.now() - scanStartTime

// Stored in database
scan_duration_ms: scanDuration
```

Query average scan times:
```sql
SELECT
  AVG(scan_duration_ms) as avg_duration,
  MAX(scan_duration_ms) as max_duration,
  COUNT(*) as total_scans
FROM extension_analyses
WHERE created_at > now() - interval '24 hours';
```

---

## Development Workflow

### Local Development

1. **Start dev server**:
   ```bash
   npm run dev
   ```

2. **Edge function runs on Supabase** (already deployed)

3. **Database changes**:
   - Create migration file in `supabase/migrations/`
   - Apply migration (automatic via MCP tool)

### Testing

**Manual Testing**:
1. Analyze known-safe extension
2. Analyze known-malicious extension (from research)
3. Verify findings match expected rules
4. Check performance (scan duration < 30s)

**Database Testing**:
```sql
-- Verify indexes exist
SELECT * FROM pg_indexes WHERE tablename IN ('extension_analyses', 'security_findings', 'extension_iocs');

-- Check RLS policies
SELECT * FROM pg_policies;
```

### Deployment

**Frontend**:
```bash
npm run build
# Deploy dist/ to hosting provider
```

**Edge Function**:
- Automatically deployed on file save
- No manual deployment needed

**Database**:
- Migrations applied via MCP tool
- Schema changes immediate

---

## Future Enhancements

### Planned Features

1. **Real-time Analysis**: WebSocket progress updates
2. **Comparison Mode**: Compare two versions of same extension
3. **Bulk Analysis**: Analyze multiple extensions
4. **API Access**: RESTful API for programmatic analysis
5. **Scheduled Scans**: Re-analyze extensions daily/weekly
6. **Threat Feed**: Export IOCs to SIEM/TIP systems

### Technical Debt

1. **Testing**: Add unit tests for detection rules
2. **Caching**: Implement Redis cache for repeat analyses
3. **Queue**: Use message queue for async processing
4. **Auth**: Add proper user authentication and authorization
5. **Rate Limiting**: Prevent abuse with rate limits

---

## Troubleshooting Guide

### Common Issues

**Edge Function Timeout**:
- Reduce MAX_FILE_SIZE
- Skip more file types
- Optimize regex patterns

**Database Connection Error**:
- Check `.env` file
- Verify RLS policies
- Confirm service role key access

**Build Failures**:
- Run `npm install`
- Check TypeScript errors with `npm run typecheck`
- Clear node_modules and reinstall

**Missing Findings**:
- Check if rules apply to extension
- Review skipped_files in results
- Verify detection logic in edge function

---

## References

- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Deno Runtime Docs](https://deno.land/manual)
- [React Docs](https://react.dev)
- [Chrome Extension Manifest](https://developer.chrome.com/docs/extensions/mv3/manifest/)

---

For rule documentation, see [RULES.md](RULES.md).
For configuration options, see [CONFIGURATION.md](CONFIGURATION.md).
