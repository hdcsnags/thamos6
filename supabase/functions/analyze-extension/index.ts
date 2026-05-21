import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import JSZip from "npm:jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_INDIVIDUAL_FILE_SIZE = 2 * 1024 * 1024;
const SCAN_TIMEOUT_MS_SMALL = 250;
const SCAN_TIMEOUT_MS_LARGE = 1000;
const LARGE_FILE_THRESHOLD = 100 * 1024;
const DOWNLOAD_TIMEOUT = 45000;

interface AnalysisRequest {
  extensionUrl: string;
}

interface SecurityFinding {
  rule_id?: string;
  category: string;
  severity: string;
  confidence?: string;
  title: string;
  description: string;
  evidence: string;
  file_path: string;
}

interface IOC {
  ioc_type: string;
  ioc_value: string;
  source_file: string;
  context: string;
}

interface BehaviorFlag {
  flag_type: string;
  severity: string;
  description: string;
  evidence: string[];
}

interface SkippedFile {
  file: string;
  reason: string;
  size?: number;
}

interface Rule {
  id: string;
  severity: string;
  confidence: string;
  category: string;
  title: string;
  description: string;
}

const RULE_DEFINITIONS: Record<string, Rule> = {
  "API-1": {
    id: "API-1",
    severity: "critical",
    confidence: "high",
    category: "code_patterns",
    title: "Session Cookie Exfiltration",
    description: "Extension reads authentication cookies and sends them to a remote server - possible session hijacking"
  },
  "API-2": {
    id: "API-2",
    severity: "medium",
    confidence: "medium",
    category: "code_patterns",
    title: "Direct Cookie Access",
    description: "Extension accesses document.cookie which may be used to scrape session tokens"
  },
  "API-3": {
    id: "API-3",
    severity: "medium",
    confidence: "medium",
    category: "code_patterns",
    title: "Credential Scraping Behavior",
    description: "Extension script reads input fields that may contain passwords or credentials"
  },
  "PERM-1": {
    id: "PERM-1",
    severity: "high",
    confidence: "medium",
    category: "permissions",
    title: "High-Risk Permission: cookies",
    description: "Manifest requests 'cookies' permission, allowing access to all website cookies (session tokens)"
  },
  "PERM-2": {
    id: "PERM-2",
    severity: "high",
    confidence: "high",
    category: "permissions",
    title: "High-Risk Permission: management",
    description: "Manifest requests 'management' permission to control or query other installed extensions"
  },
  "PERM-3": {
    id: "PERM-3",
    severity: "critical",
    confidence: "high",
    category: "permissions",
    title: "High-Risk Permission: debugger",
    description: "Manifest requests 'debugger' permission - extremely high risk, allows attaching to devtools targets"
  },
  "PERM-4": {
    id: "PERM-4",
    severity: "critical",
    confidence: "high",
    category: "permissions",
    title: "High-Risk Permission: proxy",
    description: "Manifest requests 'proxy' permission, allowing control of browser proxy settings"
  },
  "PERM-5": {
    id: "PERM-5",
    severity: "critical",
    confidence: "high",
    category: "permissions",
    title: "High-Risk Permission: webRequestBlocking",
    description: "Can intercept and modify all web traffic with blocking capabilities"
  },
  "PERM-6": {
    id: "PERM-6",
    severity: "high",
    confidence: "high",
    category: "permissions",
    title: "Broad Host Permissions",
    description: "Extension requests access to all websites via wildcard host permissions"
  },
  "ANALYSIS-1": {
    id: "ANALYSIS-1",
    severity: "high",
    confidence: "high",
    category: "anti-analysis",
    title: "Extension Enumeration Detected",
    description: "Uses chrome.management API to list installed extensions (likely checking for security tools)"
  },
  "ANALYSIS-2": {
    id: "ANALYSIS-2",
    severity: "high",
    confidence: "high",
    category: "anti-analysis",
    title: "Security Tool Blacklist in Code",
    description: "Found hardcoded list of extension IDs (likely security or admin tools) that the code checks for"
  },
  "ANALYSIS-3": {
    id: "ANALYSIS-3",
    severity: "high",
    confidence: "high",
    category: "anti-analysis",
    title: "DevTools Anti-Inspection Script",
    description: "Includes code to detect or disable browser developer tools (anti-debugging technique)"
  },
  "DYN-1": {
    id: "DYN-1",
    severity: "high",
    confidence: "high",
    category: "code_patterns",
    title: "Dynamic Code Execution",
    description: "Uses eval() or dynamic function construction to execute code at runtime"
  },
  "DYN-2": {
    id: "DYN-2",
    severity: "critical",
    confidence: "high",
    category: "code_patterns",
    title: "Fetch-and-Eval Remote Code",
    description: "Extension downloads code from a remote server and executes it dynamically"
  },
  "NET-1": {
    id: "NET-1",
    severity: "high",
    confidence: "high",
    category: "network",
    title: "Suspicious External Domain",
    description: "Code references external endpoint which may be an unauthorized server"
  },
  "NET-2": {
    id: "NET-2",
    severity: "medium",
    confidence: "medium",
    category: "network",
    title: "High-Risk TLD Detected",
    description: "Extension contacts domain with suspicious top-level domain"
  },
  "OBF-1": {
    id: "OBF-1",
    severity: "medium",
    confidence: "medium",
    category: "obfuscation",
    title: "Heavily Obfuscated Code",
    description: "Extension script appears heavily minified/obfuscated, hindering analysis"
  },
  "MAN-1": {
    id: "MAN-1",
    severity: "high",
    confidence: "high",
    category: "manifest",
    title: "Insecure Content Security Policy",
    description: "The manifest allows unsafe script execution (eval) or remote scripts"
  },
  "MAN-2": {
    id: "MAN-2",
    severity: "medium",
    confidence: "medium",
    category: "manifest",
    title: "Broad Externally Connectable",
    description: "Extension allows broad external communication via externally_connectable"
  },
  "MAN-3": {
    id: "MAN-3",
    severity: "critical",
    confidence: "high",
    category: "manifest",
    title: "MAIN World Content Script Injection",
    description: "Extension injects content scripts into the page's MAIN JavaScript world, enabling direct prototype poisoning of fetch, XMLHttpRequest, and form APIs"
  },
  "MAN-4": {
    id: "MAN-4",
    severity: "high",
    confidence: "high",
    category: "manifest",
    title: "Offscreen Document Declared",
    description: "Extension uses the MV3 offscreen document API, which can restore persistent background page capabilities and enable hidden iframe scripting or DOM scraping"
  },
  "DNR-1": {
    id: "DNR-1",
    severity: "critical",
    confidence: "high",
    category: "manifest",
    title: "Security Header Stripping via declarativeNetRequest",
    description: "Extension removes security response headers (CSP, X-Frame-Options, etc.) from visited pages using declarativeNetRequest rules"
  },
  "C2-1": {
    id: "C2-1",
    severity: "critical",
    confidence: "high",
    category: "network",
    title: "C2 Callback Pattern Detected",
    description: "Extension polls a remote server for executable JavaScript tasks — a command-and-control pattern used by ShotBird and QuickLens malware campaigns"
  },
  "C2-2": {
    id: "C2-2",
    severity: "critical",
    confidence: "medium",
    category: "network",
    title: "Bot Registration Pattern",
    description: "Extension generates or stores a UUID and sends it to a remote server during setup — consistent with bot registration in known C2 infrastructure"
  },
  "INJ-1": {
    id: "INJ-1",
    severity: "critical",
    confidence: "medium",
    category: "code_patterns",
    title: "Remote HTML Template Injection",
    description: "Extension fetches remote HTML content and injects it directly into visited pages — used to display fake Chrome update lures (ShotBird, CrashFix campaigns)"
  },
  "INJ-2": {
    id: "INJ-2",
    severity: "critical",
    confidence: "high",
    category: "code_patterns",
    title: "Native API Prototype Hijacking",
    description: "Extension overrides window.fetch, XMLHttpRequest.prototype, or form submission methods to intercept all network requests — used to steal AI chat data and credentials"
  },
  "INJ-3": {
    id: "INJ-3",
    severity: "high",
    confidence: "high",
    category: "code_patterns",
    title: "DOM Event Handler Code Execution",
    description: "Extension executes code via DOM event handler attribute injection (setAttribute + dispatchEvent) — an eval() bypass technique used to evade dynamic code detection"
  },
  "GRAB-1": {
    id: "GRAB-1",
    severity: "critical",
    confidence: "high",
    category: "code_patterns",
    title: "Financial Data Form Grabber",
    description: "Extension hooks input/textarea/select events and filters for financial and identity keywords (card numbers, CVV, IBAN, SSN, tokens) — consistent with the ShotBird superior-grabber payload"
  },
  "ANTI-4": {
    id: "ANTI-4",
    severity: "high",
    confidence: "high",
    category: "anti-analysis",
    title: "Console Method Silencing",
    description: "Extension reassigns console methods to empty functions — a near-universal technique in modern extension malware to suppress debug output and evade DevTools inspection"
  },
  "ANTI-5": {
    id: "ANTI-5",
    severity: "high",
    confidence: "medium",
    category: "anti-analysis",
    title: "Probabilistic Activation Guard",
    description: "Extension uses Math.random() as a conditional gate before executing network calls or script injection — used by DarkSpectre to activate on only ~10% of page loads, defeating automated scanners"
  },
  "ANTI-6": {
    id: "ANTI-6",
    severity: "high",
    confidence: "high",
    category: "anti-analysis",
    title: "Time-Delayed Activation",
    description: "Extension checks elapsed time since installation before activating malicious behavior — documented delays range from 10 minutes to 3 days across real campaigns, designed to outlast review windows"
  },
  "NET-3": {
    id: "NET-3",
    severity: "critical",
    confidence: "high",
    category: "network",
    title: "WebSocket C2 Channel",
    description: "Extension establishes a WebSocket connection to an external domain — used for real-time C2 command delivery, session replay for ad fraud, and persistent data exfiltration"
  },
  "NET-4": {
    id: "NET-4",
    severity: "high",
    confidence: "medium",
    category: "network",
    title: "Cloud Database Exfiltration Endpoint",
    description: "Extension communicates with Firebase Realtime Database or similar cloud storage APIs — used by DarkSpectre's Zoom Stealer to stage exfiltrated meeting data"
  },
  "NET-5": {
    id: "NET-5",
    severity: "high",
    confidence: "medium",
    category: "network",
    title: "Geolocation Fingerprinting",
    description: "Extension queries Cloudflare's trace endpoint (1.1.1.1/cdn-cgi/trace) or similar IP geolocation services to determine victim location before activating payloads — used for country-targeted attack activation"
  },
  "PERF-1": {
    id: "PERF-1",
    severity: "low",
    confidence: "high",
    category: "performance",
    title: "Files Skipped During Scan",
    description: "Some files were too large or timed out during analysis"
  },
  "VULN-1": {
    id: "VULN-1",
    severity: "high",
    confidence: "high",
    category: "dependencies",
    title: "Vulnerable JavaScript Library (retire.js)",
    description: "Extension bundles a known-vulnerable version of a JavaScript library"
  },
  "VULN-2": {
    id: "VULN-2",
    severity: "high",
    confidence: "high",
    category: "dependencies",
    title: "OSV Vulnerability in npm Dependency",
    description: "A dependency declared in package.json has a known security vulnerability in OSV.dev"
  },
  "DELTA-1": {
    id: "DELTA-1",
    severity: "high",
    confidence: "high",
    category: "delta",
    title: "Manifest Metadata Changed",
    description: "Extension name, description, or permissions changed since last scan — supply chain or update attack indicator"
  },
  "MALEXT-1": {
    id: "MALEXT-1",
    severity: "critical",
    confidence: "high",
    category: "blocklist",
    title: "Confirmed Removed from Chrome Web Store",
    description: "This extension was removed from the Chrome Web Store and appears in the MalExt malicious extensions database"
  },
  "AI-DATA-1": {
    id: "AI-DATA-1",
    severity: "medium",
    confidence: "high",
    category: "ai_data_flow",
    title: "External AI Vendor Endpoint Detected",
    description: "Extension communicates with a known external AI inference API — data sent may leave organizational control"
  },
  "AI-DATA-2": {
    id: "AI-DATA-2",
    severity: "low",
    confidence: "high",
    category: "ai_data_flow",
    title: "Educational Content Platform Scope",
    description: "Extension requests access to educational platforms (Classroom, Canvas, LMS, Docs, SharePoint)"
  },
  "AI-DATA-3": {
    id: "AI-DATA-3",
    severity: "high",
    confidence: "high",
    category: "ai_data_flow",
    title: "User Content Transfer Capability",
    description: "Extension can read page/document content via DOM access permissions and transmit it to external AI services"
  },
  "AI-DATA-4": {
    id: "AI-DATA-4",
    severity: "critical",
    confidence: "high",
    category: "ai_data_flow",
    title: "Shadow AI Governance Risk",
    description: "Extension routes educational content platforms to external AI vendor APIs outside approved provider governance controls"
  },
  "AI-DATA-5": {
    id: "AI-DATA-5",
    severity: "critical",
    confidence: "high",
    category: "ai_data_flow",
    title: "Full Document Workspace Exposure",
    description: "Extension has scripting access to full document workspaces (Docs, SharePoint) and can transmit complete document contents to external AI services"
  },
};

// --- AI Data Flow Governance Detection ---

const AI_VENDOR_DOMAINS = [
  'api.openai.com', 'chat.openai.com', 'chatgpt.com',
  'api.anthropic.com', 'claude.ai',
  'generativelanguage.googleapis.com', 'aistudio.google.com', 'gemini.google.com',
  'api.cohere.ai', 'cohere.com',
  'api-inference.huggingface.co', 'huggingface.co',
  'api.perplexity.ai', 'perplexity.ai',
  'api.mistral.ai', 'mistral.ai',
  'api.together.xyz', 'together.ai',
  'api.replicate.com', 'replicate.com',
  'grammarly.com', 'extension-api.grammarly.com',
  'api.writesonic.com', 'writesonic.com',
  'api.jasper.ai', 'jasper.ai',
  'api.copy.ai', 'copy.ai',
  'character.ai', 'neo.character.ai',
  'api.stability.ai', 'stability.ai',
  'api.deepseek.com', 'deepseek.com',
  'api.groq.com', 'groq.com',
  'api.x.ai', 'x.ai',
  'copilot.microsoft.com', 'api.bing.microsoft.com',
];

const EDU_CONTENT_SURFACES = [
  'classroom.google.com',
  'docs.google.com',
  'sheets.google.com',
  'slides.google.com',
  'drive.google.com',
  'mail.google.com',
  'instructure.com',
  'canvas.com',
  'moodle.org',
  'blackboard.com',
  'brightspace.com',
  'd2l.com',
  'schoology.com',
  'powerschool.com',
  'itslearning.com',
  'edmodo.com',
  'teams.microsoft.com',
  'sharepoint.com',
  'office.com',
  'onedrive.live.com',
  'outlook.office.com',
  '.edu',
];

const DOM_ACCESS_PERMISSIONS = ['scripting', 'activetab', 'tabs', 'webnavigation'];

function checkAIDataFlow(
  manifest: any,
  iocs: IOC[],
): { findings: SecurityFinding[]; behaviorFlags: BehaviorFlag[] } {
  const findings: SecurityFinding[] = [];
  const behaviorFlags: BehaviorFlag[] = [];

  const manifestUrls: string[] = [
    ...(manifest.host_permissions || []),
    ...(manifest.content_scripts || []).flatMap((cs: any) => cs.matches || []),
    ...(manifest.permissions || []).filter((p: string) => p.startsWith('http')),
  ].map((u: string) => u.toLowerCase());

  const permissions: string[] = [
    ...(manifest.permissions || []),
    ...(manifest.optional_permissions || []),
  ].map((p: string) => p.toLowerCase());

  const detectedAIVendors = new Set<string>();
  for (const ioc of iocs) {
    if (ioc.ioc_type === 'domain' || ioc.ioc_type === 'url') {
      for (const vendor of AI_VENDOR_DOMAINS) {
        if (ioc.ioc_value.toLowerCase().includes(vendor)) detectedAIVendors.add(vendor);
      }
    }
  }
  for (const url of manifestUrls) {
    for (const vendor of AI_VENDOR_DOMAINS) {
      if (url.includes(vendor)) detectedAIVendors.add(vendor);
    }
  }

  const detectedEduSurfaces = new Set<string>();
  for (const url of manifestUrls) {
    for (const surface of EDU_CONTENT_SURFACES) {
      if (url.includes(surface)) detectedEduSurfaces.add(surface);
    }
  }

  const hasDOMAccess = permissions.some(p => DOM_ACCESS_PERMISSIONS.includes(p));
  const aiVendorList = [...detectedAIVendors];
  const eduSurfaceList = [...detectedEduSurfaces];

  if (aiVendorList.length > 0) {
    const rule = RULE_DEFINITIONS['AI-DATA-1'];
    findings.push({
      rule_id: 'AI-DATA-1',
      category: rule.category,
      severity: rule.severity,
      confidence: rule.confidence,
      title: rule.title,
      description: `Extension communicates with external AI service(s): ${aiVendorList.join(', ')}. Data sent to these services may leave organizational control.`,
      evidence: aiVendorList.join(', '),
      file_path: 'manifest.json + iocs',
    });
  }

  if (eduSurfaceList.length > 0) {
    const rule = RULE_DEFINITIONS['AI-DATA-2'];
    findings.push({
      rule_id: 'AI-DATA-2',
      category: rule.category,
      severity: rule.severity,
      confidence: rule.confidence,
      title: rule.title,
      description: `Extension requests access to educational content platforms: ${eduSurfaceList.join(', ')}.`,
      evidence: eduSurfaceList.join(', '),
      file_path: 'manifest.json',
    });
  }

  if (aiVendorList.length > 0 && hasDOMAccess) {
    const domPerms = permissions.filter(p => DOM_ACCESS_PERMISSIONS.includes(p));
    const rule = RULE_DEFINITIONS['AI-DATA-3'];
    findings.push({
      rule_id: 'AI-DATA-3',
      category: rule.category,
      severity: rule.severity,
      confidence: rule.confidence,
      title: rule.title,
      description: 'Extension can read page/document content via DOM access permissions and transmit it to external AI services.',
      evidence: `AI endpoints: ${aiVendorList.join(', ')} | DOM permissions: ${domPerms.join(', ')}`,
      file_path: 'manifest.json',
    });
  }

  if (aiVendorList.length > 0 && eduSurfaceList.length > 0) {
    const rule = RULE_DEFINITIONS['AI-DATA-4'];
    findings.push({
      rule_id: 'AI-DATA-4',
      category: rule.category,
      severity: rule.severity,
      confidence: rule.confidence,
      title: rule.title,
      description: 'Extension exposes educational content platforms to external AI vendor APIs — shadow AI data flows outside organizational governance controls.',
      evidence: `AI vendors: ${aiVendorList.join(', ')} | Edu scope: ${eduSurfaceList.join(', ')}`,
      file_path: 'manifest.json',
    });
    behaviorFlags.push({
      flag_type: 'shadow_ai_risk',
      severity: 'critical',
      description: 'Extension routes educational content platform access to external AI vendor endpoints outside approved provider governance',
      evidence: [
        ...aiVendorList.map(v => `AI vendor: ${v}`),
        ...eduSurfaceList.map(s => `Edu scope: ${s}`),
      ],
    });
  }

  const fullDocSurfaces = ['docs.google.com', 'sheets.google.com', 'slides.google.com', 'drive.google.com', 'sharepoint.com', 'onedrive.live.com', 'office.com'];
  const exposedDocSurfaces = eduSurfaceList.filter(s => fullDocSurfaces.some(fd => s.includes(fd)));
  if (aiVendorList.length > 0 && exposedDocSurfaces.length > 0 && hasDOMAccess) {
    const rule = RULE_DEFINITIONS['AI-DATA-5'];
    findings.push({
      rule_id: 'AI-DATA-5',
      category: rule.category,
      severity: rule.severity,
      confidence: rule.confidence,
      title: rule.title,
      description: 'Extension has scripting access to full document workspaces and can transmit complete document contents to external AI services.',
      evidence: `Doc surfaces: ${exposedDocSurfaces.join(', ')} | AI vendors: ${aiVendorList.join(', ')}`,
      file_path: 'manifest.json',
    });
  }

  return { findings, behaviorFlags };
}

// --- Phase 7: retire.js + OSV.dev vulnerable library detection ---

interface VulnLibResult {
  component: string;
  version: string;
  vulnerabilities: string[];
  file: string;
}

async function fetchRetireJSDb(supabase: ReturnType<typeof createClient>): Promise<Record<string, any> | null> {
  const CACHE_KEY = "retirejs_hashdb_v2";
  const SIX_HOURS = 6 * 60 * 60;

  try {
    const { data: cached } = await supabase
      .from("api_cache")
      .select("response_data, created_at")
      .eq("cache_key", CACHE_KEY)
      .maybeSingle();

    if (cached) {
      const age = (Date.now() - new Date(cached.created_at).getTime()) / 1000;
      if (age < SIX_HOURS) return cached.response_data;
    }

    const res = await fetch(
      "https://raw.githubusercontent.com/RetireJS/retire.js/master/repository/jsrepository-v2.json",
      { signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) return null;
    const db = await res.json();

    await supabase.from("api_cache").upsert({
      cache_key: CACHE_KEY,
      source: "retirejs",
      query: CACHE_KEY,
      response_data: db,
      created_at: new Date().toISOString(),
    }, { onConflict: "cache_key" });

    return db;
  } catch {
    return null;
  }
}

async function checkVulnerableLibraries(
  files: Map<string, Uint8Array>,
  supabase: ReturnType<typeof createClient>
): Promise<VulnLibResult[]> {
  const results: VulnLibResult[] = [];
  const db = await fetchRetireJSDb(supabase);
  if (!db) return results;

  const crypto = globalThis.crypto;

  for (const [filename, content] of files.entries()) {
    if (!filename.endsWith(".js")) continue;
    if (content.length > 500_000) continue; // skip huge bundles

    const hashBuf = await crypto.subtle.digest("SHA-256", content);
    const hash = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Also compute SHA-1 for retire.js compatibility
    const hash1Buf = await crypto.subtle.digest("SHA-1", content);
    const sha1 = Array.from(new Uint8Array(hash1Buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    for (const [component, info] of Object.entries(db)) {
      const entry = info as any;
      if (!entry?.vulnerabilities) continue;

      const extractors = entry.extractors?.filecontent ?? [];
      const hasHashMatch = (entry.vulnerabilities ?? []).some((vuln: any) =>
        (vuln.identifiers?.sha1 ?? []).includes(sha1) ||
        (vuln.identifiers?.sha256 ?? []).includes(hash)
      );

      // Check filename pattern match
      const filenamePatterns: RegExp[] = extractors
        .filter((e: any) => typeof e === "string" && e.startsWith("/") && e.endsWith("/"))
        .map((e: string) => { try { return new RegExp(e.slice(1, -1)); } catch { return null; } })
        .filter(Boolean);

      const filenameMatch = filenamePatterns.some((re: RegExp) => re.test(filename));

      if (!hasHashMatch && !filenameMatch) continue;

      // Extract version from file content if possible
      let version = "unknown";
      const versionExtractors = entry.extractors?.filecontent ?? [];
      const textDecoder = new TextDecoder();
      const text = textDecoder.decode(content.slice(0, 4000));
      for (const pattern of versionExtractors) {
        if (typeof pattern !== "string" || !pattern.includes("##version##")) continue;
        const regexStr = pattern.replace("##version##", "([\\d.]+)");
        try {
          const m = text.match(new RegExp(regexStr));
          if (m?.[1]) { version = m[1]; break; }
        } catch { /**/ }
      }

      const vulnIds = (entry.vulnerabilities ?? [])
        .flatMap((v: any) => [
          ...(v.identifiers?.CVE ?? []),
          ...(v.identifiers?.bug ?? []),
          v.summary,
        ])
        .filter(Boolean) as string[];

      results.push({
        component,
        version,
        vulnerabilities: [...new Set(vulnIds)].slice(0, 5),
        file: filename,
      });

      break; // one match per file is enough
    }
  }

  return results;
}

async function checkOSVPackages(files: Map<string, Uint8Array>): Promise<VulnLibResult[]> {
  const results: VulnLibResult[] = [];
  const pkgFile = files.get("package.json");
  if (!pkgFile) return results;

  try {
    const pkg = JSON.parse(new TextDecoder().decode(pkgFile));
    const allDeps: Record<string, string> = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    };

    const entries = Object.entries(allDeps).slice(0, 20);
    const responses = await Promise.allSettled(
      entries.map(async ([name, versionRange]) => {
        const version = versionRange.replace(/[\^~>=<\s]/g, "").split(".").slice(0, 3).join(".");
        try {
          const res = await fetch("https://api.osv.dev/v1/query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ package: { name, ecosystem: "npm" }, version }),
            signal: AbortSignal.timeout(5_000),
          });
          if (!res.ok) return null;
          const data = await res.json();
          if (!data.vulns?.length) return null;
          return {
            component: name,
            version,
            vulnerabilities: (data.vulns as any[]).map((v: any) => v.id).slice(0, 5),
            file: "package.json",
          };
        } catch {
          return null;
        }
      })
    );

    for (const r of responses) {
      if (r.status === "fulfilled" && r.value) results.push(r.value);
    }
  } catch { /**/ }

  return results;
}

function buildVulnFindings(vulnLibs: VulnLibResult[], ruleId: "VULN-1" | "VULN-2"): SecurityFinding[] {
  return vulnLibs.map((lib) => {
    const rule = RULE_DEFINITIONS[ruleId];
    return {
      rule_id: ruleId,
      category: rule.category,
      severity: rule.severity,
      confidence: rule.confidence,
      title: `${rule.title}: ${lib.component}`,
      description: `${lib.component}@${lib.version} — ${lib.vulnerabilities.join(", ") || "known vulnerabilities"}`,
      evidence: `File: ${lib.file}`,
      file_path: lib.file,
    };
  });
}

// --- end Phase 7 ---

async function checkMalExtBlocklist(extensionId: string): Promise<{
  hit: boolean; name?: string; reason?: string; date?: string; blocklist?: boolean;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(
      'https://raw.githubusercontent.com/toborrm9/malicious_extension_sentry/main/Malicious-Extensions.md',
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!response.ok) return { hit: false };

    const text = await response.text();
    const id = extensionId.toLowerCase();

    for (const line of text.split('\n').slice(2)) {
      const cols = line.split('|').map(c => c.trim());
      if (cols.length < 7) continue;
      if (cols[1].toLowerCase() !== id) continue;
      return {
        hit: true,
        name: cols[2],
        reason: cols[3],
        date: cols[5],
        blocklist: cols[6].toLowerCase() === 'yes',
      };
    }
    return { hit: false };
  } catch (e) {
    console.error('MalExt blocklist check failed:', e);
    return { hit: false };
  }
}

async function checkCRXplorer(extensionId: string): Promise<Record<string, unknown>> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch('https://api.crxplorer.com/api/api-scan/public', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extensionIdOrUrl: extensionId }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return { available: false, error: `HTTP ${response.status}` };
    const data = await response.json();
    const details = data?.extensionScanDetails;
    if (!details) return { available: false, error: 'No scan details returned' };

    const ea = typeof details.extensionAnalysis === 'string'
      ? JSON.parse(details.extensionAnalysis)
      : (details.extensionAnalysis ?? {});
    const ma = typeof details.manifestAnalysis === 'string'
      ? JSON.parse(details.manifestAnalysis)
      : (details.manifestAnalysis ?? {});

    return {
      available: true,
      extension_name: details.extensionName,
      version: details.version,
      logo_url: details.logoUrl ?? null,
      share_url: data.shareUrl ?? null,
      overall_score: ea?.scores?.overall ?? null,
      risk_level: ea?.riskLevel ?? null,
      should_use: ea?.userRecommendation?.shouldUse ?? null,
      reasoning: (ea?.userRecommendation?.reasoning ?? []).map((r: unknown) =>
        typeof r === 'string' ? r : (r as any)?.text ?? String(r)
      ),
      categories: ea?.scores?.categories ?? {},
      category_justifications: ea?.categoryJustifications ?? {},
      browser_impact: ea?.browserImpact ?? null,
      safety_guidelines: ea?.userSafetyGuidelines ?? null,
      permission_severity_count: ma?.permissionSeverityCount ?? {},
      detailed_permissions: ma?.permissions ?? [],
    };
  } catch (e) {
    return { available: false, error: String(e) };
  }
}

const SUSPICIOUS_TLDS = ['.xyz', '.top', '.tk', '.ml', '.ga', '.cf', '.gq', '.pw', '.cc'];
const WHITELISTED_DOMAINS = [
  'google-analytics.com', 'googleapis.com', 'gstatic.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com',
  'github.com', 'githubusercontent.com',
  'analytics.google.com', 'www.google-analytics.com',
  'firebaseinstallations.googleapis.com',
  'sentry.io', 'mixpanel.com', 'segment.com',
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const scanStartTime = Date.now();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { extensionUrl }: AnalysisRequest = await req.json();

    if (!extensionUrl) {
      return new Response(
        JSON.stringify({ error: "Extension URL is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const extensionSource = extractExtensionSource(extensionUrl);
    if (!extensionSource) {
      return new Response(
        JSON.stringify({ error: "Invalid extension URL or ID. Paste a Chrome Web Store or Microsoft Edge Add-ons URL, or a 32-character extension ID." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const extensionId = extensionSource.id;
    const extensionStore = extensionSource.store;
    console.log(`Analyzing extension: ${extensionId} (source: ${extensionStore})`);

    // MalExt only covers Chrome Web Store removals — skip for explicit Edge store sources
    const malExtPromise = extensionStore !== 'edge'
      ? checkMalExtBlocklist(extensionId)
      : Promise.resolve({ hit: false as const });

    // Try Chrome CDN first; fall back to Edge CDN (or vice-versa for explicit Edge URLs)
    const CHROME_CRX = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=120.0&acceptformat=crx3&x=id%3D${extensionId}%26installsource%3Dondemand%26uc`;
    const EDGE_CRX = `https://edge.microsoft.com/extensionwebstorebase/v1/crx?response=redirect&x=id%3D${extensionId}%26installsource%3Dondemand%26uc`;
    const crxUrlsToTry = extensionStore === 'edge' ? [EDGE_CRX, CHROME_CRX] : [CHROME_CRX, EDGE_CRX];

    let crxData: ArrayBuffer | null = null;
    let downloadedFrom = '';
    for (const crxUrl of crxUrlsToTry) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);
      try {
        const resp = await fetch(crxUrl, { redirect: "follow", signal: controller.signal });
        clearTimeout(timeoutId);
        const ct = resp.headers.get("content-type") || "";
        if (resp.ok && !ct.includes("text/html")) {
          const buf = await resp.arrayBuffer();
          if (buf.byteLength > 0) {
            crxData = buf;
            downloadedFrom = crxUrl.includes('edge.microsoft.com') ? 'edge' : 'chrome';
            break;
          }
        }
        console.log(`CRX download skipped (${resp.status}, ct=${ct}) from ${crxUrl}`);
      } catch (e) {
        clearTimeout(timeoutId);
        console.log(`CRX download error from ${crxUrl}:`, e);
      }
    }

    if (!crxData) {
      return new Response(
        JSON.stringify({ error: "Extension not found on Chrome Web Store or Microsoft Edge Add-ons" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Downloaded CRX from ${downloadedFrom}: ${crxData.byteLength} bytes`);

    if (crxData.byteLength > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: `Extension too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const zipData = extractZipFromCrx(crxData);
    console.log(`Extracted ZIP data: ${zipData.length} bytes`);

    if (zipData.length === 0) {
      return new Response(
        JSON.stringify({ error: "Failed to extract ZIP data from CRX file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const files = await extractFiles(zipData);

    const manifestFile = files.get("manifest.json");
    if (!manifestFile) {
      return new Response(
        JSON.stringify({ error: "manifest.json not found in extension" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let manifest = JSON.parse(new TextDecoder().decode(manifestFile));
    manifest = resolveManifestI18n(manifest, files);
    console.log(`Manifest parsed: ${manifest.name} v${manifest.version}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const findings: SecurityFinding[] = [];
    const iocs: IOC[] = [];
    const behaviorFlags: BehaviorFlag[] = [];
    const skippedFiles: SkippedFile[] = [];

    // Blocklist check should be done by now (ran in parallel with CRX download)
    const malExtResult = await malExtPromise;
    if (malExtResult.hit) {
      const rule = RULE_DEFINITIONS["MALEXT-1"];
      findings.unshift({
        rule_id: "MALEXT-1",
        category: rule.category,
        severity: rule.severity,
        confidence: rule.confidence,
        title: `${rule.title}: ${malExtResult.reason || 'Removed'}`,
        description: `"${malExtResult.name}" was removed from the Chrome Web Store${malExtResult.date ? ` (${malExtResult.date})` : ''} for: ${malExtResult.reason}. ${malExtResult.blocklist ? 'Flagged as confirmed malware on the MalExt blocklist.' : 'Listed in the MalExt removal database.'}`,
        evidence: `Source: MalExt Database (github.com/toborrm9/malicious_extension_sentry) | Reason: ${malExtResult.reason} | Removed: ${malExtResult.date || 'unknown'} | Blocklist: ${malExtResult.blocklist ? 'YES — confirmed malware' : 'No'}`,
        file_path: 'chrome_web_store',
      });
      behaviorFlags.push({
        flag_type: 'confirmed_removed_from_store',
        severity: malExtResult.blocklist ? 'critical' : 'high',
        description: `Extension confirmed removed from the Chrome Web Store for: ${malExtResult.reason}`,
        evidence: [
          `MalExt Database entry`,
          `Reason: ${malExtResult.reason}`,
          `Removed: ${malExtResult.date || 'unknown'}`,
          malExtResult.blocklist ? 'CONFIRMED MALWARE BLOCKLIST' : 'Policy / Unwanted Software',
        ],
      });
      console.log(`MalExt HIT: ${extensionId} — ${malExtResult.reason} (blocklist: ${malExtResult.blocklist})`);
    } else {
      console.log(`MalExt: ${extensionId} not in blocklist`);
    }

    analyzePermissions(manifest, findings);
    await analyzeAllFiles(files, manifest, findings, iocs, skippedFiles);
    analyzeManifestDeep(manifest, findings);

    // Phase 7: vulnerable library checks (retire.js + OSV.dev, parallel)
    const [retireVulns, osvVulns] = await Promise.all([
      checkVulnerableLibraries(files, supabase),
      checkOSVPackages(files),
    ]);
    findings.push(...buildVulnFindings(retireVulns, "VULN-1"));
    findings.push(...buildVulnFindings(osvVulns, "VULN-2"));

    const behaviorAnalysis = analyzeBehaviorPatterns(manifest, findings, iocs);
    behaviorFlags.push(...behaviorAnalysis.flags);
    findings.push(...behaviorAnalysis.findings);

    const aiDataFlow = checkAIDataFlow(manifest, iocs);
    findings.push(...aiDataFlow.findings);
    behaviorFlags.push(...aiDataFlow.behaviorFlags);

    const obfuscationScore = calculateObfuscationScore(files);
    const fileHashes = await calculateFileHashes(files, manifest);

    if (skippedFiles.length > 0) {
      findings.push({
        rule_id: "PERF-1",
        category: "performance",
        severity: "low",
        confidence: "high",
        title: "Files Skipped During Scan",
        description: `${skippedFiles.length} file(s) were too large or timed out during analysis. Results may be incomplete.`,
        evidence: skippedFiles.map(f => `${f.file} (${f.reason})`).join(", ").substring(0, 200),
        file_path: "scan_metadata"
      });
    }

    const riskScore = calculateRiskScore(findings, behaviorFlags, obfuscationScore);
    const riskLevel = getRiskLevel(riskScore);
    const scanDuration = Date.now() - scanStartTime;

    const { data: analysis, error: analysisError } = await supabase
      .from("extension_analyses")
      .insert({
        extension_id: extensionId,
        extension_name: manifest.name || "Unknown",
        extension_version: manifest.version || "Unknown",
        extension_url: extensionUrl,
        risk_score: riskScore,
        risk_level: riskLevel,
        manifest_data: manifest,
        analysis_summary: generateSummary(findings, behaviorFlags, riskScore),
        file_hashes: fileHashes,
        behavior_flags: behaviorFlags,
        obfuscation_score: obfuscationScore,
        total_files_scanned: files.size,
        skipped_files: skippedFiles,
        scan_duration_ms: scanDuration,
        files_skipped_count: skippedFiles.length,
      })
      .select()
      .single();

    if (analysisError) {
      console.error("Database error:", analysisError);
      throw analysisError;
    }

    // Fire CRXplorer in parallel with the rest of the post-processing
    const crxplorerPromise = checkCRXplorer(extensionId);

    if (findings.length > 0) {
      const findingsToInsert = findings.map(f => ({
        analysis_id: analysis.id,
        ...f,
      }));

      const { error: findingsError } = await supabase
        .from("security_findings")
        .insert(findingsToInsert);

      if (findingsError) {
        console.error("Findings error:", findingsError);
      }
    }

    if (iocs.length > 0) {
      const iocsToInsert = iocs.map(ioc => ({
        analysis_id: analysis.id,
        ...ioc,
      }));

      const { error: iocsError } = await supabase
        .from("extension_iocs")
        .insert(iocsToInsert);

      if (iocsError) {
        console.error("IOCs error:", iocsError);
      }
    }

    await storeFileContents(supabase, analysis.id, files);

    // Fan out extracted IOCs to the threat-intel pipeline for enrichment
    const functionBaseUrl = `${supabaseUrl}/functions/v1/threat-intel`;
    const forwardAuth = req.headers.get("Authorization") ?? `Bearer ${supabaseKey}`;
    const uniqueIocUrls = [...new Set(iocs.filter(i => i.ioc_type === "url").map(i => i.ioc_value))].slice(0, 3);
    const uniqueHashes = [...new Set(iocs.filter(i => i.ioc_type === "hash" && i.ioc_value.length >= 32).map(i => i.ioc_value))].slice(0, 2);

    if (uniqueIocUrls.length > 0 || uniqueHashes.length > 0) {
      const enrichmentJobs = [
        ...uniqueIocUrls.map(url => {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 8000);
          return fetch(`${functionBaseUrl}/url`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": forwardAuth },
            body: JSON.stringify({ url }),
            signal: controller.signal,
          }).then(r => { clearTimeout(t); return r.ok ? r.json() : null; })
            .catch(() => null)
            .then(result => ({ type: "url", value: url, result }));
        }),
        ...uniqueHashes.map(hash => {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 8000);
          return fetch(`${functionBaseUrl}/hash`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": forwardAuth },
            body: JSON.stringify({ hash }),
            signal: controller.signal,
          }).then(r => { clearTimeout(t); return r.ok ? r.json() : null; })
            .catch(() => null)
            .then(result => ({ type: "hash", value: hash, result }));
        }),
      ];

      const settled = await Promise.allSettled(enrichmentJobs);
      const iocEnrichments = settled
        .filter((r): r is PromiseFulfilledResult<{ type: string; value: string; result: unknown }> => r.status === "fulfilled")
        .map(r => r.value)
        .filter(e => e.result !== null);

      if (iocEnrichments.length > 0) {
        await supabase
          .from("extension_analyses")
          .update({ ioc_enrichments: iocEnrichments })
          .eq("id", analysis.id);
      }
    }

    // Vault delta computation
    const { data: vaultEntry } = await supabase
      .from('extension_vault')
      .select('*')
      .eq('extension_id', extensionId)
      .maybeSingle();

    if (vaultEntry && vaultEntry.baseline_analysis_id) {
      const compareId = vaultEntry.latest_analysis_id || vaultEntry.baseline_analysis_id;

      const [prevFindings, prevIocs, prevAnalysis] = await Promise.all([
        supabase.from('security_findings').select('rule_id, category, severity').eq('analysis_id', compareId),
        supabase.from('extension_iocs').select('ioc_value, ioc_type').eq('analysis_id', compareId),
        supabase.from('extension_analyses').select('manifest_data, extension_version').eq('id', compareId).maybeSingle(),
      ]);

      const prevRuleIds = new Set((prevFindings.data || []).map((f: any) => f.rule_id).filter(Boolean));
      const newRuleIds = findings.map(f => f.rule_id).filter(Boolean).filter(id => id && !prevRuleIds.has(id));

      const prevDomains = new Set((prevIocs.data || []).filter((i: any) => i.ioc_type === 'domain').map((i: any) => i.ioc_value));
      const newDomains = iocs.filter(i => i.ioc_type === 'domain' && !prevDomains.has(i.ioc_value)).map(i => i.ioc_value);

      // Phase 7: manifest metadata delta detection
      const prevManifest = prevAnalysis.data?.manifest_data as any;
      const metadataChanges: string[] = [];
      if (prevManifest) {
        if (prevManifest.name !== manifest.name) metadataChanges.push(`name: "${prevManifest.name}" → "${manifest.name}"`);
        if (prevManifest.description !== manifest.description) metadataChanges.push(`description changed`);
        if (prevAnalysis.data?.extension_version !== manifest.version) metadataChanges.push(`version: ${prevAnalysis.data?.extension_version} → ${manifest.version}`);

        const prevPerms = new Set([...(prevManifest.permissions ?? []), ...(prevManifest.host_permissions ?? [])]);
        const newPerms = [...(manifest.permissions ?? []), ...(manifest.host_permissions ?? [])].filter(p => !prevPerms.has(p));
        if (newPerms.length > 0) metadataChanges.push(`new permissions: ${newPerms.slice(0, 5).join(', ')}`);
      }

      if (metadataChanges.length > 0) {
        const rule = RULE_DEFINITIONS["DELTA-1"];
        findings.push({
          rule_id: "DELTA-1",
          category: rule.category,
          severity: rule.severity,
          confidence: rule.confidence,
          title: rule.title,
          description: rule.description,
          evidence: metadataChanges.join(" | "),
          file_path: "manifest.json",
        });
      }

      if (newRuleIds.length > 0 || newDomains.length > 0 || metadataChanges.length > 0) {
        behaviorFlags.push({
          flag_type: "vault_delta_detected",
          severity: newRuleIds.some(id => {
            const rule = RULE_DEFINITIONS[id!];
            return rule?.severity === 'critical';
          }) || metadataChanges.some(c => c.includes("permissions")) ? "critical" : "high",
          description: `This extension changed since its last vault scan. New findings and/or new external domains were detected.`,
          evidence: [
            `baseline_analysis_id: ${compareId}`,
            ...(newRuleIds.length > 0 ? [`New rules triggered: ${newRuleIds.join(', ')}`] : []),
            ...(newDomains.length > 0 ? [`New domains: ${newDomains.slice(0, 5).join(', ')}`] : []),
            ...(metadataChanges.length > 0 ? [`Manifest changes: ${metadataChanges.join(' | ')}`] : []),
          ]
        });

        await supabase
          .from('extension_analyses')
          .update({ behavior_flags: behaviorFlags })
          .eq('id', analysis.id);
      }

      await supabase.from('extension_vault').update({
        latest_analysis_id: analysis.id,
        last_scanned_at: new Date().toISOString(),
        extension_name: manifest.name,
      }).eq('extension_id', extensionId);
    }

    const crxplorerData = await crxplorerPromise;
    if (crxplorerData.available) {
      await supabase
        .from('extension_analyses')
        .update({ crxcavator_data: crxplorerData })
        .eq('id', analysis.id);
    }
    console.log(`CRXplorer: ${crxplorerData.available ? `score ${crxplorerData.overall_score}, ${crxplorerData.risk_level}` : crxplorerData.error}`);

    return new Response(
      JSON.stringify({
        success: true,
        analysis_id: analysis.id,
        extension_name: manifest.name,
        risk_score: riskScore,
        risk_level: riskLevel,
        findings_count: findings.length,
        iocs_count: iocs.length,
        behavior_flags: behaviorFlags.length,
        obfuscation_score: obfuscationScore,
        scan_duration_ms: scanDuration,
        files_skipped: skippedFiles.length,
        vuln_libs_count: retireVulns.length + osvVulns.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function resolveManifestI18n(manifest: any, files: Map<string, Uint8Array>): any {
  const MSG_RE = /^__MSG_(.+)__$/;

  // Find messages.json — prefer default_locale, then 'en', then first available
  const candidates = [
    manifest.default_locale,
    'en', 'en_US', 'en_GB',
  ].filter(Boolean);

  const allLocaleFiles = [...files.keys()].filter(
    k => k.startsWith('_locales/') && k.endsWith('/messages.json')
  );

  let messages: Record<string, any> | null = null;
  for (const locale of candidates) {
    const file = files.get(`_locales/${locale}/messages.json`);
    if (file) {
      try { messages = JSON.parse(new TextDecoder().decode(file)); break; } catch { /* skip */ }
    }
  }
  if (!messages && allLocaleFiles.length > 0) {
    const file = files.get(allLocaleFiles[0]);
    if (file) {
      try { messages = JSON.parse(new TextDecoder().decode(file)); } catch { /* skip */ }
    }
  }

  if (!messages) return manifest;

  const resolve = (value: string): string => {
    const m = value.match(MSG_RE);
    if (!m) return value;
    const key = m[1];
    const entry = messages![key] ?? messages![key.toLowerCase()];
    return entry?.message ?? value;
  };

  return {
    ...manifest,
    name: typeof manifest.name === 'string' ? resolve(manifest.name) : manifest.name,
    short_name: typeof manifest.short_name === 'string' ? resolve(manifest.short_name) : manifest.short_name,
    description: typeof manifest.description === 'string' ? resolve(manifest.description) : manifest.description,
  };
}

interface ExtensionSource {
  id: string;
  store: 'chrome' | 'edge' | 'unknown';
}

function extractExtensionSource(input: string): ExtensionSource | null {
  const s = input.trim();

  // Bare 32-char extension ID
  if (/^[a-z]{32}$/i.test(s)) {
    return { id: s.toLowerCase(), store: 'unknown' };
  }

  // Chrome Web Store
  const chrome = s.match(/chromewebstore\.google\.com\/detail\/[^\/]+\/([a-z]{32})/i);
  if (chrome) return { id: chrome[1].toLowerCase(), store: 'chrome' };

  // Microsoft Edge Add-ons
  const edge = s.match(/microsoftedge\.microsoft\.com\/addons\/detail\/[^\/]+\/([a-z]{32})/i);
  if (edge) return { id: edge[1].toLowerCase(), store: 'edge' };

  // Generic /detail/name/ID fallback (other Chromium store formats)
  const generic = s.match(/\/detail\/[^\/]+\/([a-z]{32})/i);
  if (generic) return { id: generic[1].toLowerCase(), store: 'unknown' };

  return null;
}

// kept for any internal callers that still use the old signature
function extractExtensionId(url: string): string | null {
  return extractExtensionSource(url)?.id ?? null;
}

function extractZipFromCrx(crxData: ArrayBuffer): Uint8Array {
  const dataArray = new Uint8Array(crxData);

  if (crxData.byteLength < 4) {
    console.log("File too small to be valid");
    return dataArray;
  }

  const view = new DataView(crxData);
  const magicBytes = Array.from(dataArray.slice(0, 4));
  const magicHex = magicBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log(`Magic bytes (hex): ${magicHex}, file size: ${crxData.byteLength}`);

  if (magicBytes[0] === 0x43 && magicBytes[1] === 0x72 && magicBytes[2] === 0x32 && magicBytes[3] === 0x34) {
    const version = view.getUint32(4, true);
    console.log(`CRX version: ${version}`);

    if (version === 3) {
      console.log("Detected CRX3 format");
      const headerSize = view.getUint32(8, true);
      const zipStart = 12 + headerSize;
      console.log(`CRX3: headerSize=${headerSize}, zipStart=${zipStart}`);

      if (zipStart < crxData.byteLength) {
        const extracted = dataArray.slice(zipStart);
        console.log(`Extracted ${extracted.length} bytes from CRX3`);
        return extracted;
      } else {
        console.error(`CRX3 zipStart (${zipStart}) >= file size (${crxData.byteLength})`);
      }
    } else if (version === 2) {
      console.log("Detected CRX2 format");
      const pubKeyLength = view.getUint32(8, true);
      const sigLength = view.getUint32(12, true);
      const zipStart = 16 + pubKeyLength + sigLength;
      console.log(`CRX2: pubKeyLength=${pubKeyLength}, sigLength=${sigLength}, zipStart=${zipStart}`);

      if (zipStart < crxData.byteLength) {
        const extracted = dataArray.slice(zipStart);
        console.log(`Extracted ${extracted.length} bytes from CRX2`);
        return extracted;
      } else {
        console.error(`CRX2 zipStart (${zipStart}) >= file size (${crxData.byteLength})`);
      }
    }
  }

  if (magicBytes[0] === 0x50 && magicBytes[1] === 0x4b && magicBytes[2] === 0x03 && magicBytes[3] === 0x04) {
    console.log("Detected plain ZIP file (PK signature at start)");
    return dataArray;
  }

  console.log("Searching for ZIP signature in file...");
  for (let i = 0; i < Math.min(crxData.byteLength - 4, 1000); i++) {
    if (dataArray[i] === 0x50 && dataArray[i+1] === 0x4b && dataArray[i+2] === 0x03 && dataArray[i+3] === 0x04) {
      console.log(`Found ZIP signature at offset ${i}`);
      return dataArray.slice(i);
    }
  }

  console.log("No ZIP signature found, returning entire file");
  return dataArray;
}

async function extractFiles(zipData: Uint8Array): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();

  const zip = await JSZip.loadAsync(zipData);

  for (const [filename, file] of Object.entries(zip.files)) {
    if (!file.dir) {
      const data = await file.async("uint8array");
      files.set(filename, data);
    }
  }

  return files;
}

function analyzePermissions(manifest: any, findings: SecurityFinding[]): void {
  const dangerousPermissions: Record<string, string> = {
    "cookies": "PERM-1",
    "management": "PERM-2",
    "debugger": "PERM-3",
    "proxy": "PERM-4",
    "webRequestBlocking": "PERM-5",
    "webRequest": "PERM-5",
    "nativeMessaging": "PERM-2",
  };

  const permissions = [
    ...(manifest.permissions || []),
    ...(manifest.host_permissions || []),
    ...(manifest.optional_permissions || []),
    ...(manifest.optional_host_permissions || []),
  ];

  for (const permission of permissions) {
    const ruleId = dangerousPermissions[permission];
    if (ruleId && RULE_DEFINITIONS[ruleId]) {
      const rule = RULE_DEFINITIONS[ruleId];
      findings.push({
        rule_id: ruleId,
        category: rule.category,
        severity: rule.severity,
        confidence: rule.confidence,
        title: rule.title,
        description: rule.description,
        evidence: permission,
        file_path: "manifest.json",
      });
    }

    if (permission === "<all_urls>" || permission === "http://*/*" || permission === "https://*/*" || permission.includes("*://*/*")) {
      const rule = RULE_DEFINITIONS["PERM-6"];
      findings.push({
        rule_id: "PERM-6",
        category: rule.category,
        severity: rule.severity,
        confidence: rule.confidence,
        title: rule.title,
        description: rule.description,
        evidence: permission,
        file_path: "manifest.json",
      });
    }
  }
}

function getTimeoutForFile(size: number): number {
  if (size >= LARGE_FILE_THRESHOLD) {
    return SCAN_TIMEOUT_MS_LARGE;
  }
  return SCAN_TIMEOUT_MS_SMALL;
}

function analyzeWithTimeout(fn: () => void, timeoutMs: number): Promise<void> {
  return Promise.race([
    Promise.resolve().then(fn),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), timeoutMs)
    )
  ]);
}

async function analyzeAllFiles(
  files: Map<string, Uint8Array>,
  manifest: any,
  findings: SecurityFinding[],
  iocs: IOC[],
  skippedFiles: SkippedFile[]
): Promise<void> {
  const scriptFiles = new Set<string>();

  if (manifest.background) {
    if (manifest.background.service_worker) {
      scriptFiles.add(manifest.background.service_worker);
    }
    if (manifest.background.scripts) {
      manifest.background.scripts.forEach((s: string) => scriptFiles.add(s));
    }
  }

  if (manifest.content_scripts) {
    manifest.content_scripts.forEach((cs: any) => {
      if (cs.js) {
        cs.js.forEach((s: string) => scriptFiles.add(s));
      }
    });
  }

  const allExtensionIds: string[] = [];

  for (const [filename, content] of files.entries()) {
    const isScript = filename.endsWith(".js") || scriptFiles.has(filename);
    const isHtml = filename.endsWith(".html");
    const isJson = filename.endsWith(".json");

    if (isScript || isHtml || isJson) {
      if (content.byteLength > MAX_INDIVIDUAL_FILE_SIZE) {
        skippedFiles.push({
          file: filename,
          reason: "file_too_large",
          size: content.byteLength
        });
        continue;
      }

      try {
        const text = new TextDecoder().decode(content);
        const timeoutMs = getTimeoutForFile(content.byteLength);

        await analyzeWithTimeout(() => {
          if (isScript) {
            analyzeJavaScript(filename, text, findings, iocs, allExtensionIds);
          } else if (isHtml) {
            analyzeHTML(filename, text, findings, iocs);
          } else if (isJson && filename !== "manifest.json") {
            analyzeJSON(filename, text, iocs, findings, manifest);
          }
        }, timeoutMs).catch(() => {
          skippedFiles.push({
            file: filename,
            reason: "analysis_timeout",
            size: content.byteLength
          });
        });
      } catch (e) {
        console.error(`Error analyzing ${filename}:`, e);
        skippedFiles.push({
          file: filename,
          reason: "parse_error"
        });
      }
    }
  }

  if (allExtensionIds.length >= 5) {
    const rule = RULE_DEFINITIONS["ANALYSIS-2"];
    const confidence = allExtensionIds.length >= 10 ? "high" : "medium";
    findings.push({
      rule_id: "ANALYSIS-2",
      category: rule.category,
      severity: rule.severity,
      confidence: confidence,
      title: rule.title,
      description: `${rule.description} (${allExtensionIds.length} IDs found)`,
      evidence: `Extension IDs: ${allExtensionIds.slice(0, 5).join(", ")}${allExtensionIds.length > 5 ? '...' : ''}`,
      file_path: "multiple_files"
    });
  }
}

function analyzeJavaScript(filename: string, code: string, findings: SecurityFinding[], iocs: IOC[], allExtensionIds: string[]): void {
  const hasCookieAccess = /chrome\.cookies\.(getAll|get)\s*\(/.test(code);
  const hasNetworkCall = /fetch\s*\(|XMLHttpRequest|\.send\s*\(/.test(code);

  if (hasCookieAccess && hasNetworkCall) {
    const rule = RULE_DEFINITIONS["API-1"];
    const cookieMatch = code.match(/chrome\.cookies\.(getAll|get)\s*\([^)]*\)/);
    const fetchMatch = code.match(/fetch\s*\(\s*['"`]([^'"`]+)['"`]/);
    const evidence = cookieMatch && fetchMatch
      ? `${cookieMatch[0].substring(0, 50)}... → fetch('${fetchMatch[1]}')`
      : "chrome.cookies + network call detected";

    findings.push({
      rule_id: "API-1",
      category: rule.category,
      severity: rule.severity,
      confidence: rule.confidence,
      title: rule.title,
      description: rule.description,
      evidence: evidence.substring(0, 200),
      file_path: filename,
    });
  }

  if (/document\.cookie/.test(code)) {
    const rule = RULE_DEFINITIONS["API-2"];
    const match = code.match(/document\.cookie[^;\n]{0,50}/);
    findings.push({
      rule_id: "API-2",
      category: rule.category,
      severity: rule.severity,
      confidence: rule.confidence,
      title: rule.title,
      description: rule.description,
      evidence: match ? match[0] : "document.cookie",
      file_path: filename,
    });
  }

  if (/querySelector.*password|input\[type=["']password["']\]/.test(code)) {
    const rule = RULE_DEFINITIONS["API-3"];
    const match = code.match(/querySelector[^;\n]{0,80}/);
    findings.push({
      rule_id: "API-3",
      category: rule.category,
      severity: rule.severity,
      confidence: rule.confidence,
      title: rule.title,
      description: rule.description,
      evidence: match ? match[0] : "password field access",
      file_path: filename,
    });
  }

  if (/chrome\.management\.(getAll|get)\s*\(/.test(code)) {
    const rule = RULE_DEFINITIONS["ANALYSIS-1"];
    const match = code.match(/chrome\.management\.(getAll|get)[^;\n]{0,50}/);
    findings.push({
      rule_id: "ANALYSIS-1",
      category: rule.category,
      severity: rule.severity,
      confidence: rule.confidence,
      title: rule.title,
      description: rule.description,
      evidence: match ? match[0] : "chrome.management.getAll()",
      file_path: filename,
    });
  }

  if (/disabledevtool|DisableDevtool|disable-devtool/i.test(code)) {
    const rule = RULE_DEFINITIONS["ANALYSIS-3"];
    const match = code.match(/disabledevtool[^;\n]{0,50}/i);
    findings.push({
      rule_id: "ANALYSIS-3",
      category: rule.category,
      severity: rule.severity,
      confidence: rule.confidence,
      title: rule.title,
      description: rule.description,
      evidence: match ? match[0] : "DisableDevTool detected",
      file_path: filename,
    });
  }

  const extensionIdMatches = code.match(/\b[a-z]{32}\b/g);
  if (extensionIdMatches) {
    allExtensionIds.push(...extensionIdMatches);
  }

  const hasEval = /eval\s*\(|new\s+Function\s*\(/.test(code);
  if (hasEval) {
    const rule = RULE_DEFINITIONS["DYN-1"];
    const match = code.match(/eval\s*\([^)]{0,50}|new\s+Function\s*\([^)]{0,50}/);
    findings.push({
      rule_id: "DYN-1",
      category: rule.category,
      severity: rule.severity,
      confidence: rule.confidence,
      title: rule.title,
      description: rule.description,
      evidence: match ? match[0] + "..." : "eval() or new Function()",
      file_path: filename,
    });

    if (hasNetworkCall && hasEval) {
      const rule2 = RULE_DEFINITIONS["DYN-2"];
      findings.push({
        rule_id: "DYN-2",
        category: rule2.category,
        severity: rule2.severity,
        confidence: rule2.confidence,
        title: rule2.title,
        description: rule2.description,
        evidence: "fetch() + eval() detected",
        file_path: filename,
      });
    }
  }

  // C2-1: Callback polling pattern (setup/callback/finish endpoint family)
  if (/\/extensions\/(setup|callback|finish)\b/.test(code) ||
      /\/(setup|callback|finish)\?.*uuid/.test(code) ||
      (/setInterval|setTimeout/.test(code) && /callback/.test(code) && hasNetworkCall)) {
    const rule = RULE_DEFINITIONS["C2-1"];
    const match = code.match(/\/extensions\/(setup|callback|finish)[^\s'"`]{0,60}/);
    findings.push({
      rule_id: "C2-1",
      category: rule.category, severity: rule.severity, confidence: rule.confidence,
      title: rule.title, description: rule.description,
      evidence: match ? match[0] : "setup/callback/finish endpoint pattern",
      file_path: filename,
    });
  }

  // C2-2: UUID bot registration (with domain whitelist check)
  if (/crypto\.randomUUID\(\)|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}/.test(code) &&
      /chrome\.storage\.(local|sync)\.(set|get)/.test(code) &&
      hasNetworkCall) {
    const fetchUrls = code.match(/fetch\s*\(\s*['"`]([^'"`]+)['"`]/g) || [];
    const hasNonWhitelistedDomain = fetchUrls.some(u => {
      const urlMatch = u.match(/fetch\s*\(\s*['"`]([^'"`]+)['"`]/);
      if (!urlMatch) return false;
      try {
        const url = new URL(urlMatch[1]);
        return !WHITELISTED_DOMAINS.some(d => url.hostname.includes(d));
      } catch {
        return true;
      }
    });

    if (hasNonWhitelistedDomain) {
      const rule = RULE_DEFINITIONS["C2-2"];
      findings.push({
        rule_id: "C2-2",
        category: rule.category, severity: rule.severity, confidence: rule.confidence,
        title: rule.title, description: rule.description,
        evidence: "UUID generation + storage + network call to non-whitelisted domain",
        file_path: filename,
      });
    }
  }

  // INJ-1: Remote HTML template injection (tightened: require no DOMPurify and co-location)
  if (/innerHTML\s*=|insertAdjacentHTML|document\.body\.appendChild/.test(code) &&
      hasNetworkCall &&
      /text\(\)|\.html\b|response\.text/.test(code) &&
      !/DOMPurify|dompurify|sanitize/i.test(code)) {
    const rule = RULE_DEFINITIONS["INJ-1"];
    const match = code.match(/innerHTML\s*=\s*[^;\n]{0,60}/);
    findings.push({
      rule_id: "INJ-1",
      category: rule.category, severity: rule.severity, confidence: rule.confidence,
      title: rule.title, description: rule.description,
      evidence: match ? match[0] : "remote HTML fetched and injected into DOM",
      file_path: filename,
    });
  }

  // INJ-2: Native API prototype hijacking
  if (/window\.fetch\s*=|XMLHttpRequest\.prototype\.(open|send)\s*=|HTMLFormElement\.prototype\.submit\s*=|JSON\.parse\s*=/.test(code)) {
    const rule = RULE_DEFINITIONS["INJ-2"];
    const match = code.match(/(window\.fetch|XMLHttpRequest\.prototype\.\w+|HTMLFormElement\.prototype\.\w+)\s*=[^;\n]{0,60}/);
    findings.push({
      rule_id: "INJ-2",
      category: rule.category, severity: rule.severity, confidence: rule.confidence,
      title: rule.title, description: rule.description,
      evidence: match ? match[0] : "native API override detected",
      file_path: filename,
    });
  }

  // INJ-3: DOM event handler attribute code execution (eval bypass)
  if (/setAttribute\s*\(\s*['"`]on\w+['"`]/.test(code) &&
      /dispatchEvent|CustomEvent/.test(code)) {
    const rule = RULE_DEFINITIONS["INJ-3"];
    const match = code.match(/setAttribute\s*\([^)]{0,80}/);
    findings.push({
      rule_id: "INJ-3",
      category: rule.category, severity: rule.severity, confidence: rule.confidence,
      title: rule.title, description: rule.description,
      evidence: match ? match[0] : "setAttribute(on*) + dispatchEvent pattern",
      file_path: filename,
    });
  }

  // GRAB-1: Financial data form grabber
  const FINANCIAL_KEYWORDS = [
    'cardnumber', 'card.number', 'card_number', 'creditcard',
    'cvv', 'cvc', 'ccv', 'securitycode',
    'iban', 'bic', 'swift', 'routingnumber',
    'ssn', 'socialsecurity', 'taxid', 'ein',
    'pin', 'passcode', 'otp', 'verificationcode',
    'accountnumber', 'bankaccount'
  ];
  const financialPattern = new RegExp(FINANCIAL_KEYWORDS.join('|'), 'i');
  if (financialPattern.test(code) &&
      /addEventListener.*input|addEventListener.*change|addEventListener.*keyup/.test(code) &&
      hasNetworkCall) {
    const rule = RULE_DEFINITIONS["GRAB-1"];
    findings.push({
      rule_id: "GRAB-1",
      category: rule.category, severity: rule.severity, confidence: rule.confidence,
      title: rule.title, description: rule.description,
      evidence: "Financial keyword list + input event hooks + network exfiltration",
      file_path: filename,
    });
  }

  // ANTI-4: Console method silencing
  if (/console\s*\[\s*['"`](log|warn|error|info|debug)['"`]\s*\]\s*=\s*(function\s*\(\)|=>\s*\{?\s*\}|\(\)\s*=>)/.test(code) ||
      /\['log','warn','error'|'log','warn','info','error'/.test(code)) {
    const rule = RULE_DEFINITIONS["ANTI-4"];
    findings.push({
      rule_id: "ANTI-4",
      category: rule.category, severity: rule.severity, confidence: rule.confidence,
      title: rule.title, description: rule.description,
      evidence: "console method reassigned to empty function",
      file_path: filename,
    });
  }

  // ANTI-5: Probabilistic activation
  if (/Math\.random\(\)\s*[<>]\s*0\.[0-9]/.test(code) && hasNetworkCall) {
    const rule = RULE_DEFINITIONS["ANTI-5"];
    const match = code.match(/Math\.random\(\)[^;\n]{0,40}/);
    findings.push({
      rule_id: "ANTI-5",
      category: rule.category, severity: rule.severity, confidence: rule.confidence,
      title: rule.title, description: rule.description,
      evidence: match ? match[0] : "Math.random() gate before network call",
      file_path: filename,
    });
  }

  // ANTI-6: Time-delayed activation (tightened: require arithmetic subtraction context with threshold >= 3600000)
  if (/(Date\.now\(\)|new Date\(\)\.getTime\(\))/.test(code) &&
      /onInstalled|chrome\.storage|installedAt|installTime|firstRun/.test(code) &&
      /(Date\.now\(\)|getTime\(\))\s*-\s*\w+|(\w+)\s*-\s*(Date\.now\(\)|getTime\(\))/.test(code) &&
      /[3-9]\d{6,}|[1-9]\d{7,}/.test(code)) {
    const rule = RULE_DEFINITIONS["ANTI-6"];
    findings.push({
      rule_id: "ANTI-6",
      category: rule.category, severity: rule.severity, confidence: rule.confidence,
      title: rule.title, description: rule.description,
      evidence: "Date/time subtraction against stored install timestamp with large threshold detected",
      file_path: filename,
    });
  }

  // NET-3: WebSocket C2 channel
  if (/new\s+WebSocket\s*\(\s*['"`]wss?:\/\//.test(code)) {
    const rule = RULE_DEFINITIONS["NET-3"];
    const match = code.match(/new\s+WebSocket\s*\(\s*['"`][^'"`]+['"`]/);
    findings.push({
      rule_id: "NET-3",
      category: rule.category, severity: rule.severity, confidence: rule.confidence,
      title: rule.title, description: rule.description,
      evidence: match ? match[0] : "WebSocket connection to external host",
      file_path: filename,
    });
  }

  // NET-4: Firebase/cloud database exfiltration
  if (/firebaseio\.com|firebasedatabase\.app|\.firestore\(\)|getDatabase\(/.test(code)) {
    const rule = RULE_DEFINITIONS["NET-4"];
    const match = code.match(/(firebaseio\.com|firebasedatabase\.app)[^\s'"`]{0,60}/);
    findings.push({
      rule_id: "NET-4",
      category: rule.category, severity: rule.severity, confidence: rule.confidence,
      title: rule.title, description: rule.description,
      evidence: match ? match[0] : "Firebase database endpoint detected",
      file_path: filename,
    });
  }

  // NET-5: Geolocation fingerprinting via Cloudflare trace or IP lookup
  if (/1\.1\.1\.1\/cdn-cgi\/trace|ipapi\.co|ip-api\.com|ipinfo\.io|api\.ipify\.org/.test(code)) {
    const rule = RULE_DEFINITIONS["NET-5"];
    const match = code.match(/(1\.1\.1\.1[^\s'"`]{0,40}|ipapi[^\s'"`]{0,40})/);
    findings.push({
      rule_id: "NET-5",
      category: rule.category, severity: rule.severity, confidence: rule.confidence,
      title: rule.title, description: rule.description,
      evidence: match ? match[0] : "IP geolocation API call detected",
      file_path: filename,
    });
  }

  // MAN-3 dynamic variant: registerContentScripts with MAIN world
  if (/registerContentScripts/.test(code) && /['"`]MAIN['"`]/.test(code)) {
    const rule = RULE_DEFINITIONS["MAN-3"];
    findings.push({
      rule_id: "MAN-3",
      category: rule.category, severity: rule.severity, confidence: rule.confidence,
      title: rule.title,
      description: rule.description + " (dynamically registered at runtime)",
      evidence: "chrome.scripting.registerContentScripts with world: MAIN",
      file_path: filename,
    });
  }

  extractIOCsFromText(code, filename, iocs, findings);
}

function analyzeHTML(filename: string, html: string, findings: SecurityFinding[], iocs: IOC[]): void {
  const inlineScriptPattern = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = inlineScriptPattern.exec(html)) !== null) {
    const scriptContent = match[1];
    if (scriptContent.trim()) {
      const allExtensionIds: string[] = [];
      analyzeJavaScript(filename, scriptContent, findings, iocs, allExtensionIds);
    }
  }

  extractIOCsFromText(html, filename, iocs, findings);
}

function analyzeJSON(filename: string, json: string, iocs: IOC[], findings: SecurityFinding[], manifest?: any): void {
  extractIOCsFromText(json, filename, iocs, findings);

  const isDNRFile =
    filename === 'rules.json' ||
    filename.includes('rules') ||
    (manifest?.declarative_net_request?.rule_resources || []).some(
      (r: any) => r.path && filename.endsWith(r.path.replace(/^\//, ''))
    );

  if (isDNRFile) {
    try {
      const parsed = JSON.parse(json);
      const rules = Array.isArray(parsed) ? parsed : parsed.rules || [];

      const SECURITY_HEADERS = [
        'content-security-policy',
        'content-security-policy-report-only',
        'x-frame-options',
        'x-content-type-options',
        'strict-transport-security',
        'x-xss-protection',
        'permissions-policy',
        'cross-origin-opener-policy',
        'cross-origin-embedder-policy',
      ];

      const strippedHeaders: string[] = [];

      for (const rule of rules) {
        const actions = rule?.action?.responseHeaders || [];
        for (const headerAction of actions) {
          const headerName = (headerAction.header || '').toLowerCase();
          if (
            (rule.action?.type === 'modifyHeaders' || headerAction.operation === 'remove' || headerAction.operation === 'set') &&
            SECURITY_HEADERS.includes(headerName)
          ) {
            strippedHeaders.push(headerName);
          }
        }
      }

      if (strippedHeaders.length > 0) {
        const ruledef = RULE_DEFINITIONS["DNR-1"];
        findings.push({
          rule_id: 'DNR-1',
          category: ruledef.category,
          severity: ruledef.severity,
          confidence: ruledef.confidence,
          title: ruledef.title,
          description: `Extension uses rules.json to silently remove browser security headers from pages the victim visits. This is a known technique used by ShotBird, QuickLens, and the DataByCloud campaign to bypass Content Security Policy and enable malicious script injection.`,
          evidence: `Stripped headers: ${[...new Set(strippedHeaders)].join(', ')}`,
          file_path: filename,
        });
      }
    } catch (_e) {
      // JSON parse failed, skip structural analysis
    }
  }
}

function extractIOCsFromText(text: string, sourceFile: string, iocs: IOC[], findings: SecurityFinding[]): void {
  const urlPattern = /https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/g;
  const urls = text.match(urlPattern) || [];
  const uniqueUrls = [...new Set(urls)];

  for (const url of uniqueUrls) {
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol === "http:" || urlObj.protocol === "https:") {
        const context = extractContext(text, url, 50);

        iocs.push({
          ioc_type: "url",
          ioc_value: url,
          source_file: sourceFile,
          context: context,
        });

        iocs.push({
          ioc_type: "domain",
          ioc_value: urlObj.hostname,
          source_file: sourceFile,
          context: context,
        });

        const isWhitelisted = WHITELISTED_DOMAINS.some(d => urlObj.hostname.includes(d));
        const isIPAddress = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(urlObj.hostname);
        const hasSuspiciousTLD = SUSPICIOUS_TLDS.some(tld => urlObj.hostname.endsWith(tld));

        if (!isWhitelisted && (isIPAddress || hasSuspiciousTLD)) {
          const rule = isIPAddress ? RULE_DEFINITIONS["NET-1"] : RULE_DEFINITIONS["NET-2"];
          const ruleId = isIPAddress ? "NET-1" : "NET-2";

          findings.push({
            rule_id: ruleId,
            category: rule.category,
            severity: isIPAddress ? "high" : "medium",
            confidence: rule.confidence,
            title: rule.title,
            description: `${rule.description}: ${urlObj.hostname}`,
            evidence: url.substring(0, 100),
            file_path: sourceFile,
          });
        }
      }
    } catch (_e) {
    }
  }
}

function extractContext(text: string, needle: string, contextLength: number): string {
  const index = text.indexOf(needle);
  if (index === -1) return "";

  const start = Math.max(0, index - contextLength);
  const end = Math.min(text.length, index + needle.length + contextLength);

  return text.substring(start, end).replace(/\s+/g, ' ').trim();
}

function analyzeManifestDeep(manifest: any, findings: SecurityFinding[]): void {
  const manifestVersion = manifest.manifest_version || 2;

  if (manifestVersion === 2 && manifest.content_security_policy) {
    if (manifest.content_security_policy.includes("unsafe-eval") || /https?:\/\//.test(manifest.content_security_policy)) {
      const rule = RULE_DEFINITIONS["MAN-1"];
      findings.push({
        rule_id: "MAN-1",
        category: rule.category,
        severity: rule.severity,
        confidence: rule.confidence,
        title: rule.title,
        description: rule.description,
        evidence: manifest.content_security_policy.substring(0, 100),
        file_path: "manifest.json",
      });
    }
  }

  if (manifest.externally_connectable) {
    const ec = manifest.externally_connectable;
    const isBroad = ec.matches && ec.matches.some((m: string) =>
      m.includes("*") || m === "<all_urls>" || m.includes("://*/*")
    );

    if (isBroad) {
      const rule = RULE_DEFINITIONS["MAN-2"];
      findings.push({
        rule_id: "MAN-2",
        category: rule.category,
        severity: rule.severity,
        confidence: rule.confidence,
        title: rule.title,
        description: rule.description,
        evidence: JSON.stringify(ec.matches).substring(0, 100),
        file_path: "manifest.json",
      });
    }
  }

  // MAN-3: MAIN world content script injection
  if (manifest.content_scripts) {
    const mainWorldScripts = manifest.content_scripts.filter(
      (cs: any) => cs.world === 'MAIN'
    );
    if (mainWorldScripts.length > 0) {
      const rule = RULE_DEFINITIONS["MAN-3"];
      findings.push({
        rule_id: "MAN-3",
        category: rule.category, severity: rule.severity, confidence: rule.confidence,
        title: rule.title, description: rule.description,
        evidence: `${mainWorldScripts.length} MAIN world content script(s): ${mainWorldScripts.map((cs: any) => (cs.js || []).join(', ')).join('; ')}`,
        file_path: "manifest.json",
      });
    }
  }

  // MAN-4: Offscreen document permission
  const hasOffscreen = (manifest.permissions || []).includes('offscreen');
  if (hasOffscreen) {
    const rule = RULE_DEFINITIONS["MAN-4"];
    findings.push({
      rule_id: "MAN-4",
      category: rule.category, severity: rule.severity, confidence: rule.confidence,
      title: rule.title, description: rule.description,
      evidence: "'offscreen' permission declared in manifest",
      file_path: "manifest.json",
    });
  }
}

function analyzeBehaviorPatterns(
  manifest: any,
  findings: SecurityFinding[],
  iocs: IOC[]
): { flags: BehaviorFlag[], findings: SecurityFinding[] } {
  const flags: BehaviorFlag[] = [];
  const newFindings: SecurityFinding[] = [];

  const hasAllUrls = (
    (manifest.permissions || []).includes("<all_urls>") ||
    (manifest.host_permissions || []).includes("<all_urls>")
  );
  const hasCookies = (manifest.permissions || []).includes("cookies");
  const hasProxy = (manifest.permissions || []).includes("proxy");

  const hasExfilMethods = iocs.some(ioc => ioc.ioc_type === "url" || ioc.ioc_type === "domain");

  const hasKeyListeners = findings.some(f =>
    f.evidence && (f.evidence.includes("keydown") || f.evidence.includes("keypress"))
  );

  if (hasCookies && hasAllUrls && hasExfilMethods) {
    flags.push({
      flag_type: "session_theft_candidate",
      severity: "critical",
      description: "Extension can steal cookies from all websites and send them externally",
      evidence: ["cookies permission", "all_urls access", "external communication detected"],
    });

    newFindings.push({
      category: "behavior",
      severity: "critical",
      confidence: "high",
      title: "Session Theft Candidate",
      description: "Has cookies access, all_urls permission, and external communication",
      evidence: "Behavior pattern match",
      file_path: "manifest.json",
    });
  }

  if (hasKeyListeners && hasExfilMethods) {
    flags.push({
      flag_type: "keylogger_candidate",
      severity: "critical",
      description: "Extension monitors keyboard input and can send data externally",
      evidence: ["keyboard event listeners", "external communication detected"],
    });

    newFindings.push({
      category: "behavior",
      severity: "critical",
      confidence: "high",
      title: "Keylogger Candidate",
      description: "Monitors keyboard events and has external communication capability",
      evidence: "Behavior pattern match",
      file_path: "manifest.json",
    });
  }

  if (hasProxy && hasAllUrls) {
    flags.push({
      flag_type: "proxy_hijack_candidate",
      severity: "critical",
      description: "Extension can control proxy settings and access all websites",
      evidence: ["proxy permission", "all_urls access"],
    });

    newFindings.push({
      category: "behavior",
      severity: "critical",
      confidence: "high",
      title: "Proxy Hijack Candidate",
      description: "Has proxy control permission and all_urls access",
      evidence: "Behavior pattern match",
      file_path: "manifest.json",
    });
  }

  return { flags, findings: newFindings };
}

function calculateObfuscationScore(files: Map<string, Uint8Array>): number {
  let totalScore = 0;
  let jsFileCount = 0;

  for (const [filename, content] of files.entries()) {
    if (filename.endsWith(".js")) {
      jsFileCount++;
      const code = new TextDecoder().decode(content);
      const lines = code.split('\n');
      const codeLength = code.length;
      const lineCount = lines.length;

      let fileScore = 0;

      const avgLineLength = lineCount > 0 ? codeLength / lineCount : 0;
      if (avgLineLength > 500) {
        fileScore += 30;
      } else if (avgLineLength > 200) {
        fileScore += 15;
      }

      if (codeLength > 10000 && lineCount < 50) {
        fileScore += 25;
      }

      const entropy = calculateEntropy(code.substring(0, Math.min(10000, code.length)));
      if (entropy > 4.5) {
        fileScore += 20;
      } else if (entropy > 4.0) {
        fileScore += 10;
      }

      const hasMinificationMarkers =
        code.includes('function(a,b,c)') ||
        (code.match(/\b[a-z]\b/g)?.length || 0) > codeLength / 50;

      if (hasMinificationMarkers) {
        fileScore += 15;
      }

      const spaceRatio = (code.match(/\s/g)?.length || 0) / codeLength;
      if (spaceRatio < 0.1) {
        fileScore += 10;
      }

      totalScore += Math.min(100, fileScore);
    }
  }

  if (jsFileCount > 0 && totalScore / jsFileCount > 50) {
    return Math.min(100, Math.round(totalScore / jsFileCount));
  }

  return jsFileCount > 0 ? Math.min(100, Math.round(totalScore / jsFileCount)) : 0;
}

function calculateEntropy(str: string): number {
  const len = str.length;
  const frequencies = new Map<string, number>();

  for (const char of str) {
    frequencies.set(char, (frequencies.get(char) || 0) + 1);
  }

  let entropy = 0;
  for (const count of frequencies.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

async function calculateFileHashes(files: Map<string, Uint8Array>, manifest: any): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};

  const manifestFile = files.get("manifest.json");
  if (manifestFile) {
    hashes["manifest.json"] = await sha256(manifestFile);
  }

  const importantFiles: string[] = [];

  if (manifest.background) {
    if (manifest.background.service_worker) {
      importantFiles.push(manifest.background.service_worker);
    }
    if (manifest.background.scripts) {
      importantFiles.push(...manifest.background.scripts);
    }
  }

  for (const filename of importantFiles) {
    const file = files.get(filename);
    if (file) {
      hashes[filename] = await sha256(file);
    }
  }

  return hashes;
}

async function sha256(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function calculateRiskScore(findings: SecurityFinding[], behaviorFlags: BehaviorFlag[], obfuscationScore: number): number {
  const severityScores: Record<string, number> = {
    low: 5,
    medium: 15,
    high: 30,
    critical: 50,
  };

  const confidenceMultipliers: Record<string, number> = {
    low: 0.4,
    medium: 0.7,
    high: 1.0,
  };

  let score = 0;
  for (const finding of findings) {
    const baseScore = severityScores[finding.severity] || 0;
    const multiplier = confidenceMultipliers[finding.confidence || 'medium'] || 0.7;
    score += baseScore * multiplier;
  }

  for (const flag of behaviorFlags) {
    score += severityScores[flag.severity] || 0;
  }

  score += Math.round(obfuscationScore * 0.3);

  return Math.min(100, Math.round(score));
}

function getRiskLevel(score: number): string {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

function generateSummary(findings: SecurityFinding[], behaviorFlags: BehaviorFlag[], riskScore: number): string {
  const criticalCount = findings.filter(f => f.severity === "critical").length;
  const highCount = findings.filter(f => f.severity === "high").length;
  const mediumCount = findings.filter(f => f.severity === "medium").length;
  const lowCount = findings.filter(f => f.severity === "low").length;

  let summary = `Risk Score: ${riskScore}/100. `;

  if (criticalCount > 0) summary += `${criticalCount} critical, `;
  if (highCount > 0) summary += `${highCount} high, `;
  if (mediumCount > 0) summary += `${mediumCount} medium, `;
  if (lowCount > 0) summary += `${lowCount} low severity findings. `;

  if (behaviorFlags.length > 0) {
    summary += `${behaviorFlags.length} behavior flag(s) detected.`;
  }

  return summary;
}

async function storeFileContents(supabase: any, analysisId: string, files: Map<string, Uint8Array>): Promise<void> {
  const filesToStore: any[] = [];
  const textFileExtensions = ['.js', '.json', '.html', '.css', '.xml', '.txt', '.md', '.yml', '.yaml'];

  for (const [filePath, content] of files.entries()) {
    const isTextFile = textFileExtensions.some(ext => filePath.toLowerCase().endsWith(ext));

    if (isTextFile && content.byteLength <= MAX_INDIVIDUAL_FILE_SIZE) {
      try {
        const fileContent = new TextDecoder().decode(content);
        const fileType = filePath.split('.').pop()?.toLowerCase() || 'unknown';

        filesToStore.push({
          analysis_id: analysisId,
          file_path: filePath,
          file_content: fileContent,
          file_size: content.byteLength,
          file_type: fileType
        });
      } catch (_e) {
        console.error(`Failed to decode ${filePath}:`, _e);
      }
    }
  }

  if (filesToStore.length > 0) {
    const { error } = await supabase
      .from("extension_files")
      .insert(filesToStore);

    if (error) {
      console.error("Error storing file contents:", error);
    } else {
      console.log(`Stored ${filesToStore.length} files for analysis ${analysisId}`);
    }
  }
}
