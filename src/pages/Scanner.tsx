import { useState } from 'react';
import { Search, Shield, Globe, Hash, Link, AlertTriangle, Puzzle, Database, Eye } from 'lucide-react';
import { detectIOCType } from '../lib/iocDetection';

interface ScannerProps {
  onScan: (type: string, value: string) => void;
}

const sources = [
  {
    name: 'VirusTotal',
    icon: Shield,
    description: 'Hash, URL, and domain analysis',
    color: 'from-blue-500 to-blue-600'
  },
  {
    name: 'urlscan.io',
    icon: Eye,
    description: 'URL screenshots and redirect chains',
    color: 'from-green-500 to-green-600'
  },
  {
    name: 'AbuseIPDB',
    icon: AlertTriangle,
    description: 'IP abuse confidence and categories',
    color: 'from-red-500 to-red-600'
  },
  {
    name: 'ipinfo.io',
    icon: Globe,
    description: 'ASN, organization, and geolocation',
    color: 'from-cyan-500 to-cyan-600'
  },
  {
    name: 'ProxyCheck',
    icon: Database,
    description: 'TOR/VPN/proxy detection',
    color: 'from-purple-500 to-purple-600'
  },
  {
    name: 'Chrome Web Store',
    icon: Puzzle,
    description: 'Extension metadata and security analysis',
    color: 'from-yellow-500 to-yellow-600'
  }
];

export default function Scanner({ onScan }: ScannerProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!input.trim()) {
      setError('Please enter an IP, URL, domain, hash, or extension ID');
      return;
    }

    const detection = detectIOCType(input);

    if (detection.type === 'unknown') {
      setError('Unable to detect input type. Please enter a valid IP, URL, domain, hash, or Chrome extension ID.');
      return;
    }

    onScan(detection.type, detection.normalizedValue);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <form onSubmit={handleSubmit} className="mb-8">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
            <Search className="w-6 h-6 text-slate-400" />
          </div>
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError('');
            }}
            placeholder="Enter IP address, URL, domain, file hash, or extension ID..."
            className="w-full pl-16 pr-6 py-5 bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-2xl text-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/20 transition-all shadow-lg"
          />
        </div>
        {error && (
          <div className="mt-3 flex items-start gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        <button
          type="submit"
          className="mt-4 w-full py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl"
        >
          Investigate
        </button>
      </form>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-slate-300 dark:border-slate-800 p-8">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 text-center">
          What We Check
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sources.map((source) => {
            const Icon = source.icon;
            return (
              <div
                key={source.name}
                className="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border-2 border-slate-300 dark:border-slate-700 hover:border-cyan-500 dark:hover:border-cyan-500/50 transition-all"
              >
                <div className={`p-2 bg-gradient-to-br ${source.color} rounded-lg flex-shrink-0`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                    {source.name}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {source.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-center text-sm text-slate-500 dark:text-slate-400 mt-6">
          Sign in to add your own API keys and access all sources
        </p>
      </div>

      <div className="mt-12 grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
        <div className="p-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Globe className="w-5 h-5 text-cyan-400" />
            <span className="text-2xl font-bold text-slate-900 dark:text-white">IPs</span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">IPv4 & IPv6</p>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Link className="w-5 h-5 text-cyan-400" />
            <span className="text-2xl font-bold text-slate-900 dark:text-white">URLs</span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">Full analysis</p>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Globe className="w-5 h-5 text-cyan-400" />
            <span className="text-2xl font-bold text-slate-900 dark:text-white">Domains</span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">Reputation</p>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Hash className="w-5 h-5 text-cyan-400" />
            <span className="text-2xl font-bold text-slate-900 dark:text-white">Hashes</span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">MD5, SHA1, SHA256</p>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Puzzle className="w-5 h-5 text-cyan-400" />
            <span className="text-2xl font-bold text-slate-900 dark:text-white">Extensions</span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">Chrome Web Store</p>
        </div>
      </div>
    </div>
  );
}
