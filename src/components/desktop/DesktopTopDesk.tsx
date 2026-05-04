import { useState, useEffect } from 'react';
import { Search, Ticket, AlertCircle, CheckCircle, XCircle, Merge, Sparkles, Loader2 } from 'lucide-react';

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

interface TopDeskIncident {
  id: string;
  number: string;
  briefDescription: string;
  callerEmail: string;
  callerName: string;
  status: 'firstLine' | 'secondLine' | 'closed';
  processingStatus: string;
  category: string;
  subcategory: string;
  operator: string;
  createdDate: string;
  action: string;
  isDuplicate?: boolean;
}

const MOCK_INCIDENTS: TopDeskIncident[] = [
  {
    id: 'inc-1',
    number: 'I2605-115',
    briefDescription: 'Suspicious sign-in from Russia detected by Sentinel',
    callerEmail: 'jsmith@schoolboard.edu',
    callerName: 'John Smith',
    status: 'firstLine',
    processingStatus: 'Logged',
    category: 'Security',
    subcategory: 'Account Compromise',
    operator: 'Security Team',
    createdDate: '2026-05-02T09:15:00Z',
    action: 'Initial report from Sentinel automation. User flagged for risky sign-in.',
  },
  {
    id: 'inc-2',
    number: 'I2605-098',
    briefDescription: 'Password reset request — user claims account compromised',
    callerEmail: 'jsmith@schoolboard.edu',
    callerName: 'John Smith',
    status: 'firstLine',
    processingStatus: 'Logged',
    category: 'Security',
    subcategory: 'Password Reset',
    operator: 'Help Desk',
    createdDate: '2026-04-28T14:22:00Z',
    action: 'User reported suspicious emails and requested password change.',
    isDuplicate: true,
  },
  {
    id: 'inc-3',
    number: 'I2605-076',
    briefDescription: 'MFA failure — multiple failed attempts from unknown device',
    callerEmail: 'jsmith@schoolboard.edu',
    callerName: 'John Smith',
    status: 'firstLine',
    processingStatus: 'Logged',
    category: 'Security',
    subcategory: 'MFA Issue',
    operator: 'Help Desk',
    createdDate: '2026-04-25T11:05:00Z',
    action: '3 failed MFA attempts from IP 203.0.113.42. User was in Toronto at the time.',
    isDuplicate: true,
  },
  {
    id: 'inc-4',
    number: 'I2605-012',
    briefDescription: 'Account lockout after multiple failed sign-ins',
    callerEmail: 'jsmith@schoolboard.edu',
    callerName: 'John Smith',
    status: 'firstLine',
    processingStatus: 'Logged',
    category: 'Security',
    subcategory: 'Account Lockout',
    operator: 'Help Desk',
    createdDate: '2026-04-10T08:30:00Z',
    action: 'Account locked after 10 failed password attempts. Unlocked by help desk.',
    isDuplicate: true,
  },
  {
    id: 'inc-5',
    number: 'I2605-042',
    briefDescription: 'Phishing email reported by user',
    callerEmail: 'jdoe@schoolboard.edu',
    callerName: 'Jane Doe',
    status: 'secondLine',
    processingStatus: 'In Progress',
    category: 'Security',
    subcategory: 'Phishing',
    operator: 'Security Team',
    createdDate: '2026-04-15T10:00:00Z',
    action: 'User reported suspicious email with PDF attachment. Under review.',
  },
];

const STATUS_COLORS: Record<string, string> = {
  firstLine: P.amber,
  secondLine: P.blue,
  closed: P.dim,
};

const STATUS_LABELS: Record<string, string> = {
  firstLine: 'FIRST LINE',
  secondLine: 'SECOND LINE',
  closed: 'CLOSED',
};

export function DesktopTopDesk() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [incidents, setIncidents] = useState<TopDeskIncident[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [showDups, setShowDups] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [closingDups, setClosingDups] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const handleSearch = () => {
    if (!query.trim()) return;
    setSearching(true);
    setSelectedId(null);
    setPrimaryId(null);
    // Simulate API call
    setTimeout(() => {
      const results = MOCK_INCIDENTS.filter(i =>
        i.callerEmail.toLowerCase().includes(query.toLowerCase()) ||
        i.number.toLowerCase().includes(query.toLowerCase()) ||
        i.briefDescription.toLowerCase().includes(query.toLowerCase())
      );
      setIncidents(results);
      if (results.length > 0) {
        // Auto-select newest as primary
        const sorted = [...results].sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime());
        const openTickets = sorted.filter(i => i.status !== 'closed');
        if (openTickets.length > 0) {
          setPrimaryId(openTickets[0].id);
          setSelectedId(openTickets[0].id);
        }
      }
      setSearching(false);
    }, 600);
  };

  const handleEnrich = () => {
    if (!primaryId) return;
    setEnriching(true);
    setTimeout(() => {
      setEnriching(false);
      setToast({ type: 'success', message: 'Ticket enriched with ThamOS scan results' });
    }, 1200);
  };

  const handleCloseDuplicates = () => {
    if (!primaryId) return;
    setClosingDups(true);
    setTimeout(() => {
      setClosingDups(false);
      setIncidents(prev => prev.map(i => i.id === primaryId ? i : { ...i, status: 'closed' as const, processingStatus: 'Closed' }));
      setToast({ type: 'success', message: '3 duplicate tickets closed and cross-referenced' });
    }, 1200);
  };

  const selected = incidents.find(i => i.id === selectedId);
  const primary = incidents.find(i => i.id === primaryId);
  const duplicates = incidents.filter(i => i.id !== primaryId && i.status !== 'closed');
  const hasDuplicates = duplicates.length > 0;

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: P.void, fontFamily: 'JetBrains Mono, monospace' }}>
      {/* Header */}
      <div className="p-3 space-y-2" style={{ borderBottom: `1px solid ${P.border}`, backgroundColor: P.surface }}>
        <div className="flex items-center gap-2 mb-2">
          <Ticket size={14} style={{ color: P.blue }} />
          <span className="text-xs font-medium tracking-wider" style={{ color: P.blue }}>TOPDESK INTEGRATION</span>
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
            className="px-4 py-2 text-xs font-medium rounded transition-all"
            style={{
              backgroundColor: query.trim() ? `${P.blue}15` : P.surfaceLight,
              border: `1px solid ${query.trim() ? `${P.blue}40` : P.border}`,
              color: query.trim() ? P.blue : P.dim,
            }}
          >
            {searching ? <Loader2 size={13} className="animate-spin" /> : 'SEARCH'}
          </button>
        </div>
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
            ) : (
              incidents.map(inc => {
                const isPrimary = inc.id === primaryId;
                const isSelected = inc.id === selectedId;
                const isDup = inc.isDuplicate && inc.id !== primaryId && inc.status !== 'closed';
                return (
                  <button
                    key={inc.id}
                    onClick={() => setSelectedId(inc.id)}
                    className="w-full p-3 text-left transition-all"
                    style={{
                      borderBottom: `1px solid ${P.border}`,
                      backgroundColor: isSelected ? `${P.blue}08` : isDup ? `${P.amber}04` : 'transparent',
                      borderLeft: isSelected ? `2px solid ${P.blue}` : isDup ? `2px solid ${P.amber}` : '2px solid transparent',
                      opacity: inc.status === 'closed' ? 0.5 : 1,
                    }}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium" style={{ color: isPrimary ? P.green : P.textLight }}>
                        {inc.number}
                        {isPrimary && <span className="ml-1.5 text-[10px] px-1 rounded" style={{ backgroundColor: `${P.green}15`, color: P.green, border: `1px solid ${P.green}30` }}>PRIMARY</span>}
                        {isDup && <span className="ml-1.5 text-[10px] px-1 rounded" style={{ backgroundColor: `${P.amber}15`, color: P.amber, border: `1px solid ${P.amber}30` }}>DUP</span>}
                        {inc.status === 'closed' && <span className="ml-1.5 text-[10px] px-1 rounded" style={{ backgroundColor: `${P.dim}15`, color: P.dim, border: `1px solid ${P.dim}30` }}>CLOSED</span>}
                      </span>
                      <span className="text-[10px]" style={{ color: P.dim }}>
                        {new Date(inc.createdDate).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs truncate" style={{ color: P.text }}>{inc.briefDescription}</p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${STATUS_COLORS[inc.status]}15`, color: STATUS_COLORS[inc.status], border: `1px solid ${STATUS_COLORS[inc.status]}30` }}>
                        {STATUS_LABELS[inc.status]}
                      </span>
                      <span className="text-[10px]" style={{ color: P.dim }}>{inc.category}</span>
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
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: `${STATUS_COLORS[selected.status]}15`, color: STATUS_COLORS[selected.status], border: `1px solid ${STATUS_COLORS[selected.status]}30` }}>
                        {STATUS_LABELS[selected.status]}
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
                <div className="flex items-center gap-3 text-xs" style={{ color: P.dim }}>
                  <span>{selected.callerName}</span>
                  <span>•</span>
                  <span>{selected.callerEmail}</span>
                  <span>•</span>
                  <span>Operator: {selected.operator}</span>
                </div>
              </div>

              {/* Action notes */}
              <div className="p-4 space-y-4">
                <div>
                  <span className="text-xs tracking-wider mb-2 block" style={{ color: P.dim }}>ACTION NOTES</span>
                  <div className="rounded p-3" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                    <p className="text-xs leading-relaxed" style={{ color: P.text }}>{selected.action}</p>
                  </div>
                </div>

                {/* Deduplication panel */}
                {selected.id === primaryId && hasDuplicates && showDups && (
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
                        CLOSE DUPLICATES & MERGE
                      </button>
                    </div>
                    <div className="space-y-2">
                      {duplicates.map(dup => (
                        <div key={dup.id} className="rounded p-3" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium" style={{ color: P.textLight }}>{dup.number}</span>
                            <span className="text-[10px]" style={{ color: P.dim }}>{new Date(dup.createdDate).toLocaleDateString()}</span>
                          </div>
                          <p className="text-xs mb-2" style={{ color: P.text }}>{dup.briefDescription}</p>
                          <p className="text-[11px]" style={{ color: P.dim }}>{dup.action}</p>
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
                <div className="flex gap-2 pt-2">
                  <button
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded transition-all"
                    style={{ backgroundColor: `${P.green}15`, border: `1px solid ${P.green}40`, color: P.green }}
                  >
                    <CheckCircle size={11} />
                    CLOSE AS BENIGN
                  </button>
                  <button
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded transition-all"
                    style={{ backgroundColor: `${P.rose}15`, border: `1px solid ${P.rose}40`, color: P.rose }}
                  >
                    <XCircle size={11} />
                    ESCALATE
                  </button>
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
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded text-xs font-medium flex items-center gap-2"
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
