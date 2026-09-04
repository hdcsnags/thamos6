import { Check, Loader2, AlertTriangle, X } from 'lucide-react';
import { palette, typography } from '../../design-system/tokens';
import { type Tone, toneColor, toneBg, toneBorder, cardStyle } from '../results/resultTokens';

export type SourceState = 'pending' | 'loading' | 'success' | 'error' | 'disabled';

export interface Source {
  name: string;
  state: SourceState;
  icon: React.ElementType;
}

interface SourceStatusProps {
  sources: Source[];
}

// Only real outcomes get semantic color: success is green, error is rose.
// Pending / disabled stay neutral; loading uses accent for motion.
const STATE_TONE: Record<SourceState, Tone> = {
  pending: 'neutral',
  loading: 'accent',
  success: 'good',
  error: 'danger',
  disabled: 'neutral',
};

const STATE_LABEL: Record<SourceState, string> = {
  pending: 'Pending',
  loading: 'Loading',
  success: 'OK',
  error: 'Error',
  disabled: 'Not configured',
};

function StateIcon({ state }: { state: SourceState }) {
  switch (state) {
    case 'loading':
      return <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: toneColor.accent }} />;
    case 'success':
      return <Check className="w-3.5 h-3.5" style={{ color: toneColor.good }} />;
    case 'error':
      return <AlertTriangle className="w-3.5 h-3.5" style={{ color: toneColor.danger }} />;
    case 'disabled':
      return <X className="w-3.5 h-3.5" style={{ color: palette.textDisabled }} />;
    default:
      return <div className="w-3.5 h-3.5 rounded-full" style={{ border: `2px solid ${palette.borderActive}` }} />;
  }
}

export default function SourceStatus({ sources }: SourceStatusProps) {
  return (
    <div
      className="flex items-center gap-3 p-4 overflow-x-auto"
      style={{ ...cardStyle, fontFamily: typography.ui }}
    >
      <span className="text-xs font-medium whitespace-nowrap" style={{ color: palette.textTertiary }}>
        Sources
      </span>
      <div className="flex items-center gap-2">
        {sources.map((source) => {
          const Icon = source.icon;
          const tone = STATE_TONE[source.state];
          const disabled = source.state === 'disabled';
          return (
            <div
              key={source.name}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors"
              style={{
                background: toneBg(tone, 0.08),
                border: `1px solid ${toneBorder(tone, 0.24)}`,
                opacity: disabled ? 0.7 : 1,
              }}
              title={`${source.name}: ${STATE_LABEL[source.state]}`}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: palette.textTertiary }} />
              <span
                className="text-xs font-medium whitespace-nowrap"
                style={{ color: disabled ? palette.textTertiary : palette.textSecondary }}
              >
                {source.name}
              </span>
              <StateIcon state={source.state} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
