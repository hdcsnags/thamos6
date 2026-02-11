import { useEffect, useState, useRef } from 'react';
import { lookupHash, getSourceDisplayName } from '../../lib/threatIntel';
import type { HashLookupResult } from '../../types';
import { shouldShowSection, type ScanFlags } from '../../lib/cliFlags';

interface TerminalHashResultProps {
  hash: string;
  flags?: ScanFlags;
  onBack?: () => void;
}

const detectHashType = (hash: string): string => {
  const cleaned = hash.trim().toLowerCase();
  if (/^[a-f0-9]{32}$/.test(cleaned)) return 'MD5';
  if (/^[a-f0-9]{40}$/.test(cleaned)) return 'SHA1';
  if (/^[a-f0-9]{64}$/.test(cleaned)) return 'SHA256';
  return 'Unknown';
};

export default function TerminalHashResult({ hash, flags, onBack }: TerminalHashResultProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<HashLookupResult | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const startTime = useRef(Date.now());

  const showThreats = !flags || shouldShowSection(flags, 'threats');
  const showSources = !flags || shouldShowSection(flags, 'sources');
  const showJson = flags?.json || false;

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError('');
      startTime.current = Date.now();
      try {
        const data = await lookupHash(hash);
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to lookup hash');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [hash]);

  if (loading) {
    return (
      <div className="h-full flex flex-col p-4 text-sm">
        <div className="text-[#00d9ff] mb-2">{'>'} Analyzing hash: {hash}</div>
        <div className="text-[#4a5568] mb-2">[*] Querying VirusTotal...</div>
        <div className="text-[#4a5568] mb-2">[*] Checking MalwareBazaar...</div>
        <div className="text-[#4a5568] mb-2">[*] Searching Hybrid Analysis...</div>
        <div className="text-[#4a5568] mb-2">[*] Querying AlienVault OTX...</div>
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
  const hashType = detectHashType(hash);

  const rawSources: Record<string, any> = (result as any).sources || {};
  const vtData = rawSources.virustotal_hash?.details?.data?.attributes as any;
  const detections = result.detections || {};
  const vtDetections = detections.virustotal;
  const mbData = detections.malwarebazaar;
  const haData = detections.hybrid_analysis;
  const otxData = detections.alienvault;

  const vtStats = vtData?.last_analysis_stats || vtDetections;
  const threatLabel = vtData?.popular_threat_classification?.suggested_threat_label;
  const threatNames = vtData?.popular_threat_classification?.popular_threat_name || [];
  const sandboxVerdicts = vtData?.sandbox_verdicts || {};
  const sigmaResults = vtData?.sigma_analysis_results || [];
  const fileNames = vtData?.names || [];
  const fileTags = vtData?.tags || [];
  const sourceKeys = Object.keys(rawSources);

  const maliciousEngines = vtData?.last_analysis_results
    ? Object.entries(vtData.last_analysis_results).filter(([_, r]: any) => r.category === 'malicious')
    : [];

  const copySummary = () => {
    const lines = [
      `Hash: ${hash}`,
      `Type: ${hashType}`,
      `Threat Score: ${result.overallThreatScore}/100`,
      `Verdict: ${isMalicious ? 'MALICIOUS' : 'CLEAN'}`,
      `File Type: ${vtData?.type_description || mbData?.file_type || 'Unknown'}`,
      `File Size: ${vtData?.size ? `${(vtData.size / 1024).toFixed(2)} KB` : 'Unknown'}`,
      `Detections: ${vtStats?.malicious || 0} malicious`,
      `Category: ${threatLabel || 'N/A'}`,
    ];
    if (vtData?.md5) lines.push(`MD5: ${vtData.md5}`);
    if (vtData?.sha1) lines.push(`SHA1: ${vtData.sha1}`);
    if (vtData?.sha256) lines.push(`SHA256: ${vtData.sha256}`);
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (showJson) {
    return (
      <div className="h-full overflow-y-auto p-4 text-sm">
        <div className="text-[#00d9ff] mb-2">{'>'} JSON Output for {hash.substring(0, 16)}...</div>
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
        <div className="text-[#00d9ff] mb-1">{'>'} Hash analysis complete</div>
        <div className="text-[#4a5568]">[*] Analysis finished in {elapsed}s | {sourceKeys.length} sources queried</div>
      </div>

      <div className={`border ${boxBorder} ${boxBg} p-4 mb-4`}>
        <div className="text-[#00d9ff] mb-3">═══ HASH ANALYSIS RESULTS ═══</div>

        <div className="space-y-1 text-[#a5d8ff]">
          <div className="text-white font-mono break-all text-xs mb-2">{hash}</div>
          <Row label="Hash Type" value={hashType} />
          <Row label="VERDICT" value={`${isMalicious ? 'MALICIOUS' : 'CLEAN'} (Score: ${result.overallThreatScore}/100)`} valueClass={statusColor} />

          <Section title="FILE INFORMATION">
            <Row label="Type" value={vtData?.type_description || mbData?.file_type || 'Unknown'} />
            <Row label="Extension" value={vtData?.type_extension || 'Unknown'} />
            <Row label="Size" value={vtData?.size ? `${(vtData.size / 1024).toFixed(2)} KB (${vtData.size} bytes)` : (mbData?.file_size ? `${(mbData.file_size / 1024).toFixed(2)} KB` : 'Unknown')} />
            {vtData?.magic && <Row label="Magic" value={vtData.magic} />}
            {vtData?.md5 && <Row label="MD5" value={vtData.md5} />}
            {vtData?.sha1 && <Row label="SHA1" value={vtData.sha1} />}
            {vtData?.sha256 && <Row label="SHA256" value={vtData.sha256} />}
            {fileTags.length > 0 && (
              <div className="text-[#a5d8ff] mt-1">
                Tags <span className="text-[#4a5568]">.</span>{' '}
                {fileTags.map((tag: string, i: number) => (
                  <span key={i} className="text-[#00d9ff] mr-1">[{tag}]</span>
                ))}
              </div>
            )}
          </Section>

          {(threatLabel || threatNames.length > 0) && (
            <Section title="THREAT CLASSIFICATION">
              {threatLabel && <Row label="Category" value={threatLabel} valueClass="text-[#ff0080]" />}
              {threatNames.length > 0 && (
                <div className="pl-2 space-y-1 mt-1">
                  {threatNames.slice(0, 5).map((name: any, i: number) => (
                    <div key={i} className="text-[#ff0080]">
                      * {name.value} <span className="text-[#4a5568]">({name.count} detections)</span>
                    </div>
                  ))}
                </div>
              )}
              {mbData?.signature && <Row label="MalwareBazaar" value={mbData.signature} valueClass="text-[#ff0080]" />}
              {haData?.malware_family && <Row label="Hybrid Analysis" value={`${haData.malware_family}${haData.vx_family ? ` / ${haData.vx_family}` : ''}`} valueClass="text-[#ff0080]" />}
            </Section>
          )}

          {showThreats && vtStats && (
            <Section title="DETECTION STATS">
              <div className="pl-2 flex gap-4 flex-wrap">
                <span className="text-[#ff0080]">{vtStats.malicious || 0} malicious</span>
                <span className="text-[#fbbf24]">{vtStats.suspicious || 0} suspicious</span>
                <span className="text-[#00ff41]">{vtStats.harmless || 0} clean</span>
                <span className="text-[#4a5568]">{vtStats.undetected || 0} undetected</span>
              </div>

              {maliciousEngines.length > 0 && (
                <div className="mt-2">
                  <div className="text-[#4a5568] text-xs mb-1">Flagged by ({maliciousEngines.length}):</div>
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
                </div>
              )}
            </Section>
          )}

          {Object.keys(sandboxVerdicts).length > 0 && (
            <Section title="SANDBOX ANALYSIS">
              <div className="space-y-2">
                {Object.entries(sandboxVerdicts).map(([sandbox, verdict]: any, i) => (
                  <div key={i} className="pl-2">
                    <div className="text-[#fbbf24]">{sandbox}: <span className={verdict.category === 'malicious' ? 'text-[#ff0080]' : 'text-[#fbbf24]'}>{verdict.category}</span></div>
                    {verdict.malware_names?.length > 0 && (
                      <div className="text-[#a5d8ff] text-xs pl-2">Names: {verdict.malware_names.join(', ')}</div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {sigmaResults.length > 0 && (
            <Section title={`SIGMA RULE MATCHES (${sigmaResults.length})`}>
              <div className="space-y-1 pl-2">
                {sigmaResults.slice(0, 10).map((rule: any, i: number) => {
                  const levelColor = rule.rule_level === 'critical' ? 'text-[#ff0080]' :
                    rule.rule_level === 'high' ? 'text-[#fbbf24]' : 'text-[#a5d8ff]';
                  return (
                    <div key={i}>
                      <span className={levelColor}>[{rule.rule_level}]</span>{' '}
                      <span className="text-white">{rule.rule_title}</span>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {fileNames.length > 0 && (
            <Section title="KNOWN FILE NAMES">
              <div className="pl-2 space-y-1">
                {fileNames.slice(0, 8).map((name: string, i: number) => (
                  <div key={i} className="text-white text-xs break-all">{name}</div>
                ))}
                {fileNames.length > 8 && (
                  <div className="text-[#4a5568] text-xs">... and {fileNames.length - 8} more</div>
                )}
              </div>
            </Section>
          )}

          {otxData && otxData.pulse_count > 0 && (
            <Section title={`ALIENVAULT OTX (${otxData.pulse_count} pulses)`}>
              <div className="pl-2 space-y-1">
                {otxData.pulses?.slice(0, 5).map((pulse: any, i: number) => (
                  <div key={i} className="text-[#a5d8ff]">
                    <span className="text-[#fbbf24]">*</span> {pulse.name}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {showSources && (
            <Section title="SOURCE STATUS">
              <div className="space-y-1">
                {sourceKeys.map(key => {
                  const s = rawSources[key];
                  const hasError = s?.error;
                  const checked = s?.checked !== false;
                  const icon = hasError ? '✗' : checked ? '✓' : '○';
                  const color = hasError ? 'text-[#ff0080]' : 'text-[#00ff41]';
                  return (
                    <div key={key} className={color}>
                      {icon} {getSourceDisplayName(key).padEnd(20)} {hasError ? `[ERROR: ${s.error}]` : '[OK]'}
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
        <div>Type "scan -hash [HASH]" for another scan</div>
        <div>Use flags: --threats --sources --json -v</div>
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
