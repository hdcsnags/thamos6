import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { DesktopIntelDashboard } from './DesktopIntelDashboard';
import { DesktopCaseManager } from './DesktopCaseManager';
import { DesktopSettings } from './DesktopSettings';
import { ArrowLeft, ArrowRight, RotateCcw, Home, Globe, Lock, AlertTriangle, ExternalLink, ChevronLeft, ChevronRight, Search, Newspaper, FolderKanban, Clock3, Settings2, ShieldCheck } from 'lucide-react';
import { useDesktop } from '../../contexts/DesktopContext';
import { palette, typography } from '../../design-system/tokens';

const P = {
  void: palette.void,
  surface: palette.base,
  surfaceLight: palette.elevated,
  border: palette.borderDefault,
  dim: palette.textTertiary,
  text: palette.textSecondary,
  textLight: palette.textPrimary,
  cyan: palette.cyan,
  green: palette.green,
  amber: palette.amber,
  pink: palette.rose,
  blue: palette.blue,
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
  'thamos://settings': { title: 'Settings', component: DesktopSettings },
  'thamos://history': { title: 'History', component: HistoryPage },
  'thamos://ransomware': { title: 'Ransomware Intel', component: RansomwarePage },
};

const DEFAULT_BOOKMARKS = [
  { label: 'Home', url: 'thamos://home' },
  { label: 'Intel', url: 'thamos://news' },
  { label: 'Cases', url: 'thamos://cases' },
  { label: 'History', url: 'thamos://history' },
  { label: 'Ransomware', url: 'thamos://ransomware' },
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
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

// ThamOS cannot render any external site inline (no proxy, and most sites send
// X-Frame-Options/CSP headers that block iframing). Search queries always
// resolve to a Google search URL, which never permits framing, so we skip the
// doomed iframe attempt for those and go straight to the "open externally" notice.
function isGoogleSearchUrl(url: string): boolean {
  return url.startsWith('https://www.google.com/search?q=');
}

export function DesktopBrowser() {
  const { openWindow } = useDesktop();
  const [tabs, setTabs] = useState<BrowserTab[]>([
    { id: 'tab-1', url: 'thamos://home', title: 'Home', history: ['thamos://home'], historyIndex: 0, canGoBack: false, canGoForward: false },
  ]);
  const [activeTabId, setActiveTabId] = useState('tab-1');
  const [urlInput, setUrlInput] = useState('thamos://home');
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

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
        iframeBlocked: isGoogleSearchUrl(url),
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
        iframeBlocked: isGoogleSearchUrl(url),
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
        iframeBlocked: isGoogleSearchUrl(url),
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

  const reorderTabs = useCallback((draggedId: string, targetId: string) => {
    if (draggedId === targetId) return;
    setTabs(prev => {
      const draggedIdx = prev.findIndex(t => t.id === draggedId);
      const targetIdx = prev.findIndex(t => t.id === targetId);
      if (draggedIdx === -1 || targetIdx === -1) return prev;
      const newTabs = [...prev];
      const [removed] = newTabs.splice(draggedIdx, 1);
      newTabs.splice(targetIdx, 0, removed);
      return newTabs;
    });
  }, []);

  const checkScroll = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  const scrollTabs = useCallback((direction: 'left' | 'right') => {
    const el = tabsRef.current;
    if (!el) return;
    el.scrollBy({ left: direction === 'left' ? -150 : 150, behavior: 'smooth' });
    setTimeout(checkScroll, 300);
  }, [checkScroll]);

  // Check scroll on mount and tab changes
  useEffect(() => {
    checkScroll();
    const el = tabsRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll);
    window.addEventListener('resize', checkScroll);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [tabs.length, checkScroll]);

  // Scroll active tab into view
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    const activeTabEl = el.querySelector(`[data-tab-id="${activeTabId}"]`) as HTMLElement;
    if (activeTabEl) {
      activeTabEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeTabId]);

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
    <div className="h-full flex flex-col" style={{ backgroundColor: P.void, fontFamily: typography.ui }}>
      {/* Toolbar */}
      <div style={{ backgroundColor: P.surface, borderBottom: `1px solid ${P.border}` }}>
        {/* Tabs */}
        <div className="flex items-center" style={{ borderBottom: `1px solid ${P.border}` }}>
          {canScrollLeft && (
            <button
              onClick={() => scrollTabs('left')}
              className="flex-shrink-0 px-1 py-1.5 transition-colors hover:text-white"
              style={{ color: P.dim }}
            >
              <ChevronLeft size={14} />
            </button>
          )}
          <div
            ref={tabsRef}
            className="flex-1 flex items-center overflow-x-auto pr-2"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            onDragOver={(e) => e.preventDefault()}
          >
            {tabs.map(tab => (
              <div
                key={tab.id}
                data-tab-id={tab.id}
                draggable
                className="mx-0.5 mt-1 flex max-w-[190px] flex-shrink-0 cursor-pointer select-none items-center gap-2 rounded-t-lg px-3 py-2 transition-all group"
                style={{
                  backgroundColor: tab.id === activeTabId ? P.surfaceLight : 'transparent',
                  border: tab.id === activeTabId ? `1px solid ${P.border}` : '1px solid transparent',
                  borderBottom: 'none',
                  opacity: draggedTabId === tab.id ? 0.4 : 1,
                }}
                onClick={() => switchTab(tab.id)}
                onDragStart={() => setDraggedTabId(tab.id)}
                onDragEnd={() => setDraggedTabId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedTabId) reorderTabs(draggedTabId, tab.id);
                  setDraggedTabId(null);
                }}
                onDragOver={(e) => e.preventDefault()}
              >
                <Globe size={12} style={{ color: tab.id === activeTabId ? P.cyan : P.dim, flexShrink: 0 }} />
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
          {canScrollRight && (
            <button
              onClick={() => scrollTabs('right')}
              className="flex-shrink-0 px-1 py-1.5 transition-colors hover:text-white"
              style={{ color: P.dim }}
            >
              <ChevronRight size={14} />
            </button>
          )}
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
        <div className="flex items-center gap-2 px-3 py-2">
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
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.025)' }}>
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
                placeholder="thamos:// address — external sites open in a new tab"
                className="flex-1 text-xs bg-transparent border-none outline-none"
                style={{ color: P.textLight, fontFamily: typography.ui }}
              />
            </div>
            {!isInternalUrl(activeTab.url) && (
              <button
                type="button"
                onClick={() => openWindow({ appId: 'scanner', title: `Scan: ${activeTab.url}`, data: { query: activeTab.url, type: 'url' } })}
                className="flex items-center gap-1 px-3 py-2 text-xs rounded-xl transition-all flex-shrink-0"
                style={{ backgroundColor: `${P.cyan}10`, border: `1px solid ${P.cyan}30`, color: P.cyan }}
                title="Scan this URL with threat intel"
              >
                <Search size={11} />
                SCAN
              </button>
            )}
          </form>
        </div>

        {/* Bookmarks bar */}
        <div className="flex items-center gap-1 px-3 py-1.5" style={{ borderTop: `1px solid ${P.border}` }}>
          {DEFAULT_BOOKMARKS.map(bm => (
            <button
              key={bm.url}
              onClick={() => navigate(bm.url)}
              className="text-[11px] px-2.5 py-1 rounded-lg transition-all"
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
              {isGoogleSearchUrl(activeTab.url) ? (
                <>
                  <p className="text-sm font-medium mb-1" style={{ color: P.textLight }}>ThamOS can't run web searches inline</p>
                  <p className="text-xs mb-4" style={{ color: P.dim }}>
                    The browser can only open thamos:// pages inside ThamOS. Open this search in a real browser tab instead.
                  </p>
                  <button
                    onClick={openExternal}
                    className="flex items-center gap-2 mx-auto px-4 py-2 text-xs font-medium rounded transition-all"
                    style={{ backgroundColor: `${P.blue}15`, border: `1px solid ${P.blue}40`, color: P.blue }}
                  >
                    <ExternalLink size={12} />
                    SEARCH ON GOOGLE
                  </button>
                </>
              ) : (
                <>
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
                </>
              )}
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

  const quickLinks = [
    { url: 'thamos://news', label: 'Intel Stream', color: P.cyan, desc: 'Live threat context', icon: Newspaper },
    { url: 'thamos://cases', label: 'Case Manager', color: P.green, desc: 'Active investigations', icon: FolderKanban },
    { url: 'thamos://history', label: 'Scan History', color: P.amber, desc: 'Recent evidence', icon: Clock3 },
    { url: 'thamos://settings', label: 'Settings', color: palette.pink, desc: 'Workspace controls', icon: Settings2 },
  ];

  return (
    <div className="relative h-full overflow-hidden" style={{ backgroundColor: P.void }}>
      <div className="absolute inset-0 opacity-50" style={{ backgroundImage: 'url(/wallpapers/thamos-nexus.png)', backgroundPosition: 'center', backgroundSize: 'cover' }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(3,4,5,0.52), rgba(3,4,5,0.9))' }} />
      <div className="relative flex h-full items-center justify-center overflow-y-auto px-6 py-10">
        <div className="w-full max-w-2xl">
          <div className="mb-7 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ color: '#fff', background: `linear-gradient(145deg, ${P.cyan}, ${P.blue})`, boxShadow: `0 12px 30px ${P.cyan}28` }}>
              <Globe size={24} />
            </div>
            <h2 className="text-2xl font-semibold tracking-[-0.025em]" style={{ color: P.textLight }}>ThamOS Browser</h2>
            <p className="mt-1 text-xs" style={{ color: P.dim }}>Research, pivot, and scan from one workspace.</p>
          </div>

          <div className="mb-6 flex items-center gap-3 rounded-2xl px-4" style={{ minHeight: 52, background: 'rgba(13,16,19,0.86)', border: `1px solid ${P.border}`, boxShadow: '0 15px 45px rgba(0,0,0,0.35)', backdropFilter: 'blur(16px)' }}>
            <Search size={18} style={{ color: P.cyan, flexShrink: 0 }} />
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
              placeholder="Enter a thamos:// address, or search — external sites open in a new tab"
              className="h-12 flex-1 bg-transparent text-sm"
              style={{ color: P.textLight, fontFamily: typography.ui }}
            />
            <kbd className="hidden rounded-md px-2 py-1 text-[10px] sm:block" style={{ color: P.dim, background: palette.float, border: `1px solid ${P.border}` }}>ENTER</kbd>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {quickLinks.map(link => {
              const Icon = link.icon;
              return (
                <button key={link.url} onClick={() => navigateTo(link.url)} className="group rounded-2xl p-3 text-left transition-transform hover:-translate-y-0.5" style={{ background: 'rgba(13,16,19,0.78)', border: `1px solid ${P.border}`, backdropFilter: 'blur(14px)' }}>
                  <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl" style={{ color: '#fff', background: `linear-gradient(145deg, ${link.color}d9, ${link.color}8f)`, boxShadow: `0 6px 16px ${link.color}24` }}><Icon size={18} /></div>
                  <span className="block text-xs font-semibold" style={{ color: P.textLight }}>{link.label}</span>
                  <span className="mt-1 block text-[10px]" style={{ color: P.dim }}>{link.desc}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-[10px]" style={{ color: P.dim }}>
            <ShieldCheck size={13} style={{ color: P.green }} /> External pages remain subject to browser embedding controls.
          </div>
        </div>
      </div>
    </div>
  );
}

type HistoryTab = 'ip' | 'url' | 'domain' | 'hash' | 'extension';

function HistoryPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<HistoryTab>('ip');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setData([]);
      try {
        let res;
        if (tab === 'ip') {
          res = await supabase.from('ip_lookups').select('id, ip_address, threat_score, created_at').order('created_at', { ascending: false }).limit(50);
        } else if (tab === 'url') {
          res = await supabase.from('url_lookups').select('id, url, is_malicious, created_at').order('created_at', { ascending: false }).limit(50);
        } else if (tab === 'domain') {
          res = await supabase.from('domain_lookups').select('id, domain, threat_score, is_malicious, created_at').order('created_at', { ascending: false }).limit(50);
        } else if (tab === 'hash') {
          res = await supabase.from('hash_lookups').select('id, hash, threat_score, is_malicious, created_at').order('created_at', { ascending: false }).limit(50);
        } else {
          res = await supabase.from('extension_analyses').select('id, extension_id, extension_name, risk_level, created_at').order('created_at', { ascending: false }).limit(50);
        }
        setData(res?.data || []);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [tab]);

  const isMalicious = (r: any) =>
    r.is_malicious || (r.threat_score != null && r.threat_score >= 50) || r.risk_level === 'high' || r.risk_level === 'critical';

  const primaryValue = (r: any) =>
    r.ip_address || r.url || r.domain || r.hash ||
    (r.extension_name ? `${r.extension_name} (${r.extension_id})` : r.extension_id);

  const HISTORY_TABS: { key: HistoryTab; label: string }[] = [
    { key: 'ip', label: 'IP' },
    { key: 'url', label: 'URL' },
    { key: 'domain', label: 'DOMAIN' },
    { key: 'hash', label: 'HASH' },
    { key: 'extension', label: 'EXTENSION' },
  ];

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: P.void, fontFamily: 'JetBrains Mono, monospace' }}>
      <div className="flex items-center gap-2 p-3" style={{ borderBottom: `1px solid ${P.border}`, backgroundColor: P.surface }}>
        <span className="text-xs font-medium tracking-wider" style={{ color: P.cyan }}>SCAN HISTORY</span>
        <div className="flex gap-1 ml-4">
          {HISTORY_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="px-2 py-0.5 text-xs rounded transition-all"
              style={{
                backgroundColor: tab === key ? `${P.cyan}15` : 'transparent',
                border: `1px solid ${tab === key ? `${P.cyan}40` : P.border}`,
                color: tab === key ? P.cyan : P.dim,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-center"><span className="text-xs animate-pulse" style={{ color: P.dim }}>Loading...</span></div>
        ) : data.length === 0 ? (
          <div className="p-6 text-center"><span className="text-xs" style={{ color: P.dim }}>No history yet</span></div>
        ) : (
          data.map((record: any) => (
            <div key={record.id} className="flex items-center justify-between p-3" style={{ borderBottom: `1px solid ${P.border}` }}>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{
                  backgroundColor: isMalicious(record) ? P.pink : P.green,
                }} />
                <span className="text-xs font-mono truncate max-w-[400px]" style={{ color: P.textLight }}>
                  {primaryValue(record)}
                </span>
                {record.threat_score != null && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${isMalicious(record) ? P.pink : P.green}15`, color: isMalicious(record) ? P.pink : P.green }}>
                    {record.threat_score}
                  </span>
                )}
              </div>
              <span className="text-xs flex-shrink-0" style={{ color: P.dim }}>
                {new Date(record.created_at).toLocaleString()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RansomwarePage() {
  // Render the intel dashboard pre-selected to the ransomware tab.
  return <DesktopIntelDashboard data={{ feed: 'ransomware' }} />;
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
