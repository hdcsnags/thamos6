import { useState, useEffect } from 'react';

interface BootSequenceProps {
  onComplete: () => void;
}

const BOOT_MESSAGES = [
  'ThamOS X Kernel v7.0.0 loading...',
  'Initializing threat intelligence mesh...',
  'Loading VirusTotal integration... OK',
  'Loading AbuseIPDB integration... OK',
  'Loading URLScan integration... OK',
  'Loading Shodan integration... OK',
  'Connecting to Supabase backend... OK',
  'Authenticating user session... OK',
  'Loading agent mesh network...',
  'ThamOS-X (Claude) status: READY',
  'ThamOS-Y (GPT) status: READY',
  'ThamOS-Z (Gemini) status: READY',
  'Initializing workspace manager...',
  'Loading desktop compositor...',
  'Mounting threat feeds... OK',
  'Starting window manager... OK',
  'System ready.',
];

export function BootSequence({ onComplete }: BootSequenceProps) {
  const [messages, setMessages] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const bootKey = 'thamos-desktop-boot-shown';
    const hasBooted = sessionStorage.getItem(bootKey);

    if (hasBooted) {
      onComplete();
      return;
    }

    let currentIndex = 0;
    const totalMessages = BOOT_MESSAGES.length;

    const interval = setInterval(() => {
      if (currentIndex < totalMessages) {
        setMessages(prev => [...prev, BOOT_MESSAGES[currentIndex]]);
        setProgress(((currentIndex + 1) / totalMessages) * 100);
        currentIndex++;
      } else {
        clearInterval(interval);
        sessionStorage.setItem(bootKey, 'true');
        setTimeout(onComplete, 300);
      }
    }, 60);

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center font-mono text-sm"
      style={{
        backgroundColor: '#060610',
        color: '#00ff9d',
      }}
    >
      <div className="w-full max-w-3xl px-8">
        <div className="mb-8 text-2xl font-bold" style={{ color: '#00d9ff' }}>
          ThamOS X v7.0
        </div>

        <div className="space-y-1 mb-8 h-96 overflow-hidden">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className="animate-[fadeIn_0.2s_ease-in]"
              style={{
                animation: 'fadeIn 0.2s ease-in',
              }}
            >
              <span style={{ color: '#3a3f55' }}>[{String(idx).padStart(2, '0')}]</span>{' '}
              <span>{msg}</span>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span style={{ color: '#8a8fa8' }}>Boot Progress:</span>
            <span style={{ color: '#00d9ff' }}>{Math.floor(progress)}%</span>
          </div>
          <div
            className="h-1 rounded-full overflow-hidden"
            style={{ backgroundColor: '#1a1f35' }}
          >
            <div
              className="h-full transition-all duration-300 rounded-full"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(to right, #00ff9d, #00d9ff)',
              }}
            />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
