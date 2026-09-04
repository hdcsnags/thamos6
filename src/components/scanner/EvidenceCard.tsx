import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { palette, typography, accentBg } from '../../design-system/tokens';
import { cardStyle, toneColor } from '../results/resultTokens';

interface EvidenceCardProps {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  badge?: string;
  /**
   * Legacy Tailwind hue name ('cyan' | 'emerald' | 'amber' | 'rose' | ...) or a
   * kit tone name. Mapped onto palette tokens; unknown values fall back to accent.
   */
  badgeColor?: string;
}

const BADGE_COLOR: Record<string, string> = {
  cyan: palette.cyan,
  sky: palette.cyan,
  blue: palette.blue,
  accent: palette.accent,
  emerald: toneColor.good,
  green: toneColor.good,
  good: toneColor.good,
  amber: toneColor.warn,
  yellow: toneColor.warn,
  orange: palette.orange,
  warn: toneColor.warn,
  rose: toneColor.danger,
  red: toneColor.danger,
  danger: toneColor.danger,
  slate: palette.textSecondary,
  gray: palette.textSecondary,
  neutral: palette.textSecondary,
};

export default function EvidenceCard({
  title,
  icon: Icon,
  children,
  defaultExpanded = true,
  badge,
  badgeColor = 'cyan'
}: EvidenceCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [hover, setHover] = useState(false);
  const color = BADGE_COLOR[badgeColor] ?? palette.accent;

  return (
    <div className="overflow-hidden" style={{ ...cardStyle, fontFamily: typography.ui }}>
      <button
        onClick={() => setExpanded(!expanded)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="w-full flex items-center justify-between p-4 transition-colors"
        style={{ background: hover ? palette.elevated : 'transparent' }}
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-md" style={{ background: accentBg(color, 0.12) }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
          <h3 className="text-sm font-semibold" style={{ color: palette.textPrimary }}>
            {title}
          </h3>
          {badge && (
            <span
              className="px-2 py-0.5 text-[11px] font-medium rounded-md"
              style={{ color, background: accentBg(color, 0.12), border: `1px solid ${accentBg(color, 0.28)}` }}
            >
              {badge}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4" style={{ color: palette.textTertiary }} />
        ) : (
          <ChevronDown className="w-4 h-4" style={{ color: palette.textTertiary }} />
        )}
      </button>
      {expanded && (
        <div className="p-4" style={{ borderTop: `1px solid ${palette.borderSubtle}` }}>
          {children}
        </div>
      )}
    </div>
  );
}
