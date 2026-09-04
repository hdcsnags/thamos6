import { AlertTriangle } from 'lucide-react';
import { palette, typography } from '../../design-system/tokens';
import { toneBg, toneBorder, toneColor } from '../results/resultTokens';

interface Variance {
  field: string;
  values: { source: string; value: string }[];
  recommendation?: string;
}

interface VarianceCardProps {
  variances: Variance[];
}

export default function VarianceCard({ variances }: VarianceCardProps) {
  if (variances.length === 0) return null;

  return (
    <div
      className="p-4"
      style={{
        background: toneBg('warn', 0.07),
        border: `1px solid ${toneBorder('warn')}`,
        borderRadius: '9px',
        fontFamily: typography.ui,
      }}
    >
      <div className="flex items-start gap-3 mb-4">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: toneColor.warn }} />
        <div>
          <h3 className="text-sm font-semibold mb-0.5" style={{ color: toneColor.warn }}>
            Source variance detected
          </h3>
          <p className="text-xs" style={{ color: palette.textSecondary }}>
            Different sources provided conflicting information for some fields.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {variances.map((variance, index) => (
          <div
            key={index}
            className="rounded-lg p-3"
            style={{ background: palette.base, border: `1px solid ${palette.borderDefault}` }}
          >
            <h4 className="text-sm font-semibold mb-2" style={{ color: palette.textPrimary }}>
              {variance.field}
            </h4>
            <div className="space-y-1.5">
              {variance.values.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 text-sm">
                  <span style={{ color: palette.textSecondary }}>{item.source}</span>
                  <span
                    className="font-medium text-right break-all text-xs"
                    style={{ color: palette.textPrimary, fontFamily: typography.mono }}
                  >
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
            {variance.recommendation && (
              <p
                className="text-xs mt-2 pt-2"
                style={{ color: palette.textSecondary, borderTop: `1px solid ${palette.borderSubtle}` }}
              >
                {variance.recommendation}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
