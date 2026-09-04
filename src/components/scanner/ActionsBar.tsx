import { Copy, FileJson, Star, FileText, Check } from 'lucide-react';
import { useState } from 'react';
import { palette, typography } from '../../design-system/tokens';
import { toneBg, toneBorder, toneColor } from '../results/resultTokens';

interface ActionsBarProps {
  summary: string;
  jsonData: any;
  iocValue: string;
  onAddToWatchlist?: () => void;
  onAddCaseNote?: () => void;
}

const neutralButton = {
  color: palette.textSecondary,
  background: palette.elevated,
  border: `1px solid ${palette.borderDefault}`,
  fontFamily: typography.ui,
} as const;

const accentButton = {
  color: palette.accent,
  background: toneBg('accent', 0.12),
  border: `1px solid ${toneBorder('accent')}`,
  fontFamily: typography.ui,
} as const;

export default function ActionsBar({
  summary,
  jsonData,
  iocValue,
  onAddToWatchlist,
  onAddCaseNote
}: ActionsBarProps) {
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const handleCopySummary = () => {
    navigator.clipboard.writeText(summary);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  return (
    <div
      className="sticky top-20 z-40 py-3 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      style={{ background: palette.base, borderBottom: `1px solid ${palette.borderDefault}` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className="text-xs truncate min-w-0"
          style={{ color: palette.textTertiary, fontFamily: typography.mono }}
          title={iocValue}
        >
          {iocValue}
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={handleCopySummary}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-xs font-medium"
            style={neutralButton}
          >
            {copiedSummary ? (
              <Check className="w-3.5 h-3.5" style={{ color: toneColor.good }} />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>Copy summary</span>
          </button>
          <button
            onClick={handleCopyJson}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-xs font-medium"
            style={neutralButton}
          >
            {copiedJson ? (
              <Check className="w-3.5 h-3.5" style={{ color: toneColor.good }} />
            ) : (
              <FileJson className="w-3.5 h-3.5" />
            )}
            <span>Copy JSON</span>
          </button>
          {onAddToWatchlist && (
            <button
              onClick={onAddToWatchlist}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-xs font-medium"
              style={accentButton}
            >
              <Star className="w-3.5 h-3.5" />
              <span>Add to watchlist</span>
            </button>
          )}
          {onAddCaseNote && (
            <button
              onClick={onAddCaseNote}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-xs font-medium"
              style={accentButton}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Add case note</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
