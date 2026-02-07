import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/themecontext';
import type { Page } from './Layout';

interface TerminalLayoutProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  children: React.ReactNode;
}

export default function TerminalLayout({ currentPage, onNavigate, children }: TerminalLayoutProps) {
  const { user, signOut } = useAuth();
  const { setTheme } = useTheme();
  const [sessionId] = useState(() => 'NL-' + Math.random().toString(36).substr(2, 9).toUpperCase());
  const [uptime, setUptime] = useState('00:00:00');
  const sessionStartTime = useRef(Date.now());
  const [showBoot, setShowBoot] = useState(true);
  const [bootText, setBootText] = useState<string[]>([]);

  // Boot sequence
  useEffect(() => {
    const bootMessages = [
      '[  0.000000] Initializing THAMOS6 Neural Link...',
      '[  0.123456] Loading kernel modules... <span class="text-green-400">OK</span>',
      '[  0.234567] Mounting encrypted filesystems... <span class="text-green-400">OK</span>',
      '[  0.345678] Starting threat intelligence services... <span class="text-green-400">OK</span>',
      '[  0.456789] Connecting to global IOC database... <span class="text-green-400">OK</span>',
      '[  0.567890] Initializing VirusTotal API... <span class="text-green-400">OK</span>',
      '[  0.678901] Loading AlienVault OTX feeds... <span class="text-green-400">OK</span>',
      '[  0.789012] Spamhaus RBL connection established... <span class="text-green-400">OK</span>',
      '[  0.890123] AbuseIPDB API initialized... <span class="text-green-400">OK</span>',
      '[  1.001234] Starting neural pattern matching... <span class="text-green-400">OK</span>',
      '[  1.112345] Loading machine learning models... <span class="text-green-400">OK</span>',
      '[  1.223456] Quantum encryption enabled... <span class="text-green-400">OK</span>',
      '[  1.334567] All systems operational.',
      '',
      '<span class="text-green-400 font-bold">BOOT SEQUENCE COMPLETE</span>',
    ];

    let index = 0;
    const interval = setInterval(() => {
      if (index < bootMessages.length) {
        setBootText(prev => [...prev, bootMessages[index]]);
        index++;
      } else {
        clearInterval(interval);
        setTimeout(() => setShowBoot(false), 1000);
      }
    }, 50);

    return () => clearInterval(interval);
  }, []);

  // Uptime counter
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStartTime.current) / 1000);
      const hours = String(Math.floor(elapsed / 3600)).padStart(2, '0');
      const minutes = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
      const seconds = String(elapsed % 60).padStart(2, '0');
      setUptime(`${hours}:${minutes}:${seconds}`);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-screen overflow-hidden bg-[#0a0e1a] text-[#a5d8ff] font-mono">
      {/* CRT Effects */}
      <div className="fixed inset-0 pointer-events-none z-[1000] opacity-50">
        <div 
          className="w-full h-full"
          style={{
            background: 'linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.15))',
            backgroundSize: '100% 4px'
          }}
        />
      </div>

      {/* CRT Glow */}
      <div 
        className="fixed inset-[-10px] pointer-events-none z-0"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(0, 217, 255, 0.1) 0%, transparent 70%)'
        }}
      />

      {/* Boot Sequence Overlay */}
      {showBoot && (
        <div 
          className="fixed inset-0 bg-[#0a0e1a] z-[9999] p-10 overflow-y-auto text-sm transition-opacity duration-500"
          style={{ opacity: showBoot ? 1 : 0 }}
        >
          {bootText.map((line, i) => (
            <div 
              key={i} 
              className="text-green-400 mb-1"
              dangerouslySetInnerHTML={{ __html: line }}
            />
          ))}
        </div>
      )}

      {/* Theme Toggle Button */}
      <button
        onClick={() => {
          setTheme('tactical');
          onNavigate('scanner');
        }}
        className="fixed top-5 right-5 z-[100] px-4 py-2 border border-[#00d9ff] text-[#00d9ff] hover:bg-[#00d9ff] hover:text-[#0a0e1a] transition-all text-xs uppercase font-bold"
        style={{ textShadow: '0 0 5px #00d9ff' }}
      >
        [ SWITCH TO TACTICAL MODE ]
      </button>

      {/* Main Container */}
      <div className="relative z-10 h-screen flex flex-col p-5">
        {/* Header */}
        <header className="border-b border-[#4a5568] pb-2 mb-5 text-xs">
          <div className="flex justify-between items-center">
            <div className="flex gap-8">
              <div>
                <span className="text-[#4a5568]">USER:</span>
                <span className="text-[#00d9ff] ml-2">
                  {user?.email?.split('@')[0].toUpperCase() || 'OPERATIVE_001'}
                </span>
              </div>
              <div>
                <span className="text-[#4a5568]">SESSION:</span>
                <span className="text-[#a5d8ff] ml-2">{sessionId}</span>
              </div>
            </div>
            <div className="flex gap-8">
              <div>
                <span className="text-[#4a5568]">SYS:</span>
                <span className="text-[#00ff41] ml-2">ONLINE</span>
              </div>
              <div>
                <span className="text-[#4a5568]">UPTIME:</span>
                <span className="text-[#a5d8ff] ml-2">{uptime}</span>
              </div>
              {user && (
                <button 
                  onClick={signOut}
                  className="text-[#4a5568] hover:text-[#ff0080] transition-colors"
                >
                  LOGOUT
                </button>
              )}
            </div>
          </div>
        </header>

        {/* ASCII Logo */}
        <pre className="text-[10px] leading-none text-[#00d9ff] mb-5 select-none" style={{ textShadow: '0 0 10px #00d9ff' }}>
{` ████████╗██╗  ██╗ █████╗ ███╗   ███╗ ██████╗ ███████╗ ██████╗ 
 ╚══██╔══╝██║  ██║██╔══██╗████╗ ████║██╔═══██╗██╔════╝██╔════╝ 
    ██║   ███████║███████║██╔████╔██║██║   ██║███████╗███████╗ 
    ██║   ██╔══██║██╔══██║██║╚██╔╝██║██║   ██║╚════██║██╔═══██╗
    ██║   ██║  ██║██║  ██║██║ ╚═╝ ██║╚██████╔╝███████║╚██████╔╝
    ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚══════╝ ╚═════╝ 
                    NEURAL LINK v2.4.7`}
        </pre>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>

      {/* Screen Flicker Animation */}
      <style>{`
        @keyframes flicker {
          0% { opacity: 0.98; }
          50% { opacity: 0.96; }
          100% { opacity: 0.98; }
        }
        body {
          animation: flicker 0.15s infinite;
        }
        ::selection {
          background: #00d9ff;
          color: #0a0e1a;
        }
      `}</style>
    </div>
  );
}
