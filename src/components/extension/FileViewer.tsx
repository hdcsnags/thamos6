import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Copy, Check, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { palette, typography } from '../../design-system/tokens';
import { riskTone, toneColor, toneBg, chipStyle } from './extensionTones';

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
    const tone = highlight ? riskTone(highlight.finding.severity) : null;
    // Low-severity findings map to neutral; still mark the line so the analyst sees it.
    const markColor = tone ? (tone === 'neutral' ? palette.textTertiary : toneColor[tone]) : null;

    return (
      <div
        key={lineNumber}
        className="flex group"
        style={{
          background: tone && tone !== 'neutral' ? toneBg(tone, 0.1) : 'transparent',
          boxShadow: markColor ? `inset 2px 0 0 ${markColor}` : 'none',
        }}
      >
        <div
          className="shrink-0 w-14 px-3 py-0.5 text-right select-none text-[11px]"
          style={{ color: palette.textDisabled, fontFamily: typography.mono }}
        >
          {lineNumber}
        </div>
        <div className="flex-1 px-3 py-0.5 text-xs whitespace-pre" style={{ fontFamily: typography.mono }}>
          <code style={{ color: palette.textSecondary }}>{line || ' '}</code>
        </div>
        <div className="shrink-0 px-2 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => copyToClipboard(line, lineNumber)}
            className="transition-colors hover:brightness-125"
            style={{ color: palette.textTertiary }}
            title="Copy line"
          >
            {copiedLine === lineNumber ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-xs" style={{ color: palette.textTertiary, fontFamily: typography.ui }}>Loading file…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-xs" style={{ color: palette.rose, fontFamily: typography.ui }}>{error}</div>
      </div>
    );
  }

  const lines = fileContent.split('\n');
  const fileHighlights = highlights;

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: typography.ui }}>
      <div
        className="flex items-center justify-between gap-3 px-4 py-2.5"
        style={{ background: palette.elevated, borderBottom: `1px solid ${palette.borderDefault}` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium truncate" style={{ color: palette.textPrimary, fontFamily: typography.mono }} title={filePath}>
            {filePath}
          </span>
          <span className="px-1.5 py-0.5 text-[10px] rounded shrink-0" style={chipStyle('neutral', true)}>
            {fileType}
          </span>
          {fileHighlights.length > 0 && (
            <span className="px-2 py-0.5 text-[11px] rounded flex items-center gap-1 shrink-0" style={chipStyle('danger')}>
              <AlertTriangle className="w-3 h-3" />
              {fileHighlights.length} finding{fileHighlights.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] tabular-nums" style={{ color: palette.textTertiary }}>{lines.length} lines</span>
          <button
            onClick={downloadFile}
            className="p-1.5 rounded-md transition-colors hover:brightness-125"
            style={{ color: palette.textTertiary }}
            title="Download file"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {fileHighlights.length > 0 && (
        <div
          className="px-4 py-2 space-y-2"
          style={{ background: palette.base, borderBottom: `1px solid ${palette.borderDefault}` }}
        >
          {fileHighlights.map((highlight, idx) => {
            const tone = riskTone(highlight.finding.severity);
            return (
              <div key={idx} className="flex items-start gap-2 text-xs">
                <AlertTriangle
                  className="w-3.5 h-3.5 shrink-0 mt-0.5"
                  style={{ color: tone === 'neutral' ? palette.textTertiary : toneColor[tone] }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {highlight.finding.rule_id && (
                      <span className="px-1.5 py-0.5 rounded text-[10px]" style={chipStyle('neutral', true)}>
                        {highlight.finding.rule_id}
                      </span>
                    )}
                    <span className="font-semibold" style={{ color: palette.textPrimary }}>{highlight.finding.title}</span>
                    <span style={{ color: palette.textTertiary }}>Line {highlight.lineNumber}</span>
                  </div>
                  <p className="mt-0.5" style={{ color: palette.textSecondary }}>{highlight.finding.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div ref={contentRef} className="flex-1 overflow-auto" style={{ background: palette.void }}>
        <div className="relative min-w-max py-1">
          {lines.map((line, idx) => renderLineWithSyntax(line, idx + 1))}
        </div>
      </div>
    </div>
  );
}
