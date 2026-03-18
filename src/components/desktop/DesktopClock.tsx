import { useState, useEffect } from 'react';
import { palette, typography } from '../../design-system/tokens';

export function DesktopClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      className="fixed bottom-16 right-6 pointer-events-none select-none z-[5]"
      style={{ fontFamily: typography.mono }}
    >
      <div className="text-right">
        <div
          className="tabular-nums"
          style={{
            fontSize: '48px',
            fontWeight: 200,
            color: palette.textPrimary,
            opacity: 0.08,
            lineHeight: 1,
            letterSpacing: '-0.04em',
          }}
        >
          {timeStr}
        </div>
        <div
          style={{
            fontSize: '14px',
            fontWeight: 400,
            color: palette.textTertiary,
            opacity: 0.15,
            marginTop: '2px',
            letterSpacing: '0.05em',
          }}
        >
          {dateStr.toUpperCase()}
        </div>
      </div>
    </div>
  );
}
