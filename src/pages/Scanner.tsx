import { useMemo, useState } from 'react';
import { Search, AlertTriangle } from 'lucide-react';
import { detectIOCType } from '../lib/iocDetection';

interface ScannerProps {
  onScan: (type: string, value: string) => void;
}

type Severity = 'high' | 'medium' | 'clean' | 'info' | 'live' | 'feed' | 'scanner';

const pillClass: Record<Severity, string> = {
  high: 'border-rose-500/20 bg-rose-500/10 text-rose-200',
  medium: 'border-amber-500/20 bg-amber-500/10 text-amber-200',
  clean: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
  info: 'border-slate-500/20 bg-slate-500/10 text-slate-200',
  live: 'border-violet-500/20 bg-violet-500/10 text-violet-200',
  feed: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-200',
  scanner: 'border-amber-500/20 bg-amber-500/10 text-amber-200',
};

function Pill({ label, tone }: { label: string; tone: Severity }) {
  return (
    <span className={`px-2 py-1 rounded-full text-[11px] font-medium border ${pillClass[tone]}`}>
      {label}
    </span>
  );
}

export default function Scanner({ onScan }: ScannerProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const detection = useMemo(() => {
    if (!input.trim()) return { type: 'unknown', normalizedValue: '' };
    return detectIOCType(input.trim());
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!input.trim()) {
      setError('Please enter an IP, URL, domain, hash, or extension ID');
      return;
    }

    if (detection.type === 'unknown') {
      setError('Unable to detect input type. Please enter a valid IP, URL, domain, hash, or Chrome extension ID.');
      return;
    }

    onScan(detection.type, detection.normalizedValue);
  };

  // Small, calm status label (optional)
  const statusLabel = useMemo(() => {
    if (!input.trim()) return 'STATUS: READY';
    if (detection.type === 'unknown') return 'STATUS: CHECK INPUT';
    return `DETECTED: ${String(detection.type).toUpperCase()}`;
  }, [input, detection.type]);

  const statusActive = input.trim() && detection.type !== 'unknown';

  return (
    <div className="relative">
      {/* Local styles (kept tiny + contained) */}
      <style>{`
        @keyframes t6Blink { 0%,100%{opacity:1;} 50%{opacity:0;} }
        .t6-cursor {
          width: 10px; height: 18px;
          border-radius: 2px;
          background: rgba(34,211,238,0.85);
          display: inline-block;
          animation: t6Blink 1s infinite;
        }
      `}</style>

      {/* Full-width dark canvas inside Layout's constrained <main> */}
      <div className="-mx-4 sm:-mx-6 lg:-mx-8">
        <div
          className="px-4 sm:px-6 lg:px-8 py-10 sm:py-12 rounded-2xl border border-white/5"
          style={{
            background:
              'radial-gradient(1000px 520px at 50% 10%, rgba(34,211,238,0.08), transparent 60%),' +
              'radial-gradient(900px 520px at 15% 65%, rgba(52,211,153,0.05), transparent 55%),' +
              'radial-gradient(900px 520px at 85% 70%, rgba(167,139,250,0.04), transparent 55%),' +
              'rgba(1,3,10,0.85)',
          }}
        >
          {/* One-line guidance */}
          <p className="text-center text-sm sm:text-base text-slate-300">
            Paste IP, URL, hash, domain, or Chrome extension ID for fast intelligence correlation &amp; analysis.
          </p>

          {/* Terminal shell */}
          <form onSubmit={handleSubmit} className="mt-8 flex justify-center">
            <div className="w-full max-w-5xl rounded-2xl overflow-hidden border border-slate-700/30 bg-black/30 shadow-[0_26px_120px_rgba(0,0,0,0.75)]">
              {/* Top chrome */}
              <div className="h-8 bg-[#0B1120] border-b border-slate-800 flex items-center px-4 justify-between select-none">
                <div className="flex gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/20 border border-amber-500/50" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/20 border border-emerald-500/50" />
                </div>
                <div className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-widest">
                  root@thamos6:~
                </div>
                <div className="w-10" />
              </div>

              <div className="p-6 md:p-8">
                <div className="flex items-start gap-4">
                  <span className="text-cyan-400 font-mono text-xl font-bold mt-1 select-none">{'>_'}</span>

                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value);
                        setError('');
                      }}
                      placeholder="awaiting_input..."
                      className="w-full bg-transparent border-none p-0 text-xl md:text-2xl text-white font-mono placeholder-slate-600 focus:outline-none focus:ring-0"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>

                  {/* Clean icon submit */}
                  <button
                    type="submit"
                    className="h-11 w-11 rounded-xl border border-slate-600/20 bg-slate-900/30 hover:bg-slate-900/50 hover:border-slate-600/30 transition-all grid place-items-center"
                    title="Analyze"
                  >
                    <Search className="w-5 h-5 text-slate-200/90" />
                  </button>
                </div>

                {/* subtle blinking cursor when empty (visual only) */}
                {!input.trim() && (
                  <div className="mt-2 ml-[54px]">
                    <span className="t6-cursor" aria-hidden="true" />
                  </div>
                )}

                {/* Footer strip */}
                <div className="mt-8 flex flex-wrap items-center justify-between border-t border-slate-800/60 pt-4 gap-4">
                  {/* status chip */}
                  <div
                    className={[
                      'text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-md border',
                      statusActive
                        ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-200'
                        : 'border-slate-500/20 bg-slate-500/10 text-slate-200',
                    ].join(' ')}
                  >
                    {statusLabel}
                  </div>

                  {/* micro stats + execute */}
                  <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500 uppercase">
                    <span className="hidden sm:inline">
                      Sources: <span className="text-slate-300">13+</span>
                    </span>
                    <span className="hidden sm:inline">
                      Latency: <span className="text-emerald-300">24ms</span>
                    </span>
                    <span className="text-emerald-200">System: Online</span>

                    <button
                      type="submit"
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-cyan-600 text-white rounded transition-colors group"
                    >
                      EXECUTE <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </form>

          {/* Error */}
          {error && (
            <div className="mt-5 max-w-5xl mx-auto flex items-start gap-2 text-red-200 text-sm bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* 3 panels under scanner */}
          <div className="mt-10 max-w-7xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Recent Investigations */}
              <section className="lg:col-span-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-extrabold text-white">Recent Investigations</h2>
                  <span className="text-xs text-slate-400">Mock</span>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4 hover:bg-white/5 transition">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-bold text-white">Suspicious URL</div>
                      <Pill label="Medium" tone="medium" />
                    </div>
                    <div className="mt-2 text-xs text-slate-300 truncate">
                      hxxps://login-microsoftonline-security[.]com
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-4 hover:bg-white/5 transition">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-bold text-white">IP Reputation</div>
                      <Pill label="Clean" tone="clean" />
                    </div>
                    <div className="mt-2 text-xs text-slate-300 truncate">8.8.8.8</div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-4 hover:bg-white/5 transition">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-bold text-white">Hash Lookup</div>
                      <Pill label="High" tone="high" />
                    </div>
                    <div className="mt-2 text-xs text-slate-300 truncate">sha256: 4b7c…e2a1 (mock)</div>
                  </div>
                </div>
              </section>

              {/* Watchlist Hits */}
              <section className="lg:col-span-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-extrabold text-white">Watchlist Hits</h2>
                  <span className="text-xs text-slate-400">Last 24h</span>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4 hover:bg-white/5 transition">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-bold text-white">185.234.219.12</div>
                      <Pill label="High" tone="high" />
                    </div>
                    <div className="mt-2 text-xs text-slate-300">
                      Matched: Proxy / DC-like • seen in email artifact
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-4 hover:bg-white/5 transition">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-bold text-white truncate">
                        login-microsoftonline-security[.]com
                      </div>
                      <Pill label="Medium" tone="medium" />
                    </div>
                    <div className="mt-2 text-xs text-slate-300">Matched: Brand impersonation heuristic</div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-4 hover:bg-white/5 transition">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-bold text-white">CVE-2025-XXXX</div>
                      <Pill label="Info" tone="info" />
                    </div>
                    <div className="mt-2 text-xs text-slate-300">Tracked for internal patch awareness</div>
                  </div>
                </div>
              </section>

              {/* Intel Stream */}
              <section className="lg:col-span-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-extrabold text-white">Intel Stream</h2>
                  <span className="text-xs text-slate-400">Curated</span>
                </div>

                <div className="mt-4 space-y-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-4 hover:bg-white/5 transition">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-bold text-white">Ransomware Victim Intel</div>
                      <Pill label="Live" tone="live" />
                    </div>
                    <div className="mt-2 text-xs text-slate-300">Victims • Groups • Sector targeting</div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-4 hover:bg-white/5 transition">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-bold text-white">Security News</div>
                      <Pill label="Feed" tone="feed" />
                    </div>
                    <div className="mt-2 text-xs text-slate-300">Watchlist-aware headlines + summaries</div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-black/20 p-4 hover:bg-white/5 transition">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-bold text-white">Extension Threats</div>
                      <Pill label="Scanner" tone="scanner" />
                    </div>
                    <div className="mt-2 text-xs text-slate-300">CRX unpack → heuristic rules → token signals</div>
                  </div>
                </div>
              </section>
            </div>
          </div>

          {/* end canvas */}
        </div>
      </div>
    </div>
  );
}
