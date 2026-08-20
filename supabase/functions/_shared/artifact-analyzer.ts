// _shared/artifact-analyzer.ts — recursive attachment extraction for the ThamOS
// email pipeline (Phase A: OOXML → media → QR → URL; Phase C: PDF structural
// analysis → link/QR → URL).
//
// Background: Microsoft Defender/SafeLinks only sees what's in the message
// body/headers. An attacker can put the real payload inside an attachment —
// e.g. a DOCX or PDF containing a QR-code image whose decoded URL embeds the
// victim's UPN (a quishing/AITM specimen), or a PDF link/JavaScript/OpenAction
// that never appears as body text. Nothing in this codebase previously looked
// inside attachment bytes: fillAttachmentHashes() hashed them and threw them
// away. This module opens OOXML (docx/xlsx/pptx) containers as ZIP/OPC
// archives and PDFs as their real object graph (via pdf-lib, not a Latin-1
// text scan of the compressed bytes), decodes embedded PNG/JPEG images, runs
// a local QR decoder, extracts URI link/JavaScript/OpenAction/Launch/Form
// evidence, and feeds any recovered URL back through the existing
// URL-analysis pipeline — entirely offline, without opening the document,
// executing anything, or fetching anything external.
//
// Deliberately bounded: Supabase Edge Functions run under tight CPU/memory
// caps, and a malicious ZIP/PDF is itself an attack surface (decompression
// bombs, path traversal, entry-count abuse, deeply nested action chains).
// Every limit below exists to keep this safe to run on untrusted,
// attacker-supplied bytes — not just to save compute.
//
// OLE (legacy .doc/.xls) structural analysis and PDF page rasterization/OCR
// are a separate, deferred phase (see the Sol brief this implements) — OLE
// still returns `unsupported`. PDF image decoding is scoped to 8-bit
// DeviceGray/RGB/CMYK samples (raw or DCTDecode/JPEG); Indexed color spaces,
// JPXDecode (JPEG2000) and CCITTFaxDecode (fax/bilevel scans) are flagged as
// undecoded rather than silently skipped.

// deno-lint-ignore-file no-explicit-any
import { unzipSync, strFromU8 } from "npm:fflate@0.8.2";
import jsQR from "npm:jsqr@1.4.0";
import { PNG } from "npm:pngjs@7.0.0";
import jpeg from "npm:jpeg-js@0.4.4";
import { Buffer } from "node:buffer";
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFRawStream,
  PDFRef,
  EncryptedPDFError,
  decodePDFRawStream,
} from "npm:pdf-lib@1.17.1";

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

// PDF-specific limits (separate from the ZIP ones above — PDFs aren't
// compressed archives at the container level, so the risk shape differs:
// deeply nested /Next action chains, huge object counts, oversized streams).
const MAX_PDF_OBJECTS_SCANNED = 2000;
const MAX_PDF_ACTION_DEPTH = 8;

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
async function analyzeOoxmlAttachment(
  bytes: Uint8Array,
  metadata: { filename: string; contentType: string; recipients: string[] },
): Promise<AttachmentAnalysis> {
  const detectedType: AttachmentAnalysis["detectedType"] = "ooxml";
  const findings: ArtifactFinding[] = [];
  const artifacts: RecoveredArtifact[] = [];

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

/**
 * Decode a PDF `/Subtype /Image` XObject to an RGBA pixel buffer for QR
 * scanning. Scoped to 8-bit-per-component DeviceGray/DeviceRGB/DeviceCMYK
 * (raw, via whatever non-image filter chain PDF used — FlateDecode/LZWDecode/
 * ASCII85/ASCIIHex/RunLength, all decodable via pdf-lib's decodePDFRawStream)
 * plus DCTDecode (JPEG, via jpeg-js). Indexed color spaces, 1/2/4/16-bit
 * samples, JPXDecode (JPEG2000) and CCITTFaxDecode (fax/bilevel) are real PDF
 * features we do not decode in this phase — returned as `unsupported` with the
 * reason, not silently dropped.
 */
function decodePdfImageObject(
  streamObj: InstanceType<typeof PDFRawStream>,
): { width: number; height: number; rgba: Uint8ClampedArray; note: string } | { unsupported: string } {
  const dict = streamObj.dict;
  const widthObj: any = dict.get(PDFName.of("Width"));
  const heightObj: any = dict.get(PDFName.of("Height"));
  const width = widthObj?.asNumber?.();
  const height = heightObj?.asNumber?.();
  const bpcObj: any = dict.get(PDFName.of("BitsPerComponent"));
  const bpc = bpcObj?.asNumber?.() ?? 8;
  const colorSpace = dict.get(PDFName.of("ColorSpace"))?.toString?.();
  const filter: any = dict.get(PDFName.of("Filter"));
  const filterNames: string[] = filter
    ? (filter.constructor?.name === "PDFArray"
      ? Array.from({ length: filter.size() }, (_, i) => filter.lookup(i).toString())
      : [filter.toString()])
    : [];
  const lastFilter = filterNames[filterNames.length - 1];

  if (!width || !height) return { unsupported: "missing Width/Height" };
  if (width * height > MAX_IMAGE_PIXELS) return { unsupported: "image exceeds pixel ceiling" };

  if (lastFilter === "/DCTDecode") {
    try {
      const decoded = jpeg.decode(streamObj.contents, { useTArray: true }) as { width: number; height: number; data: Uint8Array };
      return {
        width: decoded.width,
        height: decoded.height,
        rgba: new Uint8ClampedArray(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength),
        note: "DCTDecode (JPEG)",
      };
    } catch (e) {
      return { unsupported: `JPEG decode failed: ${String(e)}` };
    }
  }
  if (lastFilter === "/JPXDecode") return { unsupported: "JPXDecode (JPEG2000) not decoded" };
  if (lastFilter === "/CCITTFaxDecode") return { unsupported: "CCITTFaxDecode (fax/bilevel) not decoded" };
  if (bpc !== 8) return { unsupported: `${bpc}-bit samples not decoded (8-bit only)` };

  let samples: Uint8Array;
  try {
    samples = filter ? decodePDFRawStream({ dict, contents: streamObj.contents }).decode() : streamObj.contents;
  } catch (e) {
    return { unsupported: `stream decode failed: ${String(e)}` };
  }

  const out = new Uint8ClampedArray(width * height * 4);
  if (colorSpace === "/DeviceGray" || colorSpace === "/CalGray") {
    for (let i = 0, p = 0; i < width * height; i++, p += 4) {
      const g = samples[i] ?? 0;
      out[p] = g; out[p + 1] = g; out[p + 2] = g; out[p + 3] = 255;
    }
  } else if (colorSpace === "/DeviceRGB" || colorSpace === "/CalRGB") {
    for (let i = 0, p = 0; i < width * height; i++, p += 4) {
      out[p] = samples[i * 3] ?? 0; out[p + 1] = samples[i * 3 + 1] ?? 0; out[p + 2] = samples[i * 3 + 2] ?? 0; out[p + 3] = 255;
    }
  } else if (colorSpace === "/DeviceCMYK") {
    for (let i = 0, p = 0; i < width * height; i++, p += 4) {
      const c = (samples[i * 4] ?? 0) / 255, m = (samples[i * 4 + 1] ?? 0) / 255, y = (samples[i * 4 + 2] ?? 0) / 255, k = (samples[i * 4 + 3] ?? 0) / 255;
      out[p] = 255 * (1 - c) * (1 - k);
      out[p + 1] = 255 * (1 - m) * (1 - k);
      out[p + 2] = 255 * (1 - y) * (1 - k);
      out[p + 3] = 255;
    }
  } else {
    return { unsupported: `unsupported color space ${colorSpace ?? "unknown"} (likely Indexed)` };
  }
  return { width, height, rgba: out, note: `${filterNames.join(",") || "raw"} ${colorSpace}` };
}

/**
 * Walk a PDF action dictionary (and any /Next chain, bounded by
 * MAX_PDF_ACTION_DEPTH) recording URI targets and flagging dangerous action
 * types (JavaScript/Launch/SubmitForm/GoToR). Actions are frequently inlined
 * directly inside an annotation's /A entry rather than registered as their
 * own indirect object, so this takes the already-resolved value, not a ref.
 */
function walkPdfAction(
  actionLike: any,
  ctx: InstanceType<typeof PDFDocument>["context"],
  depth: number,
  out: { uris: string[]; findings: ArtifactFinding[] },
): void {
  if (!actionLike || depth > MAX_PDF_ACTION_DEPTH) return;
  let dict = actionLike;
  if (dict instanceof PDFRef) dict = ctx.lookup(dict);
  if (!(dict instanceof PDFDict)) return;

  const s = (dict.get(PDFName.of("S")) as any)?.toString?.();
  if (s === "/URI") {
    const uri: any = dict.get(PDFName.of("URI"));
    const text = uri?.decodeText ? uri.decodeText() : uri?.toString?.();
    if (text) out.uris.push(text);
  } else if (s === "/JavaScript") {
    out.findings.push({ severity: "critical", category: "Script", detail: "JavaScript action present in the PDF (runs automatically or on a trigger)." });
  } else if (s === "/Launch") {
    out.findings.push({ severity: "critical", category: "Execution", detail: "Launch action present — instructs a viewer to run an external program/file." });
  } else if (s === "/SubmitForm" || s === "/ImportData") {
    out.findings.push({ severity: "medium", category: "Form", detail: `${s.slice(1)} action present.` });
  } else if (s === "/GoToR" || s === "/GoToE") {
    out.findings.push({ severity: "medium", category: "Navigation", detail: `${s.slice(1)} (remote/embedded go-to) action present.` });
  }

  const next = dict.get(PDFName.of("Next"));
  if (next) walkPdfAction(next, ctx, depth + 1, out);
}

/**
 * Parse a PDF's real object graph (not a Latin-1 text scan of the compressed
 * bytes) via pdf-lib: recover URI link/action targets, decode embedded raster
 * images and read any QR codes, and structurally flag JavaScript/OpenAction/
 * Launch/AcroForm — the PDF analogue of analyzeOoxmlAttachment above.
 */
async function analyzePdfAttachment(
  bytes: Uint8Array,
  metadata: { filename: string; contentType: string; recipients: string[] },
): Promise<AttachmentAnalysis> {
  const detectedType: AttachmentAnalysis["detectedType"] = "pdf";
  const findings: ArtifactFinding[] = [];
  const artifacts: RecoveredArtifact[] = [];

  let pdfDoc: InstanceType<typeof PDFDocument>;
  try {
    pdfDoc = await PDFDocument.load(bytes, { throwOnInvalidObject: false, updateMetadata: false });
  } catch (e) {
    if (e instanceof EncryptedPDFError) {
      return {
        status: "partial",
        detectedType,
        findings: [{ severity: "medium", category: "Encryption", detail: `"${metadata.filename}" is password-protected — structural analysis (links/QR/JS) could not run.` }],
        artifacts: [],
      };
    }
    return {
      status: "error",
      detectedType,
      findings: [{ severity: "medium", category: "Container", detail: `Failed to parse "${metadata.filename}" as PDF: ${String(e)}` }],
      artifacts: [],
    };
  }

  const ctx = pdfDoc.context;
  const actionEvidence = { uris: [] as string[], findings: [] as ArtifactFinding[] };
  let objectsScanned = 0;
  let objectLimitHit = false;
  let qrFound = 0;
  let imagesScanned = 0;
  let timeBudgetHit = false;
  const deadline = Date.now() + QR_DECODE_BUDGET_MS;

  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    objectsScanned++;
    if (objectsScanned > MAX_PDF_OBJECTS_SCANNED) {
      objectLimitHit = true;
      break;
    }

    if (obj instanceof PDFRawStream && (obj.dict.get(PDFName.of("Subtype")) as any)?.toString?.() === "/Image") {
      if (imagesScanned >= MAX_IMAGES_SCANNED || Date.now() > deadline) {
        if (Date.now() > deadline) timeBudgetHit = true;
        continue;
      }
      imagesScanned++;
      const decoded = decodePdfImageObject(obj);
      if ("unsupported" in decoded) {
        findings.push({ severity: "low", category: "Image", detail: `Embedded image (${ref.toString()}) not decoded: ${decoded.unsupported}.` });
        continue;
      }
      let code: { data: string } | null = null;
      try {
        code = jsQR(decoded.rgba, decoded.width, decoded.height);
      } catch { /* not a QR — ignore */ }
      if (!code?.data) continue;
      qrFound++;
      const qrText = code.data.trim();
      const isUrl = /^https?:\/\//i.test(qrText);
      findings.push({
        severity: "critical",
        category: "QR Code",
        detail: `QR code decoded from embedded image ${ref.toString()}${isUrl ? ` → ${defang(qrText)}` : " (non-URL payload)"}.`,
      });
      if (isUrl) {
        artifacts.push({ kind: "qr-url", value: qrText, defangedValue: defang(qrText), sourcePart: ref.toString(), imageIndex: imagesScanned - 1 });
      }
      continue;
    }

    if (obj instanceof PDFDict) {
      const a = obj.get(PDFName.of("A"));
      if (a) walkPdfAction(a, ctx, 0, actionEvidence);
      const aa = obj.get(PDFName.of("AA"));
      if (aa instanceof PDFDict) {
        for (const k of aa.keys()) walkPdfAction(aa.get(k), ctx, 0, actionEvidence);
      }
      const embeddedFile = obj.get(PDFName.of("EF"));
      if (embeddedFile) {
        findings.push({ severity: "medium", category: "Embedded File", detail: "PDF file-attachment (filespec with /EF embedded-file stream) present." });
      }
    }
  }

  try {
    const catalog = pdfDoc.catalog;
    const openAction = catalog.get(PDFName.of("OpenAction"));
    if (openAction) {
      walkPdfAction(openAction, ctx, 0, actionEvidence);
      findings.push({ severity: "high", category: "AutoRun", detail: "Document has an OpenAction that runs automatically when the PDF is opened." });
    }
    if (catalog.get(PDFName.of("AcroForm"))) {
      findings.push({ severity: "low", category: "Form", detail: "Document contains an AcroForm (fillable fields)." });
    }
  } catch { /* catalog access is best-effort */ }

  findings.push(...actionEvidence.findings);
  for (const uri of actionEvidence.uris) {
    findings.push({ severity: "medium", category: "Link", detail: `URI action/link target: ${defang(uri)}.` });
    artifacts.push({ kind: "url", value: uri, defangedValue: defang(uri), sourcePart: "annotation/action" });
  }

  if (objectLimitHit) {
    findings.push({ severity: "info", category: "Coverage", detail: `Only the first ${MAX_PDF_OBJECTS_SCANNED} objects were scanned — this PDF exceeds the safety ceiling for object count.` });
  }
  if (timeBudgetHit) {
    findings.push({ severity: "info", category: "Coverage", detail: "QR-decode time budget reached — remaining embedded images in this attachment were not scanned." });
  }
  if (imagesScanned > 0 && qrFound === 0) {
    findings.push({ severity: "info", category: "QR Code", detail: `${imagesScanned} embedded image(s) scanned — no QR code detected.` });
  }
  if (findings.length === 0) {
    findings.push({ severity: "info", category: "Structure", detail: "No suspicious PDF structure detected (no links, scripts, forms, or QR codes found)." });
  }

  return {
    status: (objectLimitHit || timeBudgetHit) ? "partial" : "complete",
    detectedType,
    findings,
    artifacts,
  };
}

/**
 * Directly-attached PNG/JPEG images aren't wrapped in a document container —
 * route them through the same bounded pixel-decode + QR reader used for
 * OOXML/PDF embedded media, so a quishing QR mailed as a bare image
 * attachment (not embedded in a PDF/DOCX) isn't silently skipped as
 * `unsupported`. Reuses the existing pixel-ceiling/time-budget limits.
 */
function analyzeImageAttachment(
  bytes: Uint8Array,
  metadata: { filename: string; contentType: string; recipients: string[] },
): AttachmentAnalysis {
  const detectedType: AttachmentAnalysis["detectedType"] = "image";
  const findings: ArtifactFinding[] = [];
  const artifacts: RecoveredArtifact[] = [];

  if (bytes.length > MAX_SINGLE_ENTRY) {
    return {
      status: "limit-reached",
      detectedType,
      findings: [{ severity: "info", category: "Coverage", detail: `"${metadata.filename}" exceeds the single-image size safety ceiling — not scanned for QR.` }],
      artifacts: [],
    };
  }

  const pixels = decodeImagePixels(bytes);
  if (!pixels) {
    return {
      status: "partial",
      detectedType,
      findings: [{ severity: "low", category: "Image", detail: `"${metadata.filename}" could not be decoded (corrupt, unsupported subformat, or exceeds the pixel ceiling) — not scanned for QR.` }],
      artifacts: [],
    };
  }

  let code: { data: string } | null = null;
  try {
    code = jsQR(pixels.data, pixels.width, pixels.height);
  } catch { /* not a QR — treated as "no QR found" */ }

  if (code?.data) {
    const qrText = code.data.trim();
    const isUrl = /^https?:\/\//i.test(qrText);
    findings.push({
      severity: "critical",
      category: "QR Code",
      detail: `QR code decoded from directly-attached image "${metadata.filename}"${isUrl ? ` → ${defang(qrText)}` : " (non-URL payload)"}.`,
    });
    if (isUrl) {
      artifacts.push({ kind: "qr-url", value: qrText, defangedValue: defang(qrText), sourcePart: metadata.filename, imageIndex: 0 });
    }
  } else {
    findings.push({ severity: "info", category: "QR Code", detail: `"${metadata.filename}" scanned — no QR code detected.` });
  }

  return { status: "complete", detectedType, findings, artifacts };
}

/**
 * Dispatches to the type-specific analyzer. OLE (legacy .doc/.xls) is not
 * yet implemented and returns `unsupported`.
 */
export async function analyzeAttachment(
  bytes: Uint8Array,
  metadata: { filename: string; contentType: string; recipients: string[] },
): Promise<AttachmentAnalysis> {
  const detectedType = detectContainerType(bytes);
  if (detectedType === "ooxml") return analyzeOoxmlAttachment(bytes, metadata);
  if (detectedType === "pdf") return analyzePdfAttachment(bytes, metadata);
  if (detectedType === "image") return analyzeImageAttachment(bytes, metadata);
  return { status: "unsupported", detectedType, findings: [], artifacts: [] };
}

