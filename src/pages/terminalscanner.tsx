import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../contexts/themecontext';

interface TerminalScannerProps {
  onScan: (type: string, value: string) => void;
}

export default function TerminalScanner({ onScan }: TerminalScannerProps) {
  const { setTheme } = useTheme();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState<Array<{ text: string; type: 'prompt' | 'command' | 'success' | 'error' | 'info' }>>([]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Display welcome message
    addOutput('', 'info');
    addOutput('═══════════════════════════════════════════════════════════', 'success');
    addOutput('      WELCOME TO THAMOS6 THREAT INTELLIGENCE SYSTEM       ', 'success');
    addOutput('═══════════════════════════════════════════════════════════', 'success');
    addOutput('', 'info');
    addOutput('Type "help" to see available commands', 'info');
    addOutput('', 'info');
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const addOutput = (text: string, type: 'prompt' | 'command' | 'success' | 'error' | 'info' = 'info') => {
    setOutput(prev => [...prev, { text, type }]);
  };

  const handleCommand = (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    // Add to history
    setCommandHistory(prev => [...prev, trimmed]);
    setHistoryIndex(-1);

    // Echo command
    addOutput(`thamos6@neural-link:~$ ${trimmed}`, 'command');

    // Parse command
    const [command, ...args] = trimmed.split(' ');

    switch (command.toLowerCase()) {
      case 'help':
        showHelp();
        break;
      case 'clear':
        setOutput([]);
        break;
      case 'history':
        showHistory();
        break;
      case 'status':
        showStatus();
        break;
      case 'scan':
        handleScan(args);
        break;
      case 'get':
        handleGet(args);
        break;
      case 'startx':
        addOutput('', 'info');
        addOutput('[*] Shutting down terminal interface...', 'success');
        addOutput('[*] Initializing tactical GUI...', 'success');
        addOutput('[*] Loading visual components...', 'success');
        addOutput('', 'info');
        addOutput('✓ Switched to TACTICAL mode', 'success');
        addOutput('', 'info');
        setTimeout(() => setTheme('tactical'), 500);
        break;
      default:
        addOutput(`Command not found: ${command}`, 'error');
        addOutput('Type "help" for available commands', 'info');
    }
  };

  const showHelp = () => {
    addOutput('', 'info');
    addOutput('AVAILABLE COMMANDS:', 'success');
    addOutput('', 'info');
    addOutput('  scan -ip [IP]        Scan IP address', 'info');
    addOutput('  scan -hash [HASH]    Scan file hash (MD5/SHA256)', 'info');
    addOutput('  scan -url [URL]      Scan URL', 'info');
    addOutput('  scan -domain [DOM]   Scan domain', 'info');
    addOutput('', 'info');
    addOutput('  get -feed rss        Fetch RSS threat feed', 'info');
    addOutput('  get -feed ransomware Fetch ransomware intel', 'info');
    addOutput('', 'info');
    addOutput('  status               Show system status', 'info');
    addOutput('  history              Show command history', 'info');
    addOutput('  clear                Clear terminal', 'info');
    addOutput('  startx               Launch GUI mode', 'info');
    addOutput('  help                 Show this help', 'info');
    addOutput('', 'info');
  };

  const showHistory = () => {
    addOutput('', 'info');
    addOutput('COMMAND HISTORY:', 'success');
    commandHistory.forEach((cmd, i) => {
      addOutput(`  ${i + 1}. ${cmd}`, 'info');
    });
    addOutput('', 'info');
  };

  const showStatus = () => {
    addOutput('', 'info');
    addOutput('═══ SYSTEM STATUS ═══', 'success');
    addOutput('', 'info');
    addOutput('  API Status: OPERATIONAL', 'success');
    addOutput('  Database: CONNECTED', 'success');
    addOutput('  ML Models: LOADED', 'success');
    addOutput('  Threat Feeds: ACTIVE', 'success');
    addOutput('', 'info');
  };

  const handleScan = (args: string[]) => {
    const type = args[0]?.toLowerCase();
    const value = args.slice(1).join(' ');

    if (!type || !value) {
      addOutput('ERROR: Invalid syntax. Usage: scan -ip [IP] | scan -hash [HASH] | scan -url [URL] | scan -domain [DOMAIN]', 'error');
      return;
    }

    // Map CLI flags to app types
    const typeMap: Record<string, string> = {
      '-ip': 'ip',
      '-hash': 'hash',
      '-url': 'url',
      '-domain': 'domain',
    };

    const scanType = typeMap[type];
    if (!scanType) {
      addOutput('ERROR: Unknown scan type. Use: -ip, -hash, -url, or -domain', 'error');
      return;
    }

    addOutput('', 'info');
    addOutput(`[*] Initiating ${scanType.toUpperCase()} scan: ${value}`, 'success');
    addOutput('[*] Querying threat intelligence databases...', 'info');
    addOutput('', 'info');

    // Call the actual scan function (this will navigate to result page)
    onScan(scanType, value);
  };

  const handleGet = (args: string[]) => {
    const type = args[0]?.toLowerCase();
    const feed = args[1]?.toLowerCase();

    if (type !== '-feed') {
      addOutput('ERROR: Usage: get -feed [rss|ransomware]', 'error');
      return;
    }

    if (feed === 'rss') {
      addOutput('', 'info');
      addOutput('[*] Fetching latest RSS threat intelligence...', 'info');
      addOutput('This will navigate to the News Feed page', 'success');
      addOutput('', 'info');
      // Navigate to news feed - you'll need to add this
      // onNavigate('news');
    } else if (feed === 'ransomware') {
      addOutput('', 'info');
      addOutput('[*] Fetching ransomware victim intelligence...', 'info');
      addOutput('This will navigate to the News Feed (Ransomware filter)', 'success');
      addOutput('', 'info');
      // Navigate to news feed with ransomware filter
      // onNavigate('news');
    } else {
      addOutput('ERROR: Unknown feed type. Use: rss or ransomware', 'error');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommand(input);
      setInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(newIndex);
          setInput(commandHistory[newIndex]);
        }
      }
    }
  };

  const getTextColor = (type: string) => {
    switch (type) {
      case 'prompt': return 'text-[#00d9ff]';
      case 'command': return 'text-[#a5d8ff]';
      case 'success': return 'text-[#00ff41]';
      case 'error': return 'text-[#ff0080]';
      default: return 'text-[#a5d8ff]';
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Output Area */}
      <div 
        ref={outputRef}
        className="flex-1 overflow-y-auto pb-4 text-sm leading-relaxed"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#4a5568 transparent'
        }}
      >
        {output.map((line, i) => (
          <div key={i} className={`mb-2 ${getTextColor(line.type)}`}>
            {line.type === 'prompt' && <span className="text-[#00d9ff]" style={{ textShadow: '0 0 5px #00d9ff' }}>►</span>}
            {' '}{line.text}
          </div>
        ))}
      </div>

      {/* Input Area */}
      <div className="flex items-center gap-2 border-t border-[#4a5568] pt-2">
        <span className="text-[#00d9ff] text-sm" style={{ textShadow: '0 0 5px #00d9ff' }}>
          thamos6@neural-link:~$
        </span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent border-none outline-none text-[#a5d8ff] text-sm font-mono caret-[#00d9ff]"
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      <style>{`
        ::-webkit-scrollbar {
          width: 8px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: #4a5568;
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #64748b;
        }
      `}</style>
    </div>
  );
}
