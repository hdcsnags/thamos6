import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Info, Copy, Check, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface FileViewerProps {
  analysisId: string;
  filePath: string;
  findings: Array<{
    id: string;
    file_path: string;
    evidence: string;
    title: string;
    description: string;
    severity: string;
    rule_id?: string;
  }>;
}

interface EvidenceHighlight {
  lineNumber: number;
  finding: any;
  startCol?: number;
  endCol?: number;
}

export default function FileViewer({ analysisId, filePath, findings }: FileViewerProps) {
  const [fileContent, setFileContent] = useState('');
  const [fileType, setFileType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [highlights, setHighlights] = useState<EvidenceHighlight[]>([]);
  const [copiedLine, setCopiedLine] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadFile();
  }, [analysisId, filePath]);

  useEffect(() => {
    if (fileContent) {
      const fileFindings = findings.filter(f => f.file_path === filePath);
      const highlightData = findEvidenceInFile(fileContent, fileFindings);
      setHighlights(highlightData);
    }
  }, [fileContent, filePath, findings]);

  const loadFile = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from('extension_files')
        .select('file_content, file_type')
        .eq('analysis_id', analysisId)
        .eq('file_path', filePath)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (data) {
        setFileContent(data.file_content);
        setFileType(data.file_type);
      } else {
        setError('File not found');
      }
    } catch (err) {
      console.error('Error loading file:', err);
      setError('Failed to load file');
    } finally {
      setLoading(false);
    }
  };

  const findEvidenceInFile = (content: string, fileFindings: any[]): EvidenceHighlight[] => {
    const lines = content.split('\n');
    const evidenceMap: EvidenceHighlight[] = [];

    for (const finding of fileFindings) {
      const evidence = finding.evidence;
      if (!evidence) continue;

      const searchText = evidence.substring(0, 100);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes(searchText) || searchText.includes(line.trim())) {
          const existingHighlight = evidenceMap.find(h => h.lineNumber === i + 1);
          if (!existingHighlight) {
            evidenceMap.push({
              lineNumber: i + 1,
              finding: finding
            });
          }
        }
      }
    }

    return evidenceMap;
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'red';
      case 'high': return 'orange';
      case 'medium': return 'yellow';
      case 'low': return 'blue';
      default: return 'slate';
    }
  };

  const copyToClipboard = async (text: string, lineNumber: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedLine(lineNumber);
    setTimeout(() => setCopiedLine(null), 2000);
  };

  const downloadFile = () => {
    const blob = new Blob([fileContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filePath.split('/').pop() || 'file.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderLineWithSyntax = (line: string, lineNumber: number) => {
    const highlight = highlights.find(h => h.lineNumber === lineNumber);
    const hasHighlight = !!highlight;

    return (
      <div
        key={lineNumber}
        className={`flex group hover:bg-slate-800/30 ${
          hasHighlight ? `bg-${getSeverityColor(highlight.finding.severity)}-500/10 border-l-2 border-${getSeverityColor(highlight.finding.severity)}-500` : ''
        }`}
      >
        <div className="flex-shrink-0 w-16 px-3 py-1 text-right text-slate-500 select-none text-xs font-mono">
          {lineNumber}
        </div>
        <div className="flex-1 px-3 py-1 text-sm font-mono whitespace-pre">
          <code className="text-slate-300">{line || ' '}</code>
        </div>
        <div className="flex-shrink-0 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => copyToClipboard(line, lineNumber)}
            className="text-slate-400 hover:text-cyan-400 transition-colors"
            title="Copy line"
          >
            {copiedLine === lineNumber ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
        {hasHighlight && (
          <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-r from-transparent to-red-500/20" />
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-slate-400">Loading file...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  const lines = fileContent.split('\n');
  const fileHighlights = highlights;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-white">{filePath}</span>
          <span className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded uppercase">
            {fileType}
          </span>
          {fileHighlights.length > 0 && (
            <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {fileHighlights.length} finding{fileHighlights.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{lines.length} lines</span>
          <button
            onClick={downloadFile}
            className="p-1.5 hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-cyan-400"
            title="Download file"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {fileHighlights.length > 0 && (
        <div className="px-4 py-2 bg-slate-800/50 border-b border-slate-700 space-y-2">
          {fileHighlights.map((highlight, idx) => (
            <div key={idx} className="flex items-start gap-2 text-xs">
              <AlertTriangle className={`w-3.5 h-3.5 text-${getSeverityColor(highlight.finding.severity)}-400 flex-shrink-0 mt-0.5`} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {highlight.finding.rule_id && (
                    <span className="px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded font-mono">
                      {highlight.finding.rule_id}
                    </span>
                  )}
                  <span className="font-semibold text-slate-300">{highlight.finding.title}</span>
                  <span className="text-slate-500">Line {highlight.lineNumber}</span>
                </div>
                <p className="text-slate-400 mt-1">{highlight.finding.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div ref={contentRef} className="flex-1 overflow-auto bg-slate-900">
        <div className="relative min-w-max">
          {lines.map((line, idx) => renderLineWithSyntax(line, idx + 1))}
        </div>
      </div>
    </div>
  );
}
