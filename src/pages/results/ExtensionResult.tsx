import { useEffect, useState } from 'react';
import { Puzzle, AlertTriangle } from 'lucide-react';
import KeyFacts from '../../components/scanner/KeyFacts';
import SourceStatus, { type Source } from '../../components/scanner/SourceStatus';
import RawJsonCollapse from '../../components/scanner/RawJsonCollapse';
import ActionsBar from '../../components/scanner/ActionsBar';

interface ExtensionResultProps {
  extensionId: string;
}

export default function ExtensionResult({ extensionId }: ExtensionResultProps) {
  const [loading, setLoading] = useState(true);
  const [sources] = useState<Source[]>([
    { name: 'Chrome Web Store', state: 'pending', icon: Puzzle },
  ]);

  useEffect(() => {
    setTimeout(() => setLoading(false), 1000);
  }, [extensionId]);

  const keyFacts = [
    {
      label: 'Extension ID',
      value: extensionId,
      icon: <Puzzle className="w-4 h-4 text-cyan-400" />
    }
  ];

  const summary = `Extension ID: ${extensionId}`;

  if (loading) {
    return (
      <div className="space-y-6">
        <SourceStatus sources={sources} />
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-400">Analyzing extension...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ActionsBar
        summary={summary}
        jsonData={{ extensionId }}
        iocValue={extensionId}
      />

      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 break-all">
          {extensionId}
        </h1>
      </div>

      <SourceStatus sources={sources.map(s => ({ ...s, state: 'disabled' }))} />

      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">Key Facts</h2>
        <KeyFacts facts={keyFacts} />
      </div>

      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
        <p className="text-amber-400 font-medium">Extension analysis coming soon</p>
        <p className="text-sm text-amber-200/80 mt-2">
          Chrome extension security analysis will be available in a future update
        </p>
      </div>

      <RawJsonCollapse data={{ extensionId }} title="Raw Results Data" />
    </div>
  );
}
