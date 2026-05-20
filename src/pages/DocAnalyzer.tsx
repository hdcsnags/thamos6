import { useState, useRef } from 'react';
import { FileText, AlertTriangle, CheckCircle, Shield, Copy, Check, Upload } from 'lucide-react';
import { useDesktop } from '../contexts/DesktopContext';
import { supabase } from '../lib/supabase';

const P = {
  void: '#060610',
  surface: '#0a0e1a',
  surfaceLight: '#0f1424',
  border: '#1a1f35',
  dim: '#3a3f55',
  text: '#8a8fa8',
  textLight: '#c8cde0',
  cyan: '#00d9ff',
  green: '#00ff9d',
  amber: '#fbbf24',
  pink: '#ff0080',
  rose: '#f43f5e',
};

const ACCEPTED_TYPES = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
const MAX_SIZE_MB = 10;

interface Finding {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: string;
  detail: string;
}

interface DocResult {
  filename: string;
  fileType: 'pdf' | 'ooxml' | 'ole' | 'unknown';
  findings: Finding[];
  iocs: {
    urls: Array<{ value: string; enrichment: any }>;
  };
  summary: {
    totalScore: number;
    isMalicious: boolean;
    findingCounts: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
  };
}

type Tab = 'findings' | 'iocs' | 'raw';

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#f43f5e',
  high: '#ff0080',
  medium: '#fbbf24',
  low: '#00d9ff',
  info: '#3a3f55',
};

export default function DocAnalyzer() {
  const { openWindow } = useDesktop();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DocResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('findings');
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const analyzeFile = async (file: File) => {
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File too large (max ${MAX_SIZE_MB}MB)`);
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data: { session } } = await supabase.auth.getSession();
      const hdrs: Record<string, string> = {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      };
      if (session?.access_token) hdrs['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-doc`,
        {
          method: 'POST',
          headers: hdrs,
          body: JSON.stringify({ file: b64, filename: file.name }),
        }
      );
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      setResult(await res.json());
      setActiveTab('findings');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) analyzeFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) analyzeFile(file);
    e.target.value = '';
  };

  const handleScanURL = (url: string) => {
    openWindow({ appId: 'url-result', title: `URL: ${url}`, data: { value: url } });
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'findings', label: `Findings${result ? ` (${result.findings.length})` : ''}` },
    { id: 'iocs', label: `IOCs${result ? ` (${result.iocs.urls.length})` : ''}` },
    { id: 'raw', label: 'Raw JSON' },
  ];

  const verdictColor = result
    ? result.summary.isMalicious
      ? P.rose
      : result.summary.totalScore >= 40
      ? P.amber
      : P.green
    : P.green;

  const verdictLabel = result
    ? result.summary.isMalicious
      ? 'MALICIOUS'
      : result.summary.totalScore >= 40
      ? 'SUSPICIOUS'
      : 'CLEAN'
    : '';

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: P.void, fontFamily: 'JetBrains Mono, monospace' }}>
      {!result ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4" style={{ color: P.amber }} />
            <span className="text-sm font-medium tracking-wider" style={{ color: P.amber }}>DOC ANALYZER</span>
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => !loading && fileRef.current?.click()}
            className="flex flex-col items-center justify-center gap-3 p-12 rounded-lg transition-all"
            style={{
              border: `2px dashed ${dragOver ? P.amber : P.border}`,
              backgroundColor: dragOver ? `${P.amber}08` : P.surfaceLight,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: P.amber, borderTopColor: 'transparent' }} />
                <p className="text-xs" style={{ color: P.textLight }}>Analyzing document...</p>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 opacity-40" style={{ color: P.amber }} />
                <div className="text-center space-y-1">
                  <p className="text-sm" style={{ color: P.textLight }}>Drop a document here or click to upload</p>
                  <p className="text-[10px]" style={{ color: P.dim }}>
                    PDF · DOC · DOCX · XLS · XLSX · PPT · PPTX · Max {MAX_SIZE_MB}MB
                  </p>
                </div>
              </>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            className="hidden"
            onChange={handleFileInput}
          />

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded" style={{ backgroundColor: `${P.rose}10`, border: `1px solid ${P.rose}30` }}>
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: P.rose }} />
              <p className="text-xs" style={{ color: P.rose }}>{error}</p>
            </div>
          )}

          <div className="space-y-1.5 pt-2">
            <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: P.dim }}>What gets checked</p>
            {[
              'PDF: /JavaScript, /OpenAction, /Launch, /EmbeddedFile objects',
              'OOXML: VBA macros, auto-open triggers, external relationships',
              'OLE: Legacy macro streams, Shell/COM invocations',
              'All formats: embedded URLs enriched via threat intel',
            ].map(item => (
              <div key={item} className="flex items-start gap-2">
                <div className="w-1 h-1 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: P.dim }} />
                <p className="text-[10px]" style={{ color: P.dim }}>{item}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div className="flex items-center px-3 shrink-0" style={{ backgroundColor: P.surface, borderBottom: `1px solid ${P.border}` }}>
            <button
              onClick={() => setResult(null)}
              className="text-xs px-2 py-2.5 mr-3 transition-all"
              style={{ color: P.dim }}
            >
              ← Back
            </button>
            <div className="w-px h-4 mr-3" style={{ backgroundColor: P.border }} />
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className="px-3 py-2.5 text-xs transition-all border-b-2"
                style={{
                  borderBottomColor: activeTab === t.id ? P.amber : 'transparent',
                  color: activeTab === t.id ? P.amber : P.dim,
                }}
              >
                {t.label}
              </button>
            ))}
            <div className="ml-auto">
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(JSON.stringify(result, null, 2)).catch(() => {});
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs rounded transition-all"
                style={{ color: P.dim, border: `1px solid ${P.border}` }}
              >
                {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Export</>}
              </button>
            </div>
          </div>

          {/* Summary banner */}
          <div
            className="flex items-center gap-4 px-4 py-2.5 shrink-0 flex-wrap"
            style={{
              backgroundColor: `${verdictColor}10`,
              borderBottom: `1px solid ${verdictColor}30`,
            }}
          >
            <div className="flex items-center gap-2">
              {result.summary.isMalicious
                ? <AlertTriangle className="w-3.5 h-3.5" style={{ color: P.rose }} />
                : <CheckCircle className="w-3.5 h-3.5" style={{ color: verdictColor }} />}
              <span className="text-xs font-medium" style={{ color: verdictColor }}>{verdictLabel}</span>
            </div>
            <span className="text-xs" style={{ color: P.dim }}>
              {result.filename} · <span className="uppercase">{result.fileType}</span>
            </span>
            <span className="text-[10px] tabular-nums ml-auto" style={{ color: P.dim }}>
              Score: {result.summary.totalScore}
            </span>
            {(Object.entries(result.summary.findingCounts) as [string, number][])
              .filter(([, c]) => c > 0)
              .map(([sev, count]) => (
                <span
                  key={sev}
                  className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                  style={{ backgroundColor: `${SEVERITY_COLOR[sev]}15`, color: SEVERITY_COLOR[sev] }}
                >
                  {count} {sev.toUpperCase()}
                </span>
              ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'findings' && (
              <div className="space-y-2">
                {result.findings.map((f, i) => {
                  const color = SEVERITY_COLOR[f.severity] || P.dim;
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-3 rounded"
                      style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}
                    >
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 mt-0.5 uppercase"
                        style={{ backgroundColor: `${color}15`, color, border: `1px solid ${color}30` }}
                      >
                        {f.severity}
                      </span>
                      <div className="min-w-0">
                        <span className="text-[10px] font-medium" style={{ color: P.textLight }}>{f.category}</span>
                        <p className="text-xs mt-0.5" style={{ color: P.text }}>{f.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'iocs' && (
              <div className="space-y-2">
                {result.iocs.urls.length === 0 ? (
                  <div className="text-center py-10">
                    <Shield className="w-8 h-8 mx-auto opacity-20 mb-2" style={{ color: P.dim }} />
                    <p className="text-xs" style={{ color: P.dim }}>No URLs extracted from document</p>
                  </div>
                ) : (
                  result.iocs.urls.map((item, i) => {
                    const enrich = item.enrichment;
                    const score: number | null = enrich
                      ? (enrich.overallThreatScore ?? enrich.maxThreatScore ?? null)
                      : null;
                    const malicious = enrich?.isMalicious === true;
                    const scoreColor = score !== null
                      ? (score >= 70 ? P.rose : score >= 40 ? P.amber : P.dim)
                      : null;
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between px-3 py-2 rounded group"
                        style={{ backgroundColor: P.surface, border: `1px solid ${malicious ? P.rose + '40' : P.border}` }}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                            style={{ backgroundColor: `${P.pink}15`, color: P.pink, border: `1px solid ${P.pink}30` }}
                          >
                            url
                          </span>
                          <code className="text-xs truncate" style={{ color: P.textLight }}>
                            {item.value.length > 65 ? item.value.slice(0, 65) + '…' : item.value}
                          </code>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                          {malicious && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: `${P.rose}15`, color: P.rose }}>
                              MALICIOUS
                            </span>
                          )}
                          {score !== null && (
                            <span
                              className="text-[9px] px-1.5 py-0.5 rounded font-bold tabular-nums"
                              style={{ backgroundColor: `${scoreColor}15`, color: scoreColor ?? P.dim }}
                            >
                              {score}
                            </span>
                          )}
                          <button
                            onClick={() => handleScanURL(item.value)}
                            className="text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-all"
                            style={{ backgroundColor: `${P.pink}15`, color: P.pink, border: `1px solid ${P.pink}30` }}
                          >
                            SCAN →
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTab === 'raw' && (
              <pre
                className="text-[10px] leading-relaxed overflow-auto"
                style={{ color: P.text, fontFamily: 'JetBrains Mono, monospace' }}
              >
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        </>
      )}
    </div>
  );
}
