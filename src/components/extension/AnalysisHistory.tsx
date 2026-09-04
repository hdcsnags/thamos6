import { Shield, Calendar } from 'lucide-react';
import { palette, typography } from '../../design-system/tokens';
import { Pill } from '../../components/results';
import { riskTone } from './extensionTones';

interface Analysis {
  id: string;
  extension_id: string;
  extension_name: string;
  extension_version: string;
  extension_url: string;
  risk_score: number;
  risk_level: string;
  manifest_data: any;
  analysis_summary: string;
  analyzed_at: string;
}

interface Props {
  analyses: Analysis[];
  onSelect: (analysis: Analysis) => void;
}

function AnalysisHistory({ analyses, onSelect }: Props) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  return (
    <div style={{ fontFamily: typography.ui }}>
      {analyses.map((analysis, idx) => (
        <button
          key={analysis.id}
          onClick={() => onSelect(analysis)}
          className="w-full px-5 py-3.5 text-left transition-colors hover:brightness-125"
          style={{
            background: palette.base,
            borderTop: idx === 0 ? 'none' : `1px solid ${palette.borderSubtle}`,
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <Shield className="w-4 h-4 mt-0.5 shrink-0" style={{ color: palette.textTertiary }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h3 className="text-sm font-semibold truncate" style={{ color: palette.textPrimary }}>
                    {analysis.extension_name}
                  </h3>
                  <span className="text-xs shrink-0" style={{ color: palette.textTertiary }}>
                    v{analysis.extension_version}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs" style={{ color: palette.textTertiary }}>
                  <Calendar className="w-3 h-3" />
                  <span>{formatDate(analysis.analyzed_at)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-lg font-semibold tabular-nums" style={{ color: palette.textPrimary }}>
                {analysis.risk_score}
              </span>
              <Pill label={analysis.risk_level} tone={riskTone(analysis.risk_level)} />
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

export default AnalysisHistory;
