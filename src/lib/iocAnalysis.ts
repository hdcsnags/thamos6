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
    evidence.push('Confirmed Tor exit node from official Tor Project list');

    if (enrichment.country) {
      evidence.push(`Location: ${enrichment.country}`);
      badges.push(enrichment.country);
    }

    if (enrichment.isp) {
      evidence.push(`ISP: ${enrichment.isp}`);
    }

    if (enrichment.org) {
      evidence.push(`Organization: ${enrichment.org}`);
    }

    if (data.overallThreatScore > 0) {
      evidence.push(`Threat score: ${data.overallThreatScore}/100`);
      if (data.overallThreatScore > 60) {
        badges.push('High Abuse');
        severity = 'high';
        color = 'orange';
      } else {
        severity = 'medium';
        color = 'amber';
      }
    } else {
      severity = 'medium';
      color = 'amber';
    }

    if (enrichment.isMassScanner) {
      badges.push('Mass Scanner');
      evidence.push('Detected scanning large portions of internet');
    }

    if (data.sources?.abuseipdb?.totalReports > 0) {
      evidence.push(`AbuseIPDB reports: ${data.sources.abuseipdb.totalReports}`);
      if (data.sources.abuseipdb.abuseConfidenceScore > 0) {
        evidence.push(`Abuse confidence: ${data.sources.abuseipdb.abuseConfidenceScore}%`);
      }
    }

    confidence = 95;

    recommendations.push('BLOCK for most use cases - Tor exit nodes are frequently abused');
    recommendations.push('Review any recent connections from this IP in your logs');
    recommendations.push('Check if legitimate users need Tor access for your service');
    recommendations.push('Consider implementing additional authentication for Tor users');
    recommendations.push('Monitor for credential stuffing, scraping, or brute force attempts');

    return { verdict, confidence, severity, color, badges, evidence, recommendations };
  }

  if (enrichment.isVPN) {
    const provider = enrichment.vpnService || 'Unknown Provider';
    verdict = `Commercial VPN`;
    badges.push(`VPN: ${provider}`);
    evidence.push(`Identified as VPN service: ${provider}`);

    if (enrichment.country) {
      evidence.push(`Location: ${enrichment.country}`);
      badges.push(enrichment.country);
    }

    if (enrichment.isp) {
      evidence.push(`ISP: ${enrichment.isp}`);
    }

    if (data.sources?.abuseipdb?.totalReports > 0) {
      evidence.push(`AbuseIPDB reports: ${data.sources.abuseipdb.totalReports}`);
      if (data.sources.abuseipdb.abuseConfidenceScore > 0) {
        evidence.push(`Abuse confidence: ${data.sources.abuseipdb.abuseConfidenceScore}%`);
      }
    }

    if (data.overallThreatScore > 0) {
      evidence.push(`Threat score: ${data.overallThreatScore}/100`);
    }

    if (provider.toLowerCase().includes('mullvad') || provider.toLowerCase().includes('proton')) {
      badges.push('Privacy-Focused');
      confidence = 90;
    } else {
      confidence = 85;
    }

    severity = 'low';
    color = 'blue';
    recommendations.push('VPN usage is common for privacy but can hide malicious activity');
    recommendations.push('Check for suspicious behavior patterns in your logs');
    recommendations.push('Verify if this aligns with expected user behavior');
    recommendations.push('Consider rate limiting or CAPTCHA for VPN users if abuse occurs');
    return { verdict, confidence, severity, color, badges, evidence, recommendations };
  }

  if (enrichment.isProxy) {
    verdict = 'Proxy Server';
    badges.push('Proxy');
    evidence.push('Detected as proxy server');

    if (enrichment.country) {
      evidence.push(`Location: ${enrichment.country}`);
      badges.push(enrichment.country);
    }

    if (enrichment.isp) {
      evidence.push(`ISP: ${enrichment.isp}`);
    }

    if (enrichment.org) {
      evidence.push(`Organization: ${enrichment.org}`);
    }

    if (data.overallThreatScore > 0) {
      evidence.push(`Threat score: ${data.overallThreatScore}/100`);
    }

    if (data.sources?.abuseipdb?.totalReports > 0) {
      evidence.push(`AbuseIPDB reports: ${data.sources.abuseipdb.totalReports}`);
      if (data.sources.abuseipdb.abuseConfidenceScore > 0) {
        evidence.push(`Abuse confidence: ${data.sources.abuseipdb.abuseConfidenceScore}%`);
      }
    }

    severity = 'medium';
    color = 'yellow';
    confidence = 80;

    if (enrichment.isHosting) {
      badges.push('Datacenter');
      evidence.push('Hosted in datacenter environment');
    }

    recommendations.push('Proxy servers can be used to anonymize traffic');
    recommendations.push('Investigate the purpose and origin of connection');
    recommendations.push('Check for patterns indicating bot traffic or abuse');
    recommendations.push('Consider blocking if no legitimate use case exists');
    return { verdict, confidence, severity, color, badges, evidence, recommendations };
  }

  if (data.overallThreatScore > 70 || data.isMalicious) {
    verdict = 'Known Malicious';
    badges.push('Active Threat');
    evidence.push(`High threat score: ${data.overallThreatScore}/100`);

    if (enrichment.country) {
      evidence.push(`Location: ${enrichment.country}`);
      badges.push(enrichment.country);
    }

    if (enrichment.isp) {
      evidence.push(`ISP: ${enrichment.isp}`);
    }

    if (enrichment.org) {
      evidence.push(`Organization: ${enrichment.org}`);
    }

    if (data.sources?.abuseipdb) {
      if (data.sources.abuseipdb.totalReports > 0) {
        evidence.push(`AbuseIPDB reports: ${data.sources.abuseipdb.totalReports}`);
      }
      if (data.sources.abuseipdb.abuseConfidenceScore > 0) {
        evidence.push(`Abuse confidence: ${data.sources.abuseipdb.abuseConfidenceScore}%`);
      }
    }

    if (enrichment.spamhausListed) {
      badges.push('Spamhaus Listed');
      evidence.push(`Listed on: ${enrichment.spamhausLists.join(', ')}`);
    }

    if (enrichment.isMassScanner) {
      badges.push('Mass Scanner');
      evidence.push('Observed scanning large portions of internet');
    }

    if (enrichment.isTor) {
      badges.push('Tor Network');
      evidence.push('Also identified as Tor exit node');
    }

    if (enrichment.isVPN) {
      badges.push('VPN');
      evidence.push('Also identified as VPN endpoint');
    }

    if (enrichment.isProxy) {
      badges.push('Proxy');
      evidence.push('Also identified as proxy server');
    }

    severity = 'critical';
    color = 'red';
    confidence = 90;

    recommendations.push('BLOCK IMMEDIATELY - Known malicious activity');
    recommendations.push('Check for any connections from this IP in logs');
    recommendations.push('Consider force password reset if any successful authentication');
    recommendations.push('Review and revoke any sessions from this IP');
    recommendations.push('Add to threat intel feeds and WAF blocklists');
    return { verdict, confidence, severity, color, badges, evidence, recommendations };
  }

  if (data.overallThreatScore > 40) {
    verdict = 'Suspicious';
    badges.push('Suspicious Activity');
    evidence.push(`Moderate threat score: ${data.overallThreatScore}/100`);

    if (enrichment.country) {
      evidence.push(`Location: ${enrichment.country}`);
      badges.push(enrichment.country);
    }

    if (enrichment.isp) {
      evidence.push(`ISP: ${enrichment.isp}`);
    }

    if (enrichment.org) {
      evidence.push(`Organization: ${enrichment.org}`);
    }

    if (data.sources?.abuseipdb) {
      if (data.sources.abuseipdb.totalReports > 0) {
        evidence.push(`AbuseIPDB reports: ${data.sources.abuseipdb.totalReports}`);
      }
      if (data.sources.abuseipdb.abuseConfidenceScore > 0) {
        evidence.push(`Abuse confidence: ${data.sources.abuseipdb.abuseConfidenceScore}%`);
      }
    }

    if (enrichment.isTor) {
      badges.push('Tor Network');
      evidence.push('Also identified as Tor exit node');
    }

    if (enrichment.isVPN) {
      badges.push('VPN');
      evidence.push('Also identified as VPN endpoint');
    }

    if (enrichment.isProxy) {
      badges.push('Proxy');
      evidence.push('Also identified as proxy server');
    }

    if (enrichment.isHosting) {
      badges.push('Datacenter');
      evidence.push('Hosted in datacenter environment');
    }

    if (enrichment.isMassScanner) {
      badges.push('Mass Scanner');
      evidence.push('Observed scanning internet');
    }

    severity = 'high';
    color = 'orange';
    confidence = 75;

    recommendations.push('Monitor closely for malicious behavior');
    recommendations.push('Review associated logs and activity for this IP');
    recommendations.push('Consider blocking if suspicious patterns continue');
    recommendations.push('Implement rate limiting or additional verification');
    return { verdict, confidence, severity, color, badges, evidence, recommendations };
  }

  if (enrichment.isHosting) {
    verdict = 'Datacenter/Hosting';
    badges.push('Datacenter');
    const org = enrichment.org || enrichment.isp || 'Unknown';
    evidence.push(`Hosting provider: ${org}`);

    if (enrichment.country) {
      evidence.push(`Location: ${enrichment.country}`);
      badges.push(enrichment.country);
    }

    if (enrichment.isp && enrichment.isp !== org) {
      evidence.push(`ISP: ${enrichment.isp}`);
    }

    if (data.overallThreatScore > 0) {
      evidence.push(`Threat score: ${data.overallThreatScore}/100`);
    }

    if (data.sources?.abuseipdb?.totalReports > 0) {
      evidence.push(`AbuseIPDB reports: ${data.sources.abuseipdb.totalReports}`);
      if (data.sources.abuseipdb.abuseConfidenceScore > 0) {
        evidence.push(`Abuse confidence: ${data.sources.abuseipdb.abuseConfidenceScore}%`);
      }
    }

    if (enrichment.isTor) {
      badges.push('Tor Network');
      evidence.push('Also identified as Tor exit node');
    }

    if (enrichment.isVPN) {
      badges.push('VPN');
      evidence.push('Also identified as VPN endpoint');
    }

    if (enrichment.isProxy) {
      badges.push('Proxy');
      evidence.push('Also identified as proxy server');
    }

    if (enrichment.isMassScanner) {
      badges.push('Mass Scanner');
      evidence.push('Observed scanning internet');
    }

    severity = 'low';
    color = 'cyan';
    confidence = 85;

    recommendations.push('Datacenter IPs are common for servers and cloud services');
    recommendations.push('Verify if this is an expected service or API endpoint');
    recommendations.push('Check if this aligns with known integrations or webhooks');
    recommendations.push('Monitor for unexpected behavior patterns');
    return { verdict, confidence, severity, color, badges, evidence, recommendations };
  }

  if (enrichment.isKnownScanner) {
    verdict = 'Known Scanner';
    badges.push(enrichment.scannerType === 'benign' ? 'Benign Scanner' : 'Scanner');
    evidence.push(`Scanner classification: ${enrichment.scannerType || 'unknown'}`);

    if (enrichment.country) {
      evidence.push(`Location: ${enrichment.country}`);
      badges.push(enrichment.country);
    }

    if (enrichment.isp) {
      evidence.push(`ISP: ${enrichment.isp}`);
    }

    if (enrichment.org) {
      evidence.push(`Organization: ${enrichment.org}`);
    }

    if (data.overallThreatScore > 0) {
      evidence.push(`Threat score: ${data.overallThreatScore}/100`);
    }

    if (data.sources?.abuseipdb?.totalReports > 0) {
      evidence.push(`AbuseIPDB reports: ${data.sources.abuseipdb.totalReports}`);
      if (data.sources.abuseipdb.abuseConfidenceScore > 0) {
        evidence.push(`Abuse confidence: ${data.sources.abuseipdb.abuseConfidenceScore}%`);
      }
    }

    if (enrichment.isTor) {
      badges.push('Tor Network');
      evidence.push('Also identified as Tor exit node');
    }

    if (enrichment.isVPN) {
      badges.push('VPN');
      evidence.push('Also identified as VPN endpoint');
    }

    if (enrichment.isProxy) {
      badges.push('Proxy');
      evidence.push('Also identified as proxy server');
    }

    if (enrichment.isHosting) {
      badges.push('Datacenter');
      evidence.push('Hosted in datacenter environment');
    }

    severity = enrichment.scannerType === 'benign' ? 'info' : 'medium';
    color = enrichment.scannerType === 'benign' ? 'green' : 'yellow';
    confidence = 80;

    recommendations.push('Scanning activity detected but may be legitimate research');
    recommendations.push('Common sources include Shodan, Censys, and security researchers');
    recommendations.push('Consider allowing if from known benign scanners');
    recommendations.push('Block if causing performance issues or unwanted traffic');
    return { verdict, confidence, severity, color, badges, evidence, recommendations };
  }

  verdict = 'Clean Residential';
  badges.push('Residential');
  evidence.push('No malicious indicators found');

  if (enrichment.country) {
    evidence.push(`Location: ${enrichment.country}`);
    badges.push(enrichment.country);
  }

  if (enrichment.isp) {
    evidence.push(`ISP: ${enrichment.isp}`);
  }

  if (enrichment.org) {
    evidence.push(`Organization: ${enrichment.org}`);
  }

  if (data.overallThreatScore === 0) {
    evidence.push('Threat score: 0/100 (Clean)');
  } else if (data.overallThreatScore > 0) {
    evidence.push(`Threat score: ${data.overallThreatScore}/100 (Low risk)`);
  }

  if (data.sources?.abuseipdb) {
    if (data.sources.abuseipdb.totalReports === 0) {
      evidence.push('No abuse reports found');
    } else if (data.sources.abuseipdb.totalReports > 0) {
      evidence.push(`AbuseIPDB reports: ${data.sources.abuseipdb.totalReports}`);
      if (data.sources.abuseipdb.abuseConfidenceScore > 0) {
        evidence.push(`Abuse confidence: ${data.sources.abuseipdb.abuseConfidenceScore}%`);
      }
    }
  }

  if (enrichment.isTor) {
    badges.push('Tor Network');
    evidence.push('Also identified as Tor exit node');
  }

  if (enrichment.isVPN) {
    badges.push('VPN');
    evidence.push('Also identified as VPN endpoint');
  }

  if (enrichment.isProxy) {
    badges.push('Proxy');
    evidence.push('Also identified as proxy server');
  }

  severity = 'info';
  color = 'green';
  confidence = 70;

  recommendations.push('Appears to be legitimate residential or business IP');
  recommendations.push('Standard monitoring and logging is sufficient');
  recommendations.push('No immediate action required');

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
