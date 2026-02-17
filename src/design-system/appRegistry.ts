import type { AppId } from '../contexts/DesktopContext';
import { palette } from './tokens';

export interface AppDefinition {
  id: AppId;
  name: string;
  icon: string;
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
    icon: '\u2318',
    description: 'Command line interface',
    accentColor: palette.green,
    category: 'core',
    keywords: ['terminal', 'cli', 'command', 'shell', 'console'],
    defaultSize: { width: 800, height: 500 },
    showOnDesktop: true,
  },
  scanner: {
    id: 'scanner',
    name: 'Scanner',
    icon: '\uD83D\uDD0D',
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
    icon: '\uD83C\uDF10',
    description: 'Internal tools browser',
    accentColor: palette.cyan,
    category: 'core',
    keywords: ['browser', 'web', 'tools', 'navigate'],
    defaultSize: { width: 1000, height: 700 },
    showOnDesktop: true,
  },
  workshop: {
    id: 'workshop',
    name: 'AI Workshop',
    icon: '\uD83E\uDD16',
    description: 'Multi-agent chat interface',
    accentColor: palette.green,
    category: 'intel',
    keywords: ['ai', 'workshop', 'chat', 'agent', 'claude', 'gpt', 'gemini'],
    defaultSize: { width: 1100, height: 700 },
  },
  intel: {
    id: 'intel',
    name: 'Intel Dashboard',
    icon: '\uD83D\uDCE1',
    description: 'Threat feeds and news',
    accentColor: palette.cyan,
    category: 'intel',
    keywords: ['intel', 'intelligence', 'feeds', 'news', 'threats'],
    defaultSize: { width: 900, height: 650 },
  },
  cases: {
    id: 'cases',
    name: 'Case Manager',
    icon: '\uD83D\uDCCB',
    description: 'Incident case notes',
    accentColor: palette.green,
    category: 'tools',
    keywords: ['cases', 'notes', 'incident', 'investigation'],
    defaultSize: { width: 800, height: 600 },
  },
  files: {
    id: 'files',
    name: 'File Manager',
    icon: '\uD83D\uDCC1',
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
    icon: '\uD83D\uDCDD',
    description: 'Code editing workspace',
    accentColor: palette.amber,
    category: 'tools',
    keywords: ['editor', 'code', 'edit', 'write'],
    defaultSize: { width: 1000, height: 700 },
  },
  monitor: {
    id: 'monitor',
    name: 'System Monitor',
    icon: '\uD83D\uDCCA',
    description: 'System status and metrics',
    accentColor: palette.amber,
    category: 'system',
    keywords: ['monitor', 'system', 'status', 'metrics', 'health'],
    defaultSize: { width: 400, height: 500 },
  },
  settings: {
    id: 'settings',
    name: 'Settings',
    icon: '\u2699\uFE0F',
    description: 'Application settings',
    accentColor: palette.textSecondary,
    category: 'system',
    keywords: ['settings', 'preferences', 'config', 'options'],
    defaultSize: { width: 800, height: 600 },
    showOnDesktop: true,
  },
  'ip-result': {
    id: 'ip-result',
    name: 'IP Result',
    icon: '\uD83D\uDD0D',
    description: 'IP scan result',
    accentColor: palette.cyan,
    category: 'core',
    keywords: [],
    defaultSize: { width: 900, height: 700 },
  },
  'url-result': {
    id: 'url-result',
    name: 'URL Result',
    icon: '\uD83D\uDD0D',
    description: 'URL scan result',
    accentColor: palette.cyan,
    category: 'core',
    keywords: [],
    defaultSize: { width: 900, height: 700 },
  },
  'domain-result': {
    id: 'domain-result',
    name: 'Domain Result',
    icon: '\uD83D\uDD0D',
    description: 'Domain scan result',
    accentColor: palette.cyan,
    category: 'core',
    keywords: [],
    defaultSize: { width: 900, height: 700 },
  },
  'hash-result': {
    id: 'hash-result',
    name: 'Hash Result',
    icon: '\uD83D\uDD0D',
    description: 'Hash scan result',
    accentColor: palette.cyan,
    category: 'core',
    keywords: [],
    defaultSize: { width: 900, height: 700 },
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
