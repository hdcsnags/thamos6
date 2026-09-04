import { palette, typography, accentBg } from '../design-system/tokens';
import { scoreColor } from './scanner/verdictStyles';

interface ThreatScoreProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

function scoreLabel(score: number): string {
  if (score >= 70) return 'High risk';
  if (score >= 40) return 'Suspicious';
  if (score >= 20) return 'Low risk';
  return 'Clean';
}

export default function ThreatScore({ score, size = 'md', showLabel = true }: ThreatScoreProps) {
  const color = scoreColor(score);
  const clamped = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));

  const sizeClasses = {
    sm: { container: 'w-16 h-16', text: 'text-lg', label: 'text-xs' },
    md: { container: 'w-24 h-24', text: 'text-2xl', label: 'text-sm' },
    lg: { container: 'w-32 h-32', text: 'text-4xl', label: 'text-base' },
  };

  const classes = sizeClasses[size];

  return (
    <div className="flex flex-col items-center gap-2" style={{ fontFamily: typography.ui }}>
      <div
        className={`${classes.container} rounded-full flex items-center justify-center`}
        style={{
          // Filled arc = score; the remainder is the neutral track.
          background: `conic-gradient(${color} ${clamped}%, ${palette.surface} 0)`,
          boxShadow: `0 0 0 4px ${accentBg(color, 0.18)}`,
        }}
      >
        <div
          className="w-[85%] h-[85%] rounded-full flex items-center justify-center"
          style={{ background: palette.base }}
        >
          <span className={`${classes.text} font-bold tabular-nums`} style={{ color }}>{score}</span>
        </div>
      </div>
      {showLabel && (
        <span className={`${classes.label} font-medium`} style={{ color }}>{scoreLabel(score)}</span>
      )}
    </div>
  );
}

export function ThreatBadge({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold tabular-nums"
      style={{
        color,
        background: accentBg(color, 0.12),
        border: `1px solid ${accentBg(color, 0.28)}`,
        fontFamily: typography.ui,
      }}
    >
      {score}
    </span>
  );
}
