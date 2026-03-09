import { useState, useEffect } from 'react';
import { Shield, RefreshCw, Trash2, AlertTriangle, Clock, Loader2, StickyNote } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface VaultEntry {
  id: string;
  extension_id: string;
  extension_name: string;
  added_at: string;
  last_scanned_at: string | null;
  baseline_analysis_id: string;
  latest_analysis_id: string;
  notes: string;
  latest_analysis?: {
    risk_score: number;
    risk_level: string;
    behavior_flags: any[];
  };
}

interface VaultListProps {
  onRescan: (extensionId: string) => void;
  isScanning: boolean;
}

export default function VaultList({ onRescan, isScanning }: VaultListProps) {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState<string | null>(null);

  useEffect(() => {
    loadVault();
  }, []);

  const loadVault = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('extension_vault')
        .select('*')
        .order('added_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const analysisIds = data
          .map(e => e.latest_analysis_id || e.baseline_analysis_id)
          .filter(Boolean);

        if (analysisIds.length > 0) {
          const { data: analyses } = await supabase
            .from('extension_analyses')
            .select('id, risk_score, risk_level, behavior_flags')
            .in('id', analysisIds);

          const analysisMap = new Map((analyses || []).map(a => [a.id, a]));

          const enriched = data.map(entry => ({
            ...entry,
            latest_analysis: analysisMap.get(entry.latest_analysis_id || entry.baseline_analysis_id),
          }));

          setEntries(enriched);
        } else {
          setEntries(data);
        }
      } else {
        setEntries([]);
      }
    } catch (err) {
      console.error('Failed to load vault:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRescan = async (extensionId: string) => {
    setRescanning(extensionId);
    onRescan(extensionId);
  };

  useEffect(() => {
    if (!isScanning && rescanning) {
      setRescanning(null);
      loadVault();
    }
  }, [isScanning]);

  const removeFromVault = async (id: string) => {
    const { error } = await supabase
      .from('extension_vault')
      .delete()
      .eq('id', id);

    if (!error) {
      setEntries(prev => prev.filter(e => e.id !== id));
    }
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'critical': return 'text-red-400 bg-red-500/20 border-red-500/30';
      case 'high': return 'text-orange-400 bg-orange-500/20 border-orange-500/30';
      case 'medium': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
      default: return 'text-green-400 bg-green-500/20 border-green-500/30';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays < 1) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const hasDelta = (entry: VaultEntry) => {
    return entry.latest_analysis?.behavior_flags?.some(
      (f: any) => f.flag_type === 'vault_delta_detected'
    );
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
        Loading vault...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-16">
        <Shield className="w-12 h-12 text-slate-500 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-white mb-2">Vault is Empty</h3>
        <p className="text-slate-400 text-sm max-w-md mx-auto">
          Add extensions to the vault after scanning them. Vaulted extensions can be rescanned later
          to detect supply-chain changes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map(entry => (
        <div
          key={entry.id}
          className="border border-slate-700 rounded-lg p-4 bg-slate-800/50 hover:bg-slate-800 transition-colors"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <h4 className="font-semibold text-white truncate">
                  {entry.extension_name || entry.extension_id}
                </h4>
                {entry.latest_analysis && (
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${getRiskColor(entry.latest_analysis.risk_level)}`}>
                    {entry.latest_analysis.risk_score}/100
                  </span>
                )}
                {hasDelta(entry) && (
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Changed
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Added {formatDate(entry.added_at)}
                </span>
                <span className="flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" />
                  Scanned {formatDate(entry.last_scanned_at)}
                </span>
              </div>
              {entry.notes && (
                <div className="mt-2 flex items-start gap-1.5 text-xs text-slate-400">
                  <StickyNote className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>{entry.notes}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => handleRescan(entry.extension_id)}
                disabled={isScanning}
                className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 text-xs font-medium rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {rescanning === entry.extension_id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                Rescan
              </button>
              <button
                onClick={() => removeFromVault(entry.id)}
                className="p-1.5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded transition-colors"
                title="Remove from vault"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
