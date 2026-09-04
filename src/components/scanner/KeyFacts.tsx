import { palette, typography } from '../../design-system/tokens';
import { cardStyle } from '../results/resultTokens';

interface KeyFactsProps {
  facts: { label: string; value: string; icon?: React.ReactNode }[];
}

export default function KeyFacts({ facts }: KeyFactsProps) {
  return (
    <div className="grid grid-cols-1 @xl:grid-cols-2 @3xl:grid-cols-3 gap-3" style={{ fontFamily: typography.ui }}>
      {facts.map((fact, index) => (
        <div key={index} className="p-4" style={cardStyle}>
          <div className="flex items-center gap-1.5 mb-1" style={{ color: palette.textTertiary }}>
            {fact.icon}
            <span className="text-[11px] font-medium" style={{ letterSpacing: '0.02em' }}>
              {fact.label}
            </span>
          </div>
          <p
            className="text-base font-semibold break-all leading-snug"
            style={{ color: fact.value ? palette.textPrimary : palette.textTertiary }}
          >
            {fact.value || 'N/A'}
          </p>
        </div>
      ))}
    </div>
  );
}
