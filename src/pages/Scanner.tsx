import { useMemo, useState } from 'react';
import { AlertTriangle, Search } from 'lucide-react';
import { detectIOCType } from '../lib/iocDetection';

interface ScannerProps {
  onScan: (type: string, value: string) => void;
}

export default function Scanner({ onScan }: ScannerProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const detection = useMemo(() => {
    if (!input.trim()) return { type: 'unknown', normalizedValue: '' };
    return detectIOCType(input);
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!input.trim()) {
      setError('Please enter an IP, URL, domain, hash, or extension ID');
      return;
    }

    if (detection.type === 'unknown') {
      setError(
        'Unable to detect input type. Please enter a valid IP, URL, domain, hash, or Chrome extension ID.'
      );
      return;
    }

    onScan(detection.type, detection.normalizedValue);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      {/* Local styles (cursor blink + terminal shell) */}
      <style>{`
        @keyframes t6Blink { 0%,100%{opacity:1;} 50%{opacity:0;} }
        .t6-cursor {
          width: 10px; height: 18px;
          border-radius: 2px;
          background: rgba(34,211,238,0.85);
          display: inline-block;
          animation: t6Blink 1s infinite;
        }
        .t6-terminal {
          background: rgba(2, 6, 23, 0.70);
          border: 1px solid rgba(148,163,184,0.12);
          box-shadow: 0 30px 140px rgba(0,0,0,0.78);
          transition: border-color .2s ease, transform .2s ease, box-shadow .2s ease;
        }
        .t6-terminal:focus-within{
          border-color: rgba(34,211,238,0.22);
          box-shadow: 0 36px 170px rgba(0,0,0,0.82);
          transform: translateY(-1px);
        }
      `}</style>

      <div className="py-10 sm:py-12">
        {/* One-liner only */}
        <p className="text-center text-sm sm:text-base text-slate-400">
          Paste IP, URL, hash, domain, or Chrome extension ID for fast intelligence correlation & analysis.
        </p>

        {/* Terminal scanner */}
        <form onSubmit={handleSubmit} className="mt-7 flex justify-center">
          <div className="t6-terminal w-full max-w-5xl rounded-2xl overflow-hidden">
            {/* Top chrome */}
            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
              <div className="h-2.5 w-2.5 rounded-full bg-white/14" />
              <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
            </div>

            {/* Input row */}
            <div className="px-5 py-5 flex items-center gap-3">
              <span className="font-mono text-cyan-300 font-bold">{'>_'}</span>

              {/* Input (wide, clean) */}
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setError('');
                  }}
                  onKeyDown={(e) => {
                    // Enter submits naturally via form, but keep this to prevent weird multiline behavior in some browsers
                    if (e.key === 'Enter') {
                      // Let form submit
                    }
                  }}
                  placeholder="awaiting_input..."
                  className="w-full bg-transparent outline-none border-none font-mono text-sm sm:text-base text-slate-200 placeholder:text-slate-500 caret-cyan-300"
                  autoComplete="off"
                  spellCheck={false}
                />

                {/* Only show the block cursor when empty (keeps it clean) */}
                {!input.trim() && <span className="t6-cursor" aria-hidden="true" />}
              </div>

              {/* Analyze icon button */}
              <button
                type="submit"
                className="h-11 w-11 rounded-xl border border-slate-600/20 bg-slate-900/30 hover:bg-slate-900/50 hover:border-slate-600/30 transition-all grid place-items-center"
                title="Analyze"
              >
                <Search className="w-5 h-5 text-slate-200/90" />
              </button>
            </div>

            {/* Micro status line */}
            <div className="px-5 pb-5 text-[11px] font-mono flex flex-wrap gap-4 text-slate-400">
              <span>
                SOURCES: <span className="text-slate-200">13+</span>
              </span>
              <span>
                LATENCY: <span className="text-slate-200">24MS</span>
              </span>
              <span className="text-emerald-200">SYSTEM: ONLINE</span>
            </div>
          </div>
        </form>

        {/* Error (only when needed) */}
        {error && (
          <div className="mt-4 max-w-5xl mx-auto flex items-start gap-2 text-red-300 text-sm bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Nothing else on this page by design (clean intake only) */}
      </div>
    </div>
  );
}
