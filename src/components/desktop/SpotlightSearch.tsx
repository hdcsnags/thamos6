import { useState, useEffect, useRef, useCallback } from 'react';
import { useDesktop } from '../../contexts/DesktopContext';
import { palette, typography } from '../../design-system/tokens';
import { searchApps, type AppDefinition } from '../../design-system/appRegistry';
import { Search, Command, Zap, Clock, Shield, Terminal, Settings, ArrowRight, Bot } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { detectIOCType } from '../../lib/iocDetection';

interface SpotlightSearchProps {
  onClose: () => void;
}

type SearchResult = 
  | { type: 'app'; data: AppDefinition }
  | { type: 'history'; data: { value: string; type: string; timestamp: string } }
  | { type: 'command'; data: { label: string; icon: any; action: () => void } }
  | { type: 'agent'; data: { name: string; description: string; icon: string } };

export function SpotlightSearch({ onClose }: SpotlightSearchProps) {
  const desktop = useDesktop();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [history, setHistory] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    loadHistory();
  }, []);

  const loadHistory = async () => {
    const { data } = await supabase
      .from('scan_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(3);
    if (data) setHistory(data);
  };

  const getResults = (): SearchResult[] => {
    const results: SearchResult[] = [];

    // 1. App Results
    if (query) {
      searchApps(query).forEach(app => {
        results.push({ type: 'app', data: app });
      });
    }

    // 2. IOC Detection
    const detection = detectIOCType(query);
    if (detection.type !== 'unknown') {
      results.push({ 
        type: 'command', 
        data: { 
          label: `Scan ${detection.type.toUpperCase()}: ${detection.value}`, 
          icon: Shield,
          action: () => desktop.openWindow({ 
            appId: `${detection.type}-result` as any, 
            title: `${detection.type.toUpperCase()}: ${detection.value}`,
            data: { value: detection.value }
          }) 
        } 
      });
    }

    // 3. AI Agents (Mock/Static for now)
    if (query.toLowerCase().includes('agent') || query.toLowerCase().includes('ai') || query.toLowerCase().includes('claude')) {
       results.push({ 
        type: 'agent', 
        data: { name: 'Claude-3.5-Sonnet', description: 'Advanced security reasoning', icon: '🤖' } 
      });
    }

    // 4. Default Commands
    if (!query) {
      results.push({ type: 'command', data: { label: 'New Terminal', icon: Terminal, action: () => desktop.openWindow({ appId: 'terminal', title: 'Terminal' }) } });
      results.push({ type: 'command', data: { label: 'System Settings', icon: Settings, action: () => desktop.openWindow({ appId: 'settings', title: 'Settings' }) } });
    }

    // 5. History (if no query)
    if (!query && history.length > 0) {
      history.forEach(item => {
        results.push({ type: 'history', data: { value: item.value, type: item.type, timestamp: item.created_at } });
      });
    }

    return results;
  };

  const results = getResults();

  const handleSelect = (result: SearchResult) => {
    switch (result.type) {
      case 'app':
        desktop.openWindow({
          appId: result.data.id,
          title: result.data.name,
          icon: result.data.icon,
          accentColor: result.data.accentColor,
        });
        break;
      case 'command':
        result.data.action();
        break;
      case 'history':
        desktop.openWindow({
          appId: `${result.data.type}-result` as any,
          title: `${result.data.type.toUpperCase()}: ${result.data.value}`,
          data: { value: result.data.value }
        });
        break;
      case 'agent':
        desktop.openWindow({ appId: 'workshop', title: 'Maestro Workshop' });
        break;
    }
    onClose();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => (i + 1) % results.length);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => (i - 1 + results.length) % results.length);
      }
      if (e.key === 'Enter' && results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [results, selectedIndex, onClose]);

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] backdrop-blur-md transition-all animate-in fade-in duration-300"
      style={{ backgroundColor: 'rgba(5, 5, 8, 0.4)' }}
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl bg-slate-900/90 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-top-4 duration-300"
        style={{ backdropFilter: 'blur(32px)', boxShadow: '0 0 80px rgba(0,0,0,0.5), 0 0 40px rgba(6, 182, 212, 0.1)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-white/5">
          <Search className="w-6 h-6 text-cyan-500" />
          <input 
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            placeholder="Search Thamos, scan IOCs, or run commands..."
            className="flex-1 bg-transparent text-xl text-white placeholder-slate-500 focus:outline-none font-light"
          />
          <div className="flex items-center gap-1.5 opacity-40">
             <kbd className="px-2 py-1 rounded bg-slate-800 border border-white/10 text-[10px] text-slate-400 font-mono">ESC</kbd>
          </div>
        </div>

        {/* Results Body */}
        <div className="max-h-[60vh] overflow-y-auto py-2 custom-scrollbar">
          {results.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="inline-flex p-3 rounded-full bg-slate-800/50 mb-3">
                <Zap className="w-6 h-6 text-slate-600" />
              </div>
              <p className="text-slate-400 font-medium">No results found for "{query}"</p>
              <p className="text-slate-600 text-xs mt-1">Try searching for an app, IP, or domain</p>
            </div>
          ) : (
            results.map((result, i) => {
              const isActive = i === selectedIndex;
              return (
                <button
                  key={`${result.type}-${i}`}
                  onClick={() => handleSelect(result)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`w-full flex items-center gap-4 px-6 py-4 text-left transition-all ${
                    isActive ? 'bg-cyan-500/10 border-l-4 border-cyan-500' : 'bg-transparent border-l-4 border-transparent hover:bg-white/5'
                  }`}
                >
                  <div className={`p-2.5 rounded-xl ${isActive ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-400'}`}>
                    {result.type === 'app' && <span className="leading-none"><result.data.icon size={20} /></span>}
                    {result.type === 'command' && <result.data.icon className="w-5 h-5" />}
                    {result.type === 'history' && <Clock className="w-5 h-5" />}
                    {result.type === 'agent' && <span className="text-xl leading-none">{result.data.icon}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                       <span className={`font-semibold ${isActive ? 'text-white' : 'text-slate-200'}`}>
                        {result.type === 'app' && result.data.name}
                        {result.type === 'command' && result.data.label}
                        {result.type === 'history' && result.data.value}
                        {result.type === 'agent' && result.data.name}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600 px-1.5 py-0.5 rounded bg-slate-800/50">
                        {result.type}
                      </span>
                    </div>
                    <p className={`text-xs truncate ${isActive ? 'text-cyan-400/70' : 'text-slate-500'}`}>
                      {result.type === 'app' && result.data.description}
                      {result.type === 'command' && 'System command'}
                      {result.type === 'history' && `Past ${result.data.type.toUpperCase()} scan • ${new Date(result.data.timestamp).toLocaleDateString()}`}
                      {result.type === 'agent' && result.data.description}
                    </p>
                  </div>
                  {isActive && <ArrowRight className="w-4 h-4 text-cyan-500 animate-pulse" />}
                </button>
              );
            })
          )}
        </div>

        {/* Footer Hints */}
        <div className="px-6 py-3 border-t border-white/5 bg-slate-950/50 flex items-center justify-between">
           <div className="flex items-center gap-4 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-white/5">↑↓</kbd> Navigate</div>
              <div className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-white/5">↵</kbd> Select</div>
           </div>
           <div className="flex items-center gap-2 text-[10px] text-cyan-500/50 font-mono">
              <Command className="w-3 h-3" /> THAMOS_SPOTLIGHT_V1.0
           </div>
        </div>
      </div>
    </div>
  );
}
