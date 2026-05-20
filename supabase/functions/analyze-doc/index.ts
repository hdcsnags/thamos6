import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const TI_URL = `${SUPABASE_URL}/functions/v1/threat-intel`;

const DANGEROUS_PDF_KEYS = [
  "/JS",
  "/JavaScript",
  "/OpenAction",
  "/Launch",
  "/EmbeddedFile",
  "/URI",
  "/AA",
  "/AcroForm",
];

interface Finding {
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  detail: string;
}

function bearerToken(req: Request): string {
  return req.headers.get("authorization") ?? "";
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function detectFileType(bytes: Uint8Array): "pdf" | "ooxml" | "ole" | "unknown" {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return "ooxml";
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return "ole";
  return "unknown";
}

function bytesToText(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

function extractURLsFromText(text: string): string[] {
  const re = /https?:\/\/[^\s<>"'\])}]+/gi;
  return [...new Set(text.match(re) ?? [])];
}

function analyzePDF(text: string): { findings: Finding[]; urls: string[] } {
  const findings: Finding[] = [];

  for (const key of DANGEROUS_PDF_KEYS) {
    const escaped = key.replace(/\//g, "\\/");
    const count = (text.match(new RegExp(escaped, "g")) ?? []).length;
    if (count > 0) {
      const severity: Finding["severity"] =
        ["/JS", "/JavaScript", "/OpenAction", "/Launch"].includes(key)
          ? "critical"
          : ["/EmbeddedFile", "/AA"].includes(key)
          ? "high"
          : "medium";
      findings.push({
        severity,
        category: "PDF Object",
        detail: `${key} found (${count} occurrence${count !== 1 ? "s" : ""})`,
      });
    }
  }

  if (/eval\s*\(/.test(text)) {
    findings.push({ severity: "critical", category: "JavaScript", detail: "eval() call detected in PDF" });
  }
  if (/unescape\s*\(/.test(text)) {
    findings.push({ severity: "high", category: "JavaScript", detail: "unescape() call detected (obfuscation indicator)" });
  }

  const streamCount = (text.match(/stream\b/g) ?? []).length;
  if (streamCount > 50) {
    findings.push({ severity: "medium", category: "Structure", detail: `High stream count: ${streamCount} (possible obfuscation)` });
  }

  if (findings.length === 0) {
    findings.push({ severity: "info", category: "Structure", detail: "No suspicious PDF objects detected" });
  }

  return { findings, urls: extractURLsFromText(text) };
}

function analyzeOOXML(text: string): { findings: Finding[]; urls: string[] } {
  const findings: Finding[] = [];

  if (/vbaProject\.bin/i.test(text)) {
    findings.push({ severity: "high", category: "Macro", detail: "VBA macro project detected (vbaProject.bin)" });
  }

  if (/autoOpen|Auto_Open|AutoOpen/i.test(text)) {
    findings.push({ severity: "critical", category: "Macro", detail: "Auto-open macro trigger detected" });
  }

  const externalRels = (text.match(/Type="[^"]*[Ee]xternal[^"]*"/g) ?? []).length;
  if (externalRels > 0) {
    findings.push({ severity: "high", category: "External Link", detail: `${externalRels} external relationship(s) detected` });
  }

  if (findings.length === 0) {
    findings.push({ severity: "info", category: "Structure", detail: "No suspicious OOXML patterns detected" });
  }

  return { findings, urls: extractURLsFromText(text) };
}

function analyzeOLE(text: string): { findings: Finding[]; urls: string[] } {
  const findings: Finding[] = [];

  findings.push({ severity: "high", category: "Format", detail: "Legacy OLE format — macro risk elevated (pre-OOXML)" });

  if (/AutoOpen|Auto_Open|Document_Open|Workbook_Open/i.test(text)) {
    findings.push({ severity: "critical", category: "Macro", detail: "Auto-open macro trigger detected in OLE document" });
  }

  if (/Shell|CreateObject|WScript/i.test(text)) {
    findings.push({ severity: "critical", category: "Macro", detail: "Shell/COM object invocation detected (possible payload execution)" });
  }

  return { findings, urls: extractURLsFromText(text) };
}

async function enrichURL(url: string, auth: string): Promise<any> {
  try {
    const res = await fetch(`${TI_URL}/url`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { url, error: `HTTP ${res.status}` };
    return await res.json();
  } catch (e) {
    return { url, error: String(e) };
  }
}

function riskScore(findings: Finding[]): number {
  const weights: Record<Finding["severity"], number> = {
    critical: 90,
    high: 60,
    medium: 30,
    low: 10,
    info: 0,
  };
  if (findings.length === 0) return 0;
  return Math.max(...findings.map((f) => weights[f.severity] ?? 0));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  try {
    const body = await req.json();
    const { file: b64, filename = "document" } = body as {
      file?: string;
      filename?: string;
    };

    if (!b64) {
      return new Response(
        JSON.stringify({ error: "file (base64) required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const bytes = base64ToBytes(b64);
    const fileType = detectFileType(bytes);
    const text = bytesToText(bytes);
    const auth = bearerToken(req);

    let findings: Finding[] = [];
    let extractedURLs: string[] = [];

    if (fileType === "pdf") {
      const r = analyzePDF(text);
      findings = r.findings;
      extractedURLs = r.urls;
    } else if (fileType === "ooxml") {
      const r = analyzeOOXML(text);
      findings = r.findings;
      extractedURLs = r.urls;
    } else if (fileType === "ole") {
      const r = analyzeOLE(text);
      findings = r.findings;
      extractedURLs = r.urls;
    } else {
      findings = [{ severity: "info", category: "Format", detail: "Unrecognized file format — cannot statically analyze" }];
    }

    const urlsToEnrich = extractedURLs.slice(0, 5);
    const urlResults = await Promise.all(urlsToEnrich.map((u) => enrichURL(u, auth)));

    const urlMalicious = urlResults.some((r) => r?.isMalicious === true);
    const urlMaxScore = urlResults.reduce(
      (m, r) => Math.max(m, r?.overallThreatScore ?? r?.maxThreatScore ?? 0),
      0
    );

    const docScore = riskScore(findings);
    const totalScore = Math.max(docScore, urlMaxScore);
    const isMalicious = urlMalicious || findings.some((f) => f.severity === "critical");

    return new Response(
      JSON.stringify({
        filename,
        fileType,
        findings,
        iocs: {
          urls: urlsToEnrich.map((v, i) => ({ value: v, enrichment: urlResults[i] })),
        },
        summary: {
          totalScore,
          isMalicious,
          findingCounts: {
            critical: findings.filter((f) => f.severity === "critical").length,
            high: findings.filter((f) => f.severity === "high").length,
            medium: findings.filter((f) => f.severity === "medium").length,
            low: findings.filter((f) => f.severity === "low").length,
          },
        },
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
