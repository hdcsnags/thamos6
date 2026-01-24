import { Check, Loader2, AlertTriangle, X } from 'lucide-react';

export type SourceState = 'pending' | 'loading' | 'success' | 'error' | 'disabled';

export interface Source {
  name: string;
  state: SourceState;
  icon: React.ElementType;
}

interface SourceStatusProps {
  sources: Source[];
}

function getStateIcon(state: SourceState) {
  switch (state) {
    case 'loading':
      return <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />;
    case 'success':
      return <Check className="w-4 h-4 text-green-400" />;
    case 'error':
      return <AlertTriangle className="w-4 h-4 text-red-400" />;
    case 'disabled':
      return <X className="w-4 h-4 text-slate-500" />;
    default:
      return <div className="w-4 h-4 rounded-full border-2 border-slate-600" />;
  }
}

function getStateColor(state: SourceState) {
  switch (state) {
    case 'loading':
      return 'border-cyan-500/50 bg-cyan-500/10';
    case 'success':
      return 'border-green-500/50 bg-green-500/10';
    case 'error':
      return 'border-red-500/50 bg-red-500/10';
    case 'disabled':
      return 'border-slate-700 bg-slate-800/50';
    default:
      return 'border-slate-700 bg-slate-800';
  }
}

export default function SourceStatus({ sources }: SourceStatusProps) {
  return (
    <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
      <span className="text-sm font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
        Source Status:
      </span>
      <div className="flex items-center gap-2">
        {sources.map((source) => {
          const Icon = source.icon;
          return (
            <div
              key={source.name}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${getStateColor(source.state)}`}
              title={source.name}
            >
              <Icon className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-medium text-slate-300 whitespace-nowrap">
                {source.name}
              </span>
              {getStateIcon(source.state)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
