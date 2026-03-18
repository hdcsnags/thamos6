import { useState } from 'react';
import { useGitHub } from '../../contexts/GitHubContext';
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
};

interface EditorSidebarProps {
  files: EditorFile[];
  activeFileId: string | null;
  onSelectFile: (id: string) => void;
  onDeleteFile: (id: string) => void;
}

export function EditorSidebar({ files, activeFileId, onSelectFile, onDeleteFile }: EditorSidebarProps) {
  const { ghToken, activeProject } = useGitHub();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    open: true,
    github: true,
    local: true,
  });

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const githubFiles = files.filter(f => f.source === 'github');
  const localFiles = files.filter(f => f.source === 'local');
  const artifactFiles = files.filter(f => f.source === 'artifact');

  const renderFileItem = (file: EditorFile) => {
    const isActive = file.id === activeFileId;
    const colors: Record<string, string> = { github: P.green, local: P.amber, artifact: P.cyan };
    const sourceColor = colors[file.source] || P.text;

    return (
      <button
        key={file.id}
        onClick={() => onSelectFile(file.id)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors group"
        style={{
          backgroundColor: isActive ? `${sourceColor}08` : 'transparent',
          borderLeft: isActive ? `2px solid ${sourceColor}` : '2px solid transparent',
        }}
      >
        <span
          className="text-xs truncate flex-1"
          style={{
            color: isActive ? P.textLight : P.text,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px',
          }}
        >
          {file.filename}
        </span>
        {file.isDirty && (
          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: P.amber }} />
        )}
        <span
          onClick={(e) => { e.stopPropagation(); onDeleteFile(file.id); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          style={{ color: P.dim, fontSize: '10px', cursor: 'pointer' }}
        >
          x
        </span>
      </button>
    );
  };

  const renderSection = (label: string, key: string, items: EditorFile[], color: string) => {
    if (items.length === 0) return null;
    return (
      <div key={key}>
        <button
          onClick={() => toggleSection(key)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left"
          style={{ borderBottom: `1px solid ${P.border}` }}
        >
          <span style={{ color: P.dim, fontSize: '9px' }}>{expandedSections[key] ? '▼' : '▶'}</span>
          <span className="text-xs font-medium uppercase tracking-wider" style={{ color, fontSize: '10px' }}>
            {label}
          </span>
          <span style={{ color: P.dim, fontSize: '10px', marginLeft: 'auto' }}>{items.length}</span>
        </button>
        {expandedSections[key] && items.map(renderFileItem)}
      </div>
    );
  };

  return (
    <div
      className="h-full flex flex-col"
      style={{
        backgroundColor: P.surface,
        borderRight: `1px solid ${P.border}`,
        width: '200px',
        minWidth: '200px',
      }}
    >
      <div
        className="px-3 py-2 flex items-center justify-between"
        style={{ borderBottom: `1px solid ${P.border}` }}
      >
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: P.dim, fontSize: '10px' }}>
          Explorer
        </span>
        {ghToken && activeProject && (
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: P.green }} />
            <span style={{ color: P.dim, fontSize: '9px', fontFamily: "'JetBrains Mono', monospace" }}>
              {activeProject.repo}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {files.length === 0 ? (
          <div className="p-4 text-center">
            <div style={{ color: P.dim, fontSize: '11px' }}>No files open</div>
            <div style={{ color: P.dim, fontSize: '10px', marginTop: '4px' }}>
              Create a new file or open from Maestro
            </div>
          </div>
        ) : (
          <>
            {renderSection('Artifacts', 'artifacts', artifactFiles, P.cyan)}
            {renderSection('GitHub', 'github', githubFiles, P.green)}
            {renderSection('Local', 'local', localFiles, P.amber)}
          </>
        )}
      </div>
    </div>
  );
}
