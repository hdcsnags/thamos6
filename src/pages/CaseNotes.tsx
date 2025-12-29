import { useState, useEffect } from 'react';
import { FileText, Plus, Search, Trash2, Edit3, Save, X, AlertTriangle, Clock, Tag, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

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

const statusColors = {
  open: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  investigating: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  resolved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  closed: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

const priorityColors = {
  low: 'bg-slate-500/20 text-slate-400',
  medium: 'bg-blue-500/20 text-blue-400',
  high: 'bg-orange-500/20 text-orange-400',
  critical: 'bg-red-500/20 text-red-400',
};

export default function CaseNotes() {
  const [cases, setCases] = useState<CaseNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCase, setSelectedCase] = useState<CaseNote | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [expandedCase, setExpandedCase] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'open' as const,
    priority: 'medium' as const,
    notes: '',
    tags: '',
    iocs: '',
  });

  useEffect(() => {
    fetchCases();
  }, []);

  const fetchCases = async () => {
    try {
      const { data, error } = await supabase
        .from('case_notes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCases(data || []);
    } catch (err) {
      console.error('Error fetching cases:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.title.trim()) return;

    try {
      const newCase = {
        title: formData.title,
        description: formData.description,
        status: formData.status,
        priority: formData.priority,
        notes: formData.notes,
        tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
        iocs: parseIOCs(formData.iocs),
      };

      const { error } = await supabase
        .from('case_notes')
        .insert([newCase]);

      if (error) throw error;

      setShowNewForm(false);
      resetForm();
      fetchCases();
    } catch (err) {
      console.error('Error creating case:', err);
    }
  };

  const handleUpdate = async () => {
    if (!selectedCase) return;

    try {
      const updates = {
        title: formData.title,
        description: formData.description,
        status: formData.status,
        priority: formData.priority,
        notes: formData.notes,
        tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean),
        iocs: parseIOCs(formData.iocs),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('case_notes')
        .update(updates)
        .eq('id', selectedCase.id);

      if (error) throw error;

      setIsEditing(false);
      setSelectedCase(null);
      fetchCases();
    } catch (err) {
      console.error('Error updating case:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this case?')) return;

    try {
      const { error } = await supabase
        .from('case_notes')
        .delete()
        .eq('id', id);

      if (error) throw error;

      if (selectedCase?.id === id) {
        setSelectedCase(null);
      }
      fetchCases();
    } catch (err) {
      console.error('Error deleting case:', err);
    }
  };

  const parseIOCs = (text: string): { type: string; value: string }[] => {
    const lines = text.split('\n').filter(l => l.trim());
    return lines.map(line => {
      const parts = line.split(':');
      if (parts.length >= 2) {
        return { type: parts[0].trim(), value: parts.slice(1).join(':').trim() };
      }
      return { type: 'unknown', value: line.trim() };
    });
  };

  const formatIOCs = (iocs: { type: string; value: string }[]): string => {
    return iocs.map(ioc => `${ioc.type}: ${ioc.value}`).join('\n');
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      status: 'open',
      priority: 'medium',
      notes: '',
      tags: '',
      iocs: '',
    });
  };

  const openEditForm = (caseItem: CaseNote) => {
    setSelectedCase(caseItem);
    setFormData({
      title: caseItem.title,
      description: caseItem.description,
      status: caseItem.status,
      priority: caseItem.priority,
      notes: caseItem.notes,
      tags: caseItem.tags.join(', '),
      iocs: formatIOCs(caseItem.iocs || []),
    });
    setIsEditing(true);
  };

  const filteredCases = cases.filter(c => {
    const matchesSearch = c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const CaseForm = ({ isNew }: { isNew: boolean }) => (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">
          {isNew ? 'New Case' : 'Edit Case'}
        </h3>
        <button
          onClick={() => {
            if (isNew) {
              setShowNewForm(false);
            } else {
              setIsEditing(false);
              setSelectedCase(null);
            }
            resetForm();
          }}
          className="p-2 text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Title</label>
          <input
            type="text"
            value={formData.title}
            onChange={e => setFormData({ ...formData, title: e.target.value })}
            placeholder="Case title..."
            className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
          <textarea
            value={formData.description}
            onChange={e => setFormData({ ...formData, description: e.target.value })}
            placeholder="Brief description of the incident..."
            rows={2}
            className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Status</label>
            <select
              value={formData.status}
              onChange={e => setFormData({ ...formData, status: e.target.value as CaseNote['status'] })}
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="open">Open</option>
              <option value="investigating">Investigating</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Priority</label>
            <select
              value={formData.priority}
              onChange={e => setFormData({ ...formData, priority: e.target.value as CaseNote['priority'] })}
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">IOCs (one per line, format: type: value)</label>
          <textarea
            value={formData.iocs}
            onChange={e => setFormData({ ...formData, iocs: e.target.value })}
            placeholder="IP: 192.168.1.1&#10;URL: https://malware.com&#10;Hash: abc123..."
            rows={3}
            className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Notes</label>
          <textarea
            value={formData.notes}
            onChange={e => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Investigation notes, findings, actions taken..."
            rows={4}
            className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Tags (comma separated)</label>
          <input
            type="text"
            value={formData.tags}
            onChange={e => setFormData({ ...formData, tags: e.target.value })}
            placeholder="phishing, malware, urgent..."
            className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={() => {
              if (isNew) {
                setShowNewForm(false);
              } else {
                setIsEditing(false);
                setSelectedCase(null);
              }
              resetForm();
            }}
            className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={isNew ? handleCreate : handleUpdate}
            disabled={!formData.title.trim()}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <Save className="w-4 h-4" />
            {isNew ? 'Create Case' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-4">
          <FileText className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Case Notes</h1>
        <p className="text-slate-400">
          Track and document security investigations. Save IOCs, notes, and maintain
          a timeline of your incident response activities.
        </p>
      </div>

      {(showNewForm || isEditing) ? (
        <div className="max-w-3xl mx-auto">
          <CaseForm isNew={showNewForm} />
        </div>
      ) : (
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search cases..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="investigating">Investigating</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            <button
              onClick={() => setShowNewForm(true)}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all"
            >
              <Plus className="w-4 h-4" />
              New Case
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full mx-auto"></div>
              <p className="text-slate-400 mt-4">Loading cases...</p>
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="text-center py-12 bg-slate-900 rounded-xl border border-slate-800">
              <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">
                {searchQuery || filterStatus !== 'all' ? 'No cases match your filters' : 'No cases yet. Create one to get started.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCases.map(caseItem => (
                <div
                  key={caseItem.id}
                  className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden"
                >
                  <div
                    onClick={() => setExpandedCase(expandedCase === caseItem.id ? null : caseItem.id)}
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      {expandedCase === caseItem.id ? (
                        <ChevronDown className="w-5 h-5 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-slate-400" />
                      )}
                      <div>
                        <h3 className="font-semibold text-white">{caseItem.title}</h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium border ${statusColors[caseItem.status]}`}>
                            {caseItem.status}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${priorityColors[caseItem.priority]}`}>
                            {caseItem.priority}
                          </span>
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(caseItem.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          openEditForm(caseItem);
                        }}
                        className="p-2 text-slate-400 hover:text-white transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleDelete(caseItem.id);
                        }}
                        className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {expandedCase === caseItem.id && (
                    <div className="px-4 pb-4 pt-0 border-t border-slate-800">
                      {caseItem.description && (
                        <div className="mt-4">
                          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Description</p>
                          <p className="text-slate-300 text-sm">{caseItem.description}</p>
                        </div>
                      )}

                      {caseItem.iocs && caseItem.iocs.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">IOCs ({caseItem.iocs.length})</p>
                          <div className="bg-slate-800/50 rounded-lg p-3 max-h-32 overflow-auto">
                            {caseItem.iocs.map((ioc, i) => (
                              <div key={i} className="flex items-center gap-2 text-sm py-1">
                                <span className="text-cyan-400 font-medium">{ioc.type}:</span>
                                <code className="text-slate-300 font-mono">{ioc.value}</code>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {caseItem.notes && (
                        <div className="mt-4">
                          <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Notes</p>
                          <p className="text-slate-300 text-sm whitespace-pre-wrap">{caseItem.notes}</p>
                        </div>
                      )}

                      {caseItem.tags && caseItem.tags.length > 0 && (
                        <div className="mt-4">
                          <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Tags</p>
                          <div className="flex flex-wrap gap-2">
                            {caseItem.tags.map((tag, i) => (
                              <span key={i} className="flex items-center gap-1 px-2 py-1 bg-slate-800 text-slate-300 rounded text-xs">
                                <Tag className="w-3 h-3" />
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
