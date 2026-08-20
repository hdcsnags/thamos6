import { useEffect, useState, useRef } from 'react';
import { AlertTriangle, Ban, Wallet, ArrowLeftRight, Coins, Copy, Check, FileJson } from 'lucide-react';
import { lookupWallet } from '../../lib/threatIntel';
import type { WalletLookupResult } from '../../types';

interface WalletResultProps {
  address: string;
}

export default function WalletResult({ address }: WalletResultProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<WalletLookupResult | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      const mainContainer = containerRef.current.closest('[style*="overflow"]');
      if (mainContainer) mainContainer.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        setResult(await lookupWallet(address));
      } catch (err: any) {
        setError(err.message || 'Failed to lookup wallet');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [address]);

  if (loading && !result) {
    return (
      <div ref={containerRef} className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-400 uppercase tracking-wider text-sm">Querying chain intelligence...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div ref={containerRef} className="flex items-center justify-center py-12">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 max-w-md">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-400 text-center">{error}</p>
        </div>
      </div>
    );
  }

  if (!result) return null;

  const copySummary = () => {
    const summary = [
      `Wallet: ${result.address}`,
      `Chain: ${result.currency.toUpperCase()}`,
      `Sanctioned/flagged: ${result.is_sanctioned ? 'YES' : 'no'}`,
      result.balance != null ? `Balance: ${result.balance} ${result.currency.toUpperCase()}` : '',
      result.tx_count != null ? `Transactions: ${result.tx_count}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const unit = result.currency.toUpperCase();

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto relative @container">
      <div className="fixed inset-0 pointer-events-none z-0 opacity-20">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-500/5 to-transparent animate-pulse"
             style={{ backgroundSize: '100% 4px', animation: 'scanline 8s linear infinite' }} />
      </div>

      <div className="p-8 relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-6 h-6 text-cyan-400 flex-shrink-0" />
              <h1 className="text-2xl font-bold text-white font-mono break-all" style={{ textShadow: '0 0 20px rgba(6, 182, 212, 0.6)' }}>
                {address}
              </h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                {unit === 'BTC' ? 'Bitcoin' : unit === 'ETH' ? 'Ethereum' : unit}
              </span>
              {result.is_sanctioned ? (
                <span className="px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center gap-1.5">
                  <Ban className="w-3 h-3" /> Flagged / Sanctioned
                </span>
              ) : (
                <span className="px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  No sanctions hit
                </span>
              )}
            </div>
          </div>
          <button
            onClick={copySummary}
            className="px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all border bg-slate-800/50 text-slate-300 border-slate-700/50 hover:bg-slate-700/50 flex items-center gap-2 flex-shrink-0"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            COPY
          </button>
        </div>

        {/* Sanctions banner */}
        {result.is_sanctioned && (
          <div className="p-5 rounded-xl flex items-start gap-4 mb-6" style={{ background: 'rgba(244, 63, 94, 0.10)', border: '1px solid rgba(244, 63, 94, 0.35)' }}>
            <Ban className="w-6 h-6 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-rose-400 font-bold uppercase tracking-wider text-sm mb-1">Address flagged by a chain-risk source</h3>
              <p className="text-slate-300 text-sm">One or more intelligence sources associate this address with sanctioned entities or illicit activity. Treat any interaction as high risk.</p>
            </div>
          </div>
        )}

        {/* Facts */}
        <div className="grid grid-cols-1 @xl:grid-cols-3 gap-4 mb-6">
          <StatCard icon={Coins} label="Balance" value={result.balance != null ? `${result.balance} ${unit}` : 'Unknown'} />
          <StatCard icon={ArrowLeftRight} label="Transactions" value={result.tx_count != null ? result.tx_count.toLocaleString() : 'Unknown'} />
          <StatCard icon={Ban} label="Sanctioned" value={result.is_sanctioned ? 'YES' : 'No'} danger={result.is_sanctioned} />
        </div>

        {/* Raw JSON */}
        <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(148, 163, 184, 0.1)' }}>
          <button onClick={() => setShowRaw(v => !v)} className="w-full flex items-center gap-2 px-5 py-3 text-left text-slate-300 hover:bg-white/5 transition-colors">
            <FileJson className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-bold uppercase tracking-wider">Raw JSON ({Object.keys(result.sources).length} sources)</span>
            <span className="ml-auto text-slate-500 text-xs">{showRaw ? 'HIDE' : 'SHOW'}</span>
          </button>
          {showRaw && (
            <pre className="text-xs text-slate-300 overflow-auto max-h-[500px] font-mono p-5 border-t border-white/5">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, danger }: { icon: any; label: string; value: string; danger?: boolean }) {
  return (
    <div className="p-4 rounded-xl" style={{
      background: danger ? 'rgba(244, 63, 94, 0.10)' : 'rgba(0, 0, 0, 0.3)',
      border: danger ? '1px solid rgba(244, 63, 94, 0.30)' : '1px solid rgba(148, 163, 184, 0.1)',
    }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${danger ? 'text-rose-400' : 'text-cyan-400'}`} />
        <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xl font-bold break-all ${danger ? 'text-rose-400' : 'text-white'}`}>{value}</div>
    </div>
  );
}
