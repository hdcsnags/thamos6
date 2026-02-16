import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

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
  orange: '#ff6b35',
  blue: '#00b4d8',
};

interface CaseNote {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  iocs: { type: string; value: string }[];
  notes: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  open: P.blue,
  investigating: P.amber,
  resolved: P.green,
  closed: P.dim,
};

const PRIORITY_COLORS: Record<string, string> = {
  low: P.dim,
  medium: P.blue,
  high: P.orange,
  critical: P.pink,
};

export function DesktopCaseManager() {
  const [cases, setCases] = useState<CaseNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCase, setSelectedCase] = useState<CaseNote | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', status: 'open' as const, priority: 'medium' as const,
    notes: '', tags: '', iocs: '',
  });

  useEffect(() => { fetchCases(); }, []);

  const fetchCases = async () => {
    setLoading(true);
    const { data } = await supabase.from('case_notes').select('*').order('created_at', { ascending: false });
    setCases(data || []);
    setLoading(false);
  };

  const resetForm = () => {
    setForm({ title: '', description: '', status: 'open', priority: 'medium', notes: '', tags: '', iocs: '' });
    setShowForm(false);
    setEditing(false);
    setSelectedCase(null);
  };

  const parseIOCs = (text: string) => {
    return text.split('\n').filter(l => l.trim()).map(line => {
      const parts = line.split(':');
      return parts.length >= 2
        ? { type: parts[0].trim(), value: parts.slice(1).join(':').trim() }
        : { type: 'unknown', value: line.trim() };
    });
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    const payload = {
      title: form.title,
      description: form.description,
      status: form.status,
      priority: form.priority,
      notes: form.notes,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      iocs: parseIOCs(form.iocs),
    };

    if (editing && selectedCase) {
      await supabase.from('case_notes').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', selectedCase.id);
    } else {
      await supabase.from('case_notes').insert([payload]);
    }
    resetForm();
    fetchCases();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('case_notes').delete().eq('id', id);
    if (selectedCase?.id === id) setSelectedCase(null);
    fetchCases();
  };

  const openEdit = (c: CaseNote) => {
    setForm({
      title: c.title,
      description: c.description,
      status: c.status,
      priority: c.priority,
      notes: c.notes,
      tags: c.tags?.join(', ') || '',
      iocs: c.iocs?.map(i => `${i.type}: ${i.value}`).join('\n') || '',
    });
    setSelectedCase(c);
    setEditing(true);
    setShowForm(true);
  };

  const filtered = cases.filter(c => {
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase()) || c.tags?.some(t => t.toLowerCase().includes(search.toLowerCase()));
    const matchStatus = filterStatus === 'all' || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  if (showForm) {
    return (
      <div className="h-full overflow-y-auto p-4" style={{ backgroundColor: P.void, fontFamily: 'JetBrains Mono, monospace' }}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-medium tracking-wider" style={{ color: P.cyan }}>
            {editing ? 'EDIT CASE' : 'NEW CASE'}
          </span>
          <button onClick={resetForm} className="text-xs px-2 py-1 rounded" style={{ color: P.dim, border: `1px solid ${P.border}` }}>
            CANCEL
          </button>
        </div>

        <div className="space-y-3">
          <Field label="TITLE" value={form.title} onChange={v => setForm({ ...form, title: v })} />
          <Field label="DESCRIPTION" value={form.description} onChange={v => setForm({ ...form, description: v })} multiline />
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="STATUS" value={form.status} options={['open', 'investigating', 'resolved', 'closed']} onChange={v => setForm({ ...form, status: v as CaseNote['status'] })} />
            <SelectField label="PRIORITY" value={form.priority} options={['low', 'medium', 'high', 'critical']} onChange={v => setForm({ ...form, priority: v as CaseNote['priority'] })} />
          </div>
          <Field label="IOCs (type: value, one per line)" value={form.iocs} onChange={v => setForm({ ...form, iocs: v })} multiline />
          <Field label="NOTES" value={form.notes} onChange={v => setForm({ ...form, notes: v })} multiline rows={5} />
          <Field label="TAGS (comma separated)" value={form.tags} onChange={v => setForm({ ...form, tags: v })} />

          <button
            onClick={handleSave}
            disabled={!form.title.trim()}
            className="w-full py-2 text-xs font-medium rounded transition-all"
            style={{
              backgroundColor: form.title.trim() ? `${P.green}15` : P.surfaceLight,
              border: `1px solid ${form.title.trim() ? `${P.green}40` : P.border}`,
              color: form.title.trim() ? P.green : P.dim,
            }}
          >
            {editing ? 'UPDATE CASE' : 'CREATE CASE'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex" style={{ backgroundColor: P.void, fontFamily: 'JetBrains Mono, monospace' }}>
      <div className="w-[300px] flex flex-col flex-shrink-0" style={{ borderRight: `1px solid ${P.border}` }}>
        <div className="p-3 space-y-2" style={{ borderBottom: `1px solid ${P.border}`, backgroundColor: P.surface }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium tracking-wider" style={{ color: P.green }}>CASES</span>
            <button
              onClick={() => setShowForm(true)}
              className="text-xs px-2 py-1 rounded transition-all"
              style={{ backgroundColor: `${P.green}15`, border: `1px solid ${P.green}30`, color: P.green }}
            >
              + NEW
            </button>
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search cases..."
            className="w-full px-3 py-1.5 text-xs rounded focus:outline-none"
            style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}`, color: P.textLight, fontFamily: 'JetBrains Mono, monospace' }}
          />
          <div className="flex gap-1 flex-wrap">
            {['all', 'open', 'investigating', 'resolved', 'closed'].map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className="px-2 py-0.5 text-xs rounded transition-all"
                style={{
                  backgroundColor: filterStatus === s ? `${STATUS_COLORS[s] || P.cyan}15` : 'transparent',
                  border: `1px solid ${filterStatus === s ? `${STATUS_COLORS[s] || P.cyan}40` : P.border}`,
                  color: filterStatus === s ? (STATUS_COLORS[s] || P.cyan) : P.dim,
                }}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center">
              <span className="text-xs animate-pulse" style={{ color: P.dim }}>Loading...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center">
              <span className="text-xs" style={{ color: P.dim }}>No cases found</span>
            </div>
          ) : (
            filtered.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedCase(c)}
                className="w-full p-3 text-left transition-all"
                style={{
                  borderBottom: `1px solid ${P.border}`,
                  backgroundColor: selectedCase?.id === c.id ? `${P.green}08` : 'transparent',
                  borderLeft: selectedCase?.id === c.id ? `2px solid ${P.green}` : '2px solid transparent',
                }}
              >
                <p className="text-xs font-medium truncate" style={{ color: P.textLight }}>{c.title}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: `${STATUS_COLORS[c.status]}15`, color: STATUS_COLORS[c.status], border: `1px solid ${STATUS_COLORS[c.status]}30` }}>
                    {c.status}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: `${PRIORITY_COLORS[c.priority]}15`, color: PRIORITY_COLORS[c.priority] }}>
                    {c.priority}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {selectedCase ? (
          <>
            <div className="p-4" style={{ borderBottom: `1px solid ${P.border}`, backgroundColor: P.surface }}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-medium" style={{ color: P.textLight }}>{selectedCase.title}</h2>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(selectedCase)} className="text-xs px-2 py-1 rounded" style={{ color: P.cyan, border: `1px solid ${P.border}` }}>EDIT</button>
                  <button onClick={() => handleDelete(selectedCase.id)} className="text-xs px-2 py-1 rounded" style={{ color: P.pink, border: `1px solid ${P.border}` }}>DELETE</button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: `${STATUS_COLORS[selectedCase.status]}15`, color: STATUS_COLORS[selectedCase.status], border: `1px solid ${STATUS_COLORS[selectedCase.status]}30` }}>
                  {selectedCase.status}
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: `${PRIORITY_COLORS[selectedCase.priority]}15`, color: PRIORITY_COLORS[selectedCase.priority] }}>
                  {selectedCase.priority}
                </span>
                <span className="text-xs" style={{ color: P.dim }}>
                  {new Date(selectedCase.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selectedCase.description && (
                <div>
                  <span className="text-xs tracking-wider mb-1 block" style={{ color: P.dim }}>DESCRIPTION</span>
                  <p className="text-xs leading-relaxed" style={{ color: P.text }}>{selectedCase.description}</p>
                </div>
              )}

              {selectedCase.iocs && selectedCase.iocs.length > 0 && (
                <div>
                  <span className="text-xs tracking-wider mb-2 block" style={{ color: P.dim }}>IOCs ({selectedCase.iocs.length})</span>
                  <div className="rounded p-3 space-y-1" style={{ backgroundColor: P.surface, border: `1px solid ${P.border}` }}>
                    {selectedCase.iocs.map((ioc, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs font-medium" style={{ color: P.cyan }}>{ioc.type}:</span>
                        <code className="text-xs" style={{ color: P.textLight }}>{ioc.value}</code>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedCase.notes && (
                <div>
                  <span className="text-xs tracking-wider mb-1 block" style={{ color: P.dim }}>NOTES</span>
                  <pre className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: P.text, fontFamily: 'JetBrains Mono, monospace' }}>{selectedCase.notes}</pre>
                </div>
              )}

              {selectedCase.tags && selectedCase.tags.length > 0 && (
                <div>
                  <span className="text-xs tracking-wider mb-2 block" style={{ color: P.dim }}>TAGS</span>
                  <div className="flex flex-wrap gap-1">
                    {selectedCase.tags.map((tag, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: P.surfaceLight, color: P.text, border: `1px solid ${P.border}` }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-3xl mb-3 opacity-20">&#9670;</div>
              <span className="text-xs" style={{ color: P.dim }}>Select a case to view details</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, multiline, rows }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean; rows?: number }) {
  const style = {
    backgroundColor: P.surfaceLight,
    border: `1px solid ${P.border}`,
    color: P.textLight,
    fontFamily: 'JetBrains Mono, monospace',
  };

  return (
    <div>
      <label className="block text-xs mb-1 tracking-wider" style={{ color: P.dim }}>{label}</label>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows || 3} className="w-full px-3 py-2 text-xs rounded focus:outline-none resize-none" style={style} />
      ) : (
        <input type="text" value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2 text-xs rounded focus:outline-none" style={style} />
      )}
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs mb-1 tracking-wider" style={{ color: P.dim }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 text-xs rounded focus:outline-none"
        style={{ backgroundColor: P.surfaceLight, border: `1px solid ${P.border}`, color: P.textLight, fontFamily: 'JetBrains Mono, monospace' }}
      >
        {options.map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
      </select>
    </div>
  );
}
