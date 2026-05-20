import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useDesktop } from '../../contexts/DesktopContext';
import { supabase } from '../../lib/supabase';

const P = {
  void: '#060610',
  surface: '#0a0e1a',
  surfaceLight: '#0f1424',
  border: '#1a1f35',
  dim: '#3a3f55',
  text: '#8a8fa8',
  textLight: '#c8cde0',
  green: '#00ff9d',
  cyan: '#00d9ff',
  amber: '#fbbf24',
  pink: '#ff0080',
  orange: '#ff6b35',
  blue: '#00b4d8',
};

interface AgentStatus {
  name: string;
  provider: string;
  keyConfigured: boolean;
  color: string;
}

interface ActivityEvent {
  id: string;
  time: string;
  message: string;
  color: string;
}

export function DesktopSystemMonitor() {
  const { user } = useAuth();
  const desktop = useDesktop();
  const [sessionStart] = useState(Date.now());
  const [uptime, setUptime] = useState('00:00:00');
  const [activity, setActivity] = useState<ActivityEvent[]>([
    { id: 'boot', time: new Date().toLocaleTimeString('en-US', { hour12: false }), message: 'ThamOS session started', color: P.green },
  ]);
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([
    { name: 'ThamOS-X', provider: 'anthropic_key', keyConfigured: false, color: P.green },
    { name: 'ThamOS-Y', provider: 'openai_key', keyConfigured: false, color: P.orange },
    { name: 'ThamOS-Z', provider: 'gemini_key', keyConfigured: false, color: P.blue },
  ]);
  const [scanCounts, setScanCounts] = useState({ ip: 0, url: 0, hash: 0, domain: 0, extension: 0 });
  const [intelStatus, setIntelStatus] = useState({ feeds: 0, articles: 0, unread: 0 });
  const [keyCount, setKeyCount] = useState(0);
  const [caseCount, setCaseCount] = useState({ open: 0, investigating: 0 });
  const [iocRelCount, setIocRelCount] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - sessionStart;
      const h = Math.floor(elapsed / 3600000).toString().padStart(2, '0');
      const m = Math.floor((elapsed % 3600000) / 60000).toString().padStart(2, '0');
      const s = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');
      setUptime(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStart]);

  useEffect(() => {
    if (!user) return;

    const loadStatus = async () => {
      const { data: keys } = await supabase
        .from('user_api_keys')
        .select('service')
        .eq('user_id', user.id)
        .eq('is_active', true);

      const configuredServices = (keys || []).map(k => k.service);
      setKeyCount(configuredServices.length);

      setAgentStatuses(prev => prev.map(a => ({
        ...a,
        keyConfigured: configuredServices.includes(a.provider),
      })));

      const [ipRes, urlRes, hashRes, domainRes, extRes, feedRes, articleRes, unreadRes, caseOpenRes, caseInvRes, iocRelRes] = await Promise.all([
        supabase.from('ip_lookups').select('id', { count: 'exact', head: true }),
        supabase.from('url_lookups').select('id', { count: 'exact', head: true }),
        supabase.from('hash_lookups').select('id', { count: 'exact', head: true }),
        supabase.from('domain_lookups').select('id', { count: 'exact', head: true }),
        supabase.from('extension_analyses').select('id', { count: 'exact', head: true }),
        supabase.from('rss_sources').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('feed_items').select('id', { count: 'exact', head: true }),
        supabase.from('user_feed_items').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false),
        supabase.from('case_notes').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('case_notes').select('id', { count: 'exact', head: true }).eq('status', 'investigating'),
        supabase.from('ioc_relationships').select('id', { count: 'exact', head: true }),
      ]);

      setScanCounts({
        ip: ipRes.count || 0,
        url: urlRes.count || 0,
        hash: hashRes.count || 0,
        domain: domainRes.count || 0,
        extension: extRes.count || 0,
      });

      setIntelStatus({ feeds: feedRes.count || 0, articles: articleRes.count || 0, unread: unreadRes.count || 0 });
      setCaseCount({ open: caseOpenRes.count || 0, investigating: caseInvRes.count || 0 });
      setIocRelCount(iocRelRes.count || 0);
    };

    loadStatus();
  }, [user]);

  // Track window opens/closes for activity feed
  const [prevWindowCount, setPrevWindowCount] = useState(Object.keys(desktop.windows).length);
  useEffect(() => {
    const currentCount = Object.keys(desktop.windows).length;
    const now = new Date().toLocaleTimeString('en-US', { hour12: false });

    if (currentCount > prevWindowCount) {
      const newest = Object.values(desktop.windows).sort((a, b) => b.zIndex - a.zIndex)[0];
      if (newest) {
        setActivity(prev => [...prev.slice(-19), {
          id: `open-${Date.now()}`,
          time: now,
          message: `Opened ${newest.title}`,
          color: P.cyan,
        }]);
      }
    } else if (currentCount < prevWindowCount) {
      setActivity(prev => [...prev.slice(-19), {
        id: `close-${Date.now()}`,
        time: now,
        message: `Window closed`,
        color: P.dim,
      }]);
    }
    setPrevWindowCount(currentCount);
  }, [Object.keys(desktop.windows).length]);

  // Track workspace switches
  const [prevWorkspace, setPrevWorkspace] = useState(desktop.activeWorkspace);
  useEffect(() => {
    if (desktop.activeWorkspace !== prevWorkspace) {
      const now = new Date().toLocaleTimeString('en-US', { hour12: false });
      setActivity(prev => [...prev.slice(-19), {
        id: `ws-${Date.now()}`,
        time: now,
        message: `Switched to Workspace ${desktop.activeWorkspace}`,
        color: P.amber,
      }]);
      setPrevWorkspace(desktop.activeWorkspace);
    }
  }, [desktop.activeWorkspace]);

  const totalScans = scanCounts.ip + scanCounts.url + scanCounts.hash + scanCounts.domain + scanCounts.extension;
  const windowCount = Object.keys(desktop.windows).length;

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4" style={{ backgroundColor: P.void, fontFamily: 'JetBrains Mono, monospace' }}>
      <Section title="SESSION">
        <Row label="USER" value={user?.email || 'anonymous'} color={P.cyan} />
        <Row label="UPTIME" value={uptime} color={P.green} />
        <Row label="WINDOWS" value={windowCount.toString()} color={P.textLight} />
        <Row label="WORKSPACE" value={desktop.activeWorkspace.toString()} color={P.amber} />
        <Row label="STATUS" value="ACTIVE" color={P.green} />
      </Section>

      <Section title="AGENT MESH">
        {agentStatuses.map(a => (
          <div key={a.name} className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: a.keyConfigured ? a.color : P.dim,
                  boxShadow: a.keyConfigured ? `0 0 6px ${a.color}60` : 'none',
                }}
              />
              <span className="text-xs" style={{ color: a.color }}>{a.name}</span>
            </div>
            <span className="text-xs" style={{ color: a.keyConfigured ? P.green : P.dim }}>
              {a.keyConfigured ? 'ONLINE' : 'NO KEY'}
            </span>
          </div>
        ))}
      </Section>

      <Section title="SCAN INTEL">
        <Row label="TOTAL" value={totalScans.toString()} color={P.cyan} />
        <div className="mt-1 space-y-1">
          <BarRow label="IP" value={scanCounts.ip} max={totalScans || 1} color={P.cyan} />
          <BarRow label="URL" value={scanCounts.url} max={totalScans || 1} color={P.green} />
          <BarRow label="HASH" value={scanCounts.hash} max={totalScans || 1} color={P.amber} />
          <BarRow label="DOMAIN" value={scanCounts.domain} max={totalScans || 1} color={P.orange} />
          <BarRow label="EXT" value={scanCounts.extension} max={totalScans || 1} color={P.blue} />
        </div>
      </Section>

      <Section title="CASE MANAGER">
        <Row label="OPEN" value={caseCount.open.toString()} color={caseCount.open > 0 ? P.amber : P.dim} />
        <Row label="INVESTIGATING" value={caseCount.investigating.toString()} color={caseCount.investigating > 0 ? P.orange : P.dim} />
        <Row label="IOC GRAPH EDGES" value={iocRelCount.toString()} color={P.blue} />
      </Section>

      <Section title="THREAT FEEDS">
        <Row label="SOURCES" value={intelStatus.feeds.toString()} color={P.cyan} />
        <Row label="ARTICLES" value={intelStatus.articles.toString()} color={P.textLight} />
        <Row label="UNREAD" value={intelStatus.unread.toString()} color={intelStatus.unread > 0 ? P.amber : P.dim} />
        <Row label="STATUS" value={intelStatus.feeds > 0 ? 'CONNECTED' : 'IDLE'} color={intelStatus.feeds > 0 ? P.green : P.dim} />
      </Section>

      <Section title="API KEYS">
        <Row label="CONFIGURED" value={`${keyCount}/25`} color={keyCount > 0 ? P.green : P.dim} />
        <div className="mt-1">
          <div className="w-full h-1 rounded-full" style={{ backgroundColor: P.border }}>
            <div
              className="h-1 rounded-full transition-all"
              style={{
                width: `${Math.min((keyCount / 25) * 100, 100)}%`,
                backgroundColor: keyCount > 15 ? P.green : keyCount > 7 ? P.amber : P.pink,
              }}
            />
          </div>
        </div>
      </Section>

      <Section title="ACTIVITY">
        <div className="space-y-0.5 max-h-40 overflow-y-auto">
          {activity.slice().reverse().map(event => (
            <div key={event.id} className="flex items-start gap-2 py-0.5">
              <span className="text-[10px] tabular-nums shrink-0" style={{ color: P.dim }}>{event.time}</span>
              <span className="text-[10px]" style={{ color: event.color }}>{event.message}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1 h-3 rounded-sm" style={{ backgroundColor: P.cyan }} />
        <span className="text-xs font-medium tracking-wider" style={{ color: P.cyan }}>{title}</span>
      </div>
      <div className="pl-3 space-y-0.5" style={{ borderLeft: `1px solid ${P.border}` }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs" style={{ color: P.dim }}>{label}</span>
      <span className="text-xs font-medium" style={{ color }}>{value}</span>
    </div>
  );
}

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs w-12" style={{ color: P.dim }}>{label}</span>
      <div className="flex-1 h-1 rounded-full" style={{ backgroundColor: P.border }}>
        <div
          className="h-1 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs w-8 text-right" style={{ color: P.text }}>{value}</span>
    </div>
  );
}
