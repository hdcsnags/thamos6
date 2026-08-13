import { useState } from 'react';
import { Copy, Check, FileJson } from 'lucide-react';
import { palette, typography } from '../../design-system/tokens';

interface SummaryActionsProps {
  /** Plain-text analyst summary put on the clipboard. */
  getSummary: () => string;
  /** Object serialised to JSON for the clipboard. */
  getJson: () => unknown;
}

/** Copy Summary / Copy JSON action row shared by result pages. */
export function SummaryActions({ getSummary, getJson }: SummaryActionsProps) {
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const copy = (text: string, done: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    done(true);
    setTimeout(() => done(false), 2000);
  };

  const buttonStyle = {
    background: palette.float,
    border: `1px solid ${palette.borderDefault}`,
    color: palette.textSecondary,
    fontFamily: typography.ui,
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => copy(getSummary(), setCopiedSummary)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors hover:brightness-125"
        style={buttonStyle}
      >
        {copiedSummary ? <Check className="w-3.5 h-3.5" style={{ color: palette.green }} /> : <Copy className="w-3.5 h-3.5" />}
        Copy summary
      </button>
      <button
        onClick={() => copy(JSON.stringify(getJson(), null, 2), setCopiedJson)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors hover:brightness-125"
        style={buttonStyle}
      >
        {copiedJson ? <Check className="w-3.5 h-3.5" style={{ color: palette.green }} /> : <FileJson className="w-3.5 h-3.5" />}
        Copy JSON
      </button>
    </div>
  );
}
