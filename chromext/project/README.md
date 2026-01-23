# Chrome Extension Malware Analyzer

A production-ready, research-based malware detection system for Chrome extensions. Analyzes extensions from the Chrome Web Store using advanced heuristics inspired by real-world malware campaigns.

## Overview

This tool downloads and analyzes Chrome extensions to detect malicious behaviors including:
- **Session hijacking** - Cookie exfiltration and credential theft
- **Anti-analysis techniques** - Security tool detection and DevTools tampering
- **Dynamic code execution** - eval() usage and remote code loading
- **Suspicious networking** - Connections to untrusted domains
- **Dangerous permissions** - High-risk manifest permissions
- **Code obfuscation** - Heavily minified or obfuscated code

### Key Features

✅ **19 Research-Based Detection Rules** - Based on DataByCloud 1 campaign analysis
✅ **Confidence-Weighted Scoring** - Reduces false positives with multi-condition logic
✅ **Threat Intelligence** - Domain whitelisting, suspicious TLD detection
✅ **Performance Optimized** - Handles large extensions with file size limits
✅ **Full Traceability** - Rule IDs, confidence levels, and evidence snippets
✅ **Analytics Ready** - Track which rules trigger most frequently

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Supabase account (database already provisioned)

### Existing Setup (Already Configured)

1. **Clone and Install**
   ```bash
   npm install
   ```

2. **Environment Variables**
   The `.env` file contains your Supabase credentials:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```

3. **Database Setup**
   Migrations are already applied. Your database has these tables:
   - `extension_analyses` - Analysis results and metadata
   - `security_findings` - Individual security issues detected
   - `extension_iocs` - Indicators of compromise (URLs, domains)

4. **Deploy Edge Function**
   The `analyze-extension` edge function is already deployed to Supabase.

5. **Run the App**
   ```bash
   npm run dev
   ```

6. **Build for Production**
   ```bash
   npm run build
   ```

---

## 🚀 Manual Setup (New Project / Migration)

**Setting up from scratch or migrating to a new Supabase account?**

See the complete step-by-step guide: **[SETUP.md](SETUP.md)**

This guide covers:
- ✅ GitHub repository setup
- ✅ Creating new Supabase project from scratch
- ✅ Running all database migrations manually
- ✅ Deploying edge functions (CLI and manual methods)
- ✅ Environment variable configuration
- ✅ Full verification checklist
- ✅ Production deployment options
- ✅ Troubleshooting common issues

**Perfect for:**
- Moving to a different Bolt account
- Setting up on your own infrastructure
- Team members joining the project
- Creating a development/staging environment

---

## Project Structure

```
├── src/
│   ├── components/
│   │   ├── AnalysisResults.tsx    # Displays scan results with rule IDs
│   │   └── AnalysisHistory.tsx    # Shows past analyses
│   ├── App.tsx                     # Main application component
│   └── main.tsx                    # Application entry point
├── supabase/
│   ├── migrations/                 # Database schema migrations
│   │   ├── 20260116031036_create_extension_analyzer_schema.sql
│   │   ├── 20260116054141_add_iocs_and_file_hashes.sql
│   │   └── 20260117063720_add_rule_tracking_and_performance.sql
│   └── functions/
│       └── analyze-extension/      # Edge function for analysis
│           └── index.ts            # Main analysis logic + rule definitions
├── RULES.md                        # Detailed rule documentation
├── ARCHITECTURE.md                 # System architecture guide
└── CONFIGURATION.md                # Configuration reference
```

## Key Files and Their Purpose

### Frontend Components

**`src/App.tsx`**
- Main application UI
- Handles extension URL submission
- Coordinates analysis workflow
- Displays loading states and errors

**`src/components/AnalysisResults.tsx`**
- Displays detailed analysis results
- Shows security findings grouped by category
- Renders rule IDs, confidence badges, severity indicators
- Expandable finding details with evidence and file paths
- IOC table with URLs and domains
- Behavior flags and risk scoring

**`src/components/AnalysisHistory.tsx`**
- Lists previous analyses from database
- Allows users to view past scans
- Shows risk levels and timestamps
- Clickable rows to load full results

### Backend (Edge Function)

**`supabase/functions/analyze-extension/index.ts`**
- **Lines 59-220**: Rule definitions (RULE_DEFINITIONS object)
- **Lines 229-451**: Main analysis orchestration
- **Lines 453-520**: CRX file parsing and ZIP extraction
- **Lines 537-664**: File analysis (permissions, JavaScript, HTML)
- **Lines 666-786**: JavaScript pattern detection (API-1, API-2, DYN-1, etc.)
- **Lines 807-855**: IOC extraction and network analysis (NET-1, NET-2)
- **Lines 867-906**: Manifest deep analysis (MAN-1, MAN-2)
- **Lines 908-987**: Behavior pattern analysis (session theft, keylogger detection)
- **Lines 989-1061**: Obfuscation scoring and entropy calculation
- **Lines 1098-1153**: Risk scoring and summary generation

### Database Migrations

**`create_extension_analyzer_schema.sql`**
- Creates core tables: `extension_analyses`, `security_findings`
- Sets up RLS policies for secure access
- Defines indexes for performance

**`add_iocs_and_file_hashes.sql`**
- Adds `extension_iocs` table for URL/domain tracking
- Adds `file_hashes` and `behavior_flags` columns

**`add_rule_tracking_and_performance.sql`**
- Adds `rule_id` and `confidence` to findings
- Adds performance tracking: `scan_duration_ms`, `skipped_files`
- Creates indexes on `rule_id` and `confidence` for analytics

## How to Use

1. **Navigate to the app** at `http://localhost:5173`
2. **Find a Chrome extension** on the Chrome Web Store
3. **Copy the extension URL** (format: `https://chromewebstore.google.com/detail/name/[32-char-id]`)
4. **Paste the URL** into the analyzer
5. **Click "Analyze Extension"**
6. **Review the results**:
   - Overall risk score (0-100)
   - Security findings with rule IDs
   - Confidence levels (High/Medium/Low)
   - IOCs (URLs, domains)
   - Behavior flags

## Detection Rules

The system uses 19 detection rules across 7 categories:

| Category | Rule ID | Severity | Description |
|----------|---------|----------|-------------|
| Code Patterns | API-1 | Critical | Session cookie exfiltration |
| Code Patterns | API-2 | Medium | Direct cookie access |
| Code Patterns | API-3 | Medium | Credential scraping |
| Code Patterns | DYN-1 | High | Dynamic code execution (eval) |
| Code Patterns | DYN-2 | Critical | Fetch-and-eval remote code |
| Permissions | PERM-1 | High | Cookies permission |
| Permissions | PERM-2 | High | Management permission |
| Permissions | PERM-3 | Critical | Debugger permission |
| Permissions | PERM-4 | Critical | Proxy permission |
| Permissions | PERM-5 | Critical | WebRequest blocking |
| Permissions | PERM-6 | High | Broad host permissions |
| Anti-Analysis | ANALYSIS-1 | High | Extension enumeration |
| Anti-Analysis | ANALYSIS-2 | High | Security tool blacklist |
| Anti-Analysis | ANALYSIS-3 | High | DevTools tampering |
| Network | NET-1 | High | Suspicious external domain (IP) |
| Network | NET-2 | Medium | High-risk TLD |
| Manifest | MAN-1 | High | Insecure CSP |
| Manifest | MAN-2 | Medium | Broad externally_connectable |
| Obfuscation | OBF-1 | Medium | Heavily obfuscated code |

For detailed rule documentation, see [RULES.md](RULES.md).

## Risk Scoring

Risk scores are calculated using confidence-weighted severity:

```
Score = Σ(severity_points × confidence_multiplier) + (obfuscation_score × 0.3)
```

**Severity Points:**
- Critical: 50 points
- High: 30 points
- Medium: 15 points
- Low: 5 points

**Confidence Multipliers:**
- High: 1.0x (100%)
- Medium: 0.7x (70%)
- Low: 0.4x (40%)

**Risk Levels:**
- 80-100: Critical (Red)
- 60-79: High (Orange)
- 30-59: Medium (Yellow)
- 0-29: Low (Green)

## Configuration

### Performance Limits

Edit `supabase/functions/analyze-extension/index.ts`:

```typescript
const MAX_FILE_SIZE = 50 * 1024 * 1024;           // 50MB total
const MAX_INDIVIDUAL_FILE_SIZE = 500 * 1024;      // 500KB per file
const DOWNLOAD_TIMEOUT = 30000;                    // 30 seconds
```

### Domain Whitelisting

Add trusted domains to avoid false positives:

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

### Suspicious TLDs

Customize high-risk top-level domains:

```typescript
const SUSPICIOUS_TLDS = ['.xyz', '.top', '.tk', '.ml', '.ga', '.cf', '.gq', '.pw', '.cc'];
```

For more configuration options, see [CONFIGURATION.md](CONFIGURATION.md).

## Database Schema

### `extension_analyses`
Stores complete analysis results.

**Key Columns:**
- `id` - Unique analysis ID
- `extension_id` - Chrome extension ID (32 chars)
- `extension_name`, `extension_version` - Metadata
- `risk_score` (0-100), `risk_level` (low/medium/high/critical)
- `manifest_data` - Full manifest JSON
- `file_hashes` - SHA-256 hashes of key files
- `behavior_flags` - High-level threat indicators
- `obfuscation_score` - Code complexity metric
- `scan_duration_ms` - Performance tracking
- `skipped_files` - Files too large to analyze

### `security_findings`
Individual security issues detected.

**Key Columns:**
- `analysis_id` - Foreign key to analysis
- `rule_id` - Detection rule (API-1, PERM-2, etc.)
- `category` - Finding type (permissions, code_patterns, etc.)
- `severity` - low/medium/high/critical
- `confidence` - low/medium/high
- `title`, `description` - Human-readable details
- `evidence` - Code snippet or pattern matched
- `file_path` - Source file location

### `extension_iocs`
Indicators of compromise (URLs, domains).

**Key Columns:**
- `analysis_id` - Foreign key
- `ioc_type` - url, domain, ip_address
- `ioc_value` - The actual IOC
- `source_file` - Where it was found
- `context` - Surrounding code

## Adding New Detection Rules

1. **Define the rule** in `RULE_DEFINITIONS` object:
   ```typescript
   "NEW-1": {
     id: "NEW-1",
     severity: "high",
     confidence: "high",
     category: "code_patterns",
     title: "Your Rule Title",
     description: "What this rule detects"
   }
   ```

2. **Implement detection logic** in the appropriate function:
   - JavaScript patterns → `analyzeJavaScript()`
   - Permissions → `analyzePermissions()`
   - Manifest → `analyzeManifestDeep()`
   - Network → `extractIOCsFromText()`

3. **Add finding when detected**:
   ```typescript
   const rule = RULE_DEFINITIONS["NEW-1"];
   findings.push({
     rule_id: "NEW-1",
     category: rule.category,
     severity: rule.severity,
     confidence: rule.confidence,
     title: rule.title,
     description: rule.description,
     evidence: "matched pattern",
     file_path: filename,
   });
   ```

4. **Deploy the updated function**:
   The edge function is automatically deployed when you save changes.

5. **Update frontend styling** (optional):
   Add category colors in `AnalysisResults.tsx` if using a new category.

## Troubleshooting

### Extension Download Fails
- **Error**: "Extension not found or unavailable"
- **Solution**: Ensure the extension is publicly available on Chrome Web Store
- **Check**: Extension ID is exactly 32 lowercase letters

### Database Connection Errors
- **Error**: "Authentication required"
- **Solution**: Verify `.env` file has correct Supabase credentials
- **Check**: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set

### Edge Function Timeout
- **Error**: Function times out on large extensions
- **Solution**: Reduce `MAX_FILE_SIZE` or `MAX_INDIVIDUAL_FILE_SIZE`
- **Note**: Files over limit are automatically skipped with PERF-1 finding

### No Findings Detected
- **Possible reasons**:
  - Extension is legitimate and safe
  - Detection rules need tuning for new malware patterns
  - Extension uses obfuscation that bypasses regex patterns
- **Solution**: Review IOCs and behavior flags for subtle indicators

### Build Errors
- **Error**: TypeScript compilation fails
- **Solution**: Run `npm install` to ensure all dependencies are installed
- **Check**: Node version is 18+ with `node --version`

## Development

### Running Tests
```bash
npm run lint      # Check code style
npm run typecheck # Verify TypeScript types
```

### Local Development
```bash
npm run dev       # Start dev server on http://localhost:5173
```

### Database Changes
To modify the database schema, use the Supabase migration tool:

1. Create new migration file in `supabase/migrations/`
2. Apply with the naming convention: `YYYYMMDDHHMMSS_description.sql`
3. Use `IF NOT EXISTS` checks to make migrations idempotent
4. Always enable RLS on new tables

### Edge Function Development
Edit `supabase/functions/analyze-extension/index.ts` and the function auto-deploys on save.

**Best practices:**
- Always handle errors gracefully
- Return CORS headers on all responses
- Use `try/catch` blocks for parsing operations
- Log debug info with `console.log()` for troubleshooting

## Security Considerations

### Row Level Security (RLS)
All database tables have RLS enabled. Policies ensure:
- Users can only read their own analyses
- No unauthorized access to findings or IOCs
- Service role key used in edge function for full access

### API Keys
- Never commit `.env` file to version control
- Use anon key for frontend (limited permissions)
- Service role key only in secure edge functions

### Input Validation
- Extension URLs validated with regex
- File size limits prevent DoS attacks
- Timeouts prevent infinite loops

## Performance

### Scan Times
Typical scan duration:
- Small extensions (< 1MB): 2-5 seconds
- Medium extensions (1-10MB): 5-15 seconds
- Large extensions (10-50MB): 15-30 seconds

### Optimization Tips
- Files > 500KB are skipped automatically
- Only JS, HTML, and JSON files are analyzed
- IOC extraction uses optimized regex patterns
- Obfuscation scoring limited to first 10KB of code

## Research Background

This analyzer is based on research into real-world malware campaigns:

- **DataByCloud 1 Campaign** - Session hijacking via cookie exfiltration
- **Extension Enumeration** - Anti-analysis via chrome.management API
- **Dynamic Code Loading** - Remote code execution via fetch + eval
- **DevTools Tampering** - DisableDevTool library detection

Detection rules are designed to catch sophisticated evasion techniques while minimizing false positives through multi-condition logic.

## Contributing

See detailed architecture and contribution guidelines:
- [ARCHITECTURE.md](ARCHITECTURE.md) - System design and data flow
- [RULES.md](RULES.md) - Complete rule reference
- [CONFIGURATION.md](CONFIGURATION.md) - All configurable options

## License

This project is for educational and research purposes. Always obtain proper authorization before analyzing extensions you don't own.

## Support

For issues or questions:
1. Check [ARCHITECTURE.md](ARCHITECTURE.md) for system internals
2. Review [RULES.md](RULES.md) for rule logic
3. See [CONFIGURATION.md](CONFIGURATION.md) for adjustments
4. Check browser console for client-side errors
5. Check Supabase logs for edge function errors
