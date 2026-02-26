import type { EditorFile } from './editorStore';

const P = {
  void: '#060610',
  surface: '#0a0e1a',
  surfaceLight: '#0f1424',
  border: '#1a1f35',
  dim: '#3a3f55',
  text: '#8a8fa8',
  textLight: '#c8cde0',
  cyan: '#00d9ff',
  green: '#00ff9d',
  amber: '#fbbf24',
  rose: '#f43f5e',
};

const SOURCE_COLORS: Record<string, string> = {
  github: P.green,
  local: P.amber,
  artifact: P.cyan,
};

interface EditorTabsProps {
  files: EditorFile[];
  activeFileId: string | null;
  onSelectFile: (id: string) => void;
  onCloseFile: (id: string) => void;
  onNewFile: () => void;
}

export function EditorTabs({ files, activeFileId, onSelectFile, onCloseFile, onNewFile }: EditorTabsProps) {
  return (
    <div
      className="flex items-center"
      style={{
        backgroundColor: P.surface,
        borderBottom: `1px solid ${P.border}`,
        height: '34px',
        minHeight: '34px',
      }}
    >
      <div className="flex items-center flex-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {files.map(file => {
          const isActive = file.id === activeFileId;
          const sourceColor = SOURCE_COLORS[file.source] || P.text;
          return (
            <button
              key={file.id}
              onClick={() => onSelectFile(file.id)}
              className="flex items-center gap-1.5 px-3 h-full shrink-0 transition-colors group relative"
              style={{
                backgroundColor: isActive ? P.void : 'transparent',
                borderRight: `1px solid ${P.border}`,
                borderBottom: isActive ? `2px solid ${sourceColor}` : '2px solid transparent',
                maxWidth: '180px',
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: sourceColor, opacity: isActive ? 1 : 0.5 }}
              />
              <span
                className="text-xs truncate"
                style={{
                  color: isActive ? P.textLight : P.text,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '11px',
                }}
              >
                {file.filename}
              </span>
              {file.isDirty && (
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: P.amber }}
                />
              )}
              <span
                onClick={(e) => { e.stopPropagation(); onCloseFile(file.id); }}
                className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 hover:text-white"
                style={{
                  color: P.dim,
                  fontSize: '10px',
                  lineHeight: 1,
                  cursor: 'pointer',
                }}
              >
                x
              </span>
            </button>
          );
        })}
      </div>
      <button
        onClick={onNewFile}
        className="px-3 h-full shrink-0 transition-colors"
        style={{ color: P.dim, fontSize: '14px' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = P.textLight; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = P.dim; }}
        title="New file"
      >
        +
      </button>
    </div>
  );
}
