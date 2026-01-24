import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

interface EvidenceCardProps {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  badge?: string;
  badgeColor?: string;
}

export default function EvidenceCard({
  title,
  icon: Icon,
  children,
  defaultExpanded = true,
  badge,
  badgeColor = 'cyan'
}: EvidenceCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 bg-${badgeColor}-500/20 rounded-lg`}>
            <Icon className={`w-5 h-5 text-${badgeColor}-400`} />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {title}
          </h3>
          {badge && (
            <span className={`px-2 py-1 text-xs font-medium rounded-lg bg-${badgeColor}-500/20 text-${badgeColor}-400`}>
              {badge}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-slate-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400" />
        )}
      </button>
      {expanded && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          {children}
        </div>
      )}
    </div>
  );
}
