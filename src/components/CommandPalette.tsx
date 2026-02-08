import { useState, useEffect, useRef } from 'react';
import { Search, Hash, Globe, FileText, Link as LinkIcon, X, Zap, Clock } from 'lucide-react';
import type { Page } from './Layout';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (page: Page) => void;
}

interface Command {
  id: string;
  name: string;
  description: string;
  icon: any;
  action: () => void;
  category: string;
}

export default function CommandPalette({ isOpen, onClose, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = [
    {
      id: 'scan-ip',
      name: 'Scan IP Address',
      description: 'Analyze an IP address for threats',
      icon: Globe,
      action: () => {
        onNavigate('ip');
        onClose();
      },
      category: 'Scanners',
    },
    {
      id: 'scan-url',
      name: 'Scan URL',
      description: 'Check URL reputation and safety',
      icon: LinkIcon,
      action: () => {
        onNavigate('url');
        onClose();
      },
      category: 'Scanners',
    },
    {
      id: 'scan-domain',
      name: 'Scan Domain',
      description: 'Investigate domain intelligence',
      icon: Globe,
      action: () => {
        onNavigate('domain');
        onClose();
      },
      category: 'Scanners',
    },
    {
      id: 'scan-hash',
      name: 'Scan File Hash',
      description: 'Check file hash against threat databases',
      icon: Hash,
      action: () => {
        onNavigate('hash');
        onClose();
      },
      category: 'Scanners',
    },
    {
      id: 'history',
      name: 'View History',
      description: 'See your recent scans',
      icon: Clock,
      action: () => {
        onNavigate('history');
        onClose();
      },
      category: 'Navigation',
    },
    {
      id: 'intel-stream',
      name: 'Intel Stream',
      description: 'Access threat intelligence feeds',
      icon: Zap,
      action: () => {
        onNavigate('news');
        onClose();
      },
      category: 'Navigation',
    },
  ];

  const filteredCommands = commands.filter(cmd =>
    cmd.name.toLowerCase().includes(query.toLowerCase()) ||
    cmd.description.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands, onClose]);

  if (!isOpen) return null;

  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) {
      acc[cmd.category] = [];
    }
    acc[cmd.category].push(cmd);
    return acc;
  }, {} as Record<string, Command[]>);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-32 px-4">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-slate-900 rounded-xl border-2 border-cyan-500/50 shadow-2xl mission-control-glow animate-in">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-cyan-500/30">
          <Search className="w-5 h-5 text-cyan-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-white placeholder-slate-500 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              No commands found
            </div>
          ) : (
            Object.entries(groupedCommands).map(([category, cmds]) => (
              <div key={category} className="mb-4">
                <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {category}
                </div>
                {cmds.map((cmd, index) => {
                  const Icon = cmd.icon;
                  const globalIndex = filteredCommands.indexOf(cmd);
                  const isSelected = globalIndex === selectedIndex;

                  return (
                    <button
                      key={cmd.id}
                      onClick={cmd.action}
                      onMouseEnter={() => setSelectedIndex(globalIndex)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                        isSelected
                          ? 'bg-cyan-500/20 border-l-2 border-cyan-400'
                          : 'hover:bg-slate-800/50'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${isSelected ? 'text-cyan-400' : 'text-slate-400'}`} />
                      <div className="flex-1 text-left">
                        <div className={`font-medium ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                          {cmd.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {cmd.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-cyan-500/30 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700">↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700">Enter</kbd>
              Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700">Esc</kbd>
              Close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
