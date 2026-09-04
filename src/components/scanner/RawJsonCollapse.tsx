import { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { palette, typography } from '../../design-system/tokens';
import { cardStyle, toneColor } from '../results/resultTokens';

interface RawJsonCollapseProps {
  data: any;
  title?: string;
}

export default function RawJsonCollapse({ data, title = 'Raw JSON data' }: RawJsonCollapseProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hover, setHover] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="overflow-hidden" style={{ ...cardStyle, fontFamily: typography.ui }}>
      <div
        className="w-full flex items-center justify-between p-4 transition-colors"
        style={{ background: hover ? palette.elevated : 'transparent' }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center justify-between text-left"
        >
          <span className="text-sm font-medium" style={{ color: palette.textPrimary }}>{title}</span>
          {expanded ? (
            <ChevronUp className="w-4 h-4" style={{ color: palette.textTertiary }} />
          ) : (
            <ChevronDown className="w-4 h-4" style={{ color: palette.textTertiary }} />
          )}
        </button>
        {expanded && (
          <button
            onClick={handleCopy}
            className="ml-2 p-1.5 rounded-md transition-colors"
            style={{ border: `1px solid ${palette.borderDefault}` }}
            title="Copy JSON"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5" style={{ color: toneColor.good }} />
            ) : (
              <Copy className="w-3.5 h-3.5" style={{ color: palette.textSecondary }} />
            )}
          </button>
        )}
      </div>
      {expanded && (
        <div style={{ borderTop: `1px solid ${palette.borderSubtle}` }}>
          <pre
            className="p-4 overflow-auto max-h-96"
            style={{
              background: palette.void,
              color: palette.textSecondary,
              fontFamily: typography.mono,
              fontSize: '11px',
              lineHeight: 1.5,
            }}
          >
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
