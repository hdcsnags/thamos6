export interface IOCVerdict {
  verdict: string;
  confidence: number;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  color: string;
  badges: string[];
  evidence: string[];
  recommendations: string[];
}

export interface IOCAnalysisResult {
  ioc: string;
  type: 'ip' | 'domain' | 'url' | 'hash' | 'email';
  verdict: IOCVerdict;
  sources: Record<string, any>;
  enrichment?: any;
  checkedAt: string;
}

export function classifyIPVerdict(data: any, enrichment: any): IOCVerdict {
  const evidence: string[] = [];
  const badges: string[] = [];
  const recommendations: string[] = [];
  let verdict = 'Clean';
  let confidence = 0;
  let severity: 'critical' | 'high' | 'medium' | 'low' | 'info' = 'info';
  let color = 'slate';

  if (enrichment.isTor) {
    verdict = 'Tor Exit Node';
    badges.push('Tor Network');
    evidence.push('Confirmed Tor exit node from Tor Project list');
    severity = 'medium';
    color = 'amber';
    confidence = 95;
    recommendations.push('Exercise caution - Tor traffic can indicate privacy-conscious user or malicious activity');
    return { verdict, confidence, severity, color, badges, evidence, recommendations };
  }

  if (enrichment.isVPN) {
    const provider = enrichment.vpnService || 'Unknown Provider';
    verdict = `Commercial VPN`;
    badges.push(`VPN: ${provider}`);
    evidence.push(`Identified as VPN service: ${provider}`);

    if (provider.toLowerCase().includes('mullvad') || provider.toLowerCase().includes('proton')) {
      badges.push('Privacy-Focused');
      confidence = 90;
    } else {
      confidence = 85;
    }

    severity = 'low';
    color = 'blue';
    recommendations.push('VPN usage is common for privacy but can hide malicious activity');
    recommendations.push('Check for suspicious behavior patterns');
    return { verdict, confidence, severity, color, badges, evidence, recommendations };
  }

  if (enrichment.isProxy) {
    verdict = 'Proxy Server';
    badges.push('Proxy');
    evidence.push('Detected as proxy server');
    severity = 'medium';
    color = 'yellow';
    confidence = 80;

    if (enrichment.isHosting) {
      badges.push('Datacenter');
      evidence.push('Hosted in datacenter environment');
    }

    recommendations.push('Proxy servers can be used to anonymize traffic');
    recommendations.push('Investigate the purpose and origin of connection');
    return { verdict, confidence, severity, color, badges, evidence, recommendations };
  }

  if (data.overallThreatScore > 70 || data.isMalicious) {
    verdict = 'Known Malicious';
    badges.push('Active Threat');
    evidence.push(`High threat score: ${data.overallThreatScore}/100`);
    severity = 'critical';
    color = 'red';
    confidence = 90;

    if (enrichment.spamhausListed) {
      badges.push('Spamhaus Listed');
      evidence.push(`Listed on: ${enrichment.spamhausLists.join(', ')}`);
    }

    if (enrichment.isMassScanner) {
      badges.push('Mass Scanner');
      evidence.push('Observed scanning internet');
    }

    recommendations.push('BLOCK IMMEDIATELY - Known malicious activity');
    recommendations.push('Check for any connections from this IP in logs');
    recommendations.push('Consider force password reset if any successful authentication');
    return { verdict, confidence, severity, color, badges, evidence, recommendations };
  }

  if (data.overallThreatScore > 40) {
    verdict = 'Suspicious';
    badges.push('Suspicious Activity');
    evidence.push(`Moderate threat score: ${data.overallThreatScore}/100`);
    severity = 'high';
    color = 'orange';
    confidence = 75;

    recommendations.push('Monitor closely for malicious behavior');
    recommendations.push('Review associated logs and activity');
    return { verdict, confidence, severity, color, badges, evidence, recommendations };
  }

  if (enrichment.isHosting) {
    verdict = 'Datacenter/Hosting';
    badges.push('Datacenter');
    const org = enrichment.org || enrichment.isp || 'Unknown';
    evidence.push(`Hosting provider: ${org}`);
    severity = 'low';
    color = 'cyan';
    confidence = 85;
    recommendations.push('Datacenter IPs are common for servers and cloud services');
    recommendations.push('Verify if this is an expected service or API endpoint');
    return { verdict, confidence, severity, color, badges, evidence, recommendations };
  }

  if (enrichment.isKnownScanner) {
    verdict = 'Known Scanner';
    badges.push(enrichment.scannerType === 'benign' ? 'Benign Scanner' : 'Scanner');
    evidence.push(`Scanner classification: ${enrichment.scannerType || 'unknown'}`);
    severity = enrichment.scannerType === 'benign' ? 'info' : 'medium';
    color = enrichment.scannerType === 'benign' ? 'green' : 'yellow';
    confidence = 80;
    recommendations.push('Scanning activity detected but may be legitimate research');
    return { verdict, confidence, severity, color, badges, evidence, recommendations };
  }

  verdict = 'Clean Residential';
  badges.push('Residential');
  if (enrichment.country) {
    badges.push(enrichment.country);
  }
  evidence.push('No malicious indicators found');
  evidence.push(`ISP: ${enrichment.isp || 'Unknown'}`);
  severity = 'info';
  color = 'green';
  confidence = 70;
  recommendations.push('Appears to be legitimate residential or business IP');

  return { verdict, confidence, severity, color, badges, evidence, recommendations };
}

export function classifyDomainVerdict(data: any): IOCVerdict {
  const evidence: string[] = [];
  const badges: string[] = [];
  const recommendations: string[] = [];
  let verdict = 'Unknown';
  let confidence = 50;
  let severity: 'critical' | 'high' | 'medium' | 'low' | 'info' = 'info';
  let color = 'slate';

  verdict = 'Domain Analysis';
  evidence.push('Domain lookup completed');
  recommendations.push('Review domain registration details and hosting information');

  return { verdict, confidence, severity, color, badges, evidence, recommendations };
}

export function classifyURLVerdict(data: any): IOCVerdict {
  const evidence: string[] = [];
  const badges: string[] = [];
  const recommendations: string[] = [];
  let verdict = 'Unknown';
  let confidence = 50;
  let severity: 'critical' | 'high' | 'medium' | 'low' | 'info' = 'info';
  let color = 'slate';

  if (data.isMalicious) {
    verdict = 'Active Phishing/Malware';
    badges.push('Active Threat');
    evidence.push('Confirmed malicious by threat intelligence sources');
    severity = 'critical';
    color = 'red';
    confidence = 95;

    if (data.threatTypes?.includes('malware')) {
      badges.push('Malware Distribution');
      evidence.push('Known to distribute malware');
    }

    if (data.threatTypes?.includes('phishing')) {
      badges.push('Phishing');
      evidence.push('Identified as phishing site');
    }

    recommendations.push('DO NOT VISIT - Confirmed malicious URL');
    recommendations.push('Block this URL at firewall/proxy level');
    recommendations.push('Check if any users accessed this URL');
    return { verdict, confidence, severity, color, badges, evidence, recommendations };
  }

  verdict = 'Suspicious URL';
  badges.push('Needs Analysis');
  evidence.push('URL requires further analysis');
  severity = 'medium';
  color = 'yellow';
  confidence = 60;
  recommendations.push('Exercise caution when visiting');
  recommendations.push('Consider using URLScan.io for detailed analysis');

  return { verdict, confidence, severity, color, badges, evidence, recommendations };
}

export function classifyHashVerdict(data: any): IOCVerdict {
  const evidence: string[] = [];
  const badges: string[] = [];
  const recommendations: string[] = [];
  let verdict = 'Unknown';
  let confidence = 50;
  let severity: 'critical' | 'high' | 'medium' | 'low' | 'info' = 'info';
  let color = 'slate';

  verdict = 'Hash Lookup';
  evidence.push('File hash analyzed');
  recommendations.push('Submit hash to VirusTotal or MalwareBazaar for detailed analysis');

  return { verdict, confidence, severity, color, badges, evidence, recommendations };
}

export function defangIOC(ioc: string, type: string): string {
  switch (type) {
    case 'url':
      return ioc.replace(/^https?:/, 'hxxps:').replace(/\./g, '[.]');
    case 'domain':
    case 'email':
      return ioc.replace(/\./g, '[.]').replace(/@/g, '[@]');
    case 'ip':
      return ioc.replace(/\./g, '[.]');
    default:
      return ioc;
  }
}

export function exportToJSON(results: IOCAnalysisResult[]): string {
  return JSON.stringify(results, null, 2);
}

export function exportToCSV(results: IOCAnalysisResult[]): string {
  const headers = ['IOC', 'Type', 'Verdict', 'Severity', 'Confidence', 'Evidence', 'Recommendations'];
  const rows = results.map(r => [
    r.ioc,
    r.type,
    r.verdict.verdict,
    r.verdict.severity,
    r.verdict.confidence,
    r.verdict.evidence.join('; '),
    r.verdict.recommendations.join('; ')
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  return csvContent;
}

export function exportToPlainText(results: IOCAnalysisResult[]): string {
  return results.map(r =>
    `IOC: ${r.ioc}\nType: ${r.type}\nVerdict: ${r.verdict.verdict}\nSeverity: ${r.verdict.severity}\nConfidence: ${r.verdict.confidence}%\nEvidence:\n${r.verdict.evidence.map(e => `  - ${e}`).join('\n')}\nRecommendations:\n${r.verdict.recommendations.map(rec => `  - ${rec}`).join('\n')}\n---\n`
  ).join('\n');
}

export function exportToDefanged(results: IOCAnalysisResult[]): string {
  return results.map(r => defangIOC(r.ioc, r.type)).join('\n');
}
