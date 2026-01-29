import { useState, useEffect } from 'react';
import { 
  Search, Shield, Globe, Hash, Link as LinkIcon, 
  AlertTriangle, Terminal, Activity, ChevronRight,
  Clock, CheckCircle, XCircle
} from 'lucide-react';
import { detectIOCType } from '../lib/iocDetection';

interface ScannerProps {
  onScan: (type: string, value: string) => void;
}

// Mock data for the "Live Feed" visual
const recentScans = [
  { type: 'IP', value: '192.168.1.***', time: '2s ago', score: 0, verdict: 'CLEAN' },
  { type: 'URL', value: 'http://pay-pal-secure...', time: '14s ago', score: 95, verdict: 'MALICIOUS' },
  { type: 'HASH', value: 'e5d3...8a9f', time: '42s ago', score: 88, verdict: 'MALICIOUS' },
  { type: 'DOMAIN', value: 'google.com', time: '1m ago', score: 0, verdict: 'CLEAN' },
];

export default function Scanner({ onScan }: ScannerProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

  // Blinking cursor effect
  useEffect(() => {
    const interval = setInterval(() => setCursorVisible(v => !v), 500);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!input.trim()) {
      setError('NO_TARGET_DEFINED');
      return;
    }

    const detection = detectIOCType(input);
    if (detection.type === 'unknown') {
      setError('UNRECOGNIZED_FORMAT');
      return;
    }

    onScan(detection.type, detection.normalizedValue);
  };

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center relative font-sans">
      
      {/* 1. CLEAN BACKGROUND */}
      <div className="absolute inset-0 bg-[#0B1120]">
        {/* Subtle grid for structure, not noise */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:40px_40px]"></div>
      </div>

      <div className="w-full max-w-4xl relative z-10 flex flex-col items-center px-4">
        
        {/* 2. LOGO / BRANDING (Minimalist) */}
        <div className="mb-10 text-center">
           <div className="flex items-center justify-center gap-3 mb-4">
             <div className="p-2.5 bg-cyan-950/30 border border-cyan-500/20 rounded-xl">
               <Shield className="w-8 h-8 text-cyan-400" />
             </div>
           </div>
           <h1 className="text-4xl font-bold text-white tracking-tight mb-2">
             Thamos<span className="text-cyan-500">6</span> Intelligence
           </h1>
           <p className="text-slate-400 text-sm">
             Unified threat analysis across 14+ vectors including VirusTotal, URLhaus & AbuseIPDB.
           </p>
        </div>

        {/* 3. THE "CLEAN CMD" SEARCH BAR */}
        <div className="w-full max-w-2xl">
          <form 
            onSubmit={handleSubmit}
            className={`
              relative group bg-[#0F172A] rounded-xl overflow-hidden transition-all duration-300
              border-2 ${isFocused ? 'border-cyan-500 shadow-[0_0_40px_rgba(6,182,212,0.15)]' : 'border-slate-700 shadow-xl'}
            `}
          >
            <div className="flex items-center px-4 py-4">
              {/* Terminal Prompt Indicator */}
              <div className="flex items-center gap-2 pr-4 border-r border-slate-700 mr-4 select-none">
                <Terminal className={`w-5 h-5 ${isFocused ? 'text-cyan-400' : 'text-slate-500'}`} />
                <span className="font-mono text-sm text-slate-500 font-bold hidden sm:inline">User@T6:~#</span>
              </div>
              
              {/* Input Field */}
              <input
                type="text"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setError('');
                }}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                className="flex-1 bg-transparent border-none p-0 text-lg text-white placeholder-slate-600 focus:outline-none focus:ring-0 font-mono"
                placeholder="scan target..."
                autoComplete="off"
                spellCheck="false"
              />
              
              {/* Blinking Block Cursor (Visual only) */}
              {isFocused && (
                 <div className={`w-2.5 h-5 bg-cyan-500/50 ${cursorVisible ? 'opacity-100' : 'opacity-0'} transition-opacity`}></div>
              )}

              {/* Action Button */}
              <button 
                type="submit"
                className="ml-4 p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <Search className="w-5 h-5" />
              </button>
            </div>
            
            {/* Error / Status Line (Hidden unless needed) */}
            {error && (
              <div className="px-4 py-1.5 bg-red-950/30 border-t border-red-900/50 text-[10px] font-mono text-red-400 flex items-center gap-2">
                 <AlertTriangle className="w-3 h-3" /> ERROR: {error}
              </div>
            )}
          </form>

          {/* Quick Hints */}
          <div className="flex justify-between items-center px-2 mt-2 text-[10px] font-mono text-slate-600">
             <div>SUPPORTED: IP • URL • DOMAIN • HASH • CVE</div>
             <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div> SYSTEMS ONLINE</div>
          </div>
        </div>

        {/* 4. RECENT ACTIVITY (The "Live Feed") */}
        <div className="mt-16 w-full max-w-2xl">
           <div className="flex items-center gap-2 mb-4 px-2">
             <Activity className="w-4 h-4 text-cyan-500" />
             <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recent Interceptions</h3>
           </div>
           
           <div className="bg-[#0F172A]/50 border border-slate-800 rounded-xl overflow-hidden backdrop-blur-sm">
             {/* Header */}
             <div className="grid grid-cols-4 gap-4 px-4 py-2 bg-slate-900/50 border-b border-slate-800 text-[10px] font-mono text-slate-500 uppercase">
                <div>Type</div>
                <div>Target</div>
                <div className="text-right">Time</div>
                <div className="text-right">Verdict</div>
             </div>

             {/* Rows */}
             <div className="divide-y divide-slate-800/50">
               {recentScans.map((scan, i) => (
                 <div key={i} className="grid grid-cols-4 gap-4 px-4 py-3 hover:bg-slate-800/30 transition-colors group cursor-default">
                    <div className="flex items-center">
                       <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                         scan.type === 'MALICIOUS' ? 'bg-red-950/30 border-red-900/50 text-red-400' : 'bg-slate-800 border-slate-700 text-slate-400'
                       }`}>
                         {scan.type}
                       </span>
                    </div>
                    <div className="font-mono text-xs text-slate-300 truncate group-hover:text-cyan-400 transition-colors">
                      {scan.value}
                    </div>
                    <div className="text-right text-xs text-slate-500 font-mono">
                      {scan.time}
                    </div>
                    <div className="flex justify-end items-center gap-2">
                       {scan.verdict === 'MALICIOUS' ? (
                         <span className="flex items-center gap-1.5 text-[10px] font-bold text-red-400 bg-red-950/20 px-2 py-0.5 rounded-full border border-red-900/20">
                           <XCircle className="w-3 h-3" /> THREAT
                         </span>
                       ) : (
                         <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-950/20 px-2 py-0.5 rounded-full border border-emerald-900/20">
                           <CheckCircle className="w-3 h-3" /> CLEAN
                         </span>
                       )}
                    </div>
                 </div>
               ))}
             </div>
           </div>
        </div>

      </div>
    </div>
  );
}
