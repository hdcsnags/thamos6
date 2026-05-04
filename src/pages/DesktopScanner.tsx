import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../contexts/themecontext';
import { parseFlags, type ScanFlags } from '../lib/cliFlags';

const AGENTS = {
  thamosx: { name: 'ThamOS-X', model: 'Claude Opus 4.6', color: '#00ff9d', icon: '\u25C6' },
  thamosy: { name: 'ThamOS-Y', model: 'GPT-5', color: '#fbbf24', icon: '\u25C7' },
  thamosz: { name: 'ThamOS-Z', model: 'Gemini Ultra', color: '#00d9ff', icon: '\u25CB' },
};

const P = {
  green: '#00ff9d',
  textLight: '#c8cde0',
  pink: '#f43f5e',
  dim: '#3a3f55',
  amber: '#fbbf24',
  cyan: '#00d9ff',
  blue: '#00b4d8',
  purple: '#a855f7',
};

interface DesktopScannerProps {
  onScan: (type: string, value: string, flags?: ScanFlags) => void;
  onAgentCall?: (agent: string, query: string) => void;
}

type LineType = 'prompt' | 'command' | 'success' | 'error' | 'info' | 'agent' | 'header' | 'dim' | 'scan' | 'help' | 'project' | 'git' | 'neo' | 'status';

interface OutputLine {
  text: string;
  type: LineType;
  color?: string;
}

export default function DesktopScanner({ onScan, onAgentCall }: DesktopScannerProps) {
  const { setTheme } = useTheme();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    addLines([
      { text: '', type: 'info' },
      { text: '╔══════════════════════════════════════════════════════╗', type: 'header' },
      { text: '║   ThamOS — Desktop Threat Intelligence Terminal    ║', type: 'header' },
      { text: '╚══════════════════════════════════════════════════════╝', type: 'header' },
      { text: '', type: 'info' },
      { text: 'Type "help" for commands. Invoke agents: thamosx, thamosy, thamosz', type: 'dim' },
      { text: '', type: 'info' },
    ]);
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const addLines = (lines: OutputLine[]) => {
    setOutput(prev => [...prev, ...lines]);
  };

  const handleCommand = (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    setCommandHistory(prev => [...prev, trimmed]);
    setHistoryIndex(-1);
    addLines([{ text: `thamos@desktop:~$ ${trimmed}`, type: 'command' }]);

    const [command, ...args] = trimmed.split(' ');
    const argsStr = args.join(' ');

    switch (command.toLowerCase()) {
      case 'help':
        if (args[0]?.toLowerCase() === 'scan') showScanHelp();
        else showHelp();
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
        if (args[0] === '--help' || args[0] === '-h') showScanHelp();
        else handleScan(args);
        break;
      case 'neofetch':
        showNeofetch();
        break;
      case 'projects':
        showProjects();
        break;
      case 'nmap':
        handleNmap(argsStr);
        break;
      case 'whois':
        handleWhois(argsStr);
        break;
      case 'git':
        handleGit(args);
        break;
      case 'get':
        handleGet(args);
        break;
      case 'startx':
      case 'tactical':
        addLines([
          { text: '', type: 'info' },
          { text: '[*] Switching to TACTICAL mode...', type: 'success' },
        ]);
        setTimeout(() => setTheme('tactical'), 400);
        break;
      case 'terminal':
        addLines([
          { text: '', type: 'info' },
          { text: '[*] Switching to TERMINAL mode...', type: 'success' },
        ]);
        setTimeout(() => setTheme('terminal'), 400);
        break;
      case 'thamosx':
      case 'thamosy':
      case 'thamosz':
        handleAgentCommand(command.toLowerCase(), argsStr);
        break;
      default:
        addLines([
          { text: `tsh: command not found: ${command}`, type: 'error' },
          { text: 'Type "help" for available commands', type: 'dim' },
        ]);
    }
  };

  // ─── Command Handlers ───────────────────────────────────────

  const showHelp = () => {
    addLines([
      { text: '', type: 'info' },
      { text: '╔════════════════════════════════════════════════════════╗', type: 'help' },
      { text: '║  ThamOS X — Command Reference                         ║', type: 'help' },
      { text: '╠════════════════════════════════════════════════════════╣', type: 'help' },
      { text: '║  AGENTS                                                ║', type: 'help' },
      { text: '║    thamosx <query>    Claude Opus — deep analysis      ║', type: 'help' },
      { text: '║    thamosy <query>    GPT-5 — code & debug             ║', type: 'help' },
      { text: '║    thamosz <query>    Gemini — research & recon         ║', type: 'help' },
      { text: '║                                                        ║', type: 'help' },
      { text: '║  SCANNING                                              ║', type: 'help' },
      { text: '║    scan -ip <addr>    IP threat intelligence            ║', type: 'help' },
      { text: '║    scan -hash <hash>  Hash lookup (MD5/SHA)             ║', type: 'help' },
      { text: '║    scan -url <url>    URL threat scan                   ║', type: 'help' },
      { text: '║    scan -domain <dom> Domain reconnaissance             ║', type: 'help' },
      { text: '║                                                        ║', type: 'help' },
      { text: '║  TOOLS                                                 ║', type: 'help' },
      { text: '║    nmap <target>      Quick port scan                   ║', type: 'help' },
      { text: '║    whois <domain>     WHOIS lookup                      ║', type: 'help' },
      { text: '║    git status         GitHub repo status                ║', type: 'help' },
      { text: '║    projects           List active projects              ║', type: 'help' },
      { text: '║                                                        ║', type: 'help' },
      { text: '║  SYSTEM                                                ║', type: 'help' },
      { text: '║    neofetch           System info                       ║', type: 'help' },
      { text: '║    status             Service health                    ║', type: 'help' },
      { text: '║    history            Command history                   ║', type: 'help' },
      { text: '║    clear              Clear terminal                    ║', type: 'help' },
      { text: '║    tactical           Switch to tactical theme          ║', type: 'help' },
      { text: '║    terminal           Switch to terminal theme          ║', type: 'help' },
      { text: '║    help scan          Scan flags reference              ║', type: 'help' },
      { text: '╚════════════════════════════════════════════════════════╝', type: 'help' },
    ]);
  };

  const showScanHelp = () => {
    addLines([
      { text: '', type: 'info' },
      { text: 'SCAN COMMAND REFERENCE', type: 'header' },
      { text: '', type: 'info' },
      { text: 'USAGE: scan [TYPE] [VALUE] [FLAGS]', type: 'success' },
      { text: '', type: 'info' },
      { text: 'TYPES:', type: 'success' },
      { text: '  -ip <addr>       IP address scan', type: 'info' },
      { text: '  -hash <hash>     File hash (MD5/SHA1/SHA256)', type: 'info' },
      { text: '  -url <url>       URL threat scan', type: 'info' },
      { text: '  -domain <dom>    Domain recon', type: 'info' },
      { text: '', type: 'info' },
      { text: 'FLAGS:', type: 'success' },
      { text: '  -v, --verbose    Show all sections', type: 'info' },
      { text: '  --threats        Threat intel only', type: 'info' },
      { text: '  --network        Network info only', type: 'info' },
      { text: '  --vpn            VPN/proxy detection', type: 'info' },
      { text: '  --geo            Geolocation only', type: 'info' },
      { text: '  --sources        Raw source data', type: 'info' },
      { text: '  --json           JSON output', type: 'info' },
      { text: '', type: 'info' },
      { text: 'EXAMPLES:', type: 'success' },
      { text: '  scan -ip 8.8.8.8 -v', type: 'info' },
      { text: '  scan -hash abc123... --sources', type: 'info' },
      { text: '  scan -url https://example.com --json', type: 'info' },
      { text: '', type: 'info' },
    ]);
  };

  const showHistory = () => {
    addLines([
      { text: '', type: 'info' },
      { text: 'COMMAND HISTORY:', type: 'header' },
      ...commandHistory.map((cmd, i) => ({ text: `  ${i + 1}. ${cmd}`, type: 'info' as LineType })),
      { text: '', type: 'info' },
    ]);
  };

  const showStatus = () => {
    addLines([
      { text: '', type: 'info' },
      { text: '╔═══ SERVICE STATUS ═══════════════════════╗', type: 'status' },
      { text: '║  ● API Gateway         OPERATIONAL      ║', type: 'success' },
      { text: '║  ● VirusTotal          CONNECTED         ║', type: 'success' },
      { text: '║  ● AbuseIPDB           CONNECTED         ║', type: 'success' },
      { text: '║  ● Spamhaus RBL        CONNECTED         ║', type: 'success' },
      { text: '║  ● AlienVault OTX      CONNECTED         ║', type: 'success' },
      { text: '║  ● Agent Mesh          ALL ONLINE         ║', type: 'success' },
      { text: '║  ● GitHub API          AUTHENTICATED      ║', type: 'success' },
      { text: '╚═════════════════════════════════════════╝', type: 'status' },
    ]);
  };

  const showNeofetch = () => {
    addLines([
      { text: '', type: 'info' },
      { text: '        ▄▄▄▄▄▄▄▄▄▄        thamos@workstation', type: 'neo' },
      { text: '      ▄█░░░░░░░░░░█▄      ──────────────────────', type: 'neo' },
      { text: '    ▄█░░████████░░░░█▄    OS:      ThamOS X v7.0.0', type: 'neo' },
      { text: '    █░░██      ██░░░░█    Kernel:  thamos-sec-7.0', type: 'neo' },
      { text: '    █░░████████░░░░░░█    Shell:   tsh 5.0.0', type: 'neo' },
      { text: '    █░░░░░░░░░░░░░░░░█    WM:      ThamOS Desktop', type: 'neo' },
      { text: '      ▀█░░░░░░░░░░█▀      Agents:  3 (X/Y/Z)', type: 'neo' },
      { text: '        ▀▀▀▀▀▀▀▀▀▀        GitHub:  Connected (23 repos)', type: 'neo' },
      { text: '', type: 'info' },
    ]);
  };

  const showProjects = () => {
    addLines([
      { text: '', type: 'info' },
      { text: '┌─── Active Projects ─────────────────────────────────┐', type: 'project' },
      { text: '│  ◆ Mikaylah        nextjs / vercel         [active] │', type: 'project' },
      { text: '│  ◆ ThamOS-6        react / gh-pages        [active] │', type: 'project' },
      { text: '│  ◆ ThamOS-X        react / desktop-env     [dev]    │', type: 'project' },
      { text: '│  ◆ FortiHunter     python / internal       [active] │', type: 'project' },
      { text: '│  ◆ CTF-Toolkit     kali / scripts          [idle]   │', type: 'project' },
      { text: '└─────────────────────────────────────────────────────┘', type: 'project' },
    ]);
  };

  const handleScan = (args: string[]) => {
    const { flags, remainingArgs } = parseFlags(args);
    const type = remainingArgs[0]?.toLowerCase();
    const value = remainingArgs.slice(1).join(' ');

    if (!type || !value) {
      addLines([
        { text: 'Usage: scan -ip <addr> | scan -hash <hash> | scan -url <url> | scan -domain <dom>', type: 'error' },
        { text: 'Type "scan --help" for more information', type: 'dim' },
      ]);
      return;
    }

    const typeMap: Record<string, string> = { '-ip': 'ip', '-hash': 'hash', '-url': 'url', '-domain': 'domain' };
    const scanType = typeMap[type];

    if (!scanType) {
      addLines([
        { text: 'Unknown scan type. Use: -ip, -hash, -url, or -domain', type: 'error' },
      ]);
      return;
    }

    addLines([
      { text: '', type: 'info' },
      { text: `[*] Initiating ${scanType.toUpperCase()} scan: ${value}`, type: 'scan' },
      { text: '[*] Querying threat intelligence databases...', type: 'dim' },
      { text: '', type: 'info' },
    ]);

    onScan(scanType, value, flags);
  };

  const handleNmap = (target: string) => {
    if (!target) {
      addLines([{ text: 'Usage: nmap <target>', type: 'error' }]);
      return;
    }
    addLines([
      { text: '', type: 'info' },
      { text: `Starting ThamOS-Nmap 7.94`, type: 'dim' },
      { text: `[*] Scanning ${target}...`, type: 'scan' },
      { text: `[+] Host ${target} is UP (latency: ${(Math.random() * 20 + 5).toFixed(1)}ms)`, type: 'scan' },
      { text: '', type: 'info' },
      { text: 'PORT      STATE   SERVICE        VERSION', type: 'info' },
      { text: '22/tcp    open    ssh            OpenSSH 8.9', type: 'scan' },
      { text: '80/tcp    open    http           nginx 1.24', type: 'scan' },
      { text: '443/tcp   open    https          nginx 1.24', type: 'scan' },
      { text: '8080/tcp  open    http-proxy     Squid 5.7', type: 'scan' },
      { text: '', type: 'info' },
      { text: '[*] Scan complete. 4 ports open.', type: 'scan' },
    ]);
  };

  const handleWhois = (domain: string) => {
    if (!domain) {
      addLines([{ text: 'Usage: whois <domain>', type: 'error' }]);
      return;
    }
    addLines([
      { text: `[*] Querying WHOIS for ${domain}...`, type: 'scan' },
      { text: `Domain: ${domain}`, type: 'info' },
      { text: 'Registrar: Cloudflare, Inc.', type: 'info' },
      { text: 'Created: 2021-03-15', type: 'info' },
      { text: 'Expires: 2026-03-15', type: 'info' },
      { text: 'Name Servers: ns1.cloudflare.com, ns2.cloudflare.com', type: 'info' },
    ]);
  };

  const handleGit = (_args: string[]) => {
    addLines([
      { text: '[git] Connecting to GitHub as @thamos...', type: 'git' },
      { text: '[git] Repositories: 23 public, 8 private', type: 'git' },
      { text: '[git] Latest commit: ThamOS-X desktop-env (12 min ago)', type: 'git' },
      { text: '[git] Open PRs: 3 | Issues: 7 | Actions: All passing', type: 'git' },
    ]);
  };

  const handleGet = (args: string[]) => {
    const type = args[0]?.toLowerCase();
    const feed = args[1]?.toLowerCase();
    if (type !== '-feed') {
      addLines([{ text: 'Usage: get -feed [rss|ransomware]', type: 'error' }]);
      return;
    }
    if (feed === 'rss' || feed === 'ransomware') {
      addLines([
        { text: `[*] Fetching ${feed} threat intelligence...`, type: 'scan' },
        { text: 'Navigate to Intel Stream for live feed', type: 'success' },
      ]);
    } else {
      addLines([{ text: 'Unknown feed. Use: rss or ransomware', type: 'error' }]);
    }
  };

  const handleAgentCommand = (agent: string, query: string) => {
    if (!query) {
      addLines([{ text: `Usage: ${agent} <your question or task>`, type: 'error' }]);
      return;
    }
    const a = AGENTS[agent];
    addLines([
      { text: '', type: 'info' },
      { text: `${a.icon} Routing to ${a.name} (${a.model})...`, type: 'agent', color: a.color },
      { text: `${a.icon} "${query}"`, type: 'agent', color: a.color },
      { text: `${a.icon} Response window opened.`, type: 'agent', color: a.color },
    ]);
    if (onAgentCall) onAgentCall(agent, query);
  };

  // ─── Key Handler ────────────────────────────────────────────

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
        if (newIndex >= commandHistory.length) { setHistoryIndex(-1); setInput(''); }
        else { setHistoryIndex(newIndex); setInput(commandHistory[newIndex]); }
      }
    }
  };

  // ─── Color Map ──────────────────────────────────────────────

  const colorMap: Record<string, string> = {
    prompt: P.green, command: P.textLight, success: P.green, error: P.pink,
    info: P.textLight, agent: P.green, header: P.cyan, dim: P.dim,
    scan: P.amber, help: P.blue, project: P.green, git: P.purple,
    neo: P.cyan, status: P.cyan,
  };

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col" style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
      <div
        ref={outputRef}
        onClick={() => inputRef.current?.focus()}
        className="flex-1 overflow-y-auto pb-4 cursor-text"
        style={{ padding: 14, scrollbarWidth: 'thin', scrollbarColor: `${P.border} transparent` }}
      >
        {output.map((line, i) => (
          <div key={i} style={{
            color: line.color || colorMap[line.type] || P.text,
            fontSize: 12.5, lineHeight: 1.75, whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
          }}>
            {line.text}
          </div>
        ))}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        borderTop: `1px solid ${P.border}`, padding: '8px 14px',
      }}>
        <span style={{ color: P.green, fontSize: 12.5 }}>thamos</span>
        <span style={{ color: P.dim, fontSize: 12.5 }}>@</span>
        <span style={{ color: P.cyan, fontSize: 12.5 }}>desktop</span>
        <span style={{ color: P.dim, fontSize: 12.5 }}>:~$&nbsp;</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: P.textLight, fontSize: 12.5, fontFamily: 'inherit',
            caretColor: P.green, padding: 0,
          }}
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
      </div>
    </div>
  );
}
