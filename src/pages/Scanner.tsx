import { useState, useEffect } from 'react';
import { 
  Search, Shield, Globe, Hash, Link as LinkIcon, 
  AlertTriangle, Puzzle, Database, Eye, Terminal, 
  Activity, Zap, Server, Cpu, Radio, Command
} from 'lucide-react';
import { detectIOCType } from '../lib/iocDetection';

interface ScannerProps {
  onScan: (type: string, value: string) => void;
}

// Sophisticated source definitions with "tech" details
const sensors = [
  { id: 'vt', name: 'VirusTotal', icon: Shield, status: 'OPERATIONAL', load: '12%', color: 'text-blue-400' },
  { id: 'urlscan', name: 'urlscan.io', icon: Eye, status: 'IMAGING', load: '45%', color: 'text-emerald-400' },
  { id: 'abuse', name: 'AbuseIPDB', icon: AlertTriangle, status: 'READY', load: '8%', color: 'text-amber-400' },
  { id: 'ipinfo', name: 'ipinfo.io', icon: Globe, status: 'GEOLOCATING', load: '22%', color: 'text-cyan-400' },
  { id: 'proxy', name: 'ProxyCheck', icon: Database, status: 'ACTIVE', load: '33%', color: 'text-violet-400' },
  { id: 'chrome', name: 'CWS Intel', icon: Puzzle, status: 'SYNCED', load: '0%', color: 'text-pink-400' },
];

export default function Scanner({ onScan }: ScannerProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [detectedType, setDetectedType] = useState<string>('UNKNOWN');
  const [isFocused, setIsFocused] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Live detection feedback
  useEffect(() => {
    if (!input) {
      setDetectedType('WAITING');
      return;
    }
    const detection = detectIOCType(input);
    setDetectedType(detection.type.toUpperCase());
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!input.trim()) {
      setError('TARGET_MISSING');
      return;
    }

    const detection = detectIOCType(input);

    if (detection.type === 'unknown') {
      setError('INVALID_FORMAT');
      return;
    }

    onScan(detection.type, detection.normalizedValue);
  };

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center relative overflow-hidden font-sans">
      
      {/* 1. ATMOSPHERIC BACKGROUND (The "Space" Feel) */}
      <div className="absolute inset-0 z-0 pointer-events-none bg-[#020617]">
        {/* Deep blue void glow */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-900/20 rounded-full blur-[120px] animate-pulse-slow"></div>
        {/* Cyan accent glow */}
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-900/10 rounded-full blur-[100px]"></div>
        {/* Subtle noise texture overlay */}
        <div className="absolute inset-0 opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')]"></div>
      </div>

      <div className={`w-full max-w-5xl relative z-10 flex flex-col items-center transition-all duration-1000 ${mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
        
        {/* 2. THE HERO HEADER */}
        <div className="text-center mb-12 space-y-4">
           <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/50 border border-slate-700/50 backdrop-blur-md shadow-xl">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-mono text-slate-400 tracking-widest">THAMOS6 // INTEL CORE</span>
           </div>
           
           <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-500 tracking-tight drop-shadow-sm">
             THREAT<span className="text-cyan-500">OS</span>
           </h1>
        </div>

        {/* 3. THE "COMMAND BAR" INPUT */}
        <div className="w-full max-w-3xl relative group">
          {/* Glowing Ring Effect on Focus */}
          <div className={`absolute -inset-0.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600 rounded-2xl opacity-0 transition duration-500 blur ${isFocused ? 'opacity-70' : 'group-hover:opacity-30'}`}></div>
          
          <form onSubmit={handleSubmit} className="relative bg-[#0B1120] rounded-2xl border border-slate-800 shadow-2xl flex flex-col overflow-hidden">
            
            {/* Top Bar: Input Area */}
            <div className="flex items-center px-6 py-5">
              <div className="pr-6 border-r border-slate-800 text-slate-500">
                <Command className={`w-6 h-6 transition-colors ${isFocused ? 'text-cyan-400' : ''}`} />
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
                placeholder="Analyze IP, Domain, Hash..."
                className="flex-1 bg-transparent border-none px-6 text-xl text-white placeholder-slate-600 focus:outline-none focus:ring-0 font-mono tracking-wide"
                autoComplete="off"
                spellCheck="false"
              />

              {/* Live Detector Badge */}
              <div className="pl-4 hidden sm:block">
                 <div className={`px-3 py-1 rounded text-[10px] font-mono font-bold border transition-all duration-300 ${
                   detectedType === 'WAITING' ? 'bg-slate-900 border-slate-800 text-slate-600' :
                   detectedType === 'UNKNOWN' ? 'bg-red-950/30 border-red-900/50 text-red-500' :
                   'bg-cyan-950/30 border-cyan-900/50 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.2)]'
                 }`}>
                   {detectedType}
                 </div>
              </div>
            </div>

            {/* Bottom Bar: Action & Status */}
            <div className="bg-[#0F1629] px-6 py-2.5 flex justify-between items-center border-t border-slate-800/50">
               <div className="text-xs font-mono flex items-center gap-2">
                 {error ? (
                   <span className="text-red-400 flex items-center gap-1 animate-pulse">
                     <AlertTriangle className="w-3 h-3" /> {error}
                   </span>
                 ) : (
                   <span className="text-slate-500">READY TO SCAN</span>
                 )}
               </div>
               
               <button 
                type="submit"
                className="group/btn flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider hover:text-cyan-400 transition-colors"
               >
                 Execute Scan
                 <div className="bg-slate-700 p-1 rounded group-hover/btn:bg-cyan-900/50 transition-colors">
                   <Radio className="w-3 h-3" />
                 </div>
               </button>
            </div>
          </form>
        </div>

        {/* 4. THE GLASS CARDS (Sensors) */}
        <div className="mt-20 w-full">
          <div className="flex items-end justify-between mb-6 px-4">
             <div>
               <h3 className="text-sm font-semibold text-white">Active Modules</h3>
               <p className="text-xs text-slate-500 mt-1">Real-time threat feeds configured</p>
             </div>
             <div className="flex gap-1">
                {[1,2,3].map(i => (
                  <div key={i} className={`w-1 h-1 rounded-full ${i===1 ? 'bg-cyan-500' : 'bg-slate-700'}`} />
                ))}
             </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 px-2">
            {sensors.map((sensor) => {
              const Icon = sensor.icon;
              return (
                <div key={sensor.id} className="group relative bg-white/[0.02] backdrop-blur-sm border border-white/5 rounded-xl p-4 hover:bg-white/[0.04] hover:border-white/10 transition-all duration-300 hover:-translate-y-1">
                  
                  {/* Top Row: Icon & Dot */}
                  <div className="flex justify-between items-start mb-4">
                    <div className={`p-2 rounded-lg bg-[#0B1120] border border-white/5 group-hover:border-${sensor.color.split('-')[1]}-500/30 transition-colors`}>
                      <Icon className={`w-4 h-4 ${sensor.color} opacity-80 group-hover:opacity-100`} />
                    </div>
                    <div className={`w-1.5 h-1.5 rounded-full ${sensor.status === 'OPERATIONAL' ? 'bg-emerald-500' : 'bg-slate-600'} shadow-lg`} />
                  </div>

                  {/* Info */}
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-slate-300 tracking-wide">{sensor.name}</div>
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] text-slate-600 font-mono">{sensor.status}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{sensor.load}</span>
                    </div>
                  </div>

                  {/* Decorative Gradient Line on Hover */}
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
