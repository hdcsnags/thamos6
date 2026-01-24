interface KeyFactsProps {
  facts: { label: string; value: string; icon?: React.ReactNode }[];
}

export default function KeyFacts({ facts }: KeyFactsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {facts.map((fact, index) => (
        <div
          key={index}
          className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700"
        >
          <div className="flex items-center gap-2 mb-2">
            {fact.icon}
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
              {fact.label}
            </span>
          </div>
          <p className="text-base font-semibold text-slate-900 dark:text-white break-all">
            {fact.value || 'N/A'}
          </p>
        </div>
      ))}
    </div>
  );
}
