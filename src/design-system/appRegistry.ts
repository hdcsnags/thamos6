import type { AppId } from '../contexts/DesktopContext';
import { palette } from './tokens';
import type { IconProps } from './icons';
import {
  TerminalIcon,
  VpsTerminalIcon,
  ScannerIcon,
  BrowserIcon,
  ThamosIcon,
  IntelIcon,
  CaseIcon,
  FilesIcon,
  EditorIcon,
  MonitorIcon,
  SettingsIcon,
  SearchResultIcon,
  TopDeskIcon,
  DecoderIcon,
  DefangIcon,
  EmailAnalyzerIcon,
  IOCExtractorIcon,
  BulkLookupIcon,
  ExtensionScannerIcon,
  DocAnalyzerIcon,
} from './icons';

export interface AppDefinition {
  id: AppId;
  name: string;
  icon: React.FC<IconProps>;
  description: string;
  accentColor: string;
  category: 'core' | 'intel' | 'tools' | 'system';
  keywords: string[];
  defaultSize: { width: number; height: number };
  showOnDesktop?: boolean;
}

export const appRegistry: Record<string, AppDefinition> = {
  terminal: {
    id: 'terminal',
    name: 'Terminal',
    icon: TerminalIcon,
    description: 'Command line interface',
    accentColor: palette.green,
    category: 'core',
    keywords: ['terminal', 'cli', 'command', 'shell', 'console'],
    defaultSize: { width: 800, height: 500 },
    showOnDesktop: true,
  },
  'vps-terminal': {
    id: 'vps-terminal',
    name: 'VPS Terminal',
    icon: VpsTerminalIcon,
    description: 'Remote VPS shell access',
    accentColor: palette.amber,
    category: 'core',
    keywords: ['vps', 'terminal', 'ssh', 'shell', 'remote', 'server', 'live'],
    defaultSize: { width: 900, height: 600 },
    showOnDesktop: true,
  },
  scanner: {
    id: 'scanner',
    name: 'Scanner',
    icon: ScannerIcon,
    description: 'Threat intelligence scanner',
    accentColor: palette.cyan,
    category: 'core',
    keywords: ['scanner', 'scan', 'threat', 'lookup', 'investigate'],
    defaultSize: { width: 900, height: 600 },
    showOnDesktop: true,
  },
  browser: {
    id: 'browser',
    name: 'Browser',
    icon: BrowserIcon,
    description: 'Internal tools browser',
    accentColor: palette.cyan,
    category: 'core',
    keywords: ['browser', 'web', 'tools', 'navigate'],
    defaultSize: { width: 1000, height: 700 },
    showOnDesktop: true,
  },
  workshop: {
    id: 'workshop',
    name: 'Thamos',
    icon: ThamosIcon,
    description: 'AI council — threat analysis, deliberation, and synthesis with Claude, GPT & Gemini',
    accentColor: palette.cyan,
    category: 'intel',
    keywords: ['thamos', 'ai', 'council', 'chat', 'agent', 'claude', 'gpt', 'gemini', 'deliberate', 'synthesize', 'analyze', 'threat', 'kql', 'soc'],
    defaultSize: { width: 1200, height: 780 },
    showOnDesktop: true,
  },
  intel: {
    id: 'intel',
    name: 'Intel Dashboard',
    icon: IntelIcon,
    description: 'Threat feeds and news',
    accentColor: palette.cyan,
    category: 'intel',
    keywords: ['intel', 'intelligence', 'feeds', 'news', 'threats'],
    defaultSize: { width: 900, height: 650 },
  },
  cases: {
    id: 'cases',
    name: 'Case Manager',
    icon: CaseIcon,
    description: 'Incident case notes',
    accentColor: palette.green,
    category: 'tools',
    keywords: ['cases', 'notes', 'incident', 'investigation'],
    defaultSize: { width: 800, height: 600 },
  },
  files: {
    id: 'files',
    name: 'File Manager',
    icon: FilesIcon,
    description: 'GitHub repository browser',
    accentColor: palette.teal,
    category: 'tools',
    keywords: ['files', 'github', 'repository', 'code'],
    defaultSize: { width: 900, height: 600 },
    showOnDesktop: true,
  },
  editor: {
    id: 'editor',
    name: 'Code Editor',
    icon: EditorIcon,
    description: 'Code editing workspace',
    accentColor: palette.amber,
    category: 'tools',
    keywords: ['editor', 'code', 'edit', 'write', 'artifact', 'vscode'],
    defaultSize: { width: 1000, height: 700 },
    showOnDesktop: true,
  },
  monitor: {
    id: 'monitor',
    name: 'System Monitor',
    icon: MonitorIcon,
    description: 'System status and metrics',
    accentColor: palette.amber,
    category: 'system',
    keywords: ['monitor', 'system', 'status', 'metrics', 'health'],
    defaultSize: { width: 400, height: 500 },
  },
  settings: {
    id: 'settings',
    name: 'Settings',
    icon: SettingsIcon,
    description: 'Application settings',
    accentColor: palette.textSecondary,
    category: 'system',
    keywords: ['settings', 'preferences', 'config', 'options'],
    defaultSize: { width: 800, height: 600 },
    showOnDesktop: true,
  },
  topdesk: {
    id: 'topdesk',
    name: 'TopDesk',
    icon: TopDeskIcon,
    description: 'Ticket search, deduplication, and enrichment',
    accentColor: palette.blue,
    category: 'tools',
    keywords: ['topdesk', 'ticket', 'incident', 'support', 'helpdesk'],
    defaultSize: { width: 1000, height: 700 },
    showOnDesktop: true,
  },
  'ip-result': {
    id: 'ip-result',
    name: 'IP Result',
    icon: SearchResultIcon,
    description: 'IP scan result',
    accentColor: palette.cyan,
    category: 'core',
    keywords: [],
    defaultSize: { width: 900, height: 700 },
  },
  'url-result': {
    id: 'url-result',
    name: 'URL Result',
    icon: SearchResultIcon,
    description: 'URL scan result',
    accentColor: palette.cyan,
    category: 'core',
    keywords: [],
    defaultSize: { width: 900, height: 700 },
  },
  'domain-result': {
    id: 'domain-result',
    name: 'Domain Result',
    icon: SearchResultIcon,
    description: 'Domain scan result',
    accentColor: palette.cyan,
    category: 'core',
    keywords: [],
    defaultSize: { width: 900, height: 700 },
  },
  'hash-result': {
    id: 'hash-result',
    name: 'Hash Result',
    icon: SearchResultIcon,
    description: 'Hash scan result',
    accentColor: palette.cyan,
    category: 'core',
    keywords: [],
    defaultSize: { width: 900, height: 700 },
  },
  'extension-result': {
    id: 'extension-result',
    name: 'Extension Result',
    icon: SearchResultIcon,
    description: 'Chrome extension scan result',
    accentColor: palette.teal,
    category: 'core',
    keywords: [],
    defaultSize: { width: 900, height: 700 },
  },
  'cve-result': {
    id: 'cve-result',
    name: 'CVE Result',
    icon: SearchResultIcon,
    description: 'CVE vulnerability lookup',
    accentColor: palette.rose,
    category: 'core',
    keywords: [],
    defaultSize: { width: 900, height: 700 },
  },
  'wallet-result': {
    id: 'wallet-result',
    name: 'Wallet Result',
    icon: SearchResultIcon,
    description: 'Crypto wallet scan result',
    accentColor: palette.amber,
    category: 'core',
    keywords: [],
    defaultSize: { width: 900, height: 700 },
  },
  'email-result': {
    id: 'email-result',
    name: 'Email Result',
    icon: SearchResultIcon,
    description: 'Email reputation lookup',
    accentColor: palette.green,
    category: 'core',
    keywords: [],
    defaultSize: { width: 900, height: 700 },
  },
  decoder: {
    id: 'decoder',
    name: 'Decoder',
    icon: DecoderIcon,
    description: 'Base64, hex, URL decode/encode',
    accentColor: palette.amber,
    category: 'tools',
    keywords: ['decoder', 'base64', 'hex', 'encode', 'decode', 'url', 'encode'],
    defaultSize: { width: 700, height: 500 },
  },
  defang: {
    id: 'defang',
    name: 'Defang / Refang',
    icon: DefangIcon,
    description: 'Safely defang or refang IOCs for sharing',
    accentColor: palette.teal,
    category: 'tools',
    keywords: ['defang', 'refang', 'ioc', 'url', 'ip', 'safe', 'share'],
    defaultSize: { width: 700, height: 500 },
  },
  'email-analyzer': {
    id: 'email-analyzer',
    name: 'Email Analyzer',
    icon: EmailAnalyzerIcon,
    description: 'Parse email headers, check SPF/DKIM/DMARC, extract IOCs',
    accentColor: palette.blue,
    category: 'tools',
    keywords: ['email', 'header', 'spf', 'dkim', 'dmarc', 'phishing', 'analyzer', 'eml', 'ioc'],
    defaultSize: { width: 800, height: 600 },
  },
  'ioc-extractor': {
    id: 'ioc-extractor',
    name: 'IOC Extractor',
    icon: IOCExtractorIcon,
    description: 'Bulk extract IPs, domains, hashes, URLs from raw text',
    accentColor: palette.cyan,
    category: 'tools',
    keywords: ['ioc', 'extract', 'bulk', 'ip', 'domain', 'hash', 'url', 'parse', 'text'],
    defaultSize: { width: 900, height: 650 },
  },
  'bulk-lookup': {
    id: 'bulk-lookup',
    name: 'Bulk Lookup',
    icon: BulkLookupIcon,
    description: 'Scan multiple IOCs at once',
    accentColor: palette.green,
    category: 'tools',
    keywords: ['bulk', 'lookup', 'multiple', 'batch', 'scan', 'ioc', 'list'],
    defaultSize: { width: 900, height: 650 },
  },
  'extension-scanner': {
    id: 'extension-scanner',
    name: 'Extension Scanner',
    icon: ExtensionScannerIcon,
    description: 'Analyze Chrome and Edge extensions for malicious behavior and governance risk',
    accentColor: palette.teal,
    category: 'tools',
    keywords: ['extension', 'chrome', 'scanner', 'crx', 'browser', 'plugin', 'addon'],
    defaultSize: { width: 900, height: 700 },
  },
  'doc-analyzer': {
    id: 'doc-analyzer',
    name: 'Doc Analyzer',
    icon: DocAnalyzerIcon,
    description: 'Static analysis of PDF and Office documents for macros and malicious objects',
    accentColor: palette.amber,
    category: 'tools',
    keywords: ['doc', 'pdf', 'office', 'macro', 'vba', 'document', 'analyze', 'static', 'malware'],
    defaultSize: { width: 800, height: 600 },
  },
};

export function getApp(id: string): AppDefinition | undefined {
  return appRegistry[id];
}

export function getAppsByCategory(category: AppDefinition['category']): AppDefinition[] {
  return Object.values(appRegistry).filter(a => a.category === category);
}

export function getLaunchableApps(): AppDefinition[] {
  return Object.values(appRegistry).filter(a => a.keywords.length > 0);
}

export function getDesktopIcons(): AppDefinition[] {
  return Object.values(appRegistry).filter(a => a.showOnDesktop);
}

export function searchApps(query: string): AppDefinition[] {
  const q = query.toLowerCase();
  return Object.values(appRegistry).filter(
    a =>
      a.keywords.length > 0 &&
      (a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.keywords.some(k => k.includes(q)))
  );
}
