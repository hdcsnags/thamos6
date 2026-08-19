import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, ChevronRight, ChevronLeft, X, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { palette, typography } from '../../design-system/tokens';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function newsFeedsUrl(path: string) {
  return `${SUPABASE_URL}/functions/v1/news-feeds${path}`;
}

interface FeedItem {
  id: string;
  title: string;
  description: string;
  link: string;
  pub_date: string;
  source: {
    name: string;
    category: string;
  };
}

const STORAGE_KEY = 'thamos.intelWidget';
const NEWS_ONLY_KEY = 'thamos.intelWidget.newsOnly';
type WidgetState = 'open' | 'collapsed' | 'hidden';
const POLL_MS = 5 * 60 * 1000;
const ITEM_LIMIT = 15;

function readState(): WidgetState {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'open' || v === 'collapsed' || v === 'hidden') return v;
  } catch {
    // localStorage unavailable — fall through to default
  }
  return 'collapsed';
}

function writeState(state: WidgetState) {
  try {
    localStorage.setItem(STORAGE_KEY, state);
  } catch {
    // ignore storage failures (private browsing, quota, etc.)
  }
}

// Defaults to News-only: the abuse.ch IOC feeds (ThreatFox/URLhaus/MalwareBazaar)
// are all tagged category "threats" and are high-volume — great for the full
// Intel Stream tab, too noisy for a glanceable desktop ticker.
function readNewsOnly(): boolean {
  try {
    const v = localStorage.getItem(NEWS_ONLY_KEY);
    if (v === 'false') return false;
  } catch {
    // ignore
  }
  return true;
}

function writeNewsOnly(v: boolean) {
  try {
    localStorage.setItem(NEWS_ONLY_KEY, String(v));
  } catch {
    // ignore
  }
}

const stripCDATA = (text: string) => {
  if (!text) return '';
  return text.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '');
};

const getRelativeTime = (dateString: string) => {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  return new Date(dateString).toLocaleDateString();
};

const catColor = (cat: string) => {
  const map: Record<string, string> = {
    vulnerabilities: palette.rose,
    threats: palette.rose,
    alerts: palette.amber,
    news: palette.cyan,
  };
  return map[cat] || palette.cyan;
};

export function IntelWidget() {
  const [state, setStateRaw] = useState<WidgetState>(readState);
  const [newsOnly, setNewsOnlyRaw] = useState<boolean>(readNewsOnly);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setState = useCallback((next: WidgetState) => {
    writeState(next);
    setStateRaw(next);
    window.dispatchEvent(new Event('thamos:intel-widget-changed'));
  }, []);

  const setNewsOnly = useCallback((next: boolean) => {
    writeNewsOnly(next);
    setNewsOnlyRaw(next);
  }, []);

  // React to the state being changed elsewhere (e.g. the desktop context menu toggle).
  useEffect(() => {
    const handler = () => setStateRaw(readState());
    window.addEventListener('thamos:intel-widget-changed', handler);
    return () => window.removeEventListener('thamos:intel-widget-changed', handler);
  }, []);

  const loadItems = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const { data: { session } } = await supabase.auth.getSession();
      const isAuth = !!session?.access_token;
      const endpoint = isAuth ? '/my/items' : '/items';
      const headers: Record<string, string> = { apikey: ANON_KEY };
      if (isAuth) headers['Authorization'] = `Bearer ${session!.access_token}`;

      const res = await fetch(`${newsFeedsUrl(endpoint)}?${new URLSearchParams({
        limit: String(ITEM_LIMIT),
        ...(newsOnly ? { category: 'news' } : {}),
      })}`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems((data.items || []).slice(0, ITEM_LIMIT));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [newsOnly]);

  // Fetch on open/expand, and silently re-poll every 5 minutes while open.
  useEffect(() => {
    if (state !== 'open') {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    loadItems();
    pollRef.current = setInterval(() => loadItems(true), POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [state, loadItems]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadItems(true);
    } finally {
      setRefreshing(false);
    }
  }, [loadItems]);

  if (state === 'hidden') return null;

  if (state === 'collapsed') {
    return (
      <button
        onClick={() => setState('open')}
        title="Show Intel Stream"
        className="fixed flex items-center justify-center transition-opacity hover:opacity-100"
        style={{
          top: 72,
          right: 0,
          zIndex: 15,
          width: 28,
          height: 64,
          borderRadius: '8px 0 0 8px',
          background: 'rgba(13,16,19,0.82)',
          border: `1px solid ${palette.borderDefault}`,
          borderRight: 'none',
          opacity: 0.7,
          fontFamily: typography.ui,
        }}
      >
        <ChevronLeft size={14} color={palette.textSecondary} />
      </button>
    );
  }

  return (
    <div
      className="fixed flex flex-col overflow-hidden"
      style={{
        top: 56,
        right: 16,
        zIndex: 15,
        width: 320,
        maxHeight: 'calc(100vh - 56px - 64px)',
        borderRadius: 10,
        background: 'rgba(13,16,19,0.86)',
        border: `1px solid ${palette.borderDefault}`,
        boxShadow: '0 15px 45px rgba(0,0,0,0.35)',
        backdropFilter: 'blur(16px)',
        fontFamily: typography.ui,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{ borderBottom: `1px solid ${palette.borderSubtle}` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-block rounded-full"
            style={{
              width: 6,
              height: 6,
              backgroundColor: palette.green,
              boxShadow: `0 0 6px ${palette.green}`,
            }}
          />
          <span
            className="uppercase tracking-wider truncate"
            style={{ fontSize: '11px', fontFamily: typography.mono, color: palette.textSecondary, letterSpacing: '0.08em' }}
          >
            Intel Stream
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setNewsOnly(!newsOnly)}
            title={newsOnly ? 'Showing news only — click for all sources (incl. IOC feeds)' : 'Showing all sources — click for news only'}
            className="px-1.5 py-0.5 rounded uppercase"
            style={{
              fontSize: '9px',
              fontFamily: typography.mono,
              letterSpacing: '0.05em',
              color: newsOnly ? palette.cyan : palette.textTertiary,
              background: newsOnly ? `${palette.cyan}1a` : 'transparent',
              border: `1px solid ${newsOnly ? `${palette.cyan}40` : palette.borderSubtle}`,
            }}
          >
            {newsOnly ? 'News' : 'All'}
          </button>
          <button
            onClick={handleRefresh}
            title="Refresh"
            className="p-1 rounded hover:bg-white/[0.06]"
          >
            <RefreshCw size={12} color={palette.textTertiary} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setState('collapsed')}
            title="Collapse"
            className="p-1 rounded hover:bg-white/[0.06]"
          >
            <ChevronRight size={12} color={palette.textTertiary} />
          </button>
          <button
            onClick={() => setState('hidden')}
            title="Hide"
            className="p-1 rounded hover:bg-white/[0.06]"
          >
            <X size={12} color={palette.textTertiary} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="overflow-y-auto flex-1 min-h-0" style={{ scrollbarWidth: 'thin' }}>
        {loading && items.length === 0 && (
          <div className="px-3 py-4" style={{ fontSize: '11px', color: palette.textDisabled }}>
            Loading intel…
          </div>
        )}
        {!loading && error && items.length === 0 && (
          <div className="px-3 py-4" style={{ fontSize: '11px', color: palette.textDisabled }}>
            Intel stream unavailable.
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="px-3 py-4" style={{ fontSize: '11px', color: palette.textDisabled }}>
            No recent items.
          </div>
        )}
        {items.map(item => (
          <div
            key={item.id}
            role="button"
            onClick={() => window.open(item.link, '_blank', 'noopener')}
            className="group flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-white/[0.04]"
            style={{ borderBottom: `1px solid ${palette.borderSubtle}` }}
          >
            <span
              className="inline-block rounded-full mt-1.5 shrink-0"
              style={{ width: 6, height: 6, backgroundColor: catColor(item.source?.category) }}
            />
            <div className="min-w-0 flex-1">
              <div
                className="flex items-center gap-1.5"
                style={{ fontSize: '10px', color: palette.textTertiary, fontFamily: typography.mono }}
              >
                <span>{getRelativeTime(item.pub_date)}</span>
                <span>·</span>
                <span className="truncate">{item.source?.name}</span>
              </div>
              <div
                className="mt-0.5"
                style={{
                  fontSize: '12px',
                  color: palette.textPrimary,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  lineHeight: 1.35,
                }}
              >
                {stripCDATA(item.title)}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.open(item.link, '_blank', 'noopener');
              }}
              title="Open article"
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-white/[0.08] shrink-0"
            >
              <ExternalLink size={11} color={palette.textTertiary} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export { STORAGE_KEY as INTEL_WIDGET_STORAGE_KEY, readState as readIntelWidgetState, writeState as writeIntelWidgetState };
export type { WidgetState as IntelWidgetState };
