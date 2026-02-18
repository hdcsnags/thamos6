import { useState, useCallback } from 'react';
import Scanner from '../../pages/Scanner';
import { DesktopIPResult } from './DesktopIPResult';
import { DesktopURLResult } from './DesktopURLResult';
import { DesktopDomainResult } from './DesktopDomainResult';
import { DesktopHashResult } from './DesktopHashResult';
import { palette, typography } from '../../design-system/tokens';
import type { ScanFlags } from '../../lib/cliFlags';
import { ArrowLeft } from 'lucide-react';

interface ScanState {
  type: string;
  value: string;
  flags: ScanFlags;
}

export function DesktopScanner() {
  const [scanState, setScanState] = useState<ScanState | null>(null);

  const handleScan = useCallback((type: string, value: string) => {
    const flags: ScanFlags = {
      verbose: true,
      threats: true,
      network: true,
      vpn: true,
      geo: true,
      sources: true,
      json: false,
    };
    setScanState({ type, value, flags });
  }, []);

  const handleBack = useCallback(() => {
    setScanState(null);
  }, []);

  if (!scanState) {
    return <Scanner onScan={handleScan} />;
  }

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: palette.void }}>
      <div
        className="flex items-center gap-3 px-4 h-10 shrink-0"
        style={{
          backgroundColor: palette.elevated,
          borderBottom: `1px solid ${palette.borderSubtle}`,
          fontFamily: typography.ui,
        }}
      >
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-2.5 py-1 rounded-md transition-colors"
          style={{ color: palette.cyan, fontSize: '12px', fontWeight: 500 }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${palette.cyan}10`; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Scanner
        </button>
        <div className="w-px h-4" style={{ backgroundColor: palette.borderDefault }} />
        <span
          style={{
            fontSize: '11px',
            fontFamily: typography.mono,
            color: palette.textTertiary,
          }}
        >
          {scanState.type.toUpperCase()}: {scanState.value.length > 50 ? scanState.value.slice(0, 50) + '...' : scanState.value}
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        {scanState.type === 'ip' && (
          <DesktopIPResult ip={scanState.value} flags={scanState.flags} />
        )}
        {scanState.type === 'url' && (
          <DesktopURLResult url={scanState.value} flags={scanState.flags} />
        )}
        {scanState.type === 'domain' && (
          <DesktopDomainResult domain={scanState.value} flags={scanState.flags} />
        )}
        {scanState.type === 'hash' && (
          <DesktopHashResult hash={scanState.value} flags={scanState.flags} />
        )}
      </div>
    </div>
  );
}
