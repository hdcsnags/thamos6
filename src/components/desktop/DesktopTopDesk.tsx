import { useState, useEffect } from 'react';
import { Search, Ticket, AlertCircle, CheckCircle, XCircle, Merge, Sparkles, Loader2, ExternalLink, Settings } from 'lucide-react';

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
  rose: '#f43f5e',
};

interface TopDeskConfig {
  url: string;
  username: string;
  appPassword: string;
}

interface TopDeskIncident {
  id: string;
  number: string;
  briefDescription: string;
  callerEmail: string;
  callerName: string;
  status: string;
  processingStatus: string;
  category: string;
  subcategory: string;
  operator: string;
  createdDate: string;
  action: string;
}

const STATUS_COLORS: Record<string, string> = {
  firstLine: P.amber,
  secondLine: P.blue,
  firstLineArchived: P.dim,
  closed: P.dim,
};

const STATUS_LABELS: Record<string, string> = {
  firstLine: 'FIRST LINE',
  secondLine: 'SECOND LINE',
  firstLineArchived: 'ARCHIVED',
  closed: 'CLOSED',
};

function getConfig(): TopDeskConfig | null {
  try {
    const url = localStorage.getItem('topdesk-url');
    const username = localStorage.getItem('topdesk-username');
    const appPassword = localStorage.getItem('topdesk-password');
    if (url && username && appPassword) return { url, username, appPassword };
  } catch {}
  return null;
}

export function DesktopTopDesk() {
  const [config, setConfig] = useState<TopDeskConfig | null>(getConfig);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [incidents, setIncidents] = useState<TopDeskIncident[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [closingDups, setClosingDups] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const parseIncident = (raw: any): TopDeskIncident => {
    const caller = raw.caller || {};
    const processingStatus = raw.processingStatus || {};
    const category = raw.category || {};
    const subcategory = raw.subcategory || {};
    const operator = raw.operator || raw.operatorGroup || {};
    return {
      id: raw.id || '',
      number: raw.number || raw.id || '',
      briefDescription: raw.briefDescription || raw.request || '',
      callerEmail: caller.email || caller.loginName || '',
      callerName: caller.dynamicName || caller.name || '',
      status: raw.status || '',
      processingStatus: processingStatus.name || raw.processingStatus || '',
      category: typeof category === 'string' ? category : (category.name || ''),
      subcategory: typeof subcategory === 'string' ? subcategory : (subcategory.name || ''),
      operator: typeof operator === 'string' ? operator : (operator.name || ''),
      createdDate: raw.creationDate || raw.callDate || '',
      action: raw.action || '',
    };
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    if (!config) {
      setError('TopDesk not configured. Go to Settings > Connections.');
      return;
    }

    setSearching(true);
    setError(null);
    setSelectedId(null);
    setPrimaryId(null);
    setIncidents([]);

    try {
      const session = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/topdesk/search-incidents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          query: query.trim(),
          topdeskUrl: config.url,
          username: config.username,
          appPassword: config.appPassword,
        }),
      });

      const result = await session.json();

      if (!session.ok || result.error) {
        throw new Error(result.error || `HTTP ${session.status}`);
      }

      const parsed = (result.incidents || []).map(parseIncident);
      setIncidents(parsed);

      if (parsed.length > 0) {
        const openTickets = parsed.filter(i =>
          i.status !== 'closed' &&
          i.status !== 'firstLineArchived' &&
          i.processingStatus?.toLowerCase() !== 'closed'
        );
        const candidates = openTickets.length > 0 ? openTickets : parsed;
        const sorted = [...candidates].sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime());
        if (sorted.length > 0) {
          setPrimaryId(sorted[0].id);
          setSelectedId(sorted[0].id);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleEnrich = async () => {
    if (!primaryId || !config) return;
    setEnriching(true);
    try {
      // In a real implementation, this would append ThamOS scan results to the ticket action
      const primary = incidents.find(i => i.id === primaryId);
      if (!primary) return;

      const enrichText = `\n\n[ThamOS Enrichment]\nInvestigated via ThamOS threat intel platform.\nUPN: ${query}\nTimestamp: ${new Date().toISOString()}`;

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/topdesk/update-incident`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          incidentId: primaryId,
          action: (primary.action || '') + enrichText,
          topdeskUrl: config.url,
          username: config.username,
          appPassword: config.appPassword,
        }),
      });

      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || 'Update failed');

      setToast({ type: 'success', message: `Ticket ${primary.number} enriched with ThamOS results` });
      // Refresh the incident data
      await handleSearch();
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Enrichment failed' });
    } finally {
      setEnriching(false);
    }
  };

  const handleCloseDuplicates = async () => {
    if (!primaryId || !config) return;
    setClosingDups(true);
    try {
      const primary = incidents.find(i => i.id === primaryId);
      if (!primary) return;
      const duplicates = incidents.filter(i => i.id !== primaryId && i.status !== 'closed');

      for (const dup of duplicates) {
        const closeText = `\n\n[Closed as duplicate]\nMerged into ${primary.number}. Cross-reference added by ThamOS.`;
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/topdesk/update-incident`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
          body: JSON.stringify({
            incidentId: dup.id,
            action: (dup.action || '') + closeText,
            status: 'Closed',
            topdeskUrl: config.url,
            username: config.username,
            appPassword: config.appPassword,
          }),
        });
      }

      setToast({ type: 'success', message: `${duplicates.length} duplicate ticket(s) closed and cross-referenced to ${primary.number}` });
      await handleSearch();
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Close failed' });
    } finally {
      setClosingDups(false);
    }
  };

  const handleCloseAsBenign = async () => {
    if (!selectedId || !config) return;
    const selected = incidents.find(i => i.id === selectedId);
    if (!selected) return;

    try {
      const closeText = `\n\n[Closed as Benign]\nInvestigation completed via ThamOS. No malicious activity detected. Analyst: ${config.username}.`;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/topdesk/update-incident`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          incidentId: selectedId,
          action: (selected.action || '') + closeText,
          status: 'Closed',
          topdeskUrl: config.url,
          username: config.username,
          appPassword: config.appPassword,
        }),
      });

      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || 'Close failed');

      setToast({ type: 'success', message: `Ticket ${selected.number} closed as benign` });
      await handleSearch();
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Close failed' });
    }
  };

  const handleEscalate = async () => {
    if (!selectedId || !config) return;
    const selected = incidents.find(i => i.id === selectedId);
    if (!selected) return;

    try {
      const escalateText = `\n\n[ESCALATED]\nEscalated to second line security team via ThamOS. Requires immediate review. Analyst: ${config.username}.`;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/topdesk/update-incident`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          incidentId: selectedId,
          action: (selected.action || '') + escalateText,
          status: 'Escalated',
          topdeskUrl: config.url,
          username: config.username,
          appPassword: config.appPassword,
        }),
      });

      const result = await res.json();
      if (!res.ok || result.error) throw new Error(result.error || 'Escalation failed');

      setToast({ type: 'success', message: `Ticket ${selected.number} escalated` });
      await handleSearch();
    } catch (err) {
      setToast({ type: 'error', message: err instanceof Error ? err.message : 'Escalation failed' });
    }
  };

  const selected = incidents.find(i => i.id === selectedId);
  const primary = incidents.find(i => i.id === primaryId);
  const duplicates = incidents.filter(i =>
    i.id !== primaryId &&
    i.status !== 'closed' &&
    i.status !== 'firstLineArchived'
  );
  const hasDuplicates = duplicates.length > 0;

  if (!config) {
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: P.void, fontFamily: 'JetBrains Mono, monospace' }}>
        <div className="text-center max-w-md">
          <Settings size={32} style={{ color: P.dim, opacity: 0.3 }} className="mx-auto mb-3" />
          <p className="text-sm font-medium mb-2" style={{ color: P.textLight }}>TopDesk Not Configured</p>
          <p className="text-xs mb-4" style={{ color: P.dim }}>
            Go to Settings &gt; Connections and add your TopDesk URL, username, and application password.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: P.void, fontFamily: 'JetBrains Mono, monospace' }}>
      {/* Header */}
      <div className="p-3 space-y-2" style={{ borderBottom: `1px solid ${P.border}`, backgroundColor: P.surface }}>
        <div className="flex items-center gap-2 mb-2">
          <Ticket size={14} style={{ color: P.blue }} />
          <span className="text-xs font-medium tracking-wider" style={{ color: P.blue }}>TOPDESK</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded ml-2" style={{ backgroundColor: `${P.green}15`, color: P.green, border: `1px solid ${P.green}30` }}>
            LIVE API
          </span>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded" style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}` }}>
            <Search size={13} style={{ color: P.dim }} />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search by UPN, ticket number, or keyword..."
              className="flex-1 text-xs bg-transparent border-none outline-none"
              style={{ color: P.textLight, fontFamily: 'JetBrains Mono, monospace' }}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            className="px-4 py-2 text-xs font-medium rounded transition-all flex items-center gap-1.5"
            style={{
              backgroundColor: query.trim() ? `${P.blue}15` : P.surfaceLight,
              border: `1px solid ${query.trim() ? `${P.blue}40` : P.border}`,
              color: query.trim() ? P.blue : P.dim,
            }}
          >
            {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            SEARCH
          </button>
        </div>

        {error && (
          <div className="p-2 rounded text-xs flex items-center gap-2" style={{ backgroundColor: `${P.pink}10`, border: `1px solid ${P.pink}30`, color: P.pink }}>
            <AlertCircle size={12} />
            {error}
          </div>
        )}

        {incidents.length > 0 && (
          <div className="flex items-center gap-3 text-xs" style={{ color: P.dim }}>
            <span>{incidents.length} ticket{incidents.length !== 1 ? 's' : ''} found</span>
            {hasDuplicates && (
              <span className="flex items-center gap-1" style={{ color: P.amber }}>
                <AlertCircle size={11} />
                {duplicates.length} duplicate{duplicates.length !== 1 ? 's' : ''} detected
              </span>
            )}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Incident list */}
        <div className="w-[340px] flex flex-col flex-shrink-0" style={{ borderRight: `1px solid ${P.border}` }}>
          <div className="p-2 text-xs font-medium tracking-wider" style={{ color: P.dim, borderBottom: `1px solid ${P.border}` }}>
            INCIDENTS
          </div>
          <div className="flex-1 overflow-y-auto">
            {incidents.length === 0 && !searching ? (
              <div className="p-6 text-center">
                <Ticket size={24} style={{ color: P.dim, opacity: 0.3 }} className="mx-auto mb-2" />
                <span className="text-xs" style={{ color: P.dim }}>Search for a UPN to find tickets</span>
              </div>
            ) : searching ? (
              <div className="p-6 text-center">
                <Loader2 size={20} style={{ color: P.dim }} className="mx-auto mb-2 animate-spin" />
                <span className="text-xs" style={{ color: P.dim }}>Querying TopDesk...</span>
              </div>
            ) : (
              incidents.map(inc => {
                const isPrimary = inc.id === primaryId;
                const isSelected = inc.id === selectedId;
                const isDup = inc.id !== primaryId && inc.status !== 'closed' && inc.status !== 'firstLineArchived';
                const statusColor = STATUS_COLORS[inc.status] || P.dim;
                const statusLabel = STATUS_LABELS[inc.status] || inc.status?.toUpperCase() || 'UNKNOWN';

                return (
                  <button
                    key={inc.id}
                    onClick={() => setSelectedId(inc.id)}
                    className="w-full p-3 text-left transition-all"
                    style={{
                      borderBottom: `1px solid ${P.border}`,
                      backgroundColor: isSelected ? `${P.blue}08` : isDup ? `${P.amber}04` : 'transparent',
                      borderLeft: isSelected ? `2px solid ${P.blue}` : isDup ? `2px solid ${P.amber}` : '2px solid transparent',
                      opacity: inc.status === 'closed' || inc.status === 'firstLineArchived' ? 0.5 : 1,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium" style={{ color: isPrimary ? P.green : P.textLight }}>
                        {inc.number}
                        {isPrimary && <span className="ml-1.5 text-[10px] px-1 rounded" style={{ backgroundColor: `${P.green}15`, color: P.green, border: `1px solid ${P.green}30` }}>PRIMARY</span>}
                        {isDup && <span className="ml-1.5 text-[10px] px-1 rounded" style={{ backgroundColor: `${P.amber}15`, color: P.amber, border: `1px solid ${P.amber}30` }}>DUP</span>}
                      </span>
                      <span className="text-[10px]" style={{ color: P.dim }}>
                        {inc.createdDate ? new Date(inc.createdDate).toLocaleDateString() : ''}
                      </span>
                    </div>
                    <p className="text-xs truncate" style={{ color: P.text }}>{inc.briefDescription}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}30` }}>
                        {statusLabel}
                      </span>
                      {inc.category && <span className="text-[10px]" style={{ color: P.dim }}>{inc.category}</span>}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Detail view */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {selected ? (
            <>
              {/* Detail header */}
              <div className="p-4" style={{ borderBottom: `1px solid ${P.border}`, backgroundColor: P.surface }}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-sm font-medium" style={{ color: P.textLight }}>{selected.number}</h2>
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: `${STATUS_COLORS[selected.status] || P.dim}15`, color: STATUS_COLORS[selected.status] || P.dim, border: `1px solid ${STATUS_COLORS[selected.status] || P.dim}30` }}>
                        {STATUS_LABELS[selected.status] || selected.status?.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: P.text }}>{selected.briefDescription}</p>
                  </div>
                  {selected.id === primaryId && hasDuplicates && (
                    <div className="flex gap-2">
                      <button
                        onClick={handleEnrich}
                        disabled={enriching}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-all"
                        style={{ backgroundColor: `${P.cyan}15`, border: `1px solid ${P.cyan}40`, color: P.cyan }}
                      >
                        {enriching ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                        ENRICH
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs flex-wrap" style={{ color: P.dim }}>
                  {selected.callerName && <span>{selected.callerName}</span>}
                  {selected.callerEmail && <><span>•</span><span>{selected.callerEmail}</span></>}
                  {selected.operator && <><span>•</span><span>Op: {selected.operator}</span></>}
                  {selected.category && <><span>•</span><span>{selected.category}</span></>}
                </div>
              </div>

              {/* Action notes */}
              <div className="p-4 space-y-4">
                {selected.action && (
                  <div>
                    <span className="text-xs tracking-wider mb-2 block" style={{ color: P.dim }}>ACTION NOTES</span>
                    <div className="rounded p-3" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                      <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: P.text }}>{selected.action}</p>
                    </div>
                  </div>
                )}

                {/* Deduplication panel */}
                {selected.id === primaryId && hasDuplicates && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs tracking-wider" style={{ color: P.amber }}>DUPLICATE TICKETS ({duplicates.length})</span>
                      <button
                        onClick={handleCloseDuplicates}
                        disabled={closingDups}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-all"
                        style={{ backgroundColor: `${P.green}15`, border: `1px solid ${P.green}40`, color: P.green }}
                      >
                        {closingDups ? <Loader2 size={11} className="animate-spin" /> : <Merge size={11} />}
                        CLOSE DUPLICATES
                      </button>
                    </div>
                    <div className="space-y-2">
                      {duplicates.map(dup => (
                        <div key={dup.id} className="rounded p-3" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium" style={{ color: P.textLight }}>{dup.number}</span>
                            <span className="text-[10px]" style={{ color: P.dim }}>{dup.createdDate ? new Date(dup.createdDate).toLocaleDateString() : ''}</span>
                          </div>
                          <p className="text-xs mb-2" style={{ color: P.text }}>{dup.briefDescription}</p>
                          {dup.action && <p className="text-[11px]" style={{ color: P.dim }}>{dup.action}</p>}
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 p-2 rounded text-[11px]" style={{ backgroundColor: `${P.amber}06`, border: `1px solid ${P.amber}20`, color: P.amber }}>
                      <AlertCircle size={11} className="inline mr-1" />
                      Closing duplicates will add a cross-reference note to each ticket pointing to {primary?.number}.
                    </div>
                  </div>
                )}

                {/* Quick actions */}
                <div className="flex gap-2 pt-2 flex-wrap">
                  <button
                    onClick={handleCloseAsBenign}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded transition-all"
                    style={{ backgroundColor: `${P.green}15`, border: `1px solid ${P.green}40`, color: P.green }}
                  >
                    <CheckCircle size={11} />
                    CLOSE AS BENIGN
                  </button>
                  <button
                    onClick={handleEscalate}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded transition-all"
                    style={{ backgroundColor: `${P.rose}15`, border: `1px solid ${P.rose}40`, color: P.rose }}
                  >
                    <XCircle size={11} />
                    ESCALATE
                  </button>
                  {config?.url && (
                    <a
                      href={`${config.url}/tas/secure/incident?lookup=${selected.number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded transition-all"
                      style={{ backgroundColor: `${P.blue}15`, border: `1px solid ${P.blue}40`, color: P.blue }}
                    >
                      <ExternalLink size={11} />
                      OPEN IN TOPDESK
                    </a>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Ticket size={32} style={{ color: P.dim, opacity: 0.2 }} className="mx-auto mb-3" />
                <span className="text-xs" style={{ color: P.dim }}>Select a ticket to view details</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded text-xs font-medium flex items-center gap-2 z-50"
          style={{
            backgroundColor: toast.type === 'success' ? `${P.green}15` : `${P.pink}15`,
            border: `1px solid ${toast.type === 'success' ? `${P.green}40` : `${P.pink}40`}`,
            color: toast.type === 'success' ? P.green : P.pink,
          }}
        >
          {toast.type === 'success' ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
