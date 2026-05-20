import { useState, useCallback } from 'react';
import Scanner from '../../pages/Scanner';
import IPResult from '../../pages/results/IPResult';
import URLResult from '../../pages/results/URLResult';
import DomainResult from '../../pages/results/DomainResult';
import HashResult from '../../pages/results/HashResult';
import { palette, typography } from '../../design-system/tokens';
import { ArrowLeft } from 'lucide-react';

interface ScanState {
  type: string;
  value: string;
}

interface DesktopScannerProps {
  initialScan?: ScanState;
}

export function DesktopScanner({ initialScan }: DesktopScannerProps = {}) {
  const [scanState, setScanState] = useState<ScanState | null>(initialScan ?? null);

  const handleScan = useCallback((type: string, value: string) => {
    setScanState({ type, value });
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
        {scanState.type === 'ip' && <IPResult ip={scanState.value} />}
        {scanState.type === 'url' && <URLResult url={scanState.value} />}
        {scanState.type === 'domain' && <DomainResult domain={scanState.value} />}
        {scanState.type === 'hash' && <HashResult hash={scanState.value} />}
        {!['ip', 'url', 'domain', 'hash'].includes(scanState.type) && (
          <div className="h-full flex items-center justify-center" style={{ backgroundColor: palette.void }}>
            <div className="text-center space-y-2">
              <div className="text-2xl opacity-20">⬡</div>
              <p style={{ fontSize: '12px', fontFamily: typography.mono, color: palette.textTertiary }}>
                {scanState.type.toUpperCase()} scan: {scanState.value}
              </p>
              <p style={{ fontSize: '11px', color: palette.textTertiary }}>
                Result page for this IOC type is coming soon
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
