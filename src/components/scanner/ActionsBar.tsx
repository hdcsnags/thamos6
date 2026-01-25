import { Copy, FileJson, Star, FileText, Check } from 'lucide-react';
import { useState } from 'react';

interface ActionsBarProps {
  summary: string;
  jsonData: any;
  iocValue: string;
  onAddToWatchlist?: () => void;
  onAddCaseNote?: () => void;
}

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
    <div className="sticky top-20 z-40 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 py-3 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          onClick={handleCopySummary}
          className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-lg transition-all text-sm font-medium"
        >
          {copiedSummary ? (
            <Check className="w-4 h-4 text-green-400" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
          <span>Copy Summary</span>
        </button>
        <button
          onClick={handleCopyJson}
          className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-lg transition-all text-sm font-medium"
        >
          {copiedJson ? (
            <Check className="w-4 h-4 text-green-400" />
          ) : (
            <FileJson className="w-4 h-4" />
          )}
          <span>Copy JSON</span>
        </button>
        {onAddToWatchlist && (
          <button
            onClick={onAddToWatchlist}
            className="flex items-center gap-2 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-white rounded-lg transition-all text-sm font-medium"
          >
            <Star className="w-4 h-4" />
            <span>Add to Watchlist</span>
          </button>
        )}
        {onAddCaseNote && (
          <button
            onClick={onAddCaseNote}
            className="flex items-center gap-2 px-3 py-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg transition-all text-sm font-medium"
          >
            <FileText className="w-4 h-4" />
            <span>Add Case Note</span>
          </button>
        )}
      </div>
    </div>
  );
}
