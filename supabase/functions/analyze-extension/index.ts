import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import JSZip from "npm:jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_INDIVIDUAL_FILE_SIZE = 2 * 1024 * 1024;
const SCAN_TIMEOUT_MS = 250;
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
  "PERF-1": {
    id: "PERF-1",
    severity: "low",
    confidence: "high",
    category: "performance",
    title: "Files Skipped During Scan",
    description: "Some files were too large or timed out during analysis"
  }
};

const SUSPICIOUS_TLDS = ['.xyz', '.top', '.tk', '.ml', '.ga', '.cf', '.gq', '.pw', '.cc'];
const WHITELISTED_DOMAINS = [
  'google-analytics.com', 'googleapis.com', 'gstatic.com',
  'cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com',
  'github.com', 'githubusercontent.com'
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

    const extensionId = extractExtensionId(extensionUrl);
    if (!extensionId) {
      return new Response(
        JSON.stringify({ error: "Invalid Chrome Web Store URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Analyzing extension: ${extensionId}`);

    const crxUrl = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=120.0&acceptformat=crx3&x=id%3D${extensionId}%26installsource%3Dondemand%26uc`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT);

    const crxResponse = await fetch(crxUrl, {
      redirect: "follow",
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!crxResponse.ok) {
      console.error(`CRX download failed: ${crxResponse.status} ${crxResponse.statusText}`);
      return new Response(
        JSON.stringify({ error: `Failed to download extension: ${crxResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentType = crxResponse.headers.get("content-type") || "";
    console.log(`Response Content-Type: ${contentType}`);

    if (contentType.includes("text/html")) {
      return new Response(
        JSON.stringify({ error: "Extension not found or unavailable" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const crxData = await crxResponse.arrayBuffer();
    console.log(`Downloaded CRX: ${crxData.byteLength} bytes`);

    if (crxData.byteLength === 0) {
      return new Response(
        JSON.stringify({ error: "Downloaded file is empty" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    const manifest = JSON.parse(new TextDecoder().decode(manifestFile));
    console.log(`Manifest parsed: ${manifest.name} v${manifest.version}`);

    const findings: SecurityFinding[] = [];
    const iocs: IOC[] = [];
    const behaviorFlags: BehaviorFlag[] = [];
    const skippedFiles: SkippedFile[] = [];

    analyzePermissions(manifest, findings);
    await analyzeAllFiles(files, manifest, findings, iocs, skippedFiles);
    analyzeManifestDeep(manifest, findings);

    const behaviorAnalysis = analyzeBehaviorPatterns(manifest, findings, iocs);
    behaviorFlags.push(...behaviorAnalysis.flags);
    findings.push(...behaviorAnalysis.findings);

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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
        files_skipped_count: skippedFiles.length
      })
      .select()
      .single();

    if (analysisError) {
      console.error("Database error:", analysisError);
      throw analysisError;
    }

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
        files_skipped: skippedFiles.length
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

function extractExtensionId(url: string): string | null {
  const match = url.match(/\/detail\/[^\/]+\/([a-z]{32})/i);
  return match ? match[1] : null;
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
  const dangerousPermissions = {
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

        if (isScript) {
          analyzeJavaScript(filename, text, findings, iocs, allExtensionIds);
        } else if (isHtml) {
          analyzeHTML(filename, text, findings, iocs);
        } else if (isJson && filename !== "manifest.json") {
          analyzeJSON(filename, text, iocs);
        }
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

function analyzeJSON(filename: string, json: string, iocs: IOC[]): void {
  extractIOCsFromText(json, filename, iocs, []);
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
    } catch (e) {
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
    const rule = RULE_DEFINITIONS["OBF-1"];
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
  const severityScores = {
    low: 5,
    medium: 15,
    high: 30,
    critical: 50,
  };

  const confidenceMultipliers = {
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