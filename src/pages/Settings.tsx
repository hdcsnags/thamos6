import { useState, useEffect, useCallback } from 'react';
import { Key, Upload, BarChart3, Plus, Trash2, Eye, EyeOff, Check, AlertCircle, Download } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface ApiKey {
  id: string;
  service: string;
  api_key: string;
  is_active: boolean;
  created_at: string;
}

interface UsageStat {
  date: string;
  lookup_type: string;
  count: number;
}

const AVAILABLE_SERVICES = [
  { id: 'virustotal', name: 'VirusTotal', description: 'File and URL analysis' },
  { id: 'abuseipdb', name: 'AbuseIPDB', description: 'IP reputation data' },
  { id: 'shodan', name: 'Shodan', description: 'Internet device search' },
  { id: 'greynoise', name: 'GreyNoise', description: 'Internet scan data' },
  { id: 'urlscan', name: 'URLScan.io', description: 'URL scanning' },
  { id: 'alienvault', name: 'AlienVault OTX', description: 'Threat intelligence' },
  { id: 'ipinfo', name: 'IPInfo', description: 'IP geolocation' },
  { id: 'threatfox', name: 'ThreatFox', description: 'IOC database' },
];

export default function Settings() {
  const { user } = useAuth();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [usageStats, setUsageStats] = useState<UsageStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [newKey, setNewKey] = useState({ service: '', key: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const [keysRes, statsRes] = await Promise.all([
        supabase
          .from('user_api_keys')
          .select('*')
          .eq('user_id', user.id)
          .order('service'),
        supabase
          .from('usage_stats')
          .select('*')
          .eq('user_id', user.id)
          .gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
          .order('date', { ascending: false }),
      ]);

      if (keysRes.data) setApiKeys(keysRes.data);
      if (statsRes.data) setUsageStats(statsRes.data);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const addKey = async () => {
    if (!user || !newKey.service || !newKey.key) return;

    setSaving(true);
    try {
      const existing = apiKeys.find(k => k.service === newKey.service);

      if (existing) {
        const { error } = await supabase
          .from('user_api_keys')
          .update({ api_key: newKey.key, updated_at: new Date().toISOString() })
          .eq('id', existing.id);

        if (error) throw error;
        showMessage('success', `${newKey.service} key updated`);
      } else {
        const { error } = await supabase
          .from('user_api_keys')
          .insert({ user_id: user.id, service: newKey.service, api_key: newKey.key });

        if (error) throw error;
        showMessage('success', `${newKey.service} key added`);
      }

      setNewKey({ service: '', key: '' });
      fetchData();
    } catch {
      showMessage('error', 'Failed to save key');
    } finally {
      setSaving(false);
    }
  };

  const deleteKey = async (id: string, service: string) => {
    if (!confirm(`Delete ${service} API key?`)) return;

    try {
      const { error } = await supabase.from('user_api_keys').delete().eq('id', id);
      if (error) throw error;
      showMessage('success', 'Key deleted');
      fetchData();
    } catch {
      showMessage('error', 'Failed to delete key');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim() && line.includes('='));

    let added = 0;
    let updated = 0;

    for (const line of lines) {
      const [service, ...keyParts] = line.split('=');
      const key = keyParts.join('=').trim();
      const serviceName = service.trim().toLowerCase();

      if (!serviceName || !key) continue;

      const existing = apiKeys.find(k => k.service.toLowerCase() === serviceName);

      if (existing) {
        await supabase
          .from('user_api_keys')
          .update({ api_key: key, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        updated++;
      } else {
        await supabase
          .from('user_api_keys')
          .insert({ user_id: user.id, service: serviceName, api_key: key });
        added++;
      }
    }

    showMessage('success', `Imported ${added} new keys, updated ${updated} existing`);
    fetchData();
    e.target.value = '';
  };

  const exportKeys = () => {
    const content = apiKeys.map(k => `${k.service}=${k.api_key}`).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'api-keys.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalLookups = usageStats.reduce((sum, s) => sum + s.count, 0);
  const lookupsByType = usageStats.reduce((acc, s) => {
    acc[s.lookup_type] = (acc[s.lookup_type] || 0) + s.count;
    return acc;
  }, {} as Record<string, number>);

  if (!user) {
    return (
      <div className="text-center py-16">
        <Key className="w-16 h-16 text-slate-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Sign in Required</h2>
        <p className="text-slate-400">Sign in to manage your API keys and view usage stats.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Settings</h1>
        <p className="text-slate-400">Manage your API keys and view usage statistics</p>
      </div>

      {message && (
        <div className={`flex items-center gap-2 p-4 rounded-lg ${
          message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
        }`}>
          {message.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {message.text}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-cyan-400" />
                API Keys
              </h2>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer transition-all text-sm">
                  <Upload className="w-4 h-4" />
                  Import
                  <input type="file" accept=".txt,.env" onChange={handleFileUpload} className="hidden" />
                </label>
                {apiKeys.length > 0 && (
                  <button
                    onClick={exportKeys}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all text-sm"
                  >
                    <Download className="w-4 h-4" />
                    Export
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div className="flex gap-2">
                <select
                  value={newKey.service}
                  onChange={e => setNewKey(prev => ({ ...prev, service: e.target.value }))}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="">Select service...</option>
                  {AVAILABLE_SERVICES.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={newKey.key}
                  onChange={e => setNewKey(prev => ({ ...prev, key: e.target.value }))}
                  placeholder="Enter API key..."
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <button
                  onClick={addKey}
                  disabled={!newKey.service || !newKey.key || saving}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-all flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>
            </div>

            {apiKeys.length === 0 ? (
              <p className="text-slate-500 text-center py-8">No API keys configured yet</p>
            ) : (
              <div className="space-y-2">
                {apiKeys.map(key => {
                  const serviceInfo = AVAILABLE_SERVICES.find(s => s.id === key.service);
                  return (
                    <div
                      key={key.id}
                      className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-white">{serviceInfo?.name || key.service}</p>
                        <div className="flex items-center gap-2 text-sm">
                          <code className="text-slate-400 font-mono">
                            {showKeys[key.id] ? key.api_key : '•'.repeat(Math.min(key.api_key.length, 32))}
                          </code>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setShowKeys(prev => ({ ...prev, [key.id]: !prev[key.id] }))}
                          className="p-2 text-slate-400 hover:text-white transition-all"
                        >
                          {showKeys[key.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => deleteKey(key.id, key.service)}
                          className="p-2 text-slate-400 hover:text-red-400 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-6 p-4 bg-slate-800/50 rounded-lg">
              <p className="text-sm text-slate-400">
                <span className="text-slate-300 font-medium">Key file format:</span> One key per line as{' '}
                <code className="text-cyan-400">service=apikey</code>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Example: virustotal=abc123...
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-6">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
              Usage Statistics (30 days)
            </h2>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-white">{totalLookups}</p>
                <p className="text-sm text-slate-400">Total Lookups</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-white">{apiKeys.length}</p>
                <p className="text-sm text-slate-400">Active Keys</p>
              </div>
            </div>

            {Object.keys(lookupsByType).length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-400">By Type</p>
                {Object.entries(lookupsByType)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between">
                      <span className="text-slate-300 capitalize">{type.replace('_', ' ')}</span>
                      <span className="text-white font-medium">{count}</span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-slate-500 text-center py-4">No usage data yet</p>
            )}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Supported Services</h2>
            <div className="grid gap-2">
              {AVAILABLE_SERVICES.map(service => {
                const hasKey = apiKeys.some(k => k.service === service.id);
                return (
                  <div
                    key={service.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      hasKey ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-slate-800/50'
                    }`}
                  >
                    <div>
                      <p className={`font-medium ${hasKey ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {service.name}
                      </p>
                      <p className="text-xs text-slate-500">{service.description}</p>
                    </div>
                    {hasKey && <Check className="w-5 h-5 text-emerald-400" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
