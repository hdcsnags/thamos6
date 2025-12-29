import { useState, useEffect } from 'react';
import { History as HistoryIcon, Server, Link2, RefreshCw, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { IPLookupRecord, URLLookupRecord } from '../types';
import { ThreatBadge } from '../components/ThreatScore';

type Tab = 'ip' | 'url';

export default function History() {
  const [activeTab, setActiveTab] = useState<Tab>('ip');
  const [ipHistory, setIpHistory] = useState<IPLookupRecord[]>([]);
  const [urlHistory, setUrlHistory] = useState<URLLookupRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    setLoading(true);

    const [ipRes, urlRes] = await Promise.all([
      supabase
        .from('ip_lookups')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('url_lookups')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    if (ipRes.data) setIpHistory(ipRes.data);
    if (urlRes.data) setUrlHistory(urlRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-500 to-slate-600 mb-4">
          <HistoryIcon className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Lookup History</h1>
        <p className="text-slate-400">
          View your recent IP and URL lookups. Data is retained for 30 days.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 p-1 bg-slate-800 rounded-lg">
          <button
            onClick={() => setActiveTab('ip')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${
              activeTab === 'ip'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Server className="w-4 h-4" />
            IP Lookups ({ipHistory.length})
          </button>
          <button
            onClick={() => setActiveTab('url')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all ${
              activeTab === 'url'
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Link2 className="w-4 h-4" />
            URL Scans ({urlHistory.length})
          </button>
        </div>

        <button
          onClick={fetchHistory}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-slate-500 animate-spin" />
        </div>
      ) : activeTab === 'ip' ? (
        ipHistory.length > 0 ? (
          <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">IP Address</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Threat Score</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Sources</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {ipHistory.map(record => (
                    <tr key={record.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        {record.threat_score >= 50 ? (
                          <XCircle className="w-5 h-5 text-red-400" />
                        ) : (
                          <CheckCircle className="w-5 h-5 text-emerald-400" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-white">{record.ip_address}</span>
                      </td>
                      <td className="px-4 py-3">
                        <ThreatBadge score={record.threat_score} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-400">
                          {record.sources_checked?.length || 0} sources
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-500">{formatDate(record.created_at)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <Server className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-400 mb-2">No IP lookups yet</h3>
            <p className="text-slate-500">Your IP lookup history will appear here</p>
          </div>
        )
      ) : urlHistory.length > 0 ? (
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">URL</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Threats</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {urlHistory.map(record => (
                  <tr key={record.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3">
                      {record.is_malicious ? (
                        <XCircle className="w-5 h-5 text-red-400" />
                      ) : (
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-md">
                      <span className="text-white truncate block">{record.url}</span>
                    </td>
                    <td className="px-4 py-3">
                      {record.threat_types?.length > 0 ? (
                        <div className="flex items-center gap-1">
                          {record.threat_types.map(type => (
                            <span
                              key={type}
                              className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs font-medium rounded"
                            >
                              {type}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-500 text-sm">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-500">{formatDate(record.created_at)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <Link2 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-400 mb-2">No URL scans yet</h3>
          <p className="text-slate-500">Your URL scan history will appear here</p>
        </div>
      )}
    </div>
  );
}
