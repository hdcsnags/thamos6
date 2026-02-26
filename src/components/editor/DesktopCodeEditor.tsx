import { useState, useCallback, useEffect } from 'react';
import { useGitHub } from '../../contexts/GitHubContext';
import { useAuth } from '../../contexts/AuthContext';
import { commitFile, fetchFileMeta } from '../../lib/github';
import { CodeMirrorEditor } from './CodeMirrorEditor';
import { EditorTabs } from './EditorTabs';
import { EditorSidebar } from './EditorSidebar';
import { detectFileLanguage } from './editorLanguages';
import {
  type EditorFile,
  createNewFile,
  loadLocalFiles,
  saveLocalFiles,
} from './editorStore';

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

interface StatusMessage {
  text: string;
  type: 'success' | 'error' | 'info';
}

export function DesktopCodeEditor({ initialFile }: { initialFile?: EditorFile }) {
  const { ghToken } = useGitHub();
  const { user } = useAuth();
  const [files, setFiles] = useState<EditorFile[]>(() => {
    const local = loadLocalFiles();
    if (initialFile) {
      const exists = local.find(f => f.id === initialFile.id);
      if (!exists) return [...local, initialFile];
    }
    return local;
  });
  const [activeFileId, setActiveFileId] = useState<string | null>(
    initialFile?.id || files[0]?.id || null
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [saving, setSaving] = useState(false);
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [newFileName, setNewFileName] = useState('');

  const activeFile = files.find(f => f.id === activeFileId) || null;

  useEffect(() => {
    const localFiles = files.filter(f => f.source === 'local' || f.source === 'artifact');
    saveLocalFiles(localFiles);
  }, [files]);

  useEffect(() => {
    if (initialFile) {
      setFiles(prev => {
        const exists = prev.find(f => f.id === initialFile.id);
        if (exists) return prev;
        return [...prev, initialFile];
      });
      setActiveFileId(initialFile.id);
    }
  }, [initialFile]);

  const showStatus = useCallback((text: string, type: StatusMessage['type']) => {
    setStatus({ text, type });
    setTimeout(() => setStatus(null), 4000);
  }, []);

  const handleNewFile = useCallback(() => {
    setShowNewFileInput(true);
    setNewFileName('untitled.ts');
  }, []);

  const confirmNewFile = useCallback(() => {
    if (!newFileName.trim()) return;
    const file = createNewFile(newFileName.trim());
    setFiles(prev => [...prev, file]);
    setActiveFileId(file.id);
    setShowNewFileInput(false);
    setNewFileName('');
  }, [newFileName]);

  const handleCloseFile = useCallback((id: string) => {
    setFiles(prev => {
      const updated = prev.filter(f => f.id !== id);
      if (activeFileId === id) {
        const idx = prev.findIndex(f => f.id === id);
        const next = updated[Math.min(idx, updated.length - 1)];
        setActiveFileId(next?.id || null);
      }
      return updated;
    });
  }, [activeFileId]);

  const handleDeleteFile = useCallback((id: string) => {
    handleCloseFile(id);
  }, [handleCloseFile]);

  const handleContentChange = useCallback((value: string) => {
    setFiles(prev =>
      prev.map(f =>
        f.id === activeFileId
          ? { ...f, content: value, isDirty: value !== f.originalContent }
          : f
      )
    );
  }, [activeFileId]);

  const handleSaveToGitHub = useCallback(async () => {
    if (!activeFile || !ghToken || !activeFile.githubMeta) return;
    setSaving(true);
    try {
      const meta = await fetchFileMeta(
        ghToken,
        activeFile.githubMeta.owner,
        activeFile.githubMeta.repo,
        activeFile.githubMeta.path
      );
      const msg = `Update ${activeFile.filename} via ThamOS Editor`;
      await commitFile(
        ghToken,
        activeFile.githubMeta.owner,
        activeFile.githubMeta.repo,
        activeFile.githubMeta.path,
        activeFile.content,
        meta.sha,
        msg,
        activeFile.githubMeta.branch
      );
      setFiles(prev =>
        prev.map(f =>
          f.id === activeFileId
            ? { ...f, originalContent: f.content, isDirty: false }
            : f
        )
      );
      showStatus(`Committed to ${activeFile.githubMeta.path}`, 'success');
    } catch (err) {
      showStatus(err instanceof Error ? err.message : 'Commit failed', 'error');
    } finally {
      setSaving(false);
    }
  }, [activeFile, ghToken, activeFileId, showStatus]);

  const handleSaveLocal = useCallback(() => {
    if (!activeFile) return;
    setFiles(prev =>
      prev.map(f =>
        f.id === activeFileId
          ? { ...f, originalContent: f.content, isDirty: false }
          : f
      )
    );
    showStatus(`Saved ${activeFile.filename} locally`, 'success');
  }, [activeFile, activeFileId, showStatus]);

  const handleDownload = useCallback(() => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.filename;
    a.click();
    URL.revokeObjectURL(url);
    showStatus(`Downloaded ${activeFile.filename}`, 'info');
  }, [activeFile, showStatus]);

  const handleCopy = useCallback(async () => {
    if (!activeFile) return;
    await navigator.clipboard.writeText(activeFile.content);
    showStatus('Copied to clipboard', 'info');
  }, [activeFile, showStatus]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (activeFile?.githubMeta && ghToken) {
          handleSaveToGitHub();
        } else {
          handleSaveLocal();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFile, ghToken, handleSaveToGitHub, handleSaveLocal]);

  const canCommitToGitHub = activeFile?.githubMeta && ghToken;
  const lang = activeFile ? detectFileLanguage(activeFile.filename) : '';

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: P.void, fontFamily: "'JetBrains Mono', monospace" }}>
      <div
        className="flex items-center justify-between px-3 h-9 shrink-0"
        style={{ backgroundColor: P.surface, borderBottom: `1px solid ${P.border}` }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-xs px-2 py-0.5 rounded transition-colors"
            style={{ color: P.text, border: `1px solid ${P.border}`, fontSize: '10px' }}
          >
            {sidebarOpen ? '<<' : '>>'}
          </button>
          <span className="text-xs font-medium" style={{ color: P.textLight, fontSize: '11px' }}>CODE EDITOR</span>
          {activeFile && (
            <span style={{ color: P.dim, fontSize: '10px' }}>{lang}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {activeFile && (
            <>
              <button
                onClick={handleCopy}
                className="px-2 py-0.5 rounded transition-colors text-xs"
                style={{
                  color: P.text,
                  border: `1px solid ${P.border}`,
                  fontSize: '10px',
                  backgroundColor: 'transparent',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = P.surfaceLight; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                COPY
              </button>
              <button
                onClick={handleDownload}
                className="px-2 py-0.5 rounded transition-colors text-xs"
                style={{
                  color: P.text,
                  border: `1px solid ${P.border}`,
                  fontSize: '10px',
                  backgroundColor: 'transparent',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = P.surfaceLight; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                DOWNLOAD
              </button>
              {canCommitToGitHub ? (
                <button
                  onClick={handleSaveToGitHub}
                  disabled={saving || !activeFile.isDirty}
                  className="px-2.5 py-0.5 rounded transition-colors text-xs"
                  style={{
                    color: activeFile.isDirty ? P.green : P.dim,
                    border: `1px solid ${activeFile.isDirty ? `${P.green}40` : P.border}`,
                    backgroundColor: activeFile.isDirty ? `${P.green}08` : 'transparent',
                    fontSize: '10px',
                    opacity: saving ? 0.5 : 1,
                  }}
                >
                  {saving ? 'COMMITTING...' : 'COMMIT'}
                </button>
              ) : (
                <button
                  onClick={handleSaveLocal}
                  disabled={!activeFile.isDirty}
                  className="px-2.5 py-0.5 rounded transition-colors text-xs"
                  style={{
                    color: activeFile.isDirty ? P.amber : P.dim,
                    border: `1px solid ${activeFile.isDirty ? `${P.amber}40` : P.border}`,
                    backgroundColor: activeFile.isDirty ? `${P.amber}08` : 'transparent',
                    fontSize: '10px',
                  }}
                >
                  SAVE LOCAL
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {status && (
        <div
          className="px-3 py-1.5"
          style={{
            backgroundColor: status.type === 'success' ? `${P.green}08` : status.type === 'error' ? `${P.rose}08` : `${P.cyan}08`,
            borderBottom: `1px solid ${status.type === 'success' ? `${P.green}30` : status.type === 'error' ? `${P.rose}30` : `${P.cyan}30`}`,
          }}
        >
          <span
            style={{
              color: status.type === 'success' ? P.green : status.type === 'error' ? P.rose : P.cyan,
              fontSize: '10px',
            }}
          >
            [{status.type.toUpperCase()}] {status.text}
          </span>
        </div>
      )}

      {showNewFileInput && (
        <div
          className="px-3 py-2 flex items-center gap-2"
          style={{ backgroundColor: P.surfaceLight, borderBottom: `1px solid ${P.border}` }}
        >
          <span style={{ color: P.dim, fontSize: '10px' }}>New file:</span>
          <input
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmNewFile();
              if (e.key === 'Escape') setShowNewFileInput(false);
            }}
            autoFocus
            className="flex-1 px-2 py-0.5 rounded text-xs focus:outline-none"
            style={{
              backgroundColor: P.void,
              border: `1px solid ${P.amber}40`,
              color: P.textLight,
              fontSize: '11px',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          />
          <button
            onClick={confirmNewFile}
            className="px-2 py-0.5 rounded text-xs"
            style={{ color: P.green, border: `1px solid ${P.green}40`, fontSize: '10px' }}
          >
            CREATE
          </button>
          <button
            onClick={() => setShowNewFileInput(false)}
            className="px-2 py-0.5 rounded text-xs"
            style={{ color: P.dim, fontSize: '10px' }}
          >
            ESC
          </button>
        </div>
      )}

      <EditorTabs
        files={files}
        activeFileId={activeFileId}
        onSelectFile={setActiveFileId}
        onCloseFile={handleCloseFile}
        onNewFile={handleNewFile}
      />

      <div className="flex-1 flex min-h-0">
        {sidebarOpen && (
          <EditorSidebar
            files={files}
            activeFileId={activeFileId}
            onSelectFile={setActiveFileId}
            onDeleteFile={handleDeleteFile}
          />
        )}

        <div className="flex-1 min-w-0">
          {activeFile ? (
            <CodeMirrorEditor
              key={activeFile.id}
              value={activeFile.content}
              filename={activeFile.filename}
              onChange={handleContentChange}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center" style={{ backgroundColor: P.void }}>
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                style={{ backgroundColor: `${P.amber}08`, border: `1px solid ${P.amber}20` }}
              >
                <span className="text-2xl" style={{ color: P.amber }}>&#9670;</span>
              </div>
              <span className="text-xs font-medium mb-1" style={{ color: P.textLight }}>Code Editor</span>
              <span style={{ color: P.dim, fontSize: '11px', maxWidth: '300px', textAlign: 'center', lineHeight: 1.5 }}>
                Create a new file or open an artifact from AI Workshop
              </span>
              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={handleNewFile}
                  className="px-4 py-1.5 rounded text-xs transition-colors"
                  style={{
                    color: P.amber,
                    border: `1px solid ${P.amber}40`,
                    backgroundColor: `${P.amber}08`,
                    fontSize: '11px',
                  }}
                >
                  + NEW FILE
                </button>
              </div>
              <div className="mt-6 flex items-center gap-4" style={{ fontSize: '10px' }}>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: P.green }} />
                  <span style={{ color: P.dim }}>GitHub</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: P.amber }} />
                  <span style={{ color: P.dim }}>Local</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: P.cyan }} />
                  <span style={{ color: P.dim }}>AI Artifact</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        className="flex items-center justify-between px-3 h-6 shrink-0"
        style={{ backgroundColor: P.surface, borderTop: `1px solid ${P.border}` }}
      >
        <div className="flex items-center gap-3">
          {activeFile && (
            <>
              <span style={{ color: P.dim, fontSize: '10px' }}>
                {activeFile.source === 'github' ? 'GH' : activeFile.source === 'artifact' ? 'AI' : 'LOCAL'}
              </span>
              {activeFile.githubMeta && (
                <span style={{ color: P.dim, fontSize: '10px' }}>
                  {activeFile.githubMeta.owner}/{activeFile.githubMeta.repo}:{activeFile.githubMeta.branch}
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span style={{ color: P.dim, fontSize: '10px' }}>
            {files.length} file{files.length !== 1 ? 's' : ''}
          </span>
          {activeFile && (
            <span style={{ color: P.dim, fontSize: '10px' }}>
              Ln {activeFile.content.split('\n').length}
            </span>
          )}
          <span style={{ color: P.dim, fontSize: '10px' }}>Ctrl+S save</span>
        </div>
      </div>
    </div>
  );
}
