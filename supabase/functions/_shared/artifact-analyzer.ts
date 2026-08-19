// _shared/artifact-analyzer.ts — recursive attachment extraction for the ThamOS
// email pipeline (Phase A: OOXML → media → QR → URL).
//
// Background: Microsoft Defender/SafeLinks only sees what's in the message
// body/headers. An attacker can put the real payload inside an attachment —
// e.g. a DOCX containing a QR-code image whose decoded URL embeds the victim's
// UPN (a quishing/AITM specimen). Nothing in this codebase previously looked
// inside attachment bytes: fillAttachmentHashes() hashed them and threw them
// away. This module opens OOXML (docx/xlsx/pptx) containers as ZIP/OPC
// archives, decodes embedded PNG/JPEG images, runs a local QR decoder, and
// feeds any recovered URL back through the existing URL-analysis pipeline —
// entirely offline, without opening the document or fetching anything
// external.
//
// Deliberately bounded: Supabase Edge Functions run under tight CPU/memory
// caps, and a malicious ZIP is itself an attack surface (decompression bombs,
// path traversal, entry-count abuse). Every limit below exists to keep this
// safe to run on untrusted, attacker-supplied bytes — not just to save
// compute.
//
// PDF/OLE structural analysis and page rasterization/OCR are a separate,
// deferred phase (see the Sol brief this implements) — this module only
// handles OOXML/ZIP containers today; other types return `unsupported`.

// deno-lint-ignore-file no-explicit-any
import { unzipSync, strFromU8 } from "npm:fflate@0.8.2";
import jsQR from "npm:jsqr@1.4.0";
import { PNG } from "npm:pngjs@7.0.0";
import jpeg from "npm:jpeg-js@0.4.4";
import { Buffer } from "node:buffer";

export interface ArtifactFinding {
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  detail: string;
}

export interface RecoveredArtifact {
  kind: "qr-url" | "url" | "email" | "domain";
  value: string;
  defangedValue: string;
  sourcePart?: string;
  page?: number;
  imageIndex?: number;
}

export interface AttachmentAnalysis {
  status: "complete" | "partial" | "unsupported" | "limit-reached" | "error";
  detectedType: "pdf" | "ooxml" | "ole" | "archive" | "image" | "unknown";
  findings: ArtifactFinding[];
  artifacts: RecoveredArtifact[];
}

// ---------- safety limits ----------
// (Sizes chosen against the existing 5MB raw-message ceiling in
// analyze-email/email-verdict — an OOXML attachment is realistically a few MB
// at most; anything claiming to decompress far beyond that is treated as a
// probable zip bomb and rejected, not silently truncated.)
const MAX_ENTRIES = 300;
const MAX_TOTAL_UNCOMPRESSED = 40 * 1024 * 1024; // 40MB
const MAX_SINGLE_ENTRY = 12 * 1024 * 1024; // 12MB
const MAX_IMAGES_SCANNED = 25;
const MAX_IMAGE_PIXELS = 40_000_000; // ~40MP ceiling before we skip decoding
const QR_DECODE_BUDGET_MS = 4000; // soft wall-clock budget across one attachment

export function detectContainerType(bytes: Uint8Array): AttachmentAnalysis["detectedType"] {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  // ZIP local-file-header signature (PK\x03\x04) — covers OOXML (docx/xlsx/pptx)
  // and generic zip archives alike; OOXML detection here is "it's a zip", the
  // media-part scan below is what actually confirms it's an Office container.
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return "ooxml";
  if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return "ole";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image";
  return "unknown";
}

function defang(value: string): string {
  return value
    .replace(/^https?/i, (m) => (m.toLowerCase() === "https" ? "hxxps" : "hxxp"))
    .replace(/\./g, "[.]");
}

/**
 * Unzip with hard limits enforced BEFORE inflation, not after. fflate reads
 * each entry's declared uncompressed size from the ZIP central directory and
 * calls `filter()` before decompressing that entry — returning false here
 * means fflate never inflates it, which is what actually stops a
 * decompression bomb rather than just detecting one after the memory hit.
 */
function unzipWithLimits(bytes: Uint8Array, findings: ArtifactFinding[]): Record<string, Uint8Array> {
  let entryCount = 0;
  let runningTotal = 0;
  let rejectedAny = false;
  const raw = unzipSync(bytes, {
    filter(file: { name: string; originalSize: number }) {
      entryCount++;
      if (file.name.includes("..") || file.name.startsWith("/")) {
        rejectedAny = true;
        return false; // path traversal attempt
      }
      if (entryCount > MAX_ENTRIES) {
        rejectedAny = true;
        return false;
      }
      if (typeof file.originalSize === "number") {
        if (file.originalSize > MAX_SINGLE_ENTRY) {
          rejectedAny = true;
          return false;
        }
        runningTotal += file.originalSize;
        if (runningTotal > MAX_TOTAL_UNCOMPRESSED) {
          rejectedAny = true;
          return false;
        }
      }
      return true;
    },
  });
  if (rejectedAny) {
    findings.push({
      severity: "medium",
      category: "Container",
      detail: "Some archive entries exceeded size/count safety limits and were skipped without decompressing (possible zip bomb or path traversal attempt).",
    });
  }
  return raw;
}

function decodeImagePixels(bytes: Uint8Array): { width: number; height: number; data: Uint8ClampedArray } | null {
  try {
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      const png = PNG.sync.read(Buffer.from(bytes));
      if (png.width * png.height > MAX_IMAGE_PIXELS) return null;
      return {
        width: png.width,
        height: png.height,
        data: new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.byteLength),
      };
    }
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      const out = jpeg.decode(bytes, { useTArray: true }) as { width: number; height: number; data: Uint8Array };
      if (out.width * out.height > MAX_IMAGE_PIXELS) return null;
      return {
        width: out.width,
        height: out.height,
        data: new Uint8ClampedArray(out.data.buffer, out.data.byteOffset, out.data.byteLength),
      };
    }
  } catch {
    return null; // corrupt/unsupported — treated as "no QR found", not an error
  }
  return null;
}

/**
 * Extract every embedded PNG/JPEG from an OOXML (docx/xlsx/pptx) container
 * and decode any QR codes found. Also flags macro projects and external
 * relationship targets found in the .rels parts (regex-based, matching this
 * codebase's existing header/XML-lite parsing style rather than a full XML
 * DOM — consistent with how email-parser.ts already treats Defender headers).
 */
export async function analyzeAttachment(
  bytes: Uint8Array,
  metadata: { filename: string; contentType: string; recipients: string[] },
): Promise<AttachmentAnalysis> {
  const detectedType = detectContainerType(bytes);
  const findings: ArtifactFinding[] = [];
  const artifacts: RecoveredArtifact[] = [];

  if (detectedType !== "ooxml") {
    // PDF/OLE structural analysis is a separate, deferred phase.
    return { status: "unsupported", detectedType, findings, artifacts };
  }

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipWithLimits(bytes, findings);
  } catch (e) {
    return {
      status: "error",
      detectedType,
      findings: [{ severity: "medium", category: "Container", detail: `Failed to open "${metadata.filename}" as a ZIP/OOXML container: ${String(e)}` }],
      artifacts: [],
    };
  }

  const names = Object.keys(entries).filter((n) => !n.endsWith("/"));

  if (names.some((n) => /(^|\/)word\/vbaProject\.bin$/i.test(n))) {
    findings.push({ severity: "high", category: "Macro", detail: "VBA macro project embedded (word/vbaProject.bin)." });
  }

  for (const relName of names.filter((n) => /\.rels$/i.test(n))) {
    let xml = "";
    try { xml = strFromU8(entries[relName]); } catch { continue; }
    const externalCount = (xml.match(/TargetMode\s*=\s*"External"/gi) ?? []).length;
    if (externalCount > 0) {
      findings.push({ severity: "medium", category: "External Link", detail: `${externalCount} external relationship(s) declared in ${relName}.` });
    }
  }

  const allMedia = names.filter((n) => /^(word|xl|ppt)\/media\//i.test(n));
  const mediaNames = allMedia.slice(0, MAX_IMAGES_SCANNED);
  if (allMedia.length > MAX_IMAGES_SCANNED) {
    findings.push({ severity: "info", category: "Coverage", detail: `Only the first ${MAX_IMAGES_SCANNED} of ${allMedia.length} embedded media file(s) were scanned for QR codes.` });
  }

  let qrFound = 0;
  let timeBudgetHit = false;
  const deadline = Date.now() + QR_DECODE_BUDGET_MS;
  for (let i = 0; i < mediaNames.length; i++) {
    if (Date.now() > deadline) {
      timeBudgetHit = true;
      break;
    }
    const part = mediaNames[i];
    const pixels = decodeImagePixels(entries[part]);
    if (!pixels) continue; // unsupported image format, oversized, or corrupt — not an error
    let code: { data: string } | null = null;
    try {
      code = jsQR(pixels.data, pixels.width, pixels.height);
    } catch {
      continue;
    }
    if (!code?.data) continue;
    qrFound++;
    const qrText = code.data.trim();
    const isUrl = /^https?:\/\//i.test(qrText);
    findings.push({
      severity: "critical",
      category: "QR Code",
      detail: `QR code decoded from ${part}${isUrl ? ` → ${defang(qrText)}` : " (non-URL payload)"}.`,
    });
    if (isUrl) {
      artifacts.push({
        kind: "qr-url",
        value: qrText,
        defangedValue: defang(qrText),
        sourcePart: part,
        imageIndex: i,
      });
    }
  }
  if (timeBudgetHit) {
    findings.push({ severity: "info", category: "Coverage", detail: "QR-decode time budget reached — remaining embedded media in this attachment were not scanned." });
  }
  if (mediaNames.length > 0 && qrFound === 0) {
    findings.push({ severity: "info", category: "QR Code", detail: `${mediaNames.length} embedded image(s) scanned — no QR code detected.` });
  }
  if (findings.length === 0) {
    findings.push({ severity: "info", category: "Structure", detail: "No suspicious OOXML structure detected." });
  }

  return {
    status: timeBudgetHit ? "partial" : "complete",
    detectedType,
    findings,
    artifacts,
  };
}
