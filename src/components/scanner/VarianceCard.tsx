import { AlertTriangle } from 'lucide-react';

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
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
      <div className="flex items-start gap-3 mb-4">
        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="text-base font-semibold text-amber-400 mb-1">
            Source Variance Detected
          </h3>
          <p className="text-sm text-amber-200/80">
            Different sources provided conflicting information for some fields
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {variances.map((variance, index) => (
          <div
            key={index}
            className="bg-slate-900/50 rounded-lg border border-amber-500/20 p-3"
          >
            <h4 className="text-sm font-semibold text-slate-200 mb-2">
              {variance.field}
            </h4>
            <div className="space-y-2">
              {variance.values.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-slate-400">{item.source}:</span>
                  <span className="text-white font-medium">{item.value}</span>
                </div>
              ))}
            </div>
            {variance.recommendation && (
              <p className="text-xs text-amber-300 mt-2 pt-2 border-t border-amber-500/20">
                {variance.recommendation}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
