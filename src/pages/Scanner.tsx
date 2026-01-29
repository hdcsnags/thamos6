import { useState, useEffect } from 'react';
import { 
  Search, Shield, Terminal, Activity, 
  AlertTriangle, CheckCircle, XCircle, Clock, Globe, Link as LinkIcon
} from 'lucide-react';
import { supabase } from '../lib/supabase'; // Assuming this is your standard export
import { detectIOCType } from '../lib/iocDetection';

interface ScannerProps {
  onScan: (type: string, value: string) => void;
}

interface ScanHistoryItem {
  type: string;
  value: string;
  created_at: string;
  threat_score: number;
  is_malicious?: boolean;
}

export default function Scanner({ onScan }: ScannerProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [recentScans, setRecentScans] = useState<ScanHistoryItem[]>([]);
  
  // 1. Fetch Real History on Mount
  useEffect(() => {
    const fetchHistory = async () => {
      // We fetch from multiple tables to create a unified "Feed"
      // Note: This matches your DB schema from ARCHITECTURE.md
      const { data: ipData } = await supabase
        .from('ip_lookups')
        .select('ip_address, threat_score, created_at')
        .order('created_at', { ascending: false })
        .limit(3);

      const { data: urlData } = await supabase
        .from('url_lookups')
        .select('url, threat_score, is_malicious, created_at')
        .order('created_at', { ascending: false })
        .limit(3);

      // Normalize the data for display
      const ips = (ipData || []).map(item => ({
        type: 'IP',
        value: item.ip_address,
        created_at: item.created_at,
        threat_score: item.threat_score,
        is_malicious: item.threat_score > 75
      }));

      const urls = (urlData || []).map(item => ({
        type: 'URL',
        value: item.url,
        created_at: item.created_at,
        threat_score: item.threat_score || (item.is_malicious ? 90 : 0),
        is_malicious: item.is_malicious
      }));

      // Merge and Sort
      const combined = [...ips, ...urls]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5); // Take top 5

      setRecentScans(combined);
    };

    fetchHistory();
    
    // Optional: Real-time subscription could go here
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

  // Helper to format time "2m ago"
  const timeAgo = (dateString: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  };

  return (
    <div className="min-h-[85vh] flex flex-col items-center justify-center relative font-sans bg-black text-slate-300">
      
      {/* 1. BRANDING - Keeping it minimal */}
      <div className="w-full max-w-4xl px-4 flex flex-col items-center z-10">
        
        <div className="mb-12 text-center">
           <div className="inline-flex items-center justify-center p-3 mb-6 bg-slate-900/50 rounded-2xl border border-slate-800">
             <Shield className="w-10 h-10 text-cyan-500" />
           </div>
           <h1 className="text-5xl font-bold text-white tracking-tight mb-3">
             Thamos<span className="text-cyan-500">6</span>
           </h1>
           <p className="text-slate-500 font-mono text-sm tracking-wide uppercase">
             Advanced Threat Intelligence Platform
           </p>
        </div>

        {/* 2. THE CONSOLE INPUT */}
        <div className="w-full max-w-2xl relative group">
          {/* Subtle Glow behind input only when focused */}
          <div className={`absolute -inset-0.5 bg-cyan-500/20 rounded-xl blur-md transition-opacity duration-300 ${isFocused ? 'opacity-100' : 'opacity-0'}`}></div>
          
          <form 
            onSubmit={handleSubmit}
            className={`
              relative bg-black rounded-xl overflow-hidden transition-all duration-300
              border ${isFocused ? 'border-cyan-500' : 'border-slate-800'}
            `}
          >
            {/* Top Bar (Decoration) */}
            <div className="h-6 bg-[#0a0a0a] border-b border-slate-800 flex items-center px-3 gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-slate-700"></div>
            </div>

            {/* Input Area */}
            <div className="flex items-center px-4 py-5">
              <div className="flex items-center gap-3 pr-4 border-r border-slate-800 mr-4 select-none">
                <Terminal className={`w-5 h-5 ${isFocused ? 'text-cyan-400' : 'text-slate-600'}`} />
                <span className="font-mono text-sm text-slate-500 font-bold hidden sm:inline">root@t6:~#</span>
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
                className="flex-1 bg-transparent border-none p-0 text-lg text-white placeholder-slate-700 focus:outline-none focus:ring-0 font-mono"
                placeholder="enter_target_ioc..."
                autoComplete="off"
                spellCheck="false"
              />
              
              <button 
                type="submit"
                className="p-2 bg-slate-900 hover:bg-cyan-900/30 text-slate-400 hover:text-cyan-400 rounded-lg transition-colors border border-slate-800 hover:border-cyan-500/30"
              >
                <Search className="w-5 h-5" />
              </button>
            </div>
            
            {/* Error Display (Slide down) */}
            {error && (
              <div className="bg-red-950/20 border-t border-red-900/50 px-4 py-2 text-xs font-mono text-red-500 flex items-center gap-2">
                 <XCircle className="w-3 h-3" /> 
                 <span>ERROR_CODE: {error}</span>
              </div>
            )}
          </form>

          {/* Quick Stats Line */}
          <div className="mt-3 flex justify-between items-center px-1">
             <div className="flex gap-4 text-[10px] font-mono text-slate-600 uppercase tracking-wider">
               <span>Sources: 14+</span>
               <span>Latency: 24ms</span>
               <span className="text-emerald-600">System: ONLINE</span>
             </div>
          </div>
        </div>

        {/* 3. RECENT INTERCEPTIONS (Real History) */}
        {recentScans.length > 0 && (
          <div className="mt-20 w-full max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-700">
             <div className="flex items-center justify-between mb-4 px-1">
               <div className="flex items-center gap-2">
                 <Activity className="w-4 h-4 text-cyan-600" />
                 <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Live Interceptions</h3>
               </div>
               <span className="text-[10px] font-mono text-slate-700">SYNCED</span>
             </div>
             
             <div className="border border-slate-800 rounded-lg overflow-hidden">
               {/* Table Header */}
               <div className="grid grid-cols-12 gap-4 px-4 py-2 bg-[#050505] border-b border-slate-800 text-[10px] font-mono text-slate-600 uppercase tracking-wider">
                  <div className="col-span-2">Type</div>
                  <div className="col-span-6">Target</div>
                  <div className="col-span-2 text-right">Age</div>
                  <div className="col-span-2 text-right">Status</div>
               </div>

               {/* Table Body */}
               <div className="divide-y divide-slate-900 bg-black">
                 {recentScans.map((scan, i) => (
                   <div key={i} className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-slate-900/40 transition-colors group cursor-default">
                      {/* Type Badge */}
                      <div className="col-span-2 flex items-center">
                         <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                            scan.type === 'IP' ? 'text-blue-400 border-blue-900/30 bg-blue-950/10' :
                            scan.type === 'URL' ? 'text-purple-400 border-purple-900/30 bg-purple-950/10' :
                            'text-slate-400 border-slate-800 bg-slate-900'
                         }`}>
                           {scan.type}
                         </span>
                      </div>
                      
                      {/* Value (Truncated) */}
                      <div className="col-span-6 flex items-center font-mono text-xs text-slate-400 group-hover:text-white transition-colors truncate pr-4">
                        {scan.value}
                      </div>
                      
                      {/* Time Ago */}
                      <div className="col-span-2 flex items-center justify-end text-[10px] font-mono text-slate-600">
                        {timeAgo(scan.created_at)}
                      </div>
                      
                      {/* Verdict */}
                      <div className="col-span-2 flex items-center justify-end">
                         {scan.is_malicious ? (
                           <AlertTriangle className="w-4 h-4 text-red-500" />
                         ) : (
                           <CheckCircle className="w-4 h-4 text-emerald-600/50" />
                         )}
                      </div>
                   </div>
                 ))}
               </div>
             </div>
          </div>
        )}

      </div>
    </div>
  );
}
