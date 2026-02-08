import { useState, useEffect, useCallback } from 'react';
import { Key, Upload, BarChart3, Plus, Trash2, Check, AlertCircle, Download, Shield, Lock, User, Settings as SettingsIcon, Palette } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/themecontext';
import { supabase } from '../lib/supabase';

type TabType = 'account' | 'appearance' | 'api-keys' | 'usage';

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
  { id: 'ipqualityscore', name: 'IPQualityScore', description: 'Fraud detection' },
  { id: 'proxycheck', name: 'ProxyCheck', description: 'Proxy/VPN detection' },
  { id: 'ip2proxy', name: 'IP2Proxy', description: 'Proxy database' },
  { id: 'iphub', name: 'IPHub', description: 'VPN/proxy detection' },
];

export default function Settings() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('account');
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [usageStats, setUsageStats] = useState<UsageStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState({ service: '', key: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [changingPassword, setChangingPassword] = useState(false);

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

  const changePassword = async () => {
    if (!passwordForm.newPassword || !passwordForm.confirmPassword) {
      showMessage('error', 'Please fill in all fields');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showMessage('error', 'New passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      showMessage('error', 'Password must be at least 8 characters');
      return;
    }

    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.newPassword,
      });

      if (error) throw error;

      showMessage('success', 'Password changed successfully');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const addKey = async () => {
    if (!user || !newKey.service || !newKey.key) return;

    setSaving(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-keys`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            service: newKey.service,
            apiKey: newKey.key,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Failed to save key');

      showMessage('success', result.message || `${newKey.service} key saved (encrypted)`);
      setNewKey({ service: '', key: '' });
      fetchData();
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to save key');
    } finally {
      setSaving(false);
    }
  };

  const deleteKey = async (id: string, service: string) => {
    if (!confirm(`Delete ${service} API key?`)) return;

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-keys/${service}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || 'Failed to delete key');

      showMessage('success', 'Key deleted');
      fetchData();
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to delete key');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;

    if (!token) {
      showMessage('error', 'Not authenticated');
      return;
    }

    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim() && line.includes('='));

    let success = 0;
    let failed = 0;

    for (const line of lines) {
      const [service, ...keyParts] = line.split('=');
      const key = keyParts.join('=').trim();
      const serviceName = service.trim().toLowerCase();

      if (!serviceName || !key) continue;

      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-keys`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ service: serviceName, apiKey: key }),
          }
        );

        if (response.ok) {
          success++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    showMessage('success', `Imported ${success} keys${failed > 0 ? `, ${failed} failed` : ''} (encrypted)`);
    fetchData();
    e.target.value = '';
  };

  const exportKeys = () => {
    const content = apiKeys.map(k => `${k.service}=<encrypted>`).join('\n');
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

  const tabs = [
    { id: 'account' as TabType, name: 'Account', icon: User },
    { id: 'appearance' as TabType, name: 'Appearance', icon: Palette },
    { id: 'api-keys' as TabType, name: 'API Keys', icon: Key },
    { id: 'usage' as TabType, name: 'Usage & Stats', icon: BarChart3 },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Settings</h1>
        <p className="text-slate-400">Manage your account, API keys, and view usage statistics</p>
      </div>

      {message && (
        <div className={`flex items-center gap-2 p-4 rounded-lg ${
          message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
        }`}>
          {message.type === 'success' ? <Check className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {message.text}
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex border-b border-slate-800">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 font-medium transition-all ${
                  activeTab === tab.id
                    ? 'text-cyan-400 border-b-2 border-cyan-400 bg-slate-800/50'
                    : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/30'
                }`}
              >
                <Icon className="w-5 h-5" />
                {tab.name}
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {activeTab === 'account' && (
            <div className="space-y-8 max-w-2xl">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                  <User className="w-5 h-5 text-cyan-400" />
                  Account Information
                </h2>
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-slate-400">Email</p>
                      <p className="text-white font-medium">{user?.email}</p>
                    </div>
                    <div>
                      <p className="text-sm text-slate-400">Account Created</p>
                      <p className="text-white font-medium">
                        {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                  <Lock className="w-5 h-5 text-cyan-400" />
                  Change Password
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={e => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                      placeholder="Enter new password..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={e => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      placeholder="Confirm new password..."
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  <button
                    onClick={changePassword}
                    disabled={!passwordForm.newPassword || !passwordForm.confirmPassword || changingPassword}
                    className="w-full px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-all font-medium"
                  >
                    {changingPassword ? 'Changing Password...' : 'Change Password'}
                  </button>

                  <p className="text-xs text-slate-500">
                    Password must be at least 8 characters long
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-6 max-w-4xl">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                  <Palette className="w-5 h-5 text-cyan-400" />
                  UI Mode
                </h2>
                <p className="text-sm text-slate-400 mb-6">
                  Choose your preferred interface mode. Each theme provides a completely different experience tailored to different workflows.
                </p>

                <div className="grid md:grid-cols-3 gap-4">
                  <button
                    onClick={() => setTheme('tactical')}
                    className={`group relative p-6 rounded-xl border-2 transition-all text-left ${
                      theme === 'tactical'
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white mb-1">
                          Tactical
                        </h3>
                        <p className="text-sm text-slate-400">
                          Modern interface with visual cards, gradients, and full navigation
                        </p>
                      </div>
                      {theme === 'tactical' && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded-md text-xs font-medium">
                          <Check className="w-3 h-3" />
                          Active
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      Full-featured interface with all tools and features
                    </div>
                  </button>

                  <button
                    onClick={() => setTheme('terminal')}
                    className={`group relative p-6 rounded-xl border-2 transition-all text-left ${
                      theme === 'terminal'
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white mb-1">
                          Terminal
                        </h3>
                        <p className="text-sm text-slate-400">
                          Command-line interface with boot sequence and terminal aesthetics
                        </p>
                      </div>
                      {theme === 'terminal' && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded-md text-xs font-medium">
                          <Check className="w-3 h-3" />
                          Active
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      Type commands to scan IPs, URLs, domains, and hashes
                    </div>
                  </button>

                  <button
                    onClick={() => setTheme('mission-control')}
                    className={`group relative p-6 rounded-xl border-2 transition-all text-left ${
                      theme === 'mission-control'
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-white mb-1">
                          Mission Control
                        </h3>
                        <p className="text-sm text-slate-400">
                          SOC operator dashboard with multi-panel monitoring and live threat feeds
                        </p>
                      </div>
                      {theme === 'mission-control' && (
                        <div className="flex items-center gap-1 px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded-md text-xs font-medium">
                          <Check className="w-3 h-3" />
                          Active
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      Real-time situational awareness with multi-stream analysis
                    </div>
                  </button>
                </div>
              </div>

              <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <h3 className="text-sm font-medium text-white mb-2">Quick Switch</h3>
                <p className="text-sm text-slate-400">
                  You can also toggle between modes using the theme switcher in the header (top right corner).
                </p>
              </div>
            </div>
          )}

          {activeTab === 'api-keys' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Key className="w-5 h-5 text-cyan-400" />
                  API Keys Management
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
                              {'•'.repeat(32)}
                            </code>
                            <span className="text-xs text-emerald-400 flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              Encrypted
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
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
                <div className="flex items-center gap-2 text-emerald-400 text-sm mb-3">
                  <Shield className="w-4 h-4" />
                  All API keys are encrypted at rest using AES-256-GCM
                </div>
                <p className="text-sm text-slate-400 mb-2">
                  <span className="text-slate-300 font-medium">Manual Entry:</span> Select service from dropdown, then enter just the API key
                </p>
                <p className="text-sm text-slate-400">
                  <span className="text-slate-300 font-medium">File Import Format:</span> One key per line as{' '}
                  <code className="text-cyan-400">service=apikey</code>
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Example: abuseipdb=abc123...
                </p>
              </div>

              <div className="mt-6">
                <h2 className="text-lg font-semibold text-white mb-4">Supported Services</h2>
                <div className="grid md:grid-cols-2 gap-2">
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
          )}

          {activeTab === 'usage' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-6">
                  <BarChart3 className="w-5 h-5 text-cyan-400" />
                  Usage Statistics (Last 30 Days)
                </h2>

                <div className="grid md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                    <p className="text-3xl font-bold text-white">{totalLookups}</p>
                    <p className="text-sm text-slate-400">Total Lookups</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                    <p className="text-3xl font-bold text-white">{apiKeys.length}</p>
                    <p className="text-sm text-slate-400">Active Keys</p>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-4 text-center">
                    <p className="text-3xl font-bold text-white">{Object.keys(lookupsByType).length}</p>
                    <p className="text-sm text-slate-400">Tool Types</p>
                  </div>
                </div>

                {Object.keys(lookupsByType).length > 0 ? (
                  <div>
                    <h3 className="text-sm font-medium text-slate-400 mb-3">Lookups by Type</h3>
                    <div className="space-y-2">
                      {Object.entries(lookupsByType)
                        .sort(([, a], [, b]) => b - a)
                        .map(([type, count]) => {
                          const percentage = totalLookups > 0 ? (count / totalLookups) * 100 : 0;
                          return (
                            <div key={type} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-300 capitalize">{type.replace('_', ' ')}</span>
                                <span className="text-white font-medium">{count}</span>
                              </div>
                              <div className="w-full bg-slate-800 rounded-full h-2">
                                <div
                                  className="bg-cyan-500 h-2 rounded-full transition-all"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <BarChart3 className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                    <p className="text-slate-500">No usage data yet</p>
                    <p className="text-sm text-slate-600 mt-1">Start using the tools to see statistics</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
