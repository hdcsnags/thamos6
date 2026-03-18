import { useState, useRef, useEffect } from 'react';
import { useDesktop } from '../../contexts/DesktopContext';
import { parseFlags, type ScanFlags } from '../../lib/cliFlags';
import { palette, typography } from '../../design-system/tokens';

const COMMANDS = [
  'help', 'clear', 'history', 'status', 'scan', 'get', 'neofetch', 'nmap', 'whois', 'dig',
  'thamosx', 'thamosy', 'thamosz', 'workspace', 'open', 'projects', 'git', 'ls', 'pwd', 'exit', 'vps'
];

const AGENTS = {
  thamosx: { name: 'ThamOS-X', model: 'Claude Opus 4.6', color: palette.agentX, icon: '\u25C6' },
  thamosy: { name: 'ThamOS-Y', model: 'GPT-5', color: palette.agentY, icon: '\u25C7' },
  thamosz: { name: 'ThamOS-Z', model: 'Gemini Ultra', color: palette.agentZ, icon: '\u25CB' },
};

interface OutputLine {
  text: string;
  type: 'prompt' | 'command' | 'success' | 'error' | 'info' | 'agent';
  color?: string;
}

export function DesktopTerminal() {
  const desktop = useDesktop();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [tabCompletionIndex, setTabCompletionIndex] = useState(-1);
  const [tabCompletionOptions, setTabCompletionOptions] = useState<string[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    addOutput('ThamOS X Terminal v7.0', 'success');
    addOutput('\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501', 'success');
    addOutput('', 'info');
    addOutput('Type "help" for available commands', 'info');
    addOutput('Type "help scan" for scanning options', 'info');
    addOutput('', 'info');
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const addOutput = (text: string, type: OutputLine['type'] = 'info', color?: string) => {
    setOutput(prev => [...prev, { text, type, color }]);
  };

  const handleCommand = (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    setCommandHistory(prev => [...prev, trimmed]);
    setHistoryIndex(-1);
    setTabCompletionIndex(-1);
    setTabCompletionOptions([]);

    addOutput(`$ ${trimmed}`, 'command');

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
        if (args.length > 0 && (args[0] === '--help' || args[0] === '-h')) {
          showScanHelp();
        } else {
          handleScan(args);
        }
        break;

      case 'get':
        handleGet(args);
        break;

      case 'neofetch':
        showNeofetch();
        break;

      case 'nmap':
        handleNmap(args);
        break;

      case 'whois':
        handleWhois(args);
        break;

      case 'dig':
        handleDig(args);
        break;

      case 'thamosx':
      case 'thamosy':
      case 'thamosz':
        handleAgent(command.toLowerCase(), args.join(' '));
        break;

      case 'workspace':
        handleWorkspace(args);
        break;

      case 'open':
        handleOpen(args);
        break;

      case 'projects':
        showProjects();
        break;

      case 'git':
        handleGit(args);
        break;

      case 'ls':
        handleLs();
        break;

      case 'pwd':
        addOutput('/home/operator/thamos', 'info');
        addOutput('', 'info');
        break;

      case 'vps':
        handleVps(args);
        break;

      case 'exit':
        addOutput('Use the window controls to close the terminal', 'info');
        addOutput('', 'info');
        break;

      default:
        addOutput(`Command not found: ${command}`, 'error');
        addOutput('Type "help" for available commands', 'info');
        addOutput('', 'info');
    }
  };

  const showHelp = () => {
    addOutput('', 'info');
    addOutput('\u2501\u2501\u2501 AVAILABLE COMMANDS \u2501\u2501\u2501', 'success');
    addOutput('', 'info');
    addOutput('SCANNING & INTELLIGENCE:', 'success', palette.cyan);
    addOutput('  scan -ip [IP]          Scan IP address', 'info');
    addOutput('  scan -hash [HASH]      Scan file hash (MD5/SHA256)', 'info');
    addOutput('  scan -url [URL]        Scan URL for threats', 'info');
    addOutput('  scan -domain [DOM]     Scan domain and DNS', 'info');
    addOutput('  get -feed rss          Fetch RSS threat feed', 'info');
    addOutput('  get -feed ransomware   Fetch ransomware intel', 'info');
    addOutput('', 'info');
    addOutput('AI AGENT ROUTING:', 'success', palette.green);
    addOutput('  thamosx [query]        Route to Claude (deep analysis)', 'info');
    addOutput('  thamosy [query]        Route to GPT (code generation)', 'info');
    addOutput('  thamosz [query]        Route to Gemini (research)', 'info');
    addOutput('', 'info');
    addOutput('VPS:', 'success', palette.amber);
    addOutput('  vps                    Open VPS Terminal (LIVE mode)', 'info');
    addOutput('  vps status             VPS connection info', 'info');
    addOutput('', 'info');
    addOutput('DESKTOP & WINDOWS:', 'success', palette.teal);
    addOutput('  open [app]             Launch application window', 'info');
    addOutput('  workspace [1-4]        Switch to workspace', 'info');
    addOutput('  ls                     List available apps', 'info');
    addOutput('', 'info');
    addOutput('NETWORK TOOLS:', 'success', palette.amber);
    addOutput('  nmap [target]          Port scan simulation', 'info');
    addOutput('  whois [domain]         Domain lookup', 'info');
    addOutput('  dig [domain]           DNS query', 'info');
    addOutput('', 'info');
    addOutput('SYSTEM:', 'success', palette.textSecondary);
    addOutput('  neofetch               System information', 'info');
    addOutput('  projects               List GitHub projects', 'info');
    addOutput('  git status             Git repository status', 'info');
    addOutput('  status                 System status', 'info');
    addOutput('  history                Command history', 'info');
    addOutput('  clear                  Clear terminal', 'info');
    addOutput('  pwd                    Print working directory', 'info');
    addOutput('  help                   Show this help', 'info');
    addOutput('  help scan              Scan command reference', 'info');
    addOutput('', 'info');
  };

  const showScanHelp = () => {
    addOutput('', 'info');
    addOutput('\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501', 'success');
    addOutput('              SCAN COMMAND REFERENCE              ', 'success');
    addOutput('\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501', 'success');
    addOutput('', 'info');
    addOutput('USAGE:', 'success', palette.cyan);
    addOutput('  scan [TYPE] [VALUE] [FLAGS]', 'info');
    addOutput('', 'info');
    addOutput('SCAN TYPES:', 'success', palette.cyan);
    addOutput('  -ip [IP]               Scan IP address', 'info');
    addOutput('  -hash [HASH]           Scan file hash', 'info');
    addOutput('  -url [URL]             Scan URL', 'info');
    addOutput('  -domain [DOMAIN]       Scan domain', 'info');
    addOutput('', 'info');
    addOutput('FLAGS:', 'success', palette.cyan);
    addOutput('  -v, --verbose          Show all sections', 'info');
    addOutput('  --threats              Threat intel only', 'info');
    addOutput('  --network              Network info only', 'info');
    addOutput('  --vpn                  VPN/proxy detection only', 'info');
    addOutput('  --geo                  Geolocation only', 'info');
    addOutput('  --sources              Show raw source data', 'info');
    addOutput('  --json                 Raw JSON output', 'info');
    addOutput('', 'info');
    addOutput('EXAMPLES:', 'success', palette.cyan);
    addOutput('  scan -ip 8.8.8.8', 'info');
    addOutput('  scan -ip 8.8.8.8 -v', 'info');
    addOutput('  scan -hash abc123... --threats', 'info');
    addOutput('  scan -url https://example.com --json', 'info');
    addOutput('', 'info');
  };

  const showHistory = () => {
    addOutput('', 'info');
    addOutput('\u2501\u2501\u2501 COMMAND HISTORY \u2501\u2501\u2501', 'success');
    if (commandHistory.length === 0) {
      addOutput('  No commands in history', 'info');
    } else {
      commandHistory.forEach((cmd, i) => {
        addOutput(`  ${String(i + 1).padStart(3)} ${cmd}`, 'info');
      });
    }
    addOutput('', 'info');
  };

  const showStatus = () => {
    addOutput('', 'info');
    addOutput('\u2501\u2501\u2501 SYSTEM STATUS \u2501\u2501\u2501', 'success');
    addOutput('', 'info');
    addOutput('  Workspace:        ' + desktop.activeWorkspace, 'info');
    addOutput('  Open Windows:     ' + Object.keys(desktop.windows).length, 'info');
    addOutput('  API Status:       OPERATIONAL', 'success');
    addOutput('  Database:         CONNECTED', 'success');
    addOutput('  Threat Feeds:     ACTIVE', 'success');
    addOutput('', 'info');
    addOutput('AGENTS:', 'success', palette.green);
    Object.entries(AGENTS).forEach(([, agent]) => {
      addOutput(`  ${agent.icon} ${agent.name.padEnd(12)} ONLINE  ${agent.model}`, 'info', agent.color);
    });
    addOutput('', 'info');
  };

  const handleScan = (args: string[]) => {
    const { flags, remainingArgs } = parseFlags(args);
    const type = remainingArgs[0]?.toLowerCase();
    const value = remainingArgs.slice(1).join(' ');

    if (!type || !value) {
      addOutput('ERROR: Invalid syntax. Usage: scan -ip [IP] [FLAGS]', 'error');
      addOutput('Type "scan --help" for more information', 'info');
      addOutput('', 'info');
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
      addOutput('', 'info');
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

    addOutput('[*] Opening result window...', 'info');
    addOutput('', 'info');

    desktop.openWindow({
      appId: `${scanType}-result` as any,
      title: `${scanType.toUpperCase()}: ${value}`,
      data: { value, flags },
    });
  };

  const handleGet = (args: string[]) => {
    const type = args[0]?.toLowerCase();
    const feed = args[1]?.toLowerCase();

    if (type !== '-feed') {
      addOutput('ERROR: Usage: get -feed [rss|ransomware]', 'error');
      addOutput('', 'info');
      return;
    }

    addOutput('', 'info');
    if (feed === 'rss' || feed === 'ransomware') {
      addOutput(`[*] Opening ${feed} feed window...`, 'success');
      addOutput('', 'info');
      desktop.openWindow({
        appId: 'intel',
        title: feed === 'rss' ? 'RSS Threat Feed' : 'Ransomware Intel',
        data: { feed },
      });
    } else {
      addOutput('ERROR: Unknown feed type. Use: rss or ransomware', 'error');
      addOutput('', 'info');
    }
  };

  const showNeofetch = () => {
    addOutput('', 'info');
    addOutput('         \u2584\u2584\u2584\u2584\u2584\u2584\u2584\u2584       operator@thamos-x', 'success', palette.cyan);
    addOutput('      \u2584\u2584\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2584\u2584    \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500', 'success', palette.cyan);
    addOutput('    \u2584\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588   OS: ThamOS X v7.0', 'success', palette.cyan);
    addOutput('   \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u258C   Kernel: Neural-Link 6.0', 'info');
    addOutput('  \u2590\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588    Uptime: ' + Math.floor(performance.now() / 1000) + ' seconds', 'info');
    addOutput('  \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588    Shell: tsh 5.0', 'info');
    addOutput('  \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588    Terminal: ThamOS Terminal', 'info');
    addOutput('  \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u258C\u2590\u2588\u2588\u2588\u2588\u2588\u2588\u2588    Workspace: ' + desktop.activeWorkspace + '/4', 'info');
    addOutput('   \u2580\u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588\u2580    Windows: ' + Object.keys(desktop.windows).length, 'info');
    addOutput('      \u2580\u2580\u2580    \u2580\u2580\u2580       Theme: Kali Dark', 'info');
    addOutput('', 'info');
  };

  const handleNmap = (args: string[]) => {
    const target = args[0];
    if (!target) {
      addOutput('ERROR: Usage: nmap [target]', 'error');
      addOutput('', 'info');
      return;
    }

    addOutput('', 'info');
    addOutput(`Starting Nmap scan on ${target}...`, 'success');
    addOutput('', 'info');
    addOutput('PORT     STATE    SERVICE', 'info');
    addOutput('22/tcp   open     ssh', 'success');
    addOutput('80/tcp   open     http', 'success');
    addOutput('443/tcp  open     https', 'success');
    addOutput('3306/tcp filtered mysql', 'info', palette.amber);
    addOutput('8080/tcp open     http-proxy', 'success');
    addOutput('', 'info');
    addOutput('Nmap done: 1 IP address scanned in 2.43 seconds', 'info');
    addOutput('', 'info');
  };

  const handleWhois = (args: string[]) => {
    const domain = args[0];
    if (!domain) {
      addOutput('ERROR: Usage: whois [domain]', 'error');
      addOutput('', 'info');
      return;
    }

    addOutput('', 'info');
    addOutput(`WHOIS lookup for ${domain}:`, 'success');
    addOutput('', 'info');
    addOutput('Domain Name: ' + domain.toUpperCase(), 'info');
    addOutput('Registrar: Example Registrar, Inc.', 'info');
    addOutput('Created: 2020-01-15', 'info');
    addOutput('Expires: 2025-01-15', 'info');
    addOutput('Name Servers: ns1.example.com, ns2.example.com', 'info');
    addOutput('', 'info');
  };

  const handleDig = (args: string[]) => {
    const domain = args[0];
    if (!domain) {
      addOutput('ERROR: Usage: dig [domain]', 'error');
      addOutput('', 'info');
      return;
    }

    addOutput('', 'info');
    addOutput(`DNS query for ${domain}:`, 'success');
    addOutput('', 'info');
    addOutput('; ANSWER SECTION:', 'info');
    addOutput(`${domain}.    300    IN    A    104.21.45.67`, 'info');
    addOutput(`${domain}.    300    IN    A    172.67.154.89`, 'info');
    addOutput('', 'info');
    addOutput('; Query time: 23 msec', 'info');
    addOutput('', 'info');
  };

  const handleAgent = (agent: string, query: string) => {
    if (!query) {
      addOutput(`ERROR: Usage: ${agent} [query]`, 'error');
      addOutput('', 'info');
      return;
    }

    const agentInfo = AGENTS[agent as keyof typeof AGENTS];
    addOutput('', 'info');
    addOutput(`[*] Routing to ${agentInfo.name} (${agentInfo.model})...`, 'agent', agentInfo.color);
    addOutput(`[*] Query: ${query}`, 'info');
    addOutput('[*] Opening agent response window...', 'info');
    addOutput('', 'info');

    desktop.openWindow({
      appId: 'workshop',
      title: `${agentInfo.name} - ${query.substring(0, 30)}${query.length > 30 ? '...' : ''}`,
      data: { agent, query },
    });
  };

  const handleWorkspace = (args: string[]) => {
    const ws = parseInt(args[0]);
    if (isNaN(ws) || ws < 1 || ws > 4) {
      addOutput('ERROR: Usage: workspace [1-4]', 'error');
      addOutput('', 'info');
      return;
    }

    addOutput('', 'info');
    addOutput(`[*] Switching to workspace ${ws}...`, 'success');
    addOutput('', 'info');
    desktop.switchWorkspace(ws);
  };

  const handleOpen = (args: string[]) => {
    const app = args[0]?.toLowerCase();
    if (!app) {
      addOutput('ERROR: Usage: open [app]', 'error');
      addOutput('Available apps: terminal, scanner, browser, maestro, intel, cases, files, editor, monitor, settings', 'info');
      addOutput('', 'info');
      return;
    }

    const appMap: Record<string, { id: any; title: string }> = {
      terminal: { id: 'terminal', title: 'Terminal' },
      vps: { id: 'vps-terminal', title: 'VPS Terminal' },
      scanner: { id: 'scanner', title: 'Scanner' },
      browser: { id: 'browser', title: 'Browser' },
      maestro: { id: 'workshop', title: 'Maestro' },
      workshop: { id: 'workshop', title: 'Maestro' },
      intel: { id: 'intel', title: 'Intel Dashboard' },
      cases: { id: 'cases', title: 'Case Manager' },
      files: { id: 'files', title: 'File Manager' },
      editor: { id: 'editor', title: 'Code Editor' },
      monitor: { id: 'monitor', title: 'System Monitor' },
      settings: { id: 'settings', title: 'Settings' },
    };

    const appInfo = appMap[app];
    if (!appInfo) {
      addOutput(`ERROR: Unknown app: ${app}`, 'error');
      addOutput('Use "ls" to see available apps', 'info');
      addOutput('', 'info');
      return;
    }

    addOutput('', 'info');
    addOutput(`[*] Opening ${appInfo.title}...`, 'success');
    addOutput('', 'info');
    desktop.openWindow({ appId: appInfo.id as any, title: appInfo.title });
  };

  const showProjects = () => {
    addOutput('', 'info');
    addOutput('\u2501\u2501\u2501 GITHUB PROJECTS \u2501\u2501\u2501', 'success');
    addOutput('', 'info');
    addOutput('  thamos-x/threat-intel-platform     Main TI platform', 'info');
    addOutput('  thamos-x/extension-scanner         Chrome extension analyzer', 'info');
    addOutput('  thamos-x/neural-link-kernel        Custom kernel modules', 'info');
    addOutput('  thamos-x/agent-mesh-network        Multi-agent orchestration', 'info');
    addOutput('', 'info');
  };

  const handleGit = (args: string[]) => {
    const subcommand = args[0]?.toLowerCase();

    if (subcommand === 'status') {
      addOutput('', 'info');
      addOutput('On branch main', 'info');
      addOutput('Your branch is up to date with \'origin/main\'.', 'info');
      addOutput('', 'info');
      addOutput('nothing to commit, working tree clean', 'success');
      addOutput('', 'info');
    } else {
      addOutput('ERROR: Usage: git status', 'error');
      addOutput('', 'info');
    }
  };

  const handleVps = (args: string[]) => {
    const sub = args[0]?.toLowerCase();
    if (sub === 'status') {
      addOutput('', 'info');
      addOutput('VPS Terminal: Use "vps" to open a live terminal window', 'info');
      addOutput('Configure connection in Settings > VPS', 'info');
      addOutput('', 'info');
      return;
    }
    addOutput('', 'info');
    addOutput('[*] Opening VPS Terminal (LIVE mode)...', 'success', palette.amber);
    addOutput('', 'info');
    desktop.openWindow({ appId: 'vps-terminal', title: 'VPS Terminal' });
  };

  const handleLs = () => {
    addOutput('', 'info');
    addOutput('Available applications:', 'success');
    addOutput('', 'info');
    addOutput('  terminal     vps          scanner      browser', 'info', palette.cyan);
    addOutput('  maestro      intel        cases        files', 'info', palette.cyan);
    addOutput('  editor       monitor      settings', 'info', palette.cyan);
    addOutput('', 'info');
    addOutput('Use "open [app]" to launch', 'info');
    addOutput('', 'info');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommand(input);
      setInput('');
      setTabCompletionIndex(-1);
      setTabCompletionOptions([]);
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
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleTabCompletion();
    } else {
      setTabCompletionIndex(-1);
      setTabCompletionOptions([]);
    }
  };

  const handleTabCompletion = () => {
    const partial = input.toLowerCase();
    if (!partial) return;

    if (tabCompletionOptions.length === 0) {
      const matches = COMMANDS.filter(cmd => cmd.startsWith(partial));
      if (matches.length === 0) return;

      setTabCompletionOptions(matches);
      setTabCompletionIndex(0);
      setInput(matches[0]);
    } else {
      const nextIndex = (tabCompletionIndex + 1) % tabCompletionOptions.length;
      setTabCompletionIndex(nextIndex);
      setInput(tabCompletionOptions[nextIndex]);
    }
  };

  const getTextColor = (type: OutputLine['type'], customColor?: string) => {
    if (customColor) return customColor;
    switch (type) {
      case 'command': return '#a5d8ff';
      case 'success': return palette.green;
      case 'error': return palette.rose;
      case 'agent': return palette.cyan;
      default: return palette.textPrimary;
    }
  };

  return (
    <div
      className="h-full flex flex-col"
      style={{ backgroundColor: palette.void }}
      onClick={() => inputRef.current?.focus()}
    >
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto px-5 pt-4 pb-2 text-sm leading-relaxed"
        style={{ fontFamily: typography.mono }}
      >
        {output.map((line, i) => (
          <div key={i} className="mb-0.5" style={{ color: getTextColor(line.type, line.color) }}>
            {line.text || '\u00A0'}
          </div>
        ))}
      </div>

      <div
        className="flex items-center gap-2 px-5 py-3"
        style={{
          borderTop: `1px solid ${palette.borderSubtle}`,
          fontFamily: typography.mono,
        }}
      >
        <span className="text-sm font-bold" style={{ color: palette.green }}>\u279C</span>
        <span className="text-sm" style={{ color: palette.cyan }}>~</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent border-none outline-none text-sm"
          style={{
            color: palette.textPrimary,
            caretColor: palette.cyan,
            fontFamily: typography.mono,
          }}
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
        <span
          className="w-2 h-4 animate-pulse"
          style={{ backgroundColor: `${palette.cyan}80` }}
        />
      </div>

      <div
        className="flex items-center justify-between px-5 py-1.5"
        style={{
          backgroundColor: palette.elevated,
          borderTop: `1px solid ${palette.borderSubtle}`,
          fontFamily: typography.ui,
        }}
      >
        <div className="flex items-center gap-4" style={{ fontSize: '10px', color: palette.textDisabled }}>
          <span>tsh</span>
          <span>UTF-8</span>
          <span>workspace {desktop.activeWorkspace}</span>
        </div>
        <div className="flex items-center gap-4" style={{ fontSize: '10px', color: palette.textDisabled }}>
          <span>{commandHistory.length} cmds</span>
          <span>{Object.keys(desktop.windows).length} windows</span>
          <span
            className="px-1.5 py-0.5 rounded font-bold"
            style={{
              backgroundColor: palette.green + '15',
              color: palette.green,
              border: `1px solid ${palette.green}30`,
              fontSize: '9px',
            }}
          >
            SAFE
          </span>
        </div>
      </div>
    </div>
  );
}
