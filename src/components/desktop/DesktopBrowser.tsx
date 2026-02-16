import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { DesktopIntelDashboard } from './DesktopIntelDashboard';
import { DesktopCaseManager } from './DesktopCaseManager';
import { DesktopSettings } from './DesktopSettings';

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
};

interface BrowserTab {
  id: string;
  url: string;
  title: string;
}

const INTERNAL_PAGES: Record<string, { title: string; component: React.ComponentType }> = {
  'thamos://home': { title: 'Home', component: HomePage },
  'thamos://news': { title: 'Intel Stream', component: DesktopIntelDashboard },
  'thamos://cases': { title: 'Case Manager', component: DesktopCaseManager },
  'thamos://settings': { title: 'Settings', component: DesktopSettings },
  'thamos://history': { title: 'History', component: HistoryPage },
};

const BOOKMARKS = [
  { label: 'Home', url: 'thamos://home' },
  { label: 'Intel', url: 'thamos://news' },
  { label: 'Cases', url: 'thamos://cases' },
  { label: 'History', url: 'thamos://history' },
  { label: 'Settings', url: 'thamos://settings' },
];

export function DesktopBrowser() {
  const [tabs, setTabs] = useState<BrowserTab[]>([
    { id: 'tab-1', url: 'thamos://home', title: 'Home' },
  ]);
  const [activeTabId, setActiveTabId] = useState('tab-1');
  const [urlInput, setUrlInput] = useState('thamos://home');

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  const navigate = useCallback((url: string, tabId?: string) => {
    const page = INTERNAL_PAGES[url];
    const title = page?.title || url;
    const targetId = tabId || activeTabId;

    setTabs(prev => prev.map(t =>
      t.id === targetId ? { ...t, url, title } : t
    ));
    setUrlInput(url);
  }, [activeTabId]);

  const addTab = () => {
    const id = `tab-${Date.now()}`;
    setTabs(prev => [...prev, { id, url: 'thamos://home', title: 'Home' }]);
    setActiveTabId(id);
    setUrlInput('thamos://home');
  };

  const closeTab = (id: string) => {
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex(t => t.id === id);
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);
    if (activeTabId === id) {
      const newActive = newTabs[Math.min(idx, newTabs.length - 1)];
      setActiveTabId(newActive.id);
      setUrlInput(newActive.url);
    }
  };

  const switchTab = (id: string) => {
    setActiveTabId(id);
    const tab = tabs.find(t => t.id === id);
    if (tab) setUrlInput(tab.url);
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(urlInput);
  };

  const PageComponent = INTERNAL_PAGES[activeTab?.url]?.component || NotFoundPage;

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: P.void, fontFamily: 'JetBrains Mono, monospace' }}>
      <div style={{ backgroundColor: P.surface, borderBottom: `1px solid ${P.border}` }}>
        <div className="flex items-center" style={{ borderBottom: `1px solid ${P.border}` }}>
          <div className="flex-1 flex items-center overflow-x-auto">
            {tabs.map(tab => (
              <div
                key={tab.id}
                className="flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-all flex-shrink-0 max-w-[180px] group"
                style={{
                  backgroundColor: tab.id === activeTabId ? P.surfaceLight : 'transparent',
                  borderRight: `1px solid ${P.border}`,
                  borderBottom: tab.id === activeTabId ? `2px solid ${P.cyan}` : '2px solid transparent',
                }}
                onClick={() => switchTab(tab.id)}
              >
                <span className="text-xs truncate" style={{ color: tab.id === activeTabId ? P.textLight : P.dim }}>
                  {tab.title}
                </span>
                {tabs.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                    className="text-xs opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    style={{ color: P.dim }}
                  >
                    x
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addTab}
            className="px-3 py-1.5 text-xs transition-all flex-shrink-0"
            style={{ color: P.dim, borderLeft: `1px solid ${P.border}` }}
          >
            +
          </button>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5">
          <button
            onClick={() => navigate('thamos://home')}
            className="text-xs px-2 py-1 rounded transition-all flex-shrink-0"
            style={{ color: P.dim, border: `1px solid ${P.border}` }}
          >
            &#8962;
          </button>
          <form onSubmit={handleUrlSubmit} className="flex-1">
            <input
              type="text"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              className="w-full px-3 py-1 text-xs rounded focus:outline-none"
              style={{
                backgroundColor: P.surfaceLight,
                border: `1px solid ${P.border}`,
                color: P.cyan,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            />
          </form>
        </div>

        <div className="flex items-center gap-1 px-3 py-1" style={{ borderTop: `1px solid ${P.border}` }}>
          {BOOKMARKS.map(bm => (
            <button
              key={bm.url}
              onClick={() => navigate(bm.url)}
              className="text-xs px-2 py-0.5 rounded transition-all"
              style={{
                color: activeTab?.url === bm.url ? P.cyan : P.dim,
                backgroundColor: activeTab?.url === bm.url ? `${P.cyan}08` : 'transparent',
              }}
            >
              {bm.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <PageComponent />
      </div>
    </div>
  );
}

function HomePage() {
  return (
    <div className="h-full flex items-center justify-center" style={{ backgroundColor: P.void }}>
      <div className="text-center max-w-md">
        <div className="mb-6">
          <span className="text-2xl font-bold" style={{ color: P.textLight }}>THAM</span>
          <span className="text-2xl font-bold" style={{ color: P.cyan }}>OS</span>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-6">
          {[
            { url: 'thamos://news', label: 'Intel Stream', color: P.cyan },
            { url: 'thamos://cases', label: 'Case Manager', color: P.green },
            { url: 'thamos://history', label: 'Scan History', color: P.amber },
            { url: 'thamos://settings', label: 'Settings', color: P.text },
          ].map(link => (
            <a
              key={link.url}
              href={link.url}
              onClick={(e) => { e.preventDefault(); }}
              className="p-3 rounded text-left transition-all"
              style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}
            >
              <span className="text-xs font-medium" style={{ color: link.color }}>{link.label}</span>
            </a>
          ))}
        </div>

        <p className="text-xs" style={{ color: P.dim }}>
          Navigate using the address bar or bookmarks
        </p>
      </div>
    </div>
  );
}

function HistoryPage() {
  const [ipHistory, setIpHistory] = useState<any[]>([]);
  const [urlHistory, setUrlHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'ip' | 'url'>('ip');

  useEffect(() => {
    const load = async () => {
      const [ipRes, urlRes] = await Promise.all([
        supabase.from('ip_lookups').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('url_lookups').select('*').order('created_at', { ascending: false }).limit(50),
      ]);
      setIpHistory(ipRes.data || []);
      setUrlHistory(urlRes.data || []);
      setLoading(false);
    };
    load();
  }, []);

  const data = tab === 'ip' ? ipHistory : urlHistory;

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: P.void, fontFamily: 'JetBrains Mono, monospace' }}>
      <div className="flex items-center gap-2 p-3" style={{ borderBottom: `1px solid ${P.border}`, backgroundColor: P.surface }}>
        <span className="text-xs font-medium tracking-wider" style={{ color: P.cyan }}>SCAN HISTORY</span>
        <div className="flex gap-1 ml-4">
          {(['ip', 'url'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-2 py-0.5 text-xs rounded transition-all"
              style={{
                backgroundColor: tab === t ? `${P.cyan}15` : 'transparent',
                border: `1px solid ${tab === t ? `${P.cyan}40` : P.border}`,
                color: tab === t ? P.cyan : P.dim,
              }}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-center"><span className="text-xs" style={{ color: P.dim }}>Loading...</span></div>
        ) : data.length === 0 ? (
          <div className="p-6 text-center"><span className="text-xs" style={{ color: P.dim }}>No history yet</span></div>
        ) : (
          data.map((record: any) => (
            <div key={record.id} className="flex items-center justify-between p-3" style={{ borderBottom: `1px solid ${P.border}` }}>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full" style={{
                  backgroundColor: (record.threat_score >= 50 || record.is_malicious) ? P.pink : P.green,
                }} />
                <span className="text-xs font-mono" style={{ color: P.textLight }}>
                  {record.ip_address || record.url}
                </span>
              </div>
              <span className="text-xs" style={{ color: P.dim }}>
                {new Date(record.created_at).toLocaleString()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="h-full flex items-center justify-center" style={{ backgroundColor: P.void }}>
      <div className="text-center">
        <span className="text-4xl font-bold" style={{ color: P.pink }}>404</span>
        <p className="text-xs mt-2" style={{ color: P.dim }}>Page not found</p>
      </div>
    </div>
  );
}
