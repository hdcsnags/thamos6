import { useState, useEffect } from 'react';
import { 
  Search, Shield, Globe, Hash, Link as LinkIcon, 
  AlertTriangle, Puzzle, Database, Eye, Terminal, 
  Activity, Wifi, Server, Cpu 
} from 'lucide-react';
import { detectIOCType } from '../lib/iocDetection';

interface ScannerProps {
  onScan: (type: string, value: string) => void;
}

// Tech-themed source definitions
const sensors = [
  { id: 'vt', name: 'VirusTotal', icon: Shield, status: 'ONLINE', latency: '24ms' },
  { id: 'urlscan', name: 'urlscan.io', icon: Eye, status: 'ONLINE', latency: '45ms' },
  { id: 'abuse', name: 'AbuseIPDB', icon: AlertTriangle, status: 'PURGING', latency: '12ms' },
  { id: 'ipinfo', name: 'ipinfo.io', icon: Globe, status: 'ONLINE', latency: '18ms' },
  { id: 'proxy', name: 'ProxyCheck', icon: Database, status: 'ACTIVE', latency: '33ms' },
  { id: 'chrome', name: 'CWS Intel', icon: Puzzle, status: 'SYNCED', latency: '56ms' },
];

export default function Scanner({ onScan }: ScannerProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Simple entry animation effect
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!input.trim()) {
      setError('// ERROR: INPUT_EMPTY // AWAITING TARGET');
      return;
    }

    const detection = detectIOCType(input);

    if (detection.type === 'unknown') {
      setError('// ERROR: UNKNOWN_FORMAT // UNABLE TO PARSE TARGET');
      return;
    }

    onScan(detection.type, detection.normalizedValue);
  };

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center relative overflow-hidden">
      
      {/* BACKGROUND GRID EFFECT */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-cyan-500 opacity-20 blur-[100px]"></div>
      </div>

      <div className={`w-full max-w-4xl relative z-10 transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        
        {/* HEADER / HUD TITLES */}
        <div className="text-center mb-10 space-y-2">
           <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/30 border border-cyan-500/20 text-cyan-400 text-xs font-mono tracking-widest mb-4">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              SYSTEM READY // v2.4.0
           </div>
           <h1 className="text-5xl font-black text-white tracking-tight">
             THAMOS<span className="text-cyan-500">6</span>
           </h1>
           <p className="text-slate-400 text-lg font-light tracking-wide">
             Unified Threat Intelligence & Analysis Platform
           </p>
        </div>

        {/* MAIN SEARCH INTERFACE */}
        <div className="relative group">
          {/* Decorative HUD Lines */}
          <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
          
          <form onSubmit={handleSubmit} className="relative bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl">
            <div className="flex items-center">
              <div className="pl-6 text-slate-500">
                <Terminal className="w-6 h-6" />
              </div>
              <input
                type="text"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setError('');
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Enter IOC (IP, Domain, Hash, URL)..."
                className="w-full bg-transparent border-none px-6 py-6 text-xl text-white placeholder-slate-600 focus:outline-none focus:ring-0 font-mono"
                autoComplete="off"
              />
              <button 
                type="submit"
                className="mr-2 px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition-all shadow-[0_0_20px_rgba(8,145,178,0.3)] hover:shadow-[0_0_30px_rgba(8,145,178,0.5)]"
              >
                SCAN TARGET
              </button>
            </div>
            
            {/* SEARCH HINTS / ERROR DISPLAY */}
            <div className="px-6 py-2 bg-slate-950/50 border-t border-white/5 flex justify-between items-center text-xs font-mono">
               <div className={`${error ? 'text-red-400' : 'text-slate-500'}`}>
                 {error || (isFocused ? '> WAITING FOR INPUT...' : '> SYSTEM IDLE')}
               </div>
               <div className="text-slate-600 flex gap-4">
                  <span>[ENTER] TO EXECUTE</span>
                  <span>[ESC] TO CLEAR</span>
               </div>
            </div>
          </form>
        </div>

        {/* CAPABILITIES / SENSOR GRID */}
        <div className="mt-16">
          <div className="flex items-center justify-between mb-6 px-2">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-4 h-4" /> Active Sensor Array
            </h3>
            <span className="text-xs font-mono text-slate-600">ALL SYSTEMS NOMINAL</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {sensors.map((sensor) => {
              const Icon = sensor.icon;
              return (
                <div key={sensor.id} className="group relative bg-slate-900/40 border border-white/5 hover:border-cyan-500/30 p-4 rounded-lg transition-all hover:bg-slate-800/60 cursor-default">
                  <div className="flex flex-col items-center text-center gap-3">
                    <div className="p-2 bg-slate-800 rounded-lg group-hover:text-cyan-400 group-hover:shadow-[0_0_15px_rgba(34,211,238,0.2)] transition-all text-slate-400">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-300 group-hover:text-white">{sensor.name}</div>
                      <div className="text-[10px] font-mono text-emerald-500 mt-1 flex items-center justify-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        {sensor.status}
                      </div>
                    </div>
                  </div>
                  
                  {/* Tech decoration corners */}
                  <div className="absolute top-0 left-0 w-2 h-2 border-l border-t border-white/10 group-hover:border-cyan-500/50 rounded-tl transition-colors"></div>
                  <div className="absolute bottom-0 right-0 w-2 h-2 border-r border-b border-white/10 group-hover:border-cyan-500/50 rounded-br transition-colors"></div>
                </div>
              );
            })}
          </div>
        </div>

        {/* BOTTOM STATS DECORATION */}
        <div className="mt-16 border-t border-white/5 pt-6 grid grid-cols-3 gap-4 text-center">
            <div className="flex flex-col gap-1">
               <span className="text-[10px] uppercase text-slate-600 tracking-wider">Global Queries</span>
               <span className="text-xl font-mono text-slate-400">8,492,102</span>
            </div>
            <div className="flex flex-col gap-1 border-x border-white/5">
               <span className="text-[10px] uppercase text-slate-600 tracking-wider">Threats Blocked</span>
               <span className="text-xl font-mono text-red-400/80">142,093</span>
            </div>
            <div className="flex flex-col gap-1">
               <span className="text-[10px] uppercase text-slate-600 tracking-wider">Node Status</span>
               <span className="text-xl font-mono text-emerald-400/80 flex items-center justify-center gap-2">
                 <Wifi className="w-4 h-4" /> 100%
               </span>
            </div>
        </div>

      </div>
    </div>
  );
}
