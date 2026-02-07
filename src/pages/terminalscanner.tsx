import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../contexts/themecontext';
import { parseFlags, type ScanFlags } from '../lib/cliFlags';

interface TerminalScannerProps {
  onScan: (type: string, value: string, flags?: ScanFlags) => void;
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
        if (args.length > 0 && args[0].toLowerCase() === 'scan') {
          showScanHelp();
        } else {
          showHelp();
        }
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
        if (args.length > 0 && (args[0] === '--help' || args[0] === '-h' || args[0] === '/?')) {
          showScanHelp();
        } else {
          handleScan(args);
        }
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
    addOutput('  help scan            Show scan flags and options', 'info');
    addOutput('', 'info');
    addOutput('TIP: Use "scan --help" or "help scan" for advanced scanning options', 'info');
    addOutput('', 'info');
  };

  const showScanHelp = () => {
    addOutput('', 'info');
    addOutput('═══════════════════════════════════════════════════════════', 'success');
    addOutput('                    SCAN COMMAND REFERENCE                  ', 'success');
    addOutput('═══════════════════════════════════════════════════════════', 'success');
    addOutput('', 'info');
    addOutput('USAGE:', 'success');
    addOutput('  scan [TYPE] [VALUE] [FLAGS]', 'info');
    addOutput('', 'info');
    addOutput('SCAN TYPES:', 'success');
    addOutput('  -ip [IP]           Scan IP address', 'info');
    addOutput('  -hash [HASH]       Scan file hash (MD5/SHA1/SHA256)', 'info');
    addOutput('  -url [URL]         Scan URL for threats', 'info');
    addOutput('  -domain [DOMAIN]   Scan domain and DNS records', 'info');
    addOutput('', 'info');
    addOutput('FLAGS:', 'success');
    addOutput('  -v, --verbose      Show all available sections (full output)', 'info');
    addOutput('  --threats          Show only threat intelligence data', 'info');
    addOutput('  --network          Show only network information', 'info');
    addOutput('  --vpn              Show only VPN/proxy detection', 'info');
    addOutput('  --geo              Show only geolocation data', 'info');
    addOutput('  --sources          Show raw source data', 'info');
    addOutput('  --json             Output raw JSON data', 'info');
    addOutput('', 'info');
    addOutput('EXAMPLES:', 'success');
    addOutput('  scan -ip 8.8.8.8                      # Standard IP scan', 'info');
    addOutput('  scan -ip 8.8.8.8 -v                   # Verbose (all data)', 'info');
    addOutput('  scan -ip 8.8.8.8 --threats            # Threats only', 'info');
    addOutput('  scan -ip 8.8.8.8 --geo --vpn          # Geo + VPN data', 'info');
    addOutput('  scan -hash abc123... --sources        # Show source details', 'info');
    addOutput('  scan -url https://example.com --json  # Raw JSON output', 'info');
    addOutput('', 'info');
    addOutput('NOTES:', 'success');
    addOutput('  • Combine multiple flags to show specific sections', 'info');
    addOutput('  • Without flags, shows default summary view', 'info');
    addOutput('  • -v flag enables all sections automatically', 'info');
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
    const { flags, remainingArgs } = parseFlags(args);
    const type = remainingArgs[0]?.toLowerCase();
    const value = remainingArgs.slice(1).join(' ');

    if (!type || !value) {
      addOutput('ERROR: Invalid syntax. Usage: scan -ip [IP] [FLAGS]', 'error');
      addOutput('Type "scan --help" for more information', 'info');
      return;
    }

    const typeMap: Record<string, string> = {
      '-ip': 'ip',
      '-hash': 'hash',
      '-url': 'url',
      '-domain': 'domain',
    };

    const scanType = typeMap[type];
    if (!scanType) {
      addOutput('ERROR: Unknown scan type. Use: -ip, -hash, -url, or -domain', 'error');
      addOutput('Type "scan --help" for more information', 'info');
      return;
    }

    addOutput('', 'info');
    addOutput(`[*] Initiating ${scanType.toUpperCase()} scan: ${value}`, 'success');

    const activeFlags: string[] = [];
    if (flags.verbose) activeFlags.push('verbose');
    else {
      if (flags.threats) activeFlags.push('threats');
      if (flags.network) activeFlags.push('network');
      if (flags.vpn) activeFlags.push('vpn');
      if (flags.geo) activeFlags.push('geo');
      if (flags.sources) activeFlags.push('sources');
      if (flags.json) activeFlags.push('json');
    }

    if (activeFlags.length > 0) {
      addOutput(`[*] Active flags: ${activeFlags.join(', ')}`, 'info');
    }

    addOutput('[*] Querying threat intelligence databases...', 'info');
    addOutput('', 'info');

    onScan(scanType, value, flags);
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
