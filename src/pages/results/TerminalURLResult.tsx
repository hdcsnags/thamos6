import { useEffect, useState, useRef } from 'react';
import { scanURL } from '../../lib/threatIntel';
import type { URLLookupResult } from '../../types';
import { shouldShowSection, type ScanFlags } from '../../lib/cliFlags';

interface TerminalURLResultProps {
  url: string;
  flags?: ScanFlags;
  onBack?: () => void;
}

export default function TerminalURLResult({ url, flags, onBack }: TerminalURLResultProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<URLLookupResult | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const startTime = useRef(Date.now());

  const showThreats = !flags || shouldShowSection(flags, 'threats');
  const showNetwork = !flags || shouldShowSection(flags, 'network');
  const showSources = !flags || shouldShowSection(flags, 'sources');
  const showJson = flags?.json || false;

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError('');
      startTime.current = Date.now();
      try {
        const data = await scanURL(url);
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to scan URL');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [url]);

  if (loading) {
    return (
      <div className="h-full flex flex-col p-4 text-sm">
        <div className="text-[#00d9ff] mb-2">{'>'} Scanning URL: {url}</div>
        <div className="text-[#4a5568] mb-2">[*] Submitting to VirusTotal...</div>
        <div className="text-[#4a5568] mb-2">[*] Submitting to URLScan.io...</div>
        <div className="text-[#4a5568] mb-2">[*] Analyzing page content...</div>
        <div className="text-[#4a5568] mb-2">[*] Checking threat databases...</div>
        <div className="text-[#4a5568]">[*] Compiling results...</div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="h-full flex flex-col p-4 text-sm">
        <div className="text-[#ff0080] mb-2">ERROR: {error || 'Failed to fetch data'}</div>
        <div className="text-[#4a5568]">Type a new command to try again</div>
      </div>
    );
  }

  const elapsed = ((Date.now() - startTime.current) / 1000).toFixed(2);
  const isMalicious = result.isMalicious;
  const statusColor = isMalicious ? 'text-[#ff0080]' : 'text-[#00ff41]';
  const boxBorder = isMalicious ? 'border-[#ff0080]' : 'border-[#00d9ff]';
  const boxBg = isMalicious ? 'bg-[#ff0080]/5' : 'bg-[#00d9ff]/5';

  const results: Record<string, any> = result.results || {};
  const vtData = results.virustotal?.details?.data?.attributes as any;
  const urlscanData = results.urlscan as any;
  const vtStats = vtData?.last_analysis_stats;
  const sourceKeys = Object.keys(results);

  const maliciousEngines = vtData?.last_analysis_results
    ? Object.entries(vtData.last_analysis_results).filter(([_, r]: any) => r.category === 'malicious')
    : [];
  const suspiciousEngines = vtData?.last_analysis_results
    ? Object.entries(vtData.last_analysis_results).filter(([_, r]: any) => r.category === 'suspicious')
    : [];

  const copySummary = () => {
    const lines = [
      `URL: ${url}`,
      `Threat Score: ${result.overallThreatScore}/100`,
      `Verdict: ${isMalicious ? 'MALICIOUS' : 'CLEAN'}`,
      `Title: ${vtData?.title || 'Unknown'}`,
      `HTTP Status: ${vtData?.last_http_response_code || 'Unknown'}`,
      `Final URL: ${vtData?.last_final_url || 'Unknown'}`,
      `Detections: ${vtStats?.malicious || 0} malicious, ${vtStats?.suspicious || 0} suspicious`,
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (showJson) {
    return (
      <div className="h-full overflow-y-auto p-4 text-sm">
        <div className="text-[#00d9ff] mb-2">{'>'} JSON Output for URL scan</div>
        <div className="border border-[#4a5568] bg-[#0a0e1a] p-4 font-mono text-xs">
          <pre className="text-[#a5d8ff] whitespace-pre-wrap break-all">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
        <TerminalActions onBack={onBack} onCopy={copySummary} copied={copied} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 text-sm">
      <div className="mb-4">
        <div className="text-[#00d9ff] mb-1">{'>'} URL scan complete</div>
        <div className="text-[#4a5568]">[*] Analysis finished in {elapsed}s | {sourceKeys.length} sources queried</div>
      </div>

      <div className={`border ${boxBorder} ${boxBg} p-4 mb-4`}>
        <div className="text-[#00d9ff] mb-3">═══ URL ANALYSIS RESULTS ═══</div>

        <div className="space-y-1 text-[#a5d8ff]">
          <div className="text-white font-mono break-all text-xs mb-2">{url}</div>
          <Row label="VERDICT" value={`${isMalicious ? 'MALICIOUS' : 'CLEAN'} (Score: ${result.overallThreatScore}/100)`} valueClass={statusColor} />

          <Section title="PAGE INFORMATION">
            <Row label="Title" value={vtData?.title || 'Unknown'} />
            <Row label="HTTP Status" value={String(vtData?.last_http_response_code || 'Unknown')} valueClass={vtData?.last_http_response_code === 200 ? 'text-[#00ff41]' : 'text-[#fbbf24]'} />
            <Row label="Final URL" value={vtData?.last_final_url || 'Unknown'} />
            <Row label="Content Size" value={vtData?.last_http_response_content_length ? `${(vtData.last_http_response_content_length / 1024).toFixed(1)} KB` : 'Unknown'} />
          </Section>

          {showThreats && vtStats && (
            <Section title="VIRUSTOTAL ANALYSIS">
              <div className="pl-2 flex gap-4 flex-wrap">
                <span className="text-[#ff0080]">{vtStats.malicious || 0} malicious</span>
                <span className="text-[#fbbf24]">{vtStats.suspicious || 0} suspicious</span>
                <span className="text-[#00ff41]">{vtStats.harmless || 0} clean</span>
                <span className="text-[#4a5568]">{vtStats.undetected || 0} undetected</span>
              </div>
            </Section>
          )}

          {showThreats && maliciousEngines.length > 0 && (
            <Section title={`MALICIOUS DETECTIONS (${maliciousEngines.length})`}>
              <div className="pl-2 space-y-1 max-h-48 overflow-y-auto">
                {maliciousEngines.slice(0, 15).map(([engine, r]: any, i) => (
                  <div key={i} className="text-[#ff0080] text-xs">
                    {engine}: <span className="text-white">{r.result}</span>
                  </div>
                ))}
                {maliciousEngines.length > 15 && (
                  <div className="text-[#4a5568] text-xs">... and {maliciousEngines.length - 15} more</div>
                )}
              </div>
            </Section>
          )}

          {showThreats && suspiciousEngines.length > 0 && (
            <Section title={`SUSPICIOUS DETECTIONS (${suspiciousEngines.length})`}>
              <div className="pl-2 space-y-1">
                {suspiciousEngines.slice(0, 10).map(([engine, r]: any, i) => (
                  <div key={i} className="text-[#fbbf24] text-xs">
                    {engine}: <span className="text-white">{r.result}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {urlscanData?.submitted && (
            <Section title="URLSCAN.IO">
              <Row label="Status" value="Submitted" valueClass="text-[#00ff41]" />
              {urlscanData.resultUrl && (
                <div className="text-[#a5d8ff]">
                  Result <span className="text-[#4a5568]">.</span>{' '}
                  <a href={urlscanData.resultUrl} target="_blank" rel="noopener noreferrer" className="text-[#00d9ff] underline hover:text-white">
                    {urlscanData.resultUrl}
                  </a>
                </div>
              )}
            </Section>
          )}

          {showNetwork && vtData?.last_http_response_headers && (
            <Section title="HTTP RESPONSE HEADERS">
              <div className="pl-2 space-y-1">
                {Object.entries(vtData.last_http_response_headers).slice(0, 12).map(([key, value]: any, i) => (
                  <div key={i} className="text-xs">
                    <span className="text-[#00d9ff]">{key}:</span>{' '}
                    <span className="text-white break-all">{value}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {vtData?.html_meta && (
            <Section title="META TAGS">
              <div className="pl-2 space-y-1">
                {vtData.html_meta.description && (
                  <div className="text-xs">
                    <span className="text-[#00d9ff]">description:</span>{' '}
                    <span className="text-white">{vtData.html_meta.description[0]}</span>
                  </div>
                )}
                {vtData.html_meta.viewport && (
                  <div className="text-xs">
                    <span className="text-[#00d9ff]">viewport:</span>{' '}
                    <span className="text-white">{vtData.html_meta.viewport[0]}</span>
                  </div>
                )}
                {vtData.html_meta.keywords && (
                  <div className="text-xs">
                    <span className="text-[#00d9ff]">keywords:</span>{' '}
                    <span className="text-white">{vtData.html_meta.keywords[0]}</span>
                  </div>
                )}
              </div>
            </Section>
          )}

          {showSources && (
            <Section title="SOURCE STATUS">
              <div className="space-y-1">
                {sourceKeys.map(key => {
                  const s = results[key];
                  const hasError = s?.error;
                  const icon = hasError ? '✗' : '✓';
                  const color = hasError ? 'text-[#ff0080]' : 'text-[#00ff41]';
                  return (
                    <div key={key} className={color}>
                      {icon} {key.padEnd(20)} {hasError ? `[ERROR: ${s.error}]` : '[OK]'}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}
        </div>
      </div>

      <TerminalActions onBack={onBack} onCopy={copySummary} copied={copied} />

      <div className="text-[#4a5568] text-xs mt-4">
        <div>Type "scan -url [URL]" for another scan</div>
        <div>Use flags: --threats --network --sources --json -v</div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[#4a5568] my-3 pt-3">
      <div className="text-[#4a5568] text-xs mb-2">{title}:</div>
      {children}
    </div>
  );
}

function Row({ label, value, valueClass = 'text-white' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="text-[#a5d8ff]">
      {label} <span className="text-[#4a5568]">.</span> <span className={valueClass}>{value}</span>
    </div>
  );
}

function TerminalActions({ onBack, onCopy, copied }: { onBack?: () => void; onCopy: () => void; copied: boolean }) {
  return (
    <div className="flex gap-2 mt-4">
      <button
        onClick={onCopy}
        className="px-4 py-2 border border-[#00d9ff] text-[#00d9ff] hover:bg-[#00d9ff] hover:text-[#0a0e1a] transition-all text-xs uppercase"
        style={{ textShadow: '0 0 5px #00d9ff' }}
      >
        {copied ? '[ COPIED ]' : '[ COPY SUMMARY ]'}
      </button>
      {onBack && (
        <button
          onClick={onBack}
          className="px-4 py-2 border border-[#4a5568] text-[#a5d8ff] hover:border-[#00d9ff] hover:text-[#00d9ff] transition-all text-xs uppercase"
        >
          [ BACK ]
        </button>
      )}
    </div>
  );
}
