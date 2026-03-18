import { useState, useEffect, useRef } from 'react';

interface BootSequenceProps {
  onComplete: () => void;
}

interface BootMessage {
  text: string;
  delay?: number; // ms to wait AFTER this message
  status?: 'ok' | 'ready' | 'warn' | 'info';
}

const BOOT_MESSAGES: BootMessage[] = [
  { text: 'ThamOS X Kernel v7.0.0 loading...', delay: 120, status: 'info' },
  { text: 'CPU: 16 cores @ 5.2 GHz — verified', status: 'ok' },
  { text: 'Memory: 64 GB DDR5 — allocated', status: 'ok' },
  { text: 'Initializing threat intelligence mesh...', delay: 200, status: 'info' },
  { text: 'VirusTotal engine linked', status: 'ok' },
  { text: 'AbuseIPDB engine linked', status: 'ok' },
  { text: 'URLScan engine linked', status: 'ok' },
  { text: 'Shodan engine linked', status: 'ok' },
  { text: 'OTX AlienVault engine linked', status: 'ok' },
  { text: 'Connecting to Supabase backend...', delay: 180 },
  { text: 'Database connection pool — established', status: 'ok' },
  { text: 'Auth service — verified', status: 'ok' },
  { text: 'Loading agent mesh network...', delay: 250, status: 'info' },
  { text: 'ThamOS-X (Claude) ................. ONLINE', status: 'ready' },
  { text: 'ThamOS-Y (GPT) .................... ONLINE', delay: 80, status: 'ready' },
  { text: 'ThamOS-Z (Gemini) ................. ONLINE', delay: 80, status: 'ready' },
  { text: 'Initializing workspace manager', status: 'ok' },
  { text: 'Desktop compositor — loaded', status: 'ok' },
  { text: 'Window manager — started', status: 'ok' },
  { text: 'Mounting threat feeds...', delay: 150 },
  { text: 'RSS aggregator — active', status: 'ok' },
  { text: 'VPS tunnel — standby', status: 'warn' },
  { text: 'Layout engine — ready', status: 'ok' },
  { text: '', delay: 100 },
  { text: 'All systems nominal. Entering desktop.', delay: 400, status: 'ready' },
];

const statusColors: Record<string, string> = {
  ok: '#00ff9d',
  ready: '#00d9ff',
  warn: '#fbbf24',
  info: '#8a8fa8',
};

export function BootSequence({ onComplete }: BootSequenceProps) {
  const [messages, setMessages] = useState<BootMessage[]>([]);
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bootKey = 'thamos-desktop-boot-shown';
    const hasBooted = sessionStorage.getItem(bootKey);

    if (hasBooted) {
      onComplete();
      return;
    }

    let cancelled = false;
    const total = BOOT_MESSAGES.length;

    const run = async () => {
      for (let i = 0; i < total; i++) {
        if (cancelled) return;
        const msg = BOOT_MESSAGES[i];

        setMessages(prev => [...prev, msg]);
        setProgress(((i + 1) / total) * 100);

        // Auto-scroll
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }

        const wait = msg.delay ?? 50;
        await new Promise(r => setTimeout(r, wait));
      }

      if (!cancelled) {
        sessionStorage.setItem(bootKey, 'true');
        setFading(true);
        setTimeout(onComplete, 500);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [onComplete]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{
        backgroundColor: '#050508',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: '12px',
        transition: 'opacity 500ms ease-out',
        opacity: fading ? 0 : 1,
      }}
    >
      {/* Scanline overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-[101]"
        style={{
          background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.03) 0px, rgba(0,0,0,0.03) 1px, transparent 1px, transparent 2px)',
        }}
      />

      <div className="w-full max-w-3xl px-8">
        {/* Logo */}
        <div className="mb-6">
          <div style={{ color: '#00d9ff', fontSize: '22px', fontWeight: 700, letterSpacing: '-0.03em' }}>
            ThamOS<span style={{ color: '#00ff9d' }}>X</span>
          </div>
          <div style={{ color: '#3a3f55', fontSize: '11px', marginTop: '2px' }}>
            Threat Analysis & Monitoring Operating System — v7.0.0
          </div>
        </div>

        {/* Messages */}
        <div
          ref={containerRef}
          className="space-y-0.5 mb-6 overflow-hidden"
          style={{ maxHeight: '420px' }}
        >
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2"
              style={{ animation: 'bootFadeIn 0.15s ease-out' }}
            >
              <span style={{ color: '#2a2f45', fontSize: '10px', minWidth: '22px' }}>
                {String(idx).padStart(2, '0')}
              </span>
              {msg.status && (
                <span style={{ color: statusColors[msg.status], fontSize: '10px', minWidth: '8px' }}>
                  {msg.status === 'ok' ? '\u2713' : msg.status === 'ready' ? '\u25CF' : msg.status === 'warn' ? '\u25B2' : '\u203A'}
                </span>
              )}
              <span style={{ color: msg.status === 'ready' ? '#00d9ff' : msg.status === 'warn' ? '#fbbf24' : '#00ff9d' }}>
                {msg.text}
              </span>
            </div>
          ))}
          {/* Blinking cursor */}
          {!fading && (
            <div style={{ animation: 'bootBlink 1s step-end infinite' }}>
              <span style={{ color: '#00ff9d' }}>{'\u2588'}</span>
            </div>
          )}
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span style={{ color: '#64748b', fontSize: '11px' }}>BOOT PROGRESS</span>
            <span style={{ color: '#00d9ff', fontSize: '11px' }}>{Math.floor(progress)}%</span>
          </div>
          <div className="h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: '#1a1f35' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #00ff9d 0%, #00d9ff 60%, #00b4d8 100%)',
                transition: 'width 150ms ease-out',
                boxShadow: '0 0 8px rgba(0, 217, 255, 0.3)',
              }}
            />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bootFadeIn {
          from { opacity: 0; transform: translateY(-2px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bootBlink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
