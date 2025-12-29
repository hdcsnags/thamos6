interface ThreatScoreProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export default function ThreatScore({ score, size = 'md', showLabel = true }: ThreatScoreProps) {
  const getColorClass = () => {
    if (score >= 70) return { bg: 'bg-red-500', text: 'text-red-400', ring: 'ring-red-500/30' };
    if (score >= 40) return { bg: 'bg-orange-500', text: 'text-orange-400', ring: 'ring-orange-500/30' };
    if (score >= 20) return { bg: 'bg-yellow-500', text: 'text-yellow-400', ring: 'ring-yellow-500/30' };
    return { bg: 'bg-emerald-500', text: 'text-emerald-400', ring: 'ring-emerald-500/30' };
  };

  const getLabel = () => {
    if (score >= 70) return 'High Risk';
    if (score >= 40) return 'Suspicious';
    if (score >= 20) return 'Low Risk';
    return 'Clean';
  };

  const colors = getColorClass();

  const sizeClasses = {
    sm: { container: 'w-16 h-16', text: 'text-lg', label: 'text-xs' },
    md: { container: 'w-24 h-24', text: 'text-2xl', label: 'text-sm' },
    lg: { container: 'w-32 h-32', text: 'text-4xl', label: 'text-base' },
  };

  const classes = sizeClasses[size];

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`${classes.container} rounded-full flex items-center justify-center ring-4 ${colors.ring} bg-slate-800`}
        style={{
          background: `conic-gradient(${colors.bg.replace('bg-', 'rgb(var(--')} ${score}%, transparent 0)`,
        }}
      >
        <div className="w-[85%] h-[85%] rounded-full bg-slate-900 flex items-center justify-center">
          <span className={`${classes.text} font-bold ${colors.text}`}>{score}</span>
        </div>
      </div>
      {showLabel && (
        <span className={`${classes.label} font-medium ${colors.text}`}>{getLabel()}</span>
      )}
    </div>
  );
}

export function ThreatBadge({ score }: { score: number }) {
  const getStyle = () => {
    if (score >= 70) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (score >= 40) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    if (score >= 20) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStyle()}`}>
      {score}
    </span>
  );
}
