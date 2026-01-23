import { Shield, Calendar } from 'lucide-react';

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
  const getRiskColor = (level: string) => {
    switch (level) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-green-100 text-green-800 border-green-200';
    }
  };

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
    <div className="divide-y divide-slate-200">
      {analyses.map((analysis) => (
        <button
          key={analysis.id}
          onClick={() => onSelect(analysis)}
          className="w-full px-8 py-5 hover:bg-slate-50 transition-colors text-left group"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="mt-1">
                <Shield className="w-5 h-5 text-slate-400 group-hover:text-slate-600 transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                    {analysis.extension_name}
                  </h3>
                  <span className="text-sm text-slate-500 flex-shrink-0">
                    v{analysis.extension_version}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <Calendar className="w-4 h-4" />
                  <span>{formatDate(analysis.analyzed_at)}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 flex-shrink-0">
              <div className="text-right">
                <div className="text-2xl font-bold text-slate-900">{analysis.risk_score}</div>
                <div className={`mt-1 px-3 py-1 rounded-full text-xs font-bold uppercase border ${getRiskColor(analysis.risk_level)}`}>
                  {analysis.risk_level}
                </div>
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

export default AnalysisHistory;
