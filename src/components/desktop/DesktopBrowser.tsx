import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { DesktopIntelDashboard } from './DesktopIntelDashboard';
import { DesktopCaseManager } from './DesktopCaseManager';
import { DesktopSettings } from './DesktopSettings';
import { DesktopTopDesk } from './DesktopTopDesk';
import { ArrowLeft, ArrowRight, RotateCcw, Home, Globe, Lock, AlertTriangle, ExternalLink } from 'lucide-react';

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
  blue: '#00b4d8',
};

interface BrowserTab {
  id: string;
  url: string;
  title: string;
  history: string[];
  historyIndex: number;
  canGoBack: boolean;
  canGoForward: boolean;
  iframeBlocked?: boolean;
}

const INTERNAL_PAGES: Record<string, { title: string; component: React.ComponentType }> = {
  'thamos://home': { title: 'Home', component: HomePage },
  'thamos://news': { title: 'Intel Stream', component: DesktopIntelDashboard },
  'thamos://cases': { title: 'Case Manager', component: DesktopCaseManager },
  'thamos://topdesk': { title: 'TopDesk', component: DesktopTopDesk },
  'thamos://settings': { title: 'Settings', component: DesktopSettings },
  'thamos://history': { title: 'History', component: HistoryPage },
};

const DEFAULT_BOOKMARKS = [
  { label: 'Home', url: 'thamos://home' },
  { label: 'Intel', url: 'thamos://news' },
  { label: 'Cases', url: 'thamos://cases' },
  { label: 'TopDesk', url: 'thamos://topdesk' },
  { label: 'History', url: 'thamos://history' },
  { label: 'Settings', url: 'thamos://settings' },
];

function isInternalUrl(url: string): boolean {
  return url.startsWith('thamos://');
}

function isValidUrl(url: string): boolean {
  return isInternalUrl(url) || /^https?:\/\//i.test(url);
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (isInternalUrl(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes('.') && !trimmed.includes(' ')) return `https://${trimmed}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}

export function DesktopBrowser() {
  const [tabs, setTabs] = useState<BrowserTab[]>([
    { id: 'tab-1', url: 'thamos://home', title: 'Home', history: ['thamos://home'], historyIndex: 0, canGoBack: false, canGoForward: false },
  ]);
  const [activeTabId, setActiveTabId] = useState('tab-1');
  const [urlInput, setUrlInput] = useState('thamos://home');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  const updateTab = useCallback((tabId: string, updates: Partial<BrowserTab>) => {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, ...updates } : t));
  }, []);

  const navigate = useCallback((rawUrl: string, tabId?: string, addToHistory = true) => {
    const url = normalizeUrl(rawUrl);
    const targetId = tabId || activeTabId;
    const internal = INTERNAL_PAGES[url];
    const title = internal?.title || url;

    setTabs(prev => prev.map(t => {
      if (t.id !== targetId) return t;
      const newHistory = addToHistory
        ? [...t.history.slice(0, t.historyIndex + 1), url]
        : t.history;
      const newIndex = addToHistory ? newHistory.length - 1 : t.historyIndex;
      return {
        ...t,
        url,
        title,
        history: newHistory,
        historyIndex: newIndex,
        canGoBack: newIndex > 0,
        canGoForward: newIndex < newHistory.length - 1,
        iframeBlocked: false,
      };
    }));
    setUrlInput(url);
  }, [activeTabId]);

  const goBack = useCallback(() => {
    setTabs(prev => prev.map(t => {
      if (t.id !== activeTabId || t.historyIndex <= 0) return t;
      const newIndex = t.historyIndex - 1;
      const url = t.history[newIndex];
      return {
        ...t,
        url,
        title: INTERNAL_PAGES[url]?.title || url,
        historyIndex: newIndex,
        canGoBack: newIndex > 0,
        canGoForward: true,
        iframeBlocked: false,
      };
    }));
  }, [activeTabId]);

  const goForward = useCallback(() => {
    setTabs(prev => prev.map(t => {
      if (t.id !== activeTabId || t.historyIndex >= t.history.length - 1) return t;
      const newIndex = t.historyIndex + 1;
      const url = t.history[newIndex];
      return {
        ...t,
        url,
        title: INTERNAL_PAGES[url]?.title || url,
        historyIndex: newIndex,
        canGoBack: true,
        canGoForward: newIndex < t.history.length - 1,
        iframeBlocked: false,
      };
    }));
  }, [activeTabId]);

  const reload = useCallback(() => {
    if (iframeRef.current && !isInternalUrl(activeTab.url)) {
      iframeRef.current.src = activeTab.url;
    }
  }, [activeTab.url]);

  const addTab = () => {
    const id = `tab-${Date.now()}`;
    setTabs(prev => [...prev, { id, url: 'thamos://home', title: 'Home', history: ['thamos://home'], historyIndex: 0, canGoBack: false, canGoForward: false }]);
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

  const handleIframeError = () => {
    updateTab(activeTabId, { iframeBlocked: true });
  };

  const openExternal = () => {
    window.open(activeTab.url, '_blank', 'noopener,noreferrer');
  };

  const PageComponent = INTERNAL_PAGES[activeTab?.url]?.component;
  const showIframe = !isInternalUrl(activeTab.url) && !activeTab.iframeBlocked;
  const showBlocked = !isInternalUrl(activeTab.url) && activeTab.iframeBlocked;

  // Sync urlInput when switching tabs
  useEffect(() => {
    setUrlInput(activeTab.url);
  }, [activeTab.url]);

  // Listen for internal navigation events from HomePage
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.url) {
        navigate(detail.url);
      }
    };
    window.addEventListener('thamos:browser-navigate', handler);
    return () => window.removeEventListener('thamos:browser-navigate', handler);
  }, [navigate]);

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: P.void, fontFamily: 'JetBrains Mono, monospace' }}>
      {/* Toolbar */}
      <div style={{ backgroundColor: P.surface, borderBottom: `1px solid ${P.border}` }}>
        {/* Tabs */}
        <div className="flex items-center" style={{ borderBottom: `1px solid ${P.border}` }}>
          <div className="flex-1 flex items-center overflow-x-auto pr-2">
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
                    className="flex items-center justify-center w-5 h-5 rounded text-xs transition-all opacity-60 hover:opacity-100 flex-shrink-0"
                    style={{ color: P.dim }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${P.pink}20`; e.currentTarget.style.color = P.pink; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = P.dim; }}
                    title="Close tab"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addTab}
            className="px-3 py-1.5 text-xs transition-all flex-shrink-0 hover:text-white"
            style={{ color: P.dim, borderLeft: `1px solid ${P.border}` }}
            title="New tab"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Navigation bar */}
        <div className="flex items-center gap-2 px-3 py-1.5">
          <button
            onClick={goBack}
            disabled={!activeTab.canGoBack}
            className="text-xs p-1 rounded transition-all"
            style={{ color: activeTab.canGoBack ? P.textLight : P.dim, opacity: activeTab.canGoBack ? 1 : 0.4 }}
            title="Back"
          >
            <ArrowLeft size={13} />
          </button>
          <button
            onClick={goForward}
            disabled={!activeTab.canGoForward}
            className="text-xs p-1 rounded transition-all"
            style={{ color: activeTab.canGoForward ? P.textLight : P.dim, opacity: activeTab.canGoForward ? 1 : 0.4 }}
            title="Forward"
          >
            <ArrowRight size={13} />
          </button>
          <button
            onClick={reload}
            className="text-xs p-1 rounded transition-all"
            style={{ color: P.dim }}
            title="Reload"
          >
            <RotateCcw size={12} />
          </button>
          <button
            onClick={() => navigate('thamos://home')}
            className="text-xs p-1 rounded transition-all"
            style={{ color: P.dim }}
            title="Home"
          >
            <Home size={12} />
          </button>

          <form onSubmit={handleUrlSubmit} className="flex-1 flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-1 rounded" style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}` }}>
              {isInternalUrl(urlInput) ? (
                <Home size={11} style={{ color: P.cyan, flexShrink: 0 }} />
              ) : urlInput.startsWith('https') ? (
                <Lock size={11} style={{ color: P.green, flexShrink: 0 }} />
              ) : (
                <Globe size={11} style={{ color: P.dim, flexShrink: 0 }} />
              )}
              <input
                type="text"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                className="flex-1 text-xs bg-transparent border-none outline-none"
                style={{ color: P.textLight, fontFamily: 'JetBrains Mono, monospace' }}
              />
            </div>
          </form>
        </div>

        {/* Bookmarks bar */}
        <div className="flex items-center gap-1 px-3 py-1" style={{ borderTop: `1px solid ${P.border}` }}>
          {DEFAULT_BOOKMARKS.map(bm => (
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

      {/* Content area */}
      <div className="flex-1 overflow-hidden relative">
        {PageComponent ? (
          <PageComponent />
        ) : showIframe ? (
          <iframe
            ref={iframeRef}
            src={activeTab.url}
            onError={handleIframeError}
            onLoad={(e) => {
              // Some sites load but then block with X-Frame-Options
              // We can't detect X-Frame-Options directly, but we can set a timeout
              setTimeout(() => {
                try {
                  // If we can access contentWindow.location, it's not blocked
                  const loc = (e.target as HTMLIFrameElement).contentWindow?.location.href;
                  if (!loc) {
                    updateTab(activeTabId, { iframeBlocked: true });
                  }
                } catch {
                  // Cross-origin access blocked — this is normal for most sites
                  // We assume the iframe loaded successfully unless onError fires
                }
              }, 2000);
            }}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads"
            style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#fff' }}
            title={activeTab.title}
          />
        ) : showBlocked ? (
          <div className="h-full flex items-center justify-center" style={{ backgroundColor: P.void }}>
            <div className="text-center max-w-md">
              <AlertTriangle size={32} style={{ color: P.amber, opacity: 0.6 }} className="mx-auto mb-3" />
              <p className="text-sm font-medium mb-1" style={{ color: P.textLight }}>This site cannot be embedded</p>
              <p className="text-xs mb-4" style={{ color: P.dim }}>
                {activeTab.url} has restricted iframe embedding for security reasons.
              </p>
              <button
                onClick={openExternal}
                className="flex items-center gap-2 mx-auto px-4 py-2 text-xs font-medium rounded transition-all"
                style={{ backgroundColor: `${P.blue}15`, border: `1px solid ${P.blue}40`, color: P.blue }}
              >
                <ExternalLink size={12} />
                OPEN IN NEW TAB
              </button>
            </div>
          </div>
        ) : (
          <NotFoundPage />
        )}
      </div>
    </div>
  );
}

function HomePage() {
  const [quickUrl, setQuickUrl] = useState('');

  const navigateTo = (url: string) => {
    // This is a bit hacky but works for internal navigation
    window.dispatchEvent(new CustomEvent('thamos:browser-navigate', { detail: { url } }));
  };

  return (
    <div className="h-full flex items-center justify-center" style={{ backgroundColor: P.void }}>
      <div className="text-center max-w-lg w-full px-6">
        <div className="mb-8">
          <span className="text-3xl font-bold" style={{ color: P.textLight }}>THAM</span>
          <span className="text-3xl font-bold" style={{ color: P.cyan }}>OS</span>
          <p className="text-xs mt-2 tracking-wider" style={{ color: P.dim }}>SECURE BROWSER ENVIRONMENT</p>
        </div>

        <div className="flex items-center gap-2 mb-8">
          <input
            type="text"
            value={quickUrl}
            onChange={e => setQuickUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && quickUrl.trim()) {
                window.dispatchEvent(new CustomEvent('thamos:browser-navigate', { detail: { url: normalizeUrl(quickUrl) } }));
                setQuickUrl('');
              }
            }}
            placeholder="Search or type a URL..."
            className="flex-1 px-4 py-2.5 text-xs rounded focus:outline-none"
            style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}`, color: P.textLight, fontFamily: 'JetBrains Mono, monospace' }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 mb-6">
          {[
            { url: 'thamos://news', label: 'Intel Stream', color: P.cyan, desc: 'Threat feeds' },
            { url: 'thamos://cases', label: 'Case Manager', color: P.green, desc: 'Investigations' },
            { url: 'thamos://topdesk', label: 'TopDesk', color: P.blue, desc: 'Tickets' },
            { url: 'thamos://history', label: 'Scan History', color: P.amber, desc: 'Past lookups' },
            { url: 'thamos://settings', label: 'Settings', color: P.text, desc: 'Configuration' },
          ].map(link => (
            <button
              key={link.url}
              onClick={() => navigateTo(link.url)}
              className="p-3 rounded text-left transition-all hover:opacity-80"
              style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}
            >
              <span className="text-xs font-medium block" style={{ color: link.color }}>{link.label}</span>
              <span className="text-[10px]" style={{ color: P.dim }}>{link.desc}</span>
            </button>
          ))}
        </div>

        <p className="text-xs" style={{ color: P.dim }}>
          Type a URL above or use the bookmarks bar to navigate
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
