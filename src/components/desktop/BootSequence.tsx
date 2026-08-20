import { useState, useEffect, useRef } from 'react';
import { palette, typography } from '../../design-system/tokens';

interface BootSequenceProps {
  onComplete: () => void;
}

interface BootMessage {
  text: string;
  delay?: number; // ms to wait AFTER this message
  status?: 'ok' | 'ready' | 'warn' | 'info';
}

const BOOT_MESSAGES: BootMessage[] = [
  { text: 'ThamOS T6 shell loading...', delay: 120, status: 'info' },
  { text: 'Design tokens — loaded', status: 'ok' },
  { text: 'App registry — mounted', status: 'ok' },
  { text: 'Session state — restored', status: 'ok' },
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
  ok: palette.green,
  ready: palette.cyan,
  warn: palette.amber,
  info: palette.textSecondary,
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
        backgroundColor: palette.void,
        fontFamily: typography.mono,
        fontSize: '12px',
        transition: 'opacity 500ms ease-out',
        opacity: fading ? 0 : 1,
      }}
    >
      <div className="w-full max-w-3xl px-8">
        {/* Logo */}
        <div className="mb-6">
          <div style={{ color: palette.textPrimary, fontSize: '22px', fontWeight: 700, letterSpacing: '-0.03em' }}>
            ThamOS <span style={{ color: palette.accent }}>T6</span>
          </div>
          <div style={{ color: palette.textTertiary, fontSize: '11px', marginTop: '2px' }}>
            Threat Analysis & Monitoring Operating System — v6
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
              <span style={{ color: palette.textDisabled, fontSize: '10px', minWidth: '22px' }}>
                {String(idx).padStart(2, '0')}
              </span>
              {msg.status && (
                <span style={{ color: statusColors[msg.status], fontSize: '10px', minWidth: '8px' }}>
                  {msg.status === 'ok' ? '\u2713' : msg.status === 'ready' ? '\u25CF' : msg.status === 'warn' ? '\u25B2' : '\u203A'}
                </span>
              )}
              <span style={{ color: msg.status === 'ready' ? palette.cyan : msg.status === 'warn' ? palette.amber : palette.textSecondary }}>
                {msg.text}
              </span>
            </div>
          ))}
          {/* Blinking cursor */}
          {!fading && (
            <div style={{ animation: 'bootBlink 1s step-end infinite' }}>
              <span style={{ color: palette.textSecondary }}>{'\u2588'}</span>
            </div>
          )}
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span style={{ color: palette.textTertiary, fontSize: '11px' }}>BOOT PROGRESS</span>
            <span style={{ color: palette.accent, fontSize: '11px' }}>{Math.floor(progress)}%</span>
          </div>
          <div className="h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: palette.surface }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress}%`,
                backgroundColor: palette.accent,
                transition: 'width 150ms ease-out',
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
